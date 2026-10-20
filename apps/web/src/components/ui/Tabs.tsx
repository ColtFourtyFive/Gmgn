import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Count badge after the label (hidden when null/undefined). */
  count?: number | null;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface BaseProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/**
 * Arrow/Home/End navigation with automatic activation (WAI-ARIA tabs
 * pattern). `tabStop` is the item reachable with Tab: the selected one, or
 * the first enabled item when `value` matches none.
 */
export function useRovingKeys<T extends string>(items: Pick<TabItem<T>, 'value' | 'disabled'>[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = items.findIndex((it) => it.value === value);
  const tabStop = selected >= 0 ? selected : items.findIndex((it) => !it.disabled);
  const onKeyDown = (e: KeyboardEvent) => {
    const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const current = enabled.indexOf(selected);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(current + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(current - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === null) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown, tabStop };
}

function Count({ count, active }: { count?: number | null; active: boolean }) {
  if (count === null || count === undefined) return null;
  return <span className={clsx('num rounded px-1 text-2xs leading-4', active ? 'bg-accent/15 text-accent' : 'bg-panel-3 text-muted')}>{count}</span>;
}

/** Underlined section tabs (page sections, panels). Controlled. */
export function Tabs<T extends string>({ value, onChange, items, size = 'md', className, 'aria-label': ariaLabel }: BaseProps<T>) {
  const { refs, onKeyDown, tabStop } = useRovingKeys(items, value, onChange);
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={clsx('no-scrollbar flex items-stretch gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={it.disabled}
            title={it.title}
            onClick={() => onChange(it.value)}
            className={clsx(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 font-medium transition-colors disabled:opacity-40',
              size === 'sm' ? 'h-8 text-sm' : 'h-9 text-base',
              active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {it.icon}
            {it.label}
            <Count count={it.count} active={active} />
          </button>
        );
      })}
    </div>
  );
}

/** Compact pill switcher for modes and windows (1m/5m/1h, USD/SOL). Controlled. */
export function SegmentedControl<T extends string>({ value, onChange, items, size = 'md', className, 'aria-label': ariaLabel }: BaseProps<T>) {
  const { refs, onKeyDown, tabStop } = useRovingKeys(items, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={clsx('no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded border border-line bg-panel-2 p-0.5', className)}
    >
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={it.disabled}
            title={it.title}
            onClick={() => onChange(it.value)}
            className={clsx(
              'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] font-medium transition-colors disabled:opacity-40',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
              active ? 'bg-panel-3 text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {it.icon}
            {it.label}
            <Count count={it.count} active={active} />
          </button>
        );
      })}
    </div>
  );
}
