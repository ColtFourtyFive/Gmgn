// Which tokens' trades the feed streams. New launches and tokens someone opens
// are tracked; the set is capped (config.feed.maxTrackedTokens) by evicting the
// least recently active, and tokens without a trade for `idleMs` are dropped.
// Protected tokens are never dropped, whatever the cap: held by a user wallet,
// on a watchlist, referenced by open orders or alerts, or open in a client
// (token channel subscribers). The protected set is refreshed by the market's
// periodic pass; `isProtected` adds checks that must be live (channel subscribers).

export interface TokenStream {
  subscribeTokenTrades(mints: Iterable<string>): void;
  unsubscribeTokenTrades(mints: Iterable<string>): void;
}

export interface TrackerOptions {
  max: number;
  idleMs: number;
  stream: TokenStream;
  isProtected?: (mint: string) => boolean;
}

export class TrackedTokens {
  /** mint -> last activity (ms). Map order = least recently active first (touch re-inserts). */
  private readonly active = new Map<string, number>();
  private protectedSet: ReadonlySet<string> = new Set();
  evicted = 0;
  idled = 0;

  constructor(private readonly opts: TrackerOptions) {}

  get size(): number {
    return this.active.size;
  }

  has(mint: string): boolean {
    return this.active.has(mint);
  }

  /** Tracked mints with their last activity, least recent first. */
  entries(): [string, number][] {
    return [...this.active];
  }

  setProtected(set: ReadonlySet<string>): void {
    this.protectedSet = set;
  }

  isProtected(mint: string): boolean {
    return this.protectedSet.has(mint) || (this.opts.isProtected?.(mint) ?? false);
  }

  /** Record activity (a launch, a trade, a page view); starts streaming a new mint. True when newly tracked. */
  touch(mint: string, at: number): boolean {
    const prev = this.active.get(mint);
    const isNew = prev === undefined;
    this.active.delete(mint);
    this.active.set(mint, Math.max(at, prev ?? at));
    if (isNew) {
      this.opts.stream.subscribeTokenTrades([mint]);
      this.enforceCap(mint);
    }
    return isNew;
  }

  /** Stop streaming a mint (its token left the World). */
  drop(mint: string): void {
    if (this.active.delete(mint)) this.opts.stream.unsubscribeTokenTrades([mint]);
  }

  /** Drop idle tokens (no activity for idleMs) and keep the cap; protected tokens stay. Returns the dropped mints. */
  sweep(now: number): string[] {
    const cutoff = now - this.opts.idleMs;
    const removed: string[] = [];
    for (const [mint, at] of this.active) {
      if (at > cutoff) break; // the rest are more recent
      if (this.isProtected(mint)) continue;
      removed.push(mint);
    }
    for (const m of removed) this.active.delete(m);
    this.idled += removed.length;
    if (removed.length) this.opts.stream.unsubscribeTokenTrades(removed);
    return [...removed, ...this.enforceCap()];
  }

  /** Evict the least recently active unprotected mints beyond the cap. */
  private enforceCap(keep?: string): string[] {
    let excess = this.active.size - this.opts.max;
    if (excess <= 0) return [];
    const removed: string[] = [];
    for (const mint of this.active.keys()) {
      if (excess <= 0) break;
      if (mint === keep || this.isProtected(mint)) continue;
      removed.push(mint);
      excess--;
    }
    for (const m of removed) this.active.delete(m);
    this.evicted += removed.length;
    if (removed.length) this.opts.stream.unsubscribeTokenTrades(removed);
    return removed;
  }

  /** Re-track mints saved in a snapshot (oldest activity first). */
  restore(entries: [string, number][]): void {
    const sorted = entries.filter(([m, at]) => typeof m === 'string' && Number.isFinite(at)).sort((a, b) => a[1] - b[1]);
    for (const [mint, at] of sorted) {
      this.active.delete(mint);
      this.active.set(mint, at);
    }
    if (sorted.length) this.opts.stream.subscribeTokenTrades(sorted.map(([m]) => m));
    this.enforceCap();
  }
}
