import { describe, expect, it } from 'vitest';
import type { Candle } from '@trenchscope/shared';
import { chartScale, formatAxis, minMoveFor, toBar } from './chartUtils';

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
