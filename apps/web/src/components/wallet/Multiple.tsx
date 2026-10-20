import { memo } from 'react';
import clsx from 'clsx';
import { Compact } from '@/components/common';
import { multipleTone } from './utils';

/** Market-cap multiple ("2.4x"): green from 2x, red below 1x. */
export const Multiple = memo(function Multiple({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={clsx('num text-faint', className)}>--</span>;
  return <Compact value={value} digits={value >= 100 ? 0 : value >= 10 || value < 1 ? 1 : 2} suffix="x" className={clsx('font-semibold', multipleTone(value), className)} />;
});
