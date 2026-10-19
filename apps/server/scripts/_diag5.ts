import type { AppContext } from '../src/context';
import { evalPath, simOf } from '../src/sim/behaviors/fate';
import { Engine } from '../src/sim/engine';
import { MarketSim } from '../src/sim/market';
import { World, type TokenState } from '../src/sim/world';
const outcome = process.argv[2] ?? 'run';
const endAt = Date.now();
const world = new World('trenchscope', endAt);
const engine = new Engine(world);
const market = new MarketSim({ world, engine } as unknown as AppContext);
market.install(); market.seedPopulation();
let tracked: TokenState | undefined;
let lastCount = 0;
engine.addTicker('trace', () => {
  if (!tracked) { for (const a of world.tokensByChain.sol) { const t = world.tokens.get(a)!; if (simOf(t).outcome === outcome) { tracked = t; lastCount = t.tradeCount; break; } } if (!tracked) return; }
  const t = tracked; const s = simOf(t); const p = evalPath(s, world.now); const lnM = Math.log(world.marketCapUsd(t));
  const recent = t.trades.slice(-(t.tradeCount - lastCount));
  const b = recent.filter((x) => x.side === 'buy'); const sl = recent.filter((x) => x.side === 'sell');
  const by: Record<string, number> = {};
  for (const x of recent) { const r = ((world.wallets.get(x.wallet)!.memory as any).role ?? 'user') + x.side[0]; by[r] = (by[r] ?? 0) + Math.round(x.usdAmount); }
  console.log(`age ${((world.now - t.createdAt)/60000).toFixed(0)}m mcap ${Math.round(Math.exp(lnM)/1000)}k target ${Math.round(Math.exp(p.ln + s.noise)/1000)}k act ${p.act.toFixed(3)} bump ${s.bump.toFixed(3)} hype ${t.hype.toFixed(3)} mom ${(s.emaFast-s.emaSlow).toFixed(2)} pool ${t.pool ? t.pool.native.toFixed(0) : '-'} | b ${b.length} $${Math.round(b.reduce((a,x)=>a+x.usdAmount,0))} s ${sl.length} $${Math.round(sl.reduce((a,x)=>a+x.usdAmount,0))} | ${Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>k+':'+v).join(' ')}`);
  lastCount = t.tradeCount;
}, { everyMs: 5 * 60000, duringWarmup: true });
engine.warmup(Number(process.argv[3] ?? 180) * 60000, 1000, endAt);
