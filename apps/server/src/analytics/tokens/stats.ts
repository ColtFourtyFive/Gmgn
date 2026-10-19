// Window statistics helpers. multiWindowStats computes every StatWindow in a
// single backward pass over a token's minute buckets with exactly the same
// semantics as World.windowStats (verified by tests), which is ~2x cheaper than
// five separate calls. priceChangeAt uses a binary search over the buckets so
// cheap DTOs (TokenRef) can carry a 24h change without scanning.

import { STAT_WINDOWS, type StatWindow, type WindowStats } from '@trenchscope/shared';
import type { MinuteBucket, TokenState } from '../../sim/world';

export const WINDOW_MINUTES: Record<StatWindow, number> = { '1m': 1, '5m': 5, '1h': 60, '6h': 360, '24h': 1440 };
export const WINDOW_MS: Record<StatWindow, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
};

function emptyStats(): WindowStats {
  return { volumeUsd: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, swaps: 0, buys: 0, sells: 0, priceChange: 0, makers: 0 };
}

/** Window stats plus what is needed to refresh them cheaply while the token is idle. */
export interface WindowsSnapshot {
  stats: Record<StatWindow, WindowStats>;
  /** Open price per window (STAT_WINDOWS order); NaN = no reference price. */
  open: number[];
  /**
   * Sim time at which the oldest bucket of some window ages out. Until then,
   * and as long as no trade happened, every window sum is unchanged and only
   * priceChange moves with the live price (see repriceWindows).
   */
  validUntil: number;
}

/**
 * All windows at once. `currentPriceUsd` is the token's live price.
 * Mirrors World.windowStats: a bucket is in the window when it ends after
 * `now - window`; the window's open price is the close of the first bucket
 * that ended before the window, else the open of the oldest included bucket.
 * Makers are a unique union for windows <= 1h and a per-minute sum beyond.
 */
export function computeWindows(t: TokenState, now: number, currentPriceUsd: number): WindowsSnapshot {
  const stats = {} as Record<StatWindow, WindowStats>;
  const buckets = t.buckets;
  // Windows ordered shortest -> longest; we walk buckets newest -> oldest.
  const order = STAT_WINDOWS; // ['1m','5m','1h','6h','24h']
  const since = order.map((w) => now - WINDOW_MINUTES[w] * 60000);
  const acc = order.map(() => emptyStats());
  const open: (number | null)[] = order.map(() => null);
  const oldest: (number | null)[] = order.map(() => null);
  const closed = order.map(() => false);
  const makerSets: Set<string>[] = [new Set(), new Set(), new Set()]; // 1m, 5m, 1h
  let sumMakers6 = 0;
  let sumMakers24 = 0;
  let active = order.length;
  for (let i = buckets.length - 1; i >= 0 && active > 0; i--) {
    const b: MinuteBucket = buckets[i];
    for (let k = 0; k < order.length; k++) {
      if (closed[k]) continue;
      if (b.t + 60000 <= since[k]) {
        open[k] = b.close;
        closed[k] = true;
        active--;
        continue;
      }
      const s = acc[k];
      s.volumeUsd += b.volumeUsd;
      s.buyVolumeUsd += b.buyVolumeUsd;
      s.sellVolumeUsd += b.sellVolumeUsd;
      s.buys += b.buys;
      s.sells += b.sells;
      open[k] = b.open;
      oldest[k] = b.t;
      if (k <= 2) {
        // Union is shared: a bucket inside the 1m window is inside 5m and 1h too,
        // so add to the narrowest still-open set and merge outward at the end.
        if (k === 0 || closed[k - 1]) for (const m of b.makers) makerSets[k].add(m);
      } else if (k === 3) sumMakers6 += b.makers.size;
      else sumMakers24 += b.makers.size;
    }
  }
  // Merge unions outward: 5m includes 1m makers, 1h includes 5m makers.
  for (const m of makerSets[0]) makerSets[1].add(m);
  for (const m of makerSets[1]) makerSets[2].add(m);
  let validUntil = Infinity;
  const opens: number[] = [];
  for (let k = 0; k < order.length; k++) {
    const s = acc[k];
    s.swaps = s.buys + s.sells;
    s.makers = k <= 2 ? makerSets[k].size : k === 3 ? sumMakers6 : sumMakers24;
    const o = open[k];
    opens.push(o === null ? NaN : o);
    s.priceChange = o !== null && o > 0 ? currentPriceUsd / o - 1 : 0;
    stats[order[k]] = s;
    const ob = oldest[k];
    if (ob !== null) validUntil = Math.min(validUntil, ob + 60000 + WINDOW_MINUTES[order[k]] * 60000);
  }
  return { stats, open: opens, validUntil };
}

/** Same sums, new live price: O(windows). Only valid while idle and before `validUntil`. */
export function repriceWindows(prev: WindowsSnapshot, currentPriceUsd: number): WindowsSnapshot {
  const stats = {} as Record<StatWindow, WindowStats>;
  STAT_WINDOWS.forEach((w, k) => {
    const o = prev.open[k];
    stats[w] = { ...prev.stats[w], priceChange: o > 0 ? currentPriceUsd / o - 1 : 0 };
  });
  return { stats, open: prev.open, validUntil: prev.validUntil };
}

/** All windows at once (see computeWindows). */
export function multiWindowStats(t: TokenState, now: number, currentPriceUsd: number): Record<StatWindow, WindowStats> {
  return computeWindows(t, now, currentPriceUsd).stats;
}

/** Index of the first bucket that ends after `since` (buckets sorted by t asc). */
function firstBucketAfter(buckets: MinuteBucket[], since: number): number {
  let lo = 0;
  let hi = buckets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buckets[mid].t + 60000 <= since) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Price change over a window, O(log n); same open-price rule as World.windowStats. */
export function priceChangeAt(t: TokenState, windowMs: number, now: number, currentPriceUsd: number): number {
  const buckets = t.buckets;
  if (buckets.length === 0) return 0;
  const idx = firstBucketAfter(buckets, now - windowMs);
  let openPrice: number;
  if (idx > 0) openPrice = buckets[idx - 1].close;
  else openPrice = buckets[0].open;
  return openPrice > 0 ? currentPriceUsd / openPrice - 1 : 0;
}

/** Sum of volume over a window, O(window buckets). */
export function volumeIn(t: TokenState, windowMs: number, now: number): number {
  const buckets = t.buckets;
  const since = now - windowMs;
  let v = 0;
  for (let i = buckets.length - 1; i >= 0; i--) {
    const b = buckets[i];
    if (b.t + 60000 <= since) break;
    v += b.volumeUsd;
  }
  return v;
}
