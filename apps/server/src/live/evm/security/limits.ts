// Small concurrency / rate / cache primitives for the security checker. Time is
// injected (`now`) so tests are deterministic.

export type Clock = () => number;

/** LRU map with a per-entry expiry and a hard size cap (bounded memory). */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(
    private maxEntries: number,
    private now: Clock = Date.now,
  ) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}

/** Counting semaphore: at most `limit` holders at once, FIFO waiters. */
export class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }

  get pending(): number {
    return this.waiters.length;
  }
}

export interface RateLimitOptions {
  /** Requests allowed per window. */
  perWindow: number;
  windowMs: number;
  /** First backoff after a rate-limit answer; doubles up to maxBackoffMs. */
  backoffMs: number;
  maxBackoffMs: number;
}

/**
 * Token bucket that refills continuously, plus a backoff gate opened by
 * rate-limit answers (HTTP 429, GoPlus code 4029). `tryTake` never waits: the
 * checker skips a provider that is out of budget instead of stalling the check
 * (the report records it and is cached briefly so the next check fills the gap).
 */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private blockedUntil = 0;
  private strikes = 0;
  constructor(
    private opts: RateLimitOptions,
    private now: Clock = Date.now,
  ) {
    this.tokens = opts.perWindow;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    const add = ((t - this.last) / this.opts.windowMs) * this.opts.perWindow;
    this.tokens = Math.min(this.opts.perWindow, this.tokens + add);
    this.last = t;
  }

  /** Takes one request slot; false when out of budget or backing off. */
  tryTake(): boolean {
    if (this.now() < this.blockedUntil) return false;
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Why the gate is closed: the provider rate limited us, or blocked us (e.g. a Cloudflare challenge). */
  lastPenalty: 'rate_limited' | 'blocked' = 'rate_limited';

  /** Records a rate-limit / block answer: empties the bucket and backs off exponentially. */
  penalize(reason: 'rate_limited' | 'blocked' = 'rate_limited'): void {
    this.lastPenalty = reason;
    this.strikes++;
    const ms = Math.min(this.opts.maxBackoffMs, this.opts.backoffMs * 2 ** (this.strikes - 1));
    this.blockedUntil = this.now() + ms;
    this.tokens = 0;
  }

  /** Records a successful answer (resets the backoff ladder). */
  succeed(): void {
    this.strikes = 0;
  }

  /** ms until the backoff gate opens (0 when open). */
  get backoffRemainingMs(): number {
    return Math.max(0, this.blockedUntil - this.now());
  }
}

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/** Rejects with TimeoutError after `ms` (the underlying work is not cancelled unless it honours `signal`). */
export function withTimeout<T>(label: string, ms: number, work: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(parent?.reason);
  parent?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new TimeoutError(label, ms));
    }, ms);
  });
  return Promise.race([work(ctl.signal), timeout]).finally(() => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onAbort);
  });
}
