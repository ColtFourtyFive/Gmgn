import { describe, expect, it } from 'vitest';
import type { Candle } from '@trenchscope/shared';
import { AXIS_TICK_PX, axisResolution, chartScale, formatAxis, minMoveFor, readableRange, toBar, type ChartCurrency } from './chartUtils';
import type { ChartUnit } from './store';

const candle: Candle = { time: 1_700_000_000, open: 0.00001, high: 0.00002, low: 0.000005, close: 0.000015, volume: 1200 };

describe('chart unit and currency', () => {
  it('scales USD prices by supply for market cap and by the native price for native units', () => {
    expect(chartScale('price', 'usd', 1e9, 150)).toBe(1);
    expect(chartScale('mcap', 'usd', 1e9, 150)).toBe(1e9);
    expect(chartScale('price', 'native', 1e9, 200)).toBe(1 / 200);
    expect(chartScale('mcap', 'native', 1e9, 200)).toBe(1e9 / 200);
  });

  it('falls back to USD when the native price is unknown', () => {
    expect(chartScale('mcap', 'native', 1e9, 0)).toBe(1e9);
  });

  it('applies the scale to every OHLC value', () => {
    const bar = toBar(candle, 1e9 / 200);
    expect(bar.open).toBeCloseTo(50);
    expect(bar.high).toBeCloseTo(100);
    expect(bar.low).toBeCloseTo(25);
    expect(bar.close).toBeCloseTo(75);
  });

  it('labels USD values with $ and native ones bare (the toolbar names the asset)', () => {
    expect(formatAxis(64_000, 'mcap', 'usd')).toMatch(/^\$64/);
    expect(formatAxis(345.8, 'mcap', 'native')).toBe('345.8');
    expect(formatAxis(0.00000005, 'price', 'native')).not.toContain('$');
    expect(formatAxis(-1, 'price', 'native')).toBe('');
  });

  it('resolves smaller steps for native prices', () => {
    expect(minMoveFor('price', 'native')).toBeLessThan(minMoveFor('price', 'usd'));
    expect(minMoveFor('mcap', 'native')).toBe(0.01);
  });
});

/**
 * Axis labels the way lightweight-charts picks ticks: the autoscaled range plus
 * the chart's scale margins (8% top, 20% bottom) over a `height` px scale, one
 * tick slot per AXIS_TICK_PX, ticks on a 1 / 2 / 2.5 / 5 × 10^k step no finer
 * than the slot, and a flat range padded by 5 × minMove.
 */
function axisLabels(lo: number, hi: number, unit: ChartUnit, currency: ChartCurrency, height = 360): string[] {
  const r = readableRange({ minValue: lo, maxValue: hi }, unit, currency, height);
  let [min, max] = [r.minValue, r.maxValue];
  if (min === max) [min, max] = [min - 5 * minMoveFor(unit, currency), max + 5 * minMoveFor(unit, currency)];
  const span = (max - min) / 0.72;
  const top = max + span * 0.08;
  const bottom = min - span * 0.2;
  const slot = ((top - bottom) * AXIS_TICK_PX) / height;
  const pow = 10 ** Math.floor(Math.log10(slot));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= slot * (1 - 1e-9))!;
  const out: string[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= top; v += step) out.push(formatAxis(v, unit, currency));
  return out.filter(Boolean);
}

const repeats = (labels: string[]) => labels.length - new Set(labels).size;

describe('price axis labels', () => {
  it('knows how finely each label format resolves', () => {
    expect(axisResolution(5_540, 'mcap', 'usd')).toBe(10);
    expect(axisResolution(1_234_567, 'mcap', 'usd')).toBe(10_000);
    expect(axisResolution(345.8, 'mcap', 'native')).toBe(0.1);
    expect(axisResolution(0.000005542, 'price', 'usd')).toBeCloseTo(1e-9, 20);
    expect(axisResolution(2.983e-8, 'price', 'native')).toBeCloseTo(1e-11, 25);
    expect(axisResolution(150, 'price', 'usd')).toBe(0.01);
  });

  // A token seconds after launch: every bar in view at one price.
  it.each<[ChartUnit, ChartCurrency, number]>([
    ['mcap', 'usd', 5_540],
    ['price', 'usd', 0.000005542],
    ['price', 'native', 2.983e-8],
    ['mcap', 'native', 32.95],
    ['mcap', 'usd', 1_234_567],
  ])('labels a flat %s/%s range distinctly', (unit, currency, value) => {
    for (const height of [240, 360, 640]) {
      const labels = axisLabels(value, value, unit, currency, height);
      expect(labels.length).toBeGreaterThan(2);
      expect(repeats(labels)).toBe(0);
    }
  });

  it('labels a narrow range distinctly and leaves wide ranges alone', () => {
    expect(repeats(axisLabels(5_540, 5_546, 'mcap', 'usd'))).toBe(0);
    expect(repeats(axisLabels(0.0000058701, 0.0000058722, 'price', 'usd'))).toBe(0);
    const wide = { minValue: 4_000, maxValue: 60_000 };
    expect(readableRange(wide, 'mcap', 'usd', 360)).toBe(wide);
  });
});
