// Token-side analytics: filters, security, holders / top traders, lists,
// search, routes, realtime channels, performance and rug-ratio evaluation.

import { deserialize, serialize } from 'node:v8';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CHAIN_IDS,
  EARLY_BUYERS_LIMIT,
  STAT_WINDOWS,
  launchpadsFor,
  type Candle,
  type ChainId,
  type EarlyBuyersResponse,
  type Position,
  type SafetyScore,
  type TokenFilters,
  type TokenSummary,
  type Trade,
  type TrenchesSnapshot,
  type WalletTag,
  type WindowStats,
  type WsServerMessage,
} from '@trenchscope/shared';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import type { AppContext } from '../src/context';
import {
  FilterParseError,
  inRange,
  matchTokenFilters,
  parseTokenFiltersParam,
  parseTrenchesFiltersParam,
} from '../src/analytics/filters';
import { tokenAnalyticsFor, type TokenAnalytics } from '../src/analytics/tokens';
import { parseTrenchesSub } from '../src/analytics/tokens/channels';
import { RUG_WEIGHTS, rugRatio, rugSignals, safetyScore, type RugInputs, type SafetyInputs } from '../src/analytics/tokens/security';
import { computeWindows, computeWindowsCached, multiWindowStats, priceChangeAt, repriceWindows, type WindowsBase } from '../src/analytics/tokens/stats';
import type { TokenFate, TokenState, WalletState, World } from '../src/sim/world';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Fx {
  built: BuiltApp;
  ctx: AppContext;
  world: World;
  ta: TokenAnalytics;
  /** Deterministic platform tags (replaces wallet-side classification in these tests). */
  tags: Map<string, WalletTag[]>;
}

async function setup(): Promise<Fx> {
  const built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
  const ctx = built.ctx;
  const tags = new Map<string, WalletTag[]>();
  ctx.analytics.walletTags = (w: WalletState) => tags.get(w.address) ?? [];
  return { built, ctx, world: ctx.world, ta: tokenAnalyticsFor(ctx)!, tags };
}

let uid = 0;
const sym = (p: string) => `${p}${(uid++).toString(36).toUpperCase()}`;

function wallet(fx: Fx, chain: ChainId, opts: Parameters<World['createWallet']>[2] = {}, tags: WalletTag[] = []): WalletState {
  const w = fx.world.createWallet(chain, 'retail', { native: 1e6, ...opts });
  fx.tags.set(w.address, tags);
  return w;
}

function token(
  fx: Fx,
  chain: ChainId,
  creator: WalletState,
  symbol: string,
  extra: Partial<Parameters<World['createToken']>[0]> = {},
): TokenState {
  return fx.world.createToken({
    chain,
    launchpad: launchpadsFor(chain)[0].id,
    creator,
    symbol,
    name: `${symbol} Coin`,
    description: 'test token',
    logoSeed: symbol,
    logoGlyph: '🐸',
    narrative: 'Frogs',
    socials: {},
    xFollowers: null,
    fate: 'dud',
    hype: 0,
    ...extra,
  });
}

function buy(fx: Fx, w: WalletState, t: TokenState, native: number) {
  const r = fx.world.executeSwap(w, t, 'buy', native);
  expect(r.ok, r.error).toBe(true);
  return r.trade!;
}

function sell(fx: Fx, w: WalletState, t: TokenState, tokens: number) {
  const r = fx.world.executeSwap(w, t, 'sell', tokens);
  expect(r.ok, r.error).toBe(true);
  return r.trade!;
}

const bal = (w: WalletState, t: TokenState) => w.positions.get(t.address)?.balance ?? 0;
/** Window stats equal up to floating-point summation order (counts exact). */
function expectStatsClose(a: WindowStats, b: WindowStats) {
  for (const k of ['swaps', 'buys', 'sells', 'makers'] as const) expect(a[k], k).toBe(b[k]);
  for (const k of ['volumeUsd', 'buyVolumeUsd', 'sellVolumeUsd', 'priceChange'] as const) expect(Math.abs(a[k] - b[k]), k).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(b[k])));
}
/** Move sim time forward (bypasses the 1s DTO cache floor). */
const tick = (fx: Fx, ms = 1500) => {
  fx.world.now += ms;
};

/** A token past the launch blocks with `n` ordinary buyers. */
function tokenWithBuyers(fx: Fx, chain: ChainId, prefix: string, n: number, base = 0.2): { t: TokenState; dev: WalletState; buyers: WalletState[] } {
  const dev = wallet(fx, chain);
  const t = token(fx, chain, dev, sym(prefix));
  tick(fx, 20_000);
  const buyers: WalletState[] = [];
  for (let i = 0; i < n; i++) {
    const w = wallet(fx, chain);
    buy(fx, w, t, base * (i + 1));
    buyers.push(w);
  }
  tick(fx);
  return { t, dev, buyers };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe('TokenFilters matcher', () => {
  let fx: Fx;
  let base: TokenSummary;
  beforeAll(async () => {
    fx = await setup();
    const { t } = tokenWithBuyers(fx, 'sol', 'FLT', 3);
    base = fx.ta.summary(t);
  });
  afterAll(() => fx.built.close());

  const variant = (patch: (s: TokenSummary) => void): TokenSummary => {
    const s = structuredClone(base);
    patch(s);
    return s;
  };
  const m = (s: TokenSummary, f: TokenFilters, window: '1h' | '24h' = '24h') => matchTokenFilters(s, f, window, fx.world.now);

  it('treats ranges as inclusive and open-ended', () => {
    expect(inRange(5, { min: 5, max: 5 })).toBe(true);
    expect(inRange(5, { min: 5.0001 })).toBe(false);
    expect(inRange(5, { max: 4.9999 })).toBe(false);
    expect(inRange(5, {})).toBe(true);
    expect(inRange(5, undefined)).toBe(true);
    expect(m(base, {})).toBe(true);
    expect(m(base, { marketCapUsd: { min: base.marketCapUsd, max: base.marketCapUsd } })).toBe(true);
    expect(m(base, { marketCapUsd: { min: base.marketCapUsd * 1.01 } })).toBe(false);
    expect(m(base, { liquidityUsd: { max: base.liquidityUsd - 1 } })).toBe(false);
    expect(m(base, { holderCount: { min: 3, max: 3 } })).toBe(true);
    expect(m(base, { holderCount: { min: 4 } })).toBe(false);
    expect(m(base, { progress: { max: 0.0001 } })).toBe(false);
  });

  it('matches keyword / exclusions / launchpads / age', () => {
    expect(m(base, { keyword: base.symbol.toLowerCase() })).toBe(true);
    expect(m(base, { keyword: `$${base.symbol}` })).toBe(true);
    expect(m(base, { keyword: 'coin' })).toBe(true); // name contains
    expect(m(base, { keyword: 'zzzz-nope' })).toBe(false);
    expect(m(base, { excludeKeywords: ['COIN'] })).toBe(false);
    expect(m(base, { excludeKeywords: ['zzzz'] })).toBe(true);
    expect(m(base, { launchpads: [base.launchpad] })).toBe(true);
    expect(m(base, { launchpads: ['other'] })).toBe(false);
    expect(m(base, { launchpads: [] })).toBe(true);
    const ageMin = (fx.world.now - base.createdAt) / 60000;
    expect(m(base, { ageMinutes: { min: ageMin - 0.01, max: ageMin + 0.01 } })).toBe(true);
    expect(m(base, { ageMinutes: { max: ageMin - 0.01 } })).toBe(false);
  });

  it('evaluates volume / swaps / priceChange on the list window', () => {
    const s = variant((x) => {
      x.stats['1h'].volumeUsd = 10;
      x.stats['24h'].volumeUsd = 5000;
      x.stats['1h'].swaps = 2;
      x.stats['24h'].swaps = 50;
      x.stats['1h'].priceChange = -0.5;
      x.stats['24h'].priceChange = 2;
    });
    expect(m(s, { volumeUsd: { min: 1000 } }, '24h')).toBe(true);
    expect(m(s, { volumeUsd: { min: 1000 } }, '1h')).toBe(false);
    expect(m(s, { swaps: { min: 10 } }, '1h')).toBe(false);
    expect(m(s, { swaps: { min: 10 } }, '24h')).toBe(true);
    expect(m(s, { priceChange: { min: 0 } }, '1h')).toBe(false);
    expect(m(s, { priceChange: { min: 0 } }, '24h')).toBe(true);
  });

  it('matches security, cohort and count ranges', () => {
    const s = variant((x) => {
      x.security.top10HolderRate = 0.4;
      x.security.devHoldRate = 0.1;
      x.security.insiderHoldRate = 0.2;
      x.security.sniperHoldRate = 0.05;
      x.security.bundlerRate = 0.3;
      x.security.rugRatio = 0.25;
      x.security.freshWalletRate = 0.6;
      x.smartDegenCount = 2;
      x.kolCount = 1;
      x.devCreatedCount = 7;
      x.devMigratedCount = 0;
    });
    expect(m(s, { top10HolderRate: { max: 0.4 } })).toBe(true);
    expect(m(s, { top10HolderRate: { max: 0.39 } })).toBe(false);
    expect(m(s, { devHoldRate: { max: 0.05 } })).toBe(false);
    expect(m(s, { insiderHoldRate: { max: 0.3 } })).toBe(true);
    expect(m(s, { sniperHoldRate: { min: 0.06 } })).toBe(false);
    expect(m(s, { bundlerRate: { max: 0.3 } })).toBe(true);
    expect(m(s, { rugRatio: { max: 0.2 } })).toBe(false);
    expect(m(s, { freshWalletRate: { max: 0.5 } })).toBe(false);
    expect(m(s, { smartDegenCount: { min: 1 } })).toBe(true);
    expect(m(s, { kolCount: { min: 2 } })).toBe(false);
    expect(m(s, { devCreatedCount: { max: 5 } })).toBe(false);
    expect(m(s, { devMigratedCount: { min: 1 } })).toBe(false);
  });

  it('matches boolean toggles', () => {
    const plain = variant((x) => {
      x.socials = {};
    });
    const social = variant((x) => {
      x.socials = { twitter: 'https://x.com/a', telegram: 'https://t.me/a' };
    });
    expect(m(plain, { requireSocials: true })).toBe(false);
    expect(m(social, { requireSocials: true })).toBe(true);
    expect(m(social, { requireTwitter: true, requireTelegram: true })).toBe(true);
    expect(m(social, { requireWebsite: true })).toBe(false);
    const devSold = variant((x) => {
      x.security.devStatus = 'sold_all';
    });
    expect(m(devSold, { hideDevSold: true })).toBe(false);
    expect(m(devSold, { onlyDevSold: true })).toBe(true);
    expect(m(base, { onlyDevSold: true })).toBe(false);
    const copy = variant((x) => {
      x.isCopycat = true;
      x.boosted = true;
      x.security.isWashTrading = true;
    });
    expect(m(copy, { hideCopycats: true })).toBe(false);
    expect(m(base, { hideCopycats: true })).toBe(true);
    expect(m(copy, { boostedOnly: true })).toBe(true);
    expect(m(base, { boostedOnly: true })).toBe(false);
    expect(m(copy, { hideWashTrading: true })).toBe(false);
    // safeOnly is chain-aware: SOL needs mint + freeze renounced
    expect(m(base, { safeOnly: true })).toBe(true);
    expect(m(variant((x) => (x.security.renouncedFreeze = false)), { safeOnly: true })).toBe(false);
    const evm = variant((x) => {
      x.chain = 'bsc';
      x.security = { ...x.security, renouncedMint: null, renouncedFreeze: null, isHoneypot: false, isOpenSource: true, isRenounced: true };
    });
    expect(m(evm, { safeOnly: true })).toBe(true);
    expect(m({ ...evm, security: { ...evm.security, isOpenSource: null } }, { safeOnly: true })).toBe(false);
    expect(m({ ...evm, security: { ...evm.security, isHoneypot: true } }, { safeOnly: true })).toBe(false);
    // lpBurned: curve tokens have no LP
    expect(m(base, { lpBurned: true })).toBe(false);
    expect(m(variant((x) => (x.security.lpBurnedRate = 1)), { lpBurned: true })).toBe(true);
    expect(m(variant((x) => (x.security.lpBurnedRate = 0.5)), { lpBurned: true })).toBe(false);
  });

  it('parses and strictly validates JSON filter params', () => {
    expect(parseTokenFiltersParam(undefined)).toBeUndefined();
    expect(parseTokenFiltersParam(JSON.stringify({ marketCapUsd: { min: 1, max: null } }))).toEqual({ marketCapUsd: { min: 1 } });
    expect(() => parseTokenFiltersParam('{bad')).toThrow(FilterParseError);
    expect(() => parseTokenFiltersParam(JSON.stringify({ bogus: 1 }))).toThrow(FilterParseError);
    expect(() => parseTokenFiltersParam(JSON.stringify({ marketCapUsd: { min: 'x' } }))).toThrow(FilterParseError);
    expect(parseTrenchesFiltersParam(JSON.stringify({ new: { holderCount: { min: 10 } } }))).toEqual({ new: { holderCount: { min: 10 } } });
    expect(() => parseTrenchesFiltersParam(JSON.stringify({ newest: {} }))).toThrow(FilterParseError);
  });
});

// ---------------------------------------------------------------------------
// Summaries, stats, security
// ---------------------------------------------------------------------------

describe('summary, stats and security', () => {
  let fx: Fx;
  beforeAll(async () => {
    fx = await setup();
  });
  afterAll(() => fx.built.close());

  it('multiWindowStats matches World.windowStats for every window', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'WIN', 4);
    // spread trades across minutes and hours
    for (let i = 0; i < 40; i++) {
      tick(fx, (i % 7) * 37_000 + 1000);
      const w = buyers[i % buyers.length];
      if (i % 3 === 0 && bal(w, t) > 0) sell(fx, w, t, bal(w, t) / 3);
      else buy(fx, w, t, 0.05 + (i % 5) * 0.03);
    }
    tick(fx, 2 * 3600_000);
    buy(fx, buyers[0], t, 0.1);
    for (const offset of [0, 30_000, 5 * 60_000, 3600_000]) {
      const now = fx.world.now + offset;
      const price = fx.world.priceUsd(t);
      const all = multiWindowStats(t, now, price);
      for (const w of STAT_WINDOWS) {
        const ref = fx.world.windowStats(t, w, now);
        expect(all[w]).toEqual(ref);
        expect(priceChangeAt(t, { '1m': 60e3, '5m': 300e3, '1h': 3600e3, '6h': 21600e3, '24h': 86400e3 }[w], now, price)).toBeCloseTo(ref.priceChange, 12);
      }
    }
    const s = fx.ta.summary(t);
    expect(s.netBuy24hUsd).toBeCloseTo(s.stats['24h'].buyVolumeUsd - s.stats['24h'].sellVolumeUsd, 6);
    expect(t.cache.volume24hUsd).toBe(s.stats['24h'].volumeUsd);
  });

  it('incremental window stats (cached immutable buckets) match World.windowStats as trades and minutes roll', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'INC', 5);
    let base: WindowsBase | undefined;
    let reused = 0;
    let checks = 0;
    const check = () => {
      const now = fx.world.now;
      const price = fx.world.priceUsd(t);
      const r = computeWindowsCached(t, now, price, base);
      if (r.base === base) reused++;
      base = r.base;
      const full = computeWindows(t, now, price);
      expect(r.snapshot.open).toEqual(full.open);
      expect(r.snapshot.validUntil).toBe(full.validUntil);
      for (const w of STAT_WINDOWS) {
        const ref = fx.world.windowStats(t, w, now);
        expectStatsClose(r.snapshot.stats[w], ref);
        checks++;
      }
    };
    // bursts inside one minute (base reused), minute rollovers, idle gaps that empty short windows
    const gaps = [700, 900, 12_000, 47_000, 61_000, 2_000, 400, 5 * 60_000 + 3000, 1500, 59_999, 1, 3600_000 + 7000, 800];
    for (let i = 0; i < 160; i++) {
      tick(fx, gaps[i % gaps.length]);
      const w = buyers[i % buyers.length];
      if (i % 4 === 1 && bal(w, t) > 0) sell(fx, w, t, bal(w, t) / 2);
      else buy(fx, w, t, 0.02 + (i % 6) * 0.01);
      check();
      if (i % 5 === 0) {
        tick(fx, 15_000); // no trade: same buckets, maybe a new minute
        check();
      }
    }
    expect(reused).toBeGreaterThan(20);
    expect(checks).toBeGreaterThan(900);
  });

  it('reprices idle windows exactly until a bucket ages out', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'IDL', 3);
    tick(fx, 90_000);
    buy(fx, buyers[0], t, 0.2);
    tick(fx, 20_000);
    buy(fx, buyers[1], t, 0.1);
    const t0 = fx.world.now;
    const snap = computeWindows(t, t0, fx.world.priceUsd(t));
    expect(snap.validUntil).toBeGreaterThan(t0);
    expect(snap.validUntil).toBeLessThanOrEqual(t0 + 2 * 60_000);
    const native = fx.world.nativeUsd('sol');
    fx.world.setNativeUsd('sol', native * 1.07);
    const later = snap.validUntil - 1;
    const price = fx.world.priceUsd(t);
    expect(repriceWindows(snap, price).stats).toEqual(computeWindows(t, later, price).stats);
    // after the boundary a full recompute differs (the 1m window emptied)
    expect(computeWindows(t, snap.validUntil + 1, price).stats['1m'].swaps).toBeLessThan(snap.stats['1m'].swaps);
    // summaries of idle tokens get a light refresh: live price, reused security
    const a = fx.ta.summary(t);
    tick(fx, 6000);
    fx.world.setNativeUsd('sol', native * 1.2);
    const b = fx.ta.summary(t);
    expect(b).not.toBe(a);
    expect(b.security).toBe(a.security);
    expect(b.priceUsd).toBeCloseTo(fx.world.priceUsd(t), 12);
    expectStatsClose(b.stats['24h'], fx.world.windowStats(t, '24h'));
    fx.world.setNativeUsd('sol', native);
  });

  it('caches summaries per version with a 1s floor', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'CCH', 2);
    const a = fx.ta.summary(t);
    expect(fx.ta.summary(t)).toBe(a);
    buy(fx, buyers[0], t, 0.1); // version changed, but < 1s later
    expect(fx.ta.summary(t)).toBe(a);
    tick(fx, 1001);
    const b = fx.ta.summary(t);
    expect(b).not.toBe(a);
    expect(b.stats['24h'].swaps).toBe(a.stats['24h'].swaps + 1);
    tick(fx, 2000); // unchanged version, within max age
    expect(fx.ta.summary(t)).toBe(b);
    tick(fx, 6000); // past max age: refreshed for price drift / rolling windows
    expect(fx.ta.summary(t)).not.toBe(b);
  });

  it('reports chain-aware tri-state security fields', () => {
    const solDev = wallet(fx, 'sol');
    const sol = token(fx, 'sol', solDev, sym('SEC'));
    const s1 = fx.ta.summary(sol).security;
    expect(s1.renouncedMint).toBe(true);
    expect(s1.renouncedFreeze).toBe(true);
    expect(s1.isOpenSource).toBeNull();
    expect(s1.isRenounced).toBeNull();
    expect(s1.isHoneypot).toBeNull();
    expect(s1.lpBurnedRate).toBeNull();
    const keys1 = s1.checks.map((c) => c.key);
    expect(keys1).toContain('mint');
    expect(keys1).toContain('freeze');
    expect(keys1).not.toContain('honeypot');

    const mintable = token(fx, 'sol', solDev, sym('SEC'), { security: { renouncedMint: false } });
    const s1b = fx.ta.summary(mintable).security;
    expect(s1b.renouncedMint).toBe(false);
    expect(s1b.checks.find((c) => c.key === 'mint')!.level).toBe('bad');
    expect(s1b.rugRatio).toBeGreaterThan(s1.rugRatio);

    const bscDev = wallet(fx, 'bsc');
    const clean = token(fx, 'bsc', bscDev, sym('SEC'));
    const s2 = fx.ta.summary(clean).security;
    expect(s2.renouncedMint).toBeNull();
    expect(s2.renouncedFreeze).toBeNull();
    expect(s2.isOpenSource).toBe(true);
    expect(s2.isRenounced).toBe(true);
    expect(s2.isHoneypot).toBe(false);
    expect(s2.riskLevel).toBe('low');
    const keys2 = s2.checks.map((c) => c.key);
    expect(keys2).toEqual(expect.arrayContaining(['honeypot', 'open_source', 'renounced', 'tax', 'top10', 'rug']));
    expect(keys2).not.toContain('mint');

    const hp = token(fx, 'bsc', bscDev, sym('SEC'), { security: { isHoneypot: true, isOpenSource: false, isRenounced: false, buyTax: 0.05, sellTax: 0.15 } });
    const s3 = fx.ta.summary(hp).security;
    expect(s3.isHoneypot).toBe(true);
    expect(s3.riskLevel).toBe('high');
    expect(s3.rugRatio).toBeGreaterThan(0.9);
    expect(s3.buyTax).toBe(0.05);
    expect(s3.sellTax).toBe(0.15);
    expect(s3.checks.find((c) => c.key === 'honeypot')!.level).toBe('bad');
    expect(s3.checks.find((c) => c.key === 'tax')!.level).toBe('bad');
    expect(s3.checks.find((c) => c.key === 'open_source')!.level).toBe('bad');
  });

  it('computes concentration from wallets only (curve/pool excluded)', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'TOP', 14, 0.1);
    const s = fx.ta.summary(t);
    const balances = buyers.map((w) => bal(w, t)).sort((a, b) => b - a);
    const top10 = balances.slice(0, 10).reduce((a, b) => a + b, 0) / t.totalSupply;
    const all = balances.reduce((a, b) => a + b, 0) / t.totalSupply;
    expect(s.security.top10HolderRate).toBeCloseTo(top10, 10);
    expect(s.security.top100HolderRate).toBeCloseTo(all, 10);
    expect(s.holderCount).toBe(14);
    const rows = fx.ta.holders(t, {}, { accountId: null });
    expect(rows[0].addrType).toBe('curve');
    expect(rows[0].walletLabel).toMatch(/Bonding Curve$/);
    // supply is conserved: curve account + wallets = total supply
    const walletSum = rows.slice(1).reduce((a, r) => a + r.balance, 0);
    expect((rows[0].balance + walletSum) / t.totalSupply).toBeCloseTo(1, 8);
    expect(rows.slice(1).map((r) => r.balance)).toEqual([...rows.slice(1).map((r) => r.balance)].sort((a, b) => b - a));
    expect(rows.slice(1, 11).every((r) => r.walletTags.includes('top_holder'))).toBe(true);
    expect(rows.slice(11).some((r) => r.walletTags.includes('top_holder'))).toBe(false);
  });

  it('switches the venue row to the pool after migration', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'MIG', 3);
    const whale = wallet(fx, 'sol');
    buy(fx, whale, t, 200); // completes the curve
    expect(t.status).toBe('migrating');
    fx.world.migrate(t);
    tick(fx);
    const rows = fx.ta.holders(t, {}, { accountId: null });
    expect(rows[0].addrType).toBe('pool');
    expect(rows[0].wallet).toBe(t.pool!.address);
    expect(rows[0].balance).toBe(t.pool!.tokens);
    const s = fx.ta.summary(t);
    expect(s.security.lpBurnedRate).toBe(1);
    expect(s.status).toBe('migrated');
    expect(s.progress).toBe(1);
    expect(s.completeCostSeconds).toBeGreaterThanOrEqual(0);
    const top10 = [whale, ...buyers].map((w) => bal(w, t)).sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
    expect(s.security.top10HolderRate).toBeCloseTo(top10 / t.totalSupply, 10);
    const d = fx.ta.detail(t);
    expect(d.curve).toBeNull();
    expect(d.pool!.address).toBe(t.pool!.address);
    expect(d.pool!.lpBurnedRate).toBe(1);
    // initial liquidity switches from the launch to the pool's opening liquidity
    expect(s.initialLiquidityUsd).toBe(t.pool!.initialLiquidityUsd);
    expect(d.initialLiquidityUsd).toBe(d.pool!.initialLiquidityUsd);
    expect(s.initialLiquidityUsd).not.toBe(t.initialLiquidityUsd);
  });

  it('derives bundlers, snipers and insiders from blocks and funding links', () => {
    const chain: ChainId = 'sol';
    const dev = wallet(fx, chain);
    const devFunder = wallet(fx, chain);
    dev.fundedBy = devFunder.address;
    const exchange = wallet(fx, chain, { label: 'SimEx Hot Wallet 9' });
    const t = token(fx, chain, dev, sym('COH'));
    buy(fx, dev, t, 2);
    const bundler = wallet(fx, chain);
    buy(fx, bundler, t, 1); // same block as creation
    tick(fx, 800); // +2 blocks (400ms slots)
    const sniper = wallet(fx, chain);
    buy(fx, sniper, t, 0.5);
    tick(fx, 5000);
    const devFunded = wallet(fx, chain, { fundedBy: dev.address });
    buy(fx, devFunded, t, 0.3);
    const motherFunded = wallet(fx, chain, { fundedBy: devFunder.address });
    buy(fx, motherFunded, t, 0.3);
    // three early buyers sharing one private funder -> insiders
    const boss = wallet(fx, chain);
    const ring = [0, 1, 2].map(() => wallet(fx, chain, { fundedBy: boss.address }));
    // three early buyers funded by a labelled exchange wallet -> not insiders
    const cex = [0, 1, 2].map(() => wallet(fx, chain, { fundedBy: exchange.address }));
    for (const w of [...ring, ...cex]) buy(fx, w, t, 0.2);
    const late = wallet(fx, chain);
    buy(fx, late, t, 0.2);
    tick(fx);

    const holders = fx.ta.holders(t, { tag: 'all' }, { accountId: null });
    const tagsOf = (w: WalletState) => holders.find((r) => r.wallet === w.address)!.walletTags;
    expect(tagsOf(dev)).toContain('dev');
    expect(tagsOf(bundler)).toContain('bundler');
    expect(tagsOf(bundler)).not.toContain('sniper');
    expect(tagsOf(sniper)).toContain('sniper');
    expect(tagsOf(devFunded)).toContain('insider');
    expect(tagsOf(motherFunded)).toContain('insider');
    for (const w of ring) expect(tagsOf(w)).toContain('insider');
    for (const w of cex) expect(tagsOf(w)).not.toContain('insider');
    expect(tagsOf(late)).toEqual(expect.not.arrayContaining(['insider', 'sniper', 'bundler', 'dev']));
    // the live trade objects carry derived tags too
    const sniperTrade = t.trades.find((tr) => tr.wallet === sniper.address)!;
    expect(sniperTrade.walletTags).toContain('sniper');

    const s = fx.ta.summary(t);
    expect(s.security.sniperCount).toBe(1);
    expect(s.holderTags.sniperCount).toBe(1);
    expect(s.holderTags.bundlerCount).toBe(1);
    expect(s.holderTags.insiderCount).toBe(5);
    expect(s.holderTags.devCount).toBe(1);
    const insiderBal = [devFunded, motherFunded, ...ring].reduce((a, w) => a + bal(w, t), 0);
    expect(s.security.insiderHoldRate).toBeCloseTo(insiderBal / t.totalSupply, 10);
    expect(s.security.devHoldRate).toBeCloseTo(bal(dev, t) / t.totalSupply, 10);
    expect(s.security.bundlerRate).toBeGreaterThan(0);
    expect(s.security.ratTraderRate).toBeGreaterThan(0);
    // filters by cohort on the trade list
    const tr = fx.ta.trades(t, { filter: 'insider' }, { accountId: null });
    expect(new Set(tr.map((x) => x.wallet))).toEqual(new Set([devFunded, motherFunded, ...ring].map((w) => w.address)));
    expect(fx.ta.trades(t, { filter: 'dev' }, { accountId: null }).map((x) => x.wallet)).toEqual([dev.address]);
    expect(fx.ta.trades(t, { filter: 'bundler' }, { accountId: null }).map((x) => x.wallet)).toEqual([bundler.address]);
  });

  it('tracks dev status, rugs and dev history (incl. deleted tokens)', () => {
    const chain: ChainId = 'sol';
    const dev = wallet(fx, chain);
    const fan = wallet(fx, chain);
    // token 1: dev dumps everything early, price collapses -> rugged
    const t1 = token(fx, chain, dev, sym('RUG'));
    buy(fx, dev, t1, 40);
    tick(fx, 30_000);
    buy(fx, fan, t1, 1);
    expect(fx.ta.summary(t1).security.devStatus).toBe('hold');
    tick(fx, 60_000);
    sell(fx, dev, t1, bal(dev, t1));
    tick(fx);
    const s1 = fx.ta.summary(t1);
    expect(s1.security.devStatus).toBe('sold_all');
    expect(s1.security.devHoldRate).toBe(0);
    expect(fx.ta.devInfo(t1).tokens.find((x) => x.address === t1.address)!.rugged).toBe(true);
    // token 2: dev sells part, token 3: dev buys more later
    const t2 = token(fx, chain, dev, sym('PRT'));
    buy(fx, dev, t2, 5);
    tick(fx, 20_000);
    sell(fx, dev, t2, bal(dev, t2) * 0.3);
    tick(fx);
    expect(fx.ta.summary(t2).security.devStatus).toBe('sold_part');
    const t3 = token(fx, chain, dev, sym('MOR'));
    buy(fx, dev, t3, 1);
    tick(fx, 20_000);
    buy(fx, dev, t3, 1);
    tick(fx, 15_000); // past the dev-history cache
    const info = fx.ta.devInfo(t3);
    expect(info.status).toBe('bought_more');
    expect(info.createdCount).toBe(3);
    expect(info.ruggedCount).toBe(1);
    expect(info.tokens.map((x) => x.address)).toEqual([t3.address, t2.address, t1.address]);
    const s3 = fx.ta.summary(t3);
    expect(s3.devCreatedCount).toBe(3);
    expect(s3.devMigratedCount).toBe(0);
    // the simulator may delete old dormant tokens; history must survive
    t1.dormant = true;
    fx.world.tokens.delete(t1.address);
    fx.ctx.engine.step(31_000); // runs the sweep
    tick(fx, 15_000);
    const after = fx.ta.devInfo(t3);
    expect(after.createdCount).toBe(3);
    expect(after.ruggedCount).toBe(1);
    const gone = after.tokens.find((x) => x.address === t1.address)!;
    expect(gone.symbol).toBe(t1.symbol);
    expect(gone.rugged).toBe(true);
    // lists keep working with the missing token
    expect(() => fx.ta.trenches({ chain })).not.toThrow();
    expect(() => fx.ta.narratives(chain)).not.toThrow();
    expect(fx.ta.search(t1.symbol, chain).tokens).toHaveLength(0);
  });

  it('bounds memory: forgets deleted migrations and drops caches of long-idle tokens', () => {
    const chain: ChainId = 'bsc';
    const internals = fx.ta as unknown as { caches: Map<string, unknown>; migrated: Record<ChainId, string[]> };
    const { t: gone } = tokenWithBuyers(fx, chain, 'DEL', 2);
    const { t: kept } = tokenWithBuyers(fx, chain, 'KEP', 2);
    fx.world.migrate(gone);
    fx.world.migrate(kept);
    tick(fx);
    expect(fx.ta.newPairs(chain, undefined).map((s) => s.address).slice(0, 2)).toEqual([kept.address, gone.address]);
    const { t: idle } = tokenWithBuyers(fx, chain, 'IDL', 1);
    fx.ta.summary(idle);
    fx.ta.detail(idle);
    expect(internals.caches.has(idle.address)).toBe(true);
    gone.dormant = true;
    fx.world.tokens.delete(gone.address);
    fx.ctx.engine.step(31_000); // sweep
    expect(internals.migrated[chain]).not.toContain(gone.address);
    expect(internals.migrated[chain]).toContain(kept.address);
    expect(internals.caches.has(gone.address)).toBe(false);
    expect(fx.ta.newPairs(chain, undefined).map((s) => s.address)).not.toContain(gone.address);
    // untouched for > 10 min: the idle token's DTO caches are released, then rebuilt on demand
    tick(fx, 11 * 60_000);
    fx.ctx.engine.step(31_000);
    expect(internals.caches.has(idle.address)).toBe(false);
    expect(fx.ta.summary(idle).address).toBe(idle.address);
    expect(internals.caches.has(idle.address)).toBe(true);
  });

  it('round-trips its state through a v8 snapshot', async () => {
    const chain: ChainId = 'sol';
    const dev = wallet(fx, chain);
    const t = token(fx, chain, dev, sym('SNP'));
    buy(fx, dev, t, 2);
    const bundler = wallet(fx, chain);
    buy(fx, bundler, t, 1);
    tick(fx, 800);
    const sniper = wallet(fx, chain);
    buy(fx, sniper, t, 0.5);
    tick(fx);
    const before = fx.ta.summary(t);
    const blob = serialize(fx.ta.serialize());
    const fx2 = await setup();
    try {
      // same world objects, fresh analytics instance restored from the snapshot
      fx2.ctx.world.tokens.set(t.address, t);
      fx2.ctx.world.tokensByChain[chain].push(t.address);
      for (const w of [dev, bundler, sniper]) fx2.ctx.world.wallets.set(w.address, w);
      fx2.ctx.world.now = fx.world.now;
      fx2.ta.restore(deserialize(blob));
      for (const w of [dev, bundler, sniper]) fx2.tags.set(w.address, []);
      const after = fx2.ta.summary(t);
      expect(after.security.sniperCount).toBe(before.security.sniperCount);
      expect(after.security.bundlerRate).toBeCloseTo(before.security.bundlerRate, 12);
      expect(after.security.rugRatio).toBeCloseTo(before.security.rugRatio, 6);
      expect(fx2.ta.trenches({ chain, filters: { new: { keyword: t.symbol } } }).new.map((x) => x.address)).toEqual([t.address]);
    } finally {
      await fx2.built.close();
    }
    // malformed snapshots are ignored
    expect(() => fx.ta.restore(null)).not.toThrow();
    expect(() => fx.ta.restore({ v: 99 })).not.toThrow();
  });

  it('flags wash trading from fast round trips', () => {
    const { t } = tokenWithBuyers(fx, 'sol', 'WSH', 2);
    const bots = [0, 1, 2].map(() => wallet(fx, 'sol'));
    for (let i = 0; i < 12; i++) {
      for (const b of bots) {
        buy(fx, b, t, 0.5);
        tick(fx, 2000);
        sell(fx, b, t, bal(b, t));
        tick(fx, 2000);
      }
    }
    tick(fx, 6000);
    const s = fx.ta.summary(t);
    expect(s.stats['1h'].swaps).toBeGreaterThanOrEqual(20);
    expect(s.security.isWashTrading).toBe(true);
    const organic = tokenWithBuyers(fx, 'sol', 'ORG', 25, 0.05).t;
    tick(fx, 6000);
    expect(fx.ta.summary(organic).security.isWashTrading).toBe(false);
  });

  it('builds detail, ref and dev info DTOs', () => {
    const { t, dev } = tokenWithBuyers(fx, 'sol', 'DTL', 3);
    const d = fx.ta.detail(t);
    expect(d.address).toBe(t.address);
    expect(d.curve).not.toBeNull();
    expect(d.curve!.graduationMarketCapUsd).toBeGreaterThan(d.marketCapUsd);
    expect(d.circulatingSupply).toBe(t.totalSupply);
    expect(d.nativeUsd).toBe(fx.world.nativeUsd('sol'));
    expect(d.dev.address).toBe(dev.address);
    expect(d.pool).toBeNull();
    expect(d.initialLiquidityUsd).toBe(t.initialLiquidityUsd);
    const r = fx.ta.ref(t);
    expect(r).toMatchObject({ chain: 'sol', address: t.address, symbol: t.symbol, status: 'curve' });
    expect(r.priceChange24h).toBeGreaterThan(0);
    expect(r).toMatchObject({ rugRatio: d.security.rugRatio, riskLevel: d.security.riskLevel });
    // a ref of a token no list has summarised builds the security read on demand
    const cold = tokenWithBuyers(fx, 'sol', 'CLD', 2).t;
    const coldRef = fx.ta.ref(cold);
    expect(coldRef.rugRatio).toBe(fx.ta.summary(cold).security.rugRatio);
    expect(['low', 'medium', 'high']).toContain(coldRef.riskLevel);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d); // plain JSON
  });
});

// ---------------------------------------------------------------------------
// Holders & top traders
// ---------------------------------------------------------------------------

describe('holders and top traders', () => {
  let fx: Fx;
  beforeAll(async () => {
    fx = await setup();
  });
  afterAll(() => fx.built.close());

  it('computes position PnL and orders top traders', () => {
    const { t } = tokenWithBuyers(fx, 'sol', 'PNL', 2);
    const a = wallet(fx, 'sol', {}, ['smart']);
    const b = wallet(fx, 'sol', {}, ['kol']);
    const c = wallet(fx, 'sol');
    buy(fx, a, t, 2);
    tick(fx, 10_000);
    buy(fx, b, t, 1);
    buy(fx, c, t, 3); // pushes price up: a and b are in profit
    tick(fx, 10_000);
    sell(fx, a, t, bal(a, t) / 2);
    sell(fx, c, t, bal(c, t)); // c exits
    tick(fx);
    const price = fx.world.priceUsd(t);
    const rows = fx.ta.topTraders(t, {}, { accountId: null });
    const ra = rows.find((r) => r.wallet === a.address)!;
    const pa = a.positions.get(t.address)!;
    expect(ra.balance).toBe(pa.balance);
    expect(ra.realizedPnlUsd).toBeCloseTo(pa.realizedPnlUsd, 9);
    expect(ra.unrealizedPnlUsd).toBeCloseTo(pa.balance * price - pa.costBasisUsd, 9);
    expect(ra.totalPnlUsd).toBeCloseTo(ra.realizedPnlUsd + ra.unrealizedPnlUsd, 9);
    expect(ra.pnlRate).toBeCloseTo(ra.totalPnlUsd / pa.boughtUsd, 9);
    expect(ra.avgBuyPriceUsd).toBeCloseTo(pa.boughtUsd / pa.boughtTokens, 15);
    expect(ra.avgSellPriceUsd).toBeCloseTo(pa.soldUsd / pa.soldTokens, 15);
    expect(ra.holdRate).toBeCloseTo(pa.balance / t.totalSupply, 12);
    expect(ra.valueUsd).toBeCloseTo(pa.balance * price, 9);
    expect(ra.buys).toBe(1);
    expect(ra.sells).toBe(1);
    expect(ra.holdSeconds).toBeCloseTo((fx.world.now - pa.firstBuyAt!) / 1000, 6);
    expect(ra.walletTags).toContain('smart');
    expect(ra.nativeBalance).toBe(a.native);
    const rc = rows.find((r) => r.wallet === c.address)!;
    expect(rc.balance).toBe(0);
    expect(rc.unrealizedPnlUsd).toBe(0);
    expect(rc.totalPnlUsd).toBeCloseTo(c.positions.get(t.address)!.realizedPnlUsd, 9);
    expect(rc.holdSeconds).toBeCloseTo((c.positions.get(t.address)!.closedAt! - c.positions.get(t.address)!.firstBuyAt!) / 1000, 6);

    const pnl = rows.map((r) => r.totalPnlUsd);
    expect(pnl).toEqual([...pnl].sort((x, y) => y - x));
    const asc = fx.ta.topTraders(t, { order: 'asc' }, { accountId: null }).map((r) => r.totalPnlUsd);
    expect(asc).toEqual([...asc].sort((x, y) => x - y));
    const sold = fx.ta.topTraders(t, { sort: 'sold' }, { accountId: null });
    expect(sold[0].wallet).toBe(c.address);
    const bought = fx.ta.topTraders(t, { sort: 'bought', limit: 2 }, { accountId: null });
    expect(bought).toHaveLength(2);
    expect(bought[0].boughtUsd).toBeGreaterThanOrEqual(bought[1].boughtUsd);
    const realized = fx.ta.topTraders(t, { sort: 'realized' }, { accountId: null }).map((r) => r.realizedPnlUsd);
    expect(realized).toEqual([...realized].sort((x, y) => y - x));
    const unreal = fx.ta.topTraders(t, { sort: 'unrealized' }, { accountId: null }).map((r) => r.unrealizedPnlUsd);
    expect(unreal).toEqual([...unreal].sort((x, y) => y - x));
    expect(fx.ta.topTraders(t, { tag: 'kol' }, { accountId: null }).map((r) => r.wallet)).toEqual([b.address]);

    // holders exclude exited wallets; tag filters drop the venue row
    const hs = fx.ta.holders(t, {}, { accountId: null });
    expect(hs.some((r) => r.wallet === c.address)).toBe(false);
    expect(fx.ta.holders(t, { tag: 'smart' }, { accountId: null }).map((r) => r.wallet)).toEqual([a.address]);
    expect(fx.ta.holders(t, { limit: 1 }, { accountId: null })).toHaveLength(2); // venue + 1 wallet
  });

  it('applies viewer-relative tags and remarks', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'VWR', 3);
    const [mine, followed] = buyers;
    const acc = fx.ctx.accounts;
    const orig = { a: acc.accountIdForWallet, f: acc.isFollowing, r: acc.remarkFor };
    acc.accountIdForWallet = (addr: string) => (addr === mine.address ? 'acc1' : null);
    acc.isFollowing = (_id: string, _c: ChainId, addr: string) => addr === followed.address;
    acc.remarkFor = (_id: string, _c: ChainId, addr: string) => (addr === followed.address ? 'my guy' : null);
    try {
      const viewer = { accountId: 'acc1' };
      const rows = fx.ta.holders(t, {}, viewer);
      expect(rows.find((r) => r.wallet === mine.address)!.walletTags).toContain('you');
      const fr = rows.find((r) => r.wallet === followed.address)!;
      expect(fr.walletTags).toContain('following');
      expect(fr.walletLabel).toBe('my guy');
      expect(fx.ta.holders(t, { tag: 'you' }, viewer).map((r) => r.wallet)).toEqual([mine.address]);
      expect(fx.ta.trades(t, { filter: 'mine' }, viewer).map((r) => r.wallet)).toEqual([mine.address]);
      expect(fx.ta.trades(t, { filter: 'following' }, viewer).map((r) => r.wallet)).toEqual([followed.address]);
      expect(fx.ta.trades(t, { filter: 'mine' }, { accountId: null })).toEqual([]);
      const tr = fx.ta.trades(t, {}, viewer).find((x) => x.wallet === followed.address)!;
      expect(tr.walletTags).toContain('following');
      // anonymous viewers never get viewer tags; the cached rows are not mutated
      expect(fx.ta.holders(t, {}, { accountId: null }).every((r) => !r.walletTags.includes('you') && !r.walletTags.includes('following'))).toBe(true);
    } finally {
      acc.accountIdForWallet = orig.a;
      acc.isFollowing = orig.f;
      acc.remarkFor = orig.r;
    }
  });

  it('filters and pages the trade list', () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'TRD', 5);
    const whale = wallet(fx, 'sol', {}, ['whale']);
    buy(fx, whale, t, 5);
    tick(fx);
    sell(fx, buyers[0], t, bal(buyers[0], t));
    tick(fx);
    const all = fx.ta.trades(t, {}, { accountId: null });
    expect(all.map((x) => x.timestamp)).toEqual([...all.map((x) => x.timestamp)].sort((a, b) => b - a));
    expect(fx.ta.trades(t, { filter: 'sell' }, { accountId: null }).every((x) => x.side === 'sell')).toBe(true);
    expect(fx.ta.trades(t, { filter: 'whale' }, { accountId: null }).map((x) => x.wallet)).toEqual([whale.address]);
    const big = fx.ta.trades(t, { minUsd: 500 }, { accountId: null });
    expect(big.every((x) => x.usdAmount >= 500)).toBe(true);
    expect(fx.ta.trades(t, { wallet: buyers[0].address }, { accountId: null })).toHaveLength(2);
    expect(fx.ta.trades(t, { limit: 2 }, { accountId: null })).toHaveLength(2);
    const before = all[1].timestamp;
    expect(fx.ta.trades(t, { before }, { accountId: null }).every((x) => x.timestamp < before)).toBe(true);
  });

  it('pages trades sharing a millisecond without losing any (before + beforeId cursor)', async () => {
    const { t } = tokenWithBuyers(fx, 'sol', 'PGE', 2);
    for (let burst = 0; burst < 5; burst++) {
      for (let i = 0; i < 4; i++) buy(fx, wallet(fx, 'sol'), t, 0.05); // one block, one timestamp
      tick(fx, 400);
    }
    const all = fx.ta.trades(t, { limit: 500 }, { accountId: null });
    const pageAll = (limit: number, withId: boolean) => {
      const seen: string[] = [];
      let page = fx.ta.trades(t, { limit }, { accountId: null });
      while (page.length) {
        seen.push(...page.map((x) => x.id));
        const last = page[page.length - 1];
        page = fx.ta.trades(t, { limit, before: last.timestamp, ...(withId ? { beforeId: last.id } : {}) }, { accountId: null });
      }
      return seen;
    };
    for (const limit of [3, 7]) expect(pageAll(limit, true)).toEqual(all.map((x) => x.id));
    expect(pageAll(3, false).length).toBeLessThan(all.length); // time alone skips the rest of a split millisecond
    // a cursor that left the ring falls back to `before`; with nothing else to go on, the page is empty
    expect(fx.ta.trades(t, { before: all[3].timestamp, beforeId: 'tx_gone' }, { accountId: null })[0].timestamp).toBeLessThan(all[3].timestamp);
    expect(fx.ta.trades(t, { beforeId: 'tx_gone' }, { accountId: null })).toEqual([]);
    // over REST
    const res = await fx.built.app.inject({ method: 'GET', url: `/api/sol/tokens/${t.address}/trades?limit=2&before=${all[1].timestamp}&beforeId=${all[1].id}` });
    expect((res.json() as Trade[]).map((x) => x.id)).toEqual(all.slice(2, 4).map((x) => x.id));
  });
});

// ---------------------------------------------------------------------------
// Lists: trenches, trending, new pairs, narratives, search
// ---------------------------------------------------------------------------

describe('discovery lists', () => {
  let fx: Fx;
  beforeAll(async () => {
    fx = await setup();
  });
  afterAll(() => fx.built.close());

  it('classifies trenches columns', () => {
    const p = sym('TRN');
    const kw: TokenFilters = { keyword: p };
    const dev = wallet(fx, 'sol');
    const whale = wallet(fx, 'sol');
    const fresh = token(fx, 'sol', dev, `${p}A`);
    tick(fx, 10_000);
    buy(fx, whale, fresh, 1);
    const almost = token(fx, 'sol', dev, `${p}B`);
    tick(fx, 10_000);
    buy(fx, whale, almost, 25);
    const done = token(fx, 'sol', dev, `${p}C`);
    tick(fx, 10_000);
    buy(fx, whale, done, 200);
    expect(done.status).toBe('migrating');
    const sleepy = token(fx, 'sol', dev, `${p}D`);
    sleepy.dormant = true;
    tick(fx);
    let snap = fx.ta.trenches({ chain: 'sol', filters: { new: kw, almost: kw, migrated: kw } });
    expect(snap.new.map((s) => s.address)).toEqual([fresh.address]);
    // migrating = progress 1 -> first in "almost"
    expect(snap.almost.map((s) => s.address)).toEqual([done.address, almost.address]);
    expect(snap.migrated).toEqual([]);
    fx.world.migrate(done);
    tick(fx);
    snap = fx.ta.trenches({ chain: 'sol', filters: { new: kw, almost: kw, migrated: kw } });
    expect(snap.almost.map((s) => s.address)).toEqual([almost.address]);
    expect(snap.migrated.map((s) => s.address)).toEqual([done.address]);
    expect(snap.chain).toBe('sol');
    expect(snap.updatedAt).toBe(fx.world.now);
    // per-column filters are independent
    snap = fx.ta.trenches({ chain: 'sol', filters: { new: { ...kw, holderCount: { min: 5 } }, almost: kw } });
    expect(snap.new).toEqual([]);
    expect(snap.almost.map((s) => s.address)).toEqual([almost.address]);
    expect(fx.ta.newPairs('sol', kw).map((s) => s.address)).toEqual([done.address]);
    expect(fx.ta.trenches({ chain: 'sol', limit: 1 }).new.length).toBeLessThanOrEqual(1);
    // a newer token goes first in "new"
    const newer = token(fx, 'sol', dev, `${p}E`);
    tick(fx);
    expect(fx.ta.trenches({ chain: 'sol', filters: { new: kw } }).new.map((s) => s.address)).toEqual([newer.address, fresh.address]);
  });

  it('sorts trending by window activity', () => {
    const p = sym('HOT');
    const kw: TokenFilters = { keyword: p };
    const dev = wallet(fx, 'sol');
    const busy = token(fx, 'sol', dev, `${p}A`);
    const quiet = token(fx, 'sol', dev, `${p}B`);
    const stale = token(fx, 'sol', dev, `${p}C`);
    tick(fx, 10_000);
    const traders = Array.from({ length: 12 }, () => wallet(fx, 'sol'));
    buy(fx, traders[0], stale, 3);
    tick(fx, 10 * 60_000);
    for (const w of traders) buy(fx, w, busy, 0.5);
    buy(fx, traders[0], quiet, 0.1);
    tick(fx);
    const q = (extra: object = {}) => fx.ta.trending({ chain: 'sol', window: '5m', filters: kw, ...extra }).tokens.map((s) => s.address);
    expect(q()).toEqual([busy.address, quiet.address]); // stale has no 5m activity
    expect(q({ sort: 'volume' })).toEqual([busy.address, quiet.address]);
    expect(q({ sort: 'volume', order: 'asc' })).toEqual([quiet.address, busy.address]);
    expect(q({ sort: 'swaps' })).toEqual([busy.address, quiet.address]);
    expect(q({ sort: 'holders' })[0]).toBe(busy.address);
    const day = fx.ta.trending({ chain: 'sol', window: '24h', filters: kw, sort: 'volume' }).tokens.map((s) => s.address);
    expect(day).toEqual([busy.address, stale.address, quiet.address]);
    const snap = fx.ta.trending({ chain: 'sol', window: '1h', filters: kw });
    expect(snap.window).toBe('1h');
    expect(snap.tokens[0].hotLevel).toBeGreaterThanOrEqual(0);
    expect(fx.ta.trending({ chain: 'sol', window: '1h', filters: { ...kw, volumeUsd: { min: 1e9 } } }).tokens).toEqual([]);
    expect(fx.ta.hotScoreOf(busy, '5m')).toBeGreaterThan(fx.ta.hotScoreOf(quiet, '5m'));
  });

  it('groups narratives', () => {
    const dev = wallet(fx, 'base');
    const name = `Zeta${sym('N')}`;
    const ts = [0, 1, 2].map((i) => token(fx, 'base', dev, sym('NAR'), { narrative: name, logoGlyph: i < 2 ? '🦀' : '🐙' }));
    tick(fx, 10_000);
    const w = wallet(fx, 'base');
    buy(fx, w, ts[0], 0.5);
    buy(fx, w, ts[1], 0.1);
    tick(fx, 6000);
    const n = fx.ta.narratives('base').find((x) => x.name === name)!;
    expect(n.tokenCount).toBe(3);
    expect(n.glyph).toBe('🦀');
    expect(n.topTokens[0].address).toBe(ts[0].address);
    expect(n.volume1hUsd).toBeGreaterThan(0);
    expect(n.heat).toBeGreaterThanOrEqual(0);
    expect(n.heat).toBeLessThanOrEqual(100);
    const all = fx.ta.narratives('base');
    expect(all.map((x) => x.heat)).toEqual([...all.map((x) => x.heat)].sort((a, b) => b - a));
  });

  it('ranks search results by match tier, then credibility', () => {
    const term = `qz${sym('s').toLowerCase()}`;
    const dev = wallet(fx, 'sol');
    const exactSym = token(fx, 'sol', dev, term.toUpperCase(), { name: 'Something Else' });
    const exactName = token(fx, 'sol', dev, 'ZZNAME', { name: term });
    const prefix = token(fx, 'sol', dev, `${term.toUpperCase()}X`, { name: 'Prefix Coin' });
    const contains = token(fx, 'sol', dev, 'CTN', { name: `the ${term} coin` });
    const bscTwin = token(fx, 'bsc', wallet(fx, 'bsc'), term.toUpperCase(), { name: 'twin' });
    // a copycat with the same symbol but no liquidity ranks below the real one
    const real = token(fx, 'sol', dev, `${term.toUpperCase()}DUP`, { name: 'Dup Real' });
    const fake = token(fx, 'sol', dev, `${term.toUpperCase()}DUP`, { name: 'Dup Fake', isCopycat: true });
    tick(fx, 10_000);
    for (let i = 0; i < 5; i++) buy(fx, wallet(fx, 'sol'), real, 2);
    tick(fx);
    fx.ta.summary(real); // populates the 24h volume cache
    const res = fx.ta.search(term, 'sol').tokens.map((x) => x.address);
    expect(res.slice(0, 2)).toEqual([exactSym.address, exactName.address]);
    expect(res.indexOf(prefix.address)).toBeLessThan(res.indexOf(contains.address));
    expect(res.indexOf(real.address)).toBeLessThan(res.indexOf(fake.address));
    expect(res).not.toContain(bscTwin.address);
    expect(fx.ta.search(`$${term.toUpperCase()}`).tokens.map((x) => x.address)).toEqual(expect.arrayContaining([exactSym.address, bscTwin.address]));
    expect(fx.ta.search(contains.address).tokens.map((x) => x.address)).toEqual([contains.address]);
    expect(fx.ta.search(bscTwin.address.toUpperCase().replace('0X', '0x')).tokens.map((x) => x.address)).toEqual([bscTwin.address]);
    expect(fx.ta.search(contains.address, 'bsc').tokens).toEqual([]);
    const kol = wallet(fx, 'sol', { label: `@${term}Caller`, address: undefined }, ['kol']);
    kol.tags.add('kol');
    const ws = fx.ta.search(`${term}call`).wallets;
    expect(ws[0]).toMatchObject({ address: kol.address, chain: 'sol', label: kol.label });
    expect(ws[0].tags).toContain('kol');
    expect(fx.ta.search(kol.address).wallets[0].address).toBe(kol.address);
    expect(fx.ta.search('‮  ').tokens).toEqual([]);
    expect(fx.ta.search('a').tokens.length).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

describe('REST routes', () => {
  let fx: Fx;
  let t: TokenState;
  beforeAll(async () => {
    fx = await setup();
    t = tokenWithBuyers(fx, 'sol', 'RTE', 4).t;
  });
  afterAll(() => fx.built.close());

  const get = async (url: string) => {
    const res = await fx.built.app.inject({ method: 'GET', url });
    return { status: res.statusCode, body: res.json() as any };
  };
  const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v));

  it('serves list endpoints with validation', async () => {
    let r = await get(`/api/sol/trenches?filters=${enc({ new: { keyword: t.symbol } })}&limit=10`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['almost', 'chain', 'migrated', 'new', 'updatedAt']);
    expect(r.body.new[0].address).toBe(t.address);
    expect(r.body.new[0].security.checks.length).toBeGreaterThan(5);
    expect((await get('/api/doge/trenches')).status).toBe(400);
    expect((await get('/api/sol/trenches?filters=%7Bnope')).status).toBe(400);
    expect((await get(`/api/sol/trenches?filters=${enc({ new: { bogus: 1 } })}`)).status).toBe(400);
    expect((await get('/api/sol/trenches?limit=101')).status).toBe(200); // clamped to the documented max
    expect((await get('/api/sol/trenches?limit=0')).status).toBe(400);
    expect((await get('/api/sol/trenches?limit=abc')).status).toBe(400);
    r = await get(`/api/sol/trending?window=5m&sort=volume&order=asc&filters=${enc({ keyword: t.symbol })}`);
    expect(r.status).toBe(200);
    expect(r.body.window).toBe('5m');
    expect(r.body.tokens.map((x: TokenSummary) => x.address)).toEqual([t.address]);
    expect((await get('/api/sol/trending')).body.window).toBe('1h');
    expect((await get('/api/sol/trending?window=2h')).status).toBe(400);
    expect((await get('/api/sol/trending?sort=nope')).status).toBe(400);
    r = await get('/api/sol/new-pairs?limit=5');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    r = await get('/api/sol/narratives');
    expect(r.status).toBe(200);
    expect(r.body.find((n: { name: string }) => n.name === 'Frogs')).toBeTruthy();
    r = await get(`/api/search?q=${t.symbol}`);
    expect(r.status).toBe(200);
    expect(r.body.tokens[0].address).toBe(t.address);
    expect(Array.isArray(r.body.wallets)).toBe(true);
    expect((await get(`/api/search?q=${t.symbol}&chain=bsc`)).body.tokens).toEqual([]);
    expect((await get('/api/search?q=x&chain=nope')).status).toBe(400);
    expect((await get('/api/search')).body).toEqual({ tokens: [], wallets: [] });
  });

  it('serves token endpoints with 404s for unknown tokens and chain mismatches', async () => {
    const base = `/api/sol/tokens/${t.address}`;
    let r = await get(base);
    expect(r.status).toBe(200);
    expect(r.body.address).toBe(t.address);
    expect(r.body.dev.address).toBe(t.creator);
    expect(r.body.curve.progress).toBeGreaterThan(0);
    expect((await get(`/api/bsc/tokens/${t.address}`)).status).toBe(404);
    expect((await get('/api/sol/tokens/doesnotexist')).status).toBe(404);
    expect((await get('/api/sol/tokens/doesnotexist/holders')).status).toBe(404);
    r = await get(`${base}/candles?resolution=1s&limit=3`);
    expect(r.status).toBe(200);
    expect(r.body.resolution).toBe('1s');
    expect(r.body.supply).toBe(t.totalSupply);
    expect(r.body.candles.length).toBeLessThanOrEqual(3);
    expect(r.body.candles[r.body.candles.length - 1]).toEqual(t.candles['1s'][t.candles['1s'].length - 1]);
    expect((await get(`${base}/candles`)).body.resolution).toBe('1m');
    expect((await get(`${base}/candles?resolution=2m`)).status).toBe(400);
    r = await get(`${base}/trades?filter=buy&limit=2`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body.every((x: Trade) => x.side === 'buy')).toBe(true);
    expect((await get(`${base}/trades?filter=weird`)).status).toBe(400);
    expect((await get(`${base}/trades?minUsd=-1`)).status).toBe(400);
    r = await get(`${base}/holders?tag=all&limit=2`);
    expect(r.status).toBe(200);
    expect(r.body[0].addrType).toBe('curve');
    expect(r.body).toHaveLength(3);
    expect((await get(`${base}/holders?tag=nope`)).status).toBe(400);
    r = await get(`${base}/top-traders?sort=bought&order=desc&limit=3`);
    expect(r.status).toBe(200);
    expect(r.body.map((x: Position) => x.boughtUsd)).toEqual([...r.body.map((x: Position) => x.boughtUsd)].sort((a: number, b: number) => b - a));
    expect((await get(`${base}/top-traders?sort=nope`)).status).toBe(400);
    r = await get(`${base}/dev`);
    expect(r.status).toBe(200);
    expect(r.body.address).toBe(t.creator);
    expect(r.body.tokens[0].address).toBe(t.address);
  });
});

// ---------------------------------------------------------------------------
// Safety score
// ---------------------------------------------------------------------------

describe('safety score', () => {
  type Sec = SafetyInputs['security'];
  const clean = (patch: Partial<Sec> = {}): Sec => ({
    renouncedMint: true,
    renouncedFreeze: true,
    isOpenSource: null,
    isRenounced: null,
    isHoneypot: null,
    buyTax: 0,
    sellTax: 0,
    lpBurnedRate: null,
    top10HolderRate: 0.15,
    top100HolderRate: 0.3,
    devHoldRate: 0.01,
    devStatus: 'hold',
    insiderHoldRate: 0,
    sniperHoldRate: 0.02,
    sniperCount: 1,
    bundlerRate: 0,
    ratTraderRate: 0,
    freshWalletRate: 0.1,
    botDegenRate: 0.2,
    isWashTrading: false,
    rugRatio: 0.05,
    riskLevel: 'low',
    ...patch,
  });
  const evm = (patch: Partial<Sec> = {}): Sec => clean({ renouncedMint: null, renouncedFreeze: null, isHoneypot: false, isOpenSource: true, isRenounced: true, ...patch });
  const score = (security: Sec, chain: ChainId = 'sol', holderCount = 50) => safetyScore({ chain, security, holderCount });
  const keys = (s: SafetyScore) => s.reasons.map((r) => r.key);
  const impactSum = (s: SafetyScore) => s.reasons.reduce((a, r) => a + r.impact, 0);

  it('scores a clean token 100 with full coverage and nothing to explain', () => {
    expect(score(clean())).toEqual({ score: 100, band: 'safe', coverage: 1, reasons: [] });
    expect(score(evm(), 'bsc')).toEqual({ score: 100, band: 'safe', coverage: 1, reasons: [] });
    // deterministic: same inputs, same output
    expect(score(clean({ top10HolderRate: 0.4 }))).toEqual(score(clean({ top10HolderRate: 0.4 })));
  });

  it('weights holder deductions 0.4375 (worst tier per field) and folds reasons past 6 into "other"', () => {
    const s = score(clean({ top10HolderRate: 0.35, devHoldRate: 0.06, bundlerRate: 0.2, sniperHoldRate: 0.1, insiderHoldRate: 0.02, botDegenRate: 0.6, freshWalletRate: 0.6 }));
    // 14 + 20 + 10 + 6 + 5 + 6 + 8 = 69 points x 0.4375
    expect(s.score).toBe(Math.round(100 - 69 * 0.4375));
    expect(s.band).toBe('safe');
    // the 5 largest, and snipers (6) + insiders (5) points summed: the reasons still explain the whole gap
    expect(keys(s)).toEqual(['dev', 'top10', 'other', 'bundlers', 'fresh', 'bots']);
    expect(s.reasons[2]).toEqual({ key: 'other', label: '2 more checks', impact: 4.8, level: 'warn' });
    expect(impactSum(s)).toBeCloseTo(69 * 0.4375, 1);
    expect(s.reasons[0]).toEqual({ key: 'dev', label: 'Dev holds 6.0%', impact: 8.8, level: 'bad' });
    expect(s.reasons[1]).toMatchObject({ key: 'top10', impact: 6.1, level: 'warn' });
    // a field over its top tier takes only that tier
    expect(score(clean({ top10HolderRate: 0.9 })).score).toBe(Math.round(100 - 25 * 0.4375));
    const washed = score(clean({ isWashTrading: true }));
    expect(washed.reasons).toEqual([{ key: 'wash', label: 'Wash trading', impact: 4.4, level: 'bad' }]);
  });

  it('weights contract deductions 0.5625 and explains the whole gap to 100', () => {
    const taxed = score(evm({ buyTax: 0.12, isRenounced: false }), 'bsc');
    expect(taxed.score).toBe(Math.round(100 - 33 * 0.5625));
    expect(keys(taxed)).toEqual(['tax', 'renounced']);
    expect(impactSum(taxed)).toBeCloseTo(33 * 0.5625, 1);
    expect(score(evm({ isOpenSource: false }), 'bsc')).toMatchObject({ score: Math.round(100 - 15 * 0.5625), reasons: [{ key: 'open_source', level: 'bad' }] });
    // migrated with LP not burned: a deduction everywhere, plus a 79 cap on EVM
    expect(score(clean({ lpBurnedRate: 0.5 })).score).toBe(Math.round(100 - 12 * 0.5625));
    const lp = score(evm({ lpBurnedRate: 0.5 }), 'bsc');
    expect(lp).toMatchObject({ score: 79, band: 'safe', reasons: [{ key: 'lp', impact: 21, level: 'bad' }] });
    expect(score(evm({ lpBurnedRate: 1 }), 'bsc').score).toBe(100);
  });

  it('applies the hard gates: honeypot is 0, an active SOL mint or freeze authority caps at 25 (danger)', () => {
    expect(score(evm({ isHoneypot: true }), 'bsc')).toEqual({ score: 0, band: 'danger', coverage: 1, reasons: [{ key: 'honeypot', label: 'Honeypot: sells are blocked', impact: 100, level: 'bad' }] });
    const mint = score(clean({ renouncedMint: false }));
    expect(mint).toMatchObject({ score: 25, band: 'danger', reasons: [{ key: 'mint', impact: 75, level: 'bad' }] });
    const both = score(clean({ renouncedMint: false, renouncedFreeze: false }));
    expect(both.score).toBe(25);
    expect(both.band).toBe('danger');
    // the binding cap's points join its own reason: 25 x 0.5625 + (100 - 45 x 0.5625 - 25), then 20 x 0.5625
    expect(both.reasons.map((r) => [r.key, r.impact])).toEqual([
      ['mint', 63.8],
      ['freeze', 11.3],
    ]);
  });

  it('caps by rug risk and unknown contract data, and bands by score', () => {
    expect(score(clean({ rugRatio: 0.35 }))).toMatchObject({ score: 79, band: 'safe', reasons: [{ key: 'rug', impact: 21 }] });
    expect(score(clean({ rugRatio: 0.6 }))).toMatchObject({ score: 59, band: 'caution', reasons: [{ key: 'rug', label: 'Rug risk 60%', impact: 41 }] });
    const unverified = score(evm({ isHoneypot: null, isOpenSource: null }), 'bsc');
    expect(unverified).toMatchObject({ score: 79, band: 'safe', reasons: [{ key: 'unverified', impact: 21 }] });
    expect(unverified.coverage).toBe(Math.round((11 / 13) * 100) / 100);
    const bad = score(clean({ top10HolderRate: 0.6, devHoldRate: 0.2, bundlerRate: 0.5, sniperHoldRate: 0.3, insiderHoldRate: 0.2, botDegenRate: 0.8, buyTax: 0.2, lpBurnedRate: 0.1 }));
    expect(bad.score).toBeLessThan(40);
    expect(bad.band).toBe('danger');
    expect(bad.reasons).toHaveLength(6);
    expect(bad.reasons.map((r) => r.impact)).toEqual([...bad.reasons.map((r) => r.impact)].sort((a, b) => b - a));
    expect(bad.reasons.find((r) => r.key === 'other')).toMatchObject({ label: '3 more checks', level: 'bad' });
    expect(impactSum(bad)).toBeCloseTo(100 - bad.score, 0);
  });

  it('reads unknown while most checks lack data (nobody holds the token yet)', () => {
    const s = score(clean(), 'sol', 0);
    expect(s.coverage).toBe(Math.round((5 / 12) * 100) / 100);
    expect(s.band).toBe('unknown');
    // a hard gate still says danger
    expect(score(clean({ renouncedMint: false }), 'sol', 0).band).toBe('danger');
  });

  it('ships on every security read (summaries, lists, detail)', async () => {
    const fx = await setup();
    try {
      const { t } = tokenWithBuyers(fx, 'sol', 'SFE', 4);
      const safety = fx.ta.summary(t).security.safety!;
      expect(safety).toMatchObject({ band: 'safe', coverage: 1 });
      expect(safety.score).toBeGreaterThanOrEqual(70);
      const minted = token(fx, 'sol', wallet(fx, 'sol'), sym('SFE'), { security: { renouncedMint: false } });
      buy(fx, wallet(fx, 'sol'), minted, 0.5);
      tick(fx);
      expect(fx.ta.summary(minted).security.safety).toMatchObject({ score: 25, band: 'danger' });
      const listed = fx.ta.trenches({ chain: 'sol', filters: { new: { keyword: minted.symbol } } }).new[0];
      expect(listed.security.safety?.score).toBe(25);
    } finally {
      await fx.built.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Early buyers
// ---------------------------------------------------------------------------

describe('early buyers', () => {
  let fx: Fx;
  beforeAll(async () => {
    fx = await setup();
  });
  afterAll(() => fx.built.close());

  it(`tracks the first ${EARLY_BUYERS_LIMIT} distinct buyers at trade time and reports their bags now`, () => {
    const dev = wallet(fx, 'sol');
    const t = token(fx, 'sol', dev, sym('EBY'));
    buy(fx, dev, t, 1);
    tick(fx, 20_000);
    const buyers = Array.from({ length: EARLY_BUYERS_LIMIT + 5 }, () => wallet(fx, 'sol'));
    for (const w of buyers) buy(fx, w, t, 0.05);
    // repeat buys, round trips and re-entries never add a rank
    buy(fx, buyers[0], t, 0.05);
    const [, seller, dumper, adder, flipper] = buyers;
    sell(fx, seller, t, bal(seller, t) / 2);
    sell(fx, dumper, t, bal(dumper, t));
    buy(fx, adder, t, 0.2);
    sell(fx, flipper, t, bal(flipper, t));
    buy(fx, flipper, t, 0.01);
    tick(fx);

    const { buyers: rows, summary } = fx.ta.earlyBuyers(t, { accountId: null });
    expect(rows).toHaveLength(EARLY_BUYERS_LIMIT);
    expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: EARLY_BUYERS_LIMIT }, (_, i) => i + 1));
    expect(rows.map((r) => r.wallet)).toEqual([dev, ...buyers.slice(0, EARLY_BUYERS_LIMIT - 1)].map((w) => w.address));
    expect(rows[0].walletTags).toContain('dev');
    const row = (w: WalletState) => rows.find((r) => r.wallet === w.address)!;
    expect(row(buyers[0]).status).toBe('added');
    expect(row(seller).status).toBe('sold_part');
    expect(row(dumper).status).toBe('sold_all');
    expect(row(adder).status).toBe('added');
    expect(row(flipper).status).toBe('sold_part'); // back in, with less than its first buy
    expect(row(buyers[10]).status).toBe('holding');

    const p = seller.positions.get(t.address)!;
    const price = fx.world.priceUsd(t);
    expect(row(seller)).toMatchObject({
      firstBuyAt: p.firstBuyAt,
      block: fx.world.blockAt('sol', p.firstBuyAt!),
      boughtUsd: p.boughtUsd,
      boughtTokens: p.boughtTokens,
      balance: p.balance,
      holdRate: p.balance / t.totalSupply,
      realizedPnlUsd: p.realizedPnlUsd,
    });
    expect(row(seller).unrealizedPnlUsd).toBeCloseTo(p.balance * price - p.costBasisUsd, 9);
    expect(row(dumper).unrealizedPnlUsd).toBe(0);

    expect(summary.soldAll).toBe(1);
    expect(summary.soldPart).toBe(2);
    expect(summary.added).toBe(2);
    expect(summary.holding + summary.soldPart + summary.soldAll + summary.added).toBe(EARLY_BUYERS_LIMIT);
    expect(summary.holdRateTotal).toBeCloseTo(rows.reduce((a, r) => a + r.balance, 0) / t.totalSupply, 12);
  });

  it('serves GET /early-buyers (404 for unknown tokens or the wrong chain)', async () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'EBR', 3);
    const get = (url: string) => fx.built.app.inject({ method: 'GET', url });
    const res = await get(`/api/sol/tokens/${t.address}/early-buyers`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as EarlyBuyersResponse;
    expect(body.buyers.map((b) => b.wallet)).toEqual(buyers.map((w) => w.address));
    expect(body.summary).toMatchObject({ holding: 3, soldPart: 0, soldAll: 0, added: 0 });
    expect((await get(`/api/bsc/tokens/${t.address}/early-buyers`)).statusCode).toBe(404);
    expect((await get('/api/sol/tokens/nope/early-buyers')).statusCode).toBe(404);
  });

  it('rebuilds the list from the world for tracks saved before early buyers were tracked', async () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'EBS', 4);
    sell(fx, buyers[1], t, bal(buyers[1], t) / 3);
    tick(fx);
    const before = fx.ta.earlyBuyers(t, { accountId: null });
    const snap = deserialize(serialize(fx.ta.serialize())) as { tracks: { address: string; earlyBuyers?: string[]; earlyTokens?: number[] }[] };
    for (const s of snap.tracks) {
      delete s.earlyBuyers;
      delete s.earlyTokens;
    }
    const fx2 = await setup();
    try {
      fx2.ctx.world.tokens.set(t.address, t);
      for (const w of buyers) fx2.ctx.world.wallets.set(w.address, w);
      fx2.ctx.world.now = fx.world.now;
      fx2.ta.restore(snap);
      const after = fx2.ta.earlyBuyers(t, { accountId: null });
      expect(after.buyers.map((b) => [b.wallet, b.status])).toEqual(before.buyers.map((b) => [b.wallet, b.status]));
      expect(after.summary).toEqual(before.summary);
    } finally {
      await fx2.built.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Exclusion filters (blacklists)
// ---------------------------------------------------------------------------

describe('exclusion filters', () => {
  let fx: Fx;
  beforeAll(async () => {
    fx = await setup();
  });
  afterAll(() => fx.built.close());

  it('hides excluded token addresses and creators in every list (REST GET and POST, any address case on EVM)', async () => {
    const keep = tokenWithBuyers(fx, 'bsc', 'XKP', 2).t;
    const hidden = tokenWithBuyers(fx, 'bsc', 'XHD', 2).t;
    const devTok = tokenWithBuyers(fx, 'bsc', 'XDV', 2).t;
    const s = fx.ta.summary(hidden);
    expect(matchTokenFilters(s, { excludeAddresses: [hidden.address] }, '24h', fx.world.now)).toBe(false);
    expect(matchTokenFilters(s, { excludeCreators: [hidden.creator] }, '24h', fx.world.now)).toBe(false);
    expect(matchTokenFilters(s, { excludeAddresses: [keep.address], excludeCreators: [keep.creator] }, '24h', fx.world.now)).toBe(true);

    const filters: TokenFilters = { keyword: 'X', excludeAddresses: [hidden.address.toUpperCase().replace('0X', '0x')], excludeCreators: [devTok.creator.toUpperCase()] };
    const listed = (tokens: TokenSummary[]) => tokens.map((x) => x.address).filter((a) => [keep, hidden, devTok].some((t) => t.address === a));
    const enc = encodeURIComponent(JSON.stringify(filters));
    let res = await fx.built.app.inject({ method: 'GET', url: `/api/bsc/trending?window=24h&filters=${enc}` });
    expect(res.statusCode).toBe(200);
    expect(listed(res.json().tokens)).toEqual([keep.address]);
    res = await fx.built.app.inject({ method: 'GET', url: `/api/bsc/trenches?filters=${encodeURIComponent(JSON.stringify({ new: filters }))}` });
    expect(listed(res.json().new)).toEqual([keep.address]);
    res = await fx.built.app.inject({ method: 'POST', url: '/api/bsc/trending', payload: { window: '24h', filters } });
    expect(listed(res.json().tokens)).toEqual([keep.address]);
    res = await fx.built.app.inject({ method: 'POST', url: '/api/bsc/trenches', payload: { filters: { new: filters }, limit: 100 } });
    expect(listed(res.json().new)).toEqual([keep.address]);
    res = await fx.built.app.inject({ method: 'POST', url: '/api/bsc/new-pairs', payload: { filters } });
    expect(res.statusCode).toBe(200);
  });

  it('accepts a whole blacklist (500 + 500 addresses) and refuses longer lists', async () => {
    const t = tokenWithBuyers(fx, 'sol', 'XBL', 2).t;
    const filler = (n: number) => Array.from({ length: n }, (_, i) => `Fi11er${i}`);
    const full: TokenFilters = { keyword: t.symbol, excludeAddresses: [...filler(499), t.address], excludeCreators: filler(500) };
    const enc = encodeURIComponent(JSON.stringify(full));
    let res = await fx.built.app.inject({ method: 'GET', url: `/api/sol/trending?filters=${enc}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toEqual([]);
    res = await fx.built.app.inject({ method: 'POST', url: '/api/sol/trending', payload: { filters: { ...full, excludeAddresses: [] } } });
    expect(res.json().tokens.map((x: TokenSummary) => x.address)).toEqual([t.address]);
    res = await fx.built.app.inject({ method: 'POST', url: '/api/sol/trending', payload: { filters: { excludeAddresses: filler(501) } } });
    expect(res.statusCode).toBe(400);
    res = await fx.built.app.inject({ method: 'POST', url: '/api/sol/trenches', payload: { filters: { new: { excludeCreators: [''] } } } });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// WebSocket channels
// ---------------------------------------------------------------------------

class FakeSocket {
  readyState = 1;
  bufferedAmount = 0;
  sent: WsServerMessage[] = [];
  private handlers = new Map<string, (data: unknown) => void>();
  on(ev: string, fn: (data: unknown) => void) {
    this.handlers.set(ev, fn);
    return this;
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  async client(msg: unknown) {
    this.handlers.get('message')!(Buffer.from(JSON.stringify(msg)));
    await new Promise((r) => setImmediate(r));
  }
  data(ch: string, type?: string) {
    return this.sent.filter((m): m is Extract<WsServerMessage, { op: 'data' }> => m.op === 'data' && m.ch === ch && (!type || m.type === type));
  }
}

describe('realtime channels', () => {
  let fx: Fx;
  beforeAll(async () => {
    fx = await setup();
  });
  afterAll(() => fx.built.close());

  it('sends list snapshots on subscribe and on the ticker cadence', async () => {
    const { t } = tokenWithBuyers(fx, 'sol', 'WSL', 2);
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    await sock.client({ op: 'sub', ch: 'trenches:sol', params: { filters: { new: { keyword: t.symbol } }, limit: 5 } });
    expect(sock.sent.some((m) => m.op === 'ack' && m.ch === 'trenches:sol')).toBe(true);
    const first = sock.data('trenches:sol', 'trenches');
    expect(first).toHaveLength(1);
    expect((first[0].data as { new: TokenSummary[] }).new[0].address).toBe(t.address);
    await sock.client({ op: 'sub', ch: 'trending:sol', params: { window: '5m', sort: 'volume' } });
    expect((sock.data('trending:sol', 'trending')[0].data as { window: string }).window).toBe('5m');
    await sock.client({ op: 'sub', ch: 'newpairs:sol', params: { limit: 3 } });
    expect(Array.isArray(sock.data('newpairs:sol', 'newpairs')[0].data)).toBe(true);
    fx.ctx.engine.step(2000); // tickers: trenches every 1s, trending/newpairs every 2s
    expect(sock.data('trenches:sol', 'trenches').length).toBeGreaterThanOrEqual(2);
    expect(sock.data('trending:sol', 'trending').length).toBeGreaterThanOrEqual(2);
    expect(sock.data('newpairs:sol', 'newpairs').length).toBeGreaterThanOrEqual(2);
    // invalid subscriptions are rejected with an error
    const errs = () => sock.sent.filter((m) => m.op === 'error');
    await sock.client({ op: 'sub', ch: 'trenches:doge' });
    await sock.client({ op: 'sub', ch: 'trending:sol', params: { window: '7m' } });
    await sock.client({ op: 'sub', ch: 'trenches:sol', params: { filters: { new: { nope: 1 } } } });
    expect(errs()).toHaveLength(3);
    // the bare per-column filters object (types.ts channel comment) is accepted too; big limits clamp
    await sock.client({ op: 'sub', ch: 'trenches:bsc', params: { new: { keyword: 'zz-no-such-token' } } });
    await sock.client({ op: 'sub', ch: 'trending:bsc', params: { window: '1h', limit: 500 } });
    expect(errs()).toHaveLength(3);
    expect((sock.data('trenches:bsc', 'trenches')[0].data as { new: TokenSummary[] }).new).toEqual([]);
    expect((sock.data('trending:bsc', 'trending')[0].data as { tokens: TokenSummary[] }).tokens.length).toBeLessThanOrEqual(100);
    // no work while warming
    const before = sock.sent.length;
    fx.ctx.engine.warming = true;
    fx.ctx.engine.step(2000);
    fx.ctx.engine.warming = false;
    expect(sock.sent.length).toBe(before);
  });

  it('streams token detail, trade batches and candles', async () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'WST', 2);
    const ch = `token:sol:${t.address}`;
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    await sock.client({ op: 'sub', ch, params: { resolution: '1s' } });
    const initial = sock.data(ch);
    expect(initial.map((m) => m.type)).toEqual(['token']);
    expect((initial[0].data as { address: string }).address).toBe(t.address);
    expect(fx.ta.summary(t).watchers).toBeGreaterThanOrEqual(0);
    tick(fx, 1500);
    expect(fx.ta.detail(t).watchers).toBe(t.watchers + 1);
    // nothing changed -> nothing sent
    fx.ta.channels.flushToken();
    expect(sock.data(ch)).toHaveLength(1);
    const tr1 = buy(fx, buyers[0], t, 0.3);
    const tr2 = buy(fx, buyers[1], t, 0.2);
    fx.ta.channels.flushToken();
    const batches = sock.data(ch, 'trades');
    expect(batches).toHaveLength(1);
    expect((batches[0].data as Trade[]).map((x) => x.id)).toEqual([tr1.id, tr2.id]);
    const candles = sock.data(ch, 'candle');
    expect(candles).toHaveLength(1);
    expect(candles[0].data).toEqual({ resolution: '1s', candle: t.candles['1s'][t.candles['1s'].length - 1] });
    // detail: at most once per second, only when the token changed
    expect(sock.data(ch, 'token')).toHaveLength(1);
    tick(fx, 1000);
    fx.ta.channels.flushToken();
    expect(sock.data(ch, 'token')).toHaveLength(2);
    expect((sock.data(ch, 'token')[1].data as { stats: { '24h': { swaps: number } } }).stats['24h'].swaps).toBe(t.tradeCount);
    tick(fx, 1000);
    fx.ta.channels.flushToken(); // unchanged: no repeats of anything
    expect(sock.data(ch)).toHaveLength(4);
    // a token on another chain / unknown address is rejected
    await sock.client({ op: 'sub', ch: `token:bsc:${t.address}` });
    await sock.client({ op: 'sub', ch: 'token:sol:nope' });
    expect(sock.sent.filter((m) => m.op === 'error')).toHaveLength(2);
    // trades are not buffered without subscribers
    await sock.client({ op: 'unsub', ch });
    buy(fx, buyers[0], t, 0.1);
    fx.ta.channels.flushToken();
    expect(sock.data(ch, 'trades')).toHaveLength(1);
  });

  it("pushes a candle's final state when the next bucket opens before its last change went out", async () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'WSR', 2);
    const ch = `token:sol:${t.address}`;
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    fx.world.now = Math.ceil(fx.world.now / 1000) * 1000 + 100; // early in a 1s bucket
    await sock.client({ op: 'sub', ch, params: { resolution: '1s' } });
    const candles = () => sock.data(ch, 'candle').map((m) => (m.data as { candle: Candle }).candle);
    buy(fx, buyers[0], t, 0.3);
    fx.ta.channels.flushToken();
    expect(candles()).toHaveLength(1);
    const bucket = candles()[0].time;
    tick(fx, 800);
    buy(fx, buyers[1], t, 0.2); // e.g. a REST swap between ticks: lands after this tick's flush
    tick(fx, 200);
    buy(fx, buyers[0], t, 0.1); // the next tick's trades open the next bucket before the flush
    fx.ta.channels.flushToken();
    const arr = t.candles['1s'];
    expect(candles().slice(1)).toEqual([arr[arr.length - 2], arr[arr.length - 1]]);
    expect(candles()[1].time).toBe(bucket);
    expect(candles()[2].time).toBeGreaterThan(bucket);
    fx.ta.channels.flushToken(); // nothing changed since
    expect(candles()).toHaveLength(3);
    // a rolled-over candle that did not change after its last push is not repeated
    tick(fx, 1000);
    buy(fx, buyers[1], t, 0.1);
    fx.ta.channels.flushToken();
    expect(candles().slice(3)).toEqual([arr[arr.length - 1]]);
  });

  it('accepts list channels only as exactly <list>:<chain>', async () => {
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    const bad = ['trenches:sol:1', 'trenches:sol:', 'trending:sol:x', 'newpairs:sol:zz'];
    for (const ch of bad) await sock.client({ op: 'sub', ch });
    expect(sock.sent.filter((m) => m.op === 'error').map((m) => m.ch)).toEqual(bad);
    expect(sock.sent.some((m) => m.op === 'ack')).toBe(false);
  });

  it('computes one list for viewers whose filters differ only in their blacklists', async () => {
    const made = [0, 1, 2].map(() => tokenWithBuyers(fx, 'base', 'BLK', 1).t);
    const viewers = [
      { filters: { new: { excludeAddresses: [made[2].address] } }, limit: 5 },
      { filters: { new: { excludeAddresses: [made[1].address], excludeKeywords: [made[0].symbol] } }, limit: 5 },
      { limit: 3 },
    ];
    const socks = viewers.map(() => new FakeSocket());
    for (let i = 0; i < viewers.length; i++) {
      fx.ctx.hub.attach(socks[i] as never);
      await socks[i].client({ op: 'sub', ch: 'trenches:base', params: viewers[i] });
    }
    const spy = vi.spyOn(fx.ta, 'trenches');
    (fx.ta.channels as unknown as { publishLists(p: string): void }).publishLists('trenches');
    expect(spy.mock.calls.filter(([q]) => q.chain === 'base')).toHaveLength(1);
    spy.mockRestore();
    for (let i = 0; i < viewers.length; i++) {
      const pushed = socks[i].data('trenches:base', 'trenches').at(-1)!.data as TrenchesSnapshot;
      // exactly what the viewer's own query computes
      expect(pushed).toEqual(fx.ta.trenches(parseTrenchesSub('trenches:base', viewers[i])));
    }
    const newest = (i: number) => (socks[i].data('trenches:base', 'trenches').at(-1)!.data as TrenchesSnapshot).new.map((x) => x.address);
    expect(newest(0)).not.toContain(made[2].address);
    expect(newest(0)).toContain(made[1].address);
    expect(newest(1)).not.toContain(made[1].address);
    expect(newest(1)).not.toContain(made[0].address);
    expect(newest(2)).toHaveLength(3);
    for (const sock of socks) await sock.client({ op: 'unsub', ch: 'trenches:base' });
  });

  it("falls back to a viewer's own list when its blacklist empties the shared one", async () => {
    const made = Array.from({ length: 45 }, () => tokenWithBuyers(fx, 'eth', 'BLE', 1).t);
    const viewers = [{ limit: 1 }, { limit: 1, filters: { new: { excludeAddresses: made.slice(1).map((t) => t.address) } } }];
    const socks = viewers.map(() => new FakeSocket());
    for (let i = 0; i < viewers.length; i++) {
      fx.ctx.hub.attach(socks[i] as never);
      await socks[i].client({ op: 'sub', ch: 'trenches:eth', params: viewers[i] });
    }
    const spy = vi.spyOn(fx.ta, 'trenches');
    (fx.ta.channels as unknown as { publishLists(p: string): void }).publishLists('trenches');
    expect(spy.mock.calls.filter(([q]) => q.chain === 'eth')).toHaveLength(2); // shared + the exact fallback
    spy.mockRestore();
    for (let i = 0; i < viewers.length; i++) {
      const pushed = socks[i].data('trenches:eth', 'trenches').at(-1)!.data as TrenchesSnapshot;
      expect(pushed).toEqual(fx.ta.trenches(parseTrenchesSub('trenches:eth', viewers[i])));
    }
    const [own] = (socks[1].data('trenches:eth', 'trenches').at(-1)!.data as TrenchesSnapshot).new;
    expect(made.slice(1).map((t) => t.address)).not.toContain(own.address);
    for (const sock of socks) await sock.client({ op: 'unsub', ch: 'trenches:eth' });
  });

  it('forgets parsed list params as soon as their last subscriber leaves, even with no live list group', async () => {
    const parsed = (fx.ta.channels as unknown as { parsed: Map<string, unknown> }).parsed;
    const listKeys = () => [...parsed.keys()].filter((k) => /^(trenches|trending|newpairs):/.test(k));
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    const before = listKeys().length;
    const lists = ['trenches:sol', 'trending:sol', 'newpairs:sol'] as const;
    for (let i = 0; i < 30; i++) {
      const ch = lists[i % 3];
      const excludeAddresses = Array.from({ length: 20 }, (_, j) => `churn${i}x${j}`);
      const params = ch === 'trenches:sol' ? { filters: { new: { excludeAddresses } } } : { filters: { excludeAddresses } };
      await sock.client({ op: 'sub', ch, params });
      await sock.client({ op: 'unsub', ch });
    }
    expect(sock.sent.filter((m) => m.op === 'error')).toEqual([]);
    expect(listKeys()).toHaveLength(before);

    // Two viewers of one group: the key stays until the last of them leaves; re-subscribing swaps it.
    const other = new FakeSocket();
    fx.ctx.hub.attach(other as never);
    await sock.client({ op: 'sub', ch: 'newpairs:sol', params: { limit: 7 } });
    await other.client({ op: 'sub', ch: 'newpairs:sol', params: { limit: 7 } });
    await sock.client({ op: 'unsub', ch: 'newpairs:sol' });
    expect(parsed.has('newpairs:sol|{"limit":7}')).toBe(true);
    await other.client({ op: 'sub', ch: 'newpairs:sol', params: { limit: 8 } });
    expect(parsed.has('newpairs:sol|{"limit":7}')).toBe(false);
    expect(parsed.has('newpairs:sol|{"limit":8}')).toBe(true);
    await other.client({ op: 'unsub', ch: 'newpairs:sol' });
    expect(listKeys()).toHaveLength(before);
  });

  it("keeps a sole viewer's buffered trades when it re-subscribes with new params", async () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'WSR', 1);
    const ch = `token:sol:${t.address}`;
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    await sock.client({ op: 'sub', ch, params: { resolution: '1m' } });
    const tr = buy(fx, buyers[0], t, 0.1); // a user fill landing between engine ticks
    await sock.client({ op: 'sub', ch, params: { resolution: '5m' } }); // chart resolution change
    expect(fx.ta.channels.viewerCount(t)).toBe(1);
    fx.ta.channels.flushToken();
    expect(sock.data(ch, 'trades').flatMap((m) => (m.data as Trade[]).map((x) => x.id))).toContain(tr.id);
    await sock.client({ op: 'unsub', ch });
    expect(fx.ta.channels.viewerCount(t)).toBe(0);
  });

  it('never strands the last detail update when a trade lands inside the 1s cache floor', async () => {
    const { t, buyers } = tokenWithBuyers(fx, 'sol', 'WSS', 1);
    const ch = `token:sol:${t.address}`;
    const sock = new FakeSocket();
    fx.ctx.hub.attach(sock as never);
    await sock.client({ op: 'sub', ch });
    tick(fx, 300); // within the detail/summary cache floor of the snapshot just sent
    buy(fx, buyers[0], t, 2);
    for (let i = 0; i < 12; i++) {
      tick(fx, 250);
      fx.ta.channels.flushToken();
    }
    const details = sock.data(ch, 'token').map((m) => m.data as { priceUsd: number; stats: { '24h': { swaps: number } } });
    const last = details[details.length - 1];
    expect(last.stats['24h'].swaps).toBe(t.tradeCount);
    expect(last.priceUsd).toBeCloseTo(fx.world.priceUsd(t), 15);
    // and the cached state is not re-sent once it is current
    const n = details.length;
    for (let i = 0; i < 8; i++) {
      tick(fx, 250);
      fx.ta.channels.flushToken();
    }
    expect(sock.data(ch, 'token')).toHaveLength(n);
    await sock.client({ op: 'unsub', ch });
  });
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

describe('performance', () => {
  let fx: Fx;
  afterAll(() => fx.built.close());

  it('serves trenches + trending for all chains in < 50ms with warm caches (~2000 tokens)', async () => {
    fx = await setup();
    const { world } = fx;
    const rng = world.rng;
    const perChain: Record<ChainId, number> = { sol: 1000, bsc: 450, base: 350, eth: 200 };
    const wallets: Record<ChainId, WalletState[]> = { sol: [], bsc: [], base: [], eth: [] };
    for (const c of CHAIN_IDS) for (let i = 0; i < 600; i++) wallets[c].push(wallet(fx, c, { native: 1e7 }, i % 17 === 0 ? ['smart'] : i % 11 === 0 ? ['bot'] : []));
    const start = world.now;
    world.now = start - 3 * 3600_000;
    const tokens: TokenState[] = [];
    const plan: ChainId[] = [];
    for (const c of CHAIN_IDS) for (let i = 0; i < perChain[c]; i++) plan.push(c);
    for (let i = plan.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    const total = plan.length;
    const t0 = performance.now();
    let trades = 0;
    for (let i = 0; i < total; i++) {
      world.now += (3 * 3600_000) / total;
      const chain = plan[i];
      const pool = wallets[chain];
      const dev = pool[rng.int(0, pool.length - 1)];
      const t = token(fx, chain, dev, sym('PRF'), { narrative: ['AI', 'Cats', 'Frogs', 'Dogs'][i % 4] });
      tokens.push(t);
      const native = chain === 'sol' ? 0.5 : chain === 'bsc' ? 0.15 : 0.03;
      buy(fx, dev, t, native * 2);
      // ~15% of tokens get heavy flow (some graduate), the rest a handful of trades
      const n = rng.chance(0.15) ? rng.int(80, 250) : rng.int(3, 25);
      for (let k = 0; k < n && t.status !== 'migrating'; k++) {
        const w = pool[rng.int(0, pool.length - 1)];
        const p = w.positions.get(t.address);
        if (p && p.balance > 0 && rng.chance(0.35)) world.executeSwap(w, t, 'sell', p.balance * rng.float(0.2, 1));
        else world.executeSwap(w, t, 'buy', native * rng.float(0.2, 3));
        trades++;
      }
      if (t.status === 'migrating') world.migrate(t);
    }
    // spread the most recent activity over the last hour so windows are populated
    world.now = start;
    for (let k = 0; k < 3000; k++) {
      const t = tokens[tokens.length - 1 - rng.int(0, 400)];
      if (t.status === 'migrating') continue;
      const w = wallets[t.chain][rng.int(0, 599)];
      world.now = start - rng.int(0, 3600_000);
      world.executeSwap(w, t, 'buy', 0.01);
      trades++;
    }
    world.now = start;
    const genMs = performance.now() - t0;
    expect(world.tokens.size).toBeGreaterThanOrEqual(1900);

    const run = () => {
      for (const chain of CHAIN_IDS) {
        fx.ta.trenches({ chain });
        fx.ta.trending({ chain, window: '1h' });
      }
    };
    const c0 = performance.now();
    run();
    const coldMs = performance.now() - c0;
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const w0 = performance.now();
      run();
      samples.push(performance.now() - w0);
    }
    samples.sort((a, b) => a - b);
    const warmMs = samples[2];
    // filtered + other windows (shared summaries)
    const f0 = performance.now();
    for (const chain of CHAIN_IDS) {
      fx.ta.trenches({ chain, filters: { new: { holderCount: { min: 3 }, rugRatio: { max: 0.5 } }, almost: { smartDegenCount: { min: 1 } } } });
      fx.ta.trending({ chain, window: '24h', sort: 'volume', filters: { liquidityUsd: { min: 1000 } } });
      fx.ta.trending({ chain, window: '5m' });
    }
    const filteredMs = performance.now() - f0;
    console.log(
      `[perf] ${world.tokens.size} tokens, ${trades} trades generated in ${genMs.toFixed(0)}ms; trenches+trending x4 chains: cold ${coldMs.toFixed(1)}ms, warm median ${warmMs.toFixed(2)}ms; filtered/other windows ${filteredMs.toFixed(1)}ms`,
    );
    expect(warmMs).toBeLessThan(50);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Rug ratio model
// ---------------------------------------------------------------------------

/** Mann-Whitney AUC: P(score of a positive > score of a negative), ties count half. */
function auc(pos: number[], neg: number[]): number {
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

describe('rug ratio', () => {
  const baseInputs: RugInputs = {
    chain: 'sol',
    status: 'curve',
    ageMs: 150_000,
    devHoldRate: 0.01,
    devStatus: 'hold',
    devSoldEarlyFrac: 0,
    athDrawdown: 0.1,
    bundlerRate: 0,
    bundlerHoldRate: 0,
    insiderHoldRate: 0,
    ratTraderRate: 0,
    sniperHoldRate: 0.02,
    top10HolderRate: 0.15,
    devOtherCreated: 0,
    devOtherResolved: 0,
    devOtherRugged: 0,
    devOtherMigrated: 0,
    renouncedMint: true,
    renouncedFreeze: true,
    isHoneypot: null,
    isOpenSource: null,
    isRenounced: null,
    buyTax: 0,
    sellTax: 0,
    lpBurnedRate: null,
    isWashTrading: false,
  };

  it('is monotone in each risk signal and bounded', () => {
    const clean = rugRatio(baseInputs);
    expect(clean).toBeLessThan(0.1);
    const worse: Partial<RugInputs>[] = [
      { devHoldRate: 0.15 },
      { bundlerRate: 0.4 },
      { insiderHoldRate: 0.2 },
      { top10HolderRate: 0.6 },
      { devOtherCreated: 10, devOtherResolved: 10, devOtherRugged: 6 },
      { renouncedMint: false },
      { devSoldEarlyFrac: 1, athDrawdown: 0.8, devStatus: 'sold_all' },
      { lpBurnedRate: 0, status: 'migrated' },
      { isWashTrading: true },
    ];
    for (const patch of worse) expect(rugRatio({ ...baseInputs, ...patch })).toBeGreaterThan(clean);
    const evm = { ...baseInputs, chain: 'bsc' as ChainId, renouncedMint: null, renouncedFreeze: null, isHoneypot: false, isOpenSource: true, isRenounced: true };
    expect(rugRatio({ ...evm, isHoneypot: true })).toBeGreaterThan(0.95);
    expect(rugRatio({ ...evm, sellTax: 0.2 })).toBeGreaterThan(rugRatio(evm));
    const all = rugRatio({ ...baseInputs, devHoldRate: 0.5, bundlerRate: 1, insiderHoldRate: 1, top10HolderRate: 1, renouncedMint: false });
    expect(all).toBeLessThanOrEqual(1);
    const sig = rugSignals(baseInputs);
    for (const k of Object.keys(RUG_WEIGHTS) as (keyof typeof RUG_WEIGHTS)[]) {
      expect(sig[k]).toBeGreaterThanOrEqual(0);
      expect(sig[k]).toBeLessThanOrEqual(1);
    }
  });

  it('separates bad fates from runners in a simulated market (AUC report)', async () => {
    const built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
    try {
      if (built.ctx.world.wallets.size === 0) {
        console.log('[rug-eval] market simulator not implemented yet; skipped');
        return;
      }
      const ta = tokenAnalyticsFor(built.ctx)!;
      const scored = new Map<string, { fate: TokenFate; rug: number }>();
      built.ctx.engine.addTicker(
        'rug-eval',
        () => {
          const w = built.ctx.world;
          for (const c of CHAIN_IDS) {
            const order = w.tokensByChain[c];
            for (let i = order.length - 1; i >= 0; i--) {
              const t = w.tokens.get(order[i]);
              if (!t) continue;
              const age = w.now - t.createdAt;
              if (age > 200_000) break;
              if (age < 140_000 || scored.has(t.address)) continue;
              // evaluation only: hidden fate is read here to score the model, never by analytics
              scored.set(t.address, { fate: t.fate, rug: ta.summary(t).security.rugRatio });
            }
          }
        },
        { everyMs: 10_000, duringWarmup: true },
      );
      built.ctx.engine.warmup(30 * 60_000);
      const by = (fates: TokenFate[]) => [...scored.values()].filter((x) => fates.includes(x.fate)).map((x) => x.rug);
      const bad = by(['rug', 'slow_rug', 'pump_dump']);
      const good = by(['runner', 'moon']);
      const dud = by(['dud']);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const a1 = auc(bad, good);
      const a2 = auc(bad, [...good, ...dud]);
      console.log(
        `[rug-eval] scored ${scored.size} tokens at ~2.5min: bad n=${bad.length} mean=${mean(bad).toFixed(3)}, good n=${good.length} mean=${mean(good).toFixed(3)}, dud n=${dud.length} mean=${mean(dud).toFixed(3)}; AUC bad-vs-good=${a1.toFixed(3)}, bad-vs-rest=${a2.toFixed(3)}`,
      );
      expect(bad.length).toBeGreaterThan(10);
      expect(good.length).toBeGreaterThan(3);
      expect(mean(bad)).toBeGreaterThan(mean(good));
      expect(a1).toBeGreaterThan(0.75);
    } finally {
      await built.close();
    }
  }, 300_000);
});
