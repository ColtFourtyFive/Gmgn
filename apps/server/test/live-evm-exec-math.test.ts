import { describe, expect, it } from 'vitest';
import { parseGwei } from 'viem';
import { EvmExecError } from '../src/live/evm/exec/errors';
import { GAS_POLICY, computeFees, gasLimitFor, medianReward } from '../src/live/evm/exec/gas';
import {
  autoSlippageBps,
  bpsOf,
  feeOnInput,
  feeOnOutput,
  grossForNet,
  minOutAfterSlippage,
  percentOf,
  priceImpactBps,
  resolveSlippageBps,
} from '../src/live/evm/exec/math';
import { kyberSlippageFor } from '../src/live/evm/exec/kyber';

describe('slippage and minOut', () => {
  it('rounds minOut down', () => {
    expect(minOutAfterSlippage(1_000_000n, 100)).toBe(990_000n);
    expect(minOutAfterSlippage(999n, 1)).toBe(998n); // 999 * 0.9999 = 998.9001
    expect(minOutAfterSlippage(10n ** 24n, 5000)).toBe(5n * 10n ** 23n);
    expect(minOutAfterSlippage(123n, 0)).toBe(123n);
  });

  it('auto slippage is 2% + tax + 1.5x impact, clamped to 1%..50%', () => {
    expect(autoSlippageBps(0, 0)).toBe(200);
    expect(autoSlippageBps(100, 900)).toBe(200 + 900 + 150);
    expect(autoSlippageBps(10_000, 0)).toBe(5000);
    expect(resolveSlippageBps('auto', 40, 0)).toBe(260);
    expect(resolveSlippageBps(150, 9999, 9999)).toBe(150);
    expect(() => resolveSlippageBps(0, 0, 0)).toThrow(RangeError);
    expect(() => resolveSlippageBps(6000, 0, 0)).toThrow(RangeError);
  });

  it('kyber build slippage lands minReturn on our minOut', () => {
    const fresh = 1_000_000n;
    const minOut = 980_000n;
    const s = kyberSlippageFor(fresh, minOut);
    expect(s).toBe(200);
    expect(minOutAfterSlippage(fresh, s)).toBe(minOut);
    expect(kyberSlippageFor(minOut, minOut)).toBe(0);
  });
});

describe('platform fee math', () => {
  it('takes the fee off the input for buys', () => {
    expect(feeOnInput(10n ** 16n, 80)).toBe(8n * 10n ** 13n);
    expect(feeOnInput(1n, 80)).toBe(0n);
  });

  it('grossForNet inverts a PAY_PORTION fee exactly', () => {
    for (const bps of [1, 30, 80, 100, 300]) {
      for (const net of [0n, 1n, 7n, 12_345n, 10n ** 18n + 12_345n, 987_654_321_123n]) {
        const g = grossForNet(net, bps);
        expect(g - feeOnOutput(g, bps)).toBeGreaterThanOrEqual(net);
        if (g > 0n) expect(g - 1n - feeOnOutput(g - 1n, bps)).toBeLessThan(net);
      }
    }
    // the gross the fee was charged on, from what reached the wallet
    const gross = 1_234_567_890_123n;
    const net = gross - feeOnOutput(gross, 80);
    const back = grossForNet(net, 80);
    expect(back - feeOnOutput(back, 80)).toBe(net);
    expect(gross - back).toBeLessThanOrEqual(1n);
  });

  it('measures shares, impact and percentages', () => {
    expect(bpsOf(8n, 1000n)).toBe(80);
    expect(bpsOf(1n, 0n)).toBe(0);
    // rate halves vs the reference -> 50% impact
    expect(priceImpactBps(1000n, 500n, 10n, 10n)).toBe(5000);
    // better than the reference -> 0
    expect(priceImpactBps(1000n, 1200n, 10n, 10n)).toBe(0);
    expect(percentOf(1001n, 10_000n)).toBe(1001n);
    expect(percentOf(1001n, 5_000n)).toBe(500n);
  });
});

describe('gas', () => {
  it('maps preset slots to tip multipliers with per-chain floors and caps', () => {
    const base = parseGwei('0.005');
    const tip = parseGwei('0.001');
    const p1 = computeFees('base', base, tip, 'P1');
    const p2 = computeFees('base', base, tip, 'P2');
    const p3 = computeFees('base', base, tip, 'P3');
    expect(p1.maxPriorityFeePerGas).toBe(tip);
    expect(p2.maxPriorityFeePerGas).toBe((tip * 150n) / 100n);
    expect(p3.maxPriorityFeePerGas).toBe(tip * 3n);
    expect(p2.maxFeePerGas).toBe(base * 2n + p2.maxPriorityFeePerGas);
    expect(p2.expectedGasPrice).toBe(base + p2.maxPriorityFeePerGas);
  });

  it('pays no tip on Robinhood Chain (FCFS sequencer) and the 0.05 gwei minimum on BNB Chain', () => {
    const rh = computeFees('robinhood', parseGwei('0.0205'), parseGwei('1'), 'P3');
    expect(rh.maxPriorityFeePerGas).toBe(0n);
    expect(rh.maxFeePerGas).toBe(parseGwei('0.041'));
    const bsc = computeFees('bsc', 0n, 0n, 'P1');
    expect(bsc.maxPriorityFeePerGas).toBe(parseGwei('0.05'));
    expect(bsc.maxFeePerGas).toBe(parseGwei('0.05'));
  });

  it('caps maxFee and refuses a base fee above the cap', () => {
    const cap = GAS_POLICY.eth.maxFeeCap;
    const near = computeFees('eth', cap - parseGwei('1'), parseGwei('0.1'), 'P1');
    expect(near.maxFeePerGas).toBe(cap);
    expect(() => computeFees('eth', cap, parseGwei('1'), 'P1')).toThrow(EvmExecError);
  });

  it('buffers gas limits by 1.2x within floor and cap', () => {
    expect(gasLimitFor('base', 100_000n, 50_000n)).toBe(120_000n);
    expect(gasLimitFor('base', 10_000n, 21_000n)).toBe(21_000n);
    expect(gasLimitFor('bsc', 2_900_000n, 50_000n)).toBe(GAS_POLICY.bsc.gasLimitCap);
    expect(() => gasLimitFor('bsc', 3_100_000n, 50_000n)).toThrow(/exceeds/);
  });

  it('takes the median non-zero reward of the fee history', () => {
    expect(medianReward([[1n], [0n], [5n], [3n]])).toBe(3n);
    expect(medianReward([[0n], [0n]])).toBeNull();
    expect(medianReward(undefined)).toBeNull();
  });
});
