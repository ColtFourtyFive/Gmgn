// Realtime client: one WebSocket per tab with auto-reconnect, ref-counted
// channel subscriptions and React hooks on top.

import { useEffect, useRef, useState } from 'react';
import type { WsClientMessage, WsServerMessage } from '@trenchscope/shared';

type Listener = (type: string, data: unknown) => void;
type ErrorListener = (message: string) => void;

interface ChannelEntry {
  params: unknown;
  listeners: Set<Listener>;
  /** Server `error` messages about this channel (bad params, auth required ...). */
  errorListeners: Set<ErrorListener>;
}

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** Heartbeat: ping this often while open (the server answers every ping with a pong). */
export const PING_EVERY_MS = 10_000;
/**
 * A socket that delivers nothing at all (not even the pong) this long after a
 * ping is treated as dead. Half-open connections (sleep, network change, a
 * NAT/proxy that stopped forwarding) can stay OPEN for minutes before TCP
 * notices, while the UI would keep showing frozen data as "Live".
 */
export const PONG_TIMEOUT_MS = 5_000;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private channels = new Map<string, ChannelEntry>();
  private token: string | null = null;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();
  state: ConnectionState = 'closed';
  /** Increments on every successful (re)connect: data received before the current one is from an older stream. */
  epoch = 0;
  /** Round-trip latency of the last ping (ms). */
  latency: number | null = null;
  private pingSentAt = 0;
  /** When the current socket last delivered a frame (performance.now()). */
  private lastFrameAt = 0;

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }

  onState(fn: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.setState('connecting');
    const ws = new WebSocket(this.url());
    this.socket = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastFrameAt = performance.now();
      this.epoch++;
      this.setState('open');
      if (this.token) this.raw({ op: 'auth', token: this.token });
      for (const [ch, entry] of this.channels) {
        if (ch === 'user' && !this.token) continue;
        this.raw({ op: 'sub', ch, params: entry.params ?? undefined });
      }
      this.startHeartbeat(ws);
    };
    ws.onmessage = (ev) => {
      this.lastFrameAt = performance.now();
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as WsServerMessage;
      } catch {
        return;
      }
      if (msg.op === 'data') {
        const entry = this.channels.get(msg.ch);
        if (entry) for (const l of entry.listeners) l(msg.type, msg.data);
      } else if (msg.op === 'error') {
        if (import.meta.env.DEV) console.warn(`[ws] ${msg.ch ? `${msg.ch}: ` : ''}${msg.message}`);
        const entry = msg.ch ? this.channels.get(msg.ch) : undefined;
        if (entry) for (const l of entry.errorListeners) l(msg.message);
      } else if (msg.op === 'pong') {
        this.latency = Math.round(performance.now() - this.pingSentAt);
      } else if (msg.op === 'auth' && msg.ok && this.channels.has('user')) {
        this.raw({ op: 'sub', ch: 'user' });
      }
    };
    ws.onclose = () => this.drop(ws);
    ws.onerror = () => ws.close();
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  private startHeartbeat(ws: WebSocket): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      const sentAt = performance.now();
      this.pingSentAt = sentAt;
      this.raw({ op: 'ping' });
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        // Any frame since the ping proves the path is alive; nothing at all means half-open.
        if (this.socket === ws && this.lastFrameAt < sentAt) this.drop(ws);
      }, PONG_TIMEOUT_MS);
    }, PING_EVERY_MS);
  }

  /**
   * Forget `ws` (closed, or silent past the heartbeat timeout) and reconnect.
   * Does not wait for the close handshake: on a half-open socket it never
   * completes, and `onclose` would only fire once the browser gives up.
   */
  private drop(ws: WebSocket): void {
    if (this.socket !== ws) return;
    this.stopHeartbeat();
    this.socket = null;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    this.latency = null;
    this.setState('closed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(10000, 500 * 2 ** this.retry) + Math.random() * 300;
    this.retry++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private raw(msg: WsClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  setToken(token: string | null): void {
    if (token === this.token) return;
    this.token = token;
    if (token) {
      this.raw({ op: 'auth', token });
    } else if (this.socket) {
      // Drop authenticated state by reconnecting anonymously.
      this.socket.close();
    }
  }

  subscribe(ch: string, params: unknown, listener: Listener, onError?: ErrorListener): () => void {
    this.connect();
    let entry = this.channels.get(ch);
    if (!entry) {
      entry = { params, listeners: new Set(), errorListeners: new Set() };
      this.channels.set(ch, entry);
      if (ch !== 'user' || this.token) this.raw({ op: 'sub', ch, params: params ?? undefined });
    } else if (JSON.stringify(entry.params) !== JSON.stringify(params)) {
      entry.params = params;
      this.raw({ op: 'sub', ch, params: params ?? undefined });
    }
    entry.listeners.add(listener);
    if (onError) entry.errorListeners.add(onError);
    return () => {
      const e = this.channels.get(ch);
      if (!e) return;
      e.listeners.delete(listener);
      if (onError) e.errorListeners.delete(onError);
      if (e.listeners.size === 0) {
        this.channels.delete(ch);
        this.raw({ op: 'unsub', ch });
      }
    };
  }

  /** Update params of an existing subscription without re-registering listeners. */
  updateParams(ch: string, params: unknown): void {
    const e = this.channels.get(ch);
    if (!e) return;
    if (JSON.stringify(e.params) === JSON.stringify(params)) return;
    e.params = params;
    this.raw({ op: 'sub', ch, params: params ?? undefined });
  }
}

export const realtime = new RealtimeClient();

/**
 * Subscribe to a channel for the lifetime of the component. `onData` may change
 * between renders without resubscribing; params changes are pushed in place.
 * `onError` receives the server's `error` messages for this channel (e.g.
 * rejected params); they are also logged in development.
 */
export function useChannel(
  ch: string | null,
  params: unknown,
  onData: (type: string, data: unknown) => void,
  onError?: (message: string) => void,
): void {
  const cb = useRef(onData);
  cb.current = onData;
  const errCb = useRef(onError);
  errCb.current = onError;
  const paramsKey = JSON.stringify(params ?? null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!ch) return;
    return realtime.subscribe(
      ch,
      paramsRef.current,
      (type, data) => cb.current(type, data),
      (message) => errCb.current?.(message),
    );
  }, [ch]);

  useEffect(() => {
    if (ch) realtime.updateParams(ch, paramsRef.current);
  }, [ch, paramsKey]);
}

/** Latest payload of one message type on a channel (null until the first message). */
export function useChannelState<T>(ch: string | null, type: string, params?: unknown): T | null {
  const [state, setState] = useState<T | null>(null);
  useEffect(() => setState(null), [ch]);
  useChannel(ch, params, (t, data) => {
    if (t === type) setState(data as T);
  });
  return state;
}

export function useConnectionState(): ConnectionState {
  const [s, setS] = useState<ConnectionState>(realtime.state);
  useEffect(() => {
    realtime.connect();
    return realtime.onState(setS);
  }, []);
  return s;
}
