import type { AppContext } from '../src/context';
import { evalPath, simOf } from '../src/sim/behaviors/fate';
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
const agg: Record<string, number[]> = {};
for (const addr of world.tokensByChain.sol) {
  const t = world.tokens.get(addr)!; if (t.dormant || t.status !== 'curve') continue;
  const pr = world.progress(t); if (pr < 0.3) continue;
  const s = simOf(t); const p = evalPath(s, world.now);
  const k = t.fate + (s.ruggedAt ? '(rugged)' : s.dumpedAt ? '(dumped)' : '');
  (agg[k] ??= []).push(0);
  console.log(k.padEnd(20), 'age', ((world.now - t.createdAt)/60000).toFixed(0).padStart(3), 'prog', pr.toFixed(2), 'hype', t.hype.toFixed(3), 'act', p.act.toFixed(3), 'gap', (p.ln + s.noise - Math.log(world.marketCapUsd(t))).toFixed(2), 'idle', ((world.now - t.lastTradeAt)/60000).toFixed(1), 'holders', t.holders.size);
}
console.log(Object.entries(agg).map(([k, v]) => `${k}:${v.length}`).join(' '));
