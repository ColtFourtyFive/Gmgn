// Watchlist: starred tokens with live prices (polled every 5s), filed under
// group tabs (All + the account's groups, `?group=`), a chain filter and a
// private note per token. Stars open the group picker (groups, note, remove).

import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { TokenSummary, WatchlistResponse } from '@trenchscope/shared';
import { FolderOpen, Star, TrendingUp } from 'lucide-react';
import { AccountGate, ChainFilter, GroupDot, NoteField, WatchStar, parseScope, useSignedIn, useWatchlist, watchKey, type ChainScope } from '@/components/account';
import { GroupBar } from '@/components/account/watchlist/GroupBar';
import { Age, ChainIcon, Compact, FlashValue, Pct, Price, RiskChip, TokenLink, Usd } from '@/components/common';
import { SafetyChip } from '@/components/discovery';
import { Page, PageHeader } from '@/components/layout';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { DataTable, EmptyState, ErrorState, Panel, Popover, Skeleton, type Column } from '@/components/ui';
import { useActiveChain, useIsMobile } from '@/hooks';
import { useDisplaySettings } from '@/hooks/useSettings';
import { routes } from '@/lib/chain';

type Row = TokenSummary & { addedAt: number | null; groupIds: string[]; note: string };

export default function WatchlistPage() {
  const signedIn = useSignedIn();
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get('chain'));
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const query = useWatchlist(5_000);
  const groups = query.data?.groups;
  const groupParam = params.get('group');
  const group = groupParam && groups?.some((g) => g.id === groupParam) ? groupParam : 'all';

  // Each filter's counts show what switching it would list under the other filter.
  const inGroup = useMemo(() => {
    if (!query.data) return [];
    const ids = new Map(query.data.items.map((i) => [watchKey(i), i.groupIds ?? []]));
    return query.data.tokens.filter((t) => group === 'all' || ids.get(watchKey(t))?.includes(group));
  }, [query.data, group]);
  const counts = useMemo(() => {
    const c: Partial<Record<ChainScope, number>> = { all: inGroup.length };
    for (const t of inGroup) c[t.chain] = (c[t.chain] ?? 0) + 1;
    return c;
  }, [inGroup]);
  const setScope = (v: ChainScope) => setParam('chain', v === 'all' ? null : v);

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
        features={['Live prices, 1h / 24h change and volume', 'Groups and private notes to sort your picks', 'Safety score at a glance and one-click instant buy']}
      >
        <WatchlistBody
          scope={scope}
          group={group}
          onGroup={(g) => setParam('group', g === 'all' ? null : g)}
          data={query.data}
          loading={query.isLoading}
          error={query.isError ? query.error : null}
          refetch={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </AccountGate>
    </Page>
  );
}

interface BodyProps {
  scope: ChainScope;
  group: string;
  onGroup: (group: string) => void;
  data: WatchlistResponse | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  retrying: boolean;
}

function WatchlistBody({ scope, group, onGroup, data, loading, error, refetch, retrying }: BodyProps) {
  const navigate = useNavigate();
  const chain = useActiveChain();
  const mobile = useIsMobile();
  const display = useDisplaySettings();
  const groups = useMemo(() => data?.groups ?? [], [data]);

  const all = useMemo<Row[]>(() => {
    if (!data) return [];
    const items = new Map(data.items.map((i) => [watchKey(i), i]));
    return data.tokens.map((t) => {
      const it = items.get(watchKey(t));
      return { ...t, addedAt: it?.addedAt ?? null, groupIds: it?.groupIds ?? [], note: it?.note ?? '' };
    });
  }, [data]);
  const inScope = useMemo(() => all.filter((t) => scope === 'all' || t.chain === scope), [all, scope]);
  const groupCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of inScope) for (const id of t.groupIds) c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [inScope]);
  const rows = useMemo(() => (group === 'all' ? inScope : inScope.filter((t) => t.groupIds.includes(group))), [inScope, group]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const thresholds = display.riskThresholds;
  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: 'token',
        header: 'Token',
        sticky: true,
        width: 230,
        sortable: true,
        sortValue: (t) => t.symbol.toLowerCase(),
        render: (t) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <ChainIcon chain={t.chain} size={12} />
            <TokenLink token={t} size={26} showName showProgress={t.status !== 'migrated'} showLaunchpad />
            <GroupDots ids={t.groupIds} groups={groupById} />
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
        key: 'safety',
        header: 'Safety',
        hideBelow: 'md',
        sortable: true,
        sortValue: (t) => t.security.safety?.score,
        title: 'Safety score (hover for the reasons), top-10 holder share and dev holdings',
        render: (t) => (
          <span className="flex items-center gap-1">
            <SafetyChip safety={t.security.safety} />
            <span className="hidden xl:contents">
              <RiskChip label="Top10" value={t.security.top10HolderRate} threshold={thresholds.top10} hint="Share of supply held by the top 10 holders" />
              <RiskChip label="Dev" value={t.security.devHoldRate} threshold={thresholds.dev} hint="Share of supply the dev still holds" />
            </span>
          </span>
        ),
      },
      { key: 'note', header: 'Note', hideBelow: 'lg', width: 180, render: (t) => <NoteCell row={t} /> },
      {
        key: 'age',
        header: 'Age',
        align: 'right',
        hideBelow: 'xl',
        sortable: true,
        sortValue: (t) => -t.createdAt,
        title: 'Token age · added to the watchlist',
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
        width: 96,
        render: (t) => <RowActions row={t} />,
      },
    ],
    [thresholds, groupById],
  );

  if (error && !data) {
    return (
      <Panel>
        <ErrorState error={error} onRetry={refetch} retrying={retrying} />
      </Panel>
    );
  }

  const groupName = groupById.get(group)?.name;
  const empty =
    all.length === 0 ? (
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
    ) : groupName && inScope.length > 0 ? (
      <EmptyState
        compact
        icon={<FolderOpen size={16} />}
        title={`Nothing in ${groupName} yet`}
        description={
          <>
            Tap a token’s <Star size={12} className="inline align-[-1px]" aria-label="star" /> star (here or on its page) and tick {groupName}.
          </>
        }
      />
    ) : (
      <EmptyState compact title="Nothing on this chain" description="Switch to All to see every watched token." />
    );

  const bar = data && <GroupBar groups={groups} counts={groupCounts} total={inScope.length} active={group} onChange={onGroup} />;

  if (mobile) {
    return (
      <Panel padded={false}>
        {bar}
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
                <WatchCard key={watchKey(t)} row={t} groups={groupById} onOpen={() => navigate(routes.token(t.chain, t.address))} />
              ))}
          </ul>
        )}
      </Panel>
    );
  }

  return (
    <Panel padded={false}>
      {bar}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={watchKey}
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

/** Colour dots of the groups a row is filed under. */
function GroupDots({ ids, groups }: { ids: string[]; groups: Map<string, { name: string; color?: string }> }) {
  const shown = ids.map((id) => groups.get(id)).filter((g) => g !== undefined);
  if (shown.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5" title={shown.map((g) => g.name).join(', ')} aria-label={`Groups: ${shown.map((g) => g.name).join(', ')}`}>
      {shown.slice(0, 4).map((g) => (
        <GroupDot key={g.name} color={g.color} className="!h-1.5 !w-1.5" />
      ))}
    </span>
  );
}

/** Note preview; click to edit it in place. */
function NoteCell({ row }: { row: Row }) {
  return (
    <span data-row-ignore onClick={(e) => e.stopPropagation()}>
      <Popover
        placement="bottom-start"
        aria-label={`${row.symbol} note`}
        className="w-72 p-3"
        trigger={
          <button
            type="button"
            className="block max-w-[170px] truncate text-left text-xs text-muted hover:text-fg"
            title={row.note || undefined}
            aria-label={row.note ? `Edit ${row.symbol} note: ${row.note}` : `Add note to ${row.symbol}`}
          >
            {row.note || <span className="text-faint">+ Add note</span>}
          </button>
        }
      >
        {(close) => <NoteField key={row.note} token={row} note={row.note} onEnter={close} />}
      </Popover>
    </span>
  );
}

function WatchCard({ row: t, groups, onOpen }: { row: Row; groups: Map<string, { name: string; color?: string }>; onOpen: () => void }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <ChainIcon chain={t.chain} size={12} />
          <TokenLink token={t} size={30} showName showProgress={t.status !== 'migrated'} showLaunchpad />
          <GroupDots ids={t.groupIds} groups={groups} />
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
      {t.note && <p className="truncate text-xs italic text-muted">“{t.note}”</p>}
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted">
          MC <Usd value={t.marketCapUsd} className="text-fg" /> · Liq <Usd value={t.liquidityUsd} className="text-fg" />
        </span>
        <SafetyChip safety={t.security.safety} />
        <RowActions row={t} />
      </div>
    </li>
  );
}

/** Quick buy, and the star: groups, note and removal. */
function RowActions({ row }: { row: Row }) {
  return (
    // Popover clicks bubble through React to the row / card; keep them from opening the token.
    <span className="flex items-center justify-end gap-1" data-row-ignore onClick={(e) => e.stopPropagation()}>
      <QuickBuyButton chain={row.chain} token={row.address} symbol={row.symbol} />
      <WatchStar token={row} size="xs" />
    </span>
  );
}
