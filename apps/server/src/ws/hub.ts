// WebSocket channel hub. Clients subscribe to string channels (optionally
// with params, e.g. trenches filters); domain modules register channel
// providers that send an initial snapshot on subscribe and push updates
// either per-event (publish) or periodically per param-group (groups()).
// Each client's messages are handled one at a time, in order; a client holds
// at most MAX_SUBS_PER_CLIENT subscriptions carrying at most
// MAX_PARAMS_BYTES_PER_CLIENT of params, an IP at most `maxConnectionsPerIp`
// sockets, and silent or stalled sockets are closed by the heartbeat sweep.
// A slow consumer misses public pushes (the next snapshot repairs them), never
// its private `user` events: a socket too far behind to queue one is closed so
// the client reconnects and resyncs.

import type { WebSocket } from 'ws';
import type { WsClientMessage, WsServerMessage } from '@trenchscope/shared';

export interface HubClient {
  id: string;
  socket: WebSocket;
  accountId: string | null;
  /** Session token presented with `auth`, kept so logouts can revoke the socket. */
  token: string | null;
  subs: Map<string, Subscription>;
  /** Remote address the connection counts against (per-IP cap), if known. */
  ip: string | null;
  /** Messages waiting for the one being handled (handled strictly in order). */
  inbox: unknown[];
  busy: boolean;
  /** Wall time of the last frame or pong from the peer. */
  lastSeenAt: number;
  /** Wall time since which the send buffer has stayed over MAX_BUFFERED (null = draining fine). */
  stalledSince: number | null;
  /** Params its subscriptions hold (sum of their paramsKey lengths, at most MAX_PARAMS_BYTES_PER_CLIENT). */
  paramsBytes: number;
}

export interface Subscription {
  client: HubClient;
  ch: string;
  params: unknown;
  /** Stable key of params for grouping identical subscriptions. */
  paramsKey: string;
}

export interface SubscriptionGroup {
  ch: string;
  params: unknown;
  paramsKey: string;
  clients: HubClient[];
}

export interface ChannelProvider {
  /**
   * Called when a client subscribes to a channel with this provider's prefix.
   * Throw to reject (the message becomes the error). Use hub.sendTo for the initial snapshot.
   */
  onSubscribe?(sub: Subscription): void | Promise<void>;
  onUnsubscribe?(sub: Subscription): void;
  /** Require an authenticated client. */
  requiresAuth?: boolean;
}

/** Resolve a session token to an account id (installed by the accounts module). */
export type AuthResolver = (token: string) => string | null;

export interface HubOptions {
  /** Concurrent sockets per remote address (0 = unlimited). */
  maxConnectionsPerIp?: number;
}

/** Over this much unsent data a socket misses public pushes (list snapshots, ticks, token pushes). */
const MAX_BUFFERED = 2 * 1024 * 1024;
/**
 * Private `user` frames (fill, order, balance, notification) are never dropped (PRD §11.2); a socket
 * this far behind is closed instead, so the client reconnects and resyncs.
 */
export const MAX_BUFFERED_PRIVATE = 8 * 1024 * 1024;
/** Subscriptions one socket may hold at once (PRD §11.2). */
export const MAX_SUBS_PER_CLIENT = 300;
/**
 * Params one socket may keep subscribed, measured as canonical JSON (paramsKey) length: every list
 * filter carrying a whole blacklist (2 x 500 addresses) fits several times over, while the params of
 * hundreds of subscriptions near maxPayload can no longer pin hundreds of MB per socket.
 */
export const MAX_PARAMS_BYTES_PER_CLIENT = 1024 * 1024;
/** Nesting depth accepted in subscription params. */
const MAX_PARAMS_DEPTH = 16;
/** Heartbeat sweep cadence: protocol ping, idle and stall checks. */
export const HEARTBEAT_EVERY_MS = 15_000;
/** A socket that sent nothing (not even a pong) this long is closed (PRD §11.2: 45 s of silence). */
export const IDLE_TIMEOUT_MS = 45_000;
/** A socket whose send buffer stays over MAX_BUFFERED this long is closed (it is not reading). */
export const STALL_TIMEOUT_MS = 15_000;

/** Canonical key of params (sorted object keys). Throws on params nested deeper than MAX_PARAMS_DEPTH. */
export function stableKey(value: unknown, depth = 0): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (depth >= MAX_PARAMS_DEPTH) throw new Error('params nested too deeply');
  if (Array.isArray(value)) return `[${value.map((v) => stableKey(v, depth + 1)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKey(obj[k], depth + 1)}`)
    .join(',')}}`;
}

function* clientsOf(subs: Iterable<Subscription>): Iterable<HubClient> {
  for (const sub of subs) yield sub.client;
}

function isMessage(msg: unknown): msg is WsClientMessage {
  return typeof msg === 'object' && msg !== null && !Array.isArray(msg) && typeof (msg as { op?: unknown }).op === 'string';
}

export class Hub {
  private clients = new Map<string, HubClient>();
  private providers = new Map<string, ChannelProvider>();
  /** channel -> subscriptions */
  private channels = new Map<string, Set<Subscription>>();
  private authResolver: AuthResolver = () => null;
  private seq = 0;
  /** accountId -> its subscriptions to the private `user` channel. */
  private userSubs = new Map<string, Set<Subscription>>();
  /** Remote address -> open sockets. */
  private perIp = new Map<string, number>();
  private readonly maxConnectionsPerIp: number;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(opts: HubOptions = {}) {
    this.maxConnectionsPerIp = opts.maxConnectionsPerIp ?? 0;
  }

  setAuthResolver(fn: AuthResolver): void {
    this.authResolver = fn;
  }

  /** Register a provider for channels named `<prefix>` or `<prefix>:...`. */
  register(prefix: string, provider: ChannelProvider): void {
    this.providers.set(prefix, provider);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /** Adopt a new socket; returns null (and closes it) when its address is over the connection cap. */
  attach(socket: WebSocket): HubClient;
  attach(socket: WebSocket, ip: string | null): HubClient | null;
  attach(socket: WebSocket, ip: string | null = null): HubClient | null {
    if (ip !== null && this.maxConnectionsPerIp > 0) {
      const open = this.perIp.get(ip) ?? 0;
      if (open >= this.maxConnectionsPerIp) {
        socket.close(1008, 'too many connections from this address');
        return null;
      }
      this.perIp.set(ip, open + 1);
    }
    this.seq += 1;
    const client: HubClient = {
      id: `c${this.seq}`,
      socket,
      accountId: null,
      token: null,
      subs: new Map(),
      ip,
      inbox: [],
      busy: false,
      lastSeenAt: Date.now(),
      stalledSince: null,
      paramsBytes: 0,
    };
    this.clients.set(client.id, client);
    socket.on('message', (raw) => {
      client.lastSeenAt = Date.now();
      let msg: unknown;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        this.sendTo(client, { op: 'error', message: 'invalid json' });
        return;
      }
      client.inbox.push(msg);
      if (!client.busy) void this.drain(client);
    });
    socket.on('pong', () => {
      client.lastSeenAt = Date.now();
    });
    socket.on('close', () => this.detach(client));
    socket.on('error', () => this.detach(client));
    return client;
  }

  private detach(client: HubClient): void {
    if (!this.clients.has(client.id)) return;
    for (const sub of client.subs.values()) this.removeSub(sub);
    client.subs.clear();
    client.inbox.length = 0;
    this.clients.delete(client.id);
    if (client.ip !== null && this.perIp.has(client.ip)) {
      const open = this.perIp.get(client.ip)! - 1;
      if (open > 0) this.perIp.set(client.ip, open);
      else this.perIp.delete(client.ip);
    }
  }

  /**
   * Handle a client's messages strictly one after another: a `sub` whose provider
   * yields must not let a later `sub`/`unsub` for the same channel overtake it
   * (that left subscriptions registered that neither unsub nor close removed).
   */
  private async drain(client: HubClient): Promise<void> {
    client.busy = true;
    try {
      while (client.inbox.length > 0 && this.clients.has(client.id)) {
        const msg = client.inbox.shift();
        try {
          await this.handle(client, msg);
        } catch (err) {
          // Never let one bad frame take the process down (an unhandled rejection exits Node).
          console.error('[ws] message handling failed', err);
          this.sendTo(client, { op: 'error', message: 'bad request' });
        }
      }
    } finally {
      client.busy = false;
    }
  }

  private async handle(client: HubClient, msg: unknown): Promise<void> {
    if (!isMessage(msg)) {
      this.sendTo(client, { op: 'error', message: 'invalid message' });
      return;
    }
    switch (msg.op) {
      case 'ping':
        this.sendTo(client, { op: 'pong', t: Date.now() });
        return;
      case 'auth': {
        const token = typeof msg.token === 'string' ? msg.token : null;
        this.setAccount(client, token, token ? this.authResolver(token) : null);
        this.sendTo(client, { op: 'auth', ok: !!client.accountId, accountId: client.accountId ?? undefined });
        return;
      }
      case 'unsub':
        this.dropSub(client, msg.ch);
        return;
      case 'sub': {
        if (typeof msg.ch !== 'string' || msg.ch.length > 200) {
          this.sendTo(client, { op: 'error', message: 'invalid channel' });
          return;
        }
        const prefix = msg.ch.split(':')[0];
        const provider = this.providers.get(prefix);
        if (!provider) {
          this.sendTo(client, { op: 'error', message: `unknown channel ${prefix}`, ch: msg.ch });
          return;
        }
        if (provider.requiresAuth && !client.accountId) {
          this.sendTo(client, { op: 'error', message: 'auth required', ch: msg.ch });
          return;
        }
        if (!client.subs.has(msg.ch) && client.subs.size >= MAX_SUBS_PER_CLIENT) {
          this.sendTo(client, { op: 'error', message: `at most ${MAX_SUBS_PER_CLIENT} subscriptions per connection`, ch: msg.ch });
          return;
        }
        let sub: Subscription;
        try {
          sub = { client, ch: msg.ch, params: msg.params ?? null, paramsKey: stableKey(msg.params ?? null) };
          const kept = client.paramsBytes - (client.subs.get(msg.ch)?.paramsKey.length ?? 0);
          if (kept + sub.paramsKey.length > MAX_PARAMS_BYTES_PER_CLIENT) throw new Error(`subscription params over ${MAX_PARAMS_BYTES_PER_CLIENT / 1024} KB per connection`);
          await provider.onSubscribe?.(sub);
        } catch (err) {
          // A failed re-subscribe drops the channel (its old params are not what the client asked for).
          this.dropSub(client, msg.ch);
          this.sendTo(client, { op: 'error', message: err instanceof Error ? err.message : 'subscribe failed', ch: msg.ch });
          return;
        }
        if (!this.clients.has(client.id) || (provider.requiresAuth && !client.accountId)) {
          // Closed or signed out while the provider was answering: never register it.
          provider.onUnsubscribe?.(sub);
          return;
        }
        // Re-subscribing replaces params. The new subscription is registered before the old one
        // goes, so providers never see a transient zero-subscriber state (which dropped buffered trades).
        const existing = client.subs.get(msg.ch);
        client.subs.set(msg.ch, sub);
        client.paramsBytes += sub.paramsKey.length;
        if (!this.channels.has(msg.ch)) this.channels.set(msg.ch, new Set());
        this.channels.get(msg.ch)!.add(sub);
        if (msg.ch === 'user' && client.accountId) this.indexUserSub(client.accountId, sub);
        if (existing) this.removeSub(existing);
        this.sendTo(client, { op: 'ack', ch: msg.ch });
        return;
      }
      default:
        this.sendTo(client, { op: 'error', message: 'unknown op' });
    }
  }

  private dropSub(client: HubClient, ch: string): void {
    const sub = client.subs.get(ch);
    if (!sub) return;
    client.subs.delete(ch);
    this.removeSub(sub);
  }

  private removeSub(sub: Subscription): void {
    sub.client.paramsBytes -= sub.paramsKey.length;
    const set = this.channels.get(sub.ch);
    if (set) {
      set.delete(sub);
      if (set.size === 0) this.channels.delete(sub.ch);
    }
    if (sub.ch === 'user' && sub.client.accountId) this.unindexUserSub(sub.client.accountId, sub);
    const prefix = sub.ch.split(':')[0];
    this.providers.get(prefix)?.onUnsubscribe?.(sub);
  }

  private indexUserSub(accountId: string, sub: Subscription): void {
    let set = this.userSubs.get(accountId);
    if (!set) this.userSubs.set(accountId, (set = new Set()));
    set.add(sub);
  }

  private unindexUserSub(accountId: string, sub: Subscription): void {
    const set = this.userSubs.get(accountId);
    if (!set) return;
    set.delete(sub);
    if (set.size === 0) this.userSubs.delete(accountId);
  }

  /** Switch a client's identity; auth-only subscriptions are dropped when it changes. */
  private setAccount(client: HubClient, token: string | null, accountId: string | null): void {
    if (client.accountId === accountId) {
      client.token = token;
      return;
    }
    for (const [ch, sub] of client.subs) {
      if (!this.providers.get(ch.split(':')[0])?.requiresAuth) continue;
      client.subs.delete(ch);
      this.removeSub(sub);
    }
    client.accountId = accountId;
    client.token = accountId ? token : null;
  }

  /**
   * Re-resolve every authenticated socket's token (after logout or session
   * eviction) so revoked sessions stop receiving private data immediately.
   */
  revalidateAuth(): void {
    for (const client of this.clients.values()) {
      if (!client.token) continue;
      const accountId = this.authResolver(client.token);
      if (accountId === client.accountId) continue;
      this.setAccount(client, client.token, accountId);
      if (!accountId) this.sendTo(client, { op: 'auth', ok: false });
    }
  }

  /** Start the heartbeat sweep (every HEARTBEAT_EVERY_MS); returns a function that stops it. */
  startHeartbeat(): () => void {
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_EVERY_MS);
      this.heartbeat.unref?.();
    }
    return () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
    };
  }

  /**
   * Liveness: close sockets silent for IDLE_TIMEOUT_MS (a pong to the protocol
   * ping counts, so clients that never send an app-level ping stay up) and
   * sockets that have not drained their send buffer for STALL_TIMEOUT_MS, so a
   * half-open or stalled peer releases its subscriptions and buffers.
   */
  sweep(now = Date.now()): void {
    for (const client of [...this.clients.values()]) {
      const { socket } = client;
      if (socket.bufferedAmount > MAX_BUFFERED) client.stalledSince ??= now;
      else client.stalledSince = null;
      if (now - client.lastSeenAt >= IDLE_TIMEOUT_MS || (client.stalledSince !== null && now - client.stalledSince >= STALL_TIMEOUT_MS)) {
        socket.terminate();
        this.detach(client);
      } else if (socket.readyState === 1) {
        socket.ping();
      }
    }
  }

  sendTo(client: HubClient, msg: WsServerMessage): void {
    if (msg.op === 'data' && msg.ch === 'user') return this.sendPrivate(client, JSON.stringify(msg));
    const socket = client.socket;
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > MAX_BUFFERED) return; // slow consumer: drop
    socket.send(JSON.stringify(msg));
  }

  /** Queue a frame the client must not miss; a socket too far behind to take it is closed (it resyncs on reconnect). */
  private sendPrivate(client: HubClient, payload: string | Buffer): void {
    const socket = client.socket;
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > MAX_BUFFERED_PRIVATE) {
      socket.terminate();
      this.detach(client);
      return;
    }
    socket.send(payload, { binary: false });
  }

  /** Send a data message to one subscription. */
  send(sub: Subscription, type: string, data: unknown): void {
    this.sendTo(sub.client, { op: 'data', ch: sub.ch, type, data });
  }

  /** Publish to every subscriber of an exact channel. Serializes and encodes once. */
  publish(ch: string, type: string, data: unknown): void {
    const set = this.channels.get(ch);
    if (!set || set.size === 0) return;
    this.fanOut(clientsOf(set), JSON.stringify({ op: 'data', ch, type, data } satisfies WsServerMessage));
  }

  /** Publish to every authenticated client of an account on the `user` channel (never dropped, see sendPrivate). */
  publishUser(accountId: string, type: string, data: unknown): void {
    const set = this.userSubs.get(accountId);
    if (!set) return;
    const payload = Buffer.from(JSON.stringify({ op: 'data', ch: 'user', type, data } satisfies WsServerMessage));
    for (const sub of [...set]) this.sendPrivate(sub.client, payload);
  }

  /**
   * Send one serialized public frame to many sockets: UTF-8 encoded once and shared (a string would be
   * encoded again per socket), skipped for sockets over MAX_BUFFERED.
   */
  private fanOut(clients: Iterable<HubClient>, json: string): void {
    const payload = Buffer.from(json);
    for (const { socket: s } of clients) {
      if (s.readyState === 1 && s.bufferedAmount <= MAX_BUFFERED) s.send(payload, { binary: false });
    }
  }

  hasSubscribers(ch: string): boolean {
    return (this.channels.get(ch)?.size ?? 0) > 0;
  }

  /** Whether any client is still subscribed to `ch` with exactly these params (the group is live). */
  hasGroup(ch: string, paramsKey: string): boolean {
    for (const sub of this.channels.get(ch) ?? []) if (sub.paramsKey === paramsKey) return true;
    return false;
  }

  /** Channels currently subscribed that start with `<prefix>:` (or equal prefix). */
  activeChannels(prefix: string): string[] {
    const out: string[] = [];
    for (const ch of this.channels.keys()) if (ch === prefix || ch.startsWith(`${prefix}:`)) out.push(ch);
    return out;
  }

  /** Group active subscriptions under a prefix by (channel, params) so each distinct query is computed once. */
  groups(prefix: string): SubscriptionGroup[] {
    const map = new Map<string, SubscriptionGroup>();
    for (const ch of this.activeChannels(prefix)) {
      for (const sub of this.channels.get(ch)!) {
        const key = `${ch}|${sub.paramsKey}`;
        let g = map.get(key);
        if (!g) {
          g = { ch, params: sub.params, paramsKey: sub.paramsKey, clients: [] };
          map.set(key, g);
        }
        g.clients.push(sub.client);
      }
    }
    return [...map.values()];
  }

  /** Send one payload to every client in a group. */
  sendGroup(group: SubscriptionGroup, type: string, data: unknown): void {
    this.sendGroupJson(group, type, JSON.stringify(data) ?? 'null');
  }

  /** sendGroup with `data` already serialized (e.g. assembled from cached row JSON). */
  sendGroupJson(group: SubscriptionGroup, type: string, dataJson: string): void {
    this.fanOut(group.clients, `{"op":"data","ch":${JSON.stringify(group.ch)},"type":${JSON.stringify(type)},"data":${dataJson}}`);
  }
}
