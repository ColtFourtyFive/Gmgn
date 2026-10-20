// Caller leaderboard aggregated client-side from the loaded calls (pure).

import type { Signal } from '@trenchscope/shared';
import { CALL_HIT_MULTIPLE } from '@/components/wallet/WalletCalls';

export interface CallerStats {
  address: string;
  calls: number;
  hits: number;
  hitRate: number;
  /** Mean of each call's best multiple since the call. */
  avgMultiple: number;
  /** The caller's best call. */
  best: Signal;
  lastAt: number;
}

/** The caller of a kol_call signal. */
export const callerOf = (s: Signal): string => s.wallets[0] ?? '';

/**
 * Callers with at least `minCalls` calls, best first: hit rate, then average
 * multiple, then number of calls.
 */
export function aggregateCallers(calls: Signal[], minCalls = 2): CallerStats[] {
  const by = new Map<string, CallerStats & { sum: number }>();
  for (const s of calls) {
    const address = callerOf(s);
    if (!address) continue;
    let c = by.get(address);
    if (!c) {
      c = { address, calls: 0, hits: 0, hitRate: 0, avgMultiple: 0, best: s, lastAt: 0, sum: 0 };
      by.set(address, c);
    }
    c.calls++;
    if (s.maxMultiple >= CALL_HIT_MULTIPLE) c.hits++;
    c.sum += s.maxMultiple;
    if (s.maxMultiple > c.best.maxMultiple) c.best = s;
    c.lastAt = Math.max(c.lastAt, s.createdAt);
  }
  const out: CallerStats[] = [];
  for (const { sum, ...c } of by.values()) {
    if (c.calls < minCalls) continue;
    out.push({ ...c, hitRate: c.hits / c.calls, avgMultiple: sum / c.calls });
  }
  return out.sort((a, b) => b.hitRate - a.hitRate || b.avgMultiple - a.avgMultiple || b.calls - a.calls);
}
