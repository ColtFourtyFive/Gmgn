// Events per second over a sliding window of one-second buckets (diagnostics).

export class RateMeter {
  private readonly counts: Float64Array;
  private readonly seconds: Float64Array;

  constructor(private readonly windowSec = 60) {
    this.counts = new Float64Array(windowSec);
    this.seconds = new Float64Array(windowSec).fill(-1);
  }

  add(n: number, now: number): void {
    const sec = Math.floor(now / 1000);
    const i = sec % this.windowSec;
    if (this.seconds[i] !== sec) {
      this.seconds[i] = sec;
      this.counts[i] = 0;
    }
    this.counts[i] += n;
  }

  /** Average per second over the last `overSec` whole seconds (the current, partial one excluded). */
  perSecond(now: number, overSec = 10): number {
    const span = Math.max(1, Math.min(overSec, this.windowSec - 1));
    const cur = Math.floor(now / 1000);
    let sum = 0;
    for (let s = cur - span; s < cur; s++) {
      const i = ((s % this.windowSec) + this.windowSec) % this.windowSec;
      if (this.seconds[i] === s) sum += this.counts[i];
    }
    return sum / span;
  }
}

/** Rate meters by name (event types). */
export class RateMeters {
  private readonly meters = new Map<string, RateMeter>();

  add(name: string, n: number, now: number): void {
    let m = this.meters.get(name);
    if (!m) this.meters.set(name, (m = new RateMeter()));
    m.add(n, now);
  }

  /** Per-second rates (rounded to 0.1), names without recent events left out. */
  snapshot(now: number, overSec = 10): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, m] of this.meters) {
      const r = Math.round(m.perSecond(now, overSec) * 10) / 10;
      if (r > 0) out[name] = r;
    }
    return out;
  }
}
