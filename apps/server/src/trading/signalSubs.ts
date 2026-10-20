// Signal subscriptions (PRD §9.4): a rule matches a fired signal when any of
// its AND-groups does (kinds, market cap now / at the signal, liquidity,
// holders, top-10 share, smart holders, token age, launchpads, quality).
// Alerts (alerts.ts) indexes rules by (chain, kind), merges a token's matches
// within SIGNAL_MERGE_MS into one notification and caps each rule per hour.

import type { Signal, SignalFilterGroup, SignalSubscriptionSpec } from '@trenchscope/shared';

/** A token's signals within this window of the last notification for it merge into the next one. */
export const SIGNAL_MERGE_MS = 60_000;
export const HOUR_MS = 3_600_000;

export interface MatchContext {
  now: number;
  /** Smart-money holders of the token (read only when a group bounds it); null when unknown. */
  smartHolders: () => number | null;
}

const set = (v: number | null | undefined): v is number => v !== null && v !== undefined;

/** A bound that is set fails on an unknown value (fail closed). */
function within(value: number | null | undefined, min: number | null | undefined, max: number | null | undefined): boolean {
  if (!set(min) && !set(max)) return true;
  if (!set(value)) return false;
  return (!set(min) || value >= min) && (!set(max) || value <= max);
}

export function matchesGroup(g: SignalFilterGroup, s: Signal, c: MatchContext): boolean {
  if (g.kinds.length > 0 && !g.kinds.includes(s.kind)) return false;
  if (g.excludeRisk && s.lowQuality) return false;
  if (g.launchpads && g.launchpads.length > 0 && !g.launchpads.includes(s.token.launchpad)) return false;
  if (!within(s.token.marketCapUsd, g.mcMin, g.mcMax)) return false;
  if (!within(s.marketCapAtTrigger, g.triggerMcMin, g.triggerMcMax)) return false;
  if (!within(s.cur?.liquidityUsd ?? s.token.liquidityUsd, g.minLiquidityUsd, null)) return false;
  if (!within(s.cur?.holders, g.minHolders, null)) return false;
  if (!within(s.cur?.top10, null, g.maxTop10)) return false;
  if (!within((c.now - s.token.createdAt) / 60_000, g.minAgeMin, g.maxAgeMin)) return false;
  if (set(g.minSmart) && !within(c.smartHolders(), g.minSmart, null)) return false;
  return true;
}

export function matchesSubscription(spec: SignalSubscriptionSpec, s: Signal, c: MatchContext): boolean {
  return spec.groups.some((g) => matchesGroup(g, s, c));
}

/** "$PEPE: Smart money buy · KOL buy +1" from the signals merged into one notification (oldest first). */
export function subscriptionTitle(symbol: string, signals: Signal[]): string {
  const titles = [...new Set(signals.map((s) => s.title))];
  const shown = titles.slice(0, 2).join(' · ');
  return `$${symbol}: ${shown}${titles.length > 2 ? ` +${titles.length - 2}` : ''}`;
}
