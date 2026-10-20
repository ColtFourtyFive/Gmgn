import { memo, useId, type ReactNode } from 'react';
import { formatPercent } from '@trenchscope/shared';
import clsx from 'clsx';
import { Tooltip } from '@/components/ui/Tooltip';

export interface RiskChipProps {
  /** Short label, e.g. "Top10", "Dev", "Insiders". */
  label: string;
  /** Ratio 0..1 (null = unknown). */
  value: number | null | undefined;
  /** Ratio above which the chip turns red (settings.display.riskThresholds). */
  threshold: number;
  /** Lower is worse instead (red when below threshold). */
  invert?: boolean;
  icon?: ReactNode;
  /** Show only the icon and value (dense rows); the label stays in the accessible name. */
  hideLabel?: boolean;
  /** Tooltip explaining the metric. */
  hint?: string;
  className?: string;
}

/** Risk metric chip: red past the threshold, green otherwise. */
export const RiskChip = memo(function RiskChip({ label, value, threshold, invert, icon, hideLabel, hint, className }: RiskChipProps) {
  const known = value !== null && value !== undefined && Number.isFinite(value);
  const bad = known && (invert ? value < threshold : value > threshold);
  const chip = (
    <span
      className={clsx('chip num', !known ? 'bg-panel-3 text-faint' : bad ? 'bg-down/15 text-down' : 'bg-up/10 text-up', className)}
      aria-label={`${label} ${known ? formatPercent(value, { sign: false, digits: 1 }) : 'unknown'}${bad ? ' (risky)' : ''}`}
    >
      {icon}
      {!hideLabel && <span className="opacity-80">{label}</span>}
      {known ? formatPercent(value, { sign: false, digits: value < 0.1 ? 1 : 0 }) : '--'}
    </span>
  );
  return hint ? <Tooltip content={hint}>{chip}</Tooltip> : chip;
});

export interface CurveProgressProps {
  /** Bonding-curve progress 0..1. */
  progress: number;
  showLabel?: boolean;
  /** Bar thickness. */
  size?: 'sm' | 'md';
  className?: string;
}

/** Horizontal bonding-curve progress bar; completes green. */
export const CurveProgress = memo(function CurveProgress({ progress, showLabel = true, size = 'sm', className }: CurveProgressProps) {
  const p = Math.min(1, Math.max(0, progress || 0));
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        aria-label="Bonding curve progress"
        className={clsx('relative min-w-[40px] flex-1 overflow-hidden rounded-full bg-panel-3', size === 'sm' ? 'h-1' : 'h-1.5')}
      >
        <span className={clsx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', p >= 1 ? 'bg-up' : 'bg-accent')} style={{ width: `${p * 100}%` }} />
      </span>
      {showLabel && <span className={clsx('num shrink-0 text-xs', p >= 1 ? 'text-up' : 'text-muted')}>{formatPercent(p, { sign: false, digits: p >= 0.995 || p < 0.1 ? 1 : 0 })}</span>}
    </span>
  );
});

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** auto = green if last >= first, else red. */
  tone?: 'auto' | 'up' | 'down' | 'accent' | 'muted';
  /** Soft area fill under the line. */
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}

/** Tiny inline SVG trend line. */
export const Sparkline = memo(function Sparkline({ data, width = 80, height = 24, tone = 'auto', fill = true, strokeWidth = 1.25, className }: SparklineProps) {
  const id = useId().replace(/:/g, '');
  if (data.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, pad + (1 - (v - min) / span) * (height - 2 * pad)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const resolved = tone === 'auto' ? (data[data.length - 1] >= data[0] ? 'up' : 'down') : tone;
  const color = `rgb(var(--${resolved}))`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={clsx('shrink-0 overflow-visible', className)} aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={`sf${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: color, stopOpacity: 0.25 }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#sf${id})`} />
        </>
      )}
      <path d={line} fill="none" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
    </svg>
  );
});

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line (change, native value, timestamp). */
  sub?: ReactNode;
  icon?: ReactNode;
  /** Tooltip on the label. */
  hint?: string;
  className?: string;
}

/** Label + big value + sub line, for stat grids (portfolio, wallet, token). */
export function StatTile({ label, value, sub, icon, hint, className }: StatTileProps) {
  return (
    <div className={clsx('flex min-w-0 flex-col gap-0.5 rounded border border-line bg-panel-2 px-3 py-2', className)}>
      <span className="flex items-center gap-1 text-xs text-muted" title={hint}>
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="num truncate text-md font-semibold text-fg">{value}</span>
      {sub && <span className="num truncate text-xs text-muted">{sub}</span>}
    </div>
  );
}
