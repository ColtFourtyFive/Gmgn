// User trade/display settings: per-chain defaults (P1 Economy / P2 Standard /
// P3 Turbo presets, mirroring low/average/high fee tiers) plus a deep-partial
// patch schema whose numeric fields are clamped into sane ranges on merge.

import { z } from 'zod';
import {
  CHAINS,
  CHAIN_IDS,
  type ChainId,
  type ChainTradeSettings,
  type DisplaySettings,
  type PresetId,
  type TradePreset,
  type UserSettings,
} from '@trenchscope/shared';

type Tiers = Record<PresetId, number>;

/** Fee tiers per chain in native units; `max` caps user-entered fees. */
const FEES: Record<ChainId, { priorityFee: Tiers; tip: Tiers; max: number }> = {
  sol: { priorityFee: { P1: 0.0001, P2: 0.0008, P3: 0.003 }, tip: { P1: 0.001, P2: 0.002, P3: 0.004 }, max: 0.1 },
  bsc: { priorityFee: { P1: 0.00005, P2: 0.00015, P3: 0.0005 }, tip: { P1: 0.00001, P2: 0.00003, P3: 0.0001 }, max: 0.01 },
  base: { priorityFee: { P1: 0.000005, P2: 0.00002, P3: 0.0001 }, tip: { P1: 0.000002, P2: 0.000005, P3: 0.00002 }, max: 0.005 },
  eth: { priorityFee: { P1: 0.0005, P2: 0.0015, P3: 0.004 }, tip: { P1: 0.0002, P2: 0.0005, P3: 0.001 }, max: 0.05 },
};

/** P1 Economy, P2 Standard (default), P3 Turbo: trades MEV protection for speed. */
const PROFILES: Record<PresetId, Pick<TradePreset, 'slippage' | 'autoSlippage' | 'antiMev'>> = {
  P1: { slippage: 0.2, autoSlippage: true, antiMev: true },
  P2: { slippage: 0.25, autoSlippage: false, antiMev: true },
  P3: { slippage: 0.35, autoSlippage: false, antiMev: false },
};

const PRESET_IDS: PresetId[] = ['P1', 'P2', 'P3'];
const SLIPPAGE_RANGE = { min: 0.01, max: 1 };
const PERCENT_RANGE = { min: 0.1, max: 100 };
const MAX_NATIVE_AMOUNT = 1e6;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function defaultPresets(chain: ChainId): Record<PresetId, TradePreset> {
  const fees = FEES[chain];
  const presets = {} as Record<PresetId, TradePreset>;
  for (const id of PRESET_IDS) {
    presets[id] = { id, ...PROFILES[id], priorityFee: fees.priorityFee[id], tip: fees.tip[id] };
  }
  return presets;
}

function defaultChainSettings(chain: ChainId): ChainTradeSettings {
  const quickBuyAmounts = [...CHAINS[chain].quickBuyAmounts];
  return {
    buyPresets: defaultPresets(chain),
    sellPresets: defaultPresets(chain),
    activeBuyPreset: 'P2',
    activeSellPreset: 'P2',
    quickBuyAmounts,
    quickSellPercents: [10, 25, 50, 100],
    instantBuyAmount: quickBuyAmounts[1] ?? quickBuyAmounts[0],
  };
}

export function defaultSettings(): UserSettings {
  const trade = {} as Record<ChainId, ChainTradeSettings>;
  for (const chain of CHAIN_IDS) trade[chain] = defaultChainSettings(chain);
  const display: DisplaySettings = {
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
  return { trade, display };
}

// ---------------------------------------------------------------------------
// Patch schema (deep partial). Unknown keys are stripped, so clients may send
// whole objects back (e.g. presets including their `id`).
// ---------------------------------------------------------------------------

const num = z.number().finite();
const presetId = z.enum(['P1', 'P2', 'P3']);

const presetPatch = z
  .object({ slippage: num, autoSlippage: z.boolean(), priorityFee: num, tip: num, antiMev: z.boolean() })
  .partial();
const presetsPatch = z.object({ P1: presetPatch, P2: presetPatch, P3: presetPatch }).partial();

const chainPatch = z
  .object({
    buyPresets: presetsPatch,
    sellPresets: presetsPatch,
    activeBuyPreset: presetId,
    activeSellPreset: presetId,
    quickBuyAmounts: z.array(num.positive()).min(1).max(8),
    quickSellPercents: z.array(num.positive()).min(1).max(8),
    instantBuyAmount: num.positive(),
  })
  .partial();

const ratio = num.min(0).max(1);
const displayPatch = z
  .object({
    currency: z.enum(['usd', 'native']),
    chartUnit: z.enum(['price', 'mcap']),
    theme: z.enum(['dark', 'light']),
    flashUpdates: z.boolean(),
    compactRows: z.boolean(),
    confirmTrades: z.boolean(),
    sounds: z.boolean(),
    hotkeys: z.boolean(),
    riskThresholds: z.object({ top10: ratio, dev: ratio, insiders: ratio, bundlers: ratio, snipers: ratio }).partial(),
  })
  .partial();

export const settingsPatchSchema = z
  .object({
    trade: z.object({ sol: chainPatch, bsc: chainPatch, base: chainPatch, eth: chainPatch } satisfies Record<ChainId, typeof chainPatch>).partial(),
    display: displayPatch,
  })
  .partial();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
type PresetPatch = z.infer<typeof presetPatch>;
type ChainPatch = z.infer<typeof chainPatch>;

function applyPresetPatch(chain: ChainId, preset: TradePreset, p: PresetPatch): void {
  const maxFee = FEES[chain].max;
  if (p.slippage !== undefined) preset.slippage = clamp(p.slippage, SLIPPAGE_RANGE.min, SLIPPAGE_RANGE.max);
  if (p.autoSlippage !== undefined) preset.autoSlippage = p.autoSlippage;
  if (p.priorityFee !== undefined) preset.priorityFee = clamp(p.priorityFee, 0, maxFee);
  if (p.tip !== undefined) preset.tip = clamp(p.tip, 0, maxFee);
  if (p.antiMev !== undefined) preset.antiMev = p.antiMev;
}

function applyChainPatch(chain: ChainId, s: ChainTradeSettings, p: ChainPatch): void {
  for (const id of PRESET_IDS) {
    const buy = p.buyPresets?.[id];
    if (buy) applyPresetPatch(chain, s.buyPresets[id], buy);
    const sell = p.sellPresets?.[id];
    if (sell) applyPresetPatch(chain, s.sellPresets[id], sell);
  }
  if (p.activeBuyPreset) s.activeBuyPreset = p.activeBuyPreset;
  if (p.activeSellPreset) s.activeSellPreset = p.activeSellPreset;
  if (p.quickBuyAmounts) s.quickBuyAmounts = p.quickBuyAmounts.map((v) => Math.min(v, MAX_NATIVE_AMOUNT));
  if (p.quickSellPercents) s.quickSellPercents = p.quickSellPercents.map((v) => clamp(v, PERCENT_RANGE.min, PERCENT_RANGE.max));
  if (p.instantBuyAmount !== undefined) s.instantBuyAmount = Math.min(p.instantBuyAmount, MAX_NATIVE_AMOUNT);
}

/** Returns a new settings object with the (already validated) patch merged in. */
export function applySettingsPatch(current: UserSettings, patch: SettingsPatch): UserSettings {
  const next = structuredClone(current);
  for (const chain of CHAIN_IDS) {
    const p = patch.trade?.[chain];
    if (p) applyChainPatch(chain, next.trade[chain], p);
  }
  const { riskThresholds, ...display } = patch.display ?? {};
  Object.assign(next.display, display);
  Object.assign(next.display.riskThresholds, riskThresholds);
  return next;
}

/** Rebuild settings from persisted data: defaults overlaid with whatever still validates. */
export function normalizeSettings(raw: unknown): UserSettings {
  const parsed = settingsPatchSchema.safeParse(raw);
  return parsed.success ? applySettingsPatch(defaultSettings(), parsed.data) : defaultSettings();
}
