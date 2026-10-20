// Helpers shared by the venues: platform fee split and timing, approval and
// fee steps, quoting placeholders.

import { type Address, type Hex } from 'viem';
import { encodeApprove, tokenAllowance } from '../rpc';
import { feeOnInput, feeOnOutput } from '../math';
import type { EvmPlanStep, PlatformFeeMode } from '../types';
import type { QuoteInput, VenueEnv } from './types';

/** Never-used address standing in for the wallet when a buy is quoted without one (funded by state override). */
export const QUOTE_PLACEHOLDER: Address = '0x7472656E636873636f70652D71756F7465000001';

/** Extra native balance given to the simulated wallet on buys (gas money with validation off). */
export const SIM_EXTRA_BALANCE = 10n ** 18n;

/** Native kept back when deciding whether a sell can prepay its fee (gas for the fee transfer and the sell). */
export const PREPAY_GAS_RESERVE: Record<string, bigint> = { base: 10n ** 13n, robinhood: 10n ** 13n, bsc: 2n * 10n ** 14n, eth: 2n * 10n ** 15n };

export function feeActive(env: VenueEnv): boolean {
  return env.feeWallet !== null && env.feeBps > 0;
}

/** Buys: the platform fee comes off the input; the venue gets the rest. */
export function splitBuyFee(env: VenueEnv, amountIn: bigint): { fee: bigint; venueIn: bigint } {
  const fee = feeActive(env) ? feeOnInput(amountIn, env.feeBps) : 0n;
  return { fee, venueIn: amountIn - fee };
}

export function sellFee(env: VenueEnv, grossOut: bigint): bigint {
  return feeActive(env) ? feeOnOutput(grossOut, env.feeBps) : 0n;
}

/** Mode of a separately transferred fee: before the swap when affordable (or configured), else after it confirms. */
export function separateFeeMode(env: VenueEnv, input: QuoteInput, fee: bigint): PlatformFeeMode {
  if (!feeActive(env) || fee === 0n) return 'none';
  if (input.side === 'buy') return env.separateFeeTiming === 'after' ? 'separate-after' : 'separate-before';
  if (env.separateFeeTiming === 'after') return 'separate-after';
  const reserve = PREPAY_GAS_RESERVE[env.chain] ?? 0n;
  return input.nativeBalance !== null && input.nativeBalance >= fee + reserve ? 'separate-before' : 'separate-after';
}

export function feeStep(env: VenueEnv, fee: bigint, mode: PlatformFeeMode): EvmPlanStep | null {
  if ((mode !== 'separate-before' && mode !== 'separate-after') || fee <= 0n || !env.feeWallet) return null;
  return {
    kind: 'fee',
    to: env.feeWallet,
    data: '0x',
    value: fee,
    description: `platform fee ${fee} wei to the fee wallet`,
    timing: mode === 'separate-before' ? 'before-swap' : 'after-swap',
  };
}

export function swapStep(to: Address, data: Hex, value: bigint, description: string): EvmPlanStep {
  return { kind: 'swap', to, data, value, description, timing: 'swap' };
}

/** An exact-amount approve() when the current allowance does not cover `amount` (never infinite). */
export async function approvalStep(env: VenueEnv, token: Address, owner: Address, spender: Address, amount: bigint, label: string): Promise<EvmPlanStep | null> {
  const allowance = await tokenAllowance(env.client, token, owner, spender);
  if (allowance >= amount) return null;
  return { kind: 'approve', to: token, data: encodeApprove(spender, amount), value: 0n, description: `approve ${amount} to ${label}`, timing: 'before-swap' };
}

/** A reference input for price-impact probes: 1/1000 of the trade (at least 1 unit). */
export function referenceAmount(amount: bigint): bigint {
  const r = amount / 1000n;
  return r > 0n ? r : 1n;
}

/** Plan order: before-swap steps (fee, approvals), the swap, then after-swap steps. */
export function orderSteps(steps: EvmPlanStep[]): EvmPlanStep[] {
  const rank = { 'before-swap': 0, swap: 1, 'after-swap': 2 } as const;
  return [...steps].sort((a, b) => rank[a.timing] - rank[b.timing]);
}
