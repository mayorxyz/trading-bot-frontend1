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

function generateStubCandles(count: number = 100): OhlcResponse {
  const now = Math.floor(Date.now() / 1000);
  const candles: OhlcResponse["candles"] = [];
  let price = 45000 + Math.random() * 1000;
  
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * 3600;
    const volatility = 50 + Math.random() * 100;
    const open = price;
    const close = price + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    candles.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 10000),
    });
    
    price = close;
  }
  
  return { candles };
}

function generateStubLiveState(): LiveState {
  const biases = ["LONG", "SHORT", "NEUTRAL"] as const;
  
  return {
    bias: {
      "1D": biases[Math.floor(Math.random() * biases.length)],
      "4H": biases[Math.floor(Math.random() * biases.length)],
      "1H": biases[Math.floor(Math.random() * biases.length)],
    },
    regime: {
      "1D": Math.random() < 0.3,
      "4H": Math.random() < 0.3,
      "1H": Math.random() < 0.3,
    },
    current_skip_reason: Math.random() < 0.4 ? null : 
      ["regime=consolidation", "not aligned", "waiting for confirmation", "low volume"][
        Math.floor(Math.random() * 4)
      ],
    recent_skips: Array.from({ length: 8 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 300000).toISOString(),
      reason: [
        "regime=consolidation",
        "not aligned",
        "waiting for confirmation",
        "low volume",
        "spread too wide",
      ][Math.floor(Math.random() * 5)],
    })),
  };
}

function generateStubZones(): ZonesResponse {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    fvg: Array.from({ length: 3 }, () => ({
      start_time: now - Math.floor(Math.random() * 86400 * 7),
      end_time: now - Math.floor(Math.random() * 86400 * 3),
      price_low: 44500 + Math.random() * 500,
      price_high: 45000 + Math.random() * 500,
      direction: Math.random() < 0.5 ? "bullish" : "bearish" as const,
    })),
    consolidation: Array.from({ length: 2 }, () => ({
      start_time: now - Math.floor(Math.random() * 86400 * 14),
      end_time: now - Math.floor(Math.random() * 86400 * 7),
      price_low: 44000 + Math.random() * 400,
      price_high: 45500 + Math.random() * 400,
    })),
  };
}

function generateStubLevels(): LevelsResponse {
  const types = ["SUPPORT", "RESISTANCE", "BOTH"] as const;
  
  return {
    levels: Array.from({ length: 5 }, () => ({
      price: 44000 + Math.floor(Math.random() * 2000),
      type: types[Math.floor(Math.random() * types.length)],
    })),
  };
}

function generateStubStats(): LiveStats {
  return {
    win_rate: 0.55 + Math.random() * 0.2,
    avg_rr: 1.5 + Math.random() * 2,
    pf_R: 1.2 + Math.random() * 1.5,
    trade_count: Math.floor(20 + Math.random() * 50),
  };
}

/**
 * Get current live state including bias and regime info
 * TODO: Replace with real call to GET /live/state?symbol=
 */
export async function getLiveState(symbol: string): Promise<LiveState> {
  try {
    // TODO: Replace with real fetch
    // const response = await fetch(`${API_BASE_URL}/live/state?symbol=${encodeURIComponent(symbol)}`);
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return generateStubLiveState();
  } catch (error) {
    console.error("Failed to fetch live state:", error);
    throw error;
  }
}

/**
 * Get FVG and consolidation zones
 * TODO: Replace with real call to GET /live/zones?symbol=&timeframe=
 */
export async function getZones(symbol: string, timeframe: string): Promise<ZonesResponse> {
  try {
    // TODO: Replace with real fetch
    // const response = await fetch(
    //   `${API_BASE_URL}/live/zones?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
    // );
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    return generateStubZones();
  } catch (error) {
    console.error("Failed to fetch zones:", error);
    throw error;
  }
}

/**
 * Get support/resistance levels
 * TODO: Replace with real call to GET /live/levels?symbol=&timeframe=
 */
export async function getLevels(symbol: string, timeframe: string): Promise<LevelsResponse> {
  try {
    // TODO: Replace with real fetch
    // const response = await fetch(
    //   `${API_BASE_URL}/live/levels?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
    // );
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    return generateStubLevels();
  } catch (error) {
    console.error("Failed to fetch levels:", error);
    throw error;
  }
}

/**
 * Get live trading stats
 * TODO: Replace with real call to GET /live/stats?symbol=
 */
export async function getLiveStats(symbol: string): Promise<LiveStats> {
  try {
    // TODO: Replace with real fetch
    // const response = await fetch(`${API_BASE_URL}/live/stats?symbol=${encodeURIComponent(symbol)}`);
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    return generateStubStats();
  } catch (error) {
    console.error("Failed to fetch live stats:", error);
    throw error;
  }
}

/**
 * Get OHLC candle data for chart
 * TODO: Replace with real call to GET /ohlc?symbol=&timeframe=&limit=
 */
export async function getOhlc(symbol: string, timeframe: string, limit: number = 100): Promise<OhlcResponse> {
  try {
    // TODO: Replace with real fetch
    // const response = await fetch(
    //   `${API_BASE_URL}/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
    // );
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return generateStubCandles(limit);
  } catch (error) {
    console.error("Failed to fetch OHLC data:", error);
    throw error;
  }
}

/**
 * Start analysis job
 * TODO: Replace with real call to POST /analyze?symbol=&start_date=&end_date=
 */
export async function startAnalysis(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    // TODO: Replace with real fetch
    // const url = new URL(`${API_BASE_URL}/analyze`);
    // url.searchParams.set('symbol', params.symbol);
    // url.searchParams.set('start_date', params.start_date);
    // url.searchParams.set('end_date', params.end_date);
    // const response = await fetch(url.toString(), { method: 'POST' });
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    return { job_id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
  } catch (error) {
    console.error("Failed to start analysis:", error);
    throw error;
  }
}

/**
 * Poll analysis job status
 * TODO: Replace with real call to GET /analyze/status/{job_id}
 */
export async function getAnalysisStatus(jobId: string): Promise<AnalysisStatusResponse> {
  try {
    // TODO: Replace with real fetch
    // const response = await fetch(`${API_BASE_URL}/analyze/status/${encodeURIComponent(jobId)}`);
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return await response.json();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const progress = (Date.now() % 5000) / 5000;
    
    let status: "pending" | "running" | "done" = "running";
    if (progress < 0.2) status = "pending";
    else if (progress < 0.8) status = "running";
    else status = "done";
    
    if (status === "done") {
      const trades: Trade[] = Array.from({ length: 15 }, (_, i) => {
        const entry = 44500 + Math.random() * 1000;
        const direction = Math.random() < 0.5 ? ("long" as const) : ("short" as const);
        const outcomeRoll = Math.random();
        
        return {
          entry_time: Math.floor(Date.now() / 1000) - (15 - i) * 86400,
          entry,
          sl: direction === "long" ? entry - 100 : entry + 100,
          tp: direction === "long" ? entry + 200 : entry - 200,
          direction,
          outcome: outcomeRoll < 0.6 ? ("win" as const) : outcomeRoll < 0.85 ? ("loss" as const) : ("timeout" as const),
          exit_time: Math.floor(Date.now() / 1000) - (14 - i) * 86400,
          exit_price: entry + (direction === "long" ? 1 : -1) * (50 + Math.random() * 200),
          rr_achieved: 0.5 + Math.random() * 2.5,
        };
      });
      
      return {
        status: "done",
        result: {
          trades,
          stats: {
            win_rate: 0.58,
            avg_rr: 1.85,
            pf_R: 1.72,
            funnel: {
              total_signals: 150,
              passed_regime: 98,
              passed_alignment: 67,
              passed_consolidation: 42,
              entered_trades: trades.length,
            },
            trade_count: trades.length,
          },
        },
      };
    }
    
    return {
      status,
      result: null,
    };
  } catch (error) {
    console.error("Failed to get analysis status:", error);
    throw error;
  }
}

export { API_BASE_URL };
