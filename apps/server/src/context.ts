// Application context: the services every module can reach. Modules talk to
// each other only through these interfaces so they can evolve independently.

import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  Account,
  AppNotification,
  CalloutFilter,
  ChainId,
  DevInfo,
  DevToken,
  FeedItem,
  FollowedWallet,
  LeaderboardRow,
  Narrative,
  Position,
  SearchResult,
  Signal,
  TokenDetail,
  TokenFilters,
  TokenPositionRow,
  TokenRef,
  TokenSummary,
  Trade,
  TrenchesQuery,
  TrenchesSnapshot,
  TrendingQuery,
  TrendingSnapshot,
  UserSettings,
  WalletCalls,
  WalletPeriod,
  WalletProfile,
  WalletTag,
  WatchlistItem,
} from '@trenchscope/shared';
import type { Engine } from './sim/engine';
import type { TokenState, WalletState, World } from './sim/world';
import type { Hub } from './ws/hub';

export interface AppConfig {
  port: number;
  host: string;
  /** Directory for snapshots. */
  dataDir: string;
  seed: string;
  /** Minutes of history to fast-forward at boot when no snapshot exists. */
  warmupMinutes: number;
  /** Persist snapshots periodically (ms); 0 disables. */
  snapshotEveryMs: number;
  /** Serve the built web app from this directory if it exists. */
  webDist: string | null;
  /** Trust X-Forwarded-For (deployments behind a reverse proxy). */
  trustProxy: boolean;
  /** Max guest/register calls per client IP per 10 minutes (0 disables). */
  accountCreationsPerIpPer10Min: number;
}

/** Viewer context for viewer-relative fields (following / you tags, remarks). */
export interface Viewer {
  accountId: string | null;
}

export interface AccountsApi {
  /** Session token -> account id. */
  resolveToken(token: string): string | null;
  getAccount(accountId: string): Account | null;
  /** The account's paper wallet on a chain (a WalletState with archetype 'user'). */
  walletFor(accountId: string, chain: ChainId): WalletState;
  /** Reverse lookup: which account owns this wallet address. */
  accountIdForWallet(address: string): string | null;
  getSettings(accountId: string): UserSettings;
  isFollowing(accountId: string, chain: ChainId, address: string): boolean;
  remarkFor(accountId: string, chain: ChainId, address: string): string | null;
  followedWallets(accountId: string, chain?: ChainId): FollowedWallet[];
  /** Accounts following a wallet (for notify-on-trade). */
  followersOf(chain: ChainId, address: string): string[];
  followerCount(chain: ChainId, address: string): number;
  watchlist(accountId: string): WatchlistItem[];
  /** Create + push a notification on the user channel. */
  notify(accountId: string, n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification;
  /** Record a fee-paying trade for rewards/referrals. */
  recordTradeVolume(accountId: string, volumeUsd: number, platformFeeUsd: number): void;
  /** Push current native balance of a wallet to its owner. */
  pushBalance(accountId: string, chain: ChainId): void;
  serialize(): unknown;
  restore(data: unknown): void;
}

export interface AnalyticsApi {
  tokenSummary(t: TokenState): TokenSummary;
  tokenRef(t: TokenState): TokenRef;
  tokenDetail(t: TokenState): TokenDetail;
  devInfo(t: TokenState): DevInfo;
  /** Viewer-aware copy of a trade's tags (adds following / you). */
  viewTrade(trade: Trade, viewer: Viewer): Trade;
  trades(t: TokenState, opts: { filter?: string; wallet?: string; minUsd?: number; limit?: number; before?: number }, viewer: Viewer): Trade[];
  holders(t: TokenState, opts: { tag?: string; limit?: number }, viewer: Viewer): Position[];
  topTraders(t: TokenState, opts: { tag?: string; sort?: string; order?: 'asc' | 'desc'; limit?: number }, viewer: Viewer): Position[];
  trenches(q: TrenchesQuery): TrenchesSnapshot;
  trending(q: TrendingQuery): TrendingSnapshot;
  newPairs(chain: ChainId, filters: TokenFilters | undefined, limit?: number): TokenSummary[];
  walletProfile(w: WalletState, viewer: Viewer): WalletProfile;
  walletHoldings(w: WalletState, opts: { includeClosed?: boolean; sort?: string; limit?: number }, viewer: Viewer): TokenPositionRow[];
  walletActivity(w: WalletState, opts: { limit?: number; before?: number; type?: string }, viewer: Viewer): FeedItem[];
  /** Tokens the wallet created that still exist, newest first. */
  createdTokens(w: WalletState, limit?: number): DevToken[];
  /** The wallet's kol_call signals with hit rates. */
  walletCalls(w: WalletState, limit?: number): WalletCalls;
  leaderboard(chain: ChainId, opts: { tag?: string; period?: WalletPeriod; sort?: string; order?: 'asc' | 'desc'; limit?: number }, viewer: Viewer): LeaderboardRow[];
  feed(chain: ChainId, kind: 'smart' | 'kol' | 'follow' | 'all', limit: number, viewer: Viewer): FeedItem[];
  signals(chain: ChainId, opts: { kind?: string; limit?: number }): Signal[];
  /** Global call-out feed: kol_call signals newest first. */
  callouts(chain: ChainId, filter: CalloutFilter, limit?: number): Signal[];
  narratives(chain: ChainId): Narrative[];
  search(q: string, chain?: ChainId): SearchResult;
  /** Platform tags of a wallet (smart, kol, ...). */
  walletTags(w: WalletState): WalletTag[];
  serialize(): unknown;
  restore(data: unknown): void;
}

export interface TradingApi {
  serialize(): unknown;
  restore(data: unknown): void;
}

export interface MarketApi {
  /** Have the simulated market trade a user's launch like its own (call after the creation-block buys). */
  adopt(t: TokenState): void;
}

export interface AppContext {
  config: AppConfig;
  world: World;
  engine: Engine;
  hub: Hub;
  accounts: AccountsApi;
  analytics: AnalyticsApi;
  trading: TradingApi;
  market: MarketApi;
}

// ---------------------------------------------------------------------------
// HTTP helpers shared by route modules
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return null;
}

/** Account id of the caller, or null for anonymous requests. */
export function optionalAccount(ctx: AppContext, req: FastifyRequest): string | null {
  const token = bearerToken(req);
  return token ? ctx.accounts.resolveToken(token) : null;
}

/** Account id of the caller; throws 401 when missing. */
export function requireAccount(ctx: AppContext, req: FastifyRequest): string {
  const id = optionalAccount(ctx, req);
  if (!id) throw new HttpError(401, 'sign in required', 'unauthorized');
  return id;
}

export function viewerOf(ctx: AppContext, req: FastifyRequest): Viewer {
  return { accountId: optionalAccount(ctx, req) };
}

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, code: err.code });
  const message = err instanceof Error ? err.message : 'internal error';
  return reply.status(500).send({ error: message });
}
