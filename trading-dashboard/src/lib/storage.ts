// localStorage-backed state. Selection survives reload; a corrupt or
// rejected value falls back to the default rather than throwing.

import { useCallback, useEffect, useState } from "react";

const PREFIX = "terminal:";

export function readStored<T>(key: string, fallback: T, validate?: (v: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeStored<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private-mode or quota-exceeded: persistence is a convenience, not a
    // requirement. The session still works, it just won't survive reload.
  }
}

/**
 * useState whose value is mirrored into localStorage.
 *
 * `validate` guards against stale persisted values that no longer exist — a
 * symbol the backend dropped, a timeframe removed from the registry.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  validate?: (v: unknown) => boolean
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, validate));

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  const set = useCallback((next: T) => setValue(next), []);

  return [value, set];
}
