import type { ElementType, ReactNode } from 'react';
import clsx from 'clsx';

export interface PanelProps {
  title?: ReactNode;
  /** Muted text next to/under the title. */
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Right side of the header (tabs, buttons, selects). */
  actions?: ReactNode;
  children?: ReactNode;
  /** Pad the body (default true). Set false for edge-to-edge tables/lists. */
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  as?: ElementType;
}

/** Bordered surface with an optional header row (the card of the design system). */
export function Panel({ title, subtitle, icon, actions, children, padded = true, className, bodyClassName, as: Tag = 'section' }: PanelProps) {
  const hasHeader = title || actions;
  return (
    <Tag className={clsx('panel flex min-w-0 flex-col', className)}>
      {hasHeader && <PanelHeader title={title} subtitle={subtitle} icon={icon} actions={actions} />}
      <div className={clsx('min-h-0 flex-1', padded && 'p-3', bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Header row of a Panel; usable standalone above custom bodies. */
export function PanelHeader({ title, subtitle, icon, actions, className }: Pick<PanelProps, 'title' | 'subtitle' | 'icon' | 'actions' | 'className'>) {
  return (
    <header className={clsx('flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5', className)}>
      <div className="flex min-w-[min(100%,9rem)] flex-1 items-center gap-2">
        {icon && <span className="flex shrink-0 text-muted">{icon}</span>}
        <h3 className="truncate text-base font-semibold text-fg">{title}</h3>
        {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}
