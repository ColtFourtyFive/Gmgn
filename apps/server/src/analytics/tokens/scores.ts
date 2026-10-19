// Ranking scores: trending hot score + hot level, narrative heat and the
// search credibility used to rank same-name tokens (anti-copycat).

import type { StatWindow, TokenSummary } from '@trenchscope/shared';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Hot score for one window (higher = hotter), a log-scaled activity blend:
 *
 *   base = 1.00 * ln(1 + volumeUsd / 100)          window volume
 *        + 0.50 * ln(1 + swaps)                     window swaps
 *        + 0.80 * ln(1 + makers)                    unique traders (breadth beats churn)
 *        + 0.60 * clamp(ln(1 + priceChange), -1.5, 1.5)   momentum
 *        + 0.50 * sign(g) * ln(1 + |g|)             net holder growth g in the window
 *        + 0.30 * (buyVol - sellVol) / volume       buy pressure (-1..1)
 *        + 0.60 * ln(1 + smartDegenCount) + 0.50 * ln(1 + kolCount)
 *   hot  = max(0, base) * (1 - 0.5 * rugRatio) * (washTrading ? 0.5 : 1)
 *
 * Logs keep one whale trade from outranking broad organic activity; the
 * penalties push likely rugs and wash-traded volume down the board.
 */
export function hotScore(s: TokenSummary, window: StatWindow, holderGrowth: number): number {
  const w = s.stats[window];
  if (w.swaps === 0 && w.volumeUsd === 0) return 0;
  const vol = Math.log1p(w.volumeUsd / 100);
  const swaps = Math.log1p(w.swaps);
  const makers = Math.log1p(w.makers);
  const mom = clamp(Math.log1p(Math.max(-0.95, w.priceChange)), -1.5, 1.5);
  const growth = Math.sign(holderGrowth) * Math.log1p(Math.abs(holderGrowth));
  const pressure = w.volumeUsd > 0 ? (w.buyVolumeUsd - w.sellVolumeUsd) / w.volumeUsd : 0;
  const quality = 0.6 * Math.log1p(s.smartDegenCount) + 0.5 * Math.log1p(s.kolCount);
  const base = vol + 0.5 * swaps + 0.8 * makers + 0.6 * mom + 0.5 * growth + 0.3 * pressure + quality;
  const penalty = (1 - 0.5 * s.security.rugRatio) * (s.security.isWashTrading ? 0.5 : 1);
  return Math.max(0, base) * penalty;
}

/** 1h hot score thresholds for hot levels 1..5. */
export const HOT_LEVEL_THRESHOLDS = [9, 13, 16, 19, 22];

export function hotLevelOf(hot1h: number): number {
  let lvl = 0;
  for (const th of HOT_LEVEL_THRESHOLDS) if (hot1h >= th) lvl++;
  return lvl;
}

/**
 * Narrative heat 0..100 relative to the chain's other narratives:
 *   55% log 1h volume share of the hottest narrative,
 *   25% token count share of the largest narrative,
 *   20% volume-weighted 1h change mapped from [-50%, +50%] to [0, 1].
 */
export function narrativeHeat(vol1h: number, maxVol1h: number, count: number, maxCount: number, change1h: number): number {
  const v = maxVol1h > 0 ? Math.log1p(vol1h) / Math.log1p(maxVol1h) : 0;
  const c = maxCount > 0 ? count / maxCount : 0;
  const m = clamp(0.5 + change1h, 0, 1);
  return Math.round(100 * clamp(0.55 * v + 0.25 * c + 0.2 * m, 0, 1));
}

/**
 * Credibility of a token for search ranking within a match tier (anti-copycat):
 * geometric mean of one-sided depth, 24h volume, credible cap
 * (= min(mcap, max(depth, vol) * 50)) and holders (capped at 50k).
 * Known copycats are halved.
 */
export function searchCredibility(liquidityUsd: number, volume24hUsd: number, marketCapUsd: number, holders: number, isCopycat: boolean): number {
  const depth = liquidityUsd / 2;
  const cap = Math.min(marketCapUsd, Math.max(depth, volume24hUsd) * 50);
  const g = (Math.log1p(depth) + Math.log1p(volume24hUsd) + Math.log1p(cap) + Math.log1p(Math.min(holders, 50_000))) / 4;
  return Math.exp(g) * (isCopycat ? 0.5 : 1);
}
