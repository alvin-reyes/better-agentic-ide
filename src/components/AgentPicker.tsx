import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AGENT_PROFILES, AGENT_CATEGORIES, type AgentProfile } from "../data/agentProfiles";
import { useTabStore } from "../stores/tabStore";

interface AgentPickerProps {
  onClose: () => void;
}

export default function AgentPicker({ onClose }: AgentPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const getActivePtyId = useTabStore((s) => s.getActivePtyId);

  const filtered = useMemo(() => {
    let profiles = AGENT_PROFILES;
    if (activeCategory) {
      profiles = profiles.filter((p) => p.category === activeCategory);
    }
    if (query) {
      const q = query.toLowerCase();
      profiles = profiles.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }
    return profiles;
  }, [query, activeCategory]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[selectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const launchAgent = useCallback(async (profile: AgentProfile) => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;

    // Build the command — append continuous flag if enabled
    let cmd = profile.command;
    if (continuousMode) {
      cmd = cmd.replace(/^claude /, "claude --dangerously-skip-permissions ");
    }

    const data = Array.from(new TextEncoder().encode(cmd + "\r"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});

    onClose();
  }, [getActivePtyId, onClose, continuousMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      launchAgent(filtered[selectedIndex]);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        paddingTop: "60px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "580px",
          maxHeight: "540px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "12px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3" fill="var(--accent)" opacity="0.8" />
                <circle cx="8" cy="8" r="6" stroke="var(--accent)" strokeWidth="1.5" fill="none" opacity="0.4" />
                <circle cx="8" cy="8" r="1" fill="var(--accent)" />
              </svg>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Launch AI Agent
              </span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
              esc close
            </span>
          </div>

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents..."
            style={{
              width: "100%",
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: '"JetBrains Mono", monospace',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />

          {/* Category pills */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveCategory(null)}
              style={{
                padding: "3px 10px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 600,
                border: "1px solid " + (!activeCategory ? "var(--accent)" : "var(--border)"),
                backgroundColor: !activeCategory ? "var(--accent-subtle)" : "transparent",
                color: !activeCategory ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              All
            </button>
            {AGENT_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              const catColor =
                cat === "Backend" ? "#3fb950" :
                cat === "Frontend" ? "#58a6ff" :
                cat === "DevOps" ? "#bc8cff" :
                cat === "Testing" ? "#d29922" : "#ff7b72";
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(isActive ? null : cat)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    border: `1px solid ${isActive ? catColor : "var(--border)"}`,
                    backgroundColor: isActive ? catColor + "20" : "transparent",
                    color: isActive ? catColor : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Continuous mode toggle */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => {
                if (!continuousMode) {
                  setShowDisclaimer(true);
                } else {
                  setContinuousMode(false);
                }
              }}
              style={{
                width: "32px",
                height: "18px",
                borderRadius: "9px",
                border: "none",
                backgroundColor: continuousMode ? "var(--accent)" : "var(--bg-tertiary)",
                cursor: "pointer",
                position: "relative",
                transition: "background-color 0.2s",
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  backgroundColor: "#fff",
                  position: "absolute",
                  top: "2px",
                  left: continuousMode ? "16px" : "2px",
                  transition: "left 0.2s",
                }}
              />
            </button>
            <span style={{ fontSize: "12px", color: continuousMode ? "var(--accent)" : "var(--text-secondary)", fontWeight: 500 }}>
              Continuous Mode
            </span>
            {continuousMode && (
              <span
                style={{
                  fontSize: "9px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  backgroundColor: "#ff7b7220",
                  color: "#ff7b72",
                  fontWeight: 600,
                }}
              >
                AUTONOMOUS
              </span>
            )}
          </div>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "200px", textAlign: "right" }}>
            {continuousMode ? "Agent runs without prompts" : "Agent waits for your input"}
          </span>
        </div>

        {/* Disclaimer modal */}
        {showDisclaimer && (
          <div
            style={{
              padding: "16px",
              margin: "8px 16px",
              borderRadius: "8px",
              backgroundColor: "#ff7b7210",
              border: "1px solid #ff7b7240",
            }}
          >
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#ff7b72", marginBottom: "8px" }}>
              Continuous Mode Warning
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.6", marginBottom: "12px" }}>
              In continuous mode, the AI agent will execute commands and make changes{" "}
              <strong>without asking for confirmation</strong>. This uses{" "}
              <code style={{ fontSize: "10px", backgroundColor: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: "3px" }}>
                --dangerously-skip-permissions
              </code>{" "}
              which bypasses all safety prompts. Only use this in sandboxed or disposable environments.
              You are responsible for any changes the agent makes.
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDisclaimer(false)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setContinuousMode(true);
                  setShowDisclaimer(false);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: "1px solid #ff7b72",
                  backgroundColor: "#ff7b7220",
                  color: "#ff7b72",
                  cursor: "pointer",
                }}
              >
                I understand, enable
              </button>
            </div>
          </div>
        )}

        {/* Agent list */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              No matching agents
            </div>
          ) : (
            filtered.map((profile, i) => (
              <div
                key={profile.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 16px",
                  cursor: "pointer",
                  backgroundColor:
                    i === selectedIndex ? "var(--accent-subtle)" : "transparent",
                  borderLeft:
                    i === selectedIndex
                      ? `2px solid ${profile.color}`
                      : "2px solid transparent",
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => launchAgent(profile)}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    backgroundColor: profile.color + "20",
                    border: `1px solid ${profile.color}40`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: profile.color,
                    flexShrink: 0,
                  }}
                >
                  {profile.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color:
                          i === selectedIndex
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {profile.name}
                    </span>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        color: profile.color,
                        backgroundColor: profile.color + "20",
                        padding: "1px 5px",
                        borderRadius: "3px",
                      }}
                    >
                      {profile.category}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "block",
                    }}
                  >
                    {profile.description}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", gap: "16px" }}>
            <span>↑↓ navigate</span>
            <span>↵ launch</span>
            <span>esc close</span>
          </div>
          <span>
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
