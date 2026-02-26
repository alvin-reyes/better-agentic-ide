import { useRef, useCallback, useEffect, useState } from "react";
import TabBar from "./components/TabBar";
import PaneContainer from "./components/PaneContainer";
import TerminalPane from "./components/TerminalPane";
import Scratchpad, { type ScratchpadHandle } from "./components/Scratchpad";
import ShortcutsBar from "./components/ShortcutsBar";
import SettingsPanel from "./components/SettingsPanel";
import BrainstormPanel from "./components/BrainstormPanel";
import Tour from "./components/Tour";
import CommandPalette from "./components/CommandPalette";
import AgentPicker from "./components/AgentPicker";
import ConfirmDialog from "./components/ConfirmDialog";
import { useTabStore, findAllPanes } from "./stores/tabStore";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import { useKeybindings } from "./hooks/useKeybindings";
import { hasActiveProcess } from "./hooks/useTerminal";
import { invoke } from "@tauri-apps/api/core";

const BRAINSTORM_DEFAULT_WIDTH = 480;
const BRAINSTORM_MIN_WIDTH = 280;
const BRAINSTORM_MAX_WIDTH = 900;

export default function App() {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [zoomedPane, setZoomedPane] = useState(false);
  const [brainstormWidth, setBrainstormWidth] = useState(BRAINSTORM_DEFAULT_WIDTH);
  const brainstormDragging = useRef(false);
  const brainstormStartX = useRef(0);
  const brainstormStartWidth = useRef(BRAINSTORM_DEFAULT_WIDTH);
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

  const toggleBrainstorm = useCallback(() => {
    setBrainstormOpen((prev) => !prev);
  }, []);

  const toggleAgentPicker = useCallback(() => {
    setAgentPickerOpen((prev) => !prev);
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

  const closeBrainstorm = useCallback(() => {
    setBrainstormOpen(false);
  }, []);

  // Guarded close: check for active Claude processes before closing
  const requestCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Check all panes in this tab for active processes
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

  const onBrainstormDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    brainstormDragging.current = true;
    brainstormStartX.current = e.clientX;
    brainstormStartWidth.current = brainstormWidth;

    const cleanup = () => {
      brainstormDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMove = (ev: MouseEvent) => {
      if (!brainstormDragging.current) return;
      const delta = brainstormStartX.current - ev.clientX;
      setBrainstormWidth(Math.min(BRAINSTORM_MAX_WIDTH, Math.max(BRAINSTORM_MIN_WIDTH, brainstormStartWidth.current + delta)));
    };

    const onUp = () => cleanup();

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", cleanup);
  }, [brainstormWidth]);

  useKeybindings({
    toggleScratchpad,
    toggleBrainstorm,
    closeScratchpad,
    closeBrainstorm,
    sendScratchpad,
    copyScratchpad,
    saveNoteScratchpad,
    sendEnterToTerminal,
    toggleCommandPalette,
    toggleAgentPicker,
    requestCloseTab,
    requestClosePane,
    isScratchpadOpen: scratchpadRef.current?.isOpen ?? false,
    isBrainstormOpen: brainstormOpen,
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      <TabBar />
      <div className="flex-1 overflow-hidden flex">
        <div className={brainstormOpen ? "flex-1 overflow-hidden" : "w-full overflow-hidden"} style={{ minWidth: 0 }}>
          {activeTab && (
            zoomedPane
              ? <TerminalPane paneId={activeTab.activePaneId} tabId={activeTab.id} />
              : <PaneContainer node={activeTab.root} tabId={activeTab.id} />
          )}
        </div>
        {brainstormOpen && (
          <div style={{ width: `${brainstormWidth}px`, flexShrink: 0, position: "relative" }}>
            {/* Resize handle */}
            <div
              onMouseDown={onBrainstormDragStart}
              style={{
                position: "absolute",
                top: 0,
                left: "-3px",
                bottom: 0,
                width: "6px",
                cursor: "col-resize",
                zIndex: 20,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget.firstChild as HTMLElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget.firstChild as HTMLElement).style.opacity = "0";
              }}
            >
              <div style={{
                width: "3px",
                height: "40px",
                borderRadius: "2px",
                backgroundColor: "var(--text-muted)",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                opacity: 0,
                transition: "opacity 0.15s",
              }} />
            </div>
            <BrainstormPanel onClose={() => setBrainstormOpen(false)} />
          </div>
        )}
      </div>
      <Scratchpad ref={scratchpadRef} />
      <ShortcutsBar />
      <SettingsPanel />
      <Tour />
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onToggleScratchpad={toggleScratchpad}
          onToggleBrainstorm={toggleBrainstorm}
          onOpenAgentPicker={() => { setPaletteOpen(false); setAgentPickerOpen(true); }}
        />
      )}
      {agentPickerOpen && (
        <AgentPicker onClose={() => setAgentPickerOpen(false)} />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
