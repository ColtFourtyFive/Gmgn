import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface PageProps {
  children: ReactNode;
  /**
   * Fill the viewport below the top bar with no page scroll (terminal
   * layouts like Trenches or the token page manage their own scrolling).
   */
  fullHeight?: boolean;
  className?: string;
}

/** Standard page wrapper: consistent gutters, optional full-height terminal mode. */
export function Page({ children, fullHeight, className }: PageProps) {
  return <div className={clsx('mx-auto w-full p-3 md:p-4', fullHeight && 'flex h-full min-h-0 flex-col', className)}>{children}</div>;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Right side: tabs, filters, primary action. Wraps under the title on phones. */
  actions?: ReactNode;
  className?: string;
}

/** Page title row; on phones the actions wrap onto their own line under the title. */
export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={clsx('mb-3 flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1">
        {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">{icon}</span>}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight text-fg">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
