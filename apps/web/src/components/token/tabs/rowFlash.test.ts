// The trade tape flashes new rows on the compositor: an opacity fade of a
// tinted overlay, never a background-color animation (which restyled and
// repainted the whole table every frame on busy tokens).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rowFlashClass } from './ActivityTab';

// Vitest runs from apps/web (or the repo root).
const read = (rel: string) => readFileSync([rel, `apps/web/${rel}`].map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p))!, 'utf8');
const css = read('src/index.css');
const tailwind = read('tailwind.config.js');

/** Body of the first `{ ... }` block after `start` (nested braces included). */
function block(source: string, start: string): string {
  const at = source.indexOf(start);
  expect(at).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unbalanced block after ${start}`);
}

describe('trade tape row flash', () => {
  it('flags only rows that arrived within the flash window, by side', () => {
    expect(rowFlashClass('buy', 1_000, 1_500)).toBe('row-flash-up');
    expect(rowFlashClass('sell', 1_000, 2_200)).toBe('row-flash-down');
    expect(rowFlashClass('buy', 1_000, 2_201)).toBeUndefined();
    expect(rowFlashClass('buy', undefined, 1_000)).toBeUndefined();
  });

  it('animates only the opacity of a cell overlay', () => {
    const frames = block(css, '@keyframes row-flash');
    const props = [...frames.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(['opacity']));
    expect(block(css, ':where(.row-flash-up, .row-flash-down) > td::before')).toMatch(/animation:\s*row-flash\b/);
    expect(block(css, '.row-flash-up > td::before')).toMatch(/background-color/);
  });

  it('leaves no background-color keyframes in the Tailwind theme', () => {
    expect(block(tailwind, 'keyframes:')).not.toMatch(/backgroundColor|background-color/);
    expect(tailwind).not.toMatch(/'flash-(up|down)'/);
  });
});
