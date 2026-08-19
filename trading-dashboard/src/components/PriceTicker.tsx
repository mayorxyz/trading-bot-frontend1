// Last-price readout. Derived from the candles already on screen — no extra
// endpoint — so it always agrees with the chart.
//
// The price cell flashes green on an up-tick and red on a down-tick. The flash
// is keyed on a nonce so two consecutive ticks in the same direction still
// replay the animation.

import { formatPercentChange, formatPrice, formatStamp, formatVolume } from "../lib/format";
import { useTickDirection } from "../hooks/useTickDirection";
import type { Candle } from "../types";
import { cn } from "../lib/utils";

export function PriceTicker({
  candles,
  symbol,
  timeframe,
  className,
}: {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  className?: string;
}) {
  const last = candles.length > 0 ? candles[candles.length - 1] : null;
  const previous = candles.length > 1 ? candles[candles.length - 2] : null;

  const { direction, nonce } = useTickDirection(last?.close ?? null);

  const change =
    last && previous && previous.close !== 0
      ? ((last.close - previous.close) / previous.close) * 100
      : null;

  const changeTone =
    change == null ? "text-etch" : change > 0 ? "text-long" : change < 0 ? "text-short" : "text-flat";

  return (
    <div className={cn("flex flex-col justify-center gap-1.5 px-4", className)}>
      <div className="flex items-baseline gap-2">
        <span className="label text-etch">Last</span>
        <span className="data text-[9px] text-etch-dim">
          {symbol} · {timeframe}
        </span>
      </div>

      <div className="flex items-baseline gap-3">
        <span
          key={nonce}
          className={cn(
            "data -mx-1 px-1 text-hero font-semibold tabular-nums",
            direction === "up" && "animate-tick-up",
            direction === "down" && "animate-tick-down",
            direction === "none" && "text-signal"
          )}
        >
          {formatPrice(last?.close)}
        </span>

        <span className={cn("data flex items-center gap-1 text-data-sm", changeTone)}>
          <span aria-hidden>{change == null ? "" : change > 0 ? "▲" : change < 0 ? "▼" : "■"}</span>
          {formatPercentChange(change)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="data text-[10px] text-etch-dim">
          vol {formatVolume(last?.volume)}
        </span>
        <span aria-hidden className="h-2 w-px bg-rule" />
        <span className="data text-[10px] text-etch-dim">{formatStamp(last?.time)}</span>
      </div>
    </div>
  );
}
