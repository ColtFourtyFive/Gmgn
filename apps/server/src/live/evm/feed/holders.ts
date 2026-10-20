// Exact token balances from Transfer logs, for tokens followed since their
// launch (their whole transfer history seen). A trade then carries the
// trader's balance after its transaction (walletTokenBalance), so positions
// stay right through transfers between wallets, airdrops and fee-on-transfer
// taxes the trade events never mention. Bounded: a token whose holder map
// outgrows its cap stops being followed here (its trades fall back to the
// ledger's own bookkeeping), and past `capacity` tokens the one whose
// transfers went quiet longest makes room for a new launch.

import { ZERO_ADDRESS } from './abi';

const MAX_WALLETS_PER_TOKEN = 20_000;

export interface TransferMove {
  token: string;
  from: string;
  to: string;
  value: bigint;
  txHash: string;
}

export class HolderBook {
  private readonly books = new Map<string, Map<string, bigint>>();
  /** Per window: balance after each transaction, "tx|token|wallet" -> raw balance. */
  private readonly afterTx = new Map<string, bigint>();
  dropped = 0;
  /** Tokens followed at most (least recently active dropped first). */
  capacity = 3_000;

  get size(): number {
    return this.books.size;
  }

  has(token: string): boolean {
    return this.books.has(token);
  }

  tokens(): IterableIterator<string> {
    return this.books.keys();
  }

  /** Start following a token from its first transfer (its mint). */
  begin(token: string): void {
    if (this.books.has(token) || this.capacity <= 0) return;
    this.trim(this.capacity - 1);
    this.books.set(token, new Map());
  }

  /** Drop the least recently active tokens down to `max`. */
  trim(max = this.capacity): void {
    for (const token of this.books.keys()) {
      if (this.books.size <= max) break;
      this.drop(token);
    }
  }

  drop(token: string): void {
    if (this.books.delete(token)) this.dropped++;
  }

  balanceOf(token: string, wallet: string): bigint | undefined {
    return this.books.get(token)?.get(wallet) ?? (this.books.has(token) ? 0n : undefined);
  }

  /**
   * Before a window is applied: each wallet's balance at the end of every
   * transaction of the window (trade events can precede their own transfer).
   */
  plan(moves: TransferMove[]): void {
    this.afterTx.clear();
    const staged = new Map<string, bigint>();
    const bal = (token: string, wallet: string) => staged.get(`${token}|${wallet}`) ?? this.balanceOf(token, wallet) ?? 0n;
    for (const m of moves) {
      if (!this.books.has(m.token)) continue;
      if (m.from !== ZERO_ADDRESS) {
        const b = bal(m.token, m.from) - m.value;
        staged.set(`${m.token}|${m.from}`, b);
        this.afterTx.set(`${m.txHash}|${m.token}|${m.from}`, b);
      }
      if (m.to !== ZERO_ADDRESS) {
        const b = bal(m.token, m.to) + m.value;
        staged.set(`${m.token}|${m.to}`, b);
        this.afterTx.set(`${m.txHash}|${m.token}|${m.to}`, b);
      }
    }
  }

  /** The wallet's balance once `txHash` is done (when the token is followed and the wallet moved in it). */
  balanceAfter(txHash: string, token: string, wallet: string): bigint | undefined {
    return this.afterTx.get(`${txHash}|${token}|${wallet}`);
  }

  /** Apply one transfer (in chain order). */
  apply(m: TransferMove): void {
    const book = this.books.get(m.token);
    if (!book) return;
    // Most recently active last (Map order is the eviction order).
    this.books.delete(m.token);
    this.books.set(m.token, book);
    if (m.from !== ZERO_ADDRESS) {
      const b = (book.get(m.from) ?? 0n) - m.value;
      if (b > 0n) book.set(m.from, b);
      else book.delete(m.from);
    }
    if (m.to !== ZERO_ADDRESS && m.value > 0n) book.set(m.to, (book.get(m.to) ?? 0n) + m.value);
    if (book.size > MAX_WALLETS_PER_TOKEN) this.drop(m.token);
  }

  endWindow(): void {
    this.afterTx.clear();
  }
}
