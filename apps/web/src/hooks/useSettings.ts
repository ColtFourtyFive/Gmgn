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
  riskThresholds: { top10: 0.3, dev: 0.3, insiders: 0.05, bundlers: 0.1, snipers: 0.1 },
};

// Trade defaults for signed-out visitors. They mirror the server's
// defaultSettings() (apps/server/src/accounts/settings.ts; a test keeps them
// equal), so the panel previews exactly the presets, slippage, MEV mode and
// quick amounts the account will start with.

type Tiers = Record<PresetId, number>;

/** Fee tiers per chain in native units (P1 Economy, P2 Standard, P3 Turbo). */
const FEES: Record<ChainId, { priorityFee: Tiers; tip: Tiers }> = {
  sol: { priorityFee: { P1: 0.0001, P2: 0.0008, P3: 0.003 }, tip: { P1: 0.001, P2: 0.002, P3: 0.004 } },
  bsc: { priorityFee: { P1: 0.00005, P2: 0.00015, P3: 0.0005 }, tip: { P1: 0.00001, P2: 0.00003, P3: 0.0001 } },
  base: { priorityFee: { P1: 0.000005, P2: 0.00002, P3: 0.0001 }, tip: { P1: 0.000002, P2: 0.000005, P3: 0.00002 } },
  robinhood: { priorityFee: { P1: 0.000003, P2: 0.00001, P3: 0.00005 }, tip: { P1: 0.000001, P2: 0.000003, P3: 0.00001 } },
  eth: { priorityFee: { P1: 0.0005, P2: 0.0015, P3: 0.004 }, tip: { P1: 0.0002, P2: 0.0005, P3: 0.001 } },
};

const PROFILES: Record<PresetId, Pick<TradePreset, 'slippage' | 'autoSlippage' | 'antiMev'>> = {
  P1: { slippage: 0.2, autoSlippage: true, antiMev: true },
  P2: { slippage: 0.25, autoSlippage: false, antiMev: true },
  P3: { slippage: 0.35, autoSlippage: false, antiMev: false },
};

const PRESET_IDS: PresetId[] = ['P1', 'P2', 'P3'];

function defaultsFor(chain: ChainId): ChainTradeSettings {
  const presets = (): Record<PresetId, TradePreset> =>
    Object.fromEntries(PRESET_IDS.map((id) => [id, { id, ...PROFILES[id], priorityFee: FEES[chain].priorityFee[id], tip: FEES[chain].tip[id] }])) as Record<PresetId, TradePreset>;
  const amounts = [...CHAINS[chain].quickBuyAmounts];
  return {
    buyPresets: presets(),
    sellPresets: presets(),
    activeBuyPreset: 'P2',
    activeSellPreset: 'P2',
    quickBuyAmounts: amounts,
    quickSellPercents: [10, 25, 50, 100],
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
