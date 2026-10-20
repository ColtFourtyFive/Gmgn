// Simulator scenario presets (sim/scenarios.ts, PRD SIM-27) and the offline
// ground-truth export (sim/groundTruth.ts + scripts/ground-truth.ts, SIM-28):
// SIM_SCENARIO parsing (demo only), /api/meta, what each preset does to the
// market, and the export's structure and label report. The export is tooling:
// nothing hidden is reachable over HTTP.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CHAIN_IDS, type ChainId, type MetaResponse } from '@trenchscope/shared';
import type { Analytics } from '../src/analytics';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import type { AppContext } from '../src/context';
import { Engine } from '../src/sim/engine';
import { auc, exportGroundTruth, type GroundTruthExport } from '../src/sim/groundTruth';
import { MarketSim } from '../src/sim/market';
import { SCENARIOS, SCENARIO_IDS, isScenarioId, parseScenario, type ScenarioId } from '../src/sim/scenarios';
import { World, type TokenState } from '../src/sim/world';

const END_AT = Date.UTC(2026, 0, 1, 12);
const BAD_FATES = new Set(['rug', 'slow_rug', 'pump_dump']);

interface Run {
  world: World;
  market: MarketSim;
  tokens: TokenState[];
}

function run(scenario: ScenarioId, minutes: number): Run {
  const world = new World('scenario-test', END_AT);
  const engine = new Engine(world);
  const market = new MarketSim({ world, engine } as unknown as AppContext, { scenario });
  market.install();
  market.seedPopulation();
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  engine.warmup(minutes * 60_000, 1000, END_AT);
  log.mockRestore();
  return { world, market, tokens: [...world.tokens.values()] };
}

const total = (r: Run, k: 'launches' | 'trades' | 'ctos' | 'revivals') => CHAIN_IDS.reduce((a, c) => a + r.market.stats[c][k], 0);
const share = (r: Run, pred: (t: TokenState) => boolean) => r.tokens.filter(pred).length / r.tokens.length;
const evmHoneypots = (r: Run) => r.tokens.filter((t) => t.chain !== 'sol' && t.isHoneypot).length;

describe('scenario presets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('parses SIM_SCENARIO: blank = normal, case and spaces ignored, unknown = null', () => {
    expect(parseScenario(undefined)).toBe('normal');
    expect(parseScenario('  ')).toBe('normal');
    expect(parseScenario(' RUG_WAVE ')).toBe('rug_wave');
    expect(parseScenario('honeypot_evm')).toBe('honeypot_evm');
    expect(parseScenario('mega_pump')).toBeNull();
    expect(isScenarioId('quiet')).toBe(true);
    expect(isScenarioId('Quiet')).toBe(false);
  });

  it('defines every preset, and normal leaves the calibrated market untouched', () => {
    expect(SCENARIO_IDS).toEqual(['normal', 'rug_wave', 'cto_pump', 'bundle_launch', 'honeypot_evm', 'quiet']);
    for (const id of SCENARIO_IDS) {
      expect(SCENARIOS[id].id).toBe(id);
      expect(SCENARIOS[id].description.length).toBeGreaterThan(10);
    }
    expect(SCENARIOS.normal).toMatchObject({
      launchRate: 1,
      activity: 1,
      fateWeights: {},
      bundleRate: 1,
      bundleShare: 1,
      honeypotRate: 1,
      honeypotFates: ['rug'],
      ctoRate: 1,
      ctoMinHolders: 40,
      reviveRate: 1,
      population: {},
      phishing: 1,
    });
  });

  it('reads SIM_SCENARIO in demo mode only (unknown values warn and run normal)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('SIM_SCENARIO', 'cto_pump');
    expect(defaultConfig({ mode: 'demo' }).simScenario).toBe('cto_pump');
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv('SIM_SCENARIO', 'nope');
    expect(defaultConfig({ mode: 'demo' }).simScenario).toBe('normal');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown SIM_SCENARIO'));

    warn.mockClear();
    vi.stubEnv('SIM_SCENARIO', 'rug_wave');
    expect(defaultConfig({ mode: 'live', live: null }).simScenario).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignored in live mode'));

    vi.stubEnv('SIM_SCENARIO', '');
    expect(defaultConfig({ mode: 'demo' }).simScenario).toBe('normal');
  });

  it('runs the configured preset and names it on /api/meta', async () => {
    const built = await buildApp(defaultConfig({ mode: 'demo', warmupMinutes: 0, snapshotEveryMs: 0, simScenario: 'quiet' }), { start: false, persist: false });
    try {
      expect((built.market as MarketSim).scenario.id).toBe('quiet');
      const meta = (await built.app.inject({ method: 'GET', url: '/api/meta' })).json() as MetaResponse;
      expect(meta.sim.scenario).toBe('quiet');
      // only the id: the preset's hidden mix stays server-side
      expect(JSON.stringify(meta)).not.toContain('fateWeights');
    } finally {
      await built.close();
    }
  });
});

describe('scenario effects on the market (same seed, vs normal)', () => {
  const runs = {} as Record<ScenarioId, Run>;
  let normalLong: Run;
  let ctoLong: Run;

  beforeAll(() => {
    for (const id of ['normal', 'rug_wave', 'bundle_launch', 'honeypot_evm', 'quiet'] as const) runs[id] = run(id, 20);
    normalLong = run('normal', 40);
    ctoLong = run('cto_pump', 40);
  }, 120_000);

  it('rug_wave: far more rugs, slow rugs and pump-and-dumps, and more bundles', () => {
    const bad = (r: Run) => share(r, (t) => BAD_FATES.has(t.fate));
    expect(bad(runs.rug_wave)).toBeGreaterThan(bad(runs.normal) + 0.1);
    expect(share(runs.rug_wave, (t) => t.fate === 'rug')).toBeGreaterThan(1.8 * share(runs.normal, (t) => t.fate === 'rug'));
    expect(share(runs.rug_wave, (t) => t.bundlers.size > 0)).toBeGreaterThan(share(runs.normal, (t) => t.bundlers.size > 0) + 0.1);
  });

  it('bundle_launch: most launches are bundled', () => {
    const bundled = (r: Run) => share(r, (t) => t.bundlers.size > 0);
    expect(bundled(runs.bundle_launch)).toBeGreaterThan(0.5);
    expect(bundled(runs.bundle_launch)).toBeGreaterThan(bundled(runs.normal) + 0.15);
  });

  it('honeypot_evm: many more sell-blocking contracts on the EVM chains, never on Solana', () => {
    expect(evmHoneypots(runs.honeypot_evm)).toBeGreaterThan(4 * Math.max(1, evmHoneypots(runs.normal)));
    expect(runs.honeypot_evm.tokens.some((t) => t.isHoneypot && t.fate !== 'rug')).toBe(true);
    for (const r of Object.values(runs)) expect(r.tokens.filter((t) => t.chain === 'sol').every((t) => !t.isHoneypot)).toBe(true);
  });

  it('quiet: well under half the launches and order flow, and a smaller population', () => {
    expect(total(runs.quiet, 'launches')).toBeLessThan(0.5 * total(runs.normal, 'launches'));
    expect(total(runs.quiet, 'trades')).toBeLessThan(0.4 * total(runs.normal, 'trades'));
    expect(runs.quiet.world.wallets.size).toBeLessThan(runs.normal.world.wallets.size);
  });

  it('cto_pump: communities take over abandoned tokens far more often', () => {
    expect(total(ctoLong, 'ctos')).toBeGreaterThanOrEqual(4);
    expect(total(ctoLong, 'ctos')).toBeGreaterThan(2 * total(normalLong, 'ctos'));
    expect(ctoLong.tokens.filter((t) => t.cto).length).toBe(total(ctoLong, 'ctos'));
  });

  it('keeps every preset ledger-sane: finite positive prices, holders match balances', () => {
    for (const r of [...Object.values(runs), ctoLong]) {
      for (const t of r.tokens) {
        const price = r.world.priceUsd(t);
        expect(Number.isFinite(price) && price > 0).toBe(true);
        for (const h of t.holders) expect(r.world.wallets.get(h)?.positions.get(t.address)?.balance ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('ground-truth export', () => {
  let built: BuiltApp;
  let gt: GroundTruthExport;

  beforeAll(async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    built = await buildApp(defaultConfig({ mode: 'demo', seed: 'gt-test', simScenario: 'bundle_launch', warmupMinutes: 12, snapshotEveryMs: 0 }), { start: false, persist: false });
    log.mockRestore();
    (built.ctx.analytics as Analytics).wallets.classifyAll();
    gt = exportGroundTruth(built.ctx, built.market as MarketSim, { seed: 'gt-test', minutes: 12 });
  }, 120_000);

  afterAll(async () => {
    await built?.close();
  });

  it('scores AUC by rank (ties count half)', () => {
    expect(auc([3, 4], [1, 2])).toBe(1);
    expect(auc([1, 2], [3, 4])).toBe(0);
    expect(auc([1, 1], [1, 1])).toBe(0.5);
    expect(auc([2, 3], [1, 3])).toBe(0.625);
    expect(auc([], [1])).toBeNull();
  });

  it('dumps the run: meta, the preset, every wallet with its archetype, every token with its fate and true cohorts', () => {
    const { world } = built.ctx;
    expect(gt.meta).toMatchObject({ seed: 'gt-test', scenario: 'bundle_launch', minutes: 12, tokens: world.tokens.size, wallets: world.wallets.size });
    expect(gt.scenario).toEqual(SCENARIOS.bundle_launch);
    expect(gt.wallets).toHaveLength(world.wallets.size);
    expect(gt.tokens).toHaveLength(world.tokens.size);
    const archetypes = new Set(gt.wallets.map((w) => w.archetype));
    for (const a of ['retail', 'smart', 'sniper', 'bot', 'dev']) expect(archetypes.has(a as never)).toBe(true);

    const tok = gt.tokens.find((t) => t.truth.bundlers.length > 0)!;
    const state = world.tokens.get(tok.address)!;
    expect(tok.fate).toBe(state.fate);
    expect(new Set(tok.truth.bundlers)).toEqual(state.bundlers);
    expect(new Set(tok.truth.devTeam)).toEqual(state.devTeam);
    // and it is plain JSON
    expect(JSON.parse(JSON.stringify(gt)).tokens).toHaveLength(gt.tokens.length);
  });

  it('reports label precision / recall per chain and overall, and the rug-risk AUC', () => {
    const { report } = gt;
    expect(Object.keys(report.walletTags).sort()).toEqual(['bot', 'fresh', 'sandwich', 'smart', 'sniper', 'whale']);
    for (const byChain of [...Object.values(report.walletTags), ...Object.values(report.tokenCohorts)]) {
      expect(Object.keys(byChain).sort()).toEqual([...CHAIN_IDS, 'all'].sort());
      for (const s of Object.values(byChain)) {
        for (const v of [s.precision, s.recall]) if (v !== null) expect(v >= 0 && v <= 1).toBe(true);
      }
      const sum = (k: 'tp' | 'fp' | 'fn') => CHAIN_IDS.reduce((a, c: ChainId) => a + byChain[c][k], 0);
      expect(byChain.all.tp).toBe(sum('tp'));
      expect(byChain.all.fn).toBe(sum('fn'));
    }
    // bundles are detected from the creation block: near-perfect on a bundle-heavy run
    expect(report.tokenCohorts.bundler.all.precision).toBeGreaterThan(0.9);
    expect(report.tokenCohorts.bundler.all.recall).toBeGreaterThan(0.9);
    expect(report.rugRiskAuc.all).toBeGreaterThan(0.6);
    expect(report.devTeam).toBe('not derived');
    const fates = CHAIN_IDS.reduce((a, c) => a + Object.values(report.fates[c]).reduce((x, n) => x + (n ?? 0), 0), 0);
    expect(fates).toBe(gt.tokens.length);
  });

  it('is never served over HTTP: no route, and API payloads carry no hidden truth', async () => {
    const { app } = built;
    for (const url of ['/api/ground-truth', '/api/sol/ground-truth', '/api/sim/truth']) expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    expect(app.printRoutes()).not.toMatch(/ground|truth/i);
    const tok = gt.tokens.find((t) => t.chain === 'sol' && t.truth.bundlers.length > 0)!;
    const detail = await app.inject({ method: 'GET', url: `/api/sol/tokens/${tok.address}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toMatch(/"fate"|"archetype"|"devTeam"/);
    const dev = await app.inject({ method: 'GET', url: `/api/sol/wallets/${built.ctx.world.tokens.get(tok.address)!.creator}` });
    expect(dev.statusCode).toBe(200);
    expect(dev.body).not.toMatch(/"archetype"|"role"/);
  });
});
