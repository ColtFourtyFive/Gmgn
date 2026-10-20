// Integer money math for on-chain amounts. Everything sent on-chain is an
// integer count of base units (lamports, token base units) held as bigint;
// display amounts (numbers) are converted at the edges only.

import { LAMPORTS_PER_SOL } from '@trenchscope/shared';

export const SOL_DECIMALS = 9;
/** Base fee per signature (lamports). */
export const SIGNATURE_FEE_LAMPORTS = 5000n;
/** Rent-exempt minimum of a plain system account (0 bytes of data). */
export const RENT_EXEMPT_MIN_LAMPORTS = 890_880n;
/** Rent of a new SPL / Token-2022 associated token account (165 bytes). */
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280n;

/**
 * Display amount -> base units, rounded down (never more than asked). Throws
 * on negative, non-finite or absurdly large input.
 */
export function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('amount must be a non-negative finite number');
  if (amount >= 1e18) throw new RangeError('amount is too large');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new RangeError('invalid decimals');
  // toFixed gives the exact decimal expansion rounded a few digits further; truncating drops them.
  const fixed = amount.toFixed(Math.min(100, decimals + 6));
  const [whole, frac = ''] = fixed.split('.');
  return BigInt(whole + frac.slice(0, decimals).padEnd(decimals, '0'));
}

/** Base units -> display amount (a number: for display, analytics and the ledger only). */
export function fromBaseUnits(raw: bigint, decimals: number): number {
  if (decimals === 0) return Number(raw);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const value = Number(abs / scale) + Number(abs % scale) / Number(scale);
  return negative ? -value : value;
}

export const solToLamports = (sol: number): bigint => toBaseUnits(sol, SOL_DECIMALS);
export const lamportsToSol = (lamports: bigint): number => fromBaseUnits(lamports, SOL_DECIMALS);

/** floor(amount * bps / 10000). */
export function bpsOf(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError('bps must be a non-negative integer');
  return (amount * BigInt(bps)) / 10_000n;
}

/** A slippage ratio (0.15 = 15%) as basis points, clamped to 1..10000. */
export function slippageToBps(ratio: number): number {
  if (!Number.isFinite(ratio)) return 1;
  return Math.min(10_000, Math.max(1, Math.round(ratio * 10_000)));
}

/** At least `amount` minus the slippage tolerance: floor(amount * (10000 - bps) / 10000). */
export function minWithSlippage(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10_000 - Math.min(10_000, bps))) / 10_000n;
}

/** At most `amount` plus the slippage tolerance: floor(amount * (10000 + bps) / 10000). */
export function maxWithSlippage(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10_000 + bps)) / 10_000n;
}

/** A share of a raw balance by percent (0, 100]: 100 is exactly the balance (no dust left behind). */
export function percentOf(raw: bigint, percent: number): bigint {
  if (!(percent > 0)) return 0n;
  if (percent >= 100) return raw;
  // thousandths of a percent: 33.333% -> 33333 / 100000
  return (raw * BigInt(Math.floor(percent * 1000))) / 100_000n;
}

export const LAMPORTS = BigInt(LAMPORTS_PER_SOL);
