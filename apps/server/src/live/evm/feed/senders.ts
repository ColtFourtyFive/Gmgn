// Who made a trade. Venues report the contract that called them (routers,
// aggregators, launch-and-buy helpers), so the trader is the transaction's
// sender; for ERC-4337 bundles (tx.to is an EntryPoint, tx.from the bundler)
// it is the smart account named by the bundle's UserOperationEvent.

import type { Hex } from 'viem';
import { ENTRY_POINTS, topicAddress, TOPIC } from './abi';
import { LruMap } from './lru';
import type { EvmRpc, RawLog, TxInfo } from './rpc';

const TX_CACHE = 20_000;
const USER_OP_CACHE = 5_000;

export class TxSenders {
  private readonly txs = new LruMap<string, TxInfo>(TX_CACHE);
  /** tx hash -> the single userOp sender in the bundle (null when several). */
  private readonly userOps = new LruMap<string, string | null>(USER_OP_CACHE);
  lookups = 0;

  constructor(private readonly rpc: EvmRpc) {}

  /** Take UserOperationEvent logs of the window. */
  noteLogs(logs: RawLog[]): void {
    for (const l of logs) {
      if (l.topics[0] !== TOPIC.userOperation || !ENTRY_POINTS.has(l.address) || l.topics.length < 3) continue;
      const sender = topicAddress(l.topics[2]);
      const known = this.userOps.peek(l.transactionHash);
      if (known === undefined) this.userOps.set(l.transactionHash, sender);
      else if (known !== sender) this.userOps.set(l.transactionHash, null);
    }
  }

  /** Fetch the senders of these transactions (batched; cached). */
  async prepare(hashes: Iterable<Hex>): Promise<void> {
    const missing = [...new Set([...hashes].map((h) => h.toLowerCase() as Hex))].filter((h) => !this.txs.has(h));
    if (missing.length === 0) return;
    this.lookups += missing.length;
    const got = await this.rpc.transactions(missing);
    for (const [h, info] of got) this.txs.set(h, info);
  }

  tx(hash: string): TxInfo | undefined {
    return this.txs.get(hash.toLowerCase());
  }

  /** The trader of a swap in `hash`: userOp sender for bundles, else tx.from; `reported` when the tx is unknown. */
  traderOf(hash: string, reported?: string): string | null {
    const tx = this.txs.get(hash.toLowerCase());
    if (tx?.to && ENTRY_POINTS.has(tx.to)) {
      const op = this.userOps.get(hash.toLowerCase());
      return op ?? reported ?? tx.from;
    }
    return tx?.from ?? reported?.toLowerCase() ?? null;
  }
}
