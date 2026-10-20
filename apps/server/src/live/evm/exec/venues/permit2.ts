// Permit2 approvals for Universal Router sells: an exact ERC-20 approve() of
// the sell amount to Permit2, then a Permit2 allowance of the same amount to
// the Universal Router expiring shortly after the swap (both are ordinary
// signed transactions; no off-chain signatures are needed). The swap consumes
// both allowances, so nothing is left behind.

import { encodeFunctionData, type Address } from 'viem';
import { permit2Abi } from '../abis';
import { PERMIT2_MAX_EXPIRY_SECONDS } from '../allowlist';
import { encodeApprove, tokenAllowance } from '../rpc';
import type { EvmPlanStep } from '../types';
import type { VenueEnv } from './types';

/** Expiry given to Permit2 allowances (the swap is sent right after). */
export const PERMIT2_EXPIRY_SECONDS = 20 * 60;

export async function permit2Steps(env: VenueEnv, token: Address, owner: Address, spender: Address, amount: bigint): Promise<EvmPlanStep[]> {
  const permit2 = env.info.permit2;
  const nowSec = Math.floor(env.nowMs() / 1000);
  const [erc20Allowance, p2] = await Promise.all([
    tokenAllowance(env.client, token, owner, permit2),
    env.client.readContract({ address: permit2, abi: permit2Abi, functionName: 'allowance', args: [owner, token, spender] }),
  ]);
  const steps: EvmPlanStep[] = [];
  if (erc20Allowance < amount) {
    steps.push({ kind: 'approve', to: token, data: encodeApprove(permit2, amount), value: 0n, description: `approve ${amount} to Permit2`, timing: 'before-swap' });
  }
  const [p2Amount, p2Expiration] = p2;
  if (p2Amount < amount || p2Expiration <= nowSec + 60) {
    const expiration = nowSec + Math.min(PERMIT2_EXPIRY_SECONDS, PERMIT2_MAX_EXPIRY_SECONDS);
    steps.push({
      kind: 'permit2-approve',
      to: permit2,
      data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, spender, amount, expiration] }),
      value: 0n,
      description: `Permit2 allowance of ${amount} to the Universal Router until ${expiration}`,
      timing: 'before-swap',
    });
  }
  return steps;
}
