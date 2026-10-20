// Monitor feed rows: desktop grid rows with a sticky header, stacked cards on
// phones. Rows are memoized; only rows whose token market cap changed re-render.

import { memo, type ReactNode } from 'react';
import type { ChainId, FeedItem, WalletTag } from '@trenchscope/shared';
import { ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { Age, Native, TokenLink, Usd } from '@/components/common';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { Badge, Tooltip } from '@/components/ui';
import { Multiple, PositionEventBadge, WalletCell } from '@/components/wallet';
import type { RiskVerdict } from './risk';

export const FEED_GRID = 'md:grid md:grid-cols-[52px_minmax(150px,1.2fr)_minmax(104px,0.7fr)_minmax(96px,0.7fr)_minmax(150px,1.2fr)_minmax(150px,1fr)_68px] md:items-center md:gap-x-3';

export interface FeedRowProps {
  item: FeedItem;
  chain: ChainId;
  /** Latest known market cap of the token. */
  currentMcap: number;
  /** Server tags merged with viewer tags. */
  tags: WalletTag[];
  /** Remark (viewer) or KOL label. */
  label: string | null;
  buyAmount: number;
  /** Arrived live: slide in. */
  fresh: boolean;
  risk: RiskVerdict;
  mobile: boolean;
}

function SideBadges({ item }: { item: FeedItem }) {
  const buy = item.trade.side === 'buy';
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge tone={buy ? 'up' : 'down'} className="font-semibold">
        {buy ? 'Buy' : 'Sell'}
      </Badge>
      <PositionEventBadge item={item} />
    </span>
  );
}

function McapChange({ at, now, className }: { at: number; now: number; className?: string }) {
  return (
    <span className={clsx('flex items-center gap-1 whitespace-nowrap', className)}>
      <Usd value={at} className="text-muted" />
      <span className="text-faint">→</span>
      <Usd value={now} />
      <Multiple value={at > 0 ? now / at : null} className="ml-0.5 text-xs" />
    </span>
  );
}

function RiskIcon({ risk }: { risk: RiskVerdict }) {
  if (risk !== 'risky') return null;
  return (
    <Tooltip content="High rug risk (concentration, insiders, bundlers or honeypot)">
      <ShieldAlert size={13} className="shrink-0 text-down" aria-label="High rug risk" tabIndex={0} />
    </Tooltip>
  );
}

/** One feed trade. */
export const FeedRow = memo(function FeedRow({ item, chain, currentMcap, tags, label, buyAmount, fresh, risk, mobile }: FeedRowProps) {
  const t = item.trade;
  const buy = t.side === 'buy';
  const amount = (
    <span className="flex flex-col leading-tight md:items-end">
      <Native value={t.nativeAmount} chain={chain} className={clsx('font-semibold', buy ? 'text-up' : 'text-down')} />
      <Usd value={t.usdAmount} className="text-2xs text-muted" />
    </span>
  );
  const token = (
    <span className="flex min-w-0 items-center gap-1">
      <TokenLink token={item.token} size={22} />
      <RiskIcon risk={risk} />
    </span>
  );
  const qb = <QuickBuyButton chain={chain} token={t.token} symbol={item.token.symbol} amount={buyAmount} />;
  const rowClass = clsx(
    'border-b border-l-2 border-b-line/60 transition-colors hover:bg-panel-2',
    buy ? 'border-l-up/50' : 'border-l-down/50',
    fresh && 'animate-slide-in',
  );

  if (mobile)
    return (
      <li className={clsx(rowClass, 'flex flex-col gap-1 px-3 py-2')}>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <WalletCell chain={chain} address={t.wallet} label={label} tags={tags} dense preview={false} maxTags={3} />
          <Age ts={t.timestamp} className="shrink-0 text-xs text-muted" />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <SideBadges item={item} />
          <span className="flex items-baseline gap-1">
            <Native value={t.nativeAmount} chain={chain} className={clsx('font-semibold', buy ? 'text-up' : 'text-down')} />
            <Usd value={t.usdAmount} className="text-2xs text-muted" />
          </span>
          {token}
        </span>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <McapChange at={t.marketCapUsd} now={currentMcap} className="text-xs" />
          {qb}
        </span>
      </li>
    );

  return (
    <li className={clsx(rowClass, FEED_GRID, 'px-3 py-1.5 text-sm')}>
      <Age ts={t.timestamp} className="text-xs text-muted" />
      <WalletCell chain={chain} address={t.wallet} label={label} tags={tags} dense maxTags={3} />
      <SideBadges item={item} />
      {amount}
      {token}
      <McapChange at={t.marketCapUsd} now={currentMcap} className="text-xs" />
      <span className="flex justify-end">{qb}</span>
    </li>
  );
});

/** Column header for the desktop grid. */
export function FeedHeader({ children }: { children?: ReactNode }) {
  return (
    <div className={clsx(FEED_GRID, 'table-head sticky top-0 z-sticky hidden h-8 border-b border-line bg-panel px-3 md:grid')} role="presentation">
      <span>Age</span>
      <span>Wallet</span>
      <span>Action</span>
      <span className="text-right">Amount</span>
      <span>Token</span>
      <span title="Market cap at the trade → now, and the multiple since">MC at trade → now</span>
      <span className="text-right">{children ?? 'Buy'}</span>
    </div>
  );
}
