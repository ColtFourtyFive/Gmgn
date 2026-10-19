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

/** True when the event comes from a text field, where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** A Modal or Drawer is open: page shortcuts must not act behind it. */
function modalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Global keyboard shortcuts. Ignored while typing in inputs (unless
 * `allowInInputs`) and while a Modal/Drawer is open; pass
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
      if ((!allowInInputs && isTypingTarget(e.target)) || modalOpen()) return;
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
