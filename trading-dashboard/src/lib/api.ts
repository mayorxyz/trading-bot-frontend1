// ════════════════════════════════════════════════════════════════════════════
// API MODULE — the single point where the backend's wire format is translated
//
// Every function fetches the real FastAPI shape and returns the normalised
// shape declared in types/index.ts. Components never see a `ts_ms`, an
// `entry_price` or a `latest_skip_reason`.
//
// Two rules hold throughout:
//   · non-2xx throws, so callers can distinguish "the backend rejected this"
//     from "the backend has nothing yet";
//   · a 2xx body is validated before it is trusted, and anything unusable is
//     dropped rather than forwarded. No function ever invents a data point —
//     a value the backend did not send arrives as null, 0 or an empty array.
// ════════════════════════════════════════════════════════════════════════════

import type {
  AnalysisResult,
  AnalysisStats,
  AnalysisStatus,
  AnalysisStatusResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  Bias,
  Candle,
  ConsolidationZone,
  FunnelBreakdown,
  FvgZone,
  Level,
  LevelsResponse,
  LevelType,
  LiveState,
  LiveStats,
  OhlcResponse,
  Prediction,
  PredictionSignal,
  ProfitFactorValue,
  SkipEntry,
  SymbolInfo,
  Trade,
  TradeOutcome,
  WireAnalysisStatusResponse,
  WireAnalysisTrade,
  WireFunnel,
  WireLevelsResponse,
  WireLiveState,
  WireLiveStats,
  WireOhlcResponse,
  WirePredictResponse,
  WireSymbolsResponse,
  WireZonesResponse,
  ZonesResponse,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Fetch plumbing ─────────────────────────────────────────────────────────

/**
 * An error carrying the HTTP status, so callers can treat 422 ("not enough live
 * history yet") differently from 503 ("Bybit unreachable") without parsing the
 * message. `message` is still the backend's own `detail`, so callers that only
 * read the message are unaffected.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Fetch and parse JSON, surfacing the backend's own `detail` message on error.
 * FastAPI returns `{"detail": "no data for BTCUSDT 30M"}` on a 404, which is far
 * more useful in a notice than "HTTP 404".
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body: unknown = await response.json();
      const d = (body as { detail?: unknown } | null)?.detail;
      if (typeof d === "string" && d.length > 0) detail = d;
      // FastAPI validation errors arrive as a list of {loc, msg, type}.
      else if (Array.isArray(d) && d.length > 0) {
        const first = d[0] as { msg?: unknown } | null;
        if (typeof first?.msg === "string") detail = first.msg;
      }
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const num = (v: unknown): number | null => (Number.isFinite(v) ? (v as number) : null);

/** Backend timestamps are epoch milliseconds; the chart works in seconds. */
function toSeconds(ms: unknown, iso?: unknown): number | null {
  if (Number.isFinite(ms)) return Math.floor((ms as number) / 1000);
  if (typeof iso === "string") {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

function toBias(value: unknown): Bias {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "LONG" || v === "BULL" || v === "BULLISH" || v === "UP") return "LONG";
  if (v === "SHORT" || v === "BEAR" || v === "BEARISH" || v === "DOWN") return "SHORT";
  return "NEUTRAL";
}

/** `regime` arrives as a bool, a 0/1, or a label depending on the writer. */
function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "trending" || v === "yes" || v === "on";
}

function toDirection(value: unknown): "long" | "short" {
  return String(value ?? "").trim().toLowerCase() === "short" ? "short" : "long";
}

function toOutcome(value: unknown): TradeOutcome {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "win" || v === "loss" || v === "timeout") return v;
  return "no_fill";
}

function toLevelType(value: unknown): LevelType {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "SUPPORT" || v === "RESISTANCE" || v === "BOTH" ? v : "BOTH";
}

function toProfitFactor(pf: unknown, infinite: unknown): ProfitFactorValue {
  return {
    profit_factor_R: num(pf),
    profit_factor_R_infinite: toBool(infinite),
  };
}

// ─── Discovery ──────────────────────────────────────────────────────────────

/**
 * Available symbols and, per symbol, the timeframes the backend has data for.
 *
 * The response is `{symbols: [{symbol, timeframes}]}`. A bare `string[]` is
 * also accepted so an older backend still populates the selector, just without
 * per-symbol timeframe knowledge.
 */
export async function getSymbols(): Promise<SymbolInfo[]> {
  const body = await request<WireSymbolsResponse | string[]>("/symbols");

  if (Array.isArray(body)) {
    return body.filter((s): s is string => typeof s === "string").map((symbol) => ({
      symbol,
      timeframes: [],
    }));
  }

  if (!Array.isArray(body?.symbols)) return [];

  return body.symbols
    .filter((entry) => isObject(entry) && typeof entry.symbol === "string")
    .map((entry) => ({
      symbol: entry.symbol,
      timeframes: Array.isArray(entry.timeframes)
        ? entry.timeframes.filter((t): t is string => typeof t === "string").map((t) => t.toUpperCase())
        : [],
    }));
}

export async function getHealth(): Promise<{ status: string }> {
  return await request<{ status: string }>("/health");
}

// ─── Live ───────────────────────────────────────────────────────────────────

/**
 * Current per-timeframe bias and regime.
 *
 * `timeframes` is a map of tf -> {bias, regime, is_consolidation}; it is split
 * into the three flat records the panels read. When `has_state` is false the
 * backend's own message is passed through so the UI can say why it is empty
 * instead of implying a neutral reading.
 */
export async function getLiveState(symbol: string): Promise<LiveState> {
  const body = await request<WireLiveState>(
    `/live/state?symbol=${encodeURIComponent(symbol)}`
  );

  const bias: Record<string, Bias> = {};
  const regime: Record<string, boolean> = {};
  const consolidation: Record<string, boolean> = {};

  const tfs = isObject(body?.timeframes) ? body.timeframes : {};
  for (const [tf, state] of Object.entries(tfs)) {
    if (!isObject(state)) continue;
    bias[tf.toUpperCase()] = toBias(state.bias);
    regime[tf.toUpperCase()] = toBool(state.regime);
    consolidation[tf.toUpperCase()] = toBool(state.is_consolidation);
  }

  const skips: SkipEntry[] = (Array.isArray(body?.recent_skips) ? body.recent_skips : [])
    .filter((row) => isObject(row))
    .map((row) => ({
      timestamp: typeof row.ts === "string" ? row.ts : "",
      reason: row.skip_reason ?? row.skip_reason_raw ?? "unspecified",
      timeframe: row.execution_tf ?? null,
    }));

  return {
    hasState: toBool(body?.has_state),
    message: typeof body?.message === "string" ? body.message : null,
    bias,
    regime,
    consolidation,
    current_skip_reason: body?.latest_skip_reason ?? null,
    recent_skips: skips,
    topdownBias: body?.topdown_bias == null ? null : toBias(body.topdown_bias),
    alignedCount: num(body?.aligned_count),
    biasGatePassed: typeof body?.bias_gate_passed === "boolean" ? body.bias_gate_passed : null,
    executionTimeframe: body?.execution_timeframe ?? null,
    updatedAt: body?.timestamp ?? body?.recorded_at ?? null,
  };
}

/**
 * FVG and consolidation zones.
 *
 * The backend returns one flat `zones` array discriminated by `kind`; the chart
 * wants them separated. Zones with no `end_ts_ms` are still active, and are
 * extended to the snapshot time so the overlay can draw them to the live edge.
 */
export async function getZones(symbol: string, timeframe: string): Promise<ZonesResponse> {
  const body = await request<WireZonesResponse>(
    `/live/zones?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
  );

  const fvg: FvgZone[] = [];
  const consolidation: ConsolidationZone[] = [];

  for (const zone of Array.isArray(body?.zones) ? body.zones : []) {
    if (!isObject(zone)) continue;

    const start = toSeconds(zone.start_ts_ms, zone.start_ts);
    const end = toSeconds(zone.end_ts_ms, zone.end_ts) ?? toSeconds(zone.snapshot_ts_ms, zone.snapshot_ts);
    const low = num(zone.price_low);
    const high = num(zone.price_high);
    if (start == null || end == null || low == null || high == null) continue;

    const kind = String(zone.kind ?? "").toLowerCase();
    const tf = String(zone.timeframe ?? timeframe).toUpperCase();

    if (kind === "fvg" || kind === "imbalance") {
      fvg.push({
        start_time: start,
        end_time: end,
        price_low: Math.min(low, high),
        price_high: Math.max(low, high),
        direction: toBias(zone.direction) === "SHORT" ? "bearish" : "bullish",
        timeframe: tf,
        tested: typeof zone.tested === "boolean" ? zone.tested : null,
      });
    } else if (kind === "consolidation") {
      consolidation.push({
        start_time: start,
        end_time: end,
        price_low: Math.min(low, high),
        price_high: Math.max(low, high),
        timeframe: tf,
      });
    }
  }

  return { fvg, consolidation };
}

export async function getLevels(symbol: string, timeframe: string): Promise<LevelsResponse> {
  const body = await request<WireLevelsResponse>(
    `/live/levels?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
  );

  const levels: Level[] = [];
  for (const row of Array.isArray(body?.levels) ? body.levels : []) {
    if (!isObject(row)) continue;
    const price = num(row.price);
    if (price == null) continue;
    levels.push({
      price,
      type: toLevelType(row.type),
      touches: num(row.touches),
      timeframe: String(row.timeframe ?? timeframe).toUpperCase(),
    });
  }

  return { levels };
}

/**
 * Running live performance. `win_rate` is a fraction and is null until a trade
 * resolves — it is passed through as null rather than coerced to 0, because
 * "no data yet" and "zero percent" are different readings.
 */
export async function getLiveStats(symbol: string): Promise<LiveStats> {
  const body = await request<WireLiveStats>(
    `/live/stats?symbol=${encodeURIComponent(symbol)}`
  );

  return {
    win_rate: num(body?.win_rate),
    avg_rr: num(body?.avg_rr),
    pf_R: toProfitFactor(body?.profit_factor_R, body?.profit_factor_R_infinite),
    trade_count: num(body?.total_trades) ?? 0,
    in_flight: num(body?.in_flight_trades) ?? 0,
    wins: num(body?.wins) ?? 0,
    losses: num(body?.losses) ?? 0,
  };
}

// ─── OHLC ───────────────────────────────────────────────────────────────────

/**
 * Candles for the chart, oldest to newest.
 *
 * The backend sends `ts_ms` and a nullable `volume`; the chart needs unix
 * seconds and a number. Rows missing any price field are dropped — a NaN would
 * break the overlay's coordinate math — and a row is never synthesised to fill
 * a gap.
 */
export async function getOhlc(
  symbol: string,
  timeframe: string,
  limit: number = 100
): Promise<OhlcResponse> {
  const body = await request<WireOhlcResponse>(
    `/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
  );

  const candles: Candle[] = [];
  for (const row of Array.isArray(body?.candles) ? body.candles : []) {
    if (!isObject(row)) continue;

    const time = toSeconds(row.ts_ms, row.ts);
    const open = num(row.open);
    const high = num(row.high);
    const low = num(row.low);
    const close = num(row.close);
    if (time == null || open == null || high == null || low == null || close == null) continue;

    candles.push({ time, open, high, low, close, volume: num(row.volume) ?? 0 });
  }

  return { candles };
}

// ─── Analysis ───────────────────────────────────────────────────────────────

export async function startAnalysis(
  params: AnalyzeRequest & { step?: number }
): Promise<AnalyzeResponse> {
  const search = new URLSearchParams({ symbol: params.symbol });
  if (params.start_date) search.set("start_date", params.start_date);
  if (params.end_date) search.set("end_date", params.end_date);
  if (params.step != null) search.set("step", String(params.step));

  return await request<AnalyzeResponse>(`/analyze?${search.toString()}`, { method: "POST" });
}

/** The backend says `queued`; the rest of the app calls that `pending`. */
function toAnalysisStatus(value: unknown): AnalysisStatus {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "running") return "running";
  if (v === "done") return "done";
  if (v === "error") return "error";
  return "pending";
}

/** Display order and wording for the rejection counters. */
const FUNNEL_REASONS: Array<{ key: keyof WireFunnel; label: string }> = [
  { key: "insufficient_htf", label: "Insufficient HTF" },
  { key: "skips", label: "Filter skips" },
  { key: "no_fill", label: "No fill" },
  { key: "timeout", label: "Timed out" },
  { key: "zone_already_held", label: "Zone held" },
  { key: "level_in_cooldown", label: "Level cooldown" },
  { key: "all_slots_busy", label: "Slots busy" },
  { key: "opposing_concurrent", label: "Opposing open" },
  { key: "errors", label: "Errors" },
];

function toFunnel(wire: WireFunnel | null | undefined): FunnelBreakdown {
  const get = (key: keyof WireFunnel) => num(wire?.[key]) ?? 0;
  return {
    total: get("test_points"),
    resolved: get("trades_resolved"),
    reasons: FUNNEL_REASONS.map(({ key, label }) => ({ key, label, count: get(key) })),
  };
}

/**
 * Analysis trades carry only `signal_ts` — there is no exit timestamp in the
 * store — so `exit_time` is left undefined and the chart draws entry-anchored
 * boxes rather than inventing a duration.
 */
function toTrade(row: WireAnalysisTrade): Trade | null {
  if (!isObject(row)) return null;

  const entry_time = toSeconds(row.signal_ts_ms, row.signal_ts);
  const entry = num(row.entry_price);
  const sl = num(row.stop_price);
  const tp = num(row.take_profit);
  if (entry_time == null || entry == null || sl == null || tp == null) return null;

  return {
    entry_time,
    entry,
    sl,
    tp,
    direction: toDirection(row.direction),
    outcome: toOutcome(row.outcome),
    rr_achieved: num(row.realized_rr) ?? undefined,
    planned_rr: num(row.planned_rr) ?? undefined,
    timeframe: typeof row.timeframe === "string" ? row.timeframe.toUpperCase() : undefined,
  };
}

export async function getAnalysisStatus(jobId: string): Promise<AnalysisStatusResponse> {
  const body = await request<WireAnalysisStatusResponse>(
    `/analyze/status/${encodeURIComponent(jobId)}`
  );

  const status = toAnalysisStatus(body?.status);

  let result: AnalysisResult | null = null;
  if (status === "done") {
    const trades = (Array.isArray(body?.trades) ? body.trades : [])
      .map(toTrade)
      .filter((t): t is Trade => t !== null);

    const summary = body?.summary;
    const stats: AnalysisStats = {
      win_rate: num(summary?.win_rate),
      avg_rr: num(summary?.avg_rr),
      pf_R: toProfitFactor(summary?.profit_factor_R, summary?.profit_factor_R_infinite),
      trade_count: num(summary?.total_trades) ?? trades.length,
      wins: num(summary?.wins) ?? 0,
      losses: num(summary?.losses) ?? 0,
      funnel: toFunnel(body?.funnel),
    };

    result = { trades, stats };
  }

  return {
    status,
    result,
    error: body?.error ?? undefined,
    timeframe: body?.timeframe ?? null,
    startDate: body?.start_date ?? null,
    endDate: body?.end_date ?? null,
  };
}

export async function getAnalysisJobs(): Promise<{
  jobs: Array<{ job_id: string; status: string; symbol: string; created_at: string }>;
}> {
  const body = await request<{ jobs?: unknown }>("/analyze/jobs");
  return { jobs: Array.isArray(body?.jobs) ? (body.jobs as never[]) : [] };
}

// ─── Prediction (stateless single run) ──────────────────────────────────────

/** Human wording for the pipeline's confluence component keys. */
const CONFLUENCE_LABELS: Record<string, string> = {
  sr_breakout: "S/R breakout",
  consolidation_breakout: "Consolidation breakout",
  wick_rejection: "Wick rejection",
  volume_spike: "Volume spike",
  volume_divergence: "Volume divergence",
  fib_confluence: "Fib confluence",
  pattern_match: "Pattern match",
  trend_alignment: "Trend alignment",
  multi_timeframe: "Multi-timeframe",
};

function prettyKey(key: string): string {
  return CONFLUENCE_LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * The breakdown is a flat map of component -> contribution. Values arrive as a
 * bool (hit or not) or a number (points awarded), depending on the component, so
 * both are folded into {hit, weight}.
 */
function toConfluence(
  breakdown: Record<string, unknown> | null | undefined
): PredictionSignal["confluence"] {
  if (!isObject(breakdown)) return [];

  return Object.entries(breakdown).map(([key, value]) => {
    if (typeof value === "boolean") {
      return { key, label: prettyKey(key), hit: value, weight: null };
    }
    const weight = num(value);
    if (weight != null) {
      return { key, label: prettyKey(key), hit: weight > 0, weight };
    }
    return { key, label: prettyKey(key), hit: Boolean(value), weight: null };
  });
}

/**
 * Run the signal pipeline once against live candles — the "Run Analysis" action.
 *
 * Distinct from startAnalysis in every respect: no date range, no job queue, no
 * persistence, and no dependency on CSV history, so it answers for any symbol
 * Bybit lists. A pipeline skip comes back as a 200 with `fired: false`, which is
 * a result and not an error; genuine failures throw an ApiError whose `status`
 * distinguishes "not enough live history yet" (422) from the rest.
 */
export async function postPredict(symbol: string, timeframe: string): Promise<Prediction> {
  const body = await request<WirePredictResponse>("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, timeframe }),
  });

  const wire = body?.signal;
  const signal: PredictionSignal | null =
    body?.signal_fired && isObject(wire)
      ? {
          direction: toDirection(wire.direction),
          entry: num(wire.entry),
          sl: num(wire.sl),
          tp: num(wire.tp),
          slMethod: wire.sl_method ?? null,
          tpMethod: wire.tp_method ?? null,
          rr: num(wire.rr),
          confluenceScore: num(wire.confluence_score),
          confidence: wire.confidence ?? null,
          confluence: toConfluence(wire.confluence_breakdown),
          entryLevelTouches: num(wire.entry_level_touches),
        }
      : null;

  const barsUsed = isObject(body?.bars_used)
    ? Object.entries(body.bars_used).map(([timeframeKey, info]) => ({
        timeframe: timeframeKey.toUpperCase(),
        bars: num((info as { bars?: unknown } | null)?.bars) ?? 0,
        lastBar: (info as { last_bar?: string | null } | null)?.last_bar ?? null,
      }))
    : [];

  return {
    symbol: body?.symbol ?? symbol,
    timeframe: body?.timeframe ?? timeframe,
    timestamp: body?.timestamp ?? null,
    source: body?.source ?? "unknown",
    persisted: toBool(body?.persisted),
    analysisAvailable: toBool(body?.analysis_available),
    fired: toBool(body?.signal_fired),
    skipReason: body?.skip_reason ?? null,
    skipReasonRaw: body?.skip_reason_raw ?? null,
    signal,
    barsUsed,
    executionBars: num(body?.execution_bars) ?? 0,
  };
}

export { API_BASE_URL };
