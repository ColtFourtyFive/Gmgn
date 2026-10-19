// Bounded ring buffer. Grows lazily up to `cap` (so thousands of idle
// wallets do not pre-allocate slots), then overwrites the oldest entry.
// Index 0 of `at()` is the newest element.

export class Ring<T> {
  private buf: T[] = [];
  /** Index of the oldest element once the buffer is full. */
  private head = 0;

  constructor(readonly cap: number) {}

  get size(): number {
    return this.buf.length;
  }

  /** Append; returns the evicted element when full. */
  push(v: T): T | undefined {
    if (this.buf.length < this.cap) {
      this.buf.push(v);
      return undefined;
    }
    const old = this.buf[this.head];
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.cap;
    return old;
  }

  /** i-th newest element (0 = newest). */
  at(i: number): T | undefined {
    const n = this.buf.length;
    if (i < 0 || i >= n) return undefined;
    return this.buf[(this.head - 1 - i + 2 * n) % n];
  }

  newest(): T | undefined {
    return this.at(0);
  }

  /** Oldest first. */
  toArray(): T[] {
    const n = this.buf.length;
    const out = new Array<T>(n);
    for (let i = 0; i < n; i++) out[i] = this.buf[(this.head + i) % n];
    return out;
  }

  clear(): void {
    this.buf = [];
    this.head = 0;
  }

  /** Build from an oldest-first array (keeps the newest `cap`). */
  static from<T>(items: readonly T[], cap: number): Ring<T> {
    const r = new Ring<T>(cap);
    const start = Math.max(0, items.length - cap);
    for (let i = start; i < items.length; i++) r.push(items[i]);
    return r;
  }
}
