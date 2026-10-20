// The venue seam: each venue detects whether it can trade a token, quotes an
// exact-input trade and builds the plan's transactions. The router (router.ts)
// runs them in the chain's detection order: bonding curves first, then pools.

import type { Address, PublicClient } from 'viem';
import type { Side } from '@trenchscope/shared';
import type { EvmChainId, EvmChainInfo } from '../../chains';
import type { EvmVenueContracts } from '../contracts';
import type { KyberClient } from '../kyber';
import type { TokenInfo } from '../rpc';
import type { EvmPlanStep, EvmQuote, EvmVenueId, PlatformFeeMode, V4PoolKey, VenueQuoteData } from '../types';

export interface VenueEnv {
  chain: EvmChainId;
  client: PublicClient;
  info: EvmChainInfo;
  contracts: EvmVenueContracts;
  /** Fee wallet; null (or feeBps 0) disables the platform fee. */
  feeWallet: Address | null;
  feeBps: number;
  /** When a separate fee transfer is used: before the swap (spec default) or after it confirms. */
  separateFeeTiming: 'before' | 'after';
  kyber: KyberClient | null;
  nowMs(): number;
}

/** What detection found: the token is on this venue's curve, graduated from it, or tradable in its pools. */
export interface Detection {
  status: 'curve' | 'graduated' | 'pool';
  data?: unknown;
}

export interface QuoteInput {
  token: TokenInfo;
  side: Side;
  /** Buys: wei to spend, platform fee included. Sells: token units. */
  amountIn: bigint;
  /** The wallet to quote for (a placeholder for buys without a wallet). */
  wallet: Address;
  walletIsReal: boolean;
  /** The wallet's native balance (null when no real wallet): decides whether a sell can prepay its fee. */
  nativeBalance: bigint | null;
  v4PoolKey?: V4PoolKey;
}

export interface VenueQuote {
  venue: EvmVenueId;
  route: 'curve' | 'pool';
  routeLabel: string;
  /** Input reaching the venue: buys amountIn - platform fee (when the fee is not taken by the venue); sells amountIn. */
  venueAmountIn: bigint;
  /** Venue output before the platform fee (tokens for buys, wei for sells). */
  grossOut: bigint;
  /** What the wallet ends up with net of every fee (tokens for buys, wei for sells). */
  expectedOut: bigint;
  /** Native leg in wei (buys: venueAmountIn; sells: grossOut). */
  nativeLeg: bigint;
  platformFee: bigint;
  feeMode: PlatformFeeMode;
  venueFeeBps: number;
  tokenTaxBps: number;
  /** Gas units of the swap transaction alone. */
  swapGas: bigint;
  priceImpactBps: number;
  venueData: VenueQuoteData;
}

export interface BuildInput {
  quote: EvmQuote;
  wallet: Address;
  /** Unix seconds; routers that take a deadline get it. */
  deadline: number;
}

export interface BuildOutput {
  steps: EvmPlanStep[];
  /** Per-token contracts verified on-chain for this plan (Pons curve), accepted by the allow-list. */
  verifiedTargets: Address[];
}

export interface Venue {
  readonly id: EvmVenueId;
  /** Cheap on-chain probe; null when the venue cannot trade the token. */
  detect(env: VenueEnv, token: Address, hint?: V4PoolKey): Promise<Detection | null>;
  quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote>;
  build(env: VenueEnv, input: BuildInput): Promise<BuildOutput>;
}
