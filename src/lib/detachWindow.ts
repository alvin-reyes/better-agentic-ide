import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import type { Tab } from "../stores/tabStore";

interface SerializedTab {
  id: string;
  name: string;
  type?: "terminal" | "orchestrator" | "browser" | "editor";
  root: Tab["root"];
  activePaneId: string;
}

export async function detachTabToWindow(tabId: string) {
  const store = useTabStore.getState();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  // If this is the only tab, add a new default tab first
  if (store.tabs.length <= 1) {
    store.addTab();
  }

  // Detach the tab (removes from store, disposes xterm instances, keeps PTY alive)
  const detachedTab = store.detachTab(tabId);
  if (!detachedTab) return;

  // Serialize tab data for the new window
  const serialized: SerializedTab = {
    id: detachedTab.id,
    name: detachedTab.name,
    type: detachedTab.type,
    root: detachedTab.root,
    activePaneId: detachedTab.activePaneId,
  };

  const encoded = encodeURIComponent(JSON.stringify(serialized));
  const label = `detached-${tabId}-${Date.now()}`;

  const webview = new WebviewWindow(label, {
    url: `index.html?detached=${encoded}`,
    title: detachedTab.name,
    width: 900,
    height: 600,
    titleBarStyle: "overlay",
    decorations: true,
  });

  // When the detached window closes, kill the PTY processes
  webview.once("tauri://destroyed", () => {
    const panes = findAllPanes(detachedTab.root);
    for (const pane of panes) {
      if (pane.ptyId !== null) {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("kill_pty", { id: pane.ptyId });
        });
      }
    }
  });
}
