import { useRef, useCallback, useState, useEffect } from "react";
import { useTerminal } from "../hooks/useTerminal";
import { getSearchAddon } from "../hooks/useTerminal";
import { useTabStore } from "../stores/tabStore";
import TerminalSearch from "./TerminalSearch";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  paneId: string;
  tabId: string;
}

export default function TerminalPane({ paneId, tabId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setActivePaneInTab = useTabStore((s) => s.setActivePaneInTab);
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === tabId));
  const isActive = activeTab?.activePaneId === paneId;
  const [showSearch, setShowSearch] = useState(false);

  const { termRef } = useTerminal(paneId, containerRef);

  const handleClick = useCallback(() => {
    setActivePaneInTab(tabId, paneId);
    // Focus the xterm instance so it receives keyboard input
    termRef.current?.focus();
  }, [tabId, paneId, setActivePaneInTab, termRef]);

  // Listen for Cmd+F to open search in this pane
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && !e.altKey && e.key === "f" && isActive) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive]);

  return (
    <div
      className="relative h-full w-full"
      style={{ padding: "2px" }}
      onMouseDown={handleClick}
    >
      {isActive && (
        <div
          className="absolute left-0 top-0 bottom-0 z-10"
          style={{
            width: "2px",
            background: "linear-gradient(180deg, var(--accent) 0%, transparent 100%)",
            borderRadius: "1px",
          }}
        />
      )}
      {showSearch && (
        <TerminalSearch
          searchAddon={getSearchAddon(paneId)}
          onClose={() => {
            setShowSearch(false);
            termRef.current?.focus();
          }}
        />
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{
          backgroundColor: "var(--bg-primary)",
          padding: "8px 4px 4px 8px",
        }}
      />
    </div>
  );
}
