// Shared contract: accounts, settings and trade presets, watchlist, blacklist, notifications and
// rewards. Conventions: ../types.ts.

import type { ChainId } from '../chains';
import type { PresetId } from './common';
import type { TokenSummary } from './tokens';

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
  /** Demo: a paper wallet per chain. Live: the enabled chains only (the embedded Solana wallet). */
  wallets: Record<ChainId, UserWallet>;
  /** Live mode: TOTP second factor enabled (required for withdrawals). */
  twoFactorEnabled?: boolean;
}

export interface AuthResponse {
  token: string;
  account: Account;
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

export type NotificationKind =
  | 'order_filled'
  | 'order_failed'
  | 'alert'
  | 'copytrade'
  | 'sniper'
  | 'follow_trade'
  | 'signal' //   a signal subscription matched
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
