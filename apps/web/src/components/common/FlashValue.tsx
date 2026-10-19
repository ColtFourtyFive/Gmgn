import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { useDisplaySettings } from '@/hooks/useSettings';
import { tokenColor } from './color';

export interface FlashValueProps {
  /** Numeric value to watch; a change flashes green (up) or red (down). */
  value: number | null | undefined;
  /** What to display (defaults to the raw value). */
  children?: ReactNode;
  className?: string;
  /** Force-disable (e.g. while the list is re-sorting). */
  disabled?: boolean;
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Background flash when a live number changes. Honors the user's
 * `display.flashUpdates` setting and prefers-reduced-motion. Uses the Web
 * Animations API, so a flash never re-renders the component.
 */
export function FlashValue({ value, children, className, disabled }: FlashValueProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const { flashUpdates } = useDisplaySettings();

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    const el = ref.current;
    if (disabled || !flashUpdates || !el?.animate || reducedMotion()) return;
    if (before === null || before === undefined || value === null || value === undefined || before === value) return;
    const token = value > before ? 'up' : 'down';
    el.animate([{ backgroundColor: tokenColor(token, 0.3) }, { backgroundColor: tokenColor(token, 0) }], { duration: 900, easing: 'ease-out' });
  }, [value, disabled, flashUpdates]);

  return (
    <span ref={ref} className={clsx('-mx-0.5 rounded-sm px-0.5', className)}>
      {children ?? value}
    </span>
  );
}
