// Integer trade math in basis points (1 bps = 0.01%). All amounts are bigint
// base units; rounding always favours the user's protection (minOut rounds
// down, fees round down, required inputs round up).

export const BPS = 10_000n;
export const MAX_SLIPPAGE_BPS = 5_000;
export const MIN_SLIPPAGE_BPS = 1;

/** GMGN-style automatic slippage: 2% + token tax + 1.5x price impact, clamped to 1%..50%. */
export const AUTO_SLIPPAGE = { baseBps: 200, impactWeight: 1.5, minBps: 100, maxBps: 5_000 } as const;

export function mulBps(amount: bigint, bps: number | bigint): bigint {
  return (amount * BigInt(bps)) / BPS;
}

/** Output floor after slippage: floor(expected * (1 - slippage)). */
export function minOutAfterSlippage(expectedOut: bigint, slippageBps: number): bigint {
  const s = BigInt(Math.min(Math.max(Math.round(slippageBps), 0), 10_000));
  return (expectedOut * (BPS - s)) / BPS;
}

/** Platform fee taken from an input amount (buys): floor(amount * bps). */
export function feeOnInput(amountIn: bigint, feeBps: number): bigint {
  return mulBps(amountIn, feeBps);
}

/** Platform fee on an output amount (sells, Universal Router PAY_PORTION semantics): floor(gross * bps). */
export function feeOnOutput(grossOut: bigint, feeBps: number): bigint {
  return mulBps(grossOut, feeBps);
}

/**
 * Smallest gross output g whose net after a bps fee on output,
 * g - floor(g * bps / 1e4), is at least `net`. That net is non-decreasing in g
 * with steps of 0 or 1, so every value is reached: this is also the gross a
 * PAY_PORTION-style fee was charged on given what reached the wallet (exact up
 * to the 1-wei ambiguity where the fee's floor steps).
 */
export function grossForNet(net: bigint, feeBps: number): bigint {
  if (feeBps <= 0 || net <= 0n) return net < 0n ? 0n : net;
  const denom = BPS - BigInt(feeBps);
  let g = (net * BPS + denom - 1n) / denom;
  while (g > 0n && g - 1n - feeOnOutput(g - 1n, feeBps) >= net) g--;
  return g;
}

export function autoSlippageBps(priceImpactBps: number, tokenTaxBps: number): number {
  const raw = AUTO_SLIPPAGE.baseBps + tokenTaxBps + priceImpactBps * AUTO_SLIPPAGE.impactWeight;
  return Math.round(Math.min(Math.max(raw, AUTO_SLIPPAGE.minBps), AUTO_SLIPPAGE.maxBps));
}

export function resolveSlippageBps(requested: number | 'auto', priceImpactBps: number, tokenTaxBps: number): number {
  if (requested === 'auto') return autoSlippageBps(priceImpactBps, tokenTaxBps);
  if (!Number.isFinite(requested) || requested < MIN_SLIPPAGE_BPS || requested > MAX_SLIPPAGE_BPS) {
    throw new RangeError(`slippage must be ${MIN_SLIPPAGE_BPS}..${MAX_SLIPPAGE_BPS} bps`);
  }
  return Math.round(requested);
}

/**
 * Price impact of a trade against a small reference trade on the same venue:
 * 1 - (out/in) / (refOut/refIn), in bps (0 when the trade gets a better rate).
 */
export function priceImpactBps(amountIn: bigint, amountOut: bigint, refIn: bigint, refOut: bigint): number {
  if (amountIn <= 0n || refIn <= 0n || refOut <= 0n) return 0;
  // rate = out / in; impact = 1 - rate / refRate = 1 - (out * refIn) / (in * refOut)
  const num = amountOut * refIn * BPS;
  const den = amountIn * refOut;
  const ratioBps = num / den;
  return ratioBps >= BPS ? 0 : Number(BPS - ratioBps);
}

/** Share of `part` in `whole` in bps (0 when whole is 0). */
export function bpsOf(part: bigint, whole: bigint): number {
  if (whole <= 0n || part <= 0n) return 0;
  return Number((part * BPS) / whole);
}

/** Amount to sell for a percentage (bps) of a balance; 100% sells the exact balance. */
export function percentOf(balance: bigint, bps: bigint): bigint {
  if (bps >= BPS) return balance;
  return (balance * bps) / BPS;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
