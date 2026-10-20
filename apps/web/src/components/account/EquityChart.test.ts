import { describe, expect, it } from 'vitest';
import { equityPriceFormat } from './EquityChart';

/** Axis ticks the way chart libraries pick them: a 1/2/5×10^k step (never below minMove) across the range. */
function ticks(lo: number, hi: number, minMove: number): number[] {
  const raw = Math.max((hi - lo) / 6, minMove);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  // A flat series still gets a few ticks around its value.
  return out.length > 1 ? out : [lo - step, lo, lo + step];
}

function labels(values: number[]): string[] {
  const { minMove, formatter } = equityPriceFormat(values);
  return ticks(Math.min(...values), Math.max(...values), minMove).map(formatter);
}

const distinct = (xs: string[]) => new Set(xs).size === xs.length;

describe('equityPriceFormat', () => {
  it('labels ticks of a quiet account distinctly (no six "$38.88K")', () => {
    const quiet = labels([38_875, 38_877.5, 38_885]);
    expect(distinct(quiet)).toBe(true);
    expect(quiet[0]).toMatch(/^\$38,87\d(\.\d\d)?$/);
    expect(distinct(labels([39_000, 39_008, 39_020]))).toBe(true);
    expect(distinct(labels([38_880.12]))).toBe(true); // flat line
  });

  it('keeps compact labels when the range is wide enough to read', () => {
    const wide = labels([20_000, 35_000, 52_000]);
    expect(distinct(wide)).toBe(true);
    expect(wide.every((l) => /^\$\d+(\.\d+)?K$/.test(l))).toBe(true);
  });
});
