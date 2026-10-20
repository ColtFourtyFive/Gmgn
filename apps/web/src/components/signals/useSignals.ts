// Live signal stream: REST snapshot (refreshed every 15s so token refs and
// max multiples stay current) merged with `signals:<chain>` WebSocket pushes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChainId, Signal } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { realtime, useChannel, useConnectionState } from '@/lib/ws';

export const SIGNALS_CAP = 300;

const byNewest = (a: Signal, b: Signal) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1);

function merge(list: Signal[], incoming: Signal[]): Signal[] {
  if (incoming.length === 0) return list;
  const map = new Map<string, Signal>();
  for (const s of list) map.set(s.id, s);
  for (const s of incoming) map.set(s.id, s);
  return [...map.values()].sort(byNewest).slice(0, SIGNALS_CAP);
}

export interface LiveSignals {
  signals: Signal[];
  /** Ids pushed live after the first snapshot (card slide-in). */
  freshIds: Set<string>;
  loading: boolean;
  error: unknown;
  live: boolean;
  retry: () => void;
  retrying: boolean;
}

export function useSignals(chain: ChainId): LiveSignals {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [wsSeen, setWsSeen] = useState(false);
  const freshIds = useRef(new Set<string>());
  const seeded = useRef(false);
  const listRef = useRef(signals);
  listRef.current = signals;

  const ingest = useCallback((incoming: Signal[], source: 'rest' | 'ws') => {
    if (seeded.current && source === 'ws') {
      const known = new Set(listRef.current.map((s) => s.id));
      for (const s of incoming) if (!known.has(s.id)) freshIds.current.add(s.id);
    }
    seeded.current = true;
    setSignals((prev) => merge(prev, incoming));
  }, []);

  const q = useQuery({
    queryKey: ['signals', chain],
    queryFn: () => api.signals(chain, { limit: 200 }),
    refetchInterval: 15_000,
    staleTime: 5_000,
    retry: 1,
  });
  useEffect(() => {
    if (q.data) ingest(q.data, 'rest');
  }, [q.data, ingest]);

  useChannel(`signals:${chain}`, null, (type, data) => {
    if (type !== 'signals' || !Array.isArray(data)) return;
    setWsSeen(true);
    ingest(data as Signal[], 'ws');
  });

  const conn = useConnectionState();
  const hasData = signals.length > 0 || q.data !== undefined || wsSeen;
  return useMemo(
    () => ({
      signals,
      freshIds: freshIds.current,
      loading: !hasData && !q.isError,
      error: q.isError && signals.length === 0 ? q.error : null,
      live: wsSeen && conn === 'open',
      retry: () => {
        realtime.connect();
        void q.refetch();
      },
      retrying: q.isFetching,
    }),
    // q.refetch is stable; the q flags used are listed explicitly.
    [signals, hasData, q.isError, q.error, q.isFetching, wsSeen, conn],
  );
}
