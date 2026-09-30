import { Component, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

interface State {
  error: Error | null;
  logPath: string | null;
}

/** Instead of a blank window: what failed, where it's logged, and a way back. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, logPath: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void invoke("log_error", { message: `render: ${error.stack ?? error.message}\n${info.componentStack ?? ""}` }).catch(() => {});
    invoke<string | null>("crash_log_path").then((logPath) => this.setState({ logPath })).catch(() => {});
  }

  render() {
    const { error, logPath } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <h1>ADE hit an error</h1>
        <p>Your terminals' shells are still running. Reload to reconnect to the app.</p>
        <pre>{error.stack ?? error.message}</pre>
        {logPath && <p>Logged to <code>{logPath}</code>. Please send that file with your report.</p>}
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
