import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { IconButton } from './IconButton';
import { useOverlay } from './overlay';

const SIZE = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Action row (right-aligned buttons). */
  footer?: ReactNode;
  size?: keyof typeof SIZE;
  /** Element focused on open (else the first [data-autofocus] or focusable element). */
  initialFocusRef?: RefObject<HTMLElement>;
  closeOnOverlay?: boolean;
  hideClose?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * Dialog with focus trap, focus restore, Escape and overlay-click close.
 * Renders nothing while closed, so content mounts fresh on each open.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  closeOnOverlay = true,
  hideClose,
  className,
  bodyClassName,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlay({ open, onClose, ref, trapFocus: true, lockScroll: true, initialFocusRef });

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-overlay flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[8vh] animate-fade-in sm:p-6 sm:pt-[12vh]"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={clsx('panel relative flex w-full flex-col shadow-float outline-none animate-pop-in', SIZE[size], className)}
      >
        {(title || !hideClose) && (
          <div className="flex items-start gap-3 px-4 pb-2 pt-3.5">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="text-md font-semibold text-fg">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && <IconButton label="Close" size="sm" icon={<X size={16} />} onClick={onClose} className="-mr-1.5 -mt-0.5" />}
          </div>
        )}
        <div className={clsx('min-h-0 px-4 pb-4', !title && hideClose && 'pt-4', bodyClassName)}>{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
