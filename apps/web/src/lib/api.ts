// Typed REST client for the Trenchscope API (see docs/API.md).

import type {
  Account,
  AlertRule,
  AppNotification,
  AuthResponse,
  Blacklist,
  BlacklistKind,
  CalloutFilter,
  CandleResponse,
  ChainId,
  CopyTradeTask,
  CreateOrderRequest,
  DepositInfo,
  DevInfo,
  DevToken,
  EarlyBuyersResponse,
  FeedItem,
  FollowedWallet,
  LaunchConfig,
  LaunchRequest,
  LaunchResponse,
  LeaderboardRow,
  MetaResponse,
  Narrative,
  Order,
  PortfolioCalendar,
  PortfolioSummary,
  Position,
  Quote,
  QuoteRequest,
  Resolution,
  RewardsSummary,
  SearchResult,
  SecurityStatus,
  SellInitialsQuote,
  SellInitialsRequest,
  Signal,
  SniperTask,
  StatWindow,
  SwapReceipt,
  SwapRequest,
  TokenDetail,
  TokenFilters,
  TokenPositionRow,
  TokenSummary,
  TotpEnableResponse,
  TotpSetup,
  Trade,
  TrenchesColumn,
  TrenchesSnapshot,
  TrendingSnapshot,
  TrendingSort,
  UserSettings,
  UserWallet,
  WalletCalls,
  WalletPeriod,
  WalletProfile,
  WalletRiskReport,
  WalletTransfer,
  WatchlistGroup,
  WatchlistItem,
  WatchlistResponse,
  WhitelistEntry,
  WithdrawRequest,
} from '@trenchscope/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | undefined | null | object>;

function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** 401 codes that reject one request's credentials, not the session: a wrong password, a missing or wrong 2FA code. */
const NOT_SESSION_401 = new Set(['invalid_credentials', 'totp_required']);

/**
 * A 401 means the session is gone (expired or revoked: `unauthorized`) only
 * when the request carried the session that is still current. /auth/* calls
 * answer 401 for their own reasons (a wrong password is `invalid_credentials`),
 * live withdrawals and security changes answer 401 `totp_required` for a
 * wrong two-factor code, and an answer to a token that was already replaced
 * says nothing about the new one; none of these may sign the user out.
 */
export function isSessionExpiry(status: number, path: string, sentToken: string | null, currentToken: string | null, code?: string): boolean {
  return status === 401 && sentToken !== null && sentToken === currentToken && !path.startsWith('/auth/') && !(code !== undefined && NOT_SESSION_401.has(code));
}

export async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const sentToken = authToken;
  if (sentToken) headers.authorization = `Bearer ${sentToken}`;
  const res = await fetch(`/api${path}${qs(opts.query)}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string };
    if (isSessionExpiry(res.status, path, sentToken, authToken, err.code)) onUnauthorized?.();
    // The API always answers with a JSON body; a bare 5xx comes from a proxy that cannot reach it.
    if (res.status >= 500 && (!text || err.error === text)) {
      throw new ApiError(res.status, 'Server unreachable — retrying shortly', 'unreachable');
    }
    throw new ApiError(res.status, err.error ?? res.statusText, err.code);
  }
  return data as T;
}

const get = <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal });
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} });
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, { body });
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, { body });
const del = <T>(path: string, query?: Query) => request<T>('DELETE', path, { query });

export const api = {
  // meta
  meta: () => get<MetaResponse>('/meta'),
  search: (q: string, chain?: ChainId, signal?: AbortSignal) => get<SearchResult>('/search', { q, chain }, signal),

  // market (lists use the POST twins: merged blacklists can outgrow a URL)
  trenches: (chain: ChainId, filters?: Partial<Record<TrenchesColumn, TokenFilters>>, limit?: number) =>
    post<TrenchesSnapshot>(`/${chain}/trenches`, { filters, limit }),
  trending: (chain: ChainId, q: { window: StatWindow; sort?: TrendingSort; order?: 'asc' | 'desc'; filters?: TokenFilters; limit?: number }) =>
    post<TrendingSnapshot>(`/${chain}/trending`, q),
  newPairs: (chain: ChainId, filters?: TokenFilters, limit?: number) => post<TokenSummary[]>(`/${chain}/new-pairs`, { filters, limit }),
  token: (chain: ChainId, address: string) => get<TokenDetail>(`/${chain}/tokens/${address}`),
  candles: (chain: ChainId, address: string, resolution: Resolution, limit?: number) =>
    get<CandleResponse>(`/${chain}/tokens/${address}/candles`, { resolution, limit }),
  trades: (chain: ChainId, address: string, q: { filter?: string; wallet?: string; minUsd?: number; limit?: number; before?: number } = {}) =>
    get<Trade[]>(`/${chain}/tokens/${address}/trades`, q),
  holders: (chain: ChainId, address: string, q: { tag?: string; limit?: number } = {}) => get<Position[]>(`/${chain}/tokens/${address}/holders`, q),
  topTraders: (chain: ChainId, address: string, q: { tag?: string; sort?: string; order?: 'asc' | 'desc'; limit?: number } = {}) =>
    get<Position[]>(`/${chain}/tokens/${address}/top-traders`, q),
  earlyBuyers: (chain: ChainId, address: string) => get<EarlyBuyersResponse>(`/${chain}/tokens/${address}/early-buyers`),
  dev: (chain: ChainId, address: string) => get<DevInfo>(`/${chain}/tokens/${address}/dev`),
  tokenSignals: (chain: ChainId, address: string, limit?: number) => get<Signal[]>(`/${chain}/tokens/${address}/signals`, { limit }),
  wallet: (chain: ChainId, address: string) => get<WalletProfile>(`/${chain}/wallets/${address}`),
  walletHoldings: (chain: ChainId, address: string, q: { includeClosed?: boolean; sort?: string; limit?: number } = {}) =>
    get<TokenPositionRow[]>(`/${chain}/wallets/${address}/holdings`, { ...q, includeClosed: q.includeClosed ? 1 : undefined }),
  walletActivity: (chain: ChainId, address: string, q: { type?: string; limit?: number; before?: number } = {}) =>
    get<FeedItem[]>(`/${chain}/wallets/${address}/activity`, q),
  walletCreatedTokens: (chain: ChainId, address: string, limit?: number) => get<DevToken[]>(`/${chain}/wallets/${address}/created-tokens`, { limit }),
  walletCalls: (chain: ChainId, address: string, limit?: number) => get<WalletCalls>(`/${chain}/wallets/${address}/calls`, { limit }),
  walletRisk: (chain: ChainId, address: string) => get<WalletRiskReport>(`/${chain}/wallets/${address}/risk`),
  leaderboard: (chain: ChainId, q: { tag?: string; period?: WalletPeriod; sort?: string; order?: 'asc' | 'desc'; limit?: number } = {}) =>
    get<LeaderboardRow[]>(`/${chain}/leaderboard`, q),
  feed: (chain: ChainId, kind: 'smart' | 'kol' | 'follow' | 'all', limit?: number) => get<FeedItem[]>(`/${chain}/feed`, { kind, limit }),
  signals: (chain: ChainId, q: { kind?: string; limit?: number } = {}) => get<Signal[]>(`/${chain}/signals`, q),
  callouts: (chain: ChainId, filter: CalloutFilter = 'all', limit?: number) => get<Signal[]>(`/${chain}/callouts`, { filter, limit }),
  narratives: (chain: ChainId) => get<Narrative[]>(`/${chain}/narratives`),

  // accounts
  guest: (referralCode?: string) => post<AuthResponse>('/auth/guest', { referralCode }),
  register: (username: string, password: string, referralCode?: string) => post<AuthResponse>('/auth/register', { username, password, referralCode }),
  /** `code`: the 6-digit TOTP code, sent on the second step after a 401 'totp_required' (live accounts with 2FA). */
  login: (username: string, password: string, code?: string) => post<AuthResponse>('/auth/login', { username, password, code }),
  logout: () => post<{ ok: true }>('/auth/logout'),
  /** Live: every session is signed out and a fresh one returned. `code`: the TOTP code when 2FA is on. */
  changePassword: (body: { currentPassword: string; newPassword: string; code?: string }) => post<AuthResponse>('/auth/password', body),
  me: () => get<Account>('/me'),
  settings: () => get<UserSettings>('/settings'),
  updateSettings: (patchBody: DeepPartial<UserSettings>) => put<UserSettings>('/settings', patchBody),
  faucet: (chain: ChainId) => post<UserWallet>('/wallet/faucet', { chain }),
  follows: (chain?: ChainId) => get<FollowedWallet[]>('/follows', { chain }),
  follow: (body: { chain: ChainId; address: string; remark?: string; group?: string; notify?: boolean }) => post<FollowedWallet>('/follows', body),
  updateFollow: (chain: ChainId, address: string, body: { remark?: string; group?: string; notify?: boolean }) =>
    patch<FollowedWallet>(`/follows/${chain}/${address}`, body),
  unfollow: (chain: ChainId, address: string) => del<{ ok: true }>(`/follows/${chain}/${address}`),
  watchlist: () => get<WatchlistResponse>('/watchlist'),
  addWatch: (chain: ChainId, address: string, body: WatchItemPatch = {}) => post<WatchlistItem>('/watchlist', { chain, address, ...body }),
  updateWatch: (chain: ChainId, address: string, body: WatchItemPatch) => patch<WatchlistItem>(`/watchlist/${chain}/${address}`, body),
  removeWatch: (chain: ChainId, address: string) => del<{ ok: true }>(`/watchlist/${chain}/${address}`),
  createWatchGroup: (body: { name: string; color?: string }) => post<WatchlistGroup>('/watchlist/groups', body),
  updateWatchGroup: (id: string, body: { name?: string; color?: string | null; order?: number }) => patch<WatchlistGroup>(`/watchlist/groups/${id}`, body),
  deleteWatchGroup: (id: string) => del<{ ok: true }>(`/watchlist/groups/${id}`),
  blacklist: () => get<Blacklist>('/blacklist'),
  addBlacklist: (body: { kind: BlacklistKind; chain?: ChainId; value: string }) => post<Blacklist>('/blacklist', body),
  removeBlacklist: (kind: BlacklistKind, value: string, chain?: ChainId) => del<Blacklist>(`/blacklist/${kind}/${encodeURIComponent(value)}`, { chain }),
  notifications: (limit?: number) => get<AppNotification[]>('/notifications', { limit }),
  markRead: (ids?: string[]) => post<{ ok: true }>('/notifications/read', { ids }),
  rewards: () => get<RewardsSummary>('/rewards'),

  // trading
  quote: (body: QuoteRequest) => post<Quote>('/trade/quote', body),
  swap: (body: SwapRequest) => post<SwapReceipt>('/trade/swap', body),
  sellInitials: (body: SellInitialsRequest) => post<SellInitialsQuote>('/trade/initials', body),
  orders: (q: { status?: 'open' | 'history'; chain?: ChainId; token?: string } = {}) => get<Order[]>('/orders', q),
  createOrder: (body: CreateOrderRequest) => post<Order>('/orders', body),
  cancelOrder: (id: string) => del<Order>(`/orders/${id}`),
  portfolio: (chain: ChainId | 'all' = 'all') => get<PortfolioSummary>('/portfolio', { chain }),
  portfolioActivity: (q: { chain?: ChainId; limit?: number } = {}) => get<FeedItem[]>('/portfolio/activity', q),
  portfolioCalendar: (chain: ChainId | 'all' = 'all') => get<PortfolioCalendar>('/portfolio/calendar', { chain }),
  copyTasks: () => get<CopyTradeTask[]>('/copytrade'),
  createCopyTask: (body: Omit<CopyTradeTask, 'id' | 'createdAt' | 'stats'>) => post<CopyTradeTask>('/copytrade', body),
  updateCopyTask: (id: string, body: Partial<CopyTradeTask>) => patch<CopyTradeTask>(`/copytrade/${id}`, body),
  deleteCopyTask: (id: string) => del<{ ok: true }>(`/copytrade/${id}`),
  sniperTasks: () => get<SniperTask[]>('/sniper'),
  createSniperTask: (body: Omit<SniperTask, 'id' | 'createdAt' | 'buysDone' | 'lastTriggeredAt'>) => post<SniperTask>('/sniper', body),
  updateSniperTask: (id: string, body: Partial<SniperTask>) => patch<SniperTask>(`/sniper/${id}`, body),
  deleteSniperTask: (id: string) => del<{ ok: true }>(`/sniper/${id}`),
  alerts: () => get<AlertRule[]>('/alerts'),
  createAlert: (body: Omit<AlertRule, 'id' | 'createdAt' | 'lastTriggeredAt'>) => post<AlertRule>('/alerts', body),
  updateAlert: (id: string, body: Partial<AlertRule>) => patch<AlertRule>(`/alerts/${id}`, body),
  deleteAlert: (id: string) => del<{ ok: true }>(`/alerts/${id}`),

  // token launch
  launchConfig: () => get<LaunchConfig>('/launch/config'),
  launch: (body: LaunchRequest) => post<LaunchResponse>('/launch', body),

  // live mode: funding, withdrawals and account security (see the contract in packages/shared/src/types.ts)
  depositInfo: (chain: ChainId) => get<DepositInfo>('/wallet/deposit', { chain }),
  transfers: (limit?: number) => get<WalletTransfer[]>('/wallet/transfers', { limit }),
  withdraw: (body: WithdrawRequest) => post<WalletTransfer>('/wallet/withdraw', body),
  refreshWallet: (chain: ChainId) => post<UserWallet>('/wallet/refresh', { chain }),
  security: () => get<SecurityStatus>('/security'),
  setupTotp: () => post<TotpSetup>('/security/2fa/setup'),
  enableTotp: (code: string) => post<TotpEnableResponse>('/security/2fa/enable', { code }),
  disableTotp: (code: string) => post<{ enabled: false }>('/security/2fa/disable', { code }),
  addWhitelist: (body: { chain: ChainId; address: string; label: string; code: string }) => post<WhitelistEntry>('/security/whitelist', body),
  removeWhitelist: (body: { chain: ChainId; address: string; code: string }) => post<{ ok: true }>('/security/whitelist/remove', body),
};

/** Watchlist item fields set on add or PATCH (an empty list / blank note removes them). */
export interface WatchItemPatch {
  groupIds?: string[];
  note?: string;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
