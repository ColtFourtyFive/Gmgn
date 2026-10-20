import { describe, expect, it } from 'vitest';
import { computePosition } from '@/components/ui/Floating';
import { activeSection, NAV_ITEMS, switchChainPath } from './nav';

describe('chain switching', () => {
  it('keeps the section when switching chains', () => {
    expect(switchChainPath('/sol/trending', 'bsc')).toBe('/bsc/trending');
    expect(switchChainPath('/base/leaderboard', 'eth')).toBe('/eth/leaderboard');
  });

  it('sends token and address pages to the new chain trenches', () => {
    expect(switchChainPath('/sol/token/abc', 'bsc')).toBe('/bsc/trenches');
    expect(switchChainPath('/sol/address/xyz', 'base')).toBe('/base/trenches');
  });

  it('leaves global routes alone', () => {
    expect(switchChainPath('/portfolio', 'bsc')).toBeNull();
    expect(switchChainPath('/_ui', 'eth')).toBeNull();
  });

  it('links the launch and call-out pages per chain', () => {
    const href = (key: string) => NAV_ITEMS.find((i) => i.key === key)?.href;
    expect(href('launch')?.('bsc')).toBe('/bsc/launch');
    expect(href('callouts')?.('sol')).toBe('/sol/callouts');
    expect(switchChainPath('/sol/callouts', 'eth')).toBe('/eth/callouts');
    expect(activeSection('/base/launch')).toBe('launch');
  });

  it('derives the active section', () => {
    expect(activeSection('/sol/new-pairs')).toBe('new-pairs');
    expect(activeSection('/watchlist')).toBe('watchlist');
    expect(activeSection('/')).toBeNull();
  });
});

describe('computePosition', () => {
  const viewport = { width: 1000, height: 800 };
  const anchor = (top: number, left = 100) => ({ top, bottom: top + 30, left, right: left + 100, width: 100, height: 30 });

  it('places below the anchor, start-aligned', () => {
    expect(computePosition(anchor(100), { width: 200, height: 150 }, 'bottom-start', 6, viewport)).toMatchObject({ side: 'bottom', top: 136, left: 100 });
  });

  it('flips to the top when there is no room below', () => {
    const pos = computePosition(anchor(700), { width: 200, height: 150 }, 'bottom-start', 6, viewport);
    expect(pos.side).toBe('top');
    expect(pos.top).toBe(700 - 6 - 150);
  });

  it('clamps horizontally into the viewport', () => {
    const pos = computePosition(anchor(100, 950), { width: 200, height: 100 }, 'bottom-start', 6, viewport);
    expect(pos.left).toBe(1000 - 200 - 8);
  });
});
