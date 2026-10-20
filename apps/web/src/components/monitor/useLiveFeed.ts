// Live Monitor feed: REST snapshot (refreshed every 15s for fresh token refs)
// merged with `feed:<chain>:<kind>` WebSocket batches. Items are deduped by
// trade id, newest first, capped; while paused, new trades wait in a buffer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChainId, FeedItem, TokenRef } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { realtime, useChannel, useConnectionState } from '@/lib/ws';

export type FeedKind = 'smart' | 'kol' | 'follow' | 'all';

export const FEED_CAP = 300;

export interface LiveFeedOptions {
  chain: ChainId;
  kind: FeedKind;
  /** Hold new trades in a buffer instead of showing them. */
  paused?: boolean;
  /** REST snapshot size (max 200). */
  limit?: number;
  enabled?: boolean;
}

export interface LiveFeed {
  /** Newest first. */
  items: FeedItem[];
  /** Trades buffered while paused. */
  pending: number;
  /** Show buffered trades now. */
  flush: () => void;
  /** Latest known ref per token (current market cap). */
  tokens: Map<string, TokenRef>;
  /** Trade ids that arrived after the first snapshot (row slide-in). */
  freshIds: Set<string>;
  loading: boolean;
  error: unknown;
  /** Streaming over the socket. */
  live: boolean;
  retry: () => void;
  retrying: boolean;
}

const byNewest = (a: FeedItem, b: FeedItem) => b.trade.timestamp - a.trade.timestamp || (a.trade.id < b.trade.id ? 1 : -1);

/** Merge incoming items (later arrival wins: fresher token refs) and keep the newest FEED_CAP. */
function merge(list: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  if (incoming.length === 0) return list;
  const map = new Map<string, FeedItem>();
  for (const it of list) map.set(it.trade.id, it);
  for (const it of incoming) map.set(it.trade.id, it);
  return [...map.values()].sort(byNewest).slice(0, FEED_CAP);
}

const EMPTY: FeedItem[] = [];

export function useLiveFeed({ chain, kind, paused = false, limit = 100, enabled = true }: LiveFeedOptions): LiveFeed {
  // All list state belongs to one chain + kind; switching tabs starts a fresh list.
  const key = `${chain}:${kind}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [state, setState] = useState<{ key: string; items: FeedItem[] }>({ key, items: EMPTY });
  const items = state.key === key ? state.items : EMPTY;
  const buffer = useRef<{ key: string; items: FeedItem[] }>({ key, items: [] });
  const [pendingState, setPending] = useState<{ key: string; n: number }>({ key, n: 0 });
  const pending = pendingState.key === key ? pendingState.n : 0;
  const [wsKey, setWsKey] = useState<string | null>(null);
  const wsSeen = wsKey === key;
  const tokens = useRef(new Map<string, TokenRef>());
  const freshIds = useRef(new Set<string>());
  const seededKey = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const setItems = useCallback((fn: (prev: FeedItem[]) => FeedItem[]) => {
    const k = keyRef.current;
    setState((prev) => ({ key: k, items: fn(prev.key === k ? prev.items : EMPTY) }));
  }, []);

  const ingest = useCallback(
    (incoming: FeedItem[], source: 'rest' | 'ws') => {
      const k = keyRef.current;
      const seeded = seededKey.current === k;
      seededKey.current = k;
      if (incoming.length === 0) return;
      for (const it of incoming) tokens.current.set(it.token.address, it.token);
      const known = new Set(itemsRef.current.map((it) => it.trade.id));
      if (pausedRef.current && seeded) {
        // Refresh what is on screen; queue the rest.
        const update = incoming.filter((it) => known.has(it.trade.id));
        const queued = incoming.filter((it) => !known.has(it.trade.id));
        if (update.length) setItems((prev) => merge(prev, update));
        if (queued.length) {
          const base = buffer.current.key === k ? buffer.current.items : [];
          buffer.current = { key: k, items: merge(base, queued) };
          setPending({ key: k, n: buffer.current.items.length });
        }
        return;
      }
      if (seeded && source === 'ws') for (const it of incoming) if (!known.has(it.trade.id)) freshIds.current.add(it.trade.id);
      setItems((prev) => merge(prev, incoming));
    },
    [setItems],
  );

  const q = useQuery({
    queryKey: ['feed', chain, kind, limit],
    queryFn: () => api.feed(chain, kind, limit),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    staleTime: 5_000,
    retry: 1,
  });

  useEffect(() => {
    if (q.data) ingest(q.data, 'rest');
  }, [q.data, ingest]);

  useChannel(enabled ? `feed:${chain}:${kind}` : null, null, (type, data) => {
    if (type !== 'feed' || !Array.isArray(data)) return;
    setWsKey(keyRef.current);
    ingest(data as FeedItem[], 'ws');
  });

  const flush = useCallback(() => {
    const k = keyRef.current;
    const buf = buffer.current.key === k ? buffer.current.items : [];
    buffer.current = { key: k, items: [] };
    setPending({ key: k, n: 0 });
    if (buf.length === 0) return;
    for (const it of buf) freshIds.current.add(it.trade.id);
    setItems((prev) => merge(prev, buf));
  }, [setItems]);

  // Resuming shows everything that was buffered.
  useEffect(() => {
    if (!paused) flush();
  }, [paused, flush]);

  const conn = useConnectionState();
  const hasData = items.length > 0 || q.data !== undefined || wsSeen;
  return useMemo(
    () => ({
      items,
      pending,
      flush,
      tokens: tokens.current,
      freshIds: freshIds.current,
      loading: enabled && !hasData && !q.isError,
      error: q.isError && items.length === 0 ? q.error : null,
      live: enabled && wsSeen && conn === 'open',
      retry: () => {
        realtime.connect();
        void q.refetch();
      },
      retrying: q.isFetching,
    }),
    // q.refetch is stable; the q flags used are listed explicitly.
    [items, pending, flush, enabled, hasData, q.isError, q.error, q.isFetching, wsSeen, conn],
  );
}
