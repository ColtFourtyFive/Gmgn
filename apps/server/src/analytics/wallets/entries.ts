// Entry-quality tracking ("did the token run 2x after this wallet's entry?").
// Each wallet's first buy of a token registers a pending entry in a per-token
// min-heap keyed by its target market cap (2x the entry). Every trade pops the
// entries its market cap reached, so the cost per trade is O(1) when nothing
// hits and O(log n) per hit. Selection skill measured this way is independent
// of exit timing, which is what separates smart money from lucky flippers.

export const HIT_MULTIPLE = 2;

export interface PendingEntry {
  /** Market cap that counts as a hit. */
  target: number;
  wallet: string;
  /** Entry (first buy) time, used to credit the right stats bucket. */
  at: number;
}

function up(h: PendingEntry[], i: number): void {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].target <= h[i].target) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}

function down(h: PendingEntry[], i: number): void {
  const n = h.length;
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let m = i;
    if (l < n && h[l].target < h[m].target) m = l;
    if (r < n && h[r].target < h[m].target) m = r;
    if (m === i) return;
    [h[m], h[i]] = [h[i], h[m]];
    i = m;
  }
}

export class EntryWatch {
  private heaps = new Map<string, PendingEntry[]>();

  get pending(): number {
    let n = 0;
    for (const h of this.heaps.values()) n += h.length;
    return n;
  }

  /** Register a first buy at `entryMcap` (execution price x supply). */
  add(token: string, wallet: string, at: number, entryMcap: number): void {
    if (!(entryMcap > 0)) return;
    let h = this.heaps.get(token);
    if (!h) this.heaps.set(token, (h = []));
    h.push({ target: entryMcap * HIT_MULTIPLE, wallet, at });
    up(h, h.length - 1);
  }

  /** A trade printed `mcap` on `token`: call `onHit` for every pending entry it reached. */
  onPrice(token: string, mcap: number, onHit: (e: PendingEntry) => void): void {
    const h = this.heaps.get(token);
    if (!h || h.length === 0 || h[0].target > mcap) return;
    while (h.length && h[0].target <= mcap) {
      const top = h[0];
      const last = h.pop()!;
      if (h.length) {
        h[0] = last;
        down(h, 0);
      }
      onHit(top);
    }
    if (h.length === 0) this.heaps.delete(token);
  }

  /** Drop entries older than `minAt` and heaps of tokens that no longer exist. */
  prune(minAt: number, exists: (token: string) => boolean): void {
    for (const [token, h] of this.heaps) {
      if (!exists(token)) {
        this.heaps.delete(token);
        continue;
      }
      if (h.every((e) => e.at >= minAt)) continue;
      const kept = h.filter((e) => e.at >= minAt);
      if (kept.length === 0) {
        this.heaps.delete(token);
        continue;
      }
      for (let i = (kept.length >> 1) - 1; i >= 0; i--) down(kept, i);
      this.heaps.set(token, kept);
    }
  }

  dump(): [string, PendingEntry[]][] {
    return [...this.heaps.entries()];
  }

  load(d: [string, PendingEntry[]][] | undefined): void {
    this.heaps.clear();
    for (const [k, v] of d ?? []) if (Array.isArray(v) && v.length) this.heaps.set(k, v);
  }
}
