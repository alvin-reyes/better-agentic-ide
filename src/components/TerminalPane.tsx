import { useRef, useCallback, useState, useEffect } from "react";
import { useTerminal, getPtyCwd } from "../hooks/useTerminal";
import { getSearchAddon } from "../hooks/useTerminal";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import TerminalSearch from "./TerminalSearch";
import "@xterm/xterm/css/xterm.css";

// Distinct colors for each split pane
const PANE_COLORS = [
  "#58a6ff", // blue (accent)
  "#3fb950", // green
  "#bc8cff", // purple
  "#d29922", // yellow
  "#ff7b72", // red
  "#f778ba", // pink
  "#79c0ff", // light blue
  "#56d4dd", // cyan
];

// Format CWD: replace home dir with ~, show last 3 segments as breadcrumb
function formatCwd(path: string): string {
  let display = path;
  // Replace /Users/<name> with ~
  const homeMatch = display.match(/^\/Users\/[^/]+/);
  if (homeMatch) display = display.replace(homeMatch[0], "~");
  // Split into segments and show breadcrumb style
  const parts = display.split("/").filter(Boolean);
  if (parts.length <= 3) return parts.join(" / ");
  return "... / " + parts.slice(-3).join(" / ");
}

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
  const [cwd, setCwd] = useState<string | null>(null);

  // Get pane color based on index within the tab
  const allPanes = activeTab ? findAllPanes(activeTab.root) : [];
  const paneIndex = allPanes.findIndex((p) => p.id === paneId);
  const paneColor = PANE_COLORS[paneIndex % PANE_COLORS.length];
  const hasMultiplePanes = allPanes.length > 1;

  const { termRef } = useTerminal(paneId, containerRef);

  const handleClick = useCallback(() => {
    setActivePaneInTab(tabId, paneId);
    termRef.current?.focus();
  }, [tabId, paneId, setActivePaneInTab, termRef]);

  // Focus terminal when this pane becomes active (e.g. via keyboard navigation)
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive, termRef]);

  // Poll CWD every 3 seconds
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const path = await getPtyCwd(paneId);
      if (mounted && path) setCwd(path);
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, [paneId]);

  // Listen for Cmd+F to open search — only attach when this pane is active
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && !e.altKey && e.key === "f") {
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
      style={{
        padding: "1px",
        borderTop: hasMultiplePanes ? `2px solid ${isActive ? paneColor : paneColor + "40"}` : "none",
        transition: "border-color 0.2s ease",
      }}
      onMouseDown={handleClick}
    >
      {/* Left accent bar for active pane */}
      {isActive && hasMultiplePanes && (
        <div
          className="absolute left-0 top-0 bottom-0 z-10"
          style={{
            width: "2px",
            background: `linear-gradient(180deg, ${paneColor} 0%, transparent 100%)`,
            borderRadius: "1px",
          }}
        />
      )}

      {/* Pane header: badge + CWD breadcrumb */}
      <div
        className="absolute z-10"
        style={{
          top: "4px",
          left: "8px",
          right: "8px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          pointerEvents: "none",
        }}
      >
        {hasMultiplePanes && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "1px 6px",
              borderRadius: "4px",
              backgroundColor: isActive ? paneColor + "25" : "var(--bg-secondary)",
              border: `1px solid ${isActive ? paneColor + "50" : "var(--border)"}`,
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: paneColor,
                opacity: isActive ? 1 : 0.4,
              }}
            />
            <span
              style={{
                fontSize: "9px",
                fontWeight: 600,
                fontFamily: "monospace",
                color: isActive ? paneColor : "var(--text-muted)",
                letterSpacing: "0.02em",
              }}
            >
              {paneIndex + 1}
            </span>
          </div>
        )}
        {cwd && (
          <span
            style={{
              fontSize: "10px",
              fontFamily: "monospace",
              color: "var(--text-muted)",
              opacity: isActive ? 0.7 : 0.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              transition: "opacity 0.2s ease",
            }}
          >
            {formatCwd(cwd)}
          </span>
        )}
      </div>

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
          padding: "20px 4px 4px 8px",
        }}
      />
    </div>
  );
}
