// A token's trade list: maker tags (token-relative cohorts plus platform tags),
// the broadcast and viewer forms of a trade, filters and cursor paging.

import type { Trade, WalletTag } from '@trenchscope/shared';
import type { Viewer } from '../../context';
import type { TokenState } from '../../sim/world';
import { viewerLabel, viewerTags } from '../viewer';
import { clampInt, mergeTags, TOKEN_RELATIVE, type TokenCore } from './core';
import type { Cohorts } from './security';

export type TradeFilter =
  | 'all'
  | 'buy'
  | 'sell'
  | 'dev'
  | 'smart'
  | 'kol'
  | 'sniper'
  | 'insider'
  | 'bundler'
  | 'whale'
  | 'fresh'
  | 'following'
  | 'mine';
export const TRADE_FILTERS: TradeFilter[] = ['all', 'buy', 'sell', 'dev', 'smart', 'kol', 'sniper', 'insider', 'bundler', 'whale', 'fresh', 'following', 'mine'];

export interface TradesQuery {
  filter?: string;
  wallet?: string;
  minUsd?: number;
  limit?: number;
  before?: number;
  /** Page cursor: the id of the last trade already seen (see `trades`). */
  beforeId?: string;
}

export class TokenTrades {
  constructor(private readonly core: TokenCore) {}

  /** Current maker tags of a trade: token-relative cohorts + platform tags (no viewer tags). */
  makerTags(trade: Trade, t?: TokenState, cohorts?: Cohorts): WalletTag[] {
    const w = this.core.ctx.world.wallets.get(trade.wallet);
    if (!w) return trade.walletTags;
    const tok = t ?? this.core.ctx.world.tokens.get(trade.token);
    const rel = tok ? (cohorts ?? this.core.cohortsFor(tok)).tags(w.address, w) : trade.walletTags.filter((x) => TOKEN_RELATIVE.has(x));
    if (trade.isDev && !rel.includes('dev')) rel.unshift('dev');
    return mergeTags(rel, this.core.walletTagsOf(w));
  }

  /** Broadcast form of a trade: refreshed tags, public label, no viewer-relative fields. */
  publicTrade(trade: Trade, t?: TokenState, cohorts?: Cohorts): Trade {
    const w = this.core.ctx.world.wallets.get(trade.wallet);
    return { ...trade, walletTags: this.makerTags(trade, t, cohorts), walletLabel: w ? w.label : trade.walletLabel };
  }

  viewTrade(trade: Trade, viewer: Viewer, t?: TokenState, cohorts?: Cohorts): Trade {
    const pub = this.publicTrade(trade, t, cohorts);
    if (!viewer.accountId) return pub;
    pub.walletTags = viewerTags(this.core.ctx, viewer, trade.chain, trade.wallet, pub.walletTags);
    pub.walletLabel = viewerLabel(this.core.ctx, viewer, trade.chain, trade.wallet, pub.walletLabel);
    return pub;
  }

  private matchTrade(tr: Trade, filter: string, t: TokenState, cohorts: Cohorts, viewer: Viewer): boolean {
    switch (filter) {
      case 'all':
        return true;
      case 'buy':
      case 'sell':
        return tr.side === filter;
      case 'dev':
        return tr.isDev || cohorts.isDev(tr.wallet);
      case 'sniper':
        return tr.walletTags.includes('sniper') || cohorts.isSniper(tr.wallet);
      case 'bundler':
        return tr.walletTags.includes('bundler') || cohorts.isBundler(tr.wallet);
      case 'insider':
        return tr.walletTags.includes('insider') || cohorts.isInsider(tr.wallet);
      case 'smart':
      case 'kol':
      case 'whale':
      case 'fresh': {
        const w = this.core.ctx.world.wallets.get(tr.wallet);
        return w ? this.core.walletTagsOf(w).includes(filter) : tr.walletTags.includes(filter);
      }
      case 'following':
        return !!viewer.accountId && this.core.ctx.accounts.isFollowing(viewer.accountId, t.chain, tr.wallet);
      case 'mine':
        return !!viewer.accountId && this.core.ctx.accounts.accountIdForWallet(tr.wallet) === viewer.accountId;
      default:
        return true;
    }
  }

  trades(t: TokenState, opts: TradesQuery, viewer: Viewer): Trade[] {
    const limit = clampInt(opts.limit, 100, 1, 500);
    const filter = opts.filter ?? 'all';
    if ((filter === 'following' || filter === 'mine') && !viewer.accountId) return [];
    const cohorts = this.core.cohortsFor(t);
    const out: Trade[] = [];
    const list = t.trades;
    // A beforeId cursor resumes right after that trade, so trades sharing its millisecond are not
    // skipped; without one (or once it has left the ring) `before` pages by time alone.
    let start = list.length - 1;
    let before = opts.before;
    if (opts.beforeId !== undefined) {
      let at = start;
      while (at >= 0 && list[at].id !== opts.beforeId) at--;
      if (at >= 0) {
        start = at - 1;
        before = undefined;
      } else if (before === undefined) return [];
    }
    for (let i = start; i >= 0 && out.length < limit; i--) {
      const tr = list[i];
      if (before !== undefined && tr.timestamp >= before) continue;
      if (opts.wallet && tr.wallet !== opts.wallet) continue;
      if (opts.minUsd !== undefined && tr.usdAmount < opts.minUsd) continue;
      if (!this.matchTrade(tr, filter, t, cohorts, viewer)) continue;
      out.push(this.viewTrade(tr, viewer, t, cohorts));
    }
    return out;
  }
}
