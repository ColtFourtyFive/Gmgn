// Head-following log poller for one chain: plans block windows behind the
// head (minus the chain's confirmation depth), fetches every log interest for a
// window with eth_getLogs, halves a window the node refuses as too large,
// re-scans a few already-seen blocks (public RPCs sit behind load balancers
// whose backends lag each other) and drops logs it already delivered. When the
// feed falls too far behind it skips ahead and says so instead of lagging forever.
//
// Public endpoints restrict filters: publicnode takes at most 10 emitters per
// query and an emitter-less query over a single block only. Interests that
// allow it (`wide`: AMM pools, whose logs the venue matches by address anyway)
// then go out without their emitter list, one block per query, and the logs
// are filtered by address here. Both limits are configured per endpoint and
// also learned from the node's refusals.

import type { Hex } from 'viem';
import { BoundedSet } from './lru';
import { isRangeError, queryShapeLimit, type EvmRpc, type LogQuery, type RawLog } from './rpc';

/** What a venue wants from a window: emitters (OR) and topic filters by position. */
export interface LogInterest {
  address?: string[];
  topics?: (Hex | Hex[] | null)[];
  /**
   * The emitter list may be dropped when it outgrows the node's address limit
   * (logs are then matched by address client-side). Only for a topic0 list.
   */
  wide?: boolean;
}

/** A query to send: its filter, plus the emitters to keep when it went out without them. */
export type MergedQuery = Omit<LogQuery, 'fromBlock' | 'toBlock'> & { keep?: Set<string> };

/** Emitter lists longer than this many node-sized chunks go out emitter-less (wide interests). */
const WIDE_AFTER_CHUNKS = 2;

export interface PollerOptions {
  /** Largest block span per eth_getLogs. */
  maxRange: number;
  /** Blocks behind the head treated as final (0 on sequencer chains). */
  confirmations: number;
  /** Already-processed blocks re-queried every window (late-indexing backends). */
  rescan: number;
  /** Beyond this many blocks behind the safe head, jump forward. */
  maxLagBlocks: number;
  /** Blocks before the head to start from on the first poll. */
  backfill: number;
  /** Delivered log ids remembered for dedupe. */
  dedupeCap: number;
  /** Addresses per eth_getLogs address list (publicnode: 10); lowered when the node says so. */
  maxAddresses: number;
  /** Values per topic OR-list. */
  maxTopicValues: number;
  /** Block span the node accepts for a query without emitters (publicnode: 1; default maxRange). */
  emitterlessRange?: number;
  /** Skip-ahead threshold while emitter-less queries go one block at a time (default maxLagBlocks). */
  maxLagBlocksNarrow?: number;
}

export interface PollWindow {
  from: bigint;
  to: bigint;
  head: bigint;
}

export interface PollerStatus {
  head: bigint | null;
  cursor: bigint | null;
  lagBlocks: number;
  skippedBlocks: number;
  lastSkipAt: number | null;
  windows: number;
  splits: number;
  /** Addresses per query in use (learned limits included). */
  maxAddresses: number;
  /** Block span per emitter-less query in use. */
  emitterlessRange: number;
  /** Whether the last window fetched AMM pools emitter-less (address list over the node's limit). */
  wideActive: boolean;
}

export class LogPoller {
  head: bigint | null = null;
  /** Last block whose logs were fully delivered. */
  cursor: bigint | null = null;
  private skippedBlocks = 0;
  private lastSkipAt: number | null = null;
  private windows = 0;
  private splits = 0;
  private wideActive = false;
  private readonly seen: BoundedSet<string>;

  constructor(
    private readonly rpc: EvmRpc,
    readonly opts: PollerOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.seen = new BoundedSet(opts.dedupeCap);
  }

  /** Refresh the head; returns the next window to process or null when caught up. */
  async plan(): Promise<PollWindow | null> {
    this.head = await this.rpc.blockNumber();
    return this.nextWindow();
  }

  /** Next window from the known head (no RPC). */
  nextWindow(): PollWindow | null {
    if (this.head === null) return null;
    const safe = this.head - BigInt(this.opts.confirmations);
    if (safe < 0n) return null;
    if (this.cursor === null) this.cursor = safe - BigInt(Math.max(0, this.opts.backfill));
    // Block-by-block (emitter-less) fetching makes catch-up cost one request per block.
    const maxLag = this.narrowWindows() ? (this.opts.maxLagBlocksNarrow ?? this.opts.maxLagBlocks) : this.opts.maxLagBlocks;
    if (safe - this.cursor > BigInt(maxLag)) {
      // Too far behind to catch up at this request budget: resume close to the head.
      const resume = safe - BigInt(Math.max(Math.min(this.opts.maxRange, maxLag), Math.floor(maxLag / 4)));
      this.skippedBlocks += Number(resume - this.cursor);
      this.lastSkipAt = this.now();
      this.cursor = resume;
    }
    if (safe <= this.cursor) return null;
    const from = this.cursor + 1n;
    const span = BigInt(this.opts.maxRange);
    const to = safe - from + 1n > span ? from + span - 1n : safe;
    return { from, to, head: this.head };
  }

  /** Mark a window delivered (advances the cursor). */
  commit(w: PollWindow): void {
    if (this.cursor === null || w.to > this.cursor) this.cursor = w.to;
    this.windows++;
  }

  /**
   * Fetch every interest over [from, to] (plus the re-scan overlap), merging
   * interests that share topic filters. Returns logs not delivered yet, sorted
   * and deduped; call markDelivered once they are applied.
   */
  async fetch(interests: LogInterest[], from: bigint, to: bigint, opts: { rescan?: boolean } = {}): Promise<RawLog[]> {
    const back = opts.rescan === false ? 0n : BigInt(this.opts.rescan);
    const start = from - back < 0n ? 0n : from - back;
    for (let attempt = 0; ; attempt++) {
      try {
        const out: RawLog[] = [];
        for (const q of this.mergeInterests(interests)) {
          if (q.address) {
            out.push(...(await this.fetchRange(q, start, to)));
            continue;
          }
          // Emitter-less: in node-sized spans; wide pools skip the re-scan when blocks are confirmed anyway.
          const { keep, ...filter } = q;
          const first = keep && this.opts.confirmations > 0 ? from : start;
          const span = BigInt(this.emitterlessRange());
          for (let b = first; b <= to; b += span) {
            const end = b + span - 1n < to ? b + span - 1n : to;
            const logs = await this.fetchRange(filter, b, end);
            out.push(...(keep ? logs.filter((l) => keep.has(l.address)) : logs));
          }
        }
        return this.fresh(out);
      } catch (err) {
        // The node named a filter limit: adopt it and re-plan the queries once or twice.
        if (attempt < 2 && this.learn(err)) continue;
        throw err;
      }
    }
  }

  /** Adopt a filter limit from a refusal; true when something changed. */
  private learn(err: unknown): boolean {
    const limit = queryShapeLimit(err);
    if (!limit) return false;
    if (limit.kind === 'addresses' && limit.max < this.opts.maxAddresses) {
      this.opts.maxAddresses = Math.max(1, limit.max);
      return true;
    }
    if (limit.kind === 'emitterless' && this.emitterlessRange() > 1) {
      this.opts.emitterlessRange = 1;
      return true;
    }
    return false;
  }

  private emitterlessRange(): number {
    return Math.max(1, Math.min(this.opts.maxRange, this.opts.emitterlessRange ?? this.opts.maxRange));
  }

  /** Wide pools are fetched in spans shorter than a window. */
  private narrowWindows(): boolean {
    return this.wideActive && this.emitterlessRange() < this.opts.maxRange;
  }

  /** Logs not delivered before, in chain order, each once. */
  fresh(logs: RawLog[]): RawLog[] {
    const sorted = [...logs].sort(compareLogs);
    const out: RawLog[] = [];
    const batch = new Set<string>();
    for (const l of sorted) {
      if (l.removed) continue;
      const id = logId(l);
      if (this.seen.has(id) || batch.has(id)) continue;
      batch.add(id);
      out.push(l);
    }
    return out;
  }

  /** Remember applied logs so re-scans and overlapping interests never deliver them again. */
  markDelivered(logs: RawLog[]): void {
    for (const l of logs) this.seen.add(logId(l));
  }

  private async fetchRange(q: Omit<LogQuery, 'fromBlock' | 'toBlock'>, from: bigint, to: bigint): Promise<RawLog[]> {
    try {
      return await this.rpc.getLogs({ ...q, fromBlock: from, toBlock: to });
    } catch (err) {
      if (to > from && isRangeError(err)) {
        this.splits++;
        const mid = from + (to - from) / 2n;
        const left = await this.fetchRange(q, from, mid);
        const right = await this.fetchRange(q, mid + 1n, to);
        return [...left, ...right];
      }
      throw err;
    }
  }

  /**
   * Group interests into as few queries as possible: interests naming emitters
   * and only a topic0 list share one query (union of emitters x union of
   * topic0s: a contract only emits its own events, so the cross product adds
   * nothing material); others group by identical topic filters. Long address /
   * topic lists are chunked. When the emitters outgrow a couple of node-sized
   * chunks, wide interests go out emitter-less (filtered by address on return).
   */
  mergeInterests(interests: LogInterest[]): MergedQuery[] {
    const groups = new Map<string, { any: boolean; addresses: Set<string>; topics?: (Hex | Hex[] | null)[] }>();
    const simple = { addresses: new Set<string>(), topic0: new Set<Hex>() };
    const wide = { addresses: new Set<string>(), topic0: new Set<Hex>() };
    for (const i of interests) {
      if (i.address && i.address.length === 0) continue;
      if (i.topics?.some((t) => Array.isArray(t) && t.length === 0)) continue;
      if (i.address && i.topics && i.topics.length === 1 && i.topics[0] !== null) {
        const g = i.wide ? wide : simple;
        for (const a of i.address) g.addresses.add(a.toLowerCase());
        for (const t of Array.isArray(i.topics[0]) ? i.topics[0] : [i.topics[0]]) g.topic0.add(t);
        continue;
      }
      const key = JSON.stringify(i.topics ?? null);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { any: false, addresses: new Set(), topics: i.topics }));
      if (!i.address) g.any = true;
      else for (const a of i.address) g.addresses.add(a.toLowerCase());
    }
    const out: MergedQuery[] = [];
    this.wideActive = wide.addresses.size > 0 && simple.addresses.size + wide.addresses.size > this.opts.maxAddresses * WIDE_AFTER_CHUNKS;
    if (this.wideActive) out.push({ topics: [[...wide.topic0].sort()], keep: wide.addresses });
    else {
      for (const a of wide.addresses) simple.addresses.add(a);
      for (const t of wide.topic0) simple.topic0.add(t);
    }
    if (simple.addresses.size) {
      const addrs = [...simple.addresses].sort();
      const topic0 = [...simple.topic0].sort();
      for (let i = 0; i < addrs.length; i += this.opts.maxAddresses) out.push({ address: addrs.slice(i, i + this.opts.maxAddresses), topics: [topic0] });
    }
    for (const g of groups.values()) {
      for (const topics of this.chunkTopics(g.topics)) {
        if (g.any) {
          out.push(topics ? { topics } : {});
          continue;
        }
        const addrs = [...g.addresses].sort();
        for (let i = 0; i < addrs.length; i += this.opts.maxAddresses) {
          const address = addrs.slice(i, i + this.opts.maxAddresses);
          out.push(topics ? { address, topics } : { address });
        }
      }
    }
    return out;
  }

  /** Split the (single) long OR-list of a topic filter into node-sized chunks. */
  private chunkTopics(topics: (Hex | Hex[] | null)[] | undefined): ((Hex | Hex[] | null)[] | undefined)[] {
    if (!topics) return [undefined];
    const idx = topics.findIndex((t) => Array.isArray(t) && t.length > this.opts.maxTopicValues);
    if (idx < 0) return [topics];
    const list = topics[idx] as Hex[];
    const sorted = [...new Set(list)].sort();
    const out: (Hex | Hex[] | null)[][] = [];
    for (let i = 0; i < sorted.length; i += this.opts.maxTopicValues) {
      const t = [...topics];
      t[idx] = sorted.slice(i, i + this.opts.maxTopicValues);
      out.push(t);
    }
    return out;
  }

  status(): PollerStatus {
    const lag = this.head !== null && this.cursor !== null ? Number(this.head - BigInt(this.opts.confirmations) - this.cursor) : 0;
    return {
      head: this.head,
      cursor: this.cursor,
      lagBlocks: Math.max(0, lag),
      skippedBlocks: this.skippedBlocks,
      lastSkipAt: this.lastSkipAt,
      windows: this.windows,
      splits: this.splits,
      maxAddresses: this.opts.maxAddresses,
      emitterlessRange: this.emitterlessRange(),
      wideActive: this.wideActive,
    };
  }
}

export function logId(l: RawLog): string {
  return `${l.transactionHash}:${l.logIndex}`;
}

export function compareLogs(a: RawLog, b: RawLog): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}
