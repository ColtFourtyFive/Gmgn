// React-query keys and small shared queries for the account pages.
// Trading data lives under the prefixes the user channel invalidates on
// fills/orders (['portfolio'], ['orders']); notifications under
// ['notifications'] so the bell and the Alerts page share invalidation.

import { useQuery } from '@tanstack/react-query';
import type { ChainId } from '@trenchscope/shared';
import { api, ApiError } from '@/lib/api';
import { isAddressFor } from './address';

export type ChainScope = ChainId | 'all';

export const accountKeys = {
  portfolio: (scope: ChainScope) => ['portfolio', 'summary', scope] as const,
  activity: (scope: ChainScope) => ['portfolio', 'activity', scope] as const,
  /** Under ['portfolio'] so fills refresh it. */
  calendar: (scope: ChainScope) => ['portfolio', 'calendar', scope] as const,
  orders: (status: 'open' | 'history', scope: ChainScope) => ['orders', status, scope] as const,
  watchlist: ['watchlist'] as const,
  copyTasks: ['copytrade'] as const,
  sniperTasks: ['sniper'] as const,
  alerts: ['alerts'] as const,
  rewards: ['rewards'] as const,
  /** Under ['notifications'] so user-channel events refresh it with the bell. */
  notifications: (limit: number) => ['notifications', 'list', limit] as const,
  walletProfile: (chain: ChainId, address: string) => ['wallet-profile', chain, address] as const,
  tokenMeta: (chain: ChainId, address: string) => ['token-meta', chain, address] as const,
};

/** 404s are final; other failures retry twice. */
const retryUnlessMissing = (count: number, err: unknown) => !(err instanceof ApiError && err.status === 404) && count < 2;

/** Wallet profile (label, tags, stats) for previews and task cards; idle until the address is well-formed. */
export function useWalletProfile(chain: ChainId, address: string | null | undefined) {
  const addr = address?.trim() ?? '';
  return useQuery({
    queryKey: accountKeys.walletProfile(chain, addr),
    queryFn: () => api.wallet(chain, addr),
    enabled: isAddressFor(chain, addr),
    staleTime: 60_000,
    retry: retryUnlessMissing,
  });
}

/** Token detail for previews and alert rows; idle until the address is well-formed. */
export function useTokenMeta(chain: ChainId, address: string | null | undefined, opts: { live?: boolean } = {}) {
  const addr = address?.trim() ?? '';
  return useQuery({
    queryKey: accountKeys.tokenMeta(chain, addr),
    queryFn: () => api.token(chain, addr),
    enabled: isAddressFor(chain, addr),
    staleTime: 15_000,
    refetchInterval: opts.live ? 5_000 : false,
    retry: retryUnlessMissing,
  });
}
