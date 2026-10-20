// Trenches: the live three-column launchpad board (New | Near graduation |
// Migrated) streamed from `trenches:<chain>`, with per-column filters (saved
// per chain + column, the viewer's blacklist merged into each), client-side
// sorting, pause-on-hover and hotkeys.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHAINS, type ChainId, type TokenFilters, type TokenSummary, type TrenchesColumn as Column, type TrenchesSnapshot } from '@trenchscope/shared';
import { Flame } from 'lucide-react';
import {
  COLUMN_META,
  hasFilters,
  HotkeysHint,
  LiveStatus,
  QuickBuyAmount,
  TrenchesColumn,
  useBlacklistFilter,
  useLiveSnapshot,
  useQuickBuyAmount,
  useStoredFilters,
  useViewerTags,
  withExclusions,
  type HotkeyRow,
  type TrenchSort,
  type TrenchSortKey,
} from '@/components/discovery';
import { Page, PageHeader } from '@/components/layout';
import { useQuickTrade } from '@/components/trade/useQuickTrade';
import { Tabs } from '@/components/ui';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';
import { useUi } from '@/store/ui';

const COLUMNS: Column[] = ['new', 'almost', 'migrated'];
const LIMIT = 50;
const SORT_KEYS: TrenchSortKey[] = ['age', 'mcap', 'volume', 'holders', 'progress'];

const HOTKEYS: HotkeyRow[] = [
  { keys: ['1', '2', '3'], label: 'Focus New / Almost / Migrated' },
  { keys: ['J', 'K'], label: 'Next / previous token' },
  { keys: ['H', 'L'], label: 'Previous / next column' },
  { keys: ['Enter'], label: 'Open token' },
  { keys: ['B'], label: 'Quick buy selected', trading: true },
  { keys: ['Esc'], label: 'Clear selection' },
];

function validSort(s: unknown, fallback: TrenchSort): TrenchSort {
  const v = s as Partial<TrenchSort> | null;
  return v && SORT_KEYS.includes(v.key as TrenchSortKey) && (v.dir === 'asc' || v.dir === 'desc') ? { key: v.key as TrenchSortKey, dir: v.dir } : fallback;
}

export default function TrenchesPage() {
  const chain = useChain();
  // Remount per chain: the live board, keyboard selection and column buffers belong to one chain
  // (kept mounted, the board would show the previous chain's snapshot until the first push).
  return <TrenchesBoard key={chain} chain={chain} />;
}

function TrenchesBoard({ chain }: { chain: ChainId }) {
  const navigate = useNavigate();
  const display = useDisplaySettings();
  // B places a trade: opt-in (off by default), unlike the navigation keys.
  const tradingHotkeys = useUi((s) => s.tradingHotkeys);
  const setTradingHotkeys = useUi((s) => s.setTradingHotkeys);
  const devTags = useViewerTags(chain);
  const wide = useBreakpoint('lg');
  const xl = useBreakpoint('xl');
  const [buyAmount, setBuyAmount] = useQuickBuyAmount(chain);

  const [fNew, setNew] = useStoredFilters(`ts.trenches.filters.${chain}.new`);
  const [fAlmost, setAlmost] = useStoredFilters(`ts.trenches.filters.${chain}.almost`);
  const [fMigrated, setMigrated] = useStoredFilters(`ts.trenches.filters.${chain}.migrated`);
  const filters: Record<Column, TokenFilters> = { new: fNew, almost: fAlmost, migrated: fMigrated };
  const setFilters: Record<Column, (f: TokenFilters) => void> = { new: setNew, almost: setAlmost, migrated: setMigrated };

  const [rawSorts, setSorts] = useLocalStorage<Partial<Record<Column, TrenchSort>>>('ts.trenches.sort', {});
  const sorts = useMemo(
    () => Object.fromEntries(COLUMNS.map((c) => [c, validSort(rawSorts?.[c], COLUMN_META[c].defaultSort)])) as Record<Column, TrenchSort>,
    [rawSorts],
  );
  const setSort = useCallback((c: Column, s: TrenchSort) => setSorts((prev) => ({ ...prev, [c]: s })), [setSorts]);

  const [rawTab, setTab] = useLocalStorage<Column>('ts.trenches.tab', 'new');
  const tab = COLUMNS.includes(rawTab) ? rawTab : 'new';

  // Only columns with active filters or blacklist exclusions are sent; params stay referentially stable.
  const { exclusions, isHidden } = useBlacklistFilter(chain);
  const wsFilters = useMemo(() => {
    const out: Partial<Record<Column, TokenFilters>> = {};
    const own: Record<Column, TokenFilters> = { new: fNew, almost: fAlmost, migrated: fMigrated };
    for (const c of COLUMNS) {
      const f = withExclusions(hasFilters(own[c]) ? own[c] : undefined, exclusions);
      if (f) out[c] = f;
    }
    return Object.keys(out).length ? out : undefined;
  }, [fNew, fAlmost, fMigrated, exclusions]);
  const params = useMemo(() => ({ filters: wsFilters, limit: LIMIT }), [wsFilters]);
  const snap = useLiveSnapshot<TrenchesSnapshot>({
    channel: `trenches:${chain}`,
    type: 'trenches',
    params,
    fetch: () => api.trenches(chain, wsFilters, LIMIT),
    queryKey: ['trenches', chain, params],
  });
  // A token hidden just now leaves at once, before the next push applies the new exclusions.
  const data = snap.data;
  const columns = useMemo(() => {
    if (!data) return null;
    const out = {} as Record<Column, TokenSummary[]>;
    for (const c of COLUMNS) out[c] = data[c].filter((t) => !isHidden(t));
    return out;
  }, [data, isHidden]);

  // ---- keyboard selection ---------------------------------------------------
  const [sel, setSel] = useState<{ col: Column; address: string | null } | null>(null);
  const lists = useRef<Record<Column, TokenSummary[]>>({ new: [], almost: [], migrated: [] });
  const onDisplayed = useCallback((c: Column, tokens: TokenSummary[]) => {
    lists.current[c] = tokens;
  }, []);

  const focusColumn = (col: Column, index = 0) => {
    const list = lists.current[col];
    setTab(col);
    setSel({ col, address: list[Math.min(index, list.length - 1)]?.address ?? null });
  };
  const move = (delta: number) => {
    const col = sel?.col ?? (wide ? 'new' : tab);
    const list = lists.current[col];
    if (list.length === 0) return setSel({ col, address: null });
    const i = sel?.address ? list.findIndex((t) => t.address === sel.address) : -1;
    const next = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + delta));
    setSel({ col, address: list[next].address });
  };
  const moveColumn = (delta: number) => {
    const from = sel?.col ?? (wide ? 'new' : tab);
    const i = sel?.address ? lists.current[from].findIndex((t) => t.address === sel.address) : 0;
    focusColumn(COLUMNS[(COLUMNS.indexOf(from) + delta + COLUMNS.length) % COLUMNS.length], Math.max(0, i));
  };
  const selectedToken = sel?.address ? lists.current[sel.col].find((t) => t.address === sel.address) : undefined;
  // B buys like the ⚡ buttons: active buy preset, the same safety gates, and "Confirm trades" asks first.
  const quick = useQuickTrade(chain, selectedToken?.address ?? '', selectedToken?.symbol);

  useHotkeys(
    {
      '1': () => focusColumn('new'),
      '2': () => focusColumn('almost'),
      '3': () => focusColumn('migrated'),
      j: () => move(1),
      k: () => move(-1),
      h: () => moveColumn(-1),
      l: () => moveColumn(1),
      // Only claim Enter / B / Escape while something is selected; B only with trading hotkeys on.
      ...(selectedToken ? { enter: () => navigate(routes.token(chain, selectedToken.address)) } : {}),
      ...(selectedToken && tradingHotkeys ? { b: () => quick.submit({ side: 'buy', amount: buyAmount }) } : {}),
      ...(sel ? { escape: () => setSel(null) } : {}),
    },
    { enabled: display.hotkeys },
  );

  const renderColumn = (c: Column, extra: { hideTitle?: boolean; className?: string } = {}) => (
    <TrenchesColumn
      key={c}
      chain={chain}
      column={c}
      tokens={columns ? columns[c] : null}
      error={snap.error}
      onRetry={snap.retry}
      retrying={snap.retrying}
      filters={filters[c]}
      onFiltersChange={setFilters[c]}
      sort={sorts[c]}
      onSortChange={(s) => setSort(c, s)}
      thresholds={display.riskThresholds}
      buyAmount={buyAmount}
      compact={display.compactRows || !xl}
      selected={sel?.col === c ? sel.address : null}
      focused={sel?.col === c}
      onDisplayed={onDisplayed}
      devTags={devTags}
      isHidden={isHidden}
      hideTitle={extra.hideTitle}
      className={extra.className}
    />
  );

  return (
    <Page fullHeight className="!pb-2">
      <PageHeader
        title="Trenches"
        icon={<Flame size={16} />}
        subtitle={<span className="hidden sm:inline">Live launchpad tokens on {CHAINS[chain].name} · new → almost bonded → migrated</span>}
        className="!mb-2"
        actions={
          <>
            <LiveStatus live={snap.live} error={!!snap.error} stale={snap.stale} />
            <QuickBuyAmount chain={chain} value={buyAmount} onChange={setBuyAmount} />
            <HotkeysHint
              rows={HOTKEYS}
              enabled={display.hotkeys}
              trading={{ enabled: tradingHotkeys, onChange: setTradingHotkeys }}
              className="hidden md:inline-flex"
            />
          </>
        }
      />
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">{COLUMNS.map((c) => renderColumn(c))}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <Tabs
            value={tab}
            onChange={(c) => {
              setTab(c);
              if (sel && sel.col !== c) setSel(null);
            }}
            items={COLUMNS.map((c) => ({ value: c, label: COLUMN_META[c].short, count: columns ? columns[c].length : null }))}
            aria-label="Trenches columns"
          />
          {renderColumn(tab, { hideTitle: true, className: 'flex-1' })}
        </div>
      )}
      {quick.dialog}
    </Page>
  );
}
