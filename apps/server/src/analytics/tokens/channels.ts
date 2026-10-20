// Realtime token channels on the WebSocket hub:
//   trenches:<chain>          'trenches'  TrenchesSnapshot every 1s per distinct params group
//   trending:<chain>          'trending'  TrendingSnapshot every 2s per params group
//   newpairs:<chain>          'newpairs'  TokenSummary[] every 2s per params group
//   token:<chain>:<address>   'token'     TokenDetail on subscribe, then at most every 1s while it changed
//                             'trades'    Trade[] (oldest first) batched every engine tick (~250ms)
//                             'candle'    { resolution, candle } when the last candle of the
//                                         subscription's params.resolution changed
//
// Broadcast payloads are shared by every subscriber, so viewer-relative tags
// ('you' / 'following') and private remarks are NOT applied here; the web adds
// them client-side from its own follow list and wallet addresses. REST
// endpoints (trades/holders/top-traders) do apply them for authenticated callers.
//
// No work happens without subscribers (hub.groups / hub.hasSubscribers) or
// while the engine is fast-forwarding history (engine.warming).

import { z } from 'zod';
import { RESOLUTIONS, STAT_WINDOWS, isChainId, type ChainId, type Resolution, type Trade, type TrenchesQuery, type TrendingQuery, type TokenFilters } from '@trenchscope/shared';
import type { AppContext } from '../../context';
import type { TokenState } from '../../sim/world';
import type { Subscription, SubscriptionGroup } from '../../ws/hub';
import { validateTokenFilters, validateTrenchesFilters } from '../filters';
import type { TokenAnalytics } from './index';

const TRENDING_SORTS = ['hot', 'volume', 'swaps', 'marketCap', 'liquidity', 'holders', 'priceChange', 'age', 'smartDegenCount', 'kolCount', 'netBuy'] as const;

/** Positive integer; above the documented max of 100 it is clamped (same as REST). */
const wsLimit = z
  .number()
  .int()
  .min(1)
  .transform((v) => Math.min(v, 100))
  .optional();

const trenchesParams = z
  .object({
    filters: z.unknown().optional(),
    limit: wsLimit,
  })
  .strict();

const trendingParams = z
  .object({
    window: z.enum(STAT_WINDOWS as [string, ...string[]]).optional(),
    sort: z.enum(TRENDING_SORTS).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    filters: z.unknown().optional(),
    limit: wsLimit,
  })
  .strict();

const newPairsParams = z
  .object({
    filters: z.unknown().optional(),
    limit: wsLimit,
  })
  .strict();

const tokenParams = z
  .object({
    resolution: z.enum(RESOLUTIONS as [string, ...string[]]).optional(),
  })
  .strict();

function chainOf(ch: string): ChainId {
  const chain = ch.split(':')[1];
  if (!isChainId(chain)) throw new Error('unknown chain');
  return chain;
}

function paramsObject(p: unknown): Record<string, unknown> {
  if (p === null || p === undefined) return {};
  if (typeof p !== 'object' || Array.isArray(p)) throw new Error('invalid params');
  return p as Record<string, unknown>;
}

function parseOrThrow<T>(schema: z.ZodType<T>, p: unknown): T {
  const r = schema.safeParse(paramsObject(p));
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`invalid params${i ? `: ${i.path.join('.') || 'params'}: ${i.message}` : ''}`);
  }
  return r.data;
}

const TRENCHES_COLUMNS = new Set(['new', 'almost', 'migrated']);

export function parseTrenchesSub(ch: string, params: unknown): TrenchesQuery {
  const chain = chainOf(ch);
  // docs/API.md: params { filters?, limit? }. The types.ts channel comment describes the params as the
  // per-column filters object itself, so accept that shape too ({ new?, almost?, migrated? }).
  const raw = paramsObject(params);
  const keys = Object.keys(raw);
  const bare = keys.length > 0 && keys.every((k) => TRENCHES_COLUMNS.has(k));
  const p = parseOrThrow(trenchesParams, bare ? { filters: raw } : raw);
  return { chain, filters: validateTrenchesFilters(p.filters), limit: p.limit };
}

export function parseTrendingSub(ch: string, params: unknown): TrendingQuery {
  const chain = chainOf(ch);
  const p = parseOrThrow(trendingParams, params);
  return {
    chain,
    window: (p.window ?? '1h') as TrendingQuery['window'],
    sort: p.sort,
    order: p.order,
    filters: validateTokenFilters(p.filters),
    limit: p.limit,
  };
}

export function parseNewPairsSub(ch: string, params: unknown): { chain: ChainId; filters?: TokenFilters; limit?: number } {
  const chain = chainOf(ch);
  const p = parseOrThrow(newPairsParams, params);
  return { chain, filters: validateTokenFilters(p.filters), limit: p.limit };
}

export class TokenChannels {
  /** token channel -> trades waiting for the next flush (oldest first). */
  private pending = new Map<string, Trade[]>();
  /** token channel -> token version last broadcast as 'token'. */
  private sentVersion = new Map<string, number>();
  /** `${channel}|${paramsKey}` -> signature of the last candle sent to that group. */
  private sentCandle = new Map<string, string>();
  /** token channel -> live subscriber count (feeds TokenSummary.watchers). */
  private viewers = new Map<string, number>();
  /** Parsed params per group key so periodic publishes skip re-validation. */
  private parsed = new Map<string, unknown>();
  private lastDetailAt = -Infinity;

  constructor(
    private ctx: AppContext,
    private ta: TokenAnalytics,
  ) {}

  static tokenChannel(chain: ChainId, address: string): string {
    return `token:${chain}:${address}`;
  }

  /** Users with the token page open (live subscriber count). */
  viewerCount(t: TokenState): number {
    return this.viewers.get(TokenChannels.tokenChannel(t.chain, t.address)) ?? 0;
  }

  install(): void {
    const { hub, engine } = this.ctx;

    hub.register('trenches', {
      onSubscribe: (sub) => {
        const q = parseTrenchesSub(sub.ch, sub.params);
        this.parsed.set(`${sub.ch}|${sub.paramsKey}`, q);
        hub.send(sub, 'trenches', this.ta.trenches(q));
      },
    });
    hub.register('trending', {
      onSubscribe: (sub) => {
        const q = parseTrendingSub(sub.ch, sub.params);
        this.parsed.set(`${sub.ch}|${sub.paramsKey}`, q);
        hub.send(sub, 'trending', this.ta.trending(q));
      },
    });
    hub.register('newpairs', {
      onSubscribe: (sub) => {
        const q = parseNewPairsSub(sub.ch, sub.params);
        this.parsed.set(`${sub.ch}|${sub.paramsKey}`, q);
        hub.send(sub, 'newpairs', this.ta.newPairs(q.chain, q.filters, q.limit));
      },
    });
    hub.register('token', {
      onSubscribe: (sub) => this.onTokenSubscribe(sub),
      onUnsubscribe: (sub) => this.onTokenUnsubscribe(sub),
    });

    engine.addTicker('ws-trenches', () => this.publishLists('trenches'), { everyMs: 1000 });
    engine.addTicker('ws-trending', () => this.publishLists('trending'), { everyMs: 2000 });
    engine.addTicker('ws-newpairs', () => this.publishLists('newpairs'), { everyMs: 2000 });
    engine.addTicker('ws-token', () => this.flushToken(), { everyMs: 0 });
  }

  // ---- token channel -------------------------------------------------------

  private tokenFor(ch: string): TokenState | null {
    const parts = ch.split(':');
    if (parts.length !== 3) return null;
    const [, chain, address] = parts;
    const t = this.ctx.world.tokens.get(address);
    return t && t.chain === chain ? t : null;
  }

  private onTokenSubscribe(sub: Subscription): void {
    const parts = sub.ch.split(':');
    if (parts.length !== 3 || !isChainId(parts[1])) throw new Error('invalid token channel');
    const t = this.tokenFor(sub.ch);
    if (!t) throw new Error('token not found');
    const p = parseOrThrow(tokenParams, sub.params);
    this.parsed.set(`${sub.ch}|${sub.paramsKey}`, p);
    this.viewers.set(sub.ch, (this.viewers.get(sub.ch) ?? 0) + 1);
    const detail = this.ta.detail(t);
    if (!this.sentVersion.has(sub.ch)) this.sentVersion.set(sub.ch, this.ta.detailVersion(t));
    if (p.resolution) {
      // Start candle diffs from the current candle; the client loads history over REST.
      const arr = t.candles[p.resolution as Resolution];
      const last = arr[arr.length - 1];
      const key = `${sub.ch}|${sub.paramsKey}`;
      if (last && !this.sentCandle.has(key)) this.sentCandle.set(key, candleSig(last));
    }
    this.ctx.hub.send(sub, 'token', detail);
  }

  private onTokenUnsubscribe(sub: Subscription): void {
    const n = (this.viewers.get(sub.ch) ?? 1) - 1;
    if (n <= 0) this.viewers.delete(sub.ch);
    else this.viewers.set(sub.ch, n);
    if (!this.ctx.hub.hasSubscribers(sub.ch)) {
      this.pending.delete(sub.ch);
      this.sentVersion.delete(sub.ch);
      for (const k of this.sentCandle.keys()) if (k.startsWith(`${sub.ch}|`)) this.sentCandle.delete(k);
      for (const k of this.parsed.keys()) if (k.startsWith(`${sub.ch}|`)) this.parsed.delete(k);
    }
  }

  /** Called from the trade listener (not during warmup). O(1) when nobody watches the token. */
  onTrade(trade: Trade, t: TokenState): void {
    const ch = TokenChannels.tokenChannel(t.chain, t.address);
    if (!this.ctx.hub.hasSubscribers(ch)) return;
    let list = this.pending.get(ch);
    if (!list) {
      list = [];
      this.pending.set(ch, list);
    }
    if (list.length < 500) list.push(trade);
  }

  /** Flush trade batches, changed candles and (at most once per second) changed details. */
  flushToken(): void {
    if (this.ctx.engine.warming) return;
    const { hub, world } = this.ctx;
    if (this.pending.size > 0) {
      for (const [ch, list] of this.pending) {
        if (list.length === 0) continue;
        const t = this.tokenFor(ch);
        const cohorts = t ? this.ta.cohortsFor(t) : undefined;
        hub.publish(
          ch,
          'trades',
          list.map((tr) => this.ta.publicTrade(tr, t ?? undefined, cohorts)),
        );
      }
      this.pending.clear();
    }
    const groups = hub.groups('token');
    if (groups.length === 0) return;
    for (const g of groups) this.publishCandle(g);
    const now = world.now;
    if (now - this.lastDetailAt >= 1000 || now < this.lastDetailAt) {
      this.lastDetailAt = now;
      const done = new Set<string>();
      for (const g of groups) {
        if (done.has(g.ch)) continue;
        done.add(g.ch);
        const t = this.tokenFor(g.ch);
        const sent = this.sentVersion.get(g.ch);
        if (!t || sent === t.version) continue;
        const detail = this.ta.detail(t);
        // A detail cached within its 1s floor can predate the latest trades: remember the version
        // it really reflects so the next pass re-sends once it is rebuilt (never strand the last update).
        const version = this.ta.detailVersion(t);
        if (version === sent) continue;
        this.sentVersion.set(g.ch, version);
        hub.publish(g.ch, 'token', detail);
      }
    }
  }

  private publishCandle(g: SubscriptionGroup): void {
    const key = `${g.ch}|${g.paramsKey}`;
    let p = this.parsed.get(key) as { resolution?: string } | undefined;
    if (!p) {
      try {
        p = parseOrThrow(tokenParams, g.params);
      } catch {
        return;
      }
      this.parsed.set(key, p);
    }
    if (!p.resolution) return;
    const t = this.tokenFor(g.ch);
    if (!t) return;
    const res = p.resolution as Resolution;
    const arr = t.candles[res];
    const last = arr[arr.length - 1];
    if (!last) return;
    const sig = candleSig(last);
    if (this.sentCandle.get(key) === sig) return;
    this.sentCandle.set(key, sig);
    this.ctx.hub.sendGroup(g, 'candle', { resolution: res, candle: last });
  }

  // ---- list channels -------------------------------------------------------

  private publishLists(prefix: 'trenches' | 'trending' | 'newpairs'): void {
    if (this.ctx.engine.warming) return;
    const { hub } = this.ctx;
    const groups = hub.groups(prefix);
    if (groups.length === 0) return;
    const live = new Set<string>();
    for (const g of groups) {
      const key = `${g.ch}|${g.paramsKey}`;
      live.add(key);
      try {
        let q = this.parsed.get(key);
        if (q === undefined) {
          q =
            prefix === 'trenches'
              ? parseTrenchesSub(g.ch, g.params)
              : prefix === 'trending'
                ? parseTrendingSub(g.ch, g.params)
                : parseNewPairsSub(g.ch, g.params);
          this.parsed.set(key, q);
        }
        if (prefix === 'trenches') hub.sendGroup(g, 'trenches', this.ta.trenches(q as TrenchesQuery));
        else if (prefix === 'trending') hub.sendGroup(g, 'trending', this.ta.trending(q as TrendingQuery));
        else {
          const np = q as ReturnType<typeof parseNewPairsSub>;
          hub.sendGroup(g, 'newpairs', this.ta.newPairs(np.chain, np.filters, np.limit));
        }
      } catch (err) {
        console.error(`[analytics/tokens] ${prefix} publish failed`, err);
      }
    }
    // Forget parsed params of groups that no longer exist.
    for (const k of this.parsed.keys()) if (k.startsWith(`${prefix}:`) && !live.has(k)) this.parsed.delete(k);
  }
}

function candleSig(c: { time: number; open: number; high: number; low: number; close: number; volume: number }): string {
  return `${c.time}|${c.close}|${c.high}|${c.low}|${c.volume}`;
}
