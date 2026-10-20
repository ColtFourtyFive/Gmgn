import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Quote, QuoteRequest } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { QuotePreview, useLiveQuote, type QuoteParams } from './QuotePreview';

const initial = useSession.getState();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState(initial, true);
});

function quoteFor(req: QuoteRequest, impact = 0.01): Quote {
  return {
    chain: req.chain,
    token: req.token,
    side: req.side,
    amountIn: req.amount,
    expectedOut: req.side === 'buy' ? req.amount * 1e6 : req.amount / 100,
    minOut: 0,
    priceImpact: impact,
    executionPriceUsd: 0.0001,
    platformFeeNative: 0.001,
    networkFeeNative: 0.0001,
    slippage: 0.2,
    route: 'curve',
    venue: 'Moonpit',
    balanceBefore: 0,
  };
}

function setup() {
  useSession.setState({ token: 'tok' });
  const calls: QuoteRequest[] = [];
  vi.spyOn(api, 'quote').mockImplementation(async (req) => {
    calls.push(req);
    return quoteFor(req);
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { calls, wrapper };
}

const BUY: QuoteParams = { chain: 'sol', token: 'TKN', side: 'buy', amount: 0.5, amountKind: 'native', presetId: 'P1' };
const SELL: QuoteParams = { chain: 'sol', token: 'TKN', side: 'sell', amount: 25, amountKind: 'percent', presetId: 'P1' };

describe('useLiveQuote', () => {
  it('never quotes one side with the other side’s amount, nor shows its quote', async () => {
    const { calls, wrapper } = setup();
    const { result, rerender } = renderHook((p: QuoteParams) => useLiveQuote(p, true), { wrapper, initialProps: BUY });
    await waitFor(() => expect(result.current.data?.side).toBe('buy'));

    rerender(SELL);
    // Right after the switch: no buy quote shown under the sell form.
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.side).toBe('sell'));

    rerender(BUY);
    expect(result.current.data?.side ?? 'buy').toBe('buy');
    await waitFor(() => expect(result.current.data?.side).toBe('buy'));
    await new Promise((r) => setTimeout(r, 400)); // past the debounce

    const pairs = calls.map((c) => `${c.side}:${c.amount}:${c.amountKind}`);
    expect(pairs).not.toContain('sell:0.5:percent');
    expect(pairs).not.toContain('buy:25:native');
    expect(pairs).toContain('sell:25:percent');
  });

  it('still debounces amount edits on the same side', async () => {
    const { calls, wrapper } = setup();
    const { rerender } = renderHook((p: QuoteParams) => useLiveQuote(p, true), { wrapper, initialProps: BUY });
    await waitFor(() => expect(calls).toHaveLength(1));
    rerender({ ...BUY, amount: 1 });
    rerender({ ...BUY, amount: 1.5 });
    rerender({ ...BUY, amount: 2 });
    await waitFor(() => expect(calls.at(-1)?.amount).toBe(2));
    expect(calls.map((c) => c.amount)).toEqual([0.5, 2]);
  });
});

describe('QuotePreview', () => {
  it('is not a live region itself (it refreshes every 4s) and announces settled quotes once', async () => {
    const { wrapper } = setup();
    function Harness(p: QuoteParams) {
      const query = useLiveQuote(p, true);
      return <QuotePreview query={query} chain="sol" symbol="TKN" side={p.side} nativeUsd={200} signedIn hasAmount />;
    }
    const { container, rerender } = render(<Harness {...BUY} />, { wrapper });
    await waitFor(() => expect(container.querySelector('dl')).not.toBeNull());
    expect(container.querySelector('[aria-live]')).toBeNull();
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(''); // nothing announced on page load

    await act(async () => rerender(<Harness {...BUY} amount={1} />));
    await waitFor(() => expect(status.textContent).toMatch(/you receive about 1M TKN/));
  });
});
