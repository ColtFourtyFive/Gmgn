// Geometry of the floating Instant trade dock (pure, unit-tested): default
// placement, clamping into the free viewport area, moves and corner resizes
// (pointer or arrow keys) and the collapsed header (fold direction, moves).
// Rects are remembered per viewport class.

import { BREAKPOINTS } from '@/hooks/useMediaQuery';

export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Fixed chrome the dock stays clear of (top bar, status bar). */
export interface DockInsets {
  top: number;
  bottom: number;
}

export const DOCK_MIN = { width: 280, height: 240 } as const;
export const DOCK_DEFAULT = { width: 340, height: 460 } as const;
/** Gap kept between the dock and the viewport edges / chrome. */
export const DOCK_GAP = 8;
/** Height of the header strip (all that shows while collapsed). */
export const DOCK_HEADER = 40;
/** Keyboard step in px (Shift multiplies by 4). */
export const DOCK_STEP = 16;

/** Storage bucket of a viewport: its Tailwind breakpoint ("md", "lg", "xl", "2xl"). */
export function viewportKey(width: number): string {
  const entries = Object.entries(BREAKPOINTS) as [string, number][];
  let key = 'sm';
  for (const [name, min] of entries) if (width >= min) key = name;
  return key;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Fit a rect into the area between the insets: size first (down to the
 * minimum, or the whole area when it is smaller), then position.
 */
export function clampDockRect(rect: DockRect, vp: Viewport, insets: DockInsets): DockRect {
  const areaW = vp.width - 2 * DOCK_GAP;
  const areaH = vp.height - insets.top - insets.bottom - 2 * DOCK_GAP;
  const width = Math.round(clamp(rect.width, Math.min(DOCK_MIN.width, areaW), areaW));
  const height = Math.round(clamp(rect.height, Math.min(DOCK_MIN.height, areaH), areaH));
  const x = Math.round(clamp(rect.x, DOCK_GAP, vp.width - width - DOCK_GAP));
  const y = Math.round(clamp(rect.y, insets.top + DOCK_GAP, vp.height - insets.bottom - height - DOCK_GAP));
  return { x, y, width, height };
}

/** Bottom-left, clear of the token page's right-hand trade column. */
export function defaultDockRect(vp: Viewport, insets: DockInsets): DockRect {
  return clampDockRect({ x: DOCK_GAP, y: vp.height - insets.bottom - DOCK_GAP - DOCK_DEFAULT.height, ...DOCK_DEFAULT }, vp, insets);
}

/** Move by a delta, kept inside the free area. */
export function moveDockRect(rect: DockRect, dx: number, dy: number, vp: Viewport, insets: DockInsets): DockRect {
  return clampDockRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, vp, insets);
}

/**
 * Resize from the top-right corner (the handle) by a delta: the bottom-left
 * corner stays put, so dragging up makes the dock taller.
 */
export function resizeDockRect(rect: DockRect, dx: number, dy: number, vp: Viewport, insets: DockInsets): DockRect {
  const bottom = rect.y + rect.height;
  const width = clamp(rect.width + dx, DOCK_MIN.width, vp.width - DOCK_GAP - rect.x);
  const height = clamp(rect.height - dy, DOCK_MIN.height, bottom - insets.top - DOCK_GAP);
  return clampDockRect({ x: rect.x, y: bottom - height, width, height }, vp, insets);
}

/** Delta of an arrow key (null for other keys). */
export function arrowDelta(key: string, shift: boolean): [number, number] | null {
  const step = shift ? DOCK_STEP * 4 : DOCK_STEP;
  switch (key) {
    case 'ArrowLeft':
      return [-step, 0];
    case 'ArrowRight':
      return [step, 0];
    case 'ArrowUp':
      return [0, -step];
    case 'ArrowDown':
      return [0, step];
    default:
      return null;
  }
}

/**
 * Which way a dock collapses to its header: one in the lower half of the
 * viewport keeps its bottom edge (folds down), one in the upper half keeps
 * its top. Decided when it collapses, so dragging the folded header across
 * the middle never makes it jump.
 */
export function foldsDown(rect: DockRect, vp: Viewport): boolean {
  return rect.y + rect.height / 2 > vp.height / 2;
}

/** Top of the header while collapsed. */
export function collapsedTop(rect: DockRect, foldDown: boolean): number {
  return foldDown ? rect.y + rect.height - DOCK_HEADER : rect.y;
}

/**
 * Move a collapsed dock by a delta (0, 0 just fits it): only its header has
 * to stay inside the free area, the folded body may hang outside it (the
 * panel is clamped again when it expands).
 */
export function moveFoldedDock(rect: DockRect, dx: number, dy: number, foldDown: boolean, vp: Viewport, insets: DockInsets): DockRect {
  const offset = collapsedTop(rect, foldDown) - rect.y;
  const x = Math.round(clamp(rect.x + dx, DOCK_GAP, vp.width - rect.width - DOCK_GAP));
  const top = Math.round(clamp(rect.y + offset + dy, insets.top + DOCK_GAP, vp.height - insets.bottom - DOCK_GAP - DOCK_HEADER));
  return { ...rect, x, y: top - offset };
}

/** Saved rects by viewport key; anything malformed is dropped. */
export function parseDockRects(raw: unknown): Record<string, DockRect> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DockRect> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = v as Partial<DockRect> | null;
    if (r && [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n))) out[k] = r as DockRect;
  }
  return out;
}
