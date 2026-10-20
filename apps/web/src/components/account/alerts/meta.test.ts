import { describe, expect, it } from 'vitest';
import { holdingTriggersLabel, signalFiltersLabel, signalKindsLabel } from './meta';

describe('alert rule summaries', () => {
  it('summarises holding triggers', () => {
    expect(holdingTriggersLabel({ basis: 'vs_cost', upPct: 50, downPct: 20, devSell: true, liquidityDropPct: 40, minPositionUsd: 10, cooldownMin: 60 })).toBe('+50% / −20% vs cost · Dev sells · Liquidity −40%');
    expect(holdingTriggersLabel({ basis: '5m_change', upPct: 25, downPct: null, devSell: false, liquidityDropPct: null, minPositionUsd: 0, cooldownMin: 5 })).toBe('+25% in 5m');
  });

  it('summarises signal subscription kinds and filters', () => {
    expect(signalKindsLabel([{ kinds: ['smart_buy', 'kol_buy', 'ath', 'cto'], excludeRisk: true }])).toBe('Smart buy, KOL buy, New ATH +1');
    expect(signalKindsLabel([{ kinds: ['smart_buy'], excludeRisk: true }, { kinds: [], excludeRisk: true }])).toBe('Any signal');
    expect(signalFiltersLabel({ kinds: [], minLiquidityUsd: 10_000, mcMin: 50_000, mcMax: null, minHolders: 50, maxTop10: 0.3, excludeRisk: true })).toBe('Liq ≥ $10K · MC $50K–∞ · ≥ 50 holders · Top 10 ≤ 30% · Quality');
    expect(signalFiltersLabel({ kinds: [], excludeRisk: false })).toBe('');
  });
});
