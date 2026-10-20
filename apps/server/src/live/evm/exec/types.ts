// Public types of the EVM execution engine. On-chain amounts are bigint base
// units everywhere (wei for native, token base units for tokens); floats only
// appear in the DTO helpers (dto.ts) at the API boundary.

import type { Address, Hex } from 'viem';
import type { PresetId, Side } from '@trenchscope/shared';
import type { EvmChainId } from '../chains';

/** Where a trade executes. Curves are launchpad bonding curves; the rest are pools. */
export type EvmVenueId =
  | 'fourmeme' //    four.meme TokenManager2 bonding curve (BNB Chain)
  | 'flap' //        Flap portal bonding curve (BNB Chain, Robinhood Chain)
  | 'pons' //        Pons v2 per-token bonding curve (Robinhood Chain)
  | 'uniswap-v4' //  Uniswap v4 pool(s) through the Universal Router (Clanker, Zora, Pons graduates, Pools.trade, ...)
  | 'uniswap-v3' //  Uniswap v3 pool through the Universal Router
  | 'uniswap-v2' //  Uniswap v2 pair through the Universal Router
  | 'pancake-v2' //  PancakeSwap v2 pair through the PancakeSwap v2 router (BNB Chain fallback)
  | 'kyberswap'; //  KyberSwap aggregator (any DEX-listed token)

export type EvmAmountKind = 'native' | 'token' | 'percent';

/** What to trade. Buys spend a native amount; sells take a token amount or a percentage of holdings. */
export interface EvmTradeIntent {
  chain: EvmChainId;
  token: Address;
  side: Side;
  /**
   * native: wei to spend, platform fee included (the wallet is debited exactly this plus gas);
   * token: token base units to sell; percent: basis points of the wallet's token balance (1..10000).
   */
  amount: bigint;
  amountKind: EvmAmountKind;
  /** Slippage tolerance in basis points, or 'auto' (2% + token tax + 1.5x price impact, clamped to 1%..50%). */
  slippageBps: number | 'auto';
  /** The app's speed preset slot; maps to a priority-fee multiplier (gas.ts). */
  speed: PresetId;
  /** Send through the chain's private RPC when configured (no effect on sequencer chains). */
  antiMev: boolean;
  /** The trading wallet: required for sells (balance, simulation) and percent amounts; buys quote without it. */
  wallet?: Address;
  /** Pool hint from the market feed (skips v4 pool discovery when given). */
  v4PoolKey?: V4PoolKey;
  /** Restrict routing to these venues (tests, retries); default: detection order for the chain. */
  venues?: EvmVenueId[];
}

export interface V4PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** One hop of a v4 path, from the input side. */
export interface V4Hop {
  key: V4PoolKey;
  /** Currency entering this hop (0x0 = native ETH). */
  currencyIn: Address;
  currencyOut: Address;
}

/** How the platform fee is collected for a route. */
export type PlatformFeeMode =
  | 'atomic' //           inside the swap transaction (aggregator fee, Universal Router TRANSFER / PAY_PORTION, four.meme sell feeRate)
  | 'separate-before' //  a native transfer to the fee wallet sent immediately before the swap
  | 'separate-after' //   a native transfer sent right after the swap confirms (sells when the wallet cannot prepay it)
  | 'none'; //            no fee wallet configured or PLATFORM_FEE_BPS = 0

export interface EvmFeeBreakdown {
  platformFeeBps: number;
  /** Platform fee in wei (native), exactly what the plan transfers (for bps-of-output modes: of the expected output). */
  platformFee: bigint;
  platformFeeMode: PlatformFeeMode;
  /** Protocol / LP fee of the venue in basis points of the trade, when known (curve trading fee, pool fee tier). */
  venueFeeBps: number;
  /** venueFeeBps applied to the native leg (wei), an estimate. */
  venueFee: bigint;
  /** Token transfer tax in basis points (Flap tax tokens, four.meme tax tokens), when known. */
  tokenTaxBps: number;
  /** Gas units of the whole plan (approvals + fee transfer + swap). */
  gasUnits: bigint;
  /** Expected network cost of the plan in wei at the speed preset's fee level. */
  gasCost: bigint;
  /** Everything the trade costs over its native notional, in basis points (platform + venue + tax + gas). */
  totalCostBps: number;
}

export interface EvmQuote {
  id: string;
  chain: EvmChainId;
  token: Address;
  side: Side;
  intent: EvmTradeIntent;
  venue: EvmVenueId;
  route: 'curve' | 'pool';
  /** Human-readable route, e.g. "pons curve", "kyberswap: uniswap-v4-clanker". */
  routeLabel: string;
  tokenDecimals: number;
  tokenSymbol: string;
  /** Wallet balance before: native wei (buy) or token units (sell); null when no wallet was given. */
  balanceBefore: bigint | null;
  /** Total input: wei (buy, platform fee included) or token units (sell). */
  amountIn: bigint;
  /** Input reaching the venue (buys: amountIn minus the platform fee; sells: amountIn). */
  venueAmountIn: bigint;
  /** What the wallet receives, all fees and taxes deducted: tokens (buy) or wei (sell). */
  expectedOut: bigint;
  /** expectedOut after slippage: the transaction reverts below it. */
  minOut: bigint;
  slippageBps: number;
  priceImpactBps: number;
  /** Native leg of the trade in wei (buys: venueAmountIn; sells: expected venue output before the platform fee). */
  nativeLeg: bigint;
  fees: EvmFeeBreakdown;
  createdAt: number;
  expiresAt: number;
  /** Venue-specific data prepare() needs (pool path, curve address, aggregator route...). */
  venueData: VenueQuoteData;
}

export type VenueQuoteData =
  | {
      venue: 'fourmeme';
      tokenManager: Address;
      /** 0x0 = BNB-quoted (TokenManager2 directly); otherwise an ERC-20 quote (Helper3 buyWithEth / sellForEth). */
      quoteToken: Address;
      helper: Address;
      /** Sells: gross funds of the simulated sale (TokenSale.cost), what sellToken's minFunds is checked against. */
      grossFunds: bigint | null;
    }
  | { venue: 'flap'; portal: Address }
  | { venue: 'pons'; curve: Address }
  | { venue: 'uniswap-v4'; hops: V4Hop[] }
  | { venue: 'uniswap-v3'; fee: number; pool: Address }
  | { venue: 'uniswap-v2'; pair: Address }
  | { venue: 'pancake-v2'; pair: Address }
  | { venue: 'kyberswap'; routeSummary: unknown; routerAddress: Address; chainSlug: string };

export type EvmPlanStepKind = 'approve' | 'permit2-approve' | 'fee' | 'swap' | 'transfer';

/** One unsigned transaction of a plan; gas, fees and nonce are filled in by send(). */
export interface EvmPlanStep {
  kind: EvmPlanStepKind;
  to: Address;
  data: Hex;
  value: bigint;
  description: string;
  /** 'after-swap' steps are sent only once the swap confirmed successfully (separate-after fees). */
  timing: 'before-swap' | 'swap' | 'after-swap';
  /** Gas used in the last simulation of the plan (set by simulate()). */
  gasEstimate?: bigint;
}

/** Ordered unsigned transactions for one trade from one wallet. */
export interface EvmTxPlan {
  id: string;
  chain: EvmChainId;
  wallet: Address;
  quote: EvmQuote;
  steps: EvmPlanStep[];
  /** Swap deadline (unix seconds) baked into router calldata, where the venue supports one. */
  deadline: number | null;
  createdAt: number;
}

export interface EvmStepSimulation {
  kind: EvmPlanStepKind;
  ok: boolean;
  gasUsed: bigint;
  error: string | null;
}

export interface EvmSimulation {
  ok: boolean;
  /** 'eth_simulateV1' runs the whole plan in order; 'estimateGas' only checks the first step (RPC without simulateV1). */
  method: 'eth_simulateV1' | 'estimateGas';
  steps: EvmStepSimulation[];
  /** Tokens the wallet receives (buy) or sends (sell), from the simulated Transfer logs. */
  tokenDelta: bigint | null;
  /** Native received by the wallet from the swap (sells), from traced native transfers. */
  nativeReceived: bigint | null;
  /** Native the fee wallet received across the plan. */
  feeReceived: bigint | null;
  gasUsed: bigint;
  error: string | null;
}

export interface EvmSentTx {
  kind: EvmPlanStepKind;
  hash: Hex;
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** 'private' when sent through the chain's MEV-protected RPC. */
  via: 'public' | 'private';
}

export interface EvmSendResult {
  planId: string;
  chain: EvmChainId;
  wallet: Address;
  txs: EvmSentTx[];
  /** Hash of the swap transaction. */
  swapHash: Hex;
  /** Fill of the swap once confirmed (send() waits for it). */
  fill: EvmFill;
  /** Separate fee transfer: hash and whether it landed (null when the fee is atomic or off). */
  feeTx: { hash: Hex | null; status: 'confirmed' | 'failed' | 'skipped' | 'pending' } | null;
}

export interface EvmFill {
  chain: EvmChainId;
  hash: Hex;
  status: 'success' | 'reverted';
  wallet: Address;
  token: Address;
  side: Side;
  venue: EvmVenueId | null;
  route: string;
  blockNumber: bigint;
  /** Block timestamp, ms. */
  timestamp: number;
  /** Tokens bought (received) or sold (sent), from the token's Transfer logs. */
  tokenAmount: bigint;
  /** Native into (buy) or out of (sell) the venue, platform fee and gas excluded. */
  nativeAmount: bigint;
  /** Native that actually left (buy) or reached (sell) the wallet through this swap, gas excluded. */
  walletNativeDelta: bigint;
  /** Platform fee paid in wei (in this transaction or the plan's separate fee transfer). */
  platformFee: bigint;
  /** Gas paid by this transaction in wei, L1 data fee included (OP Stack). */
  gasPaid: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  /** How nativeAmount was determined: venue event, wallet balance delta, calldata, or the quote (estimate). */
  nativeSource: 'event' | 'balance' | 'calldata' | 'estimate';
}
