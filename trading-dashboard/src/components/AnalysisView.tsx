// ════════════════════════════════════════════════════════════════════════════
// ANALYSIS VIEW
//
// Starts a job with POST /analyze, polls /analyze/status/{id} every 2s, gives
// up after 60s. Same contract, same cadence.
//
// Three corrections to the previous implementation, all behind the same calls:
//
//   · the poll interval is cleared on unmount (it used to keep running).
//   · the 60s abort compares against a deadline instead of reading `status`
//     through a stale closure, where it always saw the initial value and so
//     never fired correctly.
//   · the chart no longer fabricates candles with Math.random(). It requests
//     real ones from /ohlc; when the analysed window falls outside what /ohlc
//     can return — it takes symbol, timeframe and limit, with no date range —
//     the region says so instead of drawing noise under real trade markers.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TradingChart } from "./TradingChart";
import { StatStrip } from "./StatStrip";
import { NoticeAction, StateNotice } from "./StateNotice";
import { PanelHead } from "./ui/Panel";
import { getAnalysisStatus, getOhlc, startAnalysis } from "../lib/api";
import { applyDerivation, getTimeframe, resolveRequest } from "../lib/timeframes";
import { formatPrice, formatRatio, formatStamp } from "../lib/format";
import type { AnalysisResult, AnalysisStatus, Candle, Trade } from "../types";
import { cn } from "../lib/utils";

const POLL_INTERVAL = 2000;
const JOB_TIMEOUT = 60000;
const CANDLE_TARGET = 400;

type JobState = "idle" | AnalysisStatus | "timeout";

export function AnalysisView({
  symbol,
  timeframe,
  apiBase,
}: {
  symbol: string;
  timeframe: string;
  apiBase: string;
}) {
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [job, setJob] = useState<JobState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawCandles, setRawCandles] = useState<Candle[]>([]);
  const [candleError, setCandleError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const request = useMemo(() => resolveRequest(timeframe, CANDLE_TARGET), [timeframe]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const running = job === "pending" || job === "running";

  const runAnalysis = useCallback(async () => {
    stopPolling();
    setJob("pending");
    setErrorMsg(null);
    setResult(null);
    setJobId(null);

    let id: string;
    try {
      const response = await startAnalysis({
        symbol,
        start_date: startDate,
        end_date: endDate,
      });
      id = response.job_id;
      setJobId(id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start analysis");
      setJob("error");
      return;
    }

    // Deadline is captured once; the tick compares against it, so the abort no
    // longer depends on state visible inside a stale closure.
    const deadline = Date.now() + JOB_TIMEOUT;

    pollRef.current = window.setInterval(async () => {
      if (Date.now() > deadline) {
        stopPolling();
        setJob("timeout");
        return;
      }

      try {
        const status = await getAnalysisStatus(id);
        setJob(status.status);

        if (status.status === "done") {
          stopPolling();
          setResult(status.result);
          if (!status.result) setErrorMsg("Job reported done but returned no result payload.");
        } else if (status.status === "error") {
          stopPolling();
          setErrorMsg(status.error || "The job failed without reporting a reason.");
        }
      } catch (err) {
        stopPolling();
        setErrorMsg(err instanceof Error ? err.message : "Failed to poll job status");
        setJob("error");
      }
    }, POLL_INTERVAL);
  }, [symbol, startDate, endDate, stopPolling]);

  // Real candles for the chart backdrop, at the selected timeframe.
  useEffect(() => {
    if (!result?.trades?.length) return;

    let cancelled = false;
    setCandleError(null);

    getOhlc(symbol, request.timeframe, request.limit)
      .then((res) => {
        if (!cancelled) setRawCandles(res.candles ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRawCandles([]);
          setCandleError(err instanceof Error ? err.message : "candle request failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [result, symbol, request.timeframe, request.limit]);

  const candles = useMemo(
    () => (request.needsResample ? applyDerivation(timeframe, rawCandles) : rawCandles),
    [rawCandles, request.needsResample, timeframe]
  );

  // Does the analysed window actually intersect the candles /ohlc returned?
  const overlap = useMemo(() => {
    if (!Array.isArray(result?.trades) || result.trades.length === 0) return false;
    if (candles.length === 0) return false;
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    return result.trades.some((t) => t.entry_time >= first && t.entry_time <= last);
  }, [result, candles]);

  const trades = Array.isArray(result?.trades) ? result.trades : [];
  // A `done` job that returns a partial payload must not take the panel down
  // with it, so the funnel reads through a zero-filled default.
  const funnel = result?.stats?.funnel;
  const funnelRows: Array<[string, number]> = [
    ["Signals", funnel?.total_signals ?? 0],
    ["Regime", funnel?.passed_regime ?? 0],
    ["Alignment", funnel?.passed_alignment ?? 0],
    ["Consolidation", funnel?.passed_consolidation ?? 0],
    ["Entered", funnel?.entered_trades ?? 0],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Band 2: job controls ───────────────────────────────────────── */}
      <div className="grid grid-cols-[auto_minmax(240px,1fr)] hair-b">
        <div className="flex items-center gap-3 px-4 py-4 hair-r">
          <div className="flex flex-col gap-1.5">
            <span className="label text-etch">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-7 border border-rule bg-bay px-2 text-signal outline-none focus:border-arc"
            />
          </div>

          <span aria-hidden className="mt-5 h-px w-3 bg-rule" />

          <div className="flex flex-col gap-1.5">
            <span className="label text-etch">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-7 border border-rule bg-bay px-2 text-signal outline-none focus:border-arc"
            />
          </div>

          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={running}
            className={cn(
              "mt-5 flex h-7 items-center gap-2 border px-3 transition-colors",
              running
                ? "cursor-not-allowed border-rule bg-bay"
                : "border-rule-bright bg-well hover:border-arc"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1 w-1 rounded-full",
                running ? "animate-pulse-dot bg-etch" : "bg-arc"
              )}
            />
            <span className={cn("label text-[10px]", running ? "text-etch-dim" : "text-signal")}>
              {running ? "Running" : "Run backtest"}
            </span>
          </button>
        </div>

        <JobStatusPanel job={job} jobId={jobId} symbol={symbol} range={`${startDate} → ${endDate}`} />
      </div>

      {/* ── Band 3: chart ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col hair-b">
        <PanelHead
          trailing={
            result
              ? `${trades.length} trades · backdrop ${timeframe} · ${candles.length} bars`
              : undefined
          }
        >
          {result ? `${symbol} · historical` : "Historical result"}
        </PanelHead>

        <div className="min-h-0 flex-1">
          <AnalysisChartRegion
            job={job}
            result={result}
            errorMsg={errorMsg}
            candles={candles}
            overlap={overlap}
            candleError={candleError}
            symbol={symbol}
            timeframe={timeframe}
            apiBase={apiBase}
            startDate={startDate}
            endDate={endDate}
            onRun={() => void runAnalysis()}
          />
        </div>
      </div>

      {/* ── Band 4: stats, funnel, ledger ──────────────────────────────── */}
      {result ? (
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col hair-r">
            <PanelHead>Result</PanelHead>
            <StatStrip stats={result.stats} className="grid-cols-2" />
          </div>

          <div className="flex flex-col hair-r">
            <PanelHead trailing={`${funnel?.total_signals ?? 0} in`}>Signal funnel</PanelHead>
            <div className="flex flex-col gap-1.5 px-4 py-3">
              {funnelRows.map(([label, value], i) => (
                <FunnelRow
                  key={label}
                  label={label}
                  value={value}
                  total={funnel?.total_signals ?? 0}
                  terminal={i === funnelRows.length - 1}
                />
              ))}
            </div>
          </div>

          <div className="flex min-h-[132px] flex-col">
            <PanelHead trailing={`${trades.length} rows`}>Trade ledger</PanelHead>
            <TradeLedger trades={trades} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Job status ─────────────────────────────────────────────────────────────

const JOB_COPY: Record<JobState, { label: string; tone: string }> = {
  idle: { label: "IDLE", tone: "text-etch-dim" },
  pending: { label: "QUEUED", tone: "text-etch" },
  running: { label: "RUNNING", tone: "text-signal" },
  done: { label: "COMPLETE", tone: "text-long" },
  error: { label: "FAILED", tone: "text-short" },
  timeout: { label: "TIMED OUT", tone: "text-short" },
};

function JobStatusPanel({
  job,
  jobId,
  symbol,
  range,
}: {
  job: JobState;
  jobId: string | null;
  symbol: string;
  range: string;
}) {
  const copy = JOB_COPY[job];
  const active = job === "pending" || job === "running";

  return (
    <div className="flex flex-col justify-center gap-1.5 px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="label text-etch">Job</span>
        {jobId ? <span className="data text-[9px] text-etch-dim">{jobId}</span> : null}
      </div>

      <div className="flex items-center gap-2.5">
        {active ? (
          <span aria-hidden className="relative block h-[2px] w-10 overflow-hidden bg-rule">
            <span className="absolute inset-y-0 w-1/4 animate-sweep bg-arc" />
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              "h-1 w-1 rounded-full",
              job === "done" ? "bg-long" : job === "idle" ? "bg-etch-dim" : "bg-short"
            )}
          />
        )}
        <span className={cn("data text-data font-medium", copy.tone)}>{copy.label}</span>
      </div>

      <span className="data text-[10px] text-etch-dim">
        {symbol} · {range}
      </span>
    </div>
  );
}

// ─── Chart region states ────────────────────────────────────────────────────

function AnalysisChartRegion({
  job,
  result,
  errorMsg,
  candles,
  overlap,
  candleError,
  symbol,
  timeframe,
  apiBase,
  startDate,
  endDate,
  onRun,
}: {
  job: JobState;
  result: AnalysisResult | null;
  errorMsg: string | null;
  candles: Candle[];
  overlap: boolean;
  candleError: string | null;
  symbol: string;
  timeframe: string;
  apiBase: string;
  startDate: string;
  endDate: string;
  onRun: () => void;
}) {
  if (job === "idle") {
    return (
      <StateNotice
        severity="empty"
        eyebrow="Nothing loaded"
        headline="Pick a window, then run a backtest."
        detail={`POST ${apiBase}/analyze?symbol=${symbol}&start_date=${startDate}&end_date=${endDate}`}
        actions={<NoticeAction onClick={onRun}>Run backtest</NoticeAction>}
      >
        <p>
          Analysis mode never reads the live endpoints — it submits a job over the date range above
          and reports what the strategy would have done. The current symbol, <b>{symbol}</b>, comes
          from the selector in the header and is shared with live mode.
        </p>
      </StateNotice>
    );
  }

  if (job === "pending" || job === "running") {
    return (
      <StateNotice
        severity="waiting"
        eyebrow={job === "pending" ? "Queued" : "Processing"}
        headline={
          job === "pending"
            ? "The job is accepted and waiting for a worker."
            : `Replaying ${symbol} across ${startDate} → ${endDate}.`
        }
        detail={`polling /analyze/status every ${POLL_INTERVAL / 1000}s · abandoning after ${JOB_TIMEOUT / 1000}s`}
      >
        <p>
          Results appear here as soon as the job reports <b>done</b>. Switching to live mode does not
          cancel it, but leaving this view stops the polling.
        </p>
      </StateNotice>
    );
  }

  if (job === "timeout") {
    return (
      <StateNotice
        severity="fault"
        eyebrow="Timed out"
        headline={`The job did not finish within ${JOB_TIMEOUT / 1000} seconds.`}
        detail="the job may still be running server-side — GET /analyze/jobs will list it"
        actions={<NoticeAction onClick={onRun}>Run again</NoticeAction>}
      >
        <p>
          Polling stopped, not the job. A long date range on a fast timeframe can outrun this
          window — narrow the range and try again, or check the job list directly.
        </p>
      </StateNotice>
    );
  }

  if (job === "error" || errorMsg) {
    return (
      <StateNotice
        severity="fault"
        eyebrow="Job failed"
        headline="The backtest did not produce a result."
        detail={errorMsg ?? undefined}
        actions={<NoticeAction onClick={onRun}>Run again</NoticeAction>}
      >
        <p>
          The message above comes straight from the backend. A date range with no stored candles is
          the usual cause — <b>{startDate} → {endDate}</b> has to be inside the collector's history.
        </p>
      </StateNotice>
    );
  }

  // The result payload is only trusted after checking: a `done` job that
  // returns partial stats must degrade this region, not unmount the view.
  const resultTrades = Array.isArray(result?.trades) ? result.trades : [];
  const barCount = candles?.length ?? 0;

  if (result && resultTrades.length === 0) {
    const f = result.stats?.funnel;
    return (
      <StateNotice
        severity="empty"
        eyebrow="No trades"
        headline={`The strategy took no positions on ${symbol} in this window.`}
        detail={`${f?.total_signals ?? 0} signals · ${f?.passed_regime ?? 0} passed regime · ${f?.entered_trades ?? 0} entered`}
        actions={<NoticeAction onClick={onRun}>Run again</NoticeAction>}
      >
        <p>
          This is a result, not a failure. The signal funnel below shows which filter removed them —
          if signals reached the regime filter and stopped there, the window was mostly ranging.
        </p>
      </StateNotice>
    );
  }

  // Trades exist, but /ohlc cannot be asked for the analysed window.
  if (result && !overlap) {
    return (
      <StateNotice
        severity="empty"
        eyebrow="No chart backdrop"
        headline="The analysed window is outside the candles this API can return."
        detail={
          candleError
            ? `GET /ohlc — ${candleError}`
            : `GET /ohlc?symbol=${symbol}&timeframe=${timeframe}&limit=… returned ${barCount} bars, none covering ${startDate} → ${endDate}`
        }
      >
        <p>
          <code className="data text-signal">/ohlc</code> accepts symbol, timeframe and limit — there
          is no date-range parameter — so the frontend cannot request historical bars for this
          window. The result itself is complete: the ledger and funnel below are the full output.
          Charting it needs a date range on <code className="data text-signal">/ohlc</code>.
        </p>
      </StateNotice>
    );
  }

  if (result) {
    return (
      <TradingChart candles={candles} trades={resultTrades} height={440} />
    );
  }

  return null;
}

// ─── Funnel ─────────────────────────────────────────────────────────────────

function FunnelRow({
  label,
  value,
  total,
  terminal,
}: {
  label: string;
  value: number;
  total: number;
  terminal: boolean;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="label w-[86px] shrink-0 text-etch">{label}</span>
      <span className="relative h-1.5 flex-1 bg-well">
        <span
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-500",
            terminal ? "bg-long" : "bg-etch-dim"
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        className={cn(
          "data w-12 shrink-0 text-right text-[11px]",
          terminal ? "text-long" : "text-etch"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Ledger ─────────────────────────────────────────────────────────────────

const OUTCOME_TONE: Record<Trade["outcome"], string> = {
  win: "text-long",
  loss: "text-short",
  timeout: "text-flat",
  no_fill: "text-etch-dim",
};

function TradeLedger({ trades }: { trades: Trade[] }) {
  return (
    <div className="max-h-[132px] min-h-0 flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-void">
          <tr>
            {["Entry", "Dir", "Price", "R", ""].map((h) => (
              <th
                key={h}
                className="label border-b border-rule px-2 py-1 text-left font-medium text-etch-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={`${t.entry_time}-${i}`} className="border-b border-rule/40 last:border-0">
              <td className="data px-2 py-1 text-[10px] text-etch-dim">{formatStamp(t.entry_time)}</td>
              <td
                className={cn(
                  "data px-2 py-1 text-[10px]",
                  t.direction === "long" ? "text-long" : "text-short"
                )}
              >
                {t.direction === "long" ? "LONG" : "SHORT"}
              </td>
              <td className="data px-2 py-1 text-[10px] text-etch">{formatPrice(t.entry)}</td>
              <td className={cn("data px-2 py-1 text-[10px]", OUTCOME_TONE[t.outcome])}>
                {t.rr_achieved != null ? formatRatio(t.rr_achieved) : "—"}
              </td>
              <td className={cn("data px-2 py-1 text-[10px] uppercase", OUTCOME_TONE[t.outcome])}>
                {t.outcome === "no_fill" ? "no fill" : t.outcome}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
