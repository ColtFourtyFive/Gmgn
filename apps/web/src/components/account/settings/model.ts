// Settings draft helpers: validation and the save patch. The theme is applied
// (and saved) immediately by useTheme, so it is not part of the draft.

import { CHAIN_IDS, CHAINS, type ChainId, type PresetId, type UserSettings } from '@trenchscope/shared';

export const PRESET_IDS: PresetId[] = ['P1', 'P2', 'P3'];

export type SettingsErrors = Record<string, string>;

/** Field path helpers so inputs and validation agree on keys. */
export const path = {
  preset: (chain: ChainId, side: 'buy' | 'sell', id: PresetId, field: string) => `trade.${chain}.${side}.${id}.${field}`,
  quickBuy: (chain: ChainId) => `trade.${chain}.quickBuyAmounts`,
  quickSell: (chain: ChainId) => `trade.${chain}.quickSellPercents`,
  instant: (chain: ChainId) => `trade.${chain}.instantBuyAmount`,
  risk: (key: string) => `display.riskThresholds.${key}`,
};

const finitePos = (v: number) => Number.isFinite(v) && v > 0;

/** All problems in the draft, keyed by field path. */
export function validateSettings(s: UserSettings): SettingsErrors {
  const e: SettingsErrors = {};
  for (const chain of CHAIN_IDS) {
    const t = s.trade[chain];
    const sym = CHAINS[chain].nativeSymbol;
    for (const side of ['buy', 'sell'] as const) {
      const presets = side === 'buy' ? t.buyPresets : t.sellPresets;
      for (const id of PRESET_IDS) {
        const p = presets[id];
        if (!p.autoSlippage && !(Number.isFinite(p.slippage) && p.slippage >= 0.01 && p.slippage <= 1)) e[path.preset(chain, side, id, 'slippage')] = 'Slippage must be 1–100%.';
        if (!(Number.isFinite(p.priorityFee) && p.priorityFee >= 0)) e[path.preset(chain, side, id, 'priorityFee')] = `Enter a fee in ${sym} (0 or more).`;
        if (!(Number.isFinite(p.tip) && p.tip >= 0)) e[path.preset(chain, side, id, 'tip')] = `Enter a tip in ${sym} (0 or more).`;
      }
    }
    if (t.quickBuyAmounts.length < 1 || !t.quickBuyAmounts.every(finitePos)) e[path.quickBuy(chain)] = `Each quick-buy amount must be above 0 ${sym}.`;
    if (t.quickSellPercents.length < 1 || !t.quickSellPercents.every((v) => finitePos(v) && v <= 100)) e[path.quickSell(chain)] = 'Each quick-sell percent must be between 0 and 100%.';
    if (!finitePos(t.instantBuyAmount)) e[path.instant(chain)] = `Enter an amount above 0 ${sym}.`;
  }
  for (const [key, v] of Object.entries(s.display.riskThresholds)) {
    if (!(Number.isFinite(v) && v >= 0 && v <= 1)) e[path.risk(key)] = 'Must be between 0% and 100%.';
  }
  return e;
}

/** Draft without the theme (applied separately), for dirty checks and saving. */
export function savable(s: UserSettings): UserSettings {
  const { theme: _theme, ...display } = s.display;
  void _theme;
  return { trade: s.trade, display: display as UserSettings['display'] };
}

export function sameSettings(a: UserSettings, b: UserSettings): boolean {
  return JSON.stringify(savable(a)) === JSON.stringify(savable(b));
}

/** Chains whose trade settings differ (for "unsaved" dots on chain tabs). */
export function dirtyChains(draft: UserSettings, saved: UserSettings): Set<ChainId> {
  return new Set(CHAIN_IDS.filter((c) => JSON.stringify(draft.trade[c]) !== JSON.stringify(saved.trade[c])));
}
