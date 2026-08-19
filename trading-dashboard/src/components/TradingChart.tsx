import { useEffect, useRef } from "react";
import { createChart, ColorType, Time } from "lightweight-charts";
import type { Candle, FvgZone, ConsolidationZone, Level, Trade, PatternHit } from "../types";
import { cn } from "../lib/utils";

interface TradingChartProps {
  candles: Candle[];
  zones?: { fvg: FvgZone[]; consolidation: ConsolidationZone[] };
  levels?: Level[];
  trades?: Trade[];
  patternHits?: PatternHit[];
  className?: string;
}

export function TradingChart({
  candles,
  zones,
  levels,
  trades = [],
  patternHits = [],
  className,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#3f3f46",
      },
      rightPriceScale: {
        borderColor: "#3f3f46",
      },
      crosshair: {
        vertLine: {
          width: 1,
          color: "#52525b",
          labelBackgroundColor: "#09090b",
        },
        horzLine: {
          width: 1,
          color: "#52525b",
          labelBackgroundColor: "#09090b",
        },
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    candleSeriesRef.current = candleSeries;

    const candleData = candles.map((c) => ({
      time: c.time as unknown as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeries.setData(candleData);

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const series = candleSeriesRef.current;

    if (patternHits.length > 0) {
      const markers = patternHits.map((hit) => ({
        time: hit.time as unknown as Time,
        position: hit.direction === "long" ? "belowBar" : "aboveBar" as const,
        color: hit.direction === "long" ? "#22c55e" : "#ef4444",
        shape: hit.direction === "long" ? "arrowUp" : "arrowDown" as const,
        text: hit.pattern_name,
        size: 2,
      }));
      series.setMarkers(markers);
    } else if (trades.length > 0) {
      const tradeMarkers = trades.flatMap((trade) => {
        const entryMarker = {
          time: trade.entry_time as unknown as Time,
          position: trade.direction === "long" ? "belowBar" : "aboveBar" as const,
          color: trade.outcome === "win" ? "#22c55e" : trade.outcome === "loss" ? "#ef4444" : "#71717a",
          shape: "circle" as const,
          text: trade.direction.toUpperCase().charAt(0),
          size: 1.5,
        };

        const exitMarker = {
          time: trade.exit_time as unknown as Time,
          position: trade.direction === "long" ? "aboveBar" : "belowBar" as const,
          color: trade.outcome === "win" ? "#22c55e" : trade.outcome === "loss" ? "#ef4444" : "#71717a",
          shape: trade.outcome === "no_fill" ? "circle" : ("square" as const),
          text: trade.outcome === "no_fill" ? "" : (trade.outcome === "win" ? "W" : trade.outcome === "loss" ? "L" : "T"),
          size: 1.5,
        };

        return [entryMarker, exitMarker];
      });

      series.setMarkers(tradeMarkers);
    } else {
      series.setMarkers([]);
    }
  }, [zones, levels, trades, patternHits, candles]);

  return (
    <div className={cn("w-full bg-[#09090b] rounded-md overflow-hidden border border-border", className)}>
      <div ref={chartContainerRef} className="w-full" style={{ height: "500px" }} />
    </div>
  );
}
