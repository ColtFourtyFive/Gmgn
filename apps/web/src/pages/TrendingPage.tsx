// Trending: tokens ranked by swap activity over a window, streamed from
// `trending:<chain>` with server-side sorting (TrendingSort) and filters (the
// viewer's blacklist merged in).

import { useMemo } from 'react';
import {
  CHAINS,
  formatPercent,
  STAT_WINDOWS,
  type ChainId,
  type DisplaySettings,
  type StatWindow,
  type TokenSummary,
  type TrendingSnapshot,
  type TrendingSort,
  type WalletTag,
} from '@trenchscope/shared';
import { TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { Compact, FlashValue, Pct, Price, Usd } from '@/components/common';
import {
  BuySellBar,
  devStatusMeta,
  FilterToolbar,
  hasFilters,
  LiveStatus,
  QuickBuyAmount,
  SafetyCell,
  TagCount,
  TokenCell,
  useBlacklistFilter,
  useLiveSnapshot,
  useQuickBuyAmount,
  useStableItems,
  useStoredFilters,
  useViewerTags,
  withExclusions,
} from '@/components/discovery';
import { Page, PageHeader } from '@/components/layout';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { Button, DataTable, EmptyState, ErrorState, SegmentedControl, Select, Tooltip, type Column, type SortState } from '@/components/ui';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useOpenLink } from '@/hooks/useOpenLink';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';

const LIMIT = 100;
const tokenKey = (t: TokenSummary) => t.address;

/** Table column -> server sort key. */
const COLUMN_SORT: Record<string, TrendingSort> = {
  token: 'hot',
  age: 'age',
  price: 'priceChange',
  mcap: 'marketCap',
  liq: 'liquidity',
  vol: 'volume',
  swaps: 'swaps',
  holders: 'holders',
  smart: 'smartDegenCount',
  kol: 'kolCount',
  netbuy: 'netBuy',
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'token', label: 'Hot (rank)' },
  { value: 'vol', label: 'Volume' },
  { value: 'swaps', label: 'Swaps' },
  { value: 'price', label: 'Price change' },
  { value: 'mcap', label: 'Market cap' },
  { value: 'liq', label: 'Liquidity' },
  { value: 'holders', label: 'Holders' },
  { value: 'age', label: 'Newest' },
  { value: 'smart', label: 'Smart money' },
  { value: 'kol', label: 'KOLs' },
  { value: 'netbuy', label: 'Net buy 24h' },
];

const DEFAULT_SORT: SortState = { key: 'token', dir: 'desc' };

function validWindow(w: unknown): StatWindow {
  return STAT_WINDOWS.includes(w as StatWindow) ? (w as StatWindow) : '1h';
}

function validSort(s: unknown): SortState {
  const v = s as Partial<SortState> | null;
  return v && typeof v.key === 'string' && v.key in COLUMN_SORT && (v.dir === 'asc' || v.dir === 'desc') ? { key: v.key, dir: v.dir } : DEFAULT_SORT;
}

/** Server order for a header sort. "Age" descending reads as newest first. */
function serverOrder(sort: SortState): { sort: TrendingSort; order: 'asc' | 'desc' } {
  const key = COLUMN_SORT[sort.key];
  if (key === 'age') return { sort: key, order: sort.dir === 'desc' ? 'asc' : 'desc' };
  return { sort: key, order: sort.dir };
}

export default function TrendingPage() {
  const chain = useChain();
  return <Trending key={chain} chain={chain} />;
}

interface ColumnDeps {
  win: StatWindow;
  thresholds: DisplaySettings['riskThresholds'];
  buyAmount: number;
  devTags: (address: string) => WalletTag[];
  mobile: boolean;
}

function trendingColumns({ win, thresholds, buyAmount, devTags, mobile }: ColumnDeps): Column<TokenSummary>[] {
  return [
    {
      key: 'token',
      header: 'Token',
      title: 'Sort by trending rank',
      sortable: true,
      sticky: true,
      width: mobile ? 132 : 250,
      render: (t, i) => <TokenCell token={t} rank={i + 1} devTags={devTags(t.creator)} dense={mobile} showLaunchpad />,
    },
    {
      key: 'price',
      header: `Price · ${win}`,
      title: `Price and change over ${win}`,
      sortable: true,
      align: 'right',
      render: (t) => (
        <span className="flex flex-col items-end leading-tight">
          <FlashValue value={t.priceUsd}>
            <Price value={t.priceUsd} className="text-fg" />
          </FlashValue>
          <Pct value={t.stats[win].priceChange} digits={1} className="text-xs" />
        </span>
      ),
    },
    {
      key: 'mcap',
      header: 'MCap',
      sortable: true,
      align: 'right',
      render: (t) => (
        <FlashValue value={t.marketCapUsd}>
          <Usd value={t.marketCapUsd} className="font-medium text-fg" />
        </FlashValue>
      ),
    },
    {
      key: 'liq',
      header: 'Liq',
      sortable: true,
      align: 'right',
      render: (t) => <Usd value={t.liquidityUsd} />,
    },
    {
      key: 'vol',
      header: `Vol ${win}`,
      sortable: true,
      align: 'right',
      render: (t) => (
        <FlashValue value={t.stats[win].volumeUsd}>
          <Usd value={t.stats[win].volumeUsd} className="text-fg" />
        </FlashValue>
      ),
    },
    {
      key: 'swaps',
      header: `Swaps ${win}`,
      title: 'Buys / sells over the window',
      sortable: true,
      align: 'right',
      width: 96,
      render: (t) => {
        const w = t.stats[win];
        return (
          <span className="ml-auto flex w-[76px] flex-col items-end gap-0.5 leading-tight">
            <Compact value={w.swaps} className="text-fg" />
            <span className="num text-2xs">
              <span className="text-up">
                <Compact value={w.buys} digits={1} />
              </span>
              <span className="text-faint">/</span>
              <span className="text-down">
                <Compact value={w.sells} digits={1} />
              </span>
            </span>
            <BuySellBar buys={w.buys} sells={w.sells} />
          </span>
        );
      },
    },
    {
      key: 'holders',
      header: 'Holders',
      sortable: true,
      align: 'right',
      render: (t) => (
        <FlashValue value={t.holderCount}>
          <Compact value={t.holderCount} />
        </FlashValue>
      ),
    },
    {
      key: 'smart',
      header: 'Smart',
      title: 'Smart-money holders',
      sortable: true,
      align: 'center',
      render: (t) => <TagCount tag="smart" count={t.smartDegenCount} hideZero={false} />,
    },
    {
      key: 'kol',
      header: 'KOL',
      title: 'KOL holders',
      sortable: true,
      align: 'center',
      render: (t) => <TagCount tag="kol" count={t.kolCount} hideZero={false} />,
    },
    {
      key: 'top10',
      header: 'Top 10',
      title: `Top-10 holder share (red above ${formatPercent(thresholds.top10, { sign: false, digits: 0 })})`,
      align: 'right',
      render: (t) => (
        <span className={clsx('num', t.security.top10HolderRate > thresholds.top10 ? 'text-down' : 'text-muted')}>
          {formatPercent(t.security.top10HolderRate, { sign: false, digits: 1 })}
        </span>
      ),
    },
    {
      key: 'dev',
      header: 'Dev',
      title: 'Dev status and share of supply held',
      align: 'right',
      render: (t) => {
        const meta = devStatusMeta(t.security.devStatus);
        const risky = t.security.devHoldRate > thresholds.dev;
        return (
          <Tooltip content={meta.hint}>
            <span className="flex flex-col items-end leading-tight" tabIndex={0}>
              <span className={clsx('text-xs', meta.className)}>{meta.label}</span>
              <span className={clsx('num text-2xs', risky ? 'text-down' : 'text-faint')}>{formatPercent(t.security.devHoldRate, { sign: false, digits: 1 })}</span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: 'safety',
      header: 'Safety',
      title: 'Safety score 0-100 (hover for the reasons) and rug risk',
      align: 'center',
      render: (t) => <SafetyCell token={t} />,
    },
    ...(['1m', '5m', '1h'] as const).map(
      (w): Column<TokenSummary> => ({
        key: `chg${w}`,
        header: w,
        title: `Price change over ${w}`,
        align: 'right',
        render: (t) => <Pct value={t.stats[w].priceChange} digits={1} />,
      }),
    ),
    {
      key: 'buy',
      header: <span className="sr-only">Quick buy</span>,
      align: 'right',
      render: (t) => <QuickBuyButton chain={t.chain} token={t.address} symbol={t.symbol} amount={buyAmount} />,
    },
  ];
}

function Trending({ chain }: { chain: ChainId }) {
  const openLink = useOpenLink();
  const display = useDisplaySettings();
  const devTags = useViewerTags(chain);
  const mobile = useIsMobile();
  const [buyAmount, setBuyAmount] = useQuickBuyAmount(chain);
  const [rawWindow, setWindow] = useLocalStorage<StatWindow>('ts.trending.window', '1h');
  const win = validWindow(rawWindow);
  const [rawSort, setSort] = useLocalStorage<SortState>('ts.trending.sort', DEFAULT_SORT);
  const sort = validSort(rawSort);
  const [filters, setFilters] = useStoredFilters(`ts.trending.filters.${chain}`);

  const { exclusions, isHidden } = useBlacklistFilter(chain);

  const { sort: serverSort, order } = serverOrder(sort);
  const params = useMemo(
    () => ({ window: win, sort: serverSort, order, filters: withExclusions(hasFilters(filters) ? filters : undefined, exclusions), limit: LIMIT }),
    [win, serverSort, order, filters, exclusions],
  );
  const snap = useLiveSnapshot<TrendingSnapshot>({
    channel: `trending:${chain}`,
    type: 'trending',
    params,
    fetch: () => api.trending(chain, params),
    queryKey: ['trending', chain, params],
  });

  const columns = useMemo(
    () => trendingColumns({ win, thresholds: display.riskThresholds, buyAmount, devTags, mobile }),
    [win, display.riskThresholds, buyAmount, devTags, mobile],
  );
  // Hidden tokens leave at once, before the next push applies the new exclusions.
  const visible = useMemo(() => snap.data?.tokens.filter((t) => !isHidden(t)), [snap.data, isHidden]);
  const rows = useStableItems(visible, tokenKey) ?? [];

  return (
    <Page fullHeight className="!pb-2">
      <PageHeader
        title="Trending"
        icon={<TrendingUp size={16} />}
        subtitle={<span className="hidden sm:inline">Most traded tokens on {CHAINS[chain].name}, ranked by swap activity</span>}
        className="!mb-2"
        actions={
          <>
            <LiveStatus live={snap.live} error={!!snap.error} stale={snap.stale} cadence="2s" />
            <QuickBuyAmount chain={chain} value={buyAmount} onChange={setBuyAmount} />
          </>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={win}
          onChange={setWindow}
          items={STAT_WINDOWS.map((w) => ({ value: w, label: w }))}
          aria-label="Ranking window"
        />
        <FilterToolbar chain={chain} filters={filters} onChange={setFilters} title="Trending filters" window={win} hide={['progress']} />
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          Sort
          <Select
            size="sm"
            value={sort.key}
            onChange={(key) => setSort({ key, dir: 'desc' })}
            options={SORT_OPTIONS}
            placement="bottom-end"
            aria-label="Sort trending by"
            className="w-[128px]"
          />
        </span>
      </div>
      <div className={clsx('panel flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity', snap.stale && 'opacity-60')}>
        {snap.error && !snap.data ? (
          <ErrorState title="Couldn’t load trending tokens" error={snap.error} onRetry={snap.retry} retrying={snap.retrying} />
        ) : (
          <DataTable
            aria-label="Trending tokens"
            columns={columns}
            rows={rows}
            rowKey={(t) => t.address}
            sort={sort}
            onSortChange={setSort}
            manualSort
            onRowClick={(t, e) => openLink(routes.token(t.chain, t.address), e)}
            loading={snap.loading}
            skeletonRows={14}
            compact={display.compactRows}
            minWidth={1340}
            className="min-h-0 flex-1"
            empty={
              <EmptyState
                compact
                title={hasFilters(filters) ? 'No tokens match your filters' : `No trades in the last ${win}`}
                description={hasFilters(filters) ? 'Loosen or clear the filters to see more tokens.' : 'Try a longer window.'}
                action={
                  hasFilters(filters) ? (
                    <Button size="xs" variant="outline" onClick={() => setFilters({})}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
      </div>
    </Page>
  );
}
