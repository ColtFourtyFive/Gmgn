import type { AppContext } from '../src/context';
import { simOf } from '../src/sim/behaviors/fate';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World } from '../src/sim/world';
const endAt = Date.now();
const world = new World('trenchscope', endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install(); market.seedPopulation();
engine.addTicker('band', () => {
  const agg: Record<string, number> = {};
  for (const addr of world.tokensByChain.sol) {
    const t = world.tokens.get(addr)!; if (t.dormant || t.status !== 'curve') continue;
    const pr = world.progress(t); if (pr < 0.3 || pr > 0.99) continue;
    const s = simOf(t); const k = t.fate + (s.ruggedAt ? '(rugged)' : s.dumpedAt ? '(dumped)' : '') + (world.now - t.lastTradeAt > 5 * 60000 ? '[idle]' : '');
    agg[k] = (agg[k] ?? 0) + 1;
  }
  const n = Object.values(agg).reduce((a, b) => a + b, 0);
  console.log(Math.round((world.now - world.startedAt) / 60000), 'm', n, Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}, { everyMs: 10 * 60000, duringWarmup: true });
engine.warmup(Number(process.argv[2] ?? 120) * 60000, 1000, endAt);
