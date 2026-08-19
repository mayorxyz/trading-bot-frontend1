import { useEffect, useState } from "react";
import { TradingChart } from "./TradingChart";
import { getLiveState, getZones, getLevels, getLiveStats, getOhlc } from "../lib/api";
import type { LiveState, ZonesResponse, LevelsResponse, LiveStats, Candle, PatternHit } from "../types";
import { cn } from "../lib/utils";

const TIMEFRAMES = ["1D", "4H", "1H"];
const POLL_INTERVAL = 20000;

export function LiveView() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("4H");
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [zones, setZones] = useState<ZonesResponse | null>(null);
  const [levels, setLevels] = useState<LevelsResponse | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [stateRes, zonesRes, levelsRes, statsRes, ohlcRes] = await Promise.all([
        getLiveState(symbol),
        getZones(symbol, timeframe),
        getLevels(symbol, timeframe),
        getLiveStats(symbol),
        getOhlc(symbol, timeframe, 100),
      ]);

      setLiveState(stateRes);
      setZones(zonesRes);
      setLevels(levelsRes);
      setStats(statsRes);
      setCandles(ohlcRes.candles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  const patternHits: PatternHit[] = [];
  const isTradable = liveState?.current_skip_reason === null;

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-secondary text-foreground border border-border rounded-md px-3 py-2 mono-nums"
          >
            <option value="BTCUSDT">BTC/USDT</option>
            <option value="ETHUSDT">ETH/USDT</option>
            <option value="SOLUSDT">SOL/USDT</option>
          </select>
          <div className="flex gap-1 bg-secondary rounded-md p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-3 py-1.5 rounded text-sm font-medium transition-colors mono-nums",
                  timeframe === tf
                    ? "bg-live text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
          <span className="text-live font-semibold tracking-wider text-sm">LIVE</span>
        </div>
      </div>

      {!isTradable && liveState?.current_skip_reason && (
        <div className="bg-secondary/50 border border-border rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-neutral" />
          <span className="text-muted-foreground text-sm">
            NOT TRADABLE: <span className="text-foreground font-mono">{liveState.current_skip_reason}</span>
          </span>
        </div>
      )}

      {liveState && (
        <div className="flex gap-2">
          {Object.entries(liveState.bias).map(([tf, bias]) => (
            <div
              key={tf}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold tracking-wider border",
                bias === "LONG" && "bg-win/10 border-win text-win",
                bias === "SHORT" && "bg-loss/10 border-loss text-loss",
                bias === "NEUTRAL" && "bg-neutral/10 border-neutral text-neutral"
              )}
            >
              {tf}: {bias}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-[500px]">
        {loading && candles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-loss">
            Error: {error}
          </div>
        ) : (
          <TradingChart
            candles={candles}
            zones={zones || undefined}
            levels={levels?.levels}
            patternHits={patternHits}
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Win Rate" value={stats?.win_rate} format="percent" accent="live" />
        <StatCard label="Avg R:R" value={stats?.avg_rr} format="ratio" accent="live" />
        <StatCard label="PF (R)" value={stats?.pf_R} format="ratio" accent="live" />
        <StatCard label="Trades" value={stats?.trade_count} format="number" accent="live" />
      </div>

      <div className="bg-card border border-border rounded-md p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Skip Reason Feed</h3>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {liveState?.recent_skips.map((skip, idx) => (
            <div key={idx} className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">
                {new Date(skip.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-foreground">{skip.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  format,
  accent,
}: {
  label: string;
  value?: number;
  format: "percent" | "ratio" | "number";
  accent: "live" | "analysis";
}) {
  const formattedValue =
    value === undefined
      ? "--"
      : format === "percent"
      ? `${(value * 100).toFixed(1)}%`
      : format === "ratio"
      ? value.toFixed(2)
      : value.toString();

  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div
        className={cn(
          "text-2xl font-bold mono-nums",
          accent === "live" ? "text-live" : "text-analysis"
        )}
      >
        {formattedValue}
      </div>
    </div>
  );
}
