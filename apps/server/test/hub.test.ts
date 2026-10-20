import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient, type WebSocket } from 'ws';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import type { WsServerMessage } from '@trenchscope/shared';
import { buildApp, connectionCapAddress, defaultConfig, type BuiltApp } from '../src/app';
import { Hub, MAX_BUFFERED_PRIVATE, MAX_PARAMS_BYTES_PER_CLIENT, MAX_SUBS_PER_CLIENT, type Subscription } from '../src/ws/hub';

/**
 * Minimal stand-in for a ws socket: records sent frames, lets the test push client frames.
 * Frames pushed back to back are delivered in the same tick, like several frames in one
 * socket read on a connection without permessage-deflate.
 */
class FakeSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: WsServerMessage[] = [];
  pings = 0;
  terminated = false;
  closedWith: number | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as WsServerMessage);
  }
  client(msg: unknown): void {
    this.emit('message', JSON.stringify(msg));
  }
  raw(text: string): void {
    this.emit('message', Buffer.from(text));
  }
  ping(): void {
    this.pings++;
  }
  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
    this.emit('close');
  }
  close(code: number): void {
    this.closedWith = code;
    this.readyState = 3;
    this.emit('close');
  }
  errors(): string[] {
    return this.sent.flatMap((m) => (m.op === 'error' ? [m.message] : []));
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('hub auth', () => {
  it('routes user messages per account and drops private subscriptions when a session is revoked', async () => {
    const hub = new Hub();
    const sessions = new Map([
      ['tok-a', 'acct-a'],
      ['tok-b', 'acct-b'],
    ]);
    hub.setAuthResolver((t) => sessions.get(t) ?? null);
    hub.register('user', { requiresAuth: true });
    hub.register('market', {});

    const a = new FakeSocket();
    const b = new FakeSocket();
    hub.attach(a as unknown as WebSocket);
    hub.attach(b as unknown as WebSocket);
    for (const [sock, tok] of [
      [a, 'tok-a'],
      [b, 'tok-b'],
    ] as const) {
      sock.client({ op: 'auth', token: tok });
      sock.client({ op: 'sub', ch: 'user' });
      sock.client({ op: 'sub', ch: 'market' });
    }
    await flush();

    hub.publishUser('acct-a', 'notification', { n: 1 });
    expect(a.sent.filter((m) => m.op === 'data')).toHaveLength(1);
    expect(b.sent.filter((m) => m.op === 'data')).toHaveLength(0);

    sessions.delete('tok-a'); // logout
    hub.revalidateAuth();
    expect(a.sent.at(-1)).toEqual({ op: 'auth', ok: false });
    hub.publishUser('acct-a', 'notification', { n: 2 });
    expect(a.sent.filter((m) => m.op === 'data')).toHaveLength(1);
    // public subscriptions survive the revocation
    hub.publish('market', 'market', []);
    expect(a.sent.filter((m) => m.op === 'data' && m.ch === 'market')).toHaveLength(1);
    // the other account is unaffected
    hub.publishUser('acct-b', 'notification', { n: 3 });
    expect(b.sent.filter((m) => m.op === 'data' && m.ch === 'user')).toHaveLength(1);
  });

  it('closing a socket removes it from the per-account index', async () => {
    const hub = new Hub();
    hub.setAuthResolver(() => 'acct');
    hub.register('user', { requiresAuth: true });
    const s = new FakeSocket();
    hub.attach(s as unknown as WebSocket);
    s.client({ op: 'auth', token: 'x' });
    s.client({ op: 'sub', ch: 'user' });
    await flush();
    s.emit('close');
    s.sent = [];
    hub.publishUser('acct', 'balance', {});
    expect(s.sent).toHaveLength(0);
  });
});

describe('account creation limit', () => {
  let built: BuiltApp | null = null;
  afterEach(async () => {
    await built?.app.close();
    built = null;
  });

  it('caps guest sign-ups per IP with 429 + retry-after', async () => {
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, accountCreationsPerIpPer10Min: 3 }), { start: false, persist: false });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await built.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const res = await built.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.json()).toMatchObject({ code: 'rate_limited' });
    // other spellings the router resolves to the same handlers count against the same budget
    for (const url of ['/api/auth/gues%74', '/api/auth/%67ues%74', '/API/auth/guest', '/api/auth/regist%65r', '/api/auth/register?x=1']) {
      const r = await built.app.inject({ method: 'POST', url, payload: { username: 'spelled', password: 'hunter2hunter2' } });
      expect([url, r.statusCode]).not.toEqual([url, 200]);
      if (r.statusCode !== 404) expect([url, r.statusCode]).toEqual([url, 429]);
    }
  });

  it('caps login attempts per IP whatever the username (every attempt runs a password hash)', async () => {
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, loginAttemptsPerIpPer10Min: 3 }), { start: false, persist: false });
    const login = (username: string, url = '/api/auth/login', remoteAddress = '203.0.113.9') =>
      built!.app.inject({ method: 'POST', url, remoteAddress, payload: { username, password: 'hunter22' } });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await login(`nobody_${i}`)).statusCode);
    codes.push((await login('nobody_3', '/api/auth/logi%6e')).statusCode);
    expect(codes).toEqual([401, 401, 401, 429]);
    const res = await login('someone_else');
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.json()).toMatchObject({ code: 'rate_limited', error: expect.stringMatching(/sign-in attempts/) });
    // another address has its own budget, and account creation is budgeted separately
    expect((await login('nobody_0', '/api/auth/login', '203.0.113.10')).statusCode).toBe(401);
    expect((await built.app.inject({ method: 'POST', url: '/api/auth/guest', remoteAddress: '203.0.113.9', payload: {} })).statusCode).toBe(200);
  });
});

describe('channel names', () => {
  let built: BuiltApp | null = null;
  afterEach(async () => {
    await built?.close();
    built = null;
  });

  it('rejects extra segments on market and user (pushes only ever reach the exact names)', async () => {
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
    const { token } = (await built.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} })).json() as { token: string };
    const s = new FakeSocket();
    built.ctx.hub.attach(s as unknown as WebSocket);
    s.client({ op: 'auth', token });
    for (const ch of ['market:sol', 'user:main', 'market', 'user']) s.client({ op: 'sub', ch });
    await vi.waitFor(() => expect(s.sent.filter((m) => m.op === 'ack' || m.op === 'error')).toHaveLength(4));
    expect(s.sent.filter((m) => m.op === 'error').map((m) => m.ch)).toEqual(['market:sol', 'user:main']);
    expect(s.sent.filter((m) => m.op === 'ack').map((m) => m.ch)).toEqual(['market', 'user']);
    expect(s.sent.filter((m) => m.op === 'data').every((m) => m.ch === 'market' || m.ch === 'user')).toBe(true);
  });
});

describe('hub robustness', () => {
  it('answers malformed frames, over-deep params and handler errors with an error, never a crash', async () => {
    const hub = new Hub();
    hub.register('market', { onSubscribe: (sub) => hub.send(sub, 'market', []) });
    const s = new FakeSocket();
    hub.attach(s as unknown as WebSocket);
    for (const frame of ['null', '[]', '42', '"sub"', '{"op":5}', '{"ch":"market"}']) s.raw(frame);
    // 80KB of nesting: fine for JSON.parse, a stack overflow for a recursive params key
    const deep = '['.repeat(40_000) + ']'.repeat(40_000);
    s.raw(`{"op":"sub","ch":"market","params":${deep}}`);
    await flush();
    expect(s.errors()).toEqual([...Array(6).fill('invalid message'), 'params nested too deeply']);
    expect(hub.hasSubscribers('market')).toBe(false);

    hub.setAuthResolver(() => {
      throw new Error('resolver down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    s.client({ op: 'auth', token: 'x' });
    await flush();
    expect(s.errors().at(-1)).toBe('bad request');

    // the connection (and the process) keep working
    s.client({ op: 'sub', ch: 'market' });
    await flush();
    expect(s.sent.at(-1)).toEqual({ op: 'ack', ch: 'market' });
    vi.restoreAllMocks();
  });

  it(`caps a connection at ${MAX_SUBS_PER_CLIENT} subscriptions (re-subscribing still works)`, async () => {
    const hub = new Hub();
    hub.register('x', {});
    const s = new FakeSocket();
    hub.attach(s as unknown as WebSocket);
    for (let i = 0; i <= MAX_SUBS_PER_CLIENT; i++) s.client({ op: 'sub', ch: `x:${i}` });
    await flush();
    expect(s.sent.filter((m) => m.op === 'ack')).toHaveLength(MAX_SUBS_PER_CLIENT);
    expect(s.errors()).toEqual([`at most ${MAX_SUBS_PER_CLIENT} subscriptions per connection`]);
    s.client({ op: 'sub', ch: 'x:0', params: { v: 2 } });
    await flush();
    expect(s.sent.at(-1)).toEqual({ op: 'ack', ch: 'x:0' });
  });

  for (const mode of ['sync', 'async'] as const) {
    it(`handles back-to-back frames in order, leaving nothing behind after unsub or close (${mode} provider)`, async () => {
      const hub = new Hub();
      let subs = 0;
      let unsubs = 0;
      const sawSubscribers: boolean[] = [];
      hub.register('p', {
        onSubscribe: () => {
          subs++;
          return mode === 'async' ? new Promise<void>((r) => setTimeout(r, 1)) : undefined;
        },
        onUnsubscribe: (sub: Subscription) => {
          unsubs++;
          sawSubscribers.push(hub.hasSubscribers(sub.ch));
        },
      });
      const s = new FakeSocket();
      hub.attach(s as unknown as WebSocket);
      for (let i = 0; i < 3; i++) s.client({ op: 'sub', ch: 'p:a', params: { i } });
      await new Promise((r) => setTimeout(r, 20));
      expect(hub.groups('p').map((g) => g.params)).toEqual([{ i: 2 }]);
      // a replaced subscription leaves after its successor is in: never a zero-subscriber gap
      expect(sawSubscribers).toEqual([true, true]);

      s.client({ op: 'sub', ch: 'p:b' });
      s.client({ op: 'unsub', ch: 'p:b' });
      await new Promise((r) => setTimeout(r, 20));
      expect(hub.hasSubscribers('p:b')).toBe(false);

      s.client({ op: 'sub', ch: 'p:c' });
      s.emit('close'); // before the provider answered
      await new Promise((r) => setTimeout(r, 20));
      expect(hub.groups('p')).toEqual([]);
      expect(hub.clientCount).toBe(0);
      expect(unsubs).toBe(subs);
    });
  }

  it('closes sockets that stay silent past the idle timeout or stop draining their buffer', async () => {
    const hub = new Hub();
    hub.register('market', {});
    const t0 = Date.now();
    const [silent, alive, stalled] = [new FakeSocket(), new FakeSocket(), new FakeSocket()];
    for (const s of [silent, alive, stalled]) {
      hub.attach(s as unknown as WebSocket);
      s.client({ op: 'sub', ch: 'market' });
    }
    await flush();
    stalled.bufferedAmount = 3 * 1024 * 1024;

    hub.sweep(t0 + 1_000);
    expect([silent.pings, alive.pings]).toEqual([1, 1]);
    hub.sweep(t0 + 17_000);
    expect(stalled.terminated).toBe(true);
    expect([silent.terminated, alive.terminated]).toEqual([false, false]);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 40_000);
    alive.emit('pong'); // answers the protocol ping: counts as activity
    vi.restoreAllMocks();
    hub.sweep(t0 + 46_000);
    expect(silent.terminated).toBe(true);
    expect(alive.terminated).toBe(false);
    expect(hub.clientCount).toBe(1);
    expect(hub.groups('market').flatMap((g) => g.clients)).toHaveLength(1);
  });

  it('caps concurrent connections per address', () => {
    const hub = new Hub({ maxConnectionsPerIp: 2 });
    const sockets = Array.from({ length: 5 }, () => new FakeSocket());
    const attach = (i: number, ip: string) => hub.attach(sockets[i] as unknown as WebSocket, ip);
    expect(attach(0, '10.0.0.1')).not.toBeNull();
    expect(attach(1, '10.0.0.1')).not.toBeNull();
    expect(attach(2, '10.0.0.1')).toBeNull();
    expect(sockets[2].closedWith).toBe(1008);
    expect(attach(3, '10.0.0.2')).not.toBeNull();
    sockets[0].emit('close');
    expect(attach(4, '10.0.0.1')).not.toBeNull();
    expect(hub.clientCount).toBe(3);
  });

  it('exempts only local clients from the per-address cap, never a remote peer claiming loopback', () => {
    expect(connectionCapAddress('127.0.0.1', '127.0.0.1')).toBeNull();
    expect(connectionCapAddress('::ffff:127.0.0.1', '::1')).toBeNull();
    expect(connectionCapAddress('127.0.0.1', '203.0.113.7')).toBe('127.0.0.1');
    expect(connectionCapAddress('203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
    expect(connectionCapAddress('127.0.0.1', undefined)).toBe('127.0.0.1');
  });

  it(`caps the params a connection keeps subscribed at ${MAX_PARAMS_BYTES_PER_CLIENT / 1024} KB`, async () => {
    const hub = new Hub();
    hub.register('x', {});
    const s = new FakeSocket();
    hub.attach(s as unknown as WebSocket);
    const big = { blob: 'a'.repeat(MAX_PARAMS_BYTES_PER_CLIENT / 3) };
    for (const ch of ['x:1', 'x:2', 'x:3', 'x:4']) s.client({ op: 'sub', ch, params: big });
    await flush();
    expect(s.sent.filter((m) => m.op === 'ack').map((m) => m.ch)).toEqual(['x:1', 'x:2']);
    expect(s.errors()).toEqual([`subscription params over ${MAX_PARAMS_BYTES_PER_CLIENT / 1024} KB per connection`, `subscription params over ${MAX_PARAMS_BYTES_PER_CLIENT / 1024} KB per connection`]);
    // re-subscribing with small params and unsubscribing give the room back
    s.client({ op: 'sub', ch: 'x:1', params: { v: 1 } });
    s.client({ op: 'unsub', ch: 'x:2' });
    s.client({ op: 'sub', ch: 'x:3', params: big });
    s.client({ op: 'sub', ch: 'x:4', params: big });
    await flush();
    expect(s.sent.filter((m) => m.op === 'ack').map((m) => m.ch)).toEqual(['x:1', 'x:2', 'x:1', 'x:3', 'x:4']);
    expect(hub.groups('x').map((g) => g.ch).sort()).toEqual(['x:1', 'x:3', 'x:4']);
  });

  it('drops public pushes for a slow consumer but never its private user events (it is closed instead)', async () => {
    const hub = new Hub();
    hub.setAuthResolver(() => 'acct');
    hub.register('user', { requiresAuth: true, onSubscribe: (sub) => hub.send(sub, 'balance', { chain: 'sol' }) });
    hub.register('market', {});
    const s = new FakeSocket();
    hub.attach(s as unknown as WebSocket);
    s.client({ op: 'auth', token: 'x' });
    s.client({ op: 'sub', ch: 'market' });
    await flush();
    s.bufferedAmount = 3 * 1024 * 1024; // over the 2 MB public cap
    s.client({ op: 'sub', ch: 'user' });
    await flush();
    hub.publish('market', 'market', []);
    hub.publishUser('acct', 'fill', { n: 1 });
    expect(s.sent.filter((m) => m.op === 'data').map((m) => [m.ch, m.type])).toEqual([
      ['user', 'balance'],
      ['user', 'fill'],
    ]);
    // too far behind to queue even a private frame: closed, so the client reconnects and resyncs
    s.bufferedAmount = MAX_BUFFERED_PRIVATE + 1;
    hub.publishUser('acct', 'order', { n: 2 });
    expect(s.terminated).toBe(true);
    expect(hub.clientCount).toBe(0);
    expect(s.sent.filter((m) => m.op === 'data')).toHaveLength(2);
  });
});

describe('hub over a real socket', () => {
  let built: BuiltApp | null = null;
  afterEach(async () => {
    await built?.app.close();
    built = null;
  });

  const open = (url: string, ip = '203.0.113.7') =>
    new Promise<{ ws: WsClient; frames: WsServerMessage[]; closed: Promise<number> }>((resolve, reject) => {
      const ws = new WsClient(url, { perMessageDeflate: false, headers: { 'x-forwarded-for': ip } });
      const frames: WsServerMessage[] = [];
      const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
      ws.on('message', (raw) => frames.push(JSON.parse(String(raw)) as WsServerMessage));
      ws.on('open', () => resolve({ ws, frames, closed }));
      ws.on('error', reject);
    });

  it('survives hostile frames and caps sockets per address', async () => {
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, wsConnectionsPerIp: 2, trustProxy: true }), { start: false, persist: false });
    const address = await built.app.listen({ port: 0, host: '127.0.0.1' });
    const url = `${address.replace('http', 'ws')}/ws`;
    const a = await open(url);
    a.ws.send('null');
    a.ws.send(`{"op":"sub","ch":"market","params":${'['.repeat(40_000)}${']'.repeat(40_000)}}`);
    a.ws.send(JSON.stringify({ op: 'ping' }));
    await vi.waitFor(() => expect(a.frames.some((m) => m.op === 'pong')).toBe(true));
    expect(a.frames.filter((m) => m.op === 'error').map((m) => (m as { message: string }).message)).toEqual(['invalid message', 'params nested too deeply']);
    expect((await built.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);

    const b = await open(url);
    const c = await open(url);
    expect(await c.closed).toBe(1008);
    // entries a client prepends to X-Forwarded-For are ignored: only the one the proxy appended counts
    for (const spoofed of ['127.0.0.1, 203.0.113.7', '198.51.100.77, 203.0.113.7']) {
      const s = await open(url, spoofed);
      expect(await s.closed).toBe(1008);
    }
    const other = await open(url, '198.51.100.9'); // another address is not affected
    const local = await open(url, '127.0.0.1'); // nor are loopback peers (local proxies, dev)
    for (const s of [other, local]) {
      s.ws.send(JSON.stringify({ op: 'ping' }));
      await vi.waitFor(() => expect(s.frames.some((m) => m.op === 'pong')).toBe(true));
      expect(s.ws.readyState).toBe(WsClient.OPEN);
    }
    for (const s of [a, b, other, local]) s.ws.close();
  });

  it('deflates only large frames: pongs and other small frames skip the shared zlib queue', async () => {
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
    const address = await built.app.listen({ port: 0, host: '127.0.0.1' });
    const ws = new WsClient(`${address.replace('http', 'ws')}/ws`); // offers permessage-deflate, like browsers
    const frames: WsServerMessage[] = [];
    let negotiated = '';
    ws.on('upgrade', (res) => (negotiated = String(res.headers['sec-websocket-extensions'])));
    ws.on('message', (raw) => frames.push(JSON.parse(String(raw)) as WsServerMessage));
    await new Promise((r) => ws.on('open', r));
    // ws honours `threshold` only without server context takeover
    expect(negotiated).toContain('server_no_context_takeover');
    // first byte of each raw chunk: the next frame's header (RSV1 = 0x40 marks a compressed frame)
    const heads: number[] = [];
    (ws as unknown as { _socket: Socket })._socket.on('data', (chunk: Buffer) => heads.push(chunk[0]));
    ws.send(JSON.stringify({ op: 'sub', ch: 'market' }));
    await vi.waitFor(() => expect(frames.some((m) => m.op === 'ack')).toBe(true));
    heads.length = 0;
    ws.send(JSON.stringify({ op: 'ping' }));
    await vi.waitFor(() => expect(frames.some((m) => m.op === 'pong')).toBe(true));
    expect(heads[0] & 0x40).toBe(0);
    heads.length = 0;
    built.ctx.hub.publish('market', 'market', Array.from({ length: 2000 }, (_, i) => ({ chain: 'sol', i })));
    await vi.waitFor(() => expect(frames.filter((m) => m.op === 'data' && m.ch === 'market')).toHaveLength(2));
    expect(heads[0] & 0x40).toBe(0x40);
    ws.close();
  });
});
