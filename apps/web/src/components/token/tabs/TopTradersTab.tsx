// Top traders by PnL (server-sorted), with tag filters.

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatDuration, formatPercent, type Position, type TokenDetail } from '@trenchscope/shared';
import { Age, Compact, Price, Usd } from '@/components/common';
import { DataTable, ErrorState, SegmentedControl, type Column, type SortState } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { tokenKeys } from '../queries';
import { HolderCell, PnlCell, useTagItems } from './HoldersTab';

/** Table column -> server sort key. */
const SORT_KEY: Record<string, string> = { pnl: 'pnl', upnl: 'unrealized', rpnl: 'realized', bought: 'bought', sold: 'sold' };

export function TopTradersTab({ token, maxHeight }: { token: TokenDetail; maxHeight: number | string }) {
  const { chain, address } = token;
  const signedIn = useSession((s) => !!s.token);
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState<SortState>({ key: 'pnl', dir: 'desc' });
  const items = useTagItems();
  const params = { tag, sort: SORT_KEY[sort.key] ?? 'pnl', order: sort.dir, limit: 100 } as const;
  const q = useQuery({
    queryKey: tokenKeys.traders(chain, address, { ...params, viewer: signedIn }),
    queryFn: () => api.topTraders(chain, address, params),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    retry: 1,
  });

  const columns = useMemo<Column<Position>[]>(
    () => [
      { key: 'rank', header: '#', width: 36, render: (_p, i) => <span className="num text-xs text-faint">{i + 1}</span> },
      { key: 'trader', header: 'Trader', sticky: true, render: (p) => <HolderCell chain={chain} p={p} /> },
      {
        key: 'bought',
        header: 'Bought',
        align: 'right',
        sortable: true,
        render: (p) => (
          <span className="flex flex-col items-end leading-tight">
            <Usd value={p.boughtUsd} className="text-up" />
            <span className="num text-2xs text-faint">
              {p.buys} tx · {p.avgBuyPriceUsd > 0 ? <Price value={p.avgBuyPriceUsd} /> : '—'}
            </span>
          </span>
        ),
      },
      {
        key: 'sold',
        header: 'Sold',
        align: 'right',
        sortable: true,
        render: (p) => (
          <span className="flex flex-col items-end leading-tight">
            <Usd value={p.soldUsd} className="text-down" />
            <span className="num text-2xs text-faint">
              {p.sells} tx · {p.avgSellPriceUsd > 0 ? <Price value={p.avgSellPriceUsd} /> : '—'}
            </span>
          </span>
        ),
      },
      { key: 'pnl', header: 'Total PnL', align: 'right', sortable: true, render: (p) => <PnlCell value={p.totalPnlUsd} rate={p.pnlRate} /> },
      { key: 'upnl', header: 'Unrealized', align: 'right', sortable: true, render: (p) => <PnlCell value={p.unrealizedPnlUsd} /> },
      { key: 'rpnl', header: 'Realized', align: 'right', sortable: true, render: (p) => <PnlCell value={p.realizedPnlUsd} /> },
      {
        key: 'remaining',
        header: 'Remaining',
        align: 'right',
        render: (p) =>
          p.balance > 0 ? (
            <span className="flex flex-col items-end leading-tight">
              <Compact value={p.balance} />
              <span className="num text-2xs text-faint">{formatPercent(p.holdRate, { sign: false, digits: 2 })}</span>
            </span>
          ) : (
            <span className="text-xs text-faint">Exited</span>
          ),
      },
      { key: 'held', header: 'Held', align: 'right', hideBelow: 'md', render: (p) => <span className="num text-muted">{formatDuration(p.holdSeconds)}</span> },
      { key: 'last', header: 'Last active', align: 'right', hideBelow: 'lg', render: (p) => <Age ts={p.lastActiveAt} suffix=" ago" className="text-muted" /> },
    ],
    [chain],
  );

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        <SegmentedControl size="sm" value={tag} onChange={setTag} items={items} aria-label="Trader type" className="max-w-full" />
      </div>
      {q.isError && !q.data ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <DataTable
          aria-label={`${token.symbol} top traders`}
          columns={columns}
          rows={q.data ?? []}
          rowKey={(p) => p.wallet}
          sort={sort}
          onSortChange={setSort}
          manualSort
          rowClassName={(p) => (p.walletTags.includes('you') ? 'bg-accent/5' : undefined)}
          loading={q.isPending}
          compact
          maxHeight={maxHeight}
          minWidth={1000}
        />
      )}
    </div>
  );
}
