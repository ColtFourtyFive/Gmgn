// Rent-exempt minimums as the cluster states them (getMinimumBalanceForRentExemption), cached per
// connection. The rate is a cluster parameter, not a constant: mainnet's Rent sysvar moved to
// 5080 lamports per byte in 2026 (a plain account 650,240 lamports, an SPL token account
// 1,488,440, a Token-2022 associated account 1,513,840), down from 6960 (890,880 / 2,039,280).
// When the RPC cannot answer, the old rate stands in: it is higher, so a check made with it only
// asks for more SOL than needed, never less.

import type { Connection } from '@solana/web3.js';

/** Bytes the runtime charges every account for on top of its data. */
const ACCOUNT_STORAGE_OVERHEAD = 128n;
/** The pre-2026 rate (3480 lamports per byte-year, 2 years): an upper bound of today's. */
const FALLBACK_LAMPORTS_PER_BYTE = 6960n;
const TTL_MS = 60 * 60_000;

const cache = new WeakMap<object, Map<number, { lamports: bigint; at: number }>>();

/** The upper-bound estimate used when the cluster cannot be asked. */
export const fallbackRentExempt = (bytes: number): bigint => (BigInt(bytes) + ACCOUNT_STORAGE_OVERHEAD) * FALLBACK_LAMPORTS_PER_BYTE;

/** Lamports an account of `bytes` data bytes needs to be rent-exempt. */
export async function rentExemptLamports(connection: Connection, bytes: number, now: number = Date.now()): Promise<bigint> {
  let byConnection = cache.get(connection);
  const hit = byConnection?.get(bytes);
  if (hit && now - hit.at < TTL_MS) return hit.lamports;
  try {
    const lamports = await connection.getMinimumBalanceForRentExemption(bytes, 'confirmed');
    if (!Number.isSafeInteger(lamports) || lamports <= 0) throw new Error('unexpected rent answer');
    if (!byConnection) cache.set(connection, (byConnection = new Map()));
    byConnection.set(bytes, { lamports: BigInt(lamports), at: now });
    return BigInt(lamports);
  } catch {
    return fallbackRentExempt(bytes);
  }
}
