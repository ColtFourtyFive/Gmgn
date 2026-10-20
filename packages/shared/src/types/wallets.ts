// Shared contract: wallets (profiles, risk flags, leaderboard, followed wallets), the Monitor feed,
// signals and signal subscriptions, and wallet calls. Conventions: ../types.ts.

import type { ChainId } from '../chains';
import type { RiskLevel, WalletPeriod, WalletTag } from './common';
import type { TokenRef, Trade } from './tokens';

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
  // Token-level context (PRD §6.12; the server always sets these, optional so clients' fixtures type-check):
  /** Market cap at the token's first signal of any kind (USD). */
  firstTriggerMcUsd?: number;
  /** Signals the token has fired so far, in total and per kind. */
  timesFired?: number;
  timesFiredByKind?: Partial<Record<SignalKind, number>>;
  /** The token now: holders, top-10 share of supply, liquidity (USD). */
  cur?: { holders: number; top10: number; liquidityUsd: number };
  /** Fails the quality pre-filter: rug ratio > 0.3, wash trading or honeypot (PRD §8.9). */
  lowQuality?: boolean;
}

/**
 * One AND-group of a signal subscription (a subscription matches when any group does). Bounds are inclusive;
 * null / absent = open. MC bounds are the token's market cap now, trigger bounds its market cap at the signal.
 */
export interface SignalFilterGroup {
  /** Signal kinds to match; empty = every kind. */
  kinds: SignalKind[];
  mcMin?: number | null;
  mcMax?: number | null;
  triggerMcMin?: number | null;
  triggerMcMax?: number | null;
  minLiquidityUsd?: number | null;
  minHolders?: number | null;
  /** Top-10 holders' share of supply (0..1). */
  maxTop10?: number | null;
  /** Smart-money wallets holding. */
  minSmart?: number | null;
  /** Token age in minutes. */
  minAgeMin?: number | null;
  maxAgeMin?: number | null;
  /** Launchpad ids; empty = any. */
  launchpads?: string[];
  /** Skip low-quality tokens (Signal.lowQuality). */
  excludeRisk: boolean;
}

/** AlertRule.signals for kind 'signal_subscription' (PRD §9.4). */
export interface SignalSubscriptionSpec {
  /** Display name (the rule list and notifications). */
  name: string;
  /** OR of AND-groups, 1-5. */
  groups: SignalFilterGroup[];
  /** Notifications per hour at most (signals past it are dropped until the hour rolls). */
  maxPerHour: number;
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
