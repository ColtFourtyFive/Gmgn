// Request budget for a metered upstream (the Solana RPC): a token bucket of
// `rps` requests per second with a small burst, a cap on requests in flight,
// and bounded queues. User-facing work (a token page loading an unknown mint)
// goes first; background work (security refreshes) waits behind it and is
// refused once its queue is full instead of piling up.

export type Priority = 'high' | 'low';

/** The low-priority queue is full (or the budget closed): the caller should retry on its next pass. */
export class BudgetExceeded extends Error {}

interface Job {
  run: () => void;
  reject: (err: Error) => void;
}

export interface BudgetOptions {
  /** Requests per second (sustained). */
  rps: number;
  /** Tokens the bucket holds (burst); defaults to rps. */
  burst?: number;
  maxConcurrent?: number;
  /** Queue caps per priority. */
  maxHigh?: number;
  maxLow?: number;
  now?: () => number;
}

export class RequestBudget {
  private readonly rps: number;
  private readonly burst: number;
  private readonly maxConcurrent: number;
  private readonly maxHigh: number;
  private readonly maxLow: number;
  private readonly now: () => number;
  private tokens: number;
  private refilledAt: number;
  private active = 0;
  private high: Job[] = [];
  private low: Job[] = [];
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  /** Requests started / refused (diagnostics). */
  started = 0;
  refused = 0;

  constructor(opts: BudgetOptions) {
    this.rps = Math.max(0.1, opts.rps);
    this.burst = Math.max(1, opts.burst ?? Math.ceil(this.rps));
    this.maxConcurrent = Math.max(1, opts.maxConcurrent ?? 8);
    this.maxHigh = opts.maxHigh ?? 200;
    this.maxLow = opts.maxLow ?? 500;
    this.now = opts.now ?? Date.now;
    this.tokens = this.burst;
    this.refilledAt = this.now();
  }

  get queued(): number {
    return this.high.length + this.low.length;
  }

  /** Run `fn` when the budget allows. Rejects with BudgetExceeded when its queue is full. */
  run<T>(fn: () => Promise<T>, priority: Priority = 'low'): Promise<T> {
    if (this.closed) return Promise.reject(new BudgetExceeded('budget closed'));
    const queue = priority === 'high' ? this.high : this.low;
    if (queue.length >= (priority === 'high' ? this.maxHigh : this.maxLow)) {
      this.refused++;
      return Promise.reject(new BudgetExceeded(`${priority}-priority queue full`));
    }
    return new Promise<T>((resolve, reject) => {
      queue.push({
        run: () => {
          this.active++;
          this.started++;
          fn()
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              this.pump();
            });
        },
        reject,
      });
      this.pump();
    });
  }

  /** Reject everything queued (shutdown). */
  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const job of [...this.high, ...this.low]) job.reject(new BudgetExceeded('budget closed'));
    this.high = [];
    this.low = [];
  }

  private refill(): void {
    const now = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.refilledAt) / 1000) * this.rps);
    this.refilledAt = now;
  }

  private pump(): void {
    if (this.closed) return;
    this.refill();
    while (this.active < this.maxConcurrent && this.tokens >= 1) {
      const job = this.high.shift() ?? this.low.shift();
      if (!job) return;
      this.tokens -= 1;
      job.run();
    }
    if (this.queued > 0 && this.active < this.maxConcurrent && !this.timer) {
      const waitMs = Math.max(5, Math.ceil(((1 - this.tokens) / this.rps) * 1000));
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, waitMs);
      this.timer.unref?.();
    }
  }
}
