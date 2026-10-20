import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** The parts of a mouse or keyboard event that decide where a link opens. */
export interface LinkGesture {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

/** A middle click (DataTable forwards these to onRowClick). */
export const isMiddleClick = (e?: LinkGesture | null): boolean => e?.button === 1;

/** Ctrl/Cmd-click (or Ctrl/Cmd+Enter) or a middle click: open in a new tab, as a link would. */
export const opensNewTab = (e?: LinkGesture | null): boolean => !!e && (isMiddleClick(e) || !!e.metaKey || !!e.ctrlKey);

/**
 * Open an in-app href like a link from a clickable row or card: Ctrl/Cmd-
 * click and middle click open a new tab and keep the user's place, a plain
 * click or Enter navigates here. Every row that navigates uses it, so the
 * gesture behaves the same on every table.
 */
export function useOpenLink(): (href: string, e?: LinkGesture | null) => void {
  const navigate = useNavigate();
  return useCallback(
    (href: string, e?: LinkGesture | null) => {
      if (opensNewTab(e)) window.open(href, '_blank', 'noopener');
      else navigate(href);
    },
    [navigate],
  );
}
