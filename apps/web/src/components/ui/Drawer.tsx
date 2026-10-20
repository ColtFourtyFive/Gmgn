import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { HeadingScope } from './Heading';
import { IconButton } from './IconButton';
import { useOverlay } from './overlay';

const SIDE = {
  left: 'inset-y-0 left-0 h-full w-[min(320px,86vw)] border-r animate-drawer-left',
  right: 'inset-y-0 right-0 h-full w-[min(380px,92vw)] border-l animate-drawer-right',
  bottom: 'inset-x-0 bottom-0 max-h-[88dvh] w-full rounded-t-lg border-t pb-safe animate-drawer-up',
} as const;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: keyof typeof SIDE;
  title?: ReactNode;
  children: ReactNode;
  /** Sticky action row at the bottom. */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Edge-anchored sheet (mobile nav, filters, trade panel on phones). Same
 * behaviour as Modal: focus trap, Escape, overlay click.
 */
export function Drawer({ open, onClose, side = 'right', title, children, footer, className, bodyClassName }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay({ open, onClose, ref, trapFocus: true, lockScroll: true });

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-overlay bg-black/60 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx('fixed flex flex-col border-line bg-panel shadow-float outline-none', SIDE[side], className)}
      >
        {side === 'bottom' && <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-md font-semibold">
            {title}
          </h2>
          <IconButton label="Close" size="sm" icon={<X size={16} />} onClick={onClose} />
        </div>
        {/* The dialog has its own outline: its h2 title, then h3 sections, wherever it was opened from. */}
        <div className={clsx('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>
          <HeadingScope level={3}>{children}</HeadingScope>
        </div>
        {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
