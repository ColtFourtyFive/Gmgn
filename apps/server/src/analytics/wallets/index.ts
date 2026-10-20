// Wallet-side analytics: classification tags (smart / sniper / whale / fresh /
// bot / sandwich), wallet profiles with period stats + style, holdings,
// activity, leaderboards, Monitor feeds and token signals, plus the 'feed',
// 'signals' and 'wallet' realtime channels.
//
// Everything here is derived from observable data only (trades, balances,
// funding links, timestamps, blocks, labels/tags and token cohorts). Hidden
// simulation state (archetype, fate, hype, skill, memory) is never read for
// outputs.

import {
  CHAIN_IDS,
  WALLET_PERIODS,
  isChainId,
  type CalloutFilter,
  type ChainId,
  type FeedItem,
  type LeaderboardRow,
  type Signal,
  type SignalKind,
  type TokenPositionRow,
  type TokenRef,
  type Trade,
  type WalletCalls,
  type WalletPeriod,
  type WalletPeriodStats,
  type WalletProfile,
  type WalletStyle,
  type WalletTag,
} from '@trenchscope/shared';
import type { AppContext, Viewer } from '../../context';
import type { PositionState, TokenState, WalletState } from '../../sim/world';
import { viewerLabel, viewerTags } from '../viewer';
import { EntryWatch, type PendingEntry } from './entries';
import { DAY_MS, HOUR_MS, median } from './metrics';
import { Ring } from './ring';
import {
  CALL_HIT_MULTIPLE,
  CALL_RING,
  CALL_STATS_MS,
  SIGNAL_KINDS,
  SignalEngine,
  maxMultipleOf,
  type SignalEngineData,
  type StoredSignal,
} from './signals';
import {
  WalletTrack,
  addToDistribution,
  computeStyle,
  dailySeries,
  dayStart,
  hourStart,
  isSelectionEntry,
  perDayRate,
  periodStart,
  periodStats,
  positionEventOf,
  type ActEntry,
  type PeriodCalc,
  type WalletTrackData,
} from './tracker';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Tags this module computes; every other tag on wallet.tags (e.g. 'kol') is identity and preserved. */
export const COMPUTED_TAGS: WalletTag[] = ['smart', 'sniper', 'whale', 'fresh', 'bot', 'sandwich'];
/** Display order of platform tags. */
const TAG_ORDER: WalletTag[] = ['kol', 'smart', 'whale', 'sniper', 'bot', 'sandwich', 'fresh'];
/** Tags whose trades enter the Monitor feed rings ('all' = any of these). */
const FEED_TAGS: WalletTag[] = ['smart', 'kol', 'whale', 'sniper'];

/**
 * Smart money (rolling 7d, observable data only). Selection skill is measured
 * as the share of a wallet's entries (first buys; launch-team entries excluded,
 * see isSelectionEntry) that later ran >= 2x in market cap, tested against the
 * chain's base rate with a one-sided z-score so small lucky samples do not
 * qualify; the book must also be profitable (realized + unrealized above a
 * chain-scaled floor) with a winning majority of tokens, and bots, sandwich bots
 * and snipers never qualify. Hysteresis keeps the tag until the hit rate (< 50%),
 * win rate (< 50%) or PnL (< half the floor) deteriorate.
 *
 * Calibrated against the simulator with the real 30s ticker (hysteresis
 * included; hidden archetypes used only for scoring, see the evaluation test)
 * over 3 seeds x 90m plus a 180m run, on two simulator builds. Smart wallets
 * make only ~3-7 entries in 90 minutes, so the rule needs few entries but a high
 * hit rate. 90m sol: precision 0.90-0.93 / 0.80-0.96, recall 0.77-0.96 /
 * 0.58-0.79, retail tagged 6-11 / 4-23 of 1,500 (180m: 0.94-0.95 / 0.93-0.97);
 * bsc recall 0.05-0.81, base 0.45-0.70, eth 0-0.37 (eth smart wallets make 1-2
 * entries per 90m). The previous calibration (>= 6 entries, hit rate >= 40%,
 * z >= 2.33, PnL >= $500, keep while win >= 40% and PnL >= 0) scored 90m sol
 * precision 0.73-0.83 / 0.76-0.88, recall 0.57-0.88 / 0.59-0.72 with 19-26 /
 * 11-25 retail tagged on the same builds. PnL/win-rate-only rules
 * (e.g. realized >= $1.5k, win >= 55%, >= 8 tokens) peaked around P 0.66 /
 * R 0.38 on sol because lucky top-decile retail out-earns many smart wallets
 * over short windows, and they decayed further under hysteresis.
 */
export const SMART_RULE = {
  /** Entries (first buys) in the 7d window. */
  minEntries: { sol: 3, bsc: 3, base: 3, eth: 3 } as Record<ChainId, number>,
  /** Share of entries followed by a >= 2x run in market cap. */
  minHitRate: 0.6,
  /**
   * One-sided z-score of the wallet's hits against the chain's base hit rate
   * (median of active wallets): (hits - n p0) / sqrt(n p0 (1 - p0)). With 3
   * entries and p0 ~0.28 this needs 2 hits; with p0 ~0.33 all 3.
   */
  minHitZ: 1.5,
  /** Floor for realized + unrealized PnL over 7d (USD), scaled per chain. */
  minTotalPnl: { sol: 2000, bsc: 2000, base: 1200, eth: 2500 } as Record<ChainId, number>,
  minWinRate: 0.55,
  keepHitRate: 0.5,
  /** One-sided hit z-score an existing tag must keep (off by default). */
  keepHitZ: Number.NEGATIVE_INFINITY,
  keepWinRate: 0.5,
  /** Share of minTotalPnl an existing tag must keep. */
  keepPnlShare: 0.5,
};
export const SNIPER_MIN_SNIPES = 5;
/**
 * Share of bought tokens that were snipes. The research rule says 50%, but the
 * simulator's snipers also trade in normal flow (snipes are 15-31% of their
 * tokens) while every other archetype has ~0 snipes, so 10% keeps precision
 * and restores recall.
 */
export const SNIPER_MIN_SHARE = 0.1;
export const WHALE_MIN_BALANCE_USD = 100_000;
export const WHALE_MIN_AVG_BUY_USD = 10_000;
export const FRESH_MAX_AGE_MS = DAY_MS;
export const FRESH_MAX_TOKENS = 15;
/** Floor of the bot trade rate (trades/day equivalent). */
export const BOT_MIN_TRADES_PER_DAY = 200;
/**
 * The bot rate threshold adapts to the market: max(200/day, 5x the median rate
 * of the chain's active traders). In the simulator retail wallets trade
 * ~700/day-equivalent with ~40s median holds (bots ~4,900/day), so the static
 * 200/day floor alone would tag most retail. Needs >= 50 active traders.
 */
export const BOT_RATE_MULT = 5;
const BOT_RATE_MIN_POP = 50;
/** Wallets with at least this many trades in 24h count as active traders for the median. */
const BOT_RATE_MIN_TRADES = 10;
export const BOT_MAX_MEDIAN_HOLD_MS = 120_000;
/** A young wallet's trade count is scaled to a daily rate over at least this span. */
export const BOT_MIN_SPAN_MS = 3 * HOUR_MS;
export const SANDWICH_MIN = 5;
/** Base 2x hit rate assumed until a chain has enough active wallets to measure it. */
const HIT_BASE_DEFAULT = 0.3;
/** Sandwich round trips must also be a real share of the wallet's sells (filters coincidences). */
export const SANDWICH_MIN_SHARE = 0.25;

const CLASSIFY_EVERY_MS = 30_000;
/** Every Nth classification run is a full sweep over all wallets (time-based drift: fresh expiry, balances, unrealized). */
const FULL_SWEEP_EVERY = 10;
const PROFILE_TTL_MS = 10_000;
/** Each chain's leaderboard snapshot is rebuilt about this often (time-sliced, live only). */
const LEADERBOARD_EVERY_MS = 30_000;
/** Requests rebuild synchronously only when the snapshot is missing or this old (ticker not running). */
const LEADERBOARD_STALE_MS = 120_000;
/** Event-loop budget per leaderboard ticker run (ms). */
const LEADERBOARD_SLICE_MS = 10;
const LEADERBOARD_ACTIVE = 500;
const ACT_RING_SIM = 100;
const ACT_RING_USER = 1000;
const FEED_RING = { smart: 500, kol: 500, all: 1000 } as const;
const PENDING_CAP = 2000;
const REALTIME_EVERY_MS = 500;

export type FeedKind = 'smart' | 'kol' | 'follow' | 'all';
export const FEED_KINDS: FeedKind[] = ['smart', 'kol', 'follow', 'all'];
export type LeaderboardTag = 'smart' | 'kol' | 'sniper' | 'whale' | 'all';
export type LeaderboardSort = 'pnl' | 'winRate' | 'volume' | 'tokens' | 'pnlRate';

interface ProfileBase {
  stats: Record<WalletPeriod, WalletPeriodStats>;
  style: WalletStyle;
}

interface CachedBase {
  key: number;
  at: number;
  base: ProfileBase;
}

interface LeaderboardCache {
  at: number;
  entries: { address: string; base: ProfileBase }[];
}

type FeedRings = { smart: Ring<ActEntry>; kol: Ring<ActEntry>; all: Ring<ActEntry> };

interface Persisted {
  v: 1;
  seq: number;
  entries?: ReturnType<EntryWatch['dump']>;
  classifyRuns: number;
  tracks: WalletTrackData[];
  feeds: Record<string, { smart: ActEntry[]; kol: ActEntry[]; all: ActEntry[] }>;
  signals: SignalEngineData;
}

const ANON: Viewer = { accountId: null };

function hasFeedTag(tags: readonly WalletTag[]): boolean {
  for (const t of tags) if (FEED_TAGS.includes(t)) return true;
  return false;
}

/** Wallet-side analytics: classification tags, profiles & stats, holdings, activity, leaderboards, feeds, signals. */
export class WalletAnalytics {
  private tracks = new Map<string, WalletTrack>();
  private dirty = new Set<string>();
  private baseCache = new Map<string, CachedBase>();
  private lb = new Map<ChainId, LeaderboardCache>();
  private feeds = {} as Record<ChainId, FeedRings>;
  private pending = {} as Record<ChainId, ActEntry[]>;
  private seq = 0;
  private classifyRuns = 0;
  private entries = new EntryWatch();
  /** Current bot trade-rate threshold per chain (trades/day equivalent). */
  readonly botRate: Record<ChainId, number> = { sol: BOT_MIN_TRADES_PER_DAY, bsc: BOT_MIN_TRADES_PER_DAY, base: BOT_MIN_TRADES_PER_DAY, eth: BOT_MIN_TRADES_PER_DAY };
  /** Chain base rate of entries that run 2x (median over active wallets, 7d). */
  readonly hitBase: Record<ChainId, number> = { sol: HIT_BASE_DEFAULT, bsc: HIT_BASE_DEFAULT, base: HIT_BASE_DEFAULT, eth: HIT_BASE_DEFAULT };
  readonly signalEngine: SignalEngine;
  /** Diagnostics (cheap counters; timings only when `profiling` is on). */
  readonly perf = { trades: 0, tradeMs: 0, classifyRuns: 0, classifyMs: 0, lastClassifyMs: 0, leaderboardMs: 0, profiling: false };

  constructor(protected ctx: AppContext) {
    for (const c of CHAIN_IDS) {
      this.feeds[c] = { smart: new Ring(FEED_RING.smart), kol: new Ring(FEED_RING.kol), all: new Ring(FEED_RING.all) };
      this.pending[c] = [];
    }
    this.signalEngine = new SignalEngine(ctx, (s) => this.signalDto(s));
  }

  install(): void {
    const { world, engine, hub } = this.ctx;
    world.on('trade', (trade, t, w) => this.onTrade(trade, t, w));
    world.on('walletCreated', (w) => this.dirty.add(w.address));
    // Simulator pruning (e.g. single-use crew wallets): drop their state now rather than at the next sweep.
    world.on('walletsRemoved', (addrs) => {
      for (const a of addrs) {
        this.tracks.delete(a);
        this.baseCache.delete(a);
        this.dirty.delete(a);
      }
    });
    world.on('positionPruned', (w, pos) => this.onPositionPruned(w, pos));
    world.on('tokenMigrated', (t) => this.signalEngine.onMigrated(t));
    world.on('tokenFlag', (t, flag) => this.signalEngine.onFlag(t, flag));
    world.on('kolCall', (t, w) => this.signalEngine.onKolCall(t, w));

    engine.addTicker('wallets-classify', () => this.classifyTick(), { everyMs: CLASSIFY_EVERY_MS, duringWarmup: true });
    engine.addTicker('wallets-signals', () => this.signalEngine.checkSpikes(), { everyMs: 5_000, duringWarmup: true });
    engine.addTicker('wallets-leaderboard', () => this.leaderboardTick(), { everyMs: 1_000, duringWarmup: false });
    engine.addTicker('wallets-realtime', () => this.flushRealtime(), { everyMs: REALTIME_EVERY_MS, duringWarmup: false });

    hub.register('feed', {
      onSubscribe: (sub) => {
        const parts = sub.ch.split(':');
        const [, chain, kind] = parts;
        if (parts.length !== 3 || !isChainId(chain) || !FEED_KINDS.includes(kind as FeedKind)) throw new Error('invalid feed channel (feed:<chain>:<smart|kol|follow|all>)');
        if (kind === 'follow' && !sub.client.accountId) throw new Error('auth required');
        // Deliver pending batches to existing subscribers first so the snapshot and the
        // next batch never overlap (the new subscription is registered after this returns).
        this.flushRealtime();
        // Broadcast kinds carry no viewer-relative tags or remarks, in the snapshot as in the
        // batches (clients add them locally); only the per-viewer follow feed is decorated.
        hub.send(sub, 'feed', this.feed(chain, kind as FeedKind, 50, kind === 'follow' ? { accountId: sub.client.accountId } : ANON));
      },
    });
    hub.register('signals', {
      onSubscribe: (sub) => {
        const parts = sub.ch.split(':');
        const chain = parts[1];
        if (parts.length !== 2 || !isChainId(chain)) throw new Error('invalid signals channel (signals:<chain>)');
        hub.send(sub, 'signals', this.signals(chain, { limit: 50 }));
      },
    });
    hub.register('wallet', {
      onSubscribe: (sub) => {
        const parts = sub.ch.split(':');
        const chain = parts[1];
        const address = parts.slice(2).join(':');
        const w = isChainId(chain) ? world.getWallet(address) : undefined;
        if (!w || w.chain !== chain) throw new Error('unknown wallet');
        this.flushRealtime();
        const tr = this.tracks.get(address);
        const recent: Trade[] = [];
        if (tr) for (let i = Math.min(tr.act.size, 50) - 1; i >= 0; i--) recent.push(tr.act.at(i)!.trade);
        hub.send(sub, 'trades', recent);
      },
    });
  }

  // -------------------------------------------------------------------------
  // Trade listener (O(1)-ish)
  // -------------------------------------------------------------------------

  private onTrade(trade: Trade, t: TokenState, w: WalletState): void {
    const t0 = this.perf.profiling ? performance.now() : 0;
    const pos = w.positions.get(t.address);
    if (!pos) return;
    let tr = this.tracks.get(w.address);
    if (!tr) {
      tr = new WalletTrack(w.chain, w.address, this.actCap(w));
      this.tracks.set(w.address, tr);
    }
    const entry = tr.record(this.ctx.world, trade, t, w, pos, ++this.seq);
    this.dirty.add(w.address);
    // Entry quality: resolve pending entries this print reached, then register this wallet's first buy.
    this.entries.onPrice(t.address, trade.marketCapUsd, this.creditHit);
    if (trade.side === 'buy' && pos.buys === 1 && isSelectionEntry(t, w)) this.entries.add(t.address, w.address, trade.timestamp, trade.priceUsd * t.totalSupply);

    const tags = trade.walletTags;
    if (hasFeedTag(tags)) {
      const rings = this.feeds[t.chain];
      rings.all.push(entry);
      if (tags.includes('smart')) rings.smart.push(entry);
      if (tags.includes('kol')) rings.kol.push(entry);
    }

    this.signalEngine.onTrade(trade, t, w, pos);

    if (!this.ctx.engine.warming) {
      const p = this.pending[t.chain];
      p.push(entry);
      if (p.length > PENDING_CAP) p.splice(0, p.length - PENDING_CAP);
    }
    this.perf.trades++;
    if (this.perf.profiling) this.perf.tradeMs += performance.now() - t0;
  }

  /**
   * A simulated position dropped with its pruned token (its totals are already in w.pruned): keep its
   * PnL bucket for the all-time distribution, and its lifetime cost as the ratio base of a period in
   * which the token was only sold.
   */
  private onPositionPruned(w: WalletState, pos: PositionState): void {
    if (w.pruned) w.pruned.distribution = addToDistribution(w.pruned.distribution, pos);
    const rec = this.tracks.get(w.address)?.tokens.get(pos.token);
    if (rec) rec.bu = pos.boughtUsd;
  }

  private creditHit = (e: PendingEntry): void => {
    this.tracks.get(e.wallet)?.creditHit(e.at);
  };

  /** Paper-trading account wallets (observable via accountId) keep a longer activity history. */
  private actCap(w: WalletState): number {
    return w.accountId !== null ? ACT_RING_USER : ACT_RING_SIM;
  }

  // -------------------------------------------------------------------------
  // Classification
  // -------------------------------------------------------------------------

  /** Platform tags of a wallet in display order. */
  tags(w: WalletState): WalletTag[] {
    const out: WalletTag[] = [];
    for (const t of TAG_ORDER) if (w.tags.has(t)) out.push(t);
    if (out.length !== w.tags.size) for (const t of w.tags) if (!out.includes(t)) out.push(t);
    return out;
  }

  /** Ticker body: dirty wallets every run, a full sweep every FULL_SWEEP_EVERY runs. */
  classifyTick(): void {
    const t0 = performance.now();
    this.classifyRuns++;
    const world = this.ctx.world;
    this.refreshBotRates();
    if (this.classifyRuns % FULL_SWEEP_EVERY === 1) {
      for (const w of world.wallets.values()) this.classify(w);
      this.sweep();
    } else {
      for (const a of this.dirty) {
        const w = world.wallets.get(a);
        if (w) this.classify(w);
      }
    }
    this.dirty.clear();
    const ms = performance.now() - t0;
    this.perf.classifyRuns++;
    this.perf.classifyMs += ms;
    this.perf.lastClassifyMs = ms;
  }

  /** Reclassify every wallet now (tests / tools). */
  classifyAll(): void {
    this.refreshBotRates();
    for (const w of this.ctx.world.wallets.values()) this.classify(w);
    this.dirty.clear();
  }

  /** Recompute the adaptive per-chain baselines (bot trade rate, 2x hit rate); O(tracked wallets). */
  refreshBotRates(): void {
    const now = this.ctx.world.now;
    const from = hourStart(now) - 23 * HOUR_MS;
    const rates: Record<ChainId, number[]> = { sol: [], bsc: [], base: [], eth: [] };
    const hits: Record<ChainId, number[]> = { sol: [], bsc: [], base: [], eth: [] };
    for (const tr of this.tracks.values()) {
      const n = tr.tradesSinceHours(from);
      if (n >= BOT_RATE_MIN_TRADES) rates[tr.chain].push(perDayRate(n, tr, now, DAY_MS, BOT_MIN_SPAN_MS));
      const e = tr.entryStats('7d', now);
      if (e.entries >= 5) hits[tr.chain].push(e.hits / e.entries);
    }
    for (const c of CHAIN_IDS) {
      const r = rates[c];
      this.botRate[c] = r.length >= BOT_RATE_MIN_POP ? Math.max(BOT_MIN_TRADES_PER_DAY, BOT_RATE_MULT * median(r)) : BOT_MIN_TRADES_PER_DAY;
      this.hitBase[c] = hits[c].length >= BOT_RATE_MIN_POP ? Math.min(0.9, Math.max(0.05, median(hits[c]))) : HIT_BASE_DEFAULT;
    }
  }

  /** Compute the platform tags for one wallet and write them to wallet.tags (identity tags are kept). */
  classify(w: WalletState): void {
    const next = this.computeTags(w);
    for (const tag of COMPUTED_TAGS) {
      if (next.has(tag)) w.tags.add(tag);
      else w.tags.delete(tag);
    }
  }

  /** Rule evaluation (observable data only). */
  computeTags(w: WalletState): Set<WalletTag> {
    const world = this.ctx.world;
    const now = world.now;
    const tr = this.tracks.get(w.address);
    const out = new Set<WalletTag>();
    const pruned = w.pruned?.tokens ?? 0;
    const traded = w.positions.size + pruned > 0;

    if (tr && tr.sandwiches >= SANDWICH_MIN && tr.sandwiches >= SANDWICH_MIN_SHARE * tr.sellsAll) out.add('sandwich');

    if (tr) {
      const trades24 = tr.tradesSinceHours(hourStart(now) - 23 * HOUR_MS);
      if (perDayRate(trades24, tr, now, DAY_MS, BOT_MIN_SPAN_MS) > this.botRate[w.chain]) {
        const cws = tr.recentCopyWindows(30);
        if (cws.length >= 5 && median(cws) < BOT_MAX_MEDIAN_HOLD_MS) out.add('bot');
      }
      if (tr.snipes >= SNIPER_MIN_SNIPES && tr.snipes / Math.max(1, tr.boughtTokens) >= SNIPER_MIN_SHARE) out.add('sniper');
    }

    if (traded) {
      const balUsd = w.native * world.nativeUsd(w.chain);
      const avgBuy = tr && tr.buysAll > 0 ? tr.buyUsdAll / tr.buysAll : 0;
      if (balUsd >= WHALE_MIN_BALANCE_USD || avgBuy >= WHALE_MIN_AVG_BUY_USD) out.add('whale');
    }

    if (now - w.createdAt < FRESH_MAX_AGE_MS && w.positions.size + pruned < FRESH_MAX_TOKENS) out.add('fresh');

    // Smart money excludes bots, sandwichers and snipers (sniping profits come from speed, not selection).
    if (tr && !out.has('bot') && !out.has('sandwich') && !out.has('sniper')) {
      // Cheap O(7) entry-quality gate first; period stats only for wallets that pass it.
      const e = tr.entryStats('7d', now);
      if (e.entries > 0) {
        const R = SMART_RULE;
        const was = w.tags.has('smart');
        const hitRate = e.hits / e.entries;
        const p0 = this.hitBase[w.chain];
        const z = (e.hits - e.entries * p0) / Math.sqrt(e.entries * p0 * (1 - p0));
        const grantGate = e.entries >= R.minEntries[w.chain] && hitRate >= R.minHitRate && (R.minHitZ <= 0 || z >= R.minHitZ);
        const keepGate = was && hitRate >= R.keepHitRate && z >= R.keepHitZ;
        if (grantGate || keepGate) {
          const s = periodStats(world, w, tr, '7d', now).stats;
          const grant = grantGate && s.winRate >= R.minWinRate && s.totalPnlUsd >= R.minTotalPnl[w.chain];
          // Hysteresis: an existing tag survives on the looser keep test.
          const keep = keepGate && s.winRate >= R.keepWinRate && s.totalPnlUsd >= R.keepPnlShare * R.minTotalPnl[w.chain];
          if (grant || keep) out.add('smart');
        }
      }
    }
    return out;
  }

  /** Periodic maintenance: drop stale caches and records of deleted tokens / wallets. */
  private sweep(): void {
    const world = this.ctx.world;
    const now = world.now;
    for (const [a, c] of this.baseCache) if (now - c.at > 6 * PROFILE_TTL_MS || now < c.at) this.baseCache.delete(a);
    for (const [a, tr] of this.tracks) {
      // Gone wallets, and wallets idle beyond every rolling window ('all' stats come from positions).
      if (!world.wallets.has(a) || (tr.lastTradeAt > 0 && tr.lastTradeAt < now - 31 * DAY_MS)) {
        this.tracks.delete(a);
        continue;
      }
      // A deleted token's record stays while a bucket still counts the token: its lifetime cost (rec.bu)
      // is the ratio base of a period in which it was only sold (the position itself is gone).
      let counted: Set<string> | null = null;
      for (const tok of tr.tokens.keys()) {
        if (world.tokens.has(tok)) continue;
        counted ??= tr.bucketTokens();
        if (!counted.has(tok)) tr.tokens.delete(tok);
      }
    }
    this.entries.prune(now - 8 * DAY_MS, (tok) => world.tokens.has(tok));
    this.signalEngine.prune();
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  private base(w: WalletState): ProfileBase {
    const now = this.ctx.world.now;
    const c = this.baseCache.get(w.address);
    if (c && c.key === w.lastActiveAt && now >= c.at && now - c.at < PROFILE_TTL_MS) return c.base;
    const tr = this.tracks.get(w.address);
    const world = this.ctx.world;
    const calc = {} as Record<WalletPeriod, PeriodCalc>;
    calc['1d'] = periodStats(world, w, tr, '1d', now);
    calc['7d'] = periodStats(world, w, tr, '7d', now);
    // No activity older than the 7d window: 30d equals 7d except for the longer daily series.
    calc['30d'] =
      tr && tr.days.length > 0 && tr.days[0].t >= periodStart('7d', now)
        ? { ...calc['7d'], stats: { ...calc['7d'].stats, dailyPnl: dailySeries(tr.days, periodStart('30d', now), dayStart(now)) } }
        : periodStats(world, w, tr, '30d', now);
    calc.all = periodStats(world, w, tr, 'all', now);
    const stats = {} as Record<WalletPeriod, WalletPeriodStats>;
    for (const p of WALLET_PERIODS) stats[p] = calc[p].stats;
    const base: ProfileBase = { stats, style: computeStyle(w, tr, calc['7d'], now, this.createdTokenCount(w)) };
    this.baseCache.set(w.address, { key: w.lastActiveAt, at: now, base });
    return base;
  }

  /** Tokens the wallet created that still exist (the rows of /created-tokens). */
  private createdTokenCount(w: WalletState): number {
    let n = 0;
    for (const a of w.createdTokens) if (this.ctx.world.tokens.has(a)) n++;
    return n;
  }

  private followerCount(w: WalletState): number {
    return this.ctx.accounts.followerCount(w.chain, w.address) + (w.followerCount || 0);
  }

  profile(w: WalletState, viewer: Viewer): WalletProfile {
    const { world, accounts } = this.ctx;
    const base = this.base(w);
    const acc = viewer.accountId;
    return {
      chain: w.chain,
      address: w.address,
      label: w.label,
      remark: acc ? accounts.remarkFor(acc, w.chain, w.address) : null,
      avatarSeed: w.address,
      tags: viewerTags(this.ctx, viewer, w.chain, w.address, this.tags(w)),
      nativeBalance: w.native,
      nativeBalanceUsd: w.native * world.nativeUsd(w.chain),
      createdAt: w.createdAt,
      fundedBy: w.fundedBy,
      fundAmountNative: w.fundAmount,
      xFollowers: w.xFollowers,
      followerCount: this.followerCount(w),
      isFollowed: acc ? accounts.isFollowing(acc, w.chain, w.address) : false,
      createdTokenCount: this.createdTokenCount(w),
      stats: base.stats,
      style: base.style,
      lastActiveAt: w.lastActiveAt,
    };
  }

  // -------------------------------------------------------------------------
  // Holdings & activity
  // -------------------------------------------------------------------------

  /** Token info for rows: the token-side TokenRef, with a local fallback if it is unavailable. */
  private ref(t: TokenState): TokenRef {
    try {
      return this.ctx.analytics.tokenRef(t);
    } catch {
      const world = this.ctx.world;
      return {
        chain: t.chain,
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logoSeed: t.logoSeed,
        logoGlyph: t.logoGlyph,
        priceUsd: world.priceUsd(t),
        marketCapUsd: world.marketCapUsd(t),
        liquidityUsd: world.liquidityUsd(t),
        status: t.status,
        launchpad: t.launchpad,
        createdAt: t.createdAt,
        priceChange24h: world.windowStats(t, '24h').priceChange,
      };
    }
  }

  private positionRow(w: WalletState, pos: PositionState, t: TokenState, viewer: Viewer): TokenPositionRow {
    const world = this.ctx.world;
    const now = world.now;
    const price = world.priceUsd(t);
    const value = pos.balance > 0 ? pos.balance * price : 0;
    const unrealized = pos.balance > 0 ? value - pos.costBasisUsd : 0;
    const total = pos.realizedPnlUsd + unrealized;
    return {
      chain: w.chain,
      token: t.address,
      wallet: w.address,
      addrType: 'wallet',
      walletTags: viewerTags(this.ctx, viewer, w.chain, w.address, world.tradeTags(t, w)),
      walletLabel: viewerLabel(this.ctx, viewer, w.chain, w.address, w.label),
      balance: pos.balance,
      holdRate: t.totalSupply > 0 ? pos.balance / t.totalSupply : 0,
      valueUsd: value,
      costBasisUsd: pos.costBasisUsd,
      avgBuyPriceUsd: pos.boughtTokens > 0 ? pos.boughtUsd / pos.boughtTokens : 0,
      avgSellPriceUsd: pos.soldTokens > 0 ? pos.soldUsd / pos.soldTokens : 0,
      boughtUsd: pos.boughtUsd,
      soldUsd: pos.soldUsd,
      boughtTokens: pos.boughtTokens,
      soldTokens: pos.soldTokens,
      realizedPnlUsd: pos.realizedPnlUsd,
      unrealizedPnlUsd: unrealized,
      totalPnlUsd: total,
      pnlRate: pos.boughtUsd > 0 ? total / pos.boughtUsd : 0,
      buys: pos.buys,
      sells: pos.sells,
      firstBuyAt: pos.firstBuyAt,
      lastActiveAt: pos.lastActiveAt,
      holdSeconds: pos.firstBuyAt !== null ? Math.max(0, ((pos.balance > 0 ? now : (pos.closedAt ?? now)) - pos.firstBuyAt) / 1000) : 0,
      nativeBalance: w.native,
      fundedBy: w.fundedBy,
      tokenInfo: this.ref(t),
    };
  }

  /**
   * Positions with token info. sort: value (default) | pnl | recent. Closed
   * positions only with includeClosed. Deleted tokens are skipped. Rows are
   * capped (default 200, max 1000) — cheap sort keys are ranked before rows are built.
   */
  holdings(w: WalletState, opts: { includeClosed?: boolean; sort?: string; limit?: number }, viewer: Viewer): TokenPositionRow[] {
    const world = this.ctx.world;
    const sort = opts.sort === 'pnl' || opts.sort === 'recent' ? opts.sort : 'value';
    const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 200)));
    const cand: { pos: PositionState; t: TokenState; key: number }[] = [];
    for (const pos of w.positions.values()) {
      if (!opts.includeClosed && pos.balance <= 0) continue;
      const t = world.tokens.get(pos.token);
      if (!t) continue;
      let key: number;
      if (sort === 'recent') key = pos.lastActiveAt;
      else {
        const value = pos.balance > 0 ? pos.balance * world.priceUsd(t) : 0;
        key = sort === 'value' ? value : pos.realizedPnlUsd + (pos.balance > 0 ? value - pos.costBasisUsd : 0);
      }
      cand.push({ pos, t, key });
    }
    cand.sort((a, b) => b.key - a.key || b.pos.lastActiveAt - a.pos.lastActiveAt);
    return cand.slice(0, limit).map((c) => this.positionRow(w, c.pos, c.t, viewer));
  }

  private viewTrade(trade: Trade, viewer: Viewer): Trade {
    if (!viewer.accountId) return trade;
    return {
      ...trade,
      walletTags: viewerTags(this.ctx, viewer, trade.chain, trade.wallet, trade.walletTags),
      walletLabel: viewerLabel(this.ctx, viewer, trade.chain, trade.wallet, trade.walletLabel),
    };
  }

  private feedItem(e: ActEntry, viewer: Viewer): FeedItem | null {
    const t = this.ctx.world.tokens.get(e.trade.token);
    if (!t) return null;
    return {
      trade: this.viewTrade(e.trade, viewer),
      token: this.ref(t),
      isFirstBuy: e.isFirstBuy,
      isClose: e.isClose,
      positionEvent: positionEventOf(e.trade, t.totalSupply),
    };
  }

  /**
   * Recent trades of the wallet, newest first (ring of 100; 1000 for user wallets). A `beforeId` cursor
   * (the last trade id seen) resumes right after that trade; without one (or once it has left the
   * ring) `before` pages by time alone.
   */
  activity(w: WalletState, opts: { limit?: number; before?: number; beforeId?: string; type?: string }, viewer: Viewer): FeedItem[] {
    const tr = this.tracks.get(w.address);
    if (!tr) return [];
    const limit = Math.max(1, Math.min(tr.act.cap, Math.floor(opts.limit ?? 50)));
    const type = opts.type === 'buy' || opts.type === 'sell' ? opts.type : 'all';
    let before = opts.before;
    let start = 0;
    if (opts.beforeId !== undefined) {
      let at = 0;
      while (at < tr.act.size && tr.act.at(at)!.trade.id !== opts.beforeId) at++;
      if (at < tr.act.size) {
        start = at + 1;
        before = undefined;
      } else if (before === undefined) return [];
    }
    const out: FeedItem[] = [];
    for (let i = start; i < tr.act.size && out.length < limit; i++) {
      const e = tr.act.at(i)!;
      if (before !== undefined && e.trade.timestamp >= before) continue;
      if (type !== 'all' && e.trade.side !== type) continue;
      const item = this.feedItem(e, viewer);
      if (item) out.push(item);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------

  /** Rebuild every chain's leaderboard snapshot synchronously (tests / tools). */
  refreshLeaderboards(): void {
    for (const c of CHAIN_IDS) this.refreshLeaderboard(c);
  }

  /** Candidates = wallets tagged smart/kol/sniper/whale + the 500 most active (7d trades), all with activity in 30d. */
  private leaderboardCandidates(chain: ChainId): string[] {
    const world = this.ctx.world;
    const now = world.now;
    const d30 = periodStart('30d', now);
    const d7 = periodStart('7d', now);
    const tagged: string[] = [];
    const active: { a: string; n: number }[] = [];
    for (const tr of this.tracks.values()) {
      if (tr.chain !== chain) continue;
      const w = world.wallets.get(tr.address);
      if (!w) continue;
      if (tr.tradesSinceDays(d30) === 0) continue;
      if (w.tags.has('smart') || w.tags.has('kol') || w.tags.has('sniper') || w.tags.has('whale')) tagged.push(tr.address);
      else active.push({ a: tr.address, n: tr.tradesSinceDays(d7) });
    }
    active.sort((x, y) => y.n - x.n || (x.a < y.a ? -1 : 1));
    return tagged.concat(active.slice(0, LEADERBOARD_ACTIVE).map((x) => x.a));
  }

  refreshLeaderboard(chain: ChainId): void {
    const t0 = performance.now();
    const world = this.ctx.world;
    const entries: LeaderboardCache['entries'] = [];
    for (const a of this.leaderboardCandidates(chain)) {
      const w = world.wallets.get(a);
      if (w) entries.push({ address: a, base: this.base(w) });
    }
    this.lb.set(chain, { at: world.now, entries });
    this.perf.leaderboardMs = performance.now() - t0;
  }

  private lbJob: { chain: ChainId; addrs: string[]; i: number; entries: LeaderboardCache['entries']; ms: number } | null = null;

  /**
   * Ticker (every 1s, live only): advances a time-sliced rebuild of the stalest
   * chain's leaderboard snapshot (a missing one first) within LEADERBOARD_SLICE_MS,
   * so a refresh never blocks the event loop for long; each chain refreshes about
   * every 30s. The server builds every chain before it starts listening (app.ts).
   */
  leaderboardTick(): void {
    const world = this.ctx.world;
    const now = world.now;
    if (!this.lbJob) {
      let pick: ChainId | null = null;
      let oldest = Infinity;
      for (const c of CHAIN_IDS) {
        const at = this.lb.get(c)?.at ?? -Infinity;
        if ((now - at >= LEADERBOARD_EVERY_MS || now < at) && at < oldest) {
          oldest = at;
          pick = c;
        }
      }
      if (!pick) return;
      this.lbJob = { chain: pick, addrs: this.leaderboardCandidates(pick), i: 0, entries: [], ms: 0 };
    }
    const job = this.lbJob;
    const t0 = performance.now();
    while (job.i < job.addrs.length) {
      const w = world.wallets.get(job.addrs[job.i++]);
      if (w) job.entries.push({ address: w.address, base: this.base(w) });
      if (performance.now() - t0 >= LEADERBOARD_SLICE_MS) break;
    }
    job.ms += performance.now() - t0;
    if (job.i >= job.addrs.length) {
      this.lb.set(job.chain, { at: now, entries: job.entries });
      this.perf.leaderboardMs = job.ms;
      this.lbJob = null;
    }
  }

  leaderboard(
    chain: ChainId,
    opts: { tag?: string; period?: WalletPeriod; sort?: string; order?: 'asc' | 'desc'; limit?: number },
    viewer: Viewer,
  ): LeaderboardRow[] {
    const world = this.ctx.world;
    const now = world.now;
    let cache = this.lb.get(chain);
    if (!cache || now < cache.at || now - cache.at > LEADERBOARD_STALE_MS) {
      this.refreshLeaderboard(chain);
      cache = this.lb.get(chain)!;
    }
    const tag = (['smart', 'kol', 'sniper', 'whale', 'all'].includes(opts.tag ?? '') ? opts.tag : 'smart') as LeaderboardTag;
    const period: Exclude<WalletPeriod, 'all'> = opts.period === '1d' || opts.period === '30d' ? opts.period : '7d';
    const sort = (['pnl', 'winRate', 'volume', 'tokens', 'pnlRate'].includes(opts.sort ?? '') ? opts.sort : 'pnl') as LeaderboardSort;
    const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 100)));
    const key = (s: WalletPeriodStats): number => {
      switch (sort) {
        case 'winRate':
          return s.winRate;
        case 'volume':
          return s.buyVolumeUsd + s.sellVolumeUsd;
        case 'tokens':
          return s.tokensTraded;
        case 'pnlRate':
          return s.pnlRate;
        default:
          return s.realizedPnlUsd;
      }
    };
    // Ratio sorts rank wallets with a real sample (>= 3 tokens) first, in either order.
    const sampleGate = sort === 'winRate' || sort === 'pnlRate';
    const dir = opts.order === 'asc' ? -1 : 1;
    const rows: { w: WalletState; base: ProfileBase; s: WalletPeriodStats; k: number; g: number }[] = [];
    for (const e of cache.entries) {
      const w = world.wallets.get(e.address);
      if (!w) continue;
      if (tag !== 'all' && !w.tags.has(tag)) continue;
      const s = e.base.stats[period];
      if (s.buys + s.sells === 0) continue;
      rows.push({ w, base: e.base, s, k: key(s), g: sampleGate && s.tokensTraded < 3 ? 0 : 1 });
    }
    rows.sort((a, b) => b.g - a.g || dir * (b.k - a.k) || dir * (b.s.realizedPnlUsd - a.s.realizedPnlUsd) || (a.w.address < b.w.address ? -1 : 1));
    const acc = viewer.accountId;
    return rows.slice(0, limit).map(({ w, base, s }) => ({
      chain,
      address: w.address,
      label: viewerLabel(this.ctx, viewer, chain, w.address, w.label),
      avatarSeed: w.address,
      tags: viewerTags(this.ctx, viewer, chain, w.address, this.tags(w)),
      nativeBalance: w.native,
      stats: s,
      style: base.style,
      lastActiveAt: w.lastActiveAt,
      followerCount: this.followerCount(w),
      isFollowed: acc ? this.ctx.accounts.isFollowing(acc, chain, w.address) : false,
    }));
  }

  // -------------------------------------------------------------------------
  // Feed
  // -------------------------------------------------------------------------

  /**
   * Monitor feed, newest first. smart / kol: trades by wallets carrying that tag
   * at trade time; all: trades by any wallet tagged smart, kol, whale or sniper;
   * follow: trades of the viewer's followed wallets (empty for anonymous viewers).
   */
  feed(chain: ChainId, kind: FeedKind, limit: number, viewer: Viewer): FeedItem[] {
    const lim = Math.max(1, Math.min(200, Math.floor(limit || 50)));
    const out: FeedItem[] = [];
    if (kind === 'follow') {
      if (!viewer.accountId) return out;
      const merged: ActEntry[] = [];
      for (const f of this.ctx.accounts.followedWallets(viewer.accountId, chain)) {
        if (f.chain !== chain) continue;
        const tr = this.tracks.get(f.address);
        if (!tr) continue;
        for (let i = 0; i < tr.act.size && i < lim; i++) merged.push(tr.act.at(i)!);
      }
      merged.sort((a, b) => b.trade.timestamp - a.trade.timestamp || b.seq - a.seq);
      for (const e of merged) {
        if (out.length >= lim) break;
        const it = this.feedItem(e, viewer);
        if (it) out.push(it);
      }
      return out;
    }
    const ring = this.feeds[chain][kind === 'smart' || kind === 'kol' ? kind : 'all'];
    for (let i = 0; i < ring.size && out.length < lim; i++) {
      const it = this.feedItem(ring.at(i)!, viewer);
      if (it) out.push(it);
    }
    return out;
  }

  /** Realtime flush (every ~500ms): feed batches (newest first), per-subscriber follow batches, wallet trade batches (oldest first). */
  flushRealtime(): void {
    const { hub, accounts } = this.ctx;
    for (const chain of CHAIN_IDS) {
      const entries = this.pending[chain];
      if (entries.length === 0) continue;
      this.pending[chain] = [];

      for (const kind of ['smart', 'kol', 'all'] as const) {
        const ch = `feed:${chain}:${kind}`;
        if (!hub.hasSubscribers(ch)) continue;
        const items: FeedItem[] = [];
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i];
          const tags = e.trade.walletTags;
          if (kind === 'all' ? !hasFeedTag(tags) : !tags.includes(kind)) continue;
          const it = this.feedItem(e, ANON);
          if (it) items.push(it);
        }
        if (items.length) hub.publish(ch, 'feed', items);
      }

      const fch = `feed:${chain}:follow`;
      if (hub.hasSubscribers(fch)) {
        for (const g of hub.groups(fch)) {
          if (g.ch !== fch) continue;
          for (const client of g.clients) {
            if (!client.accountId) continue;
            const followed = new Set(accounts.followedWallets(client.accountId, chain).map((f) => f.address));
            if (followed.size === 0) continue;
            const viewer: Viewer = { accountId: client.accountId };
            const items: FeedItem[] = [];
            for (let i = entries.length - 1; i >= 0; i--) {
              if (!followed.has(entries[i].trade.wallet)) continue;
              const it = this.feedItem(entries[i], viewer);
              if (it) items.push(it);
            }
            if (items.length) hub.sendTo(client, { op: 'data', ch: fch, type: 'feed', data: items });
          }
        }
      }

      const prefix = `wallet:${chain}`;
      const wchs = hub.activeChannels(prefix);
      if (wchs.length) {
        const want = new Map<string, string>();
        for (const ch of wchs) want.set(ch.slice(prefix.length + 1), ch);
        const batches = new Map<string, Trade[]>();
        for (const e of entries) {
          const ch = want.get(e.trade.wallet);
          if (!ch) continue;
          const b = batches.get(ch);
          if (b) b.push(e.trade);
          else batches.set(ch, [e.trade]);
        }
        for (const [ch, trades] of batches) hub.publish(ch, 'trades', trades);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------

  private signalDto(s: StoredSignal): Signal | null {
    const t = this.ctx.world.tokens.get(s.token);
    if (!t) return null;
    return {
      id: s.id,
      chain: s.chain,
      kind: s.kind,
      token: this.ref(t),
      title: s.title,
      detail: s.detail,
      marketCapAtTrigger: s.marketCapAtTrigger,
      maxMultiple: maxMultipleOf(s),
      wallets: s.wallets,
      createdAt: s.createdAt,
    };
  }

  /** Signals newest first (all kinds: ring of 500 per chain; one kind: ring of 150 per kind). */
  signals(chain: ChainId, opts: { kind?: string; limit?: number }): Signal[] {
    const kind = SIGNAL_KINDS.includes(opts.kind as SignalKind) ? (opts.kind as SignalKind) : undefined;
    const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 100)));
    const out: Signal[] = [];
    for (const s of this.signalEngine.list(chain, kind, 500)) {
      if (out.length >= limit) break;
      const dto = this.signalDto(s);
      if (dto) out.push(dto);
    }
    return out;
  }

  /**
   * A wallet's calls (kol_call signals) newest first, with hit rates over the
   * calls made in the last 7d / 30d (hit = maxMultiple >= 2) and their mean
   * maxMultiple over 30d. Stats cover the caller's last 200 calls, including
   * calls on tokens since deleted; the list leaves those out.
   */
  walletCalls(w: WalletState, limit = 50): WalletCalls {
    const now = this.ctx.world.now;
    const lim = Math.max(1, Math.min(200, Math.floor(limit)));
    const calls: Signal[] = [];
    const n = { d7: 0, hits7: 0, d30: 0, hits30: 0, sum30: 0 };
    for (const s of this.signalEngine.callsBy(w.address)) {
      const multiple = maxMultipleOf(s);
      const hit = multiple >= CALL_HIT_MULTIPLE ? 1 : 0;
      const age = now - s.createdAt;
      if (age <= CALL_STATS_MS) {
        n.d30++;
        n.hits30 += hit;
        n.sum30 += multiple;
      }
      if (age <= 7 * DAY_MS) {
        n.d7++;
        n.hits7 += hit;
      }
      const dto = calls.length < lim ? this.signalDto(s) : null;
      if (dto) calls.push(dto);
    }
    return {
      calls,
      hitRate7d: n.d7 > 0 ? n.hits7 / n.d7 : 0,
      hitRate30d: n.d30 > 0 ? n.hits30 / n.d30 : 0,
      avgMaxMultiple: n.d30 > 0 ? n.sum30 / n.d30 : 0,
    };
  }

  /** Call-out feed: the chain's latest kol_call signals (last 1000), newest first. */
  callouts(chain: ChainId, filter: CalloutFilter, limit = 100): Signal[] {
    const world = this.ctx.world;
    const lim = Math.max(1, Math.min(500, Math.floor(limit)));
    const out: Signal[] = [];
    for (const s of this.signalEngine.list(chain, 'kol_call', CALL_RING)) {
      if (out.length >= lim) break;
      if (filter === 'hits' && maxMultipleOf(s) < CALL_HIT_MULTIPLE) continue;
      if (filter === 'kol' && !world.wallets.get(s.wallets[0])?.tags.has('kol')) continue;
      const dto = this.signalDto(s);
      if (dto) out.push(dto);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialize(): unknown {
    const feeds: Persisted['feeds'] = {};
    for (const c of CHAIN_IDS) feeds[c] = { smart: this.feeds[c].smart.toArray(), kol: this.feeds[c].kol.toArray(), all: this.feeds[c].all.toArray() };
    const data: Persisted = {
      v: 1,
      seq: this.seq,
      classifyRuns: this.classifyRuns,
      tracks: [...this.tracks.values()].map((t) => t.dump()),
      feeds,
      signals: this.signalEngine.dump(),
      entries: this.entries.dump(),
    };
    return data;
  }

  restore(data: unknown): void {
    const d = data as Persisted | null | undefined;
    if (!d || d.v !== 1) return;
    this.seq = d.seq ?? 0;
    this.classifyRuns = d.classifyRuns ?? 0;
    this.tracks.clear();
    for (const td of d.tracks ?? []) this.tracks.set(td.address, WalletTrack.load(td));
    for (const c of CHAIN_IDS) {
      const f = d.feeds?.[c];
      this.feeds[c] = {
        smart: Ring.from(f?.smart ?? [], FEED_RING.smart),
        kol: Ring.from(f?.kol ?? [], FEED_RING.kol),
        all: Ring.from(f?.all ?? [], FEED_RING.all),
      };
      this.pending[c] = [];
    }
    this.signalEngine.load(d.signals);
    this.entries.load(d.entries);
    this.baseCache.clear();
    this.lb.clear();
  }
}
