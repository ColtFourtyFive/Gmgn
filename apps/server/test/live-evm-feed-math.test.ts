// EVM feed maths: Uniswap TickMath / sqrtPrice pricing / liquidity amounts in
// exact bigint, the pool -> World reserves mapping, and the native USD price.
// Vectors are real mainnet values (Initialize events, slot0 reads).

import { describe, expect, it } from 'vitest';
import { v4PoolId, v4StateSlots } from '../src/live/evm/feed/abi';
import {
  amountsForLiquidity,
  cpAmountOut,
  MAX_SQRT_RATIO,
  MAX_TICK,
  MIN_SQRT_RATIO,
  MIN_TICK,
  priceFromReserves,
  priceFromSqrtX96,
  Q96,
  ratioToNumber,
  sqrtRatioAtTick,
  toSigned,
  toUnits,
  virtualReserves,
} from '../src/live/evm/feed/math';
import { applyV2Sync, applyV4Modify, newPool, poolPrice, v4Principal, worldReserves } from '../src/live/evm/feed/pools';
import { nativeUsdFromSqrtPrice, USD_REFERENCE_POOLS } from '../src/live/evm/price';

/** (sqrtPriceX96, tick) pairs from Uniswap V4 Initialize events on Robinhood Chain and Base. */
const INITIALIZE_VECTORS: [bigint, number][] = [
  [79228162514264337593543950336n, 0],
  [526364174002223567019744861584709n, 176037],
  [322131881520819634499027410058512n, 166216],
  [0x0000000000004e025e7c15b091427c95b68b5045n, 198050],
];

describe('TickMath', () => {
  it('matches the protocol bounds and tick 0', () => {
    expect(sqrtRatioAtTick(MIN_TICK)).toBe(MIN_SQRT_RATIO);
    expect(sqrtRatioAtTick(MAX_TICK)).toBe(MAX_SQRT_RATIO);
    expect(sqrtRatioAtTick(0)).toBe(Q96);
    expect(() => sqrtRatioAtTick(MAX_TICK + 1)).toThrow();
  });

  it('brackets real Initialize prices: sqrt(tick) <= sqrtPrice < sqrt(tick + 1)', () => {
    for (const [sqrt, tick] of INITIALIZE_VECTORS) {
      expect(sqrtRatioAtTick(tick) <= sqrt).toBe(true);
      expect(sqrt < sqrtRatioAtTick(tick + 1)).toBe(true);
    }
  });

  it('is monotonic and symmetric around tick 0', () => {
    let prev = 0n;
    for (let t = -50_000; t <= 50_000; t += 997) {
      const s = sqrtRatioAtTick(t);
      expect(s > prev).toBe(true);
      prev = s;
    }
    // sqrt(1.0001^-t) * sqrt(1.0001^t) ~ 1 (in Q96 x Q96)
    const prod = sqrtRatioAtTick(-12_345) * sqrtRatioAtTick(12_345);
    expect(ratioToNumber(prod, Q96 * Q96)).toBeCloseTo(1, 9);
  });
});

describe('prices', () => {
  it('prices the Robinhood WETH/USDG pool (WETH is token0) at its slot0', () => {
    // slot0 of 0x52e65b17... read on mainnet: $2433.22 per ETH.
    const usd = nativeUsdFromSqrtPrice(3908142506528483053749388n, USD_REFERENCE_POOLS.robinhood);
    expect(usd).toBeCloseTo(2433.2213329, 5);
    expect(priceFromSqrtX96(3908142506528483053749388n, true, 18, 6)).toBeCloseTo(usd, 9);
  });

  it('inverts the pair when the token is currency1 and scales decimals', () => {
    const sqrt = sqrtRatioAtTick(-60_000); // token1 per token0 = 1.0001^-60000
    const p0 = priceFromSqrtX96(sqrt, true, 18, 18);
    const p1 = priceFromSqrtX96(sqrt, false, 18, 18);
    expect(p0 * p1).toBeCloseTo(1, 9);
    expect(p0).toBeCloseTo(1.0001 ** -60_000, 9);
    // a 6-decimal token is worth 1e12 more native per whole token
    expect(priceFromSqrtX96(sqrt, true, 6, 18) / p0).toBeCloseTo(1e-12, 20);
    expect(priceFromReserves(5n * 10n ** 18n, 200_000_000n * 10n ** 18n, 18, 18)).toBeCloseTo(2.5e-8, 20);
  });

  it('converts raw amounts and ratios at full precision', () => {
    expect(toUnits(1_234_567_890_123_456_789n, 18)).toBeCloseTo(1.234567890123456789, 15);
    expect(toUnits(10n ** 27n, 18)).toBe(1e9);
    expect(ratioToNumber(1n, 3n)).toBeCloseTo(1 / 3, 15);
    expect(ratioToNumber(-(10n ** 40n), 7n)).toBeCloseTo(-(1e40 / 7), -25);
    expect(toSigned((1n << 128n) - 5n, 128)).toBe(-5n);
    expect(toSigned(5n, 128)).toBe(5n);
  });

  it('V2 getAmountOut matches the 0.25% fee swaps measured on the Robinhood Pancake fork', () => {
    // in 0.0835 ETH against 6.9189797 ETH / 307,036,752 tokens: the fee-free quote is strictly larger
    const out25 = cpAmountOut(83_422_789_311_885_415n, 6_918_979_700_000_000_000n, 307_036_752n * 10n ** 18n, 25n);
    const out0 = cpAmountOut(83_422_789_311_885_415n, 6_918_979_700_000_000_000n, 307_036_752n * 10n ** 18n, 0n);
    expect(out25 < out0).toBe(true);
    expect(Number(out0 - out25) / Number(out0)).toBeCloseTo(0.0025, 3);
  });
});

describe('liquidity', () => {
  it('a single-sided position above the price holds only token0; below only token1', () => {
    const a = sqrtRatioAtTick(1000);
    const b = sqrtRatioAtTick(2000);
    const L = 10n ** 24n;
    expect(amountsForLiquidity(sqrtRatioAtTick(0), a, b, L).amount1).toBe(0n);
    expect(amountsForLiquidity(sqrtRatioAtTick(3000), a, b, L).amount0).toBe(0n);
    const inside = amountsForLiquidity(sqrtRatioAtTick(1500), a, b, L);
    expect(inside.amount0 > 0n && inside.amount1 > 0n).toBe(true);
  });

  it('virtual reserves reproduce the pool price', () => {
    const sqrt = sqrtRatioAtTick(-200_000);
    const v = virtualReserves(sqrt, 10n ** 22n);
    expect(ratioToNumber(v.amount1, v.amount0)).toBeCloseTo(priceFromSqrtX96(sqrt, true, 18, 18), 6);
  });
});

describe('pool -> World reserves', () => {
  it('a V2 pair maps to its exact reserves', () => {
    const p = newPool({ kind: 'v2', id: '0xpair', dex: 'pancake-v2-robinhood', token: '0xt', quote: '0xw', tokenIsCurrency0: false, tokenDecimals: 18, feeRate: 0.0025, hooks: null, createdAt: 0 });
    // Flap's graduation Mint on Robinhood: 5 ETH + 200M tokens (WETH is token0 there).
    applyV2Sync(p, 5n * 10n ** 18n, 200_000_000n * 10n ** 18n);
    const r = worldReserves(p)!;
    expect(r.native).toBe(5);
    expect(r.tokens).toBe(200_000_000);
    expect(r.priceNative).toBeCloseTo(2.5e-8, 20);
  });

  it('a V4 launch position is valued at its principal: native side = half the pool value', () => {
    // Pools.trade instant launch (GemCat, Robinhood): ETH is currency0, the token currency1; the whole
    // 1B supply sits in [-160100, 198050] with the price at the top (buys move the tick down).
    const tickLower = -160_100;
    const tickUpper = 198_050;
    const p = newPool({ kind: 'v4', id: '0xid', dex: 'uniswap-v4-robinhood', token: '0xt', quote: '0x0', tokenIsCurrency0: false, tokenDecimals: 18, feeRate: 0.0025, hooks: null, createdAt: 0 });
    p.positions = new Map();
    p.sqrtPriceX96 = 0x0000000000004e025e7c15b091427c95b68b5045n;
    p.tick = 198_050;
    applyV4Modify(p, tickLower, tickUpper, 50_074_188_046_840_591_947_412n);
    const held = v4Principal(p)!;
    // all of the supply, no ETH yet
    expect(toUnits(held.token, 18)).toBeGreaterThan(999_999_999);
    expect(held.native).toBe(0n);
    const r = worldReserves(p)!;
    expect(r.priceNative).toBeCloseTo(poolPrice(p), 20);
    // FDV in ETH = supply x price; pool value = token side; native = half of it
    expect(r.native).toBeCloseTo((toUnits(held.token, 18) * r.priceNative) / 2, 6);
    expect(r.tokens * r.priceNative).toBeCloseTo(r.native, 9);
  });

  it('without position history falls back to the in-range liquidity', () => {
    const p = newPool({ kind: 'v4', id: '0xid', dex: 'uniswap-v4-base', token: '0xt', quote: '0x0', tokenIsCurrency0: false, tokenDecimals: 18, feeRate: 0.01, hooks: null, createdAt: 0 });
    p.sqrtPriceX96 = sqrtRatioAtTick(200_000);
    p.liquidity = 10n ** 21n;
    const r = worldReserves(p)!;
    expect(r.native).toBeCloseTo(toUnits(virtualReserves(p.sqrtPriceX96, p.liquidity).amount0, 18), 6);
  });
});

describe('V4 ids', () => {
  it('derives the PoolId of a Pons graduation pool and its PoolManager state slots', () => {
    // Observed on mainnet: ETH / 0xb11384a6... fee 0, tick spacing 200, PonsV2MemeHook.
    const id = v4PoolId({
      currency0: '0x0000000000000000000000000000000000000000',
      currency1: '0xb11384a6ac2b3708e3d25a834c8a88687accbcd1',
      fee: 0,
      tickSpacing: 200,
      hooks: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
    });
    expect(id).toBe('0x089ada66d5258297e1cab1516708a9fb1aef166df3ee901a75f3f2c7f7e79202');
    const slots = v4StateSlots(id);
    expect(BigInt(slots.liquidity) - BigInt(slots.slot0)).toBe(3n);
  });
});

