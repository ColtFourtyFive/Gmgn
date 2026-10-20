// Block timestamps for a chain. Most nodes put blockTimestamp on every log;
// where they don't (Arbitrum Orbit nodes report 0), the clock fetches the
// window's edge blocks and interpolates the blocks between them: a trade's time
// is then off by well under a second, without a request per block.

import type { EvmRpc, RawLog } from './rpc';

/** Recent block -> unix seconds anchors kept (sorted by block). */
const MAX_ANCHORS = 512;
/** Fetch blocks individually below this many; interpolate between edges above. */
const EXACT_FETCH_LIMIT = 4;

export class BlockClock {
  private blocks: bigint[] = [];
  private times: number[] = [];

  constructor(
    private readonly rpc: EvmRpc,
    private readonly blockTimeMs: number,
  ) {}

  /** Record a known block time (seconds). */
  anchor(block: bigint, seconds: number): void {
    if (!(seconds > 0)) return;
    let lo = 0;
    let hi = this.blocks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.blocks[mid] < block) lo = mid + 1;
      else hi = mid;
    }
    if (this.blocks[lo] === block) {
      this.times[lo] = seconds;
      return;
    }
    this.blocks.splice(lo, 0, block);
    this.times.splice(lo, 0, seconds);
    if (this.blocks.length > MAX_ANCHORS) {
      this.blocks.splice(0, this.blocks.length - MAX_ANCHORS);
      this.times.splice(0, this.times.length - MAX_ANCHORS);
    }
  }

  has(block: bigint): boolean {
    return this.indexOf(block) >= 0;
  }

  private indexOf(block: bigint): number {
    let lo = 0;
    let hi = this.blocks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.blocks[mid] === block) return mid;
      if (this.blocks[mid] < block) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /**
   * Make the logs' blocks resolvable: take node-provided timestamps, then fetch
   * the missing blocks (all of them when few, otherwise the first and last).
   */
  async prepare(logs: RawLog[]): Promise<void> {
    const missing = new Set<bigint>();
    for (const l of logs) {
      if (l.blockTimestamp) this.anchor(l.blockNumber, l.blockTimestamp);
      else if (!this.has(l.blockNumber)) missing.add(l.blockNumber);
    }
    if (missing.size === 0) return;
    const sorted = [...missing].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const want = sorted.length <= EXACT_FETCH_LIMIT ? sorted : [sorted[0], sorted[sorted.length - 1]];
    const got = await this.rpc.blockTimestamps(want);
    for (const [b, s] of got) this.anchor(b, s);
  }

  /** Block time in ms: exact when known, interpolated between anchors, else extrapolated at the chain's block time. */
  timeOf(block: bigint): number | null {
    const n = this.blocks.length;
    if (n === 0) return null;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.blocks[mid] < block) lo = mid + 1;
      else hi = mid;
    }
    if (lo < n && this.blocks[lo] === block) return this.times[lo] * 1000;
    const before = lo - 1;
    const after = lo;
    if (before >= 0 && after < n) {
      const b0 = this.blocks[before];
      const b1 = this.blocks[after];
      const t0 = this.times[before] * 1000;
      const t1 = this.times[after] * 1000;
      return Math.round(t0 + ((t1 - t0) * Number(block - b0)) / Number(b1 - b0));
    }
    if (before >= 0) return this.times[before] * 1000 + Number(block - this.blocks[before]) * this.blockTimeMs;
    return this.times[after] * 1000 - Number(this.blocks[after] - block) * this.blockTimeMs;
  }
}
