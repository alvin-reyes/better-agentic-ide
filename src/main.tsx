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
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}

async function boot() {
  const detached = detachedTab() !== null;
  // Only the main window restores and syncs the saved state. Restore it from
  // disk before the stores read localStorage, then mirror every later change
  // back to disk.
  if (detached) {
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
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

void boot();
