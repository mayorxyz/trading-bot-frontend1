import { useState, useEffect } from "react";
import { TradingChart } from "./TradingChart";
import { startAnalysis, getAnalysisStatus, getSymbols } from "../lib/api";
import type { AnalysisResult, Candle, ProfitFactorValue } from "../types";
import { cn } from "../lib/utils";

export function AnalysisView() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch available symbols on mount
  useEffect(() => {
    getSymbols()
      .then(setSymbols)
      .catch((err) => console.error("Failed to fetch symbols:", err));
  }, []);

  const runAnalysis = async () => {
    try {
      setIsRunning(true);
      setStatus("pending");
      setErrorMsg(null);
      setResult(null);

      const { job_id } = await startAnalysis({ symbol, start_date: startDate, end_date: endDate });

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await getAnalysisStatus(job_id);
          setStatus(statusRes.status);

          if (statusRes.status === "done" && statusRes.result) {
            setResult(statusRes.result);
            setIsRunning(false);
            clearInterval(pollInterval);
          } else if (statusRes.status === "error") {
            setErrorMsg(statusRes.error || "Analysis failed");
            setIsRunning(false);
            clearInterval(pollInterval);
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to poll status");
          setIsRunning(false);
          clearInterval(pollInterval);
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(pollInterval);
        if (status !== "done") {
          setIsRunning(false);
        }
      }, 60000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start analysis");
      setIsRunning(false);
      setStatus("error");
    }
  };

  const candles: Candle[] = result?.trades?.length
    ? Array.from({ length: 50 }, (_, i) => {
        const baseTime = result.trades[0]?.entry_time || Math.floor(Date.now() / 1000);
        const time = baseTime - (50 - i) * 3600;
        const price = 44500 + Math.random() * 1000;
        return {
          time,
          open: price,
          high: price + Math.random() * 100,
          low: price - Math.random() * 100,
          close: price + (Math.random() - 0.5) * 100,
          volume: Math.floor(Math.random() * 10000),
        };
      })
    : [];

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-secondary text-foreground border border-border rounded-md px-3 py-2 mono-nums"
          >
            {symbols.length > 0 ? (
              symbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))
            ) : (
              <option value="BTCUSDT">BTC/USDT</option>
            )}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-secondary text-foreground border border-border rounded-md px-3 py-2 text-sm"
          />

          <span className="text-muted-foreground">to</span>

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-secondary text-foreground border border-border rounded-md px-3 py-2 text-sm"
          />

          <button
            onClick={runAnalysis}
            disabled={isRunning}
            className={cn(
              "px-4 py-2 rounded-md font-medium transition-colors",
              isRunning
                ? "bg-secondary text-muted-foreground cursor-not-allowed"
                : "bg-analysis text-white hover:bg-analysis/80"
            )}
          >
            {isRunning ? "Running..." : "Run Analysis"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {status !== "idle" && (
            <>
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  status === "pending" && "bg-yellow-500 animate-pulse",
                  status === "running" && "bg-blue-500 animate-pulse",
                  status === "done" && "bg-win",
                  status === "error" && "bg-loss"
                )}
              />
              <span className="text-analysis font-semibold tracking-wider text-sm">ANALYSIS MODE — HISTORICAL</span>
            </>
          )}
        </div>
      </div>

      {isRunning && (
        <div className="bg-secondary/50 border border-border rounded-md px-4 py-8 text-center">
          <div className="text-muted-foreground mb-2">
            {status === "pending" && "Initializing analysis..."}
            {status === "running" && "Processing historical data..."}
          </div>
          <div className="w-48 h-2 bg-background rounded-full overflow-hidden mx-auto">
            <div
              className="h-full bg-analysis transition-all duration-500"
              style={{ width: status === "pending" ? "20%" : status === "running" ? "60%" : "100%" }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-loss/10 border border-loss rounded-md px-4 py-3 text-loss">
          Error: {errorMsg}
        </div>
      )}

      {result && (
        <>
          <div className="flex-1 min-h-[500px]">
            <TradingChart candles={candles} trades={result.trades} />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Win Rate" value={result.stats.win_rate} format="percent" accent="analysis" />
            <StatCard label="Avg R:R" value={result.stats.avg_rr} format="ratio" accent="analysis" />
            <StatCard label="PF (R)" value={result.stats.pf_R} format="profitFactor" accent="analysis" />
            <StatCard label="Trades" value={result.stats.trade_count} format="number" accent="analysis" />
          </div>

          <div className="bg-card border border-border rounded-md p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Signal Funnel</h3>
            <div className="space-y-2">
              <FunnelRow label="Total Signals" value={result.stats.funnel.total_signals} total={result.stats.funnel.total_signals} accent="analysis" />
              <FunnelRow label="Passed Regime Filter" value={result.stats.funnel.passed_regime} total={result.stats.funnel.total_signals} accent="analysis" />
              <FunnelRow label="Passed Alignment" value={result.stats.funnel.passed_alignment} total={result.stats.funnel.total_signals} accent="analysis" />
              <FunnelRow label="Passed Consolidation" value={result.stats.funnel.passed_consolidation} total={result.stats.funnel.total_signals} accent="analysis" />
              <FunnelRow label="Entered Trades" value={result.stats.funnel.entered_trades} total={result.stats.funnel.total_signals} accent="win" />
            </div>
          </div>
        </>
      )}

      {!isRunning && !result && !errorMsg && status === "idle" && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="text-4xl mb-4">📊</div>
            <p>Select a date range and click "Run Analysis" to view historical performance.</p>
          </div>
        </div>
      )}
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
  value?: number | ProfitFactorValue;
  format: "percent" | "ratio" | "number" | "profitFactor";
  accent: "live" | "analysis";
}) {
  let formattedValue = "--";
  
  if (value !== undefined) {
    if (format === "profitFactor" && typeof value === "object" && value !== null) {
      const pfValue = value as ProfitFactorValue;
      formattedValue = pfValue.profit_factor_R_infinite ? "∞" : 
        pfValue.profit_factor_R !== null ? pfValue.profit_factor_R.toFixed(2) : "--";
    } else if (typeof value === "number") {
      formattedValue = format === "percent"
        ? `${(value * 100).toFixed(1)}%`
        : format === "ratio"
        ? value.toFixed(2)
        : value.toString();
    }
  }

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

function FunnelRow({
  label,
  value,
  total,
  accent,
}: {
  label: string;
  value: number;
  total: number;
  accent: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-40">{label}</span>
      <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: accent === "win" ? "#22c55e" : "#f59e0b" }}
        />
      </div>
      <span className="text-xs font-mono w-16 text-right">{value}</span>
    </div>
  );
}
