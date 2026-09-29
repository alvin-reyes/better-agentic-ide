import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import type { Tab } from "../stores/tabStore";

type SerializedTab = Pick<Tab, "id" | "name" | "type" | "root" | "activePaneId">;

export async function detachTabToWindow(tabId: string) {
  const store = useTabStore.getState();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  // The main window must keep a tab.
  if (store.tabs.length <= 1) {
    store.addTab();
  }

  // Disposes the xterm instances but keeps the PTYs alive for the new window.
  const detachedTab = store.detachTab(tabId);
  if (!detachedTab) return;

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

  webview.once("tauri://destroyed", () => {
    for (const pane of findAllPanes(detachedTab.root)) {
      if (pane.ptyId !== null) invoke("kill_pty", { id: pane.ptyId });
    }
  });
}
