import { describe, expect, it } from 'vitest';
import { DEFAULT_STRATEGY, EMPTY_STRATEGY } from '@/components/trade/StrategyEditor';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { ApiError } from '@/lib/api';
import { addressError, isAddressFor, normalizeAddress, sameAddress } from './address';
import { splitFieldError } from './errors';
import { sameSettings, validateSettings } from './settings/model';
import { strategyError } from './strategy';

const SOL = '87SoWET5Fn33sKmGqxzx1YV5STjfdox3ZvVLzgdktxa';
const EVM = '0xF0eb02f3e0685ed360ba90485c270cd68f44ca43';

describe('address helpers', () => {
  it('validates per chain style', () => {
    expect(isAddressFor('sol', SOL)).toBe(true);
    expect(isAddressFor('sol', EVM)).toBe(false);
    expect(isAddressFor('bsc', EVM)).toBe(true);
    expect(isAddressFor('base', SOL)).toBe(false);
    expect(isAddressFor('sol', `${SOL.slice(0, 10)}0OIl`)).toBe(false);
  });
  it('normalizes EVM case only', () => {
    expect(normalizeAddress('eth', ` ${EVM} `)).toBe(EVM.toLowerCase());
    expect(normalizeAddress('sol', ` ${SOL} `)).toBe(SOL);
    expect(sameAddress('bsc', EVM, EVM.toLowerCase())).toBe(true);
    expect(sameAddress('sol', SOL, SOL.toLowerCase())).toBe(false);
  });
  it('explains invalid input', () => {
    expect(addressError('sol', '')).toMatch(/Enter/);
    expect(addressError('bsc', '0x12')).toMatch(/0x followed by 40/);
    expect(addressError('sol', SOL)).toBeNull();
  });
});

describe('splitFieldError', () => {
  it('maps "field.path: message" 400s to the top-level field', () => {
    expect(splitFieldError(new ApiError(400, 'strategy.takeProfits.0.sellPercent: must be <= 100'))).toEqual({ field: 'strategy', message: 'Must be <= 100' });
  });
  it('keeps other errors whole', () => {
    expect(splitFieldError(new ApiError(404, 'wallet not found'))).toEqual({ field: null, message: 'Wallet not found' });
  });
});

describe('strategyError', () => {
  it('accepts the default ladder and rejects empty / out-of-range rules', () => {
    expect(strategyError(DEFAULT_STRATEGY)).toBeNull();
    expect(strategyError(EMPTY_STRATEGY)).toMatch(/at least one/);
    expect(strategyError({ ...EMPTY_STRATEGY, stopLosses: [{ lossPct: 100, sellPercent: 100 }] })).toMatch(/Stop-loss/);
    expect(strategyError({ ...EMPTY_STRATEGY, takeProfits: [{ changePct: 50, sellPercent: 0 }] })).toMatch(/Sell amounts/);
  });
});

describe('settings model', () => {
  const settings = () => ({ trade: structuredClone(DEFAULT_TRADE), display: structuredClone(DEFAULT_DISPLAY) });
  it('defaults are valid', () => {
    expect(validateSettings(settings())).toEqual({});
  });
  it('flags bad values by path', () => {
    const s = settings();
    s.trade.sol.buyPresets.P2.slippage = 2;
    s.trade.bsc.quickBuyAmounts = [0.1, NaN];
    s.display.riskThresholds.dev = 1.5;
    expect(Object.keys(validateSettings(s)).sort()).toEqual(['display.riskThresholds.dev', 'trade.bsc.quickBuyAmounts', 'trade.sol.buy.P2.slippage']);
  });
  it('ignores the theme when comparing drafts', () => {
    const a = settings();
    const b = settings();
    b.display.theme = 'light';
    expect(sameSettings(a, b)).toBe(true);
    b.display.compactRows = !a.display.compactRows;
    expect(sameSettings(a, b)).toBe(false);
  });
});
