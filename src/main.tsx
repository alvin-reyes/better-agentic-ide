import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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
