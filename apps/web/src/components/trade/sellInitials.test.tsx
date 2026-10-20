// "Sell initials" from positions views: sized by the server, run as a one-click
// sell of an exact token amount, and unavailable (with the reason) under water.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Account, Quote, SellInitialsQuote, SwapReceipt, TokenDetail, UserSettings } from '@trenchscope/shared';
import { SellInitialsRow } from '@/components/token/trade/SellInitials';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useToasts } from '@/store/toasts';
import { initialsSummary, initialsUnavailableReason, SellInitialsButton } from './sellInitials';

const initial = useSession.getState();

const OK: SellInitialsQuote = {
  chain: 'sol',
  token: 'TokA',
  status: 'ok',
  balance: 1_000_000,
  costBasisUsd: 185,
  targetNative: 1,
  tokens: 420_000,
  sellRate: 0.42,
  expectedOutNative: 1.0000001,
  exitValueNative: 2.3,
};
const UNDER: SellInitialsQuote = { ...OK, status: 'under_water', tokens: null, sellRate: null, expectedOutNative: 0, exitValueNative: 0.6 };

let swap: MockInstance<typeof api.swap>;
let size: MockInstance<typeof api.sellInitials>;

beforeEach(() => {
  const settings: UserSettings = { trade: DEFAULT_TRADE, display: { ...DEFAULT_DISPLAY, confirmTrades: false } };
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: {} } as unknown as Account, settings, ready: true });
  swap = vi.spyOn(api, 'swap').mockResolvedValue({ ok: true } as SwapReceipt);
  size = vi.spyOn(api, 'sellInitials').mockResolvedValue(OK);
  // a calm token and a small quote: no safety gate asks for an extra click
  vi.spyOn(api, 'token').mockResolvedValue({ chain: 'sol', address: 'TokA', symbol: 'PEPE', priceUsd: 1, stats: { '5m': { priceChange: 0.01 } }, security: { riskLevel: 'low', isHoneypot: null, rugRatio: 0.02, checks: [], buyTax: 0, sellTax: 0 } } as unknown as TokenDetail);
  vi.spyOn(api, 'quote').mockResolvedValue({ priceImpact: 0.002, amountIn: 420_000, expectedOut: 1, networkFeeNative: 0.00001 } as Quote);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
  useToasts.setState({ toasts: [] });
});

function wrap(children: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('sell initials', () => {
  it('explains why it is unavailable and what it would do', () => {
    expect(initialsUnavailableReason(OK, 'PEPE')).toBeNull();
    expect(initialsUnavailableReason(UNDER, 'PEPE')).toMatch(/^Under water: selling all your PEPE now returns about 0\.6 SOL after fees, less than the 1 SOL it cost/);
    expect(initialsUnavailableReason({ ...UNDER, status: 'no_position' }, 'PEPE')).toBe('You don’t hold PEPE.');
    expect(initialsSummary(OK, 'PEPE')).toMatch(/^Sells 42(\.0)?% of your PEPE for ≈ 1 SOL/);
  });

  it('sells exactly the sized token amount from a positions row', async () => {
    wrap(<SellInitialsButton chain="sol" token="TokA" symbol="PEPE" underWater={false} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sell initials of PEPE' })));
    await waitFor(() => expect(swap).toHaveBeenCalled());
    expect(size).toHaveBeenCalledWith({ chain: 'sol', token: 'TokA', presetId: DEFAULT_TRADE.sol.activeSellPreset });
    expect(swap.mock.calls[0][0]).toMatchObject({ chain: 'sol', token: 'TokA', side: 'sell', amount: 420_000, amountKind: 'tokens' });
  });

  it('under water: stays focusable but does nothing except say why', async () => {
    wrap(<SellInitialsButton chain="sol" token="TokA" symbol="PEPE" underWater />);
    const btn = screen.getByRole('button', { name: 'Sell initials of PEPE' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(btn.getAttribute('aria-describedby')!)!.textContent).toMatch(/^Under water/);
    await act(async () => fireEvent.click(btn));
    expect(size).not.toHaveBeenCalled();
    expect(swap).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts.map((t) => t.title)).toEqual(['Nothing to take out']);
  });

  it('a bag that fell under water since the row rendered is not sold', async () => {
    size.mockResolvedValue(UNDER);
    wrap(<SellInitialsButton chain="sol" token="TokA" symbol="PEPE" underWater={false} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sell initials of PEPE' })));
    await waitFor(() => expect(useToasts.getState().toasts).toHaveLength(1));
    expect(useToasts.getState().toasts[0].body).toMatch(/^Under water/);
    expect(swap).not.toHaveBeenCalled();
  });

  it('trade panel: shows the live sizing, and under water disables the action with the reason', async () => {
    const token = { chain: 'sol', address: 'TokA', symbol: 'PEPE' } as TokenDetail;
    const onSell = vi.fn();
    size.mockResolvedValue(UNDER);
    const view = wrap(<SellInitialsRow token={token} presetId="P1" balance={1_000_000} onSell={onSell} pending={false} />);
    expect(await screen.findByText(/^Under water/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sell initials' }).getAttribute('aria-disabled')).toBe('true');
    view.unmount();

    size.mockResolvedValue(OK);
    wrap(<SellInitialsRow token={token} presetId="P1" balance={1_000_000} onSell={onSell} pending={false} />);
    expect(await screen.findByText(/^Sells 42/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sell initials' })));
    await waitFor(() => expect(onSell).toHaveBeenCalledWith(OK));
  });
});
