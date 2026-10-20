import { describe, expect, it } from 'vitest';
import type { ChainMarketInfo, TradePreset } from '@trenchscope/shared';
import { earlySummaryLine } from '../EarlyBuyers';
import { feeVerdict } from './CongestionHint';

const tiers = { low: 0.0002, medium: 0.0004, high: 0.0012 };
const market = (label: 'normal' | 'busy' | 'congested'): ChainMarketInfo => ({
  chain: 'sol',
  nativeUsd: 180,
  nativeChange24h: 0,
  priorityFee: tiers,
  tokensTracked: 1,
  launches1h: 1,
  migrations1h: 0,
  volume24hUsd: 1,
  congestion: { level: label === 'congested' ? 0.8 : label === 'busy' ? 0.5 : 0.2, label },
});
const preset = (priorityFee: number, tip = 0, antiMev = false): TradePreset => ({ id: 'P1', slippage: 0.2, autoSlippage: false, priorityFee, tip, antiMev });

describe('feeVerdict', () => {
  it('stays quiet on a normal network or without data', () => {
    expect(feeVerdict(preset(0), market('normal'))).toBeNull();
    expect(feeVerdict(preset(0), undefined)).toBeNull();
  });

  it('warns of expiry below the low tier only while congested, of slow landing below medium once busy', () => {
    expect(feeVerdict(preset(0.0001), market('congested'))).toBe('fail');
    expect(feeVerdict(preset(0.0001), market('busy'))).toBe('slow');
    expect(feeVerdict(preset(0.0003), market('congested'))).toBe('slow');
    expect(feeVerdict(preset(0.0004), market('congested'))).toBeNull();
  });

  it('counts the anti-MEV tip in the bid, as the server does', () => {
    expect(feeVerdict(preset(0.0002, 0.0003, true), market('congested'))).toBeNull();
    expect(feeVerdict(preset(0.0001, 0.0003, false), market('congested'))).toBe('fail');
  });
});

describe('earlySummaryLine', () => {
  it('counts every buyer above dust as still holding', () => {
    expect(earlySummaryLine({ holding: 20, added: 4, soldPart: 17, soldAll: 12, holdRateTotal: 0.2084 })).toBe('41 still holding · 12 sold all · hold 20.8% of supply');
  });
});
