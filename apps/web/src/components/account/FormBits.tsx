// Small form building blocks shared by the account drawers and settings.

import type { ReactNode } from 'react';
import { formatPercent, type ChainId, type PresetId, PRESET_IDS, PRESET_LABELS } from '@trenchscope/shared';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { Heading, HeadingScope, SegmentedControl } from '@/components/ui';
import { useTradeSettings } from '@/hooks/useSettings';

/** Titled group of a form (drawer forms, the launch form); its heading follows the outline (Heading). */
export function FormSection({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0', className)}>
      <header className="flex flex-col gap-0.5">
        <Heading className="text-sm font-semibold text-fg">{title}</Heading>
        {description && <p className="text-xs text-muted">{description}</p>}
      </header>
      <HeadingScope>{children}</HeadingScope>
    </section>
  );
}

const NOTE_TONE = {
  info: { box: 'border-info/30 bg-info/5', icon: Info, iconClass: 'text-info' },
  warn: { box: 'border-warn/30 bg-warn/5', icon: TriangleAlert, iconClass: 'text-warn' },
  error: { box: 'border-down/30 bg-down/10', icon: CircleAlert, iconClass: 'text-down' },
} as const;

/** Inline callout: info hint, risk warning or form-level error. */
export function Note({ tone = 'info', title, children, className }: { tone?: keyof typeof NOTE_TONE; title?: ReactNode; children: ReactNode; className?: string }) {
  const t = NOTE_TONE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : undefined} data-field-error={tone === 'error' || undefined} className={clsx('flex items-start gap-2 rounded border px-2.5 py-2 text-xs', t.box, className)}>
      <t.icon size={14} className={clsx('mt-px shrink-0', t.iconClass)} aria-hidden />
      <div className="min-w-0 text-muted">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children}
      </div>
    </div>
  );
}


/** Trade-preset slot switcher (Calm / Fast / Snipe); tooltips summarize each preset of the chain's buy presets. */
export function PresetPicker({ chain, value, onChange, side = 'buy', className }: { chain: ChainId; value: PresetId; onChange: (p: PresetId) => void; side?: 'buy' | 'sell'; className?: string }) {
  const trade = useTradeSettings(chain);
  const presets = side === 'buy' ? trade.buyPresets : trade.sellPresets;
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      aria-label="Trade preset"
      className={className}
      items={PRESET_IDS.map((id) => {
        const p = presets[id];
        const slip = p.autoSlippage ? 'auto slippage' : `${formatPercent(p.slippage, { sign: false, digits: 0 })} slippage`;
        return { value: id, label: PRESET_LABELS[id], title: `${PRESET_LABELS[id]}: ${slip}${p.antiMev ? ' · anti-MEV' : ''}` };
      })}
    />
  );
}

/** One label/value line in a summary list (task cards, previews). */
export function DetailRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex min-w-0 items-baseline justify-between gap-3 text-xs', className)}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{children}</dd>
    </div>
  );
}
