// The one-time real-funds acknowledgement before the first live trade, and
// live trade failures (Deposit call to action, trading-unavailable banner flag).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SwapReceipt, SwapRequest } from '@trenchscope/shared';
import { useSwap } from '@/hooks/useSwap';
import { api, ApiError } from '@/lib/api';
import { useModeStore } from '@/lib/mode';
import { useFunds } from '@/store/funds';
import { useToasts } from '@/store/toasts';
import { enterLive, leaveLive } from '@/testing/live';
import { ensureLiveTradeAck, hasLiveTradeAck, LIVE_ACK_KEY, LiveTradeAckDialog, resetLiveTradeAck } from './LiveTradeAck';

const req: SwapRequest = { chain: 'sol', token: 'Mint111111111111111111111111111111111111111', side: 'buy', amount: 0.5, amountKind: 'native' };

beforeEach(() => {
  resetLiveTradeAck();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetLiveTradeAck();
  leaveLive();
  useToasts.getState().clear();
  useFunds.setState({ open: null, mint: null });
});

describe('ensureLiveTradeAck', () => {
  it('never asks in demo', async () => {
    render(<LiveTradeAckDialog />);
    await expect(ensureLiveTradeAck()).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks once in live: Continue needs the box ticked, and the answer is remembered per browser', async () => {
    enterLive();
    render(<LiveTradeAckDialog />);
    let answer: boolean | undefined;
    act(() => void ensureLiveTradeAck().then((ok) => (answer = ok)));
    const dialog = await screen.findByRole('dialog', { name: 'Real funds on Solana mainnet' });
    expect(dialog.textContent).toMatch(/execute on Solana mainnet/);
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(go);
    expect(answer).toBeUndefined();
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand that orders execute on Solana mainnet with real funds/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(answer).toBe(true));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(LIVE_ACK_KEY)).toBe('1');
    await expect(ensureLiveTradeAck()).resolves.toBe(true);
  });

  it('Cancel declines (every waiting trade), and asks again next time', async () => {
    enterLive();
    render(<LiveTradeAckDialog />);
    const answers: boolean[] = [];
    act(() => {
      void ensureLiveTradeAck().then((ok) => answers.push(ok));
      void ensureLiveTradeAck().then((ok) => answers.push(ok));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(answers).toEqual([false, false]));
    expect(hasLiveTradeAck()).toBe(false);
  });

  it('without storage, remembers the acknowledgement for the session', async () => {
    enterLive();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
      clear: () => {},
    });
    render(<LiveTradeAckDialog />);
    let answer: boolean | undefined;
    act(() => void ensureLiveTradeAck().then((ok) => (answer = ok)));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(answer).toBe(true));
    expect(hasLiveTradeAck()).toBe(true);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
      <LiveTradeAckDialog />
    </QueryClientProvider>
  );
}

describe('useSwap in live', () => {
  it('does not send the first trade until it is acknowledged (declined: nothing sent, no error)', async () => {
    enterLive();
    const swap = vi.spyOn(api, 'swap');
    const { result } = renderHook(() => useSwap(), { wrapper });
    let receipt: SwapReceipt | null | undefined;
    act(() => void result.current.swap(req).then((r) => (receipt = r)));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(receipt).toBeNull());
    expect(swap).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('offers Deposit after an insufficient balance and flags trading unavailable', async () => {
    enterLive();
    localStorage.setItem(LIVE_ACK_KEY, '1');
    vi.spyOn(api, 'swap')
      .mockRejectedValueOnce(new ApiError(400, 'insufficient balance: 0.5 SOL needed', 'insufficient_balance'))
      .mockRejectedValueOnce(new ApiError(503, 'trading is unavailable: no router', 'trading_unavailable'));
    const { result } = renderHook(() => useSwap(), { wrapper });

    await act(() => result.current.swap(req));
    const toast = useToasts.getState().toasts.at(-1)!;
    expect(toast).toMatchObject({ kind: 'error', title: 'Buy failed' });
    expect(toast.body).toMatch(/Deposit SOL or lower the amount/);
    expect(toast.action?.label).toBe('Deposit SOL');
    act(() => toast.action!.run());
    expect(useFunds.getState().open).toBe('deposit');

    expect(useModeStore.getState().tradingDownAt).toBe(0);
    await act(() => result.current.swap(req));
    expect(useModeStore.getState().tradingDownAt).toBeGreaterThan(0);
    expect(result.current.error).toMatch(/Trading is temporarily unavailable/);
  });
});

describe('useSwap in demo', () => {
  it('keeps the plain failure toast (no Deposit action, no acknowledgement)', async () => {
    vi.spyOn(api, 'swap').mockRejectedValue(new ApiError(400, 'insufficient SOL balance', 'insufficient_balance'));
    const { result } = renderHook(() => useSwap(), { wrapper });
    await act(() => result.current.swap(req));
    const toast = useToasts.getState().toasts.at(-1)!;
    expect(toast).toMatchObject({ kind: 'error', title: 'Buy failed', body: 'insufficient SOL balance' });
    expect(toast.action).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
