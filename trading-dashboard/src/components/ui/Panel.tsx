// Structural primitives. No cards, no shadows, no radius — regions are defined
// by hairline rules and three background steps. Everything else composes these.

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * A region of the instrument panel. `divide` places the hairline on the given
 * edges so a grid of Panels reads as one continuous surface rather than a set
 * of floating cards.
 */
export function Panel({
  children,
  className,
  divide = "b",
  inset = false,
}: {
  children: ReactNode;
  className?: string;
  divide?: "b" | "t" | "r" | "l" | "br" | "bl" | "tr" | "none";
  inset?: boolean;
}) {
  const rules: Record<string, string> = {
    b: "hair-b",
    t: "hair-t",
    r: "hair-r",
    l: "hair-l",
    br: "hair-b hair-r",
    bl: "hair-b hair-l",
    tr: "hair-t hair-r",
    none: "",
  };

  return (
    <section className={cn(inset && "bg-bay", rules[divide], className)}>{children}</section>
  );
}

/**
 * Section eyebrow with bracket ticks. `trailing` holds right-aligned metadata
 * (counts, source annotations) on the same baseline.
 */
export function PanelHead({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative flex h-7 items-center justify-between px-3 pt-2 bracket",
        className
      )}
    >
      <span className="eyebrow">{children}</span>
      {trailing ? <span className="data text-data-xs text-etch">{trailing}</span> : null}
    </header>
  );
}

/** Label-over-value pair. The unit of every readout in the panel. */
export function Readout({
  label,
  children,
  className,
  size = "md",
  tone = "signal",
}: {
  label: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "signal" | "long" | "short" | "flat" | "etch";
}) {
  const sizes = {
    sm: "text-data-sm font-normal",
    md: "text-data-lg font-medium",
    lg: "text-hero font-semibold",
  };
  const tones = {
    signal: "text-signal",
    long: "text-long",
    short: "text-short",
    flat: "text-flat",
    etch: "text-etch",
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="label text-etch">{label}</span>
      <span className={cn("data", sizes[size], tones[tone])}>{children}</span>
    </div>
  );
}

/** 4px status LED. The only place a filled colour dot is permitted on chrome. */
export function Led({
  tone,
  pulse = false,
  className,
}: {
  tone: "arc" | "long" | "short" | "flat" | "etch";
  pulse?: boolean;
  className?: string;
}) {
  const tones = {
    arc: "bg-arc",
    long: "bg-long",
    short: "bg-short",
    flat: "bg-flat",
    etch: "bg-etch-dim",
  };
  return (
    <span
      aria-hidden
      className={cn("h-1 w-1 shrink-0 rounded-full", tones[tone], pulse && "animate-pulse-dot", className)}
    />
  );
}

/** Vertical hairline used to separate items inside a single band. */
export function Divider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("w-px self-stretch bg-rule", className)} />;
}
