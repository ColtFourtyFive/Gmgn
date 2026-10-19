import { LoaderCircle } from 'lucide-react';
import clsx from 'clsx';

export interface SpinnerProps {
  /** Icon size in px. */
  size?: number;
  className?: string;
  /** Accessible label; pass '' when a parent already announces loading. */
  label?: string;
}

/** Rotating loader icon (inherits text color). */
export function Spinner({ size = 14, className, label = 'Loading' }: SpinnerProps) {
  return (
    <LoaderCircle
      size={size}
      className={clsx('shrink-0 animate-spin', className)}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
