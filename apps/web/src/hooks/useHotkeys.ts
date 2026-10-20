import { useEffect, useRef } from 'react';

/**
 * Map of key combos to handlers. Combos are `+`-joined, case-insensitive:
 * "/", "b", "shift+s", "mod+k" (mod = Ctrl or Cmd), "alt+1", "escape".
 */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

interface Combo {
  key: string;
  mod: boolean;
  shift: boolean | null;
  alt: boolean;
}

function parse(combo: string): Combo {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  return {
    key: key === 'esc' ? 'escape' : key === 'space' ? ' ' : key,
    mod: parts.includes('mod') || parts.includes('ctrl') || parts.includes('meta'),
    // Unspecified shift is ignored so symbols like "?" match on any layout.
    shift: parts.includes('shift') ? true : null,
    alt: parts.includes('alt'),
  };
}

function matches(c: Combo, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== c.key) return false;
  if ((e.ctrlKey || e.metaKey) !== c.mod) return false;
  if (e.altKey !== c.alt) return false;
  return c.shift === null || e.shiftKey === c.shift;
}

/** Label of the "mod" key on this platform, for shortcut hints ("⌘" on Apple devices, else "Ctrl"). */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

/** True when the event comes from a text field, where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

const CONTROL =
  'a[href],button,summary,[role="button"],[role="link"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[role="treeitem"],[tabindex]:not([tabindex="-1"])';

/** Enter / Space on a focused control activate it: a page shortcut must not take them over. */
function activatesControl(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  return e.target instanceof Element && e.target.closest(CONTROL) !== null;
}

/** A Modal or Drawer is open: page shortcuts must not act behind it. */
function modalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Global keyboard shortcuts. Ignored while typing in inputs (unless
 * `allowInInputs`), while a Modal/Drawer is open, and for Enter / Space on a
 * focused link, button or other control (they activate it); pass
 * `enabled: display.hotkeys` for trading shortcuts so the user's settings
 * toggle applies. Handlers may change every render.
 */
export function useHotkeys(map: HotkeyMap, opts: { enabled?: boolean; allowInInputs?: boolean } = {}): void {
  const { enabled = true, allowInInputs = false } = opts;
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if ((!allowInInputs && isTypingTarget(e.target)) || modalOpen() || activatesControl(e)) return;
      for (const [combo, handler] of Object.entries(mapRef.current)) {
        if (matches(parse(combo), e)) {
          e.preventDefault();
          handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, allowInInputs]);
}
