// Ground-truth export (PRD SIM-28): run the simulator for a seed + scenario,
// then dump the hidden truth (wallet archetypes and roles, token fates and
// outcomes, true launch cohorts) next to what analytics derived, with the label
// precision / recall report (src/sim/groundTruth.ts). Offline tooling only: the
// server never exposes any of this over HTTP.
//
// Usage (from apps/server):
//   npx tsx scripts/ground-truth.ts [--minutes 60] [--seed trenchscope] [--scenario normal] [--out file.json]
// Scenarios: normal, rug_wave, cto_pump, bundle_launch, honeypot_evm, quiet (default: SIM_SCENARIO, else normal).

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHAIN_IDS } from '@trenchscope/shared';
import { buildApp, defaultConfig } from '../src/app';
import { exportGroundTruth, type LabelScore } from '../src/sim/groundTruth';
import type { MarketSim } from '../src/sim/market';
import { SCENARIO_IDS, parseScenario } from '../src/sim/scenarios';

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

const minutes = Number(arg('minutes') ?? 60);
const seed = arg('seed') ?? 'trenchscope';
const scenario = parseScenario(arg('scenario') ?? process.env.SIM_SCENARIO);
if (!(minutes > 0) || !Number.isFinite(minutes)) {
  console.error('--minutes must be a positive number');
  process.exit(1);
}
if (scenario === null) {
  console.error(`unknown scenario; use one of: ${SCENARIO_IDS.join(', ')}`);
  process.exit(1);
}
const out = resolve(arg('out') ?? `ground-truth-${seed}-${scenario}-${minutes}m.json`);

const t0 = performance.now();
const built = await buildApp(defaultConfig({ mode: 'demo', seed, simScenario: scenario, warmupMinutes: minutes, snapshotEveryMs: 0 }), { start: false, persist: false });
const analytics = built.ctx.analytics as import('../src/analytics').Analytics;
analytics.wallets.classifyAll();
const data = exportGroundTruth(built.ctx, built.market as MarketSim, { seed, minutes });
writeFileSync(out, JSON.stringify(data));
await built.close();

const r = data.report;
const fmt = (s: LabelScore) => `P ${s.precision ?? '--'} R ${s.recall ?? '--'} (tp ${s.tp} fp ${s.fp} fn ${s.fn})`;
console.log(`\n=== ground truth: seed "${seed}", scenario ${scenario}, ${minutes}m (${((performance.now() - t0) / 1000).toFixed(1)}s) ===`);
console.log(`${data.meta.tokens} tokens, ${data.meta.wallets} wallets, ${data.meta.trades} trades -> ${out}`);
console.log('\nwallet tags vs archetype (all chains):');
for (const [tag, byChain] of Object.entries(r.walletTags)) console.log(`  ${tag.padEnd(9)} ${fmt(byChain.all)}`);
console.log('\ntoken cohorts, detected vs true (all chains):');
for (const [name, byChain] of Object.entries(r.tokenCohorts)) console.log(`  ${name.padEnd(9)} ${fmt(byChain.all)}`);
console.log(`\nrug ratio AUC (bad fates vs the rest): ${CHAIN_IDS.map((c) => `${c} ${r.rugRiskAuc[c] ?? '--'}`).join(', ')}, all ${r.rugRiskAuc.all ?? '--'}`);
console.log(`safety score medians: rugs ${r.safety.rugMedian ?? '--'}, runners / moons ${r.safety.organicMedian ?? '--'} (gap ${r.safety.separation ?? '--'})`);
console.log(`smart_buy +50% within ${r.smartBuy.horizonMin}m: ${r.smartBuy.hits}/${r.smartBuy.signals} (${r.smartBuy.precision ?? '--'}) vs base rate ${r.smartBuy.baseRate ?? '--'} (lift ${r.smartBuy.lift ?? '--'})`);
console.log('\nfates:');
for (const c of CHAIN_IDS) console.log(`  ${c.padEnd(9)} ${Object.entries(r.fates[c]).map(([f, n]) => `${f} ${n}`).join(', ')}`);
