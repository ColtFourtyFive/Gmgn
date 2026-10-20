import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Trade } from '@trenchscope/shared';
import { useWalletLive } from './WalletActivity';

// Capture the wallet channel listener and drive the connection epoch by hand.
const channel = vi.hoisted(() => ({ push: null as ((type: string, data: unknown) => void) | null }));
const realtime = vi.hoisted(() => ({ epoch: 1, connect: () => {} }));
vi.mock('@/lib/ws', () => ({
  realtime,
  useConnectionState: () => 'open',
  useChannel: (ch: string | null, _params: unknown, onData: (type: string, data: unknown) => void) => {
    if (ch) channel.push = onData;
  },
}));

afterEach(() => {
  cleanup();
  realtime.epoch = 1;
});

let seq = 0;
const trade = (): Trade => ({ id: `w${seq++}`, chain: 'sol', token: 'tok', timestamp: seq }) as unknown as Trade;

function setup() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useWalletLive('sol', 'addr'), { wrapper });
  return { ...hook, invalidate };
}

describe('useWalletLive', () => {
  it('treats the snapshot after a reconnect as history, not as live trades', () => {
    vi.useFakeTimers();
    try {
      const { result, invalidate } = setup();
      const history = [trade(), trade(), trade()].reverse();
      act(() => channel.push!('trades', history));
      expect(result.current.trades).toHaveLength(0);

      const live = trade();
      act(() => channel.push!('trades', [live]));
      expect(result.current.trades.map((t) => t.id)).toEqual([live.id]);
      act(() => void vi.runAllTimers());
      expect(invalidate).toHaveBeenCalled();
      invalidate.mockClear();

      // Reconnect: the server re-sends its recent-trades snapshot, nothing new happened.
      realtime.epoch = 2;
      act(() => channel.push!('trades', [live, ...history]));
      expect(result.current.trades.map((t) => t.id)).toEqual([live.id]);
      expect([...result.current.liveIds]).toEqual([live.id]);
      act(() => void vi.runAllTimers());
      expect(invalidate).not.toHaveBeenCalled();

      // A trade made while offline is in the next reconnect snapshot: that one is new.
      const missed = trade();
      realtime.epoch = 3;
      act(() => channel.push!('trades', [missed, live, ...history]));
      expect(result.current.trades.map((t) => t.id)).toEqual([missed.id, live.id]);
      expect(result.current.liveIds.has(missed.id)).toBe(true);
      for (const t of history) expect(result.current.liveIds.has(t.id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the live-id set bounded by the capped trade list', () => {
    const { result } = setup();
    act(() => channel.push!('trades', []));
    for (let i = 0; i < 30; i++) act(() => channel.push!('trades', Array.from({ length: 10 }, trade)));
    const shown = new Set(result.current.trades.map((t) => t.id));
    expect(shown.size).toBe(100);
    expect(result.current.liveIds.size).toBe(100);
    for (const id of result.current.liveIds) expect(shown.has(id)).toBe(true);
  });
});
