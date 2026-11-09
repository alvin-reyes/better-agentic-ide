import { useRef, useCallback, useEffect, useState, lazy, Suspense } from "react";
import TabBar from "./components/TabBar";
import PaneContainer from "./components/PaneContainer";
import TerminalPane from "./components/TerminalPane";
import SubTerminalStrip, { SubTerminalAnnouncer, SUB_TERMINAL_CONTENT_ID } from "./components/SubTerminalStrip";
import Scratchpad, { type ScratchpadHandle } from "./components/Scratchpad";
import ShortcutsBar from "./components/ShortcutsBar";
import ConfirmDialog from "./components/ConfirmDialog";
import { useProjectSetup, announceFailure, announceSetup, announceSwitch } from "./hooks/useProjectSetup";
import type { SetupFailure, SetupResult } from "./lib/projectSetup";
import { SWITCH_DONE_EVENT, type SwitchDone } from "./lib/bmadSwitch";
import { writePty } from "./lib/terminalCommands";
import Toast from "./components/Toast";
import MethodologyPromptHost from "./components/MethodologyPrompt";
import { togglePalette, useMethodologyPrompt } from "./lib/methodologyPrompt";
import { hideSplash } from "./lib/splash";
import { useTerminalFocusGuard } from "./hooks/useTerminalFocusGuard";
import { useContextGuard, toastLifetime, withdrawToast, type GuardToast } from "./hooks/useContextGuard";

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
const BoardPanel = lazy(() => import("./components/board/BoardPanel"));
const ContractsPanel = lazy(() => import("./components/ContractsPanel"));
const TokensPanel = lazy(() => import("./components/TokensPanel"));
const IntegrationsPanel = lazy(() => import("./components/IntegrationsPanel"));
const NewTabDialog = lazy(() => import("./components/NewTabDialog"));
const ShortcutsOverlay = lazy(() => import("./components/ShortcutsOverlay"));
const TabSwitcher = lazy(() => import("./components/TabSwitcher"));
const ContractsWorkbench = lazy(() => import("./components/ContractsWorkbench"));

import { useTabStore, saveSession, loadSession, shownView } from "./stores/tabStore";
import { tabFolderPtyId } from "./lib/tabDisplay";
import { useOwnFolderCwd } from "./hooks/useOwnFolderCwd";
import { flushNow } from "./lib/persistence";
import { listenForFileOpens } from "./lib/openFile";
import { syncNow } from "./lib/sync";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import { useFileBrowserStore } from "./stores/fileBrowserStore";
import { useKeybindings } from "./hooks/useKeybindings";
import { stopIdlePolling } from "./hooks/useTerminal";
import { useGuardedClose } from "./hooks/useGuardedClose";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { watchAgentStatus } from "./stores/agentStatusStore";
import { useAgentStatusToasts } from "./hooks/useAgentStatusToasts";
import { usePreviewPanel } from "./lib/previewFocus";

/** Session auto-save: after a tab/pane change, and periodically. */
const SESSION_SAVE_DEBOUNCE_MS = 2000;
const SESSION_SAVE_INTERVAL_MS = 20000;

export default function App() {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  // Open state and the ⌘⇧B focus request (rules in previewFocus.ts).
  const {
    open: previewOpen,
    focusRequest: previewFocusRequest,
    toggle: togglePreview,
    close: closePreview,
    openForFile: openPreviewForFile,
  } = usePreviewPanel();
  const [fleetOpen, setFleetOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [contractsOpen, setContractsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [integrations, setIntegrations] = useState<"agents" | "mcp" | "secrets" | "antislop" | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const showShortcutBar = useSettingsStore((s) => s.showShortcutBar);
  const [zoomedPane, setZoomedPane] = useState(false);
  const [toast, setToast] = useState<GuardToast | null>(null);
  const [recordingPlayerOpen, setRecordingPlayerOpen] = useState(false);
  const fileBrowserOpen = useFileBrowserStore((s) => s.isOpen);
  const { tabs, activeTabId, getActivePtyId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  // The PTY id of the pane whose folder is the active tab's folder (the own
  // view's active pane), as a primitive so the subscription only fires when it
  // actually changes. Panes start with ptyId: null and are filled in
  // asynchronously once create_pty resolves; cwd resolution must wait for that.
  const folderPtyId = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ? tabFolderPtyId(tab) : null;
  });
  // The active tab's folder: its own view's, whatever view is in sight.
  const activeCwd = useOwnFolderCwd(activeTab, folderPtyId);
  // For event handlers registered once.
  const activeCwdRef = useRef<string | null>(null);
  activeCwdRef.current = activeCwd;

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

  // From terminal links, the file browser, etc. App owns this rather than the
  // panel: a closed panel is unmounted, so it could never hear the event that
  // is supposed to open it. The document goes on the active tab and the panel
  // follows it.
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) {
        const { activeTabId, setPreviewPath } = useTabStore.getState();
        setPreviewPath(activeTabId, path);
      }
      openPreviewForFile();
    };
    window.addEventListener("open-preview", handler);
    return () => window.removeEventListener("open-preview", handler);
  }, [openPreviewForFile]);

  // Files clicked in detached windows' terminals open here.
  useEffect(() => {
    const unlisten = listenForFileOpens().catch(() => null);
    return () => { void unlisten.then((fn) => fn?.()); };
  }, []);

  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((t: GuardToast) => {
    setToast(t);
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    // The timer of the toast this one replaces is gone either way; a sticky
    // toast starts none of its own.
    const ms = toastLifetime(t);
    toastTimer.current = ms === null ? null : window.setTimeout(() => setToast(null), ms);
  }, []);
  // Only a sticky toast is withdrawn, and it has no timer to clear.
  const withdraw = useCallback((key: string) => setToast((current) => withdrawToast(current, key)), []);
  useContextGuard(activeCwd, showToast);
  useProjectSetup(activeCwd, showToast, withdraw);
  // Setups run elsewhere (new-tab dialog, command palette) report here. A BMAD
  // switch has its own event: a setup's toast offers Undo, and undoing the
  // setup a switch ran would leave the project with no BMAD.
  useEffect(() => {
    const onSetup = (e: Event) => announceSetup((e as CustomEvent<SetupResult>).detail, showToast);
    const onSetupFailed = (e: Event) => announceFailure((e as CustomEvent<SetupFailure>).detail, showToast);
    const onSwitch = (e: Event) => announceSwitch((e as CustomEvent<SwitchDone>).detail, showToast);
    window.addEventListener("project-setup-done", onSetup);
    window.addEventListener("project-setup-failed", onSetupFailed);
    window.addEventListener(SWITCH_DONE_EVENT, onSwitch);
    return () => {
      window.removeEventListener("project-setup-done", onSetup);
      window.removeEventListener("project-setup-failed", onSetupFailed);
      window.removeEventListener(SWITCH_DONE_EVENT, onSwitch);
    };
  }, [showToast]);
  useTerminalFocusGuard();
  // Agent status: each pane's state, and a toast when one out of view needs you.
  useEffect(() => watchAgentStatus(), []);
  useAgentStatusToasts(showToast);

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
  const toggleBoard = useCallback(() => setBoardOpen((prev) => !prev), []);

  // Panel toggles dispatched as window events (command palette, other panels).
  useEffect(() => {
    const toggleZoom = () => setZoomedPane((prev) => !prev);
    const toggles: [string, () => void][] = [
      ["toggle-zoom-pane", toggleZoom],
      ["toggle-fleet", toggleFleet],
      ["toggle-board", toggleBoard],
      ["toggle-tokens", toggleTokens],
      ["toggle-integrations", toggleIntegrations],
      ["open-secrets", () => setIntegrations("secrets")],
      ["open-antislop", () => setIntegrations("antislop")],
      ["open-agents", () => setIntegrations("agents")],
      // requestNewTab holds this back while the BMAD version question is open; so does this.
      ["request-new-tab", () => { if (!useMethodologyPrompt.getState().request) setNewTabOpen(true); }],
      ["toggle-shortcuts", toggleShortcuts],
      ["toggle-tab-switcher", toggleTabSwitcher],
      ["toggle-contracts", toggleContracts],
    ];
    for (const [name, fn] of toggles) window.addEventListener(name, fn);
    return () => { for (const [name, fn] of toggles) window.removeEventListener(name, fn); };
  }, [toggleFleet, toggleBoard, toggleTokens, toggleIntegrations, toggleShortcuts, toggleTabSwitcher, toggleContracts]);

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

  // Not over the BMAD version question or the switch's confirm step.
  const toggleCommandPalette = useCallback(() => setPaletteOpen(togglePalette), []);

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

  // Guarded close: confirm before discarding unsaved edits or killing a live
  // process, on every close path (see useGuardedClose).
  const { confirmDialog, setConfirmDialog, requestCloseTab, requestClosePane, requestCloseView } = useGuardedClose();

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
    toggleBoard,
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
    requestCloseView,
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
        <div className="overflow-hidden" style={{ minWidth: 320, flex: 1 }}>
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
                    : <div className="flex flex-col h-full">
                        {/* Shows only while the tab has a sub-terminal. */}
                        <SubTerminalStrip key={activeTab.id} tabId={activeTab.id} />
                        <div
                          id={SUB_TERMINAL_CONTENT_ID}
                          className="flex-1 min-h-0"
                          role={activeTab.viewOrder.length > 1 ? "tabpanel" : undefined}
                        >
                          {zoomedPane
                            ? <TerminalPane paneId={shownView(activeTab).activePaneId} tabId={activeTab.id} />
                            : <PaneContainer node={shownView(activeTab).root} tabId={activeTab.id} />}
                        </div>
                      </div>
          )}
        </div>
        {previewOpen && (
          <Suspense fallback={null}>
            <PreviewPanel
              onClose={closePreview}
              focusRequest={previewFocusRequest}
            />
          </Suspense>
        )}
        {boardOpen && (
          <Suspense fallback={null}>
            <BoardPanel cwd={activeCwd} onClose={() => setBoardOpen(false)} />
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
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      <SubTerminalAnnouncer />
      {/* After the panels in the DOM, so it sits over one that raised it. */}
      <MethodologyPromptHost />
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
