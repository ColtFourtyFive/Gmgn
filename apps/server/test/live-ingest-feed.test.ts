// PumpPortal client against a local 'ws' server standing in for
// wss://pumpportal.fun/api/data: always-on subscriptions, batched and chunked
// token / account subscriptions, reconnect with backoff and a full resubscribe,
// staleness detection, malformed-frame accounting and the API key in the URL.

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { FeedEvent } from '../src/live/feed/messages';
import { PumpPortalClient, type PumpPortalOptions } from '../src/live/feed/pumpportal';

const FIX = join(__dirname, 'fixtures', 'pumpportal');
const lifecycle = JSON.parse(readFileSync(join(FIX, 'lifecycle.json'), 'utf8')) as Record<string, unknown>[];
const misc = JSON.parse(readFileSync(join(FIX, 'misc.json'), 'utf8')) as { malformed: string[] } & Record<string, Record<string, unknown>>;

interface FakeFeed {
  wss: WebSocketServer;
  url: string;
  sockets: WebSocket[];
  received: { method: string; keys?: string[] }[];
  urls: string[];
}

const servers: WebSocketServer[] = [];
const clients: PumpPortalClient[] = [];

async function fakeFeed(opts: { autoPong?: boolean } = {}): Promise<FakeFeed> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', autoPong: opts.autoPong ?? true });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  servers.push(wss);
  const feed: FakeFeed = { wss, url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/api/data`, sockets: [], received: [], urls: [] };
  wss.on('connection', (ws, req) => {
    feed.sockets.push(ws);
    feed.urls.push(req.url ?? '');
    ws.on('message', (raw) => feed.received.push(JSON.parse(String(raw))));
  });
  return feed;
}

function client(url: string, extra: Partial<PumpPortalOptions> = {}): { c: PumpPortalClient; events: FeedEvent[]; states: boolean[] } {
  const events: FeedEvent[] = [];
  const states: boolean[] = [];
  const c = new PumpPortalClient({
    url,
    onEvent: (e) => events.push(e),
    onStatus: (s) => states.push(s),
    batchMs: 20,
    backoffBaseMs: 20,
    backoffMaxMs: 100,
    log: { warn: () => {}, info: () => {} },
    ...extra,
  });
  clients.push(c);
  return { c, events, states };
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.stop()));
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          for (const ws of s.clients) ws.terminate();
          s.close(() => resolve());
        }),
    ),
  );
});

describe('PumpPortal client', () => {
  it('subscribes to launches and migrations on connect, then the tracked tokens and wallets in batches', async () => {
    const feed = await fakeFeed();
    const { c, states } = client(feed.url);
    c.subscribeTokenTrades(['mintA', 'mintB']);
    c.setAccounts(['walletA']);
    c.start();
    await until(() => feed.received.length >= 4);
    expect(feed.received.slice(0, 4)).toEqual([
      { method: 'subscribeNewToken' },
      { method: 'subscribeMigration' },
      { method: 'subscribeTokenTrade', keys: ['mintA', 'mintB'] },
      { method: 'subscribeAccountTrade', keys: ['walletA'] },
    ]);
    expect(states).toEqual([true]);
    expect(c.connected).toBe(true);
    // changes within the batch window go out as one message each way
    c.subscribeTokenTrades(['mintC']);
    c.subscribeTokenTrades(['mintD', 'mintA']);
    c.unsubscribeTokenTrades(['mintB']);
    await until(() => feed.received.length >= 6);
    await new Promise((r) => setTimeout(r, 60));
    expect(feed.received.slice(4)).toEqual([
      { method: 'unsubscribeTokenTrade', keys: ['mintB'] },
      { method: 'subscribeTokenTrade', keys: ['mintC', 'mintD'] },
    ]);
    c.setAccounts(['walletB']);
    await until(() => feed.received.length >= 8);
    expect(feed.received.slice(6)).toEqual([
      { method: 'unsubscribeAccountTrade', keys: ['walletA'] },
      { method: 'subscribeAccountTrade', keys: ['walletB'] },
    ]);
  });

  it('chunks large subscriptions', async () => {
    const feed = await fakeFeed();
    const { c } = client(feed.url, { maxKeysPerMessage: 2 });
    c.subscribeTokenTrades(['m1', 'm2', 'm3', 'm4', 'm5']);
    c.start();
    await until(() => feed.received.length >= 5);
    expect(feed.received.slice(2)).toEqual([
      { method: 'subscribeTokenTrade', keys: ['m1', 'm2'] },
      { method: 'subscribeTokenTrade', keys: ['m3', 'm4'] },
      { method: 'subscribeTokenTrade', keys: ['m5'] },
    ]);
  });

  it('dispatches valid events in order, counts malformed frames, notices and refusals', async () => {
    const feed = await fakeFeed();
    const { c, events } = client(feed.url);
    c.start();
    await until(() => feed.sockets.length === 1 && feed.received.length >= 2);
    const ws = feed.sockets[0];
    for (const raw of misc.malformed) ws.send(raw);
    ws.send(JSON.stringify(misc.subscribedMigration));
    ws.send(JSON.stringify(misc.unsubscribed));
    ws.send(JSON.stringify(misc.errorInvalidMethod));
    for (const f of lifecycle) ws.send(JSON.stringify(f));
    await until(() => events.length === lifecycle.length - 1);
    expect(events.map((e) => e.kind)).toEqual(['create', ...Array(10).fill('trade'), 'migrate']);
    expect(c.diag.malformed).toBe(misc.malformed.length);
    expect(c.diag.notices).toBe(3);
    expect(c.diag.refusals).toBe(0);
    expect(c.diag.serverErrors).toBe(1);
    expect(c.diag.creates).toBe(1);
    expect(c.diag.trades).toBe(10);
    expect(c.diag.tradeStreams).toBe('active');
    expect(c.lastEventAt).not.toBeNull();
  });

  it('stops sending trade subscriptions once PumpPortal refuses them (no funded key), and retries later', async () => {
    const feed = await fakeFeed();
    // PumpPortal without a funded key: every trade subscription draws the refusal notice
    feed.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw)) as { method: string };
        if (m.method === 'subscribeTokenTrade' || m.method === 'subscribeAccountTrade') ws.send(JSON.stringify(misc.tradeStreamsRefused));
      });
    });
    const warnings: string[] = [];
    const { c } = client(feed.url, { tradeRetryMs: 800, log: { warn: (l: string) => warnings.push(l), info: () => {} } });
    c.subscribeTokenTrades(['mintA']);
    c.setAccounts(['walletA']);
    c.start();
    await until(() => c.diag.tradeStreams === 'refused');
    const sent = () => feed.received.filter((m) => m.method !== 'subscribeNewToken' && m.method !== 'subscribeMigration');
    await new Promise((r) => setTimeout(r, 60));
    const afterRefusal = sent().length;
    // new launches keep coming: none of them is sent while the streams are refused
    c.subscribeTokenTrades(['mintB']);
    c.subscribeTokenTrades(['mintC']);
    c.unsubscribeTokenTrades(['mintA']);
    await new Promise((r) => setTimeout(r, 120));
    expect(sent()).toHaveLength(afterRefusal);
    expect(warnings.filter((w) => w.includes('trade streams refused'))).toHaveLength(1);
    expect(warnings[0]).toContain('PUMPPORTAL_API_KEY');
    // the retry sends the whole wanted set again (and is refused again)
    await until(() => sent().length > afterRefusal, 4000);
    expect(sent().slice(afterRefusal)).toContainEqual({ method: 'subscribeTokenTrade', keys: ['mintB', 'mintC'] });
    expect(c.trackedTokens).toBe(2);
  });

  it('a refused connection tries the trade streams again after a reconnect, and a trade marks them active', async () => {
    const feed = await fakeFeed();
    let refuse = true;
    feed.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw)) as { method: string };
        if (m.method === 'subscribeTokenTrade' && refuse) ws.send(JSON.stringify(misc.tradeStreamsRefused));
      });
    });
    const { c } = client(feed.url, { tradeRetryMs: 60_000 });
    c.subscribeTokenTrades(['mintA']);
    c.start();
    await until(() => c.diag.tradeStreams === 'refused');
    refuse = false; // the key got funded
    feed.sockets[0].terminate();
    await until(() => feed.sockets.length === 2 && feed.received.filter((m) => m.method === 'subscribeTokenTrade').length === 2);
    feed.sockets[1].send(JSON.stringify(lifecycle[2]));
    await until(() => c.diag.tradeStreams === 'active');
  });

  it('reconnects with backoff after the server drops it and re-sends every subscription', async () => {
    const feed = await fakeFeed();
    const { c, states } = client(feed.url);
    c.subscribeTokenTrades(['mintA', 'mintB']);
    c.setAccounts(['walletA']);
    c.start();
    await until(() => feed.received.length >= 4);
    feed.sockets[0].terminate();
    await until(() => feed.sockets.length === 2 && feed.received.length >= 8);
    expect(feed.received.slice(4)).toEqual([
      { method: 'subscribeNewToken' },
      { method: 'subscribeMigration' },
      { method: 'subscribeTokenTrade', keys: ['mintA', 'mintB'] },
      { method: 'subscribeAccountTrade', keys: ['walletA'] },
    ]);
    expect(states).toEqual([true, false, true]);
    expect(c.diag.connects).toBe(2);
    expect(c.diag.disconnects).toBe(1);
  });

  it('keeps retrying while the server is down and connects once it is back', async () => {
    const feed = await fakeFeed();
    const port = (feed.wss.address() as AddressInfo).port;
    await new Promise<void>((resolve) => feed.wss.close(() => resolve()));
    servers.splice(servers.indexOf(feed.wss), 1);
    const { c } = client(`ws://127.0.0.1:${port}/api/data`);
    c.subscribeTokenTrades(['mintA']);
    c.start();
    await new Promise((r) => setTimeout(r, 150));
    expect(c.connected).toBe(false);
    const back = new WebSocketServer({ port, host: '127.0.0.1' });
    servers.push(back);
    const received: unknown[] = [];
    back.on('connection', (ws) => ws.on('message', (raw) => received.push(JSON.parse(String(raw)))));
    await until(() => received.length >= 3, 5000);
    expect(received).toContainEqual({ method: 'subscribeTokenTrade', keys: ['mintA'] });
    expect(c.connected).toBe(true);
  });

  it('keeps backing off when the server accepts and drops it at once (no reconnect storm)', async () => {
    const feed = await fakeFeed();
    feed.wss.on('connection', (ws) => ws.terminate());
    const { c } = client(feed.url, { backoffBaseMs: 20, backoffMaxMs: 10_000 });
    c.start();
    await new Promise((r) => setTimeout(r, 700));
    // 10-20, 20-40, 40-80, 80-160, 160-320 ms ... about five attempts in 700 ms, not dozens
    expect(feed.sockets.length).toBeGreaterThanOrEqual(3);
    expect(feed.sockets.length).toBeLessThanOrEqual(7);
  });

  it('treats a silent connection (no frames, no pongs) as dead and reconnects', async () => {
    const feed = await fakeFeed({ autoPong: false });
    const { c } = client(feed.url, { pingEveryMs: 40, staleMs: 120 });
    c.start();
    // (wait on the client's own count: the server sees the new socket before the client's 'open')
    await until(() => feed.sockets.length >= 2 && c.diag.connects >= 2, 5000);
    expect(c.diag.disconnects).toBeGreaterThanOrEqual(1);
  });

  it('stays connected while pongs arrive, even without data', async () => {
    const feed = await fakeFeed();
    const { c } = client(feed.url, { pingEveryMs: 30, staleMs: 120 });
    c.start();
    await until(() => c.connected);
    await new Promise((r) => setTimeout(r, 400));
    expect(feed.sockets).toHaveLength(1);
    expect(c.connected).toBe(true);
  });

  it('sends the API key in the socket URL only', async () => {
    const feed = await fakeFeed();
    const { c } = client(feed.url, { apiKey: 'k3y/with+chars' });
    c.start();
    await until(() => feed.urls.length === 1);
    expect(feed.urls[0]).toBe('/api/data?api-key=k3y%2Fwith%2Bchars');
    expect(JSON.stringify(feed.received)).not.toContain('k3y');
  });

  it('backs off exponentially with jitter, capped', () => {
    const lo = new PumpPortalClient({ url: 'ws://x', onEvent: () => {}, backoffBaseMs: 1000, backoffMaxMs: 60_000, random: () => 0 });
    const hi = new PumpPortalClient({ url: 'ws://x', onEvent: () => {}, backoffBaseMs: 1000, backoffMaxMs: 60_000, random: () => 1 });
    expect([0, 1, 2, 3].map((a) => lo.backoffDelay(a))).toEqual([500, 1000, 2000, 4000]);
    expect([0, 1, 2, 3].map((a) => hi.backoffDelay(a))).toEqual([1000, 2000, 4000, 8000]);
    expect(hi.backoffDelay(30)).toBe(60_000);
    expect(lo.backoffDelay(30)).toBe(30_000);
  });
});
