// New Pairs: tokens that just graduated to a DEX pool, newest pool first,
// streamed from `newpairs:<chain>` (every 2s) with the shared filters (the
// viewer's blacklist merged in).

import { useMemo } from 'react';
import { CHAINS, formatDuration, formatPercent, STAT_WINDOWS, type ChainId, type DisplaySettings, type StatWindow, type TokenSummary, type WalletTag } from '@trenchscope/shared';
import { Sparkles } from 'lucide-react';
import { Age, Compact, FlashValue, Pct, Usd } from '@/components/common';
import {
  BuySellBar,
  FilterToolbar,
  hasFilters,
  LiveStatus,
  QuickBuyAmount,
  SafetyCell,
  SecuritySummary,
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
import { Button, DataTable, EmptyState, ErrorState, SegmentedControl, type Column } from '@/components/ui';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useOpenLink } from '@/hooks/useOpenLink';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';
import clsx from 'clsx';

const LIMIT = 100;
const tokenKey = (t: TokenSummary) => t.address;

export default function NewPairsPage() {
  const chain = useChain();
  return <NewPairs key={chain} chain={chain} />;
}

interface ColumnDeps {
  win: StatWindow;
  thresholds: DisplaySettings['riskThresholds'];
  buyAmount: number;
  devTags: (address: string) => WalletTag[];
  mobile: boolean;
}

function newPairColumns({ win, thresholds, buyAmount, devTags, mobile }: ColumnDeps): Column<TokenSummary>[] {
  return [
    {
      key: 'token',
      header: 'Token',
      sticky: true,
      width: mobile ? 120 : 220,
      render: (t) => <TokenCell token={t} devTags={devTags(t.creator)} dense={mobile} />,
    },
    {
      key: 'pool',
      header: 'Pool age',
      title: 'Time since the pool opened (migration)',
      sortable: true,
      sortValue: (t) => t.migratedAt ?? t.createdAt,
      render: (t) => (
        <span className="flex flex-col leading-tight">
          <Age ts={t.migratedAt ?? t.createdAt} className="font-medium text-info" />
          <span className="truncate text-2xs text-faint">{t.dex ?? 'DEX'}</span>
        </span>
      ),
    },
    {
      key: 'bonded',
      header: 'Bonded in',
      title: 'Time from launch to curve completion',
      sortable: true,
      align: 'right',
      sortValue: (t) => t.completeCostSeconds,
      render: (t) => <span className="num text-muted">{formatDuration(t.completeCostSeconds)}</span>,
    },
    {
      key: 'liq',
      header: 'Liquidity',
      title: 'Pool liquidity · share of market cap',
      sortable: true,
      align: 'right',
      sortValue: (t) => t.liquidityUsd,
      render: (t) => (
        <span className="flex flex-col items-end leading-tight">
          <FlashValue value={t.liquidityUsd}>
            <Usd value={t.liquidityUsd} className="text-fg" />
          </FlashValue>
          <span className="num text-2xs text-faint" title="Liquidity / market cap">
            {t.marketCapUsd > 0 ? formatPercent(t.liquidityUsd / t.marketCapUsd, { sign: false, digits: 0 }) : '--'} of MC
          </span>
        </span>
      ),
    },
    {
      key: 'initLiq',
      header: 'Initial liq',
      title: 'Liquidity the pool opened with · change since',
      sortable: true,
      align: 'right',
      sortValue: (t) => t.initialLiquidityUsd,
      render: (t) => (
        <span className="flex flex-col items-end leading-tight">
          <Usd value={t.initialLiquidityUsd} className="text-muted" />
          <Pct value={t.initialLiquidityUsd > 0 ? t.liquidityUsd / t.initialLiquidityUsd - 1 : null} digits={0} className="text-2xs" />
        </span>
      ),
    },
    {
      key: 'mcap',
      header: 'MCap',
      sortable: true,
      align: 'right',
      sortValue: (t) => t.marketCapUsd,
      render: (t) => (
        <FlashValue value={t.marketCapUsd}>
          <Usd value={t.marketCapUsd} className="font-medium text-fg" />
        </FlashValue>
      ),
    },
    {
      key: 'vol',
      header: `Vol ${win}`,
      sortable: true,
      align: 'right',
      sortValue: (t) => t.stats[win].volumeUsd,
      render: (t) => <Usd value={t.stats[win].volumeUsd} />,
    },
    {
      key: 'swaps',
      header: `Swaps ${win}`,
      sortable: true,
      align: 'right',
      width: 90,
      sortValue: (t) => t.stats[win].swaps,
      render: (t) => {
        const w = t.stats[win];
        return (
          <span className="ml-auto flex w-[72px] flex-col items-end gap-0.5 leading-tight" title={`${w.buys} buys / ${w.sells} sells`}>
            <Compact value={w.swaps} />
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
      sortValue: (t) => t.holderCount,
      render: (t) => <Compact value={t.holderCount} />,
    },
    {
      key: 'chg',
      header: `Δ ${win}`,
      title: `Price change over ${win}`,
      sortable: true,
      align: 'right',
      sortValue: (t) => t.stats[win].priceChange,
      render: (t) => <Pct value={t.stats[win].priceChange} digits={1} />,
    },
    {
      key: 'smart',
      header: 'Smart / KOL',
      sortable: true,
      align: 'center',
      sortValue: (t) => t.smartDegenCount * 1000 + t.kolCount,
      render: (t) => (
        <span className="inline-flex gap-0.5">
          <TagCount tag="smart" count={t.smartDegenCount} hideZero={false} />
          <TagCount tag="kol" count={t.kolCount} hideZero={false} />
        </span>
      ),
    },
    {
      key: 'security',
      header: 'Audit',
      title: 'Contract checks, LP burn and top-10 share',
      render: (t) => <SecuritySummary token={t} top10Threshold={thresholds.top10} />,
    },
    {
      key: 'safety',
      header: 'Safety',
      title: 'Safety score 0-100 (hover for the reasons) and rug risk',
      sortable: true,
      align: 'center',
      sortValue: (t) => t.security.safety?.score,
      render: (t) => <SafetyCell token={t} />,
    },
    {
      key: 'buy',
      header: <span className="sr-only">Quick buy</span>,
      align: 'right',
      render: (t) => <QuickBuyButton chain={t.chain} token={t.address} symbol={t.symbol} amount={buyAmount} />,
    },
  ];
}

function NewPairs({ chain }: { chain: ChainId }) {
  const openLink = useOpenLink();
  const display = useDisplaySettings();
  const devTags = useViewerTags(chain);
  const mobile = useIsMobile();
  const [buyAmount, setBuyAmount] = useQuickBuyAmount(chain);
  const [rawWin, setWin] = useLocalStorage<StatWindow>('ts.newpairs.window', '1h');
  const win = STAT_WINDOWS.includes(rawWin) ? rawWin : '1h';
  const [filters, setFilters] = useStoredFilters(`ts.newpairs.filters.${chain}`);

  const { exclusions, isHidden } = useBlacklistFilter(chain);
  const params = useMemo(() => ({ filters: withExclusions(hasFilters(filters) ? filters : undefined, exclusions), limit: LIMIT }), [filters, exclusions]);
  const snap = useLiveSnapshot<TokenSummary[]>({
    channel: `newpairs:${chain}`,
    type: 'newpairs',
    params,
    fetch: () => api.newPairs(chain, params.filters, LIMIT),
    queryKey: ['new-pairs', chain, params],
  });

  const columns = useMemo(() => newPairColumns({ win, thresholds: display.riskThresholds, buyAmount, devTags, mobile }), [win, display.riskThresholds, buyAmount, devTags, mobile]);
  // Hidden tokens leave at once, before the next push applies the new exclusions.
  const visible = useMemo(() => snap.data?.filter((t) => !isHidden(t)), [snap.data, isHidden]);
  const rows = useStableItems(visible, tokenKey);
  const filtered = hasFilters(filters);

  return (
    <Page fullHeight className="!pb-2">
      <PageHeader
        title="New Pairs"
        icon={<Sparkles size={16} />}
        subtitle={<span className="hidden sm:inline">Fresh DEX pools on {CHAINS[chain].name} — tokens that just completed their bonding curve</span>}
        className="!mb-2"
        actions={
          <>
            <LiveStatus live={snap.live} error={!!snap.error} stale={snap.stale} cadence="2s" />
            <QuickBuyAmount chain={chain} value={buyAmount} onChange={setBuyAmount} />
          </>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SegmentedControl value={win} onChange={setWin} items={STAT_WINDOWS.map((w) => ({ value: w, label: w }))} aria-label="Stats window" />
        <FilterToolbar chain={chain} filters={filters} onChange={setFilters} title="New pair filters" window="24h" hide={['progress']} />
        <span className="ml-auto hidden text-xs text-muted sm:inline">
          {rows ? `${rows.length} pools` : ''}
        </span>
      </div>
      <div className={clsx('panel flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity', snap.stale && 'opacity-60')}>
        {snap.error && !snap.data ? (
          <ErrorState title="Couldn’t load new pairs" error={snap.error} onRetry={snap.retry} retrying={snap.retrying} />
        ) : (
          <DataTable
            aria-label="New pairs"
            columns={columns}
            rows={rows ?? []}
            rowKey={(t) => t.address}
            defaultSort={{ key: 'pool', dir: 'desc' }}
            onRowClick={(t, e) => openLink(routes.token(t.chain, t.address), e)}
            loading={snap.loading}
            skeletonRows={14}
            compact={display.compactRows}
            minWidth={1360}
            className="min-h-0 flex-1"
            empty={
              <EmptyState
                compact
                icon={<Sparkles size={16} />}
                title={filtered ? 'No pools match your filters' : 'No migrations yet'}
                description={filtered ? 'Loosen or clear the filters to see more pools.' : 'Tokens show up here the moment their curve completes.'}
                action={
                  filtered ? (
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
