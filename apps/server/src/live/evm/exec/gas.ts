// EIP-1559 fees per chain and speed preset, and gas limits.
//
// The app's three preset slots (P1 "Calm", P2 "Fast", P3 "Snipe") map to
// multipliers of the chain's current median priority fee (eth_feeHistory
// 50th percentile over the last blocks, eth_maxPriorityFeePerGas when the
// history is empty), clamped to a per-chain floor and cap. maxFeePerGas is
// 2 x base fee + tip (headroom for base-fee growth while the transaction
// waits), capped per chain: a base fee above the cap refuses the trade
// instead of overpaying. Measured on mainnet (Oct 2026): Base base fee ~0.005
// gwei / median tip 0.001 gwei; BNB Chain base fee 0 / 0.05 gwei minimum tip;
// Ethereum base fee ~0.17 gwei; Robinhood Chain (Arbitrum Orbit) ~0.02 gwei
// base fee and no priority ordering (FCFS sequencer), so its tip is 0.

import type { PresetId } from '@trenchscope/shared';
import { parseGwei, type PublicClient } from 'viem';
import type { EvmChainId } from '../chains';
import { EvmExecError } from './errors';

export interface ChainGasPolicy {
  /** Floor of the priority fee (wei per gas). */
  minPriorityFee: bigint;
  /** Cap of the priority fee (wei per gas). */
  maxPriorityFee: bigint;
  /** Cap of maxFeePerGas (wei per gas). */
  maxFeeCap: bigint;
  /** False on sequencer chains that ignore priority fees (Arbitrum Orbit). */
  priorityOrdering: boolean;
  /** Largest gas limit the engine will sign for one transaction. */
  gasLimitCap: bigint;
}

export const GAS_POLICY: Record<EvmChainId, ChainGasPolicy> = {
  base: { minPriorityFee: parseGwei('0.001'), maxPriorityFee: parseGwei('1'), maxFeeCap: parseGwei('5'), priorityOrdering: true, gasLimitCap: 6_000_000n },
  robinhood: { minPriorityFee: 0n, maxPriorityFee: 0n, maxFeeCap: parseGwei('5'), priorityOrdering: false, gasLimitCap: 8_000_000n },
  bsc: { minPriorityFee: parseGwei('0.05'), maxPriorityFee: parseGwei('5'), maxFeeCap: parseGwei('10'), priorityOrdering: true, gasLimitCap: 3_000_000n },
  eth: { minPriorityFee: parseGwei('0.01'), maxPriorityFee: parseGwei('50'), maxFeeCap: parseGwei('300'), priorityOrdering: true, gasLimitCap: 3_000_000n },
};

/** Priority-fee multiplier per preset slot, in percent of the median tip. */
export const SPEED_TIP_PERCENT: Record<PresetId, bigint> = { P1: 100n, P2: 150n, P3: 300n };

/** Gas limit = estimate x 1.2, at least the floor of the step kind, at most the chain cap. */
export const GAS_LIMIT_BUFFER_PERCENT = 120n;
export const GAS_LIMIT_FLOOR = { transfer: 21_000n, approve: 30_000n, call: 50_000n } as const;

export interface FeeSuggestion {
  baseFee: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  /** What the transaction is expected to pay per gas (base fee + tip). */
  expectedGasPrice: bigint;
}

export function computeFees(chain: EvmChainId, baseFee: bigint, medianTip: bigint, speed: PresetId): FeeSuggestion {
  const policy = GAS_POLICY[chain];
  let tip = (medianTip * SPEED_TIP_PERCENT[speed]) / 100n;
  if (!policy.priorityOrdering) tip = 0n;
  if (tip < policy.minPriorityFee) tip = policy.minPriorityFee;
  if (tip > policy.maxPriorityFee) tip = policy.maxPriorityFee;
  if (baseFee + tip > policy.maxFeeCap) {
    throw new EvmExecError('gas_price_cap', `${chain} base fee ${baseFee} + tip ${tip} exceeds the cap ${policy.maxFeeCap} wei/gas`, { baseFee, tip, cap: policy.maxFeeCap });
  }
  let maxFee = baseFee * 2n + tip;
  if (maxFee > policy.maxFeeCap) maxFee = policy.maxFeeCap;
  return { baseFee, maxPriorityFeePerGas: tip, maxFeePerGas: maxFee, expectedGasPrice: baseFee + tip };
}

/** Median of the non-zero rewards (wei) in an eth_feeHistory result, or null. */
export function medianReward(rewards: readonly (readonly bigint[])[] | undefined): bigint | null {
  const values = (rewards ?? []).map((r) => r[0]).filter((v): v is bigint => typeof v === 'bigint' && v > 0n);
  if (values.length === 0) return null;
  values.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return values[Math.floor(values.length / 2)];
}

/** Current fee suggestion for a chain and speed preset. */
export async function suggestFees(client: PublicClient, chain: EvmChainId, speed: PresetId): Promise<FeeSuggestion> {
  const [block, history] = await Promise.all([
    client.getBlock({ blockTag: 'latest' }),
    client.getFeeHistory({ blockCount: 5, rewardPercentiles: [50], blockTag: 'latest' }).catch(() => null),
  ]);
  const baseFee = block.baseFeePerGas ?? 0n;
  let tip = medianReward(history?.reward);
  if (tip === null && GAS_POLICY[chain].priorityOrdering) {
    tip = await client.estimateMaxPriorityFeePerGas().catch(() => GAS_POLICY[chain].minPriorityFee);
  }
  return computeFees(chain, baseFee, tip ?? 0n, speed);
}

export function gasLimitFor(chain: EvmChainId, estimate: bigint, floor: bigint): bigint {
  let limit = (estimate * GAS_LIMIT_BUFFER_PERCENT) / 100n;
  if (limit < floor) limit = floor;
  const cap = GAS_POLICY[chain].gasLimitCap;
  if (limit > cap) {
    if (estimate > cap) throw new EvmExecError('simulation_failed', `gas estimate ${estimate} exceeds the ${chain} cap ${cap}`, { estimate });
    limit = cap;
  }
  return limit;
}
