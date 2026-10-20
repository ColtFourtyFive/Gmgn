import { useMemo } from 'react';
import { shortAddress, type FeedItem } from '@trenchscope/shared';
import { Activity } from 'lucide-react';
import { Age, ChainIcon, Compact, Native, Price, TokenLink, Usd } from '@/components/common';
import { CopyButton, DataTable, EmptyState, type Column } from '@/components/ui';
import { PositionEventBadge } from '@/components/wallet';
import { useDisplaySettings } from '@/hooks/useSettings';
import { SideBadge } from '../orders';

/** The user's own trades across chains (manual, orders, copy trades, snipes). */
export function ActivityTable({ rows, loading, showChain }: { rows: FeedItem[]; loading: boolean; showChain: boolean }) {
  const { compactRows } = useDisplaySettings();
  const columns = useMemo<Column<FeedItem>[]>(
    () => [
      {
        key: 'token',
        header: 'Token',
        sticky: true,
        render: (f) => (
          <span className="flex min-w-0 items-center gap-1.5">
            {showChain && <ChainIcon chain={f.trade.chain} size={12} />}
            <TokenLink token={f.token} size={20} />
          </span>
        ),
      },
      {
        key: 'time',
        header: 'Time',
        width: 70,
        sortable: true,
        sortValue: (f) => f.trade.timestamp,
        render: (f) => <Age ts={f.trade.timestamp} className="text-muted" />,
      },
      {
        key: 'side',
        header: 'Type',
        render: (f) => (
          <span className="inline-flex items-center gap-1">
            <SideBadge side={f.trade.side} />
            <PositionEventBadge item={f} />
          </span>
        ),
      },
      {
        key: 'native',
        header: 'Amount',
        align: 'right',
        sortable: true,
        sortValue: (f) => f.trade.nativeAmount,
        render: (f) => (
          <span className="flex flex-col items-end leading-tight">
            <Native value={f.trade.nativeAmount} chain={f.trade.chain} className={f.trade.side === 'buy' ? 'text-up' : 'text-down'} />
            <Usd value={f.trade.usdAmount} className="text-xs text-muted" />
          </span>
        ),
      },
      { key: 'tokens', header: 'Tokens', align: 'right', hideBelow: 'md', render: (f) => <Compact value={f.trade.tokenAmount} /> },
      { key: 'price', header: 'Price', align: 'right', render: (f) => <Price value={f.trade.priceUsd} /> },
      { key: 'mcap', header: 'MC', align: 'right', hideBelow: 'lg', render: (f) => <Usd value={f.trade.marketCapUsd} /> },
      {
        key: 'pnl',
        header: 'Realized',
        align: 'right',
        render: (f) => (f.trade.realizedPnlUsd === null ? <span className="text-faint">—</span> : <Usd value={f.trade.realizedPnlUsd} colored signed />),
      },
      {
        key: 'tx',
        header: 'Tx',
        align: 'right',
        hideBelow: 'lg',
        render: (f) => (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted" title={f.trade.txHash}>
            {shortAddress(f.trade.txHash, 4, 4)}
            <CopyButton text={f.trade.txHash} label="Copy transaction hash" />
          </span>
        ),
      },
    ],
    [showChain],
  );
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(f) => f.trade.id}
      defaultSort={{ key: 'time', dir: 'desc' }}
      loading={loading}
      skeletonRows={6}
      compact={compactRows}
      minWidth={720}
      aria-label="Trade activity"
      empty={<EmptyState icon={<Activity size={18} />} title="No trades yet" description="Every paper trade you make — manual, orders, copy trades and snipes — is logged here." />}
    />
  );
}
