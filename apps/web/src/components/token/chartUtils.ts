// lightweight-charts glue: theme colors from CSS tokens, local-time shift,
// tiny-price formatting and the trade-marker aggregation.

import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import { formatPrice, formatSmall, formatUsd, RESOLUTION_SECONDS, type Candle, type Resolution, type Trade, type WalletTag } from '@trenchscope/shared';
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

export function toBar(c: Candle, unit: ChartUnit, supply: number): Bar {
  const k = unit === 'mcap' ? supply : 1;
  return { time: toChartTime(c.time), open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k };
}

/** Axis / crosshair label for a value in the chart unit. */
export function formatAxis(value: number, unit: ChartUnit): string {
  // Prices and market caps are never negative; the scale margins can still show values below 0.
  if (!Number.isFinite(value) || value < 0) return '';
  if (unit === 'mcap') return formatUsd(value, 2);
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1) return `$${formatSmall(value, 4)}`;
  return formatPrice(value, 4);
}

/** Smallest price step the scale should resolve (prices can be 1e-9). */
export function minMoveFor(unit: ChartUnit): number {
  return unit === 'mcap' ? 0.01 : 1e-12;
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
