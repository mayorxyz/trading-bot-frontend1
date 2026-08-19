// Trading Bot Dashboard Types
//
// Two layers:
//
//   Wire*  — exactly what the FastAPI backend sends. Field names and units are
//            the backend's (ts_ms, entry_price, latest_skip_reason, …).
//   the rest — what the components consume, normalised by lib/api.ts.
//
// Components only ever see the second layer. When the backend's shape changes,
// api.ts is the only file that has to move.

export type Bias = "LONG" | "SHORT" | "NEUTRAL";
export type LevelType = "SUPPORT" | "RESISTANCE" | "BOTH";
export type FvgDirection = "bullish" | "bearish";
export type TradeOutcome = "win" | "loss" | "timeout" | "no_fill";
export type AnalysisStatus = "pending" | "running" | "done" | "error";

// ═══════════════════════════════════════════════════════════════════════════
// WIRE SHAPES — what the backend actually returns
// ═══════════════════════════════════════════════════════════════════════════

/** GET /symbols */
export interface WireSymbolsResponse {
  symbols: Array<{ symbol: string; timeframes: string[] }>;
}

/** GET /ohlc — note `ts_ms`, not `time`; `volume` may be null. */
export interface WireCandle {
  ts: string;
  ts_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface WireOhlcResponse {
  symbol: string;
  timeframe: string;
  count: number;
  candles: WireCandle[];
}

/** GET /live/state — `has_state` false until live_runner.py has recorded a tick. */
export interface WireLiveState {
  symbol: string;
  has_state: boolean;
  message?: string;
  timestamp?: string;
  timestamp_ms?: number;
  recorded_at?: string;
  execution_timeframe?: string;
  timeframes: Record<
    string,
    { bias: string | null; regime: string | number | boolean | null; is_consolidation: boolean | null }
  >;
  topdown_bias?: string | null;
  aligned_count?: number | null;
  bias_gate_passed?: boolean | null;
  direction?: string | null;
  signal_fired?: boolean;
  latest_skip_reason?: string | null;
  latest_skip_reason_raw?: string | null;
  recent_skips: Array<{
    ts: string;
    execution_tf?: string | null;
    skip_reason: string | null;
    skip_reason_raw?: string | null;
  }>;
  skip_reason_counts: Record<string, number>;
}

/** GET /live/zones — one flat array; `kind` discriminates. */
export interface WireZone {
  timeframe: string;
  kind: string; // 'fvg' | 'consolidation'
  direction: string | null;
  price_low: number;
  price_high: number;
  start_ts: string;
  start_ts_ms: number;
  end_ts: string | null;
  end_ts_ms: number | null;
  tested: boolean | null;
  snapshot_ts: string;
  snapshot_ts_ms: number;
}

export interface WireZonesResponse {
  symbol: string;
  timeframe: string | null;
  count: number;
  zones: WireZone[];
}

/** GET /live/levels */
export interface WireLevel {
  timeframe: string;
  price: number;
  touches: number | null;
  type: string;
  snapshot_ts: string;
  snapshot_ts_ms: number;
}

export interface WireLevelsResponse {
  symbol: string;
  timeframe: string | null;
  count: number;
  levels: WireLevel[];
}

/** GET /live/stats */
export interface WireLiveStats {
  source: string;
  symbol: string | null;
  total_trades: number;
  in_flight_trades: number;
  win_rate: number | null;
  avg_rr: number | null;
  wins: number;
  losses: number;
  profit_factor_R: number | null;
  profit_factor_R_infinite: boolean;
  trades: WireLiveTrade[];
}

export interface WireLiveTrade {
  id: number;
  symbol: string;
  timeframe: string;
  direction: string;
  outcome: string;
  entry_price: number | null;
  stop_price: number | null;
  take_profit: number | null;
  planned_rr: number | null;
  realized_rr: number | null;
  pnl: number | null;
  opened_at: string | null;
  opened_at_ms: number | null;
  filled_at: string | null;
  filled_at_ms: number | null;
  resolved_at: string | null;
  resolved_at_ms: number | null;
}

/** GET /analyze/status/{job_id} */
export interface WireAnalysisTrade {
  trade_id: string | number;
  symbol: string;
  timeframe: string;
  direction: string;
  outcome: string;
  signal_ts: string | null;
  signal_ts_ms: number | null;
  entry_price: number | null;
  stop_price: number | null;
  take_profit: number | null;
  planned_rr: number | null;
  realized_rr: number | null;
  pnl: number | null;
  notes: string | null;
}

export interface WireAnalysisSummary {
  source?: string;
  symbol?: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  avg_rr: number | null;
  profit_factor_R: number | null;
  profit_factor_R_infinite: boolean;
  by_direction?: Record<
    string,
    { trades: number; wins: number; win_rate: number | null; avg_rr: number | null }
  >;
}

/**
 * The real funnel is a set of rejection counters, not a monotonic cascade.
 * `test_points` is the population, `trades_resolved` the outcome, and the rest
 * are the reasons a test point produced no resolved trade.
 */
export interface WireFunnel {
  test_points: number;
  insufficient_htf: number;
  all_slots_busy: number;
  zone_already_held: number;
  level_in_cooldown: number;
  no_fill: number;
  timeout: number;
  trades_resolved: number;
  skips: number;
  errors: number;
  opposing_concurrent: number;
}

export interface WireAnalysisStatusResponse {
  job_id: string;
  status: string; // queued | running | done | error
  symbol: string;
  timeframe: string | null;
  start_date: string | null;
  end_date: string | null;
  step: number | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  summary: WireAnalysisSummary | null;
  funnel: WireFunnel | null;
  trades: WireAnalysisTrade[];
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALISED SHAPES — what the components consume
// ═══════════════════════════════════════════════════════════════════════════

/** One symbol and the timeframes the backend actually has CSVs for. */
export interface SymbolInfo {
  symbol: string;
  /** Uppercase, as the backend reports them: 1H, 4H, 1D, 15M … */
  timeframes: string[];
}

export interface LiveState {
  /** False until live_runner.py has recorded a tick; drives a distinct panel. */
  hasState: boolean;
  /** The backend's own explanation when hasState is false. */
  message: string | null;
  bias: Record<string, Bias>;
  regime: Record<string, boolean>;
  consolidation: Record<string, boolean>;
  current_skip_reason: string | null;
  recent_skips: SkipEntry[];
  /** Aggregate top-down read, when the backend supplies one. */
  topdownBias: Bias | null;
  alignedCount: number | null;
  biasGatePassed: boolean | null;
  executionTimeframe: string | null;
  updatedAt: string | null;
}

export interface SkipEntry {
  timestamp: string;
  reason: string;
  timeframe: string | null;
}

export interface FvgZone {
  start_time: number;
  end_time: number;
  price_low: number;
  price_high: number;
  direction: FvgDirection;
  timeframe: string;
  tested: boolean | null;
}

export interface ConsolidationZone {
  start_time: number;
  end_time: number;
  price_low: number;
  price_high: number;
  timeframe: string;
}

export interface ZonesResponse {
  fvg: FvgZone[];
  consolidation: ConsolidationZone[];
}

export interface Level {
  price: number;
  type: LevelType;
  touches: number | null;
  timeframe: string;
}

export interface LevelsResponse {
  levels: Level[];
}

export interface ProfitFactorValue {
  profit_factor_R: number | null;
  profit_factor_R_infinite: boolean;
}

export interface LiveStats {
  /** Fraction 0–1, or null when no trades have resolved. */
  win_rate: number | null;
  avg_rr: number | null;
  pf_R: ProfitFactorValue;
  trade_count: number;
  in_flight: number;
  wins: number;
  losses: number;
}

export interface Candle {
  /** Unix seconds — converted from the backend's ts_ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcResponse {
  candles: Candle[];
}

export interface AnalyzeRequest {
  symbol: string;
  start_date: string;
  end_date: string;
}

export interface AnalyzeResponse {
  job_id: string;
}

export interface Trade {
  entry_time: number;
  entry: number;
  sl: number;
  tp: number;
  direction: "long" | "short";
  outcome: TradeOutcome;
  /**
   * Absent for analysis trades — the backend stores only the signal timestamp,
   * so there is no exit time to draw to.
   */
  exit_time?: number;
  exit_price?: number;
  rr_achieved?: number;
  planned_rr?: number;
  timeframe?: string;
}

/** Rejection counters, ordered for display; `total` is the population. */
export interface FunnelBreakdown {
  total: number;
  resolved: number;
  reasons: Array<{ key: string; label: string; count: number }>;
}

export interface AnalysisStats {
  win_rate: number | null;
  avg_rr: number | null;
  pf_R: ProfitFactorValue;
  trade_count: number;
  wins: number;
  losses: number;
  funnel: FunnelBreakdown;
}

export interface AnalysisResult {
  trades: Trade[];
  stats: AnalysisStats;
}

export interface AnalysisStatusResponse {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  error?: string;
  timeframe: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface PatternHit {
  time: number;
  price: number;
  pattern_name: string;
  direction?: "long" | "short";
}
