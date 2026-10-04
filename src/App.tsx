import { useRef, useCallback, useEffect, useState, lazy, Suspense } from "react";
import TabBar from "./components/TabBar";
import PaneContainer from "./components/PaneContainer";
import TerminalPane from "./components/TerminalPane";
import Scratchpad, { type ScratchpadHandle } from "./components/Scratchpad";
import ShortcutsBar from "./components/ShortcutsBar";
import ConfirmDialog from "./components/ConfirmDialog";
import { useProjectSetup, announceSetup } from "./hooks/useProjectSetup";
import type { SetupResult } from "./lib/projectSetup";
import { writePty, sendToActiveTerminal } from "./lib/terminalCommands";
import { hideSplash } from "./lib/splash";
import { editorDirty, unsavedEditorTabs } from "./lib/editorDirty";
import { useTerminalFocusGuard } from "./hooks/useTerminalFocusGuard";
import { useContextGuard, type GuardToast } from "./hooks/useContextGuard";

// Lazy-load heavy components for faster startup
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
const Tour = lazy(() => import("./components/Tour"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const AgentPicker = lazy(() => import("./components/AgentPicker"));
const PreviewPanel = lazy(() => import("./components/PreviewPanel"));
const FileBrowser = lazy(() => import("./components/FileBrowser"));
const OrchestratorTab = lazy(() => import("./components/OrchestratorTab"));
const EditorTab = lazy(() => import("./components/EditorTab"));
const BrowserTab = lazy(() => import("./components/BrowserTab"));
const RecordingPlayer = lazy(() => import("./components/RecordingPlayer"));
const FleetPanel = lazy(() => import("./components/fleet/FleetPanel"));
const FleetTab = lazy(() => import("./components/fleet/FleetTab"));
const BmadPanel = lazy(() => import("./components/BmadPanel"));
const ContractsPanel = lazy(() => import("./components/ContractsPanel"));
const TokensPanel = lazy(() => import("./components/TokensPanel"));
const IntegrationsPanel = lazy(() => import("./components/IntegrationsPanel"));
const NewTabDialog = lazy(() => import("./components/NewTabDialog"));
const ShortcutsOverlay = lazy(() => import("./components/ShortcutsOverlay"));
const TabSwitcher = lazy(() => import("./components/TabSwitcher"));
const ContractsWorkbench = lazy(() => import("./components/ContractsWorkbench"));

import { useTabStore, findAllPanes, saveSession, loadSession } from "./stores/tabStore";
import { flushNow } from "./lib/persistence";
import { listenForFileOpens } from "./lib/openFile";
import { syncNow } from "./lib/sync";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import { useFileBrowserStore } from "./stores/fileBrowserStore";
import { useKeybindings } from "./hooks/useKeybindings";
import { hasActiveProcess, stopIdlePolling } from "./hooks/useTerminal";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** How often the active terminal's folder is re-read to follow `cd`. */
const CWD_POLL_MS = 3000;
/** Session auto-save: after a tab/pane change, and periodically. */
const SESSION_SAVE_DEBOUNCE_MS = 2000;
const SESSION_SAVE_INTERVAL_MS = 20000;

export default function App() {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingPreviewPath, setPendingPreviewPath] = useState<string | null>(null);
  const [fleetOpen, setFleetOpen] = useState(false);
  const [bmadOpen, setBmadOpen] = useState(false);
  const [contractsOpen, setContractsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [integrations, setIntegrations] = useState<"agents" | "mcp" | "secrets" | "antislop" | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const showShortcutBar = useSettingsStore((s) => s.showShortcutBar);
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  // For event handlers registered once.
  const activeCwdRef = useRef<string | null>(null);
  activeCwdRef.current = activeCwd;
  const [zoomedPane, setZoomedPane] = useState(false);
  const [toast, setToast] = useState<GuardToast | null>(null);
  const [recordingPlayerOpen, setRecordingPlayerOpen] = useState(false);
  const fileBrowserOpen = useFileBrowserStore((s) => s.isOpen);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const { tabs, activeTabId, getActivePtyId, closeTab, closePane } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  // The active pane's PTY id, as a primitive so the subscription only fires when
  // it actually changes. Panes start with ptyId: null and are filled in
  // asynchronously once create_pty resolves; cwd resolution must wait for that.
  const activePtyId = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab) return null;
    return findAllPanes(tab.root).find((p) => p.id === tab.activePaneId)?.ptyId ?? null;
  });

  // The first render is on screen: fade out the launch splash.
  useEffect(() => hideSplash(), []);

  useEffect(() => {
    applyThemeToDOM(useSettingsStore.getState().getActiveTheme());
    loadSession();
  }, []);

  // Auto-save the session (tabs, splits, folders, scrollback) instead of only
  // on window close, so a crash or force-quit doesn't lose it: shortly after
  // any tab/pane change, and every 20 s to pick up `cd` and new output.
  useEffect(() => {
    const id = window.setTimeout(() => { void saveSession().catch(() => {}); }, SESSION_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [tabs, activeTabId]);
  useEffect(() => {
    const id = window.setInterval(() => { void saveSession().catch(() => {}); }, SESSION_SAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Save session on window close and clean up global resources
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      stopIdlePolling();
      try {
        await saveSession();
        await flushNow();
        // Push this machine's latest state; don't hold the window open long.
        await Promise.race([syncNow(false), new Promise((r) => setTimeout(r, 4000))]);
      } catch {
        // Save failed, still close
      }
      await getCurrentWindow().destroy();
    }).then((fn) => { unlisten = fn; });
    return () => {
      unlisten?.();
      stopIdlePolling();
    };
  }, []);

  // From terminal links, the file browser, etc.
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) {
        // Only stash the path when the panel is closed; an open PreviewPanel
        // handles the event itself.
        setPreviewOpen((wasOpen) => {
          if (!wasOpen) setPendingPreviewPath(path);
          return true;
        });
      } else {
        setPreviewOpen(true);
      }
    };
    window.addEventListener("open-preview", handler);
    return () => window.removeEventListener("open-preview", handler);
  }, []);

  // Files clicked in detached windows' terminals open here.
  useEffect(() => {
    const unlisten = listenForFileOpens().catch(() => null);
    return () => { void unlisten.then((fn) => fn?.()); };
  }, []);

  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((t: GuardToast) => {
    setToast(t);
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    // Leave time to click an action.
    toastTimer.current = window.setTimeout(() => setToast(null), t.action ? 15000 : 4000);
  }, []);
  useContextGuard(activeCwd, showToast);
  useProjectSetup(activeCwd, showToast);
  // Setups run elsewhere (new-tab dialog, command palette) report here.
  useEffect(() => {
    const onSetup = (e: Event) => announceSetup((e as CustomEvent<SetupResult>).detail, showToast);
    const onSetupFailed = (e: Event) =>
      showToast({ title: "Project setup", body: (e as CustomEvent<{ why: string }>).detail.why });
    window.addEventListener("project-setup-done", onSetup);
    window.addEventListener("project-setup-failed", onSetupFailed);
    return () => {
      window.removeEventListener("project-setup-done", onSetup);
      window.removeEventListener("project-setup-failed", onSetupFailed);
    };
  }, [showToast]);
  useTerminalFocusGuard();

  // Agent completion notifications, shown as an in-app toast.
  useEffect(() => {
    const handler = (e: Event) => {
      const { title, body } = (e as CustomEvent).detail;
      showToast({ title, body });
    };
    window.addEventListener("agent-notification", handler);
    return () => window.removeEventListener("agent-notification", handler);
  }, [showToast]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const toggleFleet = useCallback(() => setFleetOpen((prev) => !prev), []);
  const toggleTokens = useCallback(() => setTokensOpen((prev) => !prev), []);
  const toggleIntegrations = useCallback(() => setIntegrations((prev) => (prev ? null : "mcp")), []);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((prev) => !prev), []);
  const toggleTabSwitcher = useCallback(() => setSwitcherOpen((prev) => !prev), []);
  const toggleContracts = useCallback(() => setContractsOpen((prev) => !prev), []);

  // Panel toggles dispatched as window events (command palette, other panels).
  useEffect(() => {
    const toggleZoom = () => setZoomedPane((prev) => !prev);
    const toggleBmad = () => setBmadOpen((prev) => !prev);
    const toggles: [string, () => void][] = [
      ["toggle-zoom-pane", toggleZoom],
      ["toggle-fleet", toggleFleet],
      ["toggle-bmad", toggleBmad],
      ["toggle-tokens", toggleTokens],
      ["toggle-integrations", toggleIntegrations],
      ["open-secrets", () => setIntegrations("secrets")],
      ["open-antislop", () => setIntegrations("antislop")],
      ["open-agents", () => setIntegrations("agents")],
      ["request-new-tab", () => setNewTabOpen(true)],
      ["toggle-shortcuts", toggleShortcuts],
      ["toggle-tab-switcher", toggleTabSwitcher],
      ["toggle-contracts", toggleContracts],
    ];
    for (const [name, fn] of toggles) window.addEventListener(name, fn);
    return () => { for (const [name, fn] of toggles) window.removeEventListener(name, fn); };
  }, [toggleFleet, toggleTokens, toggleIntegrations, toggleShortcuts, toggleTabSwitcher, toggleContracts]);

  // Contract quick actions from the command palette.
  useEffect(() => {
    const onRun = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      void import("./lib/contractRunner").then(({ runContractActionById }) =>
        runContractActionById(id, activeCwdRef.current).then((err) => {
          if (err) window.dispatchEvent(new CustomEvent("agent-notification", { detail: { title: "Contracts", body: err } }));
        }),
      );
    };
    window.addEventListener("contracts-run", onRun);
    const onWorkbench = () => {
      const cwd = activeCwdRef.current;
      if (!cwd) return;
      void invoke<{ root: string } | null>("contracts_detect", { path: cwd }).then((p) => {
        if (p) useTabStore.getState().addContractsTab(p.root);
        else window.dispatchEvent(new CustomEvent("agent-notification", { detail: { title: "Contracts", body: "No Foundry, Hardhat or Anchor project in this terminal's folder." } }));
      }).catch((err) => window.dispatchEvent(new CustomEvent("agent-notification", {
        // Without this the command looked like a no-op: the "no project here"
        // branch notifies, but a thrown detect said nothing at all.
        detail: { title: "Contracts", body: `Could not inspect this folder: ${err}` },
      })));
    };
    window.addEventListener("contracts-workbench", onWorkbench);
    return () => {
      window.removeEventListener("contracts-run", onRun);
      window.removeEventListener("contracts-workbench", onWorkbench);
    };
  }, []);

  // Resolve the active terminal's cwd eagerly. Non-terminal tabs (fleet, editor,
  // browser, orchestrator) have no PTY, so keep the last resolved value rather
  // than clearing it — the fleet views read this while a fleet tab is focused.
  //
  // activePtyId is in the dependency list on purpose: getPtyCwd resolves null
  // (it does not reject) while the pane's PTY has not been created yet, which is
  // the state of every pane on the first render. Depending on the PTY id makes
  // this re-run the moment create_pty lands, which is the only recovery path in
  // a single-pane layout.
  //
  // It is also re-read every few seconds: a `cd` inside the terminal changes the
  // folder without any React state changing, and the BMAD banner and the
  // "This terminal" fleet view would otherwise keep using the old folder.
  // (The file browser polls on its own for the same reason.)
  useEffect(() => {
    const paneId = activeTab?.activePaneId;
    if (!paneId) return;
    if (activeTab?.type && activeTab.type !== "terminal") return;
    let cancelled = false;
    const resolve = () =>
      import("./hooks/useTerminal").then(({ getPtyCwd }) =>
        getPtyCwd(paneId).then((cwd) => { if (cwd && !cancelled) setActiveCwd(cwd); }),
      ).catch(() => {});
    resolve();
    const id = window.setInterval(resolve, CWD_POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeTab?.type, activeTab?.activePaneId, activePtyId]);

  const toggleCommandPalette = useCallback(() => setPaletteOpen((prev) => !prev), []);

  const toggleScratchpad = useCallback(() => {
    const sp = scratchpadRef.current;
    if (!sp) return;

    if (!sp.isOpen) {
      sp.toggle();
      requestAnimationFrame(() => sp.focus());
    } else if (sp.isFocused()) {
      const xtermEl = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
      xtermEl?.focus();
    } else {
      sp.focus();
    }
  }, []);

  const toggleAgentPicker = useCallback(() => setAgentPickerOpen((prev) => !prev), []);
  const togglePreview = useCallback(() => setPreviewOpen((prev) => !prev), []);
  const toggleFileBrowser = useCallback(() => useFileBrowserStore.getState().toggle(), []);
  const sendScratchpad = useCallback(() => scratchpadRef.current?.send(), []);
  const copyScratchpad = useCallback(() => scratchpadRef.current?.copy(), []);
  const saveNoteScratchpad = useCallback(() => scratchpadRef.current?.saveNote(), []);
  const closeScratchpad = useCallback(() => scratchpadRef.current?.close(), []);

  const sendEnterToTerminal = useCallback(() => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;
    writePty(ptyId, "\r").catch(() => {});
  }, [getActivePtyId]);

  const openOrchestrator = useCallback(() => {
    import("./stores/orchestratorStore").then(({ useOrchestratorStore }) => {
      const sessionId = useOrchestratorStore.getState().createSession("New Project");
      useTabStore.getState().addOrchestratorTab(sessionId);
    });
  }, []);

  // Guarded close: confirm before discarding unsaved edits or killing a live process.
  const requestCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.type === "editor") {
      editorDirty(tabId).then((isDirty) => {
        if (isDirty && !confirm("This file has unsaved changes. Close anyway?")) return;
        closeTab(tabId);
      });
      return;
    }

    const activeProcesses = findAllPanes(tab.root)
      .map((p) => hasActiveProcess(p.id))
      .filter((name): name is string => name !== null);

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
  }, [tabs, closeTab]);

  const requestClosePane = useCallback((tabId: string, paneId: string) => {
    const processName = hasActiveProcess(paneId);
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

  // Tab close requests from TabBar (X button / context menu).
  useEffect(() => {
    const handler = (e: Event) => {
      const { tabId } = (e as CustomEvent).detail;
      requestCloseTab(tabId);
    };
    window.addEventListener("request-close-tab", handler);
    // Close others / to the right: one confirmation for all of them.
    const closeMany = (e: Event) => {
      const ids: string[] = (e as CustomEvent).detail?.tabIds ?? [];
      const targets = tabs.filter((t) => ids.includes(t.id));
      const live = targets.filter((t) => findAllPanes(t.root).some((p) => hasActiveProcess(p.id) !== null));
      const close = () => { for (const t of targets) closeTab(t.id); setConfirmDialog(null); };
      // hasActiveProcess reads an xterm buffer, so it is null for every editor
      // tab. Without asking them too, "Close others" discarded unsaved files
      // with no prompt, while closing the same tab on its own warned.
      void unsavedEditorTabs(targets).then((unsaved) => {
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
    window.addEventListener("request-close-tabs", closeMany);
    return () => {
      window.removeEventListener("request-close-tab", handler);
      window.removeEventListener("request-close-tabs", closeMany);
    };
  }, [requestCloseTab, tabs, closeTab]);

  useKeybindings({
    toggleScratchpad,
    closeScratchpad,
    sendScratchpad,
    copyScratchpad,
    saveNoteScratchpad,
    sendEnterToTerminal,
    toggleCommandPalette,
    toggleAgentPicker,
    togglePreview,
    toggleFleet,
    toggleFileBrowser,
    openOrchestrator,
    toggleContracts,
    toggleTokens,
    toggleIntegrations,
    toggleShortcuts,
    toggleTabSwitcher,
    requestCloseTab,
    requestClosePane,
    isScratchpadOpen: scratchpadRef.current?.isOpen ?? false,
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      <TabBar />
      <div className="flex-1 overflow-hidden flex">
        {fileBrowserOpen && (
          <Suspense fallback={null}>
            <FileBrowser />
          </Suspense>
        )}
        <div className="overflow-hidden" style={{ minWidth: 0, flex: 1 }}>
          {activeTab && (
            activeTab.type === "orchestrator" && activeTab.orchestratorSessionId
              ? <Suspense fallback={null}>
                  <OrchestratorTab sessionId={activeTab.orchestratorSessionId} />
                </Suspense>
              : activeTab.type === "editor" && activeTab.editorFilePath
                ? <Suspense fallback={null}>
                    <EditorTab tabId={activeTab.id} filePath={activeTab.editorFilePath} />
                  </Suspense>
                : activeTab.type === "browser" && activeTab.browserUrl
                  ? <Suspense fallback={null}>
                      <BrowserTab tabId={activeTab.id} initialUrl={activeTab.browserUrl} />
                    </Suspense>
                  : activeTab.type === "fleet"
                    ? <Suspense fallback={null}>
                        <FleetTab activeCwd={activeCwd} />
                      </Suspense>
                    : activeTab.type === "contracts" && activeTab.contractsRoot
                    ? <Suspense fallback={null}>
                        <ContractsWorkbench key={activeTab.contractsRoot} root={activeTab.contractsRoot} />
                      </Suspense>
                    : zoomedPane
                    ? <TerminalPane paneId={activeTab.activePaneId} tabId={activeTab.id} />
                    : <PaneContainer node={activeTab.root} tabId={activeTab.id} />
          )}
        </div>
        {previewOpen && (
          <Suspense fallback={null}>
            <PreviewPanel
              onClose={() => { setPreviewOpen(false); setPendingPreviewPath(null); }}
              initialPath={pendingPreviewPath}
              onInitialPathConsumed={() => setPendingPreviewPath(null)}
            />
          </Suspense>
        )}
      </div>
      <Scratchpad ref={scratchpadRef} />
      {showShortcutBar && <ShortcutsBar />}
      <Suspense fallback={null}>
        <SettingsPanel />
        <Tour />
        {paletteOpen && (
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            onToggleScratchpad={toggleScratchpad}
            onOpenAgentPicker={() => { setPaletteOpen(false); setAgentPickerOpen(true); }}
            onTogglePreview={togglePreview}
            onToggleFileBrowser={toggleFileBrowser}
            onOpenRecordings={() => setRecordingPlayerOpen(true)}
          />
        )}
        {agentPickerOpen && (
          <AgentPicker onClose={() => setAgentPickerOpen(false)} />
        )}
        {fleetOpen && (
          <Suspense fallback={null}>
            <FleetPanel
              activeCwd={activeCwd}
              onClose={() => setFleetOpen(false)}
              onExpand={() => {
                setFleetOpen(false);
                useTabStore.getState().addFleetTab();
              }}
            />
          </Suspense>
        )}
        {bmadOpen && (
          <BmadPanel onClose={() => setBmadOpen(false)} />
        )}
        {contractsOpen && (
          <ContractsPanel cwd={activeCwd} onClose={() => setContractsOpen(false)} />
        )}
        {tokensOpen && <TokensPanel cwd={activeCwd} onClose={() => setTokensOpen(false)} />}
        {newTabOpen && <NewTabDialog onClose={() => setNewTabOpen(false)} />}
        {integrations && <IntegrationsPanel cwd={activeCwd} initialTab={integrations} onClose={() => setIntegrations(null)} />}
        {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
        {switcherOpen && <TabSwitcher onClose={() => setSwitcherOpen(false)} />}
        {recordingPlayerOpen && (
          <RecordingPlayer onClose={() => setRecordingPlayerOpen(false)} />
        )}
      </Suspense>
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "60px",
            right: "20px",
            zIndex: 2500,
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            padding: "12px 16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            animation: "toast-slide-in 0.3s ease",
            maxWidth: "320px",
          }}
          onClick={() => setToast(null)}
        >
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>
            {toast.title}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {toast.body}
          </div>
          {toast.action && (
            <button
              className="contracts-action"
              style={{ marginTop: 8 }}
              onClick={() => {
                const a = toast.action!;
                if (a.run) a.run();
                else if (a.command) void sendToActiveTerminal(a.command, false);
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
