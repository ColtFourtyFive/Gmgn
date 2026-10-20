import { describe, expect, it } from 'vitest';
import type { Position } from '@trenchscope/shared';
import { shareDataFromPosition, shareStats, signedUsd, sparklineResolution, type ShareToken } from './model';

const TOKEN: ShareToken = { chain: 'sol', address: 'tok', symbol: 'FROG', name: 'Frog', logoSeed: 's', logoGlyph: '🐸', priceUsd: 0.0002, marketCapUsd: 200_000 };

function position(patch: Partial<Position> = {}): Position {
  return {
    chain: 'sol',
    token: 'tok',
    wallet: 'w',
    addrType: 'wallet',
    walletTags: [],
    walletLabel: null,
    balance: 1_000_000,
    holdRate: 0.001,
    valueUsd: 200,
    costBasisUsd: 50,
    avgBuyPriceUsd: 0.00005,
    avgSellPriceUsd: 0,
    boughtUsd: 50,
    soldUsd: 0,
    boughtTokens: 1_000_000,
    soldTokens: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 150,
    totalPnlUsd: 150,
    pnlRate: 3,
    buys: 1,
    sells: 0,
    firstBuyAt: 0,
    lastActiveAt: 0,
    holdSeconds: 3_900,
    nativeBalance: 1,
    fundedBy: null,
    ...patch,
  };
}

describe('shareDataFromPosition', () => {
  it('re-prices an open position at the current price and reads MCs from the supply', () => {
    const d = shareDataFromPosition(position({ realizedPnlUsd: 10 }), TOKEN, null, 1);
    expect(d.status).toBe('open');
    expect(d.pnlUsd).toBeCloseTo(10 + (1_000_000 * 0.0002 - 50), 9);
    expect(d.pnlRate).toBeCloseTo(160 / 50, 9);
    expect(d.entryMcapUsd).toBeCloseTo(50_000, 6);
    expect(d.exitMcapUsd).toBe(200_000);
    expect(shareStats(d).map((s) => s.label)).toEqual(['Entry MC', 'Current MC', 'Holding for', 'Invested']);
  });

  it('uses the average exit for closed positions', () => {
    const d = shareDataFromPosition(position({ balance: 0, avgSellPriceUsd: 0.0001, realizedPnlUsd: -20, boughtUsd: 80 }), TOKEN, '@frogking', 1);
    expect(d.status).toBe('closed');
    expect(d.pnlUsd).toBe(-20);
    expect(d.pnlRate).toBeCloseTo(-0.25, 9);
    expect(d.exitMcapUsd).toBeCloseTo(100_000, 6);
    expect(d.trader).toBe('@frogking');
    expect(shareStats(d)[1]).toEqual({ label: 'Exit MC', value: '$100K' });
  });
});

describe('formatting', () => {
  it('signs dollars with full cents below $100K and compacts above', () => {
    expect(signedUsd(1234.5)).toBe('+$1,234.50');
    expect(signedUsd(-0.5)).toBe('−$0.50');
    expect(signedUsd(2_500_000)).toBe('+$2.5M');
    expect(signedUsd(0)).toBe('$0.00');
  });

  it('picks the finest candle resolution whose 120 candles cover the hold', () => {
    expect(sparklineResolution(60)).toBe('1s');
    expect(sparklineResolution(600)).toBe('15s');
    expect(sparklineResolution(2 * 3600)).toBe('1m');
    expect(sparklineResolution(5 * 3600)).toBe('5m');
    expect(sparklineResolution(20 * 3600)).toBe('15m');
    expect(sparklineResolution(3 * 86400)).toBe('1h');
  });
});
