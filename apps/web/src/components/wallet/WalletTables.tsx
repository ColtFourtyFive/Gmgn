// Wallet page tabs: Recent PnL (all positions incl. closed, each with a PnL
// share card), Holdings (open positions) and Created tokens (the wallet's
// launches, when it is a dev).

import { memo, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDuration, formatInt, type ChainId, type DevToken, type TokenPositionRow } from '@trenchscope/shared';
import { Coins, History, Rocket } from 'lucide-react';
import { Age, Compact, FlashValue, Pct, Price, StatTile, TokenLink, Usd } from '@/components/common';
import { SharePnlButton, shareDataFromPosition } from '@/components/share';
import { Badge, DataTable, EmptyState, ErrorState, Toggle, type Column } from '@/components/ui';
import { serverNow } from '@/hooks';
import { routes } from '@/lib/chain';
import { useCreatedTokens, useWalletHoldings } from './queries';

const rowKey = (r: TokenPositionRow) => r.token;
const plural = (n: number, word: string) => `${formatInt(n)} ${word}${n === 1 ? '' : 's'}`;

function TokenCol({ row }: { row: TokenPositionRow }) {
  return <TokenLink token={row.tokenInfo} size={28} showName />;
}

function PnlCell({ usd, rate }: { usd: number; rate?: number | null }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <FlashValue value={usd}>
        <Usd value={usd} colored signed className="font-medium" />
      </FlashValue>
      {rate !== undefined && <Pct value={rate} className="text-2xs" />}
    </span>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <span className="num block text-2xs text-faint">{children}</span>;
}

const recentColumns: Column<TokenPositionRow>[] = [
  { key: 'token', header: 'Token', sticky: true, width: 190, render: (r) => <TokenCol row={r} /> },
  {
    key: 'bought',
    header: 'Bought',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.boughtUsd,
    render: (r) => (
      <span className="leading-tight">
        <Usd value={r.boughtUsd} />
        <Sub>{plural(r.buys, 'buy')}</Sub>
      </span>
    ),
  },
  {
    key: 'sold',
    header: 'Sold',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.soldUsd,
    render: (r) => (
      <span className="leading-tight">
        <Usd value={r.soldUsd} />
        <Sub>{plural(r.sells, 'sell')}</Sub>
      </span>
    ),
  },
  { key: 'realized', header: 'Realized', align: 'right', sortable: true, sortValue: (r) => r.realizedPnlUsd, render: (r) => <PnlCell usd={r.realizedPnlUsd} /> },
  {
    key: 'unrealized',
    header: 'Unrealized',
    align: 'right',
    sortable: true,
    sortValue: (r) => (r.balance > 0 ? r.unrealizedPnlUsd : null),
    render: (r) => (r.balance > 0 ? <PnlCell usd={r.unrealizedPnlUsd} /> : <span className="text-faint">Closed</span>),
  },
  { key: 'total', header: 'Total PnL', align: 'right', sortable: true, sortValue: (r) => r.totalPnlUsd, render: (r) => <PnlCell usd={r.totalPnlUsd} rate={r.pnlRate} /> },
  {
    key: 'hold',
    header: 'Hold time',
    align: 'right',
    sortable: true,
    hideBelow: 'md',
    sortValue: (r) => r.holdSeconds,
    render: (r) => <span className="num text-muted">{formatDuration(r.holdSeconds)}</span>,
  },
  { key: 'last', header: 'Last active', align: 'right', sortable: true, sortValue: (r) => r.lastActiveAt, render: (r) => <Age ts={r.lastActiveAt} className="text-muted" /> },
];

const holdingColumns: Column<TokenPositionRow>[] = [
  { key: 'token', header: 'Token', sticky: true, width: 190, render: (r) => <TokenCol row={r} /> },
  {
    key: 'value',
    header: 'Value',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.valueUsd,
    render: (r) => (
      <span className="leading-tight">
        <FlashValue value={r.valueUsd}>
          <Usd value={r.valueUsd} className="font-medium" />
        </FlashValue>
        <Sub>
          <Compact value={r.balance} /> {r.tokenInfo.symbol}
        </Sub>
      </span>
    ),
  },
  {
    key: 'share',
    header: 'Supply',
    title: 'Share of total supply held',
    align: 'right',
    sortable: true,
    hideBelow: 'md',
    sortValue: (r) => r.holdRate,
    render: (r) => <Pct value={r.holdRate} sign={false} colored={false} className="text-muted" />,
  },
  {
    key: 'price',
    header: 'Price / MC',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.tokenInfo.marketCapUsd,
    render: (r) => (
      <span className="leading-tight">
        <Price value={r.tokenInfo.priceUsd} />
        <Sub>
          MC <Usd value={r.tokenInfo.marketCapUsd} />
        </Sub>
      </span>
    ),
  },
  {
    key: 'cost',
    header: 'Avg buy / Cost',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.costBasisUsd,
    render: (r) => (
      <span className="leading-tight">
        <Price value={r.avgBuyPriceUsd} />
        <Sub>
          <Usd value={r.costBasisUsd} />
        </Sub>
      </span>
    ),
  },
  {
    key: 'unrealized',
    header: 'Unrealized',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.unrealizedPnlUsd,
    render: (r) => <PnlCell usd={r.unrealizedPnlUsd} rate={r.costBasisUsd > 0 ? r.unrealizedPnlUsd / r.costBasisUsd : null} />,
  },
  { key: 'realized', header: 'Realized', align: 'right', sortable: true, hideBelow: 'lg', sortValue: (r) => r.realizedPnlUsd, render: (r) => <PnlCell usd={r.realizedPnlUsd} /> },
  { key: 'total', header: 'Total PnL', align: 'right', sortable: true, sortValue: (r) => r.totalPnlUsd, render: (r) => <PnlCell usd={r.totalPnlUsd} rate={r.pnlRate} /> },
  { key: 'last', header: 'Last active', align: 'right', sortable: true, hideBelow: 'md', sortValue: (r) => r.lastActiveAt, render: (r) => <Age ts={r.lastActiveAt} className="text-muted" /> },
];

export interface WalletTableProps {
  chain: ChainId;
  address: string;
}

/** Every token the wallet traded (open and closed), most recent first. `trader` names the wallet on share cards. */
export const RecentPnlTab = memo(function RecentPnlTab({ chain, address, trader }: WalletTableProps & { trader: string }) {
  const navigate = useNavigate();
  const q = useWalletHoldings(chain, address, true, 'recent');
  const columns = useMemo<Column<TokenPositionRow>[]>(
    () => [
      ...recentColumns,
      {
        key: 'share',
        header: <span className="sr-only">Share</span>,
        align: 'right',
        width: 44,
        render: (r) => <SharePnlButton getData={() => shareDataFromPosition(r, r.tokenInfo, trader, serverNow())} />,
      },
    ],
    [trader],
  );
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} compact />;
  return (
    <DataTable
      aria-label="Recent PnL by token"
      columns={columns}
      rows={q.data ?? []}
      rowKey={rowKey}
      loading={q.isLoading}
      minWidth={820}
      maxHeight={640}
      onRowClick={(r) => navigate(routes.token(chain, r.token))}
      empty={<EmptyState compact icon={<History size={16} />} title="No trades yet" description="This wallet has not traded a token on this chain." />}
    />
  );
});

/** Open positions, by value. */
export const HoldingsTab = memo(function HoldingsTab({ chain, address }: WalletTableProps) {
  const navigate = useNavigate();
  const [hideDust, setHideDust] = useState(true);
  const q = useWalletHoldings(chain, address, false, 'value');
  const rows = useMemo(() => (q.data ?? []).filter((r) => r.balance > 0 && (!hideDust || r.valueUsd >= 1)), [q.data, hideDust]);
  const totals = useMemo(() => {
    let value = 0;
    let unrealized = 0;
    let cost = 0;
    for (const r of rows) {
      value += r.valueUsd;
      unrealized += r.unrealizedPnlUsd;
      cost += r.costBasisUsd;
    }
    return { value, unrealized, cost };
  }, [rows]);
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} compact />;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-3 py-2 text-sm">
        <span className="text-muted">
          Value <Usd value={totals.value} className="font-semibold text-fg" />
        </span>
        <span className="text-muted">
          Unrealized <Usd value={totals.unrealized} colored signed className="font-semibold" />{' '}
          <Pct value={totals.cost > 0 ? totals.unrealized / totals.cost : null} className="text-xs" />
        </span>
        <span className="text-muted">
          Positions <span className="num font-semibold text-fg">{formatInt(rows.length)}</span>
        </span>
        <Toggle size="sm" checked={hideDust} onChange={setHideDust} label="Hide < $1" className="ml-auto" />
      </div>
      <DataTable
        aria-label="Open positions"
        columns={holdingColumns}
        rows={rows}
        rowKey={rowKey}
        loading={q.isLoading}
        defaultSort={{ key: 'value', dir: 'desc' }}
        minWidth={860}
        maxHeight={640}
        onRowClick={(r) => navigate(routes.token(chain, r.token))}
        empty={<EmptyState compact icon={<Coins size={16} />} title="No open positions" description={hideDust ? 'Nothing worth $1 or more is held right now.' : 'This wallet holds no tokens right now.'} />}
      />
    </div>
  );
});

const STATUS_BADGE = {
  curve: { tone: 'accent', label: 'On curve' },
  migrating: { tone: 'warn', label: 'Migrating' },
  migrated: { tone: 'up', label: 'Migrated' },
} as const;

const devColumns: Column<DevToken>[] = [
  { key: 'token', header: 'Token', sticky: true, width: 200, render: (t) => <TokenLink token={t} size={28} showName /> },
  {
    key: 'status',
    header: 'Status',
    render: (t) =>
      t.rugged ? (
        <Badge tone="down">Rugged</Badge>
      ) : (
        <Badge tone={STATUS_BADGE[t.status].tone}>{STATUS_BADGE[t.status].label}</Badge>
      ),
  },
  { key: 'mcap', header: 'Market cap', align: 'right', sortable: true, sortValue: (t) => t.marketCapUsd, render: (t) => <Usd value={t.marketCapUsd} className="font-medium" /> },
  { key: 'ath', header: 'ATH MC', align: 'right', sortable: true, sortValue: (t) => t.athMarketCapUsd, render: (t) => <Usd value={t.athMarketCapUsd} /> },
  {
    key: 'fromAth',
    header: 'From ATH',
    align: 'right',
    hideBelow: 'sm',
    sortable: true,
    sortValue: (t) => (t.athMarketCapUsd > 0 ? t.marketCapUsd / t.athMarketCapUsd - 1 : null),
    render: (t) => <Pct value={t.athMarketCapUsd > 0 ? t.marketCapUsd / t.athMarketCapUsd - 1 : null} />,
  },
  { key: 'age', header: 'Created', align: 'right', sortable: true, sortValue: (t) => t.createdAt, render: (t) => <Age ts={t.createdAt} suffix=" ago" className="text-muted" /> },
];

/** Launch record of a dev from its token list. */
function devStats(tokens: DevToken[]) {
  let migrated = 0;
  let rugged = 0;
  let bestAth = 0;
  for (const t of tokens) {
    if (t.status === 'migrated') migrated++;
    if (t.rugged) rugged++;
    bestAth = Math.max(bestAth, t.athMarketCapUsd);
  }
  return { created: tokens.length, migrated, rugged, bestAth };
}

/** Tokens this wallet launched that are still on the market, newest first. */
export const CreatedTokensTab = memo(function CreatedTokensTab({ chain, address }: WalletTableProps) {
  const navigate = useNavigate();
  const q = useCreatedTokens(chain, address);
  const tokens = useMemo(() => q.data ?? [], [q.data]);
  const stats = useMemo(() => devStats(tokens), [tokens]);
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} compact />;
  return (
    <div className="flex flex-col">
      {stats.created > 0 && (
        <div className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-4">
          <StatTile label="Created" value={formatInt(stats.created)} />
          <StatTile label="Migrated" value={formatInt(stats.migrated)} sub={<Pct value={stats.migrated / stats.created} sign={false} colored={false} />} />
          <StatTile label="Rugged" value={<span className={stats.rugged > 0 ? 'text-down' : undefined}>{formatInt(stats.rugged)}</span>} />
          <StatTile label="Best ATH MC" value={<Usd value={stats.bestAth} />} />
        </div>
      )}
      <DataTable
        aria-label="Tokens created by this wallet"
        columns={devColumns}
        rows={tokens}
        rowKey={(t) => t.address}
        loading={q.isLoading}
        defaultSort={{ key: 'age', dir: 'desc' }}
        minWidth={620}
        maxHeight={560}
        onRowClick={(t) => navigate(routes.token(t.chain, t.address))}
        empty={<EmptyState compact icon={<Rocket size={16} />} title="No live launches" description="The tokens this wallet created are no longer on the market." />}
      />
    </div>
  );
});
