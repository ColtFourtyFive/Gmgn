// Page-local UI state of the token page, shared by components that are far
// apart in the tree: the mobile buy/sell bar and hotkeys drive the trade
// panel, the dev panel opens the Dev tokens tab, a maker click in the chart
// legend or activity filters the feed. Reset whenever the token changes.

import { create } from 'zustand';

export type TradeSide = 'buy' | 'sell';
export type TradeMode = 'market' | 'limit' | 'auto';
export type BottomTab = 'activity' | 'holders' | 'traders' | 'position' | 'orders' | 'dev';
export type MobileTab = 'chart' | 'trade' | 'info' | 'activity';
export type ChartUnit = 'price' | 'mcap';
/** USD or the chain's native token (settings.display.currency). */
export type ValueCurrency = 'usd' | 'native';

interface TokenUiState {
  side: TradeSide;
  mode: TradeMode;
  bottomTab: BottomTab;
  mobileTab: MobileTab;
  /** Activity feed filtered to one maker (wallet address). */
  maker: string | null;
  /** Chart/activity unit chosen this session (wins over saved settings until they catch up). */
  unitOverride: ChartUnit | null;
  /** Chart/stats currency chosen this session (wins over saved settings until they catch up). */
  currencyOverride: ValueCurrency | null;
  /** Bumped to ask the trade panel to focus its amount field. */
  focusTick: number;
  setSide(side: TradeSide): void;
  setMode(mode: TradeMode): void;
  setBottomTab(tab: BottomTab): void;
  setMobileTab(tab: MobileTab): void;
  setMaker(maker: string | null): void;
  setUnitOverride(unit: ChartUnit | null): void;
  setCurrencyOverride(currency: ValueCurrency | null): void;
  /** Switch side (and on phones the Trade tab) and focus the amount field. */
  openTrade(side: TradeSide): void;
  reset(): void;
}

const INITIAL = { side: 'buy', mode: 'market', bottomTab: 'activity', mobileTab: 'chart', maker: null } as const;

export const useTokenUi = create<TokenUiState>((set) => ({
  ...INITIAL,
  unitOverride: null,
  currencyOverride: null,
  focusTick: 0,
  setSide: (side) => set({ side }),
  setMode: (mode) => set({ mode }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setMaker: (maker) => set((s) => ({ maker, bottomTab: maker ? 'activity' : s.bottomTab })),
  setUnitOverride: (unitOverride) => set({ unitOverride }),
  setCurrencyOverride: (currencyOverride) => set({ currencyOverride }),
  openTrade: (side) => set((s) => ({ side, mobileTab: 'trade', focusTick: s.focusTick + 1 })),
  reset: () => set({ ...INITIAL }),
}));
