import type { AppContext } from '../src/context';
import { simOf } from '../src/sim/behaviors/fate';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World } from '../src/sim/world';
const minutes = Number(process.argv[2] ?? 60);
const endAt = Date.now();
const world = new World('trenchscope', endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install(); market.seedPopulation();
engine.warmup(minutes * 60000, 1000, endAt);
const agg: Record<string, { n: number; trades: number; peakProg: number; lastProg: number; byRole: Record<string, number> }> = {};
for (const addr of world.tokensByChain.sol) {
  const t = world.tokens.get(addr)!; const age = (world.now - t.createdAt) / 60000;
  if (age < 25 || age > 45) continue;
  const s = simOf(t);
  const a = (agg[t.fate + '/' + s.outcome] ??= { n: 0, trades: 0, peakProg: 0, lastProg: 0, byRole: {} });
  a.n++; a.trades += t.tradeCount; a.lastProg += world.progress(t);
  for (const tr of t.trades) { const r = ((world.wallets.get(tr.wallet)!.memory as any).role ?? 'user') + tr.side[0]; a.byRole[r] = (a.byRole[r] ?? 0) + 1; }
}
for (const [k, a] of Object.entries(agg)) {
  console.log(k, 'n', a.n, 'avg trades', (a.trades / a.n).toFixed(0), 'avg prog', (a.lastProg / a.n).toFixed(2), Object.entries(a.byRole).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([r, v]) => `${r}:${(v / a.n).toFixed(0)}`).join(' '));
}
