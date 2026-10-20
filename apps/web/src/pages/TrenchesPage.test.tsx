// Trading hotkeys are opt-in (PRD §11.6): on Trenches, 1-3 / J / K move the
// selection for everyone, but B only buys once trading hotkeys are turned on.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import type { Account, Quote, SwapReceipt, TokenDetail, TokenSummary, TrenchesColumn as Column, TrenchesSnapshot, UserSettings } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import TrenchesPage from './TrenchesPage';

vi.mock('@/lib/ws', () => ({
  realtime: { connect: () => {}, epoch: 1 },
  useConnectionState: () => 'closed',
  useChannel: () => {},
  useChannelState: () => null,
}));

// Plain columns that report what they display (the page's keyboard selection reads it).
vi.mock('@/components/discovery/TrenchesColumn', async (original) => ({
  ...(await original<typeof import('@/components/discovery/TrenchesColumn')>()),
  TrenchesColumn: ({ column, tokens, onDisplayed }: { column: Column; tokens: TokenSummary[] | null; onDisplayed?: (c: Column, t: TokenSummary[]) => void }) => {
    useEffect(() => onDisplayed?.(column, tokens ?? []), [column, tokens, onDisplayed]);
    return (
      <ul aria-label={column}>
        {(tokens ?? []).map((t) => (
          <li key={t.address}>{t.symbol}</li>
        ))}
      </ul>
    );
  },
}));

const TOKEN = { chain: 'sol', address: 'TokA', symbol: 'NOOMEO', creator: 'dev', createdAt: 1, stats: {}, security: { riskLevel: 'low' } } as unknown as TokenSummary;
const SNAPSHOT = { new: [TOKEN], almost: [], migrated: [] } as unknown as TrenchesSnapshot;
const initial = useSession.getState();

let swap: MockInstance<typeof api.swap>;
beforeEach(() => {
  const settings: UserSettings = { trade: DEFAULT_TRADE, display: { ...DEFAULT_DISPLAY, hotkeys: true, confirmTrades: false } };
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: {} } as unknown as Account, settings, ready: true });
  useUi.getState().setTradingHotkeys(false);
  vi.spyOn(api, 'trenches').mockResolvedValue(SNAPSHOT);
  vi.spyOn(api, 'follows').mockResolvedValue([]);
  vi.spyOn(api, 'blacklist').mockResolvedValue({ tokens: [], creators: [], keywords: [] });
  vi.spyOn(api, 'token').mockResolvedValue({ ...TOKEN, priceUsd: 1, stats: { '5m': { priceChange: 0 } }, security: { riskLevel: 'low', isHoneypot: null, checks: [], buyTax: 0, sellTax: 0 } } as unknown as TokenDetail);
  vi.spyOn(api, 'quote').mockResolvedValue({ priceImpact: 0.001, amountIn: 0.5, expectedOut: 1, networkFeeNative: 0.0001 } as Quote);
  swap = vi.spyOn(api, 'swap').mockResolvedValue({ ok: true } as SwapReceipt);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useUi.getState().setTradingHotkeys(false);
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <Routes>
          <Route path="/:chain/trenches" element={<TrenchesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const press = (key: string) => act(() => void fireEvent.keyDown(window, { key }));

describe('Trenches trading hotkeys', () => {
  it('are off by default: 1, J, B selects but does not buy', async () => {
    expect(useUi.getState().tradingHotkeys).toBe(false);
    renderPage();
    await screen.findAllByText('NOOMEO');
    press('1');
    press('j');
    press('b');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(swap).not.toHaveBeenCalled();
  });

  it('buy the selected card with B once turned on', async () => {
    useUi.getState().setTradingHotkeys(true);
    renderPage();
    await screen.findAllByText('NOOMEO');
    press('1');
    press('b');
    await waitFor(() => expect(swap).toHaveBeenCalledTimes(1));
    expect(swap.mock.calls[0][0]).toMatchObject({ token: 'TokA', side: 'buy', amountKind: 'native' });
  });
});
