// Wallet page tabs: Recent PnL (all positions incl. closed), Holdings (open
// positions) and Created tokens (the wallet's launches, when it is a dev).

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDuration, formatInt, type ChainId, type DevToken, type TokenPositionRow } from '@trenchscope/shared';
import { Coins, History, Rocket } from 'lucide-react';
import { Age, Compact, FlashValue, Pct, Price, StatTile, TokenLink, Usd } from '@/components/common';
import { Badge, DataTable, EmptyState, ErrorState, Toggle, type Column } from '@/components/ui';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { isNotFound, retryUnlessMissing, useWalletActivity, useWalletHoldings, walletKeys } from './queries';
import { sameWallet } from './utils';

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

/** Every token the wallet traded (open and closed), most recent first. */
export const RecentPnlTab = memo(function RecentPnlTab({ chain, address }: WalletTableProps) {
  const navigate = useNavigate();
  const q = useWalletHoldings(chain, address, true, 'recent');
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} compact />;
  return (
    <DataTable
      aria-label="Recent PnL by token"
      columns={recentColumns}
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

const DEV_LAUNCH_WINDOW_MS = 15_000;

/**
 * Tokens this wallet launched. The API has no per-wallet launch list, so the
 * tab finds one launch (a dev trade in the activity, or a first buy at the
 * token's creation time) and reads the full record from that token's dev info.
 */
export const CreatedTokensTab = memo(function CreatedTokensTab({ chain, address }: WalletTableProps) {
  const navigate = useNavigate();
  const act = useWalletActivity(chain, address, 'all');
  const holdings = useWalletHoldings(chain, address, true, 'recent');
  const candidates = useMemo(() => {
    const out: string[] = [];
    for (const it of act.data ?? []) if (it.trade.isDev && !out.includes(it.trade.token)) out.push(it.trade.token);
    for (const r of holdings.data ?? [])
      if (r.firstBuyAt !== null && Math.abs(r.firstBuyAt - r.tokenInfo.createdAt) <= DEV_LAUNCH_WINDOW_MS && !out.includes(r.token)) out.push(r.token);
    return out.slice(0, 4);
  }, [act.data, holdings.data]);
  const [attempt, setAttempt] = useState(0);
  const candidate = candidates[attempt] ?? null;
  const dev = useQuery({
    queryKey: walletKeys.dev(chain, candidate ?? ''),
    queryFn: () => api.dev(chain, candidate!),
    enabled: !!candidate,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: retryUnlessMissing,
  });
  const mismatch = dev.data ? !sameWallet(chain, dev.data.address, address) : dev.isError && isNotFound(dev.error);
  // A candidate launched by someone else: try the next one.
  useEffect(() => {
    if (mismatch && attempt < candidates.length - 1) setAttempt((a) => a + 1);
  }, [mismatch, attempt, candidates.length]);

  const scanning = act.isLoading || holdings.isLoading || (dev.isLoading && !!candidate);
  const info = dev.data && !mismatch ? dev.data : null;
  const tokens = useMemo(() => (info ? [...info.tokens].sort((a, b) => b.createdAt - a.createdAt) : []), [info]);

  if (dev.isError && !isNotFound(dev.error)) return <ErrorState error={dev.error} onRetry={() => void dev.refetch()} retrying={dev.isFetching} compact />;
  if (!scanning && !info)
    return (
      <EmptyState
        compact
        icon={<Rocket size={16} />}
        title="Launch history unavailable"
        description="This wallet created tokens, but none of its launches are in its recent activity, so the list can’t be loaded here."
      />
    );
  return (
    <div className="flex flex-col">
      {info && (
        <div className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-4">
          <StatTile label="Created" value={formatInt(info.createdCount)} />
          <StatTile label="Migrated" value={formatInt(info.migratedCount)} sub={<Pct value={info.migrationRate} sign={false} colored={false} />} />
          <StatTile label="Rugged" value={<span className={info.ruggedCount > 0 ? 'text-down' : undefined}>{formatInt(info.ruggedCount)}</span>} />
          <StatTile label="Best ATH MC" value={<Usd value={info.bestAthMarketCapUsd} />} />
        </div>
      )}
      <DataTable
        aria-label="Tokens created by this wallet"
        columns={devColumns}
        rows={tokens}
        rowKey={(t) => t.address}
        loading={scanning}
        defaultSort={{ key: 'age', dir: 'desc' }}
        minWidth={620}
        maxHeight={560}
        onRowClick={(t) => navigate(routes.token(t.chain, t.address))}
      />
    </div>
  );
});
