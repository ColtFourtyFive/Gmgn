// Token-side analytics: summaries/details, security & rug scoring, holders,
// top traders, trade lists, discovery lists (Trenches / Trending / New Pairs),
// narratives and search. Realtime channels live in ./channels.ts and REST
// routes in ./routes.ts.
//
// TokenAnalytics is the facade; each area is its own module over one TokenCore:
//   core.ts        state, list indexes, cached building blocks, sweep, persistence
//   summary.ts     summaries, refs, hot scores, security block and rug inputs
//   detail.ts      token detail, dev info, tokens a wallet created
//   trades.ts      trade lists and the public / viewer forms of a trade
//   holders.ts     holders, top traders, early buyers
//   lists.ts       Trenches, New Pairs, Trending
//   narratives.ts  narratives
//   search.ts      search
// A new feature goes into the module of its area (or a new one) plus a
// delegating member here.
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

import type {
  ChainId,
  DevInfo,
  DevToken,
  EarlyBuyersResponse,
  Narrative,
  Position,
  SearchResult,
  StatWindow,
  TokenDetail,
  TokenFilters,
  TokenRef,
  TokenSecurity,
  TokenSummary,
  Trade,
  TrenchesQuery,
  TrenchesSnapshot,
  TrendingQuery,
  TrendingSnapshot,
  WalletTag,
} from '@trenchscope/shared';
import type { AppContext, Viewer } from '../../context';
import type { TokenState, WalletState } from '../../sim/world';
import { TokenChannels } from './channels';
import { TokenCore } from './core';
import { TokenDetails } from './detail';
import { TokenHolders, type HoldersQuery, type TopTradersQuery } from './holders';
import { LIST_LIMITS, TokenLists } from './lists';
import { TokenNarratives } from './narratives';
import { TokenSearch } from './search';
import type { Cohorts, HolderScan, RugInputs } from './security';
import { TokenSummaries } from './summary';
import type { TokenTrack } from './track';
import { TokenTrades, type TradesQuery } from './trades';

export { SUMMARY_MAX_MS, SUMMARY_MIN_MS } from './core';
export { TRADER_SORTS, type HoldersQuery, type TopTradersQuery, type TraderSort } from './holders';
export { LIST_LIMITS } from './lists';
export { TRADE_FILTERS, type TradeFilter, type TradesQuery } from './trades';

const instances = new WeakMap<AppContext, TokenAnalytics>();

/** The TokenAnalytics instance bound to an app context (routes use the richer option types). */
export function tokenAnalyticsFor(ctx: AppContext): TokenAnalytics | undefined {
  return instances.get(ctx);
}

/** Token-side analytics: summaries/details, security & rug scoring, holders, lists, narratives, search. */
export class TokenAnalytics {
  /** State, indexes and cached building blocks the modules share (./core.ts). */
  private readonly core: TokenCore;
  private readonly tokenSummaries: TokenSummaries;
  private readonly tokenDetails: TokenDetails;
  private readonly tokenTrades: TokenTrades;
  private readonly tokenHolders: TokenHolders;
  private readonly tokenLists: TokenLists;
  private readonly tokenNarratives: TokenNarratives;
  private readonly tokenSearch: TokenSearch;
  readonly channels: TokenChannels;

  constructor(protected ctx: AppContext) {
    instances.set(ctx, this);
    this.core = new TokenCore(ctx, (t) => this.channels.viewerCount(t));
    this.tokenSummaries = new TokenSummaries(this.core);
    this.tokenDetails = new TokenDetails(this.core, this.tokenSummaries);
    this.tokenTrades = new TokenTrades(this.core);
    this.tokenHolders = new TokenHolders(this.core);
    this.tokenLists = new TokenLists(this.core, this.tokenSummaries);
    this.tokenNarratives = new TokenNarratives(this.core, this.tokenSummaries);
    this.tokenSearch = new TokenSearch(this.core, this.tokenSummaries);
    this.channels = new TokenChannels(ctx, this);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  install(): void {
    this.core.install((trade, t) => this.channels.onTrade(trade, t));
    this.channels.install();
  }

  /** Analytics track for a token, created (and back-filled from the trade ring) on first sight. */
  trackOf(t: TokenState, excludeLastTrade = false): TokenTrack {
    return this.core.trackOf(t, excludeLastTrade);
  }

  /** Cohort membership helper for one token (cheap; create one per batch of rows). */
  cohortsFor(t: TokenState): Cohorts {
    return this.core.cohortsFor(t);
  }

  // -------------------------------------------------------------------------
  // Summaries, security, refs (./summary.ts)
  // -------------------------------------------------------------------------

  /** Observable inputs of the rug ratio (exported shape lets tests evaluate the model). */
  rugInputs(t: TokenState, s: TokenTrack, sec: Omit<TokenSecurity, 'checks' | 'rugRatio' | 'riskLevel'>, scan: HolderScan, priceUsd: number, now: number): RugInputs {
    return this.tokenSummaries.rugInputs(t, s, sec, scan, priceUsd, now);
  }

  /** Rug inputs for a token right now (evaluation / debugging helper). */
  currentRugInputs(t: TokenState): RugInputs {
    return this.tokenSummaries.currentRugInputs(t);
  }

  summary = (t: TokenState): TokenSummary => this.tokenSummaries.summary(t);

  /** Hot score for a window, cached alongside the summary it was computed from. */
  hotScoreOf(t: TokenState, window: StatWindow): number {
    return this.tokenSummaries.hotScoreOf(t, window);
  }

  /** The cached summary while at most REF_RISK_MAX_MS old (holder / risk context of feed rows), else a fresh one. */
  recentSummary = (t: TokenState): TokenSummary => this.tokenSummaries.recentSummary(t);

  ref = (t: TokenState): TokenRef => this.tokenSummaries.ref(t);

  // -------------------------------------------------------------------------
  // Detail and dev (./detail.ts)
  // -------------------------------------------------------------------------

  detail = (t: TokenState): TokenDetail => this.tokenDetails.detail(t);

  /** Token version the cached detail reflects (-1 when none); the token channel uses it to avoid stale broadcasts. */
  detailVersion(t: TokenState): number {
    return this.tokenDetails.detailVersion(t);
  }

  devInfo = (t: TokenState): DevInfo => this.tokenDetails.devInfo(t);

  /** Tokens the wallet created that still exist, newest first (default 100, max 500). */
  createdTokens = (w: WalletState, limit?: number): DevToken[] => this.tokenDetails.createdTokens(w, limit);

  // -------------------------------------------------------------------------
  // Trades (./trades.ts)
  // -------------------------------------------------------------------------

  /** Current maker tags of a trade: token-relative cohorts + platform tags (no viewer tags). */
  makerTags(trade: Trade, t?: TokenState, cohorts?: Cohorts): WalletTag[] {
    return this.tokenTrades.makerTags(trade, t, cohorts);
  }

  /** Broadcast form of a trade: refreshed tags, public label, no viewer-relative fields. */
  publicTrade(trade: Trade, t?: TokenState, cohorts?: Cohorts): Trade {
    return this.tokenTrades.publicTrade(trade, t, cohorts);
  }

  viewTrade = (trade: Trade, viewer: Viewer, t?: TokenState, cohorts?: Cohorts): Trade => this.tokenTrades.viewTrade(trade, viewer, t, cohorts);

  trades = (t: TokenState, opts: TradesQuery, viewer: Viewer): Trade[] => this.tokenTrades.trades(t, opts, viewer);

  // -------------------------------------------------------------------------
  // Holders & top traders (./holders.ts)
  // -------------------------------------------------------------------------

  /** Bonding-curve or pool account row (excluded from concentration metrics). */
  venueRow(t: TokenState): Position | null {
    return this.tokenHolders.venueRow(t);
  }

  holders = (t: TokenState, opts: HoldersQuery, viewer: Viewer): Position[] => this.tokenHolders.holders(t, opts, viewer);

  topTraders = (t: TokenState, opts: TopTradersQuery, viewer: Viewer): Position[] => this.tokenHolders.topTraders(t, opts, viewer);

  /**
   * The token's first buyers (tracked at trade time, at most EARLY_BUYERS_LIMIT) with their bags
   * now. Status compares the balance with the wallet's first buy (see EarlyBuyer.status).
   */
  earlyBuyers = (t: TokenState, viewer: Viewer): EarlyBuyersResponse => this.tokenHolders.earlyBuyers(t, viewer);

  // -------------------------------------------------------------------------
  // Lists (./lists.ts)
  // -------------------------------------------------------------------------

  /** `maxLimit` lets the list channels compute a longer shared list (see TokenChannels.publishLists). */
  trenches = (q: TrenchesQuery, maxLimit: number = LIST_LIMITS.max): TrenchesSnapshot => this.tokenLists.trenches(q, maxLimit);

  newPairs = (chain: ChainId, filters: TokenFilters | undefined, limit?: number, maxLimit: number = LIST_LIMITS.max): TokenSummary[] =>
    this.tokenLists.newPairs(chain, filters, limit, maxLimit);

  trending = (q: TrendingQuery, maxLimit: number = LIST_LIMITS.max): TrendingSnapshot => this.tokenLists.trending(q, maxLimit);

  // -------------------------------------------------------------------------
  // Narratives (./narratives.ts) and search (./search.ts)
  // -------------------------------------------------------------------------

  narratives = (chain: ChainId): Narrative[] => this.tokenNarratives.narratives(chain);

  search = (q: string, chain?: ChainId, viewer: Viewer = { accountId: null }): SearchResult => this.tokenSearch.search(q, chain, viewer);

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialize(): unknown {
    return this.core.serialize();
  }

  restore(data: unknown): void {
    this.core.restore(data);
  }
}
