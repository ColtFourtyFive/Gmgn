import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { FeedItem, TokenRef } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { FEED_CAP, useLiveFeed } from './useLiveFeed';

// Capture the feed channel listener instead of opening a socket.
const channel = vi.hoisted(() => ({ push: null as ((type: string, data: unknown) => void) | null }));
vi.mock('@/lib/ws', () => ({
  realtime: { connect: () => {} },
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
function item(token: string): FeedItem {
  const id = `t${seq++}`;
  const ref = { chain: 'sol', address: token, symbol: token, marketCapUsd: 1000 } as TokenRef;
  return { trade: { id, chain: 'sol', token, timestamp: seq, side: 'buy' }, token: ref, isFirstBuy: false, isClose: false } as unknown as FeedItem;
}

describe('useLiveFeed', () => {
  it('keeps fresh ids and token refs bounded by the capped list', async () => {
    vi.spyOn(api, 'feed').mockResolvedValue([item('seed')]);
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useLiveFeed({ chain: 'sol', kind: 'all' }), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // A day of trades on many tokens, pushed in batches.
    for (let batch = 0; batch < 20; batch++) {
      act(() => channel.push!('feed', Array.from({ length: 50 }, (_, i) => item(`tok${batch * 50 + i}`))));
    }
    expect(result.current.items).toHaveLength(FEED_CAP);
    const shown = new Set(result.current.items.map((it) => it.trade.id));
    expect(result.current.freshIds.size).toBeLessThanOrEqual(FEED_CAP);
    for (const id of result.current.freshIds) expect(shown.has(id)).toBe(true);
    expect(result.current.tokens.size).toBeLessThanOrEqual(FEED_CAP);
    // The newest pushes are still highlighted.
    expect(result.current.freshIds.has(result.current.items[0].trade.id)).toBe(true);
  });

  it('keeps up to `cap` items when asked (the hot panel fills its 30-minute window)', async () => {
    vi.spyOn(api, 'feed').mockResolvedValue([item('seed')]);
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useLiveFeed({ chain: 'sol', kind: 'smart', cap: 1000 }), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    for (let batch = 0; batch < 12; batch++) {
      act(() => channel.push!('feed', Array.from({ length: 50 }, (_, i) => item(`tok${batch * 50 + i}`))));
    }
    expect(result.current.items).toHaveLength(601);
  });
});
