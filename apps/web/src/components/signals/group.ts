// Grouped signal feed (PRD §6.12): one row per token instead of one per
// signal. A group keeps the token's listed signals (newest first), the kinds
// they cover (stacked badges) and the token-level history the server attaches
// to every signal (first-trigger market cap, times fired per kind).

import type { Signal, SignalKind } from '@trenchscope/shared';
import { SIGNAL_META } from './meta';

export interface SignalGroup {
  /** `${chain}:${token}` */
  key: string;
  /** The newest signal: its token ref is the freshest. */
  latest: Signal;
  /** The token's listed signals, newest first. */
  signals: Signal[];
  /** Kinds among them, most recent first. */
  kinds: SignalKind[];
  /** Market cap at the token's first signal (server history; the oldest listed one as a fallback). */
  firstTriggerMcUsd: number;
  /** Signals the token fired in total and per kind (server history; the listed ones as a fallback). */
  timesFired: number;
  timesFiredByKind: Partial<Record<SignalKind, number>>;
  /** Any listed signal is a warning (dev / bundler sells). */
  bearish: boolean;
}

/** Group signals (newest first) by token, groups ordered by their latest signal. */
export function groupSignals(signals: Signal[]): SignalGroup[] {
  const groups = new Map<string, SignalGroup>();
  for (const s of signals) {
    const key = `${s.chain}:${s.token.address}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, latest: s, signals: [], kinds: [], firstTriggerMcUsd: 0, timesFired: 0, timesFiredByKind: {}, bearish: false };
      groups.set(key, g);
    }
    g.signals.push(s);
    if (!g.kinds.includes(s.kind)) g.kinds.push(s.kind);
    if (SIGNAL_META[s.kind]?.sentiment === 'bearish') g.bearish = true;
  }
  for (const g of groups.values()) {
    const oldest = g.signals[g.signals.length - 1];
    g.firstTriggerMcUsd = g.latest.firstTriggerMcUsd ?? oldest.marketCapAtTrigger;
    if (g.latest.timesFired !== undefined && g.latest.timesFiredByKind) {
      g.timesFired = g.latest.timesFired;
      g.timesFiredByKind = g.latest.timesFiredByKind;
    } else {
      g.timesFired = g.signals.length;
      for (const s of g.signals) g.timesFiredByKind[s.kind] = (g.timesFiredByKind[s.kind] ?? 0) + 1;
    }
  }
  return [...groups.values()];
}
