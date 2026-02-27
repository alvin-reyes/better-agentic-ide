import { useRef, useCallback, useEffect, useState, lazy, Suspense } from "react";
import TabBar from "./components/TabBar";
import PaneContainer from "./components/PaneContainer";
import TerminalPane from "./components/TerminalPane";
import Scratchpad, { type ScratchpadHandle } from "./components/Scratchpad";
import ShortcutsBar from "./components/ShortcutsBar";
import ConfirmDialog from "./components/ConfirmDialog";

// Lazy-load heavy components for faster startup
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
const Tour = lazy(() => import("./components/Tour"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const AgentPicker = lazy(() => import("./components/AgentPicker"));
const PreviewPanel = lazy(() => import("./components/PreviewPanel"));
const AgentDashboard = lazy(() => import("./components/AgentDashboard"));
const OrchestratorTab = lazy(() => import("./components/OrchestratorTab"));
import { useTabStore, findAllPanes } from "./stores/tabStore";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import { useKeybindings } from "./hooks/useKeybindings";
import { hasActiveProcess } from "./hooks/useTerminal";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [zoomedPane, setZoomedPane] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const { tabs, activeTabId, getActivePtyId, closeTab, closePane } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Apply saved theme on startup
  useEffect(() => {
    const colors = useSettingsStore.getState().getActiveTheme();
    applyThemeToDOM(colors);
  }, []);

  // Listen for pane zoom toggle
  useEffect(() => {
    const handler = () => setZoomedPane((prev) => !prev);
    window.addEventListener("toggle-zoom-pane", handler);
    return () => window.removeEventListener("toggle-zoom-pane", handler);
  }, []);

  // Listen for preview open events (from terminal links, etc.)
  useEffect(() => {
    const handler = () => setPreviewOpen(true);
    window.addEventListener("open-preview", handler);
    return () => window.removeEventListener("open-preview", handler);
  }, []);

  // Listen for agent completion notifications (in-app toast)
  useEffect(() => {
    let timeoutId: number | null = null;
    const handler = (e: Event) => {
      const { title, body } = (e as CustomEvent).detail;
      setToast({ title, body });
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener("agent-notification", handler);
    return () => {
      window.removeEventListener("agent-notification", handler);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  // Request notification permission on startup
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Listen for dashboard toggle from command palette
  useEffect(() => {
    const handler = () => setDashboardOpen((prev) => !prev);
    window.addEventListener("toggle-dashboard", handler);
    return () => window.removeEventListener("toggle-dashboard", handler);
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setPaletteOpen((prev) => !prev);
  }, []);

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

  const toggleAgentPicker = useCallback(() => {
    setAgentPickerOpen((prev) => !prev);
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewOpen((prev) => !prev);
  }, []);

  const toggleDashboard = useCallback(() => {
    setDashboardOpen((prev) => !prev);
  }, []);

  const sendScratchpad = useCallback(() => {
    scratchpadRef.current?.send();
  }, []);

  const copyScratchpad = useCallback(() => {
    scratchpadRef.current?.copy();
  }, []);

  const saveNoteScratchpad = useCallback(() => {
    scratchpadRef.current?.saveNote();
  }, []);

  const sendEnterToTerminal = useCallback(() => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;
    const data = Array.from(new TextEncoder().encode("\r"));
    invoke("write_pty", { id: ptyId, data }).catch(() => {});
  }, [getActivePtyId]);

  const closeScratchpad = useCallback(() => {
    scratchpadRef.current?.close();
  }, []);

  const openOrchestrator = useCallback(() => {
    import("./stores/orchestratorStore").then(({ useOrchestratorStore }) => {
      const sessionId = useOrchestratorStore.getState().createSession("New Project");
      useTabStore.getState().addOrchestratorTab(sessionId);
    });
  }, []);

  // Guarded close: check for active Claude processes before closing
  const requestCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const allPanes = findAllPanes(tab.root);
    const activeProcesses = allPanes
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

  // Listen for tab close requests from TabBar (X button / context menu)
  useEffect(() => {
    const handler = (e: Event) => {
      const { tabId } = (e as CustomEvent).detail;
      requestCloseTab(tabId);
    };
    window.addEventListener("request-close-tab", handler);
    return () => window.removeEventListener("request-close-tab", handler);
  }, [requestCloseTab]);

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
    toggleDashboard,
    openOrchestrator,
    requestCloseTab,
    requestClosePane,
    isScratchpadOpen: scratchpadRef.current?.isOpen ?? false,
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      <TabBar />
      <div className="flex-1 overflow-hidden flex">
        <div className="overflow-hidden" style={{ minWidth: 0, flex: 1 }}>
          {activeTab && (
            activeTab.type === "orchestrator" && activeTab.orchestratorSessionId
              ? <Suspense fallback={null}>
                  <OrchestratorTab sessionId={activeTab.orchestratorSessionId} />
                </Suspense>
              : zoomedPane
                ? <TerminalPane paneId={activeTab.activePaneId} tabId={activeTab.id} />
                : <PaneContainer node={activeTab.root} tabId={activeTab.id} />
          )}
        </div>
        {previewOpen && (
          <Suspense fallback={null}>
            <PreviewPanel onClose={() => setPreviewOpen(false)} />
          </Suspense>
        )}
      </div>
      <Scratchpad ref={scratchpadRef} />
      <ShortcutsBar />
      <Suspense fallback={null}>
        <SettingsPanel />
        <Tour />
        {paletteOpen && (
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            onToggleScratchpad={toggleScratchpad}
            onOpenAgentPicker={() => { setPaletteOpen(false); setAgentPickerOpen(true); }}
            onTogglePreview={togglePreview}
          />
        )}
        {agentPickerOpen && (
          <AgentPicker onClose={() => setAgentPickerOpen(false)} />
        )}
        {dashboardOpen && (
          <AgentDashboard onClose={() => setDashboardOpen(false)} />
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
      {/* Toast notification */}
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
        </div>
      )}
    </div>
  );
}
