// What the launch takes from the paper wallet (launch fee, creation-block
// buys, platform and network fees) against the balance.

import { memo, type ReactNode } from 'react';
import { CHAINS, formatPercent, PLATFORM_FEE_RATE, type ChainId } from '@trenchscope/shared';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import { Note } from '@/components/account/FormBits';
import { Native, Usd } from '@/components/common';
import { Button, Heading } from '@/components/ui';
import type { LaunchCost } from './model';

function Row({ label, children, strong, className }: { label: ReactNode; children: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-3 py-0.5', className)}>
      <dt className={strong ? 'font-medium text-fg' : 'text-muted'}>{label}</dt>
      <dd className={clsx('num text-right', strong ? 'font-semibold text-fg' : 'text-fg')}>{children}</dd>
    </div>
  );
}

export interface CostSummaryProps {
  chain: ChainId;
  cost: LaunchCost;
  buys: number;
  bundleWallets: number;
  bundleBuy: number;
  nativeUsd: number;
  /** Null signed out. */
  balance: number | null;
  onDeposit: () => void;
  depositPending: boolean;
}

export const CostSummary = memo(function CostSummary({ chain, cost, buys, bundleWallets, bundleBuy, nativeUsd, balance, onDeposit, depositPending }: CostSummaryProps) {
  const sym = CHAINS[chain].nativeSymbol;
  const short = balance !== null && balance + 1e-12 < cost.total;
  return (
    <section className="panel flex flex-col gap-2 p-3 text-sm" aria-label="Launch cost">
      <Heading className="table-head">Cost</Heading>
      <dl className="flex flex-col">
        <Row label="Launch fee">
          <Native value={cost.launchFee} chain={chain} />
        </Row>
        <Row label="Dev buy">
          <Native value={cost.devBuy} chain={chain} />
        </Row>
        {cost.bundleBuys > 0 && (
          <Row label={`Bundle buys (${bundleWallets} × ${bundleBuy} ${sym})`}>
            <Native value={cost.bundleBuys} chain={chain} />
          </Row>
        )}
        <Row label={`Platform fee (${formatPercent(PLATFORM_FEE_RATE, { sign: false, digits: 1 })})`}>
          <Native value={cost.platformFees} chain={chain} />
        </Row>
        <Row label={`Network fees (${buys} buy${buys === 1 ? '' : 's'})`}>
          <Native value={cost.networkFees} chain={chain} />
        </Row>
        <Row label="Total" strong className="mt-1 border-t border-line pt-1.5">
          <Native value={cost.total} chain={chain} />
          <Usd value={cost.total * nativeUsd} className="ml-1.5 text-xs font-normal text-muted" />
        </Row>
        {balance !== null && (
          <>
            <Row label="Balance">
              <Native value={balance} chain={chain} />
            </Row>
            <Row label="After launch">
              <Native value={balance - cost.total} chain={chain} className={short ? 'text-down' : undefined} />
            </Row>
          </>
        )}
      </dl>
      {short && (
        <Note tone="error" title={`Not enough ${sym}`}>
          <span className="flex flex-wrap items-center gap-2">
            Lower the buys or top up the paper wallet.
            <Button size="xs" variant="outline" icon={<Plus size={12} />} loading={depositPending} onClick={onDeposit}>
              Deposit
            </Button>
          </span>
        </Note>
      )}
    </section>
  );
});
