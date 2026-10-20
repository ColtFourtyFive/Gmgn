import { describe, expect, it } from 'vitest';
import { COPY, copy, resolveCopy, type CopyEntry } from '@/copy';

/** Every area file's exported entry tables (all files here but the helpers and tests). */
const areas = import.meta.glob<Record<string, Record<string, CopyEntry>>>(['./*.ts', '!./index.ts', '!./entry.ts', '!./*.test.ts'], { eager: true });

describe('copy catalogue', () => {
  it('merges every area, and no key is defined twice', () => {
    const keys = Object.values(areas).flatMap((mod) => Object.values(mod).flatMap((table) => Object.keys(table)));
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(COPY).sort());
  });

  it('has text for both modes on every key', () => {
    for (const key of Object.keys(COPY) as (keyof typeof COPY)[]) {
      for (const mode of ['demo', 'live'] as const) expect(copy(key, { mode }), `${key} (${mode})`).not.toBe('');
    }
  });

  it('picks the mode, then a chain override, and fills templates from the context', () => {
    const entry: CopyEntry = {
      demo: 'Paper trade',
      live: ({ chain }) => `Real funds on ${chain ?? 'any chain'}`,
      chains: { base: { live: 'Real funds on Base' } },
    };
    expect(resolveCopy(entry, { mode: 'demo', chain: 'base' })).toBe('Paper trade');
    expect(resolveCopy(entry, { mode: 'live' })).toBe('Real funds on any chain');
    expect(resolveCopy(entry, { mode: 'live', chain: 'sol' })).toBe('Real funds on sol');
    expect(resolveCopy(entry, { mode: 'live', chain: 'base' })).toBe('Real funds on Base');
  });

  it('keeps the wording the pages showed before the catalogue', () => {
    expect(copy('trade.confirm.funds', { mode: 'demo', chain: 'sol' })).toBe('Paper trade — no real funds.');
    expect(copy('trade.confirm.funds', { mode: 'live', chain: 'sol' })).toBe('Executes on Solana mainnet with real funds.');
    expect(copy('portfolio.gate.title', { mode: 'demo' })).toBe('Track your paper portfolio');
    expect(copy('portfolio.gate.title', { mode: 'live' })).toBe('Track your portfolio');
    expect(copy('settings.subtitle', { mode: 'live' })).toBe('Trading presets, display preferences, blacklist, your account and security');
  });
});
