// Head-following log poller for one chain: plans block windows behind the
// head (minus the chain's confirmation depth), fetches every log interest for a
// window with eth_getLogs, halves a window the node refuses as too large,
// re-scans a few already-seen blocks (public RPCs sit behind load balancers
// whose backends lag each other) and drops logs it already delivered. When the
// feed falls too far behind it skips ahead and says so instead of lagging forever.

import type { Hex } from 'viem';
import { BoundedSet } from './lru';
import { isRangeError, type EvmRpc, type LogQuery, type RawLog } from './rpc';

/** What a venue wants from a window: emitters (OR) and topic filters by position. */
export interface LogInterest {
  address?: string[];
  topics?: (Hex | Hex[] | null)[];
}

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
  /** Addresses per eth_getLogs address list. */
  maxAddresses: number;
  /** Values per topic OR-list. */
  maxTopicValues: number;
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
}

export class LogPoller {
  head: bigint | null = null;
  /** Last block whose logs were fully delivered. */
  cursor: bigint | null = null;
  private skippedBlocks = 0;
  private lastSkipAt: number | null = null;
  private windows = 0;
  private splits = 0;
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
    if (safe - this.cursor > BigInt(this.opts.maxLagBlocks)) {
      // Too far behind to catch up at this request budget: resume close to the head.
      const resume = safe - BigInt(Math.max(this.opts.maxRange, Math.floor(this.opts.maxLagBlocks / 4)));
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
    const queries = this.mergeInterests(interests);
    const out: RawLog[] = [];
    for (const q of queries) out.push(...(await this.fetchRange(q, start, to)));
    return this.fresh(out);
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
   * topic lists are chunked.
   */
  mergeInterests(interests: LogInterest[]): Omit<LogQuery, 'fromBlock' | 'toBlock'>[] {
    const groups = new Map<string, { any: boolean; addresses: Set<string>; topics?: (Hex | Hex[] | null)[] }>();
    const simple = { addresses: new Set<string>(), topic0: new Set<Hex>() };
    for (const i of interests) {
      if (i.address && i.address.length === 0) continue;
      if (i.topics?.some((t) => Array.isArray(t) && t.length === 0)) continue;
      if (i.address && i.topics && i.topics.length === 1 && i.topics[0] !== null) {
        for (const a of i.address) simple.addresses.add(a.toLowerCase());
        for (const t of Array.isArray(i.topics[0]) ? i.topics[0] : [i.topics[0]]) simple.topic0.add(t);
        continue;
      }
      const key = JSON.stringify(i.topics ?? null);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { any: false, addresses: new Set(), topics: i.topics }));
      if (!i.address) g.any = true;
      else for (const a of i.address) g.addresses.add(a.toLowerCase());
    }
    const out: Omit<LogQuery, 'fromBlock' | 'toBlock'>[] = [];
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
