// Position tables of a token: holders (with the curve / pool row), top traders
// and early buyers. Rows are cached per token version; viewer tags and labels
// are applied per request.

import { getLaunchpad, type EarlyBuyer, type EarlyBuyersResponse, type Position, type WalletTag } from '@trenchscope/shared';
import type { Viewer } from '../../context';
import { DUST_RATE, type TokenState, type WalletState } from '../../sim/world';
import { viewerLabel, viewerTags } from '../viewer';
import { clampInt, fresh, mergeTags, type RowsCache, type TokenCore } from './core';
import { Cohorts } from './security';

const ROWS_MIN_MS = 1000;
const ROWS_MAX_MS = 10000;
const VENUE_LABEL_SUFFIX = 'Bonding Curve';

export type TraderSort = 'pnl' | 'realized' | 'unrealized' | 'bought' | 'sold';
export const TRADER_SORTS: TraderSort[] = ['pnl', 'realized', 'unrealized', 'bought', 'sold'];

export interface HoldersQuery {
  tag?: string;
  limit?: number;
}
export interface TopTradersQuery {
  tag?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

export class TokenHolders {
  constructor(private readonly core: TokenCore) {}

  private positionRow(t: TokenState, w: WalletState, priceUsd: number, cohorts: Cohorts, now: number): Position | null {
    const p = w.positions.get(t.address);
    if (!p) return null;
    const valueUsd = p.balance * priceUsd;
    const unrealized = p.balance > 0 ? valueUsd - p.costBasisUsd : 0;
    const total = p.realizedPnlUsd + unrealized;
    const end = p.balance > 0 ? now : (p.closedAt ?? p.lastActiveAt);
    return {
      chain: t.chain,
      token: t.address,
      wallet: w.address,
      addrType: 'wallet',
      walletTags: mergeTags(cohorts.tags(w.address, w), this.core.walletTagsOf(w)),
      walletLabel: w.label,
      balance: p.balance,
      holdRate: p.balance / t.totalSupply,
      valueUsd,
      costBasisUsd: p.costBasisUsd,
      avgBuyPriceUsd: p.boughtTokens > 0 ? p.boughtUsd / p.boughtTokens : 0,
      avgSellPriceUsd: p.soldTokens > 0 ? p.soldUsd / p.soldTokens : 0,
      boughtUsd: p.boughtUsd,
      soldUsd: p.soldUsd,
      boughtTokens: p.boughtTokens,
      soldTokens: p.soldTokens,
      realizedPnlUsd: p.realizedPnlUsd,
      unrealizedPnlUsd: unrealized,
      totalPnlUsd: total,
      pnlRate: p.boughtUsd > 0 ? total / p.boughtUsd : 0,
      buys: p.buys,
      sells: p.sells,
      firstBuyAt: p.firstBuyAt,
      lastActiveAt: p.lastActiveAt,
      holdSeconds: p.firstBuyAt !== null ? Math.max(0, (end - p.firstBuyAt) / 1000) : 0,
      nativeBalance: w.native,
      fundedBy: w.fundedBy,
    };
  }

  /** Bonding-curve or pool account row (excluded from concentration metrics). */
  venueRow(t: TokenState): Position | null {
    const { world } = this.core.ctx;
    const now = world.now;
    const priceUsd = world.priceUsd(t);
    let balance: number;
    let wallet: string;
    let label: string;
    let native: number;
    let since: number;
    if (t.pool) {
      balance = t.pool.tokens;
      wallet = t.pool.address;
      label = `${t.pool.dex} Pool`;
      native = t.pool.native;
      since = t.pool.createdAt;
    } else if (t.curve) {
      // Unsold curve tokens plus the reserve that seeds the pool at migration.
      balance = Math.max(0, t.curve.realTokens + (t.totalSupply - t.curve.initialRealTokens));
      label = `${getLaunchpad(t.launchpad)?.name ?? t.launchpad} ${VENUE_LABEL_SUFFIX}`;
      wallet = label;
      native = t.curve.realNative;
      since = t.createdAt;
    } else return null;
    return {
      chain: t.chain,
      token: t.address,
      wallet,
      addrType: t.pool ? 'pool' : 'curve',
      walletTags: [],
      walletLabel: label,
      balance,
      holdRate: balance / t.totalSupply,
      valueUsd: balance * priceUsd,
      costBasisUsd: 0,
      avgBuyPriceUsd: 0,
      avgSellPriceUsd: 0,
      boughtUsd: 0,
      soldUsd: 0,
      boughtTokens: 0,
      soldTokens: 0,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      totalPnlUsd: 0,
      pnlRate: 0,
      buys: 0,
      sells: 0,
      firstBuyAt: null,
      lastActiveAt: t.lastTradeAt,
      holdSeconds: Math.max(0, (now - since) / 1000),
      nativeBalance: native,
      fundedBy: null,
    };
  }

  /** Holder rows sorted by balance desc, top 10 tagged top_holder; cached per token version. */
  private holderRows(t: TokenState): Position[] {
    const { world } = this.core.ctx;
    const now = world.now;
    const c = this.core.cachesOf(t.address);
    if (fresh(c.holders, t.version, now, ROWS_MIN_MS, ROWS_MAX_MS)) return c.holders!.rows;
    const priceUsd = world.priceUsd(t);
    const cohorts = this.core.cohortsFor(t);
    const rows: Position[] = [];
    for (const a of t.holders) {
      const w = world.wallets.get(a);
      if (!w) continue;
      const row = this.positionRow(t, w, priceUsd, cohorts, now);
      if (row && row.balance > 0) rows.push(row);
    }
    rows.sort((x, y) => y.balance - x.balance);
    for (let i = 0; i < rows.length && i < 10; i++) if (!rows[i].walletTags.includes('top_holder')) rows[i].walletTags.push('top_holder');
    c.holders = { at: now, version: t.version, rows, sorted: new Map() };
    return rows;
  }

  /** Every wallet that ever traded the token; cached per token version. */
  private traderRows(t: TokenState): RowsCache {
    const { world } = this.core.ctx;
    const now = world.now;
    const c = this.core.cachesOf(t.address);
    if (fresh(c.traders, t.version, now, ROWS_MIN_MS, ROWS_MAX_MS)) return c.traders!;
    const top10 = new Set(this.holderRows(t).slice(0, 10).map((r) => r.wallet));
    const priceUsd = world.priceUsd(t);
    const cohorts = this.core.cohortsFor(t);
    const rows: Position[] = [];
    for (const a of t.traders) {
      const w = world.wallets.get(a);
      if (!w) continue;
      const row = this.positionRow(t, w, priceUsd, cohorts, now);
      if (!row) continue;
      if (top10.has(a)) row.walletTags.push('top_holder');
      rows.push(row);
    }
    c.traders = { at: now, version: t.version, rows, sorted: new Map() };
    return c.traders;
  }

  private matchRowTag(row: Position, tag: string, viewer: Viewer): boolean {
    if (tag === 'all') return true;
    if (tag === 'following') return !!viewer.accountId && this.core.ctx.accounts.isFollowing(viewer.accountId, row.chain, row.wallet);
    if (tag === 'you') return !!viewer.accountId && this.core.ctx.accounts.accountIdForWallet(row.wallet) === viewer.accountId;
    return row.walletTags.includes(tag as WalletTag);
  }

  private viewRow(row: Position, viewer: Viewer): Position {
    if (!viewer.accountId) return { ...row, walletTags: row.walletTags.slice() };
    return {
      ...row,
      walletTags: viewerTags(this.core.ctx, viewer, row.chain, row.wallet, row.walletTags.slice()),
      walletLabel: viewerLabel(this.core.ctx, viewer, row.chain, row.wallet, row.walletLabel),
    };
  }

  holders(t: TokenState, opts: HoldersQuery, viewer: Viewer): Position[] {
    const limit = clampInt(opts.limit, 100, 1, 500);
    const tag = opts.tag ?? 'all';
    const out: Position[] = [];
    if (tag === 'all') {
      const venue = this.venueRow(t);
      if (venue) out.push(venue);
    }
    let n = 0;
    for (const row of this.holderRows(t)) {
      if (n >= limit) break;
      if (!this.matchRowTag(row, tag, viewer)) continue;
      out.push(this.viewRow(row, viewer));
      n++;
    }
    return out;
  }

  topTraders(t: TokenState, opts: TopTradersQuery, viewer: Viewer): Position[] {
    const limit = clampInt(opts.limit, 100, 1, 500);
    const tag = opts.tag ?? 'all';
    const sort = (TRADER_SORTS as string[]).includes(opts.sort ?? '') ? (opts.sort as TraderSort) : 'pnl';
    const asc = opts.order === 'asc';
    const cache = this.traderRows(t);
    let sorted = cache.sorted.get(sort);
    if (!sorted) {
      const key: (p: Position) => number =
        sort === 'realized'
          ? (p) => p.realizedPnlUsd
          : sort === 'unrealized'
            ? (p) => p.unrealizedPnlUsd
            : sort === 'bought'
              ? (p) => p.boughtUsd
              : sort === 'sold'
                ? (p) => p.soldUsd
                : (p) => p.totalPnlUsd;
      sorted = cache.rows.slice().sort((a, b) => key(b) - key(a) || b.boughtUsd - a.boughtUsd);
      cache.sorted.set(sort, sorted);
    }
    const out: Position[] = [];
    const n = sorted.length;
    for (let i = 0; i < n && out.length < limit; i++) {
      const row = sorted[asc ? n - 1 - i : i];
      if (!this.matchRowTag(row, tag, viewer)) continue;
      out.push(this.viewRow(row, viewer));
    }
    return out;
  }

  /**
   * The token's first buyers (tracked at trade time, at most EARLY_BUYERS_LIMIT) with their bags
   * now. Status compares the balance with the wallet's first buy (see EarlyBuyer.status).
   */
  earlyBuyers(t: TokenState, viewer: Viewer): EarlyBuyersResponse {
    const { world } = this.core.ctx;
    const s = this.core.trackOf(t);
    const cohorts = new Cohorts(world, t, s);
    const priceUsd = world.priceUsd(t);
    const dust = t.totalSupply * DUST_RATE;
    const summary: EarlyBuyersResponse['summary'] = { holding: 0, soldPart: 0, soldAll: 0, added: 0, holdRateTotal: 0 };
    const buyers: EarlyBuyer[] = [];
    for (let i = 0; i < s.earlyBuyers.length; i++) {
      const a = s.earlyBuyers[i];
      const w = world.wallets.get(a);
      const p = w?.positions.get(t.address);
      if (!w || !p || p.firstBuyAt === null) continue;
      const first = s.earlyTokens[i];
      const status = p.balance <= dust ? 'sold_all' : p.balance < first * (1 - 1e-9) ? 'sold_part' : p.balance > first * (1 + 1e-9) ? 'added' : 'holding';
      if (status === 'sold_all') summary.soldAll++;
      else if (status === 'sold_part') summary.soldPart++;
      else if (status === 'added') summary.added++;
      else summary.holding++;
      const holdRate = p.balance / t.totalSupply;
      summary.holdRateTotal += holdRate;
      buyers.push({
        rank: i + 1,
        wallet: a,
        walletTags: viewerTags(this.core.ctx, viewer, t.chain, a, mergeTags(cohorts.tags(a, w), this.core.walletTagsOf(w))),
        walletLabel: viewerLabel(this.core.ctx, viewer, t.chain, a, w.label),
        firstBuyAt: p.firstBuyAt,
        block: world.blockAt(t.chain, p.firstBuyAt),
        boughtUsd: p.boughtUsd,
        boughtTokens: p.boughtTokens,
        balance: p.balance,
        holdRate,
        status,
        realizedPnlUsd: p.realizedPnlUsd,
        unrealizedPnlUsd: p.balance > 0 ? p.balance * priceUsd - p.costBasisUsd : 0,
      });
    }
    return { buyers, summary };
  }
}
