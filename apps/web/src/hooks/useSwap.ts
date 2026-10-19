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

/**
 * Execute a manual paper swap with consistent feedback: toasts the fill (unless
 * `silent`) or the error, refreshes order/portfolio queries and keeps the
 * user channel from toasting the same fill. Resolves to the receipt (null on
 * request errors). Callers must ensure the user is signed in (requireAuth).
 */
export function useSwap(): {
  swap: (req: SwapRequest, opts?: { symbol?: string; silent?: boolean }) => Promise<SwapReceipt | null>;
  pending: boolean;
} {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const swap = useCallback(
    async (req: SwapRequest, opts: { symbol?: string; silent?: boolean } = {}) => {
      const verb = req.side === 'buy' ? 'Buy' : 'Sell';
      const settle = trackManualSwap(req.chain, req.token);
      setPending(true);
      try {
        const receipt = await api.swap({ clientId: clientId(), ...req });
        settle(receipt);
        invalidateTradingQueries(qc);
        if (!receipt.ok) toast.error(`${verb} failed`, receipt.error ?? 'Trade rejected');
        else if (!opts.silent) toastFill(receipt, opts.symbol);
        return receipt;
      } catch (err) {
        settle(null);
        toast.error(`${verb} failed`, errorMessage(err));
        return null;
      } finally {
        setPending(false);
      }
    },
    [qc],
  );

  return { swap, pending };
}
