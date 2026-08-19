import { useState } from "react";
import { LiveView } from "./components/LiveView";
import { AnalysisView } from "./components/AnalysisView";
import { cn } from "./lib/utils";

type Mode = "live" | "analysis";

function App() {
  const [mode, setMode] = useState<Mode>("live");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-lg font-bold tracking-tight">TRADING BOT</h1>
              
              {/* Mode Switcher */}
              <div className="flex gap-1 bg-secondary rounded-md p-1">
                <button
                  onClick={() => setMode("live")}
                  className={cn(
                    "px-4 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-2",
                    mode === "live"
                      ? "bg-live text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  LIVE
                </button>
                <button
                  onClick={() => setMode("analysis")}
                  className={cn(
                    "px-4 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-2",
                    mode === "analysis"
                      ? "bg-analysis text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  ANALYSIS
                </button>
              </div>
            </div>

            {/* Mode Indicator */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "px-3 py-1 rounded text-xs font-bold tracking-wider border",
                  mode === "live"
                    ? "bg-live/10 border-live text-live"
                    : "bg-analysis/10 border-analysis text-analysis"
                )}
              >
                {mode === "live" ? "LIVE MODE" : "HISTORICAL MODE"}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                API: localhost:8000
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto">
        {mode === "live" ? <LiveView /> : <AnalysisView />}
      </main>
    </div>
  );
}

export default App;
