// The token page keeps the token's signals (chart markers) from one REST read
// plus `signals` pushes on its token channel.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Signal } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { mergeTokenSignals, TOKEN_SIGNALS_CAP, useTokenSignals } from './queries';

vi.mock('@/lib/ws', () => ({ realtime: { connect: () => {}, epoch: 1 }, useConnectionState: () => 'open', useChannel: () => {} }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sig = (id: string, createdAt: number): Signal => ({ id, createdAt, kind: 'smart_buy' }) as Signal;

describe('token signals', () => {
  it('merges pushes newest first without duplicates, capped', () => {
    const merged = mergeTokenSignals([sig('b', 2), sig('a', 1)], [sig('c', 3), { ...sig('b', 2), title: 'updated' } as Signal]);
    expect(merged!.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(merged![1].title).toBe('updated');
    const many = Array.from({ length: TOKEN_SIGNALS_CAP + 10 }, (_, i) => sig(`s${i}`, i));
    expect(mergeTokenSignals([], many)).toHaveLength(TOKEN_SIGNALS_CAP);
    // nothing loaded yet: the REST read will bring them
    expect(mergeTokenSignals(undefined, [sig('x', 1)])).toBeUndefined();
  });

  it("reads the token's signals once", async () => {
    const read = vi.spyOn(api, 'tokenSignals').mockResolvedValue([sig('a', 1)]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTokenSignals('sol', 'TOKEN'), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(read).toHaveBeenCalledWith('sol', 'TOKEN', TOKEN_SIGNALS_CAP);
  });
});
