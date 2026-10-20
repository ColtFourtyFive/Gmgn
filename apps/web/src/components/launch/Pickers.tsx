// Launch form pickers: launchpad cards with their curve numbers, and the
// allow-listed logo glyphs (each one tags the token with a narrative).

import { useRef, type KeyboardEvent } from 'react';
import { formatPercent, type ChainId, type LaunchpadCurve } from '@trenchscope/shared';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { Native, tint, Usd } from '@/components/common';

export interface LaunchpadCardsProps {
  chain: ChainId;
  pads: LaunchpadCurve[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}

/** One card per launchpad of the chain: where a fresh curve starts and where it graduates. */
export function LaunchpadCards({ chain, pads, value, onChange, invalid }: LaunchpadCardsProps) {
  return (
    <div role="radiogroup" aria-label="Launchpad" aria-invalid={invalid || undefined} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {pads.map((lp) => {
        const on = lp.id === value;
        return (
          <button
            key={lp.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(lp.id)}
            className={clsx(
              'flex min-w-0 flex-col gap-1.5 rounded border p-2.5 text-left transition-colors sm:gap-2',
              on ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong hover:bg-panel-2',
            )}
          >
            <span className="flex items-center gap-2">
              <span className="flex h-6 items-center gap-1.5 rounded px-1.5 text-sm font-semibold" style={tint(lp.color, 14)}>
                <span className="h-2 w-2 rounded-full" style={{ background: lp.color }} aria-hidden />
                {lp.name}
              </span>
              {on && <Check size={14} className="ml-auto text-accent" aria-hidden />}
            </span>
            <span className="num text-xs text-muted sm:hidden">
              <Usd value={lp.launchMarketCapUsd} /> → <Usd value={lp.graduationMarketCapUsd} className="font-medium text-fg" /> ·{' '}
              <Native value={lp.graduationNative} chain={chain} digits={1} /> · {formatPercent(lp.feeRate, { sign: false })} fee
            </span>
            <dl className="hidden grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid">
              <dt className="text-muted">Starts at</dt>
              <dd className="text-right">
                <Usd value={lp.launchMarketCapUsd} className="text-fg" />
              </dd>
              <dt className="text-muted">Graduates at</dt>
              <dd className="text-right">
                <Usd value={lp.graduationMarketCapUsd} className="font-medium text-fg" />
              </dd>
              <dt className="text-muted" title="Native the curve holds when it completes">
                Curve fills at
              </dt>
              <dd className="text-right">
                <Native value={lp.graduationNative} chain={chain} digits={1} className="text-fg" />
              </dd>
              <dt className="text-muted">Curve fee</dt>
              <dd className="num text-right text-fg">{formatPercent(lp.feeRate, { sign: false })}</dd>
            </dl>
          </button>
        );
      })}
    </div>
  );
}

export interface GlyphPickerProps {
  glyphs: string[];
  narratives: Record<string, string>;
  value: string;
  onChange: (glyph: string) => void;
  id?: string;
}

/** Logo glyph grid with a roving focus (arrow keys move the selection). */
export function GlyphPicker({ glyphs, narratives, value, onChange, id }: GlyphPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (buttons.length === 0) return;
    // Columns of the auto-fill grid: the buttons sharing the first row.
    const cols = Math.max(1, buttons.filter((b) => b.offsetTop === buttons[0].offsetTop).length);
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (!(e.key in step)) return;
    e.preventDefault();
    const i = Math.min(glyphs.length - 1, Math.max(0, glyphs.indexOf(value) + step[e.key]));
    onChange(glyphs[i]);
    buttons[i]?.focus();
  };
  return (
    <div
      ref={ref}
      id={id}
      role="radiogroup"
      aria-label="Logo glyph"
      onKeyDown={onKeyDown}
      className="grid max-h-[184px] grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1 overflow-y-auto rounded border border-line bg-panel-2 p-1.5"
    >
      {glyphs.map((g) => {
        const on = g === value;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${g} (${narratives[g] ?? 'meme'})`}
            title={narratives[g]}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(g)}
            className={clsx('flex h-9 items-center justify-center rounded text-xl transition-colors', on ? 'bg-accent/15 ring-1 ring-accent' : 'hover:bg-panel-3')}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}
