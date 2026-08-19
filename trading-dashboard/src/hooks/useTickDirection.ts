// Detects the direction of the most recent change to a numeric value, and holds
// that direction just long enough to drive a one-shot flash animation.
//
// `nonce` increments on every change so a value that ticks to the same
// direction twice still retriggers the animation (React reuses the DOM node, so
// the CSS animation needs a key change to restart).

import { useEffect, useRef, useState } from "react";

export type TickDirection = "up" | "down" | "none";

interface TickState {
  direction: TickDirection;
  nonce: number;
}

export function useTickDirection(value: number | null | undefined, holdMs = 520): TickState {
  const previous = useRef<number | null>(null);
  const [state, setState] = useState<TickState>({ direction: "none", nonce: 0 });

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;

    const prior = previous.current;
    previous.current = value;

    if (prior === null || prior === value) return;

    setState((s) => ({ direction: value > prior ? "up" : "down", nonce: s.nonce + 1 }));
    const timer = window.setTimeout(
      () => setState((s) => ({ direction: "none", nonce: s.nonce })),
      holdMs
    );
    return () => window.clearTimeout(timer);
  }, [value, holdMs]);

  return state;
}
