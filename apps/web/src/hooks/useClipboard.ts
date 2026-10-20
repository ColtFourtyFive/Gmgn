import { useCallback, useEffect, useRef, useState } from 'react';

/** Copy text to the clipboard (async API with a textarea fallback). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Legacy path (plain-HTTP LAN access is not a secure context): selecting a
  // hidden textarea moves focus to it, so give focus back to whatever had it
  // (the copy button) once it is removed, or keyboard users land on <body>.
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '-9999px';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  } finally {
    if (previous && previous !== document.activeElement && previous.isConnected) previous.focus({ preventScroll: true });
  }
}

/** `copy(text)` plus a `copied` flag that resets after `resetMs`. */
export function useClipboard(resetMs = 1200): { copied: boolean; copy: (text: string) => Promise<boolean> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (ok) {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  return { copied, copy };
}
