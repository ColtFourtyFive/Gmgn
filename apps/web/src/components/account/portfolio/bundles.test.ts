import { describe, expect, it } from 'vitest';
import type { TokenPositionRow } from '@trenchscope/shared';
import { mergeBundleRows } from './bundles';

function row(p: Partial<TokenPositionRow>): TokenPositionRow {
  return {
    chain: 'sol',
    token: 'T',
    wallet: 'W',
    addrType: 'wallet',
    walletTags: [],
    walletLabel: null,
    balance: 100,
    holdRate: 0.01,
    valueUsd: 50,
    costBasisUsd: 40,
    avgBuyPriceUsd: 0.4,
    avgSellPriceUsd: 0,
    boughtUsd: 40,
    soldUsd: 0,
    boughtTokens: 100,
    soldTokens: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 10,
    totalPnlUsd: 10,
    pnlRate: 0.25,
    buys: 1,
    sells: 0,
    firstBuyAt: 1000,
    lastActiveAt: 1000,
    holdSeconds: 10,
    nativeBalance: 0,
    fundedBy: null,
    tokenInfo: { chain: 'sol', address: 'T', symbol: 'TT', name: 'Tee', logoSeed: 'T', logoGlyph: '', priceUsd: 0.5, marketCapUsd: 1, liquidityUsd: 1, status: 'curve', launchpad: 'moonpit', createdAt: 0, priceChange24h: 0 },
    ...p,
  };
}

describe('portfolio bundle rows', () => {
  it('merges bundle wallets into their launch row and keeps them for the breakdown', () => {
    const main = row({ wallet: 'Main', walletRole: 'main' });
    const b1 = row({ wallet: 'B1', walletRole: 'bundle', balance: 300, valueUsd: 150, boughtTokens: 300, avgBuyPriceUsd: 0.2, boughtUsd: 60, totalPnlUsd: 90, firstBuyAt: 900 });
    const other = row({ token: 'U', wallet: 'Main', walletRole: 'main' });
    const [merged, plain] = mergeBundleRows([main, other, b1]);
    expect(merged.wallet).toBe('Main');
    expect(merged.bundles).toEqual([b1]);
    expect(merged.balance).toBe(400);
    expect(merged.valueUsd).toBe(200);
    expect(merged.avgBuyPriceUsd).toBeCloseTo((0.4 * 100 + 0.2 * 300) / 400);
    expect(merged.pnlRate).toBeCloseTo(100 / 100);
    expect(merged.firstBuyAt).toBe(900);
    expect(plain).toEqual({ ...other, bundles: [] });
  });

  it('keeps bundles whose launch wallet holds nothing as a bundle-only row', () => {
    const b1 = row({ wallet: 'B1', walletRole: 'bundle' });
    const b2 = row({ wallet: 'B2', walletRole: 'bundle' });
    const [only] = mergeBundleRows([b1, b2]);
    expect(only.walletRole).toBe('bundle');
    expect(only.bundles).toHaveLength(2);
    expect(only.balance).toBe(200);
  });
});
