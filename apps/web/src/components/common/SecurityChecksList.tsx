import type { SecurityCheck } from '@trenchscope/shared';
import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Tooltip } from '@/components/ui/Tooltip';

const LEVEL: Record<SecurityCheck['level'], { icon: LucideIcon; className: string; label: string }> = {
  good: { icon: CircleCheck, className: 'text-up', label: 'Pass' },
  warn: { icon: TriangleAlert, className: 'text-warn', label: 'Warning' },
  bad: { icon: CircleX, className: 'text-down', label: 'Risk' },
  info: { icon: Info, className: 'text-info', label: 'Info' },
};

export interface SecurityChecksListProps {
  checks: SecurityCheck[];
  /** Two columns on wide containers. */
  columns?: 1 | 2;
  className?: string;
}

/** Audit checklist (TokenSecurity.checks): level icon, label (hint tooltip), value. */
export function SecurityChecksList({ checks, columns = 1, className }: SecurityChecksListProps) {
  return (
    <ul className={clsx('grid gap-x-4', columns === 2 && 'sm:grid-cols-2', className)}>
      {checks.map((c) => {
        const meta = LEVEL[c.level];
        const Icon = meta.icon;
        const label = <span className={clsx('truncate text-muted', c.hint && 'cursor-help underline decoration-dotted decoration-faint underline-offset-2')}>{c.label}</span>;
        return (
          <li key={c.key} className="flex h-7 min-w-0 items-center gap-2 border-b border-line/60 text-sm last:border-b-0">
            <Icon size={14} className={clsx('shrink-0', meta.className)} aria-label={meta.label} />
            {c.hint ? (
              <Tooltip content={c.hint} anchorClassName="min-w-0">
                {label}
              </Tooltip>
            ) : (
              label
            )}
            <span className={clsx('num ml-auto shrink-0 font-medium', c.level === 'bad' ? 'text-down' : c.level === 'warn' ? 'text-warn' : 'text-fg')}>{c.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
