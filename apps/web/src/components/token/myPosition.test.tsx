// The token page's position and fills must not depend on where the token
// ranks in capped account-wide lists (200 holdings by value, 200 latest fills).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Account, FeedItem, Position, TokenPositionRow, Trade } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { HOLDINGS_MAX, useMyPosition } from './queries';
import { mergeFills, positionEventOfTrade } from './tabs/PositionTab';

vi.mock('@/lib/ws', () => ({ realtime: { connect: () => {}, epoch: 1 }, useConnectionState: () => 'open', useChannel: () => {} }));

const ME = 'MyWa11et';
const initial = useSession.getState();

beforeEach(() => {
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: { sol: { address: ME } } } as unknown as Account, ready: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

const holding = (token: string) => ({ token, wallet: ME, balance: 1 }) as TokenPositionRow;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useMyPosition', () => {
  it('reads the whole holdings list (closed and small positions included), not the default 200 by value', async () => {
    const holdings = vi.spyOn(api, 'walletHoldings').mockResolvedValue([...Array.from({ length: 329 }, (_, i) => holding(`T${i}`)), { ...holding('X'), balance: 0 }]);
    const traders = vi.spyOn(api, 'topTraders');
    const { result } = renderHook(() => useMyPosition('sol', 'X'), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ token: 'X', balance: 0 }));
    expect(holdings.mock.calls[0][2]).toMatchObject({ includeClosed: true, limit: HOLDINGS_MAX });
    expect(traders).not.toHaveBeenCalled();
  });

  it('asks the token for the wallet\'s row when the account holds more positions than one read', async () => {
    vi.spyOn(api, 'walletHoldings').mockResolvedValue(Array.from({ length: HOLDINGS_MAX }, (_, i) => holding(`T${i}`)));
    const mine = { token: 'X', wallet: ME, balance: 0, realizedPnlUsd: -1.38 } as Position;
    const traders = vi.spyOn(api, 'topTraders').mockResolvedValue([{ ...mine, wallet: 'BundleWallet' }, mine]);
    const { result } = renderHook(() => useMyPosition('sol', 'X'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(mine));
    expect(traders.mock.calls[0]).toEqual(['sol', 'X', { tag: 'you', limit: 500 }]);
  });

  it('is null for a token never traded', async () => {
    vi.spyOn(api, 'walletHoldings').mockResolvedValue([holding('T1')]);
    const { result } = renderHook(() => useMyPosition('sol', 'X'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('Position tab fills', () => {
  const SUPPLY = 1e9;
  const tr = (id: string, side: 'buy' | 'sell', tokenAmount: number, heldAfter: number, ts: number) =>
    ({ id, token: 'X', side, tokenAmount, makerHoldRate: heldAfter / SUPPLY, timestamp: ts }) as Trade;

  it('derives open / add / reduce / close like the server', () => {
    expect(positionEventOfTrade(tr('a', 'buy', 100, 100, 1), SUPPLY)).toBe('open');
    expect(positionEventOfTrade(tr('b', 'buy', 100, 250, 2), SUPPLY)).toBe('add');
    expect(positionEventOfTrade(tr('c', 'sell', 50, 200, 3), SUPPLY)).toBe('reduce');
    expect(positionEventOfTrade(tr('d', 'sell', 200, 0, 4), SUPPLY)).toBe('close');
  });

  it("merges the token's own history for the wallet with the account's latest fills, newest first, without duplicates", () => {
    const own = [tr('d', 'sell', 200, 0, 4), tr('a', 'buy', 100, 100, 1)];
    const recent = [
      { trade: tr('d', 'sell', 200, 0, 4), positionEvent: 'close', isFirstBuy: false, isClose: true },
      { trade: { ...tr('z', 'buy', 1, 1, 9), token: 'OTHER' }, positionEvent: 'open', isFirstBuy: true, isClose: false },
      { trade: tr('old', 'buy', 5, 5, 0), positionEvent: 'open', isFirstBuy: true, isClose: false },
    ] as FeedItem[];
    const fills = mergeFills(own, recent, { address: 'X', totalSupply: SUPPLY });
    expect(fills.map((f) => f.trade.id)).toEqual(['d', 'a', 'old']);
    expect(fills.map((f) => f.positionEvent)).toEqual(['close', 'open', 'open']);
    expect(fills[2].isFirstBuy).toBe(true);
  });
});
