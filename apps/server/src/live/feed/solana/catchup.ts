// Gap catch-up: after the log stream dropped, the transactions of a few
// addresses (the tracked mints that matter most: every pump curve and PumpSwap
// trade lists its mint) within the missed slots, read back with
// getSignaturesForAddress + getTransaction and replayed through the same decoder.
// Read-only and bounded: a capped number of addresses, signatures and
// transactions per gap, every call through the caller's RPC budget, and gaps
// longer than `maxSlots` skipped (the stream's next trade carries the curve's or
// pool's full state anyway: prices heal by themselves, only trade history and
// holder detail of the gap are lost).

import { PublicKey, type Connection } from '@solana/web3.js';
import { MAX_TX_VERSION } from '../../wallets/deposits';
import type { LogNotification, SlotGap } from './client';
import { decodeInnerEvents } from './events';

export interface CatchUpOptions {
  connection: Connection;
  /** Runs one RPC call under the caller's budget. */
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Already delivered by the stream (skipped). */
  seen: (signature: string) => boolean;
  /** Signatures per getSignaturesForAddress call (newest first). */
  signaturesPerAddress?: number;
  /** Calls per address, paging back until the gap's first slot (a busy token signs more than one page meanwhile). */
  maxPages?: number;
  /** Transactions read per gap in all. */
  maxTransactions?: number;
}

export interface CatchUpResult {
  transactions: LogNotification[];
  /** Signatures in the gap, not yet seen, across the addresses. */
  missing: number;
  /** Signatures beyond maxTransactions (not read). */
  skipped: number;
  /** An address had more signatures since the gap than one read returns (older ones not reached). */
  incomplete: number;
  errors: number;
}

/** Read the successful transactions of `addresses` within the gap's slots, oldest first. */
export async function catchUpGap(gap: Pick<SlotGap, 'fromSlot' | 'toSlot'>, addresses: string[], opts: CatchUpOptions): Promise<CatchUpResult> {
  const perAddress = Math.max(1, Math.min(1000, opts.signaturesPerAddress ?? 100));
  const maxPages = Math.max(1, opts.maxPages ?? 3);
  const maxTx = Math.max(0, opts.maxTransactions ?? 150);
  const out: CatchUpResult = { transactions: [], missing: 0, skipped: 0, incomplete: 0, errors: 0 };
  const wanted = new Map<string, number>();
  for (const address of addresses) {
    let key: PublicKey;
    try {
      key = new PublicKey(address);
    } catch {
      continue;
    }
    // Newest first: page back (before = the oldest signature so far) until the page reaches the gap's start.
    let before: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      let sigs: { signature: string; slot: number; err: unknown }[];
      try {
        sigs = await opts.run(() => opts.connection.getSignaturesForAddress(key, { limit: perAddress, ...(before ? { before } : {}) }, 'confirmed'));
      } catch {
        out.errors++;
        break;
      }
      for (const s of sigs) {
        if (s.slot < gap.fromSlot || s.slot > gap.toSlot || s.err || wanted.has(s.signature) || opts.seen(s.signature)) continue;
        wanted.set(s.signature, s.slot);
      }
      const oldest = sigs[sigs.length - 1];
      if (sigs.length < perAddress || !oldest || oldest.slot < gap.fromSlot) break;
      before = oldest.signature;
      if (page === maxPages - 1) out.incomplete++;
    }
  }
  out.missing = wanted.size;
  const ordered = [...wanted].sort((a, b) => a[1] - b[1]);
  out.skipped = Math.max(0, ordered.length - maxTx);
  for (const [signature] of ordered.slice(0, maxTx)) {
    try {
      const tx = await readTransactionEvents(opts.connection, signature, opts.run);
      if (tx) out.transactions.push(tx);
    } catch {
      out.errors++;
    }
  }
  return out;
}

/**
 * A successful transaction's pump / pump-amm events from getTransaction: decoded from its event CPIs
 * (inner instructions, never truncated), with its logs. Null when it failed or is not readable.
 */
export async function readTransactionEvents(connection: Connection, signature: string, run: <T>(fn: () => Promise<T>) => Promise<T>): Promise<LogNotification | null> {
  const tx = await run(() => connection.getTransaction(signature, { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' }));
  if (!tx?.meta || tx.meta.err) return null;
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? undefined });
  const decoded = decodeInnerEvents(tx.meta.innerInstructions ?? [], (i) => keys.get(i)?.toBase58());
  return { signature, slot: tx.slot, logs: tx.meta.logMessages ?? [], decoded };
}
