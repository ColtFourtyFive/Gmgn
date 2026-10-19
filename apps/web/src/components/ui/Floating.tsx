import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useOverlay } from './overlay';

export type FloatingSide = 'top' | 'bottom' | 'left' | 'right';
export type Placement = FloatingSide | `${FloatingSide}-start` | `${FloatingSide}-end`;

const OPPOSITE: Record<FloatingSide, FloatingSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const VIEWPORT_PAD = 8;
// Until the first measurement the layer sits off-screen (not visibility:hidden,
// which would make it unfocusable for effects that run before the reposition).
const OFFSCREEN = -10_000;

export interface FloatingPosition {
  top: number;
  left: number;
  side: FloatingSide;
  /** Space available on the chosen side (content scrolls beyond it). */
  maxHeight: number;
}

/**
 * Viewport-aware placement: flips to the opposite side when the preferred
 * one does not fit (or has less room), then clamps into the viewport.
 */
export function computePosition(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>,
  size: { width: number; height: number },
  placement: Placement,
  offset: number,
  viewport: { width: number; height: number },
): FloatingPosition {
  const [preferred, align = 'center'] = placement.split('-') as [FloatingSide, 'start' | 'end' | undefined];
  const space: Record<FloatingSide, number> = {
    top: anchor.top - offset - VIEWPORT_PAD,
    bottom: viewport.height - anchor.bottom - offset - VIEWPORT_PAD,
    left: anchor.left - offset - VIEWPORT_PAD,
    right: viewport.width - anchor.right - offset - VIEWPORT_PAD,
  };
  const need = (s: FloatingSide) => (s === 'top' || s === 'bottom' ? size.height : size.width);
  let side = preferred;
  if (space[side] < need(side) && space[OPPOSITE[side]] > space[side]) side = OPPOSITE[side];

  let top: number;
  let left: number;
  if (side === 'top' || side === 'bottom') {
    top = side === 'bottom' ? anchor.bottom + offset : anchor.top - offset - Math.min(size.height, space.top);
    left = align === 'start' ? anchor.left : align === 'end' ? anchor.right - size.width : anchor.left + anchor.width / 2 - size.width / 2;
  } else {
    left = side === 'right' ? anchor.right + offset : anchor.left - offset - size.width;
    top = align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - size.height : anchor.top + anchor.height / 2 - size.height / 2;
  }
  const clamp = (v: number, max: number) => Math.min(Math.max(v, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, max));
  left = clamp(left, viewport.width - size.width - VIEWPORT_PAD);
  const maxHeight = side === 'top' || side === 'bottom' ? Math.max(space[side], 120) : viewport.height - 2 * VIEWPORT_PAD;
  if (side === 'left' || side === 'right') top = clamp(top, viewport.height - size.height - VIEWPORT_PAD);
  return { top, left, side, maxHeight };
}

export interface FloatingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  open: boolean;
  /** Element the floating layer is positioned against. */
  anchorRef: RefObject<HTMLElement>;
  placement?: Placement;
  /** Gap between anchor and layer (px). */
  offset?: number;
  /** Close request on Escape / outside pointer down. Omit for passive layers. */
  onClose?: () => void;
  /** At least as wide as the anchor (dropdowns). */
  matchWidth?: boolean;
  /**
   * Move focus into the layer on open, keep Tab inside it and restore focus
   * to the opener on close (interactive popovers and menus).
   */
  trapFocus?: boolean;
  children: ReactNode;
}

/**
 * Low-level positioned layer: portals to <body>, follows the anchor on
 * scroll/resize, auto-flips, and joins the overlay stack (Escape / outside
 * click). Popover, Tooltip, HoverCard, Select and the omnibox build on it.
 */
export function Floating({ open, anchorRef, placement = 'bottom-start', offset = 6, onClose, matchWidth, trapFocus = false, className, style, children, ...rest }: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<(FloatingPosition & { minWidth?: number }) | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const el = ref.current;
    if (!anchor || !el) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(el.offsetWidth, matchWidth ? rect.width : 0);
    const next = computePosition(rect, { width, height: el.scrollHeight }, placement, offset, { width: window.innerWidth, height: window.innerHeight });
    setPos((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.side === next.side && prev.maxHeight === next.maxHeight
        ? prev
        : { ...next, minWidth: matchWidth ? rect.width : undefined },
    );
  }, [anchorRef, matchWidth, placement, offset]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ref.current) ro?.observe(ref.current);
    if (anchorRef.current) ro?.observe(anchorRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update, anchorRef]);

  useOverlay({ open, onClose, ref, anchorRef, closeOnOutside: !!onClose, trapFocus });

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      data-side={pos?.side}
      tabIndex={trapFocus ? -1 : undefined}
      className={clsx('fixed z-floating overflow-y-auto', trapFocus && 'outline-none', className)}
      style={{
        top: pos?.top ?? OFFSCREEN,
        left: pos?.left ?? OFFSCREEN,
        maxHeight: pos?.maxHeight,
        minWidth: pos?.minWidth,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}
