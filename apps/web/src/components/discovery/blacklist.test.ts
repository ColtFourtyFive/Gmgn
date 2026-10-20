import { describe, expect, it } from 'vitest';
import type { Blacklist } from '@trenchscope/shared';
import { blacklistExclusions, exclusionMatcher, isBlacklisted, withExclusions } from './blacklist';
import { coverageLabel, impactLabel } from './Safety';

const list: Blacklist = {
  tokens: [
    { chain: 'sol', address: 'TokSol111', addedAt: 1 },
    { chain: 'bsc', address: '0xabc', addedAt: 2 },
  ],
  creators: [{ chain: 'sol', address: 'DevSol222', addedAt: 3 }],
  keywords: ['inu', 'elon'],
};

describe('blacklist exclusions', () => {
  it('slices one chain into TokenFilters exclusions', () => {
    expect(blacklistExclusions(list, 'sol')).toEqual({ excludeAddresses: ['TokSol111'], excludeCreators: ['DevSol222'], excludeKeywords: ['inu', 'elon'] });
    expect(blacklistExclusions(list, 'base')).toEqual({ excludeKeywords: ['inu', 'elon'] });
    expect(blacklistExclusions(undefined, 'sol')).toEqual({});
  });

  it('merges into list filters, de-duplicating keywords and leaving filters alone without exclusions', () => {
    const own = { requireTwitter: true, excludeKeywords: ['$INU', 'pepe'] };
    expect(withExclusions(own, {})).toBe(own);
    expect(withExclusions(undefined, {})).toBeUndefined();
    expect(withExclusions(own, blacklistExclusions(list, 'sol'))).toEqual({
      requireTwitter: true,
      excludeAddresses: ['TokSol111'],
      excludeCreators: ['DevSol222'],
      excludeKeywords: ['inu', 'elon', 'pepe'],
    });
  });

  it('caps merged keywords at the 50 the server accepts', () => {
    const many = Array.from({ length: 40 }, (_, i) => `k${i}`);
    const out = withExclusions({ excludeKeywords: many.map((k) => `x${k}`) }, { excludeKeywords: many });
    expect(out?.excludeKeywords).toHaveLength(50);
    expect(out?.excludeKeywords?.slice(0, 40)).toEqual(many);
  });

  it('matches like the server: addresses (EVM case-insensitive), creators, name / symbol keywords', () => {
    const hidden = exclusionMatcher({ ...blacklistExclusions(list, 'sol'), excludeAddresses: ['TokSol111', '0xabc'] });
    const t = { address: 'Other', creator: 'Someone', symbol: 'PEPE', name: 'Pepe Coin' };
    expect(hidden(t)).toBe(false);
    expect(hidden({ ...t, address: 'TokSol111' })).toBe(true);
    expect(hidden({ ...t, address: '0xABC' })).toBe(true);
    expect(hidden({ ...t, creator: 'DevSol222' })).toBe(true);
    expect(hidden({ ...t, name: 'Shiba INU Two' })).toBe(true);
    expect(hidden({ ...t, symbol: 'ELONX' })).toBe(true);
  });

  it('looks entries up by kind and chain', () => {
    expect(isBlacklisted(list, 'token', 'TokSol111', 'sol')).toBe(true);
    expect(isBlacklisted(list, 'token', 'TokSol111', 'bsc')).toBe(false);
    expect(isBlacklisted(list, 'token', '0xABC', 'bsc')).toBe(true);
    expect(isBlacklisted(list, 'creator', 'DevSol222')).toBe(true);
    expect(isBlacklisted(list, 'keyword', ' $Inu ')).toBe(true);
    expect(isBlacklisted(undefined, 'keyword', 'inu')).toBe(false);
  });
});

describe('safety labels', () => {
  it('words coverage like PRD §8.6.1 and prints impacts with one decimal at most', () => {
    expect(coverageLabel(0.92)).toBe('Sufficient data');
    expect(coverageLabel(0.6)).toBe('Low data');
    expect(coverageLabel(0.3)).toBe('Insufficient data');
    expect(impactLabel(14)).toBe('−14');
    expect(impactLabel(2.625)).toBe('−2.6');
  });
});
