// ════════════════════════════════════════════════════════════════════════════
// APP SHELL
//
// Owns the three pieces of selection state — mode, symbol, timeframe — all
// persisted to localStorage so a reload resumes where the operator left off.
// Data fetching stays inside the views: LiveView polls the live endpoints,
// AnalysisView drives jobs, and neither can see the other's data.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { LiveView } from "./components/LiveView";
import { AnalysisView } from "./components/AnalysisView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ModeSwitch, type Mode } from "./components/ModeSwitch";
import { SymbolCombobox } from "./components/SymbolCombobox";
import { TimeframeRail } from "./components/TimeframeRail";
import { API_BASE_URL, getHealth, getSymbols } from "./lib/api";
import { DEFAULT_TIMEFRAME, isTimeframeId, TIMEFRAMES } from "./lib/timeframes";
import { usePersistentState } from "./lib/storage";
import { useHotkeys } from "./hooks/useHotkeys";
import type { SymbolInfo } from "./types";
import { cn } from "./lib/utils";

const HEALTH_INTERVAL = 30000;

type Health = "unknown" | "up" | "down";

const SHORTCUTS: Array<[string, string]> = [
  ["1 – 9", "Select timeframe"],
  ["L", "Live mode"],
  ["A", "Analysis mode"],
  ["/", "Search symbols"],
  ["R", "Refresh now"],
  ["?", "Toggle this list"],
];

function App() {
  const [mode, setMode] = usePersistentState<Mode>(
    "mode",
    "live",
    (v) => v === "live" || v === "analysis"
  );
  const [symbol, setSymbol] = usePersistentState<string>(
    "symbol",
    "BTCUSDT",
    (v) => typeof v === "string" && v.length > 0
  );
  const [timeframe, setTimeframe] = usePersistentState<string>(
    "timeframe",
    DEFAULT_TIMEFRAME,
    isTimeframeId
  );

  const [catalog, setCatalog] = useState<SymbolInfo[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health>("unknown");

  const [searchSignal, setSearchSignal] = useState(0);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);

  /**
   * Symbols that can actually be backtested.
   *
   * The backend has no `analysis_available` flag; a symbol appears in /symbols
   * only because a CSV was found for it, and `timeframes` lists which ones. A
   * non-empty `timeframes` is therefore exactly "has local CSV history", which
   * is what /analyze needs to replay against.
   */
  const analysisCatalog = useMemo(
    () => catalog.filter((entry) => entry.timeframes.length > 0),
    [catalog]
  );

  // Analysis mode only offers backtest-capable symbols; live mode offers all.
  const activeCatalog = mode === "analysis" ? analysisCatalog : catalog;
  const symbols = useMemo(() => activeCatalog.map((entry) => entry.symbol), [activeCatalog]);

  // Timeframes the backend actually has for the selected symbol. Drives the
  // rail's provenance glyphs and every /ohlc request.
  const available = useMemo(
    () => catalog.find((entry) => entry.symbol === symbol)?.timeframes ?? [],
    [catalog, symbol]
  );

  /**
   * True only once /symbols has answered and the selected symbol is spelled
   * exactly as it appears there. Until this holds, nothing may be POSTed to
   * /analyze — a persisted value like "BTCUSD" is a well-formed string that no
   * amount of local validation can tell apart from a real symbol.
   */
  const symbolConfirmed = catalogLoaded && symbols.includes(symbol);

  // ── Symbol list ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    getSymbols()
      .then((list) => {
        if (cancelled) return;
        setCatalog(list);
        setCatalogLoaded(true);
        setSymbolsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSymbolsError(err instanceof Error ? err.message : "request failed");
      })
      .finally(() => {
        if (!cancelled) setSymbolsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Reconcile the persisted symbol against the authoritative list.
   *
   * A case or whitespace difference is corrected to the backend's exact
   * spelling; anything genuinely absent — a renamed pair, a hand-edited
   * localStorage value, a symbol with no CSV history when switching to analysis
   * mode — falls back to the first available entry. Re-runs on mode change
   * because the analysis list is narrower than the live one.
   */
  useEffect(() => {
    if (symbols.length === 0) return;
    if (symbols.includes(symbol)) return;

    const loose = symbol.trim().toUpperCase();
    const match = symbols.find((s) => s.toUpperCase() === loose);
    setSymbol(match ?? symbols[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, mode]);

  // ── Connection indicator ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const check = () => {
      getHealth()
        .then(() => {
          if (!cancelled) setHealth("up");
        })
        .catch(() => {
          if (!cancelled) setHealth("down");
        });
    };

    check();
    const id = setInterval(check, HEALTH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  const hotkeys = useMemo(() => {
    const map: Record<string, () => void> = {
      l: () => setMode("live"),
      a: () => setMode("analysis"),
      r: () => setRefreshSignal((n) => n + 1),
      "/": () => setSearchSignal((n) => n + 1),
      "?": () => setShowShortcuts((s) => !s),
      Escape: () => setShowShortcuts(false),
    };
    for (const tf of TIMEFRAMES) map[tf.hotkey] = () => setTimeframe(tf.id);
    return map;
  }, [setMode, setTimeframe]);

  useHotkeys(hotkeys);

  const host = API_BASE_URL.replace(/^https?:\/\//, "");

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-void">
      {/* ── Band 1: identity, symbol, mode, connection ─────────────────── */}
      <header className="flex h-12 shrink-0 items-center gap-4 px-4 hair-b">
        <div className="flex items-baseline gap-2">
          <span aria-hidden className="mr-1 text-arc">
            ▚
          </span>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.2em] text-signal">Terminal</h1>
          <span className="data text-[9px] text-etch-dim">bot·v0</span>
        </div>

        <span aria-hidden className="h-5 w-px bg-rule" />

        <SymbolCombobox
          symbols={symbols}
          value={symbol}
          onChange={setSymbol}
          focusSignal={searchSignal}
          loading={symbolsLoading}
          error={symbolsError}
          scopeNote={
            mode === "analysis"
              ? `${analysisCatalog.length} of ${catalog.length} have CSV history to backtest`
              : undefined
          }
        />

        <div className="ml-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowShortcuts((s) => !s)}
            className={cn(
              "label flex h-6 items-center gap-1.5 border px-2 text-[10px] transition-colors",
              showShortcuts
                ? "border-arc/50 bg-well text-signal"
                : "border-rule text-etch-dim hover:border-rule-bright hover:text-etch"
            )}
          >
            Keys
            <kbd className="data border border-rule px-1 text-[9px] leading-[13px]">?</kbd>
          </button>

          <ModeSwitch mode={mode} onChange={setMode} />

          <span aria-hidden className="h-5 w-px bg-rule" />

          <div className="flex items-center gap-2" title={`API base: ${API_BASE_URL}`}>
            <span
              aria-hidden
              className={cn(
                "h-1 w-1 rounded-full",
                health === "up" ? "bg-arc" : health === "down" ? "bg-short" : "bg-etch-dim"
              )}
            />
            <span className="data text-[10px] text-etch-dim">{host}</span>
          </div>
        </div>
      </header>

      {/* ── Rail + active view ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <TimeframeRail value={timeframe} onChange={setTimeframe} available={available} />

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* resetKey clears a captured error as soon as the selection moves, so
              a fault on one symbol/timeframe does not stick to the next one. */}
          <ErrorBoundary
            region={mode === "live" ? "Live view" : "Analysis view"}
            resetKey={`${mode}:${symbol}:${timeframe}`}
          >
            {mode === "live" ? (
              <LiveView
                symbol={symbol}
                timeframe={timeframe}
                available={available}
                onTimeframeChange={setTimeframe}
                apiBase={API_BASE_URL}
                refreshSignal={refreshSignal}
              />
            ) : (
              <AnalysisView
                symbol={symbol}
                timeframe={timeframe}
                available={available}
                apiBase={API_BASE_URL}
                symbolConfirmed={symbolConfirmed}
                catalogLoaded={catalogLoaded}
                symbolsError={symbolsError}
                backtestableCount={analysisCatalog.length}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {showShortcuts ? (
        <div className="absolute bottom-4 right-4 z-40 w-[228px] border border-rule-bright bg-void">
          <div className="relative flex h-7 items-center justify-between px-3 pt-2 bracket hair-b">
            <span className="eyebrow">Shortcuts</span>
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              aria-label="Close shortcuts"
              className="data text-[10px] text-etch-dim hover:text-signal"
            >
              ✕
            </button>
          </div>
          <ul className="px-3 py-2">
            {SHORTCUTS.map(([keys, meaning]) => (
              <li key={keys} className="flex items-center justify-between py-1">
                <span className="label text-[10px] text-etch">{meaning}</span>
                <kbd className="data border border-rule px-1.5 text-[9px] leading-[15px] text-signal">
                  {keys}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default App;
