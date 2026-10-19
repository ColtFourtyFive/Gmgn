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
engine.warmup(60 * 60000, 1000, endAt);
const rows = [];
for (const addr of world.tokensByChain.sol) {
  const t = world.tokens.get(addr)!; const s = simOf(t); if (!s.ruggedAt) continue;
  const l0 = Math.exp(s.launchLn); let held = 0;
  for (const a of t.holders) held += world.wallets.get(a)!.positions.get(t.address)!.balance;
  const atRug = t.trades.find((x) => x.timestamp >= s.ruggedAt);
  rows.push({ fate: t.fate, athX: +(t.athMarketCapUsd / l0).toFixed(1), nowX: +(world.marketCapUsd(t) / l0).toFixed(2), dd: +(1 - world.marketCapUsd(t) / t.athMarketCapUsd).toFixed(2), heldPct: +(held / t.totalSupply * 100).toFixed(1), holders: t.holders.size, minsSinceRug: +((world.now - s.ruggedAt) / 60000).toFixed(0), rugAtX: atRug ? +(atRug.marketCapUsd / l0).toFixed(1) : null });
}
console.table(rows.slice(-25));
