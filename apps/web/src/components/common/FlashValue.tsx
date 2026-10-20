import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { useDisplaySettings } from '@/hooks/useSettings';

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
 *
 * The tint lives on an overlay whose *opacity* is animated: opacity runs on
 * the compositor, whereas animating background-color forces a style recalc
 * and repaint every frame — with dozens of live numbers flashing per second
 * that kept the main thread busy most of the time.
 */
export function FlashValue({ value, children, className, disabled }: FlashValueProps) {
  const overlay = useRef<HTMLSpanElement>(null);
  const running = useRef<Animation | null>(null);
  const prev = useRef(value);
  const { flashUpdates } = useDisplaySettings();

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    const el = overlay.current;
    if (disabled || !flashUpdates || !el?.animate || reducedMotion() || document.visibilityState === 'hidden') return;
    if (before === null || before === undefined || value === null || value === undefined || before === value) return;
    el.dataset.dir = value > before ? 'up' : 'down'; // tint via CSS: no forced style read per flash
    running.current?.cancel(); // one flash per value at a time
    running.current = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
  }, [value, disabled, flashUpdates]);

  useEffect(() => () => running.current?.cancel(), []);

  return (
    <span className={clsx('relative -mx-0.5 rounded-sm px-0.5', className)}>
      {children ?? value}
      <span ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 rounded-sm opacity-0 data-[dir=down]:bg-down/30 data-[dir=up]:bg-up/30" />
    </span>
  );
}
