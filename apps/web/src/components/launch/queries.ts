// Launch data: the launchpad config (curves, fees, glyphs, limits) and the
// signed-in user's launches with live curve progress.

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CHAIN_IDS, type ChainId, type DevToken, type TokenDetail } from '@trenchscope/shared';
import { accountKeys } from '@/components/account';
import { useCreatedTokens, walletKeys } from '@/components/wallet';
import { serverNow } from '@/hooks';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';

export const launchKeys = {
  config: ['launch-config'] as const,
};

/** Launch config; market caps follow the native price, so it refreshes every minute. */
export function useLaunchConfig() {
  return useQuery({
    queryKey: launchKeys.config,
    queryFn: () => api.launchConfig(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}

export interface MyLaunch extends DevToken {
  /** Live detail (curve progress, launchpad, holders); null until loaded or beyond the lookup cap. */
  detail: TokenDetail | null;
}

/** Launches whose detail is polled (the newest first). */
const DETAIL_LOOKUPS = 20;
const detailsOf = (results: { data?: TokenDetail }[]) => results.map((r) => r.data);

/** The user's paper wallet on `chain` (null signed out). */
export function useLaunchWallet(chain: ChainId): string | null {
  return useSession((s) => (s.token ? (s.account?.wallets[chain]?.address ?? null) : null));
}

/** Tokens the user's wallet launched on `chain`, newest first, with their live detail. */
export function useMyLaunches(chain: ChainId) {
  const wallet = useLaunchWallet(chain);
  const created = useCreatedTokens(chain, wallet, !!wallet);
  const newest = useMemo(() => (created.data ?? []).slice(0, DETAIL_LOOKUPS), [created.data]);
  const details = useQueries({
    queries: newest.map((t) => ({
      queryKey: accountKeys.tokenMeta(chain, t.address),
      queryFn: () => api.token(chain, t.address),
      staleTime: 5_000,
      refetchInterval: 10_000,
      retry: false,
    })),
    combine: detailsOf,
  });
  const rows = useMemo<MyLaunch[] | undefined>(() => {
    if (!created.data) return undefined;
    const byAddress = new Map(details.filter((d): d is TokenDetail => !!d).map((d) => [d.address, d]));
    return created.data.map((t) => ({ ...t, detail: byAddress.get(t.address) ?? null }));
  }, [created.data, details]);
  return { wallet, rows, query: created };
}

const HOUR_MS = 3_600_000;

/**
 * Launches the account made within the last hour, on every chain (the server's
 * hourly limit spans chains); undefined signed out or until every list loaded.
 * Reads each chain's newest `limit` launches, which is all the count needs.
 */
export function useLaunchesThisHour(limit: number): number | undefined {
  const wallets = useSession((s) => (s.token ? s.account?.wallets : undefined));
  return useQueries({
    queries: CHAIN_IDS.map((chain) => {
      const address = wallets?.[chain]?.address ?? '';
      return {
        // Under walletKeys.created, so invalidating a chain's launches refreshes this too.
        queryKey: [...walletKeys.created(chain, address), 'newest', limit],
        queryFn: () => api.walletCreatedTokens(chain, address, limit),
        enabled: !!address,
        staleTime: 10_000,
        refetchInterval: 30_000,
      };
    }),
    combine: (results) => {
      if (!wallets || results.some((r, i) => !r.data && !!wallets[CHAIN_IDS[i]]?.address)) return undefined;
      const now = serverNow();
      return results.reduce((n, r) => n + (r.data ?? []).filter((t) => now - t.createdAt < HOUR_MS).length, 0);
    },
  });
}
