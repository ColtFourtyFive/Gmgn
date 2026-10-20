// Live trade feed: REST history for the chosen filter merged with the token
// stream (filtered client-side the same way), wallet-class filters, min USD,
// maker filter, Price/MC column, pause + auto-pause while scrolled, and a
// flash on new rows.

import { useCallback, useMemo, useRef, useState, type UIEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { shortAddress, type TokenDetail, type Trade } from '@trenchscope/shared';
import { Filter, Pause, Play, X } from 'lucide-react';
import clsx from 'clsx';
import { AddressLink, Age, Compact, Native, Price, Usd, WALLET_TAG_META } from '@/components/common';
import { useViewerTags } from '@/components/discovery';
import { CopyButton, DataTable, EmptyState, ErrorState, IconButton, SegmentedControl, Select, Tooltip, type Column } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { useConnectionState } from '@/lib/ws';
import { useSession } from '@/store/session';
import { useLiveTrades, useTokenFeed } from '../feed';
import { ACTIVITY_FILTERS, matchesActivityFilter, withViewerTags, type ActivityFilter } from '../model';
import { tokenKeys, useChartUnit, useOnReconnect } from '../queries';
import { useTokenUi, type ChartUnit } from '../store';

const MIN_USD_OPTIONS = [
  { value: 0, label: 'Any size' },
  { value: 100, label: '≥ $100' },
  { value: 500, label: '≥ $500' },
  { value: 1000, label: '≥ $1K' },
  { value: 5000, label: '≥ $5K' },
  { value: 10000, label: '≥ $10K' },
];
const ROW_CAP = 200;
const FLASH_MS = 1200;

interface Row extends Trade {
  tags: Trade['walletTags'];
}

export function ActivityTab({ token, maxHeight }: { token: TokenDetail; maxHeight: number | string }) {
  const { chain, address } = token;
  const signedIn = useSession((s) => !!s.token);
  const viewerTags = useViewerTags(chain);
  const maker = useTokenUi((s) => s.maker);
  const setMaker = useTokenUi((s) => s.setMaker);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [minUsd, setMinUsd] = useState(0);
  const [unit, setUnit] = useChartUnit();
  const [manualPause, setManualPause] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { flashUpdates } = useDisplaySettings();
  const feed = useTokenFeed();
  const live = useLiveTrades();
  const roomy = useBreakpoint('sm');

  const activeFilter: ActivityFilter = !signedIn && (filter === 'mine' || filter === 'following') ? 'all' : filter;
  const q = { filter: activeFilter === 'all' ? undefined : activeFilter, minUsd: minUsd || undefined, wallet: maker ?? undefined, limit: 100 };
  const history = useQuery({
    queryKey: tokenKeys.trades(chain, address, { ...q, viewer: signedIn }),
    queryFn: () => api.trades(chain, address, q),
    staleTime: 0,
    gcTime: 30_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useOnReconnect(() => void history.refetch());

  // Row objects are cached by id so memoized table rows only re-render when their data changes.
  const rowCache = useRef(new Map<string, { sig: string; row: Row }>());
  const rows = useMemo<Row[]>(() => {
    const cache = rowCache.current;
    const toRow = (t: Trade, tags: Row['tags']): Row => {
      const sig = tags.join(',');
      const hit = cache.get(t.id);
      if (hit && hit.sig === sig) return hit.row;
      const row = { ...t, tags };
      cache.set(t.id, { sig, row });
      return row;
    };
    const byId = new Map<string, Row>();
    for (const t of live) {
      const tags = withViewerTags(t, viewerTags(t.wallet));
      if (maker && t.wallet !== maker) continue;
      if (minUsd && t.usdAmount < minUsd) continue;
      if (!matchesActivityFilter(t, tags, activeFilter)) continue;
      byId.set(t.id, toRow(t, tags));
    }
    if (!history.isPlaceholderData) {
      for (const t of history.data ?? []) if (!byId.has(t.id)) byId.set(t.id, toRow(t, withViewerTags(t, viewerTags(t.wallet))));
    }
    const out = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, ROW_CAP);
    if (cache.size > 2000) {
      const keep = new Set(out.map((r) => r.id));
      for (const id of cache.keys()) if (!keep.has(id)) cache.delete(id);
    }
    return out;
  }, [live, history.data, history.isPlaceholderData, viewerTags, maker, minUsd, activeFilter]);

  // Pause: freeze the rows while paused (manually or because the list is scrolled).
  // A filter change while paused re-freezes on the new result.
  const paused = manualPause || scrolled;
  const freezeKey = `${activeFilter}|${minUsd}|${maker ?? ''}|${history.isPlaceholderData}`;
  const frozen = useRef<{ key: string; rows: Row[] } | null>(null);
  if (!paused) frozen.current = null;
  else if (!frozen.current || frozen.current.key !== freezeKey) frozen.current = { key: freezeKey, rows };
  const shown = paused && frozen.current ? frozen.current.rows : rows;
  const newest = shown[0]?.timestamp ?? 0;
  const pendingCount = paused ? rows.filter((r) => r.timestamp > newest).length : 0;
  const conn = useConnectionState();

  const scrollerRef = useRef<HTMLElement | null>(null);
  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    scrollerRef.current = el;
    setScrolled(el.scrollTop > 24);
  }, []);
  const resume = () => {
    setManualPause(false);
    setScrolled(false);
    scrollerRef.current?.scrollTo({ top: 0 });
  };

  const columns = useMemo<Column<Row>[]>(() => buildColumns(token, unit, setMaker), [token.chain, token.symbol, unit, setMaker]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowClassName = useCallback(
    (r: Row) => {
      const at = feed.arrivedAt.get(r.id);
      if (!flashUpdates || !at || Date.now() - at > FLASH_MS) return undefined;
      return r.side === 'buy' ? 'animate-flash-up' : 'animate-flash-down';
    },
    [feed, flashUpdates],
  );

  const filterItems = useMemo(
    () =>
      ACTIVITY_FILTERS.filter((f) => !f.private || signedIn).map((f) => {
        const meta = f.tag ? WALLET_TAG_META[f.tag] : null;
        const Icon = meta?.icon;
        return {
          value: f.value,
          label: f.label,
          icon: Icon ? <Icon size={11} style={{ color: `rgb(var(--${meta.token}))` }} aria-hidden /> : undefined,
        };
      }),
    [signedIn],
  );

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        <SegmentedControl size="sm" value={activeFilter} onChange={setFilter} items={filterItems} aria-label="Trader type" className="max-w-full" />
        <Select size="sm" value={minUsd} onChange={setMinUsd} options={MIN_USD_OPTIONS} className="w-[100px]" />
        <SegmentedControl
          size="sm"
          value={unit}
          onChange={setUnit}
          items={[
            { value: 'price', label: 'Price' },
            { value: 'mcap', label: 'MC' },
          ]}
          aria-label="Price or market cap column"
        />
        {maker && (
          <span className="chip h-6 bg-accent/15 !px-2 text-accent">
            <Filter size={10} aria-hidden />
            {shortAddress(maker)}
            <button type="button" onClick={() => setMaker(null)} className="ml-0.5 rounded hover:text-fg" aria-label="Show all makers">
              <X size={11} />
            </button>
          </span>
        )}
        <span className="flex-1" />
        {pendingCount > 0 && (
          <button type="button" onClick={resume} className="chip h-6 bg-accent/15 !px-2 text-accent hover:bg-accent/25">
            {pendingCount} new
          </button>
        )}
        <Tooltip content={paused ? (scrolled && !manualPause ? 'Paused while scrolled — scroll up or click to resume' : 'Resume live stream') : 'Pause live stream'}>
          <IconButton
            size="sm"
            label={paused ? 'Resume stream' : 'Pause stream'}
            active={paused}
            icon={paused ? <Play size={13} /> : <Pause size={13} />}
            onClick={() => (paused ? resume() : setManualPause(true))}
          />
        </Tooltip>
        <span className={clsx('inline-flex items-center gap-1 text-2xs', conn !== 'open' ? 'text-down' : paused ? 'text-warn' : 'text-up')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', conn !== 'open' ? 'animate-pulse2 bg-down' : paused ? 'bg-warn' : 'animate-pulse2 bg-up')} />
          {conn !== 'open' ? 'Reconnecting' : paused ? 'Paused' : 'Live'}
        </span>
      </div>
      {history.isError && rows.length === 0 ? (
        <ErrorState compact error={history.error} onRetry={() => void history.refetch()} retrying={history.isFetching} />
      ) : (
        <div onScrollCapture={onScroll} className="min-w-0">
          <DataTable
            aria-label={`${token.symbol} trades`}
            columns={columns}
            rows={shown}
            rowKey={(r) => r.id}
            rowClassName={rowClassName}
            loading={history.isPending || history.isPlaceholderData}
            compact
            maxHeight={maxHeight}
            minWidth={roomy ? 760 : 460}
            onRowClick={(r) => setMaker(maker === r.wallet ? null : r.wallet)}
            empty={
              <EmptyState
                compact
                title={maker ? 'No trades from this maker' : 'No trades match'}
                description={maker ? 'Clear the maker filter to see everyone.' : 'Loosen the filters or wait for the next swap.'}
              />
            }
          />
        </div>
      )}
    </div>
  );
}

function buildColumns(token: TokenDetail, unit: ChartUnit, setMaker: (m: string | null) => void): Column<Row>[] {
  const { chain, symbol } = token;
  return [
    { key: 'age', header: 'Age', width: 56, render: (r) => <Age ts={r.timestamp} className="text-muted" /> },
    {
      key: 'type',
      header: 'Type',
      width: 52,
      render: (r) => <span className={clsx('text-xs font-semibold uppercase', r.side === 'buy' ? 'text-up' : 'text-down')}>{r.side === 'buy' ? 'Buy' : 'Sell'}</span>,
    },
    {
      key: 'usd',
      header: 'USD',
      align: 'right',
      render: (r) => <Usd value={r.usdAmount} className={clsx('font-medium', r.side === 'buy' ? 'text-up' : 'text-down')} />,
    },
    {
      key: 'amount',
      header: symbol.length > 8 ? 'Amount' : symbol,
      align: 'right',
      hideBelow: 'sm',
      render: (r) => <Compact value={r.tokenAmount} className="text-fg" />,
    },
    {
      key: 'native',
      header: 'Native',
      align: 'right',
      hideBelow: 'md',
      render: (r) => <Native value={r.nativeAmount} chain={chain} className="text-muted" />,
    },
    {
      key: 'price',
      header: unit === 'mcap' ? 'MC' : 'Price',
      align: 'right',
      render: (r) => (unit === 'mcap' ? <Usd value={r.marketCapUsd} className="text-muted" /> : <Price value={r.priceUsd} className="text-muted" />),
    },
    {
      key: 'maker',
      header: 'Maker',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-1">
          <AddressLink chain={chain} address={r.wallet} label={r.walletLabel} tags={r.tags} copy={false} avatar />
          <button
            type="button"
            aria-label="Filter by this maker"
            title="Filter by this maker"
            onClick={() => setMaker(r.wallet)}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Filter size={11} />
          </button>
        </span>
      ),
    },
    {
      key: 'tx',
      header: 'Tx',
      align: 'right',
      hideBelow: 'lg',
      width: 110,
      render: (r) => (
        <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-faint">
          {shortAddress(r.txHash, 4, 4)}
          <CopyButton text={r.txHash} label="Copy transaction hash" size={11} />
        </span>
      ),
    },
  ];
}
