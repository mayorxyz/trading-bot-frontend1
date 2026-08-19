// Error boundary. A render-time throw inside a view used to unmount the entire
// app and leave a blank page; this catches it at the view boundary so the shell,
// the symbol selector and the mode switch keep working.
//
// `resetKey` clears the error when the operator changes selection — a fault
// caused by one symbol or timeframe should not persist after switching away
// from it.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Label for the failing region, e.g. "Live view". */
  region: string;
  /** Changing this value clears the captured error and retries the render. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  stack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in state so the panel can show where it broke, and logged so the
    // full trace is still available in the console.
    this.setState({ stack: info.componentStack ?? null });
    console.error(`[${this.props.region}] render failed`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, stack: null });
    }
  }

  private retry = () => this.setState({ error: null, stack: null });

  render(): ReactNode {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-[520px] border-l-2 border-short/50 pl-4">
          <span className="eyebrow text-short">{this.props.region} crashed</span>

          <h2 className="mb-2 mt-2 text-[15px] font-semibold leading-snug tracking-tight text-signal">
            This panel hit an unhandled error and stopped rendering.
          </h2>

          <p className="text-[12.5px] leading-relaxed text-etch">
            The rest of the terminal is unaffected — the header, symbol selector and mode switch
            still work, and switching symbol or timeframe clears this automatically. If it returns
            immediately, the message below is what to report.
          </p>

          <p className="data mt-3 break-all border-l border-rule pl-2 text-[10px] leading-relaxed text-short/80">
            {error.name}: {error.message}
          </p>

          {stack ? (
            <details className="mt-2">
              <summary className="label cursor-pointer text-[10px] text-etch-dim hover:text-etch">
                Component stack
              </summary>
              <pre className="data mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap border-l border-rule pl-2 text-[9px] leading-relaxed text-etch-dim">
                {stack.trim()}
              </pre>
            </details>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              onClick={this.retry}
              className="group flex h-7 items-center gap-2 border border-rule bg-bay px-2.5 transition-colors hover:border-arc/60 hover:bg-well"
            >
              <span className="label text-[10px] text-etch transition-colors group-hover:text-signal">
                Try rendering again
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
