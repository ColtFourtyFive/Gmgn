import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { realtime, useChannel, useConnectionState } from '@/lib/ws';

export interface LiveSnapshotOptions<T> {
  /** WebSocket channel, e.g. `trenches:sol`. */
  channel: string;
  /** Message type carrying the snapshot on that channel. */
  type: string;
  /** Channel params; a change re-subscribes in place. */
  params: unknown;
  /** REST equivalent, used while the socket is down or silent. */
  fetch: () => Promise<T>;
  /** React-query key of the REST fallback (include every param). */
  queryKey: readonly unknown[];
  /** REST polling interval while falling back (ms). */
  pollMs?: number;
  /** Fall back to REST when a subscription yields nothing for this long (ms). */
  stallMs?: number;
}

export interface LiveSnapshot<T> {
  /** Latest payload (may belong to the previous params while `stale`). */
  data: T | null;
  /** Nothing to show yet. */
  loading: boolean;
  /** Showing data from previous params (a new snapshot is on its way). */
  stale: boolean;
  /** The REST fallback failed (data, if any, is from earlier). */
  error: unknown;
  /** Data is streaming over the socket (vs. REST polling). */
  live: boolean;
  retry: () => void;
  retrying: boolean;
}

/**
 * A periodically pushed list (trenches, trending, new pairs). Streams over
 * the shared WebSocket; while the socket is closed, or the subscription stays
 * silent (e.g. the server rejected its params), polls the REST endpoint
 * instead, so the page also works and surfaces errors without realtime.
 */
export function useLiveSnapshot<T>({ channel, type, params, fetch, queryKey, pollMs = 3000, stallMs = 4000 }: LiveSnapshotOptions<T>): LiveSnapshot<T> {
  const key = `${channel}|${JSON.stringify(params ?? null)}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [ws, setWs] = useState<{ key: string; data: T } | null>(null);

  useChannel(channel, params, (t, data) => {
    if (t === type) setWs({ key: keyRef.current, data: data as T });
  });

  const conn = useConnectionState();
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    const id = setTimeout(() => setStalled(true), stallMs);
    return () => clearTimeout(id);
  }, [key, stallMs]);

  const wsCurrent = ws !== null && ws.key === key && conn === 'open';
  const useRest = conn !== 'open' || (stalled && !wsCurrent);
  const q = useQuery({
    queryKey,
    queryFn: fetch,
    enabled: useRest,
    refetchInterval: useRest ? pollMs : false,
    retry: 1,
    staleTime: 1000,
  });

  const restData = q.data ?? null;
  const data = wsCurrent ? ws.data : (restData ?? ws?.data ?? null);
  const stale = !wsCurrent && !restData && ws !== null;
  const error = useRest && q.isError && !wsCurrent ? q.error : null;

  return {
    data,
    loading: !data && !error,
    stale,
    error,
    live: wsCurrent,
    retry: () => {
      realtime.connect();
      void q.refetch();
    },
    retrying: q.isFetching,
  };
}
