// React-query keys and hooks for live funding and account security.
// Transfers live under ['live-wallet'] so a `balance` event on the user
// channel (a deposit landed, a withdrawal confirmed) refreshes them.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChainId } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { errorMessage, formatNativeFor } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';

export const fundsKeys = {
  all: ['live-wallet'] as const,
  deposit: (chain: ChainId) => ['live-wallet', 'deposit', chain] as const,
  transfers: (limit: number) => ['live-wallet', 'transfers', limit] as const,
  security: ['security'] as const,
};

/** The account's deposit address and fee reserve (the address never changes: cached for the session). */
export function useDepositInfo(chain: ChainId, enabled = true) {
  return useQuery({ queryKey: fundsKeys.deposit(chain), queryFn: () => api.depositInfo(chain), enabled, staleTime: Infinity, retry: 1 });
}

/** Deposits and withdrawals, newest first; polled while one is still settling. */
export function useTransfers(limit = 50, enabled = true) {
  return useQuery({
    queryKey: fundsKeys.transfers(limit),
    queryFn: () => api.transfers(limit),
    enabled,
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === 'pending' || t.status === 'sent') ? 5_000 : 30_000),
  });
}

/** 2FA state, withdrawal whitelist and recent security events. */
export function useSecurityStatus(enabled = true) {
  return useQuery({ queryKey: fundsKeys.security, queryFn: api.security, enabled, staleTime: 10_000 });
}

/** Re-read the wallet's balances from the chain (POST /wallet/refresh), with toasts. */
export function useRefreshBalances(chain: ChainId): { refresh: () => Promise<void>; pending: boolean } {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const refresh = async () => {
    if (pending) return;
    setPending(true);
    try {
      const w = await api.refreshWallet(chain);
      useSession.getState().setAccountBalance(chain, w.nativeBalance, w.nativeBalanceUsd);
      void qc.invalidateQueries({ queryKey: ['portfolio'] });
      void qc.invalidateQueries({ queryKey: fundsKeys.all });
      toast.success('Balances refreshed', `${formatNativeFor(chain, w.nativeBalance)} available`);
    } catch (err) {
      toast.error('Couldn’t refresh balances', errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return { refresh, pending };
}
