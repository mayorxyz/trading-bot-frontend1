// ════════════════════════════════════════════════════════════════════════════
// ANALYSIS VIEW
//
// Starts a job with POST /analyze, polls /analyze/status/{id} every 2s, gives up
// after 60s. Never touches the live endpoints.
//
// Two things the real backend contract forces, both surfaced rather than papered
// over:
//
//   · Analysis trades store only a signal timestamp — there is no exit time — so
//     the chart draws entry-anchored risk/reward boxes and folds the outcome into
//     the entry marker. No duration is invented.
//   · /ohlc takes symbol, timeframe and limit with no date range, so a window
//     older than the most recent `limit` bars cannot be charted. When that
//     happens the region says so and the ledger carries the full result.
//
// Nothing here generates candles or statistics. The previous implementation drew
// 50 bars of Math.random() noise behind real trade markers; that is gone.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TradingChart } from "./TradingChart";
import { StatStrip } from "./StatStrip";
import { NoticeAction, StateNotice } from "./StateNotice";
import { IDLE_PREDICTION, PredictionPanel, type PredictionState } from "./PredictionPanel";
import { PanelHead } from "./ui/Panel";
import { ApiError, getAnalysisStatus, getOhlc, postPredict, startAnalysis } from "../lib/api";
import { applyDerivation, nativeTimeframes, resolveRequest } from "../lib/timeframes";
import { formatCount, formatPrice, formatRatio, formatStamp } from "../lib/format";
import type { AnalysisResult, AnalysisStatus, Candle, FunnelBreakdown, Trade } from "../types";
import { cn } from "../lib/utils";

const POLL_INTERVAL = 2000;
const JOB_TIMEOUT = 60000;
const CANDLE_TARGET = 500;

type JobState = "idle" | AnalysisStatus | "timeout";

export function AnalysisView({
  symbol,
  timeframe,
  available,
  apiBase,
  symbolConfirmed,
  catalogLoaded,
  symbolsError,
  backtestableCount,
}: {
  symbol: string;
  timeframe: string;
  available: string[];
  apiBase: string;
  /**
   * True only when /symbols has answered and `symbol` matches an entry exactly.
   * Nothing is submitted to /analyze while this is false: the symbol may be a
   * stale localStorage value (a hand-edited or renamed pair such as "BTCUSD"),
   * which the backend would accept as a request and then fail to find data for.
   */
  symbolConfirmed: boolean;
  catalogLoaded: boolean;
  symbolsError: string | null;
  /** How many symbols have CSV history, for the blocked-state copy. */
  backtestableCount: number;
}) {
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-08-01");
  const [job, setJob] = useState<JobState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [jobTimeframe, setJobTimeframe] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawCandles, setRawCandles] = useState<Candle[]>([]);
  const [candleError, setCandleError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const request = useMemo(
    () => resolveRequest(timeframe, CANDLE_TARGET, available),
    [timeframe, available]
  );

  // ── "Run Analysis" — POST /predict ──────────────────────────────────────
  //
  // Entirely separate from the backtest below: no job queue, no date range, no
  // persistence, and deliberately NOT gated on symbolConfirmed. /predict pulls
  // its own candles from Bybit, so it answers for any listed pair — including
  // chart-only symbols with no CSV history to backtest against.
  const [prediction, setPrediction] = useState<PredictionState>(IDLE_PREDICTION);
  const predictGeneration = useRef(0);

  const runPredict = useCallback(async () => {
    const gen = ++predictGeneration.current;
    setPrediction({ status: "running", data: null, error: null, errorStatus: null });

    try {
      const result = await postPredict(symbol, timeframe);
      if (gen !== predictGeneration.current) return;
      setPrediction({ status: "ready", data: result, error: null, errorStatus: null });
    } catch (err) {
      if (gen !== predictGeneration.current) return;
      setPrediction({
        status: "error",
        data: null,
        error: err instanceof Error ? err.message : "request failed",
        // 422 is the documented "not enough live history yet" case; the panel
        // words that differently from a genuine fault.
        errorStatus: err instanceof ApiError ? err.status : null,
      });
    }
  }, [symbol, timeframe]);

  // A prediction is a point-in-time reading of one symbol at one timeframe, so it
  // is dropped when either changes rather than left labelled with the new pair.
  useEffect(() => {
    predictGeneration.current++;
    setPrediction(IDLE_PREDICTION);
  }, [symbol, timeframe]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const running = job === "pending" || job === "running";
  const predicting = prediction.status === "running";
  const runAnalysis = useCallback(async () => {
    // Last line of defence. The button is disabled in this state, but a hotkey,
    // a retry action or a future call site must not be able to bypass it: the
    // only symbols that may reach /analyze are the ones /symbols returned.
    if (!symbolConfirmed) {
      setJob("error");
      setErrorMsg(
        `Refusing to submit "${symbol}" — it is not in the list GET /symbols returned. ` +
          (catalogLoaded
            ? "Pick a symbol from the selector."
            : "Waiting for /symbols to answer.")
      );
      return;
    }

    stopPolling();
    setJob("pending");
    setErrorMsg(null);
    setResult(null);
    setJobId(null);
    setJobTimeframe(null);

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

    // Deadline captured once; the tick compares against it, so the abort no
    // longer depends on state read through a stale closure.
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
        setJobTimeframe(status.timeframe);

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
  }, [symbol, startDate, endDate, stopPolling, symbolConfirmed, catalogLoaded]);

  // Real candles for the chart backdrop. Skipped when the selected timeframe has
  // no data path for this symbol.
  useEffect(() => {
    if (!result?.trades?.length || !request) {
      setRawCandles([]);
      return;
    }

    let cancelled = false;
    setCandleError(null);

    getOhlc(symbol, request.timeframe, request.limit)
      .then((res) => {
        if (!cancelled) setRawCandles(res.candles);
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
  }, [result, symbol, request]);

  const candles = useMemo(() => {
    const rows = Array.isArray(rawCandles) ? rawCandles : [];
    return request?.needsResample ? applyDerivation(timeframe, rows) : rows;
  }, [rawCandles, request?.needsResample, timeframe]);

  // Does the analysed window intersect the candles /ohlc returned?
  const overlap = useMemo(() => {
    if (!Array.isArray(result?.trades) || result.trades.length === 0) return false;
    if (candles.length === 0) return false;
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    return result.trades.some((t) => t.entry_time >= first && t.entry_time <= last);
  }, [result, candles]);

  const trades = Array.isArray(result?.trades) ? result.trades : [];
  const funnel = result?.stats?.funnel;

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
            disabled={running || !symbolConfirmed}
            title={
              symbolConfirmed
                ? undefined
                : catalogLoaded
                  ? `"${symbol}" is not one of the symbols GET /symbols returned`
                  : "Waiting for GET /symbols"
            }
            className={cn(
              "mt-5 flex h-7 items-center gap-2 border px-3 transition-colors",
              running || !symbolConfirmed
                ? "cursor-not-allowed border-rule bg-bay"
                : "border-rule-bright bg-well hover:border-arc"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1 w-1 rounded-full",
                running ? "animate-pulse-dot bg-etch" : symbolConfirmed ? "bg-arc" : "bg-etch-dim"
              )}
            />
            <span
              className={cn(
                "label text-[10px]",
                running || !symbolConfirmed ? "text-etch-dim" : "text-signal"
              )}
            >
              {running ? "Running" : "Run backtest"}
            </span>
          </button>

          <span aria-hidden className="mt-5 h-7 w-px bg-rule" />

          {/* Separate action, separate endpoint. Ungated: /predict fetches its
              own live candles and needs no CSV history. */}
          <button
            type="button"
            onClick={() => void runPredict()}
            disabled={predicting}
            title={`POST /predict — one stateless pipeline run on live ${timeframe} candles for ${symbol}`}
            className={cn(
              "mt-5 flex h-7 items-center gap-2 border px-3 transition-colors",
              predicting
                ? "cursor-not-allowed border-rule bg-bay"
                : "border-rule-bright bg-well hover:border-arc"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1 w-1 rounded-full",
                predicting ? "animate-pulse-dot bg-etch" : "bg-arc"
              )}
            />
            <span className={cn("label text-[10px]", predicting ? "text-etch-dim" : "text-signal")}>
              {predicting ? "Analysing" : "Run analysis"}
            </span>
          </button>
        </div>

        <JobStatusPanel
          job={job}
          jobId={jobId}
          symbol={symbol}
          range={`${startDate} → ${endDate}`}
          jobTimeframe={jobTimeframe}
        />
      </div>

      {/* ── Live signal result (Run analysis). Absent until first run, and
             independent of the backtest bands below. ─────────────────────── */}
      <PredictionPanel
        state={prediction}
        symbol={symbol}
        timeframe={timeframe}
        onRetry={() => void runPredict()}
      />

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
            available={available}
            hasCandlePath={request !== null}
            apiBase={apiBase}
            startDate={startDate}
            endDate={endDate}
            symbolConfirmed={symbolConfirmed}
            catalogLoaded={catalogLoaded}
            symbolsError={symbolsError}
            backtestableCount={backtestableCount}
            onRun={() => void runAnalysis()}
          />
        </div>
      </div>

      {/* ── Band 4: stats, funnel, ledger ──────────────────────────────── */}
      {result ? (
        <div className="grid shrink-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col hair-r">
            <PanelHead
              trailing={`${result.stats.wins}W / ${result.stats.losses}L`}
            >
              Result
            </PanelHead>
            <StatStrip stats={result.stats} className="grid-cols-2" />
          </div>

          <div className="flex flex-col hair-r">
            <PanelHead trailing={`${formatCount(funnel?.total)} test points`}>
              Rejection breakdown
            </PanelHead>
            <FunnelPanel funnel={funnel} />
          </div>

          <div className="flex min-h-[148px] flex-col">
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
  jobTimeframe,
}: {
  job: JobState;
  jobId: string | null;
  symbol: string;
  range: string;
  jobTimeframe: string | null;
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
        {jobTimeframe ? ` · ${jobTimeframe}` : ""}
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
  available,
  hasCandlePath,
  apiBase,
  startDate,
  endDate,
  symbolConfirmed,
  catalogLoaded,
  symbolsError,
  backtestableCount,
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
  available: string[];
  hasCandlePath: boolean;
  apiBase: string;
  startDate: string;
  endDate: string;
  symbolConfirmed: boolean;
  catalogLoaded: boolean;
  symbolsError: string | null;
  backtestableCount: number;
  onRun: () => void;
}) {
  const resultTrades = Array.isArray(result?.trades) ? result.trades : [];
  const barCount = candles?.length ?? 0;

  // The symbol cannot be submitted yet. Explain which of the two reasons it is,
  // because the fix differs: wait, versus pick a different symbol.
  if (!symbolConfirmed && job === "idle") {
    if (!catalogLoaded) {
      return (
        <StateNotice
          severity={symbolsError ? "fault" : "waiting"}
          eyebrow={symbolsError ? "Symbol list unavailable" : "Verifying symbol"}
          headline={
            symbolsError
              ? "The symbol list could not be loaded, so no backtest can be submitted."
              : "Waiting for the authoritative symbol list."
          }
          detail={
            symbolsError
              ? `GET ${apiBase}/symbols — ${symbolsError}`
              : `GET ${apiBase}/symbols`
          }
        >
          <p>
            A backtest is only submitted with a symbol spelled exactly as{" "}
            <code className="data text-signal">/symbols</code> reports it. The restored selection is{" "}
            <b>{symbol}</b>, but until that list arrives there is no way to tell a real pair from a
            stale one, so <b>Run backtest</b> stays disabled.
          </p>
        </StateNotice>
      );
    }

    return (
      <StateNotice
        severity="empty"
        eyebrow="Symbol not backtestable"
        headline={`“${symbol}” is not a symbol this backend can backtest.`}
        detail={`GET /symbols lists ${backtestableCount} symbol${backtestableCount === 1 ? "" : "s"} with CSV history`}
        actions={<NoticeAction onClick={onRun}>Retry</NoticeAction>}
      >
        <p>
          It is either misspelled, renamed, or has no local CSV history to replay against — a
          restored selection from an earlier session can be any of those. Pick a pair from the header
          selector, which in analysis mode lists only backtestable symbols; the selection is shared
          with live mode.
        </p>
      </StateNotice>
    );
  }

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
          and reports what the strategy would have done. The symbol, <b>{symbol}</b>, comes from the
          header selector and is shared with live mode; the backend picks its own execution
          timeframe for the run.
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
          Polling stopped, not the job. A wide date range at a low <code className="data text-signal">step</code>{" "}
          can outrun this window — narrow the range and try again, or check the job list directly.
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
          The message above comes straight from the backend. A window with no stored candles is the
          usual cause — <b>{startDate} → {endDate}</b> has to fall inside the collector's history for{" "}
          <b>{symbol}</b>.
        </p>
      </StateNotice>
    );
  }

  if (result && resultTrades.length === 0) {
    const f = result.stats?.funnel;
    return (
      <StateNotice
        severity="empty"
        eyebrow="No trades"
        headline={`The strategy took no positions on ${symbol} in this window.`}
        detail={`${f?.total ?? 0} test points · ${f?.resolved ?? 0} resolved`}
        actions={<NoticeAction onClick={onRun}>Run again</NoticeAction>}
      >
        <p>
          This is a result, not a failure. The rejection breakdown below shows which check consumed
          the test points — a large <b>insufficient HTF</b> count means the window was too short for
          the higher-timeframe bias to form.
        </p>
      </StateNotice>
    );
  }

  // Trades exist, but no candles can be requested for the analysed window.
  if (result && !overlap) {
    const natives = nativeTimeframes(available);
    return (
      <StateNotice
        severity="empty"
        eyebrow="No chart backdrop"
        headline="The analysed window is outside the candles this API can return."
        detail={
          candleError
            ? `GET /ohlc — ${candleError}`
            : !hasCandlePath
              ? `${symbol} has no data at ${timeframe} — available: ${natives.join(", ") || "none"}`
              : `GET /ohlc?symbol=${symbol}&timeframe=${timeframe}&limit=${CANDLE_TARGET} returned ${barCount} bars, none covering ${startDate} → ${endDate}`
        }
      >
        <p>
          <code className="data text-signal">/ohlc</code> accepts symbol, timeframe and limit — there
          is no date-range parameter — so the frontend can only ask for the most recent bars. The
          result itself is complete: the ledger and rejection breakdown below are the full output.
          Charting an older window needs a date range on{" "}
          <code className="data text-signal">/ohlc</code>.
        </p>
      </StateNotice>
    );
  }

  if (result) {
    return <TradingChart candles={candles} trades={resultTrades} height={420} />;
  }

  return null;
}

// ─── Rejection breakdown ────────────────────────────────────────────────────

/**
 * The backend's funnel is a set of rejection counters, not a monotonic cascade —
 * `test_points` in, `trades_resolved` out, and one counter per reason a test
 * point produced nothing. Rendering it as a classic top-down funnel would imply
 * an ordering the data does not have.
 */
function FunnelPanel({ funnel }: { funnel?: FunnelBreakdown }) {
  if (!funnel) {
    return (
      <p className="px-4 py-3 text-[11px] text-etch-dim">
        The job returned no funnel counters.
      </p>
    );
  }

  const nonZero = funnel.reasons.filter((r) => r.count > 0);
  const rows = nonZero.length > 0 ? nonZero : funnel.reasons.slice(0, 3);
  const peak = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      {rows.map((reason) => (
        <div key={reason.key} className="flex items-center gap-3">
          <span className="label w-[104px] shrink-0 truncate text-etch" title={reason.label}>
            {reason.label}
          </span>
          <span className="relative h-1.5 flex-1 bg-well">
            <span
              className="absolute inset-y-0 left-0 bg-etch-dim transition-[width] duration-500"
              style={{ width: `${(reason.count / peak) * 100}%` }}
            />
          </span>
          <span className="data w-12 shrink-0 text-right text-[11px] text-etch">
            {formatCount(reason.count)}
          </span>
        </div>
      ))}

      {/* Resolved trades are the outcome, not another rejection — set apart. */}
      <div className="mt-1 flex items-center gap-3 border-t border-rule pt-2">
        <span className="label w-[104px] shrink-0 text-signal">Resolved</span>
        <span className="relative h-1.5 flex-1 bg-well">
          <span
            className="absolute inset-y-0 left-0 bg-long transition-[width] duration-500"
            style={{
              width: `${funnel.total > 0 ? (funnel.resolved / funnel.total) * 100 : 0}%`,
            }}
          />
        </span>
        <span className="data w-12 shrink-0 text-right text-[11px] text-long">
          {formatCount(funnel.resolved)}
        </span>
      </div>
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
  if (trades.length === 0) {
    return <p className="px-4 py-3 text-[11px] text-etch-dim">No trades to list.</p>;
  }

  return (
    <div className="max-h-[148px] min-h-0 flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-void">
          <tr>
            {["Signal", "Dir", "Entry", "SL", "TP", "R", ""].map((h) => (
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
              <td className="data px-2 py-1 text-[10px] text-etch-dim">{formatPrice(t.sl)}</td>
              <td className="data px-2 py-1 text-[10px] text-etch-dim">{formatPrice(t.tp)}</td>
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
