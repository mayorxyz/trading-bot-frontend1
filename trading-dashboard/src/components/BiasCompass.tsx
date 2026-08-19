// ════════════════════════════════════════════════════════════════════════════
// BIAS COMPASS — the signature element
//
// Three concentric arc tracks read the bias of the three highest timeframes the
// backend reports (outer = slowest). Each track lights only its own sector:
// SHORT left, NEUTRAL centre, LONG right.
//
// One needle points at the weighted aggregate — the slowest timeframe carries
// the most weight — and swings with a slight overshoot when the reading changes.
// This is the only physical motion in the interface, and the only place the
// accent appears at full strength. It also serves as the always-visible
// multi-timeframe bias strip, so one object does both jobs.
// ════════════════════════════════════════════════════════════════════════════

import { useId } from "react";
import type { Bias } from "../types";
import { cn } from "../lib/utils";

const CX = 100;
const CY = 90;
const SPAN = 88; // degrees either side of vertical

const TRACK_RADII = [72, 58, 44]; // outer → inner
const TRACK_WIDTH = 8;

/** Sector arcs, in degrees from vertical. Gaps keep the three readable. */
const SECTORS: Record<Bias, [number, number]> = {
  SHORT: [-SPAN, -34],
  NEUTRAL: [-27, 27],
  LONG: [34, SPAN],
};

const SECTOR_TONE: Record<Bias, string> = {
  SHORT: "#FF4D5E",
  NEUTRAL: "#6B7280",
  LONG: "#00E08A",
};

const BIAS_SCORE: Record<Bias, number> = { LONG: 1, SHORT: -1, NEUTRAL: 0 };

/**
 * Slowest first — the order the tracks are assigned and weights are derived.
 * Uppercase because lib/api.ts normalises the backend's timeframe keys, which
 * arrive in mixed case (1h, 4H, 1D) depending on the writer.
 */
const TF_ORDER = ["1MO", "1W", "1D", "4H", "1H", "30M", "15M", "5M", "1M"];

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function arcPath(r: number, from: number, to: number): string {
  const a = polar(r, from);
  const b = polar(r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Sort the bias record slowest-timeframe-first; unknown keys sort last. */
function ordered(bias: Record<string, Bias> | undefined): Array<[string, Bias]> {
  if (typeof bias !== "object" || bias === null) return [];
  const rank = (tf: string) => {
    const i = TF_ORDER.indexOf(tf.toUpperCase());
    return i === -1 ? TF_ORDER.length : i;
  };
  return Object.entries(bias)
    // A key whose value is not one of the three known biases would index the
    // sector and tone tables with undefined and blank the instrument.
    .filter((entry): entry is [string, Bias] => entry[1] in SECTORS)
    .sort((a, b) => rank(a[0]) - rank(b[0]));
}

/**
 * Weighted aggregate in [-1, 1]. Weight falls off linearly from the slowest
 * timeframe, so a 1D flip moves the needle more than a 1H flip.
 */
function aggregate(entries: Array<[string, Bias]>): { score: number; label: Bias | null } {
  if (entries.length === 0) return { score: 0, label: null };

  const n = entries.length;
  let weighted = 0;
  let total = 0;
  entries.forEach(([, bias], i) => {
    const w = n - i;
    weighted += BIAS_SCORE[bias] * w;
    total += w;
  });

  const score = total === 0 ? 0 : weighted / total;
  const label: Bias = score > 0.2 ? "LONG" : score < -0.2 ? "SHORT" : "NEUTRAL";
  return { score, label };
}

export function BiasCompass({
  bias,
  stale = false,
  className,
}: {
  bias?: Record<string, Bias>;
  /** Dims the instrument when the reading is not current. */
  stale?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const entries = ordered(bias);
  const tracks = entries.slice(0, TRACK_RADII.length);
  const { score, label } = aggregate(entries);

  const needleAngle = score * SPAN;
  const hasData = entries.length > 0;

  // 15 ticks across the span; the one nearest the needle brightens.
  const ticks = Array.from({ length: 15 }, (_, i) => -SPAN + (i * (SPAN * 2)) / 14);
  const nearestTick = ticks.reduce(
    (best, t) => (Math.abs(t - needleAngle) < Math.abs(best - needleAngle) ? t : best),
    ticks[0]
  );

  return (
    <div
      className={cn("flex items-center gap-4", stale && "opacity-45", className)}
      role="img"
      aria-label={
        hasData
          ? `Aggregate bias ${label}. ${tracks.map(([tf, b]) => `${tf} ${b}`).join(", ")}.`
          : "Bias unavailable"
      }
    >
      <div className="relative">
        <svg
          viewBox="0 0 200 100"
          width={168}
          height={84}
          className="overflow-visible"
          aria-hidden
        >
          <defs>
            {/* Functional gauge fill: intensity rises toward the pole the
                sector represents, so direction reads before the label does. */}
            <linearGradient id={`${uid}-short`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#FF4D5E" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#FF4D5E" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id={`${uid}-long`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#00E08A" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00E08A" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id={`${uid}-neutral`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#6B7280" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#6B7280" stopOpacity="0.5" />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Tick ring */}
          {ticks.map((t) => {
            const inner = polar(78, t);
            const outer = polar(t === nearestTick && hasData ? 87 : 83, t);
            return (
              <line
                key={t}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={t === nearestTick && hasData ? "#00D9FF" : "#252A36"}
                strokeWidth={t === nearestTick && hasData ? 1.5 : 1}
              />
            );
          })}

          {/* Tracks: unlit bed, then the lit sector for this timeframe's bias */}
          {TRACK_RADII.map((r, i) => {
            const entry = tracks[i];
            return (
              <g key={r}>
                <path
                  d={arcPath(r, -SPAN, SPAN)}
                  fill="none"
                  stroke="#141821"
                  strokeWidth={TRACK_WIDTH}
                  strokeLinecap="butt"
                />
                {entry ? (
                  <path
                    d={arcPath(r, ...SECTORS[entry[1]])}
                    fill="none"
                    stroke={`url(#${uid}-${entry[1].toLowerCase()})`}
                    strokeWidth={TRACK_WIDTH}
                    strokeLinecap="butt"
                    style={{ transition: "stroke 320ms linear" }}
                  />
                ) : null}
              </g>
            );
          })}

          {/* Needle — the one physical motion */}
          <g
            style={{
              transform: `rotate(${hasData ? needleAngle : 0}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 760ms cubic-bezier(0.34, 1.42, 0.64, 1)",
            }}
          >
            <line
              x1={CX}
              y1={CY + 5}
              x2={CX}
              y2={CY - 80}
              stroke={hasData ? "#00D9FF" : "#252A36"}
              strokeWidth="1.5"
              filter={hasData ? `url(#${uid}-glow)` : undefined}
            />
            <circle
              cx={CX}
              cy={CY - 80}
              r="2"
              fill={hasData ? "#00D9FF" : "#252A36"}
              filter={hasData ? `url(#${uid}-glow)` : undefined}
            />
          </g>

          {/* Pivot */}
          <circle cx={CX} cy={CY} r="3.5" fill="#08090C" stroke="#252A36" strokeWidth="1" />
          <circle cx={CX} cy={CY} r="1.5" fill={hasData ? "#00D9FF" : "#3A4250"} />

          {/* Pole labels */}
          <text
            x="14"
            y="98"
            fill="#3A4250"
            fontSize="9"
            fontFamily="Archivo Narrow, sans-serif"
            letterSpacing="1.4"
          >
            SHORT
          </text>
          <text
            x="186"
            y="98"
            textAnchor="end"
            fill="#3A4250"
            fontSize="9"
            fontFamily="Archivo Narrow, sans-serif"
            letterSpacing="1.4"
          >
            LONG
          </text>
        </svg>

        {/* Aggregate reading, seated inside the inner arc */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[26px] flex flex-col items-center gap-0.5">
          <span
            className={cn(
              "data text-[13px] font-semibold leading-none",
              label === "LONG" && "text-long",
              label === "SHORT" && "text-short",
              label === "NEUTRAL" && "text-flat",
              !label && "text-etch-dim"
            )}
          >
            {label ?? "— — —"}
          </span>
          <span className="data text-[9px] leading-none text-etch-dim">
            {hasData ? `${score >= 0 ? "+" : ""}${score.toFixed(2)}` : ""}
          </span>
        </div>
      </div>

      {/* Per-track legend: which timeframe is on which ring */}
      <div className="flex flex-col gap-1.5 pt-1">
        {tracks.length > 0 ? (
          tracks.map(([tf, b], i) => (
            <div key={tf} className="flex items-center gap-2">
              <span
                aria-hidden
                className="data w-3 text-[9px] leading-none text-etch-dim"
                title={`Ring ${i + 1} of ${tracks.length}`}
              >
                {["◎", "◉", "●"][i] ?? "•"}
              </span>
              <span className="data w-7 text-[10px] leading-none text-etch">{tf}</span>
              <span
                className={cn(
                  "data text-[10px] font-medium leading-none",
                  b === "LONG" && "text-long",
                  b === "SHORT" && "text-short",
                  b === "NEUTRAL" && "text-flat"
                )}
              >
                {b}
              </span>
            </div>
          ))
        ) : (
          <span className="data text-[10px] leading-none text-etch-dim">no bias data</span>
        )}
      </div>
    </div>
  );
}
