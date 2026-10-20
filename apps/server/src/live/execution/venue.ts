// Live venue: real Solana swaps from the account's embedded wallet.
//
//   quote   route by token state: tokens on their pump.fun curve trade directly on the curve
//           (SDK curve math from on-chain reserves); everything else (migrated tokens included,
//           whose PumpSwap pools Jupiter routes) goes through the Jupiter Swap API v1.
//   run     per account, one at a time: fresh quote, guard, SOL balance check net of what earlier
//           unconfirmed sends may still spend, one v0 transaction (compute budget, platform fee,
//           route, Jito tip), signer, signature check, send (Jito block engine only for anti-MEV,
//           public RPC with preflight otherwise). Then, outside the lane: confirm by signature
//           status until the blockhash expires (rebroadcasting the same bytes), read the landed
//           transaction and book the fill into the World like any trade, so positions, PnL,
//           analytics, exit orders and the 'fill' push behave as in demo.
//
// Money rules: integer lamports / base units for everything sent; explicit slippage bounds in
// the instruction; the platform fee is floor(amount * bps / 10000) on the SOL going in (buys) or
// on the quote's minimum SOL out (sells); a transaction is never re-signed with a new blockhash.

import {
  CHAINS,
  WSOL_MINT,
  formatNative,
  type Quote,
  type Side,
  type SwapReceipt,
  type Trade,
} from '@trenchscope/shared';
import { PublicKey, type AddressLookupTableAccount, type Connection, type VersionedTransaction } from '@solana/web3.js';
import { HttpError, type AppContext, type EmbeddedWalletRef, type LiveServices, type SignerApi } from '../../context';
import type { TokenState, WalletState } from '../../sim/world';
import { autoSlippageFor, failedReceipt, PROCEEDS_BELOW_FEES, type ExecOptions, type ExecResult, type Ticket, type Venue, type VenueHost } from '../../trading/execution';
import { readTokenBalance } from '../wallets/balances';
import {
  RENT_EXEMPT_MIN_LAMPORTS,
  SIGNATURE_FEE_LAMPORTS,
  TOKEN_ACCOUNT_RENT_LAMPORTS,
  bpsOf,
  fromBaseUnits,
  lamportsToSol,
  maxWithSlippage,
  minWithSlippage,
  percentOf,
  slippageToBps,
  solToLamports,
  toBaseUnits,
} from './amounts';
import { describeTxError, walletDelta, type TxLike } from './fills';
import { JITO_MIN_TIP_LAMPORTS, pickTipAccount } from './jito';
import { JupiterClient, JupiterRouteError, JupiterUnavailableError, routeComputeUnits, routeLabel, toInstruction, type JupiterQuote } from './jupiter';
import { AccountLanes, lanesFor } from './lanes';
import {
  OnlinePumpLoader,
  PUMP_BUY_COMPUTE_UNITS,
  PUMP_SELL_COMPUTE_UNITS,
  curveBuyInstructions,
  curveIsTradable,
  curveSellInstructions,
  quoteCurveBuy,
  quoteCurveSell,
  type PumpCurveState,
  type PumpStateLoader,
} from './pump';
import { confirmSignature, sendSigned, SendRefusedError, type ConfirmOptions, type SendDeps, type SendRoute } from './send';
import { EXTRA_COMPUTE_UNITS, assertSignedAsBuilt, compileV0, signatureOf, swapInstructions, type SwapInstructionParts } from './tx';

/** A retried clientId replays its first receipt this long (live sends must never repeat). */
const LIVE_IDEMPOTENCY_WINDOW_MS = 15 * 60_000;
/** Compute units assumed for a Jupiter route that reported none. */
const DEFAULT_ROUTE_COMPUTE_UNITS = 400_000;
const LOOKUP_TABLE_TTL_MS = 5 * 60_000;
export const LIVE_TX_EXPIRED = 'transaction expired before it landed (nothing was spent)';
/** Background tracking gives up after this long without a verdict (RPC trouble). */
const BACKGROUND_CONFIRM_MS = 10 * 60_000;
const BACKGROUND_FETCH_ATTEMPTS = 60;

/** A business failure of a trade (no liquidity, no balance, migrating...): a failed receipt, not an HTTP error. */
export class PlanError extends Error {}

export interface LiveVenueDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Wall clock (ms) for latencies and confirmation timeouts. */
  now: () => number;
  random: () => number;
  /** Curve state source (defaults to the chain through the SDK's accounts). */
  pump: PumpStateLoader | null;
  confirm: ConfirmOptions;
  /** Attempts (one poll interval apart) to read a confirmed transaction: RPC indexes trail its status. */
  fetchTxAttempts: number;
}

const defaultDeps = (): LiveVenueDeps => ({
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: Math.random,
  pump: null,
  confirm: { pollMs: 400, timeoutMs: 60_000, rebroadcastMs: 2000 },
  fetchTxAttempts: 10,
});

/** A priced trade with everything execution needs, in base units. */
export interface SwapPlan {
  route: 'pump' | 'jupiter';
  side: Side;
  owner: PublicKey;
  mint: PublicKey;
  decimals: number;
  /** Lamports in (buy) / token base units in (sell). */
  inRaw: bigint;
  /** Venue's expected output: tokens (buy) / lamports (sell). */
  outRaw: bigint;
  /** Guaranteed output: tokens (buy) / lamports (sell). */
  minOutRaw: bigint;
  /** Most the swap may take: lamports (buy; the pump curve's max cost) / tokens (sell). */
  maxInRaw: bigint;
  slippageBps: number;
  priceImpact: number;
  platformFee: bigint;
  feeWallet: PublicKey | null;
  priorityLamports: bigint;
  tipLamports: bigint;
  via: SendRoute;
  /** Rent the transaction moves into accounts it creates (needed up front; mostly refundable). */
  rentLamports: bigint;
  /** Sells: the chain balance the size came from. */
  heldRaw: bigint;
  pump: PumpCurveState | null;
  jupiter: JupiterQuote | null;
  quote: Quote;
}

interface Sent {
  ticket: Ticket;
  plan: SwapPlan;
  ref: EmbeddedWalletRef;
  signature: string;
  raw: Uint8Array;
  lastValidBlockHeight: number;
  programIds: string[];
  started: number;
  /** Release the lamports committed to this send and the tokens reserved for it. */
  release: () => void;
}

const unavailable = (why: string) => new HttpError(503, `trading is unavailable: ${why}`, 'trading_unavailable');

export class LiveVenue implements Venue {
  readonly kind = 'live' as const;
  readonly idempotencyWindowMs = LIVE_IDEMPOTENCY_WINDOW_MS;
  deps: LiveVenueDeps;
  private readonly lookupTables = new Map<string, { at: number; table: AddressLookupTableAccount }>();
  /** Signatures confirming in the background (their swap returned before they settled). */
  private readonly tracking = new Map<string, Promise<void>>();

  constructor(
    private readonly ctx: AppContext,
    private readonly host: VenueHost,
    deps: Partial<LiveVenueDeps> = {},
  ) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  /** Send lanes shared with withdrawals (one per app). */
  get lanes(): AccountLanes {
    return lanesFor(this.ctx.live ?? this.ctx);
  }

  /** Resolves once every background confirmation has settled. */
  async idle(): Promise<void> {
    while (this.tracking.size) await Promise.all([...this.tracking.values()]);
  }

  /** Whether a signature is one of our own swaps still being confirmed. */
  isTracking(signature: string): boolean {
    return this.tracking.has(signature);
  }

  fillAtLaunch(_ticket: Ticket): SwapReceipt {
    throw new HttpError(403, 'token launches are not available in live mode', 'not_available_in_live');
  }

  // ---------------------------------------------------------------------------
  // Quote
  // ---------------------------------------------------------------------------

  async quote(ticket: Ticket): Promise<Quote> {
    const { connection } = this.connection();
    const owner = this.ctx.accounts.walletRef(ticket.accountId, 'sol')?.address ?? ticket.wallet.address;
    try {
      return (await this.plan(ticket, connection, new PublicKey(owner))).quote;
    } catch (err) {
      throw this.asHttp(err, 400, 'quote_unavailable');
    }
  }

  private connection(): { live: LiveServices; connection: Connection } {
    const live = this.ctx.live;
    if (!live || !live.connection) throw unavailable('no Solana RPC configured');
    return { live, connection: live.connection };
  }

  private executionServices(accountId: string): { live: LiveServices; connection: Connection; signer: SignerApi; ref: EmbeddedWalletRef } {
    const { live, connection } = this.connection();
    if (!live.signer) throw unavailable('no wallet signer configured');
    const ref = this.ctx.accounts.walletRef(accountId, 'sol');
    if (!ref) throw unavailable('your wallet is not provisioned yet');
    return { live, connection, signer: live.signer, ref };
  }

  /** Business failures -> `status` / `code`; router or RPC failures -> 503; HttpErrors pass through. */
  private asHttp(err: unknown, status: number, code: string): HttpError {
    if (err instanceof HttpError) return err;
    if (err instanceof PlanError || err instanceof JupiterRouteError) return new HttpError(status, err.message, code);
    if (err instanceof JupiterUnavailableError) return unavailable(err.message);
    return unavailable(`Solana RPC error: ${err instanceof Error ? err.message : String(err)}`);
  }

  /** Price a ticket from the chain (and the router) now. Throws PlanError for business failures. */
  async plan(ticket: Ticket, connection: Connection, owner: PublicKey): Promise<SwapPlan> {
    const { world } = this.ctx;
    const live = this.ctx.live!;
    const { token, side, preset, wallet } = ticket;
    if (token.chain !== 'sol') throw new HttpError(400, 'live trading supports Solana only', 'invalid_input');
    if (token.status === 'migrating') throw new PlanError('token is migrating; try again in a few seconds');
    const mint = new PublicKey(token.address);

    // Route: pump.fun curve while the token is on it (and the curve is SOL-quoted), else Jupiter.
    let pump: PumpCurveState | null = null;
    if (token.status === 'curve' && token.launchpad === 'pump') {
      pump = await this.pumpLoader(connection).load(mint, owner);
      if (pump && !curveIsTradable(pump)) throw new PlanError('token is migrating; try again in a few seconds');
    }

    // Size: lamports for buys; for sells the chain balance net of sells still in flight.
    let decimals = token.decimals;
    let inRaw: bigint;
    let heldRaw = 0n;
    if (side === 'buy') {
      inRaw = baseUnits(ticket.amount, 9);
    } else {
      const held = await readTokenBalance(connection, owner, mint);
      if (!held || held.raw <= 0n) throw new PlanError('no token balance');
      decimals = held.decimals;
      heldRaw = held.raw;
      let pendingRaw = 0n;
      try {
        pendingRaw = toBaseUnits(this.host.reservedTokens(wallet, token), decimals);
      } catch {
        pendingRaw = 0n;
      }
      // Same rule as the simulator: when in-flight sells already cover everything, size from all of it.
      const free = heldRaw - pendingRaw > heldRaw / 1_000_000_000n ? heldRaw - pendingRaw : heldRaw;
      inRaw = ticket.amountKind === 'tokens' ? minBig(baseUnits(ticket.amount, decimals), free) : percentOf(free, ticket.amount);
    }
    if (inRaw <= 0n) throw new PlanError(side === 'buy' ? 'amount: must be positive' : 'no token balance');

    // Slippage: explicit, or auto from the expected price impact (the World's reserve estimate for routed swaps).
    const estimateImpact = (impact: number) => (preset.autoSlippage ? slippageToBps(autoSlippageFor(world, token, impact)) : slippageToBps(preset.slippage));
    const fees = live.config.fees;
    const feeWallet = fees.feeWallet && fees.platformFeeBps > 0 ? feeWalletKey(fees.feeWallet) : null;
    const feeBps = feeWallet ? fees.platformFeeBps : 0;

    let outRaw: bigint;
    let minOutRaw: bigint;
    let maxInRaw = inRaw;
    let priceImpact: number;
    let slippageBps: number;
    let jupiter: JupiterQuote | null = null;
    let rentLamports = 0n;
    if (pump) {
      if (side === 'buy') {
        const q = quoteCurveBuy(pump, inRaw);
        if (q.tokens <= 0n) throw new PlanError('no liquidity');
        priceImpact = q.priceImpact;
        slippageBps = estimateImpact(priceImpact);
        outRaw = q.tokens;
        minOutRaw = q.tokens; // exact-token buy: the bound is on the SOL side
        maxInRaw = maxWithSlippage(inRaw, slippageBps);
        if (!pump.associatedUserAccountInfo) rentLamports = TOKEN_ACCOUNT_RENT_LAMPORTS;
      } else {
        const q = quoteCurveSell(pump, inRaw);
        if (q.lamports <= 0n) throw new PlanError('no liquidity');
        priceImpact = q.priceImpact;
        slippageBps = estimateImpact(priceImpact);
        outRaw = q.lamports;
        minOutRaw = minWithSlippage(q.lamports, slippageBps);
      }
    } else {
      const uiIn = side === 'buy' ? ticket.amount : fromBaseUnits(inRaw, decimals);
      slippageBps = estimateImpact(world.quote(token, side, uiIn)?.priceImpact ?? 0);
      jupiter = await this.jupiter().quote({
        inputMint: side === 'buy' ? WSOL_MINT : token.address,
        outputMint: side === 'buy' ? token.address : WSOL_MINT,
        amount: inRaw,
        slippageBps,
      });
      outRaw = BigInt(jupiter.outAmount);
      minOutRaw = BigInt(jupiter.otherAmountThreshold);
      const impact = Number(jupiter.priceImpactPct ?? 0);
      priceImpact = Number.isFinite(impact) ? Math.min(1, Math.max(0, Math.abs(impact))) : 0;
      // The wrapped-SOL account (and a new token account on buys) needs rent while the swap runs.
      rentLamports = side === 'buy' ? 2n * TOKEN_ACCOUNT_RENT_LAMPORTS : TOKEN_ACCOUNT_RENT_LAMPORTS;
    }

    const platformFee = bpsOf(side === 'buy' ? inRaw : minOutRaw, feeBps);
    const priorityLamports = solToLamports(preset.priorityFee);
    const via: SendRoute = preset.antiMev && live.config.jitoUrl ? 'jito' : 'rpc';
    const tipLamports = via === 'jito' ? maxBig(JITO_MIN_TIP_LAMPORTS, solToLamports(preset.tip)) : 0n;
    const networkFee = SIGNATURE_FEE_LAMPORTS + priorityLamports + tipLamports;
    const solUsd = world.nativeUsd('sol');
    const slippage = slippageBps / 10_000;

    let quote: Quote;
    if (side === 'buy') {
      const tokensOut = fromBaseUnits(outRaw, decimals);
      quote = {
        chain: 'sol',
        token: token.address,
        side,
        amountIn: ticket.amount,
        expectedOut: tokensOut,
        minOut: fromBaseUnits(minOutRaw, decimals),
        priceImpact,
        executionPriceUsd: tokensOut > 0 ? (lamportsToSol(inRaw) / tokensOut) * solUsd : 0,
        platformFeeNative: lamportsToSol(platformFee),
        networkFeeNative: lamportsToSol(networkFee),
        slippage,
        route: pump ? 'curve' : 'pool',
        venue: pump ? 'pump.fun' : routeLabel(jupiter!),
        balanceBefore: wallet.native,
      };
    } else {
      const tokensIn = fromBaseUnits(inRaw, decimals);
      const net = outRaw - platformFee - networkFee;
      if (net <= 0n) throw new PlanError(PROCEEDS_BELOW_FEES);
      quote = {
        chain: 'sol',
        token: token.address,
        side,
        amountIn: tokensIn,
        expectedOut: lamportsToSol(net),
        minOut: lamportsToSol(maxBig(0n, minOutRaw - platformFee - networkFee)),
        priceImpact,
        executionPriceUsd: tokensIn > 0 ? (lamportsToSol(outRaw) / tokensIn) * solUsd : 0,
        platformFeeNative: lamportsToSol(platformFee),
        networkFeeNative: lamportsToSol(networkFee),
        slippage,
        route: pump ? 'curve' : 'pool',
        venue: pump ? 'pump.fun' : routeLabel(jupiter!),
        balanceBefore: fromBaseUnits(heldRaw, decimals),
      };
    }
    return {
      route: pump ? 'pump' : 'jupiter',
      side,
      owner,
      mint,
      decimals,
      inRaw,
      outRaw,
      minOutRaw,
      maxInRaw,
      slippageBps,
      priceImpact,
      platformFee,
      feeWallet: platformFee > 0n ? feeWallet : null,
      priorityLamports,
      tipLamports,
      via,
      rentLamports,
      heldRaw,
      pump,
      jupiter,
      quote,
    };
  }

  private pumpLoader(connection: Connection): PumpStateLoader {
    return this.deps.pump ?? new OnlinePumpLoader(connection);
  }

  private jupiter(): JupiterClient {
    return new JupiterClient(this.ctx.live!.config.jupiter, this.deps.fetch);
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  async run(ticket: Ticket, opts: ExecOptions): Promise<ExecResult> {
    const started = this.deps.now();
    const svc = this.executionServices(ticket.accountId);
    let sent: Sent | ExecResult;
    try {
      sent = await this.lanes.run(ticket.accountId, () => this.prepareAndSend(ticket, opts, svc, started));
    } catch (err) {
      if (err instanceof PlanError || err instanceof JupiterRouteError) return { receipt: failedReceipt(err.message, this.deps.now() - started), aborted: null };
      throw this.asHttp(err, 502, 'tx_failed');
    }
    if ('receipt' in sent) return sent;
    return { receipt: await this.confirmAndSettle(sent, false), aborted: null };
  }

  /** Inside the account's lane: quote, guard, balance check, build, sign, send. */
  private async prepareAndSend(
    ticket: Ticket,
    opts: ExecOptions,
    svc: { connection: Connection; signer: SignerApi; ref: EmbeddedWalletRef },
    started: number,
  ): Promise<Sent | ExecResult> {
    const { connection, signer, ref } = svc;
    const { accountId, token, side } = ticket;
    const owner = new PublicKey(ref.address);
    const plan = await this.plan(ticket, connection, owner);
    const elapsed = () => this.deps.now() - started;

    const aborted = opts.guard?.() ?? null;
    if (aborted) return { receipt: failedReceipt(aborted, elapsed(), plan.quote), aborted };

    // SOL check, net of what this account's unconfirmed sends may still spend.
    const balance = BigInt(await connection.getBalance(owner, 'confirmed'));
    const networkFee = SIGNATURE_FEE_LAMPORTS + plan.priorityLamports + plan.tipLamports;
    // Buys spend at most the max SOL in plus the fee on it; a sell's fee comes out of its proceeds.
    const spend = (side === 'buy' ? plan.maxInRaw + plan.platformFee : 0n) + networkFee + plan.rentLamports;
    const available = balance - this.lanes.committed(accountId) - RENT_EXEMPT_MIN_LAMPORTS;
    if (available < spend) {
      const symbol = CHAINS.sol.nativeSymbol;
      const needed = lamportsToSol(spend + RENT_EXEMPT_MIN_LAMPORTS);
      return { receipt: failedReceipt(`insufficient ${symbol} balance: ${formatNative(needed, symbol)} needed incl. fees`, elapsed(), plan.quote), aborted: null };
    }

    const { parts, computeUnits, lookupTables } = await this.routeInstructions(plan, connection);
    const instructions = swapInstructions({
      owner,
      side,
      parts,
      computeUnits,
      priorityLamports: plan.priorityLamports,
      platformFee: plan.feeWallet ? { wallet: plan.feeWallet, lamports: plan.platformFee } : null,
      tip: plan.tipLamports > 0n ? { account: pickTipAccount(this.deps.random), lamports: plan.tipLamports } : null,
    });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    let tx: VersionedTransaction;
    let builtMessage: Uint8Array;
    try {
      tx = compileV0(owner, blockhash, instructions, lookupTables);
      builtMessage = tx.message.serialize();
      tx.serialize(); // over 1232 bytes throws here, before anything is signed
    } catch {
      throw new PlanError('the route does not fit in one transaction; try again or use a smaller amount');
    }
    let signed: VersionedTransaction;
    try {
      signed = await signer.signTransaction(ref, tx);
      assertSignedAsBuilt(builtMessage, signed, owner);
    } catch (err) {
      this.ctx.accounts.audit(accountId, 'swap_sign_failed', { token: token.address, side, reason: err instanceof Error ? err.message : String(err) });
      throw unavailable(`signing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const signature = signatureOf(signed);
    const raw = signed.serialize();

    const releaseLamports = this.lanes.commit(accountId, spend);
    const releaseTokens = side === 'sell' ? this.host.reserve(ticket.wallet, token, fromBaseUnits(plan.inRaw, plan.decimals)) : () => {};
    const release = () => {
      releaseLamports();
      releaseTokens();
    };
    try {
      await sendSigned(this.sendDeps(), raw, plan.via, { preflight: true });
    } catch (err) {
      release();
      if (err instanceof SendRefusedError) {
        const reason = describeTxError(err.txError ?? err.message, err.logs, instructions.map((ix) => ix.programId.toBase58()));
        this.ctx.accounts.audit(accountId, 'swap_refused', { token: token.address, side, route: plan.route, via: plan.via, reason });
        throw new HttpError(502, reason, 'tx_failed');
      }
      throw err;
    }
    this.ctx.accounts.audit(accountId, 'swap_sent', {
      signature,
      token: token.address,
      side,
      route: plan.route,
      via: plan.via,
      amountIn: plan.inRaw.toString(),
      minOut: plan.minOutRaw.toString(),
      platformFeeLamports: plan.platformFee.toString(),
      tipLamports: plan.tipLamports.toString(),
    });
    return { ticket, plan, ref, signature, raw, lastValidBlockHeight, programIds: instructions.map((ix) => ix.programId.toBase58()), started, release };
  }

  /** The route's own instructions, its compute budget and the lookup tables it needs. */
  private async routeInstructions(plan: SwapPlan, connection: Connection): Promise<{ parts: SwapInstructionParts; computeUnits: number; lookupTables: AddressLookupTableAccount[] }> {
    if (plan.route === 'pump') {
      const state = plan.pump!;
      const swap =
        plan.side === 'buy'
          ? await curveBuyInstructions(state, plan.mint, plan.owner, plan.outRaw, plan.maxInRaw)
          : await curveSellInstructions(state, plan.mint, plan.owner, plan.inRaw, plan.minOutRaw);
      return {
        parts: { setup: [], swap, cleanup: [] },
        computeUnits: (plan.side === 'buy' ? PUMP_BUY_COMPUTE_UNITS : PUMP_SELL_COMPUTE_UNITS) + EXTRA_COMPUTE_UNITS,
        lookupTables: [],
      };
    }
    const res = await this.jupiter().swapInstructions(plan.jupiter!, plan.owner.toBase58());
    const cleanup = [...(res.cleanupInstruction ? [toInstruction(res.cleanupInstruction)] : []), ...res.otherInstructions.map(toInstruction)];
    return {
      parts: { setup: res.setupInstructions.map(toInstruction), swap: [toInstruction(res.swapInstruction)], cleanup },
      computeUnits: (routeComputeUnits(res) ?? DEFAULT_ROUTE_COMPUTE_UNITS) + EXTRA_COMPUTE_UNITS,
      lookupTables: await this.loadLookupTables(connection, res.addressLookupTableAddresses),
    };
  }

  private async loadLookupTables(connection: Connection, addresses: string[]): Promise<AddressLookupTableAccount[]> {
    const now = this.deps.now();
    return Promise.all(
      addresses.map(async (address) => {
        const cached = this.lookupTables.get(address);
        if (cached && now - cached.at < LOOKUP_TABLE_TTL_MS) return cached.table;
        const res = await connection.getAddressLookupTable(new PublicKey(address));
        if (!res.value) throw new Error(`address lookup table ${address} not found`);
        this.lookupTables.set(address, { at: now, table: res.value });
        return res.value;
      }),
    );
  }

  private sendDeps(): SendDeps {
    const live = this.ctx.live!;
    return { connection: live.connection!, jitoUrl: live.config.jitoUrl, fetch: this.deps.fetch, sleep: this.deps.sleep, now: this.deps.now };
  }

  /**
   * Wait for the signature; a confirmed transaction is read and booked. When the wait times out the
   * swap keeps being tracked in the background (its fill is booked and pushed when it lands) and
   * the caller gets a pending failure carrying the signature.
   */
  private async confirmAndSettle(sent: Sent, background: boolean): Promise<SwapReceipt> {
    const deps = this.sendDeps();
    const confirm = background ? { ...this.deps.confirm, timeoutMs: BACKGROUND_CONFIRM_MS } : this.deps.confirm;
    const pending = (error: string) => {
      const receipt = failedReceipt(error, this.deps.now() - sent.started, sent.plan.quote);
      receipt.txHash = sent.signature;
      return receipt;
    };
    let settled = false;
    try {
      const result = await confirmSignature(deps, sent.signature, sent.lastValidBlockHeight, confirm, () =>
        sendSigned(deps, sent.raw, sent.plan.via, { preflight: false }),
      );
      if (result.status === 'expired') {
        settled = true;
        return failedReceipt(LIVE_TX_EXPIRED, this.deps.now() - sent.started, sent.plan.quote);
      }
      if (result.status === 'timeout') {
        if (background) {
          // Neither landed nor provably expired after minutes of RPC trouble: stop; balance sync shows the truth.
          settled = true;
          this.lanes.touch(sent.ticket.accountId);
          return pending(`could not confirm ${sent.signature}; check your balance`);
        }
        this.trackInBackground(sent);
        return pending(`still confirming: tracking ${sent.signature}`);
      }
      const tx = await this.fetchTransaction(sent.signature, background ? BACKGROUND_FETCH_ATTEMPTS : this.deps.fetchTxAttempts);
      if (!tx) {
        if (background) {
          settled = true;
          this.lanes.touch(sent.ticket.accountId);
          return pending(`landed but its fill could not be read: ${sent.signature}`);
        }
        // Landed (its status says so) but not readable yet: book it from the background tracker.
        this.trackInBackground(sent);
        return pending(`confirmed; reading the fill: ${sent.signature}`);
      }
      settled = true;
      return this.settleLanded(sent, tx);
    } finally {
      if (settled) sent.release();
    }
  }

  private trackInBackground(sent: Sent): void {
    if (this.tracking.has(sent.signature)) return;
    const job = (async () => {
      try {
        const receipt = await this.confirmAndSettle(sent, true);
        if (!receipt.ok) this.notifyFailure(sent, receipt.error ?? 'swap failed');
      } catch (err) {
        this.notifyFailure(sent, err instanceof Error ? err.message : 'swap failed');
      } finally {
        sent.release();
        this.tracking.delete(sent.signature);
      }
    })();
    this.tracking.set(sent.signature, job);
  }

  private notifyFailure(sent: Sent, reason: string): void {
    const { ticket } = sent;
    this.ctx.accounts.notify(ticket.accountId, {
      kind: 'system',
      title: `${ticket.side === 'buy' ? 'Buy' : 'Sell'} failed · $${ticket.token.symbol}`,
      body: reason,
      chain: 'sol',
      token: ticket.token.address,
      wallet: null,
      level: 'error',
    });
  }

  private async fetchTransaction(signature: string, attempts: number): Promise<TxLike | null> {
    const connection = this.ctx.live!.connection!;
    for (let i = 0; i < attempts; i++) {
      const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null);
      if (tx) return tx as unknown as TxLike;
      await this.deps.sleep(this.deps.confirm.pollMs);
    }
    return null;
  }

  /** Book a landed transaction: a failed one throws 502 tx_failed, a filled one becomes a World trade. */
  private settleLanded(sent: Sent, tx: TxLike): SwapReceipt {
    const { ticket, plan, signature, ref } = sent;
    const { world, accounts } = this.ctx;
    const { accountId, token, side, wallet } = ticket;
    this.lanes.touch(accountId);
    let delta: ReturnType<typeof walletDelta>;
    try {
      delta = walletDelta(tx, signature, ref.address, token.address);
    } catch (err) {
      // Landed, but the response cannot be read as our swap: book nothing; the balance sync shows the result.
      accounts.audit(accountId, 'swap_unreadable', { signature, token: token.address, side, reason: err instanceof Error ? err.message : String(err) });
      const receipt = failedReceipt('the transaction landed but its fill could not be read; balances will refresh', this.deps.now() - sent.started, plan.quote);
      receipt.txHash = signature;
      return receipt;
    }
    world.syncWalletBalances(wallet, lamportsToSol(delta.ownerPostLamports));
    if (!delta.ok) {
      const reason = delta.error ?? describeTxError(tx.meta?.err ?? null, tx.meta?.logMessages ?? null, sent.programIds);
      accounts.audit(accountId, 'swap_failed', { signature, token: token.address, side, reason, feeLamports: delta.feeLamports.toString() });
      accounts.pushBalance(accountId, 'sol');
      throw new HttpError(502, reason, 'tx_failed');
    }

    const tokenDelta = delta.tokenPostRaw - delta.tokenPreRaw;
    const decimals = delta.decimals ?? plan.decimals;
    const solDelta = delta.ownerPostLamports - delta.ownerPreLamports;
    const networkFee = delta.feeLamports + plan.tipLamports;
    const platformFee = plan.feeWallet ? plan.platformFee : 0n;
    // The venue leg: what went into (buy) or came out of (sell) the swap, fees and refundable rent excluded.
    const nativeLeg = side === 'buy' ? -solDelta - networkFee - platformFee - delta.rentLamports : solDelta + networkFee + platformFee + delta.rentLamports;
    const tokenAmount = fromBaseUnits(side === 'buy' ? tokenDelta : -tokenDelta, decimals);
    const nativeAmount = lamportsToSol(maxBig(0n, nativeLeg));
    const latencyMs = this.deps.now() - sent.started;
    if (!(tokenAmount > 0)) {
      // Landed without moving the token (should not happen for a swap): balances are synced, nothing is booked.
      accounts.audit(accountId, 'swap_unreadable', { signature, token: token.address, side });
      accounts.pushBalance(accountId, 'sol');
      const receipt = failedReceipt('the transaction landed but its fill could not be read; balances were refreshed', latencyMs, plan.quote);
      receipt.txHash = signature;
      return receipt;
    }

    const fees = { platform: lamportsToSol(platformFee), network: lamportsToSol(networkFee) };
    const booked = world.recordExternalTrade(token, {
      wallet: wallet.address,
      side,
      nativeAmount,
      tokenAmount,
      at: world.now,
      txHash: signature,
      slot: delta.slot,
      walletTokenBalance: fromBaseUnits(delta.tokenPostRaw, decimals),
      fees,
    });
    // null: the live feed saw this swap first and booked it without our fees.
    const trade = booked ?? findTrade(token, signature, wallet.address);
    if (!booked) addFeesToBooked(wallet, token, side, fees.platform + fees.network, world.nativeUsd('sol'), fromBaseUnits(delta.tokenPostRaw, decimals));
    const solUsd = world.nativeUsd('sol');
    const usdAmount = trade?.usdAmount ?? nativeAmount * solUsd;
    this.ctx.store?.appendFill({
      accountId,
      chain: 'sol',
      signature,
      token: token.address,
      side,
      nativeAmount,
      tokenAmount,
      platformFee: lamportsToSol(platformFee),
      networkFee: lamportsToSol(networkFee),
      priceUsd: trade?.priceUsd ?? (tokenAmount > 0 ? usdAmount / tokenAmount : 0),
      at: world.now,
      source: ticket.source,
      route: plan.route,
    });
    const receipt: SwapReceipt = {
      ok: true,
      trade: trade ?? undefined,
      nativeAmount,
      tokenAmount,
      usdAmount,
      priceUsd: trade?.priceUsd ?? (tokenAmount > 0 ? usdAmount / tokenAmount : 0),
      platformFeeNative: lamportsToSol(platformFee),
      networkFeeNative: lamportsToSol(networkFee),
      priceImpact: plan.priceImpact,
      mevLossNative: 0,
      txHash: signature,
      latencyMs,
      orders: [],
    };
    return this.host.fanOut(ticket, receipt);
  }
}

/**
 * Our swap was booked from the market feed before our confirmation read it: the feed knows
 * neither our platform fee nor the network fee, so they join the position here (cost basis on a
 * buy, realized PnL on a sell), and the balance follows the chain.
 */
function addFeesToBooked(wallet: WalletState, token: TokenState, side: Side, feesNative: number, solUsd: number, balanceAfter: number): void {
  const pos = wallet.positions.get(token.address);
  if (!pos) return;
  const feesUsd = feesNative * solUsd;
  if (side === 'buy') {
    pos.costBasisUsd += feesUsd;
    pos.boughtUsd += feesUsd;
    pos.boughtNative += feesNative;
  } else {
    pos.realizedPnlUsd -= feesUsd;
    pos.soldUsd -= feesUsd;
    pos.soldNative -= feesNative;
  }
  if (Number.isFinite(balanceAfter) && balanceAfter >= 0 && pos.balance > 0) pos.balance = balanceAfter;
  token.version++;
}

/** A display amount as base units; malformed amounts are a business failure, not a crash. */
function baseUnits(amount: number, decimals: number): bigint {
  try {
    return toBaseUnits(amount, decimals);
  } catch {
    throw new PlanError('amount: invalid');
  }
}

function feeWalletKey(address: string): PublicKey {
  try {
    return new PublicKey(address);
  } catch {
    throw unavailable('FEE_WALLET_ADDRESS is not a valid Solana address');
  }
}

function findTrade(token: TokenState, signature: string, wallet: string): Trade | null {
  for (let i = token.trades.length - 1; i >= 0; i--) {
    const t = token.trades[i];
    if (t.txHash === signature && t.wallet === wallet) return t;
  }
  return null;
}

const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
