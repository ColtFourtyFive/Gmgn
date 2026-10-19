// Shared overlay behaviour for Modal, Drawer and floating elements:
// an overlay stack (Escape closes only the topmost overlay), outside-click
// dismissal, focus trapping with focus restore, and body scroll locking.

import { useEffect, useRef, type RefObject } from 'react';

const stack: symbol[] = [];
let scrollLocks = 0;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export interface OverlayOptions {
  open: boolean;
  /** Called on Escape (topmost overlay only) and on outside pointer down. */
  onClose?: () => void;
  /** The overlay's root element. */
  ref: RefObject<HTMLElement>;
  /** Elements that count as "inside" for outside-click (e.g. the trigger). */
  anchorRef?: RefObject<HTMLElement>;
  /** Close when pressing outside `ref`/`anchorRef`. */
  closeOnOutside?: boolean;
  /** Trap Tab focus inside and restore focus to the opener on close. */
  trapFocus?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  lockScroll?: boolean;
}

/** Wire Escape / outside click / focus trap / scroll lock for an open overlay. */
export function useOverlay({ open, onClose, ref, anchorRef, closeOnOutside = false, trapFocus = false, initialFocusRef, lockScroll = false }: OverlayOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Passive layers (no close handler, no trap) stay out of the stack so they never swallow Escape.
    if (!open || (!onCloseRef.current && !trapFocus)) return;
    const id = Symbol('overlay');
    stack.push(id);
    const isTop = () => stack[stack.length - 1] === id;

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      const root = ref.current;
      if (!trapFocus || e.key !== 'Tab' || !root) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!closeOnOutside || !isTop()) return;
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      onCloseRef.current?.();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);

    const opener = trapFocus ? (document.activeElement as HTMLElement | null) : null;
    // Respect focus a child already took (e.g. autoFocus); otherwise focus the preferred element.
    if (trapFocus && !ref.current?.contains(document.activeElement)) {
      const root = ref.current;
      const target = initialFocusRef?.current ?? root?.querySelector<HTMLElement>('[data-autofocus]') ?? (root ? focusables(root)[0] : null) ?? root;
      target?.focus({ preventScroll: true });
    }

    if (lockScroll && scrollLocks++ === 0) document.body.style.overflow = 'hidden';

    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      if (lockScroll && --scrollLocks === 0) document.body.style.overflow = '';
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // Options are read once per open; refs are stable.
  }, [open, closeOnOutside, trapFocus, lockScroll, ref, anchorRef, initialFocusRef]);
}
