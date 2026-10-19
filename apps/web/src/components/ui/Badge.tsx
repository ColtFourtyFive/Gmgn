import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'neutral' | 'accent' | 'up' | 'down' | 'warn' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-panel-3 text-muted',
  accent: 'bg-accent/15 text-accent',
  up: 'bg-up/15 text-up',
  down: 'bg-down/15 text-down',
  warn: 'bg-warn/15 text-warn',
  info: 'bg-info/15 text-info',
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Custom hex/rgb color (tinted background + colored text); overrides `tone`. */
  color?: string;
  icon?: ReactNode;
  title?: string;
  className?: string;
  children?: ReactNode;
}

/** Small status chip ("Migrated", "CTO", "Boosted"). Built on the .chip class. */
export function Badge({ tone = 'neutral', color, icon, title, className, children }: BadgeProps) {
  const style: CSSProperties | undefined = color
    ? { color: `color-mix(in srgb, ${color} 72%, rgb(var(--fg)))`, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }
    : undefined;
  return (
    <span title={title} className={clsx('chip', !color && TONE[tone], className)} style={style}>
      {icon}
      {children}
    </span>
  );
}
