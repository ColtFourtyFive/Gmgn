// Shared contract: primitives used across every domain (sides, windows, resolutions, wallet
// periods, lifecycle and tag enums, trade preset ids, errors and paging). Conventions: ../types.ts.

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

export type PresetId = 'P1' | 'P2' | 'P3';
export const PRESET_IDS: PresetId[] = ['P1', 'P2', 'P3'];
/** Display names of the three preset slots; the ids stay internal. */
export const PRESET_LABELS: Record<PresetId, string> = { P1: 'Calm', P2: 'Fast', P3: 'Snipe' };

export interface ApiError {
  error: string;
  code?: string;
}

export interface Paged<T> {
  items: T[];
  /** Cursor for the next page (opaque), null when exhausted. */
  next: string | null;
}
