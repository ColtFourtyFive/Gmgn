// Audit panel: safety score headline (ring, band, coverage, top reasons with
// their impact, "Explain" for all of them), rug-ratio gauge and the server's
// check list.

import { memo, useState } from 'react';
import { formatPercent, type RiskLevel, type SafetyScore, type TokenDetail } from '@trenchscope/shared';
import { ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import clsx from 'clsx';
import { SecurityChecksList } from '@/components/common';
import { coverageLabel, SAFETY_BAND, SafetyReasons, SafetyRing } from '@/components/discovery';
import { Badge, Panel, Tooltip } from '@/components/ui';
import { useIsLive } from '@/hooks/useMode';

const LEVEL: Record<RiskLevel, { label: string; tone: 'up' | 'warn' | 'down'; icon: typeof ShieldCheck }> = {
  low: { label: 'Low rug risk', tone: 'up', icon: ShieldCheck },
  medium: { label: 'Medium rug risk', tone: 'warn', icon: ShieldQuestion },
  high: { label: 'High rug risk', tone: 'down', icon: ShieldAlert },
};

/** 0..1 rug probability on a green / yellow / red track (10% and 30% bands). */
export function RugGauge({ value }: { value: number }) {
  const v = Math.min(1, Math.max(0, value || 0));
  const tone = v < 0.1 ? 'up' : v < 0.3 ? 'warn' : 'down';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <Tooltip content="Composite rug probability from holder structure, dev behaviour and contract checks. Below 10% is low, above 30% is high.">
          <span className="cursor-help text-muted underline decoration-dotted decoration-faint underline-offset-2" tabIndex={0}>
            Rug ratio
          </span>
        </Tooltip>
        <span className={clsx('num font-semibold', tone === 'up' ? 'text-up' : tone === 'warn' ? 'text-warn' : 'text-down')}>{formatPercent(v, { sign: false, digits: 1 })}</span>
      </div>
      <div className="relative h-1.5 w-full" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label="Rug ratio">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <span className="h-full bg-up/40" style={{ width: '10%' }} />
          <span className="h-full bg-warn/40" style={{ width: '20%' }} />
          <span className="h-full flex-1 bg-down/40" />
        </div>
        <span
          className={clsx('absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel', tone === 'up' ? 'bg-up' : tone === 'warn' ? 'bg-warn' : 'bg-down')}
          style={{ left: `${Math.max(1, Math.min(99, v * 100))}%` }}
        />
      </div>
    </div>
  );
}

const COLLAPSED = 7;
const TOP_REASONS = 3;

/** Score ring, band and coverage, then the largest deductions; "Explain" lists all of them. */
function SafetyHeadline({ safety }: { safety: SafetyScore }) {
  const [explain, setExplain] = useState(false);
  const band = SAFETY_BAND[safety.band];
  const more = safety.reasons.length > TOP_REASONS;
  return (
    <div className="flex gap-3">
      <SafetyRing safety={safety} size={60} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Tooltip content={band.hint}>
            <span className="cursor-help text-md font-semibold" style={{ color: `rgb(var(--${band.token}))` }} tabIndex={0}>
              {band.label}
            </span>
          </Tooltip>
          <Tooltip content="Share of the applicable checks that have data. Below 50% the band reads Unknown.">
            <span className="num cursor-help text-xs text-muted" tabIndex={0}>
              {coverageLabel(safety.coverage)} · {formatPercent(safety.coverage, { sign: false, digits: 0 })}
            </span>
          </Tooltip>
        </div>
        <SafetyReasons reasons={safety.reasons} max={explain ? undefined : TOP_REASONS} />
        {more && (
          <button type="button" className="inline-flex items-center gap-0.5 self-start text-xs text-muted hover:text-fg" aria-expanded={explain} onClick={() => setExplain((e) => !e)}>
            {explain ? 'Top reasons' : `Explain all ${safety.reasons.length}`}
            <ChevronDown size={12} className={clsx('transition-transform', explain && 'rotate-180')} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export const SecurityPanel = memo(function SecurityPanel({ token, className }: { token: TokenDetail; className?: string }) {
  const s = token.security;
  const meta = LEVEL[s.riskLevel];
  const band = s.safety && SAFETY_BAND[s.safety.band];
  const [expanded, setExpanded] = useState(false);
  const live = useIsLive();
  // Problems first so a collapsed list never hides a red flag.
  const order = { bad: 0, warn: 1, info: 2, good: 3 } as const;
  const sorted = [...s.checks].sort((a, b) => order[a.level] - order[b.level]);
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);
  const issues = s.checks.filter((c) => c.level === 'bad' || c.level === 'warn').length;
  return (
    <Panel
      className={className}
      title="Safety & audit"
      icon={band ? <band.icon size={14} /> : <meta.icon size={14} />}
      subtitle={issues ? `${issues} flag${issues === 1 ? '' : 's'}` : 'No flags'}
      actions={
        <Badge tone={meta.tone} icon={<meta.icon size={10} aria-hidden />}>
          {meta.label}
        </Badge>
      }
      padded={false}
    >
      <div className="flex flex-col gap-2.5 p-3 pb-1">
        {s.safety && <SafetyHeadline safety={s.safety} />}
        {s.isHoneypot && (
          <p className="flex items-center gap-1.5 rounded bg-down/15 px-2 py-1 text-xs font-semibold text-down">
            <ShieldAlert size={13} aria-hidden /> Honeypot — sells are blocked
          </p>
        )}
        <RugGauge value={s.rugRatio} />
      </div>
      <SecurityChecksList checks={shown} className="px-3" />
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
        <p className="text-2xs text-faint">{live ? 'Automated on-chain checks — reference only, not a guarantee.' : 'Simulated audit — reference only.'}</p>
        {sorted.length > COLLAPSED && (
          <button type="button" className="inline-flex items-center gap-0.5 text-xs text-muted hover:text-fg" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Less' : `All ${sorted.length}`}
            <ChevronDown size={12} className={clsx('transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        )}
      </div>
    </Panel>
  );
});
