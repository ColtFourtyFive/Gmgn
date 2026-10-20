import { formatAge } from '@trenchscope/shared';
import clsx from 'clsx';
import { useNow } from '@/hooks/useNow';

export interface AgeProps {
  /** Past timestamp (epoch ms). */
  ts: number | null | undefined;
  /** Appended text, e.g. " ago". */
  suffix?: string;
  className?: string;
}

/**
 * Live relative age ("12s", "5m", "3h"). Every instance shares one 1s
 * ticker (useNow), so hundreds of rows cost a single interval.
 */
export function Age({ ts, suffix = '', className }: AgeProps) {
  const now = useNow();
  // 0 (or less) = unknown: live tokens loaded from chain whose creation time could not be read.
  if (ts === null || ts === undefined || !Number.isFinite(ts) || ts <= 0) return <span className={clsx('num text-faint', className)}>--</span>;
  return (
    <time dateTime={new Date(ts).toISOString()} title={new Date(ts).toLocaleString()} className={clsx('num whitespace-nowrap', className)}>
      {formatAge(ts, now)}
      {suffix}
    </time>
  );
}
