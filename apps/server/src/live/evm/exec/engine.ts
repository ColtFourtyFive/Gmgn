// The EVM execution engine: quote -> prepare -> simulate -> send -> track.
//
//   const engine = new EvmExecEngine({ config, clients });
//   const quote = await engine.quote({ chain: 'base', token, side: 'buy', amount: parseEther('0.05'),
//                                      amountKind: 'native', slippageBps: 'auto', speed: 'P2', antiMev: false });
//   const plan = await engine.prepare(quote, wallet);          // ordered unsigned txs, allow-listed
//   const sim = await engine.simulate(plan);                   // eth_simulateV1 of the whole plan
//   const result = await engine.send(plan, { ref, signer });   // serialized per wallet+chain, waits for the fill
//   // result.fill: exact token / native amounts, platform fee, gas paid, block, timestamp
//
// quote() routes the token (curves first, then pools) and prices the trade
// with every cost broken out; prepare() builds the transactions (exact
// approvals, the platform fee, the swap) and validates them against the
// allow-list; simulate() runs them in order on current state; send() fills in
// EIP-1559 fees for the speed preset, gas limits (simulated gas x 1.2) and
// nonces, signs through the EvmSignerApi, broadcasts (the private RPC when
// antiMev and configured), waits for the swap and returns its fill; track()
// decodes any swap transaction into a fill.

import { randomUUID } from 'node:crypto';
import { getAddress, isAddress, keccak256, type Address, type Hex, type PublicClient, type TransactionReceipt } from 'viem';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import type { EvmClients } from '../clients';
import type { EvmLiveConfig } from '../config';
import type { EvmSignerApi, EvmWalletRef } from '../signer/types';
import { validatePlan } from './allowlist';
import { EVM_VENUES, SEQUENCER_CHAINS } from './contracts';
import { EvmExecError, classifyRpcError, errorText, isEvmExecError, type EvmExecErrorCode } from './errors';
import { GAS_LIMIT_FLOOR, gasLimitFor, suggestFees, type FeeSuggestion } from './gas';
import { KyberClient } from './kyber';
import { BPS, bpsOf, minOutAfterSlippage, mulBps, percentOf, resolveSlippageBps } from './math';
import { KeyedSerialQueue, NonceManager, walletKey } from './nonce';
import { decodeFill, internalInflow, type EvmTrackContext } from './receipt';
import { VENUE_ORDER, defaultVenues, routeAndQuote, type RoutingAttempt } from './router';
import { nativeInto, netTransfer, simulateCalls, tokenBalance, tokenInfo, type SimStateOverrides } from './rpc';
import type { EvmFill, EvmPlanStep, EvmQuote, EvmSendResult, EvmSentTx, EvmSimulation, EvmTradeIntent, EvmTxPlan, EvmVenueId } from './types';
import { QUOTE_PLACEHOLDER } from './venues/common';
import type { Venue, VenueEnv } from './venues/types';

/** The wallet a plan is signed with: its provider ref and the signer holding the key. */
export interface EvmSendSigner {
  ref: EvmWalletRef;
  signer: EvmSignerApi;
}

export interface EvmExecEngineOptions {
  config: EvmLiveConfig;
  clients: EvmClients;
  /** KyberSwap client (default: built from config.kyberswap); null disables the aggregator. */
  kyber?: KyberClient | null;
  /** fetch used by the default KyberSwap client. */
  fetch?: typeof fetch;
  now?: () => number;
  /** Separate platform-fee transfers go before the swap (default) or right after it confirms. */
  separateFeeTiming?: 'before' | 'after';
  /** Quote validity (default 20 s). */
  quoteTtlMs?: number;
  /** Router deadline baked into swap calldata (default 180 s). */
  deadlineSeconds?: number;
  /** Venue implementations (tests replace them). */
  venues?: Partial<Record<EvmVenueId, Venue>>;
  /** How long send()/track() wait for a receipt per chain (ms). */
  confirmTimeoutMs?: Partial<Record<EvmChainId, number>>;
  /** Receipt polling interval (ms). */
  pollIntervalMs?: number;
}

export interface EvmSimulateOptions {
  /** State overrides (verification: fund a fresh wallet, set a token balance). */
  stateOverrides?: SimStateOverrides;
}

export interface EvmSendOptions {
  /** Skip the pre-send simulation (only for plans simulated a moment ago). */
  skipSimulation?: boolean;
}

const DEFAULT_CONFIRM_TIMEOUT_MS: Record<EvmChainId, number> = { base: 60_000, robinhood: 30_000, bsc: 60_000, eth: 180_000 };
const SLIPPAGE_REVERTS = /slippage|too little received|toolittlereceived|insufficient_output_amount|insufficientoutput|return amount is not enough|min.*(amount|return|out)|insufficienteth|insufficienttoken|v3invalidamountout/i;
const FUNDS_REVERTS = /insufficient funds|insufficient balance|exceeds balance|transfer amount exceeds|erc20insufficientbalance/i;
/** Extra gas assumed per plan step at quote time (before the plan exists). */
const QUOTE_STEP_GAS = { approve: 50_000n, permit2: 60_000n, fee: 21_000n };

function stepFloor(step: EvmPlanStep): bigint {
  if (step.kind === 'fee' || step.kind === 'transfer') return GAS_LIMIT_FLOOR.transfer;
  if (step.kind === 'approve' || step.kind === 'permit2-approve') return GAS_LIMIT_FLOOR.approve;
  return GAS_LIMIT_FLOOR.call;
}

export class EvmExecEngine {
  private readonly venues: Record<EvmVenueId, Venue>;
  private readonly kyber: KyberClient | null;
  private readonly now: () => number;
  private readonly queue = new KeyedSerialQueue();
  readonly nonces: NonceManager;
  private readonly quoteTtlMs: number;
  private readonly deadlineSeconds: number;
  private readonly pollIntervalMs: number;
  /** Per-token contracts verified while preparing a plan (Pons curves), re-checked by validatePlan at send. */
  private readonly verified = new WeakMap<EvmTxPlan, Address[]>();

  constructor(private readonly opts: EvmExecEngineOptions) {
    this.venues = { ...defaultVenues(), ...(opts.venues ?? {}) } as Record<EvmVenueId, Venue>;
    this.kyber = opts.kyber === undefined ? new KyberClient({ baseUrl: opts.config.kyberswap.baseUrl, clientId: opts.config.kyberswap.clientId, fetch: opts.fetch }) : opts.kyber;
    this.now = opts.now ?? Date.now;
    this.quoteTtlMs = opts.quoteTtlMs ?? 20_000;
    this.deadlineSeconds = opts.deadlineSeconds ?? 180;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
    this.nonces = new NonceManager((chain, address, blockTag) => this.read(chain).getTransactionCount({ address, blockTag }));
  }

  // -------------------------------------------------------------------------
  // plumbing

  read(chain: EvmChainId): PublicClient {
    const c = this.opts.clients[chain];
    if (!c || !this.opts.config.chains[chain]) throw new EvmExecError('unsupported_chain', `${chain} is not configured for live trading`);
    return c.read;
  }

  /** The client a transaction is broadcast through: the private RPC for anti-MEV sends when configured. */
  private sender(chain: EvmChainId, antiMev: boolean): { client: PublicClient; via: 'public' | 'private' } {
    const c = this.opts.clients[chain];
    const cfg = this.opts.config.chains[chain];
    if (!c || !cfg) throw new EvmExecError('unsupported_chain', `${chain} is not configured for live trading`);
    if (antiMev && cfg.privateRpcUrl && !SEQUENCER_CHAINS.includes(chain)) return { client: c.send, via: 'private' };
    return { client: c.read, via: 'public' };
  }

  venueEnv(chain: EvmChainId): VenueEnv {
    const cfg = this.opts.config;
    return {
      chain,
      client: this.read(chain),
      info: EVM_CHAINS[chain],
      contracts: EVM_VENUES[chain],
      feeWallet: cfg.feeWallet,
      feeBps: cfg.feeWallet ? cfg.platformFeeBps : 0,
      separateFeeTiming: this.opts.separateFeeTiming ?? 'before',
      kyber: this.kyber,
      nowMs: this.now,
    };
  }

  // -------------------------------------------------------------------------
  // quote

  async quote(intent: EvmTradeIntent): Promise<EvmQuote & { attempts: RoutingAttempt[] }> {
    const env = this.venueEnv(intent.chain);
    validateIntent(intent);
    const token = getAddress(intent.token);
    const wallet = intent.wallet ? getAddress(intent.wallet) : null;
    const client = env.client;
    const [info, nativeBalance, heldTokens] = await Promise.all([
      tokenInfo(client, token).catch((err) => {
        throw new EvmExecError('no_route', `${token} is not an ERC-20 on ${intent.chain}: ${errorText(err)}`);
      }),
      wallet ? client.getBalance({ address: wallet }) : Promise.resolve(null),
      wallet && intent.side === 'sell' ? tokenBalance(client, token, wallet) : Promise.resolve(null),
    ]);

    let amountIn: bigint;
    if (intent.side === 'buy') {
      amountIn = intent.amount;
      if (nativeBalance !== null && nativeBalance < amountIn) {
        throw new EvmExecError('insufficient_funds', `balance ${nativeBalance} below the ${amountIn} wei to spend`, { balance: nativeBalance, amountIn });
      }
    } else {
      if (heldTokens === null) throw new EvmExecError('invalid_intent', 'sells need the wallet');
      amountIn = intent.amountKind === 'percent' ? percentOf(heldTokens, intent.amount) : intent.amount;
      if (amountIn <= 0n) throw new EvmExecError(heldTokens === 0n ? 'insufficient_token_balance' : 'invalid_intent', heldTokens === 0n ? 'no token balance' : 'sell amount rounds to zero');
      if (heldTokens < amountIn) {
        throw new EvmExecError('insufficient_token_balance', `token balance ${heldTokens} below the ${amountIn} to sell`, { balance: heldTokens, amountIn });
      }
    }

    const order = intent.venues ?? VENUE_ORDER[intent.chain];
    const [{ quote: vq, attempts }, fees] = await Promise.all([
      routeAndQuote(env, this.venues, { token: info, side: intent.side, amountIn, wallet: wallet ?? QUOTE_PLACEHOLDER, walletIsReal: wallet !== null, nativeBalance, v4PoolKey: intent.v4PoolKey }, order, intent.v4PoolKey),
      suggestFees(client, intent.chain, intent.speed),
    ]);

    let slippageBps: number;
    try {
      slippageBps = resolveSlippageBps(intent.slippageBps, vq.priceImpactBps, vq.tokenTaxBps);
    } catch (err) {
      throw new EvmExecError('invalid_intent', (err as Error).message);
    }
    const minOut = minOutAfterSlippage(vq.expectedOut, slippageBps);

    // gas of the whole plan, before the plan exists: swap + likely approvals + fee transfer
    let gasUnits = vq.swapGas;
    if (vq.feeMode === 'separate-before' || vq.feeMode === 'separate-after') gasUnits += QUOTE_STEP_GAS.fee;
    if (intent.side === 'sell') gasUnits += vq.venue.startsWith('uniswap') ? QUOTE_STEP_GAS.approve + QUOTE_STEP_GAS.permit2 : QUOTE_STEP_GAS.approve;
    const gasCost = gasUnits * fees.expectedGasPrice;
    const notional = intent.side === 'buy' ? amountIn : vq.grossOut;
    const venueFee = mulBps(vq.nativeLeg, vq.venueFeeBps);
    const taxCost = mulBps(vq.nativeLeg, vq.tokenTaxBps);
    const now = this.now();
    return {
      id: randomUUID(),
      chain: intent.chain,
      token,
      side: intent.side,
      intent: { ...intent, token, wallet: wallet ?? undefined },
      venue: vq.venue,
      route: vq.route,
      routeLabel: vq.routeLabel,
      tokenDecimals: info.decimals,
      tokenSymbol: info.symbol,
      balanceBefore: intent.side === 'buy' ? nativeBalance : heldTokens,
      amountIn,
      venueAmountIn: vq.venueAmountIn,
      expectedOut: vq.expectedOut,
      minOut,
      slippageBps,
      priceImpactBps: vq.priceImpactBps,
      nativeLeg: vq.nativeLeg,
      fees: {
        platformFeeBps: vq.feeMode === 'none' ? 0 : env.feeBps,
        platformFee: vq.platformFee,
        platformFeeMode: vq.feeMode,
        venueFeeBps: vq.venueFeeBps,
        venueFee,
        tokenTaxBps: vq.tokenTaxBps,
        gasUnits,
        gasCost,
        totalCostBps: bpsOf(vq.platformFee + venueFee + taxCost + gasCost, notional),
      },
      createdAt: now,
      expiresAt: now + this.quoteTtlMs,
      venueData: vq.venueData,
      attempts,
    };
  }

  // -------------------------------------------------------------------------
  // prepare

  async prepare(quote: EvmQuote, walletAddress: Address): Promise<EvmTxPlan> {
    if (this.now() > quote.expiresAt) throw new EvmExecError('quote_expired', 'quote expired; quote again');
    if (!isAddress(walletAddress)) throw new EvmExecError('invalid_intent', 'wallet is not an address');
    const wallet = getAddress(walletAddress);
    if (quote.intent.wallet && quote.intent.wallet.toLowerCase() !== wallet.toLowerCase()) {
      throw new EvmExecError('invalid_intent', 'the quote was made for another wallet');
    }
    const env = this.venueEnv(quote.chain);
    const deadline = Math.floor(this.now() / 1000) + this.deadlineSeconds;
    const built = await this.venues[quote.venue].build(env, { quote, wallet, deadline });
    const plan: EvmTxPlan = { id: randomUUID(), chain: quote.chain, wallet, quote, steps: built.steps, deadline, createdAt: this.now() };
    validatePlan(plan, { feeWallet: env.feeWallet, verifiedTargets: built.verifiedTargets, nowSeconds: Math.floor(this.now() / 1000) });
    this.verified.set(plan, built.verifiedTargets);
    return plan;
  }

  // -------------------------------------------------------------------------
  // simulate

  async simulate(plan: EvmTxPlan, opts: EvmSimulateOptions = {}): Promise<EvmSimulation> {
    const client = this.read(plan.chain);
    const calls = plan.steps.map((s) => ({ from: plan.wallet, to: s.to, data: s.data, value: s.value }));
    let results;
    try {
      results = await simulateCalls(client, calls, opts.stateOverrides ?? {});
    } catch (err) {
      // RPC without eth_simulateV1: estimate the first step only
      try {
        const first = plan.steps[0];
        const gas = await client.estimateGas({ account: plan.wallet, to: first.to, data: first.data, value: first.value, stateOverride: toViemOverrides(opts.stateOverrides) });
        first.gasEstimate = gas;
        return { ok: true, method: 'estimateGas', steps: plan.steps.map((s, i) => ({ kind: s.kind, ok: i === 0, gasUsed: i === 0 ? gas : 0n, error: i === 0 ? null : 'not simulated' })), tokenDelta: null, nativeReceived: null, feeReceived: null, gasUsed: gas, error: null };
      } catch (err2) {
        return { ok: false, method: 'estimateGas', steps: plan.steps.map((s) => ({ kind: s.kind, ok: false, gasUsed: 0n, error: errorText(err2) })), tokenDelta: null, nativeReceived: null, feeReceived: null, gasUsed: 0n, error: `${errorText(err)} / ${errorText(err2)}` };
      }
    }
    const steps = plan.steps.map((s, i) => {
      const r = results[i];
      s.gasEstimate = r.gasUsed;
      return { kind: s.kind, ok: r.ok, gasUsed: r.gasUsed, error: r.error };
    });
    const allLogs = results.flatMap((r) => r.logs);
    const swapIdx = plan.steps.findIndex((s) => s.kind === 'swap');
    const feeWallet = this.opts.config.feeWallet;
    const firstError = steps.find((s) => !s.ok);
    return {
      ok: !firstError,
      method: 'eth_simulateV1',
      steps,
      tokenDelta: netTransfer(allLogs, plan.quote.token, plan.wallet),
      nativeReceived: swapIdx >= 0 ? nativeInto(results[swapIdx].logs, plan.wallet) : null,
      feeReceived: feeWallet ? nativeInto(allLogs, feeWallet) : null,
      gasUsed: steps.reduce((s, x) => s + x.gasUsed, 0n),
      error: firstError ? `${firstError.kind}: ${firstError.error}` : null,
    };
  }

  // -------------------------------------------------------------------------
  // send

  /**
   * Sign and broadcast the plan, serialized per (chain, wallet); waits for the
   * swap to confirm and returns its fill. Pre-broadcast failures throw an
   * EvmExecError; an on-chain revert is returned (fill.status 'reverted') since
   * gas was spent and the record matters.
   */
  send(plan: EvmTxPlan, signer: EvmSendSigner, opts: EvmSendOptions = {}): Promise<EvmSendResult> {
    if (signer.ref.address.toLowerCase() !== plan.wallet.toLowerCase()) {
      return Promise.reject(new EvmExecError('signer_error', 'the signer wallet is not the plan wallet'));
    }
    return this.queue.run(walletKey(plan.chain, plan.wallet), () => this.sendNow(plan, signer, opts));
  }

  private async sendNow(plan: EvmTxPlan, signer: EvmSendSigner, opts: EvmSendOptions): Promise<EvmSendResult> {
    const env = this.venueEnv(plan.chain);
    validatePlan(plan, { feeWallet: env.feeWallet, verifiedTargets: this.verified.get(plan) ?? [], nowSeconds: Math.floor(this.now() / 1000) });
    if (!opts.skipSimulation) {
      const sim = await this.simulate(plan);
      if (!sim.ok) throw simulationError(sim);
    }
    const fees = await suggestFees(this.read(plan.chain), plan.chain, plan.quote.intent.speed);
    const { client, via } = this.sender(plan.chain, plan.quote.intent.antiMev);
    const sent: EvmSentTx[] = [];
    const now = plan.steps.filter((s) => s.timing !== 'after-swap');
    const after = plan.steps.filter((s) => s.timing === 'after-swap');
    let swapHash: Hex | null = null;
    let swapReceipt: TransactionReceipt;
    try {
      for (const step of now) {
        const tx = await this.broadcast(plan.chain, plan.wallet, step, signer, fees, client, via);
        sent.push(tx);
        if (step.kind === 'swap') swapHash = tx.hash;
      }
      if (!swapHash) throw new EvmExecError('send_failed', 'plan has no swap');
      swapReceipt = await this.waitReceipt(plan.chain, swapHash, plan.wallet);
    } catch (err) {
      // what already went out matters to the caller (fee paid, approvals, a swap still pending)
      if (isEvmExecError(err)) err.detail.sent = sent.map((s) => ({ kind: s.kind, hash: s.hash, nonce: s.nonce }));
      throw err;
    }

    const separateFee = plan.steps.find((s) => s.kind === 'fee');
    const fill = await this.decode(plan.chain, swapReceipt, {
      token: plan.quote.token,
      side: plan.quote.side,
      quote: plan.quote,
      planTxHashes: sent.map((s) => s.hash),
      separateFeePaid: separateFee && separateFee.timing === 'before-swap' ? separateFee.value : undefined,
    });

    let feeTx: EvmSendResult['feeTx'] = null;
    if (separateFee && separateFee.timing === 'before-swap') {
      const feeHash = sent.find((s) => s.kind === 'fee')?.hash ?? null;
      const feeReceipt = feeHash ? await this.read(plan.chain).getTransactionReceipt({ hash: feeHash }).catch(() => null) : null;
      feeTx = { hash: feeHash, status: feeReceipt ? (feeReceipt.status === 'success' ? 'confirmed' : 'failed') : 'pending' };
    }
    for (const step of after) {
      // separate-after fees only follow a successful swap: never charge for a failed trade
      if (fill.status !== 'success') {
        feeTx = { hash: null, status: 'skipped' };
        continue;
      }
      try {
        const tx = await this.broadcast(plan.chain, plan.wallet, step, signer, fees, client, via);
        sent.push(tx);
        const r = await this.waitReceipt(plan.chain, tx.hash, plan.wallet).catch(() => null);
        feeTx = { hash: tx.hash, status: r ? (r.status === 'success' ? 'confirmed' : 'failed') : 'pending' };
        if (r?.status === 'success') fill.platformFee = step.value;
      } catch (err) {
        feeTx = { hash: null, status: 'failed' };
        void err;
      }
    }
    return { planId: plan.id, chain: plan.chain, wallet: plan.wallet, txs: sent, swapHash, fill, feeTx };
  }

  /**
   * Send one standalone transaction (a withdrawal) from a wallet through the
   * same per-wallet queue and nonce manager as trades, and wait for it.
   */
  sendTransaction(chain: EvmChainId, step: EvmPlanStep, signer: EvmSendSigner, opts: { speed?: EvmTradeIntent['speed']; antiMev?: boolean } = {}): Promise<{ tx: EvmSentTx; receipt: TransactionReceipt }> {
    const wallet = getAddress(signer.ref.address);
    return this.queue.run(walletKey(chain, wallet), async () => {
      const fees = await suggestFees(this.read(chain), chain, opts.speed ?? 'P2');
      const { client, via } = this.sender(chain, opts.antiMev ?? false);
      const tx = await this.broadcast(chain, wallet, step, signer, fees, client, via);
      const receipt = await this.waitReceipt(chain, tx.hash, wallet);
      return { tx, receipt };
    });
  }

  /** Current fee suggestion for a chain and speed preset (wei per gas). */
  fees(chain: EvmChainId, speed: EvmTradeIntent['speed'] = 'P2'): Promise<FeeSuggestion> {
    return suggestFees(this.read(chain), chain, speed);
  }

  /** Sign and broadcast one step with the next nonce; one resync retry on nonce conflicts. */
  private async broadcast(chain: EvmChainId, wallet: Address, step: EvmPlanStep, signer: EvmSendSigner, fees: FeeSuggestion, client: PublicClient, via: 'public' | 'private'): Promise<EvmSentTx> {
    const gasLimit = gasLimitFor(chain, step.gasEstimate ?? stepFloor(step), stepFloor(step));
    for (let attempt = 0; ; attempt++) {
      const nonce = await this.nonces.peek(chain, wallet);
      let signed: Hex;
      try {
        signed = await signer.signer.signTransaction(signer.ref, {
          type: 'eip1559',
          chainId: EVM_CHAINS[chain].chainId,
          nonce,
          to: step.to,
          data: step.data,
          value: step.value,
          gas: gasLimit,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        });
      } catch (err) {
        throw new EvmExecError('signer_error', `signing failed: ${errorText(err)}`);
      }
      const hash = keccak256(signed);
      try {
        await client.sendRawTransaction({ serializedTransaction: signed });
      } catch (err) {
        const text = errorText(err);
        if (/already known|known transaction/i.test(text)) {
          // the node already has exactly this transaction
        } else {
          const code: EvmExecErrorCode = classifyRpcError(err) ?? 'send_failed';
          if ((code === 'nonce_too_low' || code === 'replacement_underpriced') && attempt === 0) {
            this.nonces.resync(chain, wallet);
            continue;
          }
          throw new EvmExecError(code, `${step.kind} rejected: ${text}`, { step: step.kind, nonce });
        }
      }
      this.nonces.commit(chain, wallet, nonce);
      return { kind: step.kind, hash, nonce, gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, via };
    }
  }

  private async waitReceipt(chain: EvmChainId, hash: Hex, wallet?: Address): Promise<TransactionReceipt> {
    const timeout = this.opts.confirmTimeoutMs?.[chain] ?? DEFAULT_CONFIRM_TIMEOUT_MS[chain];
    try {
      return await this.read(chain).waitForTransactionReceipt({ hash, timeout, pollingInterval: this.pollIntervalMs });
    } catch (err) {
      // not mined in time: the next send continues from the chain's mined nonce
      if (wallet) await this.nonces.resetToLatest(chain, wallet).catch(() => undefined);
      throw new EvmExecError('tx_dropped', `transaction ${hash} not mined within ${timeout} ms: ${errorText(err)}`, { hash });
    }
  }

  // -------------------------------------------------------------------------
  // track

  /** Decode a swap transaction into a fill (waits for its receipt). */
  async track(chain: EvmChainId, hash: Hex, ctx: EvmTrackContext): Promise<EvmFill> {
    const receipt = await this.waitReceipt(chain, hash);
    return this.decode(chain, receipt, ctx);
  }

  private async decode(chain: EvmChainId, receipt: TransactionReceipt, ctx: EvmTrackContext): Promise<EvmFill> {
    const client = this.read(chain);
    const [tx, block] = await Promise.all([client.getTransaction({ hash: receipt.transactionHash }), client.getBlock({ blockNumber: receipt.blockNumber })]);
    const wallet = getAddress(tx.from);
    // every transaction the wallet sent in this block (plan steps usually land together)
    const others = (ctx.planTxHashes ?? []).filter((h) => h.toLowerCase() !== receipt.transactionHash.toLowerCase());
    const sameBlock: { value: bigint; receipt: TransactionReceipt }[] = [{ value: tx.value, receipt }];
    for (const h of others) {
      const r = await client.getTransactionReceipt({ hash: h }).catch(() => null);
      if (r && r.blockNumber === receipt.blockNumber) {
        const t = await client.getTransaction({ hash: h });
        sameBlock.push({ value: t.value, receipt: r });
      }
    }
    const internalIn = receipt.status === 'success' ? await internalInflow(client, wallet, receipt, sameBlock) : 0n;
    return decodeFill({ chain, receipt, txValue: tx.value, wallet, blockTimestampMs: Number(block.timestamp) * 1000, ctx, internalIn });
  }
}

function toViemOverrides(o: SimStateOverrides | undefined) {
  if (!o) return undefined;
  return Object.entries(o).map(([address, v]) => ({
    address: address as Address,
    ...(v.balance !== undefined ? { balance: v.balance } : {}),
    ...(v.stateDiff ? { stateDiff: Object.entries(v.stateDiff).map(([slot, value]) => ({ slot: slot as Hex, value: value as Hex })) } : {}),
  }));
}

export function simulationError(sim: EvmSimulation): EvmExecError {
  const text = sim.error ?? 'simulation failed';
  if (FUNDS_REVERTS.test(text)) return new EvmExecError('insufficient_funds', text, { steps: sim.steps });
  if (SLIPPAGE_REVERTS.test(text)) return new EvmExecError('slippage', text, { steps: sim.steps });
  return new EvmExecError('simulation_failed', text, { steps: sim.steps });
}

function validateIntent(intent: EvmTradeIntent): void {
  if (!isAddress(intent.token)) throw new EvmExecError('invalid_intent', 'token is not an address');
  if (intent.wallet !== undefined && !isAddress(intent.wallet)) throw new EvmExecError('invalid_intent', 'wallet is not an address');
  if (intent.amount <= 0n) throw new EvmExecError('invalid_intent', 'amount must be positive');
  if (intent.side === 'buy' && intent.amountKind !== 'native') throw new EvmExecError('invalid_intent', 'buys take a native amount');
  if (intent.side === 'sell' && intent.amountKind === 'native') throw new EvmExecError('invalid_intent', 'sells take a token amount or a percentage');
  if (intent.amountKind === 'percent' && intent.amount > BPS) throw new EvmExecError('invalid_intent', 'percent is in basis points (1..10000)');
  if (intent.side === 'sell' && !intent.wallet) throw new EvmExecError('invalid_intent', 'sells need the wallet');
}

export { isEvmExecError };
