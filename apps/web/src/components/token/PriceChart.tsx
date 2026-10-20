// Candlestick chart (lightweight-charts 4.2): REST history per resolution,
// live `candle` updates from the page feed, Price/MCap unit, USD/native
// currency (settings.display.currency, see useValueCurrency; native divides
// by the chain's native USD price when the bars are drawn, see chartScale), trade markers by wallet
// class, the token's signals as markers with hover tooltips (toggle "Signals",
// which also lists them for keyboard and screen-reader users), migration marker
// and price lines for the viewer's average buy price and open orders.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { CHAINS, formatCompact, formatUsd, RESOLUTIONS, type Candle, type Order, type Position, type Resolution, type Signal, type TokenDetail } from '@trenchscope/shared';
import { CandlestickChart, Eye, MoveHorizontal, Radio } from 'lucide-react';
import clsx from 'clsx';
import { Age, Usd, withSubscript, WALLET_TAG_META } from '@/components/common';
import { SIGNAL_META } from '@/components/signals/meta';
import { Checkbox, EmptyState, ErrorState, IconButton, Popover, SegmentedControl, Select, Skeleton, Toggle } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { api } from '@/lib/api';
import { useUi } from '@/store/ui';
import { useViewerTags } from '@/components/discovery';
import { useTokenFeed } from './feed';
import {
  buildMarkers,
  buildSignalMarkers,
  chartScale,
  cssColor,
  formatAxis,
  mergeMarkers,
  minMoveFor,
  readableRange,
  safeLocale,
  SIGNAL_MARKER_PREFIX,
  toBar,
  toChartTime,
  type Bar,
} from './chartUtils';
import { DEFAULT_MARKER_CLASSES, MARKER_CLASSES, type MarkerClass } from './model';
import { tokenKeys, useChartUnit, useOnReconnect, useTokenSignals, useValueCurrency } from './queries';
import type { ChartUnit } from './store';
import { useMarkerTrades } from './useMarkerTrades';
import { useSession } from '@/store/session';

export interface PriceChartProps {
  token: TokenDetail;
  resolution: Resolution;
  onResolutionChange: (r: Resolution) => void;
  /** The viewer's position (avg buy line). */
  position?: Position | null;
  /** The viewer's open orders on this token (trigger lines). */
  orders?: Order[];
  height: number;
  className?: string;
}

const RES_ITEMS = RESOLUTIONS.map((r) => ({ value: r, label: r }));
const UNIT_ITEMS: { value: ChartUnit; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'mcap', label: 'MCap' },
];

/** Redraw native bars once the native price drifts this much from the one they were drawn at. */
const NATIVE_REDRAW_DRIFT = 0.005;

interface Legend {
  bar: Bar;
  volume: number;
}

/** Signals under the hovered marker and where to show them (chart pixels). */
interface SignalHover {
  signals: Signal[];
  x: number;
  y: number;
}

/** Signals listed in the toolbar popover (the chart shows every one in view). */
const SIGNAL_LIST_MAX = 30;
const TOOLTIP_SIGNALS_MAX = 4;

/** Hover card for a signal marker: what fired on that candle. */
function SignalTooltip({ hover, width }: { hover: SignalHover; width: number }) {
  const shown = hover.signals.slice(0, TOOLTIP_SIGNALS_MAX);
  const more = hover.signals.length - shown.length;
  const left = Math.max(4, Math.min(hover.x + 12, width - 264));
  return (
    <div role="tooltip" className="pointer-events-none absolute z-[4] w-[260px] rounded border border-line bg-panel-2 p-2 text-xs shadow-lg" style={{ left, top: Math.max(4, hover.y - 8) }}>
      <ul className="flex flex-col gap-1.5">
        {shown.map((s) => (
          <SignalLine key={s.id} signal={s} />
        ))}
      </ul>
      {more > 0 && <p className="mt-1 text-faint">+{more} more on this candle</p>}
    </div>
  );
}

/** One signal: kind (icon + title), age and what happened. */
function SignalLine({ signal: s, mc }: { signal: Signal; mc?: boolean }) {
  const meta = SIGNAL_META[s.kind];
  const Icon = meta.icon;
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 font-semibold" style={{ color: `rgb(var(--${meta.token}))` }}>
        <Icon size={12} aria-hidden />
        {s.title || meta.label}
        <Age ts={s.createdAt} suffix=" ago" className="ml-auto font-normal text-faint" />
      </span>
      <span className="text-muted">{s.detail}</span>
      {mc && (
        <span className="text-2xs text-faint">
          MC at signal <Usd value={s.marketCapAtTrigger} />
        </span>
      )}
    </li>
  );
}

/** Price (or MC) at which an open order fires, in USD price terms; null when not price-like. */
function orderTriggerPrice(o: Order, supply: number): number | null {
  if (o.status !== 'open') return null;
  if (o.triggerType === 'price') return o.triggerValue;
  if (o.triggerType === 'mcap') return supply > 0 ? o.triggerValue / supply : null;
  if (o.triggerType === 'change') {
    if (o.kind === 'trailing_stop') return o.armed && o.peakPriceUsd ? o.peakPriceUsd * (1 - o.triggerValue / 100) : null;
    if (!o.refPriceUsd) return null;
    return o.kind === 'stop_loss' ? o.refPriceUsd * (1 - o.triggerValue / 100) : o.refPriceUsd * (1 + o.triggerValue / 100);
  }
  return null;
}

const ORDER_LINE_TITLE: Partial<Record<Order['kind'], string>> = {
  limit_buy: 'Limit buy',
  limit_sell: 'Limit sell',
  take_profit: 'TP',
  stop_loss: 'SL',
  trailing_stop: 'Trail',
};

export const PriceChart = memo(function PriceChart({ token, resolution, onResolutionChange, position, orders, height, className }: PriceChartProps) {
  const { chain, address } = token;
  const supply = token.totalSupply;
  const [unit, setUnit] = useChartUnit();
  const [currency, setCurrency] = useValueCurrency();
  const nativeSymbol = CHAINS[chain].nativeSymbol;
  const theme = useUi((s) => s.theme);
  const feed = useTokenFeed();
  const signedIn = useSession((s) => !!s.token);
  const viewerTags = useViewerTags(chain);
  const [classList, setClassList] = useLocalStorage<MarkerClass[]>('ts.token.markers', DEFAULT_MARKER_CLASSES);
  const enabled = useMemo(() => new Set(classList), [classList]);
  const markerTrades = useMarkerTrades(chain, address, enabled);
  const [showSignals, setShowSignals] = useLocalStorage<boolean>('ts.token.signalMarkers', true);
  const signals = useTokenSignals(chain, address);
  const signalList = useMemo(() => signals.data ?? [], [signals.data]);
  const roomy = useBreakpoint('sm');

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  /** Raw candles on the chart (server units), REST history + live updates. */
  const rawRef = useRef<Candle[]>([]);
  /** Live candles that arrived before the history for their resolution. */
  const pendingRef = useRef<Candle[]>([]);
  const loadedRef = useRef(false);
  const resRef = useRef(resolution);
  resRef.current = resolution;
  /** Scale wanted now (unit, currency, supply, native price) and the one the bars on the chart use. */
  const targetScale = chartScale(unit, currency, supply, token.nativeUsd);
  const targetScaleRef = useRef(targetScale);
  targetScaleRef.current = targetScale;
  const [scale, setScale] = useState(targetScale);
  const scaleRef = useRef(scale);
  /** Bumped whenever bars are (re)written so markers and lines follow. */
  const [dataVersion, setDataVersion] = useState(0);
  const [legend, setLegend] = useState<Legend | null>(null);
  /** Pixels per bar (rounded) — marker labels that would overlap are dropped. */
  const [barPx, setBarPx] = useState(30);
  const [lastLegend, setLastLegend] = useState<Legend | null>(null);
  /** Signals behind each signal marker id (read by the crosshair handler). */
  const signalGroupsRef = useRef(new Map<string, Signal[]>());
  const [signalHover, setSignalHover] = useState<SignalHover | null>(null);

  const candles = useQuery({
    queryKey: tokenKeys.candles(chain, address, resolution),
    queryFn: () => api.candles(chain, address, resolution, 500),
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // The stream only sends the latest candle (and new signals): refetch after a reconnect to fill the gap.
  useOnReconnect(() => {
    void candles.refetch();
    void signals.refetch();
  });

  const colors = () => ({ up: cssColor('up'), down: cssColor('down'), upVol: cssColor('up', 0.35), downVol: cssColor('down', 0.35) });

  const volumeBar = (c: Candle) => {
    const col = colors();
    return { time: toChartTime(c.time), value: c.volume, color: c.close >= c.open ? col.upVol : col.downVol };
  };

  const writeAll = () => {
    const series = candleRef.current;
    const vol = volumeRef.current;
    if (!series || !vol) return;
    const raw = rawRef.current;
    const k = targetScaleRef.current;
    scaleRef.current = k;
    setScale(k);
    series.setData(raw.map((c) => toBar(c, k)));
    vol.setData(raw.map(volumeBar));
    const last = raw[raw.length - 1];
    setLastLegend(last ? { bar: toBar(last, k), volume: last.volume } : null);
    setDataVersion((v) => v + 1);
  };

  /** Default view: the latest ~width/10 bars (left-anchored while a young token has fewer). */
  const fitBars = () => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const n = rawRef.current.length;
    const target = Math.max(20, Math.round((containerRef.current?.clientWidth ?? 600) / 10));
    if (n === 0) return;
    if (n >= target) ts.setVisibleLogicalRange({ from: n - target, to: n + 2 });
    else ts.setVisibleLogicalRange({ from: -3, to: target });
  };

  const applyLive = (c: Candle) => {
    const raw = rawRef.current;
    const last = raw[raw.length - 1];
    if (last && c.time < last.time) return;
    if (last && c.time === last.time) raw[raw.length - 1] = c;
    else raw.push(c);
    const bar = toBar(c, scaleRef.current);
    candleRef.current?.update(bar);
    volumeRef.current?.update(volumeBar(c));
    setLastLegend({ bar, volume: c.volume });
    if (!last || c.time !== last.time) setDataVersion((v) => v + 1);
  };

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 7, minBarSpacing: 1.5 },
      localization: { locale: safeLocale() },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
    });
    const series = chart.addCandlestickSeries({ borderVisible: false, priceLineVisible: true, lastValueVisible: true });
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const onMove = (param: MouseEventParams<Time>) => {
      const bar = param.seriesData.get(series) as Bar | undefined;
      const v = param.seriesData.get(vol) as { value?: number } | undefined;
      setLegend(bar && 'open' in bar ? { bar, volume: v?.value ?? 0 } : null);
      const id = typeof param.hoveredObjectId === 'string' && param.hoveredObjectId.startsWith(SIGNAL_MARKER_PREFIX) ? param.hoveredObjectId : null;
      const group = id ? signalGroupsRef.current.get(id) : undefined;
      setSignalHover(group && param.point ? { signals: group, x: param.point.x, y: param.point.y } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    const onRange = (range: { from: number; to: number } | null) => {
      const bars = range ? range.to - range.from : 0;
      if (bars > 0) setBarPx(Math.max(1, Math.round(el.clientWidth / bars)));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chartRef.current = chart;
    candleRef.current = series;
    volumeRef.current = vol;
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Theme colors.
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return;
    const grid = cssColor('line', 0.5);
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: cssColor('panel') }, textColor: cssColor('muted'), fontSize: 11, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
      grid: { vertLines: { color: grid, style: LineStyle.Dotted }, horzLines: { color: grid, style: LineStyle.Dotted } },
      crosshair: {
        vertLine: { color: cssColor('faint'), labelBackgroundColor: cssColor('panel-3') },
        horzLine: { color: cssColor('faint'), labelBackgroundColor: cssColor('panel-3') },
      },
    });
    const c = colors();
    series.applyOptions({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down });
    if (loadedRef.current) volumeRef.current?.setData(rawRef.current.map(volumeBar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Unit / currency: axis format + rescale every bar.
  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: { type: 'custom', minMove: minMoveFor(unit, currency), formatter: (p: number) => formatAxis(p, unit, currency) },
      // A flat or narrow range gets room for distinct tick labels.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        return info && { ...info, priceRange: readableRange(info.priceRange, unit, currency, containerRef.current?.clientHeight ?? 0) };
      },
    });
    if (loadedRef.current) writeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, currency]);

  // Native bars follow the native price once it drifts noticeably (or the supply changes).
  useEffect(() => {
    if (loadedRef.current && Math.abs(targetScale / scaleRef.current - 1) > NATIVE_REDRAW_DRIFT) writeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetScale]);

  // Seconds on the time axis for sub-minute resolutions; reset state on resolution change.
  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { secondsVisible: resolution === '1s' || resolution === '15s' } });
    loadedRef.current = false;
    pendingRef.current = [];
  }, [resolution]);

  // REST history.
  useEffect(() => {
    const data = candles.data;
    if (!data || data.resolution !== resolution) return;
    const fresh = !loadedRef.current;
    const merged = data.candles.slice();
    // Keep live updates newer than the snapshot.
    const tail = (fresh ? pendingRef.current : rawRef.current).filter((c) => c.time >= (merged[merged.length - 1]?.time ?? 0));
    for (const c of tail) {
      const last = merged[merged.length - 1];
      if (last && c.time === last.time) merged[merged.length - 1] = c;
      else if (!last || c.time > last.time) merged.push(c);
    }
    rawRef.current = merged;
    pendingRef.current = [];
    loadedRef.current = true;
    writeAll();
    if (fresh) fitBars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.data, resolution]);

  // Live candles.
  useEffect(
    () =>
      feed.subscribeCandles(({ resolution: r, candle }) => {
        if (r !== resRef.current) return;
        if (!loadedRef.current) pendingRef.current.push(candle);
        else applyLive(candle);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed],
  );

  // Markers: trades by wallet class, migration, and the token's signals.
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const raw = rawRef.current;
    const range = raw.length ? { from: toChartTime(raw[0].time), to: toChartTime(raw[raw.length - 1].time) } : null;
    const trades = buildMarkers({
      trades: markerTrades,
      enabled,
      viewerTags,
      resolution,
      range,
      migratedAt: token.migratedAt,
      colors: { up: cssColor('up'), down: cssColor('down'), mine: cssColor('accent'), info: cssColor('info') },
      barPx,
    });
    const sig = showSignals
      ? buildSignalMarkers({ signals: signalList, resolution, range, colors: { bullish: cssColor('accent'), bearish: cssColor('down'), neutral: cssColor('info') }, barPx })
      : { markers: [], groups: new Map<string, Signal[]>() };
    signalGroupsRef.current = sig.groups;
    if (!showSignals) setSignalHover(null);
    series.setMarkers(mergeMarkers(trades, sig.markers));
  }, [markerTrades, enabled, viewerTags, resolution, token.migratedAt, dataVersion, theme, barPx, showSignals, signalList]);

  // Price lines: average buy and open order triggers.
  const avgBuy = position && position.balance > 0 && position.avgBuyPriceUsd > 0 ? position.avgBuyPriceUsd : null;
  const lineSpecs = useMemo(() => {
    const specs: { price: number; title: string; tone: string; style: LineStyle }[] = [];
    if (avgBuy) specs.push({ price: avgBuy, title: 'Avg buy', tone: 'accent', style: LineStyle.Dashed });
    for (const o of orders ?? []) {
      const p = orderTriggerPrice(o, supply);
      const title = ORDER_LINE_TITLE[o.kind];
      if (p && title) specs.push({ price: p, title, tone: o.side === 'buy' ? 'up' : 'down', style: LineStyle.Dotted });
    }
    return specs.slice(0, 12);
  }, [avgBuy, orders, supply]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = lineSpecs.map((s) =>
      series.createPriceLine({
        price: s.price * scale,
        color: cssColor(s.tone, 0.85),
        lineWidth: 1,
        lineStyle: s.style,
        axisLabelVisible: true,
        title: s.title,
      }),
    );
  }, [lineSpecs, scale, theme]);

  const toggleClass = (cls: MarkerClass, on: boolean) => setClassList((prev) => (on ? [...new Set([...prev, cls])] : prev.filter((c) => c !== cls)));

  const shown = legend ?? lastLegend;
  const change = shown ? shown.bar.close / shown.bar.open - 1 : null;
  const empty = candles.isSuccess && rawRef.current.length === 0 && candles.data.candles.length === 0;

  return (
    <section className={clsx('panel flex min-w-0 flex-col overflow-hidden', className)} aria-label={`${token.symbol} chart`}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        {roomy ? (
          <SegmentedControl size="sm" value={resolution} onChange={onResolutionChange} items={RES_ITEMS} aria-label="Candle resolution" />
        ) : (
          <Select size="sm" value={resolution} onChange={onResolutionChange} options={RES_ITEMS} className="w-[72px]" aria-label="Candle resolution" />
        )}
        <SegmentedControl size="sm" value={unit} onChange={setUnit} items={UNIT_ITEMS} aria-label="Chart unit" />
        <SegmentedControl
          size="sm"
          value={currency}
          onChange={setCurrency}
          items={[
            { value: 'usd', label: 'USD', title: 'Values in US dollars' },
            { value: 'native', label: nativeSymbol, title: `Values in ${nativeSymbol} at the current ${nativeSymbol} price` },
          ]}
          aria-label="Chart currency"
        />
        <span className="flex-1" />
        <Popover
          placement="bottom-end"
          aria-label="Trade markers"
          className="w-60 p-2"
          trigger={
            <button type="button" className="btn-ghost btn-xs" aria-label="Trade markers">
              <Eye size={12} aria-hidden />
              <span className="hidden sm:inline">Markers</span>
              <span className="num rounded bg-panel-3 px-1 text-2xs text-muted">{classList.length}</span>
            </button>
          }
        >
          <p className="mb-1.5 px-1 text-xs text-muted">Show trades on the chart by wallet type (latest 300).</p>
          <ul className="flex flex-col">
            {MARKER_CLASSES.map((c) => {
              const meta = WALLET_TAG_META[c.tag];
              const Icon = meta.icon;
              const locked = c.private && !signedIn;
              return (
                <li key={c.key} className="flex h-7 items-center justify-between gap-2 rounded px-1 hover:bg-panel-2">
                  <Checkbox
                    checked={enabled.has(c.key) && !locked}
                    disabled={locked}
                    onChange={(on) => toggleClass(c.key, on)}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={12} style={{ color: `rgb(var(--${meta.token}))` }} aria-hidden />
                        {c.label}
                      </span>
                    }
                  />
                  {locked && <span className="text-2xs text-faint">Sign in</span>}
                </li>
              );
            })}
          </ul>
        </Popover>
        <Popover
          placement="bottom-end"
          aria-label="Signals"
          className="w-72 p-2"
          trigger={
            <button type="button" className="btn-ghost btn-xs" aria-label={`Signals (${signalList.length})`}>
              <Radio size={12} aria-hidden className={showSignals ? 'text-accent' : undefined} />
              <span className="hidden sm:inline">Signals</span>
              <span className="num rounded bg-panel-3 px-1 text-2xs text-muted">{signalList.length}</span>
            </button>
          }
        >
          <Toggle
            size="sm"
            className="px-1"
            checked={showSignals}
            onChange={setShowSignals}
            label="Show signals on the chart"
            description="Smart / KOL buys, spikes, highs, milestones, dev and bundler sells"
          />
          {signalList.length === 0 ? (
            <p className="mt-2 px-1 text-xs text-muted">{signals.isPending ? 'Loading signals…' : 'No signals for this token yet.'}</p>
          ) : (
            <ul className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto border-t border-line px-1 pt-2 text-xs" aria-label="Signals for this token, newest first">
              {signalList.slice(0, SIGNAL_LIST_MAX).map((s) => (
                <SignalLine key={s.id} signal={s} mc />
              ))}
            </ul>
          )}
        </Popover>
        {roomy && <IconButton size="sm" label="Reset zoom" icon={<MoveHorizontal size={14} />} onClick={fitBars} />}
      </div>
      <div className="relative min-w-0" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" onMouseLeave={() => setSignalHover(null)} />
        {signalHover && <SignalTooltip hover={signalHover} width={containerRef.current?.clientWidth ?? 600} />}
        {shown && (
          <div className="pointer-events-none absolute left-2 right-[84px] top-1.5 z-[2] flex flex-wrap items-center gap-x-2 text-2xs text-muted">
            <span>
              O <span className="num text-fg">{withSubscript(formatAxis(shown.bar.open, unit, currency))}</span>
            </span>
            <span>
              H <span className="num text-fg">{withSubscript(formatAxis(shown.bar.high, unit, currency))}</span>
            </span>
            <span>
              L <span className="num text-fg">{withSubscript(formatAxis(shown.bar.low, unit, currency))}</span>
            </span>
            <span>
              C <span className={clsx('num', change !== null && change < 0 ? 'text-down' : 'text-up')}>{withSubscript(formatAxis(shown.bar.close, unit, currency))}</span>
            </span>
            <span>
              V <span className="num text-fg">{currency === 'native' ? `${formatCompact(shown.volume / token.nativeUsd)} ${nativeSymbol}` : formatUsd(shown.volume)}</span>
            </span>
          </div>
        )}
        {candles.isPending && (
          <div className="absolute inset-0 z-[3] flex flex-col gap-2 bg-panel p-3">
            <Skeleton className="h-full w-full" />
          </div>
        )}
        {candles.isError && !candles.data && (
          <div className="absolute inset-0 z-[3] flex items-center justify-center bg-panel">
            <ErrorState compact title="Chart unavailable" error={candles.error} onRetry={() => void candles.refetch()} retrying={candles.isFetching} />
          </div>
        )}
        {empty && (
          <div className="absolute inset-0 z-[3] flex items-center justify-center bg-panel/80">
            <EmptyState compact icon={<CandlestickChart size={16} />} title="No trades yet" description="Candles appear with the first swap." />
          </div>
        )}
      </div>
    </section>
  );
});
