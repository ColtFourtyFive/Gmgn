import clsx from 'clsx';
import type { CSSProperties } from 'react';

export interface SkeletonProps {
  /** Size via classes, e.g. "h-4 w-24". Defaults to a text line. */
  className?: string;
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  style?: CSSProperties;
}

/** Shimmering placeholder block for loading states. */
export function Skeleton({ className, width, height, circle, style }: SkeletonProps) {
  const hasHeight = height !== undefined || /(^|\s)h-/.test(className ?? '');
  return (
    <span
      aria-hidden
      className={clsx('skeleton block', circle && '!rounded-full', !hasHeight && 'h-3', className)}
      style={{ width, height, ...style }}
    />
  );
}

/** Several skeleton text lines with a shorter last line. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={clsx('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'h-3 w-3/5' : 'h-3 w-full'} />
      ))}
    </span>
  );
}
