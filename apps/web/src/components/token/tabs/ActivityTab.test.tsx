// Live (broadcast) trades carry the wallet's public label; the viewer's remark
// must be applied to them as REST rows already have it, or one followed wallet
// shows under two names in the same table.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account, FollowedWallet, TokenDetail, Trade } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { TokenFeed, TokenFeedContext } from '../feed';
import { ActivityTab } from './ActivityTab';

vi.mock('@/lib/ws', () => ({
  realtime: { connect: () => {}, epoch: 1 },
  useConnectionState: () => 'open',
  useChannel: () => {},
  useChannelState: () => null,
}));

const FRIEND = 'qrSdFriendWallet1111111111111111111111p6n8';
const initial = useSession.getState();

function trade(id: string, ts: number, label: string): Trade {
  return {
    id,
    chain: 'sol',
    token: 'TokA',
    tokenSymbol: 'HOSH',
    wallet: FRIEND,
    walletTags: [],
    walletLabel: label,
    side: 'buy',
    nativeAmount: 1,
    tokenAmount: 1000,
    usdAmount: 150,
    priceUsd: 0.15,
    priceNative: 0.001,
    marketCapUsd: 150_000,
    timestamp: ts,
    txHash: `tx${id}`,
    block: 1,
    isDev: false,
    makerHoldRate: 0.001,
    realizedPnlUsd: null,
  };
}

beforeEach(() => {
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: {} } as unknown as Account, ready: true });
  vi.spyOn(api, 'follows').mockResolvedValue([{ chain: 'sol', address: FRIEND, remark: 'FriendB', group: 'Default', notify: false } as FollowedWallet]);
  // REST already applies the viewer's remark.
  vi.spyOn(api, 'trades').mockResolvedValue([trade('rest1', Date.now() - 60_000, 'FriendB')]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

describe('ActivityTab maker labels', () => {
  it('shows a followed wallet by its remark on live rows too', async () => {
    const feed = new TokenFeed();
    const token = { chain: 'sol', address: 'TokA', symbol: 'HOSH', nativeUsd: 150 } as unknown as TokenDetail;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TokenFeedContext.Provider value={feed}>
            <ActivityTab token={token} maxHeight={400} />
          </TokenFeedContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('FriendB')).toHaveLength(1));
    // Two live buys arrive with the public (short address) label.
    act(() => feed.pushTrades([trade('live1', Date.now() - 1000, 'qrSd...p6n8'), trade('live2', Date.now(), 'qrSd...p6n8')]));
    await waitFor(() => expect(screen.getAllByText('FriendB')).toHaveLength(3));
    expect(screen.queryByText('qrSd...p6n8')).toBeNull();
    // The size filter is named for what it chooses, not only its value.
    expect(screen.getByRole('button', { name: 'Minimum trade size Any size' })).toBeTruthy();
  });
});
