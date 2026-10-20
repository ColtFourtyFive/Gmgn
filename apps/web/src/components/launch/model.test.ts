import { describe, expect, it } from 'vitest';
import { CHAINS, PLATFORM_FEE_RATE, type LaunchConfig, type LaunchpadCurve, type TradePreset } from '@trenchscope/shared';
import { EMPTY_STRATEGY } from '@/components/trade/StrategyEditor';
import {
  launchCost,
  nativeUsdOf,
  normalizeSymbol,
  simulateCreationBlock,
  socialError,
  toLaunchRequest,
  validateLaunch,
  type LaunchForm,
} from './model';

// Moonpit as GET /api/launch/config reports it at $150/SOL.
const MOONPIT: LaunchpadCurve = {
  id: 'moonpit',
  chain: 'sol',
  name: 'Moonpit',
  color: '#5EE6A8',
  totalSupply: 1e9,
  virtualNative: 30,
  virtualTokens: 1_073_000_000,
  curveTokens: 793_100_000,
  feeRate: 0.01,
  migrationFeeNative: 1.5,
  graduationNative: 85.005,
  launchMarketCapUsd: (30 / 1_073_000_000) * 150 * 1e9,
  graduationMarketCapUsd: 75_000,
};

const CFG: LaunchConfig = {
  launchpads: { sol: [MOONPIT], bsc: [], base: [], eth: [] },
  launchFeeNative: { sol: 0.02, bsc: 0.006, base: 0.0011, eth: 0.0011 },
  glyphs: ['🚀', '🐸'],
  glyphNarratives: { '🚀': 'Space', '🐸': 'Frogs' },
  defaultGlyph: '🚀',
  reservedTickers: ['PEPE', 'WIF'],
  limits: {
    nameMaxLength: 32,
    symbolMaxLength: 10,
    descriptionMaxLength: 280,
    maxDevBuyNative: { sol: 10, bsc: 3, base: 0.6, eth: 0.6 },
    maxBundleWallets: 4,
    maxBundleBuyNative: { sol: 5, bsc: 1.5, base: 0.3, eth: 0.3 },
    launchesPerHour: 5,
  },
};

const PRESET: TradePreset = { id: 'P1', slippage: 0.1, autoSlippage: false, priorityFee: 0.001, tip: 0.002, antiMev: true };

function form(patch: Partial<LaunchForm> = {}): LaunchForm {
  return {
    launchpad: 'moonpit',
    name: 'Moon Frog',
    symbol: 'MFROG',
    description: '',
    glyph: '🐸',
    socials: { twitter: '', telegram: '', website: '' },
    devBuy: 1,
    useBundles: false,
    bundleWallets: 2,
    bundleBuy: 0.5,
    useStrategy: false,
    strategy: EMPTY_STRATEGY,
    presetId: 'P1',
    ...patch,
  };
}

describe('normalizeSymbol', () => {
  it('upper-cases, drops a leading $ and anything but letters and digits, and caps the length', () => {
    expect(normalizeSymbol('$pepe', 10)).toBe('PEPE');
    expect(normalizeSymbol('moon frog!', 10)).toBe('MOONFROG');
    expect(normalizeSymbol('abcdefghijklmno', 10)).toBe('ABCDEFGHIJ');
    expect(normalizeSymbol('  $$x1', 10)).toBe('X1');
  });
});

describe('socialError', () => {
  it('accepts https links on the allowed hosts and blanks', () => {
    expect(socialError('twitter', '')).toBeNull();
    expect(socialError('twitter', 'https://x.com/moonfrog')).toBeNull();
    expect(socialError('twitter', 'https://www.twitter.com/moonfrog')).toBeNull();
    expect(socialError('telegram', 'https://t.me/moonfrog')).toBeNull();
    expect(socialError('website', 'https://moonfrog.fun')).toBeNull();
  });

  it('refuses other schemes, credentials, look-alike hosts and hostless links', () => {
    expect(socialError('twitter', 'http://x.com/moonfrog')).toMatch(/https/);
    expect(socialError('twitter', 'https://x.com.evil.io/a')).toMatch(/x\.com/);
    expect(socialError('telegram', 'tg://resolve?domain=a')).toMatch(/t\.me/);
    expect(socialError('website', 'javascript:alert(1)')).toMatch(/https/);
    expect(socialError('website', 'https://user:pw@moonfrog.fun')).toMatch(/https/);
    expect(socialError('website', 'https://localhost')).toMatch(/https/);
  });
});

describe('validateLaunch', () => {
  it('passes a complete form', () => {
    expect(validateLaunch(form(), 'sol', CFG)).toEqual({});
  });

  it('flags reserved and malformed fields', () => {
    const e = validateLaunch(form({ name: ' ', symbol: 'PEPE', glyph: '🦄', launchpad: 'fourpad', devBuy: 11 }), 'sol', CFG);
    expect(Object.keys(e).sort()).toEqual(['devBuy', 'glyph', 'launchpad', 'name', 'symbol']);
    expect(validateLaunch(form({ name: 'w.i.f' }), 'sol', CFG).name).toMatch(/reserved/);
    expect(validateLaunch(form({ name: 'Moon‮Frog' }), 'sol', CFG).name).toMatch(/invisible/);
    expect(validateLaunch(form({ name: 'Moon Frog' }), 'sol', CFG).name).toMatch(/invisible/);
    expect(validateLaunch(form({ name: 'Zalgò́̂̃' }), 'sol', CFG).name).toMatch(/stacked/);
    expect(validateLaunch(form({ name: 'Café' }), 'sol', CFG).name).toBeUndefined();
    expect(validateLaunch(form({ description: 'x'.repeat(281) }), 'sol', CFG).description).toMatch(/280/);
  });

  it('needs a bundle amount within the cap and a dev buy behind a strategy', () => {
    expect(validateLaunch(form({ useBundles: true, bundleBuy: null }), 'sol', CFG).bundleBuy).toBeDefined();
    expect(validateLaunch(form({ useBundles: true, bundleBuy: 6 }), 'sol', CFG).bundleBuy).toMatch(/5 SOL/);
    expect(validateLaunch(form({ useBundles: true, devBuy: 0 }), 'sol', CFG).bundleBuy).toMatch(/dev buy/);
    expect(validateLaunch(form({ useStrategy: true, devBuy: 0 }), 'sol', CFG).strategy).toMatch(/dev buy/);
    // An empty ladder is caught by the shared strategy checks.
    expect(validateLaunch(form({ useStrategy: true }), 'sol', CFG).strategy).toMatch(/exit rule/);
  });
});

describe('toLaunchRequest', () => {
  it('sends only filled socials, bundles when enabled and a strategy only with a dev buy', () => {
    const req = toLaunchRequest(form({ socials: { twitter: ' https://x.com/a ', telegram: '', website: '' }, useBundles: true, useStrategy: true, devBuy: 0 }), 'sol');
    expect(req.socials).toEqual({ twitter: 'https://x.com/a' });
    expect(req).toMatchObject({ bundleWallets: 2, bundleBuyNative: 0.5, devBuyNative: 0 });
    expect(req.strategy).toBeUndefined();
    expect(req.description).toBeUndefined();
    expect(toLaunchRequest(form(), 'sol').bundleWallets).toBeUndefined();
  });
});

describe('launchCost', () => {
  it('adds the launch fee and each buy with its platform and network fee (as the server checks it)', () => {
    const network = CHAINS.sol.baseNetworkFee + 0.001 + 0.002;
    const c = launchCost('sol', CFG, PRESET, 1, 2, 0.5);
    expect(c.platformFees).toBeCloseTo(2 * PLATFORM_FEE_RATE, 12);
    expect(c.networkFees).toBeCloseTo(3 * network, 12);
    expect(c.total).toBeCloseTo(0.02 + (1 * (1 + PLATFORM_FEE_RATE) + network) + 2 * (0.5 * (1 + PLATFORM_FEE_RATE) + network), 12);
    expect(launchCost('sol', CFG, PRESET, 0, 0, 0)).toMatchObject({ total: 0.02, networkFees: 0, platformFees: 0 });
  });
});

describe('simulateCreationBlock', () => {
  it('prices the launch market cap like the config and fills buys in order', () => {
    expect(nativeUsdOf(MOONPIT)).toBeCloseTo(150, 9);
    const empty = simulateCreationBlock(MOONPIT, 0, 0, 0);
    expect(empty.marketCapUsd).toBeCloseTo(MOONPIT.launchMarketCapUsd, 6);
    expect(empty.progress).toBe(0);

    const dev = simulateCreationBlock(MOONPIT, 1, 0, 0);
    // 1 SOL less the 1% curve fee into 30 virtual SOL: about 3.4% of supply.
    expect(dev.devShare).toBeCloseTo(((0.99 * 1_073_000_000) / 30.99) / 1e9, 6);
    expect(dev.marketCapUsd).toBeGreaterThan(empty.marketCapUsd);

    const both = simulateCreationBlock(MOONPIT, 1, 2, 1);
    expect(both.devShare).toBeCloseTo(dev.devShare, 12);
    // Later buys pay a higher price, so each bundle gets less than the dev buy did.
    expect(both.bundleShareEach).toBeLessThan(dev.devShare);
    expect(both.bundleShare).toBeGreaterThan(both.bundleShareEach);
    expect(both.progress).toBeCloseTo((both.devTokens + both.bundleShare * 1e9) / MOONPIT.curveTokens, 9);
  });
});
