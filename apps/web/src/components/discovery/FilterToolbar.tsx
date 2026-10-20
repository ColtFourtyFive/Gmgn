import { useState } from 'react';
import type { ChainId, TokenFilters } from '@trenchscope/shared';
import { Brain, Filter, Shield, ShieldCheck, X } from 'lucide-react';
import clsx from 'clsx';
import { Button, Tooltip } from '@/components/ui';
import { applyPreset, countFilters, PRESET_META, PRESETS, presetActive, removePreset, type FlagKey, type RangeKey } from './filters';
import { FilterDrawer } from './FilterPanel';

const PRESET_ICON = { safe: Shield, smart: Brain, strict: ShieldCheck } as const;

export interface FilterToolbarProps {
  chain: ChainId;
  filters: TokenFilters;
  onChange: (f: TokenFilters) => void;
  /** Drawer title. */
  title: string;
  window?: string;
  hide?: RangeKey[];
  hideFlags?: FlagKey[];
  /** Hide the preset shortcuts (keep only the Filters button). */
  hidePresets?: boolean;
  className?: string;
}

/** Preset toggles + "Filters (n)" button opening the filter drawer + clear. */
export function FilterToolbar({ chain, filters, onChange, title, window, hide, hideFlags, hidePresets, className }: FilterToolbarProps) {
  const [open, setOpen] = useState(false);
  const n = countFilters(filters);
  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {!hidePresets && (
        <span className="hidden items-center gap-1 sm:flex">
          {PRESETS.map((p) => {
          const Icon = PRESET_ICON[p];
          const active = presetActive(filters, p);
          return (
            <Tooltip key={p} content={PRESET_META[p].hint}>
              <Button
                size="xs"
                variant={active ? 'soft' : 'ghost'}
                aria-pressed={active}
                icon={<Icon size={12} className={active ? 'text-accent' : undefined} />}
                onClick={() => onChange(active ? removePreset(filters, p) : applyPreset(filters, p))}
              >
                {PRESET_META[p].label}
              </Button>
            </Tooltip>
          );
          })}
        </span>
      )}
      <Button size="sm" variant={n ? 'soft' : 'outline'} icon={<Filter size={13} className={n ? 'text-accent' : undefined} />} onClick={() => setOpen(true)} aria-haspopup="dialog">
        Filters
        {n > 0 && <span className="num rounded bg-accent px-1 text-2xs font-semibold leading-4 text-accent-fg">{n}</span>}
      </Button>
      {n > 0 && (
        <Button size="xs" variant="ghost" icon={<X size={12} />} onClick={() => onChange({})}>
          Clear
        </Button>
      )}
      <FilterDrawer open={open} onClose={() => setOpen(false)} title={title} chain={chain} value={filters} onApply={onChange} window={window} hide={hide} hideFlags={hideFlags} />
    </div>
  );
}
