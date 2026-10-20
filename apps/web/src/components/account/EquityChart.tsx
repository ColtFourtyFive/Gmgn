import { useEffect, useMemo, useRef } from 'react';
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { formatUsd } from '@trenchscope/shared';
import { LineChart } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState } from '@/components/ui';
import { useUi } from '@/store/ui';

export interface EquityPoint {
  t: number;
  valueUsd: number;
}

/** Theme token -> "rgba(r, g, b, a)" (lightweight-charts only parses the comma syntax). */
function rgba(token: string, alpha = 1): string {
  const triplet = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const [r, g, b] = triplet.split(/\s+/).map(Number);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return `rgba(128, 128, 128, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** navigator.language can be an invalid BCP 47 tag (e.g. "en-US@posix" in headless shells); Intl would throw. */
function safeLocale(): string {
  try {
    const lang = navigator.language;
    return Intl.DateTimeFormat.supportedLocalesOf(lang).length ? lang : 'en-US';
  } catch {
    return 'en-US';
  }
}

/** Chart time axis shows local time: shift epoch seconds by the timezone offset. */
const TZ_SHIFT_S = -new Date().getTimezoneOffset() * 60;

/** Strictly increasing, one point per second (the last value wins). */
function toSeries(points: EquityPoint[]): { time: UTCTimestamp; value: number }[] {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    if (!Number.isFinite(p.valueUsd)) continue;
    const time = (Math.floor(p.t / 1000) + TZ_SHIFT_S) as UTCTimestamp;
    if (out.length && out[out.length - 1].time === time) out[out.length - 1].value = p.valueUsd;
    else out.push({ time, value: p.valueUsd });
  }
  return out;
}

const TICKS = 6;

/**
 * Price-axis format for an equity curve. Compact labels ("$38.9K") hold only
 * ~3 significant digits, so the few-dollar swings of a quiet account would
 * label every tick the same: use them only when ticks are far enough apart,
 * otherwise whole dollars or cents ("$38,875", "$38,875.40"). `minMove` keeps
 * the scale's ticks on multiples the labels can show.
 */
export function equityPriceFormat(values: number[]): { minMove: number; formatter: (p: number) => string } {
  const finite = values.filter(Number.isFinite);
  const hi = finite.length ? Math.max(...finite) : 0;
  const lo = finite.length ? Math.min(...finite) : 0;
  const step = (hi - lo) / TICKS;
  const magnitude = Math.max(Math.abs(hi), Math.abs(lo));
  // Smallest difference compact formatting shows at this magnitude ($38.88K: $10).
  const compactRes = magnitude >= 1000 ? 10 ** (Math.floor(Math.log10(magnitude) / 3) * 3 - 2) : 0.01;
  if (step >= compactRes * 2) return { minMove: 0.01, formatter: (p) => formatUsd(p) };
  const digits = step >= 1 ? 0 : 2;
  const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return { minMove: digits ? 0.01 : 1, formatter: (p) => `${p < 0 ? '-' : ''}$${nf.format(Math.abs(p))}` };
}

/** Samples less than this far apart in total get seconds on the time axis (else every label reads the same minute). */
const SECONDS_VISIBLE_BELOW_S = 15 * 60;

export interface EquityChartProps {
  points: EquityPoint[];
  height?: number;
  className?: string;
}

/**
 * Portfolio equity curve (area line) on lightweight-charts. Green when the
 * window ends at or above where it started, red otherwise; follows the theme.
 */
export function EquityChart({ points, height = 220, className }: EquityChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const theme = useUi((s) => s.theme);
  const data = useMemo(() => toSeries(points), [points]);
  const tone = data.length > 1 && data[data.length - 1].value < data[0].value ? 'down' : 'up';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      handleScroll: false,
      handleScale: false,
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      localization: { locale: safeLocale() },
    });
    const series = chart.addAreaSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3 });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const grid = rgba('line', 0.6);
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: rgba('panel') }, textColor: rgba('muted'), fontSize: 11, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
      grid: { vertLines: { color: grid, style: LineStyle.Dotted }, horzLines: { color: grid, style: LineStyle.Dotted } },
      crosshair: {
        vertLine: { color: rgba('faint'), labelBackgroundColor: rgba('panel-3') },
        horzLine: { color: rgba('faint'), labelBackgroundColor: rgba('panel-3') },
      },
    });
    series.applyOptions({ lineColor: rgba(tone), topColor: rgba(tone, 0.28), bottomColor: rgba(tone, 0.02) });
  }, [theme, tone]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.applyOptions({ priceFormat: { type: 'custom', ...equityPriceFormat(data.map((d) => d.value)) } });
    const spanS = data.length > 1 ? data[data.length - 1].time - data[0].time : 0;
    chartRef.current?.applyOptions({ timeScale: { secondsVisible: spanS < SECONDS_VISIBLE_BELOW_S } });
    series.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div className={clsx('relative w-full', className)} style={{ height }}>
      <div ref={ref} className="absolute inset-0" aria-label="Equity curve" role="figure" />
      {data.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel/80">
          <EmptyState compact icon={<LineChart size={16} />} title="No history yet" description="Your equity curve fills in as the portfolio is sampled (every 5 minutes and after each trade)." />
        </div>
      )}
    </div>
  );
}
