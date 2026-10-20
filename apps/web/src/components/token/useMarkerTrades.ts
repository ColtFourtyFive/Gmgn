import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { ChainId, Trade } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useLiveTrades } from './feed';
import type { MarkerClass } from './model';
import { tokenKeys } from './queries';

/** Server trade filter used to backfill each marker class (rare classes would be missing from the plain feed). */
const CLASS_FILTER: Partial<Record<MarkerClass, string[]>> = {
  dev: ['dev'],
  mine: ['mine'],
  following: ['following'],
  kol: ['kol'],
  smart: ['smart'],
  whale: ['whale'],
  sniper: ['sniper'],
  insider: ['insider', 'bundler'],
};

/**
 * Trades to draw as chart markers: the latest 300 trades plus a backfill of
 * up to 100 per enabled class, merged with the live stream (newest first).
 * Backfills load once; the stream keeps them current.
 */
export function useMarkerTrades(chain: ChainId, address: string, enabled: ReadonlySet<MarkerClass>): Trade[] {
  const signedIn = useSession((s) => !!s.token);
  const viewer = useSession((s) => s.account?.id ?? null);
  const live = useLiveTrades();

  const filters = useMemo(() => {
    const out = ['all'];
    for (const cls of enabled) {
      if ((cls === 'mine' || cls === 'following') && !signedIn) continue;
      for (const f of CLASS_FILTER[cls] ?? []) out.push(f);
    }
    return out;
  }, [enabled, signedIn]);

  const results = useQueries({
    queries: filters.map((filter) => {
      const isPrivate = filter === 'mine' || filter === 'following';
      return {
        queryKey: tokenKeys.trades(chain, address, { purpose: 'markers', filter, viewer: isPrivate ? viewer : null }),
        queryFn: () => api.trades(chain, address, { filter: filter === 'all' ? undefined : filter, limit: filter === 'all' ? 300 : 100 }),
        staleTime: Infinity,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      };
    }),
  });

  const stamp = results.map((r) => r.dataUpdatedAt).join(',');
  return useMemo(() => {
    const byId = new Map<string, Trade>();
    for (const t of live) byId.set(t.id, t);
    for (const r of results) for (const t of r.data ?? []) if (!byId.has(t.id)) byId.set(t.id, t);
    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
    // `results` changes identity every render; `stamp` tracks its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, stamp]);
}
