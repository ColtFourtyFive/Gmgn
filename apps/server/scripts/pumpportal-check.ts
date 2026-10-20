// Live feed check (read-only: no wallets, nothing signed or sent). Boots the
// server in live mode against the real PumpPortal feed and a Solana RPC for a
// while, then prints what the feed put in the World (launches, launch checks,
// trades, migrations, trade-stream state) and compares sample tokens' analytics
// (progress, market cap, holders) with their bonding curve / PumpSwap pool and
// largest holders on-chain.
//
// Usage (from apps/server):
//   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com npx tsx scripts/pumpportal-check.ts \
//     [--seconds 120] [--samples 3] [--capture frames.jsonl] [--check-rpc https://...]
// --check-rpc: a second RPC for the comparison reads (public RPCs rate-limit getTokenLargestAccounts
// hard; the server's own budget keeps using SOLANA_RPC_URL).
// PUMPPORTAL_API_KEY (funded with >= 0.02 SOL) also streams the launches' trades: without one,
// tokens stay at their launch state while the chain moves on, which the comparison shows.
// --capture writes every raw frame (JSON lines) for fixtures.

import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Connection, PublicKey, type ParsedAccountData } from '@solana/web3.js';
import type { TokenDetail } from '@trenchscope/shared';
import { buildApp, defaultConfig } from '../src/app';
import { loadLiveConfig } from '../src/live/config';
import { loadPumpSdk, readPumpPool } from '../src/live/enrich/onchain';
import { PUMP, PUMP_VIRTUAL_TOKEN_OFFSET } from '../src/live/feed/ingest';
import type { LiveMarket } from '../src/live/market';
import type { TokenState } from '../src/sim/world';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const seconds = Number(arg('seconds', '120'));
const samples = Number(arg('samples', '3'));
const capture = arg('capture', '');
const fmt = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
const pct = (a: number, b: number) => (b !== 0 ? `${(((a - b) / b) * 100).toFixed(2)}%` : 'n/a');

interface ChainView {
  status: 'curve' | 'complete' | 'migrated' | 'missing';
  quoteMint: string;
  priceNative: number;
  progress: number;
  supply: number;
  /** Holders (curve / pool vaults excluded; at most 20 seen when only the largest accounts could be read); null when the read failed. */
  holders: number | null;
  holdersCapped: boolean;
  /** Successful transactions on the curve (null when the RPC refused the indexed read). */
  curveTxs: number | null;
}

/** Public RPCs throttle per method: a few slow attempts, then null. */
async function patiently<T>(fn: () => Promise<T>, attempts = 4, delayMs = 3000): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/403|personal token|not supported|-32601/.test(msg)) return null; // refused for good
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return null;
}

/**
 * Every holder of the mint (token accounts with a balance, the curve's and pool's vaults excluded),
 * from getProgramAccounts of the mint's token program; else the 20 largest accounts.
 */
async function chainHolders(connection: Connection, key: PublicKey, vaults: Set<string>): Promise<{ holders: number; capped: boolean } | null> {
  const mintInfo = await patiently(() => connection.getAccountInfo(key, 'confirmed'));
  if (mintInfo) {
    const accounts = await patiently(() => connection.getParsedProgramAccounts(mintInfo.owner, { commitment: 'confirmed', filters: [{ memcmp: { offset: 0, bytes: key.toBase58() } }] }), 2);
    if (accounts) {
      let holders = 0;
      for (const a of accounts) {
        const info = (a.account.data as ParsedAccountData).parsed?.info as { owner?: string; tokenAmount?: { amount?: string } } | undefined;
        if (info?.owner && !vaults.has(info.owner) && info.tokenAmount?.amount && info.tokenAmount.amount !== '0') holders++;
      }
      return { holders, capped: false };
    }
  }
  return largestHolders(connection, key, vaults);
}

/** Holders among the largest token accounts, without the curve's and pool's vaults. */
async function largestHolders(connection: Connection, key: PublicKey, vaults: Set<string>): Promise<{ holders: number; capped: boolean } | null> {
  const largest = await patiently(() => connection.getTokenLargestAccounts(key, 'confirmed'));
  if (!largest) return null;
  const nonZero = largest.value.filter((a) => Number(a.amount) > 0);
  let holders = 0;
  for (let i = 0; i < nonZero.length; i += 10) {
    const owners = await patiently(() => connection.getMultipleParsedAccounts(nonZero.slice(i, i + 10).map((a) => a.address), { commitment: 'confirmed' }));
    if (!owners) return null;
    for (const acc of owners.value) {
      const owner = (acc?.data as ParsedAccountData | undefined)?.parsed?.info?.owner as string | undefined;
      if (owner && !vaults.has(owner)) holders++;
    }
  }
  return { holders, capped: largest.value.length >= 20 };
}

async function chainView(connection: Connection, mint: string): Promise<ChainView> {
  const sdk = loadPumpSdk();
  if (!sdk) throw new Error('pump SDK unavailable');
  const key = new PublicKey(mint);
  const curveKey = sdk.bondingCurvePda(key);
  const poolKey = sdk.canonicalPumpPoolPda(key);
  // One read at a time: public RPCs rate-limit bursts.
  const info = await connection.getAccountInfo(curveKey, 'confirmed');
  const supplyRes = await connection.getTokenSupply(key, 'confirmed');
  const sigs = await patiently(() => connection.getSignaturesForAddress(curveKey, { limit: 1000 }, 'confirmed'));
  const top = await chainHolders(connection, key, new Set([curveKey.toBase58(), poolKey.toBase58()]));
  const supply = Number(supplyRes.value.uiAmountString ?? supplyRes.value.uiAmount ?? 0);
  const curve = info ? sdk.PUMP_SDK.decodeBondingCurveNullable(info) : null;
  const base = { supply, holders: top?.holders ?? null, holdersCapped: top?.capped ?? false, curveTxs: sigs ? sigs.filter((s) => !s.err).length : null };
  if (!curve) return { ...base, status: 'missing', quoteMint: '?', priceNative: 0, progress: 0 };
  const quoteMint = curve.quoteMint?.toBase58() ?? PublicKey.default.toBase58();
  if (curve.complete) {
    const pool = await readPumpPool(connection, key, (fn) => fn());
    return { ...base, status: pool ? 'migrated' : 'complete', quoteMint, priceNative: pool ? pool.native / pool.tokens : 0, progress: 1 };
  }
  const vSol = Number(curve.virtualQuoteReserves.toString()) / 1e9;
  const vTok = Number(curve.virtualTokenReserves.toString()) / 1e6;
  const realTokens = vTok - PUMP_VIRTUAL_TOKEN_OFFSET;
  return { ...base, status: 'curve', quoteMint, priceNative: vSol / vTok, progress: Math.min(1, Math.max(0, 1 - realTokens / PUMP.curveTokens)) };
}

/** A migrated and a mayhem launch when there are some, then the newest (least time for the chain to move on). */
function pickSamples(tokens: TokenState[], n: number): TokenState[] {
  const out: TokenState[] = [];
  const newest = [...tokens].sort((a, b) => b.createdAt - a.createdAt);
  const take = (t: TokenState | undefined) => {
    if (t && !out.includes(t) && out.length < n) out.push(t);
  };
  take(newest.find((t) => t.status === 'migrated'));
  take(newest.find((t) => t.totalSupply > PUMP.totalSupply));
  take(newest.find((t) => t.tradeCount > 0));
  for (const t of newest) take(t);
  return out;
}

async function main(): Promise<void> {
  if (!process.env.SOLANA_RPC_URL) console.warn('[check] SOLANA_RPC_URL is not set: launches pass unverified and nothing is compared with the chain');
  const dataDir = mkdtempSync(join(tmpdir(), 'pumpportal-check-'));
  if (capture) writeFileSync(capture, '');
  const live = loadLiveConfig({ ...process.env, MODE: 'live' });
  const built = await buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: [], warmupMinutes: 0, snapshotEveryMs: 0, dataDir }), {
    start: true,
    persist: false,
    storePath: ':memory:',
  });
  const market = built.market as LiveMarket;
  const { world } = built.ctx;
  if (capture) market.tapFeed((text) => appendFileSync(capture, `${JSON.stringify({ t: Date.now(), frame: text })}\n`));
  const startedAt = world.now;
  const started = Date.now();
  const line = () => {
    const d = market.diagnostics();
    const sol = world.tokensByChain.sol.map((a) => world.tokens.get(a)!).filter(Boolean);
    const trades = sol.reduce((s, t) => s + t.tradeCount, 0);
    return `${Math.round((Date.now() - started) / 1000)}s feed=${market.liveStatus().feedConnected ? 'up' : 'down'} creates=${d.feed?.creates ?? 0} verified=${d.verify.verified} rejected=${d.verify.rejected} unverified=${d.verify.unverified} tokens=${sol.length} trades=${trades} migrations=${d.ingest.migrations} tradeStreams=${d.feed?.tradeStreams}`;
  };
  const timer = setInterval(() => console.log(`[check] ${line()}`), 15_000);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  clearInterval(timer);

  const d = market.diagnostics();
  const tokens = world.tokensByChain.sol.map((a) => world.tokens.get(a)!).filter((t) => t && t.createdAt >= startedAt);
  console.log('\n=== feed ===');
  console.log(line());
  console.log(JSON.stringify({ feed: d.feed, verify: d.verify, ingest: d.ingest, poolReads: d.poolReads, rpc: d.rpc, solUsd: world.nativeUsd('sol') }, null, 2));
  console.log(`launches in the World: ${tokens.length} (mayhem ${tokens.filter((t) => t.totalSupply > PUMP.totalSupply).length}, migrated ${tokens.filter((t) => t.status === 'migrated').length}, with a dev buy ${tokens.filter((t) => t.tradeCount > 0).length})`);
  console.log(`trades booked: ${tokens.reduce((s, t) => s + t.tradeCount, 0)}; migrations: ${d.ingest.migrations}`);

  const checkRpc = arg('check-rpc', '');
  const connection = checkRpc ? new Connection(checkRpc, 'confirmed') : (built.ctx.live?.connection ?? null);
  console.log('\n=== samples: analytics vs chain ===');
  for (const t of pickSamples(tokens, samples)) {
    const res = await built.app.inject({ method: 'GET', url: `/api/sol/tokens/${t.address}` });
    const detail = res.json() as TokenDetail;
    const mcapSol = detail.priceNative * detail.totalSupply;
    console.log(`\n${detail.symbol} ${t.address} status=${detail.status} trades=${t.tradeCount}`);
    console.log(`  analytics: progress=${fmt(detail.progress)} priceNative=${detail.priceNative.toExponential(6)} mcap=${fmt(mcapSol, 2)} SOL ($${fmt(detail.marketCapUsd, 0)}) supply=${detail.totalSupply} holders=${detail.holderCount} liquidity=$${fmt(detail.liquidityUsd, 0)}`);
    if (!connection) continue;
    try {
      const c = await chainView(connection, t.address);
      const chainMcap = c.priceNative * c.supply;
      const holders = c.holders === null ? 'n/a' : `${c.holdersCapped ? '>=' : ''}${c.holders}`;
      console.log(`  chain:     status=${c.status} quote=${c.quoteMint.slice(0, 8)} progress=${fmt(c.progress)} priceNative=${c.priceNative.toExponential(6)} mcap=${fmt(chainMcap, 2)} SOL supply=${c.supply} holders=${holders} curve txs=${c.curveTxs ?? 'n/a'}`);
      const unseen = c.curveTxs === null ? 'n/a' : `~${Math.max(0, c.curveTxs - Math.max(1, t.tradeCount))}`;
      console.log(`  delta:     price ${pct(detail.priceNative, c.priceNative)} mcap ${pct(mcapSol, chainMcap)} progress ${fmt(detail.progress - c.progress)} (curve transactions after the launch the World did not see: ${unseen})`);
    } catch (err) {
      console.log(`  chain read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await built.close();
  rmSync(dataDir, { recursive: true, force: true });
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
