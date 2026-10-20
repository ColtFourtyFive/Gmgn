// Shared contract: trading (quotes, swaps, sell initials, orders, strategies, portfolio, copy trade,
// sniper, alerts) and token launch. Conventions: ../types.ts.

import type { ChainId } from '../chains';
import type { PresetId, Side, Socials } from './common';
import type { TokenDetail, TokenPositionRow, Trade } from './tokens';
import type { SignalSubscriptionSpec } from './wallets';

export type AmountKind = 'native' | 'percent' | 'tokens';

/** Exit rules attached to a buy (GMGN "cooking"/strategy orders, auto-sell). */
export interface StrategySpec {
  /** Sell `sellPercent` of the position when price change from entry >= changePct. */
  takeProfits: { changePct: number; sellPercent: number }[];
  /** Sell `sellPercent` when price change from entry <= -lossPct. */
  stopLosses: { lossPct: number; sellPercent: number }[];
  /** Trailing stop: once armed, sell when price drops drawdownPct from the peak. */
  trailing: { drawdownPct: number; sellPercent: number; activateAtChangePct: number } | null;
  /** Sell this % of position when the dev sells (0 = off). */
  devSellPercent: number;
  /** Sell this % of position when the token migrates (0 = off). */
  migrationSellPercent: number;
}

export interface QuoteRequest {
  chain: ChainId;
  token: string;
  side: Side;
  amount: number;
  amountKind: AmountKind;
  presetId?: PresetId;
}

export interface Quote {
  chain: ChainId;
  token: string;
  side: Side;
  /** Input amount in native (buy) or tokens (sell). */
  amountIn: number;
  expectedOut: number;
  minOut: number;
  priceImpact: number;
  executionPriceUsd: number;
  platformFeeNative: number;
  networkFeeNative: number;
  slippage: number;
  route: 'curve' | 'pool';
  venue: string;
  /** Token balance before (sell) / native balance before (buy). */
  balanceBefore: number;
}

export interface SwapRequest extends QuoteRequest {
  /** Override preset slippage. */
  slippage?: number;
  priorityFee?: number;
  antiMev?: boolean;
  strategy?: StrategySpec;
  /** Client-side trace id for idempotency. */
  clientId?: string;
}

export interface SwapReceipt {
  ok: boolean;
  error?: string;
  trade?: Trade;
  nativeAmount: number;
  tokenAmount: number;
  usdAmount: number;
  priceUsd: number;
  platformFeeNative: number;
  networkFeeNative: number;
  priceImpact: number;
  /** Extra loss from a sandwich attack (only when antiMev is off). */
  mevLossNative: number;
  txHash: string | null;
  latencyMs: number;
  orders: Order[];
}

/** POST /api/trade/initials: size a "sell initials" (recover what the bag cost, keep the rest as a free ride). */
export interface SellInitialsRequest {
  chain: ChainId;
  token: string;
  /** Sell preset whose fees the sale pays (default: the active sell preset). */
  presetId?: PresetId;
}

/**
 * ok = selling `tokens` returns `targetNative` (the bag's cost basis) after fees; under_water = even the
 * whole bag returns less (`exitValueNative` < `targetNative`); no_position = nothing held;
 * nothing_to_recover = the bag has no cost basis (it cost nothing).
 */
export type SellInitialsStatus = 'ok' | 'under_water' | 'no_position' | 'nothing_to_recover';

export interface SellInitialsQuote {
  chain: ChainId;
  token: string;
  status: SellInitialsStatus;
  /** Tokens held. */
  balance: number;
  /** Cost basis of the tokens still held (USD, average cost incl. fees: what earlier sells left of it). */
  costBasisUsd: number;
  /** Native to take out: the cost basis at the native rate the position was bought at. */
  targetNative: number;
  /** Tokens to sell (status ok), else null. */
  tokens: number | null;
  /** tokens / balance (status ok), else null. */
  sellRate: number | null;
  /** Native that sale returns after tax, platform and network fees (>= targetNative when ok). */
  expectedOutNative: number;
  /** Native selling the whole bag would return now, after fees. */
  exitValueNative: number;
}

export type OrderKind =
  | 'limit_buy' //       buy when price/mcap crosses trigger in `direction` (below = buy the dip, above = breakout)
  | 'limit_sell' //      sell when price/mcap crosses trigger in `direction` (above = take profit, below = stop loss)
  | 'take_profit' //     sell when change from entry >= triggerValue pct
  | 'stop_loss' //       sell when change from entry <= -triggerValue pct
  | 'trailing_stop' //   sell when price falls triggerValue pct from the peak; armed immediately (trailing SL)
  //                     or once change >= activateAtChangePct (trailing TP)
  | 'dev_sell' //        sell when the dev sells >= devSellThreshold of their holdings in one trade
  | 'migration_buy' //   buy the moment the token migrates to its AMM pool ("migrated snipe")
  | 'migration_sell'; // sell the moment the token migrates

export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'failed' | 'expired';

export interface Order {
  id: string;
  accountId: string;
  chain: ChainId;
  token: string;
  tokenSymbol: string;
  kind: OrderKind;
  side: Side;
  /** What the trigger compares against. */
  triggerType: 'price' | 'mcap' | 'change' | 'event';
  /** Trigger value: USD price, USD mcap, or pct (e.g. 100 = +100%). */
  triggerValue: number;
  /** For change/trailing: entry reference price (USD). */
  refPriceUsd: number | null;
  /** For trailing stops: highest price seen since activation. */
  peakPriceUsd: number | null;
  /** For trailing stops: change pct needed to arm (null/0 = armed immediately). */
  activateAtChangePct: number | null;
  armed: boolean;
  /** For limit orders: which crossing triggers. */
  direction: 'above' | 'below' | null;
  /** For dev_sell: minimum share of the dev's holdings sold in one trade (0..1). */
  devSellThreshold: number | null;
  amount: number;
  amountKind: AmountKind;
  presetId: PresetId;
  /** Orders created together (strategy); filling a full exit cancels siblings. */
  groupId: string | null;
  /** Origin: manual, strategy (cooking), copytrade, sniper. */
  source: 'manual' | 'strategy' | 'copytrade' | 'sniper';
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  filledAt: number | null;
  receipt: SwapReceipt | null;
  failReason: string | null;
}

export interface CreateOrderRequest {
  chain: ChainId;
  token: string;
  kind: OrderKind;
  triggerType: Order['triggerType'];
  triggerValue: number;
  amount: number;
  amountKind: AmountKind;
  presetId?: PresetId;
  /** Hours until expiry; omit for GTC. */
  expiresInHours?: number;
  activateAtChangePct?: number;
  direction?: 'above' | 'below';
  devSellThreshold?: number;
}

export interface PortfolioSummary {
  chain: ChainId | 'all';
  totalValueUsd: number;
  nativeBalanceUsd: number;
  holdingsValueUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  winRate: number;
  positions: TokenPositionRow[];
  /** Equity curve (ms, usd). */
  equity: { t: number; valueUsd: number }[];
}

/** GET /api/portfolio/calendar: the account's daily realized PnL (the wallet page's calendar, all its wallets summed). */
export interface PortfolioCalendar {
  chain: ChainId | 'all';
  /** The last 30 UTC days, oldest first (day = UTC midnight, ms); zero on days without sells. */
  days: { day: number; pnlUsd: number }[];
}

export interface CopyTradeTask {
  id: string;
  chain: ChainId;
  target: string;
  label: string;
  enabled: boolean;
  /** fixed: buyAmount native per copied buy; ratio: target's native amount x ratio. */
  buyMode: 'fixed' | 'ratio';
  buyAmount: number;
  buyRatio: number;
  /** Max native spent per token. */
  maxPerToken: number;
  minMarketCapUsd: number | null;
  maxMarketCapUsd: number | null;
  minLiquidityUsd: number | null;
  /** Only copy the target's first buy of a token. */
  firstBuyOnly: boolean;
  /** mirror: sell the same % when target sells; none: rely on strategy exits. */
  sellMode: 'mirror' | 'none';
  strategy: StrategySpec | null;
  /** Token addresses never to copy. */
  blacklist: string[];
  presetId: PresetId;
  createdAt: number;
  stats: { buys: number; sells: number; spentNative: number; receivedNative: number; lastCopiedAt: number | null };
  /**
   * Server-managed: failed copies in a row (a successful copy resets it). At
   * COPY_AUTO_PAUSE_FAILURES the task disables itself and notifies the owner.
   */
  consecutiveFailures?: number;
}

/** Consecutive failed copies after which a copy-trade task pauses itself. */
export const COPY_AUTO_PAUSE_FAILURES = 3;

export type SniperKind = 'new_token' | 'migration' | 'dev_launch';

export interface SniperTask {
  id: string;
  chain: ChainId;
  kind: SniperKind;
  label: string;
  enabled: boolean;
  /** Match name/symbol keywords (any). */
  keywords: string[];
  /** Only tokens from these devs (dev_launch). */
  devAddresses: string[];
  launchpads: string[];
  requireSocials: boolean;
  /** Skip if dev holds more than this share. */
  maxDevHoldRate: number | null;
  /** Skip devs with fewer migrated tokens than this. */
  minDevMigrated: number | null;
  buyAmount: number;
  /** Stop after this many buys. */
  maxBuys: number;
  buysDone: number;
  strategy: StrategySpec | null;
  presetId: PresetId;
  createdAt: number;
  lastTriggeredAt: number | null;
}

export type AlertKind =
  | 'price' //        token price crosses value (USD)
  | 'mcap' //         token market cap crosses value (USD)
  | 'change' //       token 5m price change exceeds value (pct)
  | 'wallet_trade' // any trade by wallet
  | 'new_token' //    new token matching keyword
  | 'smart_buys' //   token gets >= value smart buys within 5m
  | 'signal_subscription' // signals matching AlertRule.signals (in-app notifications)
  | 'holding'; //     the account's held positions move, see a dev sell or lose liquidity (AlertRule.holding)

/**
 * AlertRule.holding for kind 'holding' (PRD §9.4): watches every position the account's wallet holds on the
 * rule's chain (or only AlertRule.token). At least one trigger must be on.
 */
export interface HoldingAlertSpec {
  /** vs_cost = the position's value against its cost basis; 5m_change = the token's 5-minute price change. */
  basis: 'vs_cost' | '5m_change';
  /** Fire when up at least this many percent (null = off). */
  upPct: number | null;
  /** Fire when down at least this many percent (null = off). */
  downPct: number | null;
  /** Fire when the token's dev (or dev team) sells at least 20% of their bag in one trade. */
  devSell: boolean;
  /** Fire when liquidity falls this many percent below its high since the rule started watching the position (null = off). */
  liquidityDropPct: number | null;
  /** Positions worth less than this (USD) are ignored. */
  minPositionUsd: number;
  /** Per position and trigger, a repeating rule fires again after this many minutes. */
  cooldownMin: number;
}

export interface AlertRule {
  id: string;
  chain: ChainId;
  kind: AlertKind;
  token: string | null;
  wallet: string | null;
  keyword: string | null;
  direction: 'above' | 'below' | null;
  value: number;
  repeat: boolean;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  note: string;
  /** signal_subscription rules: what to match (null for other kinds). */
  signals?: SignalSubscriptionSpec | null;
  /** holding rules: the triggers (null for other kinds). */
  holding?: HoldingAlertSpec | null;
}

// ---------------------------------------------------------------------------
// Token launch ("Cooking")
// ---------------------------------------------------------------------------

export interface LaunchRequest {
  chain: ChainId;
  /** Launchpad id on `chain` (LaunchConfig.launchpads). */
  launchpad: string;
  /** 1-32 characters; a name that reads as a reserved ticker (after look-alike folding, see docs/API.md) is refused. */
  name: string;
  /**
   * 1-10 characters A-Z / 0-9 (lower case is upper-cased, a leading "$" dropped); reserved tickers, and
   * look-alikes of them, are refused.
   */
  symbol: string;
  /** At most 280 characters. */
  description?: string;
  /** https links only: twitter on x.com / twitter.com, telegram on t.me, website anywhere. */
  socials?: Socials;
  /** One of LaunchConfig.glyphs (default LaunchConfig.defaultGlyph); it also picks the token's narrative. */
  logoGlyph?: string;
  /** Creator's buy in the creation block (native, 0..LaunchConfig.limits.maxDevBuyNative[chain]). */
  devBuyNative: number;
  /**
   * Extra paper wallets (0..LaunchConfig.limits.maxBundleWallets) funded from the creator's wallet. They
   * sell whenever the creator sells, so they need devBuyNative > 0.
   */
  bundleWallets?: number;
  /** Native each bundle wallet buys in the creation block (required with bundleWallets). */
  bundleBuyNative?: number;
  /** Buy preset whose priority fee / tip the creation-block buys pay (default: the active buy preset). */
  presetId?: PresetId;
  /** Exit rules on the dev buy, as SwapRequest.strategy (needs devBuyNative > 0). */
  strategy?: StrategySpec;
}

export interface LaunchResponse {
  token: TokenDetail;
  /** Creation-block buys: the dev buy first (when devBuyNative > 0), then one per bundle wallet. */
  receipts: SwapReceipt[];
}

/** A launchpad's bonding curve as a fresh launch sees it. */
export interface LaunchpadCurve {
  id: string;
  chain: ChainId;
  name: string;
  color: string;
  totalSupply: number;
  virtualNative: number;
  virtualTokens: number;
  /** Real tokens sold on the curve before graduation. */
  curveTokens: number;
  feeRate: number;
  migrationFeeNative: number;
  /** Native the curve holds when it completes. */
  graduationNative: number;
  /** Market cap of a fresh launch / at curve completion, at the current native price. */
  launchMarketCapUsd: number;
  graduationMarketCapUsd: number;
}

export interface LaunchConfig {
  launchpads: Record<ChainId, LaunchpadCurve[]>;
  /** Flat fee per launch (about 0.02 SOL worth on every chain). */
  launchFeeNative: Record<ChainId, number>;
  /** Allowed logo glyphs and the narrative each one tags the token with. */
  glyphs: string[];
  glyphNarratives: Record<string, string>;
  defaultGlyph: string;
  reservedTickers: string[];
  limits: {
    nameMaxLength: number;
    symbolMaxLength: number;
    descriptionMaxLength: number;
    maxDevBuyNative: Record<ChainId, number>;
    maxBundleWallets: number;
    maxBundleBuyNative: Record<ChainId, number>;
    launchesPerHour: number;
  };
}
