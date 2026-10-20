// Write-through of module state to the durable store (live mode):
//
//   accounts  saved at most ACCOUNTS_FLUSH_MS after any mutation (a burst of changes is one write),
//             or at once for changes that must never be lost (registration, 2FA, whitelist,
//             sessions revoked), and on close
//   trading   saved every TRADING_SAVE_EVERY_MS when its serialized form changed, soon after a
//             fill, and on close
//
// World, analytics and market keep using the periodic snapshot.

import type { SqliteStore } from './sqlite';

export const ACCOUNTS_STATE_KEY = 'accounts';
export const TRADING_STATE_KEY = 'trading';
export const ACCOUNTS_FLUSH_MS = 500;
export const TRADING_SAVE_EVERY_MS = 3000;

export interface DurableSources {
  accounts: () => unknown;
  trading: () => unknown;
}

export class DurableSync {
  private accountsTimer: NodeJS.Timeout | null = null;
  private tradingSoon: NodeJS.Timeout | null = null;
  private tradingTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly store: SqliteStore,
    private readonly sources: DurableSources,
  ) {}

  /** A mutation happened: the accounts state is written within ACCOUNTS_FLUSH_MS. */
  accountsChanged(): void {
    if (this.stopped || this.accountsTimer) return;
    this.accountsTimer = setTimeout(() => {
      this.accountsTimer = null;
      this.tryWrite('accounts', () => this.flushAccounts());
    }, ACCOUNTS_FLUSH_MS);
    this.accountsTimer.unref?.();
  }

  /** Write the accounts state now (throws when the write fails, so callers can refuse the change). */
  flushAccounts(): void {
    if (this.accountsTimer) clearTimeout(this.accountsTimer);
    this.accountsTimer = null;
    if (!this.store.isOpen) return;
    this.store.putStateIfChanged(ACCOUNTS_STATE_KEY, this.sources.accounts());
  }

  /** Something in trading changed that should not wait for the next periodic save (a fill). */
  tradingChanged(): void {
    if (this.stopped || this.tradingSoon) return;
    this.tradingSoon = setTimeout(() => {
      this.tradingSoon = null;
      this.tryWrite('trading', () => this.saveTrading());
    }, ACCOUNTS_FLUSH_MS);
    this.tradingSoon.unref?.();
  }

  /** Write the trading state when it differs from the last write; true when written. */
  saveTrading(): boolean {
    if (!this.store.isOpen) return false;
    return this.store.putStateIfChanged(TRADING_STATE_KEY, this.sources.trading());
  }

  /** Start the periodic trading save. */
  start(): void {
    if (this.stopped || this.tradingTimer) return;
    this.tradingTimer = setInterval(() => this.tryWrite('trading', () => this.saveTrading()), TRADING_SAVE_EVERY_MS);
    this.tradingTimer.unref?.();
  }

  /** Stop the timers and write both states one last time (before the store closes). */
  stop(): void {
    this.stopped = true;
    for (const t of [this.accountsTimer, this.tradingSoon]) if (t) clearTimeout(t);
    if (this.tradingTimer) clearInterval(this.tradingTimer);
    this.accountsTimer = this.tradingSoon = this.tradingTimer = null;
    this.tryWrite('accounts', () => this.flushAccounts());
    this.tryWrite('trading', () => this.saveTrading());
  }

  private tryWrite(what: string, write: () => unknown): void {
    try {
      write();
    } catch (err) {
      console.error(`[store] saving ${what} failed`, err instanceof Error ? err.message : err);
    }
  }
}
