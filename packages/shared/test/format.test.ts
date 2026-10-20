// Formatter conformance: PRD Appendix A subscript cases plus rounding edges.

import { describe, expect, it } from 'vitest';
import { formatCompact, formatNative, formatPercent, formatPrice, formatSmall, formatUsd } from '../src/format';

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

/** The number a formatted small value stands for: "0.0₅12" -> 0.0000012. */
function parseSmall(text: string): number {
  const plain = text.replace(/0\.0([₀-₉]+)/, (_, run: string) => {
    const zeros = Number(Array.from(run, (ch) => SUBSCRIPT.indexOf(ch)).join(''));
    return `0.${'0'.repeat(zeros)}`;
  });
  return Number(plain);
}

describe('formatSmall / formatPrice (subscript zeros)', () => {
  it('matches the Appendix A price cases', () => {
    expect(formatPrice(0.000003518)).toBe('$0.0₅3518');
    expect(formatPrice(0.0000035180)).toBe('$0.0₅3518');
    expect(formatPrice(0.00000041)).toBe('$0.0₆41');
    expect(formatPrice(0.00019)).toBe('$0.00019');
    expect(formatPrice(0.012345)).toBe('$0.01235');
    expect(formatPrice(0.5)).toBe('$0.5');
  });

  it('trims trailing zeros from the digits after the subscript', () => {
    expect(formatPrice(0.0000012)).toBe('$0.0₅12');
    expect(formatPrice(1e-6)).toBe('$0.0₅1');
    expect(formatSmall(0.00000105, 4)).toBe('0.0₅105');
  });

  it('drops a leading zero when rounding carries to the next power of ten', () => {
    expect(formatPrice(0.0000099999)).toBe('$0.0₄1');
    expect(formatPrice(0.0000099995)).toBe('$0.0₄1');
    expect(formatPrice(9.9996e-8)).toBe('$0.0₆1');
    expect(formatNative(0.000009996, 'SOL')).toBe('0.0₄1 SOL');
    expect(formatNative(9.996e-7)).toBe('0.0₅1');
    expect(formatCompact(0.0000099999)).toBe('0.0₄1');
    // Carrying out of the subscript range falls back to plain decimals.
    expect(formatPrice(0.000099999)).toBe('$0.0001');
  });

  it('keeps just-below-carry values at full precision', () => {
    expect(formatPrice(0.0000099994)).toBe('$0.0₅9999');
    expect(formatNative(0.0000099949, 'SOL')).toBe('0.0₅999 SOL');
  });

  it('round-trips within rounding error around every power of ten', () => {
    for (const sig of [1, 2, 3, 4, 6]) {
      for (let k = 2; k <= 14; k++) {
        const p = Math.pow(10, -k);
        for (const f of [0.9999999, 0.99995, 0.9996, 0.95, 1, 1.00004, 1.5, 9.99996]) {
          const value = p * f;
          const shown = parseSmall(formatSmall(value, sig));
          expect(Math.abs(shown / value - 1), `${value} @${sig} -> ${formatSmall(value, sig)}`).toBeLessThanOrEqual(
            0.5 * Math.pow(10, 1 - sig) + 1e-9,
          );
        }
      }
    }
  });
});

describe('formatCompact / formatUsd unit boundaries', () => {
  it('promotes to the next unit when rounding reaches 1000', () => {
    expect(formatUsd(999995)).toBe('$1M');
    expect(formatUsd(999999.5)).toBe('$1M');
    expect(formatUsd(999999000)).toBe('$1B');
    expect(formatUsd(-999995)).toBe('-$1M');
    expect(formatCompact(999994, 1)).toBe('1M');
    expect(formatCompact(999950, 1)).toBe('1M');
    expect(formatCompact(-999994, 1)).toBe('-1M');
    expect(formatCompact(999600, 0)).toBe('1M');
    expect(formatCompact(9.99996e11)).toBe('1T');
    expect(formatPrice(999999)).toBe('$1M');
    expect(formatNative(999999.9, 'SOL')).toBe('1M SOL');
    expect(formatPercent(999960, { ratio: false })).toBe('+1M%');
  });

  it('promotes sub-1K values that round to 1000 to "1K"', () => {
    expect(formatUsd(999.996)).toBe('$1K');
    expect(formatUsd(999.95)).toBe('$1K');
    expect(formatCompact(999.6, 0)).toBe('1K');
  });

  it('keeps just-below-boundary values in the smaller unit', () => {
    expect(formatUsd(999990)).toBe('$999.99K');
    expect(formatCompact(999949, 1)).toBe('999.9K');
    expect(formatUsd(999.94)).toBe('$999.9');
    expect(formatCompact(999.4, 0)).toBe('999');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1234)).toBe('1.23K');
    expect(formatCompact(1_250_000)).toBe('1.25M');
    expect(formatUsd(1e6)).toBe('$1M');
  });

  it('T has no larger unit to promote to', () => {
    expect(formatCompact(9.99996e14)).toBe('1000T');
    expect(formatCompact(1.5e15)).toBe('1500T');
  });

  it('never prints a raw number or a 1000+ mantissa below T', () => {
    const SUFFIX = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as const;
    for (const digits of [0, 1, 2, 3]) {
      for (const size of [1, 1e3, 1e6, 1e9]) {
        for (const f of [999.4, 999.5, 999.94, 999.95, 999.994, 999.995, 999.9994, 999.9995, 999.99999, 1000]) {
          const value = size * f;
          const text = formatCompact(value, digits);
          const match = /^(\d+(?:\.\d+)?)([KMBT]?)$/.exec(text);
          expect(match, `${value} @${digits} -> ${text}`).not.toBeNull();
          const [, body, suffix] = match!;
          expect(Number(body), `${value} @${digits} -> ${text}`).toBeLessThan(1000);
          // Off by at most half a step of the last shown decimal (plain numbers >= 100 keep <= 1 decimal).
          const unit = SUFFIX[suffix as keyof typeof SUFFIX];
          const step = Math.pow(10, -(suffix ? digits : Math.min(digits, 1))) * unit;
          expect(Math.abs(Number(body) * unit - value), `${value} @${digits} -> ${text}`).toBeLessThanOrEqual(
            step / 2 + value * 1e-12,
          );
        }
      }
    }
  });
});

describe('formatPercent sign', () => {
  it('drops the sign when the change rounds to zero', () => {
    expect(formatPercent(0.000004)).toBe('0%');
    expect(formatPercent(-0.000004)).toBe('0%');
    expect(formatPercent(-0.0004, { digits: 1 })).toBe('0%');
    expect(formatPercent(0.0004, { digits: 1 })).toBe('0%');
    expect(formatPercent(0.004, { digits: 0 })).toBe('0%');
    expect(formatPercent(-0.3, { ratio: false, digits: 0 })).toBe('0%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('keeps the sign for changes that survive rounding', () => {
    expect(formatPercent(0.0006, { digits: 1 })).toBe('+0.1%');
    expect(formatPercent(-0.0006, { digits: 1 })).toBe('-0.1%');
    expect(formatPercent(0.416)).toBe('+41.6%');
    expect(formatPercent(-0.9971)).toBe('-99.71%');
    expect(formatPercent(0.416, { sign: false })).toBe('41.6%');
    expect(formatPercent(-0.416, { sign: false })).toBe('-41.6%');
  });
});
