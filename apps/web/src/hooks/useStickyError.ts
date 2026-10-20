import { useRef } from 'react';

interface QueryLike {
  error: unknown;
  isError: boolean;
  data: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

/**
 * A query's error that survives its own refetches. React Query puts a query
 * that has no data back to `pending` (error cleared) while it refetches, so
 * an error state would swap to a skeleton on every poll or retry and mount a
 * fresh role="alert" each time: screen readers re-announced the failure every
 * few seconds and the Retry button lost focus. Cleared once data arrives or
 * the query stops fetching without an error (e.g. it was disabled).
 */
export function useStickyError(q: QueryLike): unknown {
  const last = useRef<unknown>(null);
  if (q.isError) last.current = q.error;
  else if (q.data !== undefined || q.fetchStatus === 'idle') last.current = null;
  return q.isError ? q.error : last.current;
}
