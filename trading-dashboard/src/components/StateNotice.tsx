// ════════════════════════════════════════════════════════════════════════════
// STATE NOTICES
//
// Every non-happy path says three things: what happened, why, and what the
// operator can do next. No bare spinners, no "Error: [object Object]".
// Technical detail (endpoint, status, error text) is shown rather than hidden —
// this is a trading terminal, the person reading it can act on a 502.
// ════════════════════════════════════════════════════════════════════════════

import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type Severity = "waiting" | "empty" | "fault";

const SEVERITY_EYEBROW: Record<Severity, string> = {
  waiting: "text-etch",
  empty: "text-etch",
  fault: "text-short",
};

const SEVERITY_MARK: Record<Severity, string> = {
  waiting: "border-arc/40",
  empty: "border-rule-bright",
  fault: "border-short/50",
};

export function StateNotice({
  severity,
  eyebrow,
  headline,
  children,
  detail,
  actions,
  className,
}: {
  severity: Severity;
  /** Category, e.g. "NO DATA" / "BACKEND UNREACHABLE". */
  eyebrow: string;
  /** One line: what happened. */
  headline: string;
  /** Why, and what to do about it. */
  children?: ReactNode;
  /** Endpoint, status code, raw error — the part worth copying into a bug. */
  detail?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full items-center justify-center p-8", className)}>
      <div className={cn("max-w-[460px] border-l-2 pl-4", SEVERITY_MARK[severity])}>
        <div className="mb-2 flex items-center gap-2">
          {severity === "waiting" ? (
            <span
              aria-hidden
              className="relative block h-[2px] w-8 overflow-hidden bg-rule"
            >
              <span className="absolute inset-y-0 w-1/4 animate-sweep bg-arc" />
            </span>
          ) : null}
          <span className={cn("eyebrow", SEVERITY_EYEBROW[severity])}>{eyebrow}</span>
        </div>

        <h2 className="mb-2 text-[15px] font-semibold leading-snug tracking-tight text-signal">
          {headline}
        </h2>

        {children ? (
          <div className="text-[12.5px] leading-relaxed text-etch [&_b]:font-semibold [&_b]:text-signal">
            {children}
          </div>
        ) : null}

        {detail ? (
          <p className="data mt-3 break-all border-l border-rule pl-2 text-[10px] leading-relaxed text-etch-dim">
            {detail}
          </p>
        ) : null}

        {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Flat outlined action. The accent shows on hover/focus only. */
export function NoticeAction({
  onClick,
  children,
  hotkey,
}: {
  onClick: () => void;
  children: ReactNode;
  hotkey?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-7 items-center gap-2 border border-rule bg-bay px-2.5 transition-colors hover:border-arc/60 hover:bg-well"
    >
      <span className="label text-[10px] text-etch transition-colors group-hover:text-signal">
        {children}
      </span>
      {hotkey ? (
        <kbd className="data border border-rule px-1 text-[9px] leading-[13px] text-etch-dim">
          {hotkey}
        </kbd>
      ) : null}
    </button>
  );
}

/**
 * First-paint placeholder. Hairlines and a sweeping scan line — it reads as an
 * instrument warming up rather than a generic shimmer.
 */
export function ChartSkeleton({ label }: { label: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <div className="absolute inset-0 flex flex-col justify-between py-6">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="h-px w-full bg-rule/60" />
        ))}
      </div>
      <div className="absolute inset-0 flex justify-between px-6">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="h-full w-px bg-rule/40" />
        ))}
      </div>
      <span className="absolute inset-y-0 w-24 animate-sweep bg-gradient-to-r from-transparent via-arc/[0.07] to-transparent" />
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <span aria-hidden className="relative block h-[2px] w-8 overflow-hidden bg-rule">
          <span className="absolute inset-y-0 w-1/4 animate-sweep bg-arc" />
        </span>
        <span className="data text-[10px] text-etch">{label}</span>
      </div>
    </div>
  );
}
