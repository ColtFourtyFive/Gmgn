// Program-log feed check (read-only: no wallets, nothing signed or sent). Boots
// the server in live mode with the Solana program-log source against a real RPC
// WebSocket into a fresh World for a while, then prints what arrived and what was
// booked: notifications and decoded events per second by type, decode errors,
// drops (filtered / other quote / shed / queue), reconnects and slot gaps,
// launches, trades and migrations in the World, its size and heap; and compares
// booked trades with the chain (getTransaction: the trader's SOL and token deltas).
//
// Usage (from apps/server):
//   npx tsx scripts/solana-logs-check.ts [--seconds 120] [--sources logs] [--open 6] [--compare 12]
//       [--capture frames.jsonl] [--ws wss://...] [--rpc https://...]
//   --sources  LIVE_SOLANA_SOURCES for the run (default: logs alone, to measure this path)
//   --open     after 15 s, open this many of the busiest pump.fun curves and PumpSwap pools seen so
//              far (as a user opening their pages would): their trades are then booked too
//   --compare  booked trades checked against getTransaction at the end
//   --capture  every raw notification (JSON lines {t, frame}) for fixtures
//   --ws/--rpc default SOLANA_WS_URL / SOLANA_RPC_URL, else api.mainnet-beta.solana.com
// The public mainnet-beta endpoint closes the socket every 30-70 s: the run shows the reconnects,
// the gaps they leave and the catch-up reads (LIVE_RPC_RPS budget) that fill them.

import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';
import { buildApp, defaultConfig } from '../src/app';
import { loadLiveConfig } from '../src/live/config';
import { readPoolMint } from '../src/live/enrich/onchain';
import { JITO_TIP_ACCOUNTS } from '../src/live/execution/jito';
import { catchUpGap } from '../src/live/feed/solana/catchup';
import { decodeProgramLogs } from '../src/live/feed/solana/events';
import type { LiveMarket } from '../src/live/market';
import { MAX_TX_VERSION } from '../src/live/wallets/deposits';
import type { TokenState } from '../src/sim/world';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const seconds = Number(arg('seconds', '120'));
const openCount = Number(arg('open', '6'));
const compareCount = Number(arg('compare', '12'));
const capture = arg('capture', '');
const rpcUrl = arg('rpc', process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com');
const wsUrl = arg('ws', process.env.SOLANA_WS_URL ?? rpcUrl.replace(/^http/, 'ws'));
const sources = arg('sources', 'logs');
const WSOL = 'So11111111111111111111111111111111111111112';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Public RPCs throttle: a few slow attempts. */
async function patiently<T>(fn: () => Promise<T>, attempts = 4): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch {
      await sleep(1500 * (i + 1));
    }
  }
  return null;
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'solana-logs-check-'));
  if (capture) writeFileSync(capture, '');
  const env = { ...process.env, MODE: 'live', SOLANA_RPC_URL: rpcUrl, SOLANA_WS_URL: wsUrl, LIVE_SOLANA_SOURCES: sources };
  const live = loadLiveConfig(env);
  const built = await buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: live.problems, warmupMinutes: 0, snapshotEveryMs: 0, dataDir }), {
    start: true,
    persist: false,
    storePath: ':memory:',
  });
  const market = built.market as LiveMarket;
  const { world } = built.ctx;
  // This script's own reads retry themselves (patiently) instead of web3.js's noisy 429 retries.
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });

  // Every decoded trade's mint / pool, unfiltered, to pick the busiest ones to open.
  const curveTrades = new Map<string, number>();
  const poolTrades = new Map<string, number>();
  market.tapLogs((text) => {
    if (capture) appendFileSync(capture, `${JSON.stringify({ t: Date.now(), frame: text })}\n`);
    try {
      const m = JSON.parse(text) as { params?: { result?: { value?: { err: unknown; logs: string[] } } } };
      const v = m.params?.result?.value;
      if (!v || v.err) return;
      for (const e of decodeProgramLogs(v.logs).events) {
        if (e.type === 'trade' && (e.quoteMint === '11111111111111111111111111111111' || e.quoteMint === WSOL)) curveTrades.set(e.mint, (curveTrades.get(e.mint) ?? 0) + 1);
        else if (e.type === 'ammTrade') poolTrades.set(e.pool, (poolTrades.get(e.pool) ?? 0) + 1);
      }
    } catch {
      // not a notification
    }
  });

  const started = Date.now();
  let maxQueue = 0;
  const sampler = setInterval(() => {
    maxQueue = Math.max(maxQueue, market.diagnostics().queue);
  }, 250);
  const line = () => {
    const d = market.diagnostics();
    const l = d.sources.logs;
    const sol = world.tokensByChain.sol.length;
    const trades = world.tokensByChain.sol.reduce((s, a) => s + (world.tokens.get(a)?.tradeCount ?? 0), 0);
    return `${Math.round((Date.now() - started) / 1000)}s logs=${l?.connected ? 'up' : 'down'} notif/s=${l?.detail.notificationsPerSec ?? 0} events/s=${l?.detail.eventsPerSec ?? 0} booked/s=${l?.eventsPerSec ?? 0} reconnects=${l?.detail.disconnects ?? 0} gaps=${l?.detail.gaps ?? 0} tokens=${sol} trades=${trades} queue=${d.queue}`;
  };
  const ticker = setInterval(() => console.log(`[check] ${line()}`), 15_000);

  if (openCount > 0) {
    await sleep(Math.min(15, seconds / 3) * 1000);
    const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
    const opened: string[] = [];
    for (const mint of top(curveTrades, Math.ceil(openCount / 2))) {
      const t = await market.ensureToken('sol', mint).catch(() => null);
      if (t) opened.push(`${t.symbol} (curve, ${mint.slice(0, 6)})`);
    }
    for (const pool of top(poolTrades, openCount * 3)) {
      if (opened.length >= openCount) break;
      const info = await patiently(() => readPoolMint(connection, new PublicKey(pool), (fn) => fn()), 2);
      if (!info) continue;
      const t = await market.ensureToken('sol', info.mint).catch(() => null);
      if (t?.pool) opened.push(`${t.symbol} (pool, ${info.mint.slice(0, 6)})`);
    }
    console.log(`[check] opened ${opened.length}: ${opened.join(', ')}`);
  }
  await sleep(Math.max(0, seconds * 1000 - (Date.now() - started)));
  clearInterval(ticker);
  clearInterval(sampler);

  const d = market.diagnostics();
  const l = d.sources.logs;
  const elapsed = (Date.now() - started) / 1000;
  console.log('\n=== program-log feed ===');
  console.log(line());
  if (l) {
    const h = l.detail;
    const per = (n: number) => `${n} (${(n / elapsed).toFixed(1)}/s)`;
    console.log(`endpoint ${h.endpoint}: notifications ${per(h.notifications)}, failed tx ${per(h.failed)}, ok tx ${per(h.transactions)}, duplicates ${h.duplicates}, ${(h.bytes / elapsed / 1024).toFixed(0)} KB/s`);
    console.log(`connects ${h.connects}, disconnects ${h.disconnects}, gaps ${h.gaps} (${h.gapSlots} slots), refusals ${h.refusals}, malformed ${h.malformed}, handler errors ${h.handlerErrors}`);
    console.log('decoded events (total, per second):');
    for (const [k, v] of Object.entries(h.stats.decoded).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(48)} ${String(v).padStart(7)}  ${(v / elapsed).toFixed(2)}/s`);
    console.log(JSON.stringify({ decodeErrors: h.stats.decodeErrors, lastDecodeError: h.stats.lastDecodeError, truncated: h.stats.truncated, emitted: h.stats.emitted, filtered: h.stats.filtered, otherQuote: h.stats.otherQuote, roundTrips: h.stats.roundTrips, unresolvedPools: h.stats.unresolvedPools, poolLookups: h.stats.poolLookups, catchUp: h.stats.catchUp, catchUpSkipped: l.catchUp, shed: l.shed, queueDropped: l.queueDropped, maxQueue }, null, 1));
  }
  console.log(JSON.stringify({ verify: d.verify, ingest: d.ingest, staleReserves: d.staleReserves, parked: d.parked, applyErrors: d.applyErrors, lookup: d.lookup, rpc: d.rpc, problems: market.liveStatus().problems ?? [] }, null, 1));
  const tokens = world.tokensByChain.sol.map((a) => world.tokens.get(a)).filter((t): t is TokenState => !!t);
  const trades = tokens.reduce((s, t) => s + t.tradeCount, 0);
  console.log(`World: ${tokens.length} tokens (${tokens.filter((t) => t.status === 'migrated').length} migrated, ${tokens.filter((t) => t.totalSupply > 1e9).length} mayhem), ${trades} trades booked (${(trades / elapsed).toFixed(2)}/s), ${world.wallets.size} wallets, heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);

  // ---- booked trades vs the chain ----------------------------------------
  console.log('\n=== booked trades vs getTransaction ===');
  const sample: { t: TokenState; trade: TokenState['trades'][number] }[] = [];
  const byVenue = (pool: boolean) => tokens.filter((t) => !!t.pool === pool).flatMap((t) => t.trades.map((trade) => ({ t, trade })));
  for (const list of [byVenue(false), byVenue(true)]) {
    const step = Math.max(1, Math.floor(list.length / Math.ceil(compareCount / 2)));
    for (let i = 0; i < list.length && sample.length < compareCount; i += step) sample.push(list[i]);
  }
  let exact = 0;
  let explained = 0;
  for (const { t, trade } of sample) {
    const tx = await patiently(() => connection.getTransaction(trade.txHash, { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' }));
    await sleep(300);
    if (!tx?.meta) {
      console.log(`${trade.txHash.slice(0, 12)} not readable`);
      continue;
    }
    const msg = tx.transaction.message;
    const keys = [...msg.staticAccountKeys.map((k) => k.toBase58()), ...(tx.meta.loadedAddresses?.writable ?? []).map(String), ...(tx.meta.loadedAddresses?.readonly ?? []).map(String)];
    const i = keys.indexOf(trade.wallet);
    const lamports = i >= 0 ? tx.meta.postBalances[i] - tx.meta.preBalances[i] : 0;
    const tokenOf = (arr: typeof tx.meta.postTokenBalances, mint: string) => (arr ?? []).filter((b) => b.owner === trade.wallet && b.mint === mint).reduce((s, b) => s + Number(b.uiTokenAmount.amount), 0);
    const wsol = tokenOf(tx.meta.postTokenBalances, WSOL) - tokenOf(tx.meta.preTokenBalances, WSOL);
    const fee = keys[0] === trade.wallet ? tx.meta.fee : 0;
    // What else moved the wallet's SOL in the same transaction: accounts it created (rent) or closed
    // (refund), Jito tips. Anything left is another instruction's (a trading bot's fee, a transfer).
    let createdRent = 0;
    let closedRent = 0;
    let tips = 0;
    tx.meta.preBalances.forEach((pre, k) => {
      const post = tx.meta!.postBalances[k];
      if (keys[k] === trade.wallet) return;
      if (JITO_TIP_ACCOUNTS.includes(keys[k])) tips += post - pre;
      else if (pre === 0 && post > 0) createdRent += post;
      else if (pre > 0 && post === 0) closedRent += pre;
    });
    const solDelta = (lamports + wsol + fee) / 1e9;
    const tokenDelta = (tokenOf(tx.meta.postTokenBalances, t.address) - tokenOf(tx.meta.preTokenBalances, t.address)) / 10 ** t.decimals;
    const bookedSol = trade.side === 'buy' ? -trade.nativeAmount : trade.nativeAmount;
    const bookedTokens = trade.side === 'buy' ? trade.tokenAmount : -trade.tokenAmount;
    const solDiff = solDelta - bookedSol;
    const residual = solDiff + (createdRent + tips - closedRent) / 1e9;
    const tokensOk = Math.abs(tokenDelta - bookedTokens) <= Math.max(1e-6, Math.abs(bookedTokens) * 1e-9);
    const solOk = Math.abs(solDiff) < 1e-9;
    const rentOk = !solOk && Math.abs(residual) < 1e-9;
    if (solOk && tokensOk) exact++;
    else if (rentOk && tokensOk) explained++;
    const why = solOk ? ' exact' : rentOk ? ' = rent / tips' : ` (rent ${((createdRent - closedRent) / 1e9).toFixed(6)}, tips ${(tips / 1e9).toFixed(6)}, other ${(-residual).toFixed(9)})`;
    console.log(
      `${trade.txHash.slice(0, 12)} ${t.pool ? 'pool ' : 'curve'} ${trade.side.padEnd(4)} ${t.symbol.slice(0, 10).padEnd(10)} tokens booked ${bookedTokens.toFixed(3)} chain ${tokenDelta.toFixed(3)} ${tokensOk ? 'ok' : 'DIFF (tokens went to another owner)'} | SOL booked ${bookedSol.toFixed(9)} chain ${solDelta.toFixed(9)} diff ${solDiff.toFixed(9)}${why}`,
    );
  }
  console.log(`\n${exact} of ${sample.length} exact, ${explained} more exact once the account rent and Jito tips of the same transaction are counted; the rest also paid another instruction (a bot's fee, a transfer)`);

  // ---- catch-up path: re-read a busy token's recent slots as if they had been a gap ----
  console.log('\n=== catch-up read-back (getSignaturesForAddress + getTransaction) ===');
  const busiest = [...tokens].sort((a, b) => b.tradeCount - a.tradeCount)[0];
  if (busiest && busiest.trades.length > 0) {
    const recent = busiest.trades.slice(-20);
    const gap = { fromSlot: Math.min(...recent.map((t) => t.block)), toSlot: Math.max(...recent.map((t) => t.block)) };
    const r = await catchUpGap(gap, [busiest.address], { connection, run: (fn) => patiently(fn).then((v) => (v === null ? Promise.reject(new Error('rpc')) : v)), seen: () => false, maxTransactions: 25, signaturesPerAddress: 1000, maxPages: 3 });
    const booked = new Set(recent.map((t) => t.txHash));
    let decoded = 0;
    let found = 0;
    for (const tx of r.transactions) {
      decoded += decodeProgramLogs(tx.logs).events.length;
      if (booked.has(tx.signature)) found++;
    }
    console.log(`${busiest.symbol} slots ${gap.fromSlot}-${gap.toSlot}: ${r.missing} signatures in the window, ${r.transactions.length} transactions read (${r.skipped} beyond the cap, ${r.errors} errors, incomplete pages ${r.incomplete}), ${decoded} events decoded; ${found} of the ${Math.min(r.transactions.length, booked.size)} booked trades' signatures among them`);
  }
  market.tapLogs(null);
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
