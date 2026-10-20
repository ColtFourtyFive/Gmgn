// The whole live ingestion path through buildApp in live mode: a local 'ws'
// server stands in for PumpPortal (PUMPPORTAL_WS_URL), fetch is stubbed for
// Jupiter prices and token metadata, DNS answers a public address. Launches and
// trades must reach /api/sol/trenches and /api/sol/tokens, the curve must
// complete and migrate, /api/meta must report the live status and counters,
// and unseen wallets / KOL labels must resolve. No external host is contacted.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import type { MetaResponse, TokenDetail, Trade, TrenchesSnapshot, WalletProfile } from '@trenchscope/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { DEFAULT_IPFS_GATEWAYS, loadLiveConfig } from '../src/live/config';
import type { LiveMarket } from '../src/live/market';

vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));
// The metadata transport (connect-time address pinning over node:https) goes through the stubbed fetch.
vi.mock('../src/live/enrich/transport', () => ({ pinnedFetch: () => (input: string | URL | Request, init?: RequestInit) => globalThis.fetch(input, init) }));

const FIX = join(__dirname, 'fixtures', 'pumpportal');
const lifecycle = JSON.parse(readFileSync(join(FIX, 'lifecycle.json'), 'utf8')) as Record<string, unknown>[];
const misc = JSON.parse(readFileSync(join(FIX, 'misc.json'), 'utf8')) as { createCat: Record<string, unknown>; wallets: { DEV: string; A: string; B: string; MINT: string; MINT2: string } };
const { MINT, MINT2, A } = misc.wallets;
// What pump.fun metadata names (a retired public gateway), and where the image is served from: the first configured gateway.
const IMAGE_CID = 'bafybeihkwbffktou5ieivkg4r3s6bulv6ee545mj22blyvdm4hz4j63kwq';
const IMAGE = `https://ipfs.io/ipfs/${IMAGE_CID}`;
const IMAGE_SHOWN = `${DEFAULT_IPFS_GATEWAYS.split(',')[0]}${IMAGE_CID}`;
const KOL = Keypair.generate().publicKey.toBase58();

let wss: WebSocketServer;
let feedSocket: WebSocket | null = null;
const received: { method: string; keys?: string[] }[] = [];
let built: BuiltApp;
let dir: string;
const fetched: string[] = [];

async function until<T>(fn: () => T | Promise<T>, ok: (v: T) => boolean, ms = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() - start > ms) throw new Error(`timed out; last value: ${JSON.stringify(v)?.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const get = async <T>(url: string): Promise<{ status: number; body: T }> => {
  const res = await built.app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() as T };
};

beforeAll(async () => {
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  wss.on('connection', (ws) => {
    feedSocket = ws;
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))));
  });
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    fetched.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.startsWith('http://jupiter.test/price/v3')) return json({ So11111111111111111111111111111111111111112: { usdPrice: 187.5, decimals: 9, liquidity: 1e9, priceChange24h: 1.2 } });
    if (url.includes('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')) return json({ name: 'Ribbit Frog', description: 'the frog that ribbits', image: IMAGE, twitter: '@ribbit_sol', website: 'https://ribbit.fun' });
    return new Response('not found', { status: 404 });
  });
  dir = mkdtempSync(join(tmpdir(), 'trenchscope-live-'));
  const kolFile = join(dir, 'kols.json');
  writeFileSync(kolFile, JSON.stringify([{ address: KOL, name: 'Alpha Caller', twitter: '@alpha' }]));
  process.env.LIVE_KOL_FILE = kolFile;
  const live = loadLiveConfig({ PUMPPORTAL_WS_URL: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/api/data`, JUPITER_API_URL: 'http://jupiter.test' });
  built = await buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: live.problems, warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), { start: true, persist: false });
  delete process.env.LIVE_KOL_FILE;
  await until(() => received.length, (n) => n >= 2);
});

afterAll(async () => {
  await built?.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

const send = (frames: Record<string, unknown>[]) => {
  for (const f of frames) feedSocket!.send(JSON.stringify(f));
};

describe('live ingestion through the app', () => {
  it('connects one feed socket with the always-on subscriptions and streams KOL wallets', async () => {
    expect(wss.clients.size).toBe(1);
    expect(received.slice(0, 2)).toEqual([{ method: 'subscribeNewToken' }, { method: 'subscribeMigration' }]);
    await until(() => received, (r) => r.some((m) => m.method === 'subscribeAccountTrade' && m.keys?.includes(KOL)));
    const meta = await until(() => get<MetaResponse>('/api/meta'), (r) => r.body.live?.feedConnected === true);
    expect(meta.body.mode).toBe('live');
    expect(meta.body.enabledChains).toEqual(['sol']);
    expect(meta.body.live).toMatchObject({ feedConnected: true, rpcHealthy: false, signer: 'none', tradingEnabled: false });
  });

  it('takes SOL/USD from Jupiter', async () => {
    const meta = await until(() => get<MetaResponse>('/api/meta'), (r) => r.body.chains[0].nativeUsd === 187.5);
    expect(meta.body.chains[0].nativeChange24h).toBe(0);
  });

  it('puts a launch and its trades on /api/sol/trenches and /api/sol/tokens, and streams its trades', async () => {
    send(lifecycle.slice(0, 3)); // ack, create, a buy
    const trenches = await until(() => get<TrenchesSnapshot>('/api/sol/trenches'), (r) => r.body.new.some((t) => t.address === MINT && t.holderCount >= 2));
    const row = trenches.body.new.find((t) => t.address === MINT)!;
    expect(row).toMatchObject({ symbol: 'RIBBIT', name: 'Ribbit Frog', launchpad: 'pump', status: 'curve', narrative: 'Frogs' });
    expect(row.priceUsd).toBeCloseTo((31.5 / 1021904761.904762) * 187.5, 12);
    const detail = await get<TokenDetail>(`/api/sol/tokens/${MINT}`);
    expect(detail.status).toBe(200);
    expect(detail.body.curve?.virtualNative).toBeCloseTo(31.5, 9);
    const trades = await get<Trade[]>(`/api/sol/tokens/${MINT}/trades`);
    expect(trades.body.map((t) => [t.side, t.wallet])).toEqual([
      ['buy', A],
      ['buy', misc.wallets.DEV],
    ]);
    await until(() => received, (r) => r.some((m) => m.method === 'subscribeTokenTrade' && m.keys?.includes(MINT)));
  });

  it('enriches the launch from its metadata: image, description, socials', async () => {
    const detail = await until(() => get<TokenDetail>(`/api/sol/tokens/${MINT}`), (r) => r.body.imageUrl === IMAGE_SHOWN);
    expect(detail.body.description).toBe('the frog that ribbits');
    expect(detail.body.socials).toEqual({ twitter: 'https://x.com/ribbit_sol', website: 'https://ribbit.fun/' });
    const trenches = await get<TrenchesSnapshot>('/api/sol/trenches');
    expect(trenches.body.new.find((t) => t.address === MINT)?.imageUrl).toBe(IMAGE_SHOWN);
  });

  it('follows the curve to completion and migration, then PumpSwap trades; meta counts both', async () => {
    send(lifecycle.slice(3));
    const detail = await until(() => get<TokenDetail>(`/api/sol/tokens/${MINT}`), (r) => r.body.status === 'migrated' && (r.body.pool?.tokenReserve ?? 0) > 0 && r.body.priceNative > 4e-7);
    expect(detail.body.pool).toMatchObject({ dex: 'PumpSwap', lpBurnedRate: 1 });
    expect(detail.body.priceNative).toBeCloseTo(1 / 2_400_000, 12);
    const trades = await get<Trade[]>(`/api/sol/tokens/${MINT}/trades`);
    expect(trades.body).toHaveLength(5);
    const meta = await get<MetaResponse>('/api/meta');
    expect(meta.body.chains[0]).toMatchObject({ launches1h: 1, migrations1h: 1 });
    expect(meta.body.live?.trackedTokens).toBeGreaterThanOrEqual(1);
    expect(meta.body.live?.lastEventAt).toBeGreaterThan(0);
    const migrated = await get<TrenchesSnapshot>('/api/sol/trenches');
    expect(migrated.body.migrated.some((t) => t.address === MINT)).toBe(true);
  });

  it('ignores replayed and malformed frames', async () => {
    const before = (await get<Trade[]>(`/api/sol/tokens/${MINT}/trades`)).body.length;
    send(lifecycle);
    feedSocket!.send('{"txType":"buy"');
    feedSocket!.send(JSON.stringify(misc.createCat));
    await until(() => get<TokenDetail>(`/api/sol/tokens/${MINT2}`), (r) => r.status === 200);
    expect((await get<Trade[]>(`/api/sol/tokens/${MINT}/trades`)).body.length).toBe(before);
    const diag = (built.market as LiveMarket).diagnostics();
    expect(diag.feed?.malformed).toBe(1);
    expect(diag.ingest.duplicates).toBeGreaterThanOrEqual(6);
  });

  it('404s an unknown mint without an RPC, and resolves an unseen wallet address as an observed wallet', async () => {
    const unknown = Keypair.generate().publicKey.toBase58();
    expect((await get(`/api/sol/tokens/${unknown}`)).status).toBe(404);
    expect((await get(`/api/sol/tokens/not-an-address`)).status).toBe(404);
    const wallet = await get<WalletProfile>(`/api/sol/wallets/${unknown}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.address).toBe(unknown);
    expect((await get(`/api/sol/wallets/${MINT}`)).status).toBe(404);
    expect((await get(`/api/sol/wallets/0xabc`)).status).toBe(404);
  });

  it('finds the KOL by label in search and tags it', async () => {
    const res = await get<{ wallets: { address: string; label: string | null; tags: string[] }[] }>('/api/search?q=Alpha');
    expect(res.body.wallets[0]).toMatchObject({ address: KOL, label: 'Alpha Caller' });
    expect(res.body.wallets[0].tags).toContain('kol');
  });

  it('streams the trades of wallets accounts follow', async () => {
    const followed = Keypair.generate().publicKey.toBase58();
    const accounts = built.ctx.accounts;
    const original = accounts.watchedWallets.bind(accounts);
    accounts.watchedWallets = (chain) => new Set([...original(chain), followed]);
    (built.market as LiveMarket).refreshAccounts();
    await until(() => received, (r) => r.some((m) => m.method === 'subscribeAccountTrade' && m.keys?.includes(followed)));
    accounts.watchedWallets = original;
  });

  it('never fetched anything but the stubbed Jupiter and metadata URLs', () => {
    for (const url of fetched) expect(url.startsWith('http://jupiter.test/') || DEFAULT_IPFS_GATEWAYS.split(',').some((g) => url.startsWith(g)), url).toBe(true);
  });
});
