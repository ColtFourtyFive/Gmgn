import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useStickyError } from './useStickyError';

afterEach(cleanup);

describe('useStickyError', () => {
  it('keeps a failed query in its error state while it refetches (no skeleton / re-announced alert per poll)', async () => {
    let calls = 0;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const seen: { isError: boolean; failed: boolean; data: boolean }[] = [];
    const { result } = renderHook(
      () => {
        const q = useQuery({
          queryKey: ['sticky'],
          queryFn: async () => {
            calls++;
            await new Promise((r) => setTimeout(r, 20)); // a request takes a while: the pending state renders
            if (calls < 3) throw new Error('Server unreachable');
            return ['ok'];
          },
          refetchInterval: 50,
        });
        const failed = useStickyError(q);
        seen.push({ isError: q.isError, failed: failed !== null, data: q.data !== undefined });
        return { q, failed };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.q.data).toEqual(['ok']));
    expect(result.current.failed).toBeNull();
    const afterFirstError = seen.slice(seen.findIndex((s) => s.failed));
    // React Query did reset the failed query (no error) while refetching...
    expect(afterFirstError.some((s) => !s.isError && !s.data)).toBe(true);
    // ...yet every render until data arrived still reported the error.
    expect(afterFirstError.filter((s) => !s.data).every((s) => s.failed)).toBe(true);
  });

  it('follows a query through error, refetch and recovery', () => {
    const err = new Error('down');
    const { result, rerender } = renderHook((q: Parameters<typeof useStickyError>[0]) => useStickyError(q), {
      initialProps: { isError: true, error: err, data: undefined, fetchStatus: 'idle' },
    });
    expect(result.current).toBe(err);
    rerender({ isError: false, error: null, data: undefined, fetchStatus: 'fetching' });
    expect(result.current).toBe(err);
    rerender({ isError: false, error: null, data: [1], fetchStatus: 'idle' });
    expect(result.current).toBeNull();
  });
});
