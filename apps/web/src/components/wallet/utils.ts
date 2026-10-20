// Small pure helpers shared by the wallet, leaderboard, monitor and signals
// pages (address normalization, viewer-tag merging, PnL bucket metadata).

import { CHAINS, type ChainId, type PnlDistribution, type WalletTag } from '@trenchscope/shared';

/** Server form of an address: EVM addresses are lower-case, Solana is case-sensitive. */
export function normAddress(chain: ChainId, address: string): string {
  const a = address.trim();
  return CHAINS[chain].addressStyle === 'evm' ? a.toLowerCase() : a;
}

export function sameWallet(chain: ChainId, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normAddress(chain, a) === normAddress(chain, b);
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

/** Well-formed address for the chain's address style. */
export function isWalletAddress(chain: ChainId, value: string): boolean {
  const v = value.trim();
  return CHAINS[chain].addressStyle === 'evm' ? EVM.test(v) : BASE58.test(v);
}

/** Viewer-relative tags first ('you', 'following'), then the server tags, without duplicates. */
export function mergeTags(base: readonly WalletTag[], viewer: readonly WalletTag[]): WalletTag[] {
  if (viewer.length === 0) return base as WalletTag[];
  const out: WalletTag[] = [...viewer];
  for (const t of base) if (!out.includes(t)) out.push(t);
  return out;
}

export type BucketKey = keyof PnlDistribution;

/** The five return buckets (realized + unrealized on cost), best first, with their display tone. */
export const PNL_BUCKETS: { key: BucketKey; label: string; tone: string; strength: number }[] = [
  { key: 'gt500', label: '>500%', tone: 'up', strength: 1 },
  { key: 'p200to500', label: '200–500%', tone: 'up', strength: 0.7 },
  { key: 'p0to200', label: '0–200%', tone: 'up', strength: 0.4 },
  { key: 'n0to50', label: '-50–0%', tone: 'down', strength: 0.5 },
  { key: 'lt50', label: '<-50%', tone: 'down', strength: 1 },
];

export function distributionTotal(d: PnlDistribution): number {
  return d.gt500 + d.p200to500 + d.p0to200 + d.n0to50 + d.lt50;
}

/** Copy-score tone: red below 40, amber below 70, green otherwise. */
export function scoreTone(score: number): 'up' | 'warn' | 'down' {
  return score >= 70 ? 'up' : score >= 40 ? 'warn' : 'down';
}

/** Text color of a market-cap multiple: green from 2x, red once it reads below 1x. */
export function multipleTone(multiple: number | null | undefined): string {
  if (multiple === null || multiple === undefined || !Number.isFinite(multiple)) return 'text-faint';
  if (multiple >= 2) return 'text-up';
  // 0.995 still displays as "1x".
  if (multiple >= 0.995) return 'text-fg';
  return 'text-down';
}
