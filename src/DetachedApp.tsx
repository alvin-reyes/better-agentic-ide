import { useEffect, useRef, useCallback, useState } from "react";
import PaneContainer from "./components/PaneContainer";
import Scratchpad, { type ScratchpadHandle } from "./components/Scratchpad";
import { useTabStore } from "./stores/tabStore";
import { useSettingsStore, applyThemeToDOM } from "./stores/settingsStore";
import type { Tab } from "./stores/tabStore";

interface DetachedAppProps {
  tab: Tab;
}

export default function DetachedApp({ tab }: DetachedAppProps) {
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize the tab store with just this one tab
  useEffect(() => {
    useTabStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
    });
    setIsReady(true);
  }, [tab]);

  // Apply theme
  useEffect(() => {
    const colors = useSettingsStore.getState().getActiveTheme();
    applyThemeToDOM(colors);
  }, []);

  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

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

  // Keyboard shortcuts for detached window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      // Cmd+J: toggle scratchpad
      if (e.key === "j") {
        e.preventDefault();
        toggleScratchpad();
      }
      // Cmd+Enter: send scratchpad
      if (e.key === "Enter" && scratchpadRef.current?.isOpen) {
        e.preventDefault();
        scratchpadRef.current?.send();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleScratchpad]);

  if (!isReady || !activeTab) return null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Minimal title bar with drag region */}
      <div
        style={{
          height: "38px",
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: "80px",
          paddingRight: "12px",
          flexShrink: 0,
        }}
        data-tauri-drag-region
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "-0.01em",
            pointerEvents: "none",
          }}
        >
          {tab.name}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <PaneContainer node={activeTab.root} tabId={activeTab.id} />
      </div>
      <Scratchpad ref={scratchpadRef} />
    </div>
  );
}
