// Trading-style presentation: style title pill, speed subtitle, behaviour
// badges and the copy-trade score (meter + gauge).

import { memo } from 'react';
import type { WalletStyle } from '@trenchscope/shared';
import {
  BadgeCheck,
  Clock,
  Crosshair,
  Layers,
  LogOut,
  PackageOpen,
  Rocket,
  Send,
  Sprout,
  Target,
  Ticket,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Tooltip } from '@/components/ui';
import { scoreTone } from './utils';

type Tier = 'top' | 'good' | 'flat' | 'bad';

/** Style grid cells (frequency x PnL level) → tier + emoji. */
const STYLE_META: Record<string, { tier: Tier; emoji: string }> = {
  'Money Printer': { tier: 'top', emoji: '🖨️' },
  Harvester: { tier: 'top', emoji: '🌾' },
  'Old Hunter': { tier: 'top', emoji: '🦅' },
  'One-Shot': { tier: 'top', emoji: '🗡️' },
  'Full-Auto Grinder': { tier: 'good', emoji: '⚙️' },
  'Active Winner': { tier: 'good', emoji: '⚔️' },
  'Steady Hand': { tier: 'good', emoji: '📈' },
  'Zen Winner': { tier: 'good', emoji: '🧘' },
  'Worn Down': { tier: 'flat', emoji: '🪫' },
  'Spinning Top': { tier: 'flat', emoji: '🌀' },
  Lukewarm: { tier: 'flat', emoji: '☕' },
  Bystander: { tier: 'flat', emoji: '👀' },
  'Gas Burner': { tier: 'bad', emoji: '🔥' },
  'Fee Donor': { tier: 'bad', emoji: '💸' },
  'Retail Loser': { tier: 'bad', emoji: '🐑' },
  'Toe in the Water': { tier: 'bad', emoji: '💧' },
  'Self-Destruct': { tier: 'bad', emoji: '💥' },
  'Bleeding Out': { tier: 'bad', emoji: '🩸' },
  'Deep Underwater': { tier: 'bad', emoji: '🕳️' },
  'Wiped Out': { tier: 'bad', emoji: '⚰️' },
};

const TIER_CLASS: Record<Tier, string> = {
  top: 'border-up/40 bg-up/15 text-up',
  good: 'border-up/25 bg-up/10 text-up',
  flat: 'border-line-strong bg-panel-3 text-fg',
  bad: 'border-down/30 bg-down/10 text-down',
};

/** Behaviour badge keys → icon + tone (warnings amber). */
const BADGE_META: Record<string, { icon: LucideIcon; warn?: boolean }> = {
  low_sample: { icon: TriangleAlert, warn: true },
  official: { icon: BadgeCheck },
  lottery: { icon: Ticket },
  sniper: { icon: Crosshair },
  scales_in: { icon: Layers },
  scales_out: { icon: LogOut },
  concentrated: { icon: Target },
  hoarding: { icon: PackageOpen },
  distributing: { icon: Send },
  fixed_hours: { icon: Clock },
  whale: { icon: Waves },
  launcher: { icon: Rocket, warn: true },
  new_wallet: { icon: Sprout, warn: true },
};

export interface StyleTitleProps {
  style: WalletStyle;
  /** Small pill; title and subtitle on one line (previews). */
  compact?: boolean;
  /** With `compact`: subtitle under the pill (narrow table cells). */
  stacked?: boolean;
  className?: string;
}

/** Style title pill ("🖨️ Money Printer") and speed subtitle; "No read" for thin samples. */
export const StyleTitle = memo(function StyleTitle({ style, compact, stacked, className }: StyleTitleProps) {
  const meta = STYLE_META[style.title];
  const pill = style.title ? (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 font-semibold', compact ? 'h-5 text-xs' : 'h-7 text-sm', TIER_CLASS[meta?.tier ?? 'flat'])}>
      {meta && <span aria-hidden>{meta.emoji}</span>}
      {style.title}
    </span>
  ) : (
    <Tooltip content="Fewer than 5 tokens traded in the last 7 days — not enough to classify the style.">
      <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-line-strong px-2 text-muted', compact ? 'h-5 text-xs' : 'h-7 text-sm')} tabIndex={0}>
        No read yet
      </span>
    </Tooltip>
  );
  return (
    <span className={clsx('flex min-w-0', compact && !stacked ? 'items-center gap-1.5' : 'flex-col items-start', compact ? 'gap-0.5' : 'gap-1', className)}>
      {pill}
      {style.subtitle && <span className={clsx('truncate text-muted', compact ? 'text-2xs' : 'text-xs')}>{style.subtitle}</span>}
    </span>
  );
});

export interface StyleBadgesProps {
  badges: WalletStyle['badges'];
  /** Rows with the trigger fact (cards) instead of chips with tooltips (tables). */
  detailed?: boolean;
  max?: number;
  className?: string;
}

/** Behaviour badges (Sniper, Scales in, Hoarding …) with the fact that triggered each. */
export function StyleBadges({ badges, detailed, max, className }: StyleBadgesProps) {
  if (badges.length === 0) return null;
  const shown = max ? badges.slice(0, max) : badges;
  if (detailed)
    return (
      <ul className={clsx('flex flex-col gap-1', className)}>
        {shown.map((b) => {
          const meta = BADGE_META[b.key];
          const Icon = meta?.icon ?? BadgeCheck;
          return (
            <li key={b.key} className="flex min-w-0 items-center gap-2 text-xs">
              <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded', meta?.warn ? 'bg-warn/15 text-warn' : 'bg-accent/10 text-accent')}>
                <Icon size={12} aria-hidden />
              </span>
              <span className="shrink-0 font-medium text-fg">{b.label}</span>
              <span className="min-w-0 truncate text-muted" title={b.value}>
                {b.value}
              </span>
            </li>
          );
        })}
      </ul>
    );
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map((b) => {
        const meta = BADGE_META[b.key];
        const Icon = meta?.icon ?? BadgeCheck;
        return (
          <Tooltip key={b.key} content={`${b.label}: ${b.value}`}>
            <span className={clsx('chip', meta?.warn ? 'bg-warn/15 text-warn' : 'bg-panel-3 text-muted')} tabIndex={0}>
              <Icon size={11} aria-hidden />
              {b.label}
            </span>
          </Tooltip>
        );
      })}
      {max && badges.length > max && <span className="chip bg-panel-3 text-faint">+{badges.length - max}</span>}
    </span>
  );
}

const TONE_TEXT = { up: 'text-up', warn: 'text-warn', down: 'text-down' } as const;
const TONE_BG = { up: 'bg-up', warn: 'bg-warn', down: 'bg-down' } as const;

/** Copy-trade suitability 0..100 as a slim bar with the number. */
export const CopyScoreMeter = memo(function CopyScoreMeter({ score, label = true, className }: { score: number; label?: boolean; className?: string }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(s);
  return (
    <span className={clsx('flex min-w-0 items-center gap-1.5', className)} title={`Copy-trade score ${s}/100`}>
      {label && <span className="shrink-0 text-xs text-muted">Copy score</span>}
      <span className="relative h-1.5 min-w-[36px] flex-1 overflow-hidden rounded-full bg-panel-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s} aria-label="Copy-trade score">
        <span className={clsx('absolute inset-y-0 left-0 rounded-full', TONE_BG[tone])} style={{ width: `${s}%` }} />
      </span>
      <span className={clsx('num shrink-0 text-xs font-semibold', TONE_TEXT[tone])}>{s}</span>
    </span>
  );
});

/** Semi-circular copy-score gauge for the wallet Analysis card. */
export function CopyScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(s);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const arc = Math.PI * r;
  const verdict = s >= 70 ? 'Good to copy' : s >= 40 ? 'Copy with care' : 'Hard to copy';
  return (
    <div className="flex flex-col items-center" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s} aria-label={`Copy-trade score ${s} of 100: ${verdict}`}>
      <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`} aria-hidden>
        <path d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`} fill="none" strokeWidth={stroke} strokeLinecap="round" style={{ stroke: 'rgb(var(--panel-3))' }} />
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(arc * s) / 100} ${arc}`}
          style={{ stroke: `rgb(var(--${tone}))`, transition: 'stroke-dasharray 500ms ease-out' }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" className="num" style={{ fill: 'rgb(var(--fg))', fontSize: size / 4.6, fontWeight: 700 }}>
          {s}
        </text>
      </svg>
      <span className={clsx('-mt-1 text-xs font-medium', TONE_TEXT[tone])}>{verdict}</span>
    </div>
  );
}
