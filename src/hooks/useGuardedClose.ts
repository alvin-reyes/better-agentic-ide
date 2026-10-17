import { useCallback, useEffect, useState } from "react";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import { editorDirty, unsavedEditorTabs } from "../lib/editorDirty";
import { paneBusy } from "./useTerminal";

export interface CloseConfirm {
  title: string;
  message: string;
  onConfirm: () => void;
}

/** What runs in each of these panes, busy ones only. */
async function busyIn(paneIds: string[]): Promise<string[]> {
  const names = await Promise.all(paneIds.map((id) => paneBusy(id)));
  return names.filter((name): name is string => name !== null);
}

/**
 * Guarded close: confirm before discarding unsaved edits or killing a live
 * process. Every close path comes through here: the tab bar and the command
 * palette by `request-close-tab`, `request-close-pane` and `request-close-tabs`
 * events, and the shortcuts by the returned functions. A pane is live when
 * paneBusy says so, whatever the provider.
 */
export function useGuardedClose() {
  const [confirmDialog, setConfirmDialog] = useState<CloseConfirm | null>(null);
  const closeTab = useTabStore((s) => s.closeTab);
  const closePane = useTabStore((s) => s.closePane);

  const requestCloseTab = useCallback(async (tabId: string) => {
    // Read now, not from a render: the tab may be newer than the last one.
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.type === "editor") {
      editorDirty(tabId).then((isDirty) => {
        if (isDirty && !confirm("This file has unsaved changes. Close anyway?")) return;
        closeTab(tabId);
      });
      return;
    }

    const activeProcesses = await busyIn(findAllPanes(tab.root).map((p) => p.id));
    if (activeProcesses.length > 0) {
      setConfirmDialog({
        title: "Active process running",
        message: `This tab has a live ${activeProcesses[0]} session. Closing it will terminate the process. Are you sure?`,
        onConfirm: () => {
          closeTab(tabId);
          setConfirmDialog(null);
        },
      });
    } else {
      closeTab(tabId);
    }
  }, [closeTab]);

  const requestClosePane = useCallback(async (tabId: string, paneId: string) => {
    const processName = await paneBusy(paneId);
    if (processName) {
      setConfirmDialog({
        title: "Active process running",
        message: `This pane has a live ${processName} session. Closing it will terminate the process. Are you sure?`,
        onConfirm: () => {
          closePane(tabId, paneId);
          setConfirmDialog(null);
        },
      });
    } else {
      closePane(tabId, paneId);
    }
  }, [closePane]);

  useEffect(() => {
    // The tab bar's X and context menu, and the command palette's Close Tab.
    const onCloseTab = (e: Event) => {
      const { tabId } = (e as CustomEvent).detail;
      void requestCloseTab(tabId);
    };
    // The command palette's Close Pane.
    const onClosePane = (e: Event) => {
      const { tabId, paneId } = (e as CustomEvent).detail;
      void requestClosePane(tabId, paneId);
    };
    // Close others / to the right: one confirmation for all of them.
    const closeMany = (e: Event) => {
      const ids: string[] = (e as CustomEvent).detail?.tabIds ?? [];
      const targets = useTabStore.getState().tabs.filter((t) => ids.includes(t.id));
      const close = () => { for (const t of targets) closeTab(t.id); setConfirmDialog(null); };
      // paneBusy is null for every editor pane. Without asking them too,
      // "Close others" discarded unsaved files with no prompt, while closing
      // the same tab on its own warned.
      void Promise.all([
        Promise.all(targets.map((t) => busyIn(findAllPanes(t.root).map((p) => p.id)))),
        unsavedEditorTabs(targets),
      ]).then(([busy, unsaved]) => {
        const live = targets.filter((_, i) => busy[i].length > 0);
        if (live.length === 0 && unsaved.length === 0) return close();
        const parts = [
          live.length > 0 && `${live.length} ${live.length === 1 ? "has" : "have"} a live session that will be terminated`,
          unsaved.length > 0 && `${unsaved.length} ${unsaved.length === 1 ? "has" : "have"} unsaved changes that will be lost`,
        ].filter(Boolean) as string[];
        setConfirmDialog({
          title: unsaved.length > 0 ? "Unsaved changes" : "Active process running",
          message: `Of these ${targets.length} tabs, ${parts.join(", and ")}. Close ${targets.length} tabs?`,
          onConfirm: close,
        });
      });
    };
    window.addEventListener("request-close-tab", onCloseTab);
    window.addEventListener("request-close-pane", onClosePane);
    window.addEventListener("request-close-tabs", closeMany);
    return () => {
      window.removeEventListener("request-close-tab", onCloseTab);
      window.removeEventListener("request-close-pane", onClosePane);
      window.removeEventListener("request-close-tabs", closeMany);
    };
  }, [requestCloseTab, requestClosePane, closeTab]);

  return { confirmDialog, setConfirmDialog, requestCloseTab, requestClosePane };
}
