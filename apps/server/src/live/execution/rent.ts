// Rent-exempt minimums as the cluster charges them now. The minimum for an
// account of N data bytes is (128 + N) x lamports-per-byte, and the
// per-byte rate is a cluster parameter that mainnet has lowered (October 2026:
// 5080 lamports per byte, a 0-byte account 650,240, an SPL token account
// 1,488,440, a Token-2022 account 1,513,840; it was 6960 per byte before). It is
// read once an hour from getMinimumBalanceForRentExemption(0); until the first
// answer the pre-reduction rate is used, which never under-reserves, and an RPC
// failure keeps the last known rate.

import type { Connection } from '@solana/web3.js';

/** Bytes every account pays rent for on top of its data. */
export const ACCOUNT_STORAGE_OVERHEAD = 128n;
/** Lamports per byte before mainnet lowered rent (an upper bound of the current rate). */
export const LEGACY_LAMPORTS_PER_BYTE = 6960n;
/** Data sizes of the accounts a swap may create. */
export const ACCOUNT_SIZE = {
  system: 0,
  /** SPL Token account (also the wrapped-SOL account). */
  token: 165,
  /** Token-2022 account with the ImmutableOwner extension (what the ATA program creates). */
  token2022: 170,
  /** pump.fun / pump-amm user volume accumulator. */
  volumeAccumulator: 137,
} as const;

const REFRESH_MS = 60 * 60_000;

export interface RentRates {
  /** Lamports per byte (data + overhead) for rent exemption. */
  lamportsPerByte: bigint;
  /** Whether the rate came from the cluster (false: the conservative fallback). */
  live: boolean;
}

/** The rent-exempt minimum of an account with `bytes` of data at `lamportsPerByte`. */
export function rentExemptMinimum(bytes: number, lamportsPerByte: bigint): bigint {
  return (ACCOUNT_STORAGE_OVERHEAD + BigInt(bytes)) * lamportsPerByte;
}

/** Caches the cluster's rent rate (one RPC call an hour at most). */
export class RentSchedule {
  private rate: { lamportsPerByte: bigint; at: number } | null = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  /** The current rate; refreshes it when stale (an RPC failure keeps the last known or fallback rate). */
  async rates(connection: Pick<Connection, 'getMinimumBalanceForRentExemption'>): Promise<RentRates> {
    if (!this.rate || this.now() - this.rate.at >= REFRESH_MS) {
      this.pending ??= this.refresh(connection).finally(() => {
        this.pending = null;
      });
      await this.pending;
    }
    return this.rate ? { lamportsPerByte: this.rate.lamportsPerByte, live: true } : { lamportsPerByte: LEGACY_LAMPORTS_PER_BYTE, live: false };
  }

  private async refresh(connection: Pick<Connection, 'getMinimumBalanceForRentExemption'>): Promise<void> {
    try {
      if (typeof connection.getMinimumBalanceForRentExemption !== 'function') return;
      const min = BigInt(await connection.getMinimumBalanceForRentExemption(0, 'confirmed'));
      const perByte = min / ACCOUNT_STORAGE_OVERHEAD;
      // Sanity: a positive whole rate (anything else is a bad answer, not a rate).
      if (perByte > 0n && perByte * ACCOUNT_STORAGE_OVERHEAD === min) this.rate = { lamportsPerByte: perByte, at: this.now() };
    } catch {
      // keep the last known rate (or the fallback)
    }
  }
}
