import type { AppContext } from '../src/context';
import { evalPath, simOf } from '../src/sim/behaviors/fate';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World } from '../src/sim/world';
const minutes = Number(process.argv[2] ?? 20);
const endAt = Date.now();
const world = new World('trenchscope', endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install(); market.seedPopulation();
engine.warmup(minutes * 60000, 1000, endAt);
const rows: any[] = [];
for (const addr of world.tokensByChain.sol) {
  const t = world.tokens.get(addr)!; const s = simOf(t);
  const p = evalPath(s, world.now);
  const w1 = world.windowStats(t, '1m'); const w5 = world.windowStats(t, '5m');
  const roles: Record<string, number> = {};
  for (const tr of t.trades.slice(-100)) { const r = (world.wallets.get(tr.wallet)!.memory as any).role ?? 'user'; roles[r + tr.side[0]] = (roles[r + tr.side[0]] ?? 0) + 1; }
  rows.push({ sym: t.symbol, fate: t.fate, out: s.outcome, age: Math.round((world.now - t.createdAt)/60000), hype: +t.hype.toFixed(2), pact: +p.act.toFixed(3), bump: +s.bump.toFixed(2), mom: +(s.emaFast - s.emaSlow).toFixed(2), gap: +(p.ln + s.noise - Math.log(world.marketCapUsd(t))).toFixed(2), tpm1: w1.swaps, tpm5: (w5.swaps/5).toFixed(1), prog: world.progress(t).toFixed(2), mcap: Math.round(world.marketCapUsd(t)), hold: t.holders.size, roles: Object.entries(roles).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+':'+v).join(' ') });
}
rows.sort((a, b) => b.tpm1 - a.tpm1);
console.table(rows.slice(0, 25));
const byFate: Record<string, { n: number; tpm: number; almost: number }> = {};
for (const r of rows) { const f = (byFate[r.fate + '/' + r.out] ??= { n: 0, tpm: 0, almost: 0 }); f.n++; f.tpm += r.tpm1; if (r.out === 'curve' && +r.prog >= 0.3) f.almost++; }
console.table(byFate);
const byAge: Record<string, { n: number; tpm: number }> = {};
for (const r of rows) { const k = r.age < 5 ? '0-5' : r.age < 10 ? '5-10' : r.age < 20 ? '10-20' : '20+'; const f = (byAge[k] ??= { n: 0, tpm: 0 }); f.n++; f.tpm += r.tpm1; }
console.table(byAge);
