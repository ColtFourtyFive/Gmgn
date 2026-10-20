// Direct pump.fun bonding-curve route (tokens still on their curve): curve
// state from the chain, quotes from the SDK's fee-aware curve math and the
// SDK's buy / sell instruction builders. Buys are exact-token buys bounded by
// a max SOL cost (the requested amount plus slippage); sells are bounded by a
// minimum SOL out. The slippage bound is computed here in integers and handed
// to the SDK with its own slippage at 0, so the instruction carries it exactly.

import { createRequire } from 'node:module';
import type * as PumpSdk from '@pump-fun/pump-sdk';
import type { BondingCurve, FeeConfig, Global } from '@pump-fun/pump-sdk';
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, type AccountInfo, type Connection, type TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

// The SDK (and Anchor under it) is loaded on first use through its CommonJS build: its ESM build
// imports Anchor's CommonJS named exports, which Node's ESM loader refuses, and demo mode never needs it.
const requireCjs = createRequire(import.meta.url);
let loaded: typeof PumpSdk | null = null;
function sdk(): typeof PumpSdk {
  return (loaded ??= requireCjs('@pump-fun/pump-sdk') as typeof PumpSdk);
}

export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
/** Compute unit limits of the direct curve swaps (a buy may also create the user's token account). */
export const PUMP_BUY_COMPUTE_UNITS = 200_000;
export const PUMP_SELL_COMPUTE_UNITS = 150_000;

/** Everything a curve swap needs, read from the chain. */
export interface PumpCurveState {
  global: Global;
  feeConfig: FeeConfig | null;
  bondingCurve: BondingCurve;
  bondingCurveAccountInfo: AccountInfo<Buffer>;
  /** The user's token account for the mint (null: the buy creates it). */
  associatedUserAccountInfo: AccountInfo<Buffer> | null;
  /** Token program owning the mint (SPL Token or Token-2022). */
  tokenProgram: PublicKey;
}

export interface PumpStateLoader {
  /** The mint's SOL-quoted curve for a trade by `user`; null when the mint has no such curve. */
  load(mint: PublicKey, user: PublicKey): Promise<PumpCurveState | null>;
}

/** Reads mint, curve, global and fee config (and both possible user token accounts) in one RPC round trip. */
export class OnlinePumpLoader implements PumpStateLoader {
  constructor(private readonly connection: Connection) {}

  async load(mint: PublicKey, user: PublicKey): Promise<PumpCurveState | null> {
    const pump = sdk();
    const ataToken = getAssociatedTokenAddressSync(mint, user, true, TOKEN_PROGRAM_ID);
    const ata2022 = getAssociatedTokenAddressSync(mint, user, true, TOKEN_2022_PROGRAM_ID);
    const [mintInfo, curveInfo, globalInfo, feeConfigInfo, userToken, user2022] = await this.connection.getMultipleAccountsInfo(
      [mint, pump.bondingCurvePda(mint), pump.GLOBAL_PDA, pump.PUMP_FEE_CONFIG_PDA, ataToken, ata2022],
      'confirmed',
    );
    if (!mintInfo || !curveInfo || !globalInfo) return null;
    const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const bondingCurve = pump.PUMP_SDK.decodeBondingCurve(curveInfo);
    if (!isSolCurve(bondingCurve)) return null;
    return {
      global: pump.PUMP_SDK.decodeGlobal(globalInfo),
      feeConfig: feeConfigInfo ? pump.PUMP_SDK.decodeFeeConfig(feeConfigInfo) : null,
      bondingCurve,
      bondingCurveAccountInfo: curveInfo,
      associatedUserAccountInfo: tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? user2022 : userToken,
      tokenProgram,
    };
  }
}

/** Curves quoted in SOL (the zero key on legacy curves, or wrapped SOL). */
export function isSolCurve(curve: BondingCurve): boolean {
  const q = curve.quoteMint;
  return !q || q.equals(PublicKey.default) || q.equals(NATIVE_MINT) || sdk().isSolLikeQuoteMint(q);
}

/** Complete (or migrated) curves no longer trade: the token moves to its AMM pool. */
export function curveIsTradable(state: PumpCurveState): boolean {
  return !state.bondingCurve.complete && !sdk().isBondingCurveMigrated(state.bondingCurve) && !state.bondingCurve.realTokenReserves.isZero();
}

const toBN = (v: bigint) => new BN(v.toString());
const toBig = (v: BN) => BigInt(v.toString());

function spotLamportsPerToken(curve: BondingCurve): number {
  return Number(curve.virtualQuoteReserves.toString()) / Number(curve.virtualTokenReserves.toString());
}

/** Tokens (base units) `lamports` buys now, fees included, and the price impact vs. the spot price. */
export function quoteCurveBuy(state: PumpCurveState, lamports: bigint): { tokens: bigint; priceImpact: number } {
  const { global, feeConfig, bondingCurve } = state;
  const tokens = toBig(
    sdk().getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: bondingCurve.tokenTotalSupply,
      bondingCurve,
      amount: toBN(lamports),
      quoteMint: NATIVE_MINT,
    }),
  );
  const spot = spotLamportsPerToken(bondingCurve);
  const priceImpact = tokens > 0n && spot > 0 ? Math.max(0, Number(lamports) / Number(tokens) / spot - 1) : 0;
  return { tokens, priceImpact };
}

/** Lamports `tokens` (base units) sell for now, fees deducted, and the price impact vs. the spot price. */
export function quoteCurveSell(state: PumpCurveState, tokens: bigint): { lamports: bigint; priceImpact: number } {
  const { global, feeConfig, bondingCurve } = state;
  const lamports = toBig(
    sdk().getSellSolAmountFromTokenAmount({ global, feeConfig, mintSupply: bondingCurve.tokenTotalSupply, bondingCurve, amount: toBN(tokens) }),
  );
  const spot = spotLamportsPerToken(bondingCurve);
  const priceImpact = tokens > 0n && spot > 0 ? Math.max(0, 1 - Number(lamports) / Number(tokens) / spot) : 0;
  return { lamports, priceImpact };
}

/** Exact-token buy paying at most `maxLamports` (creates the user's token account when missing). */
export function curveBuyInstructions(state: PumpCurveState, mint: PublicKey, user: PublicKey, tokens: bigint, maxLamports: bigint): Promise<TransactionInstruction[]> {
  return sdk().PUMP_SDK.buyInstructions({
    global: state.global,
    bondingCurveAccountInfo: state.bondingCurveAccountInfo,
    bondingCurve: state.bondingCurve,
    associatedUserAccountInfo: state.associatedUserAccountInfo,
    mint,
    user,
    amount: toBN(tokens),
    solAmount: toBN(maxLamports),
    slippage: 0,
    tokenProgram: state.tokenProgram,
  });
}

/** Sell `tokens` for at least `minLamports`. */
export function curveSellInstructions(state: PumpCurveState, mint: PublicKey, user: PublicKey, tokens: bigint, minLamports: bigint): Promise<TransactionInstruction[]> {
  return sdk().PUMP_SDK.sellInstructions({
    global: state.global,
    bondingCurveAccountInfo: state.bondingCurveAccountInfo,
    bondingCurve: state.bondingCurve,
    mint,
    user,
    amount: toBN(tokens),
    solAmount: toBN(minLamports),
    slippage: 0,
    tokenProgram: state.tokenProgram,
    mayhemMode: state.bondingCurve.isMayhemMode,
    cashback: state.bondingCurve.isCashbackCoin,
  });
}

/** The pump program's IDL (instruction and error definitions). */
export function pumpIdl(): unknown {
  return sdk().pumpIdl;
}

/** Pump program errors (IDL code -> message), for readable failure reasons. */
export function pumpErrorMessage(code: number): string | null {
  const idl = sdk().pumpIdl as unknown as { errors?: { code: number; name: string; msg?: string }[] };
  const e = idl.errors?.find((x) => x.code === code);
  return e ? (e.msg ?? e.name) : null;
}
