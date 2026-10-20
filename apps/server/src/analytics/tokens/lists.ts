// Discovery lists: Trenches (new / almost / migrated columns), New Pairs and
// Trending. Candidates come from the per-chain indexes in TokenCore (active in
// 24h, near completion, migration order) rather than a scan of every token; a
// cheap pre-filter on raw state runs before a summary is built.

import type { ChainId, StatWindow, TokenFilters, TokenSummary, TrenchesQuery, TrenchesSnapshot, TrendingQuery, TrendingSnapshot, TrendingSort } from '@trenchscope/shared';
import type { TokenState } from '../../sim/world';
import { matchIdentityFilters, matchTokenFilters, needsSummary } from '../filters';
import { ALMOST_PROGRESS, clampInt, DAY_MS, type TokenCore } from './core';
import { WINDOW_MS } from './stats';
import type { TokenSummaries } from './summary';

/** Default and maximum rows of the list endpoints / channels (per column for Trenches). */
export const LIST_LIMITS = { trenches: 60, trending: 100, newpairs: 60, max: 100 } as const;

export class TokenLists {
  constructor(
    private readonly core: TokenCore,
    private readonly summaries: TokenSummaries,
  ) {}

  /** Cheap identity/market pre-filter on raw state; the summary matcher re-checks everything. */
  private preMatch(t: TokenState, f: TokenFilters | undefined, now: number): boolean {
    if (!f) return true;
    const { world } = this.core.ctx;
    const priceUsd = world.priceUsd(t);
    return matchIdentityFilters(
      {
        chain: t.chain,
        address: t.address,
        creator: t.creator,
        symbol: t.symbol,
        name: t.name,
        launchpad: t.launchpad,
        createdAt: t.createdAt,
        marketCapUsd: priceUsd * t.totalSupply,
        liquidityUsd: world.liquidityUsd(t),
        holderCount: t.holders.size,
        progress: world.progress(t),
        socials: t.socials,
        boosted: t.boosted,
        isCopycat: t.isCopycat,
      },
      f,
      now,
    );
  }

  private listMatch(t: TokenState, f: TokenFilters | undefined, window: StatWindow, now: number): TokenSummary | null {
    if (f && !this.preMatch(t, f, now)) return null;
    const s = this.summaries.summary(t);
    if (f && needsSummary(f) && !matchTokenFilters(s, f, window, now)) return null;
    return s;
  }

  /** `maxLimit` lets the list channels compute a longer shared list (see TokenChannels.publishLists). */
  trenches(q: TrenchesQuery, maxLimit: number): TrenchesSnapshot {
    const { world } = this.core.ctx;
    const now = world.now;
    const chain = q.chain;
    const limit = clampInt(q.limit, LIST_LIMITS.trenches, 1, maxLimit);
    const f = q.filters ?? {};

    const fresh24 = now - DAY_MS;
    const newCol: TokenSummary[] = [];
    const order = world.tokensByChain[chain];
    for (let i = order.length - 1; i >= 0 && newCol.length < limit; i--) {
      const t = world.tokens.get(order[i]);
      if (!t) continue;
      if (t.createdAt < fresh24) break;
      if (t.dormant || t.status !== 'curve' || world.progress(t) >= ALMOST_PROGRESS) continue;
      const s = this.listMatch(t, f.new, '24h', now);
      if (s) newCol.push(s);
    }

    const almostTokens: { t: TokenState; p: number }[] = [];
    for (const addr of this.core.almost[chain]) {
      const t = world.tokens.get(addr);
      if (!t || t.dormant || t.status === 'migrated') continue;
      const p = world.progress(t);
      if (p < ALMOST_PROGRESS) continue;
      almostTokens.push({ t, p });
    }
    almostTokens.sort((a, b) => b.p - a.p || b.t.createdAt - a.t.createdAt);
    const almostCol: TokenSummary[] = [];
    for (const { t } of almostTokens) {
      if (almostCol.length >= limit) break;
      const s = this.listMatch(t, f.almost, '24h', now);
      if (s) almostCol.push(s);
    }

    const migratedCol = this.migratedList(chain, f.migrated, limit, now);
    return { chain, new: newCol, almost: almostCol, migrated: migratedCol, updatedAt: now };
  }

  private migratedList(chain: ChainId, f: TokenFilters | undefined, limit: number, now: number): TokenSummary[] {
    const { world } = this.core.ctx;
    const out: TokenSummary[] = [];
    const list = this.core.migrated[chain];
    for (let i = list.length - 1; i >= 0 && out.length < limit; i--) {
      const t = world.tokens.get(list[i]);
      if (!t || t.status !== 'migrated') continue;
      const s = this.listMatch(t, f, '24h', now);
      if (s) out.push(s);
    }
    return out;
  }

  newPairs(chain: ChainId, filters: TokenFilters | undefined, limit: number | undefined, maxLimit: number): TokenSummary[] {
    return this.migratedList(chain, filters, clampInt(limit, LIST_LIMITS.newpairs, 1, maxLimit), this.core.ctx.world.now);
  }

  trending(q: TrendingQuery, maxLimit: number): TrendingSnapshot {
    const { world } = this.core.ctx;
    const now = world.now;
    const window: StatWindow = q.window ?? '1h';
    const sort: TrendingSort = q.sort ?? 'hot';
    const asc = q.order === 'asc';
    const limit = clampInt(q.limit, LIST_LIMITS.trending, 1, maxLimit);
    const since = now - WINDOW_MS[window];
    const rows: { s: TokenSummary; key: number; hot: number }[] = [];
    for (const addr of this.core.active[q.chain]) {
      const t = world.tokens.get(addr);
      if (!t || t.dormant || t.lastTradeAt < since) continue;
      const s = this.listMatch(t, q.filters, window, now);
      if (!s) continue;
      const hot = this.summaries.hotScoreOf(t, window);
      rows.push({ s, key: sort === 'hot' ? hot : this.sortValue(s, sort, window, now), hot });
    }
    rows.sort((a, b) => (asc ? a.key - b.key : b.key - a.key) || b.hot - a.hot || b.s.createdAt - a.s.createdAt);
    return { chain: q.chain, window, tokens: rows.slice(0, limit).map((r) => r.s), updatedAt: now };
  }

  /** Sort value for TrendingSort keys. `age` is now - createdAt (desc = oldest first). */
  private sortValue(s: TokenSummary, sort: TrendingSort, window: StatWindow, now: number): number {
    const w = s.stats[window];
    switch (sort) {
      case 'volume':
        return w.volumeUsd;
      case 'swaps':
        return w.swaps;
      case 'priceChange':
        return w.priceChange;
      case 'marketCap':
        return s.marketCapUsd;
      case 'liquidity':
        return s.liquidityUsd;
      case 'holders':
        return s.holderCount;
      case 'age':
        return now - s.createdAt;
      case 'smartDegenCount':
        return s.smartDegenCount;
      case 'kolCount':
        return s.kolCount;
      case 'netBuy':
        return s.netBuy24hUsd;
      default:
        return 0;
    }
  }
}
