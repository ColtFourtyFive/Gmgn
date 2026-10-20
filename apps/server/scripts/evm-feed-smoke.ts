// Read-only smoke run of the EVM live market feed against mainnet: every
// enabled EVM chain is followed for --seconds (default 90) into a fresh ledger
// (live-mode app with no market source of its own), then the script prints per
// chain what was found (launches per venue, trades booked, migrations, native
// price, lag, request rate, errors), Trenches column sizes and three sample
// token summaries. Nothing is ever sent to a chain.
//
// Usage: npx tsx scripts/evm-feed-smoke.ts [--seconds 90] [--chains base,robinhood,bsc,eth]
//        [--backfill-seconds 60] [--ensure <chain>:<address> ...]

import { CHAINS, type ChainId } from '@trenchscope/shared';
import { buildApp, defaultConfig } from '../src/app';
import { EVM_CHAIN_IDS, EVM_CHAINS, type EvmChainId } from '../src/live/evm/chains';
import { loadEvmLiveConfig } from '../src/live/evm/config';
import { EvmMarketFeed, loadEvmFeedSettings } from '../src/live/evm/feed';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

const seconds = Number(arg('seconds', '90'));
const backfillSeconds = Number(arg('backfill-seconds', '60'));
const chains = arg('chains', EVM_CHAIN_IDS.join(','))
  .split(',')
  .filter((c): c is EvmChainId => (EVM_CHAIN_IDS as string[]).includes(c));

const built = await buildApp(defaultConfig({ mode: 'live', live: null, warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
const { world, analytics } = built.ctx;
world.now = Date.now();

const { config, problems } = loadEvmLiveConfig({ ...process.env, LIVE_CHAINS: chains.join(',') });
for (const p of problems) console.warn(`[config] ${p}`);
const settings = loadEvmFeedSettings(config.chains);
for (const c of chains) {
  const s = settings.chains[c];
  // Start a little in the past so a short run already has history.
  if (s) s.backfill = Math.round((backfillSeconds * 1000) / EVM_CHAINS[c].blockTimeMs);
}
const feed = new EvmMarketFeed({ world, config, settings, now: () => world.now });
const clock = setInterval(() => (world.now = Date.now()), 250);

console.log(`following ${chains.join(', ')} for ${seconds}s (backfill ~${backfillSeconds}s of blocks)...`);
const t0 = Date.now();
feed.start();
const progress = setInterval(() => {
  const st = feed.status();
  const line = chains
    .map((c) => {
      const s = st[c]!;
      const launches = Object.values(s.venues).reduce((n, v) => n + v.launches, 0);
      const trades = Object.values(s.venues).reduce((n, v) => n + v.trades, 0);
      return `${c}: head ${s.headBlock ?? '-'} lag ${s.lagBlocks} launches ${launches} trades ${trades} rps ${s.requestsPerSec.toFixed(1)}`;
    })
    .join(' | ');
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${line}`);
}, 15_000);
await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(progress);

for (const spec of args('ensure')) {
  const [chain, address] = spec.split(':') as [EvmChainId, string];
  const t = await feed.ensureToken(chain, address);
  console.log(`ensureToken ${chain} ${address}: ${t ? `${t.symbol} (${t.launchpad}, ${t.status}) mcap $${Math.round(world.marketCapUsd(t))}` : 'not found'}`);
}
const status = feed.status();
await feed.stop();
clearInterval(clock);

console.log('\n=== EVM feed smoke results ===');
for (const c of chains) {
  const s = status[c]!;
  console.log(`\n## ${EVM_CHAINS[c].viem.name} (${c})`);
  console.log(
    `head ${s.headBlock} processed ${s.processedBlock} lag ${s.lagBlocks} blocks | windows ${s.windows} splits ${s.rangeSplits} skipped ${s.skippedBlocks} | rps ${s.requestsPerSec.toFixed(1)} | connected ${s.connected}`,
  );
  console.log(`native ${CHAINS[c].nativeSymbol} $${s.nativeUsd?.toFixed(2) ?? '-'} (${s.nativePrice?.source ?? 'n/a'}${s.nativePrice?.error ? `, error: ${s.nativePrice.error}` : ''})`);
  console.log(`tracked ${s.trackedTokens} | ledger tokens ${s.worldTokens} | pools ${s.pools} | metadata pending ${s.metadataPending}`);
  for (const [venue, v] of Object.entries(s.venues)) {
    if (v.launches + v.trades + v.migrations > 0) console.log(`  ${venue.padEnd(24)} launches ${v.launches}  trades ${v.trades}  migrations ${v.migrations}`);
  }
  if (s.recentErrors.length) console.log(`  errors (${s.recentErrors.length}): ${s.recentErrors.slice(-3).map((e) => `${e.venue}: ${e.message}`).join(' || ')}`);
  const trenches = analytics.trenches({ chain: c as ChainId });
  console.log(`trenches: new ${trenches.new.length} | near graduation ${trenches.almost.length} | migrated ${trenches.migrated.length}`);
  const tokens = world.tokensByChain[c]
    .map((a) => world.tokens.get(a)!)
    .filter((t) => t && t.tradeCount > 0)
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, 3);
  for (const t of tokens) {
    const sum = analytics.tokenSummary(t);
    console.log(
      `  - ${sum.symbol} "${sum.name}" ${sum.launchpad} ${sum.status} | mcap $${Math.round(sum.marketCapUsd).toLocaleString()} liq $${Math.round(sum.liquidityUsd).toLocaleString()} | progress ${(sum.progress * 100).toFixed(1)}% | trades ${t.tradeCount} holders ${sum.holderCount} | 24h vol $${Math.round(sum.stats['24h'].volumeUsd).toLocaleString()} | ${t.address}${t.imageUrl ? ' | image' : ''}`,
    );
  }
}
await built.close();
process.exit(0);
