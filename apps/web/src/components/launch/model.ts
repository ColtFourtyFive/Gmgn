// Launch form logic (pure): the form state, field normalization and checks
// mirroring the server's launch schema (docs/API.md › Token launch), the cost
// of the creation block, and what the dev buy and bundle wallets get from a
// fresh bonding curve (quoteCurveBuy on the launchpad's curve).

import {
  CHAINS,
  PLATFORM_FEE_RATE,
  quoteCurveBuy,
  type ChainId,
  type CurveState,
  type LaunchConfig,
  type LaunchpadCurve,
  type LaunchRequest,
  type PresetId,
  type Socials,
  type StrategySpec,
  type TradePreset,
} from '@trenchscope/shared';
import { strategyError } from '@/components/account/strategy';

export type SocialKey = keyof Socials;
export const SOCIAL_KEYS: SocialKey[] = ['twitter', 'telegram', 'website'];

/** Hosts each social link must live on (null: any host). */
export const SOCIAL_HOSTS: Record<SocialKey, string[] | null> = {
  twitter: ['x.com', 'twitter.com'],
  telegram: ['t.me', 'telegram.me'],
  website: null,
};

/** Dev buy quick picks per chain (native); 0 launches without a dev buy. */
export const DEV_BUY_PRESETS: Record<ChainId, number[]> = {
  sol: [0, 0.5, 1, 2, 5],
  bsc: [0, 0.1, 0.3, 1, 2],
  base: [0, 0.01, 0.05, 0.1, 0.3],
  robinhood: [0, 0.01, 0.05, 0.1, 0.3],
  eth: [0, 0.01, 0.05, 0.1, 0.3],
};

/** Starting buy per bundle wallet (native). */
export const BUNDLE_BUY_DEFAULT: Record<ChainId, number> = { sol: 0.5, base: 0.02, robinhood: 0.02, bsc: 0.1, eth: 0.02 };

export interface LaunchForm {
  launchpad: string;
  name: string;
  /** Already normalized (see normalizeSymbol). */
  symbol: string;
  description: string;
  glyph: string;
  socials: Record<SocialKey, string>;
  devBuy: number | null;
  useBundles: boolean;
  bundleWallets: number;
  bundleBuy: number | null;
  useStrategy: boolean;
  strategy: StrategySpec;
  presetId: PresetId;
}

export type LaunchField = 'launchpad' | 'name' | 'symbol' | 'description' | 'glyph' | SocialKey | 'devBuy' | 'bundleBuy' | 'strategy';
export type LaunchErrors = Partial<Record<LaunchField, string>>;

/** Control, zero-width, bidi-override, lone-surrogate and line / paragraph separator characters (as the server). */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
/** Stacked combining marks ("Zalgo" text); the server refuses 4+ in a row. */
const STACKED_MARKS = /\p{M}{4,}/u;
const unreadable = (s: string) => INVISIBLE.test(s) || STACKED_MARKS.test(s);

const tickerOf = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Ticker as typed → as launched: upper-cased, a leading "$" dropped, letters and digits only, capped. */
export function normalizeSymbol(raw: string, maxLength: number): string {
  return raw
    .trimStart()
    .replace(/^\$/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLength);
}

export function nameError(name: string, cfg: LaunchConfig): string | null {
  const v = name.trim();
  if (!v) return 'Give your token a name.';
  if (v.length > cfg.limits.nameMaxLength) return `Keep the name to ${cfg.limits.nameMaxLength} characters.`;
  if (unreadable(v)) return 'Remove control, invisible or stacked characters.';
  if (cfg.reservedTickers.includes(tickerOf(v))) return 'This name is reserved.';
  return null;
}

export function symbolError(symbol: string, cfg: LaunchConfig): string | null {
  if (!symbol) return 'Pick a ticker.';
  if (!new RegExp(`^[A-Z0-9]{1,${cfg.limits.symbolMaxLength}}$`).test(symbol)) return `Use 1–${cfg.limits.symbolMaxLength} letters or digits.`;
  if (cfg.reservedTickers.includes(symbol)) return `$${symbol} is reserved: pick another ticker.`;
  return null;
}

export function descriptionError(description: string, cfg: LaunchConfig): string | null {
  const v = description.trim().replace(/\r\n?/g, '\n');
  if (v.length > cfg.limits.descriptionMaxLength) return `Keep it to ${cfg.limits.descriptionMaxLength} characters.`;
  if (unreadable(v.replace(/\n/g, ''))) return 'Remove control, invisible or stacked characters.';
  return null;
}

/** An https link without credentials, on the allowed hosts; blank is fine (no link). */
export function socialError(key: SocialKey, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const hosts = SOCIAL_HOSTS[key];
  const fix = hosts ? `Use an https link on ${hosts.join(' or ')}.` : 'Use an https:// link.';
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return fix;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.')) return fix;
  if (hosts && !hosts.includes(host)) return fix;
  if (v.length > 200) return 'This link is too long.';
  return null;
}

/** First problem per field, mirroring the server checks (empty when the form can be sent). */
export function validateLaunch(f: LaunchForm, chain: ChainId, cfg: LaunchConfig): LaunchErrors {
  const e: LaunchErrors = {};
  const unit = CHAINS[chain].nativeSymbol;
  if (!cfg.launchpads[chain].some((lp) => lp.id === f.launchpad)) e.launchpad = 'Pick a launchpad.';
  const name = nameError(f.name, cfg);
  if (name) e.name = name;
  const symbol = symbolError(f.symbol, cfg);
  if (symbol) e.symbol = symbol;
  const description = descriptionError(f.description, cfg);
  if (description) e.description = description;
  if (!cfg.glyphs.includes(f.glyph)) e.glyph = 'Pick a logo from the list.';
  for (const key of SOCIAL_KEYS) {
    const s = socialError(key, f.socials[key]);
    if (s) e[key] = s;
  }
  const maxDev = cfg.limits.maxDevBuyNative[chain];
  if (f.devBuy === null || !(f.devBuy >= 0)) e.devBuy = `Enter a dev buy in ${unit} (0 for none).`;
  else if (f.devBuy > maxDev) e.devBuy = `At most ${maxDev} ${unit}.`;
  if (f.useBundles) {
    const maxBundle = cfg.limits.maxBundleBuyNative[chain];
    if (!(f.bundleBuy !== null && f.bundleBuy > 0)) e.bundleBuy = `Enter what each bundle wallet buys in ${unit}.`;
    else if (f.bundleBuy > maxBundle) e.bundleBuy = `At most ${maxBundle} ${unit} per wallet.`;
    // Bundle wallets only ever sell alongside the dev wallet, so without a dev bag they could never exit.
    else if (!(f.devBuy !== null && f.devBuy > 0)) e.bundleBuy = 'Bundle wallets sell when you sell your dev buy: add a dev buy first.';
  }
  if (f.useStrategy) {
    if (!(f.devBuy !== null && f.devBuy > 0)) e.strategy = 'An exit strategy needs a dev buy to sell from.';
    else {
      const s = strategyError(f.strategy);
      if (s) e.strategy = s;
    }
  }
  return e;
}

/** The POST /api/launch body for a valid form. */
export function toLaunchRequest(f: LaunchForm, chain: ChainId): LaunchRequest {
  const socials: Socials = {};
  for (const key of SOCIAL_KEYS) if (f.socials[key].trim()) socials[key] = f.socials[key].trim();
  const devBuy = f.devBuy ?? 0;
  return {
    chain,
    launchpad: f.launchpad,
    name: f.name.trim(),
    symbol: f.symbol,
    description: f.description.trim() || undefined,
    socials,
    logoGlyph: f.glyph,
    devBuyNative: devBuy,
    ...(f.useBundles && f.bundleWallets > 0 ? { bundleWallets: f.bundleWallets, bundleBuyNative: f.bundleBuy ?? 0 } : {}),
    presetId: f.presetId,
    ...(f.useStrategy && devBuy > 0 ? { strategy: f.strategy } : {}),
  };
}

/** Network fee of one buy with a preset (base fee + priority fee + anti-MEV tip). */
export function networkFeeOf(chain: ChainId, preset: TradePreset): number {
  return CHAINS[chain].baseNetworkFee + preset.priorityFee + (preset.antiMev ? preset.tip : 0);
}

export interface LaunchCost {
  launchFee: number;
  devBuy: number;
  /** All bundle wallets together. */
  bundleBuys: number;
  platformFees: number;
  networkFees: number;
  total: number;
}

/** What the launch takes from the wallet: the fee plus each creation-block buy with its platform and network fee. */
export function launchCost(chain: ChainId, cfg: LaunchConfig, preset: TradePreset, devBuy: number, bundleWallets: number, bundleBuy: number): LaunchCost {
  const buys = [...(devBuy > 0 ? [devBuy] : []), ...(bundleBuy > 0 ? Array<number>(bundleWallets).fill(bundleBuy) : [])];
  const spent = buys.reduce((a, b) => a + b, 0);
  const platformFees = spent * PLATFORM_FEE_RATE;
  const networkFees = buys.length * networkFeeOf(chain, preset);
  const launchFee = cfg.launchFeeNative[chain];
  return {
    launchFee,
    devBuy: devBuy > 0 ? devBuy : 0,
    bundleBuys: bundleBuy > 0 ? bundleWallets * bundleBuy : 0,
    platformFees,
    networkFees,
    total: launchFee + spent + platformFees + networkFees,
  };
}

/** USD per native unit the config priced its market caps at. */
export function nativeUsdOf(curve: LaunchpadCurve): number {
  const spot = curve.virtualNative / curve.virtualTokens;
  return spot > 0 ? curve.launchMarketCapUsd / (spot * curve.totalSupply) : 0;
}

export interface CreationBlock {
  devTokens: number;
  /** Shares of total supply. */
  devShare: number;
  bundleShareEach: number;
  bundleShare: number;
  /** Market cap and curve progress once the creation block filled. */
  marketCapUsd: number;
  progress: number;
}

/** Fill the dev buy, then each bundle wallet, against a fresh curve (same order as the server). */
export function simulateCreationBlock(curve: LaunchpadCurve, devBuy: number, bundleWallets: number, bundleBuy: number): CreationBlock {
  const c: CurveState = { virtualNative: curve.virtualNative, virtualTokens: curve.virtualTokens, realTokens: curve.curveTokens, realNative: 0 };
  const buy = (native: number): number => {
    if (!(native > 0)) return 0;
    const q = quoteCurveBuy(c, native, curve.feeRate);
    const net = q.amountIn - q.venueFee;
    c.virtualNative += net;
    c.realNative += net;
    c.virtualTokens -= q.amountOut;
    c.realTokens -= q.amountOut;
    return q.amountOut;
  };
  const devTokens = buy(devBuy);
  let bundleTokens = 0;
  let bundleEach = 0;
  for (let i = 0; i < bundleWallets; i++) {
    const got = buy(bundleBuy);
    if (i === 0) bundleEach = got;
    bundleTokens += got;
  }
  const supply = curve.totalSupply;
  return {
    devTokens,
    devShare: devTokens / supply,
    bundleShareEach: bundleEach / supply,
    bundleShare: bundleTokens / supply,
    marketCapUsd: (c.virtualNative / c.virtualTokens) * nativeUsdOf(curve) * supply,
    progress: curve.curveTokens > 0 ? 1 - c.realTokens / curve.curveTokens : 0,
  };
}

/** Observable launch traits buyers weigh, for the preview checklist. */
export function launchSignals(f: LaunchForm, block: CreationBlock): { key: string; label: string; ok: boolean; hint: string }[] {
  const socials = SOCIAL_KEYS.filter((k) => f.socials[k].trim()).length;
  const dev = block.devShare;
  return [
    { key: 'socials', label: 'Socials linked', ok: socials >= 2, hint: socials ? `${socials} of 3 links` : 'No X, Telegram or website yet' },
    { key: 'description', label: 'Real description', ok: f.description.trim().length >= 40, hint: 'A sentence or two on what the token is about' },
    {
      key: 'dev',
      label: 'Dev buy 1–6% of supply',
      ok: dev >= 0.01 && dev <= 0.06,
      hint: dev === 0 ? 'No dev buy: buyers read it as low conviction' : dev >= 0.2 ? 'A dev bag this heavy scares buyers off' : `Dev holds ${(dev * 100).toFixed(1)}%`,
    },
    { key: 'bundles', label: 'No bundle wallets', ok: !(f.useBundles && f.bundleWallets > 0), hint: 'Bundles show up as bundlers and raise the rug ratio' },
  ];
}
