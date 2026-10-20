// The narrow RPC surface the EVM feed needs (logs, heads, block times, tx
// senders, multicall reads), behind an interface so tests replay recorded
// chain data. The live implementation rides the viem client (JSON-RPC batching,
// fallback transports) and spends from a per-chain request budget, because
// public endpoints rate-limit hard.

import { decodeFunctionResult, encodeFunctionData, parseAbi, type Hex, type PublicClient } from 'viem';

export interface RawLog {
  /** Emitting contract, lowercase. */
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  removed: boolean;
  /** Block time (s) when the node includes it in logs (0 / absent otherwise). */
  blockTimestamp?: number;
}

export interface LogQuery {
  fromBlock: bigint;
  toBlock: bigint;
  /** Lowercase emitters (OR); absent = any. */
  address?: string[];
  /** Topic filters by position: a value, an OR list, or null for any. */
  topics?: (Hex | Hex[] | null)[];
}

export interface TxInfo {
  from: string;
  to: string | null;
}

export interface CallRequest {
  target: string;
  data: Hex;
}

export interface EvmRpc {
  blockNumber(): Promise<bigint>;
  getLogs(q: LogQuery): Promise<RawLog[]>;
  /** Block timestamps (s) by number. */
  blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>>;
  /** Sender / recipient of transactions by hash (lowercase keys). */
  transactions(hashes: Hex[]): Promise<Map<string, TxInfo>>;
  /** Logs of transactions by hash, from their receipts (lowercase keys). */
  receiptLogs(hashes: Hex[]): Promise<Map<string, RawLog[]>>;
  /**
   * eth_call batch through Multicall3 (null for a failed call), at `block` when
   * given (falling back to the latest block where the node keeps no history).
   */
  call(calls: CallRequest[], block?: bigint): Promise<(Hex | null)[]>;
  storageAt(address: string, slot: Hex): Promise<Hex>;
}

/** JSON-RPC log object (hex quantities) -> RawLog. */
export function parseRawLog(j: Record<string, unknown>): RawLog {
  const hexNum = (v: unknown) => (typeof v === 'string' && v.length > 2 ? Number.parseInt(v, 16) : 0);
  const ts = hexNum(j.blockTimestamp);
  return {
    address: String(j.address).toLowerCase(),
    topics: (j.topics as Hex[]).map((t) => t.toLowerCase() as Hex),
    data: String(j.data ?? '0x').toLowerCase() as Hex,
    blockNumber: BigInt(j.blockNumber as string),
    blockHash: String(j.blockHash ?? '0x').toLowerCase() as Hex,
    transactionHash: String(j.transactionHash).toLowerCase() as Hex,
    transactionIndex: hexNum(j.transactionIndex),
    logIndex: hexNum(j.logIndex),
    removed: j.removed === true,
    ...(ts > 0 ? { blockTimestamp: ts } : {}),
  };
}

/** The node refused the query for its size (block span or result count): split the range and retry. */
export function isRangeError(err: unknown): boolean {
  if (isRateLimit(err)) return false;
  return /more than \d+|exceed|too (many|large|wide|big)|limit|response size|block range|range (is )?too|query timeout|code -32005/i.test(errorText(err));
}

export function isRateLimit(err: unknown): boolean {
  return /status 429|code 429|rate.?limit|too many requests|capacity/i.test(errorText(err));
}

/**
 * What an RPC error says, from the error and its causes: short messages,
 * details, codes and HTTP statuses (never viem's long message, which embeds
 * the request body; its hex would match anything).
 */
export function errorText(err: unknown): string {
  const parts: string[] = [];
  let e = err as { shortMessage?: string; details?: string; message?: string; status?: number; code?: number; cause?: unknown } | undefined;
  for (let depth = 0; e && depth < 6; depth++) {
    if (typeof e !== 'object') {
      parts.push(String(e));
      break;
    }
    if (e.shortMessage) parts.push(e.shortMessage.split('\n')[0]);
    else if (e.message) parts.push(e.message.split('\n')[0]);
    if (e.details) parts.push(e.details);
    if (e.code !== undefined) parts.push(`code ${e.code}`);
    if (e.status) parts.push(`status ${e.status}`);
    e = e.cause as typeof e;
  }
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Request budget
// ---------------------------------------------------------------------------

/**
 * Token bucket: `rps` requests per second with a burst of two seconds' worth.
 * Every JSON-RPC call (including each call inside a batch) spends one token.
 */
export class RequestBudget {
  private tokens: number;
  private last: number;
  /** Timestamps (ms) of recent spends, for the requests/sec readout (bounded). */
  private readonly recent: number[] = [];

  constructor(
    readonly rps: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.tokens = Math.max(1, rps * 2);
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(Math.max(1, this.rps * 2), this.tokens + ((t - this.last) / 1000) * this.rps);
    this.last = t;
  }

  async take(n = 1): Promise<void> {
    if (this.rps <= 0) return;
    for (;;) {
      this.refill();
      if (this.tokens >= Math.min(n, Math.max(1, this.rps * 2))) {
        this.tokens -= n;
        this.note(n);
        return;
      }
      const deficit = Math.min(n, this.rps * 2) - this.tokens;
      await this.sleep(Math.max(5, Math.ceil((deficit / this.rps) * 1000)));
    }
  }

  private note(n: number): void {
    const t = this.now();
    for (let i = 0; i < n && this.recent.length < 10_000; i++) this.recent.push(t);
    const cutoff = t - 10_000;
    let drop = 0;
    while (drop < this.recent.length && this.recent[drop] < cutoff) drop++;
    if (drop) this.recent.splice(0, drop);
  }

  /** Average requests per second over the last 10 seconds. */
  rate(): number {
    const cutoff = this.now() - 10_000;
    let n = 0;
    for (let i = this.recent.length - 1; i >= 0 && this.recent[i] >= cutoff; i--) n++;
    return n / 10;
  }
}

// ---------------------------------------------------------------------------
// Live implementation over viem
// ---------------------------------------------------------------------------

const MULTICALL3_ABI = parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
/** Calls per aggregate3 (keeps each eth_call well under node gas / payload caps). */
const MULTICALL_CHUNK = 150;
/** JSON-RPC calls issued concurrently (viem batches them into one HTTP request). */
const BATCH_CHUNK = 25;
const RATE_LIMIT_RETRIES = 3;

export class ViemEvmRpc implements EvmRpc {
  constructor(
    private readonly client: PublicClient,
    private readonly budget: RequestBudget,
    private readonly multicall3: string,
  ) {}

  /** One JSON-RPC call within the budget; rate-limit answers are retried with backoff. */
  private async request<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await this.budget.take(1);
      try {
        return (await this.client.request({ method: method as never, params: params as never })) as T;
      } catch (err) {
        if (attempt >= RATE_LIMIT_RETRIES || !isRateLimit(err)) throw err;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
  }

  async blockNumber(): Promise<bigint> {
    return BigInt(await this.request<string>('eth_blockNumber', []));
  }

  async getLogs(q: LogQuery): Promise<RawLog[]> {
    const filter: Record<string, unknown> = { fromBlock: `0x${q.fromBlock.toString(16)}`, toBlock: `0x${q.toBlock.toString(16)}` };
    if (q.address?.length) filter.address = q.address.length === 1 ? q.address[0] : q.address;
    if (q.topics?.length) filter.topics = q.topics;
    const logs = await this.request<Record<string, unknown>[]>('eth_getLogs', [filter]);
    return logs.map(parseRawLog);
  }

  async blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
    const out = new Map<bigint, number>();
    for (let i = 0; i < blocks.length; i += BATCH_CHUNK) {
      const chunk = blocks.slice(i, i + BATCH_CHUNK);
      const res = await Promise.all(
        chunk.map((b) => this.request<{ timestamp: string } | null>('eth_getBlockByNumber', [`0x${b.toString(16)}`, false]).catch(() => null)),
      );
      chunk.forEach((b, j) => {
        const r = res[j];
        if (r?.timestamp) out.set(b, Number.parseInt(r.timestamp, 16));
      });
    }
    return out;
  }

  async transactions(hashes: Hex[]): Promise<Map<string, TxInfo>> {
    const out = new Map<string, TxInfo>();
    for (let i = 0; i < hashes.length; i += BATCH_CHUNK) {
      const chunk = hashes.slice(i, i + BATCH_CHUNK);
      const res = await Promise.all(
        chunk.map((h) => this.request<{ from: string; to: string | null } | null>('eth_getTransactionByHash', [h]).catch(() => null)),
      );
      chunk.forEach((h, j) => {
        const r = res[j];
        if (r?.from) out.set(h.toLowerCase(), { from: r.from.toLowerCase(), to: r.to ? r.to.toLowerCase() : null });
      });
    }
    return out;
  }

  async receiptLogs(hashes: Hex[]): Promise<Map<string, RawLog[]>> {
    const out = new Map<string, RawLog[]>();
    for (let i = 0; i < hashes.length; i += BATCH_CHUNK) {
      const chunk = hashes.slice(i, i + BATCH_CHUNK);
      const res = await Promise.all(
        chunk.map((h) => this.request<{ logs: Record<string, unknown>[] } | null>('eth_getTransactionReceipt', [h]).catch(() => null)),
      );
      chunk.forEach((h, j) => {
        const r = res[j];
        if (r?.logs) out.set(h.toLowerCase(), r.logs.map(parseRawLog));
      });
    }
    return out;
  }

  async call(calls: CallRequest[], block?: bigint): Promise<(Hex | null)[]> {
    const out: (Hex | null)[] = [];
    let tag = block === undefined ? 'latest' : `0x${block.toString(16)}`;
    for (let i = 0; i < calls.length; i += MULTICALL_CHUNK) {
      const chunk = calls.slice(i, i + MULTICALL_CHUNK);
      const data = encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        args: [chunk.map((c) => ({ target: c.target as Hex, allowFailure: true, callData: c.data }))],
      });
      let raw: Hex;
      try {
        raw = await this.request<Hex>('eth_call', [{ to: this.multicall3, data }, tag]);
      } catch (err) {
        if (tag === 'latest' || isRateLimit(err)) throw err;
        tag = 'latest';
        raw = await this.request<Hex>('eth_call', [{ to: this.multicall3, data }, tag]);
      }
      const res = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: 'aggregate3', data: raw });
      for (const r of res) out.push(r.success && r.returnData !== '0x' ? r.returnData : null);
    }
    return out;
  }

  async storageAt(address: string, slot: Hex): Promise<Hex> {
    return this.request<Hex>('eth_getStorageAt', [address, slot, 'latest']);
  }
}
