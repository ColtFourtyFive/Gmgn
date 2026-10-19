// Per-wallet rolling state maintained from world 'trade' events (O(1) per
// trade): hourly buckets (last 24h) and UTC-day buckets (last 30 days) of
// realized PnL / counts / volume / per-token aggregates, per-token entry
// records (first sell after first buy -> copy window), a ring of recent copy
// windows, the recent-activity ring, and counters for sniper / sandwich /
// average-buy classification. Period stats and the style read from here.

import type { ChainId, Trade, WalletPeriod, WalletPeriodStats, WalletStyle } from '@trenchscope/shared';
import type { PositionState, TokenState, WalletState, World } from '../../sim/world';
import {
  DAY_MS,
  HOUR_MS,
  computeBadges,
  copyScore,
  emptyDistribution,
  median,
  pnlBucket,
  sampleMetrics,
  speedSubtitle,
  styleTitle,
  type SampleTrade,
} from './metrics';
import { Ring } from './ring';

/** Per-token aggregate inside a bucket: realized PnL and buy cost (USD). */
export interface TokenAgg {
  r: number;
  c: number;
}

export interface Bucket {
  /** Bucket start (ms, UTC hour or day). */
  t: number;
  realized: number;
  buys: number;
  sells: number;
  /** Gross trade USD (Trade.usdAmount). */
  buyUsd: number;
  sellUsd: number;
  /** USD spent buying incl. fees (position boughtUsd delta). */
  cost: number;
  /** First buys (entries) made in this bucket, and how many of them later ran 2x. */
  entries: number;
  hits: number;
  tokens: Map<string, TokenAgg>;
}

/** Activity entry shared by the wallet ring, the chain feed rings and realtime batches. */
export interface ActEntry {
  trade: Trade;
  isFirstBuy: boolean;
  isClose: boolean;
  /** Global sequence for stable ordering of same-timestamp trades. */
  seq: number;
}

/** Per (wallet, token) record. */
export interface TokRec {
  /** First sell after the first buy (ms), null until it happens. */
  fs: number | null;
  /** Last seen position.boughtUsd (for exact fee-inclusive buy cost deltas). */
  bu: number;
}

export interface CopyWindow {
  /** first sell - first buy (ms). */
  ms: number;
  /** When the first sell happened. */
  at: number;
}

const HOUR_KEEP = 24;
const DAY_KEEP = 30;
const CW_RING = 100;

function newBucket(t: number): Bucket {
  return { t, realized: 0, buys: 0, sells: 0, buyUsd: 0, sellUsd: 0, cost: 0, entries: 0, hits: 0, tokens: new Map() };
}

function bucketFor(list: Bucket[], start: number, keepFrom: number): Bucket {
  const last = list[list.length - 1];
  if (last && last.t === start) return last;
  if (!last || start > last.t) {
    const b = newBucket(start);
    list.push(b);
    while (list.length > 1 && list[0].t < keepFrom) list.shift();
    return b;
  }
  // Out-of-order timestamp (rare): find or insert in order.
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].t === start) return list[i];
    if (list[i].t < start) {
      const b = newBucket(start);
      list.splice(i + 1, 0, b);
      return b;
    }
  }
  const b = newBucket(start);
  list.unshift(b);
  return b;
}

export const hourStart = (t: number): number => t - (((t % HOUR_MS) + HOUR_MS) % HOUR_MS);
export const dayStart = (t: number): number => t - (((t % DAY_MS) + DAY_MS) % DAY_MS);

/** Bucket-aligned start of a rolling period (1d: current hour + previous 23; 7d/30d: today + previous 6/29 UTC days). */
export function periodStart(period: Exclude<WalletPeriod, 'all'>, now: number): number {
  if (period === '1d') return hourStart(now) - 23 * HOUR_MS;
  if (period === '7d') return dayStart(now) - 6 * DAY_MS;
  return dayStart(now) - 29 * DAY_MS;
}

export interface WalletTrackData {
  chain: ChainId;
  address: string;
  firstTradeAt: number;
  lastTradeAt: number;
  hours: Bucket[];
  days: Bucket[];
  tokens: Map<string, TokRec>;
  cw: CopyWindow[];
  act: ActEntry[];
  actCap: number;
  snipes: number;
  boughtTokens: number;
  sandwiches: number;
  buysAll: number;
  buyUsdAll: number;
  sellsAll: number;
}

export class WalletTrack {
  firstTradeAt = 0;
  lastTradeAt = 0;
  hours: Bucket[] = [];
  days: Bucket[] = [];
  tokens = new Map<string, TokRec>();
  cw = new Ring<CopyWindow>(CW_RING);
  act: Ring<ActEntry>;
  /** Tokens whose first buy landed within 3 blocks of creation (excl. own / dev-team / bundle tokens). */
  snipes = 0;
  /** Distinct tokens bought. */
  boughtTokens = 0;
  /** Consecutive same-block [own buy, other wallet's buy, own sell] occurrences. */
  sandwiches = 0;
  buysAll = 0;
  buyUsdAll = 0;
  sellsAll = 0;

  constructor(
    readonly chain: ChainId,
    readonly address: string,
    actCap: number,
  ) {
    this.act = new Ring<ActEntry>(actCap);
  }

  /**
   * Record a trade (called from the world 'trade' listener after the
   * position update). Returns the activity entry pushed to the ring.
   */
  record(world: World, trade: Trade, t: TokenState, w: WalletState, pos: PositionState, seq: number): ActEntry {
    const ts = trade.timestamp;
    if (!this.firstTradeAt) this.firstTradeAt = ts;
    if (ts > this.lastTradeAt) this.lastTradeAt = ts;

    let rec = this.tokens.get(t.address);
    const isNewRec = !rec;
    if (!rec) {
      rec = { fs: null, bu: 0 };
      this.tokens.set(t.address, rec);
    }

    let cost = 0;
    let realized = 0;
    if (trade.side === 'buy') {
      // Exact fee-inclusive cost from the position delta; when the record is new
      // but the position pre-dates tracking, fall back to the gross trade amount.
      cost = isNewRec && pos.buys > 1 ? trade.usdAmount : Math.max(0, pos.boughtUsd - rec.bu);
      rec.bu = pos.boughtUsd;
      this.buysAll++;
      this.buyUsdAll += cost;
      if (pos.buys === 1) {
        this.boughtTokens++;
        const team = w.address === t.creator || t.devTeam.has(w.address) || t.bundlers.has(w.address);
        if (!team && trade.block - world.blockAt(t.chain, t.createdAt) <= 3) this.snipes++;
      }
    } else {
      realized = trade.realizedPnlUsd ?? 0;
      this.sellsAll++;
      if (rec.fs === null && pos.firstBuyAt !== null) {
        rec.fs = ts;
        const ms = ts - pos.firstBuyAt;
        if (ms > 0) this.cw.push({ ms, at: ts });
      }
      this.detectSandwich(trade, t, w);
    }

    const hb = bucketFor(this.hours, hourStart(ts), hourStart(ts) - HOUR_KEEP * HOUR_MS);
    const db = bucketFor(this.days, dayStart(ts), dayStart(ts) - DAY_KEEP * DAY_MS);
    this.addToBucket(hb, trade, t.address, cost, realized);
    this.addToBucket(db, trade, t.address, cost, realized);
    if (trade.side === 'buy' && pos.buys === 1) {
      hb.entries++;
      db.entries++;
    }

    const entry: ActEntry = {
      trade,
      isFirstBuy: trade.side === 'buy' && pos.buys === 1,
      isClose: trade.side === 'sell' && pos.balance <= 0,
      seq,
    };
    this.act.push(entry);
    return entry;
  }

  private addToBucket(b: Bucket, trade: Trade, token: string, cost: number, realized: number): void {
    if (trade.side === 'buy') {
      b.buys++;
      b.buyUsd += trade.usdAmount;
      b.cost += cost;
    } else {
      b.sells++;
      b.sellUsd += trade.usdAmount;
      b.realized += realized;
    }
    const a = b.tokens.get(token);
    if (a) {
      a.r += realized;
      a.c += cost;
    } else b.tokens.set(token, { r: realized, c: cost });
  }

  /**
   * Textbook sandwich: this sell immediately follows another wallet's buy, which
   * immediately follows this wallet's buy of the same token, all in one block.
   */
  private detectSandwich(trade: Trade, t: TokenState, w: WalletState): void {
    const trs = t.trades;
    let i = trs.length - 1;
    if (i >= 0 && trs[i] === trade) i--;
    if (i < 1) return;
    const victim = trs[i];
    const front = trs[i - 1];
    if (
      victim.block === trade.block &&
      front.block === trade.block &&
      victim.side === 'buy' &&
      victim.wallet !== w.address &&
      front.side === 'buy' &&
      front.wallet === w.address
    )
      this.sandwiches++;
  }

  /** An entry made at `entryAt` later ran 2x: credit the buckets it was counted in. */
  creditHit(entryAt: number): void {
    const hs = hourStart(entryAt);
    for (let i = this.hours.length - 1; i >= 0 && this.hours[i].t >= hs; i--) if (this.hours[i].t === hs) this.hours[i].hits++;
    const ds = dayStart(entryAt);
    for (let i = this.days.length - 1; i >= 0 && this.days[i].t >= ds; i--) if (this.days[i].t === ds) this.days[i].hits++;
  }

  /** Entries (first buys) since `from` and how many of them ran 2x afterwards (day buckets; hour buckets for 1d). */
  entryStats(period: Exclude<WalletPeriod, 'all'>, now: number): { entries: number; hits: number } {
    const from = periodStart(period, now);
    const src = period === '1d' ? this.hours : this.days;
    let entries = 0;
    let hits = 0;
    for (let i = src.length - 1; i >= 0 && src[i].t >= from; i--) {
      entries += src[i].entries ?? 0;
      hits += src[i].hits ?? 0;
    }
    return { entries, hits };
  }

  /** Trades (buys + sells) in hourly buckets since `from`. */
  tradesSinceHours(from: number): number {
    let n = 0;
    for (let i = this.hours.length - 1; i >= 0 && this.hours[i].t >= from; i--) n += this.hours[i].buys + this.hours[i].sells;
    return n;
  }

  /** Trades (buys + sells) in day buckets since `from`. */
  tradesSinceDays(from: number): number {
    let n = 0;
    for (let i = this.days.length - 1; i >= 0 && this.days[i].t >= from; i--) n += this.days[i].buys + this.days[i].sells;
    return n;
  }

  /** Copy windows (ms) whose first sell happened at/after `from`. */
  copyWindowsSince(from: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cw.size; i++) {
      const c = this.cw.at(i)!;
      if (c.at < from) break;
      out.push(c.ms);
    }
    return out;
  }

  /** Recent copy windows (ms), newest first, at most n. */
  recentCopyWindows(n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cw.size && i < n; i++) out.push(this.cw.at(i)!.ms);
    return out;
  }

  /** Activity-ring rows since `from`, oldest first, as sample trades. */
  sampleSince(from: number): SampleTrade[] {
    const out: SampleTrade[] = [];
    for (let i = 0; i < this.act.size; i++) {
      const tr = this.act.at(i)!.trade;
      if (tr.timestamp < from) break;
      out.push({ side: tr.side, token: tr.token, usd: tr.usdAmount, mcap: tr.marketCapUsd, t: tr.timestamp });
    }
    return out.reverse();
  }

  dump(): WalletTrackData {
    return {
      chain: this.chain,
      address: this.address,
      firstTradeAt: this.firstTradeAt,
      lastTradeAt: this.lastTradeAt,
      hours: this.hours,
      days: this.days,
      tokens: this.tokens,
      cw: this.cw.toArray(),
      act: this.act.toArray(),
      actCap: this.act.cap,
      snipes: this.snipes,
      boughtTokens: this.boughtTokens,
      sandwiches: this.sandwiches,
      buysAll: this.buysAll,
      buyUsdAll: this.buyUsdAll,
      sellsAll: this.sellsAll,
    };
  }

  static load(d: WalletTrackData): WalletTrack {
    const tr = new WalletTrack(d.chain, d.address, d.actCap || 100);
    tr.firstTradeAt = d.firstTradeAt ?? 0;
    tr.lastTradeAt = d.lastTradeAt ?? 0;
    tr.hours = d.hours ?? [];
    tr.days = d.days ?? [];
    tr.tokens = d.tokens instanceof Map ? d.tokens : new Map();
    tr.cw = Ring.from(d.cw ?? [], CW_RING);
    tr.act = Ring.from(d.act ?? [], d.actCap || 100);
    tr.snipes = d.snipes ?? 0;
    tr.boughtTokens = d.boughtTokens ?? 0;
    tr.sandwiches = d.sandwiches ?? 0;
    tr.buysAll = d.buysAll ?? 0;
    tr.buyUsdAll = d.buyUsdAll ?? 0;
    tr.sellsAll = d.sellsAll ?? 0;
    return tr;
  }
}

// ---------------------------------------------------------------------------
// Period stats
// ---------------------------------------------------------------------------

export interface PeriodCalc {
  stats: WalletPeriodStats;
  /** Round trips (copy windows) in the period and their median (s). */
  cwN: number;
  cwMedianSec: number;
}

/** Unrealized PnL of a position at the current price; 0 when closed or the token was deleted. */
export function unrealizedOf(world: World, pos: PositionState, t: TokenState | undefined): number {
  if (!t || pos.balance <= 0) return 0;
  return pos.balance * world.priceUsd(t) - pos.costBasisUsd;
}

/** Zero-filled daily realized PnL series from day buckets, oldest first. */
export function dailySeries(days: readonly Bucket[], from: number, to: number): { day: number; pnlUsd: number }[] {
  const out: { day: number; pnlUsd: number }[] = [];
  let j = 0;
  for (let d = from; d <= to; d += DAY_MS) {
    while (j < days.length && days[j].t < d) j++;
    out.push({ day: d, pnlUsd: j < days.length && days[j].t === d ? days[j].realized : 0 });
  }
  return out;
}

/**
 * Stats for one period.
 *  - 1d: hourly buckets (current hour + previous 23h, i.e. rolling 24h to the hour)
 *  - 7d / 30d: UTC day buckets (today + previous 6 / 29 days)
 *  - all: position totals (volumes = fee-inclusive cost / net proceeds)
 * Per-token outcome = realized in period + current unrealized (if still held);
 * ratio = outcome / buy cost in period (or the position's lifetime cost when the
 * token was only sold in the period). Win = outcome > 0. Deleted tokens count
 * with unrealized 0.
 */
export function periodStats(world: World, w: WalletState, tr: WalletTrack | undefined, period: WalletPeriod, now: number): PeriodCalc {
  const dist = emptyDistribution();
  let realized = 0;
  let unrealized = 0;
  let buys = 0;
  let sells = 0;
  let buyUsd = 0;
  let sellUsd = 0;
  let cost = 0;
  let wins = 0;
  let tokens = 0;
  const openAges: number[] = [];
  let cws: number[];
  let daily: { day: number; pnlUsd: number }[];

  if (period === 'all') {
    for (const pos of w.positions.values()) {
      const t = world.tokens.get(pos.token);
      const u = unrealizedOf(world, pos, t);
      realized += pos.realizedPnlUsd;
      unrealized += u;
      buys += pos.buys;
      sells += pos.sells;
      buyUsd += pos.boughtUsd;
      sellUsd += pos.soldUsd;
      cost += pos.boughtUsd;
      const pnl = pos.realizedPnlUsd + u;
      if (pnl > 0) wins++;
      dist[pnlBucket(pos.boughtUsd > 0 ? pnl / pos.boughtUsd : 0)]++;
      tokens++;
      if (pos.balance > 0 && pos.firstBuyAt !== null) openAges.push(now - pos.firstBuyAt);
    }
    cws = tr ? tr.copyWindowsSince(-Infinity) : [];
    daily = tr ? dailySeries(tr.days, dayStart(now) - 29 * DAY_MS, dayStart(now)) : [];
  } else {
    const from = periodStart(period, now);
    const src = tr ? (period === '1d' ? tr.hours : tr.days) : [];
    const merged = new Map<string, TokenAgg>();
    for (const b of src) {
      if (b.t < from) continue;
      realized += b.realized;
      buys += b.buys;
      sells += b.sells;
      buyUsd += b.buyUsd;
      sellUsd += b.sellUsd;
      cost += b.cost;
      for (const [tok, a] of b.tokens) {
        const m = merged.get(tok);
        if (m) {
          m.r += a.r;
          m.c += a.c;
        } else merged.set(tok, { r: a.r, c: a.c });
      }
    }
    for (const [tok, a] of merged) {
      const pos = w.positions.get(tok);
      const t = world.tokens.get(tok);
      const u = pos ? unrealizedOf(world, pos, t) : 0;
      unrealized += u;
      const pnl = a.r + u;
      const base = a.c > 0 ? a.c : (pos?.boughtUsd ?? 0);
      if (pnl > 0) wins++;
      dist[pnlBucket(base > 0 ? pnl / base : 0)]++;
      if (pos && pos.balance > 0 && pos.firstBuyAt !== null) openAges.push(now - pos.firstBuyAt);
    }
    tokens = merged.size;
    cws = tr ? tr.copyWindowsSince(period === '1d' ? now - DAY_MS : from) : [];
    const dFrom = period === '1d' ? dayStart(now - DAY_MS) : from;
    daily = dailySeries(tr ? tr.days : [], dFrom, dayStart(now));
  }

  const cwMedianSec = median(cws) / 1000;
  const avgHoldSeconds = cws.length ? cwMedianSec : openAges.length ? median(openAges) / 1000 : 0;
  return {
    stats: {
      realizedPnlUsd: realized,
      unrealizedPnlUsd: unrealized,
      totalPnlUsd: realized + unrealized,
      pnlRate: cost > 0 ? realized / cost : 0,
      winRate: tokens > 0 ? wins / tokens : 0,
      wins,
      losses: tokens - wins,
      tokensTraded: tokens,
      buys,
      sells,
      buyVolumeUsd: buyUsd,
      sellVolumeUsd: sellUsd,
      totalCostUsd: cost,
      avgHoldSeconds,
      avgBuyUsd: buys > 0 ? cost / buys : 0,
      distribution: dist,
      dailyPnl: daily,
    },
    cwN: cws.length,
    cwMedianSec,
  };
}

// ---------------------------------------------------------------------------
// Style (computed from the 7d period + the recent activity sample)
// ---------------------------------------------------------------------------

/** Minimum span used to turn trade counts into a per-day rate for young wallets. */
export const STYLE_MIN_SPAN_MS = 6 * HOUR_MS;

/** Trades per day over the period, using the wallet's observed span when it is younger than the period. */
export function perDayRate(trades: number, tr: WalletTrack | undefined, now: number, periodMs: number, minSpanMs: number): number {
  const first = tr && tr.firstTradeAt ? tr.firstTradeAt : now;
  const span = Math.min(periodMs, Math.max(minSpanMs, now - Math.max(first, now - periodMs)));
  return (trades / span) * DAY_MS;
}

export function computeStyle(w: WalletState, tr: WalletTrack | undefined, s7: PeriodCalc, now: number): WalletStyle {
  const st = s7.stats;
  const trades = st.buys + st.sells;
  const perDay = perDayRate(trades, tr, now, 7 * DAY_MS, STYLE_MIN_SPAN_MS);
  const title = styleTitle({
    trades,
    tokens: st.tokensTraded,
    perDay,
    pnl: st.pnlRate,
    winRate: st.winRate,
    lt50: st.distribution.lt50,
    realized: st.realizedPnlUsd,
  });
  const sample = sampleMetrics(tr ? tr.sampleSince(periodStart('7d', now)) : []);
  const launcher = w.createdTokens.length > 0 && w.createdTokens.length > 0.5 * Math.max(1, st.tokensTraded);
  const badges = computeBadges({
    buys: st.buys,
    sells: st.sells,
    tokens: st.tokensTraded,
    winRate: st.winRate,
    gt500: st.distribution.gt500,
    totalCostUsd: st.totalCostUsd,
    sample,
    createdTokenCount: w.createdTokens.length,
    label: w.label,
    isKol: w.tags.has('kol'),
    walletAgeMs: now - w.createdAt,
  });
  return {
    title,
    subtitle: speedSubtitle(s7.cwMedianSec, s7.cwN),
    badges,
    copyScore: copyScore({
      realized: st.realizedPnlUsd,
      sells: st.sells,
      trades,
      holdSec: st.avgHoldSeconds,
      entryUnder100k: sample.entryUnder100k,
      fastFlipRate: sample.fastFlipRate,
      launcher,
    }),
  };
}
