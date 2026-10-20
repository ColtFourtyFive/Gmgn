// Prometheus text exposition (format 0.0.4), hand-rolled: labelled counters
// and histograms with bounded series, a process-wide registry other modules
// can add counters to (RPC errors, failed transactions, ...), and an
// event-loop delay monitor on perf_hooks.monitorEventLoopDelay.

import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

export type Labels = Record<string, string>;

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatValue(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return '+Inf';
  if (v === -Infinity) return '-Inf';
  return String(v);
}

function formatLabels(labels: Labels | undefined): string {
  if (!labels) return '';
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

/** Builds one exposition: every family is announced once (HELP + TYPE) before its samples. */
export class Exposition {
  private lines: string[] = [];
  private families = new Set<string>();

  family(name: string, type: 'counter' | 'gauge' | 'histogram', help: string): this {
    if (this.families.has(name)) throw new Error(`metric family ${name} written twice`);
    this.families.add(name);
    this.lines.push(`# HELP ${name} ${help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}`, `# TYPE ${name} ${type}`);
    return this;
  }

  sample(name: string, labels: Labels | undefined, value: number): this {
    this.lines.push(`${name}${formatLabels(labels)} ${formatValue(value)}`);
    return this;
  }

  /** A gauge family with one sample per entry (none: the family is still announced). */
  gauge(name: string, help: string, samples: number | [Labels, number][]): this {
    this.family(name, 'gauge', help);
    if (typeof samples === 'number') return this.sample(name, undefined, samples);
    for (const [labels, v] of samples) this.sample(name, labels, v);
    return this;
  }

  /** A counter whose value is owned elsewhere (e.g. world.tradeTotal). */
  counterValue(name: string, help: string, samples: number | [Labels, number][]): this {
    this.family(name, 'counter', help);
    if (typeof samples === 'number') return this.sample(name, undefined, samples);
    for (const [labels, v] of samples) this.sample(name, labels, v);
    return this;
  }

  toString(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

/** Series beyond this many per metric fold into one overflow series, so a label bug cannot exhaust memory. */
export const MAX_SERIES = 2000;
const OVERFLOW = '__overflow__';

function seriesKey(labelNames: readonly string[], labels: Labels): string {
  return labelNames.map((n) => labels[n] ?? '').join('\u0000');
}

export class Counter {
  private series = new Map<string, { labels: Labels; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    if (!(by >= 0)) return;
    let key = seriesKey(this.labelNames, labels);
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= MAX_SERIES) {
        labels = Object.fromEntries(this.labelNames.map((n) => [n, OVERFLOW]));
        key = seriesKey(this.labelNames, labels);
        s = this.series.get(key);
      }
      if (!s) this.series.set(key, (s = { labels: pick(this.labelNames, labels), value: 0 }));
    }
    s.value += by;
  }

  get(labels: Labels = {}): number {
    return this.series.get(seriesKey(this.labelNames, labels))?.value ?? 0;
  }

  write(out: Exposition): void {
    out.family(this.name, 'counter', this.help);
    for (const s of this.series.values()) out.sample(this.name, s.labels, s.value);
  }
}

export class Histogram {
  private series = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[],
    /** Upper bounds, ascending (the +Inf bucket is implicit). */
    readonly buckets: readonly number[],
  ) {}

  observe(labels: Labels, value: number): void {
    if (!Number.isFinite(value)) return;
    let key = seriesKey(this.labelNames, labels);
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= MAX_SERIES) {
        labels = Object.fromEntries(this.labelNames.map((n) => [n, OVERFLOW]));
        key = seriesKey(this.labelNames, labels);
        s = this.series.get(key);
      }
      if (!s) this.series.set(key, (s = { labels: pick(this.labelNames, labels), counts: this.buckets.map(() => 0), sum: 0, count: 0 }));
    }
    for (let i = 0; i < this.buckets.length; i++) if (value <= this.buckets[i]) s.counts[i]++;
    s.sum += value;
    s.count++;
  }

  write(out: Exposition): void {
    out.family(this.name, 'histogram', this.help);
    for (const s of this.series.values()) {
      for (let i = 0; i < this.buckets.length; i++) out.sample(`${this.name}_bucket`, { ...s.labels, le: String(this.buckets[i]) }, s.counts[i]);
      out.sample(`${this.name}_bucket`, { ...s.labels, le: '+Inf' }, s.count);
      out.sample(`${this.name}_sum`, s.labels, s.sum);
      out.sample(`${this.name}_count`, s.labels, s.count);
    }
  }
}

function pick(names: readonly string[], labels: Labels): Labels {
  const out: Labels = {};
  for (const n of names) out[n] = labels[n] ?? '';
  return out;
}

// ---------------------------------------------------------------------------
// Process-wide registry
// ---------------------------------------------------------------------------

const registry = new Map<string, Counter>();

/**
 * A process-wide counter exported on /metrics, created on first use (the same name returns the same
 * counter, so modules may call this at construction). For events the ops module cannot see itself:
 * e.g. counter('trenchscope_rpc_errors_total', 'RPC calls that failed', ['chain']).inc({ chain }).
 */
export function counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) throw new Error(`invalid metric name ${name}`);
  let c = registry.get(name);
  if (!c) registry.set(name, (c = new Counter(name, help, labelNames)));
  return c;
}

export function writeRegistry(out: Exposition): void {
  for (const c of registry.values()) c.write(out);
}

// ---------------------------------------------------------------------------
// Event-loop delay
// ---------------------------------------------------------------------------

export interface LoopDelay {
  /** Seconds the loop ran late beyond the sampling interval, over the last window. */
  p50: number;
  p99: number;
  max: number;
  mean: number;
}

/**
 * Event-loop delay over fixed windows (monitorEventLoopDelay samples every `resolutionMs`; its values
 * include that interval, which is subtracted, so an idle loop reads ~0). Readers get the last
 * completed window, or the current one before the first window completes.
 */
export class LoopDelayMonitor {
  private readonly h: IntervalHistogram;
  private last: LoopDelay | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly resolutionMs = 20,
    private readonly windowMs = 15_000,
  ) {
    this.h = monitorEventLoopDelay({ resolution: resolutionMs });
  }

  start(): void {
    if (this.timer) return;
    this.h.enable();
    this.timer = setInterval(() => {
      if (this.h.count > 0) this.last = this.read();
      this.h.reset();
    }, this.windowMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.h.disable();
  }

  snapshot(): LoopDelay {
    return this.last ?? this.read();
  }

  private read(): LoopDelay {
    if (this.h.count === 0) return { p50: 0, p99: 0, max: 0, mean: 0 };
    const lag = (ns: number) => Math.round(Math.max(0, ns / 1e6 - this.resolutionMs) * 1000) / 1e6;
    return { p50: lag(this.h.percentile(50)), p99: lag(this.h.percentile(99)), max: lag(this.h.max), mean: lag(this.h.mean) };
  }
}
