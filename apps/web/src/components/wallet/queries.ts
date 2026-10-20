// React-query keys and hooks for wallet analytics (profile, holdings,
// activity, created tokens, calls, risk check, leaderboard). Profiles share the
// ['wallet-profile', chain, address] key with the account pages' previews.

import { useQuery } from '@tanstack/react-query';
import type { ChainId, WalletPeriod } from '@trenchscope/shared';
import { api, ApiError } from '@/lib/api';

export type HoldingsSort = 'value' | 'pnl' | 'recent';
export type ActivityType = 'all' | 'buy' | 'sell';
export type LeaderboardTag = 'smart' | 'kol' | 'sniper' | 'whale' | 'all';
export type LeaderboardPeriod = Exclude<WalletPeriod, 'all'>;
export type LeaderboardSort = 'pnl' | 'winRate' | 'volume' | 'tokens' | 'pnlRate';
export type SortOrder = 'asc' | 'desc';

export const walletKeys = {
  profile: (chain: ChainId, address: string) => ['wallet-profile', chain, address] as const,
  holdings: (chain: ChainId, address: string, includeClosed: boolean, sort: HoldingsSort) =>
    ['wallet-holdings', chain, address, includeClosed ? 'closed' : 'open', sort] as const,
  activity: (chain: ChainId, address: string, type: ActivityType) => ['wallet-activity', chain, address, type] as const,
  created: (chain: ChainId, address: string) => ['wallet-created', chain, address] as const,
  calls: (chain: ChainId, address: string) => ['wallet-calls', chain, address] as const,
  risk: (chain: ChainId, address: string) => ['wallet-risk', chain, address] as const,
  leaderboard: (chain: ChainId, tag: LeaderboardTag, period: LeaderboardPeriod, sort: LeaderboardSort, order: SortOrder) =>
    ['leaderboard', chain, tag, period, sort, order] as const,
};

/** 404s are final (unknown wallet); other failures retry twice. */
export const retryUnlessMissing = (count: number, err: unknown) => !(err instanceof ApiError && err.status === 404) && count < 2;

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Wallet profile with period stats; refreshed every 15s while mounted. */
export function useWalletProfileQuery(chain: ChainId, address: string, opts: { enabled?: boolean; refetchMs?: number | false } = {}) {
  return useQuery({
    queryKey: walletKeys.profile(chain, address),
    queryFn: () => api.wallet(chain, address),
    enabled: (opts.enabled ?? true) && !!address,
    staleTime: 10_000,
    refetchInterval: opts.refetchMs ?? 15_000,
    retry: retryUnlessMissing,
  });
}

export function useWalletHoldings(chain: ChainId, address: string, includeClosed: boolean, sort: HoldingsSort, enabled = true) {
  return useQuery({
    queryKey: walletKeys.holdings(chain, address, includeClosed, sort),
    queryFn: () => api.walletHoldings(chain, address, { includeClosed, sort }),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 20_000 : false,
    retry: retryUnlessMissing,
  });
}

export const ACTIVITY_LIMIT = 100;

export function useWalletActivity(chain: ChainId, address: string, type: ActivityType, enabled = true) {
  return useQuery({
    queryKey: walletKeys.activity(chain, address, type),
    queryFn: () => api.walletActivity(chain, address, { type, limit: ACTIVITY_LIMIT }),
    enabled,
    staleTime: 10_000,
    retry: retryUnlessMissing,
  });
}

/** Tokens the wallet launched (still alive), newest first; refreshed every 15s while mounted. */
export function useCreatedTokens(chain: ChainId, address: string | null, enabled = true) {
  return useQuery({
    queryKey: walletKeys.created(chain, address ?? ''),
    queryFn: () => api.walletCreatedTokens(chain, address!),
    enabled: enabled && !!address,
    staleTime: 10_000,
    refetchInterval: enabled ? 15_000 : false,
    retry: retryUnlessMissing,
  });
}

/** The wallet's public calls with 7d / 30d hit rates (calls are cheap ring reads). */
export function useWalletCalls(chain: ChainId, address: string, enabled = true) {
  return useQuery({
    queryKey: walletKeys.calls(chain, address),
    queryFn: () => api.walletCalls(chain, address, 200),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: retryUnlessMissing,
  });
}

/** The wallet's risk check flags; refreshed every 30s while mounted. */
export function useWalletRisk(chain: ChainId, address: string, enabled = true) {
  return useQuery({
    queryKey: walletKeys.risk(chain, address),
    queryFn: () => api.walletRisk(chain, address),
    enabled: enabled && !!address,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: retryUnlessMissing,
  });
}

/** Ranked wallets; `order` asks the server for the bottom of the ranking instead of re-sorting its top rows. */
export function useLeaderboard(chain: ChainId, tag: LeaderboardTag, period: LeaderboardPeriod, sort: LeaderboardSort, order: SortOrder) {
  return useQuery({
    queryKey: walletKeys.leaderboard(chain, tag, period, sort, order),
    queryFn: () => api.leaderboard(chain, { tag, period, sort, order, limit: 100 }),
    staleTime: 15_000,
    // The server rebuilds rankings about every 30s.
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });
}
