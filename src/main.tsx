import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { hydrateFromDisk, startAutoSave } from "./lib/persistence";
import { syncBeforeLaunch, startPeriodicSync } from "./lib/sync";

// App (and the stores it imports) is loaded only after hydrateFromDisk():
// several stores read localStorage when their module is first evaluated, so a
// static import would read the pre-restore values.
const App = lazy(() => import("./App"));
const DetachedApp = lazy(() => import("./DetachedApp"));

function Root() {
  const params = new URLSearchParams(window.location.search);
  const detachedParam = params.get("detached");

  if (detachedParam) {
    try {
      const tab = JSON.parse(decodeURIComponent(detachedParam));
      return (
        <Suspense fallback={null}>
          <DetachedApp tab={tab} />
        </Suspense>
      );
    } catch {
      // Fall through to normal app if parsing fails
    }
  }

  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}

async function boot() {
  const detached = new URLSearchParams(window.location.search).has("detached");
  // Only the main window owns the saved state. Restore it from disk before the
  // stores read localStorage, then mirror every later change back to disk.
  if (!detached) {
    // Pull other machines' changes first (bounded wait), so they are part of
    // what gets restored.
    await syncBeforeLaunch();
    await hydrateFromDisk();
    startAutoSave();
    startPeriodicSync();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

void boot();
