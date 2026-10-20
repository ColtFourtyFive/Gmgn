import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { AppNotification, SwapReceipt, Trade } from '@trenchscope/shared';
import { playCue } from '@/lib/sounds';
import { useToasts } from '@/store/toasts';
import { useUi } from '@/store/ui';
import { handleUserEvent, trackManualSwap } from './useUserChannel';

vi.mock('@/lib/sounds', () => ({ playCue: vi.fn() }));

const qc = new QueryClient();
let seq = 0;

function receipt(token: string): SwapReceipt {
  const trade = { id: `t${++seq}`, chain: 'sol', token, tokenSymbol: 'PEPE', side: 'buy' } as Trade;
  return { ok: true, trade, nativeAmount: 0.5, tokenAmount: 1e6, usdAmount: 90, priceUsd: 0.00009, platformFeeNative: 0, networkFeeNative: 0, priceImpact: 0, mevLossNative: 0, txHash: 'x', latencyMs: 1, orders: [] };
}

function notification(kind: AppNotification['kind'], token: string, title: string): AppNotification {
  return { id: `n${++seq}`, kind, title, body: '', chain: 'sol', token, wallet: null, createdAt: 0, read: false };
}

const toasts = () => useToasts.getState().toasts.map((t) => `${t.kind}:${t.title}`);

beforeEach(() => {
  vi.useFakeTimers();
  useToasts.getState().clear();
  vi.mocked(playCue).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('user channel fill toasts', () => {
  it('toasts a lone fill (e.g. a swap made in another tab) after a short delay', () => {
    handleUserEvent(qc, 'fill', receipt('tokA'));
    expect(toasts()).toEqual([]);
    vi.advanceTimersByTime(600);
    expect(toasts()).toEqual(['success:Bought PEPE']);
  });

  it('shows the execution notification instead of the generic fill toast', () => {
    const unread = useUi.getState().unreadCount;
    handleUserEvent(qc, 'fill', receipt('tokB'));
    handleUserEvent(qc, 'notification', notification('sniper', 'tokB', 'Sniped $PEPE'));
    vi.advanceTimersByTime(600);
    expect(toasts()).toEqual(['success:Sniped $PEPE']);
    expect(useUi.getState().unreadCount).toBe(unread + 1);
  });

  it('treats an execution notification without a fill as a failure', () => {
    handleUserEvent(qc, 'notification', notification('copytrade', 'tokC', 'Copy buy failed · $PEPE'));
    expect(toasts()).toEqual(['error:Copy buy failed · $PEPE']);
  });

  it('toasts notifications with an error level as errors without claiming a fill', () => {
    handleUserEvent(qc, 'fill', receipt('tokG')); // an unrelated fill of the same token
    handleUserEvent(qc, 'notification', { ...notification('sniper', 'tokG', 'Snipe failed · $PEPE'), level: 'error' });
    handleUserEvent(qc, 'notification', { ...notification('alert', 'tokG', 'Alert rule disabled'), level: 'error' });
    vi.advanceTimersByTime(600);
    expect(toasts()).toEqual(['error:Snipe failed · $PEPE', 'error:Alert rule disabled', 'success:Bought PEPE']);
  });

  it('toasts distinct fills of the same token separately', () => {
    handleUserEvent(qc, 'fill', receipt('tokD'));
    vi.advanceTimersByTime(600);
    handleUserEvent(qc, 'fill', receipt('tokD'));
    handleUserEvent(qc, 'notification', notification('order_filled', 'tokD', 'Limit buy filled · $PEPE'));
    vi.advanceTimersByTime(600);
    expect(toasts()).toEqual(['success:Bought PEPE', 'success:Limit buy filled · $PEPE']);
  });

  it('leaves a manual swap fill to the caller, whichever arrives first', () => {
    // WS fill before the HTTP receipt.
    const own = receipt('tokE');
    const settle = trackManualSwap('sol', 'tokE');
    handleUserEvent(qc, 'fill', own);
    vi.advanceTimersByTime(2000);
    settle(own);
    vi.advanceTimersByTime(600);
    // WS fill after the HTTP receipt.
    const own2 = receipt('tokE');
    trackManualSwap('sol', 'tokE')(own2);
    handleUserEvent(qc, 'fill', own2);
    vi.advanceTimersByTime(600);
    expect(toasts()).toEqual([]);
  });

  it('releases other fills of the token held while a manual swap was in flight', () => {
    const settle = trackManualSwap('sol', 'tokF');
    handleUserEvent(qc, 'fill', receipt('tokF')); // e.g. a take-profit order filling meanwhile
    vi.advanceTimersByTime(2000);
    expect(toasts()).toEqual([]);
    settle(null);
    vi.advanceTimersByTime(600);
    expect(toasts()).toEqual(['success:Bought PEPE']);
  });

  it('plays a sound cue with fill and alert toasts (gated by the Sounds setting inside playCue)', () => {
    handleUserEvent(qc, 'fill', receipt('tokH'));
    vi.advanceTimersByTime(600);
    handleUserEvent(qc, 'notification', notification('alert', 'tokH', 'Price alert · $PEPE'));
    handleUserEvent(qc, 'notification', { ...notification('sniper', 'tokI', 'Snipe failed · $PEPE'), level: 'error' });
    expect(vi.mocked(playCue).mock.calls).toEqual([['fill'], ['alert'], ['error']]);
  });
});
