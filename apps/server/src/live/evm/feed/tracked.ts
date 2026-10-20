// The tokens a chain's feed follows trades for: capped, least recently active
// first out. Tokens pinned by World pin sources (open orders, alerts, ...) are
// never evicted; evicted tokens can come back (a new trade on their curve, a
// pasted address).

export interface TrackedEntry {
  token: string;
  /** Venue that follows the token's trading (its curve's launchpad or its pool's DEX). */
  venue: string;
  addedAt: number;
  lastActiveAt: number;
}

export class TrackedTokens {
  /** Insertion order = recency: touch() moves an entry to the end. */
  private readonly entries = new Map<string, TrackedEntry>();
  evictions = 0;

  constructor(
    readonly cap: number,
    private readonly pinned: () => Set<string>,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  has(token: string): boolean {
    return this.entries.has(token);
  }

  get(token: string): TrackedEntry | undefined {
    return this.entries.get(token);
  }

  /** Track (or refresh) a token; returns the tokens evicted to stay under the cap. */
  add(token: string, venue: string, at: number): string[] {
    const known = this.entries.get(token);
    this.entries.delete(token);
    this.entries.set(token, { token, venue: known?.venue ?? venue, addedAt: known?.addedAt ?? at, lastActiveAt: Math.max(at, known?.lastActiveAt ?? 0) });
    return this.evictOverCap(token);
  }

  /** A trade or event on the token: it becomes the most recently active. */
  touch(token: string, at: number): void {
    const e = this.entries.get(token);
    if (!e) return;
    e.lastActiveAt = Math.max(e.lastActiveAt, at);
    this.entries.delete(token);
    this.entries.set(token, e);
  }

  remove(token: string): void {
    this.entries.delete(token);
  }

  tokens(): IterableIterator<string> {
    return this.entries.keys();
  }

  /** Drop least recently active unpinned tokens beyond the cap (never `keep`). */
  evictOverCap(keep?: string): string[] {
    if (this.entries.size <= this.cap) return [];
    const pins = this.pinned();
    const out: string[] = [];
    for (const token of this.entries.keys()) {
      if (this.entries.size - out.length <= this.cap) break;
      if (token === keep || pins.has(token)) continue;
      out.push(token);
    }
    for (const t of out) this.entries.delete(t);
    this.evictions += out.length;
    return out;
  }
}
