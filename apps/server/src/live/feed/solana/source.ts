// The program-log source: Solana RPC WebSocket (client.ts) -> decoded Anchor
// events (events.ts) -> the feed events ingest.ts books (map.ts), filtered to
// what the World keeps, with per-source health for diagnostics.
//
// Volume (mainnet, 2026-10-20, api.mainnet-beta): ~55 successful pump.fun and
// ~440 PumpSwap transactions a second, 60-100 curve trades and 100-400 pool
// trades a second, ~0.5 launches a second. The World cannot hold every token
// that trades (LIVE_MAX_TRACKED_TOKENS caps it), so trades are booked only for
// tokens it has (launches seen since start, tokens someone opened, pinned and
// held ones: every trade carries its curve's or pool's full post-trade state, so
// each one keeps that token's price exact without an RPC read) and for watched
// wallets (follows, copy-trade leaders, KOLs: their trades of unknown tokens load
// the token like PumpPortal's account trades do). Everything else is decoded,
// counted and dropped. Launches and migrations always pass.
//
// PumpSwap events name the pool, not the mint: pools map to mints through the
// World's tokens (canonical pools of migrated pump.fun coins), the pools this
// stream saw created (WSOL-quoted, canonical), and, for a watched wallet's trade
// on a pool nobody knows, one budgeted RPC read of the pool.

import type { CurveFacts } from '../verify';
import type { FeedEvent, TradeEvent } from '../messages';
import { catchUpGap, type CatchUpOptions, type CatchUpResult } from './catchup';
import { ProgramLogClient, type LogNotification, type ProgramLogClientOptions, type ProgramLogClientStats, type SlotGap, type SubscriptionState } from './client';
import { decodeProgramLogs, PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID, type DecodedLogEvent } from './events';
import { mapTransaction, type PoolInfo } from './map';
import { RateMeter, RateMeters } from './rate';

export type LogOrigin = 'stream' | 'catchup';

export interface SolanaLogSourceOptions {
  /** RPC WebSocket URL (may carry an API key: only its host is reported). */
  url: string;
  /** One transaction's feed events, in order, with its launches' curve facts. */
  emit: (events: FeedEvent[], facts: Map<string, CurveFacts>, origin: LogOrigin) => void;
  /** Whether a trade is booked (a token the World keeps, a launch in flight, a watched wallet). */
  wantsTrade: (e: TradeEvent, origin: LogOrigin) => boolean;
  /** PumpSwap pools of the World's tokens. */
  poolInfo?: (pool: string) => PoolInfo | null;
  /** Whether a wallet is watched (its trade on an unknown pool is worth an RPC read of the pool). */
  isWatched?: (wallet: string) => boolean;
  /** The mint of a canonical WSOL PumpSwap pool, read from the chain (null: not one). */
  resolvePool?: (pool: string) => Promise<PoolInfo | null>;
  /** Canonical PumpSwap pool of a mint ('' when unknown): pools learned from the stream must be canonical. */
  canonicalPool?: (mint: string) => string;
  /** getTransaction with the events decoded from its event CPIs (catchup.readTransactionEvents): recovers truncated logs. */
  readTransaction?: (signature: string) => Promise<LogNotification | null>;
  onGap?: (gap: SlotGap) => void;
  onStatus?: (connected: boolean) => void;
  /** Connection tuning (tests). */
  client?: Partial<Omit<ProgramLogClientOptions, 'url' | 'onTransaction' | 'onGap' | 'onStatus'>>;
  now?: () => number;
  log?: Pick<Console, 'warn' | 'info'>;
}

export interface SolanaLogStats {
  /** Decoded events by `<program>.<IDL name>`. */
  decoded: Record<string, number>;
  decodeErrors: number;
  lastDecodeError: string | null;
  /** Transactions whose logs the node truncated (later events missing from the logs). */
  truncated: number;
  /** Truncated transactions read back whole (their event CPIs), or not (their partial logs were used). */
  recovered: number;
  recoveryFailed: number;
  /** Feed events handed to the market. */
  emitted: { creates: number; trades: number; migrations: number };
  /** Trades of tokens the World does not keep, by wallets nobody watches. */
  filtered: number;
  /** Curves / pools quoted in another mint. */
  otherQuote: number;
  roundTrips: number;
  /** PumpSwap trades on pools whose mint is unknown (not looked up: nobody watches the trader). */
  unresolvedPools: number;
  poolLookups: { started: number; resolved: number; notCanonical: number; failed: number };
  catchUp: { runs: number; transactions: number; missing: number; skipped: number; incomplete: number; errors: number };
}

export interface SolanaLogHealth extends ProgramLogClientStats {
  endpoint: string;
  connected: boolean;
  subscriptions: Record<'pump' | 'pump-amm', SubscriptionState>;
  lastEventAt: number | null;
  lastNotificationAt: number | null;
  lastSlot: number;
  /** Over the last 10 s. */
  notificationsPerSec: number;
  eventsPerSec: number;
  /** Decoded events per second by type, over the last 10 s. */
  eventsPerSecByType: Record<string, number>;
  stats: SolanaLogStats;
}

/** Pools learned from the stream, remembered at most. */
const MAX_LEARNED_POOLS = 50_000;
/** Pools being looked up, transactions held per pool, and how long a miss is remembered. */
const MAX_PENDING_POOLS = 200;
const MAX_HELD_PER_POOL = 20;
const POOL_MISS_TTL_MS = 10 * 60_000;
/** Truncated transactions being read back at once (beyond it their partial logs are used). */
const MAX_RECOVERING = 20;

export class SolanaLogSource {
  readonly client: ProgramLogClient;
  readonly stats: SolanaLogStats = {
    decoded: {},
    decodeErrors: 0,
    lastDecodeError: null,
    truncated: 0,
    recovered: 0,
    recoveryFailed: 0,
    emitted: { creates: 0, trades: 0, migrations: 0 },
    filtered: 0,
    otherQuote: 0,
    roundTrips: 0,
    unresolvedPools: 0,
    poolLookups: { started: 0, resolved: 0, notCanonical: 0, failed: 0 },
    catchUp: { runs: 0, transactions: 0, missing: 0, skipped: 0, incomplete: 0, errors: 0 },
  };
  lastEventAt: number | null = null;
  private readonly learned = new Map<string, PoolInfo>();
  private readonly poolMisses = new Map<string, number>();
  private readonly pendingPools = new Map<string, LogNotification[]>();
  private recovering = 0;
  private readonly rates = new RateMeters();
  private readonly eventRate = new RateMeter(60);
  private readonly now: () => number;
  private readonly log: Pick<Console, 'warn' | 'info'>;

  constructor(private readonly opts: SolanaLogSourceOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? console;
    this.client = new ProgramLogClient({
      ...opts.client,
      url: opts.url,
      programs: [PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID],
      onTransaction: (tx) => this.processTransaction(tx, 'stream'),
      onGap: opts.onGap,
      onStatus: opts.onStatus,
      log: this.log,
      now: this.now,
    });
  }

  get connected(): boolean {
    return this.client.connected;
  }

  start(): void {
    this.client.start();
  }

  async stop(): Promise<void> {
    this.pendingPools.clear();
    await this.client.stop();
  }

  /** A pool's mint as far as this source knows (the World's pools first). */
  poolInfo(pool: string): PoolInfo | null {
    return this.opts.poolInfo?.(pool) ?? this.learned.get(pool) ?? null;
  }

  /** Decode one transaction's logs and hand its feed events on. Never throws (a per-transaction guard). */
  processTransaction(tx: LogNotification, origin: LogOrigin, onlyMint?: string): void {
    try {
      const decoded = tx.decoded ?? decodeProgramLogs(tx.logs);
      if (decoded.truncated) {
        this.stats.truncated++;
        // The node cut the logs: the rest of the events are in the transaction's event CPIs.
        if (!onlyMint && this.recoverTruncated(tx, origin)) return;
      }
      for (const err of decoded.errors) {
        this.stats.decodeErrors++;
        this.stats.lastDecodeError = `${err.program}.${err.event}: ${err.reason}`.slice(0, 200);
      }
      if (decoded.events.length === 0) return;
      if (!onlyMint) this.count(decoded.events);
      const mapped = mapTransaction(tx, decoded.events, { poolInfo: (p) => this.poolInfo(p), canonicalPool: this.opts.canonicalPool });
      for (const p of mapped.pools) this.learn(p.pool, p.info);
      if (!onlyMint) {
        this.stats.otherQuote += mapped.otherQuote;
        this.stats.roundTrips += mapped.roundTrips;
        for (const u of mapped.unresolved) {
          if (this.opts.isWatched?.(u.user) && this.opts.resolvePool) this.lookUpPool(u.pool, tx);
          else this.stats.unresolvedPools++;
        }
      }
      const events: FeedEvent[] = [];
      // Trades bundled with a launch in its own transaction go with it.
      const launched = new Set(mapped.events.filter((e) => e.kind === 'create' && mapped.facts.get(e.mint)?.solQuoted !== false).map((e) => e.mint));
      for (const e of mapped.events) {
        if (onlyMint && e.mint !== onlyMint) continue;
        if (e.kind === 'trade' && !launched.has(e.mint) && !this.opts.wantsTrade(e, origin)) {
          this.stats.filtered++;
          continue;
        }
        events.push(e);
      }
      if (events.length === 0) return;
      for (const e of events) {
        if (e.kind === 'create') this.stats.emitted.creates++;
        else if (e.kind === 'trade') this.stats.emitted.trades++;
        else this.stats.emitted.migrations++;
      }
      this.lastEventAt = this.now();
      this.opts.emit(events, mapped.facts, origin);
    } catch (err) {
      this.stats.decodeErrors++;
      this.stats.lastDecodeError = `transaction ${tx.signature.slice(0, 12)}: ${err instanceof Error ? err.message : 'error'}`.slice(0, 200);
    }
  }

  /** Read back and replay the given addresses' transactions within a gap (catch-up.ts). */
  async catchUp(gap: Pick<SlotGap, 'fromSlot' | 'toSlot'>, addresses: string[], opts: Omit<CatchUpOptions, 'seen'>): Promise<CatchUpResult> {
    this.stats.catchUp.runs++;
    const r = await catchUpGap(gap, addresses, { ...opts, seen: (s) => this.client.hasSeen(s) });
    const c = this.stats.catchUp;
    c.missing += r.missing;
    c.skipped += r.skipped;
    c.incomplete += r.incomplete;
    c.errors += r.errors;
    for (const tx of r.transactions) {
      // The stream may have delivered it meanwhile.
      if (!this.client.markSeen(tx.signature)) continue;
      c.transactions++;
      this.processTransaction(tx, 'catchup');
    }
    return r;
  }

  health(): SolanaLogHealth {
    const now = this.now();
    const subs = this.client.state;
    return {
      ...this.client.stats,
      endpoint: this.client.host,
      connected: this.client.connected,
      subscriptions: { pump: subs.get(PUMP_PROGRAM_ID) ?? 'pending', 'pump-amm': subs.get(PUMP_AMM_PROGRAM_ID) ?? 'pending' },
      lastEventAt: this.lastEventAt,
      lastNotificationAt: this.client.lastNotificationAt,
      lastSlot: this.client.lastSlot,
      notificationsPerSec: Math.round(this.client.notificationsPerSecond(10) * 10) / 10,
      eventsPerSec: Math.round(this.eventRate.perSecond(now, 10) * 10) / 10,
      eventsPerSecByType: this.rates.snapshot(now, 10),
      stats: { ...this.stats, decoded: { ...this.stats.decoded }, emitted: { ...this.stats.emitted }, poolLookups: { ...this.stats.poolLookups }, catchUp: { ...this.stats.catchUp } },
    };
  }

  private count(events: readonly DecodedLogEvent[]): void {
    const now = this.now();
    for (const e of events) {
      const k = `${e.program}.${e.event}`;
      this.stats.decoded[k] = (this.stats.decoded[k] ?? 0) + 1;
      this.rates.add(k, 1, now);
    }
    this.eventRate.add(events.length, now);
  }

  /** Remember a pool's mint: only a mint's canonical pool stands for it (another pool of the mint has its own price). */
  private learn(pool: string, info: PoolInfo, verified = false): void {
    if (this.learned.has(pool)) return;
    const canonical = verified ? pool : this.opts.canonicalPool?.(info.mint);
    if (canonical !== undefined && canonical !== pool) return;
    this.learned.set(pool, info);
    if (this.learned.size > MAX_LEARNED_POOLS) {
      const oldest = this.learned.keys().next().value;
      if (oldest !== undefined) this.learned.delete(oldest);
    }
  }

  /** A watched wallet traded on a pool nobody knows: read it once, then replay the held transactions. */
  private lookUpPool(pool: string, tx: LogNotification): void {
    const resolve = this.opts.resolvePool;
    if (!resolve) return;
    const missAt = this.poolMisses.get(pool);
    if (missAt !== undefined && this.now() - missAt < POOL_MISS_TTL_MS) return;
    const held = this.pendingPools.get(pool);
    if (held) {
      if (held.length < MAX_HELD_PER_POOL) held.push(tx);
      return;
    }
    if (this.pendingPools.size >= MAX_PENDING_POOLS) return;
    this.pendingPools.set(pool, [tx]);
    this.stats.poolLookups.started++;
    resolve(pool).then(
      (info) => {
        const txs = this.pendingPools.get(pool) ?? [];
        this.pendingPools.delete(pool);
        if (!info) {
          this.stats.poolLookups.notCanonical++;
          this.remember(pool);
          return;
        }
        this.stats.poolLookups.resolved++;
        // resolvePool answers canonical WSOL pools only
        this.learn(pool, info, true);
        for (const t of txs) this.processTransaction(t, 'stream', info.mint);
      },
      () => {
        this.pendingPools.delete(pool);
        this.stats.poolLookups.failed++;
        this.remember(pool);
      },
    );
  }

  /**
   * Read a transaction whose logs were truncated and process its full event set instead (held meanwhile;
   * the partial logs are used when the read fails). False when no read is possible now.
   */
  private recoverTruncated(tx: LogNotification, origin: LogOrigin): boolean {
    const read = this.opts.readTransaction;
    if (!read || this.recovering >= MAX_RECOVERING) return false;
    this.recovering++;
    const partial = { ...tx, decoded: decodeProgramLogs(tx.logs) };
    partial.decoded.truncated = false;
    read(tx.signature).then(
      (full) => {
        this.recovering--;
        if (full?.decoded && full.decoded.events.length > 0) {
          this.stats.recovered++;
          this.processTransaction({ ...full, slot: tx.slot }, origin);
        } else {
          this.stats.recoveryFailed++;
          this.processTransaction(partial, origin);
        }
      },
      () => {
        this.recovering--;
        this.stats.recoveryFailed++;
        this.processTransaction(partial, origin);
      },
    );
    return true;
  }

  private remember(pool: string): void {
    this.poolMisses.set(pool, this.now());
    if (this.poolMisses.size > 5000) {
      const cutoff = this.now() - POOL_MISS_TTL_MS;
      for (const [p, at] of this.poolMisses) if (at < cutoff) this.poolMisses.delete(p);
      if (this.poolMisses.size > 5000) this.poolMisses.clear();
    }
  }
}
