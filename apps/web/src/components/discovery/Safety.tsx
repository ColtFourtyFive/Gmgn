// Safety score (TokenSecurity.safety, formula in docs/API.md): band colours
// and labels, the compact chip of cards and list cells, the score ring of the
// audit panel and the reasons list with each deduction's impact.

import { memo } from 'react';
import { formatPercent, type SafetyBand, type SafetyReason, type SafetyScore, type TokenSummary } from '@trenchscope/shared';
import { ShieldAlert, ShieldCheck, ShieldQuestion, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Tooltip } from '@/components/ui';

export interface SafetyBandMeta {
  label: string;
  /** CSS color token (index.css). */
  token: 'up' | 'warn' | 'down' | 'muted';
  icon: LucideIcon;
  hint: string;
}

export const SAFETY_BAND: Record<SafetyBand, SafetyBandMeta> = {
  safe: { label: 'Safe', token: 'up', icon: ShieldCheck, hint: 'Score 70 or higher: no major contract or holder red flags.' },
  caution: { label: 'Caution', token: 'warn', icon: ShieldQuestion, hint: 'Score 40–69: some risks, check the reasons before buying.' },
  danger: { label: 'Danger', token: 'down', icon: ShieldAlert, hint: 'Score below 40, or a hard red flag (honeypot, active mint or freeze authority).' },
  unknown: { label: 'Unknown', token: 'muted', icon: ShieldQuestion, hint: 'Fewer than half of the checks have data yet, so the score is not reliable.' },
};

/** PRD §8.6.1 coverage wording: sufficient at 80%, low at 50%, insufficient below. */
export function coverageLabel(coverage: number): string {
  return coverage >= 0.8 ? 'Sufficient data' : coverage >= 0.5 ? 'Low data' : 'Insufficient data';
}

/** "−12.5" points (one decimal at most). */
export function impactLabel(impact: number): string {
  return `−${Number(impact.toFixed(1))}`;
}

const color = (band: SafetyBand) => `rgb(var(--${SAFETY_BAND[band].token}))`;

/** Reasons with their point impact, largest first (as the server orders them). */
export function SafetyReasons({ reasons, max, className }: { reasons: SafetyReason[]; max?: number; className?: string }) {
  const shown = max === undefined ? reasons : reasons.slice(0, max);
  if (shown.length === 0) return <p className={clsx('text-xs text-muted', className)}>No deductions.</p>;
  return (
    <ul className={clsx('flex flex-col gap-0.5', className)}>
      {shown.map((r) => (
        <li key={r.key} className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', r.level === 'bad' ? 'bg-down' : 'bg-warn')} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-muted" title={r.label}>
            {r.label}
          </span>
          <span className={clsx('num shrink-0 font-medium', r.level === 'bad' ? 'text-down' : 'text-warn')} role="img" aria-label={`${r.impact} points`}>
            {impactLabel(r.impact)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tooltip body of the chip: score, band, coverage and the top reasons. */
function SafetySummary({ safety: s }: { safety: SafetyScore }) {
  return (
    <span className="flex w-[220px] flex-col gap-1">
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold" style={{ color: color(s.band) }}>
          Safety {s.score}
        </span>
        <span className="text-muted">
          {SAFETY_BAND[s.band].label} · {formatPercent(s.coverage, { sign: false, digits: 0 })} coverage
        </span>
      </span>
      <SafetyReasons reasons={s.reasons} max={3} />
    </span>
  );
}

export interface SafetyChipProps {
  safety: SafetyScore | undefined;
  /** Icon + score only (cards); otherwise the band label follows. */
  compact?: boolean;
  className?: string;
}

/** Shield + 0-100 score coloured by band; hover for coverage and the top reasons. Renders nothing without a score. */
export const SafetyChip = memo(function SafetyChip({ safety, compact, className }: SafetyChipProps) {
  if (!safety) return null;
  const meta = SAFETY_BAND[safety.band];
  const Icon = meta.icon;
  return (
    <Tooltip content={<SafetySummary safety={safety} />}>
      <span
        className={clsx('chip num !px-1', className)}
        style={{ color: color(safety.band), backgroundColor: `rgb(var(--${meta.token}) / 0.14)` }}
        role="img"
        aria-label={`Safety score ${safety.score}, ${meta.label}`}
        tabIndex={0}
      >
        <Icon size={10} strokeWidth={2.5} aria-hidden />
        {safety.score}
        {!compact && <span className="font-normal opacity-80">{meta.label}</span>}
      </span>
    </Tooltip>
  );
});

/** List cell: the safety chip over the composite rug probability. */
export const SafetyCell = memo(function SafetyCell({ token: t }: { token: TokenSummary }) {
  return (
    <span className="flex flex-col items-center gap-0.5 leading-tight">
      <SafetyChip safety={t.security.safety} compact />
      <span className={clsx('num text-2xs', t.security.riskLevel === 'high' ? 'text-down' : 'text-faint')} title="Rug probability">
        rug {formatPercent(t.security.rugRatio, { sign: false, digits: 0 })}
      </span>
    </span>
  );
});

/** Circular gauge: arc = score / 100 in the band colour, score in the middle. */
export function SafetyRing({ safety, size = 56 }: { safety: SafetyScore; size?: number }) {
  const stroke = Math.max(3, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, safety.score)) / 100) * circumference;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safety.score} aria-label="Safety score">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'rgb(var(--panel-3))' }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="transition-[stroke-dasharray] duration-500"
          style={{ stroke: color(safety.band) }}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center font-bold text-fg" style={{ fontSize: Math.round(size * 0.34) }}>
        {safety.score}
      </span>
    </span>
  );
}
