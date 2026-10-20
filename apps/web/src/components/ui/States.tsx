import type { ReactNode } from 'react';
import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { errorMessage } from '@/lib/format';
import { Button } from './Button';

export interface EmptyStateProps {
  /** Icon element (defaults to an inbox). */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Call to action (Button). */
  action?: ReactNode;
  /** Tighter padding for panels and table bodies. */
  compact?: boolean;
  /** `h1` when the state is the whole page (a not-found page): it is then the page's heading. */
  titleAs?: 'p' | 'h1';
  className?: string;
}

/** Centered "nothing here" message with optional action. */
export function EmptyState({ icon, title, description, action, compact, titleAs: Title = 'p', className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-3 py-6' : 'gap-2 px-4 py-12', className)}>
      <span className={clsx('flex items-center justify-center rounded-full bg-panel-3 text-faint', compact ? 'h-8 w-8' : 'h-10 w-10')}>
        {icon ?? <Inbox size={compact ? 16 : 18} />}
      </span>
      <Title className="text-base font-medium text-fg">{title}</Title>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  /** The thrown error; its message is shown under the title. */
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** Label of the retry button (default "Retry"). */
  retryLabel?: string;
  compact?: boolean;
  /** `h1` when the state is the whole page: it is then the page's heading. */
  titleAs?: 'p' | 'h1';
  className?: string;
}

/** Failed-to-load message with a retry button (pair with react-query's refetch). */
export function ErrorState({ title = 'Couldn’t load data', error, onRetry, retrying, retryLabel = 'Retry', compact, titleAs: Title = 'p', className }: ErrorStateProps) {
  return (
    <div role="alert" className={clsx('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-3 py-6' : 'gap-2 px-4 py-12', className)}>
      <span className={clsx('flex items-center justify-center rounded-full bg-down/10 text-down', compact ? 'h-8 w-8' : 'h-10 w-10')}>
        <CircleAlert size={compact ? 16 : 18} />
      </span>
      <Title className="text-base font-medium text-fg">{title}</Title>
      {error !== undefined && <p className="max-w-sm text-sm text-muted">{errorMessage(error)}</p>}
      {onRetry && (
        <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} loading={retrying} onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
