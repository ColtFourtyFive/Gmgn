import { describe, expect, it } from 'vitest';
import { resolveTourSteps, sheetEdge, TOUR_STEPS, tourPage, tourStartPath, unionBox } from './tour';

const ids = (page: 'trenches' | 'token' | 'other', mobile: boolean) => resolveTourSteps(TOUR_STEPS, { page, mobile }).map((s) => s.id);

describe('tour steps', () => {
  it('walks the board on Trenches (desktop)', () => {
    expect(ids('trenches', false)).toEqual(['chain', 'columns', 'quick-buy', 'search', 'monitor', 'dock']);
  });

  it('swaps the board steps for the trade panel on a token page', () => {
    expect(ids('token', false)).toEqual(['chain', 'trade', 'search', 'monitor', 'dock']);
  });

  it('gives phones a shorter tour without the desktop dock', () => {
    const phone = ids('trenches', true);
    expect(phone).toEqual(['chain', 'columns', 'quick-buy', 'search', 'monitor']);
    expect(phone.length).toBeLessThan(ids('trenches', false).length);
  });

  it('uses the phone copy on phones only', () => {
    const body = (mobile: boolean) => resolveTourSteps(TOUR_STEPS, { page: 'trenches', mobile }).find((s) => s.id === 'columns')?.body;
    expect(body(false)).toMatch(/Hover a column/);
    expect(body(true)).not.toMatch(/Hover/);
    for (const s of resolveTourSteps(TOUR_STEPS, { page: 'trenches', mobile: true })) expect(s.body).not.toMatch(/hotkeys|Hover|Ctrl/);
  });

  it('keeps every desktop tour within 5-7 steps', () => {
    for (const page of ['trenches', 'token'] as const) {
      const n = ids(page, false).length;
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('classifies pages', () => {
    expect(tourPage('/sol/trenches')).toBe('trenches');
    expect(tourPage('/bsc/token/0xabc')).toBe('token');
    expect(tourPage('/settings')).toBe('other');
    expect(tourPage('/sol/monitor')).toBe('other');
  });

  it('starts on Trenches unless the page has its own steps', () => {
    expect(tourStartPath('/settings', 'base')).toBe('/base/trenches');
    expect(tourStartPath('/sol/leaderboard', 'sol')).toBe('/sol/trenches');
    expect(tourStartPath('/sol/trenches', 'sol')).toBeNull();
    expect(tourStartPath('/eth/token/0xabc', 'sol')).toBeNull();
  });

  it('has a target for every step', () => {
    for (const s of TOUR_STEPS) expect(s.target.length).toBeGreaterThan(0);
  });
});

describe('tour geometry', () => {
  it('unions rects into one box', () => {
    expect(
      unionBox([
        { top: 50, left: 10, width: 100, height: 40 },
        { top: 50, left: 120, width: 100, height: 40 },
        { top: 60, left: 230, width: 100, height: 40 },
      ]),
    ).toEqual({ top: 50, left: 10, width: 320, height: 50 });
    expect(unionBox([])).toBeNull();
  });

  it('puts the phone sheet away from the highlighted element', () => {
    expect(sheetEdge({ top: 10, left: 0, width: 40, height: 40 }, 844)).toBe('bottom');
    expect(sheetEdge({ top: 790, left: 0, width: 80, height: 50 }, 844)).toBe('top');
    expect(sheetEdge(null, 844)).toBe('bottom');
  });
});
