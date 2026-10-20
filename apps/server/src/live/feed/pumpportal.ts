// PumpPortal data-feed client: ONE WebSocket connection (PumpPortal asks
// clients not to open several and bans those that do) carrying
//   subscribeNewToken / subscribeMigration            always on
//   subscribeTokenTrade   { keys: [mint, ...] }        the tracked tokens
//   subscribeAccountTrade { keys: [wallet, ...] }      followed / copied / KOL wallets
// Subscription changes are batched (debounced, chunked) and diffed against what
// the open connection already has. A dropped or silent connection reconnects
// with jittered exponential backoff and re-sends every subscription. Liveness
// is any frame or a pong to our protocol ping; nothing heard for `staleMs`
// counts as dead. Messages are validated (messages.ts) and malformed ones are
// counted and dropped. The optional API key travels only in the socket URL and
// is never logged.

import WebSocket from 'ws';
import { isRefusalNotice, parseFeedMessage, type FeedEvent } from './messages';

export interface PumpPortalOptions {
  url: string;
  /** PumpPortal API key (some trade streams require a funded key); appended as ?api-key=. */
  apiKey?: string | null;
  /** Called for every valid create / trade / migrate event, in arrival order. */
  onEvent: (e: FeedEvent) => void;
  /** Connection state changes. */
  onStatus?: (connected: boolean) => void;
  /** Debounce for subscription changes (ms). */
  batchMs?: number;
  /** Keys per subscribe / unsubscribe message. */
  maxKeysPerMessage?: number;
  /** Reconnect backoff (ms): base doubles per failed attempt up to max, with jitter. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Protocol ping cadence; nothing heard for staleMs closes the socket. */
  pingEveryMs?: number;
  staleMs?: number;
  /** Connection attempt timeout. */
  handshakeTimeoutMs?: number;
  random?: () => number;
  now?: () => number;
  log?: Pick<Console, 'warn' | 'info'>;
}

export interface PumpPortalDiagnostics {
  connects: number;
  disconnects: number;
  messages: number;
  creates: number;
  trades: number;
  migrations: number;
  malformed: number;
  notices: number;
  refusals: number;
  serverErrors: number;
  subscribeMessages: number;
  lastNotice: string | null;
  lastMalformed: string | null;
}

const OPEN = 1;
/** A connection open this long counts as healthy (the reconnect backoff starts over). */
const STABLE_MS = 30_000;

export class PumpPortalClient {
  private ws: WebSocket | null = null;
  private open = false;
  private stopped = true;
  private attempt = 0;
  private readonly desiredTokens = new Set<string>();
  private readonly desiredAccounts = new Set<string>();
  /** What the current connection has been sent (cleared on every reconnect). */
  private readonly sentTokens = new Set<string>();
  private readonly sentAccounts = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeardAt = 0;
  private openedAt = 0;
  private readonly loggedNotices = new Set<string>();
  /** Wall time of the last frame received / last create-trade-migrate event. */
  lastMessageAt: number | null = null;
  lastEventAt: number | null = null;
  readonly diag: PumpPortalDiagnostics = {
    connects: 0,
    disconnects: 0,
    messages: 0,
    creates: 0,
    trades: 0,
    migrations: 0,
    malformed: 0,
    notices: 0,
    refusals: 0,
    serverErrors: 0,
    subscribeMessages: 0,
    lastNotice: null,
    lastMalformed: null,
  };

  private readonly batchMs: number;
  private readonly maxKeys: number;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly pingEveryMs: number;
  private readonly staleMs: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly log: Pick<Console, 'warn' | 'info'>;

  constructor(private readonly opts: PumpPortalOptions) {
    this.batchMs = opts.batchMs ?? 250;
    this.maxKeys = Math.max(1, opts.maxKeysPerMessage ?? 100);
    this.baseMs = opts.backoffBaseMs ?? 1000;
    this.maxMs = opts.backoffMaxMs ?? 60_000;
    this.pingEveryMs = opts.pingEveryMs ?? 20_000;
    this.staleMs = opts.staleMs ?? 90_000;
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? console;
  }

  /** Connected and heard from within staleMs. */
  get connected(): boolean {
    return this.open && this.now() - this.lastHeardAt < this.staleMs;
  }

  get trackedTokens(): number {
    return this.desiredTokens.size;
  }

  get trackedAccounts(): number {
    return this.desiredAccounts.size;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of [this.flushTimer, this.reconnectTimer, this.heartbeatTimer]) if (t) clearTimeout(t);
    this.flushTimer = this.reconnectTimer = this.heartbeatTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    this.setOpen(false);
    await new Promise<void>((resolve) => {
      const done = setTimeout(() => {
        ws.terminate();
        resolve();
      }, 1000);
      done.unref?.();
      ws.once('close', () => {
        clearTimeout(done);
        resolve();
      });
      try {
        ws.close(1000, 'shutdown');
      } catch {
        ws.terminate();
      }
    });
  }

  subscribeTokenTrades(mints: Iterable<string>): void {
    let changed = false;
    for (const m of mints) {
      if (this.desiredTokens.has(m)) continue;
      this.desiredTokens.add(m);
      changed = true;
    }
    if (changed) this.scheduleFlush();
  }

  unsubscribeTokenTrades(mints: Iterable<string>): void {
    let changed = false;
    for (const m of mints) changed = this.desiredTokens.delete(m) || changed;
    if (changed) this.scheduleFlush();
  }

  /** Replace the account-trade subscription set. */
  setAccounts(wallets: Iterable<string>): void {
    const next = new Set(wallets);
    let changed = next.size !== this.desiredAccounts.size;
    if (!changed) for (const w of next) if (!this.desiredAccounts.has(w)) changed = true;
    if (!changed) return;
    this.desiredAccounts.clear();
    for (const w of next) this.desiredAccounts.add(w);
    this.scheduleFlush();
  }

  isTokenSubscribed(mint: string): boolean {
    return this.desiredTokens.has(mint);
  }

  // ---- connection -----------------------------------------------------------

  private socketUrl(): string {
    const key = this.opts.apiKey?.trim();
    if (!key) return this.opts.url;
    return `${this.opts.url}${this.opts.url.includes('?') ? '&' : '?'}api-key=${encodeURIComponent(key)}`;
  }

  private connect(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.socketUrl(), { handshakeTimeout: this.opts.handshakeTimeoutMs ?? 10_000, maxPayload: 1024 * 1024, perMessageDeflate: false });
    } catch (err) {
      this.log.warn(`[pumpportal] cannot connect: ${err instanceof Error ? err.message : 'error'}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.diag.connects++;
      this.openedAt = this.now();
      this.lastHeardAt = this.openedAt;
      this.sentTokens.clear();
      this.sentAccounts.clear();
      this.setOpen(true);
      this.send({ method: 'subscribeNewToken' });
      this.send({ method: 'subscribeMigration' });
      this.flush();
      this.armHeartbeat();
    });
    ws.on('message', (raw) => {
      if (this.ws !== ws) return;
      this.lastHeardAt = this.now();
      this.onFrame(raw as Buffer | ArrayBuffer | Buffer[]);
    });
    ws.on('pong', () => {
      if (this.ws === ws) this.lastHeardAt = this.now();
    });
    ws.on('error', (err) => {
      // 'close' follows; only note it (the URL may carry the key: never log it).
      if (this.ws === ws && !this.open) this.log.warn(`[pumpportal] connection failed: ${redact(err.message, this.opts.apiKey)}`);
    });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      // Only a connection that held for a while resets the backoff: a server that accepts and
      // drops us at once (refusal, ban) must not be hammered every second.
      if (this.open && this.now() - this.openedAt >= STABLE_MS) this.attempt = 0;
      if (this.open) this.diag.disconnects++;
      this.setOpen(false);
      if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.scheduleReconnect();
    });
  }

  private setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.opts.onStatus?.(open);
  }

  /** Delay before the next attempt: exponential in the attempt count, jittered over its upper half. */
  backoffDelay(attempt: number): number {
    const cap = Math.min(this.maxMs, this.baseMs * 2 ** Math.min(attempt, 20));
    return Math.round(cap / 2 + (this.random() * cap) / 2);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoffDelay(this.attempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private armHeartbeat(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      const ws = this.ws;
      if (!ws || ws.readyState !== OPEN) return;
      if (this.now() - this.lastHeardAt >= this.staleMs) {
        this.log.warn(`[pumpportal] no data for ${Math.round((this.now() - this.lastHeardAt) / 1000)}s, reconnecting`);
        ws.terminate();
        return;
      }
      try {
        ws.ping();
      } catch {
        // closing; the close handler reconnects
      }
      this.armHeartbeat();
    }, Math.min(this.pingEveryMs, this.staleMs));
    this.heartbeatTimer.unref?.();
  }

  // ---- subscriptions --------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushTimer || !this.open) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.batchMs);
    this.flushTimer.unref?.();
  }

  /** Send the difference between what is wanted and what this connection has. */
  private flush(): void {
    if (!this.open) return;
    this.sync('subscribeTokenTrade', 'unsubscribeTokenTrade', this.desiredTokens, this.sentTokens);
    this.sync('subscribeAccountTrade', 'unsubscribeAccountTrade', this.desiredAccounts, this.sentAccounts);
  }

  private sync(sub: string, unsub: string, desired: Set<string>, sent: Set<string>): void {
    const add = [...desired].filter((k) => !sent.has(k));
    const remove = [...sent].filter((k) => !desired.has(k));
    for (let i = 0; i < remove.length; i += this.maxKeys) {
      const keys = remove.slice(i, i + this.maxKeys);
      if (!this.send({ method: unsub, keys })) return;
      for (const k of keys) sent.delete(k);
    }
    for (let i = 0; i < add.length; i += this.maxKeys) {
      const keys = add.slice(i, i + this.maxKeys);
      if (!this.send({ method: sub, keys })) return;
      for (const k of keys) sent.add(k);
    }
  }

  private send(msg: { method: string; keys?: string[] }): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      this.diag.subscribeMessages++;
      return true;
    } catch {
      return false;
    }
  }

  // ---- messages -------------------------------------------------------------

  private onFrame(raw: Buffer | ArrayBuffer | Buffer[]): void {
    this.diag.messages++;
    this.lastMessageAt = this.now();
    const msg = parseFeedMessage(raw);
    switch (msg.kind) {
      case 'create':
      case 'trade':
      case 'migrate':
        if (msg.kind === 'create') this.diag.creates++;
        else if (msg.kind === 'trade') this.diag.trades++;
        else this.diag.migrations++;
        this.lastEventAt = this.lastMessageAt;
        try {
          this.opts.onEvent(msg);
        } catch (err) {
          this.log.warn(`[pumpportal] event handler failed: ${err instanceof Error ? err.message : 'error'}`);
        }
        return;
      case 'notice':
        this.diag.notices++;
        this.diag.lastNotice = msg.message;
        if (isRefusalNotice(msg.message)) {
          this.diag.refusals++;
          this.logOnce(`[pumpportal] subscription refused: ${msg.message}`);
        }
        return;
      case 'error':
        this.diag.serverErrors++;
        this.diag.lastNotice = msg.message;
        this.logOnce(`[pumpportal] server error: ${msg.message}`);
        return;
      case 'malformed':
        this.diag.malformed++;
        this.diag.lastMalformed = msg.reason;
        return;
    }
  }

  private logOnce(line: string): void {
    if (this.loggedNotices.has(line) || this.loggedNotices.size > 50) return;
    this.loggedNotices.add(line);
    this.log.warn(redact(line, this.opts.apiKey));
  }
}

function redact(text: string, key: string | null | undefined): string {
  const k = key?.trim();
  if (!k) return text;
  return text.split(k).join('***').split(encodeURIComponent(k)).join('***');
}
