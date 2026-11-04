import { useCallback, useEffect, useRef, useState } from "react";
import { useTabStore, allTabPanes, findAllPanes, viewOfPane, OWN_VIEW, type Pane, type Tab, type View } from "../stores/tabStore";
import { editorDirty, unsavedEditorTabs } from "../lib/editorDirty";
import { getTerminalDimensions, paneBusy } from "./useTerminal";

export interface CloseConfirm {
  title: string;
  message: string;
  /** The confirm button; ConfirmDialog's default ("Close Anyway") when absent. */
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * Whether a pane can be running anything. A pane with neither a terminal
 * instance nor a ptyId has no shell (a restored sub-terminal not yet shown):
 * it is skipped, not sampled.
 */
const hasShell = (pane: Pane) => pane.ptyId != null || getTerminalDimensions(pane.id) !== null;

/** What runs in each of these panes, busy ones only, in order. */
async function busyIn(panes: Pane[]): Promise<string[]> {
  const names = await Promise.all(panes.filter(hasShell).map((p) => paneBusy(p.id)));
  return names.filter((name): name is string => name !== null);
}

/**
 * paneBusy's label for the first busy pane of `view`, or null when the view
 * runs nothing. A view is running when any of its panes is.
 */
export async function viewRunning(view: View): Promise<string | null> {
  return (await busyIn(findAllPanes(view.root)))[0] ?? null;
}

/** For each view of `tab` in viewOrder, viewRunning's answer. */
async function runningByView(tab: Tab): Promise<(string | null)[]> {
  return Promise.all(tab.viewOrder.map((id) => (tab.views[id] ? viewRunning(tab.views[id]) : null)));
}

/** How many of a tab's sub-terminals are running: the count badge's x. */
export async function runningSubTerminals(tab: Tab): Promise<number> {
  const labels = await runningByView(tab);
  return labels.slice(1).filter((l) => l !== null).length;
}

/** The tab-close confirm for a tab with sub-terminals, when any view runs something. */
async function closeTabCopy(tab: Tab, labels: string[]): Promise<Pick<CloseConfirm, "title" | "message" | "confirmLabel">> {
  // Imported here, on the one path that needs them. Loaded up front, they made
  // the first close in closeConfirm.test (already timing-sensitive: it waits
  // five ticks for paneBusy's first import) miss its settle nearly every run.
  const [{ tabCwd, tabLabel }, { usePaneCwd }] = await Promise.all([import("../lib/tabDisplay"), import("../stores/paneMetaStore")]);
  const label = tabLabel(tab, tabCwd(tab, usePaneCwd.getState().cwds));
  const subs = tab.viewOrder.length - 1;
  return {
    title: subs === 1 ? `Close “${label}” and its sub-terminal?` : `Close “${label}” and its ${subs} sub-terminals?`,
    message: labels.length === 1
      ? `1 is running a program (${labels[0]}). Closing ends it.`
      : `${labels.length} are running a program (${labels.join(", ")}). Closing ends them.`,
    confirmLabel: "Close all",
  };
}

/**
 * Guarded close: confirm before discarding unsaved edits or killing a live
 * process. Every close path comes through here: the tab bar and the command
 * palette by `request-close-tab`, `request-close-pane` and `request-close-tabs`
 * events, the sub-terminal strip by `request-close-view`, and the shortcuts by
 * the returned functions. A pane is live when
 * paneBusy says so, whatever the provider.
 */
export function useGuardedClose() {
  const [confirmDialog, setConfirmDialog] = useState<CloseConfirm | null>(null);
  const closeTab = useTabStore((s) => s.closeTab);
  const closePane = useTabStore((s) => s.closePane);
  const closeView = useTabStore((s) => s.closeView);
  // The sub-terminal confirm on screen, if any: when it goes without closing
  // the view (Cancel, Escape, another dialog), `close-view-cancelled` says so.
  const viewConfirm = useRef<{ dialog: CloseConfirm; tabId: string; viewId: string } | null>(null);
  useEffect(() => {
    const open = viewConfirm.current;
    if (!open || confirmDialog === open.dialog) return;
    viewConfirm.current = null;
    window.dispatchEvent(new CustomEvent("close-view-cancelled", { detail: { tabId: open.tabId, viewId: open.viewId } }));
  }, [confirmDialog]);

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

    const onConfirm = () => {
      closeTab(tabId);
      setConfirmDialog(null);
    };
    if (tab.viewOrder.length > 1) {
      // One label per running view, from its first busy pane, in viewOrder.
      const running = (await runningByView(tab)).filter((l): l is string => l !== null);
      if (running.length > 0) setConfirmDialog({ ...(await closeTabCopy(tab, running)), onConfirm });
      else closeTab(tabId);
      return;
    }

    const activeProcesses = await busyIn(allTabPanes(tab));
    if (activeProcesses.length > 0) {
      setConfirmDialog({
        title: "Active process running",
        message: `This tab has a live ${activeProcesses[0]} session. Closing it will terminate the process. Are you sure?`,
        onConfirm,
      });
    } else {
      closeTab(tabId);
    }
  }, [closeTab]);

  /** The strip's ×, Delete on an entry, ⌘W in a sub-terminal, and ⌘⇧W on its last pane. */
  const requestCloseView = useCallback(async (tabId: string, viewId: string) => {
    const view = useTabStore.getState().tabs.find((t) => t.id === tabId)?.views[viewId];
    if (!view || viewId === OWN_VIEW) return;
    const label = await viewRunning(view);
    if (label) {
      const dialog: CloseConfirm = {
        title: `Close “${view.name ?? "Terminal"}”?`,
        message: `It is running a program (${label}). Closing ends it.`,
        confirmLabel: "Close",
        onConfirm: () => {
          viewConfirm.current = null;
          closeView(tabId, viewId);
          setConfirmDialog(null);
        },
      };
      viewConfirm.current = { dialog, tabId, viewId };
      setConfirmDialog(dialog);
    } else {
      closeView(tabId, viewId);
    }
  }, [closeView]);

  const requestClosePane = useCallback(async (tabId: string, paneId: string) => {
    // A sub-terminal's last pane closes the sub-terminal, with its confirm.
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    const view = tab && viewOfPane(tab, paneId);
    if (view && view.id !== OWN_VIEW && findAllPanes(view.root).length === 1) {
      return requestCloseView(tabId, view.id);
    }
    const pane = view && findAllPanes(view.root).find((p) => p.id === paneId);
    const processName = pane && !hasShell(pane) ? null : await paneBusy(paneId);
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
  }, [closePane, requestCloseView]);

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
    // The sub-terminal strip's × and Delete.
    const onCloseView = (e: Event) => {
      const { tabId, viewId } = (e as CustomEvent).detail;
      void requestCloseView(tabId, viewId);
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
        Promise.all(targets.map((t) => busyIn(allTabPanes(t)))),
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
    window.addEventListener("request-close-view", onCloseView);
    return () => {
      window.removeEventListener("request-close-view", onCloseView);
      window.removeEventListener("request-close-tab", onCloseTab);
      window.removeEventListener("request-close-pane", onClosePane);
      window.removeEventListener("request-close-tabs", closeMany);
    };
  }, [requestCloseTab, requestClosePane, requestCloseView, closeTab]);

  return { confirmDialog, setConfirmDialog, requestCloseTab, requestClosePane, requestCloseView };
}
