import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { LeaderboardRow } from '@trenchscope/shared';
import { api } from '@/lib/api';
import LeaderboardPage, { rankMap } from './LeaderboardPage';

function row(address: string, pnl: number): LeaderboardRow {
  return {
    chain: 'sol',
    address,
    label: address,
    avatarSeed: address,
    tags: [],
    nativeBalance: 1,
    stats: {
      realizedPnlUsd: pnl,
      totalPnlUsd: pnl,
      pnlRate: 0,
      totalCostUsd: 1,
      winRate: 0.5,
      wins: 1,
      losses: 1,
      tokensTraded: 3,
      buys: 1,
      sells: 1,
      buyVolumeUsd: 1,
      sellVolumeUsd: 1,
      avgBuyUsd: 1,
      avgHoldSeconds: 60,
      distribution: { gt500: 0, p200to500: 0, p0to200: 1, n0to50: 1, lt50: 0 },
    },
    style: { copyScore: 50 },
    lastActiveAt: 1,
    followerCount: 0,
    isFollowed: false,
  } as unknown as LeaderboardRow;
}

const BEST = [row('alpha', 3280), row('bravo', 2370), row('charlie', 2160), row('delta', 900)];

beforeEach(() => {
  localStorage.clear();
  // The server answers each order with its own end of the ranking.
  vi.spyOn(api, 'leaderboard').mockImplementation(async (_chain, q) => (q?.order === 'asc' ? [row('loser', -73.75), row('meh', -30.22), row('ok', 53.11)] : BEST));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('leaderboard ranks', () => {
  it('rankMap ranks only the default PnL ranking', () => {
    expect(rankMap(BEST, { key: 'pnl', dir: 'desc' })?.get('charlie')).toBe(3);
    expect(rankMap(BEST, { key: 'pnl', dir: 'asc' })).toBeNull();
    expect(rankMap(BEST, { key: 'last', dir: 'desc' })).toBeNull();
  });

  it('crowns the top of the PnL ranking, and nobody once the table is sorted ascending', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/sol/leaderboard']}>
          <Routes>
            <Route path="/:chain/leaderboard" element={<LeaderboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const first = await screen.findByLabelText('Rank 1');
    expect(first.closest('tr')!.textContent).toContain('alpha');

    // Realized PnL is the default sort: one click flips it to ascending (the bottom of the ranking).
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Realized PnL/ })).getByRole('button'));
    await waitFor(() => expect(screen.getAllByText('loser').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByLabelText(/^Rank \d/)).toBeNull());
  });
});
