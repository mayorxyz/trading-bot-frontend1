// ════════════════════════════════════════════════════════════════════════════
// TIMEFRAME REGISTRY
//
// The selector exposes nine timeframes. Which of them work is not a constant —
// it is per symbol, and the backend already reports it: GET /symbols returns
// each symbol alongside the timeframes it has data for (BTCUSDT currently has
// 15M/1H/4H/1D; every other pair has 1H/4H/1D). This module turns that list
// into one of three states per timeframe:
//
//   native      — the backend has this timeframe for this symbol.
//   derived     — resampled in the browser from `base`. Zones and levels come
//                 from `base`, and the UI labels them as such.
//   unsupported — no data for this symbol. The request is not attempted and the
//                 chart explains what is missing.
//
// One naming hazard is handled explicitly. The backend uppercases timeframes for
// display, so a 1-minute file ("1m") is reported as "1M" — indistinguishable
// from a 1-month bar. The week and month entries therefore carry no wire name at
// all: they can only ever be derived from 1d, so a backend "1M" can never be
// mistaken for monthly data.
//
// Nothing here touches the API contract; resampling is a pure client transform.
// ════════════════════════════════════════════════════════════════════════════

import type { Candle } from "../types";

export type TimeframeSource = "native" | "derived" | "unsupported";

export interface TimeframeSpec {
  /** Display label and the app's internal identifier. */
  id: string;
  /**
   * Exact value sent as ?timeframe=. Absent for timeframes that are only ever
   * derived, which is what keeps 1M (month) from matching a backend 1M (minute).
   */
  wire?: string;
  /** For derived timeframes: the wire timeframe the candles are resampled from. */
  base?: string;
  /** For derived timeframes: how base candles are bucketed. */
  bucket?: "week" | "month";
  /** Base candles consumed per derived candle — used to size the request. */
  ratio?: number;
  /** Keyboard shortcut (digit). */
  hotkey: string;
  /** Long-form name for tooltips and notices. */
  name: string;
}

/** Displayed top-to-bottom in the rail; hotkeys 1–9 follow the same order. */
export const TIMEFRAMES: TimeframeSpec[] = [
  { id: "1m", wire: "1m", hotkey: "1", name: "1 minute" },
  { id: "5m", wire: "5m", hotkey: "2", name: "5 minutes" },
  { id: "15m", wire: "15m", hotkey: "3", name: "15 minutes" },
  { id: "30m", wire: "30m", hotkey: "4", name: "30 minutes" },
  { id: "1H", wire: "1h", hotkey: "5", name: "1 hour" },
  { id: "4H", wire: "4h", hotkey: "6", name: "4 hours" },
  { id: "1D", wire: "1d", hotkey: "7", name: "1 day" },
  { id: "1W", base: "1d", bucket: "week", ratio: 7, hotkey: "8", name: "1 week" },
  { id: "1M", base: "1d", bucket: "month", ratio: 31, hotkey: "9", name: "1 month" },
];

/**
 * First-load default. Must be a timeframe every symbol has, so a fresh session
 * never opens onto an empty chart.
 */
export const DEFAULT_TIMEFRAME = "4H";

/**
 * Assumed availability when /symbols has not answered yet, or answered without
 * per-symbol timeframes. Matches what every pair in the data directory has.
 */
const ASSUMED_AVAILABLE = ["1h", "4h", "1d"];

/** Upper bound on a single /ohlc request, so derived timeframes stay reasonable. */
const MAX_REQUEST_LIMIT = 1000;

export function getTimeframe(id: string): TimeframeSpec {
  return (
    TIMEFRAMES.find((t) => t.id === id) ??
    TIMEFRAMES.find((t) => t.id === DEFAULT_TIMEFRAME) ??
    TIMEFRAMES[0]
  );
}

export function isTimeframeId(value: unknown): value is string {
  return typeof value === "string" && TIMEFRAMES.some((t) => t.id === value);
}

/** Case-insensitive availability set for one symbol. */
function availableSet(available: string[] | undefined): Set<string> {
  const list = available && available.length > 0 ? available : ASSUMED_AVAILABLE;
  return new Set(list.map((t) => t.toLowerCase()));
}

/**
 * How a timeframe is satisfied for a given symbol.
 *
 * `available` is that symbol's `timeframes` from GET /symbols. Pass an empty
 * array before the response lands; the assumed set keeps the rail honest rather
 * than briefly marking everything unsupported.
 */
export function classify(id: string, available: string[] | undefined): TimeframeSource {
  const spec = getTimeframe(id);
  const set = availableSet(available);

  if (spec.wire && set.has(spec.wire)) return "native";
  if (spec.base && set.has(spec.base)) return "derived";
  return "unsupported";
}

/**
 * Translate a selected timeframe into the request the backend can answer: which
 * timeframe to ask for, how many candles, and whether the response needs
 * resampling. Returns `null` when the symbol has no data path to this timeframe,
 * so callers skip the request instead of provoking a 404.
 */
export function resolveRequest(
  id: string,
  desiredCandles: number,
  available?: string[]
): { timeframe: string; limit: number; needsResample: boolean } | null {
  const spec = getTimeframe(id);
  const source = classify(id, available);

  if (source === "native" && spec.wire) {
    return { timeframe: spec.wire, limit: desiredCandles, needsResample: false };
  }

  if (source === "derived" && spec.base) {
    return {
      timeframe: spec.base,
      limit: Math.min(desiredCandles * (spec.ratio ?? 1), MAX_REQUEST_LIMIT),
      needsResample: true,
    };
  }

  return null;
}

/** Native timeframes for a symbol, in rail order. Rendered in notices. */
export function nativeTimeframes(available: string[] | undefined): string[] {
  return TIMEFRAMES.filter((t) => classify(t.id, available) === "native").map((t) => t.id);
}

/**
 * Which timeframe the zones/levels on screen actually describe. For a derived
 * timeframe that is the base, not the selection — the UI says so out loud.
 */
export function overlayTimeframe(id: string, available?: string[]): string {
  const spec = getTimeframe(id);
  if (classify(id, available) === "derived" && spec.base) {
    return TIMEFRAMES.find((t) => t.wire === spec.base)?.id ?? spec.base.toUpperCase();
  }
  return spec.id;
}

// ─── Resampling ─────────────────────────────────────────────────────────────

/** Start of the ISO week (Monday 00:00 UTC) containing `seconds`. */
function weekStart(seconds: number): number {
  const d = new Date(seconds * 1000);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offsetToMonday) / 1000
  );
}

/** Start of the calendar month (1st 00:00 UTC) containing `seconds`. */
function monthStart(seconds: number): number {
  const d = new Date(seconds * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

/**
 * Aggregate candles into coarser buckets. Open is the first open in the bucket,
 * close the last close, high/low the extremes, volume the sum. Input is sorted
 * defensively so a differently-ordered response cannot corrupt a bucket.
 *
 * Purely an aggregation of rows the backend sent — no bar is interpolated, and a
 * gap in the source data stays a gap.
 */
export function resample(candles: Candle[], bucket: "week" | "month"): Candle[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  const keyOf = bucket === "week" ? weekStart : monthStart;
  const ordered = [...candles].sort((a, b) => a.time - b.time);
  const out: Candle[] = [];

  for (const c of ordered) {
    const key = keyOf(c.time);
    const current = out[out.length - 1];

    if (current && current.time === key) {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      current.volume += c.volume ?? 0;
    } else {
      out.push({
        time: key,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      });
    }
  }

  return out;
}

/** Apply a timeframe's declared derivation to a raw base-timeframe response. */
export function applyDerivation(id: string, candles: Candle[]): Candle[] {
  const spec = getTimeframe(id);
  if (spec.bucket) return resample(candles, spec.bucket);
  return Array.isArray(candles) ? candles : [];
}
