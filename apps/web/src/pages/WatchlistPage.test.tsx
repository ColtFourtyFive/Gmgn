import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ChainId, TokenSummary, WatchlistResponse } from '@trenchscope/shared';
import type { ChainScope } from '@/components/account/queries';
import { WatchlistBody } from './WatchlistPage';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const token = (chain: ChainId, address: string) => ({ chain, address, symbol: address }) as TokenSummary;

function renderBody(data: WatchlistResponse, scope: ChainScope, group: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <WatchlistBody scope={scope} group={group} onGroup={() => {}} data={data} loading={false} error={null} refetch={() => {}} retrying={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const groups = [
  { id: 'g1', name: 'Majors', color: 'blue', order: 0 },
  { id: 'g2', name: 'Degen', color: 'red', order: 1 },
] as WatchlistResponse['groups'];
const data: WatchlistResponse = {
  items: [
    { chain: 'sol', address: 'SMUGL', addedAt: 1, groupIds: ['g1'] },
    { chain: 'bsc', address: 'PHOTO', addedAt: 2 },
  ],
  tokens: [token('sol', 'SMUGL'), token('bsc', 'PHOTO')],
  groups,
};

describe('Watchlist empty states', () => {
  it('says the chain filter hides a group that has tokens elsewhere', () => {
    renderBody(data, 'bsc', 'g1');
    expect(screen.getByText('Nothing in Majors on BNB Chain')).toBeTruthy();
    expect(screen.getByText(/Majors has 1 token on other chains/)).toBeTruthy();
    expect(screen.queryByText(/Nothing in Majors yet/)).toBeNull();
  });

  it('keeps "yet" for a group with no tokens at all', () => {
    renderBody(data, 'bsc', 'g2');
    expect(screen.getByText('Nothing in Degen yet')).toBeTruthy();
  });
});
