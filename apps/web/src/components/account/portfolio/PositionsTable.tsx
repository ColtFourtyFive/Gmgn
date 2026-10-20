import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TokenPositionRow } from '@trenchscope/shared';
import { Wallet } from 'lucide-react';
import { Age, ChainIcon, Compact, FlashValue, Pct, Price, TokenLink, Usd } from '@/components/common';
import { DataTable, EmptyState, Skeleton, type Column } from '@/components/ui';
import { useIsMobile } from '@/hooks';
import { useDisplaySettings } from '@/hooks/useSettings';
import { routes } from '@/lib/chain';
import { SellButtons } from './SellButtons';

const keyOf = (r: TokenPositionRow) => `${r.chain}:${r.token}`;
const unrealizedRate = (r: TokenPositionRow) => (r.costBasisUsd > 0 ? r.unrealizedPnlUsd / r.costBasisUsd : null);

export interface PositionsTableProps {
  rows: TokenPositionRow[];
  loading: boolean;
  /** Show the chain mark next to each token (multi-chain view). */
  showChain: boolean;
  empty?: ReactNode;
}

/** Open positions: desktop table with quick-sell buttons, stacked cards on phones. */
export function PositionsTable({ rows, loading, showChain, empty }: PositionsTableProps) {
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const { compactRows } = useDisplaySettings();
  const emptyState = empty ?? <EmptyState icon={<Wallet size={18} />} title="No open positions" description="Buy a token from Trenches or Trending and it shows up here." />;

  const columns = useMemo<Column<TokenPositionRow>[]>(
    () => [
      {
        key: 'token',
        header: 'Token',
        sticky: true,
        width: 210,
        sortable: true,
        sortValue: (r) => r.tokenInfo.symbol.toLowerCase(),
        render: (r) => (
          <span className="flex min-w-0 items-center gap-1.5">
            {showChain && <ChainIcon chain={r.chain} size={12} />}
            <TokenLink token={r.tokenInfo} size={24} showName />
          </span>
        ),
      },
      {
        key: 'value',
        header: 'Value',
        align: 'right',
        sortable: true,
        sortValue: (r) => r.valueUsd,
        render: (r) => (
          <span className="flex flex-col items-end leading-tight">
            <FlashValue value={r.valueUsd}>
              <Usd value={r.valueUsd} className="font-medium text-fg" />
            </FlashValue>
            <Compact value={r.balance} className="text-xs text-muted" />
          </span>
        ),
      },
      {
        key: 'avg',
        header: 'Avg buy / now',
        align: 'right',
        hideBelow: 'lg',
        render: (r) => (
          <span className="flex flex-col items-end leading-tight">
            <Price value={r.avgBuyPriceUsd} className="text-fg" />
            <FlashValue value={r.tokenInfo.priceUsd}>
              <Price value={r.tokenInfo.priceUsd} className="text-xs text-muted" />
            </FlashValue>
          </span>
        ),
      },
      {
        key: 'unrealized',
        header: 'Unrealized',
        align: 'right',
        sortable: true,
        sortValue: (r) => r.unrealizedPnlUsd,
        render: (r) => (
          <span className="flex flex-col items-end leading-tight">
            <Usd value={r.unrealizedPnlUsd} colored signed />
            <Pct value={unrealizedRate(r)} className="text-xs" />
          </span>
        ),
      },
      {
        key: 'pnl',
        header: 'Total PnL',
        align: 'right',
        sortable: true,
        sortValue: (r) => r.totalPnlUsd,
        title: 'Realized + unrealized PnL; % of total bought',
        render: (r) => (
          <span className="flex flex-col items-end leading-tight">
            <Usd value={r.totalPnlUsd} colored signed className="font-medium" />
            <Pct value={r.pnlRate} className="text-xs" />
          </span>
        ),
      },
      {
        key: 'flow',
        header: 'Bought / Sold',
        align: 'right',
        hideBelow: 'xl',
        render: (r) => (
          <span className="flex flex-col items-end leading-tight">
            <Usd value={r.boughtUsd} className="text-fg" />
            <Usd value={r.soldUsd} className="text-xs text-muted" />
          </span>
        ),
      },
      {
        key: 'txs',
        header: 'Txs',
        align: 'right',
        hideBelow: 'xl',
        render: (r) => (
          <span className="num whitespace-nowrap">
            <span className="text-up">{r.buys}</span>
            <span className="text-faint">/</span>
            <span className="text-down">{r.sells}</span>
          </span>
        ),
      },
      {
        key: 'hold',
        header: 'Held',
        align: 'right',
        hideBelow: 'md',
        sortable: true,
        sortValue: (r) => r.firstBuyAt,
        title: 'Time since the first buy',
        render: (r) => <Age ts={r.firstBuyAt} className="text-muted" />,
      },
      {
        key: 'sell',
        header: 'Quick sell',
        align: 'right',
        width: 150,
        render: (r) => <SellButtons row={r} />,
      },
    ],
    [showChain],
  );

  if (mobile) {
    if (loading && rows.length === 0) {
      return (
        <div className="flex flex-col gap-2 p-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) return <>{emptyState}</>;
    return (
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <PositionCard key={keyOf(r)} row={r} showChain={showChain} />
        ))}
      </ul>
    );
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={keyOf}
      defaultSort={{ key: 'value', dir: 'desc' }}
      onRowClick={(r) => navigate(routes.token(r.chain, r.token))}
      loading={loading}
      skeletonRows={4}
      empty={emptyState}
      compact={compactRows}
      minWidth={720}
      aria-label="Open positions"
    />
  );
}

function PositionCard({ row: r, showChain }: { row: TokenPositionRow; showChain: boolean }) {
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {showChain && <ChainIcon chain={r.chain} size={12} />}
          <TokenLink token={r.tokenInfo} size={28} showName />
        </span>
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <FlashValue value={r.valueUsd}>
            <Usd value={r.valueUsd} className="text-md font-semibold text-fg" />
          </FlashValue>
          <span className="text-xs">
            <Usd value={r.totalPnlUsd} colored signed /> <Pct value={r.pnlRate} />
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="text-faint">Balance</dt>
          <dd>
            <Compact value={r.balance} className="text-fg" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">Avg buy</dt>
          <dd>
            <Price value={r.avgBuyPriceUsd} className="text-fg" />
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="text-faint">Held</dt>
          <dd>
            <Age ts={r.firstBuyAt} className="text-fg" />
          </dd>
        </div>
      </dl>
      <SellButtons row={r} size="sm" className="!justify-stretch" />
    </li>
  );
}
