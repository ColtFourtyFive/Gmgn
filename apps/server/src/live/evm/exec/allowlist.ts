// Allow-list of contracts the engine may send calldata to or approve, per
// chain. Every plan is validated against it right before simulation and again
// before signing: calldata only goes to allow-listed routers / launchpads, an
// approve() only names an allow-listed spender for an exact (never infinite)
// amount, Permit2 allowances only go to the Universal Router with a short
// expiry, and fee transfers are plain value transfers to the fee wallet.
//
// Pons v2 curves are one contract per token, so they cannot be listed ahead of
// time: a curve is accepted only when the Pons factory's own record for the
// token names it (PonsVenue.verifyCurve), checked at quote time and again at
// prepare time.

import { decodeFunctionData, isAddressEqual, maxUint160, maxUint256, type Address, type Hex } from 'viem';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { erc20Abi, permit2Abi } from './abis';
import { EVM_VENUES } from './contracts';
import { EvmExecError } from './errors';
import type { EvmTxPlan } from './types';

/** Longest Permit2 allowance the engine grants (the swap follows immediately). */
export const PERMIT2_MAX_EXPIRY_SECONDS = 30 * 60;

export interface ChainAllowlist {
  /** Contracts that may receive swap calldata (label for logs / policies). */
  swapTargets: Map<string, string>;
  /** Contracts that may be named as ERC-20 approve() spenders. */
  spenders: Map<string, string>;
  /** Spenders a Permit2 allowance may be granted to. */
  permit2Spenders: Map<string, string>;
  permit2: Address;
}

const lower = (a: Address) => a.toLowerCase();

export function chainAllowlist(chain: EvmChainId): ChainAllowlist {
  const v = EVM_VENUES[chain];
  const info = EVM_CHAINS[chain];
  const swapTargets = new Map<string, string>();
  const spenders = new Map<string, string>();
  const permit2Spenders = new Map<string, string>();
  const add = (m: Map<string, string>, a: Address | null | undefined, label: string) => {
    if (a) m.set(lower(a), label);
  };
  if (v.uniswap) {
    add(swapTargets, v.uniswap.universalRouter, `Uniswap Universal Router ${v.uniswap.universalRouterVersion}`);
    add(permit2Spenders, v.uniswap.universalRouter, 'Uniswap Universal Router');
    add(spenders, info.permit2, 'Permit2');
  }
  add(swapTargets, v.kyberRouter, 'KyberSwap MetaAggregationRouterV2');
  add(spenders, v.kyberRouter, 'KyberSwap MetaAggregationRouterV2');
  if (v.fourMeme) {
    add(swapTargets, v.fourMeme.tokenManager2, 'four.meme TokenManager2');
    add(spenders, v.fourMeme.tokenManager2, 'four.meme TokenManager2');
    add(swapTargets, v.fourMeme.helper3, 'four.meme TokenManagerHelper3');
    add(spenders, v.fourMeme.helper3, 'four.meme TokenManagerHelper3');
  }
  add(swapTargets, v.flapPortal, 'Flap portal');
  add(spenders, v.flapPortal, 'Flap portal');
  if (v.pancakeV2) {
    add(swapTargets, v.pancakeV2.router, 'PancakeSwap v2 router');
    add(spenders, v.pancakeV2.router, 'PancakeSwap v2 router');
  }
  return { swapTargets, spenders, permit2Spenders, permit2: info.permit2 };
}

/** Every contract an account wallet may call on a chain (for signer policies): swap targets + Permit2. */
export function allowlistedTargets(chain: EvmChainId): Address[] {
  const a = chainAllowlist(chain);
  const targets = new Set<string>([...a.swapTargets.keys(), ...(a.permit2Spenders.size > 0 ? [lower(a.permit2)] : [])]);
  return [...targets] as Address[];
}

export interface PlanValidationContext {
  feeWallet: Address | null;
  /** Per-token contracts verified on-chain for this plan (Pons curve), accepted as swap target and spender. */
  verifiedTargets: Address[];
  nowSeconds: number;
}

function fail(message: string, detail: Record<string, unknown> = {}): never {
  throw new EvmExecError('not_allowlisted', message, detail);
}

/** Throws not_allowlisted unless every step of the plan is allowed. */
export function validatePlan(plan: EvmTxPlan, ctx: PlanValidationContext): void {
  const allow = chainAllowlist(plan.chain);
  const verified = new Set(ctx.verifiedTargets.map(lower));
  const isTarget = (a: Address) => allow.swapTargets.has(lower(a)) || verified.has(lower(a));
  const isSpender = (a: Address) => allow.spenders.has(lower(a)) || verified.has(lower(a));
  for (const step of plan.steps) {
    switch (step.kind) {
      case 'approve': {
        if (!isAddressEqual(step.to, plan.quote.token)) fail(`approval targets ${step.to}, not the traded token`, { step: step.kind });
        if (step.value !== 0n) fail('approval carries value');
        const call = decodeApprove(step.data);
        if (!isSpender(call.spender)) fail(`spender ${call.spender} is not allow-listed on ${plan.chain}`, { spender: call.spender });
        if (call.amount === maxUint256 || call.amount <= 0n) fail('approvals must be for an exact, non-zero amount', { amount: call.amount });
        break;
      }
      case 'permit2-approve': {
        if (!isAddressEqual(step.to, allow.permit2)) fail(`Permit2 step targets ${step.to}`);
        if (step.value !== 0n) fail('Permit2 approval carries value');
        const call = decodeFunctionData({ abi: permit2Abi, data: step.data });
        if (call.functionName !== 'approve') fail(`unexpected Permit2 call ${call.functionName}`);
        const [token, spender, amount, expiration] = call.args;
        if (!isAddressEqual(token, plan.quote.token)) fail('Permit2 allowance for another token');
        if (!allow.permit2Spenders.has(lower(spender))) fail(`Permit2 spender ${spender} is not allow-listed on ${plan.chain}`, { spender });
        if (amount >= maxUint160 || amount <= 0n) fail('Permit2 allowance must be an exact, non-zero amount', { amount });
        if (Number(expiration) > ctx.nowSeconds + PERMIT2_MAX_EXPIRY_SECONDS + 60) fail('Permit2 allowance expiry too far out', { expiration });
        break;
      }
      case 'fee': {
        if (!ctx.feeWallet || !isAddressEqual(step.to, ctx.feeWallet)) fail(`fee transfer to ${step.to}, not the fee wallet`);
        if (step.data !== '0x') fail('fee transfer carries calldata');
        break;
      }
      case 'swap': {
        if (!isTarget(step.to)) fail(`swap target ${step.to} is not allow-listed on ${plan.chain}`, { to: step.to });
        break;
      }
      case 'transfer':
        fail('plans do not carry transfers (withdrawals are built by the transfers module)');
    }
  }
  if (plan.steps.filter((s) => s.kind === 'swap').length !== 1) fail('a plan must contain exactly one swap');
  if (plan.steps.filter((s) => s.kind === 'fee').length > 1) fail('a plan must not charge the platform fee twice');
}

export function decodeApprove(data: Hex): { spender: Address; amount: bigint } {
  const call = decodeFunctionData({ abi: erc20Abi, data });
  if (call.functionName !== 'approve') throw new EvmExecError('not_allowlisted', `expected approve(), got ${call.functionName}`);
  const [spender, amount] = call.args as readonly [Address, bigint];
  return { spender, amount };
}
