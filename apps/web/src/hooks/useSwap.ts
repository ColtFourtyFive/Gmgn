import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SwapReceipt, SwapRequest } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
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

/**
 * Execute a manual paper swap with consistent feedback: toasts the fill (unless
 * `silent`) or the failure (unless `silentError`), refreshes order/portfolio
 * queries and keeps the user channel from toasting the same fill. Resolves to
 * the receipt (null on request errors); `error` holds the last failure's
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
      const fail = (message: string) => {
        setError(message);
        if (!opts.silentError) toast.error(`${verb} failed`, message);
      };
      const settle = trackManualSwap(req.chain, req.token);
      setPending(true);
      setError(null);
      try {
        const receipt = await api.swap({ clientId: clientId(), ...req });
        settle(receipt);
        invalidateTradingQueries(qc);
        if (!receipt.ok) fail(receipt.error ?? 'Trade rejected');
        else if (!opts.silent) toastFill(receipt, opts.symbol);
        return receipt;
      } catch (err) {
        settle(null);
        fail(errorMessage(err));
        return null;
      } finally {
        setPending(false);
      }
    },
    [qc],
  );

  return { swap, pending, error };
}
