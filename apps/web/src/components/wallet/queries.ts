// React-query keys and hooks for wallet analytics (profile, holdings,
// activity, created tokens, leaderboard). Profiles share the
// ['wallet-profile', chain, address] key with the account pages' previews.

import { useQuery } from '@tanstack/react-query';
import type { ChainId, WalletPeriod } from '@trenchscope/shared';
import { api, ApiError } from '@/lib/api';

export type HoldingsSort = 'value' | 'pnl' | 'recent';
export type ActivityType = 'all' | 'buy' | 'sell';
export type LeaderboardTag = 'smart' | 'kol' | 'sniper' | 'whale' | 'all';
export type LeaderboardPeriod = Exclude<WalletPeriod, 'all'>;
export type LeaderboardSort = 'pnl' | 'winRate' | 'volume' | 'tokens' | 'pnlRate';

export const walletKeys = {
  profile: (chain: ChainId, address: string) => ['wallet-profile', chain, address] as const,
  holdings: (chain: ChainId, address: string, includeClosed: boolean, sort: HoldingsSort) =>
    ['wallet-holdings', chain, address, includeClosed ? 'closed' : 'open', sort] as const,
  activity: (chain: ChainId, address: string, type: ActivityType) => ['wallet-activity', chain, address, type] as const,
  dev: (chain: ChainId, token: string) => ['token-dev', chain, token] as const,
  leaderboard: (chain: ChainId, tag: LeaderboardTag, period: LeaderboardPeriod, sort: LeaderboardSort) =>
    ['leaderboard', chain, tag, period, sort] as const,
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

export function useLeaderboard(chain: ChainId, tag: LeaderboardTag, period: LeaderboardPeriod, sort: LeaderboardSort) {
  return useQuery({
    queryKey: walletKeys.leaderboard(chain, tag, period, sort),
    queryFn: () => api.leaderboard(chain, { tag, period, sort, limit: 100 }),
    staleTime: 15_000,
    // The server rebuilds rankings about every 30s.
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });
}
