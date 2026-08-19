// API Module - Single swap point for backend integration
// All fetch calls live here. Replace stub implementations with real API calls.

import type {
  LiveState,
  ZonesResponse,
  LevelsResponse,
  LiveStats,
  OhlcResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  AnalysisStatusResponse,
  Trade,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Get available symbols from backend
 */
export async function getSymbols(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/symbols`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Health check endpoint
 */
export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Get current live state including bias and regime info
 */
export async function getLiveState(symbol: string): Promise<LiveState> {
  const response = await fetch(`${API_BASE_URL}/live/state?symbol=${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Get FVG and consolidation zones
 */
export async function getZones(symbol: string, timeframe: string): Promise<ZonesResponse> {
  const response = await fetch(
    `${API_BASE_URL}/live/zones?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Get support/resistance levels
 */
export async function getLevels(symbol: string, timeframe: string): Promise<LevelsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/live/levels?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Get live trading stats
 */
export async function getLiveStats(symbol: string): Promise<LiveStats> {
  const response = await fetch(`${API_BASE_URL}/live/stats?symbol=${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Get OHLC candle data for chart
 */
export async function getOhlc(symbol: string, timeframe: string, limit: number = 100): Promise<OhlcResponse> {
  const response = await fetch(
    `${API_BASE_URL}/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Start analysis job
 */
export async function startAnalysis(params: AnalyzeRequest & { step?: string }): Promise<AnalyzeResponse> {
  const url = new URL(`${API_BASE_URL}/analyze`);
  url.searchParams.set('symbol', params.symbol);
  url.searchParams.set('start_date', params.start_date);
  url.searchParams.set('end_date', params.end_date);
  if (params.step) {
    url.searchParams.set('step', params.step);
  }
  const response = await fetch(url.toString(), { method: 'POST' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Poll analysis job status
 */
export async function getAnalysisStatus(jobId: string): Promise<AnalysisStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/status/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * Get list of analysis jobs
 */
export async function getAnalysisJobs(): Promise<{ jobs: Array<{ job_id: string; status: string; symbol: string; created_at: string }> }> {
  const response = await fetch(`${API_BASE_URL}/analyze/jobs`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

export { API_BASE_URL };
