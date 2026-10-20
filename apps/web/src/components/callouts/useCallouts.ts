// Call-out feed: the REST list for a filter (refreshed every 15s so max
// multiples stay current) plus new kol_call signals pushed on
// `signals:<chain>` (the "all" and "kol" feeds take them as they arrive),
// and the caller ranking.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { CalloutFilter, ChainId, LeaderboardRow, Signal, WalletProfile, WalletTag } from '@trenchscope/shared';
import { walletKeys } from '@/components/wallet';
import { api } from '@/lib/api';
import { useStickyError } from '@/hooks/useStickyError';
import { retainKeys } from '@/lib/retain';
import { realtime, useChannel, useConnectionState } from '@/lib/ws';
import { aggregateCallers, callerOf, type CallerStats } from './callerStats';

export const CALLOUTS_LIMIT = 300;

/** REST list of calls for a filter (shared by the feed and the ranking). */
function useCalloutsQuery(chain: ChainId, filter: CalloutFilter, enabled = true) {
  return useQuery({
    queryKey: ['callouts', chain, filter],
    queryFn: () => api.callouts(chain, filter, CALLOUTS_LIMIT),
    enabled,
    refetchInterval: 15_000,
    staleTime: 5_000,
    retry: 1,
  });
}

export interface CallerInfo {
  label: string | null;
  tags: WalletTag[];
}

/** Caller lookup, null while unknown. */
export type CallerDirectory = (address: string) => CallerInfo | null;

const MAX_PROFILE_LOOKUPS = 20;
const profilesOf = (results: { data?: WalletProfile }[]) => results.map((r) => r.data);

/**
 * Label and platform tags of callers: one KOL leaderboard read covers the
 * KOLs; anyone else is looked up by wallet profile (capped, cached).
 */
export function useCallerDirectory(chain: ChainId, addresses: string[]): CallerDirectory {
  const kols = useQuery({
    queryKey: ['callers', chain],
    queryFn: () => api.leaderboard(chain, { tag: 'kol', period: '30d', limit: 200 }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
  const missing = useMemo(() => {
    if (!kols.data) return [];
    const known = new Set(kols.data.map((r) => r.address));
    return [...new Set(addresses)].filter((a) => a && !known.has(a)).slice(0, MAX_PROFILE_LOOKUPS);
  }, [kols.data, addresses]);
  const profiles = useQueries({
    queries: missing.map((address) => ({ queryKey: walletKeys.profile(chain, address), queryFn: () => api.wallet(chain, address), staleTime: 300_000, retry: false })),
    combine: profilesOf,
  });
  return useMemo(() => {
    const map = new Map<string, CallerInfo>();
    for (const r of kols.data ?? ([] as LeaderboardRow[])) map.set(r.address, { label: r.label, tags: r.tags });
    for (const p of profiles) if (p) map.set(p.address, { label: p.label, tags: p.tags });
    return (address: string) => map.get(address) ?? null;
  }, [kols.data, profiles]);
}

const byNewest = (a: Signal, b: Signal) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1);

export interface LiveCallouts {
  calls: Signal[];
  /** Ids pushed live after the first load (row slide-in). */
  freshIds: Set<string>;
  loading: boolean;
  error: unknown;
  live: boolean;
  retry: () => void;
  retrying: boolean;
}

/** `accept` decides whether a pushed call belongs to the current filter. */
export function useCallouts(chain: ChainId, filter: CalloutFilter, accept: (s: Signal) => boolean): LiveCallouts {
  const q = useCalloutsQuery(chain, filter);
  // Calls pushed since the last REST read, for this filter only.
  const key = `${chain}:${filter}`;
  const [pushed, setPushed] = useState<{ key: string; calls: Signal[] }>({ key, calls: [] });
  const [wsSeen, setWsSeen] = useState(false);
  const freshIds = useRef(new Set<string>());
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const keyRef = useRef(key);
  keyRef.current = key;
  const listed = useRef<{ key: string; ids: Set<string> } | null>(null);

  useChannel(`signals:${chain}`, null, (type, data) => {
    if (type !== 'signals' || !Array.isArray(data)) return;
    setWsSeen(true);
    const calls = (data as Signal[]).filter((s) => s.kind === 'kol_call' && callerOf(s) && acceptRef.current(s));
    if (calls.length === 0) return;
    const k = keyRef.current;
    // Every (re)subscription starts with a snapshot of recent signals: only calls
    // the loaded list does not hold yet are new (nothing is, before it loads).
    const shown = listed.current?.key === k ? listed.current.ids : null;
    if (shown) for (const s of calls) if (!shown.has(s.id)) freshIds.current.add(s.id);
    setPushed((prev) => ({ key: k, calls: [...calls, ...(prev.key === k ? prev.calls : [])].slice(0, CALLOUTS_LIMIT) }));
  });

  // Pushes a fresh REST read already holds are dropped (the REST copy has the current multiple).
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.map((s) => s.id));
    setPushed((prev) => (prev.calls.some((s) => ids.has(s.id)) ? { key: prev.key, calls: prev.calls.filter((s) => !ids.has(s.id)) } : prev));
  }, [q.data]);

  const calls = useMemo(() => {
    const extra = pushed.key === key ? pushed.calls : [];
    if (!q.data) return extra;
    if (extra.length === 0) return q.data;
    const map = new Map<string, Signal>();
    for (const s of extra) map.set(s.id, s);
    for (const s of q.data) map.set(s.id, s);
    return [...map.values()].sort(byNewest).slice(0, CALLOUTS_LIMIT);
  }, [q.data, pushed, key]);

  // Only ids still listed can need the slide-in.
  useEffect(() => {
    const ids = new Set(calls.map((s) => s.id));
    retainKeys(freshIds.current, ids);
    listed.current = q.data ? { key, ids } : null;
  }, [calls, q.data, key]);

  const conn = useConnectionState();
  const failed = useStickyError(q); // not reset to "loading" by each 15s retry
  return {
    calls,
    freshIds: freshIds.current,
    loading: !q.data && failed === null,
    error: failed !== null && !q.data ? failed : null,
    live: wsSeen && conn === 'open',
    retry: () => {
      realtime.connect();
      void q.refetch();
    },
    retrying: q.isFetching,
  };
}

export interface CallerRanking {
  callers: CallerStats[];
  loading: boolean;
  /** The calls behind the ranking failed to load: show an error, never "no repeat callers". */
  error: unknown;
  retry: () => void;
  retrying: boolean;
}

/**
 * Callers ranked by hit rate (aggregateCallers). The "all" and "kol" feeds
 * rank their own calls (a caller filter keeps each caller's every call); the
 * "hits" feed holds only winning calls, which would put every caller at 100%,
 * so it ranks the chain's full call list instead.
 */
export function useCallerRanking(chain: ChainId, filter: CalloutFilter, feed: LiveCallouts): CallerRanking {
  const full = filter === 'hits';
  const all = useCalloutsQuery(chain, 'all', full);
  const calls = full ? all.data : feed.calls;
  const callers = useMemo(() => (calls ? aggregateCallers(calls) : []), [calls]);
  if (full)
    return {
      callers,
      loading: !all.data && !all.isError,
      error: all.isError && !all.data ? all.error : null,
      retry: () => void all.refetch(),
      retrying: all.isFetching,
    };
  // A failed feed can still hold a few pushed calls: a partial ranking next to the error would mislead.
  return { callers, loading: feed.loading, error: feed.error, retry: feed.retry, retrying: feed.retrying };
}
