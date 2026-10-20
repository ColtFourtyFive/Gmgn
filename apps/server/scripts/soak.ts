// Memory/throughput soak: boot the full app (all modules), fast-forward
// SOAK_MINUTES of market history, then report heap after GC and list-query cost.
// Usage: node --expose-gc --import tsx scripts/soak.ts [minutes]

import { CHAIN_IDS } from '@trenchscope/shared';
import { buildApp, defaultConfig } from '../src/app';

const minutes = Number(process.argv[2] ?? process.env.SOAK_MINUTES ?? 360);
const gc = (globalThis as { gc?: () => void }).gc;
const mb = (n: number) => `${Math.round(n / 1048576)}MB`;

const t0 = Date.now();
const built = await buildApp(defaultConfig({ warmupMinutes: minutes, snapshotEveryMs: 0 }), { start: false, persist: false });
const { ctx } = built;
console.log(`boot+warmup ${minutes}m: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
gc?.();
const heap = process.memoryUsage();
let trades = 0;
let candles = 0;
for (const t of ctx.world.tokens.values()) {
  trades += t.trades.length;
  for (const arr of Object.values(t.candles)) candles += arr.length;
}
console.log(`heap ${mb(heap.heapUsed)} rss ${mb(heap.rss)} | tokens ${ctx.world.tokens.size} wallets ${ctx.world.wallets.size} | trade rows ${trades} candles ${candles}`);

const q0 = performance.now();
for (const chain of CHAIN_IDS) {
  ctx.analytics.trenches({ chain });
  ctx.analytics.trending({ chain, window: '1h' });
}
const q1 = performance.now();
for (const chain of CHAIN_IDS) {
  ctx.analytics.trenches({ chain });
  ctx.analytics.trending({ chain, window: '1h' });
}
console.log(`lists cold ${(q1 - q0).toFixed(0)}ms warm ${(performance.now() - q1).toFixed(1)}ms`);
const { serialize } = await import('node:v8');
const s0 = performance.now();
const bytes = serialize({ world: ctx.world.serialize(), a: ctx.accounts.serialize(), b: ctx.analytics.serialize(), c: ctx.trading.serialize(), m: built.market.serialize() }).length;
console.log(`snapshot ${mb(bytes)} serialized in ${(performance.now() - s0).toFixed(0)}ms (blocks the event loop; runs every SNAPSHOT_EVERY_MS)`);
await built.app.close();
