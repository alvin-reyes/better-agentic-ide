import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTabStore, allTabPanes, ownView, ownViewOnly } from "../stores/tabStore";
import type { Tab, View } from "../stores/tabStore";

/** What a detached window is given: the tab's own view, as before views. */
export type SerializedTab = Pick<Tab, "id" | "name" | "type"> & Pick<View, "root" | "activePaneId">;

/** The tab a detached window holds, from what detachTabToWindow sent. */
export function tabFromDetached(serialized: SerializedTab): Tab {
  return {
    id: serialized.id,
    name: serialized.name,
    type: serialized.type,
    ...ownViewOnly(serialized.root, serialized.activePaneId),
  };
}

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
    root: ownView(detachedTab).root,
    activePaneId: ownView(detachedTab).activePaneId,
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
    for (const pane of allTabPanes(detachedTab)) {
      if (pane.ptyId !== null) invoke("kill_pty", { id: pane.ptyId });
    }
  });
}
