import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { EventEmitter } from 'node:events';
import type { WsServerMessage } from '@trenchscope/shared';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { Hub } from '../src/ws/hub';

/** Minimal stand-in for a ws socket: records sent frames, lets the test push client frames. */
class FakeSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: WsServerMessage[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data) as WsServerMessage);
  }
  client(msg: unknown): void {
    this.emit('message', JSON.stringify(msg));
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
  });
});
