import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollBehavior } from './useMediaQuery';

afterEach(() => vi.unstubAllGlobals());

const prefers = (reduce: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }));

describe('scrollBehavior', () => {
  it('scrolls instantly when the user prefers reduced motion', () => {
    prefers(true);
    expect(scrollBehavior()).toBe('auto');
  });
  it('scrolls smoothly otherwise', () => {
    prefers(false);
    expect(scrollBehavior()).toBe('smooth');
  });
});
