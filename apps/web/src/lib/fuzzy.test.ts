import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyRank } from './fuzzy';

const titles = (ranked: { item: { title: string } }[]) => ranked.map((r) => r.item.title);

describe('fuzzyMatch', () => {
  it('matches subsequences case-insensitively and reports positions', () => {
    expect(fuzzyMatch('trd', 'Trending')?.indices).toEqual([0, 1, 4]);
    expect(fuzzyMatch('PEPE', 'pepe coin')?.indices).toEqual([0, 1, 2, 3]);
  });

  it('rejects patterns that do not occur in order', () => {
    expect(fuzzyMatch('xyz', 'Trending')).toBeNull();
    expect(fuzzyMatch('gnirt', 'Trending')).toBeNull();
    expect(fuzzyMatch('trendingg', 'Trending')).toBeNull();
  });

  it('accepts an empty pattern', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('prefers word starts over scattered letters', () => {
    // "New Pairs": N + P are both word starts; in "Sniper" they are mid-word.
    expect(fuzzyMatch('np', 'New Pairs')!.score).toBeGreaterThan(fuzzyMatch('np', 'Sniper')!.score);
    expect(fuzzyMatch('np', 'New Pairs')!.indices).toEqual([0, 4]);
    expect(fuzzyMatch('cs', 'Copy Trade · Solana')!.indices).toEqual([0, 13]);
  });

  it('picks the best alignment, not the first one', () => {
    // Greedy matching would take the "a" of "Leaderboard"; the word start "B" + "oard" run is better.
    expect(fuzzyMatch('board', 'Leaderboard')!.indices).toEqual([6, 7, 8, 9, 10]);
    expect(fuzzyMatch('ca', 'Copy Trade · Call-outs')!.indices).toEqual([13, 14]);
  });

  it('ranks prefixes above later substrings', () => {
    expect(fuzzyMatch('set', 'Settings')!.score).toBeGreaterThan(fuzzyMatch('set', 'Reset theme')!.score);
  });
});

describe('fuzzyRank', () => {
  const items = [
    { title: 'Sniper', keywords: ['snipe', 'auto buy'] },
    { title: 'New Pairs', keywords: ['pools', 'migrated'] },
    { title: 'Trending', keywords: ['hot', 'Solana', 'sol'] },
    { title: 'Trending', keywords: ['hot', 'BNB Chain', 'bsc'] },
    { title: 'Open settings', keywords: ['preferences'] },
  ];
  const fields = (i: (typeof items)[number]) => [i.title, ...i.keywords];

  it('keeps every item in order for an empty query', () => {
    expect(titles(fuzzyRank('  ', items, fields))).toEqual(items.map((i) => i.title));
  });

  it('orders by match quality and drops non-matches', () => {
    expect(titles(fuzzyRank('np', items, fields))).toEqual(['New Pairs', 'Sniper']);
  });

  it('requires every term to match some field', () => {
    const ranked = fuzzyRank('trending bsc', items, fields);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].item.keywords).toContain('bsc');
    // Only title matches are highlighted.
    expect(ranked[0].indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('weights title matches above keyword matches', () => {
    const ranked = fuzzyRank('pref', [{ title: 'Preferences', keywords: [] }, ...items], fields);
    expect(titles(ranked)).toEqual(['Preferences', 'Open settings']);
  });

  it('keeps the original order between equal scores', () => {
    const ranked = fuzzyRank('trending', items, fields);
    expect(ranked.map((r) => r.item.keywords[2])).toEqual(['sol', 'bsc']);
  });
});
