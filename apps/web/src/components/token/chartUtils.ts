// lightweight-charts glue: theme colors from CSS tokens, local-time shift,
// unit (price / MC) and currency (USD / native) scaling, tiny-price
// formatting, the trade-marker aggregation and the signal markers.

import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import { formatCompact, formatPrice, formatSmall, formatUsd, RESOLUTION_SECONDS, type Candle, type Resolution, type Signal, type SignalKind, type Trade, type WalletTag } from '@trenchscope/shared';
import { SIGNAL_META, SIGNAL_ORDER } from '@/components/signals/meta';
import { classifyTrade, markerPriority, MARKER_CLASSES, withViewerTags, type MarkerClass } from './model';
import type { ChartUnit } from './store';

/** Theme token -> "rgba(r, g, b, a)" (lightweight-charts only parses the comma syntax). */
export function cssColor(token: string, alpha = 1): string {
  if (typeof document === 'undefined') return `rgba(128, 128, 128, ${alpha})`;
  const triplet = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const [r, g, b] = triplet.split(/\s+/).map(Number);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return `rgba(128, 128, 128, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** navigator.language can be an invalid BCP 47 tag in headless shells; Intl would throw. */
export function safeLocale(): string {
  try {
    const lang = navigator.language;
    return Intl.DateTimeFormat.supportedLocalesOf(lang).length ? lang : 'en-US';
  } catch {
    return 'en-US';
  }
}

/** The time axis shows UTC; shift epoch seconds by the local offset so it reads local time. */
export const TZ_SHIFT_S = -new Date().getTimezoneOffset() * 60;

export const toChartTime = (epochSec: number) => (epochSec + TZ_SHIFT_S) as UTCTimestamp;

/** Bucket start (chart time) of a trade timestamp (ms) at a resolution. */
export function bucketTime(tsMs: number, resolution: Resolution): UTCTimestamp {
  const res = RESOLUTION_SECONDS[resolution];
  return toChartTime(Math.floor(tsMs / 1000 / res) * res);
}

export interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Chart currency: USD, or the chain's native asset (SOL, BNB, ETH). */
export type ChartCurrency = 'usd' | 'native';

/**
 * Multiplier from a candle's USD price to the chart value: × supply for
 * market cap, ÷ the native asset's USD price for native units. Candles carry
 * no per-bucket native price, so native bars use the native price current
 * when they were drawn — close to "native price at bucket time" (TK-C3) over
 * a chart's span, since the native asset moves far less than the token.
 */
export function chartScale(unit: ChartUnit, currency: ChartCurrency, supply: number, nativeUsd: number): number {
  const k = unit === 'mcap' ? supply : 1;
  return currency === 'native' && nativeUsd > 0 ? k / nativeUsd : k;
}

export function toBar(c: Candle, scale: number): Bar {
  return { time: toChartTime(c.time), open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale };
}

/** Axis / crosshair label for a value in the chart unit and currency (native values carry no symbol: the toolbar shows it). */
export function formatAxis(value: number, unit: ChartUnit, currency: ChartCurrency = 'usd'): string {
  // Prices and market caps are never negative; the scale margins can still show values below 0.
  if (!Number.isFinite(value) || value < 0) return '';
  if (currency === 'native') return unit === 'mcap' ? formatCompact(value, 2) : formatSmall(value, 4);
  if (unit === 'mcap') return formatUsd(value, 2);
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1) return `$${formatSmall(value, 4)}`;
  return formatPrice(value, 4);
}

/**
 * Smallest difference `formatAxis` shows at the magnitude of `value`: labels
 * keep two decimals of K/M/B/T (one from 100, two below), and four
 * significant digits for prices below 1 (three for market caps).
 */
export function axisResolution(value: number, unit: ChartUnit, currency: ChartCurrency = 'usd'): number {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs) || abs === 0) return 0;
  const significant = (n: number) => 10 ** (Math.floor(Math.log10(abs)) - n + 1);
  const compact = () => {
    for (const size of [1e12, 1e9, 1e6, 1e3]) if (abs >= size) return size / 100;
    return abs >= 100 ? 0.1 : 0.01;
  };
  if (unit === 'mcap') return abs >= 1 ? compact() : significant(3);
  if (abs < 1) return significant(4);
  if (currency === 'native') return 1e-4;
  return abs >= 1000 ? compact() : abs >= 100 ? 0.01 : 1e-4;
}

/** Pixels per tick label on the price axis (lightweight-charts: 2.5 × the 11px axis font). */
export const AXIS_TICK_PX = Math.ceil(11 * 2.5);

/**
 * Autoscale range that keeps the price axis readable: at least one label step
 * (axisResolution) per tick slot of a `heightPx` tall scale. The scale spaces
 * ticks by price per pixel, so a flat or very narrow range (a token that just
 * launched, a quiet stretch) would otherwise put several ticks within one
 * label step and print the same label over and over. Wider ranges are kept.
 */
export function readableRange(range: { minValue: number; maxValue: number }, unit: ChartUnit, currency: ChartCurrency, heightPx: number): { minValue: number; maxValue: number } {
  const { minValue: lo, maxValue: hi } = range;
  const res = axisResolution(Math.max(Math.abs(lo), Math.abs(hi)), unit, currency);
  const need = (res * Math.max(heightPx, AXIS_TICK_PX)) / AXIS_TICK_PX;
  if (!(need > 0) || hi - lo >= need) return range;
  const mid = (lo + hi) / 2;
  return { minValue: mid - need / 2, maxValue: mid + need / 2 };
}

/** Smallest price step the scale should resolve (USD prices can be 1e-9, native ones 1e-12). */
export function minMoveFor(unit: ChartUnit, currency: ChartCurrency = 'usd'): number {
  if (unit === 'mcap') return 0.01;
  return currency === 'native' ? 1e-15 : 1e-12;
}

export interface MarkerColors {
  up: string;
  down: string;
  mine: string;
  info: string;
}

const SHORT = new Map(MARKER_CLASSES.map((c) => [c.key, c.short]));

/** Keep markers bounded: only the newest trades are plotted. */
export const MAX_MARKER_TRADES = 300;

/**
 * Aggregate tagged trades into one marker per candle and side: green arrow
 * below the bar for buys, red arrow above for sells, labelled with the
 * highest-priority class ("KOL", "Dev ×3"); the viewer's own trades use the
 * accent color.
 */
export function buildMarkers(opts: {
  trades: Trade[];
  enabled: ReadonlySet<MarkerClass>;
  viewerTags: (address: string) => WalletTag[];
  resolution: Resolution;
  /** Bar time range present on the chart (markers outside it are dropped). */
  range: { from: number; to: number } | null;
  migratedAt: number | null;
  colors: MarkerColors;
  /** Current horizontal pixels per bar: labels that would collide with a neighbour are dropped. */
  barPx?: number;
}): SeriesMarker<UTCTimestamp>[] {
  const { trades, enabled, viewerTags, resolution, range, migratedAt, colors, barPx = 30 } = opts;
  const res = RESOLUTION_SECONDS[resolution];
  if (!range) return [];
  type Group = { time: UTCTimestamp; side: Trade['side']; cls: MarkerClass; count: number; total: number };
  const groups = new Map<string, Group>();
  const perClass = new Map<string, number>();
  let used = 0;
  for (const t of trades) {
    if (used >= MAX_MARKER_TRADES) break;
    const classes = classifyTrade(t, withViewerTags(t, viewerTags(t.wallet))).filter((c) => enabled.has(c));
    if (classes.length === 0) continue;
    const time = bucketTime(t.timestamp, resolution);
    if (time < range.from || time > range.to) continue;
    used++;
    const key = `${time}|${t.side}`;
    const top = classes[0];
    const n = (perClass.get(`${key}|${top}`) ?? 0) + 1;
    perClass.set(`${key}|${top}`, n);
    const g = groups.get(key);
    if (!g) groups.set(key, { time, side: t.side, cls: top, count: 1, total: 1 });
    else {
      g.total++;
      if (markerPriority(top) < markerPriority(g.cls)) {
        g.cls = top;
        g.count = n;
      } else if (top === g.cls) g.count = n;
    }
  }
  const markers: SeriesMarker<UTCTimestamp>[] = [];
  // Greedy label placement per side, oldest first: the viewer's and the dev's
  // labels always show; others only when they don't overlap the previous label.
  const lastLabel: Record<Trade['side'], number> = { buy: -Infinity, sell: -Infinity };
  for (const g of [...groups.values()].sort((a, b) => a.time - b.time)) {
    const buy = g.side === 'buy';
    const others = g.total - g.count;
    // "KOL ×3" = three KOL trades; "+2" = other tagged trades in the same candle.
    let text: string | undefined = `${SHORT.get(g.cls) ?? ''}${g.count > 1 ? ` ×${g.count}` : ''}${others > 0 ? ` +${others}` : ''}`;
    const needBars = (text.length * 6.5 + 6) / Math.max(1, barPx);
    const important = g.cls === 'mine' || g.cls === 'dev';
    if (!important && (g.time - lastLabel[g.side]) / res < needBars) text = undefined;
    else lastLabel[g.side] = g.time;
    markers.push({
      time: g.time,
      position: buy ? 'belowBar' : 'aboveBar',
      shape: buy ? 'arrowUp' : 'arrowDown',
      color: g.cls === 'mine' ? colors.mine : buy ? colors.up : colors.down,
      text,
      size: g.cls === 'mine' ? 1.4 : 1,
      id: `${g.time}-${g.side}`,
    });
  }
  if (migratedAt) {
    const time = bucketTime(migratedAt, resolution);
    if (time >= range.from && time <= range.to) markers.push({ time, position: 'aboveBar', shape: 'square', color: colors.info, text: barPx < 40 ? 'M' : 'Migrated', id: 'migration' });
  }
  return markers.sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------------------
// Signal markers (PRD TK-C8)
// ---------------------------------------------------------------------------

/** Ids of signal markers start with this, so a hovered marker maps back to its signals. */
export const SIGNAL_MARKER_PREFIX = 'sig:';

export interface SignalMarkerColors {
  bullish: string;
  bearish: string;
  neutral: string;
}

/** Signals already drawn another way: the migration marker marks graduation. */
const UNMARKED_SIGNALS = new Set<SignalKind>(['migration']);

/** Warnings label a shared candle first, then the Signals page's chip order. */
function signalPriority(kind: SignalKind): number {
  return (SIGNAL_META[kind].sentiment === 'bearish' ? 0 : 100) + SIGNAL_ORDER.indexOf(kind);
}

/**
 * One circle above each candle that holds signals, coloured by the strongest
 * sentiment (a warning wins), labelled with the code of its highest-priority
 * kind ("SM", "Dev↓ ×2", "KOL +1"); labels that would collide with the previous
 * one are dropped. Returns the markers and the signals behind each marker id
 * (newest first) for the hover tooltip.
 */
export function buildSignalMarkers(opts: {
  signals: Signal[];
  resolution: Resolution;
  /** Bar time range present on the chart (signals outside it are dropped). */
  range: { from: number; to: number } | null;
  colors: SignalMarkerColors;
  barPx?: number;
}): { markers: SeriesMarker<UTCTimestamp>[]; groups: Map<string, Signal[]> } {
  const { signals, resolution, range, colors, barPx = 30 } = opts;
  const groups = new Map<string, Signal[]>();
  const markers: SeriesMarker<UTCTimestamp>[] = [];
  if (!range) return { markers, groups };
  const res = RESOLUTION_SECONDS[resolution];
  const byTime = new Map<number, Signal[]>();
  for (const s of signals) {
    if (UNMARKED_SIGNALS.has(s.kind) || !(s.kind in SIGNAL_META)) continue;
    const time = bucketTime(s.createdAt, resolution);
    if (time < range.from || time > range.to) continue;
    const list = byTime.get(time);
    if (list) list.push(s);
    else byTime.set(time, [s]);
  }
  let lastLabel = -Infinity;
  for (const time of [...byTime.keys()].sort((a, b) => a - b)) {
    const list = byTime.get(time)!.sort((a, b) => b.createdAt - a.createdAt);
    const top = list.reduce((best, s) => (signalPriority(s.kind) < signalPriority(best.kind) ? s : best), list[0]);
    const same = list.filter((s) => s.kind === top.kind).length;
    const others = list.length - same;
    const sentiment = list.some((s) => SIGNAL_META[s.kind].sentiment === 'bearish') ? 'bearish' : SIGNAL_META[top.kind].sentiment;
    let text: string | undefined = `${SIGNAL_META[top.kind].short}${same > 1 ? ` ×${same}` : ''}${others > 0 ? ` +${others}` : ''}`;
    const needBars = (text.length * 6.5 + 6) / Math.max(1, barPx);
    // warnings always keep their label
    if (sentiment !== 'bearish' && (time - lastLabel) / res < needBars) text = undefined;
    else lastLabel = time;
    const id = `${SIGNAL_MARKER_PREFIX}${time}`;
    groups.set(id, list);
    markers.push({ time: time as UTCTimestamp, position: 'aboveBar', shape: 'circle', color: colors[sentiment], text, size: 1, id });
  }
  return { markers, groups };
}

/** Trade, migration and signal markers in the time order lightweight-charts requires. */
export function mergeMarkers(...sets: SeriesMarker<UTCTimestamp>[][]): SeriesMarker<UTCTimestamp>[] {
  return sets.flat().sort((a, b) => a.time - b.time);
}
