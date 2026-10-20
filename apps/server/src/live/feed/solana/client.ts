// Solana RPC WebSocket client for program logs: ONE connection carrying one
// `logsSubscribe({ mentions: [programId] })` per program (the RPC accepts a
// single key per subscription) at `confirmed` commitment. Every successful
// transaction that mentions a program arrives as a logsNotification with its
// signature, slot and log messages; failed ones (most of pump.fun's traffic is
// bots' failed transactions: 70-80% on mainnet) are counted and skipped. A
// transaction mentioning both programs arrives once per subscription and is
// passed on once (signatures remembered over a bounded window).
//
// Resilience: a dropped or dead connection (nothing heard, not even a pong, for
// `staleMs`), or one whose subscriptions deliver nothing for `silentMs` (with
// hundreds of notifications a second that is generous), reconnects with
// jittered exponential backoff and re-subscribes. The slots
// before the drop and after the reconnect bound a gap, reported through onGap
// so the owner can catch up (feed/solana/catchup.ts). A subscription the RPC
// refuses (method not offered on its plan, ...) is reported and retried on the
// next connection. The URL may carry an API key: only its host is ever logged
// or reported.
//
// Measured on 2026-10-20 (scripts/solana-logs-check.ts): api.mainnet-beta.solana.com
// serves both subscriptions (~170 + ~800 notifications/s, ~2 MB/s of JSON) but
// closes the socket every 20-70 s (code 1006); solana-rpc.publicnode.com served them
// without drops but delivered about half the transactions, and an hour later
// acknowledged them and delivered nothing. Other public endpoints refuse
// logsSubscribe. Production needs a provider WebSocket.

import WebSocket from 'ws';
import { PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID, type DecodedLogs, type ProgramName } from './events';
import { RateMeter } from './rate';

export interface LogNotification {
  signature: string;
  slot: number;
  logs: string[];
  /** Events already decoded from the transaction's event CPIs (catch-up, truncated-log recovery): used instead of the logs. */
  decoded?: DecodedLogs;
}

export interface SlotGap {
  /** First and last slot that may be missing (inclusive). */
  fromSlot: number;
  toSlot: number;
  /** When the gap was detected (wall ms). */
  at: number;
}

export interface ProgramLogClientOptions {
  url: string;
  /** Programs to subscribe to (default: pump.fun and PumpSwap). */
  programs?: string[];
  commitment?: 'confirmed' | 'finalized';
  /** Every successful transaction, once, in arrival order. */
  onTransaction: (tx: LogNotification) => void;
  /** Slots possibly missed while disconnected. */
  onGap?: (gap: SlotGap) => void;
  onStatus?: (connected: boolean) => void;
  /** Every frame's text as received (capture tools). */
  onFrame?: (text: string) => void;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  pingEveryMs?: number;
  staleMs?: number;
  /**
   * Subscribed but no notification for this long: the endpoint acknowledges and delivers nothing
   * (seen on solana-rpc.publicnode.com): reconnect. pump.fun alone logs hundreds of transactions a second.
   */
  silentMs?: number;
  handshakeTimeoutMs?: number;
  /** Signatures remembered for the cross-subscription dedupe. */
  dedupeWindow?: number;
  random?: () => number;
  now?: () => number;
  log?: Pick<Console, 'warn' | 'info'>;
}

export type SubscriptionState = 'pending' | 'active' | 'refused';

export interface ProgramLogClientStats {
  connects: number;
  disconnects: number;
  /** Notifications received (successful and failed transactions, both subscriptions). */
  notifications: number;
  /** Failed transactions skipped. */
  failed: number;
  /** Transactions delivered by both subscriptions (passed on once). */
  duplicates: number;
  /** Successful transactions passed on. */
  transactions: number;
  /** Frames that were not JSON-RPC (counted, dropped). */
  malformed: number;
  /** The transaction handler threw (counted; the stream goes on). */
  handlerErrors: number;
  refusals: number;
  lastRefusal: string | null;
  lastError: string | null;
  gaps: number;
  gapSlots: number;
  lastGap: SlotGap | null;
  bytes: number;
  /** Connections dropped because they delivered nothing for silentMs. */
  silent: number;
}

const OPEN = 1;
/** A connection open this long counts as healthy (the reconnect backoff starts over). */
const STABLE_MS = 30_000;
/** Largest gap reported as such: beyond it (a long outage) only the newest slots are worth catching up. */
const MAX_REPORTED_GAP_SLOTS = 50_000;

/** The host of an RPC URL (URLs may carry API keys in their path or query: never log more). */
export function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

export class ProgramLogClient {
  private ws: WebSocket | null = null;
  private open = false;
  private stopped = true;
  private attempt = 0;
  private openedAt = 0;
  private lastHeardAt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /** Request id -> program, subscription id -> program, for the current connection. */
  private requests = new Map<number, string>();
  private subscriptionsById = new Map<number, string>();
  private nextId = 1;
  private readonly seen = new Set<string>();
  /** Highest slot heard; where a gap starts after a drop. */
  private highestSlot = 0;
  private gapFrom: number | null = null;
  private readonly rate = new RateMeter(60);
  private loggedAt = -Infinity;
  private suppressed = 0;
  private readonly programs: string[];
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly pingEveryMs: number;
  private readonly staleMs: number;
  private readonly silentMs: number;
  private readonly dedupeWindow: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly log: Pick<Console, 'warn' | 'info'>;
  readonly host: string;
  readonly state = new Map<string, SubscriptionState>();
  lastNotificationAt: number | null = null;
  readonly stats: ProgramLogClientStats = {
    connects: 0,
    disconnects: 0,
    notifications: 0,
    failed: 0,
    duplicates: 0,
    transactions: 0,
    malformed: 0,
    handlerErrors: 0,
    refusals: 0,
    lastRefusal: null,
    lastError: null,
    gaps: 0,
    gapSlots: 0,
    lastGap: null,
    bytes: 0,
    silent: 0,
  };
  /** When every subscription of the current connection was acknowledged (0 = not yet). */
  private subscribedAt = 0;

  constructor(private readonly opts: ProgramLogClientOptions) {
    this.programs = opts.programs ?? [PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID];
    this.baseMs = opts.backoffBaseMs ?? 1000;
    this.maxMs = opts.backoffMaxMs ?? 30_000;
    this.pingEveryMs = opts.pingEveryMs ?? 15_000;
    this.staleMs = opts.staleMs ?? 30_000;
    this.silentMs = opts.silentMs ?? 30_000;
    this.dedupeWindow = opts.dedupeWindow ?? 20_000;
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? console;
    this.host = endpointHost(opts.url);
    for (const p of this.programs) this.state.set(p, 'pending');
  }

  /** Connected, every subscription acknowledged, heard from within staleMs and notified within silentMs. */
  get connected(): boolean {
    return this.open && this.now() - this.lastHeardAt < this.staleMs && this.subscribedAt > 0 && !this.silent();
  }

  /** Subscribed, and no notification since silentMs (or since the subscriptions, if later). */
  private silent(): boolean {
    return this.subscribedAt > 0 && this.now() - Math.max(this.lastNotificationAt ?? 0, this.subscribedAt) >= this.silentMs;
  }

  /** Highest slot seen in a notification (0 before the first). */
  get lastSlot(): number {
    return this.highestSlot;
  }

  /** Notifications per second over the last `overSec` seconds. */
  notificationsPerSecond(overSec = 10): number {
    return this.rate.perSecond(this.now(), overSec);
  }

  /** Whether a signature was already passed on (catch-up skips those). */
  hasSeen(signature: string): boolean {
    return this.seen.has(signature);
  }

  /** Remember a signature delivered some other way (catch-up), so a late notification is not passed on twice. */
  markSeen(signature: string): boolean {
    if (this.seen.has(signature)) return false;
    this.seen.add(signature);
    if (this.seen.size > this.dedupeWindow) {
      let excess = this.seen.size - this.dedupeWindow;
      for (const s of this.seen) {
        if (excess-- <= 0) break;
        this.seen.delete(s);
      }
    }
    return true;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of [this.reconnectTimer, this.heartbeatTimer]) if (t) clearTimeout(t);
    this.reconnectTimer = this.heartbeatTimer = null;
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

  /** Delay before the next attempt: exponential in the attempt count, jittered over its upper half. */
  backoffDelay(attempt: number): number {
    const cap = Math.min(this.maxMs, this.baseMs * 2 ** Math.min(attempt, 20));
    return Math.round(cap / 2 + (this.random() * cap) / 2);
  }

  // ---- connection -----------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      // Notifications are small (a transaction's logs are capped at 10 KB by the node); 8 MB bounds a broken peer.
      ws = new WebSocket(this.opts.url, { handshakeTimeout: this.opts.handshakeTimeoutMs ?? 10_000, maxPayload: 8 * 1024 * 1024, perMessageDeflate: false });
    } catch (err) {
      this.note(`cannot connect: ${err instanceof Error ? err.message : 'error'}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.stats.connects++;
      this.openedAt = this.lastHeardAt = this.now();
      this.subscribedAt = 0;
      this.requests.clear();
      this.subscriptionsById.clear();
      for (const p of this.programs) this.state.set(p, 'pending');
      this.setOpen(true);
      for (const p of this.programs) {
        const id = this.nextId++;
        this.requests.set(id, p);
        this.send({ jsonrpc: '2.0', id, method: 'logsSubscribe', params: [{ mentions: [p] }, { commitment: this.opts.commitment ?? 'confirmed' }] });
      }
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
    ws.on('ping', () => {
      if (this.ws === ws) this.lastHeardAt = this.now();
    });
    ws.on('error', (err) => {
      // 'close' follows. The message never carries the URL ('ws' reports codes and statuses).
      if (this.ws === ws) this.note(`connection error: ${err.message}`);
    });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.open && this.now() - this.openedAt >= STABLE_MS) this.attempt = 0;
      if (this.open) this.stats.disconnects++;
      // Whatever arrives after the reconnect, the slots since the last one heard may be missing.
      if (this.highestSlot > 0) this.gapFrom ??= this.highestSlot;
      this.subscribedAt = 0;
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
        this.note(`no data for ${Math.round((this.now() - this.lastHeardAt) / 1000)}s, reconnecting`);
        ws.terminate();
        return;
      }
      if (this.silent()) {
        // Answers pings, delivers nothing: a subscription the endpoint stopped serving.
        this.stats.silent++;
        this.note(`subscribed but no notification for ${Math.round((this.now() - Math.max(this.lastNotificationAt ?? 0, this.subscribedAt)) / 1000)}s, reconnecting`);
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

  private send(msg: unknown): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Record a connection problem; logged at most once a minute (public endpoints drop every 30-70 s). */
  private note(message: string): void {
    this.stats.lastError = message;
    this.suppressed++;
    const now = this.now();
    if (now - this.loggedAt < 60_000) return;
    const more = this.suppressed > 1 ? ` (${this.suppressed - 1} more in the last minute)` : '';
    this.loggedAt = now;
    this.suppressed = 0;
    this.log.warn(`[solana-logs] ${this.host}: ${message}${more}`);
  }

  // ---- messages -------------------------------------------------------------

  private onFrame(raw: Buffer | ArrayBuffer | Buffer[]): void {
    const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : raw instanceof ArrayBuffer ? Buffer.from(raw).toString('utf8') : String(raw);
    this.stats.bytes += text.length;
    if (this.opts.onFrame) {
      try {
        this.opts.onFrame(text);
      } catch {
        // a capture tool's failure is not the feed's
      }
    }
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      this.stats.malformed++;
      return;
    }
    if (typeof msg !== 'object' || msg === null) {
      this.stats.malformed++;
      return;
    }
    const m = msg as { id?: unknown; result?: unknown; error?: { message?: unknown; code?: unknown }; method?: unknown; params?: unknown };
    if (typeof m.id === 'number') {
      this.onReply(m.id, m.result, m.error);
      return;
    }
    if (m.method !== 'logsNotification') {
      this.stats.malformed++;
      return;
    }
    const params = m.params as { subscription?: unknown; result?: { context?: { slot?: unknown }; value?: { signature?: unknown; err?: unknown; logs?: unknown } } } | undefined;
    const slot = params?.result?.context?.slot;
    const value = params?.result?.value;
    if (typeof slot !== 'number' || !value || typeof value.signature !== 'string' || !Array.isArray(value.logs)) {
      this.stats.malformed++;
      return;
    }
    const now = this.now();
    this.stats.notifications++;
    this.rate.add(1, now);
    this.lastNotificationAt = now;
    this.onSlot(slot);
    if (value.err !== null && value.err !== undefined) {
      this.stats.failed++;
      return;
    }
    if (!this.markSeen(value.signature)) {
      this.stats.duplicates++;
      return;
    }
    this.stats.transactions++;
    try {
      this.opts.onTransaction({ signature: value.signature, slot, logs: value.logs as string[] });
    } catch (err) {
      this.stats.handlerErrors++;
      if (this.stats.handlerErrors % 1000 === 1) this.log.warn(`[solana-logs] transaction handler failed: ${err instanceof Error ? err.message : 'error'}`);
    }
  }

  private onReply(id: number, result: unknown, error: { message?: unknown; code?: unknown } | undefined): void {
    const program = this.requests.get(id);
    if (!program) return;
    this.requests.delete(id);
    if (error || typeof result !== 'number') {
      const reason = typeof error?.message === 'string' ? error.message.slice(0, 200) : 'no subscription id';
      this.state.set(program, 'refused');
      this.stats.refusals++;
      const refusal = `${programName(program)}: ${reason}${typeof error?.code === 'number' ? ` (${error.code})` : ''}`;
      this.stats.lastError = `logsSubscribe refused (${refusal})`;
      if (this.stats.lastRefusal !== refusal) this.log.warn(`[solana-logs] ${this.host}: logsSubscribe refused for ${refusal}`);
      this.stats.lastRefusal = refusal;
      return;
    }
    this.subscriptionsById.set(result, program);
    this.state.set(program, 'active');
    if ([...this.state.values()].every((s) => s === 'active')) this.subscribedAt = this.now();
  }

  /** Slot bookkeeping: the first slot after a reconnect closes the gap opened by the drop. */
  private onSlot(slot: number): void {
    if (this.gapFrom !== null) {
      // The last slot heard before the drop and the first one after may both be partly missed (the
      // socket died inside one, the subscription started inside the other): both bound the gap.
      const from = this.gapFrom;
      this.gapFrom = null;
      if (slot >= from) {
        const gap: SlotGap = { fromSlot: Math.max(from, slot - MAX_REPORTED_GAP_SLOTS), toSlot: slot, at: this.now() };
        this.stats.gaps++;
        this.stats.gapSlots += gap.toSlot - gap.fromSlot + 1;
        this.stats.lastGap = gap;
        try {
          this.opts.onGap?.(gap);
        } catch {
          // the owner's catch-up failing is not the stream's
        }
      }
    }
    if (slot > this.highestSlot) this.highestSlot = slot;
  }
}

function programName(program: string): ProgramName | string {
  return program === PUMP_PROGRAM_ID ? 'pump' : program === PUMP_AMM_PROGRAM_ID ? 'pump-amm' : program;
}
