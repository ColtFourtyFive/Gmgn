// Settings with signed-out fallbacks. Signed-in users get their saved
// settings from the session store; everyone else gets these defaults, so
// components can read settings unconditionally.

import { CHAIN_IDS, CHAINS, type ChainId, type ChainTradeSettings, type DisplaySettings, type PresetId, type TradePreset } from '@trenchscope/shared';
import { useSession } from '@/store/session';

export const DEFAULT_DISPLAY: DisplaySettings = {
  currency: 'usd',
  chartUnit: 'mcap',
  theme: 'dark',
  flashUpdates: true,
  compactRows: false,
  confirmTrades: false,
  sounds: false,
  hotkeys: true,
  riskThresholds: { top10: 0.3, dev: 0.1, insiders: 0.2, bundlers: 0.3, snipers: 0.2 },
};

function preset(chain: ChainId, id: PresetId, slippage: number, antiMev: boolean): TradePreset {
  const fee = CHAINS[chain].baseNetworkFee;
  return { id, slippage, autoSlippage: id === 'P1', priorityFee: fee * 2, tip: antiMev ? fee : 0, antiMev };
}

function defaultsFor(chain: ChainId): ChainTradeSettings {
  const presets = (): Record<PresetId, TradePreset> => ({
    P1: preset(chain, 'P1', 0.15, false),
    P2: preset(chain, 'P2', 0.25, true),
    P3: preset(chain, 'P3', 0.4, true),
  });
  const amounts = CHAINS[chain].quickBuyAmounts;
  return {
    buyPresets: presets(),
    sellPresets: presets(),
    activeBuyPreset: 'P1',
    activeSellPreset: 'P1',
    quickBuyAmounts: amounts,
    quickSellPercents: [25, 50, 75, 100],
    instantBuyAmount: amounts[1] ?? amounts[0],
  };
}

/** Per-chain trade defaults (stable references). */
export const DEFAULT_TRADE: Record<ChainId, ChainTradeSettings> = Object.fromEntries(
  CHAIN_IDS.map((c) => [c, defaultsFor(c)]),
) as Record<ChainId, ChainTradeSettings>;

/** Display settings (theme, flashUpdates, compactRows, riskThresholds, ...). */
export function useDisplaySettings(): DisplaySettings {
  return useSession((s) => s.settings?.display) ?? DEFAULT_DISPLAY;
}

/** Trade settings for a chain (presets, quick buy amounts, instant-buy amount). */
export function useTradeSettings(chain: ChainId): ChainTradeSettings {
  return useSession((s) => s.settings?.trade[chain]) ?? DEFAULT_TRADE[chain];
}
