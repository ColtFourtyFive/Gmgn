// Number display components. All use tabular figures and the shared
// formatters, so the same value reads identically across the app.

import { Fragment, memo, type ReactNode } from 'react';
import { CHAINS, formatCompact, formatNative, formatPercent, formatPrice, formatSmall, formatUsd, type ChainId } from '@trenchscope/shared';
import clsx from 'clsx';
import { toneClass } from '@/lib/format';

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

const subscriptDigits = (run: string) => Array.from(run, (ch) => SUBSCRIPT.indexOf(ch)).join('');

/** The plain decimal a subscript-zero string stands for: "0.0₅12" -> "0.0000012". */
export function expandSubscript(text: string): string {
  return text.replace(/0\.0([₀-₉]+)/g, (_, run: string) => `0.${'0'.repeat(Number(subscriptDigits(run)))}`);
}

/**
 * Render a formatted string, turning unicode subscript runs ("0.0₅12") into
 * real <sub> elements so the zero count stays legible at small sizes. The
 * compressed form is hidden from assistive tech, which gets the plain decimal
 * instead (read as-is, "$0.0" + "5" + "12" would be $0.0512).
 */
export function withSubscript(text: string): ReactNode {
  const parts = text.split(/([₀-₉]+)/);
  if (parts.length === 1) return text;
  return (
    <>
      <span aria-hidden="true">
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <sub key={i} className="subz">
              {subscriptDigits(part)}
            </sub>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
      </span>
      <span className="sr-only">{expandSubscript(text)}</span>
    </>
  );
}

type Value = number | null | undefined;

interface SignedProps {
  /** Color green/red by sign. */
  colored?: boolean;
  /** Prefix positive values with "+". */
  signed?: boolean;
}

function signPrefix(value: Value, signed?: boolean): string {
  return signed && value !== null && value !== undefined && value > 0 ? '+' : '';
}

export interface PriceProps {
  value: Value;
  /** Significant digits after leading zeros. */
  significant?: number;
  /** Show as a native price ("0.0₅12 SOL") instead of USD. */
  symbol?: string;
  className?: string;
}

/** Token price; tiny values use subscript-zero notation ($0.0₅1234). */
export const Price = memo(function Price({ value, significant = 4, symbol, className }: PriceProps) {
  const text = symbol ? (value === null || value === undefined ? '--' : `${formatSmall(value, significant)} ${symbol}`) : formatPrice(value, significant);
  return (
    <span className={clsx('num whitespace-nowrap', className)} title={value ? String(value) : undefined}>
      {withSubscript(text)}
    </span>
  );
});

export interface UsdProps extends SignedProps {
  value: Value;
  digits?: number;
  className?: string;
}

/** Compact USD amount: $1.23K, $45.6M. */
export const Usd = memo(function Usd({ value, digits = 2, colored, signed, className }: UsdProps) {
  return (
    <span className={clsx('num whitespace-nowrap', colored && toneClass(value), className)}>
      {signPrefix(value, signed)}
      {withSubscript(formatUsd(value, digits))}
    </span>
  );
});

export interface NativeProps extends SignedProps {
  value: Value;
  /** Chain whose native symbol is appended (or pass `symbol`). */
  chain?: ChainId;
  symbol?: string;
  digits?: number;
  className?: string;
}

/** Native-asset amount with symbol: "1.25 SOL". */
export const Native = memo(function Native({ value, chain, symbol, digits, colored, signed, className }: NativeProps) {
  const sym = symbol ?? (chain ? CHAINS[chain].nativeSymbol : undefined);
  return (
    <span className={clsx('num whitespace-nowrap', colored && toneClass(value), className)}>
      {signPrefix(value, signed)}
      {withSubscript(formatNative(value, sym, digits))}
    </span>
  );
});

export interface PctProps {
  value: Value;
  /** Value is a 0..1 ratio (default) or already a percent. */
  ratio?: boolean;
  digits?: number;
  /** Prefix "+" for positive values (default true). */
  sign?: boolean;
  /** Green/red by sign (default true). */
  colored?: boolean;
  /** Leading ▲/▼ instead of the sign. */
  arrow?: boolean;
  className?: string;
}

/** Percent change: +12.34% green, -5% red, 0% muted. */
export const Pct = memo(function Pct({ value, ratio = true, digits = 2, sign = true, colored = true, arrow, className }: PctProps) {
  const up = value !== null && value !== undefined && value > 0;
  const down = value !== null && value !== undefined && value < 0;
  const text = formatPercent(arrow && value ? Math.abs(value) : value, { ratio, digits, sign: arrow ? false : sign });
  return (
    <span className={clsx('num whitespace-nowrap', colored && toneClass(value), className)}>
      {arrow && (up || down) && <span className="mr-0.5 text-[0.75em]">{up ? '▲' : '▼'}</span>}
      {text}
    </span>
  );
});

export interface CompactProps {
  value: Value;
  digits?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Compact plain number: 1.23K, 4.5M (holders, swaps, supply). */
export const Compact = memo(function Compact({ value, digits = 2, prefix, suffix, className }: CompactProps) {
  return (
    <span className={clsx('num whitespace-nowrap', className)}>
      {prefix}
      {withSubscript(formatCompact(value, digits))}
      {suffix}
    </span>
  );
});
