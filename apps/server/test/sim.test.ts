// Market simulator: launches, migrations, rugs, cohorts, ledger consistency,
// smart-money edge, determinism, snapshots and performance bounds.

import { deserialize, serialize } from 'node:v8';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CHAIN_IDS } from '@trenchscope/shared';
import type { AppContext } from '../src/context';
import { simOf } from '../src/sim/behaviors/fate';
import { memOf } from '../src/sim/behaviors/roster';
import { Engine } from '../src/sim/engine';
import { MarketSim, type MarketOptions } from '../src/sim/market';
import { NARRATIVES, RESERVED_TICKERS } from '../src/sim/names';
import { DUST_RATE, World, type TokenState } from '../src/sim/world';

const END_AT = Date.UTC(2026, 0, 1, 12);
const WARMUP_MIN = 90;
const HOUR = 3_600_000;

interface Sim {
  world: World;
  engine: Engine;
  market: MarketSim;
}

function makeSim(seed: string, opts?: MarketOptions): Sim {
  const world = new World(seed, END_AT);
  const engine = new Engine(world);
  const market = new MarketSim({ world, engine } as unknown as AppContext, opts);
  market.install();
  market.seedPopulation();
  return { world, engine, market };
}

function allTokens(world: World): TokenState[] {
  return [...world.tokens.values()];
}

let sim: Sim;
let warmupMs = 0;
/** The engine swallows (and logs) ticker exceptions, so failures surface here. */
let tickerErrors: unknown[][] = [];

beforeAll(() => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  sim = makeSim('sim-test');
  const t0 = performance.now();
  sim.engine.warmup(WARMUP_MIN * 60_000, 1000, END_AT);
  warmupMs = performance.now() - t0;
  tickerErrors = spy.mock.calls;
  spy.mockRestore();
}, 120_000);

describe('market simulator', () => {
  it('fast-forwards a 90 minute warmup within the time budget, without ticker errors', () => {
    expect(warmupMs).toBeLessThan(20_000);
    expect(tickerErrors).toEqual([]);
  });

  it('draws hidden fates from the configured mix (reputation-adjusted around it)', () => {
    const tokens = allTokens(sim.world);
    const share = (fate: string) => tokens.filter((t) => t.fate === fate).length / tokens.length;
    const targets: [string, number, number][] = [
      ['dud', 0.6, 0.05],
      ['rug', 0.12, 0.035],
      ['slow_rug', 0.08, 0.03],
      ['pump_dump', 0.11, 0.035],
      ['runner', 0.07, 0.03],
      ['moon', 0.02, 0.015],
    ];
    for (const [fate, target, tolerance] of targets) expect(Math.abs(share(fate) - target)).toBeLessThan(tolerance);
  });

  it('launches tokens on every chain at roughly the configured rates', () => {
    for (const c of CHAIN_IDS) {
      expect(sim.market.stats[c].launches).toBeGreaterThan(0);
      expect(sim.world.tokensByChain[c].length).toBe(sim.market.stats[c].launches);
    }
    // sol launches ~9/min (+-20% cycle, Poisson noise)
    expect(sim.market.stats.sol.launches).toBeGreaterThan(WARMUP_MIN * 9 * 0.6);
    expect(sim.market.stats.sol.launches).toBeLessThan(WARMUP_MIN * 9 * 1.4);
  });

  it('migrates a few percent of launches into AMM pools', () => {
    const migrated = allTokens(sim.world).filter((t) => t.status === 'migrated');
    expect(migrated.length).toBeGreaterThan(10);
    for (const t of migrated) {
      expect(t.pool).not.toBeNull();
      expect(t.migratedAt).toBeGreaterThanOrEqual(t.completedAt!);
    }
    const sol = sim.market.stats.sol;
    expect(sol.migrations / sol.launches).toBeGreaterThan(0.02);
    expect(sol.migrations / sol.launches).toBeLessThan(0.12);
  });

  it('rugs: the dev dumps everything and price collapses', () => {
    const rugs = allTokens(sim.world).filter((t) => t.fate === 'rug' && simOf(t).ruggedAt > 0);
    expect(rugs.length).toBeGreaterThan(20);
    for (const t of rugs) {
      const devPos = sim.world.wallets.get(t.creator)!.positions.get(t.address);
      expect(devPos?.balance ?? 0).toBe(0);
    }
    const drawdowns = rugs.map((t) => 1 - sim.world.marketCapUsd(t) / t.athMarketCapUsd);
    const avg = drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;
    expect(avg).toBeGreaterThan(0.6);
    expect(drawdowns.filter((d) => d > 0.8).length).toBeGreaterThan(rugs.length * 0.25);
  });

  it('keeps reserves and prices finite and positive', () => {
    for (const t of allTokens(sim.world)) {
      const price = sim.world.priceNative(t);
      expect(Number.isFinite(price) && price > 0).toBe(true);
      if (t.curve) {
        for (const v of [t.curve.virtualNative, t.curve.virtualTokens]) expect(Number.isFinite(v) && v > 0).toBe(true);
        for (const v of [t.curve.realNative, t.curve.realTokens]) expect(Number.isFinite(v) && v >= 0).toBe(true);
      }
      if (t.pool) {
        expect(Number.isFinite(t.pool.native) && t.pool.native > 0).toBe(true);
        expect(Number.isFinite(t.pool.tokens) && t.pool.tokens > 0).toBe(true);
      }
      expect(Number.isFinite(t.hype) && t.hype >= 0).toBe(true);
    }
    for (const w of sim.world.wallets.values()) expect(Number.isFinite(w.native) && w.native >= 0).toBe(true);
  });

  it('keeps token holder sets (and the sampling index) consistent with balances', () => {
    for (const t of allTokens(sim.world)) {
      const dust = t.totalSupply * DUST_RATE;
      for (const addr of t.traders) {
        const bal = sim.world.wallets.get(addr)!.positions.get(t.address)?.balance ?? 0;
        expect(t.holders.has(addr)).toBe(bal > dust);
      }
      const s = simOf(t);
      expect(s.holderList.length).toBe(t.holders.size);
      for (const [addr, i] of s.holderIdx) expect(s.holderList[i]).toBe(addr);
    }
  }, 30_000);

  it('bundlers buy in the creation block; snipers in the next few blocks', () => {
    const bundled = allTokens(sim.world).filter((t) => t.bundlers.size > 0);
    expect(bundled.length).toBeGreaterThan(20);
    for (const t of bundled) {
      const createdBlock = sim.world.blockAt(t.chain, t.createdAt);
      for (const addr of t.bundlers) {
        const first = sim.world.wallets.get(addr)!.positions.get(t.address)!.firstBuyAt!;
        expect(sim.world.blockAt(t.chain, first)).toBe(createdBlock);
      }
    }
    const sniped = allTokens(sim.world).filter((t) => t.snipers.size > 0);
    expect(sniped.length).toBeGreaterThan(20);
    for (const t of sniped.slice(0, 50)) {
      const createdBlock = sim.world.blockAt(t.chain, t.createdAt);
      for (const addr of t.snipers) {
        const first = sim.world.wallets.get(addr)!.positions.get(t.address)!.firstBuyAt!;
        const block = sim.world.blockAt(t.chain, first);
        expect(block).toBeGreaterThan(createdBlock);
        expect(block).toBeLessThanOrEqual(createdBlock + 4);
      }
    }
  });

  it('gives smart money a measurable edge (positive realized PnL, win rate > 50%)', () => {
    let realized = 0;
    let wins = 0;
    let positions = 0;
    for (const w of sim.world.wallets.values()) {
      if (w.archetype !== 'smart') continue;
      for (const pos of w.positions.values()) {
        const t = sim.world.tokens.get(pos.token);
        const unrealized = t ? pos.balance * sim.world.priceUsd(t) - pos.costBasisUsd : 0;
        realized += pos.realizedPnlUsd;
        positions++;
        if (pos.realizedPnlUsd + unrealized > 0) wins++;
      }
    }
    expect(positions).toBeGreaterThan(200);
    expect(realized).toBeGreaterThan(0);
    expect(wins / positions).toBeGreaterThan(0.5);
  });

  it('labels KOLs and funders but leaves algorithmic platform tags to analytics', () => {
    const kols = sim.world.walletsOf('sol', 'kol').map((a) => sim.world.wallets.get(a)!);
    expect(kols.length).toBe(60);
    for (const k of kols) {
      expect(k.label).toBeTruthy();
      expect([...k.tags]).toEqual(['kol']);
      expect(k.xFollowers).toBeGreaterThanOrEqual(5000);
      expect(k.xFollowers).toBeLessThanOrEqual(800_000);
    }
    const funders = sim.world.walletsOf('sol', 'retail').map((a) => sim.world.wallets.get(a)!).filter((w) => memOf(w).role === 'funder');
    expect(funders.map((f) => f.label)).toEqual(['SimEx Hot Wallet 1', 'SimEx Hot Wallet 2', 'SimEx Hot Wallet 3', 'SimEx Hot Wallet 4']);
    for (const w of sim.world.wallets.values()) if (w.archetype !== 'kol') expect(w.tags.size).toBe(0);
    // funding links point at real wallets
    const fresh = sim.world.walletsOf('sol', 'fresh').map((a) => sim.world.wallets.get(a)!);
    expect(fresh.length).toBeGreaterThan(50);
    for (const w of fresh) expect(memOf(sim.world.wallets.get(w.fundedBy!)!).role).toBe('funder');
  });

  it('gives tokens original identities across narratives, with some copycats', () => {
    const tokens = allTokens(sim.world);
    const narratives = new Set(tokens.map((t) => t.narrative));
    expect(narratives.size).toBeGreaterThanOrEqual(12);
    for (const n of narratives) expect(NARRATIVES.some((d) => d.name === n)).toBe(true);
    const copycats = tokens.filter((t) => t.isCopycat).length / tokens.length;
    expect(copycats).toBeGreaterThan(0.03);
    expect(copycats).toBeLessThan(0.15);
    for (const t of tokens) {
      expect(t.symbol).toMatch(/^[A-Z0-9]{2,6}$/);
      expect(RESERVED_TICKERS.has(t.symbol)).toBe(false);
      expect(t.logoGlyph.length).toBeGreaterThan(0);
      if (t.socials.twitter) expect(t.socials.twitter).toMatch(/^https:\/\/x\.com\/\w+$/);
    }
  });

  it('puts quiet tokens to sleep and trims their history', () => {
    const dormant = allTokens(sim.world).filter((t) => t.dormant);
    expect(dormant.length).toBeGreaterThan(100);
    for (const t of dormant) {
      expect(t.trades.length).toBeLessThanOrEqual(200);
      expect(t.candles['1s']).toHaveLength(0);
      expect(t.candles['15s']).toHaveLength(0);
      expect(t.watchers).toBe(0);
    }
    // dormant tokens are occasionally rediscovered on every chain, the busiest included
    expect(sim.market.stats.sol.revivals).toBeGreaterThan(0);
  });

  it('keeps live throughput and tick cost in range', () => {
    const before = sim.market.stats.sol.trades;
    let cost = 0;
    const steps = 240; // one minute of 250ms ticks
    for (let i = 0; i < steps; i++) {
      const t0 = performance.now();
      sim.engine.step(250);
      cost += performance.now() - t0;
    }
    const solTps = (sim.market.stats.sol.trades - before) / 60;
    expect(solTps).toBeGreaterThan(5);
    expect(solTps).toBeLessThan(60);
    expect(cost / steps).toBeLessThan(15);
  }, 30_000);

  it('round-trips through a v8 snapshot and keeps simulating', () => {
    const snap = deserialize(serialize({ world: sim.world.serialize(), market: sim.market.serialize() })) as {
      world: ReturnType<World['serialize']>;
      market: unknown;
    };
    const world = World.restore(snap.world);
    const engine = new Engine(world);
    const market = new MarketSim({ world, engine } as unknown as AppContext);
    market.install();
    market.restore(snap.market);
    expect(market.stats).toEqual(sim.market.stats);
    // the server comes back hours later: the engine jumps the clock, the market must not replay the gap at once
    world.now += 3 * HOUR;
    const trades = world.tradeTotal;
    engine.step(250);
    expect(world.tradeTotal - trades).toBeLessThan(3000);
    for (let i = 0; i < 120; i++) engine.step(500);
    expect(world.tradeTotal).toBeGreaterThan(trades);
    const launched = CHAIN_IDS.reduce((n, c) => n + market.stats[c].launches, 0);
    expect(launched).toBeGreaterThan(CHAIN_IDS.reduce((n, c) => n + sim.market.stats[c].launches, 0));
  }, 60_000);

  it('seeds the population when restoring a world saved without market state', () => {
    const world = new World('stale-snapshot', END_AT);
    const engine = new Engine(world);
    const market = new MarketSim({ world, engine } as unknown as AppContext);
    market.install();
    market.restore(null);
    expect(world.walletsOf('sol', 'retail').length).toBeGreaterThan(1000);
    for (let i = 0; i < 120; i++) engine.step(1000);
    expect(market.stats.sol.launches).toBeGreaterThan(0);
    expect(world.tradeTotal).toBeGreaterThan(0);
  });
});

describe('pruning', () => {
  it('caps tokens per chain by deleting old dormant tokens no human traded', () => {
    const cap = 150;
    const { world, engine, market } = makeSim('prune-test', { maxTokensPerChain: cap });
    const user = world.createWallet('sol', 'user', { native: 100 });
    let held: TokenState | undefined;
    engine.addTicker(
      'paper-trader',
      () => {
        held ??= world.tokens.get(world.tokensByChain.sol[0]);
        if (held && !user.positions.has(held.address)) world.executeSwap(user, held, 'buy', 0.5);
      },
      { duringWarmup: true },
    );
    engine.warmup(75 * 60_000, 1000, END_AT);

    const sol = world.tokensByChain.sol;
    expect(market.stats.sol.pruned).toBeGreaterThan(0);
    expect(sol.length).toBe(market.stats.sol.launches - market.stats.sol.pruned);
    expect(sol.every((a) => world.tokens.has(a))).toBe(true);
    expect(allTokens(world).filter((t) => t.chain === 'sol')).toHaveLength(sol.length);
    // what is left over the cap is either still active or was traded by a human
    const prunable = sol.filter((a) => {
      const t = world.tokens.get(a)!;
      return t.dormant && ![...t.traders].some((w) => world.wallets.get(w)?.archetype === 'user');
    });
    expect(sol.length <= cap || prunable.length <= cap * 0.04 + 10).toBe(true);
    expect(world.tokens.has(held!.address)).toBe(true);
    // wallets keep their position records for deleted tokens
    expect([...world.wallets.values()].some((w) => [...w.positions.keys()].some((a) => !world.tokens.has(a)))).toBe(true);
  }, 60_000);

  it('never prunes a token a user launched, even one they never bought', () => {
    const { world, engine, market } = makeSim('prune-launch-test', { maxTokensPerChain: 150 });
    const user = world.createWallet('sol', 'user', { native: 100, accountId: 'acc_test' });
    let launched: TokenState | undefined;
    engine.addTicker(
      'user-launch',
      () => {
        if (launched) return;
        launched = world.createToken({
          chain: 'sol',
          launchpad: 'moonpit',
          creator: user,
          symbol: 'MINE',
          name: 'Mine',
          description: '',
          logoSeed: 'mine',
          logoGlyph: '🐸',
          narrative: 'Frogs',
          socials: {},
          xFollowers: null,
          fate: 'dud',
          hype: 0,
        });
        market.adopt(launched);
      },
      { duringWarmup: true },
    );
    engine.warmup(75 * 60_000, 1000, END_AT);

    expect(market.stats.sol.pruned).toBeGreaterThan(0);
    expect(launched!.dormant).toBe(true);
    expect(launched!.traders.has(user.address)).toBe(false);
    expect(world.tokens.has(launched!.address)).toBe(true);
  }, 60_000);

  it('keeps pinned tokens and sweeps single-use crew wallets whose tokens are gone', () => {
    const { world, engine, market } = makeSim('prune-pin-test', { maxTokensPerChain: 150 });
    const removed = new Set<string>();
    world.on('walletsRemoved', (addrs) => addrs.forEach((a) => removed.add(a)));
    let pinned: string | undefined;
    world.addPinSource(() => (pinned ? [pinned] : []));
    engine.addTicker('pin-first', () => (pinned ??= world.tokensByChain.sol[0]), { duringWarmup: true });
    engine.warmup(75 * 60_000, 1000, END_AT);

    expect(market.stats.sol.pruned).toBeGreaterThan(0);
    expect(world.tokens.has(pinned!)).toBe(true);
    expect(removed.size).toBeGreaterThan(0);
    for (const addr of removed) expect(world.wallets.has(addr)).toBe(false);
    // no surviving token still references a swept wallet
    for (const t of world.tokens.values()) for (const addr of t.holders) expect(removed.has(addr)).toBe(false);
    // archetype indexes stay consistent with the wallet map
    for (const byArch of Object.values(world.walletsByArchetype))
      for (const list of byArch.values()) for (const addr of list) expect(world.wallets.has(addr)).toBe(true);
  }, 60_000);
});

describe('determinism', () => {
  const firstTokens = (seed: string): string[] => {
    const s = makeSim(seed);
    s.engine.warmup(5 * 60_000, 1000, END_AT);
    return s.world.tokensByChain.sol.slice(0, 20);
  };

  it('same seed => same world', () => {
    const a = firstTokens('det-seed');
    expect(a).toHaveLength(20);
    expect(firstTokens('det-seed')).toEqual(a);
  });

  it('different seed => different world', () => {
    expect(firstTokens('det-seed-2')).not.toEqual(firstTokens('det-seed'));
  });
});
