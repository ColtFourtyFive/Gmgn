// Bounded caches for the EVM feed: every per-transaction / per-block / per-log
// memo is capped so a long-running feed keeps a flat memory profile.

/** A Map that keeps at most `cap` entries, evicting the least recently used. */
export class LruMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(readonly cap: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      // refresh recency
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  /** Read without refreshing recency. */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.cap) this.map.delete(this.map.keys().next().value as K);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}

/** A Set with a capacity: the oldest insertions fall out first (FIFO). */
export class BoundedSet<K> {
  private readonly set = new Set<K>();

  constructor(readonly cap: number) {}

  get size(): number {
    return this.set.size;
  }

  has(key: K): boolean {
    return this.set.has(key);
  }

  /** Adds `key`; false when it was already present. */
  add(key: K): boolean {
    if (this.set.has(key)) return false;
    this.set.add(key);
    while (this.set.size > this.cap) this.set.delete(this.set.values().next().value as K);
    return true;
  }

  delete(key: K): boolean {
    return this.set.delete(key);
  }
}
