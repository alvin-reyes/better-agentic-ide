import mermaid from "mermaid";

let initialized = false;

/**
 * Configure mermaid once for the whole app. Its config is global, so the
 * editor's diagram preview and rendered markdown must share it.
 *
 * securityLevel "strict" makes mermaid sanitize labels and drop click
 * handlers. That matters because markdown from any repo is rendered here, and
 * this webview can reach Tauri IPC.
 */
export function ensureMermaid(): typeof mermaid {
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        primaryColor: "#58a6ff",
        primaryTextColor: "#e6edf3",
        primaryBorderColor: "#30363d",
        lineColor: "#8b949e",
        secondaryColor: "#161b22",
        tertiaryColor: "#21262d",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
      },
      securityLevel: "strict",
    });
    initialized = true;
  }
  return mermaid;
}
