// Watchlist data shared by the Watchlist page and every star: one query
// (items, token summaries, groups) under accountKeys.watchlist, and actions
// that update that cache optimistically, roll back on failure and refetch.

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WATCHLIST_LIMITS, type ChainId, type WatchlistGroup, type WatchlistItem, type WatchlistResponse } from '@trenchscope/shared';
import { serverNow } from '@/hooks/useNow';
import { api, type WatchItemPatch } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { accountKeys } from './queries';

/** Group colour swatches (#rrggbb, as the API stores them). */
export const GROUP_COLORS = ['#ffb547', '#22d687', '#5ca4ff', '#c084fc', '#f472b6', '#ff5468', '#2dd4bf', '#94a3b8'] as const;

export interface WatchRef {
  chain: ChainId;
  address: string;
  symbol: string;
}

export const watchKey = (t: { chain: string; address: string }) => `${t.chain}:${t.address}`;

/** Client-side check of a group name, mirroring the API (null = valid). */
export function groupNameError(name: string, groups: WatchlistGroup[], selfId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a name';
  if (n.length > WATCHLIST_LIMITS.groupNameMaxLength) return `At most ${WATCHLIST_LIMITS.groupNameMaxLength} characters`;
  if (n.toLowerCase() === 'all') return '“All” is reserved';
  if (groups.some((g) => g.id !== selfId && g.name.toLowerCase() === n.toLowerCase())) return 'A group with this name exists';
  return null;
}

/** Item with a patch applied the way the API does (empty groups / blank note remove the field). */
export function patchItem(item: WatchlistItem, patch: WatchItemPatch): WatchlistItem {
  const next = { ...item };
  if (patch.groupIds !== undefined) {
    const ids = [...new Set(patch.groupIds)];
    if (ids.length) next.groupIds = ids;
    else delete next.groupIds;
  }
  if (patch.note !== undefined) {
    const note = patch.note.trim();
    if (note) next.note = note;
    else delete next.note;
  }
  return next;
}

/** The signed-in viewer's watchlist (idle signed out). */
export function useWatchlist(refetchMs: number | false = false) {
  const signedIn = useSession((s) => !!s.token);
  return useQuery({ queryKey: accountKeys.watchlist, queryFn: api.watchlist, enabled: signedIn, staleTime: 30_000, refetchInterval: refetchMs });
}

/** The watchlist item of one token, or null. */
export function useWatchItem(chain: ChainId, address: string): WatchlistItem | null {
  const items = useWatchlist().data?.items;
  return useMemo(() => items?.find((i) => i.chain === chain && i.address === address) ?? null, [items, chain, address]);
}

type Edit = (d: WatchlistResponse) => WatchlistResponse;

/** Watchlist mutations; each resolves to the API result, or null after a failure (already toasted). */
export function useWatchlistActions() {
  const qc = useQueryClient();
  const key = accountKeys.watchlist;

  const run = useCallback(
    async <T>(failTitle: string, call: () => Promise<T>, optimistic?: Edit, settle?: (d: WatchlistResponse, res: T) => WatchlistResponse): Promise<T | null> => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WatchlistResponse>(key);
      if (prev && optimistic) qc.setQueryData(key, optimistic(prev));
      try {
        const res = await call();
        if (settle) qc.setQueryData<WatchlistResponse>(key, (d) => d && settle(d, res));
        return res;
      } catch (err) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(failTitle, errorMessage(err));
        return null;
      } finally {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    [qc, key],
  );

  return useMemo(() => {
    const mapItem = (t: { chain: ChainId; address: string }, fn: (i: WatchlistItem) => WatchlistItem): Edit => (d) => ({
      ...d,
      items: d.items.map((i) => (i.chain === t.chain && i.address === t.address ? fn(i) : i)),
    });
    const mapGroup = (id: string, fn: (g: WatchlistGroup) => WatchlistGroup): Edit => (d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? fn(g) : g)) });

    return {
      add: async (t: WatchRef, patch: WatchItemPatch = {}) => {
        const res = await run(
          'Watchlist not updated',
          () => api.addWatch(t.chain, t.address, patch),
          (d) => ({ ...d, items: [patchItem({ chain: t.chain, address: t.address, addedAt: serverNow() }, patch), ...d.items] }),
        );
        if (res) toast.success(`${t.symbol} added to watchlist`);
        return res;
      },
      remove: async (t: WatchRef) => {
        const res = await run(
          'Watchlist not updated',
          () => api.removeWatch(t.chain, t.address),
          (d) => ({ ...d, items: d.items.filter((i) => watchKey(i) !== watchKey(t)), tokens: d.tokens.filter((x) => watchKey(x) !== watchKey(t)) }),
        );
        if (res) toast.info(`${t.symbol} removed from watchlist`);
        return res;
      },
      update: (t: WatchRef, patch: WatchItemPatch) =>
        run(`${t.symbol} not updated`, () => api.updateWatch(t.chain, t.address, patch), mapItem(t, (i) => patchItem(i, patch))),
      createGroup: (name: string, color?: string) =>
        run(
          'Group not created',
          () => api.createWatchGroup({ name: name.trim(), color }),
          undefined,
          (d, g) => ({ ...d, groups: [...d.groups.filter((x) => x.id !== g.id), g] }),
        ),
      updateGroup: (id: string, patch: { name?: string; color?: string | null }) =>
        run(
          'Group not updated',
          () => api.updateWatchGroup(id, patch),
          mapGroup(id, (g) => {
            const next = { ...g, ...(patch.name !== undefined && { name: patch.name.trim() }) };
            if (patch.color === null) delete next.color;
            else if (patch.color) next.color = patch.color;
            return next;
          }),
        ),
      deleteGroup: (id: string) =>
        run('Group not deleted', () => api.deleteWatchGroup(id), (d) => ({
          ...d,
          groups: d.groups.filter((g) => g.id !== id).map((g, i) => ({ ...g, order: i })),
          items: d.items.map((i) => (i.groupIds?.includes(id) ? patchItem(i, { groupIds: i.groupIds.filter((x) => x !== id) }) : i)),
        })),
    };
  }, [run]);
}
