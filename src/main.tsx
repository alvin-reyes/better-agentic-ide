import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import "@fontsource-variable/inter";
import "./index.css";
import "./components/ui/ui.css";

// Paint the persisted theme onto :root before React's first render. The store
// hydrates synchronously at module scope, so its state is ready here. Without
// this, the static :root fallback shows for a frame before the mount-time
// effect in App/DetachedApp runs — a visible flash on every cold start.
applyThemeToDOM(useSettingsStore.getState().getActiveTheme());

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

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
