// Token summaries (the row every list, feed and holding shows), token refs, hot
// scores and the security block with its rug-ratio inputs. A summary is rebuilt
// at most once per SUMMARY_MIN_MS while its token changes; an idle token gets a
// light refresh that reuses the holder-derived parts (see ./index.ts).

import type { StatWindow, TokenRef, TokenSecurity, TokenSummary, WindowStats } from '@trenchscope/shared';
import type { TokenState } from '../../sim/world';
import { DAY_MS, fresh, SUMMARY_MAX_MS, SUMMARY_MIN_MS, type TokenCaches, type TokenCore } from './core';
import { hotLevelOf, hotScore } from './scores';
import {
  buildChecks,
  Cohorts,
  DEV_MIGRATED,
  DEV_RESOLVED,
  DEV_RUGGED,
  devGroupBalance,
  devStatusOf,
  holderTagStats,
  riskLevelOf,
  rugRatio,
  safetyScore,
  type HolderScan,
  type RugInputs,
} from './security';
import { priceChangeAt, WINDOW_MS } from './stats';
import { flowSince, type TokenTrack } from './track';

/** Token refs reuse the latest security read up to this age (refs fill feeds, holdings and signals in bulk). */
const REF_RISK_MAX_MS = 30_000;

export class TokenSummaries {
  constructor(private readonly core: TokenCore) {}

  private securityOf(
    t: TokenState,
    s: TokenTrack,
    cohorts: Cohorts,
    scan: HolderScan,
    stats: Record<StatWindow, WindowStats>,
    priceUsd: number,
    now: number,
    smartCount: number,
  ): TokenSecurity {
    const supply = t.totalSupply;
    const sol = t.chain === 'sol';
    const devBal = devGroupBalance(this.core.ctx.world, t);
    const devStatus = devStatusOf(s, devBal);
    const holders = scan.holderCount;
    const bundlerVol = s.volumeUsd > 0 ? cohorts.cohortVolume('bundler') : 0;
    const insiderVol = s.volumeUsd > 0 ? cohorts.cohortVolume('insider') : 0;
    const w1h = stats['1h'];
    const wash1h = flowSince(s, now - 3600_000).washUsd;
    const base: Omit<TokenSecurity, 'checks' | 'rugRatio' | 'riskLevel'> = {
      renouncedMint: sol ? t.renouncedMint : null,
      renouncedFreeze: sol ? t.renouncedFreeze : null,
      isOpenSource: sol ? null : t.isOpenSource,
      isRenounced: sol ? null : t.isRenounced,
      isHoneypot: sol ? null : t.isHoneypot,
      buyTax: t.buyTax,
      sellTax: t.sellTax,
      lpBurnedRate: t.pool ? t.pool.lpBurnedRate : null,
      top10HolderRate: scan.top10Balance / supply,
      top100HolderRate: scan.top100Balance / supply,
      devHoldRate: devBal / supply,
      devStatus,
      insiderHoldRate: scan.insider.balance / supply,
      sniperHoldRate: scan.sniper.balance / supply,
      sniperCount: cohorts.sniperCount(),
      bundlerRate: s.volumeUsd > 0 ? Math.min(1, bundlerVol / s.volumeUsd) : 0,
      ratTraderRate: s.volumeUsd > 0 ? Math.min(1, insiderVol / s.volumeUsd) : 0,
      freshWalletRate: holders > 0 ? scan.fresh.count / holders : 0,
      botDegenRate: holders > 0 ? scan.bot.count / holders : 0,
      isWashTrading: w1h.swaps >= 20 && w1h.volumeUsd > 0 && wash1h >= 0.3 * w1h.volumeUsd,
    };
    const rug = rugRatio(this.rugInputs(t, s, base, scan, priceUsd, now));
    const sec: Omit<TokenSecurity, 'checks' | 'safety'> = { ...base, rugRatio: rug, riskLevel: riskLevelOf(rug, base.isHoneypot) };
    return {
      ...sec,
      checks: buildChecks({ security: sec, chain: t.chain, onCurve: t.status !== 'migrated', smartDegenCount: smartCount }),
      safety: safetyScore({ chain: t.chain, security: sec, holderCount: scan.holderCount }),
    };
  }

  /** Observable inputs of the rug ratio (exported shape lets tests evaluate the model). */
  rugInputs(t: TokenState, s: TokenTrack, sec: Omit<TokenSecurity, 'checks' | 'rugRatio' | 'riskLevel'>, scan: HolderScan, priceUsd: number, now: number): RugInputs {
    const agg = this.core.devAgg(t.creator);
    // Exclude this launch exactly as the (possibly slightly older) aggregate counted it.
    const own = agg.flags.get(t.address) ?? 0;
    return {
      chain: t.chain,
      status: t.status,
      ageMs: now - t.createdAt,
      devHoldRate: sec.devHoldRate,
      devStatus: sec.devStatus,
      devSoldEarlyFrac: s.devPeak > 0 ? s.devSoldEarly / s.devPeak : 0,
      athDrawdown: t.athPriceUsd > 0 ? Math.max(0, 1 - priceUsd / t.athPriceUsd) : 0,
      bundlerRate: sec.bundlerRate,
      bundlerHoldRate: scan.bundler.balance / t.totalSupply,
      insiderHoldRate: sec.insiderHoldRate,
      ratTraderRate: sec.ratTraderRate,
      sniperHoldRate: sec.sniperHoldRate,
      top10HolderRate: sec.top10HolderRate,
      devOtherCreated: Math.max(0, agg.created - (agg.flags.has(t.address) ? 1 : 0)),
      devOtherResolved: agg.resolved - (own & DEV_RESOLVED ? 1 : 0),
      devOtherRugged: agg.rugged - (own & DEV_RUGGED ? 1 : 0),
      devOtherMigrated: agg.migrated - (own & DEV_MIGRATED ? 1 : 0),
      renouncedMint: sec.renouncedMint,
      renouncedFreeze: sec.renouncedFreeze,
      isHoneypot: sec.isHoneypot,
      isOpenSource: sec.isOpenSource,
      isRenounced: sec.isRenounced,
      buyTax: sec.buyTax,
      sellTax: sec.sellTax,
      lpBurnedRate: sec.lpBurnedRate,
      isWashTrading: sec.isWashTrading,
    };
  }

  /** Rug inputs for a token right now (evaluation / debugging helper). */
  currentRugInputs(t: TokenState): RugInputs {
    const now = this.core.ctx.world.now;
    const s = this.core.trackOf(t);
    const summary = this.summary(t);
    const scan = this.core.cachesOf(t.address).scan!.value;
    return this.rugInputs(t, s, summary.security, scan, this.core.ctx.world.priceUsd(t), now);
  }

  summary(t: TokenState): TokenSummary {
    const now = this.core.ctx.world.now;
    const c = this.core.cachesOf(t.address);
    const prev = c.summary;
    if (fresh(prev, t.version, now, SUMMARY_MIN_MS, SUMMARY_MAX_MS + c.jitter)) return prev!.value;
    // Idle token (no trade since the last build) with holder-derived parts still fresh: light refresh.
    const light = !!prev && prev.version === t.version && now >= prev.at && this.core.scanFresh(t, c, now);
    const value = light ? this.lightSummary(t, c, prev!.value, now) : this.buildSummary(t, c, now);
    c.summary = { at: now, version: t.version, value };
    t.cache.volume24hUsd = value.stats['24h'].volumeUsd;
    return value;
  }

  /** Refresh price- and time-dependent fields of an idle token, reusing security / holder tags. */
  private lightSummary(t: TokenState, c: TokenCaches, prev: TokenSummary, now: number): TokenSummary {
    const { world } = this.core.ctx;
    const priceNative = world.priceNative(t);
    const priceUsd = priceNative * world.nativeUsd(t.chain);
    const mcap = priceUsd * t.totalSupply;
    const stats = this.core.statsOf(t, c, now, priceUsd);
    const summary: TokenSummary = {
      ...prev,
      priceUsd,
      priceNative,
      marketCapUsd: mcap,
      athMarketCapUsd: Math.max(t.athMarketCapUsd, mcap),
      liquidityUsd: world.liquidityUsd(t),
      stats,
      netBuy24hUsd: stats['24h'].buyVolumeUsd - stats['24h'].sellVolumeUsd,
      socials: { ...t.socials },
      xFollowers: t.xFollowers,
      cto: t.cto,
      boosted: t.boosted,
      isCopycat: t.isCopycat,
      watchers: t.watchers + this.core.viewerCount(t),
    };
    const hot1h = hotScore(summary, '1h', this.holderGrowth(this.core.trackOf(t), '1h', now));
    summary.hotLevel = hotLevelOf(hot1h);
    c.hot = { summary, scores: { '1h': hot1h } };
    return summary;
  }

  private buildSummary(t: TokenState, c: TokenCaches, now: number): TokenSummary {
    const { world } = this.core.ctx;
    const s = this.core.trackOf(t);
    const cohorts = new Cohorts(world, t, s);
    const priceNative = world.priceNative(t);
    const priceUsd = priceNative * world.nativeUsd(t.chain);
    const mcap = priceUsd * t.totalSupply;
    const stats = this.core.statsOf(t, c, now, priceUsd);
    const scan = this.core.scanOf(t, c, now, cohorts);
    this.core.remember(t, s, priceUsd);
    const agg = this.core.devAgg(t.creator);
    const security = this.securityOf(t, s, cohorts, scan, stats, priceUsd, now, scan.smart.count);
    const summary: TokenSummary = {
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoSeed: t.logoSeed,
      logoGlyph: t.logoGlyph,
      // Live tokens' real image (simulated tokens have none: the field stays absent).
      ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}),
      narrative: t.narrative,
      launchpad: t.launchpad,
      status: t.status,
      dex: t.pool?.dex ?? null,
      creator: t.creator,
      createdAt: t.createdAt,
      migratedAt: t.migratedAt,
      completeCostSeconds: t.completedAt !== null ? Math.max(0, (t.completedAt - t.createdAt) / 1000) : null,
      priceUsd,
      priceNative,
      marketCapUsd: mcap,
      athMarketCapUsd: Math.max(t.athMarketCapUsd, mcap),
      liquidityUsd: world.liquidityUsd(t),
      initialLiquidityUsd: t.pool ? t.pool.initialLiquidityUsd : t.initialLiquidityUsd,
      progress: world.progress(t),
      holderCount: t.holders.size,
      totalSupply: t.totalSupply,
      stats,
      netBuy24hUsd: stats['24h'].buyVolumeUsd - stats['24h'].sellVolumeUsd,
      smartDegenCount: scan.smart.count,
      kolCount: scan.kol.count,
      socials: { ...t.socials },
      xFollowers: t.xFollowers,
      cto: t.cto,
      boosted: t.boosted,
      isCopycat: t.isCopycat,
      watchers: t.watchers + this.core.viewerCount(t),
      hotLevel: 0,
      security,
      devCreatedCount: agg.created,
      devMigratedCount: agg.migrated,
      holderTags: holderTagStats(scan, t.totalSupply),
    };
    const hot1h = hotScore(summary, '1h', this.holderGrowth(s, '1h', now));
    summary.hotLevel = hotLevelOf(hot1h);
    c.hot = { summary, scores: { '1h': hot1h } };
    return summary;
  }

  private holderGrowth(s: TokenTrack, window: StatWindow, now: number): number {
    const f = flowSince(s, now - WINDOW_MS[window]);
    return f.holdersIn - f.holdersOut;
  }

  /** Hot score for a window, cached alongside the summary it was computed from. */
  hotScoreOf(t: TokenState, window: StatWindow): number {
    const summary = this.summary(t);
    const c = this.core.cachesOf(t.address);
    if (!c.hot || c.hot.summary !== summary) c.hot = { summary, scores: {} };
    const hit = c.hot.scores[window];
    if (hit !== undefined) return hit;
    const v = hotScore(summary, window, this.holderGrowth(this.core.trackOf(t), window, this.core.ctx.world.now));
    c.hot.scores[window] = v;
    return v;
  }

  /** The cached summary while at most REF_RISK_MAX_MS old (holder / risk context of feed rows), else a fresh one. */
  recentSummary(t: TokenState): TokenSummary {
    const { world } = this.core.ctx;
    const cached = this.core.caches.get(t.address)?.summary;
    return cached && world.now >= cached.at && world.now - cached.at < REF_RISK_MAX_MS ? cached.value : this.summary(t);
  }

  ref(t: TokenState): TokenRef {
    const { world } = this.core.ctx;
    const priceUsd = world.priceUsd(t);
    const security = this.recentSummary(t).security;
    return {
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoSeed: t.logoSeed,
      logoGlyph: t.logoGlyph,
      ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}),
      priceUsd,
      marketCapUsd: priceUsd * t.totalSupply,
      liquidityUsd: world.liquidityUsd(t),
      status: t.status,
      launchpad: t.launchpad,
      createdAt: t.createdAt,
      priceChange24h: priceChangeAt(t, DAY_MS, world.now, priceUsd),
      rugRatio: security.rugRatio,
      riskLevel: security.riskLevel,
    };
  }
}
