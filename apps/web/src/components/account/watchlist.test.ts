import { describe, expect, it } from 'vitest';
import type { WatchlistGroup } from '@trenchscope/shared';
import { groupNameError, patchItem } from './watchlist';

const groups: WatchlistGroup[] = [
  { id: 'g1', name: 'Majors', order: 0 },
  { id: 'g2', name: 'Degen', color: '#ff5468', order: 1 },
];

describe('watchlist groups', () => {
  it('checks names like the API: required, 24 characters, "All" reserved, unique ignoring case', () => {
    expect(groupNameError('  ', groups)).toBe('Enter a name');
    expect(groupNameError('x'.repeat(25), groups)).toMatch(/24/);
    expect(groupNameError('all', groups)).toMatch(/reserved/);
    expect(groupNameError('majors', groups)).toMatch(/exists/);
    expect(groupNameError('Majors', groups, 'g1')).toBeNull();
    expect(groupNameError(' Moonshots ', groups)).toBeNull();
  });

  it('patches items like the API: de-duplicated groups, empty lists and blank notes remove the field', () => {
    const item = { chain: 'sol' as const, address: 'A', addedAt: 1, groupIds: ['g1'], note: 'old' };
    expect(patchItem(item, { groupIds: ['g2', 'g2', 'g1'] })).toEqual({ ...item, groupIds: ['g2', 'g1'] });
    expect(patchItem(item, { groupIds: [] })).toEqual({ chain: 'sol', address: 'A', addedAt: 1, note: 'old' });
    expect(patchItem(item, { note: '  ' })).toEqual({ chain: 'sol', address: 'A', addedAt: 1, groupIds: ['g1'] });
    expect(patchItem(item, { note: ' retest ' }).note).toBe('retest');
    expect(patchItem(item, {})).toEqual(item);
  });
});
