// Wallet-side analytics: classification, period stats, style, holdings,
// activity, leaderboard, feed, signals, routes, realtime channels, and an
// evaluation of smart-money tagging against the simulator's hidden archetypes.

import { deserialize, serialize } from 'node:v8';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  launchpadsFor,
  type AuthResponse,
  type ChainId,
  type FeedItem,
  type LeaderboardRow,
  type PnlDistribution,
  type Signal,
  type TokenPositionRow,
  type Trade,
  type WalletProfile,
  type WsClientMessage,
  type WsServerMessage,
} from '@trenchscope/shared';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import type { Analytics } from '../src/analytics';
import { WalletAnalytics } from '../src/analytics/wallets';
import {
  DAY_MS,
  HOUR_MS,
  copyScore,
  freqLevel,
  pnlBucket,
  pnlLevel,
  sampleMetrics,
  speedClass,
  speedSubtitle,
  styleTitle,
} from '../src/analytics/wallets/metrics';
import { EntryWatch, type PendingEntry } from '../src/analytics/wallets/entries';
import { Ring } from '../src/analytics/wallets/ring';
import { dayStart } from '../src/analytics/wallets/tracker';
import type { TokenState, WalletState, World } from '../src/sim/world';

let built: BuiltApp;
let world: World;
let wa: WalletAnalytics;
let dev: WalletState;
let pumper: WalletState;
let seq = 0;

beforeEach(async () => {
  built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
  world = built.ctx.world;
  wa = (built.ctx.analytics as Analytics).wallets;
  // Round, deterministic clock well clear of day boundaries.
  world.now = dayStart(world.now) + 12 * HOUR_MS;
  dev = mkWallet('sol', { native: 1_000 });
  pumper = mkWallet('sol', { native: 1_000_000 });
});

afterEach(async () => {
  await built.close();
});

// ---------------------------------------------------------------------------
// Fixture helpers (crafted tokens / wallets / trades)
// ---------------------------------------------------------------------------

function mkWallet(chain: ChainId = 'sol', opts: Partial<Pick<WalletState, 'native' | 'createdAt' | 'label'>> & { tags?: WalletState['tags'] extends Set<infer T> ? T[] : never } = {}): WalletState {
  return world.createWallet(chain, 'retail', { native: 300, createdAt: world.now - 100 * DAY_MS, ...opts });
}

function mkToken(chain: ChainId = 'sol', creator: WalletState = dev, settle = true): TokenState {
  seq++;
  const t = world.createToken({
    chain,
    launchpad: launchpadsFor(chain)[0].id,
    creator,
    symbol: `TST${seq}`,
    name: `Test ${seq}`,
    description: '',
    logoSeed: `seed${seq}`,
    logoGlyph: 'x',
    narrative: 'Test',
    socials: {},
    xFollowers: null,
    fate: 'dud',
    hype: 0,
  });
  if (settle) world.now += 10_000; // later than the snipe window
  return t;
}

function swap(w: WalletState, t: TokenState, side: 'buy' | 'sell', amount: number, stepMs = 1_000): Trade {
  world.now += stepMs;
  const r = world.executeSwap(w, t, side, amount);
  if (!r.ok) throw new Error(`swap failed: ${r.error}`);
  return r.trade!;
}

const buy = (w: WalletState, t: TokenState, native: number, stepMs = 1_000) => swap(w, t, 'buy', native, stepMs);
const sellFrac = (w: WalletState, t: TokenState, frac = 1, stepMs = 1_000) => swap(w, t, 'sell', w.positions.get(t.address)!.balance * frac, stepMs);

/** Round trips: `wins` tokens pumped ~3.7x by the pumper before the exit, `losses` sold straight back (fees + impact). */
function trade(w: WalletState, wins: number, losses: number, size = 2): TokenState[] {
  const toks: TokenState[] = [];
  for (let i = 0; i < wins + losses; i++) {
    const t = mkToken(w.chain);
    buy(w, t, size);
    if (i < wins) buy(pumper, t, 30);
    sellFrac(w, t, 1);
    toks.push(t);
  }
  return toks;
}

function expectedBucket(ratio: number): keyof PnlDistribution {
  if (ratio > 5) return 'gt500';
  if (ratio >= 2) return 'p200to500';
  if (ratio >= 0) return 'p0to200';
  if (ratio >= -0.5) return 'n0to50';
  return 'lt50';
}

// ---------------------------------------------------------------------------
// Pure metrics
// ---------------------------------------------------------------------------

describe('metrics', () => {
  it('buckets PnL ratios at the GMGN edges', () => {
    expect(pnlBucket(5.01)).toBe('gt500');
    expect(pnlBucket(5)).toBe('p200to500');
    expect(pnlBucket(2)).toBe('p200to500');
    expect(pnlBucket(1.99)).toBe('p0to200');
    expect(pnlBucket(0)).toBe('p0to200');
    expect(pnlBucket(-0.01)).toBe('n0to50');
    expect(pnlBucket(-0.5)).toBe('n0to50');
    expect(pnlBucket(-0.51)).toBe('lt50');
  });

  it('maps frequency and P&L levels onto the 20-cell title grid', () => {
    expect([freqLevel(0.5), freqLevel(1), freqLevel(9.9), freqLevel(10), freqLevel(50), freqLevel(50.1)]).toEqual([1, 2, 2, 3, 3, 4]);
    const base = { trades: 100, tokens: 10, winRate: 0.6, lt50: 0, realized: 1000 };
    expect(styleTitle({ ...base, perDay: 80, pnl: 0.8 })).toBe('Money Printer');
    expect(styleTitle({ ...base, perDay: 80, pnl: 0.05, realized: 50 })).toBe('Full-Auto Grinder'); // L4 review variant
    expect(styleTitle({ ...base, perDay: 20, pnl: 0.2 })).toBe('Active Winner');
    expect(styleTitle({ ...base, perDay: 20, pnl: -0.3, realized: -500, lt50: 1 })).toBe('Fee Donor');
    expect(styleTitle({ ...base, perDay: 5, pnl: 0.05 })).toBe('Lukewarm');
    expect(styleTitle({ ...base, perDay: 5, pnl: -0.6, realized: -900, lt50: 5 })).toBe('Deep Underwater');
    expect(styleTitle({ ...base, perDay: 0.5, pnl: 0.9, winRate: 0.2, lt50: 1 })).toBe('One-Shot'); // lt50 share 0.1 < 0.15
    expect(styleTitle({ ...base, perDay: 0.5, pnl: -0.8, realized: -100, lt50: 6 })).toBe('Wiped Out');
    expect(styleTitle({ ...base, perDay: 80, pnl: 0.9, tokens: 4 })).toBe(''); // no read under 5 tokens
    expect(styleTitle({ ...base, trades: 0, perDay: 0, pnl: 0 })).toBe('');
    // P5 needs win rate >= 0.5 or few big losers; otherwise a +60% book is P4.
    expect(pnlLevel({ pnl: 0.6, tokens: 10, winRate: 0.3, lt50Share: 0.3, realized: 10, freq: 2 })).toBe(4);
    expect(pnlLevel({ pnl: -0.05, tokens: 10, winRate: 0.3, lt50Share: 0.45, realized: -10, freq: 2 })).toBe(1);
  });

  it('classifies speed from the median copy window', () => {
    expect(speedClass(30, 3)).toBe('Flash Flipper');
    expect(speedClass(3_600, 5)).toBe('Intraday');
    expect(speedClass(2 * 86_400, 5)).toBe('Swing');
    expect(speedClass(8 * 86_400, 5)).toBe('Long Hold');
    expect(speedClass(30, 2)).toBeNull();
    expect(speedClass(0, 9)).toBeNull();
    expect(speedSubtitle(45, 4)).toBe('Flash Flipper · 45s median hold');
    expect(speedSubtitle(45, 1)).toBe('');
  });

  it('keeps the copy score within 0..100 and applies the launcher discount', () => {
    for (let i = 0; i < 200; i++) {
      const s = copyScore({
        realized: (i % 7) * 900 - 2_000,
        sells: i % 11,
        trades: (i * 37) % 4_000,
        holdSec: (i * 9_973) % 400_000,
        entryUnder100k: i % 3 === 0 ? null : (i % 10) / 9,
        fastFlipRate: i % 4 === 0 ? null : (i % 5) / 4,
        launcher: i % 6 === 0,
      });
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      expect(Number.isInteger(s)).toBe(true);
    }
    const ideal = { realized: 10_000, sells: 50, trades: 100, holdSec: 172_800, entryUnder100k: 0, fastFlipRate: 0, launcher: false };
    expect(copyScore(ideal)).toBeGreaterThanOrEqual(95);
    expect(copyScore({ ...ideal, launcher: true })).toBe(Math.round(copyScore(ideal) * 0.45));
    expect(copyScore({ ...ideal, trades: 0 })).toBe(0);
    const worst = { realized: -5_000, sells: 50, trades: 3_000, holdSec: 1, entryUnder100k: 1, fastFlipRate: 1, launcher: false };
    expect(copyScore(worst)).toBeLessThanOrEqual(5);
  });

  it('computes activity-sample metrics (entries, flips, concentration)', () => {
    const t0 = 1_700_000_000_000;
    const rows = [
      { side: 'buy' as const, token: 'a', usd: 100, mcap: 20_000, t: t0 },
      { side: 'sell' as const, token: 'a', usd: 120, mcap: 25_000, t: t0 + 3_000 },
      { side: 'buy' as const, token: 'b', usd: 100, mcap: 500_000, t: t0 + 10_000 },
      { side: 'sell' as const, token: 'b', usd: 90, mcap: 450_000, t: t0 + 70_000 },
    ];
    const m = sampleMetrics(rows);
    expect(m.entryN).toBe(2);
    expect(m.entryUnder100k).toBe(0.5);
    expect(m.pairs).toBe(2);
    expect(m.fastFlipRate).toBe(0.5);
    expect(m.top3BuyShare).toBeNull(); // < 5 tokens
  });

  it('entry watch pops pending entries in target order and prunes old ones', () => {
    const ew = new EntryWatch();
    ew.add('tok', 'a', 1_000, 10_000); // target 20k
    ew.add('tok', 'b', 2_000, 5_000); // target 10k
    ew.add('tok', 'c', 3_000, 50_000); // target 100k
    ew.add('tok', 'd', 4_000, 0); // ignored (no market cap)
    const hits: PendingEntry[] = [];
    ew.onPrice('tok', 9_999, (e) => hits.push(e));
    expect(hits).toHaveLength(0);
    ew.onPrice('tok', 25_000, (e) => hits.push(e));
    expect(hits.map((e) => e.wallet)).toEqual(['b', 'a']);
    expect(ew.pending).toBe(1);
    ew.prune(3_500, () => true);
    expect(ew.pending).toBe(0);
    ew.add('gone', 'x', 5_000, 1);
    ew.prune(0, (tok) => tok !== 'gone');
    expect(ew.pending).toBe(0);
  });

  it('ring buffer keeps the newest cap entries', () => {
    const r = new Ring<number>(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect([r.at(0), r.at(1), r.at(2), r.at(3)]).toEqual([5, 4, 3, undefined]);
    expect(Ring.from([1, 2, 3, 4], 2).toArray()).toEqual([3, 4]);
  });
});

// ---------------------------------------------------------------------------
// Period stats
// ---------------------------------------------------------------------------

describe('period stats', () => {
  it('computes realized PnL, win rate and the distribution buckets per token', () => {
    const w = mkWallet();
    // Five tokens engineered to land in each bucket.
    const pumpThenExit = (pump: number) => {
      const t = mkToken();
      buy(w, t, 0.1);
      buy(pumper, t, pump);
      sellFrac(w, t);
      return t;
    };
    const dumpThenExit = (dumpFrac: number) => {
      const t = mkToken();
      buy(pumper, t, 30);
      buy(w, t, 0.1);
      sellFrac(pumper, t, dumpFrac);
      sellFrac(w, t);
      return t;
    };
    const toks = [pumpThenExit(56), pumpThenExit(31), pumpThenExit(7), dumpThenExit(0.2), dumpThenExit(0.72)];
    const intended: (keyof PnlDistribution)[] = ['gt500', 'p200to500', 'p0to200', 'n0to50', 'lt50'];
    toks.forEach((t, i) => {
      const p = w.positions.get(t.address)!;
      expect(expectedBucket(p.realizedPnlUsd / p.boughtUsd)).toBe(intended[i]);
    });

    const prof = wa.profile(w, { accountId: null });
    const positions = [...w.positions.values()];
    const realized = positions.reduce((a, p) => a + p.realizedPnlUsd, 0);
    const cost = positions.reduce((a, p) => a + p.boughtUsd, 0);
    for (const period of ['1d', '7d', '30d', 'all'] as const) {
      const s = prof.stats[period];
      expect(s.distribution).toEqual({ gt500: 1, p200to500: 1, p0to200: 1, n0to50: 1, lt50: 1 });
      expect(s.tokensTraded).toBe(5);
      expect(s.wins).toBe(3);
      expect(s.losses).toBe(2);
      expect(s.winRate).toBeCloseTo(0.6, 10);
      expect(s.buys).toBe(5);
      expect(s.sells).toBe(5);
      expect(s.realizedPnlUsd).toBeCloseTo(realized, 6);
      expect(s.totalCostUsd).toBeCloseTo(cost, 6);
      expect(s.pnlRate).toBeCloseTo(realized / cost, 8);
      expect(s.unrealizedPnlUsd).toBe(0);
      expect(s.avgBuyUsd).toBeCloseTo(cost / 5, 6);
      expect(s.avgHoldSeconds).toBeGreaterThan(0);
    }
    const s7 = prof.stats['7d'];
    expect(s7.dailyPnl).toHaveLength(7);
    expect(s7.dailyPnl[6].day).toBe(dayStart(world.now));
    expect(s7.dailyPnl.reduce((a, d) => a + d.pnlUsd, 0)).toBeCloseTo(realized, 6);
    expect(prof.stats['30d'].dailyPnl).toHaveLength(30);
    expect(prof.stats['1d'].dailyPnl.length).toBeGreaterThanOrEqual(1);
  });

  it('counts unrealized gains of open positions as wins and rolls periods forward', () => {
    const w = mkWallet();
    const t = mkToken();
    buy(w, t, 1);
    buy(pumper, t, 20);
    let prof = wa.profile(w, { accountId: null });
    const pos = w.positions.get(t.address)!;
    const expectedU = pos.balance * world.priceUsd(t) - pos.costBasisUsd;
    expect(prof.stats['7d'].unrealizedPnlUsd).toBeCloseTo(expectedU, 6);
    expect(prof.stats['7d'].winRate).toBe(1);
    expect(prof.stats['7d'].totalPnlUsd).toBeCloseTo(expectedU, 6);

    // Two days later the trade has left the 1d window but not 7d / 30d / all.
    world.now += 2 * DAY_MS;
    w.lastActiveAt += 1; // bust the profile cache key
    prof = wa.profile(w, { accountId: null });
    expect(prof.stats['1d'].tokensTraded).toBe(0);
    expect(prof.stats['1d'].buys).toBe(0);
    expect(prof.stats['7d'].tokensTraded).toBe(1);
    expect(prof.stats['all'].tokensTraded).toBe(1);
  });

  it('handles positions whose token was deleted by the simulator', () => {
    const w = mkWallet();
    const [t1] = trade(w, 1, 1);
    world.tokens.delete(t1.address);
    const prof = wa.profile(w, { accountId: null });
    expect(prof.stats.all.tokensTraded).toBe(2);
    expect(wa.holdings(w, { includeClosed: true }, { accountId: null }).map((r) => r.token)).not.toContain(t1.address);
    expect(wa.activity(w, {}, { accountId: null }).every((i) => i.trade.token !== t1.address)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe('classification', () => {
  it('tags snipers by early first buys (>= 5 snipes and >= 10% of tokens)', () => {
    const sniper = mkWallet();
    const casual = mkWallet();
    for (let i = 0; i < 5; i++) {
      const t = mkToken('sol', dev, false);
      buy(sniper, t, 0.2, 0); // same block as creation
      buy(casual, t, 0.2, 0);
      world.now += 10_000;
    }
    for (let i = 0; i < 50; i++) buy(casual, mkToken(), 0.05);
    // The creator's own launch buys never count as snipes.
    const devSniper = mkWallet();
    for (let i = 0; i < 6; i++) {
      const t = mkToken('sol', devSniper, false);
      buy(devSniper, t, 0.2, 0);
      world.now += 10_000;
    }
    wa.classifyAll();
    expect(sniper.tags.has('sniper')).toBe(true);
    expect(casual.tags.has('sniper')).toBe(false); // 5 / 55 < 10%
    expect(devSniper.tags.has('sniper')).toBe(false);
  });

  it('tags whales by balance (traded wallets only) or average buy size', () => {
    const rich = mkWallet('sol', { native: 1_000 }); // $185k
    const richIdle = mkWallet('sol', { native: 1_000 });
    const bigBuyer = mkWallet('sol', { native: 70 });
    const small = mkWallet('sol', { native: 50 });
    buy(rich, mkToken(), 0.1);
    buy(bigBuyer, mkToken(), 60); // ~$11k
    buy(small, mkToken(), 1);
    wa.classifyAll();
    expect(rich.tags.has('whale')).toBe(true);
    expect(richIdle.tags.has('whale')).toBe(false);
    expect(bigBuyer.tags.has('whale')).toBe(true);
    expect(small.tags.has('whale')).toBe(false);
  });

  it('tags fresh wallets (< 24h old, < 15 tokens)', () => {
    const young = mkWallet('sol', { createdAt: world.now - 2 * HOUR_MS });
    const old = mkWallet('sol', { createdAt: world.now - 3 * DAY_MS });
    const busyYoung = mkWallet('sol', { createdAt: world.now - HOUR_MS });
    for (let i = 0; i < 15; i++) buy(busyYoung, mkToken(), 0.05);
    wa.classifyAll();
    expect(young.tags.has('fresh')).toBe(true);
    expect(old.tags.has('fresh')).toBe(false);
    expect(busyYoung.tags.has('fresh')).toBe(false);
  });

  it('tags bots (> 200 trades/day equivalent, median hold < 120s)', () => {
    const bot = mkWallet();
    const toks = Array.from({ length: 10 }, () => mkToken());
    for (let round = 0; round < 4; round++)
      for (const t of toks) {
        buy(bot, t, 0.05, 5_000);
        sellFrac(bot, t, 1, 30_000);
      }
    const slow = mkWallet();
    for (const t of toks.slice(0, 6)) {
      buy(slow, t, 0.05, 5_000);
      sellFrac(slow, t, 1, 10 * 60_000);
    }
    wa.classifyAll();
    expect(bot.tags.has('bot')).toBe(true);
    expect(slow.tags.has('bot')).toBe(false);
  });

  it('tags sandwich bots (same-block buy / victim / sell, >= 5 times)', () => {
    const sw = mkWallet();
    const almost = mkWallet();
    const victim = mkWallet();
    for (let i = 0; i < 5; i++) {
      const t = mkToken();
      buy(sw, t, 1, 2_000);
      buy(victim, t, 0.5, 0);
      sellFrac(sw, t, 1, 0);
      if (i < 4) {
        buy(almost, t, 1, 2_000);
        buy(victim, t, 0.5, 0);
        sellFrac(almost, t, 1, 0);
      }
    }
    wa.classifyAll();
    expect(sw.tags.has('sandwich')).toBe(true);
    expect(almost.tags.has('sandwich')).toBe(false);
    expect(victim.tags.has('sandwich')).toBe(false);
  });

  it('tags smart money (2x hit rate z-test + profitable book) with hysteresis, never bots/sandwichers, and keeps identity tags', () => {
    const smart = mkWallet();
    const loser = mkWallet();
    const kol = mkWallet('sol', { label: 'CryptoTest' });
    kol.tags.add('kol');
    trade(smart, 6, 2); // 8 tokens, 75% win, ~+$5k
    trade(loser, 2, 6);
    trade(kol, 1, 1);
    wa.classifyAll();
    expect(smart.tags.has('smart')).toBe(true);
    expect(loser.tags.has('smart')).toBe(false);
    expect(kol.tags.has('kol')).toBe(true); // identity tag preserved
    expect(wa.tags(kol)[0]).toBe('kol');

    // Hysteresis: 50% win rate with profit keeps an existing tag but does not grant one.
    const keeper = mkWallet();
    const newcomer = mkWallet();
    trade(keeper, 5, 5);
    trade(newcomer, 5, 5);
    keeper.tags.add('smart');
    wa.classifyAll();
    expect(keeper.tags.has('smart')).toBe(true);
    expect(newcomer.tags.has('smart')).toBe(false);
    // ...and drops once the win rate falls below 45%.
    trade(keeper, 0, 3);
    wa.classifyAll();
    expect(keeper.tags.has('smart')).toBe(false);

    // A profitable sandwich bot is never smart money.
    const mev = mkWallet();
    trade(mev, 10, 0);
    for (let i = 0; i < 5; i++) {
      const t = mkToken();
      buy(mev, t, 1, 2_000);
      buy(loser, t, 0.5, 0);
      sellFrac(mev, t, 1, 0);
    }
    wa.classifyAll();
    expect(mev.tags.has('sandwich')).toBe(true);
    expect(mev.tags.has('smart')).toBe(false);
  });

  it('credits 2x runs after an entry even when the wallet already exited, and z-gates small samples', () => {
    const early = mkWallet();
    const t = mkToken();
    buy(early, t, 1);
    sellFrac(early, t);
    const tr = () => (wa as unknown as { tracks: Map<string, { entryStats(p: '7d', now: number): { entries: number; hits: number } }> }).tracks.get(early.address)!;
    expect(tr().entryStats('7d', world.now)).toEqual({ entries: 1, hits: 0 });
    buy(pumper, t, 30); // the token runs > 2x after the entry
    expect(tr().entryStats('7d', world.now)).toEqual({ entries: 1, hits: 1 });

    // 3 of 6 entries ran 2x: profitable, but not significant against the base rate.
    const lucky = mkWallet();
    trade(lucky, 3, 3, 3);
    // 6 of 8 entries ran 2x: significant (z > 2.33 vs the 30% default base rate).
    const picker = mkWallet();
    trade(picker, 6, 2, 1);
    wa.classifyAll();
    expect(lucky.tags.has('smart')).toBe(false);
    expect(picker.tags.has('smart')).toBe(true);
  });

  it('runs on the engine ticker during warmup too', () => {
    const smart = mkWallet();
    trade(smart, 6, 2);
    expect(smart.tags.has('smart')).toBe(false);
    built.ctx.engine.warming = true;
    wa.classifyTick();
    built.ctx.engine.warming = false;
    expect(smart.tags.has('smart')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile, holdings, activity
// ---------------------------------------------------------------------------

describe('profile / holdings / activity', () => {
  it('builds a full profile with style, badges and viewer-independent identity', () => {
    const w = mkWallet('sol', { label: 'Alpha' });
    w.tags.add('kol');
    w.xFollowers = 12_345;
    trade(w, 6, 2);
    wa.classifyAll();
    const p = wa.profile(w, { accountId: null });
    expect(p.address).toBe(w.address);
    expect(p.chain).toBe('sol');
    expect(p.label).toBe('Alpha');
    expect(p.remark).toBeNull();
    expect(p.avatarSeed).toBe(w.address);
    expect(p.tags).toEqual(['kol', 'smart']);
    expect(p.nativeBalanceUsd).toBeCloseTo(w.native * world.nativeUsd('sol'), 6);
    expect(p.xFollowers).toBe(12_345);
    expect(p.isFollowed).toBe(false);
    expect(Object.keys(p.stats).sort()).toEqual(['1d', '30d', '7d', 'all']);
    expect(p.style.title).not.toBe(''); // 8 tokens -> has a read
    expect(p.style.subtitle).toMatch(/^Flash Flipper · /); // ~1-2s round trips
    const keys = p.style.badges.map((b) => b.key);
    expect(keys).toContain('low_sample'); // 16 trades < 20
    expect(keys).toContain('official');
    expect(keys).toContain('sniper'); // curve entries far below $100k
    for (const b of p.style.badges) expect(b.value.length).toBeGreaterThan(0);
    expect(p.style.copyScore).toBeGreaterThanOrEqual(0);
    expect(p.style.copyScore).toBeLessThanOrEqual(100);
    // Cached for 10s while the wallet is idle.
    expect(wa.profile(w, { accountId: null }).stats).toBe(p.stats);
  });

  it('lists holdings with token info, sorting and closed positions on request', () => {
    const w = mkWallet();
    const a = mkToken();
    const b = mkToken();
    const c = mkToken();
    buy(w, a, 0.5);
    buy(w, b, 3);
    buy(pumper, a, 25); // a pumps: highest PnL, but b is the bigger bag? (value decides)
    buy(w, c, 1);
    sellFrac(w, c);
    let rows = wa.holdings(w, {}, { accountId: null });
    expect(rows.map((r) => r.token).sort()).toEqual([a.address, b.address].sort());
    const row = rows.find((r) => r.token === a.address)!;
    const pos = w.positions.get(a.address)!;
    expect(row.tokenInfo.address).toBe(a.address);
    expect(row.tokenInfo.symbol).toBe(a.symbol);
    expect(row.valueUsd).toBeCloseTo(pos.balance * world.priceUsd(a), 6);
    expect(row.unrealizedPnlUsd).toBeCloseTo(row.valueUsd - pos.costBasisUsd, 6);
    expect(row.totalPnlUsd).toBeCloseTo(row.realizedPnlUsd + row.unrealizedPnlUsd, 6);
    expect(row.pnlRate).toBeCloseTo(row.totalPnlUsd / row.boughtUsd, 8);
    expect(row.addrType).toBe('wallet');
    expect(row.holdRate).toBeCloseTo(pos.balance / a.totalSupply, 12);
    const isDesc = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] >= x);
    expect(isDesc(rows.map((r) => r.valueUsd))).toBe(true);
    rows = wa.holdings(w, { sort: 'pnl' }, { accountId: null });
    expect(rows[0].token).toBe(a.address);
    expect(isDesc(rows.map((r) => r.totalPnlUsd))).toBe(true);
    rows = wa.holdings(w, { includeClosed: true, sort: 'recent' }, { accountId: null });
    expect(rows).toHaveLength(3);
    expect(rows[0].token).toBe(c.address);
    expect(rows[0].balance).toBe(0);
    expect(isDesc(rows.map((r) => r.lastActiveAt))).toBe(true);
  });

  it('returns activity newest first with first-buy / close flags and filters', () => {
    const w = mkWallet();
    const t = mkToken();
    const t1 = buy(w, t, 0.5);
    const t2 = buy(w, t, 0.5);
    const t3 = sellFrac(w, t, 0.5);
    const t4 = sellFrac(w, t, 1);
    const items = wa.activity(w, {}, { accountId: null });
    expect(items.map((i) => i.trade.id)).toEqual([t4.id, t3.id, t2.id, t1.id]);
    expect(items.map((i) => i.isFirstBuy)).toEqual([false, false, false, true]);
    expect(items.map((i) => i.isClose)).toEqual([true, false, false, false]);
    expect(items[0].token.address).toBe(t.address);
    expect(wa.activity(w, { type: 'buy' }, { accountId: null }).map((i) => i.trade.id)).toEqual([t2.id, t1.id]);
    expect(wa.activity(w, { limit: 1 }, { accountId: null })).toHaveLength(1);
    expect(wa.activity(w, { before: t3.timestamp }, { accountId: null }).map((i) => i.trade.id)).toEqual([t2.id, t1.id]);
  });

  it('keeps 100 activity rows for simulated wallets and 1000 for user wallets', () => {
    const sim = mkWallet();
    const user = world.createWallet('sol', 'user', { native: 10_000, accountId: 'acc_test', createdAt: world.now - DAY_MS });
    const t = mkToken();
    for (let i = 0; i < 130; i++) {
      buy(sim, t, 0.01, 100);
      buy(user, t, 0.01, 100);
    }
    expect(wa.activity(sim, { limit: 1000 }, { accountId: null })).toHaveLength(100);
    expect(wa.activity(user, { limit: 1000 }, { accountId: null })).toHaveLength(130);
  });
});

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

describe('leaderboard', () => {
  it('filters by tag and sorts by the requested period stat', () => {
    const a = mkWallet();
    const b = mkWallet();
    const c = mkWallet();
    const whale = mkWallet('sol', { native: 2_000 });
    trade(a, 8, 1, 3);
    trade(b, 6, 2, 2);
    trade(c, 7, 2, 1.5);
    trade(whale, 1, 2);
    wa.classifyAll();
    for (const w of [a, b, c]) expect(w.tags.has('smart')).toBe(true);
    expect(whale.tags.has('whale')).toBe(true);

    const smart = wa.leaderboard('sol', { tag: 'smart', period: '7d', sort: 'pnl' }, { accountId: null });
    const ours = smart.filter((r) => [a.address, b.address, c.address].includes(r.address));
    expect(ours).toHaveLength(3);
    for (const r of smart) expect(r.tags).toContain('smart');
    const pnl = smart.map((r) => r.stats.realizedPnlUsd);
    expect(pnl.every((x, i) => i === 0 || pnl[i - 1] >= x)).toBe(true);
    expect(ours[0].address).toBe(a.address);

    const whales = wa.leaderboard('sol', { tag: 'whale' }, { accountId: null });
    expect(whales.map((r) => r.address)).toContain(whale.address);
    for (const r of whales) expect(r.tags).toContain('whale');

    const byTokens = wa.leaderboard('sol', { tag: 'all', sort: 'tokens', period: '1d', limit: 5 }, { accountId: null });
    expect(byTokens.length).toBeLessThanOrEqual(5);
    const toks = byTokens.map((r) => r.stats.tokensTraded);
    expect(toks.every((x, i) => i === 0 || toks[i - 1] >= x)).toBe(true);

    // The live ticker rebuilds snapshots in time slices; after a few ticks every chain has one.
    const lbInternal = () => (wa as unknown as { lb: Map<string, { at: number; entries: unknown[] }> }).lb;
    lbInternal().clear();
    for (let i = 0; i < 12; i++) {
      world.now += 1_000;
      wa.leaderboardTick();
    }
    expect(lbInternal().get('sol')?.entries.length).toBeGreaterThanOrEqual(4);
    expect(lbInternal().size).toBe(4);

    const byWin = wa.leaderboard('sol', { tag: 'smart', sort: 'winRate' }, { accountId: null });
    const wr = byWin.map((r) => r.stats.winRate);
    expect(wr.every((x, i) => i === 0 || wr[i - 1] >= x)).toBe(true);
    const row = byWin.find((r) => r.address === a.address)!;
    expect(row.style.title).not.toBe('');
    expect(row.isFollowed).toBe(false);
    expect(row.avatarSeed).toBe(a.address);
  });
});

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

describe('signals', () => {
  const kinds = (token: TokenState) =>
    wa
      .signals('sol', { limit: 500 })
      .filter((s) => s.token.address === token.address)
      .map((s) => s.kind);

  it("fires smart_buy on a smart wallet's first buy and kol_buy for KOLs", () => {
    const s = mkWallet();
    s.tags.add('smart');
    const k = mkWallet('sol', { label: 'KolGuy' });
    k.tags.add('kol');
    const t = mkToken();
    buy(s, t, 1);
    buy(s, t, 1); // second buy: no new signal
    buy(k, t, 1);
    const sigs = wa.signals('sol', { kind: 'smart_buy' }).filter((x) => x.token.address === t.address);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].wallets).toEqual([s.address]);
    expect(sigs[0].marketCapAtTrigger).toBeGreaterThan(0);
    expect(sigs[0].maxMultiple).toBeGreaterThanOrEqual(1);
    const kolSig = wa.signals('sol', { kind: 'kol_buy' }).find((x) => x.token.address === t.address)!;
    expect(kolSig.detail).toContain('KolGuy');
  });

  it('fires multi_buy once when 3 distinct smart wallets buy within 30 minutes', () => {
    const smarts = Array.from({ length: 4 }, () => {
      const w = mkWallet();
      w.tags.add('smart');
      return w;
    });
    const t = mkToken();
    buy(smarts[0], t, 0.5);
    buy(smarts[0], t, 0.5);
    buy(smarts[1], t, 0.5, 10 * 60_000);
    expect(kinds(t)).not.toContain('multi_buy');
    buy(smarts[2], t, 0.5, 10 * 60_000);
    buy(smarts[3], t, 0.5, 60_000);
    const multi = wa.signals('sol', { kind: 'multi_buy' }).filter((x) => x.token.address === t.address);
    expect(multi).toHaveLength(1);
    expect(new Set(multi[0].wallets)).toEqual(new Set(smarts.slice(0, 3).map((w) => w.address)));
    // Outside the 30m window the earliest buys no longer count.
    const t2 = mkToken();
    buy(smarts[0], t2, 0.5);
    buy(smarts[1], t2, 0.5, 20 * 60_000);
    buy(smarts[2], t2, 0.5, 20 * 60_000);
    expect(kinds(t2)).not.toContain('multi_buy');
  });

  it('fires migration, dev_sell and mcap_level signals, and tracks the max multiple', () => {
    const t = mkToken('sol', dev, false);
    buy(dev, t, 1, 0);
    sellFrac(dev, t, 0.1);
    expect(kinds(t)).not.toContain('dev_sell');
    sellFrac(dev, t, 0.5);
    const ds = wa.signals('sol', { kind: 'dev_sell' }).find((s) => s.token.address === t.address)!;
    expect(ds.wallets).toEqual([dev.address]);
    expect(ds.title).toMatch(/^Dev sold/);

    buy(pumper, t, 150); // completes the curve
    expect(t.status).toBe('migrating');
    world.migrate(t);
    expect(kinds(t)).toContain('migration');

    buy(pumper, t, 20); // pool buy pushes the market cap through $100k
    const lvl = wa.signals('sol', { kind: 'mcap_level' }).filter((s) => s.token.address === t.address);
    expect(lvl).toHaveLength(1);
    expect(lvl[0].title).toBe('Market cap $100K');
    expect(lvl[0].marketCapAtTrigger).toBeGreaterThanOrEqual(100_000);
    const migr = wa.signals('sol', { kind: 'migration' }).find((s) => s.token.address === t.address)!;
    expect(migr.maxMultiple).toBeGreaterThan(1.2); // price rose after migrating
    buy(pumper, t, 20);
    expect(wa.signals('sol', { kind: 'mcap_level' }).filter((s) => s.token.address === t.address)).toHaveLength(1); // still below $500k
    expect(kinds(t)).toContain('ath');
  });

  it('fires large_buy, bundler_sell, cto/boost, kol_call and price_spike', () => {
    const t = mkToken();
    const whale = mkWallet('sol', { native: 2_000 });
    buy(whale, t, 40); // ~$7.4k and > 2% of supply
    expect(kinds(t)).toContain('large_buy');

    const bundler = mkWallet();
    t.bundlers.add(bundler.address);
    buy(bundler, t, 1);
    sellFrac(bundler, t, 0.5);
    expect(kinds(t)).toContain('bundler_sell');

    world.emit('tokenFlag', t, 'cto');
    world.emit('tokenFlag', t, 'boost');
    world.emit('tokenFlag', t, 'socials');
    const k = mkWallet('sol', { label: 'Caller' });
    k.tags.add('kol');
    world.emit('kolCall', t, k);
    expect(kinds(t)).toEqual(expect.arrayContaining(['cto', 'boost', 'kol_call']));
    expect(wa.signals('sol', { kind: 'kol_call' })[0].wallets).toEqual([k.address]);

    // Price spike: an older token pumping > 50% in 5m on >= 20 swaps.
    const old = mkToken();
    const traders = Array.from({ length: 22 }, () => mkWallet());
    world.now += 15 * 60_000;
    buy(traders[0], old, 0.1);
    world.now += 6 * 60_000; // the window opens after this trade
    for (const w of traders.slice(1)) buy(w, old, 1.5, 2_000);
    wa.signalEngine.checkSpikes();
    const spike = wa.signals('sol', { kind: 'price_spike' }).filter((s) => s.token.address === old.address);
    expect(spike).toHaveLength(1);
    expect(spike[0].detail).toMatch(/in 5m on \d+ swaps/);
  });
});

// ---------------------------------------------------------------------------
// Feed + routes
// ---------------------------------------------------------------------------

async function call<T = unknown>(url: string, token?: string): Promise<{ status: number; body: T }> {
  const res = await built.app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json() as T };
}

describe('feed', () => {
  it('serves smart / kol / all feeds newest first from tagged-wallet trades', () => {
    const s = mkWallet();
    s.tags.add('smart');
    const k = mkWallet('sol', { label: 'K' });
    k.tags.add('kol');
    const nobody = mkWallet();
    const t = mkToken();
    const a = buy(s, t, 0.5);
    const b = buy(nobody, t, 0.5);
    const c = buy(k, t, 0.5);
    const d = sellFrac(s, t);
    const ids = (items: FeedItem[]) => items.map((i) => i.trade.id);
    expect(ids(wa.feed('sol', 'smart', 10, { accountId: null }))).toEqual([d.id, a.id]);
    expect(ids(wa.feed('sol', 'kol', 10, { accountId: null }))).toEqual([c.id]);
    const all = ids(wa.feed('sol', 'all', 50, { accountId: null }));
    expect(all).toEqual(expect.arrayContaining([a.id, c.id, d.id]));
    expect(all).not.toContain(b.id);
    expect(wa.feed('sol', 'follow', 10, { accountId: null })).toEqual([]);
    const first = wa.feed('sol', 'smart', 10, { accountId: null });
    expect(first[1].isFirstBuy).toBe(true);
    expect(first[0].isClose).toBe(true);
  });
});

describe('routes', () => {
  it('serves wallet profile / holdings / activity with 404 for unknown wallets and chain mismatch', async () => {
    const w = mkWallet();
    trade(w, 2, 1);
    let r = await call<WalletProfile>(`/api/sol/wallets/${w.address}`);
    expect(r.status).toBe(200);
    expect(r.body.address).toBe(w.address);
    expect(r.body.stats['7d'].tokensTraded).toBe(3);
    expect((await call(`/api/sol/wallets/notawallet`)).status).toBe(404);
    expect((await call(`/api/bsc/wallets/${w.address}`)).status).toBe(404);
    expect((await call(`/api/xyz/wallets/${w.address}`)).status).toBe(400);

    const h = await call<TokenPositionRow[]>(`/api/sol/wallets/${w.address}/holdings?includeClosed=1&sort=pnl`);
    expect(h.status).toBe(200);
    expect(h.body).toHaveLength(3);
    expect((await call<TokenPositionRow[]>(`/api/sol/wallets/${w.address}/holdings`)).body).toHaveLength(0);
    expect((await call(`/api/sol/wallets/${w.address}/holdings?sort=nope`)).status).toBe(400);

    const act = await call<FeedItem[]>(`/api/sol/wallets/${w.address}/activity?type=sell&limit=2`);
    expect(act.status).toBe(200);
    expect(act.body).toHaveLength(2);
    expect(act.body.every((i) => i.trade.side === 'sell')).toBe(true);
    expect((await call(`/api/sol/wallets/${w.address}/activity?type=swap`)).status).toBe(400);
    expect((await call(`/api/sol/wallets/nobody/activity`)).status).toBe(404);
  });

  it('serves leaderboard, feed (follow requires auth) and signals', async () => {
    const s = mkWallet();
    trade(s, 6, 2);
    wa.classifyAll();
    const lb = await call<LeaderboardRow[]>('/api/sol/leaderboard?tag=smart&period=7d&sort=pnl&limit=10');
    expect(lb.status).toBe(200);
    expect(lb.body.map((x) => x.address)).toContain(s.address);
    expect((await call('/api/sol/leaderboard?period=90d')).status).toBe(400);
    expect((await call('/api/sol/leaderboard')).status).toBe(200);

    expect((await call('/api/sol/feed?kind=smart')).status).toBe(200);
    expect((await call('/api/sol/feed')).status).toBe(200);
    expect((await call('/api/sol/feed?kind=weird')).status).toBe(400);
    const anon = await call<{ error: string }>('/api/sol/feed?kind=follow');
    expect(anon.status).toBe(401);
    expect(typeof anon.body.error).toBe('string');

    const t = mkToken();
    world.migrate(t);
    const sig = await call<Signal[]>('/api/sol/signals?kind=migration&limit=5');
    expect(sig.status).toBe(200);
    expect(sig.body[0].kind).toBe('migration');
    expect((await call('/api/sol/signals?kind=moon')).status).toBe(400);
    expect((await call('/api/eth/signals')).status).toBe(200);
  });

  it('serves the follow feed for an authenticated viewer', async () => {
    const res = await built.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
    if (res.statusCode !== 200) return; // accounts module not available
    const auth = res.json() as AuthResponse;
    const target = mkWallet();
    const t = mkToken();
    const tr = buy(target, t, 0.5);
    const empty = await call<FeedItem[]>('/api/sol/feed?kind=follow', auth.token);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);
    const f = await built.app.inject({
      method: 'POST',
      url: '/api/follows',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { chain: 'sol', address: target.address, remark: 'buddy' },
    });
    expect(f.statusCode).toBe(200);
    const feed = await call<FeedItem[]>('/api/sol/feed?kind=follow', auth.token);
    expect(feed.body.map((i) => i.trade.id)).toEqual([tr.id]);
    expect(feed.body[0].trade.walletTags).toContain('following');
    expect(feed.body[0].trade.walletLabel).toBe('buddy');
    const prof = await call<WalletProfile>(`/api/sol/wallets/${target.address}`, auth.token);
    expect(prof.body.isFollowed).toBe(true);
    expect(prof.body.remark).toBe('buddy');
    expect(prof.body.tags).toContain('following');
  });
});

// ---------------------------------------------------------------------------
// Realtime channels (fake socket)
// ---------------------------------------------------------------------------

function fakeClient() {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  const sent: WsServerMessage[] = [];
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    send: (s: string) => sent.push(JSON.parse(s) as WsServerMessage),
    on: (ev: string, fn: (arg?: unknown) => void) => {
      handlers[ev] = fn;
    },
  };
  const client = built.ctx.hub.attach(socket as unknown as WebSocket);
  return {
    client,
    sent,
    async msg(m: WsClientMessage) {
      handlers.message(Buffer.from(JSON.stringify(m)));
      await new Promise((r) => setTimeout(r, 0));
    },
    data(type: string, ch?: string) {
      return sent.filter((m): m is Extract<WsServerMessage, { op: 'data' }> => m.op === 'data' && m.type === type && (!ch || m.ch === ch));
    },
  };
}

describe('realtime channels', () => {
  it('feed: snapshot on subscribe, then ~500ms batches newest first; nothing while warming', async () => {
    const s = mkWallet();
    s.tags.add('smart');
    const t = mkToken();
    buy(s, t, 0.2);
    const c = fakeClient();
    await c.msg({ op: 'sub', ch: 'feed:sol:smart' });
    expect(c.sent.some((m) => m.op === 'ack' && m.ch === 'feed:sol:smart')).toBe(true);
    const snap = c.data('feed');
    expect(snap).toHaveLength(1);
    expect((snap[0].data as FeedItem[]).length).toBe(1);

    const x = buy(s, t, 0.2);
    const y = sellFrac(s, t);
    buy(mkWallet(), t, 0.1); // untagged: not in the smart feed
    wa.flushRealtime();
    const batches = c.data('feed');
    expect(batches).toHaveLength(2);
    expect((batches[1].data as FeedItem[]).map((i) => i.trade.id)).toEqual([y.id, x.id]);
    wa.flushRealtime();
    expect(c.data('feed')).toHaveLength(2); // nothing pending

    built.ctx.engine.warming = true;
    buy(s, t, 0.2);
    built.ctx.engine.warming = false;
    wa.flushRealtime();
    expect(c.data('feed')).toHaveLength(2);

    await c.msg({ op: 'sub', ch: 'feed:sol:nope' });
    expect(c.sent.some((m) => m.op === 'error' && m.ch === 'feed:sol:nope')).toBe(true);
    await c.msg({ op: 'sub', ch: 'feed:sol:follow' });
    expect(c.sent.some((m) => m.op === 'error' && m.ch === 'feed:sol:follow')).toBe(true); // auth required
  });

  it('follow feed filters per subscriber by followed wallets', async () => {
    const followed = mkWallet();
    const other = mkWallet();
    const t = mkToken();
    vi.spyOn(built.ctx.accounts, 'followedWallets').mockImplementation((accountId: string) =>
      accountId === 'acc_a' ? [{ chain: 'sol', address: followed.address, remark: '', group: '', createdAt: 0, notify: false }] : [],
    );
    const a = fakeClient();
    a.client.accountId = 'acc_a';
    const b = fakeClient();
    b.client.accountId = 'acc_b';
    await a.msg({ op: 'sub', ch: 'feed:sol:follow' });
    await b.msg({ op: 'sub', ch: 'feed:sol:follow' });
    const mine = buy(followed, t, 0.2);
    buy(other, t, 0.2);
    wa.flushRealtime();
    const batchesA = a.data('feed');
    expect((batchesA[batchesA.length - 1].data as FeedItem[]).map((i) => i.trade.id)).toEqual([mine.id]);
    expect(b.data('feed')).toHaveLength(1); // only the (empty) snapshot
  });

  it('wallet channel batches that wallet’s trades oldest first; signals push on trigger', async () => {
    const w = mkWallet();
    const t = mkToken();
    const c = fakeClient();
    await c.msg({ op: 'sub', ch: `wallet:sol:${w.address}` });
    expect(c.data('trades')).toHaveLength(1); // snapshot (empty)
    const a = buy(w, t, 0.1);
    const b = buy(w, t, 0.1);
    buy(mkWallet(), t, 0.1);
    wa.flushRealtime();
    const batches = c.data('trades');
    expect(batches).toHaveLength(2);
    expect((batches[1].data as Trade[]).map((x) => x.id)).toEqual([a.id, b.id]);
    await c.msg({ op: 'sub', ch: 'wallet:bsc:nobody' });
    expect(c.sent.some((m) => m.op === 'error' && m.ch === 'wallet:bsc:nobody')).toBe(true);

    await c.msg({ op: 'sub', ch: 'signals:sol' });
    expect(c.data('signals', 'signals:sol')).toHaveLength(1);
    world.migrate(t);
    const pushed = c.data('signals', 'signals:sol');
    expect(pushed).toHaveLength(2);
    expect((pushed[1].data as Signal[])[0].kind).toBe('migration');
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('persistence', () => {
  it('round-trips through a v8 snapshot', () => {
    const w = mkWallet();
    w.tags.add('smart');
    trade(w, 3, 2);
    const t = mkToken();
    world.migrate(t);
    const before = wa.profile(w, { accountId: null });
    const data = deserialize(serialize(wa.serialize()));
    const copy = new WalletAnalytics(built.ctx);
    copy.restore(data);
    const after = copy.profile(w, { accountId: null });
    expect(after.stats).toEqual(before.stats);
    expect(copy.activity(w, {}, { accountId: null }).map((i) => i.trade.id)).toEqual(wa.activity(w, {}, { accountId: null }).map((i) => i.trade.id));
    expect(copy.signals('sol', { kind: 'migration' }).map((s) => s.id)).toEqual(wa.signals('sol', { kind: 'migration' }).map((s) => s.id));
    expect(copy.feed('sol', 'smart', 50, { accountId: null }).length).toBe(wa.feed('sol', 'smart', 50, { accountId: null }).length);
  });
});

// ---------------------------------------------------------------------------
// Evaluation against the simulator (skipped while the market is a stub).
// Hidden archetypes are read here ONLY to score the observable-data classifiers.
// ---------------------------------------------------------------------------

describe('evaluation (simulated market)', () => {
  it('tag precision / recall vs hidden archetypes and read-path performance after a long warmup', async (tctx) => {
    // Own app: the shared fixture moves the clock, which would desync the simulator's schedule.
    const ev = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
    try {
      const ew = ev.ctx.world;
      const ewa = (ev.ctx.analytics as Analytics).wallets;
      if (ew.wallets.size < 100) tctx.skip(); // market simulator not implemented yet
      const minutes = Number(process.env.EVAL_WARMUP_MINUTES ?? 90);
      ewa.perf.profiling = true;
      const t0 = performance.now();
      ev.ctx.engine.warmup(minutes * 60_000, 1000, ew.now);
      const warmMs = performance.now() - t0;
      ewa.perf.profiling = false;
      const classifyTickAvg = ewa.perf.classifyMs / Math.max(1, ewa.perf.classifyRuns);
      let t1 = performance.now();
      ewa.classifyAll();
      const fullClassifyMs = performance.now() - t1;

      // Precision / recall per computed tag (archetype = ground truth for the behaviour).
      const truth: Record<string, string> = { smart: 'smart', sniper: 'sniper', bot: 'bot', sandwich: 'sandwich', whale: 'whale' };
      const pr: Record<string, Record<string, { tp: number; fp: number; fn: number }>> = {};
      const byArch: Record<string, Record<string, number>> = {};
      for (const w of ew.wallets.values()) {
        if (w.positions.size === 0) continue;
        const a = w.archetype;
        const row = (byArch[`${w.chain}:${a}`] ??= { n: 0 });
        row.n++;
        for (const tag of w.tags) row[tag] = (row[tag] ?? 0) + 1;
        for (const [tag, arch] of Object.entries(truth)) {
          const c = ((pr[tag] ??= {})[w.chain] ??= { tp: 0, fp: 0, fn: 0 });
          const has = w.tags.has(tag as never);
          if (has && a === arch) c.tp++;
          else if (has) c.fp++;
          else if (a === arch) c.fn++;
        }
      }
      const score = (c: { tp: number; fp: number; fn: number }) => ({
        precision: +(c.tp / Math.max(1, c.tp + c.fp)).toFixed(3),
        recall: +(c.tp / Math.max(1, c.tp + c.fn)).toFixed(3),
        tp: c.tp,
        fp: c.fp,
        fn: c.fn,
      });
      const tagScores = Object.fromEntries(Object.entries(pr).map(([tag, chains]) => [tag, Object.fromEntries(Object.entries(chains).map(([c, v]) => [c, score(v)]))]));
      let retailN = 0;
      let retailSmart = 0;
      for (const [k, v] of Object.entries(byArch))
        if (k.endsWith(':retail')) {
          retailN += v.n;
          retailSmart += v.smart ?? 0;
        }

      // Read paths on the warmed world.
      const sol = [...ew.wallets.values()].filter((w) => w.chain === 'sol' && w.positions.size > 0);
      const busiest = sol.reduce((a, b) => (b.positions.size > a.positions.size ? b : a));
      const anon = { accountId: null };
      const time = (n: number, fn: (i: number) => unknown) => {
        const s0 = performance.now();
        for (let i = 0; i < n; i++) fn(i);
        return +((performance.now() - s0) / n).toFixed(3);
      };
      const profileColdMs = time(Math.min(300, sol.length), (i) => ewa.profile(sol[i], anon));
      const profileWarmMs = time(Math.min(300, sol.length), (i) => ewa.profile(sol[i], anon));
      t1 = performance.now();
      ewa.refreshLeaderboards();
      const lbRefreshMs = +(performance.now() - t1).toFixed(1);

      // Live phase: 2 minutes of 250ms engine ticks (production cadence) with per-ticker timing.
      const tickers = (ev.ctx.engine as unknown as { tickers: { name: string; fn: (dt: number) => void }[] }).tickers;
      const tick: Record<string, { n: number; total: number; max: number }> = {};
      for (const tk of tickers) {
        const fn = tk.fn;
        tk.fn = (dt) => {
          const a = performance.now();
          fn(dt);
          const ms = performance.now() - a;
          const r = (tick[tk.name] ??= { n: 0, total: 0, max: 0 });
          r.n++;
          r.total += ms;
          if (ms > r.max) r.max = ms;
        };
      }
      const liveTrades0 = ew.tradeTotal;
      for (let i = 0; i < 480; i++) ev.ctx.engine.step(250);
      const live = {
        tradesPerSec: +((ew.tradeTotal - liveTrades0) / 120).toFixed(1),
        walletTickers: Object.fromEntries(
          Object.entries(tick)
            .filter(([k]) => k.startsWith('wallets-'))
            .map(([k, v]) => [k, { runs: v.n, avgMs: +(v.total / Math.max(1, v.n)).toFixed(2), maxMs: +v.max.toFixed(2) }]),
        ),
        allTickersAvgMsPerStep: +(Object.values(tick).reduce((a, v) => a + v.total, 0) / 480).toFixed(2),
      };
      const report = {
        warmupMinutes: minutes,
        warmupWallMs: Math.round(warmMs),
        worldTrades: ew.tradeTotal,
        wallets: ew.wallets.size,
        tokens: ew.tokens.size,
        listenerUsPerTrade: +((ewa.perf.tradeMs / Math.max(1, ewa.perf.trades)) * 1000).toFixed(2),
        classifyTickAvgMs: +classifyTickAvg.toFixed(2),
        fullClassifyMs: +fullClassifyMs.toFixed(1),
        botRate: ewa.botRate,
        profileColdMs,
        profileWarmMs,
        busiestWalletPositions: busiest.positions.size,
        holdingsBusiestMs: time(10, () => ewa.holdings(busiest, { includeClosed: true, sort: 'recent' }, anon)),
        activityMs: time(50, () => ewa.activity(busiest, { limit: 100 }, anon)),
        lbRefreshAllChainsSyncMs: lbRefreshMs,
        live,
        lbRequestMs: time(20, () => ewa.leaderboard('sol', { tag: 'all', sort: 'pnl', period: '7d' }, anon)),
        feedMs: time(20, () => ewa.feed('sol', 'all', 100, anon)),
        signalsMs: time(20, () => ewa.signals('sol', { limit: 100 })),
        retailSmartRate: +(retailSmart / Math.max(1, retailN)).toFixed(4),
        tagScores,
        tagsByChainArchetype: byArch,
        signalsByKind: Object.fromEntries(
          (['sol', 'bsc', 'base', 'eth'] as const).map((c) => {
            const counts: Record<string, number> = {};
            for (const sg of ewa.signals(c, { limit: 500 })) counts[sg.kind] = (counts[sg.kind] ?? 0) + 1;
            return [c, counts];
          }),
        ),
      };
      console.log(`[wallet-analytics eval] ${JSON.stringify(report, null, 2)}`);

      expect(ewa.perf.trades).toBeGreaterThan(0);
      // Asserted on sol (largest population); other chains are reported (eth smart wallets make ~1-2 entries per 90m).
      expect(tagScores.smart.sol.precision).toBeGreaterThanOrEqual(0.6);
      expect(tagScores.smart.sol.recall).toBeGreaterThanOrEqual(0.5);
      expect(report.retailSmartRate).toBeLessThan(0.04);
      expect(tagScores.bot.sol.precision).toBeGreaterThanOrEqual(0.8);
      expect(tagScores.sandwich.sol.precision).toBeGreaterThanOrEqual(0.8);
      expect(tagScores.sniper.sol.precision).toBeGreaterThanOrEqual(0.8);
      // Realtime budget: no wallet-analytics ticker blocks the loop for long.
      expect(live.walletTickers['wallets-leaderboard'].maxMs).toBeLessThan(40);
      expect(live.walletTickers['wallets-realtime'].maxMs).toBeLessThan(40);
    } finally {
      await ev.close();
    }
  }, 600_000);
});
