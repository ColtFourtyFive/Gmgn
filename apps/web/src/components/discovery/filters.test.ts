import { describe, expect, it } from 'vitest';
import { FILTER_PRESETS, type TokenSummary } from '@trenchscope/shared';
import { applyPreset, countFilters, presetActive, removePreset, sanitizeFilters } from './filters';
import { sortTrench } from './TrenchesColumn';

describe('sanitizeFilters', () => {
  it('drops unknown keys, empty ranges, false flags and empty lists', () => {
    const out = sanitizeFilters({
      bogus: 1,
      marketCapUsd: { min: 1000, max: undefined },
      liquidityUsd: {},
      volumeUsd: { min: Number.NaN },
      requireTwitter: true,
      hideCopycats: false,
      launchpads: [],
      excludeKeywords: [' scam ', ''],
      keyword: '  pepe ',
    });
    expect(out).toEqual({ marketCapUsd: { min: 1000 }, requireTwitter: true, excludeKeywords: ['scam'], keyword: 'pepe' });
  });

  it('keeps only one of the mutually exclusive dev-sold flags', () => {
    expect(sanitizeFilters({ hideDevSold: true, onlyDevSold: true })).toEqual({ onlyDevSold: true });
  });

  it('tolerates garbage from storage', () => {
    expect(sanitizeFilters(null)).toEqual({});
    expect(sanitizeFilters('x')).toEqual({});
    expect(sanitizeFilters({ marketCapUsd: 5, launchpads: 'moonpit' })).toEqual({});
  });
});

describe('presets', () => {
  it('applies, detects and removes a preset without touching other keys', () => {
    const base = { requireTwitter: true, rugRatio: { max: 0.5 } };
    const withSafe = applyPreset(base, 'safe');
    expect(withSafe.rugRatio).toEqual(FILTER_PRESETS.safe.rugRatio);
    expect(presetActive(withSafe, 'safe')).toBe(true);
    expect(presetActive(withSafe, 'smart')).toBe(false);
    expect(countFilters(withSafe)).toBe(4);
    expect(removePreset(withSafe, 'safe')).toEqual({ requireTwitter: true });
  });
});

describe('sortTrench', () => {
  const tok = (address: string, createdAt: number, migratedAt: number | null, marketCapUsd: number) =>
    ({ address, createdAt, migratedAt, marketCapUsd, progress: 0, holderCount: 0, stats: { '24h': { volumeUsd: 0 } } }) as unknown as TokenSummary;
  const list = [tok('a', 1, 30, 5), tok('b', 3, 10, 9), tok('c', 2, 20, 1)];

  it('sorts newest first by creation (or migration in the migrated column)', () => {
    expect(sortTrench(list, { key: 'age', dir: 'desc' }, 'new').map((t) => t.address)).toEqual(['b', 'c', 'a']);
    expect(sortTrench(list, { key: 'age', dir: 'desc' }, 'migrated').map((t) => t.address)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by market cap in both directions', () => {
    expect(sortTrench(list, { key: 'mcap', dir: 'desc' }, 'almost').map((t) => t.address)).toEqual(['b', 'a', 'c']);
    expect(sortTrench(list, { key: 'mcap', dir: 'asc' }, 'almost').map((t) => t.address)).toEqual(['c', 'a', 'b']);
  });
});
