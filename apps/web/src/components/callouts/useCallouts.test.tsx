import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Signal } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useCallouts } from './useCallouts';

// Capture the signals channel listener instead of opening a socket.
const channel = vi.hoisted(() => ({ push: null as ((type: string, data: unknown) => void) | null }));
vi.mock('@/lib/ws', () => ({
  realtime: { connect: () => {}, epoch: 1 },
  useConnectionState: () => 'open',
  useChannel: (ch: string | null, _params: unknown, onData: (type: string, data: unknown) => void) => {
    if (ch) channel.push = onData;
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let seq = 0;
function call(): Signal {
  seq++;
  return { id: `c${seq}`, chain: 'sol', kind: 'kol_call', token: { address: `t${seq}` }, maxMultiple: 1, wallets: ['caller'], createdAt: seq } as unknown as Signal;
}

function setup(rest: Signal[]) {
  let resolve: (v: Signal[]) => void = () => {};
  vi.spyOn(api, 'callouts').mockReturnValue(new Promise<Signal[]>((r) => (resolve = r)));
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useCallouts('sol', 'all', () => true), { wrapper });
  return { ...hook, load: () => act(async () => resolve(rest)) };
}

describe('useCallouts', () => {
  it('does not slide in the calls of a subscription snapshot', async () => {
    const history = [call(), call(), call()].reverse();
    const { result, load } = setup(history);
    // The socket's snapshot can land before the REST list: nothing is new yet.
    act(() => channel.push!('signals', history));
    expect(result.current.freshIds.size).toBe(0);
    await load();
    await waitFor(() => expect(result.current.calls).toHaveLength(3));

    // A reconnect re-sends the snapshot: still nothing new.
    act(() => channel.push!('signals', history));
    expect(result.current.freshIds.size).toBe(0);

    // A real new call slides in; the next snapshot does not add the old ones.
    const fresh = call();
    act(() => channel.push!('signals', [fresh]));
    expect([...result.current.freshIds]).toEqual([fresh.id]);
    act(() => channel.push!('signals', [fresh, ...history]));
    expect([...result.current.freshIds]).toEqual([fresh.id]);
    expect(result.current.calls.map((s) => s.id)).toEqual([fresh, ...history].map((s) => s.id));
  });

  it('flags calls missing from the loaded list after a REST load', async () => {
    const history = [call(), call()].reverse();
    const { result, load } = setup(history);
    await load();
    await waitFor(() => expect(result.current.calls).toHaveLength(2));
    const missed = call();
    // Snapshot after a reconnect holding a call made while offline.
    act(() => channel.push!('signals', [missed, ...history]));
    expect([...result.current.freshIds]).toEqual([missed.id]);
  });
});

describe('Top callers when the calls fail to load', () => {
  it('report the error instead of "No repeat callers yet" (hits filter, all filter with pushed calls)', async () => {
    const { useCallerRanking } = await import('./useCallouts');
    const { TopCallersPanel } = await import('./TopCallersPanel');
    const { render, screen } = await import('@testing-library/react');
    const { MemoryRouter } = await import('react-router-dom');
    vi.spyOn(api, 'callouts').mockRejectedValue(new Error('internal'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    for (const filter of ['hits', 'all'] as const) {
      const { result, unmount } = renderHook(
        () => {
          const feed = useCallouts('sol', filter, () => true);
          return useCallerRanking('sol', filter, feed);
        },
        { wrapper },
      );
      // A couple of calls pushed live on the "all" feed do not make the failed list a ranking.
      if (filter === 'all') act(() => channel.push!('signals', [call(), call()]));
      await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 5000 }); // the list query retries once
      expect(result.current.loading).toBe(false);
      const ranking = result.current;
      unmount();
      render(
        <MemoryRouter>
          <TopCallersPanel chain="sol" callers={ranking.callers} directory={() => null} loading={ranking.loading} error={ranking.error} onRetry={ranking.retry} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('alert').textContent).toContain('Couldn’t rank callers');
      expect(screen.queryByText('No repeat callers yet')).toBeNull();
      cleanup();
    }
  });
});
