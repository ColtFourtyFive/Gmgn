// Drives the simulation clock. Modules register tickers that run every tick
// (or every N ms of sim time). In live mode the clock follows wall time; in
// warmup mode it fast-forwards history so lists, charts and wallet stats are
// populated the moment the server starts.

import type { World } from './world';

export interface Ticker {
  name: string;
  /** Minimum sim-time between runs (ms). 0 = every tick. */
  everyMs: number;
  /** Run during warmup fast-forward too (market dynamics: yes; user orders/alerts: no). */
  duringWarmup: boolean;
  fn: (dtMs: number) => void;
  lastRun: number;
}

export interface EngineOptions {
  /** Live tick interval in wall-clock ms. */
  tickMs?: number;
}

export class Engine {
  readonly world: World;
  readonly tickMs: number;
  /** True while fast-forwarding history; side-effecting user modules should skip. */
  warming = false;
  private tickers: Ticker[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastWall = 0;
  /** Recent trades-per-second estimate. */
  tps = 0;
  private tpsWindow: { t: number; n: number }[] = [];
  tickCount = 0;
  /** Wall time spent in the last tick (ms), for diagnostics. */
  lastTickCostMs = 0;

  constructor(world: World, opts: EngineOptions = {}) {
    this.world = world;
    this.tickMs = opts.tickMs ?? 250;
  }

  addTicker(name: string, fn: (dtMs: number) => void, opts: { everyMs?: number; duringWarmup?: boolean } = {}): void {
    this.tickers.push({ name, fn, everyMs: opts.everyMs ?? 0, duringWarmup: opts.duringWarmup ?? false, lastRun: -Infinity });
  }

  /** Advance the sim by dtMs and run due tickers. */
  step(dtMs: number): void {
    const w = this.world;
    w.now += dtMs;
    for (const t of this.tickers) {
      if (this.warming && !t.duringWarmup) continue;
      if (w.now - t.lastRun < t.everyMs) continue;
      const dt = t.lastRun === -Infinity ? dtMs : w.now - t.lastRun;
      t.lastRun = w.now;
      try {
        t.fn(dt);
      } catch (err) {
        console.error(`[engine] ticker ${t.name} failed`, err);
      }
    }
    this.tickCount++;
  }

  /**
   * Fast-forward: rewind the clock by `durationMs` and replay forward in
   * `stepMs` increments, ending at the current wall time.
   */
  warmup(durationMs: number, stepMs = 1000, endAt: number = Date.now()): void {
    const w = this.world;
    this.warming = true;
    w.now = endAt - durationMs;
    w.startedAt = w.now;
    const started = Date.now();
    while (w.now < endAt) this.step(Math.min(stepMs, endAt - w.now));
    this.warming = false;
    for (const t of this.tickers) t.lastRun = Math.min(t.lastRun, w.now);
    console.log(`[engine] warmup ${Math.round(durationMs / 60000)}m simulated in ${Date.now() - started}ms; ${w.tokens.size} tokens, ${w.wallets.size} wallets, ${w.tradeTotal} trades`);
  }

  start(): void {
    if (this.timer) return;
    this.lastWall = Date.now();
    this.world.now = Math.max(this.world.now, this.lastWall);
    this.timer = setInterval(() => {
      const wall = Date.now();
      const dt = Math.max(1, wall - this.lastWall);
      this.lastWall = wall;
      const before = this.world.tradeTotal;
      const t0 = performance.now();
      // keep sim clock locked to wall clock
      this.step(Math.max(dt, wall - this.world.now));
      this.lastTickCostMs = performance.now() - t0;
      this.tpsWindow.push({ t: wall, n: this.world.tradeTotal - before });
      while (this.tpsWindow.length && this.tpsWindow[0].t < wall - 10000) this.tpsWindow.shift();
      this.tps = this.tpsWindow.reduce((a, b) => a + b.n, 0) / 10;
    }, this.tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }
}
