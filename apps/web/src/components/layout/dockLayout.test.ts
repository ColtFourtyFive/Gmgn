import { describe, expect, it } from 'vitest';
import {
  arrowDelta,
  clampDockRect,
  collapsedTop,
  defaultDockRect,
  DOCK_DEFAULT,
  DOCK_GAP,
  DOCK_HEADER,
  DOCK_MIN,
  moveDockRect,
  parseDockRects,
  resizeDockRect,
  viewportKey,
} from './dockLayout';

const vp = { width: 1440, height: 900 };
const insets = { top: 48, bottom: 28 };

describe('dock geometry', () => {
  it('defaults to the bottom-left corner above the status bar', () => {
    const r = defaultDockRect(vp, insets);
    expect(r).toEqual({ x: DOCK_GAP, y: 900 - 28 - DOCK_GAP - DOCK_DEFAULT.height, ...DOCK_DEFAULT });
  });

  it('clamps a rect back into the free area after the window shrinks', () => {
    const saved = { x: 1200, y: 600, width: 340, height: 460 };
    const r = clampDockRect(saved, { width: 1024, height: 700 }, insets);
    expect(r.x + r.width).toBe(1024 - DOCK_GAP);
    expect(r.y + r.height).toBe(700 - 28 - DOCK_GAP);
    expect(r.width).toBe(340);
  });

  it('never goes above the top bar or off the left edge', () => {
    expect(clampDockRect({ x: -50, y: 0, width: 300, height: 300 }, vp, insets)).toMatchObject({ x: DOCK_GAP, y: 48 + DOCK_GAP });
  });

  it('shrinks to fit a viewport smaller than the rect, but not below the minimum', () => {
    const tiny = { width: 800, height: 400 };
    const r = clampDockRect({ x: 0, y: 0, width: 2000, height: 2000 }, tiny, insets);
    expect(r.width).toBe(800 - 2 * DOCK_GAP);
    expect(r.height).toBe(400 - 48 - 28 - 2 * DOCK_GAP);
    expect(clampDockRect({ x: 0, y: 100, width: 10, height: 10 }, vp, insets)).toMatchObject({ width: DOCK_MIN.width, height: DOCK_MIN.height });
  });

  it('moves by a delta and stops at the edges', () => {
    const r = defaultDockRect(vp, insets);
    expect(moveDockRect(r, 100, -50, vp, insets)).toMatchObject({ x: r.x + 100, y: r.y - 50 });
    expect(moveDockRect(r, 5000, 5000, vp, insets)).toMatchObject({ x: 1440 - r.width - DOCK_GAP, y: r.y });
  });

  it('resizes from the top-right corner, keeping the bottom-left corner', () => {
    const r = defaultDockRect(vp, insets);
    const bigger = resizeDockRect(r, 60, -100, vp, insets);
    expect(bigger).toEqual({ x: r.x, y: r.y - 100, width: r.width + 60, height: r.height + 100 });
    const smallest = resizeDockRect(r, -1000, 1000, vp, insets);
    expect(smallest).toMatchObject({ width: DOCK_MIN.width, height: DOCK_MIN.height, x: r.x });
    expect(smallest.y + smallest.height).toBe(r.y + r.height);
    const tallest = resizeDockRect(r, 0, -5000, vp, insets);
    expect(tallest.y).toBe(48 + DOCK_GAP);
    expect(tallest.y + tallest.height).toBe(r.y + r.height);
  });

  it('maps arrow keys to steps (Shift = 4x)', () => {
    expect(arrowDelta('ArrowLeft', false)).toEqual([-16, 0]);
    expect(arrowDelta('ArrowDown', true)).toEqual([0, 64]);
    expect(arrowDelta('Enter', false)).toBeNull();
  });

  it('folds down when collapsed in the lower half, up in the upper half', () => {
    const low = { x: 8, y: 500, width: 340, height: 360 };
    expect(collapsedTop(low, vp)).toBe(500 + 360 - DOCK_HEADER);
    const high = { x: 8, y: 60, width: 340, height: 300 };
    expect(collapsedTop(high, vp)).toBe(60);
  });

  it('buckets viewports by breakpoint', () => {
    expect(viewportKey(800)).toBe('md');
    expect(viewportKey(1024)).toBe('lg');
    expect(viewportKey(1440)).toBe('xl');
    expect(viewportKey(1920)).toBe('2xl');
  });

  it('drops malformed saved rects', () => {
    expect(parseDockRects({ xl: { x: 1, y: 2, width: 300, height: 300 }, lg: { x: 'a' }, md: null })).toEqual({ xl: { x: 1, y: 2, width: 300, height: 300 } });
    expect(parseDockRects('nope')).toEqual({});
  });
});
