import type { ReactNode } from 'react';
import clsx from 'clsx';

/** Keyboard key hint, e.g. <Kbd>/</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={clsx('kbd', className)}>{children}</kbd>;
}
