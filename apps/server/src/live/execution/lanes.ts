// Per-account send lanes. Everything that moves an embedded wallet's funds
// (swaps, withdrawals) prepares, signs and sends one transaction at a time per
// account, so two requests never both pass the same balance check. Lamports a
// sent transaction may still spend stay committed until it confirms or
// expires, and every confirmed change bumps the account's version so a balance
// read that raced it is not applied over the newer state.

export class AccountLanes {
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly committedLamports = new Map<string, bigint>();
  private readonly versions = new Map<string, number>();
  private readonly running = new Map<string, number>();

  /** Run `fn` after every earlier task of the account settled (whatever their outcome). */
  run<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(accountId) ?? Promise.resolve();
    this.running.set(accountId, (this.running.get(accountId) ?? 0) + 1);
    const next = prev.then(fn, fn);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(accountId, tail);
    void tail.then(() => {
      const left = (this.running.get(accountId) ?? 1) - 1;
      if (left <= 0) this.running.delete(accountId);
      else this.running.set(accountId, left);
      if (this.tails.get(accountId) === tail) this.tails.delete(accountId);
    });
    return next;
  }

  /** Hold lamports a sent transaction may still spend; the returned release is idempotent. */
  commit(accountId: string, lamports: bigint): () => void {
    this.committedLamports.set(accountId, this.committed(accountId) + lamports);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      const left = this.committed(accountId) - lamports;
      if (left > 0n) this.committedLamports.set(accountId, left);
      else this.committedLamports.delete(accountId);
    };
  }

  committed(accountId: string): bigint {
    return this.committedLamports.get(accountId) ?? 0n;
  }

  /** Whether the account has a task queued or running, or funds committed to an unconfirmed transaction. */
  busy(accountId: string): boolean {
    return (this.running.get(accountId) ?? 0) > 0 || this.committed(accountId) > 0n;
  }

  /** The account's balances changed on-chain through one of our transactions. */
  touch(accountId: string): void {
    this.versions.set(accountId, this.version(accountId) + 1);
  }

  version(accountId: string): number {
    return this.versions.get(accountId) ?? 0;
  }
}

const registry = new WeakMap<object, AccountLanes>();

/** The lanes shared by every module of one app (keyed by its live services). */
export function lanesFor(owner: object): AccountLanes {
  let lanes = registry.get(owner);
  if (!lanes) registry.set(owner, (lanes = new AccountLanes()));
  return lanes;
}
