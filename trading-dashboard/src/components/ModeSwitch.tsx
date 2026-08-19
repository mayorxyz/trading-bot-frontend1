// Mode switch. A two-position slider with a translating knob rather than a tab
// pair — physical enough to read as hardware, quiet enough not to compete with
// the bias compass.
//
// The LED carries the semantics: cyan and pulsing while polling live data,
// static graphite for historical analysis.

import { cn } from "../lib/utils";

export type Mode = "live" | "analysis";

export function ModeSwitch({
  mode,
  onChange,
  className,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  className?: string;
}) {
  const isLive = mode === "live";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange("live");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange("analysis");
    }
  };

  return (
    <div
      role="group"
      aria-label="Data mode"
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex h-7 select-none items-stretch border border-rule bg-bay",
        className
      )}
    >
      {/* Knob: slides between halves. Bordered, seated — no glow, no fill. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-[1px] left-[1px] w-[calc(50%-1px)] border bg-well",
          "transition-transform duration-[280ms] ease-[cubic-bezier(0.34,1.28,0.64,1)]",
          isLive ? "translate-x-0 border-arc/50" : "translate-x-full border-rule-bright"
        )}
      />

      <button
        type="button"
        onClick={() => onChange("live")}
        aria-pressed={isLive}
        className="relative z-10 flex w-[74px] items-center justify-center gap-1.5"
      >
        <span
          aria-hidden
          className={cn(
            "h-1 w-1 rounded-full transition-colors",
            isLive ? "bg-arc animate-pulse-dot" : "bg-etch-dim"
          )}
        />
        <span
          className={cn(
            "label text-[10px] transition-colors",
            isLive ? "text-signal" : "text-etch-dim"
          )}
        >
          Live
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChange("analysis")}
        aria-pressed={!isLive}
        className="relative z-10 flex w-[74px] items-center justify-center gap-1.5"
      >
        <span
          aria-hidden
          className={cn(
            "h-1 w-1 rounded-full transition-colors",
            !isLive ? "bg-etch" : "bg-etch-dim"
          )}
        />
        <span
          className={cn(
            "label text-[10px] transition-colors",
            !isLive ? "text-signal" : "text-etch-dim"
          )}
        >
          Analysis
        </span>
      </button>
    </div>
  );
}
