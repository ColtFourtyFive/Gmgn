// Application context: the services every module can reach. Modules talk to
// each other only through these interfaces so they can evolve independently.

import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  Account,
  AppMode,
  LiveStatus,
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
  WalletRiskReport,
  WalletTag,
  WalletTransfer,
  WatchlistItem,
} from '@trenchscope/shared';
import type { Connection, VersionedTransaction } from '@solana/web3.js';
import type { LiveConfig } from './live/config';
import type { Engine } from './sim/engine';
import type { ScenarioId } from './sim/scenarios';
import type { TokenState, WalletState, World } from './sim/world';
import type { Hub } from './ws/hub';

export interface AppConfig {
  /** live = real Solana data and trading; demo = the market simulator with paper balances. */
  mode: AppMode;
  /** Live-mode settings (null in demo mode). */
  live: LiveConfig | null;
  /** Reasons live features are disabled (missing credentials), surfaced in live status. */
  liveProblems: string[];
  /** Public URL of the other deployment (the demo site, from live mode), shown in the UI. */
  demoUrl: string | null;
  port: number;
  host: string;
  /** Directory for snapshots. */
  dataDir: string;
  seed: string;
  /** Demo mode: simulator scenario preset (SIM_SCENARIO, sim/scenarios.ts); absent = normal. */
  simScenario?: ScenarioId;
  /** Minutes of history to fast-forward at boot when no snapshot exists. */
  warmupMinutes: number;
  /** Persist snapshots periodically (ms); 0 disables. */
  snapshotEveryMs: number;
  /** Serve the built web app from this directory if it exists. */
  webDist: string | null;
  /**
   * Trust X-Forwarded-For from this many reverse proxies in front of the server (true = 1; false / 0 =
   * off): the client address is the entry the outermost trusted proxy appended.
   */
  trustProxy: boolean | number;
  /** Max guest/register calls per client IP per 10 minutes (0 disables). */
  accountCreationsPerIpPer10Min: number;
  /** Max login calls per client IP per 10 minutes, whatever the username (0 disables). */
  loginAttemptsPerIpPer10Min: number;
  /** Max concurrent WebSocket connections per client IP (0 disables). */
  wsConnectionsPerIp: number;
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
  /** Every wallet some account follows on a chain (live mode streams their trades). */
  watchedWallets(chain: ChainId): Set<string>;
  watchlist(accountId: string): WatchlistItem[];
  /** Create + push a notification on the user channel. */
  notify(accountId: string, n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification;
  /** Record a fee-paying trade for rewards/referrals. */
  recordTradeVolume(accountId: string, volumeUsd: number, platformFeeUsd: number): void;
  /** Push current native balance of a wallet to its owner. */
  pushBalance(accountId: string, chain: ChainId): void;
  /** Live mode: the embedded wallet behind an account's chain wallet (null in demo mode or before provisioning). */
  walletRef(accountId: string, chain: ChainId): EmbeddedWalletRef | null;
  /** Whether the account has a second factor (TOTP) enabled. */
  hasSecondFactor(accountId: string): boolean;
  /** Check a TOTP code for a sensitive action (withdrawals, whitelist changes); false when 2FA is off or the code is wrong. */
  verifySecondFactor(accountId: string, code: string): boolean;
  /** Whether `address` is a whitelisted withdrawal destination of the account, past its activation delay. */
  canWithdrawTo(accountId: string, chain: ChainId, address: string): boolean;
  /** Durable, append-only audit record of a security- or money-relevant action. */
  audit(accountId: string | null, action: string, detail: Record<string, unknown>): void;
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
  trades(t: TokenState, opts: { filter?: string; wallet?: string; minUsd?: number; limit?: number; before?: number; beforeId?: string }, viewer: Viewer): Trade[];
  holders(t: TokenState, opts: { tag?: string; limit?: number }, viewer: Viewer): Position[];
  topTraders(t: TokenState, opts: { tag?: string; sort?: string; order?: 'asc' | 'desc'; limit?: number }, viewer: Viewer): Position[];
  trenches(q: TrenchesQuery): TrenchesSnapshot;
  trending(q: TrendingQuery): TrendingSnapshot;
  newPairs(chain: ChainId, filters: TokenFilters | undefined, limit?: number): TokenSummary[];
  walletProfile(w: WalletState, viewer: Viewer): WalletProfile;
  walletHoldings(w: WalletState, opts: { includeClosed?: boolean; sort?: string; limit?: number }, viewer: Viewer): TokenPositionRow[];
  walletActivity(w: WalletState, opts: { limit?: number; before?: number; beforeId?: string; type?: string }, viewer: Viewer): FeedItem[];
  /** Tokens the wallet created that still exist, newest first. */
  createdTokens(w: WalletState, limit?: number): DevToken[];
  /** The wallet's kol_call signals with hit rates. */
  walletCalls(w: WalletState, limit?: number): WalletCalls;
  /** Risk check flags (address poisoning, wash trading, flagged funder, ...). */
  walletRisk(w: WalletState): WalletRiskReport;
  leaderboard(chain: ChainId, opts: { tag?: string; period?: WalletPeriod; sort?: string; order?: 'asc' | 'desc'; limit?: number }, viewer: Viewer): LeaderboardRow[];
  feed(chain: ChainId, kind: 'smart' | 'kol' | 'follow' | 'all', limit: number, viewer: Viewer): FeedItem[];
  signals(chain: ChainId, opts: { kind?: string; limit?: number; quality?: boolean; before?: number }): Signal[];
  /** One token's signals newest first (chart markers). */
  tokenSignals(t: TokenState, limit?: number): Signal[];
  /** Every signal fired once the engine is live (never during warmup); returns an unsubscribe. */
  onSignal(listener: (signal: Signal) => void): () => void;
  /** Global call-out feed: kol_call signals newest first. */
  callouts(chain: ChainId, filter: CalloutFilter, limit?: number): Signal[];
  narratives(chain: ChainId): Narrative[];
  /** Wallet hits carry the viewer's 'you' / 'following' tags and remark label. */
  search(q: string, chain: ChainId | undefined, viewer: Viewer): SearchResult;
  /** Platform tags of a wallet (smart, kol, ...). */
  walletTags(w: WalletState): WalletTag[];
  serialize(): unknown;
  restore(data: unknown): void;
}

export interface TradingApi {
  serialize(): unknown;
  restore(data: unknown): void;
  /** Whether anything still runs for the account: open orders, copy-trade / sniper tasks, alerts. */
  hasAutomation(accountId: string): boolean;
  /** Drop the stored order history and equity series of a deleted account. */
  forgetAccount(accountId: string): void;
  /** Wallets automation depends on (copy-trade leaders, wallet alerts); live mode streams their trades. */
  watchedWallets(chain: ChainId): Set<string>;
}

export interface MarketApi {
  /** Have the simulated market trade a user's launch like its own (call after the creation-block buys). */
  adopt(t: TokenState): void;
}

/**
 * Where market state comes from: the simulator (demo) or the live chain feed.
 * Both write into the same World ledger, so analytics and trading are shared.
 */
export interface MarketSource extends MarketApi {
  readonly mode: AppMode;
  /** Register tickers and listeners (before any module restores state). */
  install(): void;
  /** Fresh start without a snapshot: seed + warm up (demo) or nothing to do (live). */
  bootstrap(): void;
  /** Start real-time sources (live feed connections); the simulator runs on engine ticks. */
  start(): void;
  /** Close real-time sources. */
  stop(): Promise<void>;
  /** Health of the live stack (null in demo mode). */
  liveStatus(): LiveStatus | null;
  serialize(): unknown;
  restore(data: unknown): void;
}

/** An account's embedded wallet held by the key-management provider (never a raw key). */
export interface EmbeddedWalletRef {
  chain: ChainId;
  address: string;
  /** Provider that holds the key ('turnkey', or 'local-dev' in development). */
  provider: string;
  /** Provider-side identifier (e.g. Turnkey wallet / sub-organization id). */
  providerWalletId: string;
}

/** Signs for embedded wallets; the platform never sees private keys (local-dev excepted). */
export interface SignerApi {
  readonly provider: string;
  /** Provision a new wallet for an account. */
  createWallet(accountId: string, chain: ChainId): Promise<EmbeddedWalletRef>;
  /** Sign a transaction with the wallet (the provider enforces its signing policies). */
  signTransaction(ref: EmbeddedWalletRef, tx: VersionedTransaction): Promise<VersionedTransaction>;
}

/** Live-mode services shared by the live market, trading and accounts (null in demo mode). */
export interface LiveServices {
  config: LiveConfig;
  /** Solana RPC (null when SOLANA_RPC_URL is unset). */
  connection: Connection | null;
  /** Embedded-wallet signer (null when no provider is configured). */
  signer: SignerApi | null;
}

/** An append-only audit entry (security- and money-relevant actions). */
export interface AuditRecord {
  at: number;
  accountId: string | null;
  action: string;
  ip: string | null;
  detail: Record<string, unknown>;
}

/** A confirmed on-chain swap of an account (live mode), the durable source of cost basis. */
export interface LiveFillRecord {
  accountId: string;
  chain: ChainId;
  signature: string;
  token: string;
  side: 'buy' | 'sell';
  /** SOL that went into (buy) or came out of (sell) the swap, fees excluded. */
  nativeAmount: number;
  tokenAmount: number;
  platformFee: number;
  /** Base + priority fee + tip (SOL). */
  networkFee: number;
  priceUsd: number;
  at: number;
  /** What placed it: manual, order, copy, sniper. */
  source: string;
  /** Venue path: jupiter, pump, pump-amm. */
  route: string;
}

/**
 * Durable storage for live mode (SQLite): module state blobs plus append-only
 * money and audit records. Writes are synchronous and durable on return.
 */
export interface DurableStore {
  /** Latest saved state blob of a module ('accounts', 'trading', ...), or null. */
  getState(key: string): unknown;
  putState(key: string, value: unknown): void;
  appendAudit(rec: AuditRecord): void;
  /** Newest first. */
  auditFor(accountId: string, limit: number): AuditRecord[];
  /** False (and nothing written) when (accountId, signature) is already recorded. */
  appendFill(fill: LiveFillRecord): boolean;
  /** Newest first. */
  fillsFor(accountId: string, opts: { token?: string; limit: number }): LiveFillRecord[];
  /** Insert or update a deposit / withdrawal by its id. */
  upsertTransfer(accountId: string, t: WalletTransfer, clientId?: string): void;
  /** Newest first. */
  transfersFor(accountId: string, limit: number): WalletTransfer[];
  /** A withdrawal by its client idempotency key. */
  transferByClientId(accountId: string, clientId: string): WalletTransfer | null;
  /** Transfers not yet final (pending / sent), to resume confirmation after a restart. */
  openTransfers(): { accountId: string; transfer: WalletTransfer }[];
  close(): void;
}

export interface AppContext {
  config: AppConfig;
  world: World;
  engine: Engine;
  hub: Hub;
  accounts: AccountsApi;
  analytics: AnalyticsApi;
  trading: TradingApi;
  market: MarketSource;
  /** Live-mode services; null in demo mode. */
  live: LiveServices | null;
  /** Durable store (live mode); null in demo mode, which persists through snapshots only. */
  store: DurableStore | null;
}

// ---------------------------------------------------------------------------
// HTTP helpers shared by route modules
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /** Extra response headers, e.g. retry-after on a 429. */
    public headers?: Record<string, string>,
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
  if (err instanceof HttpError) {
    if (err.headers) reply.headers(err.headers);
    return reply.status(err.status).send({ error: err.message, code: err.code });
  }
  const message = err instanceof Error ? err.message : 'internal error';
  return reply.status(500).send({ error: message });
}
