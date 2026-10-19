import type { AppContext } from '../src/context';
import { evalPath, simOf } from '../src/sim/behaviors/fate';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World, type TokenState } from '../src/sim/world';
const fate = process.argv[2] ?? 'slow_rug';
const endAt = Date.now();
const world = new World('trenchscope', endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install(); market.seedPopulation();
let tracked: TokenState | undefined;
let lastCount = 0;
engine.addTicker('trace', () => {
  if (!tracked) { for (const a of world.tokensByChain.sol) { const t = world.tokens.get(a)!; if (t.fate === fate && world.now - t.createdAt < 60000) { tracked = t; break; } } if (!tracked) return; }
  const t = tracked; const s = simOf(t); const p = evalPath(s, world.now); const lnM = Math.log(world.marketCapUsd(t));
  const recent = t.trades.slice(-(t.tradeCount - lastCount));
  const b = recent.filter((x) => x.side === 'buy'); const sl = recent.filter((x) => x.side === 'sell');
  const roles: Record<string, number> = {};
  for (const a of t.holders) { const r = (world.wallets.get(a)!.memory as any).role ?? 'user'; roles[r] = (roles[r] ?? 0) + 1; }
  console.log(`age ${((world.now - t.createdAt)/60000).toFixed(1)}m mcap ${Math.round(Math.exp(lnM))} target ${Math.round(Math.exp(p.ln + s.noise))} path ${Math.round(Math.exp(p.ln))} act ${p.act.toFixed(3)} bump ${s.bump.toFixed(3)} hype ${t.hype.toFixed(3)} mom ${(s.emaFast-s.emaSlow).toFixed(2)} | buys ${b.length} $${Math.round(b.reduce((a,x)=>a+x.usdAmount,0))} sells ${sl.length} $${Math.round(sl.reduce((a,x)=>a+x.usdAmount,0))} | holders ${JSON.stringify(roles)} ev ${s.eventKind}`);
  lastCount = t.tradeCount;
}, { everyMs: 60000, duringWarmup: true });
engine.warmup(45 * 60000, 1000, endAt);
