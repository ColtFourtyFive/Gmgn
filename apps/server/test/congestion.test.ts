// Network congestion (sim/congestion.ts): the load model, its exposure on /api/meta (label and
// scaled priority-fee tiers), and what it does to paper trades (landing latency, expired low bids).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAIN_IDS, type AuthResponse, type MetaResponse, type SwapReceipt, type TradePreset } from '@trenchscope/shared';
import { Accounts } from '../src/accounts';
import { defaultSettings } from '../src/accounts/settings';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { CONGESTION_BASE, congestionLabel, congestionOf, newCongestionModel, priorityFeeTiers, stepCongestion, type CongestionModel } from '../src/sim/congestion';
import type { Rng } from '../src/sim/rng';
import { TX_EXPIRED, expiresUnderCongestion, landingLatencyMs } from '../src/trading/execution';

/** An rng that never starts a launch rush (and draws `float` / `int` at fixed values). */
const quiet = { chance: () => false, float: () => 0.8, int: () => 300 } as unknown as Rng;
const rushing = { ...quiet, chance: () => true } as unknown as Rng;

/** Feed the model `rate` trades/s for `seconds`, in 5s ambient steps; returns the last level. */
function run(m: CongestionModel, rate: number, seconds: number, rng: Rng = quiet, settling = false): number {
  let level = 0;
  for (let t = 0; t < seconds; t += 5) level = stepCongestion(m, rng, 5, m.trades + rate * 5, settling);
  return level;
}

describe('congestion model', () => {
  it('reads calm at a steady rate, rises with a burst over the baseline and settles back', () => {
    const m = newCongestionModel(0);
    expect(run(m, 10, 1800)).toBeCloseTo(CONGESTION_BASE, 9);
    const burst = run(m, 40, 120);
    expect(burst).toBeGreaterThan(0.6);
    expect(congestionLabel(burst)).toBe('busy');
    expect(congestionLabel(run(m, 10, 600))).toBe('normal');
    // throughput alone never congests (surge is capped at 0.5)
    expect(run(m, 10_000, 600)).toBeLessThanOrEqual(CONGESTION_BASE + 0.5);
  });

  it('reads the warm-up ramp (a market growing from nothing) as calm, then measures surges from there', () => {
    const m = newCongestionModel(0);
    let level = 0;
    for (let rate = 1; rate <= 25; rate++) level = run(m, rate, 120, quiet, true);
    expect(level).toBeCloseTo(CONGESTION_BASE, 9);
    expect(m.slow).toBe(m.fast);
    // the same ramp live is a surge
    const live = newCongestionModel(0);
    for (let rate = 1; rate <= 25; rate++) level = run(live, rate, 120);
    expect(congestionLabel(level)).toBe('busy');
    // after the warm-up a steady rate stays calm and a burst still shows
    expect(run(m, 25, 600)).toBeLessThan(0.2);
    expect(run(m, 75, 120)).toBeGreaterThan(0.6);
  });

  it('spikes on a launch rush and decays with a 4 min time constant', () => {
    const m = newCongestionModel(0);
    run(m, 10, 600);
    const spiked = stepCongestion(m, rushing, 5, m.trades + 50);
    expect(m.rush).toBeCloseTo(0.8, 9);
    expect(spiked).toBeGreaterThanOrEqual(0.9);
    expect(congestionLabel(spiked)).toBe('congested');
    run(m, 10, 240);
    expect(m.rush).toBeCloseTo(0.8 * Math.exp(-1), 6);
    expect(congestionLabel(run(m, 10, 600))).toBe('normal');
  });

  it('labels levels and scales the fee tiers with them', () => {
    expect([0.39, 0.4, 0.69, 0.7].map(congestionLabel)).toEqual(['normal', 'busy', 'busy', 'congested']);
    expect(congestionOf(0.71234)).toEqual({ level: 0.712, label: 'congested' });
    const calm = priorityFeeTiers('sol', CONGESTION_BASE);
    expect([calm.low, calm.medium, calm.high].map((f) => +f.toPrecision(12))).toEqual([0.00005, 0.0001, 0.0003]);
    const congested = priorityFeeTiers('sol', 0.9);
    expect(congested.medium).toBeCloseTo(0.0001 * (1 + 3 * 0.7), 12);
    expect(congested.low / congested.medium).toBeCloseTo(0.5, 12);
    expect(congested.high / congested.medium).toBeCloseTo(3, 12);
  });
});

describe('congestion in the simulated market', () => {
  it('is deterministic per seed and published on /api/meta with matching fee tiers', async () => {
    const levels = async () => {
      const b = await buildApp(defaultConfig({ warmupMinutes: 20, snapshotEveryMs: 0, seed: 'congestion' }), { start: false, persist: false });
      try {
        const meta = (await b.app.inject({ method: 'GET', url: '/api/meta' })).json() as MetaResponse;
        for (const c of meta.chains) {
          const level = b.ctx.world.chains[c.chain].congestion;
          expect(c.congestion).toEqual(congestionOf(level));
          expect(c.priorityFee).toEqual(priorityFeeTiers(c.chain, level));
        }
        return CHAIN_IDS.map((c) => b.ctx.world.chains[c].congestion);
      } finally {
        await b.close();
      }
    };
    const first = await levels();
    expect(first.every((l) => l >= CONGESTION_BASE && l <= 1)).toBe(true);
    expect(await levels()).toEqual(first);
  }, 60_000);
});

describe('congestion and paper trades', () => {
  const preset = (patch: Partial<TradePreset>): TradePreset => ({ id: 'P2', slippage: 0.2, autoSlippage: false, priorityFee: 0.0001, tip: 0, antiMev: false, ...patch });

  it('stretches landing latency with the level, less for higher bids', () => {
    const low = preset({ priorityFee: 0 });
    expect(landingLatencyMs(quiet, 'sol', low, CONGESTION_BASE)).toBe(300);
    expect(landingLatencyMs(quiet, 'sol', preset({ priorityFee: 0, antiMev: true }), CONGESTION_BASE)).toBe(450);
    expect(landingLatencyMs(quiet, 'sol', low, 0.9)).toBe(Math.round(300 * (1 + 3 * 0.7)));
    const tiers = priorityFeeTiers('sol', 0.9);
    expect(landingLatencyMs(quiet, 'sol', preset({ priorityFee: tiers.medium }), 0.9)).toBe(Math.round(300 * (1 + 3 * 0.7 * 0.5)));
    expect(landingLatencyMs(quiet, 'sol', preset({ priorityFee: tiers.high }), 0.9)).toBe(Math.round(300 * (1 + 3 * 0.7 * 0.25)));
    // the anti-MEV tip counts toward the bid
    expect(landingLatencyMs(quiet, 'sol', preset({ priorityFee: 0, tip: tiers.high, antiMev: true }), 0.9)).toBe(Math.round(450 * (1 + 3 * 0.7 * 0.25)));
  });

  it('lands every default preset but Economy at full congestion', () => {
    const settings = defaultSettings();
    for (const chain of CHAIN_IDS) {
      const presets = settings.trade[chain].buyPresets;
      // `rushing` answers every chance with yes: only the fee check can save the bid
      expect(expiresUnderCongestion(rushing, chain, presets.P2, 1), `${chain} P2`).toBe(false);
      expect(expiresUnderCongestion(rushing, chain, presets.P3, 1), `${chain} P3`).toBe(false);
    }
  });

  it('expires bids below the low tier only while congested, with p = 0.25 + (level - 0.7)', () => {
    const odds: number[] = [];
    const spy = { ...quiet, chance: (p: number) => (odds.push(p), true) } as unknown as Rng;
    const below = preset({ priorityFee: priorityFeeTiers('sol', 0.8).low * 0.99 });
    expect(expiresUnderCongestion(spy, 'sol', below, 0.8)).toBe(true);
    expect(odds[0]).toBeCloseTo(0.35, 12);
    expect(expiresUnderCongestion(spy, 'sol', below, 0.69)).toBe(false);
    expect(expiresUnderCongestion(spy, 'sol', preset({ priorityFee: priorityFeeTiers('sol', 0.8).low }), 0.8)).toBe(false);
    expect(odds).toHaveLength(1);
  });

  describe('through the swap route', () => {
    let built: BuiltApp;
    beforeEach(async () => {
      vi.stubEnv('TRADE_LATENCY_MS', '0');
      built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
    });
    afterEach(async () => {
      await built.close();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('fails an expired swap without charging anything, and lands it with a competitive fee', async () => {
      const { world } = built.ctx;
      const dev = world.createWallet('sol', 'dev', { native: 100 });
      const token = world.createToken({
        chain: 'sol',
        launchpad: 'moonpit',
        creator: dev,
        symbol: 'JAM',
        name: 'Traffic Jam',
        description: '',
        logoSeed: 'jam',
        logoGlyph: '🐸',
        narrative: 'Frogs',
        socials: {},
        xFollowers: null,
        fate: 'runner',
        hype: 1,
      });
      const auth = ((await built.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} })).json() as AuthResponse).token;
      const wallet = (built.ctx.accounts as Accounts).walletFor(built.ctx.accounts.resolveToken(auth)!, 'sol');
      const swap = async (priorityFee: number) =>
        (await built.app.inject({
          method: 'POST',
          url: '/api/trade/swap',
          headers: { authorization: `Bearer ${auth}` },
          payload: { chain: 'sol', token: token.address, side: 'buy', amount: 0.5, amountKind: 'native', priorityFee, antiMev: false },
        })).json() as SwapReceipt;

      world.chains.sol.congestion = 0.85;
      vi.spyOn(world.rng, 'chance').mockReturnValue(true);
      const before = wallet.native;
      const expired = await swap(0);
      expect(expired).toMatchObject({ ok: false, error: TX_EXPIRED });
      expect(expired.trade).toBeUndefined();
      expect(wallet.native).toBe(before);
      expect(wallet.positions.has(token.address)).toBe(false);

      const landed = await swap(priorityFeeTiers('sol', 0.85).low);
      expect(landed.ok).toBe(true);
      // busy, not congested: even a zero bid lands
      world.chains.sol.congestion = 0.6;
      expect((await swap(0)).ok).toBe(true);
    });
  });
});
