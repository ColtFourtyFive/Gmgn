// Client-side checks for exit strategies attached to copy-trade / sniper tasks
// (mirrors the server's strategy schema so errors show before submitting).

import type { StrategySpec } from '@trenchscope/shared';
import { MAX_STRATEGY_ORDERS, isStrategyEmpty, strategyOrderCount } from '@/components/trade/StrategyEditor';

const pctOk = (v: number) => Number.isFinite(v) && v > 0 && v <= 100;

/** First problem with a strategy the user enabled, or null when it is valid. */
export function strategyError(s: StrategySpec): string | null {
  if (isStrategyEmpty(s)) return 'Add at least one exit rule, or turn the exit strategy off.';
  if (strategyOrderCount(s) > MAX_STRATEGY_ORDERS) return `A strategy can hold at most ${MAX_STRATEGY_ORDERS} exit orders.`;
  for (const tp of s.takeProfits) {
    if (!(tp.changePct > 0)) return 'Take-profit gains must be above 0%.';
    if (!pctOk(tp.sellPercent)) return 'Sell amounts must be between 1% and 100%.';
  }
  for (const sl of s.stopLosses) {
    if (!(sl.lossPct > 0 && sl.lossPct < 100)) return 'Stop-loss drops must be between 1% and 99%.';
    if (!pctOk(sl.sellPercent)) return 'Sell amounts must be between 1% and 100%.';
  }
  if (s.trailing) {
    if (!(s.trailing.drawdownPct > 0 && s.trailing.drawdownPct < 100)) return 'The trailing drawdown must be between 1% and 99%.';
    if (!pctOk(s.trailing.sellPercent)) return 'Sell amounts must be between 1% and 100%.';
    if (!(s.trailing.activateAtChangePct >= 0)) return 'The trailing activation gain cannot be negative.';
  }
  if (!(s.devSellPercent >= 0 && s.devSellPercent <= 100) || !(s.migrationSellPercent >= 0 && s.migrationSellPercent <= 100)) {
    return 'Event exits must be between 0% and 100%.';
  }
  return null;
}
