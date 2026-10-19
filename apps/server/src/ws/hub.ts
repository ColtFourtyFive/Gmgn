// WebSocket channel hub. Clients subscribe to string channels (optionally
// with params, e.g. trenches filters); domain modules register channel
// providers that send an initial snapshot on subscribe and push updates
// either per-event (publish) or periodically per param-group (groups()).

import type { WebSocket } from 'ws';
import type { WsClientMessage, WsServerMessage } from '@trenchscope/shared';

export interface HubClient {
  id: string;
  socket: WebSocket;
  accountId: string | null;
  subs: Map<string, Subscription>;
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

const MAX_BUFFERED = 2 * 1024 * 1024;

export function stableKey(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKey(obj[k])}`)
    .join(',')}}`;
}

export class Hub {
  private clients = new Map<string, HubClient>();
  private providers = new Map<string, ChannelProvider>();
  /** channel -> subscriptions */
  private channels = new Map<string, Set<Subscription>>();
  private authResolver: AuthResolver = () => null;
  private seq = 0;

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

  attach(socket: WebSocket): HubClient {
    this.seq += 1;
    const client: HubClient = { id: `c${this.seq}`, socket, accountId: null, subs: new Map() };
    this.clients.set(client.id, client);
    socket.on('message', (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(String(raw)) as WsClientMessage;
      } catch {
        this.sendTo(client, { op: 'error', message: 'invalid json' });
        return;
      }
      void this.handle(client, msg);
    });
    socket.on('close', () => this.detach(client));
    socket.on('error', () => this.detach(client));
    return client;
  }

  private detach(client: HubClient): void {
    if (!this.clients.has(client.id)) return;
    for (const sub of client.subs.values()) this.removeSub(sub);
    client.subs.clear();
    this.clients.delete(client.id);
  }

  private async handle(client: HubClient, msg: WsClientMessage): Promise<void> {
    switch (msg.op) {
      case 'ping':
        this.sendTo(client, { op: 'pong', t: Date.now() });
        return;
      case 'auth': {
        const accountId = typeof msg.token === 'string' ? this.authResolver(msg.token) : null;
        client.accountId = accountId;
        this.sendTo(client, { op: 'auth', ok: !!accountId, accountId: accountId ?? undefined });
        return;
      }
      case 'unsub': {
        const sub = client.subs.get(msg.ch);
        if (sub) {
          client.subs.delete(msg.ch);
          this.removeSub(sub);
        }
        return;
      }
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
        // Re-subscribing replaces params.
        const existing = client.subs.get(msg.ch);
        if (existing) this.removeSub(existing);
        const sub: Subscription = { client, ch: msg.ch, params: msg.params ?? null, paramsKey: stableKey(msg.params ?? null) };
        try {
          await provider.onSubscribe?.(sub);
        } catch (err) {
          client.subs.delete(msg.ch);
          this.sendTo(client, { op: 'error', message: err instanceof Error ? err.message : 'subscribe failed', ch: msg.ch });
          return;
        }
        client.subs.set(msg.ch, sub);
        if (!this.channels.has(msg.ch)) this.channels.set(msg.ch, new Set());
        this.channels.get(msg.ch)!.add(sub);
        this.sendTo(client, { op: 'ack', ch: msg.ch });
        return;
      }
      default:
        this.sendTo(client, { op: 'error', message: 'unknown op' });
    }
  }

  private removeSub(sub: Subscription): void {
    const set = this.channels.get(sub.ch);
    if (set) {
      set.delete(sub);
      if (set.size === 0) this.channels.delete(sub.ch);
    }
    const prefix = sub.ch.split(':')[0];
    this.providers.get(prefix)?.onUnsubscribe?.(sub);
  }

  sendTo(client: HubClient, msg: WsServerMessage): void {
    const socket = client.socket;
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > MAX_BUFFERED) return; // slow consumer: drop
    socket.send(JSON.stringify(msg));
  }

  /** Send a data message to one subscription. */
  send(sub: Subscription, type: string, data: unknown): void {
    this.sendTo(sub.client, { op: 'data', ch: sub.ch, type, data });
  }

  /** Publish to every subscriber of an exact channel. Serializes once. */
  publish(ch: string, type: string, data: unknown): void {
    const set = this.channels.get(ch);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify({ op: 'data', ch, type, data } satisfies WsServerMessage);
    for (const sub of set) {
      const s = sub.client.socket;
      if (s.readyState === 1 && s.bufferedAmount <= MAX_BUFFERED) s.send(payload);
    }
  }

  /** Publish to every authenticated client of an account on the `user` channel. */
  publishUser(accountId: string, type: string, data: unknown): void {
    const set = this.channels.get('user');
    if (!set) return;
    const payload = JSON.stringify({ op: 'data', ch: 'user', type, data } satisfies WsServerMessage);
    for (const sub of set) {
      if (sub.client.accountId !== accountId) continue;
      const s = sub.client.socket;
      if (s.readyState === 1 && s.bufferedAmount <= MAX_BUFFERED) s.send(payload);
    }
  }

  hasSubscribers(ch: string): boolean {
    return (this.channels.get(ch)?.size ?? 0) > 0;
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
    const payload = JSON.stringify({ op: 'data', ch: group.ch, type, data } satisfies WsServerMessage);
    for (const c of group.clients) {
      const s = c.socket;
      if (s.readyState === 1 && s.bufferedAmount <= MAX_BUFFERED) s.send(payload);
    }
  }
}
