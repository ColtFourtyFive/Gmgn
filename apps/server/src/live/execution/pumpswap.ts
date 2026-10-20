// Direct PumpSwap route (pump.fun tokens after migration): the mint's canonical
// pump pool quoted in wrapped SOL, priced with the SDK's fee-aware pool math
// (market-cap fee tiers, creator fee, fee buckets) and traded with its v1 buy /
// sell builders, which wrap the SOL going in, unwrap the SOL coming out and
// create the user's token account. Same bounds as the curve route: buys are
// exact-token buys bounded by a max SOL cost, sells are bounded by a minimum SOL
// out, computed here in integers and handed to the builders as explicit limits.
// A mint without a canonical WSOL pool (or a pool the loader cannot read) is
// left to Jupiter.

import { createRequire } from 'node:module';
import type * as PumpSwapSdk from '@pump-fun/pump-swap-sdk';
import type { SwapSolanaState } from '@pump-fun/pump-swap-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { PublicKey, type Connection, type TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

// Loaded on first use through its CommonJS build, like the pump.fun SDK (see pump.ts).
const requireCjs = createRequire(import.meta.url);
let loaded: typeof PumpSwapSdk | null = null;
function sdk(): typeof PumpSwapSdk {
  return (loaded ??= requireCjs('@pump-fun/pump-swap-sdk') as typeof PumpSwapSdk);
}

export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
/**
 * Compute unit limits of the direct pool swaps. Measured on mainnet (simulateTransaction, October
 * 2026): a buy that wraps SOL and creates the user's Token-2022 account and volume accumulator
 * uses about 100-125k, a sell that unwraps about 90k; the limits leave room for heavier pools.
 */
export const PUMPSWAP_BUY_COMPUTE_UNITS = 200_000;
export const PUMPSWAP_SELL_COMPUTE_UNITS = 160_000;

/** Everything a pool swap needs, read from the chain. */
export interface PumpSwapState {
  /** The SDK's swap state: pool, reserves, configs, token programs, the user's token accounts. */
  swap: SwapSolanaState;
  /** The user's pump-amm volume accumulator (a first buy creates it, at the user's expense). */
  volumeAccumulator: PublicKey;
  volumeAccumulatorExists: boolean;
}

export interface PumpSwapLoader {
  /** The mint's canonical WSOL pool for a trade by `user`; null when there is none. */
  load(mint: PublicKey, user: PublicKey): Promise<PumpSwapState | null>;
}

/** The canonical pump pool of a mint graduated from a SOL curve. */
export function canonicalPoolOf(mint: PublicKey): PublicKey {
  return sdk().canonicalPumpPoolPda(mint, NATIVE_MINT);
}

/** The wallet's pump-amm user volume accumulator PDA (a first buy creates it). */
export function poolVolumeAccumulatorOf(user: PublicKey): PublicKey {
  return sdk().userVolumeAccumulatorPda(user);
}

export class OnlinePumpSwapLoader implements PumpSwapLoader {
  constructor(private readonly connection: Connection) {}

  async load(mint: PublicKey, user: PublicKey): Promise<PumpSwapState | null> {
    const s = sdk();
    const poolKey = canonicalPoolOf(mint);
    const volumeAccumulator = poolVolumeAccumulatorOf(user);
    // One round trip to see whether the pool exists (the SDK's state loader throws on a missing pool).
    const [poolInfo, volumeInfo] = await this.connection.getMultipleAccountsInfo([poolKey, volumeAccumulator], 'confirmed');
    if (!poolInfo || !poolInfo.owner.equals(new PublicKey(PUMPSWAP_PROGRAM_ID))) return null;
    const swap = await new s.OnlinePumpAmmSdk(this.connection).swapSolanaState(poolKey, user);
    if (!swap.pool.baseMint.equals(mint) || !swap.pool.quoteMint.equals(NATIVE_MINT)) return null;
    return { swap, volumeAccumulator, volumeAccumulatorExists: !!volumeInfo };
  }
}

const toBN = (v: bigint) => new BN(v.toString());
const toBig = (v: BN) => BigInt(v.toString());

/** The pool arguments of the SDK's pure pricing functions. */
function poolArgs(state: PumpSwapState) {
  const { pool, poolBaseAmount, poolQuoteAmount, globalConfig, feeConfig, baseMint, baseMintAccount, quoteTransferFee } = state.swap;
  return {
    baseReserve: poolBaseAmount,
    quoteReserve: poolQuoteAmount,
    virtualQuoteReserves: pool.virtualQuoteReserves,
    globalConfig,
    feeConfig,
    baseMint,
    baseMintAccount,
    coinCreator: pool.coinCreator,
    creator: pool.creator,
    quoteMint: pool.quoteMint,
    isMayhemMode: pool.isMayhemMode,
    creatorFeeBps: pool.creatorFeeBps,
    quoteTransferFee: quoteTransferFee ?? null,
  };
}

/** Lamports per token base unit at the pool's current reserves (fees excluded). */
function spotLamportsPerToken(state: PumpSwapState): number {
  const { pool, poolBaseAmount, poolQuoteAmount } = state.swap;
  const quote = Number(poolQuoteAmount.add(pool.virtualQuoteReserves).toString());
  const base = Number(poolBaseAmount.toString());
  return base > 0 ? quote / base : 0;
}

/** Whether the pool can be traded at all (both reserves non-zero). */
export function poolIsTradable(state: PumpSwapState): boolean {
  return !state.swap.poolBaseAmount.isZero() && !state.swap.poolQuoteAmount.isZero();
}

/** Tokens (base units) `lamports` buy now, fees included, and the price impact vs. the spot price. */
export function quotePoolBuy(state: PumpSwapState, lamports: bigint): { tokens: bigint; priceImpact: number } {
  const { base } = sdk().buyQuoteInput({ ...poolArgs(state), quote: toBN(lamports), slippage: 0 });
  const tokens = toBig(base);
  const spot = spotLamportsPerToken(state);
  const priceImpact = tokens > 0n && spot > 0 ? Math.max(0, Number(lamports) / Number(tokens) / spot - 1) : 0;
  return { tokens, priceImpact };
}

/** Lamports `tokens` (base units) sell for now, fees deducted, and the price impact vs. the spot price. */
export function quotePoolSell(state: PumpSwapState, tokens: bigint): { lamports: bigint; priceImpact: number } {
  const { pool } = state.swap;
  const { uiQuote } = sdk().sellBaseInput({ ...poolArgs(state), feeBucketsTotal: pool.protocolFees.add(pool.creatorFees), base: toBN(tokens), slippage: 0 });
  const lamports = toBig(uiQuote);
  const spot = spotLamportsPerToken(state);
  const priceImpact = tokens > 0n && spot > 0 ? Math.max(0, 1 - Number(lamports) / Number(tokens) / spot) : 0;
  return { lamports, priceImpact };
}

/** Exact-token buy paying at most `maxLamports` (wraps them, unwraps what is left, creates the token account). */
export function poolBuyInstructions(state: PumpSwapState, tokens: bigint, maxLamports: bigint): Promise<TransactionInstruction[]> {
  return sdk().PUMP_AMM_SDK.buyInstructions(state.swap, toBN(tokens), toBN(maxLamports));
}

/** Sell `tokens` for at least `minLamports` (unwrapped to SOL in the same transaction). */
export function poolSellInstructions(state: PumpSwapState, tokens: bigint, minLamports: bigint): Promise<TransactionInstruction[]> {
  return sdk().PUMP_AMM_SDK.sellInstructions(state.swap, toBN(tokens), toBN(minLamports));
}

/** The token program of the pool's base mint (SPL Token or Token-2022). */
export function poolTokenProgram(state: PumpSwapState): PublicKey {
  return state.swap.baseTokenProgram;
}

/** pump-amm program errors (IDL code -> message), for readable failure reasons. */
export function pumpSwapErrorMessage(code: number): string | null {
  const idl = sdk().pumpAmmJson as unknown as { errors?: { code: number; name: string; msg?: string }[] };
  const e = idl.errors?.find((x) => x.code === code);
  return e ? (e.msg ?? e.name) : null;
}
