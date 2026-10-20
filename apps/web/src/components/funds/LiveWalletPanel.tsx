// Portfolio's wallet panel in live mode: the embedded Solana wallet's balance
// and address, Deposit / Withdraw / Refresh, and the transfer history.

import type { ChainId } from '@trenchscope/shared';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { AddressLink, ChainIcon, ExplorerLink, FlashValue, Native, Usd } from '@/components/common';
import { Button, ErrorState, Panel } from '@/components/ui';
import { openFunds } from '@/store/funds';
import { useSession } from '@/store/session';
import { useRefreshBalances, useTransfers } from './queries';
import { TransfersTable } from './TransfersTable';

/** Deposit / Withdraw / Refresh buttons of the live wallet. */
export function FundsActions({ chain = 'sol', size = 'sm', className }: { chain?: ChainId; size?: 'xs' | 'sm'; className?: string }) {
  const { refresh, pending } = useRefreshBalances(chain);
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', className)}>
      <Button size={size} variant="primary" icon={<ArrowDownLeft size={13} />} onClick={() => openFunds('deposit')}>
        Deposit
      </Button>
      <Button size={size} variant="outline" icon={<ArrowUpRight size={13} />} onClick={() => openFunds('withdraw')}>
        Withdraw
      </Button>
      <Button size={size} variant="ghost" icon={<RefreshCw size={13} />} loading={pending} onClick={() => void refresh()} title="Re-read balances from Solana">
        Refresh balances
      </Button>
    </div>
  );
}

export function LiveWalletPanel({ chain = 'sol', className }: { chain?: ChainId; className?: string }) {
  const wallet = useSession((s) => s.account?.wallets[chain]);
  const signedIn = useSession((s) => !!s.account);
  const transfers = useTransfers(50, !!wallet);
  if (!wallet) {
    // Signed in but no embedded wallet yet (the key provider is still creating it, or unavailable).
    return signedIn ? (
      <Panel title="Wallet" icon={<Wallet size={14} />} className={className}>
        <p className="text-sm text-muted" role="status">
          Your Solana wallet is being set up. It appears here in a moment; reload the page if it doesn’t.
        </p>
      </Panel>
    ) : null;
  }
  return (
    <div className={clsx('grid gap-3 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]', className)}>
      <Panel title="Wallet" icon={<Wallet size={14} />} subtitle="Your embedded Solana wallet">
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <ChainIcon chain={chain} size={16} className="self-center" />
            <FlashValue value={wallet.nativeBalance}>
              <Native value={wallet.nativeBalance} chain={chain} className="text-xl font-semibold text-fg" />
            </FlashValue>
            <Usd value={wallet.nativeBalanceUsd} className="truncate text-sm text-muted" />
          </div>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <AddressLink chain={chain} address={wallet.address} head={6} tail={6} />
            <ExplorerLink chain={chain} kind="address" value={wallet.address} size={12} />
          </span>
          <FundsActions chain={chain} />
        </div>
      </Panel>
      <Panel title="Deposits & withdrawals" icon={<ArrowDownLeft size={14} />} padded={false}>
        {transfers.isError && !transfers.data ? (
          <ErrorState compact error={transfers.error} onRetry={() => void transfers.refetch()} retrying={transfers.isFetching} />
        ) : (
          <TransfersTable rows={transfers.data ?? []} loading={transfers.isLoading} compact />
        )}
      </Panel>
    </div>
  );
}
