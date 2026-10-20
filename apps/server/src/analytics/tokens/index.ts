// Token-side analytics: summaries/details, security & rug scoring, holders,
// top traders, trade lists, discovery lists (Trenches / Trending / New Pairs),
// narratives and search. Realtime channels live in ./channels.ts and REST
// routes in ./routes.ts.
//
// Performance model (the sim runs ~20-40 trades/s while lists stream):
//   - the per-trade listener is O(1) (track.ts) and never builds DTOs
//   - DTOs are cached per token and keyed by token.version + sim time:
//       summary/detail : rebuilt at most once per SUMMARY_MIN_MS while the token
//                        changes; idle tokens get a light refresh every
//                        SUMMARY_MAX_MS (+-1s per-token jitter so refreshes do not
//                        all land on one tick) that reuses the holder-derived parts
//       window stats   : sums over the immutable minute buckets are cached per sim
//                        minute, a rebuild only adds the newest bucket; while idle
//                        only priceChange is repriced until a bucket ages out
//       holder scan    : O(holders), while changing at most every 2s (10ms per
//                        holder for big holder bases, capped at 60s)
//       dev history    : per creator, DEV_AGG_TTL_MS
//       idle tokens    : caches dropped after CACHE_IDLE_MS without access
//   - list candidates come from small per-chain indexes (active-in-24h set,
//     near-completion set, migration order) instead of scanning every token
//
// Hidden simulation state (archetype, fate, hype, sim, memory, skill) is never
// read here; everything derives from trades, balances, funding links, blocks,
// timestamps, labels/tags and contract flags.

import {
  CHAIN_IDS,
  getLaunchpad,
  type ChainId,
  type DevInfo,
  type DevToken,
  type EarlyBuyer,
  type EarlyBuyersResponse,
  type Narrative,
  type Position,
  type SearchResult,
  type StatWindow,
  type TokenDetail,
  type TokenFilters,
  type TokenRef,
  type TokenSecurity,
  type TokenSummary,
  type Trade,
  type TrenchesQuery,
  type TrenchesSnapshot,
  type TrendingQuery,
  type TrendingSnapshot,
  type TrendingSort,
  type WalletTag,
  type WindowStats,
} from '@trenchscope/shared';
import type { AppContext, Viewer } from '../../context';
import { DUST_RATE, type TokenState, type WalletState } from '../../sim/world';
import { matchIdentityFilters, matchTokenFilters, needsSummary } from '../filters';
import { viewerLabel, viewerTags } from '../viewer';
import { TokenChannels } from './channels';
import { hotLevelOf, hotScore, narrativeHeat, searchCredibility } from './scores';
import {
  buildChecks,
  Cohorts,
  DEV_MIGRATED,
  DEV_RESOLVED,
  DEV_RUGGED,
  devAggregate,
  devGroupBalance,
  devStatusOf,
  devTokenRow,
  holderTagStats,
  isRugged,
  riskLevelOf,
  rugRatio,
  safetyScore,
  scanHolders,
  type DevAggregate,
  type HolderScan,
  type RugInputs,
} from './security';
import { computeWindowsCached, priceChangeAt, repriceWindows, volumeIn, WINDOW_MS, type WindowsBase, type WindowsSnapshot } from './stats';
import { backfillEarly, backfillTrack, flowSince, newTrack, pruneTrack, recordTrade, tombstone, type TokenTrack } from './track';

export const SUMMARY_MIN_MS = 1000;
export const SUMMARY_MAX_MS = 5000;
const SCAN_MIN_MS = 2000;
const SCAN_MAX_MS = 120_000;
/**
 * A holder scan costs O(holders) (~1us per holder), and the busiest tokens are also
 * the ones with the most holders, so while a token trades its scan floor grows with
 * its holder base: 2s up to 200 holders, 10s at 1000, capped at 60s.
 */
const SCAN_MS_PER_HOLDER = 10;
const SCAN_FLOOR_CAP_MS = 60_000;
const ROWS_MIN_MS = 1000;
const ROWS_MAX_MS = 10000;
const DEV_AGG_TTL_MS = 10000;
const NARRATIVE_TTL_MS = 5000;
/** Token refs reuse the latest security read up to this age (refs fill feeds, holdings and signals in bulk). */
const REF_RISK_MAX_MS = 30_000;
const SWEEP_EVERY_MS = 30000;
/** Per-token caches untouched for this long are dropped (bounded memory as tokens go quiet). */
const CACHE_IDLE_MS = 10 * 60_000;
const DAY_MS = 24 * 3600_000;
const ALMOST_PROGRESS = 0.35;
const MAX_TRACKS = 80_000;
const VENUE_LABEL_SUFFIX = 'Bonding Curve';

export type TradeFilter =
  | 'all'
  | 'buy'
  | 'sell'
  | 'dev'
  | 'smart'
  | 'kol'
  | 'sniper'
  | 'insider'
  | 'bundler'
  | 'whale'
  | 'fresh'
  | 'following'
  | 'mine';
export const TRADE_FILTERS: TradeFilter[] = ['all', 'buy', 'sell', 'dev', 'smart', 'kol', 'sniper', 'insider', 'bundler', 'whale', 'fresh', 'following', 'mine'];

export type TraderSort = 'pnl' | 'realized' | 'unrealized' | 'bought' | 'sold';
export const TRADER_SORTS: TraderSort[] = ['pnl', 'realized', 'unrealized', 'bought', 'sold'];

export interface TradesQuery {
  filter?: string;
  wallet?: string;
  minUsd?: number;
  limit?: number;
  before?: number;
  /** Page cursor: the id of the last trade already seen (see `trades`). */
  beforeId?: string;
}
export interface HoldersQuery {
  tag?: string;
  limit?: number;
}
export interface TopTradersQuery {
  tag?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

interface Cached<T> {
  at: number;
  version: number;
  value: T;
}

interface RowsCache {
  at: number;
  version: number;
  rows: Position[];
  /** Lazily sorted views (desc) by sort key. */
  sorted: Map<string, Position[]>;
}

interface TokenCaches {
  /**
   * Per-token offset (ms, +-1000) on the max-age refreshes. Lists summarise
   * hundreds of tokens in one call, so without it every idle token would
   * expire on the same tick (a periodic burst of rebuilds every 5s / 120s).
   */
  jitter: number;
  windows?: Cached<WindowsSnapshot> & { priceUsd: number };
  /** Sums over the immutable minute buckets for the current sim minute (see computeWindowsCached). */
  windowsBase?: WindowsBase;
  scan?: Cached<HolderScan>;
  summary?: Cached<TokenSummary>;
  detail?: Cached<TokenDetail>;
  holders?: RowsCache;
  traders?: RowsCache;
  hot?: { summary: TokenSummary; scores: Partial<Record<StatWindow, number>> };
}

/** Within `minMs` always reuse; within `maxMs` reuse while the token version is unchanged. */
function fresh(c: { at: number; version: number } | undefined, version: number, now: number, minMs: number, maxMs: number): boolean {
  if (!c || now < c.at) return false;
  const age = now - c.at;
  return age < minMs || (c.version === version && age < maxMs);
}

/** Deterministic offset in [-1000, 1000) ms derived from the token address. */
function jitterOf(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (Math.imul(h, 31) + address.charCodeAt(i)) | 0;
  return ((h >>> 0) % 2000) - 1000;
}

/** Default and maximum rows of the list endpoints / channels (per column for Trenches). */
export const LIST_LIMITS = { trenches: 60, trending: 100, newpairs: 60, max: 100 } as const;

const clampInt = (v: number | undefined, def: number, lo: number, hi: number) => {
  if (v === undefined || !Number.isFinite(v)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
};

const TOKEN_RELATIVE: ReadonlySet<WalletTag> = new Set(['dev', 'sniper', 'bundler', 'insider', 'top_holder']);

function mergeTags(a: WalletTag[], b: WalletTag[]): WalletTag[] {
  if (b.length === 0) return a;
  const out = a.slice();
  for (const t of b) if (!out.includes(t)) out.push(t);
  return out;
}

const instances = new WeakMap<AppContext, TokenAnalytics>();

/** The TokenAnalytics instance bound to an app context (routes use the richer option types). */
export function tokenAnalyticsFor(ctx: AppContext): TokenAnalytics | undefined {
  return instances.get(ctx);
}

/** Token-side analytics: summaries/details, security & rug scoring, holders, lists, narratives, search. */
export class TokenAnalytics {
  private tracks = new Map<string, TokenTrack>();
  private caches = new Map<string, TokenCaches>();
  private devAggs = new Map<string, { at: number; value: DevAggregate }>();
  private narrativeCache = new Map<ChainId, { at: number; value: Narrative[] }>();
  /** Tokens traded in the last 24h, per chain. */
  private active = {} as Record<ChainId, Set<string>>;
  /** Curve tokens that crossed the near-completion threshold (or are migrating). */
  private almost = {} as Record<ChainId, Set<string>>;
  /** Migrated token addresses in migration order (oldest first). */
  private migrated = {} as Record<ChainId, string[]>;
  /** Labelled wallets (KOLs, exchanges, ...) for search. */
  private labelled = {} as Record<ChainId, string[]>;
  readonly channels: TokenChannels;

  constructor(protected ctx: AppContext) {
    instances.set(ctx, this);
    for (const c of CHAIN_IDS) {
      this.active[c] = new Set();
      this.almost[c] = new Set();
      this.migrated[c] = [];
      this.labelled[c] = [];
    }
    this.channels = new TokenChannels(ctx, this);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  install(): void {
    const { world, engine } = this.ctx;
    this.reindex();
    // Prepended so every other consumer of 'trade' sees the derived cohort tags.
    world.prependListener('trade', (trade: Trade, t: TokenState, w: WalletState) => this.onTrade(trade, t, w));
    world.on('tokenCreated', (t) => {
      if (!this.tracks.has(t.address)) this.tracks.set(t.address, newTrack(world, t));
    });
    world.on('curveCompleted', (t) => {
      const s = this.tracks.get(t.address);
      if (s) s.status = t.status;
      this.almost[t.chain].add(t.address);
    });
    world.on('tokenMigrated', (t) => {
      const s = this.tracks.get(t.address);
      if (s) {
        s.status = t.status;
        s.migratedAt = t.migratedAt;
      }
      this.almost[t.chain].delete(t.address);
      this.migrated[t.chain].push(t.address);
    });
    world.on('walletCreated', (w) => {
      if (w.label) this.labelled[w.chain].push(w.address);
    });
    engine.addTicker('token-analytics-sweep', () => this.sweep(), { everyMs: SWEEP_EVERY_MS, duringWarmup: true });
    this.channels.install();
  }

  /** Rebuild list indexes from the world (startup / snapshot restore). */
  private reindex(): void {
    const { world } = this.ctx;
    const now = world.now;
    for (const c of CHAIN_IDS) {
      this.active[c].clear();
      this.almost[c].clear();
      this.labelled[c] = [];
    }
    const migrated: TokenState[] = [];
    for (const t of world.tokens.values()) {
      if (t.status === 'migrated') migrated.push(t);
      else if (t.status === 'migrating' || world.progress(t) >= ALMOST_PROGRESS) this.almost[t.chain].add(t.address);
      if (now - t.lastTradeAt <= DAY_MS && t.tradeCount > 0) this.active[t.chain].add(t.address);
    }
    migrated.sort((a, b) => (a.migratedAt ?? 0) - (b.migratedAt ?? 0));
    for (const c of CHAIN_IDS) this.migrated[c] = [];
    for (const t of migrated) this.migrated[t.chain].push(t.address);
    for (const w of world.wallets.values()) if (w.label) this.labelled[w.chain].push(w.address);
  }

  private onTrade(trade: Trade, t: TokenState, w: WalletState): void {
    try {
      const s = this.trackOf(t, true);
      recordTrade(this.ctx.world, s, trade, t, w);
      this.active[t.chain].add(t.address);
      if (t.status === 'curve' && t.curve && t.curve.realTokens <= t.curve.initialRealTokens * (1 - ALMOST_PROGRESS)) this.almost[t.chain].add(t.address);
      // Tag the live trade with analytics-derived cohorts (world.tradeTags only knows the sim's sets).
      const a = w.address;
      const tags = trade.walletTags;
      if ((s.snipers.has(a) && !tags.includes('sniper')) || (s.bundlers.has(a) && !tags.includes('bundler')) || (s.insiders.has(a) && !tags.includes('insider'))) {
        const rel: WalletTag[] = [];
        if (tags.includes('dev')) rel.push('dev');
        if (s.snipers.has(a) || tags.includes('sniper')) rel.push('sniper');
        if (s.bundlers.has(a) || tags.includes('bundler')) rel.push('bundler');
        if (s.insiders.has(a) || tags.includes('insider')) rel.push('insider');
        trade.walletTags = mergeTags(rel, tags.filter((x) => !TOKEN_RELATIVE.has(x)));
      }
      if (!this.ctx.engine.warming) this.channels.onTrade(trade, t);
    } catch (err) {
      console.error('[analytics/tokens] trade listener failed', err);
    }
  }

  /** Periodic housekeeping (runs during warmup too). */
  private sweep(): void {
    const { world } = this.ctx;
    const now = world.now;
    for (const c of CHAIN_IDS) {
      const set = this.active[c];
      for (const addr of set) {
        const t = world.tokens.get(addr);
        if (!t) {
          set.delete(addr);
          continue;
        }
        if (t.dormant || now - t.lastTradeAt > DAY_MS) {
          set.delete(addr);
          t.cache.volume24hUsd = 0;
          continue;
        }
        // Keep /api/meta volume fresh even for tokens no list has summarised.
        const cs = this.caches.get(addr)?.summary;
        if (!cs || now - cs.at > SWEEP_EVERY_MS) t.cache.volume24hUsd = volumeIn(t, DAY_MS, now);
      }
      const almost = this.almost[c];
      for (const addr of almost) {
        const t = world.tokens.get(addr);
        if (!t || t.status === 'migrated' || t.dormant) almost.delete(addr);
      }
      // Forget migrations of tokens the simulator has since deleted.
      const mig = this.migrated[c];
      if (mig.some((addr) => !world.tokens.has(addr))) this.migrated[c] = mig.filter((addr) => world.tokens.has(addr));
    }
    for (const [addr, s] of this.tracks) {
      if (s.gone) continue;
      const t = world.tokens.get(addr);
      if (!t) {
        tombstone(s);
        this.caches.delete(addr);
        continue;
      }
      pruneTrack(s, now);
      this.remember(t, s, world.priceUsd(t));
    }
    if (this.tracks.size > MAX_TRACKS) {
      // Evict the oldest tombstones (Map iterates in insertion = creation order).
      let excess = this.tracks.size - MAX_TRACKS;
      for (const [addr, s] of this.tracks) {
        if (excess <= 0) break;
        if (s.gone) {
          this.tracks.delete(addr);
          excess--;
        }
      }
    }
    for (const [k, v] of this.devAggs) if (now - v.at > DEV_AGG_TTL_MS * 6 || now < v.at) this.devAggs.delete(k);
    for (const [addr, c] of this.caches) {
      if (!world.tokens.has(addr)) {
        this.caches.delete(addr);
        continue;
      }
      if (c.traders && now - c.traders.at > 60_000) c.traders = undefined;
      if (c.holders && now - c.holders.at > 60_000) c.holders = undefined;
      // Tokens nobody has looked at for a while (quiet / dormant) drop their DTO caches.
      const last = Math.max(c.summary?.at ?? -Infinity, c.detail?.at ?? -Infinity, c.windows?.at ?? -Infinity, c.scan?.at ?? -Infinity);
      if (now - last > CACHE_IDLE_MS && !c.holders && !c.traders) this.caches.delete(addr);
    }
  }

  /** Analytics track for a token, created (and back-filled from the trade ring) on first sight. */
  trackOf(t: TokenState, excludeLastTrade = false): TokenTrack {
    let s = this.tracks.get(t.address);
    if (!s || s.gone) {
      s = newTrack(this.ctx.world, t);
      const replay = t.trades.length - (excludeLastTrade ? 1 : 0);
      if (replay > 0) backfillTrack(this.ctx.world, s, t, replay);
      this.tracks.set(t.address, s);
    }
    return s;
  }

  private cachesOf(address: string): TokenCaches {
    let c = this.caches.get(address);
    if (!c) {
      c = { jitter: jitterOf(address) };
      this.caches.set(address, c);
    }
    return c;
  }

  /** Holder scan still usable: within the floor, or unchanged and younger than the (jittered) max age. */
  private scanFresh(t: TokenState, c: TokenCaches, now: number): boolean {
    const floor = Math.min(SCAN_FLOOR_CAP_MS, Math.max(SCAN_MIN_MS, t.holders.size * SCAN_MS_PER_HOLDER));
    return fresh(c.scan, t.version, now, floor, SCAN_MAX_MS + 10 * c.jitter);
  }

  /** Cohort membership helper for one token (cheap; create one per batch of rows). */
  cohortsFor(t: TokenState): Cohorts {
    return new Cohorts(this.ctx.world, t, this.trackOf(t));
  }

  private walletTagsOf = (w: WalletState): WalletTag[] => this.ctx.analytics.walletTags(w);

  // -------------------------------------------------------------------------
  // Cached building blocks
  // -------------------------------------------------------------------------

  private statsOf(t: TokenState, c: TokenCaches, now: number, priceUsd: number): Record<StatWindow, WindowStats> {
    const w = c.windows;
    if (w && now >= w.at) {
      const idle = w.version === t.version;
      if (idle && now < w.value.validUntil) {
        if (w.priceUsd === priceUsd) return w.value.stats;
        const value = repriceWindows(w.value, priceUsd);
        c.windows = { at: now, version: t.version, value, priceUsd };
        return value.stats;
      }
      if (!idle && now - w.at < SUMMARY_MIN_MS) return w.value.stats;
    }
    const { snapshot: value, base } = computeWindowsCached(t, now, priceUsd, c.windowsBase);
    c.windowsBase = base;
    c.windows = { at: now, version: t.version, value, priceUsd };
    return value.stats;
  }

  private scanOf(t: TokenState, c: TokenCaches, now: number, cohorts: Cohorts): HolderScan {
    if (this.scanFresh(t, c, now)) return c.scan!.value;
    const value = scanHolders(this.ctx.world, t, cohorts, this.walletTagsOf);
    c.scan = { at: now, version: t.version, value };
    return value;
  }

  /** Rugged flag of a live token; also refreshes the track's last-known values (kept after deletion). */
  private liveRugged = (t: TokenState): boolean => {
    const s = this.trackOf(t);
    this.remember(t, s, this.ctx.world.priceUsd(t));
    return s.rugged;
  };

  private remember(t: TokenState, s: TokenTrack, priceUsd: number): void {
    s.status = t.status;
    s.migratedAt = t.migratedAt;
    s.marketCapUsd = priceUsd * t.totalSupply;
    s.athMarketCapUsd = Math.max(t.athMarketCapUsd, s.marketCapUsd);
    s.rugged = isRugged(s, priceUsd, t.athPriceUsd);
  }

  private devAgg(creator: string): DevAggregate {
    const now = this.ctx.world.now;
    const hit = this.devAggs.get(creator);
    if (hit && now >= hit.at && now - hit.at < DEV_AGG_TTL_MS) return hit.value;
    const value = devAggregate(this.ctx.world, creator, (a) => this.tracks.get(a), this.liveRugged);
    this.devAggs.set(creator, { at: now, value });
    return value;
  }

  private securityOf(
    t: TokenState,
    s: TokenTrack,
    cohorts: Cohorts,
    scan: HolderScan,
    stats: Record<StatWindow, WindowStats>,
    priceUsd: number,
    now: number,
    smartCount: number,
  ): TokenSecurity {
    const supply = t.totalSupply;
    const sol = t.chain === 'sol';
    const devBal = devGroupBalance(this.ctx.world, t);
    const devStatus = devStatusOf(s, devBal);
    const holders = scan.holderCount;
    const bundlerVol = s.volumeUsd > 0 ? cohorts.cohortVolume('bundler') : 0;
    const insiderVol = s.volumeUsd > 0 ? cohorts.cohortVolume('insider') : 0;
    const w1h = stats['1h'];
    const wash1h = flowSince(s, now - 3600_000).washUsd;
    const base: Omit<TokenSecurity, 'checks' | 'rugRatio' | 'riskLevel'> = {
      renouncedMint: sol ? t.renouncedMint : null,
      renouncedFreeze: sol ? t.renouncedFreeze : null,
      isOpenSource: sol ? null : t.isOpenSource,
      isRenounced: sol ? null : t.isRenounced,
      isHoneypot: sol ? null : t.isHoneypot,
      buyTax: t.buyTax,
      sellTax: t.sellTax,
      lpBurnedRate: t.pool ? t.pool.lpBurnedRate : null,
      top10HolderRate: scan.top10Balance / supply,
      top100HolderRate: scan.top100Balance / supply,
      devHoldRate: devBal / supply,
      devStatus,
      insiderHoldRate: scan.insider.balance / supply,
      sniperHoldRate: scan.sniper.balance / supply,
      sniperCount: cohorts.sniperCount(),
      bundlerRate: s.volumeUsd > 0 ? Math.min(1, bundlerVol / s.volumeUsd) : 0,
      ratTraderRate: s.volumeUsd > 0 ? Math.min(1, insiderVol / s.volumeUsd) : 0,
      freshWalletRate: holders > 0 ? scan.fresh.count / holders : 0,
      botDegenRate: holders > 0 ? scan.bot.count / holders : 0,
      isWashTrading: w1h.swaps >= 20 && w1h.volumeUsd > 0 && wash1h >= 0.3 * w1h.volumeUsd,
    };
    const rug = rugRatio(this.rugInputs(t, s, base, scan, priceUsd, now));
    const sec: Omit<TokenSecurity, 'checks' | 'safety'> = { ...base, rugRatio: rug, riskLevel: riskLevelOf(rug, base.isHoneypot) };
    return {
      ...sec,
      checks: buildChecks({ security: sec, chain: t.chain, onCurve: t.status !== 'migrated', smartDegenCount: smartCount }),
      safety: safetyScore({ chain: t.chain, security: sec, holderCount: scan.holderCount }),
    };
  }

  /** Observable inputs of the rug ratio (exported shape lets tests evaluate the model). */
  rugInputs(t: TokenState, s: TokenTrack, sec: Omit<TokenSecurity, 'checks' | 'rugRatio' | 'riskLevel'>, scan: HolderScan, priceUsd: number, now: number): RugInputs {
    const agg = this.devAgg(t.creator);
    // Exclude this launch exactly as the (possibly slightly older) aggregate counted it.
    const own = agg.flags.get(t.address) ?? 0;
    return {
      chain: t.chain,
      status: t.status,
      ageMs: now - t.createdAt,
      devHoldRate: sec.devHoldRate,
      devStatus: sec.devStatus,
      devSoldEarlyFrac: s.devPeak > 0 ? s.devSoldEarly / s.devPeak : 0,
      athDrawdown: t.athPriceUsd > 0 ? Math.max(0, 1 - priceUsd / t.athPriceUsd) : 0,
      bundlerRate: sec.bundlerRate,
      bundlerHoldRate: scan.bundler.balance / t.totalSupply,
      insiderHoldRate: sec.insiderHoldRate,
      ratTraderRate: sec.ratTraderRate,
      sniperHoldRate: sec.sniperHoldRate,
      top10HolderRate: sec.top10HolderRate,
      devOtherCreated: Math.max(0, agg.created - (agg.flags.has(t.address) ? 1 : 0)),
      devOtherResolved: agg.resolved - (own & DEV_RESOLVED ? 1 : 0),
      devOtherRugged: agg.rugged - (own & DEV_RUGGED ? 1 : 0),
      devOtherMigrated: agg.migrated - (own & DEV_MIGRATED ? 1 : 0),
      renouncedMint: sec.renouncedMint,
      renouncedFreeze: sec.renouncedFreeze,
      isHoneypot: sec.isHoneypot,
      isOpenSource: sec.isOpenSource,
      isRenounced: sec.isRenounced,
      buyTax: sec.buyTax,
      sellTax: sec.sellTax,
      lpBurnedRate: sec.lpBurnedRate,
      isWashTrading: sec.isWashTrading,
    };
  }

  /** Rug inputs for a token right now (evaluation / debugging helper). */
  currentRugInputs(t: TokenState): RugInputs {
    const now = this.ctx.world.now;
    const s = this.trackOf(t);
    const summary = this.summary(t);
    const scan = this.cachesOf(t.address).scan!.value;
    return this.rugInputs(t, s, summary.security, scan, this.ctx.world.priceUsd(t), now);
  }

  // -------------------------------------------------------------------------
  // DTOs
  // -------------------------------------------------------------------------

  summary = (t: TokenState): TokenSummary => {
    const now = this.ctx.world.now;
    const c = this.cachesOf(t.address);
    const prev = c.summary;
    if (fresh(prev, t.version, now, SUMMARY_MIN_MS, SUMMARY_MAX_MS + c.jitter)) return prev!.value;
    // Idle token (no trade since the last build) with holder-derived parts still fresh: light refresh.
    const light = !!prev && prev.version === t.version && now >= prev.at && this.scanFresh(t, c, now);
    const value = light ? this.lightSummary(t, c, prev!.value, now) : this.buildSummary(t, c, now);
    c.summary = { at: now, version: t.version, value };
    t.cache.volume24hUsd = value.stats['24h'].volumeUsd;
    return value;
  };

  /** Refresh price- and time-dependent fields of an idle token, reusing security / holder tags. */
  private lightSummary(t: TokenState, c: TokenCaches, prev: TokenSummary, now: number): TokenSummary {
    const { world } = this.ctx;
    const priceNative = world.priceNative(t);
    const priceUsd = priceNative * world.nativeUsd(t.chain);
    const mcap = priceUsd * t.totalSupply;
    const stats = this.statsOf(t, c, now, priceUsd);
    const summary: TokenSummary = {
      ...prev,
      priceUsd,
      priceNative,
      marketCapUsd: mcap,
      athMarketCapUsd: Math.max(t.athMarketCapUsd, mcap),
      liquidityUsd: world.liquidityUsd(t),
      stats,
      netBuy24hUsd: stats['24h'].buyVolumeUsd - stats['24h'].sellVolumeUsd,
      socials: { ...t.socials },
      xFollowers: t.xFollowers,
      cto: t.cto,
      boosted: t.boosted,
      isCopycat: t.isCopycat,
      watchers: t.watchers + this.channels.viewerCount(t),
    };
    const hot1h = hotScore(summary, '1h', this.holderGrowth(this.trackOf(t), '1h', now));
    summary.hotLevel = hotLevelOf(hot1h);
    c.hot = { summary, scores: { '1h': hot1h } };
    return summary;
  }

  private buildSummary(t: TokenState, c: TokenCaches, now: number): TokenSummary {
    const { world } = this.ctx;
    const s = this.trackOf(t);
    const cohorts = new Cohorts(world, t, s);
    const priceNative = world.priceNative(t);
    const priceUsd = priceNative * world.nativeUsd(t.chain);
    const mcap = priceUsd * t.totalSupply;
    const stats = this.statsOf(t, c, now, priceUsd);
    const scan = this.scanOf(t, c, now, cohorts);
    this.remember(t, s, priceUsd);
    const agg = this.devAgg(t.creator);
    const security = this.securityOf(t, s, cohorts, scan, stats, priceUsd, now, scan.smart.count);
    const summary: TokenSummary = {
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoSeed: t.logoSeed,
      logoGlyph: t.logoGlyph,
      // Live tokens' real image (simulated tokens have none: the field stays absent).
      ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}),
      narrative: t.narrative,
      launchpad: t.launchpad,
      status: t.status,
      dex: t.pool?.dex ?? null,
      creator: t.creator,
      createdAt: t.createdAt,
      migratedAt: t.migratedAt,
      completeCostSeconds: t.completedAt !== null ? Math.max(0, (t.completedAt - t.createdAt) / 1000) : null,
      priceUsd,
      priceNative,
      marketCapUsd: mcap,
      athMarketCapUsd: Math.max(t.athMarketCapUsd, mcap),
      liquidityUsd: world.liquidityUsd(t),
      initialLiquidityUsd: t.pool ? t.pool.initialLiquidityUsd : t.initialLiquidityUsd,
      progress: world.progress(t),
      holderCount: t.holders.size,
      totalSupply: t.totalSupply,
      stats,
      netBuy24hUsd: stats['24h'].buyVolumeUsd - stats['24h'].sellVolumeUsd,
      smartDegenCount: scan.smart.count,
      kolCount: scan.kol.count,
      socials: { ...t.socials },
      xFollowers: t.xFollowers,
      cto: t.cto,
      boosted: t.boosted,
      isCopycat: t.isCopycat,
      watchers: t.watchers + this.channels.viewerCount(t),
      hotLevel: 0,
      security,
      devCreatedCount: agg.created,
      devMigratedCount: agg.migrated,
      holderTags: holderTagStats(scan, t.totalSupply),
    };
    const hot1h = hotScore(summary, '1h', this.holderGrowth(s, '1h', now));
    summary.hotLevel = hotLevelOf(hot1h);
    c.hot = { summary, scores: { '1h': hot1h } };
    return summary;
  }

  private holderGrowth(s: TokenTrack, window: StatWindow, now: number): number {
    const f = flowSince(s, now - WINDOW_MS[window]);
    return f.holdersIn - f.holdersOut;
  }

  /** Hot score for a window, cached alongside the summary it was computed from. */
  hotScoreOf(t: TokenState, window: StatWindow): number {
    const summary = this.summary(t);
    const c = this.cachesOf(t.address);
    if (!c.hot || c.hot.summary !== summary) c.hot = { summary, scores: {} };
    const hit = c.hot.scores[window];
    if (hit !== undefined) return hit;
    const v = hotScore(summary, window, this.holderGrowth(this.trackOf(t), window, this.ctx.world.now));
    c.hot.scores[window] = v;
    return v;
  }

  /** The cached summary while at most REF_RISK_MAX_MS old (holder / risk context of feed rows), else a fresh one. */
  recentSummary = (t: TokenState): TokenSummary => {
    const { world } = this.ctx;
    const cached = this.caches.get(t.address)?.summary;
    return cached && world.now >= cached.at && world.now - cached.at < REF_RISK_MAX_MS ? cached.value : this.summary(t);
  };

  ref = (t: TokenState): TokenRef => {
    const { world } = this.ctx;
    const priceUsd = world.priceUsd(t);
    const security = this.recentSummary(t).security;
    return {
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoSeed: t.logoSeed,
      logoGlyph: t.logoGlyph,
      ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}),
      priceUsd,
      marketCapUsd: priceUsd * t.totalSupply,
      liquidityUsd: world.liquidityUsd(t),
      status: t.status,
      launchpad: t.launchpad,
      createdAt: t.createdAt,
      priceChange24h: priceChangeAt(t, DAY_MS, world.now, priceUsd),
      rugRatio: security.rugRatio,
      riskLevel: security.riskLevel,
    };
  };

  detail = (t: TokenState): TokenDetail => {
    const { world } = this.ctx;
    const now = world.now;
    const c = this.cachesOf(t.address);
    if (fresh(c.detail, t.version, now, SUMMARY_MIN_MS, SUMMARY_MAX_MS)) return c.detail!.value;
    const sum = this.summary(t);
    // The summary may be served from its 1s floor and predate the latest trade: record the
    // version it actually reflects so the next call past the floor rebuilds (and the token
    // channel re-broadcasts) instead of treating this detail as current for SUMMARY_MAX_MS.
    const version = c.summary && c.summary.value === sum ? c.summary.version : t.version;
    const nativeUsd = world.nativeUsd(t.chain);
    const curve =
      t.curve && t.status !== 'migrated'
        ? {
            virtualNative: t.curve.virtualNative,
            virtualTokens: t.curve.virtualTokens,
            realNative: t.curve.realNative,
            realTokens: t.curve.realTokens,
            initialRealTokens: t.curve.initialRealTokens,
            progress: world.progress(t),
            graduationMarketCapUsd: world.graduationMarketCapUsd(t),
          }
        : null;
    const pool = t.pool
      ? {
          address: t.pool.address,
          dex: t.pool.dex,
          nativeReserve: t.pool.native,
          tokenReserve: t.pool.tokens,
          liquidityUsd: 2 * t.pool.native * nativeUsd,
          initialLiquidityUsd: t.pool.initialLiquidityUsd,
          lpBurnedRate: t.pool.lpBurnedRate,
          createdAt: t.pool.createdAt,
          feeRate: t.pool.feeRate,
        }
      : null;
    const value: TokenDetail = {
      ...sum,
      description: t.description,
      decimals: t.decimals,
      circulatingSupply: t.totalSupply,
      nativeUsd,
      curve,
      pool,
      dev: this.devInfo(t),
      athPriceUsd: Math.max(t.athPriceUsd, sum.priceUsd),
      totalFeesUsd: t.totalFeesUsd,
    };
    c.detail = { at: now, version, value };
    return value;
  };

  /** Token version the cached detail reflects (-1 when none); the token channel uses it to avoid stale broadcasts. */
  detailVersion(t: TokenState): number {
    return this.caches.get(t.address)?.detail?.version ?? -1;
  }

  devInfo = (t: TokenState): DevInfo => {
    const { world } = this.ctx;
    const s = this.trackOf(t);
    const agg = this.devAgg(t.creator);
    const devBal = devGroupBalance(world, t);
    const priceUsd = world.priceUsd(t);
    const tokens = agg.tokens.map((row) =>
      row.address === t.address
        ? {
            ...row,
            status: t.status,
            marketCapUsd: priceUsd * t.totalSupply,
            athMarketCapUsd: Math.max(t.athMarketCapUsd, priceUsd * t.totalSupply),
            rugged: isRugged(s, priceUsd, t.athPriceUsd),
          }
        : row,
    );
    return {
      address: t.creator,
      holdRate: devBal / t.totalSupply,
      status: devStatusOf(s, devBal),
      createdCount: agg.created,
      migratedCount: agg.migrated,
      ruggedCount: agg.rugged,
      migrationRate: agg.created > 0 ? agg.migrated / agg.created : 0,
      bestAthMarketCapUsd: agg.bestAth,
      fundedBy: world.wallets.get(t.creator)?.fundedBy ?? null,
      tokens,
    };
  };

  /** Tokens the wallet created that still exist, newest first (default 100, max 500). */
  createdTokens = (w: WalletState, limit?: number): DevToken[] => {
    const { world } = this.ctx;
    const lim = clampInt(limit, 100, 1, 500);
    const out: DevToken[] = [];
    for (let i = w.createdTokens.length - 1; i >= 0 && out.length < lim; i--) {
      const t = world.tokens.get(w.createdTokens[i]);
      if (t) out.push(devTokenRow(world, t, this.liveRugged(t)));
    }
    return out;
  };

  // -------------------------------------------------------------------------
  // Trades
  // -------------------------------------------------------------------------

  /** Current maker tags of a trade: token-relative cohorts + platform tags (no viewer tags). */
  makerTags(trade: Trade, t?: TokenState, cohorts?: Cohorts): WalletTag[] {
    const w = this.ctx.world.wallets.get(trade.wallet);
    if (!w) return trade.walletTags;
    const tok = t ?? this.ctx.world.tokens.get(trade.token);
    const rel = tok ? (cohorts ?? this.cohortsFor(tok)).tags(w.address, w) : trade.walletTags.filter((x) => TOKEN_RELATIVE.has(x));
    if (trade.isDev && !rel.includes('dev')) rel.unshift('dev');
    return mergeTags(rel, this.walletTagsOf(w));
  }

  /** Broadcast form of a trade: refreshed tags, public label, no viewer-relative fields. */
  publicTrade(trade: Trade, t?: TokenState, cohorts?: Cohorts): Trade {
    const w = this.ctx.world.wallets.get(trade.wallet);
    return { ...trade, walletTags: this.makerTags(trade, t, cohorts), walletLabel: w ? w.label : trade.walletLabel };
  }

  viewTrade = (trade: Trade, viewer: Viewer, t?: TokenState, cohorts?: Cohorts): Trade => {
    const pub = this.publicTrade(trade, t, cohorts);
    if (!viewer.accountId) return pub;
    pub.walletTags = viewerTags(this.ctx, viewer, trade.chain, trade.wallet, pub.walletTags);
    pub.walletLabel = viewerLabel(this.ctx, viewer, trade.chain, trade.wallet, pub.walletLabel);
    return pub;
  };

  private matchTrade(tr: Trade, filter: string, t: TokenState, cohorts: Cohorts, viewer: Viewer): boolean {
    switch (filter) {
      case 'all':
        return true;
      case 'buy':
      case 'sell':
        return tr.side === filter;
      case 'dev':
        return tr.isDev || cohorts.isDev(tr.wallet);
      case 'sniper':
        return tr.walletTags.includes('sniper') || cohorts.isSniper(tr.wallet);
      case 'bundler':
        return tr.walletTags.includes('bundler') || cohorts.isBundler(tr.wallet);
      case 'insider':
        return tr.walletTags.includes('insider') || cohorts.isInsider(tr.wallet);
      case 'smart':
      case 'kol':
      case 'whale':
      case 'fresh': {
        const w = this.ctx.world.wallets.get(tr.wallet);
        return w ? this.walletTagsOf(w).includes(filter) : tr.walletTags.includes(filter);
      }
      case 'following':
        return !!viewer.accountId && this.ctx.accounts.isFollowing(viewer.accountId, t.chain, tr.wallet);
      case 'mine':
        return !!viewer.accountId && this.ctx.accounts.accountIdForWallet(tr.wallet) === viewer.accountId;
      default:
        return true;
    }
  }

  trades = (t: TokenState, opts: TradesQuery, viewer: Viewer): Trade[] => {
    const limit = clampInt(opts.limit, 100, 1, 500);
    const filter = opts.filter ?? 'all';
    if ((filter === 'following' || filter === 'mine') && !viewer.accountId) return [];
    const cohorts = this.cohortsFor(t);
    const out: Trade[] = [];
    const list = t.trades;
    // A beforeId cursor resumes right after that trade, so trades sharing its millisecond are not
    // skipped; without one (or once it has left the ring) `before` pages by time alone.
    let start = list.length - 1;
    let before = opts.before;
    if (opts.beforeId !== undefined) {
      let at = start;
      while (at >= 0 && list[at].id !== opts.beforeId) at--;
      if (at >= 0) {
        start = at - 1;
        before = undefined;
      } else if (before === undefined) return [];
    }
    for (let i = start; i >= 0 && out.length < limit; i--) {
      const tr = list[i];
      if (before !== undefined && tr.timestamp >= before) continue;
      if (opts.wallet && tr.wallet !== opts.wallet) continue;
      if (opts.minUsd !== undefined && tr.usdAmount < opts.minUsd) continue;
      if (!this.matchTrade(tr, filter, t, cohorts, viewer)) continue;
      out.push(this.viewTrade(tr, viewer, t, cohorts));
    }
    return out;
  };

  // -------------------------------------------------------------------------
  // Holders & top traders
  // -------------------------------------------------------------------------

  private positionRow(t: TokenState, w: WalletState, priceUsd: number, cohorts: Cohorts, now: number): Position | null {
    const p = w.positions.get(t.address);
    if (!p) return null;
    const valueUsd = p.balance * priceUsd;
    const unrealized = p.balance > 0 ? valueUsd - p.costBasisUsd : 0;
    const total = p.realizedPnlUsd + unrealized;
    const end = p.balance > 0 ? now : (p.closedAt ?? p.lastActiveAt);
    return {
      chain: t.chain,
      token: t.address,
      wallet: w.address,
      addrType: 'wallet',
      walletTags: mergeTags(cohorts.tags(w.address, w), this.walletTagsOf(w)),
      walletLabel: w.label,
      balance: p.balance,
      holdRate: p.balance / t.totalSupply,
      valueUsd,
      costBasisUsd: p.costBasisUsd,
      avgBuyPriceUsd: p.boughtTokens > 0 ? p.boughtUsd / p.boughtTokens : 0,
      avgSellPriceUsd: p.soldTokens > 0 ? p.soldUsd / p.soldTokens : 0,
      boughtUsd: p.boughtUsd,
      soldUsd: p.soldUsd,
      boughtTokens: p.boughtTokens,
      soldTokens: p.soldTokens,
      realizedPnlUsd: p.realizedPnlUsd,
      unrealizedPnlUsd: unrealized,
      totalPnlUsd: total,
      pnlRate: p.boughtUsd > 0 ? total / p.boughtUsd : 0,
      buys: p.buys,
      sells: p.sells,
      firstBuyAt: p.firstBuyAt,
      lastActiveAt: p.lastActiveAt,
      holdSeconds: p.firstBuyAt !== null ? Math.max(0, (end - p.firstBuyAt) / 1000) : 0,
      nativeBalance: w.native,
      fundedBy: w.fundedBy,
    };
  }

  /** Bonding-curve or pool account row (excluded from concentration metrics). */
  venueRow(t: TokenState): Position | null {
    const { world } = this.ctx;
    const now = world.now;
    const priceUsd = world.priceUsd(t);
    let balance: number;
    let wallet: string;
    let label: string;
    let native: number;
    let since: number;
    if (t.pool) {
      balance = t.pool.tokens;
      wallet = t.pool.address;
      label = `${t.pool.dex} Pool`;
      native = t.pool.native;
      since = t.pool.createdAt;
    } else if (t.curve) {
      // Unsold curve tokens plus the reserve that seeds the pool at migration.
      balance = Math.max(0, t.curve.realTokens + (t.totalSupply - t.curve.initialRealTokens));
      label = `${getLaunchpad(t.launchpad)?.name ?? t.launchpad} ${VENUE_LABEL_SUFFIX}`;
      wallet = label;
      native = t.curve.realNative;
      since = t.createdAt;
    } else return null;
    return {
      chain: t.chain,
      token: t.address,
      wallet,
      addrType: t.pool ? 'pool' : 'curve',
      walletTags: [],
      walletLabel: label,
      balance,
      holdRate: balance / t.totalSupply,
      valueUsd: balance * priceUsd,
      costBasisUsd: 0,
      avgBuyPriceUsd: 0,
      avgSellPriceUsd: 0,
      boughtUsd: 0,
      soldUsd: 0,
      boughtTokens: 0,
      soldTokens: 0,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      totalPnlUsd: 0,
      pnlRate: 0,
      buys: 0,
      sells: 0,
      firstBuyAt: null,
      lastActiveAt: t.lastTradeAt,
      holdSeconds: Math.max(0, (now - since) / 1000),
      nativeBalance: native,
      fundedBy: null,
    };
  }

  /** Holder rows sorted by balance desc, top 10 tagged top_holder; cached per token version. */
  private holderRows(t: TokenState): Position[] {
    const { world } = this.ctx;
    const now = world.now;
    const c = this.cachesOf(t.address);
    if (fresh(c.holders, t.version, now, ROWS_MIN_MS, ROWS_MAX_MS)) return c.holders!.rows;
    const priceUsd = world.priceUsd(t);
    const cohorts = this.cohortsFor(t);
    const rows: Position[] = [];
    for (const a of t.holders) {
      const w = world.wallets.get(a);
      if (!w) continue;
      const row = this.positionRow(t, w, priceUsd, cohorts, now);
      if (row && row.balance > 0) rows.push(row);
    }
    rows.sort((x, y) => y.balance - x.balance);
    for (let i = 0; i < rows.length && i < 10; i++) if (!rows[i].walletTags.includes('top_holder')) rows[i].walletTags.push('top_holder');
    c.holders = { at: now, version: t.version, rows, sorted: new Map() };
    return rows;
  }

  /** Every wallet that ever traded the token; cached per token version. */
  private traderRows(t: TokenState): RowsCache {
    const { world } = this.ctx;
    const now = world.now;
    const c = this.cachesOf(t.address);
    if (fresh(c.traders, t.version, now, ROWS_MIN_MS, ROWS_MAX_MS)) return c.traders!;
    const top10 = new Set(this.holderRows(t).slice(0, 10).map((r) => r.wallet));
    const priceUsd = world.priceUsd(t);
    const cohorts = this.cohortsFor(t);
    const rows: Position[] = [];
    for (const a of t.traders) {
      const w = world.wallets.get(a);
      if (!w) continue;
      const row = this.positionRow(t, w, priceUsd, cohorts, now);
      if (!row) continue;
      if (top10.has(a)) row.walletTags.push('top_holder');
      rows.push(row);
    }
    c.traders = { at: now, version: t.version, rows, sorted: new Map() };
    return c.traders;
  }

  private matchRowTag(row: Position, tag: string, viewer: Viewer): boolean {
    if (tag === 'all') return true;
    if (tag === 'following') return !!viewer.accountId && this.ctx.accounts.isFollowing(viewer.accountId, row.chain, row.wallet);
    if (tag === 'you') return !!viewer.accountId && this.ctx.accounts.accountIdForWallet(row.wallet) === viewer.accountId;
    return row.walletTags.includes(tag as WalletTag);
  }

  private viewRow(row: Position, viewer: Viewer): Position {
    if (!viewer.accountId) return { ...row, walletTags: row.walletTags.slice() };
    return {
      ...row,
      walletTags: viewerTags(this.ctx, viewer, row.chain, row.wallet, row.walletTags.slice()),
      walletLabel: viewerLabel(this.ctx, viewer, row.chain, row.wallet, row.walletLabel),
    };
  }

  holders = (t: TokenState, opts: HoldersQuery, viewer: Viewer): Position[] => {
    const limit = clampInt(opts.limit, 100, 1, 500);
    const tag = opts.tag ?? 'all';
    const out: Position[] = [];
    if (tag === 'all') {
      const venue = this.venueRow(t);
      if (venue) out.push(venue);
    }
    let n = 0;
    for (const row of this.holderRows(t)) {
      if (n >= limit) break;
      if (!this.matchRowTag(row, tag, viewer)) continue;
      out.push(this.viewRow(row, viewer));
      n++;
    }
    return out;
  };

  topTraders = (t: TokenState, opts: TopTradersQuery, viewer: Viewer): Position[] => {
    const limit = clampInt(opts.limit, 100, 1, 500);
    const tag = opts.tag ?? 'all';
    const sort = (TRADER_SORTS as string[]).includes(opts.sort ?? '') ? (opts.sort as TraderSort) : 'pnl';
    const asc = opts.order === 'asc';
    const cache = this.traderRows(t);
    let sorted = cache.sorted.get(sort);
    if (!sorted) {
      const key: (p: Position) => number =
        sort === 'realized'
          ? (p) => p.realizedPnlUsd
          : sort === 'unrealized'
            ? (p) => p.unrealizedPnlUsd
            : sort === 'bought'
              ? (p) => p.boughtUsd
              : sort === 'sold'
                ? (p) => p.soldUsd
                : (p) => p.totalPnlUsd;
      sorted = cache.rows.slice().sort((a, b) => key(b) - key(a) || b.boughtUsd - a.boughtUsd);
      cache.sorted.set(sort, sorted);
    }
    const out: Position[] = [];
    const n = sorted.length;
    for (let i = 0; i < n && out.length < limit; i++) {
      const row = sorted[asc ? n - 1 - i : i];
      if (!this.matchRowTag(row, tag, viewer)) continue;
      out.push(this.viewRow(row, viewer));
    }
    return out;
  };

  /**
   * The token's first buyers (tracked at trade time, at most EARLY_BUYERS_LIMIT) with their bags
   * now. Status compares the balance with the wallet's first buy (see EarlyBuyer.status).
   */
  earlyBuyers = (t: TokenState, viewer: Viewer): EarlyBuyersResponse => {
    const { world } = this.ctx;
    const s = this.trackOf(t);
    const cohorts = new Cohorts(world, t, s);
    const priceUsd = world.priceUsd(t);
    const dust = t.totalSupply * DUST_RATE;
    const summary: EarlyBuyersResponse['summary'] = { holding: 0, soldPart: 0, soldAll: 0, added: 0, holdRateTotal: 0 };
    const buyers: EarlyBuyer[] = [];
    for (let i = 0; i < s.earlyBuyers.length; i++) {
      const a = s.earlyBuyers[i];
      const w = world.wallets.get(a);
      const p = w?.positions.get(t.address);
      if (!w || !p || p.firstBuyAt === null) continue;
      const first = s.earlyTokens[i];
      const status = p.balance <= dust ? 'sold_all' : p.balance < first * (1 - 1e-9) ? 'sold_part' : p.balance > first * (1 + 1e-9) ? 'added' : 'holding';
      if (status === 'sold_all') summary.soldAll++;
      else if (status === 'sold_part') summary.soldPart++;
      else if (status === 'added') summary.added++;
      else summary.holding++;
      const holdRate = p.balance / t.totalSupply;
      summary.holdRateTotal += holdRate;
      buyers.push({
        rank: i + 1,
        wallet: a,
        walletTags: viewerTags(this.ctx, viewer, t.chain, a, mergeTags(cohorts.tags(a, w), this.walletTagsOf(w))),
        walletLabel: viewerLabel(this.ctx, viewer, t.chain, a, w.label),
        firstBuyAt: p.firstBuyAt,
        block: world.blockAt(t.chain, p.firstBuyAt),
        boughtUsd: p.boughtUsd,
        boughtTokens: p.boughtTokens,
        balance: p.balance,
        holdRate,
        status,
        realizedPnlUsd: p.realizedPnlUsd,
        unrealizedPnlUsd: p.balance > 0 ? p.balance * priceUsd - p.costBasisUsd : 0,
      });
    }
    return { buyers, summary };
  };

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  /** Cheap identity/market pre-filter on raw state; the summary matcher re-checks everything. */
  private preMatch(t: TokenState, f: TokenFilters | undefined, now: number): boolean {
    if (!f) return true;
    const { world } = this.ctx;
    const priceUsd = world.priceUsd(t);
    return matchIdentityFilters(
      {
        chain: t.chain,
        address: t.address,
        creator: t.creator,
        symbol: t.symbol,
        name: t.name,
        launchpad: t.launchpad,
        createdAt: t.createdAt,
        marketCapUsd: priceUsd * t.totalSupply,
        liquidityUsd: world.liquidityUsd(t),
        holderCount: t.holders.size,
        progress: world.progress(t),
        socials: t.socials,
        boosted: t.boosted,
        isCopycat: t.isCopycat,
      },
      f,
      now,
    );
  }

  private listMatch(t: TokenState, f: TokenFilters | undefined, window: StatWindow, now: number): TokenSummary | null {
    if (f && !this.preMatch(t, f, now)) return null;
    const s = this.summary(t);
    if (f && needsSummary(f) && !matchTokenFilters(s, f, window, now)) return null;
    return s;
  }

  /** `maxLimit` lets the list channels compute a longer shared list (see TokenChannels.publishLists). */
  trenches = (q: TrenchesQuery, maxLimit: number = LIST_LIMITS.max): TrenchesSnapshot => {
    const { world } = this.ctx;
    const now = world.now;
    const chain = q.chain;
    const limit = clampInt(q.limit, LIST_LIMITS.trenches, 1, maxLimit);
    const f = q.filters ?? {};

    const fresh24 = now - DAY_MS;
    const newCol: TokenSummary[] = [];
    const order = world.tokensByChain[chain];
    for (let i = order.length - 1; i >= 0 && newCol.length < limit; i--) {
      const t = world.tokens.get(order[i]);
      if (!t) continue;
      if (t.createdAt < fresh24) break;
      if (t.dormant || t.status !== 'curve' || world.progress(t) >= ALMOST_PROGRESS) continue;
      const s = this.listMatch(t, f.new, '24h', now);
      if (s) newCol.push(s);
    }

    const almostTokens: { t: TokenState; p: number }[] = [];
    for (const addr of this.almost[chain]) {
      const t = world.tokens.get(addr);
      if (!t || t.dormant || t.status === 'migrated') continue;
      const p = world.progress(t);
      if (p < ALMOST_PROGRESS) continue;
      almostTokens.push({ t, p });
    }
    almostTokens.sort((a, b) => b.p - a.p || b.t.createdAt - a.t.createdAt);
    const almostCol: TokenSummary[] = [];
    for (const { t } of almostTokens) {
      if (almostCol.length >= limit) break;
      const s = this.listMatch(t, f.almost, '24h', now);
      if (s) almostCol.push(s);
    }

    const migratedCol = this.migratedList(chain, f.migrated, limit, now);
    return { chain, new: newCol, almost: almostCol, migrated: migratedCol, updatedAt: now };
  };

  private migratedList(chain: ChainId, f: TokenFilters | undefined, limit: number, now: number): TokenSummary[] {
    const { world } = this.ctx;
    const out: TokenSummary[] = [];
    const list = this.migrated[chain];
    for (let i = list.length - 1; i >= 0 && out.length < limit; i--) {
      const t = world.tokens.get(list[i]);
      if (!t || t.status !== 'migrated') continue;
      const s = this.listMatch(t, f, '24h', now);
      if (s) out.push(s);
    }
    return out;
  }

  newPairs = (chain: ChainId, filters: TokenFilters | undefined, limit?: number, maxLimit: number = LIST_LIMITS.max): TokenSummary[] => {
    return this.migratedList(chain, filters, clampInt(limit, LIST_LIMITS.newpairs, 1, maxLimit), this.ctx.world.now);
  };

  trending = (q: TrendingQuery, maxLimit: number = LIST_LIMITS.max): TrendingSnapshot => {
    const { world } = this.ctx;
    const now = world.now;
    const window: StatWindow = q.window ?? '1h';
    const sort: TrendingSort = q.sort ?? 'hot';
    const asc = q.order === 'asc';
    const limit = clampInt(q.limit, LIST_LIMITS.trending, 1, maxLimit);
    const since = now - WINDOW_MS[window];
    const rows: { s: TokenSummary; key: number; hot: number }[] = [];
    for (const addr of this.active[q.chain]) {
      const t = world.tokens.get(addr);
      if (!t || t.dormant || t.lastTradeAt < since) continue;
      const s = this.listMatch(t, q.filters, window, now);
      if (!s) continue;
      const hot = this.hotScoreOf(t, window);
      rows.push({ s, key: sort === 'hot' ? hot : this.sortValue(s, sort, window, now), hot });
    }
    rows.sort((a, b) => (asc ? a.key - b.key : b.key - a.key) || b.hot - a.hot || b.s.createdAt - a.s.createdAt);
    return { chain: q.chain, window, tokens: rows.slice(0, limit).map((r) => r.s), updatedAt: now };
  };

  /** Sort value for TrendingSort keys. `age` is now - createdAt (desc = oldest first). */
  private sortValue(s: TokenSummary, sort: TrendingSort, window: StatWindow, now: number): number {
    const w = s.stats[window];
    switch (sort) {
      case 'volume':
        return w.volumeUsd;
      case 'swaps':
        return w.swaps;
      case 'priceChange':
        return w.priceChange;
      case 'marketCap':
        return s.marketCapUsd;
      case 'liquidity':
        return s.liquidityUsd;
      case 'holders':
        return s.holderCount;
      case 'age':
        return now - s.createdAt;
      case 'smartDegenCount':
        return s.smartDegenCount;
      case 'kolCount':
        return s.kolCount;
      case 'netBuy':
        return s.netBuy24hUsd;
      default:
        return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Narratives
  // -------------------------------------------------------------------------

  narratives = (chain: ChainId): Narrative[] => {
    const { world } = this.ctx;
    const now = world.now;
    const hit = this.narrativeCache.get(chain);
    if (hit && now >= hit.at && now - hit.at < NARRATIVE_TTL_MS) return hit.value;

    interface Group {
      name: string;
      count: number;
      vol1h: number;
      vol24h: number;
      mcap: number;
      chgNum: number;
      chgDen: number;
      glyphs: Map<string, number>;
      top: { t: TokenState; vol1h: number }[];
    }
    const groups = new Map<string, Group>();
    const seen = new Set<string>();
    const visit = (t: TokenState) => {
      if (seen.has(t.address)) return;
      seen.add(t.address);
      if (t.dormant || !t.narrative) return;
      const priceUsd = world.priceUsd(t);
      let vol1h = 0;
      let vol24h = 0;
      let chg1h = 0;
      if (now - t.lastTradeAt <= DAY_MS) {
        const cs = this.caches.get(t.address)?.summary;
        if (cs && now >= cs.at && now - cs.at < 30_000) {
          vol1h = cs.value.stats['1h'].volumeUsd;
          vol24h = cs.value.stats['24h'].volumeUsd;
          chg1h = cs.value.stats['1h'].priceChange;
        } else {
          vol24h = volumeIn(t, DAY_MS, now);
          vol1h = now - t.lastTradeAt <= 3600_000 ? volumeIn(t, 3600_000, now) : 0;
          chg1h = priceChangeAt(t, 3600_000, now, priceUsd);
        }
      }
      let g = groups.get(t.narrative);
      if (!g) {
        g = { name: t.narrative, count: 0, vol1h: 0, vol24h: 0, mcap: 0, chgNum: 0, chgDen: 0, glyphs: new Map(), top: [] };
        groups.set(t.narrative, g);
      }
      g.count++;
      g.vol1h += vol1h;
      g.vol24h += vol24h;
      g.mcap += priceUsd * t.totalSupply;
      if (vol1h > 0) {
        g.chgNum += chg1h * vol1h;
        g.chgDen += vol1h;
      }
      g.glyphs.set(t.logoGlyph, (g.glyphs.get(t.logoGlyph) ?? 0) + 1);
      // keep top 5 by 1h volume (insertion into a tiny sorted list)
      if (g.top.length < 5 || vol1h > g.top[g.top.length - 1].vol1h) {
        g.top.push({ t, vol1h });
        g.top.sort((a, b) => b.vol1h - a.vol1h || b.t.createdAt - a.t.createdAt);
        if (g.top.length > 5) g.top.pop();
      }
    };
    for (const addr of this.active[chain]) {
      const t = world.tokens.get(addr);
      if (t) visit(t);
    }
    const order = world.tokensByChain[chain];
    for (let i = order.length - 1; i >= 0; i--) {
      const t = world.tokens.get(order[i]);
      if (!t) continue;
      if (t.createdAt < now - DAY_MS) break;
      visit(t);
    }
    let maxVol = 0;
    let maxCount = 0;
    for (const g of groups.values()) {
      if (g.vol1h > maxVol) maxVol = g.vol1h;
      if (g.count > maxCount) maxCount = g.count;
    }
    const out: Narrative[] = [];
    for (const g of groups.values()) {
      let glyph = '';
      let best = -1;
      for (const [k, n] of g.glyphs) if (n > best) [glyph, best] = [k, n];
      const change1h = g.chgDen > 0 ? g.chgNum / g.chgDen : 0;
      out.push({
        id: g.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'other',
        name: g.name,
        glyph,
        tokenCount: g.count,
        volume1hUsd: g.vol1h,
        volume24hUsd: g.vol24h,
        marketCapUsd: g.mcap,
        change1h,
        heat: narrativeHeat(g.vol1h, maxVol, g.count, maxCount, change1h),
        topTokens: g.top.map((x) => this.ref(x.t)),
      });
    }
    out.sort((a, b) => b.heat - a.heat || b.volume1hUsd - a.volume1hUsd);
    this.narrativeCache.set(chain, { at: now, value: out });
    return out;
  };

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  search = (q: string, chain?: ChainId, viewer: Viewer = { accountId: null }): SearchResult => {
    const { world } = this.ctx;
    // Strip control / zero-width / bidi characters, trim, cap length.
    const query = (q ?? '')
      .replace(/[\u0000-\u001f\u007f-\u009f­͏؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g, '')
      .trim()
      .slice(0, 100);
    const result: SearchResult = { tokens: [], wallets: [] };
    if (!query) return result;

    const tokenHits: { t: TokenState; tier: number; cred: number }[] = [];
    // EVM addresses are case-insensitive (generated lower-case); base58 is case-sensitive.
    const addrKey = /^0x[0-9a-fA-F]{40}$/.test(query) ? query.toLowerCase() : query;
    const exactToken = world.tokens.get(addrKey);
    if (exactToken && (!chain || exactToken.chain === chain)) tokenHits.push({ t: exactToken, tier: 4, cred: 0 });

    const term = query.replace(/^\$/, '').toLowerCase();
    if (term && !exactToken) {
      const allowContains = term.length >= 2;
      for (const t of world.tokens.values()) {
        if (chain && t.chain !== chain) continue;
        const s = this.tracks.get(t.address);
        const sym = s ? s.symbolLc : t.symbol.toLowerCase();
        const name = s ? s.nameLc : t.name.toLowerCase();
        let tier = 0;
        if (sym === term) tier = 3;
        else if (name === term) tier = 2;
        else if (sym.startsWith(term) || name.startsWith(term)) tier = 1.5;
        else if (allowContains && (sym.includes(term) || name.includes(term))) tier = 1;
        if (tier === 0) continue;
        const priceUsd = world.priceUsd(t);
        const vol24 = (t.cache.volume24hUsd as number | undefined) ?? 0;
        const cred = searchCredibility(world.liquidityUsd(t), vol24, priceUsd * t.totalSupply, t.holders.size, t.isCopycat) * (t.dormant ? 0.25 : 1);
        tokenHits.push({ t, tier, cred });
      }
    }
    tokenHits.sort((a, b) => b.tier - a.tier || b.cred - a.cred || b.t.createdAt - a.t.createdAt);
    result.tokens = tokenHits.slice(0, 20).map((h) => this.ref(h.t));

    const walletHits: WalletState[] = [];
    const exactWallet = world.wallets.get(addrKey);
    if (exactWallet && (!chain || exactWallet.chain === chain)) walletHits.push(exactWallet);
    if (term.length >= 2) {
      const chains = chain ? [chain] : CHAIN_IDS;
      outer: for (const c of chains) {
        for (const addr of this.labelled[c]) {
          const w = world.wallets.get(addr);
          if (!w || !w.label || w === exactWallet) continue;
          const label = w.label.toLowerCase().replace(/^@/, '');
          if (label.includes(term.replace(/^@/, ''))) {
            walletHits.push(w);
            if (walletHits.length >= 50) break outer;
          }
        }
      }
    }
    // Exact address first, then KOLs, then other labelled wallets, by follower count.
    const exact = walletHits[0] === exactWallet ? walletHits.shift() : undefined;
    walletHits.sort((a, b) => Number(b.tags.has('kol')) - Number(a.tags.has('kol')) || (b.xFollowers ?? 0) - (a.xFollowers ?? 0) || b.followerCount - a.followerCount);
    if (exact) walletHits.unshift(exact);
    result.wallets = walletHits.slice(0, 10).map((w) => ({
      chain: w.chain,
      address: w.address,
      label: viewerLabel(this.ctx, viewer, w.chain, w.address, w.label),
      tags: viewerTags(this.ctx, viewer, w.chain, w.address, this.walletTagsOf(w)),
      avatarSeed: w.address,
    }));
    return result;
  };

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialize(): unknown {
    return { v: 1, tracks: [...this.tracks.values()] };
  }

  restore(data: unknown): void {
    const d = data as { v?: number; tracks?: TokenTrack[] } | null;
    if (!d || d.v !== 1 || !Array.isArray(d.tracks)) return;
    this.tracks.clear();
    for (const s of d.tracks) {
      if (!s || typeof s.address !== 'string') continue;
      // Tracks saved before early buyers were tracked rebuild them from the world.
      if (!Array.isArray(s.earlyBuyers)) {
        const t = this.ctx.world.tokens.get(s.address);
        s.earlyBuyers = [];
        s.earlyTokens = [];
        if (t && !s.gone) backfillEarly(this.ctx.world, s, t);
      }
      this.tracks.set(s.address, s);
    }
    this.caches.clear();
    this.devAggs.clear();
    this.narrativeCache.clear();
    this.reindex();
  }
}
