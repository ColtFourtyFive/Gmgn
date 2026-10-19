// Exit-strategy editor ("Auto sell" / condition orders): take-profit and
// stop-loss ladders, a trailing stop, and dev-sell / migration exits.
// Shared by the token trade panel, copy-trade tasks and sniper tasks.

import { Plus, Trash2 } from 'lucide-react';
import type { StrategySpec } from '@trenchscope/shared';
import { Button, IconButton, NumberInput, Toggle } from '@/components/ui';

/** Max child orders a strategy may create (server enforces the same cap). */
export const MAX_STRATEGY_ORDERS = 10;

export const EMPTY_STRATEGY: StrategySpec = {
  takeProfits: [],
  stopLosses: [],
  trailing: null,
  devSellPercent: 0,
  migrationSellPercent: 0,
};

/** A sensible starting ladder: half out at 2x, rest at 4x, stop at -50%. */
export const DEFAULT_STRATEGY: StrategySpec = {
  takeProfits: [
    { changePct: 100, sellPercent: 50 },
    { changePct: 300, sellPercent: 100 },
  ],
  stopLosses: [{ lossPct: 50, sellPercent: 100 }],
  trailing: null,
  devSellPercent: 0,
  migrationSellPercent: 0,
};

/** Number of orders a strategy will create. */
export function strategyOrderCount(s: StrategySpec): number {
  return s.takeProfits.length + s.stopLosses.length + (s.trailing ? 1 : 0) + (s.devSellPercent > 0 ? 1 : 0) + (s.migrationSellPercent > 0 ? 1 : 0);
}

/** True when the strategy would create no orders (send `undefined` instead). */
export function isStrategyEmpty(s: StrategySpec | null | undefined): boolean {
  return !s || strategyOrderCount(s) === 0;
}

/** One-line summary, e.g. "TP +100%·50%, +300%·100% · SL -50% · Trail 15%". */
export function describeStrategy(s: StrategySpec | null | undefined): string {
  if (!s || isStrategyEmpty(s)) return 'No exit rules';
  const parts: string[] = [];
  if (s.takeProfits.length) parts.push(`TP ${s.takeProfits.map((t) => `+${t.changePct}%·${t.sellPercent}%`).join(', ')}`);
  if (s.stopLosses.length) parts.push(`SL ${s.stopLosses.map((l) => `-${l.lossPct}%·${l.sellPercent}%`).join(', ')}`);
  if (s.trailing) parts.push(`Trail ${s.trailing.drawdownPct}%${s.trailing.activateAtChangePct > 0 ? ` after +${s.trailing.activateAtChangePct}%` : ''}`);
  if (s.devSellPercent > 0) parts.push(`Dev sell ${s.devSellPercent}%`);
  if (s.migrationSellPercent > 0) parts.push(`Migration ${s.migrationSellPercent}%`);
  return parts.join(' · ');
}

export interface StrategyEditorProps {
  value: StrategySpec;
  onChange: (next: StrategySpec) => void;
  /** Hide the migration exit (e.g. token already migrated). */
  hideMigration?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Controlled editor for a StrategySpec. Percent values are plain percents
 * (100 = +100%). Rows are capped so the total stays within MAX_STRATEGY_ORDERS.
 */
export function StrategyEditor({ value, onChange, hideMigration, compact, className }: StrategyEditorProps) {
  const count = strategyOrderCount(value);
  const full = count >= MAX_STRATEGY_ORDERS;
  const set = (patch: Partial<StrategySpec>) => onChange({ ...value, ...patch });
  const size = compact ? 'sm' : 'md';

  const updateTp = (i: number, patch: Partial<StrategySpec['takeProfits'][number]>) =>
    set({ takeProfits: value.takeProfits.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const updateSl = (i: number, patch: Partial<StrategySpec['stopLosses'][number]>) =>
    set({ stopLosses: value.stopLosses.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div className={['flex flex-col gap-3 text-sm', className].filter(Boolean).join(' ')}>
      <Section
        title="Take profit"
        hint="Sell part of the position when price rises from your entry."
        action={
          <Button size="xs" variant="ghost" icon={<Plus size={12} />} disabled={full} onClick={() => set({ takeProfits: [...value.takeProfits, { changePct: nextStep(value.takeProfits.map((t) => t.changePct), 100), sellPercent: 50 }] })}>
            Add
          </Button>
        }
      >
        {value.takeProfits.map((tp, i) => (
          <RuleRow key={i} onRemove={() => set({ takeProfits: value.takeProfits.filter((_, j) => j !== i) })} removeLabel="Remove take profit">
            <NumberInput size={size} value={tp.changePct} min={1} max={100000} step={10} prefix="+" suffix="%" aria-label="Take profit at gain" onChange={(v) => updateTp(i, { changePct: v ?? 0 })} />
            <span className="shrink-0 text-faint">sell</span>
            <NumberInput size={size} value={tp.sellPercent} min={1} max={100} step={5} suffix="%" aria-label="Sell percent" onChange={(v) => updateTp(i, { sellPercent: v ?? 0 })} />
          </RuleRow>
        ))}
      </Section>

      <Section
        title="Stop loss"
        hint="Sell when price falls this far below your entry."
        action={
          <Button size="xs" variant="ghost" icon={<Plus size={12} />} disabled={full} onClick={() => set({ stopLosses: [...value.stopLosses, { lossPct: nextStep(value.stopLosses.map((l) => l.lossPct), 30, 90), sellPercent: 100 }] })}>
            Add
          </Button>
        }
      >
        {value.stopLosses.map((sl, i) => (
          <RuleRow key={i} onRemove={() => set({ stopLosses: value.stopLosses.filter((_, j) => j !== i) })} removeLabel="Remove stop loss">
            <NumberInput size={size} value={sl.lossPct} min={1} max={99} step={5} prefix="-" suffix="%" aria-label="Stop loss at drop" onChange={(v) => updateSl(i, { lossPct: v ?? 0 })} />
            <span className="shrink-0 text-faint">sell</span>
            <NumberInput size={size} value={sl.sellPercent} min={1} max={100} step={5} suffix="%" aria-label="Sell percent" onChange={(v) => updateSl(i, { sellPercent: v ?? 0 })} />
          </RuleRow>
        ))}
      </Section>

      <Section
        title="Trailing stop"
        hint="Follows the peak; sells when price drops the given % from it. Set an activation gain for a trailing take-profit."
        action={
          <Toggle
            size="sm"
            aria-label="Enable trailing stop"
            checked={!!value.trailing}
            disabled={!value.trailing && full}
            onChange={(on) => set({ trailing: on ? { drawdownPct: 15, sellPercent: 100, activateAtChangePct: 0 } : null })}
          />
        }
      >
        {value.trailing && (
          <div className="grid grid-cols-3 gap-2">
            <Labeled label="Drawdown">
              <NumberInput size={size} value={value.trailing.drawdownPct} min={1} max={90} step={1} suffix="%" aria-label="Trailing drawdown" onChange={(v) => set({ trailing: { ...value.trailing!, drawdownPct: v ?? 0 } })} />
            </Labeled>
            <Labeled label="Sell">
              <NumberInput size={size} value={value.trailing.sellPercent} min={1} max={100} step={5} suffix="%" aria-label="Trailing sell percent" onChange={(v) => set({ trailing: { ...value.trailing!, sellPercent: v ?? 0 } })} />
            </Labeled>
            <Labeled label="Activate at">
              <NumberInput size={size} value={value.trailing.activateAtChangePct} min={0} max={100000} step={10} prefix="+" suffix="%" aria-label="Trailing activation gain" onChange={(v) => set({ trailing: { ...value.trailing!, activateAtChangePct: v ?? 0 } })} />
            </Labeled>
          </div>
        )}
      </Section>

      <div className={hideMigration ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
        <Labeled label="Sell when dev sells" hint="0 = off">
          <NumberInput size={size} value={value.devSellPercent} min={0} max={100} step={25} suffix="%" aria-label="Sell percent when dev sells" onChange={(v) => set({ devSellPercent: v ?? 0 })} />
        </Labeled>
        {!hideMigration && (
          <Labeled label="Sell on migration" hint="0 = off">
            <NumberInput size={size} value={value.migrationSellPercent} min={0} max={100} step={25} suffix="%" aria-label="Sell percent on migration" onChange={(v) => set({ migrationSellPercent: v ?? 0 })} />
          </Labeled>
        )}
      </div>

      <p className={full ? 'text-xs text-warn' : 'text-xs text-faint'}>
        {count}/{MAX_STRATEGY_ORDERS} exit orders · {describeStrategy(value)}
      </p>
    </div>
  );
}

function nextStep(existing: number[], base: number, max = Infinity): number {
  if (!existing.length) return base;
  return Math.min(max, Math.max(...existing) * 2);
}

function Section({ title, hint, action, children }: { title: string; hint: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg" title={hint}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function RuleRow({ children, onRemove, removeLabel }: { children: React.ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {children}
      <IconButton size="sm" label={removeLabel} icon={<Trash2 size={13} />} onClick={onRemove} />
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-2xs text-muted" title={hint}>
        {label}
        {hint && <span className="ml-1 text-faint">({hint})</span>}
      </span>
      {children}
    </label>
  );
}
