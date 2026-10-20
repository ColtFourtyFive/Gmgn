// Shared contract: tokens (summaries, details, security, holders, trades, candles, early buyers,
// narratives, search) and the token lists with their filters. Conventions: ../types.ts.

import type { ChainId } from '../chains';
import type { DevStatus, Resolution, RiskLevel, Side, Socials, StatWindow, TokenStatus, TrenchesColumn, WalletTag } from './common';

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

export interface SearchResult {
  tokens: TokenRef[];
  wallets: { chain: ChainId; address: string; label: string | null; tags: WalletTag[]; avatarSeed: string }[];
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
