import type { AppContext } from '../src/context';
import { simOf } from '../src/sim/behaviors/fate';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World } from '../src/sim/world';
const role = process.argv[2] ?? 'smart';
const endAt = Date.now();
const world = new World('trenchscope', endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install(); market.seedPopulation();
engine.warmup(Number(process.argv[3] ?? 120) * 60000, 1000, endAt);
const agg: Record<string, { n: number; wins: number; pnl: number; realized: number; cost: number; open: number }> = {};
for (const w of world.wallets.values()) {
  if ((w.memory as any).role !== role) continue;
  for (const pos of w.positions.values()) {
    const t = world.tokens.get(pos.token); if (!t) continue;
    const k = t.fate + '/' + simOf(t).outcome + (simOf(t).ruggedAt ? '/rugged' : '');
    const unreal = pos.balance * world.priceUsd(t) - pos.costBasisUsd;
    const a = (agg[k] ??= { n: 0, wins: 0, pnl: 0, realized: 0, cost: 0, open: 0 });
    a.n++; a.pnl += pos.realizedPnlUsd + unreal; a.realized += pos.realizedPnlUsd; a.cost += pos.boughtUsd; if (pos.realizedPnlUsd + unreal > 0) a.wins++; if (pos.balance > 0) a.open++;
  }
}
for (const [k, a] of Object.entries(agg).sort((x, y) => y[1].n - x[1].n)) console.log(k.padEnd(28), 'n', String(a.n).padStart(5), 'win', (a.wins / a.n).toFixed(2), 'open', a.open, 'pnl', Math.round(a.pnl), 'realized', Math.round(a.realized), 'cost', Math.round(a.cost));
