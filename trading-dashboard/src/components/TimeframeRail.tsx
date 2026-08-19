// Vertical timeframe rail. Runs down the left edge of the chart region rather
// than sitting above it — this is the layout decision that stops the panel
// reading as a generic dashboard.
//
// Provenance comes from GET /symbols, per symbol, so the glyphs tell the truth
// for the pair on screen rather than for some global assumption:
//   ●  native      — the backend has this timeframe for this symbol
//   ∼  derived     — resampled in the browser from a timeframe it does have
//   ·  unsupported — no data for this symbol; selecting it explains why
//
// The leading digit is the keyboard shortcut.

import { classify, TIMEFRAMES, type TimeframeSource } from "../lib/timeframes";
import { cn } from "../lib/utils";

const GLYPH: Record<TimeframeSource, string> = {
  native: "●",
  derived: "∼",
  unsupported: "·",
};

const GLYPH_TONE: Record<TimeframeSource, string> = {
  native: "text-etch",
  derived: "text-etch-dim",
  unsupported: "text-etch-dim/60",
};

const SOURCE_TITLE: Record<TimeframeSource, string> = {
  native: "Served directly by the backend for this symbol",
  derived: "Resampled in the browser from a timeframe the backend does have",
  unsupported: "The backend has no data for this symbol at this timeframe",
};

export function TimeframeRail({
  value,
  onChange,
  available,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  /** The selected symbol's timeframes, from GET /symbols. */
  available: string[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Timeframe"
      className={cn("flex w-14 shrink-0 flex-col hair-r", className)}
    >
      <div className="relative flex h-7 items-center justify-center pt-2 bracket">
        <span className="eyebrow">TF</span>
      </div>

      <ul className="flex flex-col">
        {TIMEFRAMES.map((tf) => {
          const active = tf.id === value;
          const source = classify(tf.id, available);
          return (
            <li key={tf.id}>
              <button
                type="button"
                onClick={() => onChange(tf.id)}
                aria-current={active ? "true" : undefined}
                title={`${tf.name} — ${SOURCE_TITLE[source]} (press ${tf.hotkey})`}
                className={cn(
                  "group relative flex h-9 w-full items-center justify-center gap-1 transition-colors",
                  active ? "bg-well" : "hover:bg-bay"
                )}
              >
                {/* Active state is a 2px accent edge-tick, never a fill. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 transition-colors",
                    active ? "bg-arc" : "bg-transparent"
                  )}
                />
                <span
                  aria-hidden
                  className="data absolute left-[6px] top-1 text-[8px] leading-none text-etch-dim/70"
                >
                  {tf.hotkey}
                </span>
                <span
                  className={cn(
                    "data text-[11px] leading-none transition-colors",
                    active
                      ? "font-medium text-signal"
                      : source === "unsupported"
                        ? "text-etch-dim group-hover:text-etch"
                        : "text-etch group-hover:text-signal"
                  )}
                >
                  {tf.id}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "data absolute bottom-1 text-[8px] leading-none",
                    active ? "text-arc" : GLYPH_TONE[source]
                  )}
                >
                  {GLYPH[source]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Legend for the provenance glyphs. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-rule px-1.5 py-2">
        {(["native", "derived", "unsupported"] as TimeframeSource[]).map((s) => (
          <div key={s} className="flex items-center gap-1" title={SOURCE_TITLE[s]}>
            <span aria-hidden className={cn("data w-2 text-[8px] leading-none", GLYPH_TONE[s])}>
              {GLYPH[s]}
            </span>
            <span className="label text-[8px] leading-none text-etch-dim">
              {s === "native" ? "LIVE" : s === "derived" ? "CALC" : "NONE"}
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}
