import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RiskLevel, TokenSummary, WatchlistItem } from '@trenchscope/shared';
import { Star, StarOff, TrendingUp } from 'lucide-react';
import { AccountGate, ChainFilter, accountKeys, parseScope, useSignedIn, type ChainScope } from '@/components/account';
import { Age, ChainIcon, Compact, FlashValue, Pct, Price, RiskChip, TokenLink, Usd } from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { Badge, DataTable, EmptyState, ErrorState, IconButton, Panel, Skeleton, Spinner, type BadgeTone, type Column } from '@/components/ui';
import { useActiveChain, useIsMobile } from '@/hooks';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';

type WatchData = { items: WatchlistItem[]; tokens: TokenSummary[] };
type Row = TokenSummary & { addedAt: number | null };

const RISK: Record<RiskLevel, { label: string; tone: BadgeTone }> = {
  low: { label: 'Low', tone: 'up' },
  medium: { label: 'Medium', tone: 'warn' },
  high: { label: 'High', tone: 'down' },
};

const keyOf = (t: { chain: string; address: string }) => `${t.chain}:${t.address}`;

export default function WatchlistPage() {
  const signedIn = useSignedIn();
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get('chain'));
  const setScope = (v: ChainScope) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v === 'all') next.delete('chain');
        else next.set('chain', v);
        return next;
      },
      { replace: true },
    );

  const query = useQuery({ queryKey: accountKeys.watchlist, queryFn: api.watchlist, refetchInterval: 5_000, enabled: signedIn });
  const counts = useMemo(() => {
    const c: Partial<Record<ChainScope, number>> = { all: query.data?.tokens.length };
    for (const t of query.data?.tokens ?? []) c[t.chain] = (c[t.chain] ?? 0) + 1;
    return c;
  }, [query.data]);

  return (
    <Page className="max-w-[1680px]">
      <PageHeader
        title="Watchlist"
        subtitle="Tokens you starred, with live prices"
        icon={<Star size={16} />}
        actions={signedIn ? <ChainFilter value={scope} onChange={setScope} counts={query.data ? counts : undefined} className="hidden sm:inline-flex" /> : undefined}
      />
      {signedIn && <ChainFilter value={scope} onChange={setScope} counts={query.data ? counts : undefined} className="-mt-1 mb-3 sm:hidden" />}
      <AccountGate
        icon={<Star size={22} />}
        title="Keep an eye on your picks"
        description="Star tokens on their token page and follow price, market cap, liquidity and risk here in real time."
        features={['Live prices, 1h / 24h change and volume', 'Risk level and holder concentration at a glance', 'One-click instant buy']}
      >
        <WatchlistBody scope={scope} data={query.data} loading={query.isLoading} error={query.isError ? query.error : null} refetch={() => void query.refetch()} retrying={query.isFetching} />
      </AccountGate>
    </Page>
  );
}

function WatchlistBody({
  scope,
  data,
  loading,
  error,
  refetch,
  retrying,
}: {
  scope: ChainScope;
  data: WatchData | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  retrying: boolean;
}) {
  const navigate = useNavigate();
  const chain = useActiveChain();
  const mobile = useIsMobile();
  const qc = useQueryClient();
  const display = useDisplaySettings();
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const added = new Map(data.items.map((i) => [keyOf(i), i.addedAt]));
    return data.tokens.filter((t) => scope === 'all' || t.chain === scope).map((t) => ({ ...t, addedAt: added.get(keyOf(t)) ?? null }));
  }, [data, scope]);

  const remove = useCallback(
    async (t: Row) => {
      const key = keyOf(t);
      setRemoving((s) => new Set(s).add(key));
      const prev = qc.getQueryData<WatchData>(accountKeys.watchlist);
      qc.setQueryData<WatchData>(accountKeys.watchlist, (d) =>
        d ? { items: d.items.filter((i) => keyOf(i) !== key), tokens: d.tokens.filter((x) => keyOf(x) !== key) } : d,
      );
      try {
        await api.removeWatch(t.chain, t.address);
        toast.info(`Removed ${t.symbol}`, 'No longer on your watchlist.');
      } catch (err) {
        if (prev) qc.setQueryData(accountKeys.watchlist, prev);
        toast.error('Could not remove token', errorMessage(err));
      } finally {
        setRemoving((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
        void qc.invalidateQueries({ queryKey: accountKeys.watchlist });
      }
    },
    [qc],
  );

  const thresholds = display.riskThresholds;
  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: 'token',
        header: 'Token',
        sticky: true,
        width: 220,
        sortable: true,
        sortValue: (t) => t.symbol.toLowerCase(),
        render: (t) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <ChainIcon chain={t.chain} size={12} />
            <TokenLink token={t} size={26} showName showProgress={t.status !== 'migrated'} showLaunchpad />
          </span>
        ),
      },
      {
        key: 'price',
        header: 'Price',
        align: 'right',
        sortable: true,
        sortValue: (t) => t.priceUsd,
        render: (t) => (
          <FlashValue value={t.priceUsd}>
            <Price value={t.priceUsd} className="font-medium text-fg" />
          </FlashValue>
        ),
      },
      { key: 'c1h', header: '1h', align: 'right', sortable: true, sortValue: (t) => t.stats['1h'].priceChange, render: (t) => <Pct value={t.stats['1h'].priceChange} /> },
      { key: 'c24h', header: '24h', align: 'right', sortable: true, sortValue: (t) => t.stats['24h'].priceChange, render: (t) => <Pct value={t.stats['24h'].priceChange} /> },
      {
        key: 'mcap',
        header: 'MC',
        align: 'right',
        sortable: true,
        sortValue: (t) => t.marketCapUsd,
        render: (t) => (
          <FlashValue value={t.marketCapUsd}>
            <Usd value={t.marketCapUsd} />
          </FlashValue>
        ),
      },
      { key: 'liq', header: 'Liquidity', align: 'right', hideBelow: 'md', sortable: true, sortValue: (t) => t.liquidityUsd, render: (t) => <Usd value={t.liquidityUsd} /> },
      { key: 'vol', header: 'Vol 24h', align: 'right', hideBelow: 'lg', sortable: true, sortValue: (t) => t.stats['24h'].volumeUsd, render: (t) => <Usd value={t.stats['24h'].volumeUsd} /> },
      { key: 'holders', header: 'Holders', align: 'right', hideBelow: 'lg', sortable: true, sortValue: (t) => t.holderCount, render: (t) => <Compact value={t.holderCount} /> },
      {
        key: 'risk',
        header: 'Risk',
        hideBelow: 'md',
        sortable: true,
        sortValue: (t) => t.security.rugRatio,
        title: 'Composite rug risk, top-10 holder share and dev holdings',
        render: (t) => (
          <span className="flex items-center gap-1">
            <Badge tone={RISK[t.security.riskLevel].tone} title={`Rug ratio ${Math.round(t.security.rugRatio * 100)}%`}>
              {RISK[t.security.riskLevel].label}
            </Badge>
            <span className="hidden xl:contents">
              <RiskChip label="Top10" value={t.security.top10HolderRate} threshold={thresholds.top10} hint="Share of supply held by the top 10 holders" />
              <RiskChip label="Dev" value={t.security.devHoldRate} threshold={thresholds.dev} hint="Share of supply the dev still holds" />
            </span>
          </span>
        ),
      },
      {
        key: 'age',
        header: 'Age',
        align: 'right',
        hideBelow: 'xl',
        sortable: true,
        sortValue: (t) => -t.createdAt,
        render: (t) => (
          <span className="flex flex-col items-end leading-tight">
            <Age ts={t.createdAt} className="text-fg" />
            {t.addedAt && <Age ts={t.addedAt} suffix=" ago" className="text-2xs text-faint" />}
          </span>
        ),
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        align: 'right',
        width: 104,
        render: (t) => <RowActions row={t} pending={removing.has(keyOf(t))} onRemove={() => void remove(t)} />,
      },
    ],
    [thresholds, removing, remove],
  );

  if (error && !data) {
    return (
      <Panel>
        <ErrorState error={error} onRetry={refetch} retrying={retrying} />
      </Panel>
    );
  }

  const total = data?.tokens.length ?? 0;
  const empty =
    total === 0 ? (
      <EmptyState
        icon={<Star size={18} />}
        title="Your watchlist is empty"
        description={
          <>
            Open any token and tap the <Star size={12} className="inline align-[-1px]" aria-label="star" /> star next to its name — it shows up here with live prices.
          </>
        }
        action={
          <Link to={routes.trending(chain)} className="btn-primary btn-sm">
            <TrendingUp size={13} /> Browse trending tokens
          </Link>
        }
      />
    ) : (
      <EmptyState compact title="Nothing on this chain" description="Switch to All to see every watched token." />
    );

  if (mobile) {
    return (
      <Panel padded={false}>
        {loading && rows.length === 0 ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          empty
        ) : (
          <ul className="flex flex-col divide-y divide-line" aria-label="Watchlist">
            {[...rows]
              .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
              .map((t) => (
                <WatchCard key={keyOf(t)} row={t} pending={removing.has(keyOf(t))} onRemove={() => void remove(t)} onOpen={() => navigate(routes.token(t.chain, t.address))} />
              ))}
          </ul>
        )}
      </Panel>
    );
  }

  return (
    <Panel padded={false}>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={keyOf}
        defaultSort={{ key: 'mcap', dir: 'desc' }}
        onRowClick={(t) => navigate(routes.token(t.chain, t.address))}
        loading={loading}
        skeletonRows={6}
        compact={display.compactRows}
        minWidth={640}
        aria-label="Watchlist"
        empty={empty}
      />
    </Panel>
  );
}

function WatchCard({ row: t, pending, onRemove, onOpen }: { row: Row; pending: boolean; onRemove: () => void; onOpen: () => void }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <ChainIcon chain={t.chain} size={12} />
          <TokenLink token={t} size={30} showName showProgress={t.status !== 'migrated'} showLaunchpad />
        </span>
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <FlashValue value={t.priceUsd}>
            <Price value={t.priceUsd} className="font-semibold text-fg" />
          </FlashValue>
          <span className="text-xs">
            <span className="text-faint">24h </span>
            <Pct value={t.stats['24h'].priceChange} />
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted">
          MC <Usd value={t.marketCapUsd} className="text-fg" /> · Liq <Usd value={t.liquidityUsd} className="text-fg" />
        </span>
        <Badge tone={RISK[t.security.riskLevel].tone}>{RISK[t.security.riskLevel].label}</Badge>
        <span onClick={(e) => e.stopPropagation()}>
          <RowActions row={t} pending={pending} onRemove={onRemove} />
        </span>
      </div>
    </li>
  );
}

function RowActions({ row, pending, onRemove }: { row: Row; pending: boolean; onRemove: () => void }) {
  return (
    <span className="flex items-center justify-end gap-1">
      <QuickBuyButton chain={row.chain} token={row.address} symbol={row.symbol} />
      <IconButton
        size="xs"
        label={`Remove ${row.symbol} from watchlist`}
        icon={pending ? <Spinner size={11} label="" /> : <StarOff size={13} />}
        disabled={pending}
        onClick={onRemove}
        className="hover:!text-down"
      />
    </span>
  );
}
