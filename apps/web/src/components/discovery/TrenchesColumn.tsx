import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChainId, DisplaySettings, TokenFilters, TokenSummary, TrenchesColumn as Column, WalletTag } from '@trenchscope/shared';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Pause, Rocket, Sparkles, Waypoints } from 'lucide-react';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, IconButton, Select, Skeleton } from '@/components/ui';
import { countFilters } from './filters';
import { FilterButton, FilterDrawer } from './FilterPanel';
import { TokenCard } from './TokenCard';
import { useStableItems } from './useStableItems';

const tokenKey = (t: TokenSummary) => t.address;

export type TrenchSortKey = 'age' | 'mcap' | 'volume' | 'holders' | 'progress';
export interface TrenchSort {
  key: TrenchSortKey;
  dir: 'asc' | 'desc';
}

export const COLUMN_META: Record<Column, { title: string; short: string; icon: typeof Sparkles; empty: string; defaultSort: TrenchSort }> = {
  new: { title: 'New', short: 'New', icon: Sparkles, empty: 'Waiting for new launches…', defaultSort: { key: 'age', dir: 'desc' } },
  almost: { title: 'Almost bonded', short: 'Almost', icon: Rocket, empty: 'No token is close to bonding right now.', defaultSort: { key: 'progress', dir: 'desc' } },
  migrated: { title: 'Migrated', short: 'Migrated', icon: Waypoints, empty: 'No migrations yet.', defaultSort: { key: 'age', dir: 'desc' } },
};

const SORT_LABEL: Record<TrenchSortKey, string> = { age: 'Newest', mcap: 'Market cap', volume: 'Volume 24h', holders: 'Holders', progress: 'Bonding %' };

function sortValue(t: TokenSummary, key: TrenchSortKey, column: Column): number {
  switch (key) {
    case 'age':
      return column === 'migrated' ? (t.migratedAt ?? t.createdAt) : t.createdAt;
    case 'mcap':
      return t.marketCapUsd;
    case 'volume':
      return t.stats['24h'].volumeUsd;
    case 'holders':
      return t.holderCount;
    case 'progress':
      return t.progress;
  }
}

/** Client-side column sort (stable; the server already sends feed order). */
export function sortTrench(tokens: TokenSummary[], sort: TrenchSort, column: Column): TokenSummary[] {
  const f = sort.dir === 'asc' ? 1 : -1;
  return tokens
    .map((t, i) => ({ t, i, v: sortValue(t, sort.key, column) }))
    .sort((a, b) => (a.v - b.v) * f || a.i - b.i)
    .map((x) => x.t);
}

export interface TrenchesColumnProps {
  chain: ChainId;
  column: Column;
  /** Column tokens from the latest snapshot (null while loading). */
  tokens: TokenSummary[] | null;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  filters: TokenFilters;
  onFiltersChange: (f: TokenFilters) => void;
  sort: TrenchSort;
  onSortChange: (s: TrenchSort) => void;
  thresholds: DisplaySettings['riskThresholds'];
  buyAmount: number;
  compact?: boolean;
  /** Keyboard-selected token address when the selection is in this column. */
  selected: string | null;
  /** Highlight the column as the keyboard target. */
  focused?: boolean;
  /** Reports the rendered order (for j/k navigation). */
  onDisplayed?: (column: Column, tokens: TokenSummary[]) => void;
  devTags: (address: string) => WalletTag[];
  /** Hide the title (mobile: the tabs show it). */
  hideTitle?: boolean;
  className?: string;
}

/**
 * One Trenches column: header (count, paused pill, sort, filters) and a live
 * card list. Hovering the column (or keyboard selection inside it) freezes
 * the rendered order; values keep updating in place and new arrivals are
 * counted until the column resumes.
 */
export const TrenchesColumn = memo(function TrenchesColumn({
  chain,
  column,
  tokens,
  error,
  onRetry,
  retrying,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  thresholds,
  buyAmount,
  compact,
  selected,
  focused,
  onDisplayed,
  devTags,
  hideTitle,
  className,
}: TrenchesColumnProps) {
  const meta = COLUMN_META[column];
  const [hovered, setHovered] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const paused = hovered || selected !== null;
  const filterCount = countFilters(filters);

  const stable = useStableItems(tokens, tokenKey);
  const sorted = useMemo(() => (stable ? sortTrench(stable, sort, column) : []), [stable, sort, column]);
  const byAddress = useMemo(() => new Map(sorted.map((t) => [t.address, t])), [sorted]);

  // Last known data of every token shown, so frozen cards that left the column keep rendering.
  const lastSeen = useRef(new Map<string, TokenSummary>());
  const displayedRef = useRef<TokenSummary[]>([]);
  const [frozen, setFrozen] = useState<string[] | null>(null);

  const freeze = () => setFrozen((f) => f ?? displayedRef.current.map((t) => t.address));
  useEffect(() => {
    if (!paused) setFrozen(null);
  }, [paused]);
  // A sort change while paused re-freezes on the new order (see below); a
  // filter change waits for the first snapshot of the new filters.
  const [awaitingData, setAwaitingData] = useState(false);
  const firstFilters = useRef(filters);
  useEffect(() => {
    setFrozen((f) => (f ? null : f));
  }, [sort]);
  useEffect(() => {
    if (firstFilters.current === filters) return;
    firstFilters.current = filters;
    setFrozen(null);
    setAwaitingData(true);
  }, [filters]);
  useEffect(() => setAwaitingData(false), [tokens]);

  const displayed = useMemo(() => {
    if (!frozen) return sorted;
    const out: TokenSummary[] = [];
    for (const a of frozen) {
      const t = byAddress.get(a) ?? lastSeen.current.get(a);
      if (t) out.push(t);
    }
    return out;
  }, [frozen, sorted, byAddress]);

  const buffered = useMemo(() => {
    if (!frozen) return 0;
    const shown = new Set(frozen);
    return sorted.reduce((n, t) => (shown.has(t.address) ? n : n + 1), 0);
  }, [frozen, sorted]);

  useEffect(() => {
    displayedRef.current = displayed;
    if (!frozen) lastSeen.current = new Map(byAddress);
    else for (const t of sorted) lastSeen.current.set(t.address, t);
    onDisplayed?.(column, displayed);
  }, [displayed, frozen, byAddress, sorted, column, onDisplayed]);

  // Freeze when paused by keyboard selection, and re-freeze after a sort/filter reset.
  useEffect(() => {
    if (paused && !frozen && !awaitingData) setFrozen(displayedRef.current.map((t) => t.address));
  }, [paused, frozen, awaitingData]);

  // New arrivals animate in, but not the first batch.
  const ready = useRef(false);
  useEffect(() => {
    if (displayed.length > 0) ready.current = true;
  }, [displayed.length]);

  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selected) return;
    listRef.current?.querySelector(`[data-token="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const loading = tokens === null && !error;
  const sortOptions = (Object.keys(SORT_LABEL) as TrenchSortKey[]).filter((k) => !(column === 'migrated' && k === 'progress')).map((k) => ({ value: k, label: SORT_LABEL[k] }));

  let body: ReactNode;
  if (loading) {
    body = <CardSkeletons />;
  } else if (tokens === null && error) {
    body = <ErrorState compact title="Couldn’t load tokens" error={error} onRetry={onRetry} retrying={retrying} />;
  } else if (displayed.length === 0) {
    body = filterCount ? (
      <EmptyState
        compact
        title="No tokens match your filters"
        description={`${filterCount} filter${filterCount === 1 ? '' : 's'} active on this column.`}
        action={
          <Button size="xs" variant="outline" onClick={() => onFiltersChange({})}>
            Reset filters
          </Button>
        }
      />
    ) : (
      <EmptyState compact icon={<meta.icon size={16} />} title={meta.empty} description="Tokens appear here the moment they qualify." />
    );
  } else {
    body = (
      <ul ref={listRef} aria-label={`${meta.title} tokens`}>
        {displayed.map((t) => (
          <TokenCard
            key={t.address}
            token={t}
            column={column}
            thresholds={thresholds}
            buyAmount={buyAmount}
            selected={selected === t.address}
            animate={ready.current}
            compact={compact}
            devTags={devTags(t.creator)}
          />
        ))}
      </ul>
    );
  }

  return (
    <section
      aria-label={meta.title}
      className={clsx('panel flex min-h-0 min-w-0 flex-col overflow-hidden', focused && 'border-accent/50', className)}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') {
          freeze();
          setHovered(true);
        }
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-2.5">
        {hideTitle ? (
          <span className="num truncate text-xs text-muted">{tokens ? `${sorted.length} tokens` : ''}</span>
        ) : (
          <>
            <meta.icon size={14} className="shrink-0 text-accent" aria-hidden />
            <h2 className="truncate text-base font-semibold">{meta.title}</h2>
            {tokens && (
              <span className="num shrink-0 rounded bg-panel-3 px-1 text-2xs leading-4 text-muted" aria-label={`${sorted.length} tokens`}>
                {sorted.length}
              </span>
            )}
          </>
        )}
        {paused && displayed.length > 0 && (
          <span className="chip shrink-0 bg-warn/15 text-warn" role="status">
            <Pause size={10} className="fill-current" aria-hidden />
            Paused{buffered > 0 ? ` · ${buffered} new` : ''}
          </span>
        )}
        <span className="flex-1" />
        <Select
          size="sm"
          variant="ghost"
          value={sort.key}
          onChange={(key) => onSortChange({ key, dir: key === sort.key ? sort.dir : 'desc' })}
          options={sortOptions}
          placement="bottom-end"
          aria-label={`Sort ${meta.title}`}
          className="!px-1.5"
        />
        <IconButton
          size="xs"
          label={sort.dir === 'desc' ? 'Descending (click for ascending)' : 'Ascending (click for descending)'}
          icon={sort.dir === 'desc' ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />}
          onClick={() => onSortChange({ ...sort, dir: sort.dir === 'desc' ? 'asc' : 'desc' })}
        />
        <FilterButton size="xs" count={filterCount} label={`${meta.title} filters`} onClick={() => setFilterOpen(true)} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
      <FilterDrawer
        open={filterOpen}
        onClose={() => {
          setFilterOpen(false);
          // The pointer ends up wherever the sheet was; re-entering the column pauses it again.
          setHovered(false);
        }}
        title={`${meta.title} filters`}
        chain={chain}
        value={filters}
        onApply={onFiltersChange}
        hide={column === 'almost' ? [] : ['progress']}
        window="24h"
      />
    </section>
  );
});

function CardSkeletons() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <li key={i} className="flex gap-2.5 border-b border-line/70 px-2.5 py-2.5">
          <Skeleton circle width={48} height={48} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
            <div className="flex gap-1">
              {Array.from({ length: 5 }, (_, j) => (
                <Skeleton key={j} className="h-4 w-10" />
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
