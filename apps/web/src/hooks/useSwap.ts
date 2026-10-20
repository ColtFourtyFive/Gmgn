import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SwapReceipt, SwapRequest } from '@trenchscope/shared';
import { ensureLiveTradeAck } from '@/components/trade/LiveTradeAck';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { flagTradingUnavailable, isLiveMode } from '@/lib/mode';
import { playCue } from '@/lib/sounds';
import { openFunds } from '@/store/funds';
import { toast } from '@/store/toasts';
import { invalidateTradingQueries, toastFill, trackManualSwap } from './useUserChannel';

function clientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export interface SwapOptions {
  /** Symbol for the fill toast. */
  symbol?: string;
  /** Skip the fill toast (the caller reports success itself). */
  silent?: boolean;
  /** Skip the failure toast (the caller shows `error` inline instead). */
  silentError?: boolean;
}

/** Live: a failed trade that more SOL would fix (the failure toast then offers Deposit). */
export function isInsufficientBalance(code: string | undefined, message: string): boolean {
  return code === 'insufficient_balance' || /insufficient|not enough (sol|balance)/i.test(message);
}

/**
 * Failure toast of a trade. Live: an insufficient balance offers Deposit, and
 * 'trading_unavailable' raises the app-wide banner.
 */
export function toastTradeFailure(title: string, message: string, code?: string): void {
  if (!isLiveMode()) {
    toast.error(title, message);
    return;
  }
  if (code === 'trading_unavailable') flagTradingUnavailable();
  if (isInsufficientBalance(code, message)) toast.push({ kind: 'error', title, body: message, action: { label: 'Deposit SOL', run: () => openFunds('deposit') } });
  else toast.error(title, message);
}

/**
 * Execute a manual swap with consistent feedback: toasts the fill (unless
 * `silent`) or the failure (unless `silentError`), refreshes order/portfolio
 * queries and keeps the user channel from toasting the same fill. Resolves to
 * the receipt (null on request errors, or when a live trader declines the
 * one-time real-funds acknowledgement); `error` holds the last failure's
 * message until the next swap. Callers must ensure the user is signed in
 * (requireAuth).
 */
export function useSwap(): {
  swap: (req: SwapRequest, opts?: SwapOptions) => Promise<SwapReceipt | null>;
  pending: boolean;
  error: string | null;
} {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swap = useCallback(
    async (req: SwapRequest, opts: SwapOptions = {}) => {
      const verb = req.side === 'buy' ? 'Buy' : 'Sell';
      const fail = (message: string, code?: string) => {
        setError(message);
        if (code === 'trading_unavailable') flagTradingUnavailable();
        if (!opts.silentError) toastTradeFailure(`${verb} failed`, message, code);
      };
      // Live: real funds. Every path ends here, so the first trade always shows the acknowledgement (demo skips the await).
      if (isLiveMode() && !(await ensureLiveTradeAck())) return null;
      const settle = trackManualSwap(req.chain, req.token);
      setPending(true);
      setError(null);
      try {
        const receipt = await api.swap({ clientId: clientId(), ...req });
        settle(receipt);
        invalidateTradingQueries(qc);
        if (!receipt.ok) fail(receipt.error ?? 'Trade rejected');
        else {
          if (!opts.silent) toastFill(receipt, opts.symbol);
          playCue('fill');
        }
        return receipt;
      } catch (err) {
        settle(null);
        fail(errorMessage(err), err instanceof ApiError ? err.code : undefined);
        return null;
      } finally {
        setPending(false);
      }
    },
    [qc],
  );

  return { swap, pending, error };
}
