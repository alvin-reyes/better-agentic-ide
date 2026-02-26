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

export default function App() {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zoomedPane, setZoomedPane] = useState(false);
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

  // Reset zoom when switching tabs
  useEffect(() => {
    setZoomedPane(false);
  }, [activeTabId]);

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
          <div style={{ width: "42%", minWidth: "320px", maxWidth: "600px", flexShrink: 0 }}>
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
