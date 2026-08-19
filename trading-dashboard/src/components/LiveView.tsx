// ════════════════════════════════════════════════════════════════════════════
// LIVE VIEW
//
// Polls the /live/* endpoints plus /ohlc. Symbol and timeframe are owned by App
// (persisted across reloads) and arrive as props, along with the timeframes the
// backend actually has for that symbol.
//
// Request orchestration:
//
//   · /live/state and /live/stats are symbol-scoped, so they are always fetched.
//     The bias compass, tradability, performance strip and skip feed therefore
//     keep working no matter what the chart is doing.
//   · /ohlc, /live/zones and /live/levels are timeframe-scoped and are skipped
//     entirely when the symbol has no data path to the selected timeframe —
//     there is no point provoking a 404 the registry already predicted.
//   · allSettled, not all: one failing endpoint degrades its own panel instead
//     of blanking the view.
//   · a generation guard drops responses that arrive after the selection moved.
//
// Every number on screen comes from the backend. There is no placeholder or
// generated series anywhere in this file.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TradingChart } from "./TradingChart";
import { BiasCompass } from "./BiasCompass";
import { PriceTicker } from "./PriceTicker";
import { StatStrip } from "./StatStrip";
import { ChartSkeleton, NoticeAction, StateNotice } from "./StateNotice";
import { Led, PanelHead } from "./ui/Panel";
import { getLevels, getLiveState, getLiveStats, getOhlc, getZones } from "../lib/api";
import {
  applyDerivation,
  classify,
  getTimeframe,
  nativeTimeframes,
  overlayTimeframe,
  resolveRequest,
} from "../lib/timeframes";
import { formatIsoClock, humanizeReason } from "../lib/format";
import type {
  Candle,
  LevelsResponse,
  LiveState,
  LiveStats,
  PatternHit,
  ZonesResponse,
} from "../types";
import { cn } from "../lib/utils";

const POLL_INTERVAL = 20000;
const CANDLE_TARGET = 200;

type EndpointKey = "state" | "zones" | "levels" | "stats" | "ohlc";
type ErrorMap = Partial<Record<EndpointKey, string>>;

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : "unknown error";
}

export function LiveView({
  symbol,
  timeframe,
  available,
  onTimeframeChange,
  apiBase,
  refreshSignal = 0,
}: {
  symbol: string;
  timeframe: string;
  /** The symbol's timeframes, from GET /symbols. */
  available: string[];
  onTimeframeChange: (tf: string) => void;
  apiBase: string;
  /** Incremented by the R shortcut to force a poll outside the interval. */
  refreshSignal?: number;
}) {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [zones, setZones] = useState<ZonesResponse | null>(null);
  const [levels, setLevels] = useState<LevelsResponse | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [rawCandles, setRawCandles] = useState<Candle[]>([]);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [settled, setSettled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Discards responses that arrive after the selection has moved on.
  const generation = useRef(0);

  const source = classify(timeframe, available);
  const spec = getTimeframe(timeframe);
  const request = useMemo(
    () => resolveRequest(timeframe, CANDLE_TARGET, available),
    [timeframe, available]
  );

  const fetchData = useCallback(async () => {
    const gen = ++generation.current;

    // Symbol-scoped first; these two are independent of the timeframe.
    const symbolScoped = Promise.allSettled([getLiveState(symbol), getLiveStats(symbol)]);

    // Timeframe-scoped, only when the registry says there is data to ask for.
    const timeframeScoped = request
      ? Promise.allSettled([
          getZones(symbol, request.timeframe),
          getLevels(symbol, request.timeframe),
          getOhlc(symbol, request.timeframe, request.limit),
        ])
      : null;

    const [[stateRes, statsRes], tfResults] = await Promise.all([
      symbolScoped,
      timeframeScoped ?? Promise.resolve(null),
    ]);

    if (gen !== generation.current) return;

    const next: ErrorMap = {};

    if (stateRes.status === "fulfilled") setLiveState(stateRes.value);
    else next.state = messageOf(stateRes.reason);

    if (statsRes.status === "fulfilled") setStats(statsRes.value);
    else next.stats = messageOf(statsRes.reason);

    if (tfResults) {
      const [zonesRes, levelsRes, ohlcRes] = tfResults;

      if (zonesRes.status === "fulfilled") setZones(zonesRes.value);
      else next.zones = messageOf(zonesRes.reason);

      if (levelsRes.status === "fulfilled") setLevels(levelsRes.value);
      else next.levels = messageOf(levelsRes.reason);

      if (ohlcRes.status === "fulfilled") {
        setRawCandles(Array.isArray(ohlcRes.value?.candles) ? ohlcRes.value.candles : []);
      } else {
        next.ohlc = messageOf(ohlcRes.reason);
        setRawCandles([]);
      }
    } else {
      // Nothing was requested, so nothing is stale and nothing failed.
      setZones(null);
      setLevels(null);
      setRawCandles([]);
    }

    setErrors(next);
    setSettled(true);
    setLastUpdated(new Date().toISOString());
  }, [symbol, request]);

  // Reset on selection change so stale candles never render under a new heading.
  useEffect(() => {
    setSettled(false);
    setRawCandles([]);
    setZones(null);
    setLevels(null);
  }, [symbol, timeframe]);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  // Manual refresh (R). Fires an extra poll; the interval keeps its own cadence.
  const firstRefresh = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === firstRefresh.current) return;
    void fetchData();
  }, [refreshSignal, fetchData]);

  // Client-side resampling for 1W / 1M. A no-op for native timeframes.
  //
  // Every downstream reader treats `candles` as a guaranteed array — the chart's
  // coordinate math, the ticker's last-price lookup and the bar count in the
  // heading all index into it — so a malformed payload is normalised to [] here
  // rather than guarded at each use site.
  const candles = useMemo(() => {
    const rows = Array.isArray(rawCandles) ? rawCandles : [];
    return request?.needsResample ? applyDerivation(timeframe, rows) : rows;
  }, [rawCandles, request?.needsResample, timeframe]);

  const patternHits: PatternHit[] = [];
  const zoneTf = overlayTimeframe(timeframe, available);
  const skips = Array.isArray(liveState?.recent_skips) ? liveState.recent_skips : [];

  // "Live state exists" and "the bot is clear to trade" are different questions.
  const hasState = liveState?.hasState === true;
  const isTradable = hasState && liveState?.current_skip_reason == null;

  // Only counts the endpoints this cycle actually attempted.
  const attempted = request ? 5 : 2;
  const allDown = settled && Object.keys(errors).length === attempted;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Band 2: instrument cluster ─────────────────────────────────── */}
      <div className="grid grid-cols-[minmax(240px,1fr)_minmax(260px,1.2fr)_auto] hair-b">
        <PriceTicker
          candles={candles}
          symbol={symbol}
          timeframe={timeframe}
          className="hair-r"
        />

        <div className="flex flex-col justify-center gap-1.5 px-4 py-3 hair-r">
          <div className="flex items-center gap-2">
            <span className="label text-etch">Tradability</span>
            {lastUpdated ? (
              <span className="data text-[9px] text-etch-dim">{formatIsoClock(lastUpdated)}</span>
            ) : null}
          </div>

          {!settled ? (
            <span className="data text-data text-etch-dim">reading…</span>
          ) : errors.state ? (
            <div className="flex flex-col gap-0.5">
              <span className="data flex items-center gap-2 text-data text-short">
                <Led tone="short" /> STATE UNAVAILABLE
              </span>
              <span className="data text-[10px] text-etch-dim">/live/state — {errors.state}</span>
            </div>
          ) : !hasState ? (
            // has_state:false is the backend telling us live_runner.py has not
            // recorded a tick. That is not "neutral bias" — it is no reading.
            <div className="flex flex-col gap-1">
              <span className="data flex items-center gap-2 text-data font-medium text-etch">
                <Led tone="etch" /> NO LIVE STATE
              </span>
              <span className="text-[11px] leading-snug text-etch-dim">
                {liveState?.message ?? "The backend has recorded no live ticks for this symbol."}
              </span>
            </div>
          ) : isTradable ? (
            <span className="data flex items-center gap-2 text-data font-medium text-long">
              <Led tone="long" pulse /> CLEAR TO TRADE
            </span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="data flex items-center gap-2 text-data font-medium text-signal">
                <Led tone="flat" /> BLOCKED
              </span>
              <span className="data text-[10px] leading-snug text-etch">
                {liveState?.current_skip_reason
                  ? humanizeReason(liveState.current_skip_reason)
                  : "reason not reported"}
              </span>
            </div>
          )}
        </div>

        {/* Signature element. Live-only: there is no live bias in analysis mode. */}
        <div className="flex items-center px-4 py-2">
          <BiasCompass
            bias={hasState ? liveState?.bias : undefined}
            stale={Boolean(errors.state)}
          />
        </div>
      </div>

      {/* ── Band 3: chart ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col hair-b">
        <PanelHead
          trailing={
            <span className="flex items-center gap-3">
              <span className={cn(source === "native" ? "text-etch" : "text-etch-dim")}>
                {source === "native"
                  ? "native"
                  : source === "derived"
                    ? `derived ← ${zoneTf}`
                    : "no data for this symbol"}
              </span>
              <span aria-hidden className="text-etch-dim">
                ·
              </span>
              <span className="text-etch-dim">
                fvg {zones?.fvg?.length ?? 0} · cons {zones?.consolidation?.length ?? 0} · lvl{" "}
                {levels?.levels?.length ?? 0}
                {zoneTf !== timeframe ? ` (from ${zoneTf})` : ""}
              </span>
            </span>
          }
        >
          {symbol} · {timeframe} · {candles.length} bars
        </PanelHead>

        <div className="min-h-0 flex-1">
          <ChartRegion
            settled={settled}
            candles={candles}
            rawCount={rawCandles.length}
            symbol={symbol}
            timeframe={timeframe}
            available={available}
            errors={errors}
            allDown={allDown}
            attempted={attempted}
            skipped={request === null}
            apiBase={apiBase}
            onTimeframeChange={onTimeframeChange}
            onRetry={() => void fetchData()}
            zones={zones}
            levels={levels}
            patternHits={patternHits}
          />
        </div>
      </div>

      {/* ── Band 4: stats + skip feed ──────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col hair-r">
          <PanelHead
            trailing={
              errors.stats
                ? "unavailable"
                : stats && stats.in_flight > 0
                  ? `${stats.in_flight} in flight`
                  : undefined
            }
          >
            Live performance
          </PanelHead>
          <StatStrip stats={errors.stats ? null : stats} />
        </div>

        <div className="flex min-h-[112px] flex-col">
          <PanelHead trailing={`${skips.length} entries`}>Skip feed</PanelHead>
          <div className="max-h-[112px] min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            {skips.length > 0 ? (
              <ul>
                {skips.map((skip, i) => (
                  <li
                    key={`${skip.timestamp}-${i}`}
                    className="flex items-baseline gap-3 border-b border-rule/50 py-1.5 last:border-0"
                  >
                    <span className="data shrink-0 text-[10px] text-etch-dim">
                      {formatIsoClock(skip.timestamp)}
                    </span>
                    {skip.timeframe ? (
                      <span className="data shrink-0 text-[10px] text-etch-dim">
                        {skip.timeframe}
                      </span>
                    ) : null}
                    <span className="data text-[11px] text-etch">{humanizeReason(skip.reason)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] leading-relaxed text-etch-dim">
                {errors.state
                  ? "Feed unavailable while /live/state is failing."
                  : !settled
                    ? "…"
                    : !hasState
                      ? "No ticks recorded, so there are no skips to show yet."
                      : "No skips recorded. Either every signal passed the filters, or none have fired since the bot started."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The chart region's states. Each explains what happened and what to do next;
 * none is a bare spinner, and none renders a fabricated series.
 */
function ChartRegion({
  settled,
  candles,
  rawCount,
  symbol,
  timeframe,
  available,
  errors,
  allDown,
  attempted,
  skipped,
  apiBase,
  onTimeframeChange,
  onRetry,
  zones,
  levels,
  patternHits,
}: {
  settled: boolean;
  candles: Candle[];
  rawCount: number;
  symbol: string;
  timeframe: string;
  available: string[];
  errors: ErrorMap;
  allDown: boolean;
  attempted: number;
  /** True when the registry predicted no data and no request was made. */
  skipped: boolean;
  apiBase: string;
  onTimeframeChange: (tf: string) => void;
  onRetry: () => void;
  zones: ZonesResponse | null;
  levels: LevelsResponse | null;
  patternHits: PatternHit[];
}) {
  const spec = getTimeframe(timeframe);
  const source = classify(timeframe, available);
  const count = candles?.length ?? 0;
  const natives = nativeTimeframes(available);

  // The timeframe has no data path for this symbol. Nothing was requested.
  if (skipped || (count === 0 && source === "unsupported")) {
    return (
      <StateNotice
        severity="empty"
        eyebrow="Timeframe not available"
        headline="No candle data available for this timeframe."
        detail={
          errors.ohlc
            ? `GET /ohlc?symbol=${symbol}&timeframe=${timeframe} — ${errors.ohlc}`
            : `GET /symbols reports ${symbol}: ${available.length > 0 ? available.join(", ") : "no timeframes"}`
        }
        actions={natives.map((tf) => (
          <NoticeAction
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            hotkey={getTimeframe(tf).hotkey}
          >
            Switch to {tf}
          </NoticeAction>
        ))}
      >
        <p>
          The backend has no {spec.name} data for <b>{symbol}</b> — it serves{" "}
          <b>{natives.length > 0 ? natives.join(", ") : "nothing for this symbol"}</b>, and 1W/1M
          are resampled from 1D in the browser. This request was skipped rather than sent, so
          nothing else on the panel is affected. Add the CSV to the backend's data directory and
          this timeframe starts working with no frontend change.
        </p>
      </StateNotice>
    );
  }

  if (!settled && count === 0) {
    return <ChartSkeleton label={`requesting ${timeframe} candles for ${symbol}`} />;
  }

  if (allDown) {
    return (
      <StateNotice
        severity="fault"
        eyebrow="Backend unreachable"
        headline={`Nothing at ${apiBase} is answering.`}
        detail={`${attempted}/${attempted} endpoints failed · ${errors.ohlc ?? errors.state ?? ""}`}
        actions={
          <NoticeAction onClick={onRetry} hotkey="R">
            Retry now
          </NoticeAction>
        }
      >
        <p>
          Every request in this cycle failed, which usually means the API process is not running or
          is bound to a different port. Start the backend and retry — polling continues every 20
          seconds in the background either way.
        </p>
      </StateNotice>
    );
  }

  if (count === 0 && errors.ohlc) {
    return (
      <StateNotice
        severity="fault"
        eyebrow="Candle request failed"
        headline={`Could not load ${timeframe} candles for ${symbol}.`}
        detail={`GET /ohlc?symbol=${symbol}&timeframe=${timeframe} — ${errors.ohlc}`}
        actions={
          <NoticeAction onClick={onRetry} hotkey="R">
            Retry now
          </NoticeAction>
        }
      >
        <p>
          The message above is the backend's own. Other live endpoints are still responding, so this
          is specific to the candle store rather than the API being down.
        </p>
      </StateNotice>
    );
  }

  if (count === 0) {
    return (
      <StateNotice
        severity="empty"
        eyebrow="No candles"
        headline="No candle data available for this timeframe."
        detail={`GET /ohlc → ${rawCount} usable rows${
          source === "derived" ? ` at ${spec.base?.toUpperCase()}, before resampling` : ""
        }`}
        actions={
          <NoticeAction onClick={onRetry} hotkey="R">
            Retry now
          </NoticeAction>
        }
      >
        <p>
          The request succeeded and <b>{symbol}</b> is valid, but no usable rows came back — either
          the series is empty or every row was missing a price field. Try a slower timeframe, or
          check the CSV behind this symbol.
        </p>
      </StateNotice>
    );
  }

  return (
    <TradingChart
      candles={candles}
      zones={zones ?? undefined}
      levels={levels?.levels}
      patternHits={patternHits}
      height={520}
    />
  );
}
