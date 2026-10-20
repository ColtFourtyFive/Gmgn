// Trenchscope API contract: domain + DTO types shared by server and web.
// Field naming is camelCase; comments note the closest GMGN field where one
// exists so analytics stay comparable with the reference product.
// Conventions:
//   - timestamps are epoch milliseconds
//   - "rate"/"ratio" fields are 0..1 fractions (format with formatPercent)
//   - USD amounts end in "Usd"; native-asset amounts end in "Native"

import type { ChainId } from './chains';

export type Side = 'buy' | 'sell';

/** Rolling stats windows used by trending ranks and token stats. */
export type StatWindow = '1m' | '5m' | '1h' | '6h' | '24h';
export const STAT_WINDOWS: StatWindow[] = ['1m', '5m', '1h', '6h', '24h'];

/** Candle resolutions. */
export type Resolution = '1s' | '15s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export const RESOLUTIONS: Resolution[] = ['1s', '15s', '1m', '5m', '15m', '1h', '4h', '1d'];
export const RESOLUTION_SECONDS: Record<Resolution, number> = {
  '1s': 1,
  '15s': 15,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

/** Wallet stats periods. */
export type WalletPeriod = '1d' | '7d' | '30d' | 'all';
export const WALLET_PERIODS: WalletPeriod[] = ['1d', '7d', '30d', 'all'];

/** Token lifecycle. curve = on launchpad bonding curve; migrated = trading on an AMM pool. */
export type TokenStatus = 'curve' | 'migrating' | 'migrated';

/** Trenches columns. new = new_creation, almost = near_completion ("pump"), migrated = completed. */
export type TrenchesColumn = 'new' | 'almost' | 'migrated';

/**
 * Wallet classification tags. Platform-assigned (smart, kol, sniper, ...) or
 * token-relative (dev, insider, bundler, top_holder are relative to a token).
 */
export type WalletTag =
  | 'smart' //      smart_degen — statistically proven profitable trader
  | 'kol' //        renowned — publicly known influencer wallet
  | 'sniper' //     bought within the first blocks after launch
  | 'bundler' //    bought in the same block as creation, linked to dev
  | 'insider' //    rat trader — funded by / linked to the dev, early accumulation
  | 'dev' //        the token creator (or dev team)
  | 'whale' //      large native balance / position
  | 'fresh' //      newly created wallet with little history
  | 'bot' //        high-frequency bot degen
  | 'sandwich' //   MEV sandwich bot
  | 'top_holder' // in the top 10 holders of the token (token-relative)
  | 'following' //  followed by the current user (viewer-relative)
  | 'you'; //       the current user's own wallet (viewer-relative)

export type DevStatus = 'hold' | 'sold_part' | 'sold_all' | 'bought_more';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Socials {
  twitter?: string;
  telegram?: string;
  website?: string;
}

/** Aggregates over one rolling window. */
export interface WindowStats {
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  swaps: number;
  buys: number;
  sells: number;
  /** Price change ratio over the window, e.g. 0.25 = +25%. */
  priceChange: number;
  /** Unique traders over the window (may be approximate). */
  makers: number;
}

/** Security / audit summary for a token. Null = not applicable on this chain or unknown. */
export interface TokenSecurity {
  /** SOL: mint authority renounced (renounced_mint). */
  renouncedMint: boolean | null;
  /** SOL: freeze authority renounced (renounced_freeze_account). */
  renouncedFreeze: boolean | null;
  /** EVM: contract verified (is_open_source). */
  isOpenSource: boolean | null;
  /** EVM: ownership renounced (is_renounced). */
  isRenounced: boolean | null;
  /** EVM: honeypot (is_honeypot). */
  isHoneypot: boolean | null;
  buyTax: number;
  sellTax: number;
  /** Share of LP tokens burned / locked (burn_status). 1 = fully burned. Null while on curve. */
  lpBurnedRate: number | null;
  /** top_10_holder_rate, excluding pools/curve accounts. */
  top10HolderRate: number;
  /** Cumulative top-100 holder share (concentration beyond the top 10). */
  top100HolderRate: number;
  /** creator_balance_rate — dev's current share of supply. */
  devHoldRate: number;
  devStatus: DevStatus;
  /** suspected_insider_hold_rate. */
  insiderHoldRate: number;
  /** top70_sniper_hold_rate. */
  sniperHoldRate: number;
  sniperCount: number;
  /** bundler_trader_amount_rate — share of volume from bundler wallets. */
  bundlerRate: number;
  /** rat_trader_amount_rate — share of volume from insider/rat wallets. */
  ratTraderRate: number;
  /** fresh_wallet_rate — share of holders that are fresh wallets. */
  freshWalletRate: number;
  /** bot_degen_rate — share of holders that are bots. */
  botDegenRate: number;
  /** is_wash_trading. */
  isWashTrading: boolean;
  /** rug_ratio 0..1 composite rug probability. */
  rugRatio: number;
  riskLevel: RiskLevel;
  /** Pre-rendered checklist for the audit panel. */
  checks: SecurityCheck[];
}

export interface SecurityCheck {
  key: string;
  label: string;
  /** Display value, e.g. "Yes", "12.3%". */
  value: string;
  level: 'good' | 'warn' | 'bad' | 'info';
  hint?: string;
}

/** Counts of tagged holders + their holdings (wallet_tags_stat). */
export interface HolderTagStats {
  smartCount: number;
  kolCount: number;
  sniperCount: number;
  bundlerCount: number;
  insiderCount: number;
  whaleCount: number;
  freshCount: number;
  botCount: number;
  devCount: number;
  /** Supply share held by each tag group. */
  smartHoldRate: number;
  kolHoldRate: number;
  sniperHoldRate: number;
  bundlerHoldRate: number;
  insiderHoldRate: number;
  whaleHoldRate: number;
  freshHoldRate: number;
  botHoldRate: number;
}

/** Row item used by Trenches, Trending, New Pairs, search and watchlist. GMGN: RankItem. */
export interface TokenSummary {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  /** Seed for the generated avatar (client renders an SVG from it). */
  logoSeed: string;
  /** Emoji / glyph that hints the meme theme, rendered on the avatar. */
  logoGlyph: string;
  /** Narrative/meta tag (e.g. "AI", "Cats"). */
  narrative: string;
  launchpad: string;
  status: TokenStatus;
  /** DEX name after migration. */
  dex: string | null;
  creator: string;
  createdAt: number;
  migratedAt: number | null;
  /** Seconds from creation to curve completion (complete_cost_time). */
  completeCostSeconds: number | null;
  priceUsd: number;
  priceNative: number;
  marketCapUsd: number;
  athMarketCapUsd: number;
  liquidityUsd: number;
  /** initial_liquidity: launch-time liquidity in USD; the pool's initial liquidity once migrated. */
  initialLiquidityUsd: number;
  /** Bonding curve progress 0..1 (1 once migrated). */
  progress: number;
  holderCount: number;
  totalSupply: number;
  stats: Record<StatWindow, WindowStats>;
  /** net_buy_24h in USD. */
  netBuy24hUsd: number;
  smartDegenCount: number;
  /** renowned_count. */
  kolCount: number;
  socials: Socials;
  xFollowers: number | null;
  /** Community takeover flag. */
  cto: boolean;
  /** Paid for a "boost"/ad on the simulated screener. */
  boosted: boolean;
  /** Same image/name as an earlier token. */
  isCopycat: boolean;
  /** Users currently viewing the token page. */
  watchers: number;
  /** Trending intensity 0..5. */
  hotLevel: number;
  security: TokenSecurity;
  devCreatedCount: number;
  devMigratedCount: number;
  /** Quick-glance holder tag counts. */
  holderTags: HolderTagStats;
}

export interface CurveInfo {
  virtualNative: number;
  virtualTokens: number;
  realNative: number;
  realTokens: number;
  initialRealTokens: number;
  progress: number;
  /** Market cap (USD) at which the curve completes, at the current native price. */
  graduationMarketCapUsd: number;
}

export interface PoolInfo {
  address: string;
  dex: string;
  nativeReserve: number;
  tokenReserve: number;
  liquidityUsd: number;
  initialLiquidityUsd: number;
  lpBurnedRate: number;
  createdAt: number;
  feeRate: number;
}

export interface DevToken {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  logoSeed: string;
  logoGlyph: string;
  createdAt: number;
  status: TokenStatus;
  marketCapUsd: number;
  athMarketCapUsd: number;
  /** Dev dumped everything within a short time and price collapsed. */
  rugged: boolean;
}

export interface DevInfo {
  address: string;
  holdRate: number;
  status: DevStatus;
  createdCount: number;
  migratedCount: number;
  ruggedCount: number;
  /** creator_created_open_ratio. */
  migrationRate: number;
  /** Best ATH market cap among the dev's tokens. */
  bestAthMarketCapUsd: number;
  fundedBy: string | null;
  tokens: DevToken[];
}

export interface TokenDetail extends TokenSummary {
  description: string;
  decimals: number;
  circulatingSupply: number;
  nativeUsd: number;
  curve: CurveInfo | null;
  pool: PoolInfo | null;
  dev: DevInfo;
  /** All-time high price in USD. */
  athPriceUsd: number;
  /** Total fees paid by traders to the venue (USD). */
  totalFeesUsd: number;
}

/** Trade/activity row. */
export interface Trade {
  id: string;
  chain: ChainId;
  token: string;
  tokenSymbol: string;
  wallet: string;
  /** Tags of the maker, relative to this token. */
  walletTags: WalletTag[];
  /** Display label: KOL handle or user remark. */
  walletLabel: string | null;
  side: Side;
  nativeAmount: number;
  tokenAmount: number;
  usdAmount: number;
  priceUsd: number;
  priceNative: number;
  marketCapUsd: number;
  timestamp: number;
  txHash: string;
  /** Slot / block number (bundles share a block). */
  block: number;
  /** True for the dev's own trades (convenience for chart markers). */
  isDev: boolean;
  /** Maker's resulting position share of supply after the trade. */
  makerHoldRate: number;
  /** Realized PnL of this sell in USD (sells only). */
  realizedPnlUsd: number | null;
}

export interface Candle {
  /** Bucket start, epoch seconds (lightweight-charts friendly). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Volume in USD. */
  volume: number;
}

export interface CandleResponse {
  resolution: Resolution;
  candles: Candle[];
  /** Multiply prices by this to get market cap. */
  supply: number;
}

/** Position of a wallet in a token (holders / top traders / portfolio rows). */
export interface Position {
  chain: ChainId;
  token: string;
  wallet: string;
  /** wallet = normal holder; curve/pool = venue account (shown labelled, excluded from concentration). */
  addrType: 'wallet' | 'curve' | 'pool';
  walletTags: WalletTag[];
  walletLabel: string | null;
  balance: number;
  /** Share of total supply held. */
  holdRate: number;
  valueUsd: number;
  /** accu_cost — cost basis of the amount still held (USD). */
  costBasisUsd: number;
  avgBuyPriceUsd: number;
  avgSellPriceUsd: number;
  /** history_bought_cost. */
  boughtUsd: number;
  /** history_sold_income. */
  soldUsd: number;
  boughtTokens: number;
  soldTokens: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  /** total_profit_pnl — totalPnl / boughtUsd. */
  pnlRate: number;
  buys: number;
  sells: number;
  firstBuyAt: number | null;
  lastActiveAt: number;
  /** Seconds held (until exit or now). */
  holdSeconds: number;
  /** Wallet native balance (for holder rows). */
  nativeBalance: number;
  fundedBy: string | null;
}

export interface TokenPositionRow extends Position {
  /** Lightweight token info for portfolio/wallet holdings tables. */
  tokenInfo: TokenRef;
}

export interface TokenRef {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  logoSeed: string;
  logoGlyph: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  status: TokenStatus;
  launchpad: string;
  createdAt: number;
  priceChange24h: number;
  /**
   * security.rugRatio / riskLevel from the token's latest security read (at most
   * ~30s old). The server always sets them; optional so refs built client-side still type-check.
   */
  rugRatio?: number;
  riskLevel?: RiskLevel;
}

export interface PnlDistribution {
  /** >500% */
  gt500: number;
  /** 200%..500% */
  p200to500: number;
  /** 0%..200% */
  p0to200: number;
  /** -50%..0% */
  n0to50: number;
  /** < -50% */
  lt50: number;
}

export interface WalletPeriodStats {
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  /** realized / totalCost. */
  pnlRate: number;
  /** Tokens with positive total PnL / tokens traded (0..1). */
  winRate: number;
  wins: number;
  losses: number;
  tokensTraded: number;
  buys: number;
  sells: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  /** total_cost — USD spent buying. */
  totalCostUsd: number;
  avgHoldSeconds: number;
  avgBuyUsd: number;
  distribution: PnlDistribution;
  /** Daily realized PnL series for the period (ms, usd), oldest first. */
  dailyPnl: { day: number; pnlUsd: number }[];
}

export interface WalletStyle {
  /** e.g. "Sniper Scalper", "Diamond-Hand Hunter". */
  title: string;
  /** Speed subtitle, e.g. "Flips in < 5m". */
  subtitle: string;
  badges: { key: string; label: string; value: string }[];
  /** Copy-trade suitability 0..100. */
  copyScore: number;
}

export interface WalletProfile {
  chain: ChainId;
  address: string;
  /** KOL handle / platform name, if any. */
  label: string | null;
  /** The viewer's private remark, if followed. */
  remark: string | null;
  avatarSeed: string;
  tags: WalletTag[];
  nativeBalance: number;
  nativeBalanceUsd: number;
  /** First funding time. */
  createdAt: number;
  fundedBy: string | null;
  fundAmountNative: number | null;
  /** Simulated X followers for KOLs. */
  xFollowers: number | null;
  /** Number of platform users following this wallet. */
  followerCount: number;
  isFollowed: boolean;
  createdTokenCount: number;
  stats: Record<WalletPeriod, WalletPeriodStats>;
  style: WalletStyle;
  lastActiveAt: number;
}

export interface LeaderboardRow {
  chain: ChainId;
  address: string;
  label: string | null;
  avatarSeed: string;
  tags: WalletTag[];
  nativeBalance: number;
  stats: WalletPeriodStats;
  style: WalletStyle;
  lastActiveAt: number;
  followerCount: number;
  isFollowed: boolean;
}

/** Live feed item for Monitor (smart money / KOL / followed wallets). */
export interface FeedItem {
  trade: Trade;
  token: TokenRef;
  /** Is this the wallet's first buy of the token. */
  isFirstBuy: boolean;
  /** Is this sell closing the whole position. */
  isClose: boolean;
}

export type SignalKind =
  | 'price_spike'
  | 'ath'
  | 'mcap_level'
  | 'smart_buy'
  | 'kol_buy'
  | 'large_buy'
  | 'multi_buy'
  | 'bundler_sell'
  | 'dev_sell'
  | 'migration'
  | 'cto'
  | 'boost'
  | 'kol_call';

export interface Signal {
  id: string;
  chain: ChainId;
  kind: SignalKind;
  token: TokenRef;
  title: string;
  detail: string;
  marketCapAtTrigger: number;
  /** For calls: multiple achieved since trigger (ath since / mcap at trigger). */
  maxMultiple: number;
  wallets: string[];
  createdAt: number;
}

/** A wallet's public calls (kol_call signals) and how they played out; a hit = maxMultiple >= 2. */
export interface WalletCalls {
  /** Newest first (calls on tokens the simulator has since deleted are left out). */
  calls: Signal[];
  /** Share of the calls made in the last 7d / 30d that hit (0 without calls). */
  hitRate7d: number;
  hitRate30d: number;
  /** Mean maxMultiple of the calls made in the last 30d (0 without calls). */
  avgMaxMultiple: number;
}

/** Call-out feed filter: every call, calls by wallets tagged kol, or calls that hit (maxMultiple >= 2). */
export type CalloutFilter = 'all' | 'kol' | 'hits';

export interface Narrative {
  id: string;
  name: string;
  glyph: string;
  tokenCount: number;
  volume1hUsd: number;
  volume24hUsd: number;
  marketCapUsd: number;
  /** Volume-weighted price change over 1h. */
  change1h: number;
  /** Heat score 0..100. */
  heat: number;
  topTokens: TokenRef[];
}

// ---------------------------------------------------------------------------
// Lists & filters
// ---------------------------------------------------------------------------

/** Numeric range filter; undefined bound = open. */
export interface Range {
  min?: number;
  max?: number;
}

/** Filters shared by Trenches, Trending and New Pairs. */
export interface TokenFilters {
  launchpads?: string[];
  /** Search within name/symbol. */
  keyword?: string;
  excludeKeywords?: string[];
  /** Age in minutes. */
  ageMinutes?: Range;
  marketCapUsd?: Range;
  liquidityUsd?: Range;
  volumeUsd?: Range;
  holderCount?: Range;
  swaps?: Range;
  progress?: Range;
  top10HolderRate?: Range;
  devHoldRate?: Range;
  insiderHoldRate?: Range;
  sniperHoldRate?: Range;
  bundlerRate?: Range;
  rugRatio?: Range;
  freshWalletRate?: Range;
  smartDegenCount?: Range;
  kolCount?: Range;
  devCreatedCount?: Range;
  devMigratedCount?: Range;
  priceChange?: Range;
  requireSocials?: boolean;
  requireTwitter?: boolean;
  requireTelegram?: boolean;
  requireWebsite?: boolean;
  /** Hide tokens whose dev already sold everything. */
  hideDevSold?: boolean;
  /** Only tokens whose dev sold everything (creator_close). */
  onlyDevSold?: boolean;
  hideCopycats?: boolean;
  hideWashTrading?: boolean;
  /** EVM safety: not honeypot + open source + renounced. */
  safeOnly?: boolean;
  /** LP fully burned. */
  lpBurned?: boolean;
  boostedOnly?: boolean;
}

export type FilterPreset = 'safe' | 'smart' | 'strict';

export const FILTER_PRESETS: Record<FilterPreset, TokenFilters> = {
  safe: { rugRatio: { max: 0.3 }, bundlerRate: { max: 0.3 }, insiderHoldRate: { max: 0.3 } },
  smart: { smartDegenCount: { min: 1 } },
  strict: {
    rugRatio: { max: 0.3 },
    bundlerRate: { max: 0.3 },
    insiderHoldRate: { max: 0.3 },
    smartDegenCount: { min: 1 },
    volumeUsd: { min: 1000 },
  },
};

export interface TrenchesQuery {
  chain: ChainId;
  /** Per-column filters. */
  filters?: Partial<Record<TrenchesColumn, TokenFilters>>;
  limit?: number;
}

export interface TrenchesSnapshot {
  chain: ChainId;
  new: TokenSummary[];
  almost: TokenSummary[];
  migrated: TokenSummary[];
  updatedAt: number;
}

export type TrendingSort =
  | 'hot'
  | 'volume'
  | 'swaps'
  | 'marketCap'
  | 'liquidity'
  | 'holders'
  | 'priceChange'
  | 'age'
  | 'smartDegenCount'
  | 'kolCount'
  | 'netBuy';

export interface TrendingQuery {
  chain: ChainId;
  window: StatWindow;
  sort?: TrendingSort;
  order?: 'asc' | 'desc';
  filters?: TokenFilters;
  limit?: number;
}

export interface TrendingSnapshot {
  chain: ChainId;
  window: StatWindow;
  tokens: TokenSummary[];
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Accounts, settings, trading
// ---------------------------------------------------------------------------

export type PresetId = 'P1' | 'P2' | 'P3';

export interface TradePreset {
  id: PresetId;
  /** Slippage tolerance ratio (0.15 = 15%). Ignored when autoSlippage. */
  slippage: number;
  autoSlippage: boolean;
  /** Priority fee in native units. */
  priorityFee: number;
  /** Builder/Jito-style tip in native units (anti-MEV route). */
  tip: number;
  /** Route through private relay (no sandwich risk, slightly slower). */
  antiMev: boolean;
}

export interface ChainTradeSettings {
  buyPresets: Record<PresetId, TradePreset>;
  sellPresets: Record<PresetId, TradePreset>;
  activeBuyPreset: PresetId;
  activeSellPreset: PresetId;
  /** Quick buy buttons (native). */
  quickBuyAmounts: number[];
  /** Quick sell buttons (% of position). */
  quickSellPercents: number[];
  /** Default instant-buy amount for one-click buys in lists. */
  instantBuyAmount: number;
}

export interface DisplaySettings {
  /** Show values in USD or native. */
  currency: 'usd' | 'native';
  /** Chart in price or market cap. */
  chartUnit: 'price' | 'mcap';
  theme: 'dark' | 'light';
  flashUpdates: boolean;
  compactRows: boolean;
  /** Confirm before submitting trades. */
  confirmTrades: boolean;
  /** Play a sound on fills / alerts. */
  sounds: boolean;
  hotkeys: boolean;
  /** Trenches card warning thresholds (ratios); chips turn red above these. */
  riskThresholds: { top10: number; dev: number; insiders: number; bundlers: number; snipers: number };
}

export interface UserSettings {
  trade: Record<ChainId, ChainTradeSettings>;
  display: DisplaySettings;
}

export interface UserWallet {
  chain: ChainId;
  address: string;
  nativeBalance: number;
  nativeBalanceUsd: number;
}

export interface Account {
  id: string;
  username: string;
  /** Instant guest account (no password yet); registering while signed in as a guest upgrades it in place. */
  isGuest?: boolean;
  createdAt: number;
  referralCode: string;
  referredBy: string | null;
  wallets: Record<ChainId, UserWallet>;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

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

export interface FollowedWallet {
  chain: ChainId;
  address: string;
  remark: string;
  group: string;
  createdAt: number;
  /** Push a notification on each trade. */
  notify: boolean;
  /** The wallet's public label (KOL handle, ...) and platform tags, as of the read. */
  label: string | null;
  tags: WalletTag[];
}

export interface WatchlistItem {
  chain: ChainId;
  address: string;
  addedAt: number;
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
  | 'smart_buys'; //  token gets >= value smart buys within 5m

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
}

// ---------------------------------------------------------------------------
// Token launch ("Cooking")
// ---------------------------------------------------------------------------

export interface LaunchRequest {
  chain: ChainId;
  /** Launchpad id on `chain` (LaunchConfig.launchpads). */
  launchpad: string;
  /** 1-32 characters; a reserved ticker as the whole name is refused. */
  name: string;
  /** 1-10 characters A-Z / 0-9 (lower case is upper-cased, a leading "$" dropped); reserved tickers are refused. */
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

export type NotificationKind =
  | 'order_filled'
  | 'order_failed'
  | 'alert'
  | 'copytrade'
  | 'sniper'
  | 'follow_trade'
  | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  chain: ChainId | null;
  token: string | null;
  wallet: string | null;
  createdAt: number;
  read: boolean;
  /** Outcome for toasts: fills 'success', failed trades / paused tasks 'error'. Absent = neutral. */
  level?: 'success' | 'error' | 'info';
}

export interface RewardsSummary {
  referralCode: string;
  referralLink: string;
  invitedCount: number;
  /** Trading volume of invitees (USD). */
  inviteeVolumeUsd: number;
  /** Rebate share of invitee fees. */
  rebateRate: number;
  rebatesEarnedUsd: number;
  ownVolumeUsd: number;
  feesPaidUsd: number;
  /** Cashback rate on own fees. */
  cashbackRate: number;
  cashbackUsd: number;
  points: number;
  tier: string;
  nextTier: { name: string; volumeUsd: number } | null;
  invitees: { username: string; joinedAt: number; volumeUsd: number; rebateUsd: number }[];
}

export interface SearchResult {
  tokens: TokenRef[];
  wallets: { chain: ChainId; address: string; label: string | null; tags: WalletTag[]; avatarSeed: string }[];
}

export interface ChainMarketInfo {
  chain: ChainId;
  nativeUsd: number;
  nativeChange24h: number;
  /** Simulated network priority fee suggestion (native). */
  priorityFee: { low: number; medium: number; high: number };
  tokensTracked: number;
  launches1h: number;
  migrations1h: number;
  volume24hUsd: number;
}

export interface MetaResponse {
  serverTime: number;
  platformFeeRate: number;
  chains: ChainMarketInfo[];
  launchpads: { id: string; chain: ChainId; name: string; color: string }[];
  /** Simulation status. */
  sim: { seed: string; startedAt: number; speed: number; tradesPerSecond: number };
}

// ---------------------------------------------------------------------------
// Realtime protocol (WebSocket at /ws)
// ---------------------------------------------------------------------------

/**
 * Channels:
 *   market                         -> 'market'    MetaResponse['chains'] every 5s
 *   trenches:<chain>               -> 'trenches'  TrenchesSnapshot every 1s (params: TrenchesQuery['filters'])
 *   trending:<chain>               -> 'trending'  TrendingSnapshot every 2s (params: Omit<TrendingQuery,'chain'>)
 *   newpairs:<chain>               -> 'newpairs'  TokenSummary[] every 2s (params: { filters })
 *   token:<chain>:<address>        -> 'token'     TokenDetail every 1s
 *                                   -> 'trades'    Trade[] batches (~250ms)
 *                                   -> 'candle'    { resolution, candle } (params: { resolution })
 *   feed:<chain>:<smart|kol|follow|all> -> 'feed' FeedItem[] batches
 *   signals:<chain>                -> 'signals'   Signal[] batches
 *   wallet:<chain>:<address>       -> 'trades'    Trade[] batches of that wallet
 *   user                           -> 'notification' | 'order' | 'balance' | 'position' (requires auth)
 */
export type WsClientMessage =
  | { op: 'auth'; token: string }
  | { op: 'sub'; ch: string; params?: unknown }
  | { op: 'unsub'; ch: string }
  | { op: 'ping' };

export type WsServerMessage =
  | { op: 'data'; ch: string; type: string; data: unknown }
  | { op: 'ack'; ch: string }
  | { op: 'auth'; ok: boolean; accountId?: string }
  | { op: 'error'; message: string; ch?: string }
  | { op: 'pong'; t: number };

export interface ApiError {
  error: string;
  code?: string;
}

export interface Paged<T> {
  items: T[];
  /** Cursor for the next page (opaque), null when exhausted. */
  next: string | null;
}
