// Global keyboard shortcuts.
//
// Bindings are suppressed while the user is typing (input, textarea, select, or
// any contenteditable) so the symbol search box and date fields keep their keys.

import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.getAttribute("role") === "combobox"
  );
}

/**
 * Bind single-key shortcuts. Keys are matched case-insensitively against
 * `event.key`; modifier chords are intentionally not supported so nothing
 * collides with browser shortcuts.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  // Held in a ref so a new handler object each render doesn't rebind the listener.
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const handler = mapRef.current[event.key] ?? mapRef.current[event.key.toLowerCase()];
      if (!handler) return;

      event.preventDefault();
      handler(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
