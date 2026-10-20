// Paper-trade execution. Resolves the effective preset (P1/P2/P3 plus
// per-request overrides), prices the trade (platform + network fees, manual or
// auto slippage), waits a simulated confirmation latency, then executes
// against the World ledger with minOut enforced, so price moves during the
// latency produce real slippage failures. Network congestion (sim/congestion.ts)
// stretches the latency and, while congested, makes low priority bids expire.
// Public-mempool trades with noticeable price impact can get sandwiched. Every
// fill is fanned out to the user channel, the balance push and the rewards volume.

import { setTimeout as sleep } from 'node:timers/promises';
import {
  CHAINS,
  PLATFORM_FEE_RATE,
  clamp,
  formatNative,
  getLaunchpad,
  minOutWithSlippage,
  type AmountKind,
  type ChainId,
  type Order,
  type PresetId,
  type Quote,
  type Side,
  type StrategySpec,
  type SwapReceipt,
  type SwapRequest,
  type Trade,
  type TradePreset,
} from '@trenchscope/shared';
import { HttpError, type AppContext } from '../context';
import { CONGESTED_LEVEL, congestionLabel, priorityFeeTiers } from '../sim/congestion';
import type { Rng } from '../sim/rng';
import type { SwapOutcome, TokenState, WalletState } from '../sim/world';
import { HOUR_MS, assertAmount, balanceOf, normalizeAddress, notFound } from './common';

const IDEMPOTENCY_WINDOW_MS = 60_000;
const MAX_SWAPS_PER_SECOND = 10;
const HOUSEKEEPING_EVERY_MS = 10_000;
/** GMGN's sizing rule: 2% + token tax + 1.5x price impact + half the 5m move, +3% in the first hour. */
const AUTO_SLIPPAGE = { base: 0.02, impactWeight: 1.5, momentumWeight: 0.5, youngBonus: 0.03, min: 0.01, max: 0.5 };
/** Simulated confirmation latency (ms); the private anti-MEV relay is slower. */
const LATENCY = { min: 120, max: 600, antiMevExtra: 150 };
/** Sandwich bots only bother with public-mempool pool trades that move the price this much. */
const MEV_MIN_IMPACT = 0.01;
const MEV_MAX_CHANCE = 0.6;
export const TX_EXPIRED = 'transaction expired: priority fee too low for current congestion';
/** A sell too small for its proceeds to pay the platform and network fees (refused before it is sent). */
export const PROCEEDS_BELOW_FEES = 'proceeds do not cover fees';

export type TradeSource = Order['source'];

/** What to trade. Manual swaps, orders, copy trades and snipes all reduce to this. */
export interface TradeIntent {
  chain: ChainId;
  token: string;
  side: Side;
  amount: number;
  amountKind: AmountKind;
  presetId?: PresetId;
  slippage?: number;
  priorityFee?: number;
  antiMev?: boolean;
  strategy?: StrategySpec | null;
}

/** A validated intent bound to the account's wallet, the token and the effective preset. */
export interface Ticket {
  accountId: string;
  wallet: WalletState;
  token: TokenState;
  side: Side;
  amount: number;
  amountKind: AmountKind;
  /** Preset with request overrides applied (an explicit slippage turns auto slippage off). */
  preset: TradePreset;
  strategy: StrategySpec | null;
  /** Origin, inherited by the exit orders a strategy creates. */
  source: TradeSource;
}

export interface Fill {
  ticket: Ticket;
  receipt: SwapReceipt;
}

interface ExecOptions {
  /** Checked after the latency; a returned reason aborts the trade (e.g. its order was cancelled meanwhile). */
  guard?: () => string | null;
}

export interface ExecResult {
  receipt: SwapReceipt;
  /** Set when the guard aborted the trade before it reached the ledger. */
  aborted: string | null;
}

type Priced = { ok: true; quote: Quote } | { ok: false; error: string };

/** Both legs of a priced trade: what goes in and comes out, and the venue-level native/token amounts. */
interface Legs {
  amountIn: number;
  expectedOut: number;
  /** Native side as the ledger records it (gross of platform/network fees, net of token tax on sells). */
  nativeLeg: number;
  tokenLeg: number;
  balanceBefore: number;
  priceImpact: number;
}

function failedReceipt(error: string, latencyMs: number, quote?: Quote): SwapReceipt {
  return {
    ok: false,
    error,
    nativeAmount: 0,
    tokenAmount: 0,
    usdAmount: 0,
    priceUsd: 0,
    platformFeeNative: 0,
    networkFeeNative: 0,
    priceImpact: quote?.priceImpact ?? 0,
    mevLossNative: 0,
    txHash: null,
    latencyMs,
    orders: [],
  };
}

/** A filled ledger outcome as a receipt (its exit orders, if any, are attached by the caller). */
export function fillReceipt(outcome: SwapOutcome & { trade: Trade }, latencyMs: number, quote?: Quote): SwapReceipt {
  return {
    ok: true,
    trade: outcome.trade,
    nativeAmount: outcome.nativeAmount,
    tokenAmount: outcome.tokenAmount,
    usdAmount: outcome.usdAmount,
    priceUsd: outcome.trade.priceUsd,
    platformFeeNative: outcome.platformFeeNative,
    networkFeeNative: outcome.networkFeeNative,
    priceImpact: outcome.result?.priceImpact ?? quote?.priceImpact ?? 0,
    mevLossNative: outcome.mevLossNative,
    txHash: outcome.trade.txHash,
    latencyMs,
    orders: [],
  };
}

/** Network cost of one swap under a preset: base fee + priority fee (+ the builder tip on the anti-MEV route). */
export function networkFeeOf(chain: ChainId, preset: TradePreset): number {
  return CHAINS[chain].baseNetworkFee + preset.priorityFee + (preset.antiMev ? preset.tip : 0);
}

/** What a preset bids for block space: its priority fee, plus the builder tip on the anti-MEV route. */
function priorityBid(preset: TradePreset): number {
  return preset.priorityFee + (preset.antiMev ? preset.tip : 0);
}

/**
 * Simulated confirmation latency: 120-600ms (+150ms anti-MEV), stretched by congestion
 * x (1 + 3 * max(0, level - 0.2) * w), where w = 1 for a bid below the suggested medium fee,
 * 0.5 below the high fee and 0.25 at or above it.
 */
export function landingLatencyMs(rng: Rng, chain: ChainId, preset: TradePreset, level: number): number {
  const tiers = priorityFeeTiers(chain, level);
  const bid = priorityBid(preset);
  const weight = bid >= tiers.high ? 0.25 : bid >= tiers.medium ? 0.5 : 1;
  const base = rng.int(LATENCY.min, LATENCY.max) + (preset.antiMev ? LATENCY.antiMevExtra : 0);
  return Math.round(base * (1 + 3 * Math.max(0, level - 0.2) * weight));
}

/** While congested, a bid below the suggested low fee fails to land with p = 0.25 + (level - 0.7) (25-55%). */
export function expiresUnderCongestion(rng: Rng, chain: ChainId, preset: TradePreset, level: number): boolean {
  if (congestionLabel(level) !== 'congested' || priorityBid(preset) >= priorityFeeTiers(chain, level).low) return false;
  return rng.chance(0.25 + (level - CONGESTED_LEVEL));
}

/** Fixed latency from TRADE_LATENCY_MS (tests use 0), or null for the simulated random latency. */
export function latencyFromEnv(): number | null {
  const raw = process.env.TRADE_LATENCY_MS;
  if (raw === undefined || raw.trim() === '') return null;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

const reserveKey = (wallet: WalletState, token: TokenState) => `${wallet.address}|${token.address}`;

export class Executor {
  /** `${accountId}|${clientId}` -> first receipt of that client request. */
  private readonly replays = new Map<string, { at: number; receipt: Promise<SwapReceipt> }>();
  /** accountId -> sim times of recent manual swaps (rate limit window). */
  private readonly recentSwaps = new Map<string, number[]>();
  /**
   * `${wallet}|${token}` -> tokens committed to sells still in flight. Percent
   * sells size themselves from the holding net of these, so exit legs that
   * trigger together (two "sell 50%" take-profits in one tick) act like
   * sequential sells of the remaining holding instead of each selling half
   * of the same pre-trigger bag.
   */
  private readonly reserved = new Map<string, { tokens: number; sells: number }>();

  constructor(
    private readonly ctx: AppContext,
    /** Post-fill bookkeeping owned by the facade; returns exit orders created for the fill. */
    private readonly onFill: (fill: Fill) => Order[],
    private readonly fixedLatencyMs: number | null,
  ) {}

  install(): void {
    this.ctx.engine.addTicker('trading-housekeeping', () => this.prune(), { everyMs: HOUSEKEEPING_EVERY_MS });
  }

  quote(accountId: string, intent: TradeIntent): Quote {
    const priced = this.price(this.ticket(accountId, intent, 'manual'));
    if (!priced.ok) throw new HttpError(400, priced.error, 'quote_unavailable');
    return priced.quote;
  }

  /** Manual swap: idempotent per clientId for 60s and rate limited per account. */
  swap(accountId: string, req: SwapRequest): Promise<SwapReceipt> {
    const now = this.ctx.world.now;
    const key = req.clientId ? `${accountId}|${req.clientId}` : null;
    const replay = key ? this.replays.get(key) : undefined;
    if (replay && now - replay.at < IDEMPOTENCY_WINDOW_MS) return replay.receipt;
    this.takeRateLimitSlot(accountId, now);
    const ticket = this.ticket(accountId, req, 'manual');
    const receipt = this.run(ticket).then((r) => r.receipt);
    if (key) this.replays.set(key, { at: now, receipt });
    return receipt;
  }

  /** Automated execution (orders, copy trades, snipes): invalid intents become failed receipts. */
  async submit(accountId: string, intent: TradeIntent, source: TradeSource, opts: ExecOptions = {}): Promise<ExecResult> {
    let ticket: Ticket;
    try {
      ticket = this.ticket(accountId, intent, source);
    } catch (err) {
      if (err instanceof HttpError) return { receipt: failedReceipt(err.message, 0), aborted: null };
      throw err;
    }
    return this.run(ticket, opts);
  }

  /** Validate an intent and bind it to wallet, token and effective preset. Throws 404/400. */
  ticket(accountId: string, intent: TradeIntent, source: TradeSource): Ticket {
    const { world, accounts } = this.ctx;
    const token = world.getToken(normalizeAddress(intent.token));
    if (!token || token.chain !== intent.chain) throw notFound('token');
    assertAmount(intent.side, intent.amount, intent.amountKind);
    const settings = accounts.getSettings(accountId).trade[intent.chain];
    const isBuy = intent.side === 'buy';
    const presetId = intent.presetId ?? (isBuy ? settings.activeBuyPreset : settings.activeSellPreset);
    const preset: TradePreset = { ...(isBuy ? settings.buyPresets : settings.sellPresets)[presetId] };
    if (intent.slippage !== undefined) {
      preset.slippage = intent.slippage;
      preset.autoSlippage = false;
    }
    if (intent.priorityFee !== undefined) preset.priorityFee = intent.priorityFee;
    if (intent.antiMev !== undefined) preset.antiMev = intent.antiMev;
    return {
      accountId,
      wallet: accounts.walletFor(accountId, intent.chain),
      token,
      side: intent.side,
      amount: intent.amount,
      amountKind: intent.amountKind,
      preset,
      strategy: isBuy ? (intent.strategy ?? null) : null,
      source,
    };
  }

  /** Price a ticket against the current state, mirroring World.executeSwap. */
  price(ticket: Ticket): Priced {
    const { world } = this.ctx;
    const { token: t, side, preset } = ticket;
    if (t.status === 'migrating') return { ok: false, error: 'token is migrating; try again in a few seconds' };
    const networkFee = networkFeeOf(t.chain, preset);
    const legs = side === 'buy' ? this.buyLegs(ticket) : this.sellLegs(ticket, networkFee);
    if ('error' in legs) return { ok: false, error: legs.error };
    const slippage = preset.autoSlippage ? this.autoSlippage(t, legs.priceImpact) : preset.slippage;
    return {
      ok: true,
      quote: {
        chain: t.chain,
        token: t.address,
        side,
        amountIn: legs.amountIn,
        expectedOut: legs.expectedOut,
        minOut: minOutWithSlippage(legs.expectedOut, slippage),
        priceImpact: legs.priceImpact,
        executionPriceUsd: (legs.nativeLeg / legs.tokenLeg) * world.nativeUsd(t.chain),
        platformFeeNative: legs.nativeLeg * PLATFORM_FEE_RATE,
        networkFeeNative: networkFee,
        slippage,
        route: t.pool ? 'pool' : 'curve',
        venue: t.pool?.dex ?? getLaunchpad(t.launchpad)?.name ?? t.launchpad,
        balanceBefore: legs.balanceBefore,
      },
    };
  }

  /** Native in, tokens out; platform and network fees are paid on top. */
  private buyLegs({ token: t, wallet, amount }: Ticket): Legs | { error: string } {
    const venue = this.ctx.world.quote(t, 'buy', amount * (1 - t.buyTax));
    if (!venue || venue.amountOut <= 0) return { error: 'no liquidity' };
    // A buy that completes the curve only spends (and needs) what the curve can absorb.
    const used = venue.amountIn / (1 - t.buyTax);
    return {
      amountIn: venue.completesCurve ? used : amount,
      expectedOut: venue.amountOut,
      nativeLeg: used,
      tokenLeg: venue.amountOut,
      balanceBefore: wallet.native,
      priceImpact: venue.priceImpact,
    };
  }

  /** Tokens in, native out net of token tax, platform fee and network fee. */
  private sellLegs({ token: t, wallet, amount, amountKind }: Ticket, networkFee: number): Legs | { error: string } {
    const held = balanceOf(wallet, t);
    if (held <= 0) return { error: 'no token balance' };
    // What sells still in flight will take is not available again. When they
    // already cover the whole balance, size from all of it: whichever lands
    // first wins, and the other sells what is left (the ledger scales its
    // minOut to that), is voided by its guard, or fails when nothing is left.
    const pending = this.reserved.get(reserveKey(wallet, t))?.tokens ?? 0;
    const free = held - pending > held * 1e-9 ? held - pending : held;
    const amountIn = amountKind === 'tokens' ? Math.min(amount, free) : amount >= 100 ? free : (free * amount) / 100;
    const venue = this.ctx.world.quote(t, 'sell', amountIn);
    if (!venue || venue.amountOut <= 0) return { error: 'no liquidity' };
    const nativeLeg = venue.amountOut * (1 - t.sellTax);
    const expectedOut = nativeLeg * (1 - PLATFORM_FEE_RATE) - networkFee;
    if (expectedOut <= 0) return { error: PROCEEDS_BELOW_FEES };
    return { amountIn, expectedOut, nativeLeg, tokenLeg: amountIn, balanceBefore: held, priceImpact: venue.priceImpact };
  }

  autoSlippage(t: TokenState, priceImpact: number): number {
    const { world } = this.ctx;
    const s = AUTO_SLIPPAGE;
    const momentum = Math.abs(world.windowStats(t, '5m').priceChange);
    let slippage = s.base + Math.max(t.buyTax, t.sellTax) + priceImpact * s.impactWeight + momentum * s.momentumWeight;
    if (world.now - t.createdAt < HOUR_MS) slippage += s.youngBonus;
    return clamp(slippage, s.min, s.max);
  }

  /**
   * A launch's creation-block buy: fills at once (no confirmation latency,
   * slippage check or sandwich: nothing trades before it), paying the platform
   * fee and the preset's network fee like any buy.
   */
  fillAtLaunch(ticket: Ticket): SwapReceipt {
    const { wallet, token, amount, preset } = ticket;
    const outcome = this.ctx.world.executeSwap(wallet, token, 'buy', amount, { platformFeeRate: PLATFORM_FEE_RATE, networkFee: networkFeeOf(token.chain, preset) });
    return this.settle(ticket, outcome, 0);
  }

  private async run(ticket: Ticket, opts: ExecOptions = {}): Promise<ExecResult> {
    const { world } = this.ctx;
    const { token, wallet, side, preset } = ticket;
    const priced = this.price(ticket);
    if (!priced.ok) return { receipt: failedReceipt(priced.error, 0), aborted: null };
    const { quote } = priced;
    if (side === 'buy') {
      // Same pre-flight rule as the ledger: amount + platform fee + network fee.
      const needed = quote.amountIn * (1 + PLATFORM_FEE_RATE) + quote.networkFeeNative;
      if (wallet.native + 1e-12 < needed) {
        const symbol = CHAINS[token.chain].nativeSymbol;
        return { receipt: failedReceipt(`insufficient ${symbol} balance: ${formatNative(needed, symbol)} needed incl. fees`, 0, quote), aborted: null };
      }
    }

    const release = side === 'sell' ? this.reserve(wallet, token, quote.amountIn) : () => {};
    try {
      const latencyMs = this.fixedLatencyMs ?? landingLatencyMs(world.rng, token.chain, preset, world.chains[token.chain].congestion);
      await sleep(latencyMs);
      const aborted = opts.guard?.() ?? null;
      if (aborted) return { receipt: failedReceipt(aborted, latencyMs, quote), aborted };
      // an expired transaction never lands, so it costs nothing
      if (expiresUnderCongestion(world.rng, token.chain, preset, world.chains[token.chain].congestion)) {
        return { receipt: failedReceipt(TX_EXPIRED, latencyMs, quote), aborted: null };
      }

      // From here the ledger balance itself reflects what this sell takes.
      release();
      // A buy asks for what was requested: the curve caps it again, exactly, at what it can absorb now.
      const outcome = world.executeSwap(wallet, token, side, side === 'buy' ? ticket.amount : quote.amountIn, {
        platformFeeRate: PLATFORM_FEE_RATE,
        networkFee: quote.networkFeeNative,
        minOut: quote.minOut,
        mevLossRate: this.sandwichLoss(preset.antiMev, quote),
      });
      return { receipt: this.settle(ticket, outcome, latencyMs, quote), aborted: null };
    } finally {
      release();
    }
  }

  /** Hold `tokens` of the wallet's balance for an in-flight sell; the returned release is idempotent. */
  private reserve(wallet: WalletState, token: TokenState, tokens: number): () => void {
    const key = reserveKey(wallet, token);
    let r = this.reserved.get(key);
    if (!r) this.reserved.set(key, (r = { tokens: 0, sells: 0 }));
    r.tokens += tokens;
    r.sells++;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      const cur = this.reserved.get(key);
      if (!cur) return;
      cur.tokens -= tokens;
      if (--cur.sells <= 0) this.reserved.delete(key);
    };
  }

  /** Ledger outcome -> receipt; a fill also gets the post-fill bookkeeping and fan-out. */
  private settle(ticket: Ticket, outcome: SwapOutcome, latencyMs: number, quote?: Quote): SwapReceipt {
    const { world, hub, accounts } = this.ctx;
    const { accountId, token } = ticket;
    if (!outcome.ok || !outcome.trade) return failedReceipt(outcome.error ?? 'swap failed', latencyMs, quote);
    const receipt = fillReceipt({ ...outcome, trade: outcome.trade }, latencyMs, quote);
    receipt.orders = this.onFill({ ticket, receipt }).map((o) => ({ ...o }));
    hub.publishUser(accountId, 'fill', receipt);
    accounts.pushBalance(accountId, token.chain);
    accounts.recordTradeVolume(accountId, receipt.usdAmount, receipt.platformFeeNative * world.nativeUsd(token.chain));
    return receipt;
  }

  /**
   * Share of the output a sandwich bot extracts (0 when not attacked). Real
   * bots size the front-run to stay inside the victim's slippage tolerance,
   * so the loss is capped just below it and the trade still fills.
   */
  private sandwichLoss(antiMev: boolean, quote: Quote): number {
    if (antiMev || quote.route !== 'pool' || quote.priceImpact <= MEV_MIN_IMPACT) return 0;
    const rng = this.ctx.world.rng;
    if (!rng.chance(Math.min(MEV_MAX_CHANCE, quote.priceImpact * 10))) return 0;
    return Math.min(quote.priceImpact * rng.float(0.3, 0.8), quote.slippage * 0.9);
  }

  private takeRateLimitSlot(accountId: string, now: number): void {
    const recent = (this.recentSwaps.get(accountId) ?? []).filter((t) => now - t < 1000);
    if (recent.length >= MAX_SWAPS_PER_SECOND) {
      // seconds until the oldest swap in the window ages out
      const retry = Math.max(1, Math.ceil((recent[0] + 1000 - now) / 1000));
      throw new HttpError(429, 'too many swaps; slow down', 'rate_limited', { 'retry-after': String(retry) });
    }
    recent.push(now);
    this.recentSwaps.set(accountId, recent);
  }

  private prune(): void {
    const now = this.ctx.world.now;
    for (const [key, replay] of this.replays) if (now - replay.at >= IDEMPOTENCY_WINDOW_MS) this.replays.delete(key);
    for (const [accountId, times] of this.recentSwaps) if (times.every((t) => now - t >= 1000)) this.recentSwaps.delete(accountId);
  }
}
