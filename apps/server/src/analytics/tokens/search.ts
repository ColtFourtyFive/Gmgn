// Search: tokens by exact address, symbol or name (ranked by match tier, then
// credibility) and wallets by exact address or label (KOLs first).

import { CHAIN_IDS, type ChainId, type SearchResult } from '@trenchscope/shared';
import type { Viewer } from '../../context';
import type { TokenState, WalletState } from '../../sim/world';
import { viewerLabel, viewerTags } from '../viewer';
import type { TokenCore } from './core';
import { searchCredibility } from './scores';
import type { TokenSummaries } from './summary';

export class TokenSearch {
  constructor(
    private readonly core: TokenCore,
    private readonly summaries: TokenSummaries,
  ) {}

  search(q: string, chain: ChainId | undefined, viewer: Viewer): SearchResult {
    const { world } = this.core.ctx;
    // Strip control / zero-width / bidi characters, trim, cap length.
    const query = (q ?? '')
      .replace(/[\u0000-\u001f\u007f-\u009f­͏؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g, '')
      .trim()
      .slice(0, 100);
    const result: SearchResult = { tokens: [], wallets: [] };
    if (!query) return result;

    const tokenHits: { t: TokenState; tier: number; cred: number }[] = [];
    // EVM addresses are case-insensitive (generated lower-case); base58 is case-sensitive.
    const addrKey = /^0x[0-9a-fA-F]{40}$/.test(query) ? query.toLowerCase() : query;
    const exactToken = world.tokens.get(addrKey);
    if (exactToken && (!chain || exactToken.chain === chain)) tokenHits.push({ t: exactToken, tier: 4, cred: 0 });

    const term = query.replace(/^\$/, '').toLowerCase();
    if (term && !exactToken) {
      const allowContains = term.length >= 2;
      for (const t of world.tokens.values()) {
        if (chain && t.chain !== chain) continue;
        const s = this.core.tracks.get(t.address);
        const sym = s ? s.symbolLc : t.symbol.toLowerCase();
        const name = s ? s.nameLc : t.name.toLowerCase();
        let tier = 0;
        if (sym === term) tier = 3;
        else if (name === term) tier = 2;
        else if (sym.startsWith(term) || name.startsWith(term)) tier = 1.5;
        else if (allowContains && (sym.includes(term) || name.includes(term))) tier = 1;
        if (tier === 0) continue;
        const priceUsd = world.priceUsd(t);
        const vol24 = (t.cache.volume24hUsd as number | undefined) ?? 0;
        const cred = searchCredibility(world.liquidityUsd(t), vol24, priceUsd * t.totalSupply, t.holders.size, t.isCopycat) * (t.dormant ? 0.25 : 1);
        tokenHits.push({ t, tier, cred });
      }
    }
    tokenHits.sort((a, b) => b.tier - a.tier || b.cred - a.cred || b.t.createdAt - a.t.createdAt);
    result.tokens = tokenHits.slice(0, 20).map((h) => this.summaries.ref(h.t));

    const walletHits: WalletState[] = [];
    const exactWallet = world.wallets.get(addrKey);
    if (exactWallet && (!chain || exactWallet.chain === chain)) walletHits.push(exactWallet);
    if (term.length >= 2) {
      const chains = chain ? [chain] : CHAIN_IDS;
      outer: for (const c of chains) {
        for (const addr of this.core.labelled[c]) {
          const w = world.wallets.get(addr);
          if (!w || !w.label || w === exactWallet) continue;
          const label = w.label.toLowerCase().replace(/^@/, '');
          if (label.includes(term.replace(/^@/, ''))) {
            walletHits.push(w);
            if (walletHits.length >= 50) break outer;
          }
        }
      }
    }
    // Exact address first, then KOLs, then other labelled wallets, by follower count.
    const exact = walletHits[0] === exactWallet ? walletHits.shift() : undefined;
    walletHits.sort((a, b) => Number(b.tags.has('kol')) - Number(a.tags.has('kol')) || (b.xFollowers ?? 0) - (a.xFollowers ?? 0) || b.followerCount - a.followerCount);
    if (exact) walletHits.unshift(exact);
    result.wallets = walletHits.slice(0, 10).map((w) => ({
      chain: w.chain,
      address: w.address,
      label: viewerLabel(this.core.ctx, viewer, w.chain, w.address, w.label),
      tags: viewerTags(this.core.ctx, viewer, w.chain, w.address, this.core.walletTagsOf(w)),
      avatarSeed: w.address,
    }));
    return result;
  }
}
