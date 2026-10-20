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
  /**
   * Explainable 0-100 safety score derived from the fields above (formula in docs/API.md).
   * The server always sets it; optional so securities built client-side still type-check.
   */
  safety?: SafetyScore;
}

/** safe >= 70, caution 40-69, danger < 40 (or a hard gate); unknown when coverage < 0.5. */
export type SafetyBand = 'safe' | 'caution' | 'danger' | 'unknown';

/** One deduction behind a safety score. */
export interface SafetyReason {
  /** The SecurityCheck key it comes from (mint, freeze, honeypot, top10, rug, ...), or 'unverified'. */
  key: string;
  label: string;
  /** Points this reason takes off the score (deduction plus any cap it set). */
  impact: number;
  level: 'warn' | 'bad';
}

export interface SafetyScore {
  /** 0..100, higher = safer. */
  score: number;
  band: SafetyBand;
  /** Share of the applicable checks with known data (0..1). */
  coverage: number;
  /** Largest impact first, at most 6. */
  reasons: SafetyReason[];
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
  /** Real token image (live mode, from the token's metadata); the generated avatar is the fallback. */
  imageUrl?: string | null;
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
  /**
   * Portfolio rows only: 'main' = the account's chain wallet, 'bundle' = a bundle wallet of one of
   * its launches (same token, separate wallet).
   */
  walletRole?: 'main' | 'bundle';
}

/** Status of an early buyer's bag against its first buy. */
export type EarlyBuyerStatus = 'holding' | 'added' | 'sold_part' | 'sold_all';

/** First buyers of a token tracked per token (GMGN "first 70 buyers"). */
export const EARLY_BUYERS_LIMIT = 70;

export interface EarlyBuyer {
  /** 1 = first buyer. */
  rank: number;
  wallet: string;
  walletTags: WalletTag[];
  walletLabel: string | null;
  firstBuyAt: number;
  /** Block / slot of the first buy. */
  block: number;
  /** Totals over every buy of the wallet (USD incl. fees / tokens). */
  boughtUsd: number;
  boughtTokens: number;
  balance: number;
  holdRate: number;
  /**
   * sold_all: holds ~nothing; sold_part: holds less than its first buy; added: holds more than its
   * first buy; holding: otherwise.
   */
  status: EarlyBuyerStatus;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
}

export interface EarlyBuyersResponse {
  /** By rank (first buy order), at most EARLY_BUYERS_LIMIT. */
  buyers: EarlyBuyer[];
  /** Status counts, and the early buyers' combined share of supply still held. */
  summary: { holding: number; soldPart: number; soldAll: number; added: number; holdRateTotal: number };
}

export interface TokenRef {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  logoSeed: string;
  logoGlyph: string;
  /** Real token image (live mode, from the token's metadata); the generated avatar is the fallback. */
  imageUrl?: string | null;
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

/** GET /api/:chain/wallets/:address/risk flags (observable data only; definitions in docs/API.md). */
export type WalletRiskKey = 'phishing' | 'wash' | 'flagged_funder' | 'new_large' | 'serial_rugger' | 'honeypot' | 'fast_trades';

/** ok = nothing found, warn = amber, bad = red, unknown = no data to judge (never shown as ok). */
export type WalletRiskFlagLevel = 'ok' | 'warn' | 'bad' | 'unknown';

export interface WalletRiskFlag {
  key: WalletRiskKey;
  label: string;
  level: WalletRiskFlagLevel;
  /** Display value, e.g. "14 dust transfers from 2 look-alikes", "3 of 12 tokens". */
  value: string;
  /** Count behind the flag (transfers, tokens, launches, USD for new_large). */
  count: number;
  /** Share of the sample it was measured on (0..1), null when none applies. */
  rate: number | null;
  /** What the flag means and how it is measured (tooltip copy). */
  definition: string;
  /** Addresses involved (look-alike senders, the flagged funder), at most 5. */
  addresses?: string[];
}

export interface WalletRiskReport {
  chain: ChainId;
  address: string;
  /** high = any red flag, medium = any amber flag, else low. */
  level: RiskLevel;
  /** Fixed order: phishing, wash, flagged_funder, new_large, serial_rugger, honeypot, fast_trades. */
  flags: WalletRiskFlag[];
  updatedAt: number;
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
  /** What the trade did to the wallet's position (set by wallet feeds/activity and portfolio activity). */
  positionEvent?: PositionEvent;
}

/**
 * open = first buy, or a buy re-entering after a close; add = a buy while holding;
 * reduce = a partial sell; close = a sell down to ~0.
 */
export type PositionEvent = 'open' | 'add' | 'reduce' | 'close';

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
  /** Hide these token addresses (max 500; clients merge the user's blacklist in). */
  excludeAddresses?: string[];
  /** Hide tokens created by these wallets (max 500). */
  excludeCreators?: string[];
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
export const PRESET_IDS: PresetId[] = ['P1', 'P2', 'P3'];
/** Display names of the three preset slots; the ids stay internal. */
export const PRESET_LABELS: Record<PresetId, string> = { P1: 'Calm', P2: 'Fast', P3: 'Snipe' };

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
  /** Live mode: TOTP second factor enabled (required for withdrawals). */
  twoFactorEnabled?: boolean;
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
  /** Groups the item is filed under (WatchlistGroup ids); none = only the implicit "All". */
  groupIds?: string[];
  /** Private note, at most WATCHLIST_LIMITS.noteMaxLength characters. */
  note?: string;
}

/** A user-defined watchlist group; "All" is implicit and never stored. */
export interface WatchlistGroup {
  id: string;
  name: string;
  /** #rrggbb */
  color?: string;
  /** 0-based position in the group bar. */
  order: number;
}

export const WATCHLIST_LIMITS = { maxGroups: 20, groupNameMaxLength: 24, noteMaxLength: 140 };

/** GET /api/watchlist */
export interface WatchlistResponse {
  items: WatchlistItem[];
  /** Summaries of the items' tokens that still exist. */
  tokens: TokenSummary[];
  /** Ordered by `order`. */
  groups: WatchlistGroup[];
}

export type BlacklistKind = 'token' | 'creator' | 'keyword';

export interface BlacklistEntry {
  chain: ChainId;
  address: string;
  addedAt: number;
}

/** Hidden tokens, dev wallets and name keywords (newest first); lists apply them via TokenFilters exclusions. */
export interface Blacklist {
  tokens: BlacklistEntry[];
  creators: BlacklistEntry[];
  /** Lower-cased, without a leading "$". */
  keywords: string[];
}

export const BLACKLIST_LIMITS = { tokens: 500, creators: 500, keywords: 50, keywordMaxLength: 32 };

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
  /** Simulated network priority fee suggestion (native), scaled with congestion. */
  priorityFee: { low: number; medium: number; high: number };
  tokensTracked: number;
  launches1h: number;
  migrations1h: number;
  volume24hUsd: number;
  /** Network load; always set by the server. */
  congestion?: ChainCongestion;
}

/** normal < 0.4 <= busy < 0.7 <= congested. */
export type CongestionLabel = 'normal' | 'busy' | 'congested';

export interface ChainCongestion {
  /** 0..1 */
  level: number;
  label: CongestionLabel;
}

/**
 * live = real chain data and real on-chain trades from custodied embedded wallets;
 * demo = the deterministic market simulator with paper balances (never real funds).
 */
export type AppMode = 'live' | 'demo';

/** Health of the live data/execution stack (live mode only). */
export interface LiveStatus {
  /** Market feed connected and delivering events. */
  feedConnected: boolean;
  /** Last feed event received (ms), null before the first one. */
  lastEventAt: number | null;
  /** RPC answered the last health probe. */
  rpcHealthy: boolean;
  /** Embedded-wallet signer in use ('turnkey', or 'local-dev' for development only). */
  signer: string;
  /** Swaps can be executed (signer + RPC + router configured). */
  tradingEnabled: boolean;
  /** Tokens currently tracked from the feed. */
  trackedTokens: number;
}

export interface MetaResponse {
  serverTime: number;
  /** live or demo; the web adapts navigation, copy and features to it. */
  mode: AppMode;
  /** Chains this server serves (live: the chains with real integrations). */
  enabledChains: ChainId[];
  platformFeeRate: number;
  chains: ChainMarketInfo[];
  launchpads: { id: string; chain: ChainId; name: string; color: string }[];
  /** Simulation status (demo mode). */
  sim: { seed: string; startedAt: number; speed: number; tradesPerSecond: number };
  /** Live stack health (live mode). */
  live?: LiveStatus;
  /** Where the other mode runs (e.g. the demo site), when configured. */
  demoUrl?: string | null;
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
 *                                   -> 'signals'   Signal[] when the token fires a signal
 *   feed:<chain>:<smart|kol|follow|all> -> 'feed' FeedItem[] batches
 *   signals:<chain>                -> 'signals'   Signal[] batches
 *   wallet:<chain>:<address>       -> 'trades'    Trade[] batches of that wallet
 *   user (requires auth)           -> 'notification' AppNotification on event
 *                                   -> 'order'     Order on create/fill/cancel/fail
 *                                   -> 'balance'   UserWallet after its native balance changes
 *                                   -> 'fill'      SwapReceipt after any swap executed for the user
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

// ---------------------------------------------------------------------------
// Live mode: funding, withdrawals and account security
//
//   GET  /api/wallet/deposit?chain=sol      -> DepositInfo
//   GET  /api/wallet/transfers?limit=       -> WalletTransfer[] (newest first)
//   POST /api/wallet/withdraw               WithdrawRequest -> WalletTransfer
//   POST /api/wallet/refresh                { chain } -> UserWallet (re-reads balances from chain)
//   GET  /api/security                      -> SecurityStatus
//   POST /api/security/2fa/setup            -> TotpSetup (pending until enabled)
//   POST /api/security/2fa/enable           { code } -> TotpEnableResponse
//   POST /api/security/2fa/disable          { code } -> { enabled: false }
//   POST /api/security/whitelist            { chain, address, label, code } -> WhitelistEntry
//   POST /api/security/whitelist/remove     { chain, address, code } -> { ok: true }
//   POST /api/auth/login                    { username, password, code? } (401 code 'totp_required'
//                                           when 2FA is on and the code is missing or wrong)
//
// Live-mode error codes: 'guest_disabled' (403, no guest accounts with real funds),
// 'not_available_in_live' (403: faucet, token launch), 'wallets_unavailable' (503: no signer),
// 'trading_unavailable' (503: RPC / router / signer missing), 'totp_required' (401),
// 'two_factor_required' (403: enable 2FA first), 'address_not_whitelisted' (403),
// 'insufficient_balance' (400), 'tx_failed' (502: the transaction failed on-chain).
// ---------------------------------------------------------------------------

/** Where to send funds to trade (the account's embedded wallet). */
export interface DepositInfo {
  chain: ChainId;
  /** The account's embedded wallet: send SOL or SPL tokens here. */
  address: string;
  /** SOL kept back from "max" buys for network fees and rent (native). */
  feeReserve: number;
  /** Deposits are credited once they reach this commitment. */
  commitment: 'confirmed' | 'finalized';
}

export type TransferStatus = 'pending' | 'sent' | 'confirmed' | 'failed';

/** A deposit seen on-chain or a withdrawal the user requested. */
export interface WalletTransfer {
  id: string;
  chain: ChainId;
  direction: 'deposit' | 'withdrawal';
  /** null = native SOL; otherwise the SPL token mint. */
  mint: string | null;
  symbol: string;
  /** Amount in display units (SOL / tokens). */
  amount: number;
  /** Sender of a deposit, destination of a withdrawal (null when unknown). */
  counterparty: string | null;
  signature: string | null;
  status: TransferStatus;
  error?: string;
  /** Network fee paid (native), 0 for deposits. */
  networkFee: number;
  createdAt: number;
  confirmedAt: number | null;
}

export interface WithdrawRequest {
  chain: ChainId;
  /** Destination: an active whitelisted address. */
  to: string;
  /** null / absent = native SOL; otherwise the SPL token mint. */
  mint?: string | null;
  /** Amount in display units (SOL / tokens). */
  amount: number;
  /** Current TOTP code. */
  code: string;
  /** Client idempotency key: a retry with the same key never sends twice. */
  clientId?: string;
}

export interface WhitelistEntry {
  chain: ChainId;
  address: string;
  label: string;
  addedAt: number;
  /** Withdrawals to it are allowed from this time (new addresses wait SecurityStatus.whitelistDelayMs). */
  activeAt: number;
}

export interface SecurityEvent {
  at: number;
  /** e.g. 'login', 'login_failed', '2fa_enabled', '2fa_disabled', 'whitelist_add', 'whitelist_remove', 'withdrawal'. */
  action: string;
  ip: string | null;
  detail: string;
}

export interface SecurityStatus {
  twoFactorEnabled: boolean;
  whitelist: WhitelistEntry[];
  /** Delay before a newly added whitelist address can receive withdrawals (ms). */
  whitelistDelayMs: number;
  /** Recent security events, newest first. */
  recentEvents: SecurityEvent[];
}

/** A pending TOTP enrolment: confirm with /api/security/2fa/enable. */
export interface TotpSetup {
  /** Base32 secret for manual entry. */
  secret: string;
  /** otpauth:// URI for the authenticator-app QR code. */
  otpauthUrl: string;
}

export interface TotpEnableResponse {
  enabled: true;
  /** One-time recovery codes (each disables 2FA once); shown only now. */
  recoveryCodes: string[];
}
