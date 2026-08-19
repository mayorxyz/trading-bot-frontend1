// ════════════════════════════════════════════════════════════════════════════
// PREDICTION PANEL — result of "Run Analysis" (POST /predict)
//
// One stateless pipeline run against live candles. Three outcomes, all first
// class:
//
//   fired    — a signal, with entry / SL / TP / R:R / confluence.
//   skipped  — the pipeline evaluated and declined. This is a 200 and a real
//              answer, so it reads as a verdict, not as a failure.
//   error    — could not run at all. 422 ("not enough live history yet") gets
//              its own wording, because the fix is to wait, not to retry.
//
// Nothing here is persisted; the panel says so, so the reading is never mistaken
// for a stored signal.
// ════════════════════════════════════════════════════════════════════════════

import { formatIsoClock, formatPrice, formatRatio, humanizeReason } from "../lib/format";
import type { Prediction } from "../types";
import { Led, PanelHead } from "./ui/Panel";
import { cn } from "../lib/utils";

export interface PredictionState {
  status: "idle" | "running" | "ready" | "error";
  data: Prediction | null;
  error: string | null;
  /** HTTP status when status is "error"; 422 means "no live buffer yet". */
  errorStatus: number | null;
}

export const IDLE_PREDICTION: PredictionState = {
  status: "idle",
  data: null,
  error: null,
  errorStatus: null,
};

export function PredictionPanel({
  state,
  symbol,
  timeframe,
  onRetry,
}: {
  state: PredictionState;
  symbol: string;
  timeframe: string;
  onRetry: () => void;
}) {
  if (state.status === "idle") return null;

  const p = state.data;

  return (
    <div className="shrink-0 hair-b">
      <PanelHead
        trailing={
          p ? (
            <span className="flex items-center gap-3">
              <span className="text-etch-dim">{p.source}</span>
              <span aria-hidden className="text-etch-dim">
                ·
              </span>
              <span className="text-etch-dim">
                {p.persisted ? "persisted" : "not persisted"}
              </span>
              {p.timestamp ? (
                <>
                  <span aria-hidden className="text-etch-dim">
                    ·
                  </span>
                  <span className="text-etch">last bar {formatIsoClock(p.timestamp)}</span>
                </>
              ) : null}
            </span>
          ) : undefined
        }
      >
        Live signal · {p?.symbol ?? symbol} · {p?.timeframe ?? timeframe}
      </PanelHead>

      {state.status === "running" ? (
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span aria-hidden className="relative block h-[2px] w-10 overflow-hidden bg-rule">
            <span className="absolute inset-y-0 w-1/4 animate-sweep bg-arc" />
          </span>
          <span className="data text-data-sm text-etch">
            running the pipeline against live {timeframe} candles for {symbol}…
          </span>
        </div>
      ) : state.status === "error" ? (
        <ErrorBody
          message={state.error}
          status={state.errorStatus}
          symbol={symbol}
          timeframe={timeframe}
          onRetry={onRetry}
        />
      ) : p?.fired && p.signal ? (
        <SignalBody prediction={p} />
      ) : p ? (
        <SkipBody prediction={p} />
      ) : null}
    </div>
  );
}

// ─── Fired ──────────────────────────────────────────────────────────────────

function SignalBody({ prediction }: { prediction: Prediction }) {
  const s = prediction.signal;
  if (!s) return null;

  const long = s.direction === "long";
  const hits = s.confluence.filter((c) => c.hit);

  return (
    <div className="flex flex-wrap items-stretch gap-y-3 px-4 py-3">
      {/* Direction is the one place trade-semantic colour belongs. */}
      <div className="flex flex-col justify-center gap-1.5 pr-5">
        <span className="label text-etch">Signal</span>
        <span
          className={cn(
            "data flex items-center gap-2 text-data-lg font-semibold",
            long ? "text-long" : "text-short"
          )}
        >
          <span aria-hidden>{long ? "▲" : "▼"}</span>
          {long ? "LONG" : "SHORT"}
        </span>
      </div>

      <span aria-hidden className="w-px self-stretch bg-rule" />

      <Cell label="Entry" value={formatPrice(s.entry)} />
      <Cell
        label="Stop"
        value={formatPrice(s.sl)}
        tone="text-short"
        note={s.slMethod ?? undefined}
      />
      <Cell
        label="Target"
        value={formatPrice(s.tp)}
        tone="text-long"
        note={s.tpMethod ?? undefined}
      />
      <Cell label="R:R" value={formatRatio(s.rr)} />

      <span aria-hidden className="w-px self-stretch bg-rule" />

      {/* Confluence: functional gauge fill, 0–100. */}
      <div className="flex min-w-[188px] flex-col justify-center gap-1.5 px-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label text-etch">Confluence</span>
          {s.confidence ? (
            <span className="data text-[9px] uppercase text-etch-dim">{s.confidence}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="relative h-1.5 flex-1 bg-well">
            <span
              className="absolute inset-y-0 left-0 bg-arc/70 transition-[width] duration-500"
              style={{ width: `${Math.min(100, Math.max(0, s.confluenceScore ?? 0))}%` }}
            />
          </span>
          <span className="data w-8 text-right text-data-sm text-signal">
            {s.confluenceScore ?? "—"}
          </span>
        </div>
      </div>

      {hits.length > 0 ? (
        <>
          <span aria-hidden className="w-px self-stretch bg-rule" />
          <div className="flex flex-1 flex-col justify-center gap-1.5 pl-5">
            <span className="label text-etch">
              Contributing{s.entryLevelTouches != null ? ` · ${s.entryLevelTouches} touches` : ""}
            </span>
            <div className="flex flex-wrap gap-1">
              {hits.map((c) => (
                <span
                  key={c.key}
                  className="data border border-rule px-1.5 py-0.5 text-[9px] leading-[13px] text-etch"
                  title={c.weight != null ? `+${c.weight}` : undefined}
                >
                  {c.label}
                  {c.weight != null ? (
                    <span className="ml-1 text-arc/80">+{c.weight}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div className="flex min-w-[104px] flex-col justify-center gap-1.5 px-5">
      <span className="label text-etch">{label}</span>
      <span className={cn("data text-data-lg font-medium", tone ?? "text-signal")}>{value}</span>
      {note ? <span className="data text-[9px] leading-none text-etch-dim">{note}</span> : null}
    </div>
  );
}

// ─── Skipped (a 200, and a real answer) ─────────────────────────────────────

function SkipBody({ prediction }: { prediction: Prediction }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <Led tone="flat" />
        <span className="data text-data font-medium text-signal">NO SIGNAL</span>
        {prediction.skipReason ? (
          <span className="data text-data-sm text-etch">
            — {humanizeReason(prediction.skipReason)}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 max-w-[620px] text-[12px] leading-relaxed text-etch">
        The pipeline ran against {prediction.executionBars} live {prediction.timeframe} bars and
        declined to signal. That is a verdict, not a failure — the same classification the live skip
        feed uses.
      </p>

      {prediction.skipReasonRaw && prediction.skipReasonRaw !== prediction.skipReason ? (
        <p className="data mt-2 break-words border-l border-rule pl-2 text-[10px] leading-relaxed text-etch-dim">
          {prediction.skipReasonRaw}
        </p>
      ) : null}

      <BarsUsed prediction={prediction} />
    </div>
  );
}

function BarsUsed({ prediction }: { prediction: Prediction }) {
  if (prediction.barsUsed.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="label text-[9px] text-etch-dim">History</span>
      {prediction.barsUsed.map((b) => (
        <span key={b.timeframe} className="data text-[10px] text-etch-dim">
          {b.timeframe} <span className="text-etch">{b.bars}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Could not run ──────────────────────────────────────────────────────────

function ErrorBody({
  message,
  status,
  symbol,
  timeframe,
  onRetry,
}: {
  message: string | null;
  status: number | null;
  symbol: string;
  timeframe: string;
  onRetry: () => void;
}) {
  // 422 is the "no live buffer yet" case the backend documents explicitly.
  const noBuffer = status === 422;
  const unreachable = status === 503;
  const unknown = status === 404;

  const eyebrow = noBuffer
    ? "Not enough live history"
    : unreachable
      ? "Exchange unreachable"
      : unknown
        ? "Unknown symbol or timeframe"
        : "Could not run";

  const headline = noBuffer
    ? `Bybit has too few ${timeframe} bars for ${symbol} to analyse yet.`
    : unreachable
      ? "The backend could not reach Bybit to fetch live candles."
      : unknown
        ? `Bybit does not list ${symbol} at ${timeframe}.`
        : `The pipeline could not run for ${symbol} ${timeframe}.`;

  const body = noBuffer
    ? "The structure engine needs a minimum window before it can resolve bias and levels. This fills in as the exchange accumulates bars — a freshly listed pair can be tradable and still not have enough history. Try a slower timeframe, or come back later."
    : unreachable
      ? "This is upstream of the dashboard and the backend both. Nothing is wrong with the symbol; retry once the exchange responds."
      : unknown
        ? "Check the symbol spelling and the timeframe. Unlike a backtest this does not need local CSV history, but the pair does have to exist on the exchange."
        : "The message below comes straight from the backend.";

  return (
    <div className="px-4 py-3">
      <div className={cn("border-l-2 pl-3", noBuffer ? "border-rule-bright" : "border-short/50")}>
        <span className={cn("eyebrow", noBuffer ? "text-etch" : "text-short")}>{eyebrow}</span>

        <h3 className="mb-1.5 mt-1.5 text-[13.5px] font-semibold leading-snug tracking-tight text-signal">
          {headline}
        </h3>

        <p className="max-w-[620px] text-[12px] leading-relaxed text-etch">{body}</p>

        {message ? (
          <p className="data mt-2 break-words border-l border-rule pl-2 text-[10px] leading-relaxed text-etch-dim">
            POST /predict — {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onRetry}
          className="group mt-3 flex h-7 items-center border border-rule bg-bay px-2.5 transition-colors hover:border-arc/60 hover:bg-well"
        >
          <span className="label text-[10px] text-etch transition-colors group-hover:text-signal">
            Run analysis again
          </span>
        </button>
      </div>
    </div>
  );
}
