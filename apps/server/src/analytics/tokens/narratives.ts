// Narratives: tokens grouped by theme over the last 24h (active and newly
// created ones), ranked by heat; cached per chain for NARRATIVE_TTL_MS.

import type { ChainId, Narrative } from '@trenchscope/shared';
import type { TokenState } from '../../sim/world';
import { DAY_MS, type TokenCore } from './core';
import { narrativeHeat } from './scores';
import { priceChangeAt, volumeIn } from './stats';
import type { TokenSummaries } from './summary';

const NARRATIVE_TTL_MS = 5000;

export class TokenNarratives {
  constructor(
    private readonly core: TokenCore,
    private readonly summaries: TokenSummaries,
  ) {}

  narratives(chain: ChainId): Narrative[] {
    const { world } = this.core.ctx;
    const now = world.now;
    const hit = this.core.narrativeCache.get(chain);
    if (hit && now >= hit.at && now - hit.at < NARRATIVE_TTL_MS) return hit.value;

    interface Group {
      name: string;
      count: number;
      vol1h: number;
      vol24h: number;
      mcap: number;
      chgNum: number;
      chgDen: number;
      glyphs: Map<string, number>;
      top: { t: TokenState; vol1h: number }[];
    }
    const groups = new Map<string, Group>();
    const seen = new Set<string>();
    const visit = (t: TokenState) => {
      if (seen.has(t.address)) return;
      seen.add(t.address);
      if (t.dormant || !t.narrative) return;
      const priceUsd = world.priceUsd(t);
      let vol1h = 0;
      let vol24h = 0;
      let chg1h = 0;
      if (now - t.lastTradeAt <= DAY_MS) {
        const cs = this.core.caches.get(t.address)?.summary;
        if (cs && now >= cs.at && now - cs.at < 30_000) {
          vol1h = cs.value.stats['1h'].volumeUsd;
          vol24h = cs.value.stats['24h'].volumeUsd;
          chg1h = cs.value.stats['1h'].priceChange;
        } else {
          vol24h = volumeIn(t, DAY_MS, now);
          vol1h = now - t.lastTradeAt <= 3600_000 ? volumeIn(t, 3600_000, now) : 0;
          chg1h = priceChangeAt(t, 3600_000, now, priceUsd);
        }
      }
      let g = groups.get(t.narrative);
      if (!g) {
        g = { name: t.narrative, count: 0, vol1h: 0, vol24h: 0, mcap: 0, chgNum: 0, chgDen: 0, glyphs: new Map(), top: [] };
        groups.set(t.narrative, g);
      }
      g.count++;
      g.vol1h += vol1h;
      g.vol24h += vol24h;
      g.mcap += priceUsd * t.totalSupply;
      if (vol1h > 0) {
        g.chgNum += chg1h * vol1h;
        g.chgDen += vol1h;
      }
      g.glyphs.set(t.logoGlyph, (g.glyphs.get(t.logoGlyph) ?? 0) + 1);
      // keep top 5 by 1h volume (insertion into a tiny sorted list)
      if (g.top.length < 5 || vol1h > g.top[g.top.length - 1].vol1h) {
        g.top.push({ t, vol1h });
        g.top.sort((a, b) => b.vol1h - a.vol1h || b.t.createdAt - a.t.createdAt);
        if (g.top.length > 5) g.top.pop();
      }
    };
    for (const addr of this.core.active[chain]) {
      const t = world.tokens.get(addr);
      if (t) visit(t);
    }
    const order = world.tokensByChain[chain];
    for (let i = order.length - 1; i >= 0; i--) {
      const t = world.tokens.get(order[i]);
      if (!t) continue;
      if (t.createdAt < now - DAY_MS) break;
      visit(t);
    }
    let maxVol = 0;
    let maxCount = 0;
    for (const g of groups.values()) {
      if (g.vol1h > maxVol) maxVol = g.vol1h;
      if (g.count > maxCount) maxCount = g.count;
    }
    const out: Narrative[] = [];
    for (const g of groups.values()) {
      let glyph = '';
      let best = -1;
      for (const [k, n] of g.glyphs) if (n > best) [glyph, best] = [k, n];
      const change1h = g.chgDen > 0 ? g.chgNum / g.chgDen : 0;
      out.push({
        id: g.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'other',
        name: g.name,
        glyph,
        tokenCount: g.count,
        volume1hUsd: g.vol1h,
        volume24hUsd: g.vol24h,
        marketCapUsd: g.mcap,
        change1h,
        heat: narrativeHeat(g.vol1h, maxVol, g.count, maxCount, change1h),
        topTokens: g.top.map((x) => this.summaries.ref(x.t)),
      });
    }
    out.sort((a, b) => b.heat - a.heat || b.volume1hUsd - a.volume1hUsd);
    this.core.narrativeCache.set(chain, { at: now, value: out });
    return out;
  }
}
