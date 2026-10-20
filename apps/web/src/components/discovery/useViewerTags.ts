import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChainId, WalletTag } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';

/** Query key of the viewer's followed wallets (all chains). */
export const FOLLOWS_QUERY_KEY = ['follows', 'all'] as const;

/**
 * Viewer-relative wallet tags for broadcast data, which never carries them:
 * the viewer's own paper wallet is 'you', followed wallets are 'following'.
 * Signed out, nothing is tagged.
 */
export function useViewerTags(chain: ChainId): (address: string) => WalletTag[] {
  const token = useSession((s) => s.token);
  const own = useSession((s) => s.account?.wallets[chain]?.address ?? null);
  const follows = useQuery({
    queryKey: FOLLOWS_QUERY_KEY,
    queryFn: () => api.follows(),
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });
  const followed = useMemo(() => {
    const set = new Set<string>();
    if (token) for (const f of follows.data ?? []) if (f.chain === chain) set.add(f.address);
    return set;
  }, [follows.data, chain, token]);

  return useCallback(
    (address: string) => {
      const tags: WalletTag[] = [];
      if (own && address === own) tags.push('you');
      if (followed.has(address)) tags.push('following');
      return tags;
    },
    [own, followed],
  );
}
