// Shared state of token analytics and the cached building blocks every module
// uses (./index.ts has the module map and the performance model):
//   - per-token analytics tracks (track.ts) and DTO caches
//   - per-chain list indexes: active in the last 24h, near completion,
//     migration order, labelled wallets
//   - their upkeep: rebuilt on startup / restore, updated per trade, swept
//     periodically, tracks persisted with the snapshot

import {
  CHAIN_IDS,
  type ChainId,
  type Narrative,
  type Position,
  type StatWindow,
  type TokenDetail,
  type TokenSummary,
  type Trade,
  type WalletTag,
  type WindowStats,
} from '@trenchscope/shared';
import type { AppContext } from '../../context';
import type { TokenState, WalletState } from '../../sim/world';
import { Cohorts, devAggregate, isRugged, scanHolders, type DevAggregate, type HolderScan } from './security';
import { computeWindowsCached, repriceWindows, volumeIn, type WindowsBase, type WindowsSnapshot } from './stats';
import { backfillEarly, backfillTrack, newTrack, pruneTrack, recordTrade, tombstone, type TokenTrack } from './track';

export const SUMMARY_MIN_MS = 1000;
export const SUMMARY_MAX_MS = 5000;
const SCAN_MIN_MS = 2000;
const SCAN_MAX_MS = 120_000;
/**
 * A holder scan costs O(holders) (~1us per holder), and the busiest tokens are also
 * the ones with the most holders, so while a token trades its scan floor grows with
 * its holder base: 2s up to 200 holders, 10s at 1000, capped at 60s.
 */
const SCAN_MS_PER_HOLDER = 10;
const SCAN_FLOOR_CAP_MS = 60_000;
const DEV_AGG_TTL_MS = 10000;
const SWEEP_EVERY_MS = 30000;
/** Per-token caches untouched for this long are dropped (bounded memory as tokens go quiet). */
const CACHE_IDLE_MS = 10 * 60_000;
export const DAY_MS = 24 * 3600_000;
export const ALMOST_PROGRESS = 0.35;
const MAX_TRACKS = 80_000;

export interface Cached<T> {
  at: number;
  version: number;
  value: T;
}

export interface RowsCache {
  at: number;
  version: number;
  rows: Position[];
  /** Lazily sorted views (desc) by sort key. */
  sorted: Map<string, Position[]>;
}

export interface TokenCaches {
  /**
   * Per-token offset (ms, +-1000) on the max-age refreshes. Lists summarise
   * hundreds of tokens in one call, so without it every idle token would
   * expire on the same tick (a periodic burst of rebuilds every 5s / 120s).
   */
  jitter: number;
  windows?: Cached<WindowsSnapshot> & { priceUsd: number };
  /** Sums over the immutable minute buckets for the current sim minute (see computeWindowsCached). */
  windowsBase?: WindowsBase;
  scan?: Cached<HolderScan>;
  summary?: Cached<TokenSummary>;
  detail?: Cached<TokenDetail>;
  holders?: RowsCache;
  traders?: RowsCache;
  hot?: { summary: TokenSummary; scores: Partial<Record<StatWindow, number>> };
}

/** Within `minMs` always reuse; within `maxMs` reuse while the token version is unchanged. */
export function fresh(c: { at: number; version: number } | undefined, version: number, now: number, minMs: number, maxMs: number): boolean {
  if (!c || now < c.at) return false;
  const age = now - c.at;
  return age < minMs || (c.version === version && age < maxMs);
}

/** Deterministic offset in [-1000, 1000) ms derived from the token address. */
function jitterOf(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (Math.imul(h, 31) + address.charCodeAt(i)) | 0;
  return ((h >>> 0) % 2000) - 1000;
}

export const clampInt = (v: number | undefined, def: number, lo: number, hi: number) => {
  if (v === undefined || !Number.isFinite(v)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
};

export const TOKEN_RELATIVE: ReadonlySet<WalletTag> = new Set(['dev', 'sniper', 'bundler', 'insider', 'top_holder']);

export function mergeTags(a: WalletTag[], b: WalletTag[]): WalletTag[] {
  if (b.length === 0) return a;
  const out = a.slice();
  for (const t of b) if (!out.includes(t)) out.push(t);
  return out;
}

/** State, list indexes and cached building blocks shared by the token analytics modules. */
export class TokenCore {
  readonly tracks = new Map<string, TokenTrack>();
  readonly caches = new Map<string, TokenCaches>();
  readonly devAggs = new Map<string, { at: number; value: DevAggregate }>();
  readonly narrativeCache = new Map<ChainId, { at: number; value: Narrative[] }>();
  /** Tokens traded in the last 24h, per chain. */
  readonly active = {} as Record<ChainId, Set<string>>;
  /** Curve tokens that crossed the near-completion threshold (or are migrating). */
  readonly almost = {} as Record<ChainId, Set<string>>;
  /** Migrated token addresses in migration order (oldest first). */
  readonly migrated = {} as Record<ChainId, string[]>;
  /** Labelled wallets (KOLs, exchanges, ...) for search. */
  readonly labelled = {} as Record<ChainId, string[]>;

  constructor(
    readonly ctx: AppContext,
    /** Users with the token page open (TokenSummary.watchers; the token channel counts them). */
    readonly viewerCount: (t: TokenState) => number,
  ) {
    for (const c of CHAIN_IDS) {
      this.active[c] = new Set();
      this.almost[c] = new Set();
      this.migrated[c] = [];
      this.labelled[c] = [];
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Index the world and follow it; `onLiveTrade` sees each trade after its tags are derived (not while warming up). */
  install(onLiveTrade: (trade: Trade, t: TokenState) => void): void {
    const { world, engine } = this.ctx;
    this.reindex();
    // Prepended so every other consumer of 'trade' sees the derived cohort tags.
    world.prependListener('trade', (trade: Trade, t: TokenState, w: WalletState) => this.onTrade(trade, t, w, onLiveTrade));
    world.on('tokenCreated', (t) => {
      if (!this.tracks.has(t.address)) this.tracks.set(t.address, newTrack(world, t));
    });
    world.on('curveCompleted', (t) => {
      const s = this.tracks.get(t.address);
      if (s) s.status = t.status;
      this.almost[t.chain].add(t.address);
    });
    world.on('tokenMigrated', (t) => {
      const s = this.tracks.get(t.address);
      if (s) {
        s.status = t.status;
        s.migratedAt = t.migratedAt;
      }
      this.almost[t.chain].delete(t.address);
      this.migrated[t.chain].push(t.address);
    });
    world.on('walletCreated', (w) => {
      if (w.label) this.labelled[w.chain].push(w.address);
    });
    engine.addTicker('token-analytics-sweep', () => this.sweep(), { everyMs: SWEEP_EVERY_MS, duringWarmup: true });
  }

  /** Rebuild list indexes from the world (startup / snapshot restore). */
  private reindex(): void {
    const { world } = this.ctx;
    const now = world.now;
    for (const c of CHAIN_IDS) {
      this.active[c].clear();
      this.almost[c].clear();
      this.labelled[c] = [];
    }
    const migrated: TokenState[] = [];
    for (const t of world.tokens.values()) {
      if (t.status === 'migrated') migrated.push(t);
      else if (t.status === 'migrating' || world.progress(t) >= ALMOST_PROGRESS) this.almost[t.chain].add(t.address);
      if (now - t.lastTradeAt <= DAY_MS && t.tradeCount > 0) this.active[t.chain].add(t.address);
    }
    migrated.sort((a, b) => (a.migratedAt ?? 0) - (b.migratedAt ?? 0));
    for (const c of CHAIN_IDS) this.migrated[c] = [];
    for (const t of migrated) this.migrated[t.chain].push(t.address);
    for (const w of world.wallets.values()) if (w.label) this.labelled[w.chain].push(w.address);
  }

  private onTrade(trade: Trade, t: TokenState, w: WalletState, onLiveTrade: (trade: Trade, t: TokenState) => void): void {
    try {
      const s = this.trackOf(t, true);
      recordTrade(this.ctx.world, s, trade, t, w);
      this.active[t.chain].add(t.address);
      if (t.status === 'curve' && t.curve && t.curve.realTokens <= t.curve.initialRealTokens * (1 - ALMOST_PROGRESS)) this.almost[t.chain].add(t.address);
      // Tag the live trade with analytics-derived cohorts (world.tradeTags only knows the sim's sets).
      const a = w.address;
      const tags = trade.walletTags;
      if ((s.snipers.has(a) && !tags.includes('sniper')) || (s.bundlers.has(a) && !tags.includes('bundler')) || (s.insiders.has(a) && !tags.includes('insider'))) {
        const rel: WalletTag[] = [];
        if (tags.includes('dev')) rel.push('dev');
        if (s.snipers.has(a) || tags.includes('sniper')) rel.push('sniper');
        if (s.bundlers.has(a) || tags.includes('bundler')) rel.push('bundler');
        if (s.insiders.has(a) || tags.includes('insider')) rel.push('insider');
        trade.walletTags = mergeTags(rel, tags.filter((x) => !TOKEN_RELATIVE.has(x)));
      }
      if (!this.ctx.engine.warming) onLiveTrade(trade, t);
    } catch (err) {
      console.error('[analytics/tokens] trade listener failed', err);
    }
  }

  /** Periodic housekeeping (runs during warmup too). */
  private sweep(): void {
    const { world } = this.ctx;
    const now = world.now;
    for (const c of CHAIN_IDS) {
      const set = this.active[c];
      for (const addr of set) {
        const t = world.tokens.get(addr);
        if (!t) {
          set.delete(addr);
          continue;
        }
        if (t.dormant || now - t.lastTradeAt > DAY_MS) {
          set.delete(addr);
          t.cache.volume24hUsd = 0;
          continue;
        }
        // Keep /api/meta volume fresh even for tokens no list has summarised.
        const cs = this.caches.get(addr)?.summary;
        if (!cs || now - cs.at > SWEEP_EVERY_MS) t.cache.volume24hUsd = volumeIn(t, DAY_MS, now);
      }
      const almost = this.almost[c];
      for (const addr of almost) {
        const t = world.tokens.get(addr);
        if (!t || t.status === 'migrated' || t.dormant) almost.delete(addr);
      }
      // Forget migrations of tokens the simulator has since deleted.
      const mig = this.migrated[c];
      if (mig.some((addr) => !world.tokens.has(addr))) this.migrated[c] = mig.filter((addr) => world.tokens.has(addr));
    }
    for (const [addr, s] of this.tracks) {
      if (s.gone) continue;
      const t = world.tokens.get(addr);
      if (!t) {
        tombstone(s);
        this.caches.delete(addr);
        continue;
      }
      pruneTrack(s, now);
      this.remember(t, s, world.priceUsd(t));
    }
    if (this.tracks.size > MAX_TRACKS) {
      // Evict the oldest tombstones (Map iterates in insertion = creation order).
      let excess = this.tracks.size - MAX_TRACKS;
      for (const [addr, s] of this.tracks) {
        if (excess <= 0) break;
        if (s.gone) {
          this.tracks.delete(addr);
          excess--;
        }
      }
    }
    for (const [k, v] of this.devAggs) if (now - v.at > DEV_AGG_TTL_MS * 6 || now < v.at) this.devAggs.delete(k);
    for (const [addr, c] of this.caches) {
      if (!world.tokens.has(addr)) {
        this.caches.delete(addr);
        continue;
      }
      if (c.traders && now - c.traders.at > 60_000) c.traders = undefined;
      if (c.holders && now - c.holders.at > 60_000) c.holders = undefined;
      // Tokens nobody has looked at for a while (quiet / dormant) drop their DTO caches.
      const last = Math.max(c.summary?.at ?? -Infinity, c.detail?.at ?? -Infinity, c.windows?.at ?? -Infinity, c.scan?.at ?? -Infinity);
      if (now - last > CACHE_IDLE_MS && !c.holders && !c.traders) this.caches.delete(addr);
    }
  }

  /** Analytics track for a token, created (and back-filled from the trade ring) on first sight. */
  trackOf(t: TokenState, excludeLastTrade = false): TokenTrack {
    let s = this.tracks.get(t.address);
    if (!s || s.gone) {
      s = newTrack(this.ctx.world, t);
      const replay = t.trades.length - (excludeLastTrade ? 1 : 0);
      if (replay > 0) backfillTrack(this.ctx.world, s, t, replay);
      this.tracks.set(t.address, s);
    }
    return s;
  }

  cachesOf(address: string): TokenCaches {
    let c = this.caches.get(address);
    if (!c) {
      c = { jitter: jitterOf(address) };
      this.caches.set(address, c);
    }
    return c;
  }

  /** Holder scan still usable: within the floor, or unchanged and younger than the (jittered) max age. */
  scanFresh(t: TokenState, c: TokenCaches, now: number): boolean {
    const floor = Math.min(SCAN_FLOOR_CAP_MS, Math.max(SCAN_MIN_MS, t.holders.size * SCAN_MS_PER_HOLDER));
    return fresh(c.scan, t.version, now, floor, SCAN_MAX_MS + 10 * c.jitter);
  }

  /** Cohort membership helper for one token (cheap; create one per batch of rows). */
  cohortsFor(t: TokenState): Cohorts {
    return new Cohorts(this.ctx.world, t, this.trackOf(t));
  }

  walletTagsOf = (w: WalletState): WalletTag[] => this.ctx.analytics.walletTags(w);

  // -------------------------------------------------------------------------
  // Cached building blocks
  // -------------------------------------------------------------------------

  statsOf(t: TokenState, c: TokenCaches, now: number, priceUsd: number): Record<StatWindow, WindowStats> {
    const w = c.windows;
    if (w && now >= w.at) {
      const idle = w.version === t.version;
      if (idle && now < w.value.validUntil) {
        if (w.priceUsd === priceUsd) return w.value.stats;
        const value = repriceWindows(w.value, priceUsd);
        c.windows = { at: now, version: t.version, value, priceUsd };
        return value.stats;
      }
      if (!idle && now - w.at < SUMMARY_MIN_MS) return w.value.stats;
    }
    const { snapshot: value, base } = computeWindowsCached(t, now, priceUsd, c.windowsBase);
    c.windowsBase = base;
    c.windows = { at: now, version: t.version, value, priceUsd };
    return value.stats;
  }

  scanOf(t: TokenState, c: TokenCaches, now: number, cohorts: Cohorts): HolderScan {
    if (this.scanFresh(t, c, now)) return c.scan!.value;
    const value = scanHolders(this.ctx.world, t, cohorts, this.walletTagsOf);
    c.scan = { at: now, version: t.version, value };
    return value;
  }

  /** Rugged flag of a live token; also refreshes the track's last-known values (kept after deletion). */
  liveRugged = (t: TokenState): boolean => {
    const s = this.trackOf(t);
    this.remember(t, s, this.ctx.world.priceUsd(t));
    return s.rugged;
  };

  remember(t: TokenState, s: TokenTrack, priceUsd: number): void {
    s.status = t.status;
    s.migratedAt = t.migratedAt;
    s.marketCapUsd = priceUsd * t.totalSupply;
    s.athMarketCapUsd = Math.max(t.athMarketCapUsd, s.marketCapUsd);
    s.rugged = isRugged(s, priceUsd, t.athPriceUsd);
  }

  devAgg(creator: string): DevAggregate {
    const now = this.ctx.world.now;
    const hit = this.devAggs.get(creator);
    if (hit && now >= hit.at && now - hit.at < DEV_AGG_TTL_MS) return hit.value;
    const value = devAggregate(this.ctx.world, creator, (a) => this.tracks.get(a), this.liveRugged);
    this.devAggs.set(creator, { at: now, value });
    return value;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialize(): unknown {
    return { v: 1, tracks: [...this.tracks.values()] };
  }

  restore(data: unknown): void {
    const d = data as { v?: number; tracks?: TokenTrack[] } | null;
    if (!d || d.v !== 1 || !Array.isArray(d.tracks)) return;
    this.tracks.clear();
    for (const s of d.tracks) {
      if (!s || typeof s.address !== 'string') continue;
      // Tracks saved before early buyers were tracked rebuild them from the world.
      if (!Array.isArray(s.earlyBuyers)) {
        const t = this.ctx.world.tokens.get(s.address);
        s.earlyBuyers = [];
        s.earlyTokens = [];
        if (t && !s.gone) backfillEarly(this.ctx.world, s, t);
      }
      this.tracks.set(s.address, s);
    }
    this.caches.clear();
    this.devAggs.clear();
    this.narrativeCache.clear();
    this.reindex();
  }
}
