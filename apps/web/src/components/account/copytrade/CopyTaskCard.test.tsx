import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { shortAddress, type CopyTradeTask, type WalletProfile } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { WalletPreview } from '../previews';
import { CopyTaskCard } from './CopyTaskCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const A = 'YbPWk3m8nFJq5TzD2fW7cXy1B9vLq8Rr6sTyXoM';
const B = 'p8H9qR4tUvW2xYz3aBcD5eFgH6iJkLmN7oPvJVJ';

// Two unlabeled wallets with the same trading-style archetype.
const profile = (address: string) =>
  ({ chain: 'sol', address, label: null, remark: null, avatarSeed: address, tags: [], style: { title: 'Money Printer', subtitle: '', badges: [] }, stats: { '30d': { totalPnlUsd: 0, winRate: 0, tokensTraded: 0 } } }) as unknown as WalletProfile;

const task = (id: string, target: string) =>
  ({
    id,
    chain: 'sol',
    target,
    label: '',
    enabled: true,
    buyMode: 'fixed',
    buyAmount: 0.1,
    buyRatio: 1,
    maxPerToken: 1,
    minMarketCapUsd: null,
    maxMarketCapUsd: null,
    minLiquidityUsd: null,
    firstBuyOnly: false,
    sellMode: 'mirror',
    strategy: null,
    blacklist: [],
    presetId: 'p1',
    createdAt: 0,
    stats: { buys: 0, sells: 0, spentNative: 0, receivedNative: 0, lastCopiedAt: null },
  }) as unknown as CopyTradeTask;

function wrap(children: ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('copy-trade wallet names', () => {
  it('names unlabeled targets by address, with the style as a badge', async () => {
    vi.spyOn(api, 'wallet').mockImplementation(async (_chain, address) => profile(address));
    const noop = () => {};
    wrap(
      <>
        <CopyTaskCard task={task('t1', A)} onEdit={noop} onDelete={noop} onToggle={noop} toggling={false} />
        <CopyTaskCard task={task('t2', B)} onEdit={noop} onDelete={noop} onToggle={noop} toggling={false} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByText('Money Printer')).toHaveLength(2));
    const names = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(names).toEqual([`Copy task ${shortAddress(A)}`, `Copy task ${shortAddress(B)}`]);
    expect(screen.getByRole('button', { name: `Delete copy task ${shortAddress(B)}` })).toBeTruthy();
  });

  it('previews an unlabeled wallet by address too', async () => {
    vi.spyOn(api, 'wallet').mockImplementation(async (_chain, address) => profile(address));
    wrap(<WalletPreview chain="sol" address={A} />);
    await waitFor(() => expect(screen.getByText(shortAddress(A))).toBeTruthy());
    expect(screen.getByText('Money Printer')).toBeTruthy();
  });
});
