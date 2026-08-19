// ════════════════════════════════════════════════════════════════════════════
// TRADING CHART
//
// lightweight-charts draws the candles, the price scale and the crosshair.
// Everything the library has no primitive for — FVG zones, consolidation
// ranges, trade risk/reward boxes — is drawn on a canvas layered over the pane
// and kept in register by redrawing on pan, zoom and resize.
//
// Colour discipline: candles and trade boxes are the only green/red on screen.
// Support/resistance levels are structural, not directional, so they render in
// graphite. The accent belongs to the crosshair, which is interactive.
//
// Note: the TradingView attribution logo is left enabled — the licence permits
// disabling it only if the attribution notice and link are provided elsewhere.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Logical,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { Candle, ConsolidationZone, FvgZone, Level, PatternHit, Trade } from "../types";
import { cn } from "../lib/utils";

const C = {
  void: "#08090C",
  bay: "#0C0E13",
  rule: "#191D26",
  grid: "rgba(25, 29, 38, 0.75)",
  etch: "#5A6472",
  etchDim: "#3A4250",
  arc: "#00D9FF",
  long: "#00E08A",
  short: "#FF4D5E",
  flat: "#6B7280",
} as const;

/** Cap on overlay shapes per frame, so a thousand-trade result still pans. */
const MAX_SHAPES = 600;

interface TradingChartProps {
  candles: Candle[];
  zones?: { fvg: FvgZone[]; consolidation: ConsolidationZone[] };
  levels?: Level[];
  trades?: Trade[];
  patternHits?: PatternHit[];
  height?: number;
  className?: string;
}

export function TradingChart({
  candles,
  zones,
  levels,
  trades = [],
  patternHits = [],
  height = 520,
  className,
}: TradingChartProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Latest overlay inputs, read by draw() without resubscribing listeners.
  const dataRef = useRef({ candles, zones, trades });
  dataRef.current = { candles, zones, trades };

  // Overlay fades in when its contents change rather than on every pan frame.
  const [overlayVisible, setOverlayVisible] = useState(false);

  // ── Chart lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      layout: {
        background: { type: ColorType.Solid, color: C.void },
        textColor: C.etch,
        fontFamily: '"Azeret Mono", ui-monospace, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      width: host.clientWidth,
      height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: C.rule,
        rightOffset: 4,
      },
      rightPriceScale: {
        borderColor: C.rule,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      crosshair: {
        vertLine: {
          width: 1,
          color: "rgba(0, 217, 255, 0.4)",
          style: LineStyle.Dashed,
          labelBackgroundColor: C.bay,
        },
        horzLine: {
          width: 1,
          color: "rgba(0, 217, 255, 0.4)",
          style: LineStyle.Dashed,
          labelBackgroundColor: C.bay,
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: C.long,
      downColor: C.short,
      borderUpColor: C.long,
      borderDownColor: C.short,
      wickUpColor: "rgba(0, 224, 138, 0.7)",
      wickDownColor: "rgba(255, 77, 94, 0.7)",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    // v5 moved markers out of ISeriesApi into a plugin; the old
    // series.setMarkers() call this replaces was a no-op at runtime.
    markersRef.current = createSeriesMarkers(series, []);

    const draw = () => drawOverlay(chart, series, canvasRef.current, dataRef.current);

    chart.timeScale().subscribeVisibleLogicalRangeChange(draw);

    const observer = new ResizeObserver(() => {
      if (!hostRef.current) return;
      chart.applyOptions({ width: hostRef.current.clientWidth });
      draw();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(draw);
      markersRef.current = null;
      priceLinesRef.current = [];
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [height]);

  // ── Candles ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const rows = Array.isArray(candles) ? candles : [];

    series.setData(
      rows.map((c) => ({
        time: c.time as unknown as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    if (rows.length > 0) chart.timeScale().fitContent();
    drawOverlay(chart, series, canvasRef.current, dataRef.current);
  }, [candles]);

  // ── Support / resistance as native price lines ────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];

    for (const level of Array.isArray(levels) ? levels : []) {
      if (!Number.isFinite(level?.price)) continue;
      priceLinesRef.current.push(
        series.createPriceLine({
          price: level.price,
          color: level.type === "BOTH" ? C.etch : C.etchDim,
          lineWidth: 1,
          lineStyle: level.type === "BOTH" ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: level.type === "SUPPORT" ? "S" : level.type === "RESISTANCE" ? "R" : "S·R",
        })
      );
    }
  }, [levels]);

  // ── Markers: pattern hits, else trade entries/exits ──────────────────────
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;

    let markers: SeriesMarker<Time>[] = [];

    if (patternHits.length > 0) {
      markers = patternHits.map((hit) => ({
        time: hit.time as unknown as Time,
        position: hit.direction === "long" ? "belowBar" : "aboveBar",
        color: hit.direction === "long" ? C.long : C.short,
        shape: hit.direction === "long" ? "arrowUp" : "arrowDown",
        text: hit.pattern_name,
        size: 1,
      }));
    } else if (trades.length > 0) {
      markers = trades.flatMap((trade): SeriesMarker<Time>[] => {
        const tone =
          trade.outcome === "win" ? C.long : trade.outcome === "loss" ? C.short : C.flat;
        const long = trade.direction === "long";

        const entry: SeriesMarker<Time> = {
          time: trade.entry_time as unknown as Time,
          position: long ? "belowBar" : "aboveBar",
          color: tone,
          shape: "circle",
          text: long ? "L" : "S",
          size: 1,
        };

        // Analysis trades carry only a signal timestamp — the store has no exit
        // time — so the outcome is folded into the entry marker's label instead
        // of being drawn at a time that was never recorded.
        if (trade.exit_time == null || trade.exit_time === trade.entry_time) {
          const suffix =
            trade.outcome === "win"
              ? "W"
              : trade.outcome === "loss"
                ? "L"
                : trade.outcome === "timeout"
                  ? "T"
                  : "";
          return [{ ...entry, text: suffix ? `${entry.text}·${suffix}` : entry.text }];
        }

        return [
          entry,
          {
            time: trade.exit_time as unknown as Time,
            position: long ? "aboveBar" : "belowBar",
            color: tone,
            shape: trade.outcome === "no_fill" ? "circle" : "square",
            text:
              trade.outcome === "win"
                ? "W"
                : trade.outcome === "loss"
                  ? "L"
                  : trade.outcome === "timeout"
                    ? "T"
                    : "",
            size: 1,
          },
        ];
      });
      // Markers must be time-ascending or the plugin drops them.
      markers.sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number));
    }

    plugin.setMarkers(markers);
  }, [patternHits, trades]);

  // ── Overlay redraw + fade ────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    setOverlayVisible(false);
    drawOverlay(chart, series, canvasRef.current, dataRef.current);

    const raf = requestAnimationFrame(() => setOverlayVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [zones, trades, candles]);

  return (
    <div className={cn("relative w-full bg-void", className)}>
      <div ref={hostRef} className="w-full" style={{ height }} />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 transition-opacity duration-[420ms]"
        style={{ opacity: overlayVisible ? 1 : 0 }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Overlay rendering
// ═══════════════════════════════════════════════════════════════════════════

interface OverlayData {
  candles: Candle[];
  zones?: { fvg: FvgZone[]; consolidation: ConsolidationZone[] };
  trades: Trade[];
}

/**
 * Map a unix-seconds timestamp to a pane x-coordinate.
 *
 * timeToCoordinate() only answers for times present in the series, but zones
 * routinely start before the first candle or extend past the last one. Times
 * are therefore converted to a fractional logical index against the candle
 * array — interpolating between candles and extrapolating beyond either end at
 * the median bar spacing — and that index is converted to a coordinate.
 */
function makeTimeMapper(candles: Candle[], chart: IChartApi) {
  const times = candles.map((c) => c.time);
  const n = times.length;
  const step = n > 1 ? (times[n - 1] - times[0]) / (n - 1) : 1;
  const timeScale = chart.timeScale();

  return (t: number): number | null => {
    if (n === 0) return null;

    let logical: number;
    if (t <= times[0]) {
      logical = step > 0 ? -(times[0] - t) / step : 0;
    } else if (t >= times[n - 1]) {
      logical = n - 1 + (step > 0 ? (t - times[n - 1]) / step : 0);
    } else {
      // Binary search for the bracketing pair.
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid;
      }
      const span = times[hi] - times[lo];
      logical = lo + (span > 0 ? (t - times[lo]) / span : 0);
    }

    const x = timeScale.logicalToCoordinate(logical as Logical);
    return x == null ? null : x;
  };
}

function drawOverlay(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  canvas: HTMLCanvasElement | null,
  data: OverlayData
): void {
  if (!canvas) return;

  const { width, height } = chart.paneSize();
  if (width <= 0 || height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const series0 = Array.isArray(data.candles) ? data.candles : [];
  if (series0.length === 0) return;

  const xOf = makeTimeMapper(series0, chart);
  const yOf = (price: number) => {
    const y = series.priceToCoordinate(price);
    return y == null ? null : (y as unknown as number);
  };

  /** Clip a span to the pane; returns null when it is entirely off-screen. */
  const spanX = (from: number, to: number): [number, number] | null => {
    const a = xOf(from);
    const b = xOf(to);
    if (a == null || b == null) return null;
    const left = Math.min(a, b);
    const right = Math.max(a, b);
    if (right < 0 || left > width) return null;
    // A zero-width zone still deserves a visible 1px mark.
    return [Math.max(left, 0), Math.max(Math.min(right, width), Math.max(left, 0) + 1)];
  };

  const spanY = (low: number, high: number): [number, number] | null => {
    const a = yOf(high);
    const b = yOf(low);
    if (a == null || b == null) return null;
    const top = Math.min(a, b);
    const bottom = Math.max(a, b);
    if (bottom < 0 || top > height) return null;
    return [Math.max(top, 0), Math.min(bottom, height)];
  };

  let budget = MAX_SHAPES;

  // Array checks rather than `?? []`: a 200 whose `fvg` key holds a non-array
  // would throw on for..of, and an effect-thrown error unmounts the tree the
  // same way a render-thrown one does.
  const fvg = Array.isArray(data.zones?.fvg) ? data.zones.fvg : [];
  const consolidation = Array.isArray(data.zones?.consolidation) ? data.zones.consolidation : [];
  const trades = Array.isArray(data.trades) ? data.trades : [];

  // ── Consolidation ranges: structural, so graphite and dashed ────────────
  for (const zone of consolidation) {
    if (budget-- <= 0) break;
    const xs = spanX(zone.start_time, zone.end_time);
    const ys = spanY(zone.price_low, zone.price_high);
    if (!xs || !ys) continue;

    const [x1, x2] = xs;
    const [y1, y2] = ys;

    ctx.fillStyle = "rgba(90, 100, 114, 0.07)";
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(90, 100, 114, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1 - 1, y2 - y1 - 1);
    ctx.restore();
  }

  // ── Fair value gaps: directional, so long/short ─────────────────────────
  for (const zone of fvg) {
    if (budget-- <= 0) break;
    const xs = spanX(zone.start_time, zone.end_time);
    const ys = spanY(zone.price_low, zone.price_high);
    if (!xs || !ys) continue;

    const [x1, x2] = xs;
    const [y1, y2] = ys;
    const bullish = zone.direction === "bullish";

    ctx.fillStyle = bullish ? "rgba(0, 224, 138, 0.1)" : "rgba(255, 77, 94, 0.1)";
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // Edges only on the boundaries that matter: top and bottom of the gap.
    ctx.strokeStyle = bullish ? "rgba(0, 224, 138, 0.45)" : "rgba(255, 77, 94, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + 0.5);
    ctx.lineTo(x2, y1 + 0.5);
    ctx.moveTo(x1, y2 - 0.5);
    ctx.lineTo(x2, y2 - 0.5);
    ctx.stroke();
  }

  // ── Trade risk / reward boxes (analysis mode) ────────────────────────────
  //
  // A trade with no recorded exit time gets a fixed-width box anchored at entry.
  // Stretching it to an invented exit would draw a duration the backend never
  // reported.
  const ANCHORED_WIDTH = 22;

  for (const trade of trades) {
    if (budget-- <= 0) break;

    const hasExit = trade.exit_time != null && trade.exit_time !== trade.entry_time;

    let x1: number;
    let boxWidth: number;

    if (hasExit) {
      const xs = spanX(trade.entry_time, trade.exit_time as number);
      if (!xs) continue;
      x1 = xs[0];
      boxWidth = Math.max(xs[1] - xs[0], 2);
    } else {
      const x = xOf(trade.entry_time);
      if (x == null || x < -ANCHORED_WIDTH || x > width) continue;
      x1 = Math.max(x, 0);
      boxWidth = Math.min(ANCHORED_WIDTH, width - x1);
      if (boxWidth < 2) continue;
    }

    const yEntry = yOf(trade.entry);
    const ySl = yOf(trade.sl);
    const yTp = yOf(trade.tp);
    if (yEntry == null || ySl == null || yTp == null) continue;

    // Risk: entry → stop.
    ctx.fillStyle = "rgba(255, 77, 94, 0.11)";
    ctx.fillRect(x1, Math.min(yEntry, ySl), boxWidth, Math.abs(ySl - yEntry));

    // Reward: entry → target.
    ctx.fillStyle = "rgba(0, 224, 138, 0.11)";
    ctx.fillRect(x1, Math.min(yEntry, yTp), boxWidth, Math.abs(yTp - yEntry));

    // Entry price, dashed.
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgba(232, 236, 242, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, yEntry + 0.5);
    ctx.lineTo(x1 + boxWidth, yEntry + 0.5);
    ctx.stroke();
    ctx.restore();
  }
}
