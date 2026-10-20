// Followed wallets: one cached list per viewer (shared with useViewerTags via
// FOLLOWS_QUERY_KEY) plus follow / update / unfollow actions that patch the
// cache immediately and refresh the views that show follow state.

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInt, shortAddress, type ChainId, type FollowedWallet } from '@trenchscope/shared';
import { FOLLOWS_QUERY_KEY } from '@/components/discovery/useViewerTags';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { normAddress, sameWallet } from './utils';

export const DEFAULT_GROUP = 'Default';
export const REMARK_MAX = 32;
export const GROUP_MAX = 24;

/** Every wallet the viewer follows (all chains). Idle while signed out. */
export function useFollows() {
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: FOLLOWS_QUERY_KEY,
    queryFn: () => api.follows(),
    enabled: !!token,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Followed wallets of one chain, oldest follow first. */
export function useChainFollows(chain: ChainId) {
  const q = useFollows();
  const list = useMemo(() => (q.data ?? []).filter((f) => f.chain === chain), [q.data, chain]);
  return { ...q, list };
}

/** Distinct group names across the viewer's follows (Default first). */
export function useFollowGroups(): string[] {
  const { data } = useFollows();
  return useMemo(() => {
    const set = new Set<string>([DEFAULT_GROUP]);
    for (const f of data ?? []) if (f.group) set.add(f.group);
    return [...set];
  }, [data]);
}

/**
 * Follow record of one wallet: the record, null when not followed, or
 * undefined while unknown (signed out / list loading). `hint` is the
 * server's isFollowed flag, used until the list arrives.
 */
export function useFollowRecord(chain: ChainId, address: string): FollowedWallet | null | undefined {
  const signedIn = useSession((s) => !!s.token);
  const { data } = useFollows();
  if (!signedIn) return null;
  if (!data) return undefined;
  return data.find((f) => f.chain === chain && sameWallet(chain, f.address, address)) ?? null;
}

export interface FollowInput {
  remark?: string;
  group?: string;
  notify?: boolean;
}

/** Follow / update / unfollow with cache patching, invalidation and toasts. */
export function useFollowActions() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const patchList = useCallback(
    (fn: (list: FollowedWallet[]) => FollowedWallet[]) => qc.setQueryData<FollowedWallet[]>(FOLLOWS_QUERY_KEY, (prev) => fn(prev ?? [])),
    [qc],
  );

  /** Views whose follow state, remark or follower count depend on this wallet. */
  const refreshViews = useCallback(
    (chain: ChainId, address: string) => {
      void qc.invalidateQueries({ queryKey: ['wallet-profile', chain, address] });
      void qc.invalidateQueries({ queryKey: ['leaderboard', chain] });
      void qc.invalidateQueries({ queryKey: ['feed', chain, 'follow'] });
    },
    [qc],
  );

  const run = useCallback(async <T,>(fn: () => Promise<T>, failTitle: string): Promise<T | null> => {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      toast.error(failTitle, errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const follow = useCallback(
    (chain: ChainId, address: string, input: FollowInput = {}, opts: { name?: string | null; silent?: boolean } = {}) =>
      run(async () => {
        const addr = normAddress(chain, address);
        const f = await api.follow({ chain, address: addr, ...input });
        patchList((list) => [...list.filter((x) => !(x.chain === chain && sameWallet(chain, x.address, f.address))), f]);
        refreshViews(chain, f.address);
        if (!opts.silent) toast.success(`Following ${opts.name || shortAddress(f.address)}`, 'Their trades now appear in Monitor → Following.', { to: routes.monitor(chain), label: 'Open Monitor' });
        return f;
      }, 'Couldn’t follow wallet'),
    [run, patchList, refreshViews],
  );

  const update = useCallback(
    (chain: ChainId, address: string, input: FollowInput) =>
      run(async () => {
        const f = await api.updateFollow(chain, address, input);
        patchList((list) => list.map((x) => (x.chain === chain && sameWallet(chain, x.address, address) ? f : x)));
        if (input.remark !== undefined) refreshViews(chain, address);
        return f;
      }, 'Couldn’t update follow'),
    [run, patchList, refreshViews],
  );

  const unfollow = useCallback(
    (chain: ChainId, address: string, opts: { name?: string | null } = {}) =>
      run(async () => {
        await api.unfollow(chain, address);
        patchList((list) => list.filter((x) => !(x.chain === chain && sameWallet(chain, x.address, address))));
        refreshViews(chain, address);
        toast.info(`Unfollowed ${opts.name || shortAddress(address)}`);
        return true;
      }, 'Couldn’t unfollow wallet'),
    [run, patchList, refreshViews],
  );

  return { follow, update, unfollow, busy };
}

/** "1,234 followers" style helper for titles. */
export function followersLabel(n: number): string {
  return `${formatInt(n)} follower${n === 1 ? '' : 's'}`;
}
