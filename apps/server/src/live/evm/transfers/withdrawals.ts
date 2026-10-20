// Withdrawals of native and ERC-20 balances from account wallets: build,
// simulate, send (through the engine's per-wallet queue and nonce manager, so
// a withdrawal never races a trade for a nonce), track — producing the shared
// WalletTransfer record. The destination must already have passed the
// account's checks (2FA + activated whitelist entry: AccountsApi.canWithdrawTo);
// this module only guarantees the transaction is exactly a plain transfer of
// the requested amount to that destination.

import { randomUUID } from 'node:crypto';
import { decodeFunctionData, encodeFunctionData, formatUnits, getAddress, isAddress, isAddressEqual, type Address, type Hex, type TransactionReceipt } from 'viem';
import type { WalletTransfer } from '@trenchscope/shared';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { erc20Abi } from '../exec/abis';
import type { EvmExecEngine, EvmSendSigner } from '../exec/engine';
import { EvmExecError, errorText } from '../exec/errors';
import { GAS_LIMIT_BUFFER_PERCENT } from '../exec/gas';
import { gasPaidOf } from '../exec/receipt';
import { netTransfer, simulateCalls, tokenBalance, tokenInfo } from '../exec/rpc';
import type { EvmPlanStep } from '../exec/types';

export interface EvmWithdrawalRequest {
  chain: EvmChainId;
  from: Address;
  to: Address;
  /** null = native. */
  token: Address | null;
  /** Base units (wei / token units). */
  amount: bigint;
}

export interface EvmWithdrawalPlan {
  id: string;
  chain: EvmChainId;
  from: Address;
  to: Address;
  token: Address | null;
  symbol: string;
  decimals: number;
  amount: bigint;
  step: EvmPlanStep;
  createdAt: number;
}

export interface EvmWithdrawalSimulation {
  ok: boolean;
  gasUsed: bigint;
  /** What the destination receives (fee-on-transfer tokens deliver less than `amount`). */
  received: bigint | null;
  error: string | null;
}

/** Gas a plain native transfer to an EOA uses. */
const NATIVE_TRANSFER_GAS = 21_000n;
/** Gas assumed for an ERC-20 transfer before it is simulated. */
const ERC20_TRANSFER_GAS = 80_000n;
/** OP Stack chains charge an L1 data fee on top of gas: keep this much back on "max" withdrawals. */
const L1_FEE_RESERVE: Partial<Record<EvmChainId, bigint>> = { base: 10n ** 12n };

export class EvmWithdrawals {
  constructor(
    private readonly engine: EvmExecEngine,
    private readonly now: () => number = Date.now,
  ) {}

  /** Native wei a wallet can withdraw in one transfer, gas (and the L1 data fee) kept back. */
  async maxNative(chain: EvmChainId, from: Address): Promise<bigint> {
    const client = this.engine.read(chain);
    const [balance, fees] = await Promise.all([client.getBalance({ address: from }), this.engine.fees(chain, 'P2')]);
    const reserve = (NATIVE_TRANSFER_GAS * fees.maxFeePerGas * GAS_LIMIT_BUFFER_PERCENT) / 100n + (L1_FEE_RESERVE[chain] ?? 0n);
    return balance > reserve ? balance - reserve : 0n;
  }

  async build(req: EvmWithdrawalRequest): Promise<EvmWithdrawalPlan> {
    if (!isAddress(req.to) || !isAddress(req.from)) throw new EvmExecError('invalid_intent', 'withdrawal addresses must be valid');
    if (isAddressEqual(req.to, req.from)) throw new EvmExecError('invalid_intent', 'cannot withdraw to the same wallet');
    if (req.amount <= 0n) throw new EvmExecError('invalid_intent', 'amount must be positive');
    const client = this.engine.read(req.chain);
    const from = getAddress(req.from);
    const to = getAddress(req.to);
    const [native, fees] = await Promise.all([client.getBalance({ address: from }), this.engine.fees(req.chain, 'P2')]);
    if (req.token === null) {
      const gas = (NATIVE_TRANSFER_GAS * fees.maxFeePerGas * GAS_LIMIT_BUFFER_PERCENT) / 100n + (L1_FEE_RESERVE[req.chain] ?? 0n);
      if (native < req.amount + gas) throw new EvmExecError('insufficient_funds', `balance ${native} below ${req.amount} + gas ${gas}`, { balance: native });
      return {
        id: randomUUID(),
        chain: req.chain,
        from,
        to,
        token: null,
        symbol: EVM_CHAINS[req.chain].viem.nativeCurrency.symbol,
        decimals: 18,
        amount: req.amount,
        step: { kind: 'transfer', to, data: '0x', value: req.amount, description: `withdraw ${req.amount} wei to ${to}`, timing: 'swap', gasEstimate: NATIVE_TRANSFER_GAS },
        createdAt: this.now(),
      };
    }
    const token = getAddress(req.token);
    const [info, held] = await Promise.all([tokenInfo(client, token), tokenBalance(client, token, from)]);
    if (held < req.amount) throw new EvmExecError('insufficient_token_balance', `token balance ${held} below ${req.amount}`, { balance: held });
    if (native < ERC20_TRANSFER_GAS * fees.maxFeePerGas) throw new EvmExecError('insufficient_funds', 'not enough native balance for gas');
    return {
      id: randomUUID(),
      chain: req.chain,
      from,
      to,
      token,
      symbol: info.symbol,
      decimals: info.decimals,
      amount: req.amount,
      step: { kind: 'transfer', to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, req.amount] }), value: 0n, description: `withdraw ${req.amount} ${info.symbol} to ${to}`, timing: 'swap' },
      createdAt: this.now(),
    };
  }

  async simulate(plan: EvmWithdrawalPlan): Promise<EvmWithdrawalSimulation> {
    assertWithdrawalShape(plan);
    try {
      const [r] = await simulateCalls(this.engine.read(plan.chain), [{ from: plan.from, to: plan.step.to, data: plan.step.data, value: plan.step.value }]);
      if (r.ok) plan.step.gasEstimate = r.gasUsed;
      const received = plan.token ? netTransfer(r.logs, plan.token, plan.to) : plan.amount;
      return { ok: r.ok, gasUsed: r.gasUsed, received: r.ok ? received : null, error: r.error };
    } catch (err) {
      return { ok: false, gasUsed: 0n, received: null, error: errorText(err) };
    }
  }

  /** Sign, send and wait; returns the confirmed (or failed) transfer record. */
  async send(plan: EvmWithdrawalPlan, signer: EvmSendSigner): Promise<WalletTransfer> {
    assertWithdrawalShape(plan);
    if (!isAddressEqual(signer.ref.address, plan.from)) throw new EvmExecError('signer_error', 'the signer wallet is not the withdrawal source');
    const sim = await this.simulate(plan);
    if (!sim.ok) throw new EvmExecError('simulation_failed', `withdrawal reverts: ${sim.error}`);
    const { tx, receipt } = await this.engine.sendTransaction(plan.chain, plan.step, signer);
    return this.toTransfer(plan, tx.hash, receipt);
  }

  /** Re-read a withdrawal's outcome (after a restart, for transfers left 'sent'). */
  async track(plan: Pick<EvmWithdrawalPlan, 'id' | 'chain' | 'to' | 'token' | 'symbol' | 'decimals' | 'amount' | 'createdAt'>, hash: Hex): Promise<WalletTransfer> {
    const receipt = await this.engine.read(plan.chain).getTransactionReceipt({ hash }).catch(() => null);
    if (!receipt) return this.record(plan, hash, 'sent', 0n, null);
    return this.toTransfer(plan, hash, receipt);
  }

  private toTransfer(plan: Pick<EvmWithdrawalPlan, 'id' | 'chain' | 'to' | 'token' | 'symbol' | 'decimals' | 'amount' | 'createdAt'>, hash: Hex, receipt: TransactionReceipt): WalletTransfer {
    const ok = receipt.status === 'success';
    return this.record(plan, hash, ok ? 'confirmed' : 'failed', gasPaidOf(receipt), ok ? null : 'transaction reverted');
  }

  private record(plan: Pick<EvmWithdrawalPlan, 'id' | 'chain' | 'to' | 'token' | 'symbol' | 'decimals' | 'amount' | 'createdAt'>, hash: Hex, status: WalletTransfer['status'], gasPaid: bigint, error: string | null): WalletTransfer {
    return {
      id: plan.id,
      chain: plan.chain,
      direction: 'withdrawal',
      mint: plan.token,
      symbol: plan.symbol,
      amount: Number(formatUnits(plan.amount, plan.decimals)),
      counterparty: plan.to,
      signature: hash,
      status,
      ...(error ? { error } : {}),
      networkFee: Number(formatUnits(gasPaid, 18)),
      createdAt: plan.createdAt,
      confirmedAt: status === 'confirmed' || status === 'failed' ? this.now() : null,
    };
  }
}

/** A withdrawal transaction is exactly a value transfer to `to`, or token.transfer(to, amount). */
export function assertWithdrawalShape(plan: EvmWithdrawalPlan): void {
  const s = plan.step;
  if (s.kind !== 'transfer') throw new EvmExecError('not_allowlisted', 'not a withdrawal step');
  if (plan.token === null) {
    if (!isAddressEqual(s.to, plan.to) || s.data !== '0x' || s.value !== plan.amount) throw new EvmExecError('not_allowlisted', 'native withdrawal must be a plain transfer of the amount to the destination');
    return;
  }
  if (!isAddressEqual(s.to, plan.token) || s.value !== 0n) throw new EvmExecError('not_allowlisted', 'token withdrawal must call the token without value');
  const call = decodeFunctionData({ abi: erc20Abi, data: s.data });
  if (call.functionName !== 'transfer') throw new EvmExecError('not_allowlisted', 'token withdrawal must be transfer()');
  const [to, amount] = call.args as readonly [Address, bigint];
  if (!isAddressEqual(to, plan.to) || amount !== plan.amount) throw new EvmExecError('not_allowlisted', 'token withdrawal does not match the request');
}
