// Pricing math for launchpad bonding curves and constant-product AMM pools.
// Both are constant-product (x * y = k); a bonding curve trades against
// *virtual* reserves and caps how many real tokens can leave the curve.

export interface CurveState {
  /** Virtual native reserve (e.g. SOL) including real native collected. */
  virtualNative: number;
  /** Virtual token reserve. */
  virtualTokens: number;
  /** Real tokens still sellable from the curve; graduation when this reaches 0. */
  realTokens: number;
  /** Real native collected by the curve so far. */
  realNative: number;
}

export interface PoolState {
  /** Native reserve in the AMM pool (e.g. SOL / WBNB / WETH). */
  native: number;
  /** Token reserve in the AMM pool. */
  tokens: number;
}

export interface SwapResult {
  /** Amount of the input asset actually consumed (fee inclusive). */
  amountIn: number;
  /** Amount of the output asset received. */
  amountOut: number;
  /** Fee paid to the venue, denominated in the input asset when buying with native, otherwise in native. */
  venueFee: number;
  /** Spot price (native per token) before the swap. */
  priceBefore: number;
  /** Spot price (native per token) after the swap. */
  priceAfter: number;
  /** Execution price (native per token). */
  executionPrice: number;
  /** |execution - spot| / spot. */
  priceImpact: number;
  /** True when this swap exhausted the bonding curve (token should graduate). */
  completesCurve: boolean;
}

/** Constant-product output for an exact input, after an input-side fee. */
export function cpOut(amountIn: number, reserveIn: number, reserveOut: number, feeRate: number): number {
  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;
  const inAfterFee = amountIn * (1 - feeRate);
  return (inAfterFee * reserveOut) / (reserveIn + inAfterFee);
}

/** Constant-product input required (fee inclusive) to receive an exact output. */
export function cpIn(amountOut: number, reserveIn: number, reserveOut: number, feeRate: number): number {
  if (amountOut <= 0) return 0;
  if (amountOut >= reserveOut) return Infinity;
  const inAfterFee = (amountOut * reserveIn) / (reserveOut - amountOut);
  return inAfterFee / (1 - feeRate);
}

export function curvePrice(c: CurveState): number {
  return c.virtualNative / c.virtualTokens;
}

export function poolPrice(p: PoolState): number {
  return p.tokens > 0 ? p.native / p.tokens : 0;
}

/** Fraction of the curve sold, 0..1. `initialRealTokens` is the launch-time real token reserve. */
export function curveProgress(c: CurveState, initialRealTokens: number): number {
  if (initialRealTokens <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - c.realTokens / initialRealTokens));
}

/** Quote buying tokens on a bonding curve with `nativeIn` (fee inclusive). Pure; does not mutate. */
export function quoteCurveBuy(c: CurveState, nativeIn: number, feeRate: number): SwapResult {
  const priceBefore = curvePrice(c);
  let tokensOut = cpOut(nativeIn, c.virtualNative, c.virtualTokens, feeRate);
  let used = nativeIn;
  let completes = false;
  if (tokensOut >= c.realTokens) {
    tokensOut = c.realTokens;
    used = cpIn(tokensOut, c.virtualNative, c.virtualTokens, feeRate);
    completes = true;
  }
  const fee = used * feeRate;
  const vn = c.virtualNative + (used - fee);
  const vt = c.virtualTokens - tokensOut;
  const priceAfter = vt > 0 ? vn / vt : priceBefore;
  const exec = tokensOut > 0 ? used / tokensOut : priceBefore;
  return {
    amountIn: used,
    amountOut: tokensOut,
    venueFee: fee,
    priceBefore,
    priceAfter,
    executionPrice: exec,
    priceImpact: priceBefore > 0 ? Math.abs(exec - priceBefore) / priceBefore : 0,
    completesCurve: completes,
  };
}

/** Quote selling `tokensIn` into a bonding curve. Fee is taken from the native output. */
export function quoteCurveSell(c: CurveState, tokensIn: number, feeRate: number): SwapResult {
  const priceBefore = curvePrice(c);
  const grossOut = Math.min(cpOut(tokensIn, c.virtualTokens, c.virtualNative, 0), c.realNative);
  const fee = grossOut * feeRate;
  const nativeOut = grossOut - fee;
  const vn = c.virtualNative - grossOut;
  const vt = c.virtualTokens + tokensIn;
  const exec = tokensIn > 0 ? nativeOut / tokensIn : priceBefore;
  return {
    amountIn: tokensIn,
    amountOut: nativeOut,
    venueFee: fee,
    priceBefore,
    priceAfter: vt > 0 ? vn / vt : priceBefore,
    executionPrice: exec,
    priceImpact: priceBefore > 0 ? Math.abs(priceBefore - exec) / priceBefore : 0,
    completesCurve: false,
  };
}

/** Quote buying tokens from an AMM pool with `nativeIn` (fee inclusive). */
export function quotePoolBuy(p: PoolState, nativeIn: number, feeRate: number): SwapResult {
  const priceBefore = poolPrice(p);
  const out = cpOut(nativeIn, p.native, p.tokens, feeRate);
  const fee = nativeIn * feeRate;
  const n = p.native + nativeIn - fee;
  const t = p.tokens - out;
  const exec = out > 0 ? nativeIn / out : priceBefore;
  return {
    amountIn: nativeIn,
    amountOut: out,
    venueFee: fee,
    priceBefore,
    priceAfter: t > 0 ? n / t : priceBefore,
    executionPrice: exec,
    priceImpact: priceBefore > 0 ? Math.abs(exec - priceBefore) / priceBefore : 0,
    completesCurve: false,
  };
}

/** Quote selling `tokensIn` into an AMM pool. Fee is taken on the input side (standard AMM). */
export function quotePoolSell(p: PoolState, tokensIn: number, feeRate: number): SwapResult {
  const priceBefore = poolPrice(p);
  const out = cpOut(tokensIn, p.tokens, p.native, feeRate);
  const feeTokens = tokensIn * feeRate;
  const n = p.native - out;
  const t = p.tokens + tokensIn - feeTokens;
  const exec = tokensIn > 0 ? out / tokensIn : priceBefore;
  return {
    amountIn: tokensIn,
    amountOut: out,
    venueFee: feeTokens * priceBefore,
    priceBefore,
    priceAfter: t > 0 ? n / t : priceBefore,
    executionPrice: exec,
    priceImpact: priceBefore > 0 ? Math.abs(priceBefore - exec) / priceBefore : 0,
    completesCurve: false,
  };
}

/** Minimum acceptable output given slippage tolerance (ratio, e.g. 0.1 = 10%). */
export function minOutWithSlippage(expectedOut: number, slippage: number): number {
  return expectedOut * (1 - Math.min(Math.max(slippage, 0), 1));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
