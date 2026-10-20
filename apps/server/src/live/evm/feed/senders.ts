// Who made a trade. Venues report the contract that called them (routers,
// aggregators, launch-and-buy helpers), so the trader is the transaction's
// sender. For ERC-4337 bundles (tx.to is an EntryPoint, tx.from the bundler)
// it is the smart account whose user operation contains the swap: the
// EntryPoint emits each op's UserOperationEvent right after executing it, so a
// swap belongs to the first UserOperationEvent that follows it in the receipt.

import type { Hex } from 'viem';
import { ENTRY_POINTS, topicAddress, TOPIC } from './abi';
import { LruMap } from './lru';
import type { EvmRpc, RawLog, TxInfo } from './rpc';

const TX_CACHE = 20_000;
const BUNDLE_CACHE = 5_000;

export class TxSenders {
  private readonly txs = new LruMap<string, TxInfo>(TX_CACHE);
  /** Bundle tx hash -> its user operations' (log index, sender), in order. */
  private readonly bundles = new LruMap<string, { logIndex: number; sender: string }[]>(BUNDLE_CACHE);
  lookups = 0;

  constructor(private readonly rpc: EvmRpc) {}

  /** Take UserOperationEvent logs (from bundle receipts). */
  noteLogs(logs: RawLog[]): void {
    const byTx = new Map<string, { logIndex: number; sender: string }[]>();
    for (const l of logs) {
      if (l.topics[0] !== TOPIC.userOperation || !ENTRY_POINTS.has(l.address) || l.topics.length < 3) continue;
      const list = byTx.get(l.transactionHash) ?? [];
      list.push({ logIndex: l.logIndex, sender: topicAddress(l.topics[2]) });
      byTx.set(l.transactionHash, list);
    }
    for (const [h, ops] of byTx) this.bundles.set(h, ops.sort((a, b) => a.logIndex - b.logIndex));
  }

  /** Fetch the senders of these transactions (batched; cached), and the user operations of bundles among them. */
  async prepare(hashes: Iterable<Hex>): Promise<void> {
    const all = [...new Set([...hashes].map((h) => h.toLowerCase() as Hex))];
    const missing = all.filter((h) => !this.txs.has(h));
    if (missing.length) {
      this.lookups += missing.length;
      const got = await this.rpc.transactions(missing);
      for (const [h, info] of got) this.txs.set(h, info);
    }
    const bundles = all.filter((h) => {
      const to = this.txs.peek(h)?.to;
      return !!to && ENTRY_POINTS.has(to) && !this.bundles.has(h);
    });
    if (bundles.length) {
      this.lookups += bundles.length;
      const receipts = await this.rpc.receiptLogs(bundles);
      for (const logs of receipts.values()) this.noteLogs(logs);
    }
  }

  tx(hash: string): TxInfo | undefined {
    return this.txs.get(hash.toLowerCase());
  }

  /**
   * The trader of the swap logged at `logIndex` in `hash`: the user operation's
   * sender in bundles, else tx.from; `reported` (the venue's account) when the
   * transaction is unknown.
   */
  traderOf(hash: string, logIndex: number, reported?: string): string | null {
    const h = hash.toLowerCase();
    const tx = this.txs.get(h);
    if (tx?.to && ENTRY_POINTS.has(tx.to)) {
      const op = this.bundles.get(h)?.find((o) => o.logIndex > logIndex);
      return op?.sender ?? reported?.toLowerCase() ?? tx.from;
    }
    return tx?.from ?? reported?.toLowerCase() ?? null;
  }
}
