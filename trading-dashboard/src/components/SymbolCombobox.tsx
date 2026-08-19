// Searchable symbol selector. Replaces the native <select> so the list stays
// usable as it grows: type to filter, arrow keys to move, Enter to commit.
//
// Opened from the trigger, or from anywhere via the `/` shortcut — App bumps
// `focusSignal`, which opens the popover and focuses the search field.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Led } from "./ui/Panel";

interface SymbolComboboxProps {
  symbols: string[];
  value: string;
  onChange: (symbol: string) => void;
  /** Increment to open + focus the search field from a keyboard shortcut. */
  focusSignal?: number;
  /** Symbols are still loading — the trigger stays usable, the list explains. */
  loading?: boolean;
  /** /symbols failed; the trigger shows the persisted value and says so. */
  error?: string | null;
  /**
   * Shown in the footer when the list is a restricted subset rather than every
   * symbol the backend knows — e.g. analysis mode, which only offers pairs with
   * CSV history to backtest against.
   */
  scopeNote?: string;
}

/** Substring match, with prefix matches ranked first. */
function filterSymbols(symbols: string[], query: string): string[] {
  const q = query.trim().toUpperCase();
  if (!q) return symbols;

  const prefix: string[] = [];
  const contains: string[] = [];
  for (const s of symbols) {
    const u = s.toUpperCase();
    if (u.startsWith(q)) prefix.push(s);
    else if (u.includes(q)) contains.push(s);
  }
  return [...prefix, ...contains];
}

export function SymbolCombobox({
  symbols,
  value,
  onChange,
  focusSignal = 0,
  loading = false,
  error = null,
  scopeNote,
}: SymbolComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const matches = useMemo(() => filterSymbols(symbols, query), [symbols, query]);

  // `/` shortcut: open and focus. Skips the initial render.
  const firstSignal = useRef(focusSignal);
  useEffect(() => {
    if (focusSignal === firstSignal.current) return;
    setOpen(true);
    setQuery("");
  }, [focusSignal]);

  // Focus the field once the popover is actually mounted.
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the active row in range as the filter narrows.
  useEffect(() => {
    setActiveIndex((i) => (matches.length === 0 ? 0 : Math.min(i, matches.length - 1)));
  }, [matches.length]);

  // On open, start on the current selection rather than the top of the list.
  useEffect(() => {
    if (!open) return;
    const i = matches.indexOf(value);
    setActiveIndex(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Dismiss on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const commit = (symbol: string) => {
    onChange(symbol);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (matches.length ? (i + 1) % matches.length : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(Math.max(0, matches.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (matches[activeIndex]) commit(matches[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const listboxId = "symbol-listbox";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "group flex h-7 min-w-[168px] items-center gap-2 border px-2.5 text-left transition-colors",
          open ? "border-arc bg-well" : "border-rule bg-bay hover:border-rule-bright"
        )}
      >
        <Led tone={error ? "short" : "arc"} />
        <span className="data flex-1 text-data font-medium text-signal">{value || "—"}</span>
        <span
          aria-hidden
          className={cn(
            "data text-[9px] leading-none transition-colors",
            open ? "text-arc" : "text-etch-dim group-hover:text-etch"
          )}
        >
          {open ? "▴" : "▾"}
        </span>
        <span
          aria-hidden
          className="data border border-rule px-1 text-[9px] leading-[13px] text-etch-dim"
        >
          /
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+1px)] z-50 w-[268px] border border-arc/40 bg-void">
          <div className="flex items-center gap-2 border-b border-rule bg-bay px-2.5 py-2">
            <span aria-hidden className="data text-[10px] text-arc">
              ⌕
            </span>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={matches[activeIndex] ? `symbol-${matches[activeIndex]}` : undefined}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="filter symbols"
              spellCheck={false}
              autoComplete="off"
              className="data w-full bg-transparent text-data text-signal outline-none placeholder:text-etch-dim"
            />
            <span className="data shrink-0 text-[9px] text-etch-dim">
              {matches.length}/{symbols.length}
            </span>
          </div>

          {matches.length > 0 ? (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Symbols"
              className="max-h-[264px] overflow-y-auto py-0.5"
            >
              {matches.map((s, i) => {
                const selected = s === value;
                const active = i === activeIndex;
                return (
                  <li
                    key={s}
                    id={`symbol-${s}`}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActiveIndex(i)}
                    onClick={() => commit(s)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-2.5 py-1.5",
                      active && "bg-well"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("h-3 w-px shrink-0", active ? "bg-arc" : "bg-transparent")}
                    />
                    <span
                      className={cn(
                        "data flex-1 text-data-sm",
                        selected ? "text-arc" : active ? "text-signal" : "text-etch"
                      )}
                    >
                      {highlight(s, query)}
                    </span>
                    {selected ? (
                      <span aria-hidden className="data text-[9px] text-arc">
                        ●
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-4">
              <p className="label mb-1.5 text-etch">
                {loading
                  ? "Loading symbols"
                  : error
                    ? "Symbol list unavailable"
                    : symbols.length === 0
                      ? "Nothing to choose from"
                      : "No match"}
              </p>
              <p className="data text-[10px] leading-relaxed text-etch-dim">
                {loading
                  ? "Waiting on GET /symbols."
                  : error
                    ? `GET /symbols failed — ${error}. The last selected symbol is still active; clear the filter or restart the backend to browse the list.`
                    : symbols.length === 0
                      ? // Not a failure: the list itself is empty. In analysis mode
                        // that means no symbol has CSV history to backtest against.
                        scopeNote
                        ? `No symbol qualifies — ${scopeNote}.`
                        : "The backend returned no symbols."
                      : `Nothing in the symbol list contains “${query}”. Clear the filter to see all ${symbols.length}.`}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-rule bg-bay px-2.5 py-1.5">
            {scopeNote ? (
              <span className="data text-[9px] leading-none text-etch-dim">{scopeNote}</span>
            ) : null}
            <div className="flex items-center gap-3">
              {[
                ["↑↓", "move"],
                ["⏎", "select"],
                ["esc", "close"],
              ].map(([k, meaning]) => (
                <span key={k} className="flex items-center gap-1">
                  <kbd className="data border border-rule px-1 text-[9px] leading-[13px] text-etch">
                    {k}
                  </kbd>
                  <span className="label text-[9px] text-etch-dim">{meaning}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Marks the matched run so the reason a row survived the filter is visible. */
function highlight(symbol: string, query: string) {
  const q = query.trim().toUpperCase();
  if (!q) return symbol;
  const at = symbol.toUpperCase().indexOf(q);
  if (at === -1) return symbol;
  return (
    <>
      {symbol.slice(0, at)}
      <mark className="bg-transparent text-arc">{symbol.slice(at, at + q.length)}</mark>
      {symbol.slice(at + q.length)}
    </>
  );
}
