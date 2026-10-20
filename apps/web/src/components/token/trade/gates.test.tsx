// Soft gates (PRD TE-82) on the trade panel: price impact, falling knife and
// fees warn and need an extra click; the panel checks the quote of the exact
// order it sends.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Account, Quote, SwapReceipt, SwapRequest, TokenDetail } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { softGateReasons } from '../model';
import { useTradeExecutor } from './useTradeExecutor';

const initial = useSession.getState();

const token = {
  chain: 'sol',
  address: 'TokA',
  symbol: 'LCAT',
  priceUsd: 2,
  stats: { '5m': { priceChange: 0.01 } },
  security: { riskLevel: 'low', isHoneypot: null, rugRatio: 0.05, checks: [], buyTax: 0, sellTax: 0 },
} as unknown as TokenDetail;

const quote = (over: Partial<Quote> = {}) => ({ chain: 'sol', token: 'TokA', side: 'buy', amountIn: 20, expectedOut: 1e6, minOut: 9e5, priceImpact: 0.005, networkFeeNative: 0.002, ...over }) as Quote;

describe('softGateReasons', () => {
  it('flags price impact above 3%, a 5m drop of 10% or more on buys, and fees above 3% of the trade', () => {
    expect(softGateReasons(token, 'buy', quote())).toEqual([]);
    expect(softGateReasons(token, 'buy', quote({ priceImpact: 0.031 }))[0]).toMatch(/^Price impact 3\.1%/);
    const falling = { ...token, stats: { '5m': { priceChange: -0.1 } } } as unknown as TokenDetail;
    expect(softGateReasons(falling, 'buy', null)).toEqual([expect.stringMatching(/^Falling knife: down 10% in 5m\. A limit buy near \$1\.8/)]);
    expect(softGateReasons(falling, 'sell', null)).toEqual([]);
    // 0.02 SOL of fees on a 0.5 SOL buy = 4%.
    expect(softGateReasons(token, 'buy', quote({ amountIn: 0.5, networkFeeNative: 0.02 }))).toEqual([expect.stringMatching(/^Fees: network fee take about 4%/)]);
    // Token tax counts too.
    const taxed = { ...token, security: { ...token.security, sellTax: 0.05 } } as unknown as TokenDetail;
    expect(softGateReasons(taxed, 'sell', quote({ side: 'sell', expectedOut: 10 }))).toEqual([expect.stringMatching(/^Fees: network fee and token tax take about 5%/)]);
  });
});

describe('trade panel soft gates', () => {
  let swap: MockInstance<typeof api.swap>;
  beforeEach(() => {
    useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true } as Account, settings: { trade: DEFAULT_TRADE, display: DEFAULT_DISPLAY }, ready: true });
    swap = vi.spyOn(api, 'swap').mockResolvedValue({ ok: true, orders: [], mevLossNative: 0, tokenAmount: 1, nativeAmount: 20, priceUsd: 2, latencyMs: 1 } as unknown as SwapReceipt);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useSession.setState({ ...initial, token: null, account: null, settings: null });
  });

  function Panel({ req }: { req: SwapRequest }) {
    const exec = useTradeExecutor(token);
    return (
      <>
        <button type="button" onClick={() => exec.submit(req, <span>summary</span>)}>
          Submit
        </button>
        {exec.dialog}
      </>
    );
  }

  const buy20: SwapRequest = { chain: 'sol', token: 'TokA', side: 'buy', amount: 20, amountKind: 'native', presetId: 'P2' };

  it('a 19.5%-impact buy needs an extra click', async () => {
    const quoteSpy = vi.spyOn(api, 'quote').mockResolvedValue(quote({ priceImpact: 0.195 }));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Panel req={buy20} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check this buy' });
    expect(dialog.textContent).toContain('Price impact 19.5%');
    // The quote checked is the one of the exact order sent.
    expect(quoteSpy.mock.calls[0][0]).toEqual({ chain: 'sol', token: 'TokA', side: 'buy', amount: 20, amountKind: 'native', presetId: 'P2' });
    expect(swap).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Buy anyway' })));
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('a small, calm buy runs on one click', async () => {
    vi.spyOn(api, 'quote').mockResolvedValue(quote());
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Panel req={buy20} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(swap).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
