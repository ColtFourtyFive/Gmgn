// AMM pool state for the tokens the feed follows: Uniswap-V2-style pairs
// (reserves from Sync), V3 pools (sqrtPrice / liquidity from Swap, balances
// tracked by swap deltas over a balanceOf read) and V4 pools (sqrtPrice /
// liquidity from Swap, principal from the ModifyLiquidity positions seen since
// the pool's Initialize). The World gets each pool as constant-product
// reserves: the exact pool price, with the native side worth half the pool's
// value (true reserves for a V2 pair, value-equivalent ones for concentrated
// liquidity, so liquidity reads like a screener's).

import { amountsForLiquidity, priceFromReserves, priceFromSqrtX96, sqrtRatioAtTick, toUnits, virtualReserves } from './math';

export type PoolKind = 'v2' | 'v3' | 'v4';

export interface AmmPool {
  kind: PoolKind;
  /** Pair / pool address (V2, V3) or PoolId (V4), lowercase. */
  id: string;
  /** LIVE_DEXES id. */
  dex: string;
  token: string;
  /** The native side: wrapped native address, or the zero address for native ETH in V4. */
  quote: string;
  tokenIsCurrency0: boolean;
  tokenDecimals: number;
  /** LP fee ratio (the last swap's fee for dynamic-fee V4 pools). */
  feeRate: number;
  hooks: string | null;
  /** V2 reserves / V3 balances (raw). */
  reserveToken: bigint;
  reserveNative: bigint;
  sqrtPriceX96: bigint;
  /** Current tick (V3 / V4), for in-range liquidity changes. */
  tick: number;
  /** In-range liquidity (V3 / V4). */
  liquidity: bigint;
  /** V4 positions seen since Initialize: "lower:upper" -> liquidity; null when the history is unknown. */
  positions: Map<string, bigint> | null;
  /** V3: balances read (and kept by swap deltas). */
  balancesKnown: boolean;
  /** Share of the LP that is burned / permanently locked (launchpad pools: 1; unknown: 0). */
  lpBurnedRate: number;
  createdAt: number;
  lastSwapAt: number;
}

/** Positions kept per V4 pool before falling back to the in-range liquidity. */
const MAX_POSITIONS = 64;

export function newPool(
  p: Omit<AmmPool, 'reserveToken' | 'reserveNative' | 'sqrtPriceX96' | 'tick' | 'liquidity' | 'positions' | 'balancesKnown' | 'lastSwapAt' | 'lpBurnedRate'> &
    Partial<AmmPool>,
): AmmPool {
  return {
    reserveToken: 0n,
    reserveNative: 0n,
    sqrtPriceX96: 0n,
    tick: 0,
    liquidity: 0n,
    positions: null,
    balancesKnown: false,
    lpBurnedRate: 0,
    lastSwapAt: p.createdAt,
    ...p,
  };
}

/** Native per token (human units). */
export function poolPrice(p: AmmPool, nativeDecimals = 18): number {
  if (p.kind === 'v2') return priceFromReserves(p.reserveNative, p.reserveToken, p.tokenDecimals, nativeDecimals);
  return priceFromSqrtX96(p.sqrtPriceX96, p.tokenIsCurrency0, p.tokenDecimals, nativeDecimals);
}

/** Raw (token, native) amounts held by a V4 pool's known positions at the current price. */
export function v4Principal(p: AmmPool): { token: bigint; native: bigint } | null {
  if (!p.positions || p.sqrtPriceX96 <= 0n) return null;
  let a0 = 0n;
  let a1 = 0n;
  for (const [range, liq] of p.positions) {
    if (liq <= 0n) continue;
    const [lo, hi] = range.split(':').map(Number);
    const r = amountsForLiquidity(p.sqrtPriceX96, sqrtRatioAtTick(lo), sqrtRatioAtTick(hi), liq);
    a0 += r.amount0;
    a1 += r.amount1;
  }
  return p.tokenIsCurrency0 ? { token: a0, native: a1 } : { token: a1, native: a0 };
}

/**
 * The pool as constant-product reserves for the World (human units), or null
 * when it has no price yet.
 */
export function worldReserves(p: AmmPool, nativeDecimals = 18): { native: number; tokens: number; priceNative: number } | null {
  const price = poolPrice(p, nativeDecimals);
  if (!(price > 0) || !Number.isFinite(price)) return null;
  if (p.kind === 'v2') {
    const native = toUnits(p.reserveNative, nativeDecimals);
    const tokens = toUnits(p.reserveToken, p.tokenDecimals);
    return native > 0 && tokens > 0 ? { native, tokens, priceNative: price } : null;
  }
  let held: { token: bigint; native: bigint } | null = null;
  if (p.kind === 'v4') held = v4Principal(p);
  else if (p.balancesKnown) held = { token: p.reserveToken > 0n ? p.reserveToken : 0n, native: p.reserveNative > 0n ? p.reserveNative : 0n };
  if (!held || (held.token === 0n && held.native === 0n)) {
    // Unknown history: the in-range liquidity as constant-product reserves.
    const v = virtualReserves(p.sqrtPriceX96, p.liquidity);
    held = p.tokenIsCurrency0 ? { token: v.amount0, native: v.amount1 } : { token: v.amount1, native: v.amount0 };
    const native = toUnits(held.native, nativeDecimals);
    if (!(native > 0)) return null;
    return { native, tokens: native / price, priceNative: price };
  }
  const value = toUnits(held.native, nativeDecimals) + toUnits(held.token, p.tokenDecimals) * price;
  if (!(value > 0)) return null;
  const native = value / 2;
  return { native, tokens: native / price, priceNative: price };
}

export function applyV2Sync(p: AmmPool, reserve0: bigint, reserve1: bigint): void {
  if (p.tokenIsCurrency0) {
    p.reserveToken = reserve0;
    p.reserveNative = reserve1;
  } else {
    p.reserveToken = reserve1;
    p.reserveNative = reserve0;
  }
}

/** V3 swap: amounts are the pool's balance deltas. */
export function applyV3Swap(p: AmmPool, amount0: bigint, amount1: bigint, sqrtPriceX96: bigint, liquidity: bigint, tick: number): void {
  p.sqrtPriceX96 = sqrtPriceX96;
  p.liquidity = liquidity;
  p.tick = tick;
  if (p.balancesKnown) {
    const dToken = p.tokenIsCurrency0 ? amount0 : amount1;
    const dNative = p.tokenIsCurrency0 ? amount1 : amount0;
    p.reserveToken += dToken;
    p.reserveNative += dNative;
  }
}

/** V4 swap: price, tick and in-range liquidity after the swap; the LP fee in hundredths of a bip. */
export function applyV4Swap(p: AmmPool, sqrtPriceX96: bigint, liquidity: bigint, tick: number, fee: number): void {
  p.sqrtPriceX96 = sqrtPriceX96;
  p.liquidity = liquidity;
  p.tick = tick;
  if (fee >= 0 && fee < 1_000_000) p.feeRate = fee / 1_000_000;
}

/** A position change: kept per range, and in the in-range liquidity when it spans the current tick. */
export function applyV4Modify(p: AmmPool, tickLower: number, tickUpper: number, liquidityDelta: bigint): void {
  if (p.sqrtPriceX96 > 0n && tickLower <= p.tick && p.tick < tickUpper) {
    p.liquidity += liquidityDelta;
    if (p.liquidity < 0n) p.liquidity = 0n;
  }
  if (!p.positions) return;
  addRange(p.positions, tickLower, tickUpper, liquidityDelta);
  if (p.positions.size > MAX_POSITIONS) p.positions = null;
}

export function addRange(positions: Map<string, bigint>, tickLower: number, tickUpper: number, liquidityDelta: bigint): void {
  const key = `${tickLower}:${tickUpper}`;
  const next = (positions.get(key) ?? 0n) + liquidityDelta;
  if (next <= 0n) positions.delete(key);
  else positions.set(key, next);
}

/** Pools by id, with a token -> pool index (the token's main pool). */
export class PoolBook {
  private readonly byId = new Map<string, AmmPool>();
  private readonly byToken = new Map<string, AmmPool>();

  get size(): number {
    return this.byId.size;
  }

  get(id: string): AmmPool | undefined {
    return this.byId.get(id.toLowerCase());
  }

  forToken(token: string): AmmPool | undefined {
    return this.byToken.get(token.toLowerCase());
  }

  add(p: AmmPool): AmmPool {
    this.byId.set(p.id, p);
    this.byToken.set(p.token, p);
    return p;
  }

  /** Forget a token's pools. */
  removeToken(token: string): void {
    const p = this.byToken.get(token);
    this.byToken.delete(token);
    if (p) this.byId.delete(p.id);
    for (const [id, q] of this.byId) if (q.token === token) this.byId.delete(id);
  }

  ids(kind: PoolKind): string[] {
    const out: string[] = [];
    for (const p of this.byId.values()) if (p.kind === kind) out.push(p.id);
    return out;
  }

  values(): IterableIterator<AmmPool> {
    return this.byId.values();
  }
}
