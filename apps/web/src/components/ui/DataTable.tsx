import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref, type UIEvent } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from './Skeleton';
import { EmptyState } from './States';

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface Column<T> {
  /** Unique column id; also the sort key reported in SortState. */
  key: string;
  header: ReactNode;
  /** Column width (px number or CSS length). */
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  /** Value used for client-side sorting (ignored with `manualSort`). Nulls sort last. */
  sortValue?: (row: T) => number | string | null | undefined;
  render: (row: T, index: number) => ReactNode;
  /** Extra classes for body cells. */
  className?: string;
  /** Header hint (native tooltip). */
  title?: string;
  /** Pin to the left edge while scrolling horizontally (use on the first column). */
  sticky?: boolean;
  /** Hide the column below a breakpoint. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface DataTableProps<T> {
  /** Keep this array referentially stable (useMemo) so rows stay memoized. */
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Controlled sort; pair with onSortChange. */
  sort?: SortState | null;
  /** Initial sort when uncontrolled. */
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** Rows arrive already sorted (server-side); only the header state changes. */
  manualSort?: boolean;
  onRowClick?: (row: T, e: MouseEvent | KeyboardEvent) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Shows skeleton rows while there is no data yet. */
  loading?: boolean;
  skeletonRows?: number;
  /** Replaces the default empty state. */
  empty?: ReactNode;
  compact?: boolean;
  /** Scroll container height; the header stays sticky inside it. */
  maxHeight?: number | string;
  /** Minimum table width; narrower viewports scroll horizontally inside the table. */
  minWidth?: number | string;
  /** Scroll events of the table's own scroll container (infinite loading, "jump to top" buttons). */
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  /** Ref to the scroll container (scrollTo, scroll position restore). */
  scrollRef?: Ref<HTMLDivElement>;
  className?: string;
  'aria-label'?: string;
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;
// border-separate keeps sticky header borders attached, so row lines live on the cells.
const BODY_CELL = 'border-b border-line/60 group-last:border-b-0';
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' } as const;

function cellClass<T>(col: Column<T>, compact: boolean): string {
  return clsx(
    'px-2 first:pl-3 last:pr-3 align-middle',
    compact ? 'py-1' : 'py-1.5',
    ALIGN[col.align ?? 'left'],
    col.hideBelow && HIDE[col.hideBelow],
    col.sticky && 'sticky left-0 z-[1] bg-panel group-hover:bg-panel-2',
  );
}

/** Next sort when clicking a header: new column starts descending, same column flips. */
export function nextSort(current: SortState | null | undefined, key: string): SortState {
  if (current?.key !== key) return { key, dir: 'desc' };
  return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' };
}

/** Stable sort by a column's sortValue; null/undefined values always last. */
export function sortRows<T>(rows: T[], get: (row: T) => number | string | null | undefined, dir: SortDir): T[] {
  const factor = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined || (typeof a.v === 'number' && Number.isNaN(a.v));
      const bn = b.v === null || b.v === undefined || (typeof b.v === 'number' && Number.isNaN(b.v));
      if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return c * factor || a.i - b.i;
    })
    .map((x) => x.row);
}

interface RowProps<T> {
  row: T;
  index: number;
  columns: Column<T>[];
  compact: boolean;
  className?: string;
  onActivate?: (row: T, e: MouseEvent | KeyboardEvent) => void;
}

// Clicks on interactive descendants (links, buttons, inputs) never trigger the row action.
const INTERACTIVE = 'a,button,input,select,textarea,label,[role="button"],[data-row-ignore]';

function RowImpl<T>({ row, index, columns, compact, className, onActivate }: RowProps<T>) {
  const activate = (e: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>) => {
    const hit = (e.target as HTMLElement).closest(INTERACTIVE);
    if (hit && hit !== e.currentTarget && e.currentTarget.contains(hit)) return;
    onActivate?.(row, e);
  };
  return (
    <tr
      className={clsx('group transition-colors hover:bg-panel-2', onActivate && 'cursor-pointer', className)}
      onClick={onActivate ? activate : undefined}
      onKeyDown={onActivate ? (e) => e.key === 'Enter' && e.target === e.currentTarget && activate(e) : undefined}
      tabIndex={onActivate ? 0 : undefined}
    >
      {columns.map((col) => (
        <td key={col.key} className={clsx(cellClass(col, compact), BODY_CELL, col.className)}>
          {col.render(row, index)}
        </td>
      ))}
    </tr>
  );
}

const Row = memo(RowImpl) as typeof RowImpl;

/**
 * Generic data table: sticky header, controlled or uncontrolled sorting
 * (client-side via sortValue, or server-side with manualSort), clickable
 * rows (Enter activates), skeleton loading, empty state, compact mode and
 * horizontal scrolling inside its own container. Rows are memoized; keep
 * `columns` stable and pass row objects that change identity only when
 * their data changes.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  manualSort,
  onRowClick,
  rowClassName,
  loading,
  skeletonRows = 8,
  empty,
  compact = false,
  maxHeight,
  minWidth,
  onScroll,
  scrollRef,
  className,
  'aria-label': ariaLabel,
}: DataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort);
  const sort = sortProp !== undefined ? sortProp : innerSort;

  const clickRef = useRef(onRowClick);
  clickRef.current = onRowClick;
  const activate = useCallback((row: T, e: MouseEvent | KeyboardEvent) => clickRef.current?.(row, e), []);

  const sorted = useMemo(() => {
    if (manualSort || !sort) return rows;
    const get = columns.find((c) => c.key === sort.key)?.sortValue;
    return get ? sortRows(rows, get, sort.dir) : rows;
  }, [rows, sort, columns, manualSort]);

  const onHeaderClick = (key: string) => {
    const next = nextSort(sort, key);
    if (sortProp === undefined) setInnerSort(next);
    onSortChange?.(next);
  };

  const style: CSSProperties = { maxHeight };
  const showSkeleton = loading && rows.length === 0;

  return (
    <div ref={scrollRef} onScroll={onScroll} className={clsx('relative w-full overflow-auto', className)} style={style}>
      <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth }} aria-label={ariaLabel} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  title={col.title}
                  style={{ width: col.width }}
                  className={clsx(
                    cellClass(col, compact),
                    'table-head sticky top-0 z-sticky h-8 whitespace-nowrap border-b border-line bg-panel',
                    col.sticky && '!z-[11]',
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onHeaderClick(col.key)}
                      className={clsx('inline-flex w-full items-center gap-0.5 uppercase hover:text-fg', JUSTIFY[col.align ?? 'left'], active && 'text-fg')}
                    >
                      {col.header}
                      {active ? (
                        sort.dir === 'asc' ? (
                          <ChevronUp size={12} className="text-accent" />
                        ) : (
                          <ChevronDown size={12} className="text-accent" />
                        )
                      ) : (
                        <ArrowUpDown size={10} className="opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {showSkeleton
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`sk${i}`} className="group">
                  {columns.map((col) => (
                    <td key={col.key} className={clsx(cellClass(col, compact), BODY_CELL)}>
                      <Skeleton className={clsx('h-3', col.align === 'right' && 'ml-auto', i % 2 ? 'w-3/5' : 'w-4/5')} />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((row, i) => (
                <Row key={rowKey(row)} row={row} index={i} columns={columns} compact={compact} className={rowClassName?.(row)} onActivate={onRowClick ? activate : undefined} />
              ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length}>{empty ?? <EmptyState compact title="No results" description="Nothing matches right now." />}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
