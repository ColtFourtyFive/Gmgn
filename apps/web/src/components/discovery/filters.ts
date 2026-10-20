// TokenFilters helpers shared by Trenches, Trending and New Pairs: field
// metadata for the filter panel, sanitising (the server's schema is strict,
// so anything stale from localStorage must be dropped before it is sent),
// active-filter counting and presets.

import { useCallback, useMemo } from 'react';
import { FILTER_PRESETS, type FilterPreset, type Range, type TokenFilters } from '@trenchscope/shared';
import { useLocalStorage } from '@/hooks/useLocalStorage';

/** Every range-valued TokenFilters key, in panel order. */
export const RANGE_KEYS = [
  'ageMinutes',
  'marketCapUsd',
  'liquidityUsd',
  'volumeUsd',
  'swaps',
  'priceChange',
  'holderCount',
  'progress',
  'top10HolderRate',
  'devHoldRate',
  'insiderHoldRate',
  'sniperHoldRate',
  'bundlerRate',
  'rugRatio',
  'freshWalletRate',
  'smartDegenCount',
  'kolCount',
  'devCreatedCount',
  'devMigratedCount',
] as const satisfies readonly (keyof TokenFilters)[];

export type RangeKey = (typeof RANGE_KEYS)[number];

/** Every boolean TokenFilters key. */
export const FLAG_KEYS = [
  'requireSocials',
  'requireTwitter',
  'requireTelegram',
  'requireWebsite',
  'hideDevSold',
  'onlyDevSold',
  'hideCopycats',
  'hideWashTrading',
  'safeOnly',
  'lpBurned',
  'boostedOnly',
] as const satisfies readonly (keyof TokenFilters)[];

export type FlagKey = (typeof FLAG_KEYS)[number];

export type MetricKind = 'usd' | 'pct' | 'count' | 'minutes';

export interface MetricField {
  key: RangeKey;
  label: string;
  kind: MetricKind;
  hint: string;
  /** Label depends on the list's stats window (volume, swaps, change). */
  windowed?: boolean;
}

export interface MetricGroup {
  id: string;
  label: string;
  fields: MetricField[];
}

/** Metric ranges grouped as the panel shows them. */
export const METRIC_GROUPS: MetricGroup[] = [
  {
    id: 'market',
    label: 'Market',
    fields: [
      { key: 'ageMinutes', label: 'Age', kind: 'minutes', hint: 'Minutes since the token was created.' },
      { key: 'marketCapUsd', label: 'Market cap', kind: 'usd', hint: 'Fully diluted market cap in USD.' },
      { key: 'liquidityUsd', label: 'Liquidity', kind: 'usd', hint: 'Curve or pool liquidity in USD.' },
      { key: 'volumeUsd', label: 'Volume', kind: 'usd', hint: 'Traded volume in USD over the list window.', windowed: true },
      { key: 'swaps', label: 'Swaps', kind: 'count', hint: 'Number of buys + sells over the list window.', windowed: true },
      { key: 'priceChange', label: 'Change', kind: 'pct', hint: 'Price change over the list window.', windowed: true },
      { key: 'holderCount', label: 'Holders', kind: 'count', hint: 'Wallets currently holding the token.' },
      { key: 'progress', label: 'Bonding', kind: 'pct', hint: 'Bonding-curve progress toward migration.' },
    ],
  },
  {
    id: 'risk',
    label: 'Holders & risk',
    fields: [
      { key: 'top10HolderRate', label: 'Top 10', kind: 'pct', hint: 'Supply share held by the 10 largest holders (pools excluded).' },
      { key: 'devHoldRate', label: 'Dev hold', kind: 'pct', hint: 'Supply share the creator still holds.' },
      { key: 'insiderHoldRate', label: 'Insiders', kind: 'pct', hint: 'Supply share held by wallets linked to the dev.' },
      { key: 'sniperHoldRate', label: 'Snipers', kind: 'pct', hint: 'Supply share held by wallets that bought in the first blocks.' },
      { key: 'bundlerRate', label: 'Bundlers', kind: 'pct', hint: 'Share of volume from wallets that bought in the creation block.' },
      { key: 'rugRatio', label: 'Rug risk', kind: 'pct', hint: 'Composite rug probability (0–100%).' },
      { key: 'freshWalletRate', label: 'Fresh', kind: 'pct', hint: 'Share of holders that are newly created wallets.' },
    ],
  },
  {
    id: 'smart',
    label: 'Smart money & dev',
    fields: [
      { key: 'smartDegenCount', label: 'Smart money', kind: 'count', hint: 'Smart-money wallets holding the token.' },
      { key: 'kolCount', label: 'KOLs', kind: 'count', hint: 'Known influencer wallets holding the token.' },
      { key: 'devCreatedCount', label: 'Dev launches', kind: 'count', hint: 'Tokens this dev has created.' },
      { key: 'devMigratedCount', label: 'Dev migrated', kind: 'count', hint: 'Tokens of this dev that completed their curve.' },
    ],
  },
];

export const FLAG_LABELS: Record<FlagKey, { label: string; hint: string }> = {
  requireSocials: { label: 'Has any social', hint: 'At least one of X, Telegram or website.' },
  requireTwitter: { label: 'Has X', hint: 'Project X (Twitter) account linked.' },
  requireTelegram: { label: 'Has Telegram', hint: 'Telegram group linked.' },
  requireWebsite: { label: 'Has website', hint: 'Website linked.' },
  hideDevSold: { label: 'Hide dev sold', hint: 'Hide tokens whose dev sold everything.' },
  onlyDevSold: { label: 'Only dev sold', hint: 'Only tokens whose dev sold everything.' },
  hideCopycats: { label: 'Hide copycats', hint: 'Hide tokens that reuse an earlier token’s name or image.' },
  hideWashTrading: { label: 'Hide wash trading', hint: 'Hide tokens flagged for wash trading.' },
  safeOnly: { label: 'Safe contract', hint: 'SOL: mint and freeze authority revoked. EVM: not a honeypot, verified and renounced.' },
  lpBurned: { label: 'LP burned', hint: 'Pool liquidity tokens fully burned (migrated tokens only).' },
  boostedOnly: { label: 'Boosted only', hint: 'Only tokens with a paid boost.' },
};

export const PRESET_META: Record<FilterPreset, { label: string; hint: string }> = {
  safe: { label: 'Safe', hint: 'Rug risk, bundlers and insiders each at most 30%.' },
  smart: { label: 'Smart money', hint: 'At least one smart-money holder.' },
  strict: { label: 'Strict', hint: 'Safe + smart money + at least $1K volume.' },
};

export const PRESETS = Object.keys(FILTER_PRESETS) as FilterPreset[];

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function cleanRange(v: unknown): Range | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const out: Range = {};
  if (finite(r.min)) out.min = r.min;
  if (finite(r.max)) out.max = r.max;
  return out.min === undefined && out.max === undefined ? undefined : out;
}

function cleanStrings(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, max);
  return out.length ? out : undefined;
}

/**
 * Drop unknown keys, empty ranges, false flags and empty lists. The result
 * only holds keys that actually filter, so it can be sent as-is and counted.
 */
export function sanitizeFilters(input: unknown): TokenFilters {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: TokenFilters = {};
  for (const key of RANGE_KEYS) {
    const r = cleanRange(src[key]);
    if (r) out[key] = r;
  }
  for (const key of FLAG_KEYS) if (src[key] === true) out[key] = true;
  if (out.hideDevSold && out.onlyDevSold) delete out.hideDevSold;
  const launchpads = cleanStrings(src.launchpads, 50)?.map((s) => s.slice(0, 40));
  if (launchpads) out.launchpads = launchpads;
  if (typeof src.keyword === 'string' && src.keyword.trim()) out.keyword = src.keyword.trim().slice(0, 100);
  const exclude = cleanStrings(src.excludeKeywords, 50);
  if (exclude) out.excludeKeywords = exclude;
  return out;
}

/** Number of active filter conditions (one per key). */
export function countFilters(f: TokenFilters | undefined): number {
  return f ? Object.keys(sanitizeFilters(f)).length : 0;
}

export function hasFilters(f: TokenFilters | undefined): boolean {
  return countFilters(f) > 0;
}

/** Merge a preset in (its ranges replace the same keys). */
export function applyPreset(f: TokenFilters, preset: FilterPreset): TokenFilters {
  return sanitizeFilters({ ...f, ...FILTER_PRESETS[preset] });
}

/** Remove a preset's keys (when they still hold the preset's values). */
export function removePreset(f: TokenFilters, preset: FilterPreset): TokenFilters {
  const next: Record<string, unknown> = { ...f };
  for (const [k, v] of Object.entries(FILTER_PRESETS[preset])) {
    if (JSON.stringify(next[k]) === JSON.stringify(v)) delete next[k];
  }
  return sanitizeFilters(next);
}

/** True when every key of the preset is set to the preset's value. */
export function presetActive(f: TokenFilters, preset: FilterPreset): boolean {
  const record = f as Record<string, unknown>;
  return Object.entries(FILTER_PRESETS[preset]).every(([k, v]) => JSON.stringify(record[k]) === JSON.stringify(v));
}

/**
 * Filters persisted in localStorage under `key`, sanitised on every read.
 * Setting an empty object clears them.
 */
export function useStoredFilters(key: string): [TokenFilters, (next: TokenFilters) => void] {
  const [raw, setRaw] = useLocalStorage<unknown>(key, {});
  const filters = useMemo(() => sanitizeFilters(raw), [raw]);
  const set = useCallback((next: TokenFilters) => setRaw(sanitizeFilters(next)), [setRaw]);
  return [filters, set];
}
