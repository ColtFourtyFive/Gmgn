import clsx from 'clsx';
import { Tooltip } from '@/components/ui';

export interface LiveStatusProps {
  /** Streaming over the WebSocket. */
  live: boolean;
  /** The REST fallback is failing too. */
  error: boolean;
  /** Waiting for the snapshot of new params. */
  stale?: boolean;
  /** Push cadence for the tooltip, e.g. "1s". */
  cadence?: string;
  className?: string;
}

/** "Live / Polling / Offline" pill for a streamed list. */
export function LiveStatus({ live, error, stale, cadence = '1s', className }: LiveStatusProps) {
  const [label, dot, hint] = live
    ? ['Live', 'bg-up', `Streaming in realtime (updates every ${cadence})`]
    : error
      ? ['Offline', 'bg-down', 'Realtime feed and REST API unreachable — retrying automatically']
      : stale
        ? ['Updating', 'bg-warn animate-pulse2', 'Loading results for the new settings…']
        : ['Polling', 'bg-warn animate-pulse2', 'Realtime feed unavailable — polling every few seconds'];
  return (
    <Tooltip content={hint}>
      <span className={clsx('chip h-7 border border-line bg-panel px-2 text-xs text-muted', className)} role="status" tabIndex={0}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
        {label}
      </span>
    </Tooltip>
  );
}
