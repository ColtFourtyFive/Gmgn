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
// while the engine is fast-forwarding history (engine.warming). List channel
// groups that differ only in their exclusion lists (every viewer's blacklist
// is merged into its filters) share one list computation per cadence, and
// each row is serialized once per pass however many groups carry it.

import { z } from 'zod';
import {
  RESOLUTIONS,
  STAT_WINDOWS,
  isChainId,
  type ChainId,
  type Resolution,
  type TokenFilters,
  type TokenSummary,
  type Trade,
  type TrenchesColumn,
  type TrenchesQuery,
  type TrendingQuery,
} from '@trenchscope/shared';
import type { AppContext } from '../../context';
import type { TokenState } from '../../sim/world';
import { stableKey, type Subscription, type SubscriptionGroup } from '../../ws/hub';
import { matchIdentityFilters, validateTokenFilters, validateTrenchesFilters } from '../filters';
import { LIST_LIMITS, type TokenAnalytics } from './index';

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

/** Chain of a list channel, which must be exactly `<list>:<chain>` (extra segments would each form a group). */
function chainOf(ch: string): ChainId {
  const parts = ch.split(':');
  if (parts.length !== 2) throw new Error(`invalid channel (expected ${parts[0]}:<chain>)`);
  const chain = parts[1];
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

export interface NewPairsQuery {
  chain: ChainId;
  filters?: TokenFilters;
  limit?: number;
}

export function parseNewPairsSub(ch: string, params: unknown): NewPairsQuery {
  const chain = chainOf(ch);
  const p = parseOrThrow(newPairsParams, params);
  return { chain, filters: validateTokenFilters(p.filters), limit: p.limit };
}

type ListPrefix = 'trenches' | 'trending' | 'newpairs';
type ListQuery = TrenchesQuery | TrendingQuery | NewPairsQuery;
type ListData = ReturnType<TokenAnalytics['trenches']> | ReturnType<TokenAnalytics['trending']> | TokenSummary[];

const TRENCHES_COLUMN_LIST: TrenchesColumn[] = ['new', 'almost', 'migrated'];
/** Extra rows a shared list carries so a viewer's exclusions still leave it `limit` rows. */
const EXCLUSION_HEADROOM = 40;

/** Split the per-viewer exclusion lists off a filter set (the rest decides the shared list). */
function splitExclusions(f: TokenFilters | undefined): { rest: TokenFilters | undefined; ex: TokenFilters | undefined } {
  if (!f) return { rest: undefined, ex: undefined };
  const { excludeAddresses, excludeCreators, excludeKeywords, ...rest } = f;
  const hasEx = !!(excludeAddresses?.length || excludeCreators?.length || excludeKeywords?.length);
  return {
    rest: Object.values(rest).some((v) => v !== undefined) ? rest : undefined,
    ex: hasEx ? { excludeAddresses, excludeCreators, excludeKeywords } : undefined,
  };
}

/** A list query without its exclusions, and those exclusions (per Trenches column, or `all`). */
function splitListQuery(prefix: ListPrefix, q: ListQuery): { base: ListQuery; ex: Partial<Record<TrenchesColumn | 'all', TokenFilters>> | null } {
  if (prefix === 'trenches') {
    const tq = q as TrenchesQuery;
    const filters: Partial<Record<TrenchesColumn, TokenFilters>> = {};
    const ex: Partial<Record<TrenchesColumn, TokenFilters>> = {};
    for (const col of TRENCHES_COLUMN_LIST) {
      const parts = splitExclusions(tq.filters?.[col]);
      if (parts.rest) filters[col] = parts.rest;
      if (parts.ex) ex[col] = parts.ex;
    }
    return { base: { ...tq, filters: Object.keys(filters).length ? filters : undefined, limit: undefined }, ex: Object.keys(ex).length ? ex : null };
  }
  const fq = q as TrendingQuery | NewPairsQuery;
  const { rest, ex } = splitExclusions(fq.filters);
  return { base: { ...fq, filters: rest, limit: undefined }, ex: ex ? { all: ex } : null };
}

function listLimit(prefix: ListPrefix, q: ListQuery): number {
  const v = q.limit;
  if (v === undefined || !Number.isFinite(v)) return LIST_LIMITS[prefix];
  return Math.max(1, Math.min(LIST_LIMITS.max, Math.floor(v)));
}

/**
 * JSON of a list payload, reusing each row's JSON across the groups of one pass
 * (rows are shared summary objects): identical to JSON.stringify(data).
 */
function listJson(data: ListData, rows: Map<object, string>): string {
  const row = (v: unknown): string => {
    if (typeof v !== 'object' || v === null) return JSON.stringify(v) ?? 'null';
    let json = rows.get(v);
    if (json === undefined) rows.set(v, (json = JSON.stringify(v)));
    return json;
  };
  const array = (a: unknown[]) => `[${a.map(row).join(',')}]`;
  if (Array.isArray(data)) return array(data);
  const fields: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    fields.push(`${JSON.stringify(k)}:${Array.isArray(v) ? array(v) : JSON.stringify(v)}`);
  }
  return `{${fields.join(',')}}`;
}

export class TokenChannels {
  /** token channel -> trades waiting for the next flush (oldest first). */
  private pending = new Map<string, Trade[]>();
  /** token channel -> token version last broadcast as 'token'. */
  private sentVersion = new Map<string, number>();
  /** `${channel}|${paramsKey}` -> bucket time and signature of the last candle sent to that group. */
  private sentCandle = new Map<string, { time: number; sig: string }>();
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

    // Parsed list params live exactly as long as their group: a sub/unsub churn of distinct
    // (up to ~100 KB) filters must not pile up while no publish pass runs to prune them.
    const forgetList = (sub: Subscription) => {
      if (!hub.hasGroup(sub.ch, sub.paramsKey)) this.parsed.delete(`${sub.ch}|${sub.paramsKey}`);
    };
    hub.register('trenches', {
      onSubscribe: (sub) => {
        const q = parseTrenchesSub(sub.ch, sub.params);
        hub.send(sub, 'trenches', this.ta.trenches(q));
        this.parsed.set(`${sub.ch}|${sub.paramsKey}`, q);
      },
      onUnsubscribe: forgetList,
    });
    hub.register('trending', {
      onSubscribe: (sub) => {
        const q = parseTrendingSub(sub.ch, sub.params);
        hub.send(sub, 'trending', this.ta.trending(q));
        this.parsed.set(`${sub.ch}|${sub.paramsKey}`, q);
      },
      onUnsubscribe: forgetList,
    });
    hub.register('newpairs', {
      onSubscribe: (sub) => {
        const q = parseNewPairsSub(sub.ch, sub.params);
        hub.send(sub, 'newpairs', this.ta.newPairs(q.chain, q.filters, q.limit));
        this.parsed.set(`${sub.ch}|${sub.paramsKey}`, q);
      },
      onUnsubscribe: forgetList,
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
      if (last && !this.sentCandle.has(key)) this.sentCandle.set(key, { time: last.time, sig: candleSig(last) });
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
    const sent = this.sentCandle.get(key);
    const sig = candleSig(last);
    if (sent && sent.time !== last.time) {
      // The bucket rolled over since the last push. The candle current then can have changed after it
      // went out (a trade landing between ticks): send its final state first, as the client drops
      // any candle older than its newest.
      for (let i = arr.length - 2; i >= 0 && arr[i].time >= sent.time; i--) {
        if (arr[i].time !== sent.time) continue;
        if (candleSig(arr[i]) !== sent.sig) this.ctx.hub.sendGroup(g, 'candle', { resolution: res, candle: arr[i] });
        break;
      }
    } else if (sent?.sig === sig) return;
    this.sentCandle.set(key, { time: last.time, sig });
    this.ctx.hub.sendGroup(g, 'candle', { resolution: res, candle: last });
  }

  // ---- list channels -------------------------------------------------------

  private publishLists(prefix: ListPrefix): void {
    if (this.ctx.engine.warming) return;
    const { hub } = this.ctx;
    const groups = hub.groups(prefix);
    const live = new Set<string>();
    // Groups whose queries differ only in exclusions (viewers' blacklists) form one bucket.
    const buckets = new Map<string, { base: ListQuery; members: { g: SubscriptionGroup; q: ListQuery; ex: Partial<Record<TrenchesColumn | 'all', TokenFilters>> | null }[] }>();
    for (const g of groups) {
      const key = `${g.ch}|${g.paramsKey}`;
      live.add(key);
      try {
        let q = this.parsed.get(key) as ListQuery | undefined;
        if (q === undefined) {
          q = prefix === 'trenches' ? parseTrenchesSub(g.ch, g.params) : prefix === 'trending' ? parseTrendingSub(g.ch, g.params) : parseNewPairsSub(g.ch, g.params);
          this.parsed.set(key, q);
        }
        const { base, ex } = splitListQuery(prefix, q);
        const bucketKey = stableKey(base);
        let bucket = buckets.get(bucketKey);
        if (!bucket) buckets.set(bucketKey, (bucket = { base, members: [] }));
        bucket.members.push({ g, q, ex });
      } catch (err) {
        console.error(`[analytics/tokens] ${prefix} publish failed`, err);
      }
    }
    const rows = new Map<object, string>();
    for (const { base, members } of buckets.values()) {
      try {
        if (members.length === 1) {
          const { g, q } = members[0];
          hub.sendGroupJson(g, prefix, listJson(this.computeList(prefix, q), rows));
          continue;
        }
        const sharedLimit = Math.max(...members.map((m) => listLimit(prefix, m.q))) + EXCLUSION_HEADROOM;
        const shared = this.computeList(prefix, { ...base, limit: sharedLimit }, sharedLimit);
        // Most blacklists hide nothing currently listed: those viewers share one payload per limit.
        const untouched = new Map<number, string>();
        for (const { g, q, ex } of members) {
          const limit = listLimit(prefix, q);
          const derived = this.deriveList(prefix, shared, sharedLimit, limit, ex);
          let json: string;
          if (!derived) json = listJson(this.computeList(prefix, q), rows); // exclusions ate into the headroom: exact own list
          else if (derived.excluded) json = listJson(derived.data, rows);
          else {
            json = untouched.get(limit) ?? listJson(derived.data, rows);
            untouched.set(limit, json);
          }
          hub.sendGroupJson(g, prefix, json);
        }
      } catch (err) {
        console.error(`[analytics/tokens] ${prefix} publish failed`, err);
      }
    }
    // Forget parsed params of groups that no longer exist.
    for (const k of this.parsed.keys()) if (k.startsWith(`${prefix}:`) && !live.has(k)) this.parsed.delete(k);
  }

  private computeList(prefix: ListPrefix, q: ListQuery, maxLimit?: number): ListData {
    if (prefix === 'trenches') return this.ta.trenches(q as TrenchesQuery, maxLimit);
    if (prefix === 'trending') return this.ta.trending(q as TrendingQuery, maxLimit);
    const np = q as NewPairsQuery;
    return this.ta.newPairs(np.chain, np.filters, np.limit, maxLimit);
  }

  /**
   * A member's list from the bucket's shared one: drop its excluded rows and cut
   * to its limit (rows are independent of each other, so this equals computing
   * its own query). Null when the shared list may have been cut before `limit`
   * rows survived the exclusions; `excluded` tells whether they removed any of
   * the rows shown.
   */
  private deriveList(
    prefix: ListPrefix,
    shared: ListData,
    sharedLimit: number,
    limit: number,
    ex: Partial<Record<TrenchesColumn | 'all', TokenFilters>> | null,
  ): { data: ListData; excluded: boolean } | null {
    const now = this.ctx.world.now;
    let excluded = false;
    const cut = (list: TokenSummary[], f: TokenFilters | undefined): TokenSummary[] | null => {
      let kept = list.slice(0, limit);
      if (f && !kept.every((s) => matchIdentityFilters(s, f, now))) {
        excluded = true;
        kept = list.filter((s) => matchIdentityFilters(s, f, now));
        if (kept.length < limit && list.length >= sharedLimit) return null;
        kept = kept.slice(0, limit);
      }
      return kept;
    };
    let data: ListData | null;
    if (prefix === 'newpairs') data = cut(shared as TokenSummary[], ex?.all);
    else if (prefix === 'trending') {
      const t = shared as ReturnType<TokenAnalytics['trending']>;
      const tokens = cut(t.tokens, ex?.all);
      data = tokens && { ...t, tokens };
    } else {
      const t = shared as ReturnType<TokenAnalytics['trenches']>;
      const cols = TRENCHES_COLUMN_LIST.map((c) => cut(t[c], ex?.[c]));
      data = cols.some((c) => c === null) ? null : { ...t, new: cols[0]!, almost: cols[1]!, migrated: cols[2]! };
    }
    return data && { data, excluded };
  }
}

function candleSig(c: { time: number; open: number; high: number; low: number; close: number; volume: number }): string {
  return `${c.time}|${c.close}|${c.high}|${c.low}|${c.volume}`;
}
