import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { launchpadsFor, type ChainId, type Range, type TokenFilters } from '@trenchscope/shared';
import { Brain, Filter, RotateCcw, Shield, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { Button, Checkbox, Drawer, IconButton, Input, RangeInput, SegmentedControl, Tooltip } from '@/components/ui';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useMeta } from '@/hooks/useMeta';
import {
  applyPreset,
  countFilters,
  FLAG_KEYS,
  FLAG_LABELS,
  METRIC_GROUPS,
  PRESET_META,
  PRESETS,
  presetActive,
  removePreset,
  sanitizeFilters,
  type FlagKey,
  type MetricKind,
  type RangeKey,
} from './filters';

const PRESET_ICON = { safe: Shield, smart: Brain, strict: ShieldCheck } as const;

const ADORN: Record<MetricKind, { prefix?: string; suffix?: string; scale: number }> = {
  usd: { prefix: '$', scale: 1 },
  pct: { suffix: '%', scale: 100 },
  count: { scale: 1 },
  minutes: { suffix: 'min', scale: 1 },
};

/** Launchpads of a chain: live list from /meta, static config as fallback. */
export function useChainLaunchpads(chain: ChainId): { id: string; name: string; color: string }[] {
  const meta = useMeta().data;
  return useMemo(() => {
    const live = meta?.launchpads.filter((l) => l.chain === chain);
    return live?.length ? live : launchpadsFor(chain).map(({ id, name, color }) => ({ id, name, color }));
  }, [meta, chain]);
}

function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-line px-3 py-3 last:border-b-0">
      <header className="flex items-center gap-2">
        <h3 className="table-head">{title}</h3>
        {!!count && <span className="num rounded bg-accent/15 px-1 text-2xs font-semibold leading-4 text-accent">{count}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {children}
    </section>
  );
}

export interface FilterPanelProps {
  chain: ChainId;
  value: TokenFilters;
  onChange: (next: TokenFilters) => void;
  /** Metric ranges to leave out (e.g. bonding progress outside the Almost column). */
  hide?: RangeKey[];
  hideFlags?: FlagKey[];
  /** Stats window of windowed metrics (volume, swaps, change), e.g. "24h". */
  window?: string;
}

/**
 * Token list filters: presets, launchpads, metric ranges, audit toggles and
 * keywords. Controlled; edits a draft that the caller applies.
 */
export function FilterPanel({ chain, value, onChange, hide = [], hideFlags = [], window = '24h' }: FilterPanelProps) {
  const launchpads = useChainLaunchpads(chain);
  const set = (patch: Partial<TokenFilters>) => onChange({ ...value, ...patch });
  const setRange = (key: RangeKey, r: Range | undefined) => set({ [key]: r } as Partial<TokenFilters>);

  // Launchpads: no list = all selected.
  const selected = new Set(value.launchpads?.length ? value.launchpads : launchpads.map((l) => l.id));
  const toggleLaunchpad = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    if (next.size === 0) return;
    set({ launchpads: next.size === launchpads.length ? undefined : launchpads.filter((l) => next.has(l.id)).map((l) => l.id) });
  };

  const [excludeText, setExcludeText] = useState(() => value.excludeKeywords?.join(', ') ?? '');
  useEffect(() => {
    const parsed = excludeText.split(/[,\s]+/).filter(Boolean).join(',');
    if (parsed !== (value.excludeKeywords ?? []).join(',')) setExcludeText(value.excludeKeywords?.join(', ') ?? '');
    // Only follow external changes (presets, reset); typing keeps its own text.
  }, [value.excludeKeywords]);

  const clean = sanitizeFilters(value);
  const groupCount = (keys: string[]) => keys.filter((k) => k in clean).length;
  const flags = FLAG_KEYS.filter((k) => k !== 'hideDevSold' && k !== 'onlyDevSold' && !hideFlags.includes(k));
  const devSold = value.onlyDevSold ? 'only' : value.hideDevSold ? 'hide' : 'any';
  const safeLabel = chain === 'sol' ? 'Mint & freeze revoked' : 'Safe contract';

  return (
    <div className="flex flex-col">
      <Section title="Presets">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const Icon = PRESET_ICON[p];
            const active = presetActive(value, p);
            return (
              <Tooltip key={p} content={PRESET_META[p].hint}>
                <Button
                  size="xs"
                  variant={active ? 'primary' : 'outline'}
                  aria-pressed={active}
                  icon={<Icon size={12} />}
                  onClick={() => onChange(active ? removePreset(value, p) : applyPreset(value, p))}
                >
                  {PRESET_META[p].label}
                </Button>
              </Tooltip>
            );
          })}
        </div>
      </Section>

      <Section
        title="Launchpads"
        count={value.launchpads?.length ? value.launchpads.length : undefined}
        action={
          value.launchpads?.length ? (
            <Button size="xs" variant="ghost" onClick={() => set({ launchpads: undefined })}>
              Select all
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {launchpads.map((l) => (
            <Checkbox
              key={l.id}
              checked={selected.has(l.id)}
              disabled={selected.size === 1 && selected.has(l.id)}
              onChange={(on) => toggleLaunchpad(l.id, on)}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
                  {l.name}
                </span>
              }
            />
          ))}
        </div>
      </Section>

      {METRIC_GROUPS.map((g) => {
        const fields = g.fields.filter((f) => !hide.includes(f.key));
        if (fields.length === 0) return null;
        return (
          <Section key={g.id} title={g.label} count={groupCount(fields.map((f) => f.key))}>
            <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
              {fields.map((f) => {
                const a = ADORN[f.kind];
                const label = f.windowed ? `${f.label} ${window}` : f.label;
                return (
                  <FieldRow key={f.key} label={label} hint={f.hint} active={f.key in clean}>
                    <RangeInput value={value[f.key]} onChange={(r) => setRange(f.key, r)} scale={a.scale} prefix={a.prefix} suffix={a.suffix} label={label} />
                  </FieldRow>
                );
              })}
            </div>
          </Section>
        );
      })}

      <Section title="Audit & socials" count={groupCount([...flags, 'hideDevSold', 'onlyDevSold'])}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {flags.map((k) => (
            <Tooltip key={k} content={FLAG_LABELS[k].hint} placement="top-start">
              <Checkbox checked={!!value[k]} onChange={(on) => set({ [k]: on || undefined })} label={k === 'safeOnly' ? safeLabel : FLAG_LABELS[k].label} />
            </Tooltip>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Dev sold everything</span>
          <SegmentedControl
            size="sm"
            aria-label="Dev sold filter"
            value={devSold}
            onChange={(v) => set({ hideDevSold: v === 'hide' || undefined, onlyDevSold: v === 'only' || undefined })}
            items={[
              { value: 'any', label: 'Any' },
              { value: 'hide', label: 'Hide' },
              { value: 'only', label: 'Only' },
            ]}
          />
        </div>
      </Section>

      <Section title="Keywords" count={groupCount(['keyword', 'excludeKeywords'])}>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Name or symbol contains</span>
          <Input size="sm" value={value.keyword ?? ''} onChange={(e) => set({ keyword: e.target.value || undefined })} placeholder="e.g. pepe" maxLength={100} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Exclude words (comma separated)</span>
          <Input
            size="sm"
            value={excludeText}
            onChange={(e) => {
              setExcludeText(e.target.value);
              const words = e.target.value.split(/[,\s]+/).filter(Boolean);
              set({ excludeKeywords: words.length ? words : undefined });
            }}
            placeholder="e.g. scam, test"
          />
        </label>
      </Section>
    </div>
  );
}

function FieldRow({ label, hint, active, children }: { label: string; hint: string; active: boolean; children: ReactNode }) {
  return (
    <>
      <span className={clsx('truncate text-xs', active ? 'font-medium text-fg' : 'text-muted')} title={hint}>
        {label}
      </span>
      {children}
    </>
  );
}

export interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  chain: ChainId;
  /** Applied filters (the draft starts from these on every open). */
  value: TokenFilters;
  onApply: (next: TokenFilters) => void;
  hide?: RangeKey[];
  hideFlags?: FlagKey[];
  window?: string;
}

/** Filter panel in a side sheet (bottom sheet on phones) with Reset / Apply. */
export function FilterDrawer(props: FilterDrawerProps) {
  return props.open ? <FilterDrawerOpen {...props} /> : null;
}

function FilterDrawerOpen({ onClose, title, chain, value, onApply, hide, hideFlags, window }: FilterDrawerProps) {
  const mobile = useIsMobile();
  const [draft, setDraft] = useState<TokenFilters>(value);
  const n = countFilters(draft);
  const apply = () => {
    onApply(sanitizeFilters(draft));
    onClose();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      side={mobile ? 'bottom' : 'right'}
      title={
        <span className="flex items-center gap-2">
          <Filter size={15} className="text-muted" aria-hidden />
          {title}
        </span>
      }
      className={mobile ? undefined : '!w-[min(400px,94vw)]'}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => setDraft({})} disabled={n === 0}>
            Reset
          </Button>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={apply} data-autofocus>
            Apply{n > 0 ? ` (${n})` : ''}
          </Button>
        </div>
      }
    >
      <FilterPanel chain={chain} value={draft} onChange={setDraft} hide={hide} hideFlags={hideFlags} window={window} />
    </Drawer>
  );
}

/** Filter icon button with the active-filter count as badge. */
export function FilterButton({ count, onClick, label = 'Filters', size = 'sm' }: { count: number; onClick: () => void; label?: string; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <IconButton
      label={count ? `${label} (${count} active)` : label}
      size={size}
      icon={<Filter size={size === 'xs' ? 13 : 15} />}
      onClick={onClick}
      active={count > 0}
      className={count > 0 ? '!text-accent' : undefined}
      badge={count > 0 ? count : undefined}
    />
  );
}
