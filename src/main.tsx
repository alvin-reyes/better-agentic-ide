import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import "./components/ui/ui.css";
import { hydrateFromDisk, startAutoSave } from "./lib/persistence";
import { syncBeforeLaunch, startPeriodicSync } from "./lib/sync";
import { installLinkGuard } from "./lib/docLinks";
import { hideSplash } from "./lib/splash";
import { invoke } from "@tauri-apps/api/core";
import ErrorBoundary from "./components/ErrorBoundary";

// Uncaught errors go to the crash log (~/Library/Logs/ADE/ade.log on macOS).
const logError = (message: string) => { void invoke("log_error", { message }).catch(() => {}); };
window.addEventListener("error", (e) => logError(`error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (e) => logError(`unhandled rejection: ${e.reason?.stack ?? String(e.reason)}`));
logError(`start: ADE v${__APP_VERSION__} ${navigator.userAgent}`);

// App (and the stores it imports) is loaded only after hydrateFromDisk():
// several stores read localStorage when their module is first evaluated, so a
// static import would read the pre-restore values.
const App = lazy(() => import("./App"));
const DetachedApp = lazy(() => import("./DetachedApp"));

/** The tab a detached window shows, or null for the main window. */
function detachedTab(): unknown | null {
  const param = new URLSearchParams(window.location.search).get("detached");
  if (!param) return null;
  try {
    return JSON.parse(decodeURIComponent(param));
  } catch {
    return null; // Unparseable: treat it as the main window.
  }
}

function Root() {
  const tab = detachedTab();
  if (tab) {
    return (
      <Suspense fallback={null}>
        <DetachedApp tab={tab as never} />
      </Suspense>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ErrorBoundary>
  );
}

async function boot() {
  // Links in rendered documents must never navigate the app window itself.
  installLinkGuard();
  const detached = detachedTab() !== null;
  // Only the main window restores and syncs the saved state. Restore it from
  // disk before the stores read localStorage, then mirror every later change
  // back to disk.
  if (detached) {
    // A detached tab opens instantly; the splash is for launching the app.
    hideSplash(true);
    // localStorage is shared, but each window has its own Storage prototype:
    // mirror this window's writes (notes, prompt history) too.
    startAutoSave({ snapshots: false });
  } else {
    // Pull other machines' changes first (bounded wait), so they are part of
    // what gets restored.
    await syncBeforeLaunch();
    await hydrateFromDisk();
    startAutoSave();
    startPeriodicSync();
  }
  // Paint the persisted theme onto :root before React's first render, so the
  // static :root fallback never flashes for a frame on a cold start. Imported
  // here rather than at module scope: settingsStore reads localStorage when it
  // is first evaluated, so it must not load until hydrateFromDisk() above has
  // restored the saved state.
  const { useSettingsStore, applyThemeToDOM } = await import(
    "./stores/settingsStore"
  );
  applyThemeToDOM(useSettingsStore.getState().getActiveTheme());
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

void boot();
