// Exact on-chain math for the EVM feed: fixed-point Uniswap prices and
// liquidity amounts in bigint, converted to floats only at the World boundary.

export const Q96 = 1n << 96n;
export const Q192 = 1n << 192n;

/** Uniswap tick bounds and the sqrt prices at them (TickMath). */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

function bitLength(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length;
}

/** num / den as a float with full double precision, for any bigint magnitudes. */
export function ratioToNumber(num: bigint, den: bigint): number {
  if (den === 0n) return num === 0n ? 0 : Infinity;
  const neg = num < 0n !== den < 0n;
  let n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  if (n === 0n) return 0;
  // Scale so the integer quotient carries ~64 significant bits, then undo the scale in float space.
  const shift = bitLength(d) - bitLength(n) + 64;
  let q: bigint;
  if (shift >= 0) q = (n << BigInt(shift)) / d;
  else q = n / (d << BigInt(-shift));
  n = q;
  const v = Number(n) * 2 ** -shift;
  return neg ? -v : v;
}

const POW10: bigint[] = Array.from({ length: 78 }, (_v, i) => 10n ** BigInt(i));

export function pow10(decimals: number): bigint {
  return POW10[decimals] ?? 10n ** BigInt(decimals);
}

/** A raw on-chain amount in human units (e.g. wei -> ETH). */
export function toUnits(raw: bigint, decimals: number): number {
  return ratioToNumber(raw, pow10(decimals));
}

/** sqrt(1.0001^tick) * 2^96, exactly as Uniswap's TickMath.getSqrtRatioAtTick. */
export function sqrtRatioAtTick(tick: number): bigint {
  const absTick = BigInt(Math.abs(tick));
  if (absTick > BigInt(MAX_TICK)) throw new RangeError(`tick ${tick} out of range`);
  let ratio = (absTick & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  const steps: [bigint, bigint][] = [
    [0x2n, 0xfff97272373d413259a46990580e213an],
    [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000n, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [bit, mul] of steps) if ((absTick & bit) !== 0n) ratio = (ratio * mul) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/**
 * Price of the token in the native asset (human units) from a pool's sqrtPriceX96.
 * Uniswap prices token1 in token0: raw P = (sqrtP / 2^96)^2 token1 per token0.
 */
export function priceFromSqrtX96(sqrtPriceX96: bigint, tokenIsCurrency0: boolean, tokenDecimals: number, nativeDecimals: number): number {
  if (sqrtPriceX96 <= 0n) return 0;
  const sq = sqrtPriceX96 * sqrtPriceX96;
  // native per token (raw): token0 -> P = sq / 2^192; token1 -> 1 / P = 2^192 / sq
  const raw = tokenIsCurrency0 ? ratioToNumber(sq, Q192) : ratioToNumber(Q192, sq);
  return raw * 10 ** (tokenDecimals - nativeDecimals);
}

/** Native per token (human units) from constant-product reserves. */
export function priceFromReserves(nativeRaw: bigint, tokenRaw: bigint, tokenDecimals: number, nativeDecimals: number): number {
  if (tokenRaw <= 0n) return 0;
  return ratioToNumber(nativeRaw, tokenRaw) * 10 ** (tokenDecimals - nativeDecimals);
}

/** Token amounts of `liquidity` over [sqrtA, sqrtB) at the current price (Uniswap SqrtPriceMath, rounded down). */
export function amountsForLiquidity(sqrtP: bigint, sqrtA: bigint, sqrtB: bigint, liquidity: bigint): { amount0: bigint; amount1: bigint } {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  if (liquidity <= 0n || sqrtA === sqrtB) return { amount0: 0n, amount1: 0n };
  const amount0For = (lo: bigint, hi: bigint) => ((liquidity << 96n) * (hi - lo)) / hi / lo;
  const amount1For = (lo: bigint, hi: bigint) => (liquidity * (hi - lo)) / Q96;
  if (sqrtP <= sqrtA) return { amount0: amount0For(sqrtA, sqrtB), amount1: 0n };
  if (sqrtP < sqrtB) return { amount0: amount0For(sqrtP, sqrtB), amount1: amount1For(sqrtA, sqrtP) };
  return { amount0: 0n, amount1: amount1For(sqrtA, sqrtB) };
}

/** Constant-product reserves equivalent to the in-range liquidity (x = L / sqrtP, y = L * sqrtP). */
export function virtualReserves(sqrtP: bigint, liquidity: bigint): { amount0: bigint; amount1: bigint } {
  if (sqrtP <= 0n || liquidity <= 0n) return { amount0: 0n, amount1: 0n };
  return { amount0: (liquidity * Q96) / sqrtP, amount1: (liquidity * sqrtP) / Q96 };
}

/** Constant-product output for an exact input (Uniswap V2 getAmountOut with a fee in bps). */
export function cpAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inWithFee = amountIn * (10_000n - feeBps);
  return (inWithFee * reserveOut) / (reserveIn * 10_000n + inWithFee);
}

/** Two's-complement decode of a signed integer word. */
export function toSigned(value: bigint, bits: number): bigint {
  const half = 1n << BigInt(bits - 1);
  const full = 1n << BigInt(bits);
  const v = value & (full - 1n);
  return v >= half ? v - full : v;
}

export function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}
