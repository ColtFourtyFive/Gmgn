import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';
import { Floating, type Placement } from './Floating';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: Placement;
  /** Hover delay before showing (ms). */
  delay?: number;
  className?: string;
  /** Classes for the inline-flex wrapper around the children. */
  anchorClassName?: string;
  disabled?: boolean;
}

/**
 * Short hint on hover/focus. Passive: never traps focus, and hides on press
 * so it never covers a click target. While shown it claims Escape to hide
 * itself and nothing else (WCAG 1.4.13): the dialog or drawer around it, and
 * its unsaved draft, stay open until the next Escape.
 */
export function Tooltip({ content, children, placement = 'top', delay = 300, className, anchorClassName, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const id = useId();

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    // Capture phase on document: runs before the overlay stack's Escape handler (also on document) and global hotkeys.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearTimeout(timer.current);
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (disabled || content === null || content === undefined || content === '') return <>{children}</>;

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': open ? id : undefined })
    : children;

  return (
    <>
      <span ref={anchorRef} className={clsx('inline-flex', anchorClassName)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide}>
        {child}
      </span>
      {/* Mounted only while open: tables render hundreds of tooltip anchors. */}
      {open && (
        <Floating
          open
          anchorRef={anchorRef}
          placement={placement}
          id={id}
          role="tooltip"
          className={clsx(
            'pointer-events-none max-w-[260px] rounded border border-line-strong bg-panel-3 px-2 py-1 text-xs leading-snug text-fg shadow-float animate-fade-in',
            className,
          )}
        >
          {content}
        </Floating>
      )}
    </>
  );
}
