import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PING_EVERY_MS, PONG_TIMEOUT_MS, RealtimeClient, type ConnectionState } from './ws';

/** Minimal WebSocket stand-in: the test drives open/message/close by hand. */
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  /** A half-open socket never completes the close handshake, so close() alone never fires onclose. */
  close() {
    this.readyState = FakeSocket.CLOSING;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function connected() {
  const client = new RealtimeClient();
  const states: ConnectionState[] = [];
  client.onState((s) => states.push(s));
  client.connect();
  const socket = FakeSocket.all[0];
  socket.open();
  return { client, socket, states };
}

describe('RealtimeClient heartbeat', () => {
  it('keeps a socket that answers pings', async () => {
    const { client, socket } = connected();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(PING_EVERY_MS);
      expect(socket.sent.at(-1)).toEqual({ op: 'ping' });
      socket.receive({ op: 'pong', t: Date.now() });
    }
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS);
    expect(client.state).toBe('open');
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('treats any frame after the ping as proof of life', async () => {
    const { client, socket } = connected();
    await vi.advanceTimersByTimeAsync(PING_EVERY_MS);
    socket.receive({ op: 'data', ch: 'trenches:sol', type: 'snapshot', data: {} });
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS);
    expect(client.state).toBe('open');
  });

  it('drops a silent (half-open) socket, reports closed and reconnects with its subscriptions', async () => {
    const { client, socket, states } = connected();
    const listener = vi.fn();
    client.subscribe('trenches:sol', { a: 1 }, listener);
    expect(client.epoch).toBe(1);

    // The path goes dead: the socket stays OPEN but nothing arrives any more.
    await vi.advanceTimersByTimeAsync(PING_EVERY_MS + PONG_TIMEOUT_MS);
    expect(client.state).toBe('closed');
    expect(states.at(-1)).toBe('closed');
    expect(client.latency).toBeNull();
    // Late frames from the abandoned socket are ignored.
    socket.receive({ op: 'data', ch: 'trenches:sol', type: 'snapshot', data: { stale: true } });
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000); // first reconnect after ~500ms
    expect(FakeSocket.all).toHaveLength(2);
    const next = FakeSocket.all[1];
    next.open();
    expect(client.state).toBe('open');
    expect(client.epoch).toBe(2);
    expect(next.sent).toContainEqual({ op: 'sub', ch: 'trenches:sol', params: { a: 1 } });
  });

  it('still reconnects on a normal close', async () => {
    const { client, socket } = connected();
    socket.onclose?.();
    expect(client.state).toBe('closed');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.all).toHaveLength(2);
  });
});
