# Trading Dashboard

This is a React + TypeScript + Vite frontend for the trading bot terminal. It reads the backend URL from `VITE_API_URL`; when that variable is unset, requests go to `http://localhost:8000`.

## Modes

The dashboard has two visually and functionally separate modes. Data from one mode is never mixed into the other mode's view.

- **LIVE** polls real-time bot data every 20 seconds. It shows the current price, live tradability state, multi-timeframe bias, zones, levels, candles, live performance, and recent skip entries. It uses the `/live/*` endpoints and `/ohlc`.
- **ANALYSIS** does not call the `/live/*` endpoints. The **Run backtest** action submits an on-demand historical replay with `POST /analyze`, then polls `/analyze/status/{job_id}` until it completes, fails, or times out. Its result contains historical trades, statistics, a rejection breakdown, and a trade ledger.
- **Run analysis** is a separate action inside ANALYSIS mode. It calls `POST /predict` for one stateless signal-pipeline run against live exchange candles. It has no job queue, date range, or persistence and is not part of the backtest result. It is displayed in its own prediction panel.

The analysis view may call `/ohlc` only to request a candle backdrop for historical trade markers. `/predict` independently obtains its live candle input on the backend; it does not make LIVE mode and ANALYSIS mode share UI state.

## Symbol selection and reconciliation

`App.tsx` restores `mode`, `symbol`, and `timeframe` from `localStorage` through `usePersistentState`. It fetches the authoritative symbol catalog from `/symbols` at the same time, so a restored symbol can temporarily exist before the fetch completes.

After `/symbols` responds, `App.tsx` reconciles the restored value against the active list. A symbol that differs only by whitespace or case is replaced with the backend's exact spelling. A genuinely absent symbol falls back to the first active symbol. The reconciliation runs again when the mode changes because ANALYSIS exposes only `analysisCatalog`: the subset of catalog entries whose `timeframes` array is non-empty, indicating CSV history available for `/analyze`. The backtest button is also gated until the selected symbol is confirmed by `/symbols`.

## Backend endpoints used by the UI

| UI part | Endpoints |
| --- | --- |
| App shell, connection indicator, and symbol selector | `GET /health`, `GET /symbols` |
| LIVE state and tradability | `GET /live/state?symbol=...` |
| LIVE performance and skip-related data | `GET /live/stats?symbol=...`, `GET /live/state?symbol=...` |
| LIVE chart zones and levels | `GET /live/zones?symbol=...&timeframe=...`, `GET /live/levels?symbol=...&timeframe=...` |
| LIVE and ANALYSIS chart candles | `GET /ohlc?symbol=...&timeframe=...&limit=...` |
| Historical backtest | `POST /analyze?...`, then `GET /analyze/status/{job_id}` |
| Stateless live signal in ANALYSIS | `POST /predict` |

`lib/api.ts` also defines `getAnalysisJobs()` for `GET /analyze/jobs`, but no current rendered component calls it.

## Source files

Every TypeScript source file under `src/` is listed below.

### Application and components

- `App.tsx` — Owns persisted mode, symbol, and timeframe selection; loads health and symbols; reconciles the selected symbol; renders the shared shell and active mode view.
- `main.tsx` — Loads the global stylesheet and mounts `App` inside React `StrictMode`.
- `components/AnalysisView.tsx` — Runs the historical `/analyze` job and status polling, optionally loads an `/ohlc` backdrop, renders backtest results, and owns the separate `/predict` action.
- `components/BiasCompass.tsx` — Renders per-timeframe bias arcs and a weighted aggregate bias needle.
- `components/ErrorBoundary.tsx` — Catches render-time failures around a view and allows retry or automatic reset after selection changes.
- `components/LiveView.tsx` — Polls live state, stats, zones, levels, and candles; handles partial endpoint failures; and renders the live chart and feeds.
- `components/ModeSwitch.tsx` — Provides the LIVE/ANALYSIS mode control and keyboard handling for the two positions.
- `components/PredictionPanel.tsx` — Displays the `/predict` result as a fired signal, a no-signal verdict, or a categorized error.
- `components/PriceTicker.tsx` — Derives the latest price, percentage change, volume, and timestamp from candles already loaded for the chart.
- `components/StateNotice.tsx` — Supplies waiting, empty, and fault notices, retry actions, and the chart loading skeleton.
- `components/StatStrip.tsx` — Formats and displays win rate, average R:R, profit factor, and trade count values.
- `components/SymbolCombobox.tsx` — Provides searchable, keyboard-navigable symbol selection with loading, error, and restricted-scope states.
- `components/TimeframeRail.tsx` — Renders timeframe controls, keyboard numbers, and native/derived/unsupported data provenance.
- `components/TradingChart.tsx` — Builds the `lightweight-charts` candlestick chart and overlays zones, levels, pattern hits, and trades.
- `components/ui/Panel.tsx` — Defines shared panel structure, headings, readouts, LEDs, and dividers.

### Hooks

- `hooks/useHotkeys.ts` — Registers single-key shortcuts while ignoring typing targets and modifier-key combinations.
- `hooks/useTickDirection.ts` — Detects the direction of a numeric change and exposes a short-lived animation trigger.

### Libraries and data

- `lib/api.ts` — Fetches backend endpoints, validates and normalizes wire responses, converts timestamps, and exposes the API functions used by components.
- `lib/format.ts` — Formats prices, rates, ratios, counts, profit factors, volume, timestamps, and skip reasons.
- `lib/storage.ts` — Reads and writes validated persistent state in `localStorage` and provides the `usePersistentState` hook.
- `lib/timeframes.ts` — Defines the timeframe registry, classifies native/derived/unsupported data, resolves requests, and resamples daily candles into weekly or monthly candles.
- `lib/utils.ts` — Combines conditional class names with `clsx` and `tailwind-merge`.
- `types/index.ts` — Declares backend wire shapes and the normalized types consumed by the components.
- `vite-env.d.ts` — Provides Vite client typings and the `VITE_API_URL` environment variable typing.
- `index.css` — Defines Tailwind layers, terminal design tokens, base styles, and component utility styles.

## How to run locally

The backend must be running on port `8000`.

```bash
npm install
npm run dev
```

Vite will print the local development URL. Set `VITE_API_URL` only when the backend is hosted somewhere other than `http://localhost:8000`.
