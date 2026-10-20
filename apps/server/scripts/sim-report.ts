// Headless market-simulator report: seeds the population, fast-forwards a
// warmup and prints realism stats per chain (launch / migration / rug counts,
// progress bands, top tokens, throughput, archetype PnL, cost).
//
// Usage (from apps/server): npx tsx scripts/sim-report.ts [minutes=120] [seed=trenchscope]

import { CHAIN_IDS, formatAge, formatPercent, formatUsd, type ChainId } from '@trenchscope/shared';
import type { AppContext } from '../src/context';
import { simOf } from '../src/sim/behaviors/fate';
import { memOf } from '../src/sim/behaviors/roster';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World, type TokenState } from '../src/sim/world';

const minutes = Number(process.argv[2] ?? 120);
const seed = process.argv[3] ?? 'trenchscope';
const SAMPLE_EVERY_MS = 10 * 60_000;
const LIVE_SECONDS = 60;

const endAt = Date.now();
const world = new World(seed, endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install();

// time series sampled during the warmup: almost-bonded counts and trades/s per chain
const samples: { at: number; almost: Record<ChainId, number>; tps: Record<ChainId, number> }[] = [];
let lastTrades = CHAIN_IDS.map(() => 0);
engine.addTicker(
  'report-sampler',
  (dt) => {
    const almost = {} as Record<ChainId, number>;
    const tps = {} as Record<ChainId, number>;
    CHAIN_IDS.forEach((c, i) => {
      almost[c] = liveTokens(c).filter((t) => t.status === 'curve' && inBand(world.progress(t), 0.3, 0.99)).length;
      tps[c] = (market.stats[c].trades - lastTrades[i]) / (dt / 1000);
    });
    lastTrades = CHAIN_IDS.map((c) => market.stats[c].trades);
    samples.push({ at: world.now, almost, tps });
  },
  { everyMs: SAMPLE_EVERY_MS, duringWarmup: true },
);

const seedStart = performance.now();
market.seedPopulation();
const seedMs = performance.now() - seedStart;
const warmStart = performance.now();
engine.warmup(minutes * 60_000, 1000, endAt);
const warmupMs = performance.now() - warmStart;

// live phase: 250ms ticks like the real server
const liveTradesBefore = world.tradeTotal;
const tickCosts: number[] = [];
for (let i = 0; i < (LIVE_SECONDS * 1000) / engine.tickMs; i++) {
  const t0 = performance.now();
  engine.step(engine.tickMs);
  tickCosts.push(performance.now() - t0);
}
const liveTps = (world.tradeTotal - liveTradesBefore) / LIVE_SECONDS;

// ---------------------------------------------------------------------------

function liveTokens(chain: ChainId): TokenState[] {
  const out: TokenState[] = [];
  for (const addr of world.tokensByChain[chain]) {
    const t = world.tokens.get(addr);
    if (t && !t.dormant) out.push(t);
  }
  return out;
}

function inBand(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function lpad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function table(head: string[], rows: (string | number)[][], widths: number[]): void {
  const line = (cols: (string | number)[]) => cols.map((c, i) => (i === 0 ? pad(c, widths[i]) : lpad(c, widths[i]))).join(' ');
  console.log('  ' + line(head));
  for (const r of rows) console.log('  ' + line(r));
}

const hours = minutes / 60;
console.log(`\n=== Trenchscope market sim report: seed "${seed}", ${minutes}m warmup ===`);
console.log(`seed population ${seedMs.toFixed(0)}ms, warmup ${(warmupMs / 1000).toFixed(2)}s; live ${LIVE_SECONDS}s @${engine.tickMs}ms ticks: avg ${avg(tickCosts).toFixed(2)}ms, p95 ${pct(tickCosts, 0.95).toFixed(2)}ms, max ${Math.max(...tickCosts).toFixed(1)}ms, ${liveTps.toFixed(1)} trades/s`);
const mem = process.memoryUsage();
console.log(`memory: heap ${(mem.heapUsed / 2 ** 20).toFixed(0)}MB, rss ${(mem.rss / 2 ** 20).toFixed(0)}MB; ${world.tokens.size} tokens, ${world.wallets.size} wallets, ${world.tradeTotal} trades`);

for (const chain of CHAIN_IDS) {
  const st = market.stats[chain];
  const all = world.tokensByChain[chain].map((a) => world.tokens.get(a)!).filter(Boolean);
  const live = all.filter((t) => !t.dormant);
  const curve = live.filter((t) => t.status === 'curve');
  const bands = [
    curve.filter((t) => world.progress(t) < 0.1).length,
    curve.filter((t) => inBand(world.progress(t), 0.1, 0.3)).length,
    curve.filter((t) => inBand(world.progress(t), 0.3, 0.99)).length,
  ];
  const migrated = all.filter((t) => t.status === 'migrated');
  const peaks = [6e4, 5e5, 1e6, 1e7, Infinity];
  const peakBands = peaks.map((hi, i) => migrated.filter((t) => t.athMarketCapUsd < hi && t.athMarketCapUsd >= (i ? peaks[i - 1] : 0)).length);
  const rugged = all.filter((t) => simOf(t).ruggedAt);
  const drawdown = (fate: string) => formatPercent(avg(rugged.filter((t) => t.fate === fate).map((t) => 1 - world.marketCapUsd(t) / t.athMarketCapUsd)), { sign: false });
  const fates = new Map<string, number>();
  for (const t of all) fates.set(t.fate, (fates.get(t.fate) ?? 0) + 1);
  const sampleAlmost = samples.slice(1).map((s) => s.almost[chain]);
  const sampleTps = samples.slice(1).map((s) => s.tps[chain]);

  console.log(`\n--- ${chain.toUpperCase()} (native $${world.nativeUsd(chain).toFixed(2)}) ---`);
  console.log(`launches ${st.launches} (${(st.launches / hours).toFixed(0)}/h) | migrations ${st.migrations} (${(st.migrations / hours).toFixed(1)}/h, ${formatPercent(st.migrations / Math.max(1, st.launches), { sign: false })}) | rugs ${st.rugs} (avg drawdown from ATH: rug ${drawdown('rug')}, slow rug ${drawdown('slow_rug')}) | dumps ${st.dumps} | CTO ${st.ctos} | boosts ${st.boosts} | revivals ${st.revivals} | pruned ${st.pruned}`);
  console.log(`fates: ${[...fates].map(([f, n]) => `${f} ${formatPercent(n / all.length, { sign: false, digits: 1 })}`).join(', ')}`);
  console.log(`trades ${st.trades} (${(st.trades / (minutes * 60)).toFixed(1)}/s avg; 10-min samples ${sampleTps.map((x) => x.toFixed(1)).join(' ')})`);
  console.log(`tokens: ${all.length} total, ${live.length} active, ${all.length - live.length} dormant | curve progress <10%: ${bands[0]}, 10-30%: ${bands[1]}, 30-99% (almost): ${bands[2]} (samples ${sampleAlmost.join(' ')}) | migrated ${migrated.length}`);
  console.log(`migrated ATH mcap: <$60k ${peakBands[0]}, $60k-500k ${peakBands[1]}, $500k-1M ${peakBands[2]}, $1M-10M ${peakBands[3]}, >$10M ${peakBands[4]}`);

  const row = (t: TokenState) => {
    const v = world.windowStats(t, '24h');
    return [
      `${t.symbol.slice(0, 9)} ${t.fate}/${simOf(t).outcome}`,
      formatUsd(world.marketCapUsd(t)),
      formatUsd(t.athMarketCapUsd),
      formatUsd(v.volumeUsd),
      v.swaps,
      t.holders.size,
      formatAge(t.createdAt, world.now),
      t.status,
    ];
  };
  const head = ['token', 'mcap', 'ath', 'vol', 'swaps', 'holders', 'age', 'status'];
  const widths = [26, 9, 9, 9, 7, 8, 5, 9];
  console.log('top 10 by market cap:');
  table(head, [...live].sort((a, b) => world.marketCapUsd(b) - world.marketCapUsd(a)).slice(0, 10).map(row), widths);
  console.log('top 10 by volume:');
  const vol = new Map(live.map((t) => [t, world.windowStats(t, '24h').volumeUsd]));
  table(head, [...live].sort((a, b) => vol.get(b)! - vol.get(a)!).slice(0, 10).map(row), widths);
}

// archetype PnL across all chains (per position: realized + unrealized at current price)
interface Agg {
  wallets: Set<string>;
  realized: number;
  unrealized: number;
  wins: number;
  positions: number;
  invested: number;
}
const byArchetype = new Map<string, Agg>();
for (const w of world.wallets.values()) {
  if (memOf(w).role === 'funder') continue;
  let agg = byArchetype.get(w.archetype);
  if (!agg) byArchetype.set(w.archetype, (agg = { wallets: new Set(), realized: 0, unrealized: 0, wins: 0, positions: 0, invested: 0 }));
  for (const pos of w.positions.values()) {
    const t = world.tokens.get(pos.token);
    const unreal = t ? pos.balance * world.priceUsd(t) - pos.costBasisUsd : 0;
    agg.wallets.add(w.address);
    agg.realized += pos.realizedPnlUsd;
    agg.unrealized += unreal;
    agg.invested += pos.boughtUsd;
    agg.positions++;
    if (pos.realizedPnlUsd + unreal > 0) agg.wins++;
  }
}
console.log('\n--- archetype PnL (all chains; win rate = share of positions in profit) ---');
table(
  ['archetype', 'wallets', 'positions', 'invested', 'realized', 'unrealized', 'ROI', 'win rate'],
  [...byArchetype]
    .sort((a, b) => b[1].realized - a[1].realized)
    .map(([role, a]) => [
      role,
      a.wallets.size,
      a.positions,
      formatUsd(a.invested),
      formatUsd(a.realized),
      formatUsd(a.unrealized),
      formatPercent((a.realized + a.unrealized) / Math.max(1, a.invested), { digits: 1 }),
      formatPercent(a.wins / Math.max(1, a.positions), { sign: false, digits: 1 }),
    ]),
  [10, 8, 10, 10, 10, 11, 8, 9],
);

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}
