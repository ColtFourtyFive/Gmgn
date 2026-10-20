// Token page detail (the summary plus curve, pool and dev info) and the
// creator-side views: dev info with past launches, tokens a wallet created.

import type { DevInfo, DevToken, TokenDetail } from '@trenchscope/shared';
import type { TokenState, WalletState } from '../../sim/world';
import { clampInt, fresh, SUMMARY_MAX_MS, SUMMARY_MIN_MS, type TokenCore } from './core';
import { devGroupBalance, devStatusOf, devTokenRow, isRugged } from './security';
import type { TokenSummaries } from './summary';

export class TokenDetails {
  constructor(
    private readonly core: TokenCore,
    private readonly summaries: TokenSummaries,
  ) {}

  detail(t: TokenState): TokenDetail {
    const { world } = this.core.ctx;
    const now = world.now;
    const c = this.core.cachesOf(t.address);
    if (fresh(c.detail, t.version, now, SUMMARY_MIN_MS, SUMMARY_MAX_MS)) return c.detail!.value;
    const sum = this.summaries.summary(t);
    // The summary may be served from its 1s floor and predate the latest trade: record the
    // version it actually reflects so the next call past the floor rebuilds (and the token
    // channel re-broadcasts) instead of treating this detail as current for SUMMARY_MAX_MS.
    const version = c.summary && c.summary.value === sum ? c.summary.version : t.version;
    const nativeUsd = world.nativeUsd(t.chain);
    const curve =
      t.curve && t.status !== 'migrated'
        ? {
            virtualNative: t.curve.virtualNative,
            virtualTokens: t.curve.virtualTokens,
            realNative: t.curve.realNative,
            realTokens: t.curve.realTokens,
            initialRealTokens: t.curve.initialRealTokens,
            progress: world.progress(t),
            graduationMarketCapUsd: world.graduationMarketCapUsd(t),
          }
        : null;
    const pool = t.pool
      ? {
          address: t.pool.address,
          dex: t.pool.dex,
          nativeReserve: t.pool.native,
          tokenReserve: t.pool.tokens,
          liquidityUsd: 2 * t.pool.native * nativeUsd,
          initialLiquidityUsd: t.pool.initialLiquidityUsd,
          lpBurnedRate: t.pool.lpBurnedRate,
          createdAt: t.pool.createdAt,
          feeRate: t.pool.feeRate,
        }
      : null;
    const value: TokenDetail = {
      ...sum,
      description: t.description,
      decimals: t.decimals,
      circulatingSupply: t.totalSupply,
      nativeUsd,
      curve,
      pool,
      dev: this.devInfo(t),
      athPriceUsd: Math.max(t.athPriceUsd, sum.priceUsd),
      totalFeesUsd: t.totalFeesUsd,
    };
    c.detail = { at: now, version, value };
    return value;
  }

  /** Token version the cached detail reflects (-1 when none); the token channel uses it to avoid stale broadcasts. */
  detailVersion(t: TokenState): number {
    return this.core.caches.get(t.address)?.detail?.version ?? -1;
  }

  devInfo(t: TokenState): DevInfo {
    const { world } = this.core.ctx;
    const s = this.core.trackOf(t);
    const agg = this.core.devAgg(t.creator);
    const devBal = devGroupBalance(world, t);
    const priceUsd = world.priceUsd(t);
    const tokens = agg.tokens.map((row) =>
      row.address === t.address
        ? {
            ...row,
            status: t.status,
            marketCapUsd: priceUsd * t.totalSupply,
            athMarketCapUsd: Math.max(t.athMarketCapUsd, priceUsd * t.totalSupply),
            rugged: isRugged(s, priceUsd, t.athPriceUsd),
          }
        : row,
    );
    return {
      address: t.creator,
      holdRate: devBal / t.totalSupply,
      status: devStatusOf(s, devBal),
      createdCount: agg.created,
      migratedCount: agg.migrated,
      ruggedCount: agg.rugged,
      migrationRate: agg.created > 0 ? agg.migrated / agg.created : 0,
      bestAthMarketCapUsd: agg.bestAth,
      fundedBy: world.wallets.get(t.creator)?.fundedBy ?? null,
      tokens,
    };
  }

  /** Tokens the wallet created that still exist, newest first (default 100, max 500). */
  createdTokens(w: WalletState, limit?: number): DevToken[] {
    const { world } = this.core.ctx;
    const lim = clampInt(limit, 100, 1, 500);
    const out: DevToken[] = [];
    for (let i = w.createdTokens.length - 1; i >= 0 && out.length < lim; i--) {
      const t = world.tokens.get(w.createdTokens[i]);
      if (t) out.push(devTokenRow(world, t, this.core.liveRugged(t)));
    }
    return out;
  }
}
