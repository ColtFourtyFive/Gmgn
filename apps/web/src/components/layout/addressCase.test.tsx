import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SearchResult } from '@trenchscope/shared';
import { useTokenDetail, useTokenStream } from '@/components/token';
import { api } from '@/lib/api';
import TokenPage from '@/pages/TokenPage';
import { resolveAddress, sameAddress } from './Omnibox';

vi.mock('@/components/token', async (load) => ({
  ...(await load<typeof import('@/components/token')>()),
  useTokenDetail: vi.fn(() => ({ data: undefined, error: null, isError: false, isFetching: false, refetch: vi.fn() })),
  useTokenStream: vi.fn(),
}));

const LOWER = '0x0e3311264ef5a0d74879d8eab19b34d00fc23ca2';
const CHECKSUM = '0x0E3311264EF5A0D74879D8EAB19B34D00FC23CA2';
const SOL = '4Ukp8kQ9mBqfmvR7oNpZ1cQ5zEWb1Lk3ndTzQ6pitAbc';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('pasted EVM addresses are case-insensitive', () => {
  it('sameAddress ignores case for EVM hex only', () => {
    expect(sameAddress(LOWER, CHECKSUM)).toBe(true);
    expect(sameAddress(SOL, SOL.toLowerCase())).toBe(false);
  });

  it('resolveAddress opens the token page for a checksummed token address', async () => {
    vi.spyOn(api, 'search').mockResolvedValue({ tokens: [{ chain: 'bsc', address: LOWER }], wallets: [] } as unknown as SearchResult);
    expect(await resolveAddress(CHECKSUM, 'sol')).toBe(`/bsc/token/${LOWER}`);
  });

  it('the token page loads and streams the canonical (lower-case) address', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[`/bsc/token/${CHECKSUM}`]}>
          <Routes>
            <Route path="/:chain/token/:address" element={<TokenPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(vi.mocked(useTokenDetail)).toHaveBeenCalledWith('bsc', LOWER);
    expect(vi.mocked(useTokenStream).mock.calls[0].slice(0, 2)).toEqual(['bsc', LOWER]);
  });
});
