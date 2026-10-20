// Live mode end to end across the four live modules, with nothing mocked inside
// the app: config from env (LOCAL_KEYSTORE_KEY -> the local-dev signer, no RPC),
// the dev fake PumpPortal feed (scripts/fake-pumpportal.ts) on a local socket,
// the durable store on disk. Registration provisions an embedded wallet whose
// address is the account's World wallet, feed launches / trades / migrations
// reach REST and the token channel, a feed trade by the user's own wallet lands
// on the account's position, sockets refuse chains live mode does not serve, and
// after a restart the account, its wallet and its signing key are all back.

import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import type { AuthResponse, MetaResponse, PortfolioSummary, TokenDetail, Trade, TrenchesSnapshot } from '@trenchscope/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { startFakePumpPortal, type FakePumpPortal } from '../scripts/fake-pumpportal';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { loadLiveConfig } from '../src/live/config';
import { STORE_FILE } from '../src/store';

const KEYSTORE_KEY = '7a'.repeat(32);
const SECRETS_KEY = '3c'.repeat(32);
const PASSWORD = 'correct horse battery';

let feed: FakePumpPortal;
let built: BuiltApp;
let dir: string;

async function until<T>(fn: () => T | Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() - start > ms) throw new Error(`timed out; last value: ${JSON.stringify(v)?.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function liveApp(): Promise<BuiltApp> {
  const live = loadLiveConfig({
    LOCAL_KEYSTORE_KEY: KEYSTORE_KEY,
    SECRETS_KEY,
    PUMPPORTAL_WS_URL: feed.url,
    JUPITER_API_URL: 'http://jupiter.test',
  });
  return buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: live.problems, warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), {
    start: true,
    persist: false,
    storePath: join(dir, STORE_FILE),
  });
}

const get = async <T>(url: string, token?: string): Promise<{ status: number; body: T }> => {
  const res = await built.app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json() as T };
};
const post = async <T>(url: string, body: unknown, token?: string): Promise<{ status: number; body: T }> => {
  const res = await built.app.inject({ method: 'POST', url, payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json() as T };
};

/** A recorded-format pump.fun buy of `sol` on the token's current curve by `trader`. */
function curveBuyFrame(mint: string, trader: string, sol: number): Record<string, unknown> & { tokenAmount: number } {
  const t = built.ctx.world.getToken(mint)!;
  const vSol = t.curve!.virtualNative + sol;
  const vTokens = (t.curve!.virtualNative * t.curve!.virtualTokens) / vSol;
  const tokenAmount = t.curve!.virtualTokens - vTokens;
  return {
    signature: bs58.encode(randomBytes(64)),
    mint,
    traderPublicKey: trader,
    txType: 'buy',
    tokenAmount,
    solAmount: sol,
    newTokenBalance: tokenAmount,
    vSolInBondingCurve: vSol,
    vTokensInBondingCurve: vTokens,
    pool: 'pump',
  };
}

/** A curve token of the World whose trades the server has subscribed to on the feed. */
async function streamedCurveToken(): Promise<string> {
  const pick = () => [...built.ctx.world.tokens.values()].find((t) => t.status === 'curve' && t.launchpad === 'pump' && feed.subscribers(t.address) > 0)?.address;
  return until(pick, (m) => !!m) as Promise<string>;
}

/** Tick the fake feed until `ok` holds (the app applies feed events on its engine ticks). */
async function feedUntil<T>(fn: () => T | Promise<T>, ok: (v: T) => boolean, maxTicks = 600): Promise<T> {
  for (let i = 0; i < maxTicks; i++) {
    const v = await fn();
    if (ok(v)) return v;
    feed.tick();
    await new Promise((r) => setTimeout(r, 5));
  }
  return until(fn, ok);
}

beforeAll(async () => {
  // Nothing may leave the machine: Jupiter prices and metadata answer "offline".
  vi.stubGlobal('fetch', async () => new Response('offline', { status: 503 }));
  dir = mkdtempSync(join(tmpdir(), 'trenchscope-live-int-'));
  // Driven by tick() only (no timer firing during the test), no metadata URIs to fetch.
  feed = await startFakePumpPortal({ intervalMs: 3_600_000, seed: 'integration', noUri: true, maxTokens: 6 });
  built = await liveApp();
  await until(() => get<MetaResponse>('/api/meta'), (r) => r.body.live?.feedConnected === true);
});

afterAll(async () => {
  await built?.close();
  await feed?.close();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

let auth: AuthResponse;

describe('live mode across ingest, wallets, store and accounts', () => {
  it('reports its configuration problems and the local-dev signer in /api/meta', async () => {
    const meta = await get<MetaResponse>('/api/meta');
    expect(meta.body.mode).toBe('live');
    expect(meta.body.live).toMatchObject({ signer: 'local-dev', rpcHealthy: false, tradingEnabled: false });
    expect(meta.body.live?.problems?.some((p) => p.startsWith('SOLANA_RPC_URL is not set'))).toBe(true);
    // The signer and SECRETS_KEY are configured: neither is reported.
    expect(meta.body.live?.problems?.some((p) => /signer|SECRETS_KEY/.test(p))).toBe(false);
  });

  it('reports a malformed fee wallet at boot instead of only on every trade', () => {
    const bad = loadLiveConfig({ FEE_WALLET_ADDRESS: 'not-a-wallet' });
    expect(bad.problems.some((p) => p.startsWith('FEE_WALLET_ADDRESS is not a valid Solana address'))).toBe(true);
    const good = loadLiveConfig({ FEE_WALLET_ADDRESS: Keypair.generate().publicKey.toBase58() });
    expect(good.problems.some((p) => p.includes('FEE_WALLET_ADDRESS'))).toBe(false);
    expect(loadLiveConfig({ FEE_WALLET_ADDRESS: 'not-a-wallet', PLATFORM_FEE_BPS: '0' }).problems.some((p) => p.includes('FEE_WALLET_ADDRESS'))).toBe(false);
  });

  it('refuses guests, other chains and the demo-only launch config', async () => {
    expect((await post('/api/auth/guest', {})).status).toBe(403);
    expect(await get('/api/eth/trenches')).toMatchObject({ status: 400, body: { code: 'chain_not_enabled' } });
    expect(await get('/api/launch/config')).toMatchObject({ status: 403, body: { code: 'not_available_in_live' } });
  });

  it('registers with an embedded wallet that is the account World wallet', async () => {
    const res = await post<AuthResponse>('/api/auth/register', { username: 'trader01', password: PASSWORD });
    expect(res.status).toBe(200);
    auth = res.body;
    const { ctx } = built;
    const ref = ctx.accounts.walletRef(auth.account.id, 'sol')!;
    expect(ref).toMatchObject({ chain: 'sol', provider: 'local-dev' });
    expect(Object.keys(auth.account.wallets)).toEqual(['sol']);
    expect(auth.account.wallets.sol?.address).toBe(ref.address);
    const wallet = ctx.world.getWallet(ref.address)!;
    expect(wallet).toMatchObject({ archetype: 'user', accountId: auth.account.id, native: 0 });
    expect(ctx.accounts.walletFor(auth.account.id, 'sol')).toBe(wallet);
    expect(ctx.accounts.accountIdForWallet(ref.address)).toBe(auth.account.id);
    const deposit = await get<{ address: string }>('/api/wallet/deposit', auth.token);
    expect(deposit).toMatchObject({ status: 200, body: { address: ref.address } });
  });

  it('streams fake-feed launches and trades into /api/sol/trenches and token detail', async () => {
    const trenches = await feedUntil(
      () => get<TrenchesSnapshot>('/api/sol/trenches'),
      (r) => [...r.body.new, ...r.body.almost].filter((t) => t.launchpad === 'pump').length >= 3,
    );
    expect(trenches.body.chain).toBe('sol');
    const mint = await streamedCurveToken();
    const detail = await get<TokenDetail>(`/api/sol/tokens/${mint}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ chain: 'sol', launchpad: 'pump', status: 'curve', decimals: 6 });
    const frame = curveBuyFrame(mint, Keypair.generate().publicKey.toBase58(), 0.3);
    feed.emit(frame);
    const trades = await until(() => get<Trade[]>(`/api/sol/tokens/${mint}/trades`), (r) => r.body.some((t) => t.txHash === frame.signature));
    expect(trades.body.find((t) => t.txHash === frame.signature)).toMatchObject({ chain: 'sol', side: 'buy', nativeAmount: 0.3 });
    expect(trades.body.every((t) => t.txHash && t.chain === 'sol')).toBe(true);
  }, 20_000);

  it('completes and migrates curves the feed migrates', async () => {
    const meta = await feedUntil(() => get<MetaResponse>('/api/meta'), (r) => r.body.chains[0].migrations1h >= 1, 3000);
    expect(meta.body.chains[0].launches1h).toBeGreaterThanOrEqual(3);
    const migrated = [...built.ctx.world.tokens.values()].filter((t) => t.status === 'migrated');
    expect(migrated.length).toBeGreaterThanOrEqual(1);
    for (const t of migrated) expect(t.pool).toMatchObject({ dex: 'PumpSwap', lpBurnedRate: 1 });
  }, 30_000);

  it('delivers the token channel over a real socket and refuses chains it does not serve', async () => {
    const address = await built.app.listen({ port: 0, host: '127.0.0.1' });
    const ws = new WebSocket(`${address.replace('http', 'ws')}/ws`);
    const frames: { op: string; ch?: string; type?: string; message?: string; data?: unknown }[] = [];
    ws.on('message', (raw) => frames.push(JSON.parse(String(raw))));
    await new Promise((resolve) => ws.once('open', resolve));
    const mint = await streamedCurveToken();
    ws.send(JSON.stringify({ op: 'sub', ch: `token:sol:${mint}` }));
    ws.send(JSON.stringify({ op: 'sub', ch: 'trenches:eth' }));
    await until(() => frames, (f) => f.some((m) => m.op === 'ack' && m.ch === `token:sol:${mint}`) && f.some((m) => m.ch === 'trenches:eth'));
    expect(frames.find((m) => m.ch === 'trenches:eth')).toMatchObject({ op: 'error', message: expect.stringContaining('chain_not_enabled') });
    expect(frames.some((m) => m.op === 'ack' && m.ch === 'trenches:eth')).toBe(false);
    // A trade of the subscribed token reaches the channel as it streams in.
    const frame = curveBuyFrame(mint, Keypair.generate().publicKey.toBase58(), 0.25);
    feed.emit(frame);
    await until(
      () => frames,
      (f) => f.some((m) => m.ch === `token:sol:${mint}` && m.type === 'trades' && (m.data as Trade[]).some((t) => t.txHash === frame.signature)),
    );
    ws.close();
  }, 15_000);

  it('books a feed trade by the user embedded wallet onto the account position', async () => {
    const userAddress = auth.account.wallets.sol!.address;
    const mint = await streamedCurveToken();
    // A buy the user's wallet signed elsewhere arrives on the feed like any trade of a streamed token.
    const frame = curveBuyFrame(mint, userAddress, 0.5);
    feed.emit(frame);
    const portfolio = await until(
      () => get<PortfolioSummary>('/api/portfolio?chain=sol', auth.token),
      (r) => r.body.positions?.some((p) => p.token === mint),
    );
    const pos = portfolio.body.positions.find((p) => p.token === mint)!;
    expect(pos.balance).toBeCloseTo(frame.tokenAmount, 3);
    expect(pos.wallet).toBe(userAddress);
  }, 15_000);

  it('restores the account, its World wallet and its signing key after a restart', async () => {
    const before = built.ctx.accounts.walletRef(auth.account.id, 'sol')!;
    await built.close();
    built = await liveApp();
    const login = await post<AuthResponse>('/api/auth/login', { username: 'trader01', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.account.wallets.sol?.address).toBe(before.address);
    const ref = built.ctx.accounts.walletRef(login.body.account.id, 'sol')!;
    expect(ref).toEqual(before);
    expect(built.ctx.world.getWallet(ref.address)).toMatchObject({ archetype: 'user', accountId: login.body.account.id });
    // The keystore reloads with the same key: the restored wallet still signs.
    const owner = new PublicKey(ref.address);
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [SystemProgram.transfer({ fromPubkey: owner, toPubkey: Keypair.generate().publicKey, lamports: 1 })],
    }).compileToV0Message();
    const signed = await built.ctx.live!.signer!.signTransaction(ref, new VersionedTransaction(message));
    expect(signed.signatures[0].some((b) => b !== 0)).toBe(true);
  });
});
