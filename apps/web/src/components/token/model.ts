// Pure helpers of the token page: wallet classes for chart markers and
// activity filters, trade-risk reasons, swap error hints and unit math.

import { formatPercent, type TokenDetail, type Trade, type WalletTag } from '@trenchscope/shared';
import type { ChartUnit } from './store';

// ---------------------------------------------------------------------------
// Wallet classes (chart markers)
// ---------------------------------------------------------------------------

export type MarkerClass = 'mine' | 'dev' | 'following' | 'kol' | 'smart' | 'whale' | 'sniper' | 'insider';

export interface MarkerClassMeta {
  key: MarkerClass;
  label: string;
  /** Text drawn on the chart marker. */
  short: string;
  /** Wallet tag whose color/icon represents the class. */
  tag: WalletTag;
  /** Needs a signed-in viewer (viewer-relative). */
  private?: boolean;
}

/** In priority order: when trades of several classes share a candle, the first one labels the marker. */
export const MARKER_CLASSES: MarkerClassMeta[] = [
  { key: 'mine', label: 'Mine', short: 'You', tag: 'you', private: true },
  { key: 'dev', label: 'Dev', short: 'Dev', tag: 'dev' },
  { key: 'following', label: 'Following', short: 'Fol', tag: 'following', private: true },
  { key: 'kol', label: 'KOL', short: 'KOL', tag: 'kol' },
  { key: 'smart', label: 'Smart', short: 'SM', tag: 'smart' },
  { key: 'whale', label: 'Whale', short: 'Whl', tag: 'whale' },
  { key: 'sniper', label: 'Sniper', short: 'Snp', tag: 'sniper' },
  { key: 'insider', label: 'Insider / Bundler', short: 'Ins', tag: 'insider' },
];

export const DEFAULT_MARKER_CLASSES: MarkerClass[] = ['mine', 'dev', 'following', 'kol', 'smart'];

const PRIORITY = new Map(MARKER_CLASSES.map((c, i) => [c.key, i]));
export const markerPriority = (c: MarkerClass) => PRIORITY.get(c) ?? 99;

/** Tags of a broadcast trade plus the viewer-relative ones ('you', 'following'). */
export function withViewerTags(trade: Trade, viewer: WalletTag[]): WalletTag[] {
  if (viewer.length === 0) return trade.walletTags;
  const out = trade.walletTags.slice();
  for (const t of viewer) if (!out.includes(t)) out.unshift(t);
  return out;
}

/** Marker classes a trade belongs to, highest priority first. */
export function classifyTrade(trade: Trade, tags: WalletTag[]): MarkerClass[] {
  const has = (t: WalletTag) => tags.includes(t);
  const out: MarkerClass[] = [];
  if (has('you')) out.push('mine');
  if (trade.isDev || has('dev')) out.push('dev');
  if (has('following')) out.push('following');
  if (has('kol')) out.push('kol');
  if (has('smart')) out.push('smart');
  if (has('whale')) out.push('whale');
  if (has('sniper')) out.push('sniper');
  if (has('insider') || has('bundler')) out.push('insider');
  return out;
}

// ---------------------------------------------------------------------------
// Activity filters (server `filter` param, mirrored client-side for live rows)
// ---------------------------------------------------------------------------

export type ActivityFilter = 'all' | 'smart' | 'kol' | 'whale' | 'dev' | 'sniper' | 'insider' | 'bundler' | 'fresh' | 'following' | 'mine';

export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string; tag?: WalletTag; private?: boolean }[] = [
  { value: 'all', label: 'All' },
  { value: 'smart', label: 'Smart', tag: 'smart' },
  { value: 'kol', label: 'KOL', tag: 'kol' },
  { value: 'whale', label: 'Whale', tag: 'whale' },
  { value: 'dev', label: 'Dev', tag: 'dev' },
  { value: 'sniper', label: 'Sniper', tag: 'sniper' },
  { value: 'insider', label: 'Insider', tag: 'insider' },
  { value: 'bundler', label: 'Bundler', tag: 'bundler' },
  { value: 'fresh', label: 'Fresh', tag: 'fresh' },
  { value: 'following', label: 'Following', tag: 'following', private: true },
  { value: 'mine', label: 'Mine', tag: 'you', private: true },
];

/** Client-side equivalent of the server's trade `filter` (tags must include viewer tags). */
export function matchesActivityFilter(trade: Trade, tags: WalletTag[], filter: ActivityFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'dev':
      return trade.isDev || tags.includes('dev');
    case 'mine':
      return tags.includes('you');
    default:
      return tags.includes(filter);
  }
}

/** Holder / top-trader tag chips (server `tag` param). */
export const HOLDER_TAGS: { value: string; label: string; tag?: WalletTag; private?: boolean }[] = [
  { value: 'all', label: 'All' },
  { value: 'smart', label: 'Smart', tag: 'smart' },
  { value: 'kol', label: 'KOL', tag: 'kol' },
  { value: 'whale', label: 'Whale', tag: 'whale' },
  { value: 'dev', label: 'Dev', tag: 'dev' },
  { value: 'sniper', label: 'Sniper', tag: 'sniper' },
  { value: 'insider', label: 'Insider', tag: 'insider' },
  { value: 'bundler', label: 'Bundler', tag: 'bundler' },
  { value: 'fresh', label: 'Fresh', tag: 'fresh' },
  { value: 'bot', label: 'Bot', tag: 'bot' },
  { value: 'following', label: 'Following', tag: 'following', private: true },
  { value: 'you', label: 'You', tag: 'you', private: true },
];

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

/** Reasons a buy deserves a second confirmation (empty = no risk gate). */
export function riskReasons(t: TokenDetail): string[] {
  const s = t.security;
  const gate = s.isHoneypot === true || s.riskLevel === 'high';
  if (!gate) return [];
  const reasons: string[] = [];
  if (s.isHoneypot) reasons.push('Honeypot — the contract blocks sells, so you may not be able to exit.');
  if (s.riskLevel === 'high') reasons.push(`High risk level — rug ratio ${formatPercent(s.rugRatio, { sign: false, digits: 0 })}.`);
  for (const c of s.checks) if (c.level === 'bad' && c.key !== 'rug') reasons.push(`${c.label}: ${c.value}${c.hint ? ` — ${c.hint}` : ''}`);
  if (Math.max(s.buyTax, s.sellTax) > 0.1) reasons.push(`Taxes: buy ${formatPercent(s.buyTax, { sign: false, digits: 0 })} / sell ${formatPercent(s.sellTax, { sign: false, digits: 0 })}.`);
  return reasons;
}

export interface ErrorHint {
  text: string;
  /** Offer a one-click slippage bump. */
  raiseSlippage?: boolean;
}

/** Plain-language fix for a failed swap. */
export function swapErrorHint(error: string | undefined): ErrorHint | null {
  const e = (error ?? '').toLowerCase();
  if (!e) return null;
  if (e.includes('slippage')) return { text: 'The price moved past your slippage tolerance. Raise slippage or use Auto, then retry.', raiseSlippage: true };
  if (e.includes('insufficient')) return { text: 'Not enough balance for this amount plus fees. Lower the amount or top up your paper wallet.' };
  if (e.includes('no token balance') || e.includes('no position')) return { text: 'You don’t hold this token yet.' };
  if (e.includes('migrating')) return { text: 'The token is moving to its AMM pool. Retry in a few seconds.' };
  if (e.includes('liquidity')) return { text: 'There is not enough liquidity on this route right now.' };
  if (e.includes('cover fees')) return { text: 'This amount is too small to cover the fees.' };
  if (e.includes('too many') || e.includes('rate')) return { text: 'Too many swaps at once — wait a second and retry.' };
  return null;
}

/** Native kept back by "Max": network + priority fee + tip, with headroom. */
export function feeReserve(baseFee: number, priorityFee: number, tip: number, antiMev: boolean): number {
  return (baseFee + priorityFee + (antiMev ? tip : 0)) * 2;
}

/** Largest buy the balance allows: the platform fee (1%) is paid on top of the amount. */
export function maxBuyAmount(balance: number, reserve: number, platformFeeRate = 0.01): number {
  const max = (balance - reserve) / (1 + platformFeeRate);
  if (!(max > 0)) return 0;
  const digits = max >= 1 ? 3 : max >= 0.01 ? 4 : 6;
  const f = 10 ** digits;
  return Math.floor(max * f) / f;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Price <-> market cap (supply multiplies prices into market caps). */
export function toUnit(priceUsd: number, unit: ChartUnit, supply: number): number {
  return unit === 'mcap' ? priceUsd * supply : priceUsd;
}

/** Ratio of `value` vs `ref` as a change (0.1 = +10%), null when undefined. */
export function changeVs(value: number | null | undefined, ref: number | null | undefined): number | null {
  if (value === null || value === undefined || !ref || !Number.isFinite(value)) return null;
  return value / ref - 1;
}
