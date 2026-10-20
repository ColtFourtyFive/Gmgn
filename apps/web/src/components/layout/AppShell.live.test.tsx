// The whole shell adopts the mode from /api/meta: live shows its identity and
// live status, drops the launcher and every simulated / paper wording, and
// offers funding in the account menu; demo keeps its notice.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account, MetaResponse } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { LIVE_STATUS, leaveLive } from '@/testing/live';
import AppShell from './AppShell';

vi.mock('@/lib/ws', () => ({
  realtime: { connect: () => {}, epoch: 1, latency: 12, setToken: () => {}, onState: () => () => {} },
  useConnectionState: () => 'open',
  useChannel: () => {},
  useChannelState: () => null,
}));

const initial = useSession.getState();

// jsdom has no layout: the shell scrolls <main> to the top on navigation.
beforeAll(() => {
  Element.prototype.scrollTo ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

function meta(mode: 'live' | 'demo'): MetaResponse {
  return {
    serverTime: Date.now(),
    mode,
    enabledChains: mode === 'live' ? ['sol'] : ['sol', 'bsc', 'base', 'eth'],
    platformFeeRate: 0.01,
    chains: [],
    launchpads: [],
    sim: { seed: 's', startedAt: 0, speed: 1, tradesPerSecond: 3 },
    live: mode === 'live' ? { ...LIVE_STATUS, lastEventAt: Date.now() - 2_000 } : undefined,
    demoUrl: mode === 'live' ? 'https://demo.trenchscope.test' : null,
  };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  useSession.setState({
    token: 'tok',
    ready: true,
    account: { id: 'a1', username: 'alice', referralCode: 'ALICE', wallets: { sol: { chain: 'sol', address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', nativeBalance: 1.5, nativeBalanceUsd: 270 } } } as unknown as Account,
  });
  vi.spyOn(api, 'notifications').mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  leaveLive();
  useSession.setState(initial, true);
});

function renderShell() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/sol/trending']}>
        <AppShell>
          <h1>Trending</h1>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('live: Live badge, live status with Try demo, no launcher, no simulated / paper wording, funding in the account menu', async () => {
    vi.spyOn(api, 'meta').mockResolvedValue(meta('live'));
    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'Trenchscope — … with a built-in market simulator.';
    document.head.appendChild(description);
    renderShell();
    const header = screen.getByRole('banner');
    await waitFor(() => expect(within(header).getByText('Live')).toBeTruthy());
    expect(description.content).toMatch(/real-time Solana memecoin trading terminal/);
    description.remove();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Feed connected')).toBeTruthy();
    expect(within(footer).getByRole('link', { name: /Try demo/ })).toBeTruthy();
    expect(within(footer).getByText('1,234')).toBeTruthy(); // tokens tracked instead of simulated trades/s
    expect(screen.queryByRole('link', { name: 'Launch' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/simulat|paper/i);

    fireEvent.click(within(header).getByRole('button', { name: /alice · Account menu/ }));
    const menu = await screen.findByRole('menu', { name: 'Account' });
    expect(screen.getByText('Live account · code ALICE')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Withdraw/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Security/ })).toBeTruthy();
  });

  it('demo: Demo label and the simulated-market notice, as today', async () => {
    vi.spyOn(api, 'meta').mockResolvedValue(meta('demo'));
    renderShell();
    const header = screen.getByRole('banner');
    await waitFor(() => expect(within(header).getByText('Demo')).toBeTruthy());
    expect(within(screen.getByRole('contentinfo')).getByText('Simulated market · paper trading')).toBeTruthy();
    expect(screen.queryByText('Feed connected')).toBeNull();
  });
});
