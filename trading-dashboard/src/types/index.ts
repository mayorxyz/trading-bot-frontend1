// Trading Bot Dashboard Types

export type Bias = "LONG" | "SHORT" | "NEUTRAL";
export type LevelType = "SUPPORT" | "RESISTANCE" | "BOTH";
export type FvgDirection = "bullish" | "bearish";
export type TradeOutcome = "win" | "loss" | "timeout" | "no_fill";
export type AnalysisStatus = "pending" | "running" | "done" | "error";

export interface LiveState {
  bias: Record<string, Bias>;
  regime: Record<string, boolean>;
  current_skip_reason: string | null;
  recent_skips: SkipEntry[];
}

export interface SkipEntry {
  timestamp: string;
  reason: string;
}

export interface FvgZone {
  start_time: number;
  end_time: number;
  price_low: number;
  price_high: number;
  direction: FvgDirection;
}

export interface ConsolidationZone {
  start_time: number;
  end_time: number;
  price_low: number;
  price_high: number;
}

export interface ZonesResponse {
  fvg: FvgZone[];
  consolidation: ConsolidationZone[];
}

export interface Level {
  price: number;
  type: LevelType;
}

export interface LevelsResponse {
  levels: Level[];
}

export interface LiveStats {
  win_rate: number;
  avg_rr: number;
  pf_R: number;
  trade_count: number;
}

export interface Candle {
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
  exit_time: number;
  exit_price?: number;
  rr_achieved?: number;
}

export interface FunnelBreakdown {
  total_signals: number;
  passed_regime: number;
  passed_alignment: number;
  passed_consolidation: number;
  entered_trades: number;
}

export interface AnalysisStats {
  win_rate: number;
  avg_rr: number;
  pf_R: number;
  funnel: FunnelBreakdown;
  trade_count: number;
}

export interface AnalysisResult {
  trades: Trade[];
  stats: AnalysisStats;
}

export interface AnalysisStatusResponse {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  error?: string;
}

export interface PatternHit {
  time: number;
  price: number;
  pattern_name: string;
  direction?: "long" | "short";
}
