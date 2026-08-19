// Numeric formatting for the data face. Every value that reaches the screen
// passes through here so precision is consistent across panels.

import type { ProfitFactorValue } from "../types";

const EM_DASH = "—";

/**
 * Price, with precision scaled to magnitude — a 67,412.50 and a 0.00004182
 * both need to read cleanly in the same column.
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 8;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed percentage, e.g. "+1.24%". */
export function formatPercentChange(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Rate expressed 0–1 on the wire, shown as a percentage. */
export function formatRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return `${(value * 100).toFixed(1)}%`;
}

/** R-multiple / ratio. */
export function formatRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return value.toFixed(2);
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Profit factor arrives either as a bare number or as the wrapped
 * `{ profit_factor_R, profit_factor_R_infinite }` shape. Both are handled.
 */
export function formatProfitFactor(value: number | ProfitFactorValue | null | undefined): string {
  if (value == null) return EM_DASH;
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "∞";
  if (value.profit_factor_R_infinite) return "∞";
  return value.profit_factor_R != null ? value.profit_factor_R.toFixed(2) : EM_DASH;
}

/** Compacted volume: 1.2M, 843K, 512. */
export function formatVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

/** Clock time from a unix-seconds candle stamp. */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return EM_DASH;
  return new Date(seconds * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Clock time from an ISO timestamp; falls back to the raw string. */
export function formatIsoClock(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Date + time, for candle stamps that span days. */
export function formatStamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return EM_DASH;
  const d = new Date(seconds * 1000);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

/** Turn a backend snake_case reason code into something readable. */
export function humanizeReason(reason: string): string {
  return reason.replace(/_/g, " ");
}
