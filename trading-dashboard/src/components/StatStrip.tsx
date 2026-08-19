// Shared performance readout row. Previously duplicated verbatim in LiveView and
// AnalysisView; both now render this. Separated by vertical hairlines instead of
// being boxed as cards.
//
// The backend sends null for win_rate / avg_rr / profit factor until a trade
// resolves. Null renders as an em dash, never as 0% — "no data yet" and "zero
// percent" are different readings and must not look alike.

import { formatCount, formatProfitFactor, formatRate, formatRatio } from "../lib/format";
import type { ProfitFactorValue } from "../types";
import { cn } from "../lib/utils";

export interface StatStripValues {
  win_rate?: number | null;
  avg_rr?: number | null;
  pf_R?: ProfitFactorValue | number | null;
  trade_count?: number | null;
}

export function StatStrip({
  stats,
  className,
}: {
  stats?: StatStripValues | null;
  className?: string;
}) {
  const cells: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Win rate", value: formatRate(stats?.win_rate) },
    { label: "Avg R:R", value: formatRatio(stats?.avg_rr) },
    { label: "PF (R)", value: formatProfitFactor(stats?.pf_R) },
    { label: "Trades", value: formatCount(stats?.trade_count) },
  ];

  // Win rate and profit factor are the two that carry a verdict, so they are the
  // only two allowed to take a semantic colour — and only once real.
  const winRate = stats?.win_rate;
  if (winRate != null && Number.isFinite(winRate)) {
    cells[0].tone = winRate >= 0.5 ? "text-long" : winRate < 0.4 ? "text-short" : "text-signal";
  }

  const pf = stats?.pf_R;
  const pfNumber =
    typeof pf === "number"
      ? pf
      : pf?.profit_factor_R_infinite
        ? Infinity
        : (pf?.profit_factor_R ?? null);
  if (pfNumber != null) {
    cells[2].tone = pfNumber >= 1 ? "text-long" : "text-short";
  }

  return (
    <div className={cn("grid grid-cols-4", className)}>
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={cn("flex flex-col gap-1.5 px-4 py-3", i > 0 && "hair-l")}
        >
          <span className="label text-etch">{cell.label}</span>
          <span className={cn("data text-data-lg font-medium", cell.tone ?? "text-signal")}>
            {cell.value}
          </span>
        </div>
      ))}
    </div>
  );
}
