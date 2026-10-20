import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import type { Account, Quote, SwapReceipt, TokenDetail, TokenPositionRow, UserSettings } from '@trenchscope/shared';
import { PositionTab } from '@/components/token/tabs/PositionTab';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { QuickBuyButton } from './QuickBuyButton';
import { useQuickTrade } from './useQuickTrade';

const initial = useSession.getState();

function signIn(confirmTrades: boolean) {
  const settings: UserSettings = { trade: DEFAULT_TRADE, display: { ...DEFAULT_DISPLAY, confirmTrades } };
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'guest-1', isGuest: true, wallets: {} } as unknown as Account, settings, ready: true });
}

let swap: MockInstance<typeof api.swap>;
beforeEach(() => {
  swap = vi.spyOn(api, 'swap').mockResolvedValue({ ok: true } as SwapReceipt);
  vi.spyOn(api, 'portfolioActivity').mockResolvedValue([]);
  vi.spyOn(api, 'trades').mockResolvedValue([]);
  // A calm, low-risk token and a small quote: no safety gate fires.
  vi.spyOn(api, 'token').mockResolvedValue(tokenDetail());
  vi.spyOn(api, 'quote').mockResolvedValue(quote());
});

function tokenDetail(over: { riskLevel?: 'low' | 'high'; isHoneypot?: boolean; drop5m?: number } = {}): TokenDetail {
  return {
    chain: 'sol',
    address: 'TokA',
    symbol: 'PEPE',
    priceUsd: 1,
    stats: { '5m': { priceChange: over.drop5m ?? 0.02 } },
    security: { riskLevel: over.riskLevel ?? 'low', isHoneypot: over.isHoneypot ?? null, rugRatio: over.riskLevel === 'high' ? 0.4 : 0.02, checks: [], buyTax: 0, sellTax: 0 },
  } as unknown as TokenDetail;
}

function quote(priceImpact = 0.004): Quote {
  return { chain: 'sol', token: 'TokA', side: 'buy', amountIn: 0.5, expectedOut: 1000, minOut: 900, priceImpact, networkFeeNative: 0.001 } as Quote;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

function wrap(children: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('"Confirm trades" on one-click trades', () => {
  it('the ⚡ quick buy asks first, inside a clickable row', async () => {
    signIn(true);
    const rowClick = vi.fn();
    wrap(
      <div onClick={rowClick}>
        <QuickBuyButton chain="sol" token="TokA" symbol="PEPE" amount={0.5} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Buy 0.5 SOL of PEPE' }));
    expect(await screen.findByRole('dialog', { name: 'Buy 0.5 SOL of PEPE?' })).toBeTruthy();
    expect(swap).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buy' })));
    expect(swap).toHaveBeenCalledTimes(1);
    expect(swap.mock.calls[0][0]).toMatchObject({ chain: 'sol', token: 'TokA', side: 'buy', amount: 0.5, amountKind: 'native' });
    // Clicks in the portaled dialog do not reach the row (it would open the token page).
    expect(rowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the ⚡ quick buy runs at once with the setting off', async () => {
    signIn(false);
    wrap(<QuickBuyButton chain="sol" token="TokA" symbol="PEPE" amount={0.5} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buy 0.5 SOL of PEPE' })));
    await waitFor(() => expect(swap).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("the token page's quick sell asks first", async () => {
    signIn(true);
    const token = { chain: 'sol', address: 'TokA', symbol: 'PEPE', priceUsd: 1 } as TokenDetail;
    const position = { balance: 100, costBasisUsd: 50, realizedPnlUsd: 0, boughtUsd: 50, soldUsd: 0, avgBuyPriceUsd: 0.5, buys: 1, sells: 0, firstBuyAt: 1, holdSeconds: 60 } as TokenPositionRow;
    wrap(<PositionTab token={token} position={position} loading={false} error={null} onRetry={() => {}} maxHeight={300} />);
    fireEvent.click(screen.getByRole('button', { name: '100%' }));
    expect(await screen.findByRole('dialog', { name: 'Sell 100% of PEPE?' })).toBeTruthy();
    expect(swap).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sell' })));
    expect(swap.mock.calls[0][0]).toMatchObject({ token: 'TokA', side: 'sell', amount: 100, amountKind: 'percent' });
  });

  it('a held order keeps the token it was placed on (Trenches B while the selection moves)', async () => {
    signIn(true);
    function Board() {
      const [token, setToken] = useState('TokA');
      const quick = useQuickTrade('sol', token, token === 'TokA' ? 'AAA' : undefined);
      return (
        <>
          <button type="button" onClick={() => quick.submit({ side: 'buy', amount: 1 })}>
            Hotkey B
          </button>
          <button type="button" onClick={() => setToken('')}>
            Deselect
          </button>
          {quick.dialog}
        </>
      );
    }
    wrap(<Board />);
    fireEvent.click(screen.getByRole('button', { name: 'Hotkey B' }));
    expect(await screen.findByRole('dialog', { name: 'Buy 1 SOL of AAA?' })).toBeTruthy();
    // The selected token leaves the column while the dialog is open.
    fireEvent.click(screen.getByRole('button', { name: 'Deselect', hidden: true }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buy' })));
    expect(swap.mock.calls[0][0]).toMatchObject({ token: 'TokA', side: 'buy', amount: 1 });
  });
});

describe('safety gates on one-click trades', () => {
  it('a ⚡ quick buy of a high-risk token needs the same acknowledgement as the trade panel', async () => {
    signIn(false);
    vi.mocked(api.token).mockResolvedValue(tokenDetail({ riskLevel: 'high' }));
    wrap(<QuickBuyButton chain="sol" token="TokA" symbol="PEPE" amount={0.5} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy 0.5 SOL of PEPE' }));
    const dialog = await screen.findByRole('dialog', { name: 'High-risk token: PEPE' });
    expect(dialog.textContent).toContain('High risk level — rug ratio 40%');
    const buy = screen.getByRole('button', { name: 'Buy anyway' });
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(buy);
    expect(swap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand the risks and want to buy' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buy anyway' })));
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('a large price impact or a 5m drop asks for an extra click (soft gates)', async () => {
    signIn(false);
    vi.mocked(api.quote).mockResolvedValue(quote(0.195));
    vi.mocked(api.token).mockResolvedValue(tokenDetail({ drop5m: -0.15 }));
    wrap(<QuickBuyButton chain="sol" token="TokA" symbol="PEPE" amount={20} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy 20 SOL of PEPE' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buy 20 SOL of PEPE?' });
    expect(dialog.textContent).toContain('Price impact 19.5%');
    expect(dialog.textContent).toContain('Falling knife: down 15% in 5m');
    expect(swap).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buy anyway' })));
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('sells skip the high-risk gate (it only guards buys)', async () => {
    signIn(false);
    vi.mocked(api.token).mockResolvedValue(tokenDetail({ riskLevel: 'high', isHoneypot: true }));
    function Seller() {
      const quick = useQuickTrade('sol', 'TokA', 'PEPE');
      return (
        <>
          <button type="button" onClick={() => quick.submit({ side: 'sell', percent: 50 })}>
            Sell half
          </button>
          {quick.dialog}
        </>
      );
    }
    wrap(<Seller />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sell half' })));
    await waitFor(() => expect(swap).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
