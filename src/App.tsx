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
import { useTabStore } from "./stores/tabStore";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import { useKeybindings } from "./hooks/useKeybindings";
import { invoke } from "@tauri-apps/api/core";

const BRAINSTORM_DEFAULT_WIDTH = 480;
const BRAINSTORM_MIN_WIDTH = 280;
const BRAINSTORM_MAX_WIDTH = 900;

export default function App() {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zoomedPane, setZoomedPane] = useState(false);
  const [brainstormWidth, setBrainstormWidth] = useState(BRAINSTORM_DEFAULT_WIDTH);
  const brainstormDragging = useRef(false);
  const brainstormStartX = useRef(0);
  const brainstormStartWidth = useRef(BRAINSTORM_DEFAULT_WIDTH);
  const { tabs, activeTabId, getActivePtyId } = useTabStore();
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
        />
      )}
    </div>
  );
}
