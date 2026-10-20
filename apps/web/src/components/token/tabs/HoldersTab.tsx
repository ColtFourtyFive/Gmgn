// Holders: top 100 with tag filters, % of supply bars, cost basis and PnL.
// Curve / pool accounts are listed first and labelled (excluded from ranks).

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatDuration, formatPercent, type Position, type TokenDetail } from '@trenchscope/shared';
import clsx from 'clsx';
import { AddressLink, Compact, Price, Usd, WALLET_TAG_META } from '@/components/common';
import { Badge, DataTable, ErrorState, SegmentedControl, type Column } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { HOLDER_TAGS } from '../model';
import { tokenKeys } from '../queries';

/** Holder rank (null for curve/pool rows). */
type RankedPosition = Position & { rank: number | null };

export function useTagItems() {
  const signedIn = useSession((s) => !!s.token);
  return useMemo(
    () =>
      HOLDER_TAGS.filter((t) => !t.private || signedIn).map((t) => {
        const meta = t.tag ? WALLET_TAG_META[t.tag] : null;
        const Icon = meta?.icon;
        return { value: t.value, label: t.label, icon: Icon ? <Icon size={11} style={{ color: `rgb(var(--${meta.token}))` }} aria-hidden /> : undefined };
      }),
    [signedIn],
  );
}

export function PnlCell({ value, rate }: { value: number; rate?: number }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <Usd value={value} colored signed />
      {rate !== undefined && Number.isFinite(rate) && rate !== 0 && <span className={clsx('num text-2xs', rate > 0 ? 'text-up/80' : 'text-down/80')}>{formatPercent(rate, { digits: 0 })}</span>}
    </span>
  );
}

export function HolderCell({ chain, p }: { chain: TokenDetail['chain']; p: Position }) {
  if (p.addrType !== 'wallet') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge tone="info">{p.addrType === 'pool' ? 'Pool' : 'Curve'}</Badge>
        <span className="truncate text-muted">{p.walletLabel ?? (p.addrType === 'pool' ? 'Liquidity pool' : 'Bonding curve')}</span>
      </span>
    );
  }
  return <AddressLink chain={chain} address={p.wallet} label={p.walletLabel} tags={p.walletTags} avatar copy={false} />;
}

export function HoldersTab({ token, maxHeight }: { token: TokenDetail; maxHeight: number | string }) {
  const { chain, address } = token;
  const signedIn = useSession((s) => !!s.token);
  const [tag, setTag] = useState('all');
  const items = useTagItems();
  const q = useQuery({
    queryKey: tokenKeys.holders(chain, address, tag, signedIn),
    queryFn: () => api.holders(chain, address, { tag, limit: 100 }),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    retry: 1,
  });

  const rows = useMemo<RankedPosition[]>(() => {
    let rank = 0;
    return (q.data ?? []).map((p) => ({ ...p, rank: p.addrType === 'wallet' ? ++rank : null }));
  }, [q.data]);
  const maxRate = useMemo(() => Math.max(0.01, ...rows.filter((r) => r.addrType === 'wallet').map((r) => r.holdRate)), [rows]);

  const columns = useMemo<Column<RankedPosition>[]>(
    () => [
      { key: 'rank', header: '#', width: 36, render: (p) => <span className="num text-xs text-faint">{p.rank ?? '—'}</span> },
      { key: 'holder', header: 'Holder', render: (p) => <HolderCell chain={chain} p={p} />, sticky: true },
      {
        key: 'share',
        header: '% supply',
        width: 116,
        sortable: true,
        sortValue: (p) => p.holdRate,
        render: (p) => (
          <span className="flex items-center gap-1.5">
            <span className="num w-11 text-right text-fg">{formatPercent(p.holdRate, { sign: false, digits: p.holdRate < 0.01 ? 2 : 1 })}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-panel-3">
              <span className={clsx('block h-full rounded-full', p.addrType === 'wallet' ? 'bg-accent' : 'bg-info')} style={{ width: `${Math.min(100, (p.holdRate / maxRate) * 100)}%` }} />
            </span>
          </span>
        ),
      },
      { key: 'amount', header: 'Amount', align: 'right', sortable: true, sortValue: (p) => p.balance, render: (p) => <Compact value={p.balance} /> },
      { key: 'value', header: 'Value', align: 'right', sortable: true, sortValue: (p) => p.valueUsd, render: (p) => <Usd value={p.valueUsd} /> },
      { key: 'avg', header: 'Avg buy', align: 'right', render: (p) => (p.avgBuyPriceUsd > 0 ? <Price value={p.avgBuyPriceUsd} /> : <span className="text-faint">—</span>) },
      {
        key: 'bought',
        header: 'Bought',
        align: 'right',
        sortable: true,
        sortValue: (p) => p.boughtUsd,
        render: (p) =>
          p.addrType === 'wallet' ? (
            <span className="flex flex-col items-end leading-tight">
              <Usd value={p.boughtUsd} className="text-up" />
              <span className="num text-2xs text-faint">{p.buys} tx</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'sold',
        header: 'Sold',
        align: 'right',
        sortable: true,
        sortValue: (p) => p.soldUsd,
        render: (p) =>
          p.addrType === 'wallet' ? (
            <span className="flex flex-col items-end leading-tight">
              <Usd value={p.soldUsd} className="text-down" />
              <span className="num text-2xs text-faint">{p.sells} tx</span>
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      { key: 'upnl', header: 'Unrealized', align: 'right', sortable: true, sortValue: (p) => p.unrealizedPnlUsd, render: (p) => (p.addrType === 'wallet' ? <PnlCell value={p.unrealizedPnlUsd} /> : null) },
      {
        key: 'rpnl',
        header: 'Realized',
        align: 'right',
        sortable: true,
        sortValue: (p) => p.realizedPnlUsd,
        render: (p) => (p.addrType === 'wallet' ? <PnlCell value={p.realizedPnlUsd} rate={p.pnlRate} /> : null),
      },
      {
        key: 'funded',
        header: 'Funded by',
        hideBelow: 'lg',
        render: (p) => (p.fundedBy ? <AddressLink chain={chain} address={p.fundedBy} copy={false} /> : <span className="text-faint">—</span>),
      },
      { key: 'held', header: 'Held', align: 'right', sortable: true, sortValue: (p) => p.holdSeconds, render: (p) => <span className="num text-muted">{formatDuration(p.holdSeconds)}</span> },
    ],
    [chain, maxRate],
  );

  const s = token.security;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-2 py-1.5">
        <SegmentedControl size="sm" value={tag} onChange={setTag} items={items} aria-label="Holder type" className="max-w-full" />
        <span className="flex-1" />
        <span className="num flex items-center gap-3 text-xs text-muted">
          <span>
            Holders <span className="font-medium text-fg">{token.holderCount.toLocaleString()}</span>
          </span>
          <span>
            Top 10 <span className={clsx('font-medium', s.top10HolderRate > 0.3 ? 'text-down' : 'text-fg')}>{formatPercent(s.top10HolderRate, { sign: false, digits: 1 })}</span>
          </span>
          <span>
            Top 100 <span className="font-medium text-fg">{formatPercent(s.top100HolderRate, { sign: false, digits: 1 })}</span>
          </span>
        </span>
      </div>
      {q.isError && !q.data ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <DataTable
          aria-label={`${token.symbol} holders`}
          columns={columns}
          rows={rows}
          rowKey={(p) => p.wallet}
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
