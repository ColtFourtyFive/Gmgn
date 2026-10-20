// Record / replay of the feed's RPC traffic: RecordingRpc wraps a live EvmRpc
// and keeps every answer; FixtureRpc answers from such a recording (logs are
// filtered like a node would, calls are matched by target + calldata), so
// tests run the real pipeline over real mainnet data, offline and
// deterministically.

import type { Hex } from 'viem';
import { ARB_BLOCK_NUMBER_CALL, ARBSYS } from './abi';
import { parseRawLog, type CallRequest, type EvmRpc, type LogQuery, type RawLog, type TxInfo } from './rpc';

export interface RpcFixture {
  chain: string;
  /** Block range the recording covers (inclusive). */
  from: number;
  to: number;
  /** Head reported to the feed. */
  head: number;
  /** JSON-RPC log objects (hex quantities). */
  logs: Record<string, unknown>[];
  /** "target:calldata" -> return data (null = reverted). */
  calls: Record<string, Hex | null>;
  txs: Record<string, TxInfo>;
  /** tx hash -> receipt logs (JSON-RPC shape). */
  receipts?: Record<string, Record<string, unknown>[]>;
  /** block number -> unix seconds. */
  blocks: Record<string, number>;
  /** "address:slot" -> value. */
  storage: Record<string, Hex>;
}

const callKey = (c: CallRequest) => `${c.target.toLowerCase()}:${c.data.toLowerCase()}`;

/** RawLog -> JSON-RPC shape (for fixtures). */
export function rawLogToJson(l: RawLog): Record<string, unknown> {
  return {
    address: l.address,
    topics: l.topics,
    data: l.data,
    blockNumber: `0x${l.blockNumber.toString(16)}`,
    blockHash: l.blockHash,
    transactionHash: l.transactionHash,
    transactionIndex: `0x${l.transactionIndex.toString(16)}`,
    logIndex: `0x${l.logIndex.toString(16)}`,
    removed: l.removed,
    ...(l.blockTimestamp ? { blockTimestamp: `0x${l.blockTimestamp.toString(16)}` } : {}),
  };
}

export class RecordingRpc implements EvmRpc {
  readonly fixture: RpcFixture;
  private readonly logIds = new Set<string>();

  constructor(
    private readonly inner: EvmRpc,
    chain: string,
    private readonly range: { from: number; to: number },
  ) {
    this.fixture = { chain, from: range.from, to: range.to, head: range.to, logs: [], calls: {}, txs: {}, receipts: {}, blocks: {}, storage: {} };
  }

  /** The recording pretends the chain's head is the end of the range. */
  async blockNumber(): Promise<bigint> {
    return BigInt(this.range.to);
  }

  async getLogs(q: LogQuery): Promise<RawLog[]> {
    const logs = await this.inner.getLogs(q);
    for (const l of logs) {
      const id = `${l.transactionHash}:${l.logIndex}`;
      if (this.logIds.has(id)) continue;
      this.logIds.add(id);
      const { blockHash: _hash, removed: _removed, ...compact } = rawLogToJson(l);
      this.fixture.logs.push(compact);
    }
    return logs;
  }

  async blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
    const out = await this.inner.blockTimestamps(blocks);
    for (const [b, s] of out) this.fixture.blocks[b.toString()] = s;
    return out;
  }

  async transactions(hashes: Hex[]): Promise<Map<string, TxInfo>> {
    const out = await this.inner.transactions(hashes);
    for (const [h, t] of out) this.fixture.txs[h] = t;
    return out;
  }

  async receiptLogs(hashes: Hex[]): Promise<Map<string, RawLog[]>> {
    const out = await this.inner.receiptLogs(hashes);
    for (const [h, logs] of out) this.fixture.receipts![h] = logs.map(rawLogToJson);
    return out;
  }

  async call(calls: CallRequest[], block?: bigint): Promise<(Hex | null)[]> {
    const out = await this.inner.call(calls, block);
    calls.forEach((c, i) => (this.fixture.calls[callKey(c)] = out[i]));
    return out;
  }

  async storageAt(address: string, slot: Hex): Promise<Hex> {
    const v = await this.inner.storageAt(address, slot);
    this.fixture.storage[`${address.toLowerCase()}:${slot.toLowerCase()}`] = v;
    return v;
  }
}

export class FixtureRpc implements EvmRpc {
  private readonly logs: RawLog[];
  /** Queries served (tests inspect them). */
  readonly queries: LogQuery[] = [];
  missingCalls = 0;
  head: bigint;

  constructor(readonly fixture: RpcFixture) {
    this.logs = fixture.logs.map(parseRawLog);
    this.head = BigInt(fixture.head);
  }

  async blockNumber(): Promise<bigint> {
    return this.head;
  }

  async getLogs(q: LogQuery): Promise<RawLog[]> {
    this.queries.push(q);
    const addrs = q.address?.map((a) => a.toLowerCase());
    return this.logs.filter((l) => {
      if (l.blockNumber < q.fromBlock || l.blockNumber > q.toBlock) return false;
      if (addrs && !addrs.includes(l.address)) return false;
      if (q.topics) {
        for (let i = 0; i < q.topics.length; i++) {
          const want = q.topics[i];
          if (want === null || want === undefined) continue;
          const have = l.topics[i];
          if (!have) return false;
          if (Array.isArray(want) ? !want.map((w) => w.toLowerCase()).includes(have) : want.toLowerCase() !== have) return false;
        }
      }
      return true;
    });
  }

  async blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
    const out = new Map<bigint, number>();
    for (const b of blocks) {
      const s = this.fixture.blocks[b.toString()];
      if (s) out.set(b, s);
    }
    return out;
  }

  async transactions(hashes: Hex[]): Promise<Map<string, TxInfo>> {
    const out = new Map<string, TxInfo>();
    for (const h of hashes) {
      const t = this.fixture.txs[h.toLowerCase()];
      if (t) out.set(h.toLowerCase(), t);
    }
    return out;
  }

  async receiptLogs(hashes: Hex[]): Promise<Map<string, RawLog[]>> {
    const out = new Map<string, RawLog[]>();
    for (const h of hashes) {
      const logs = this.fixture.receipts?.[h.toLowerCase()];
      if (logs) out.set(h.toLowerCase(), logs.map(parseRawLog));
    }
    return out;
  }

  async call(calls: CallRequest[], block?: bigint): Promise<(Hex | null)[]> {
    return calls.map((c) => {
      // The state block of a read: the replay answers as of the block asked for.
      if (c.target.toLowerCase() === ARBSYS && c.data.toLowerCase() === ARB_BLOCK_NUMBER_CALL) return `0x${(block ?? this.head).toString(16).padStart(64, '0')}` as Hex;
      const k = callKey(c);
      if (!(k in this.fixture.calls)) {
        this.missingCalls++;
        return null;
      }
      return this.fixture.calls[k];
    });
  }

  async storageAt(address: string, slot: Hex): Promise<Hex> {
    return this.fixture.storage[`${address.toLowerCase()}:${slot.toLowerCase()}`] ?? ('0x' + '0'.repeat(64)) as Hex;
  }
}
