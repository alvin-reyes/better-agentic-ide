import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { claimKeyboard } from "../lib/keyboardOwner";
import { invoke } from "@tauri-apps/api/core";
import { routeTask, isTaskDescription } from "../data/taskRouter";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { runInNewTabPane, writePty } from "../lib/terminalCommands";
import { hasActiveProcess } from "../hooks/useTerminal";
import { usePaneCwd } from "../stores/paneMetaStore";
import { getRole } from "../data/roles";
import { getDomain } from "../data/domains";
import { composeRoleMarkdown, toModelfile } from "../lib/agentComposition";
import { buildLaunchCommand, supportsRoleDelivery, type Provider } from "../lib/agentCommand";
import { ensureRoleDir, rolePathFor, type AgentSpec } from "../lib/agentSpec";
import { methodologyOf } from "../lib/projectSetup";
import { AGENT_CATEGORIES } from "../data/curatedAgents";
import {
  CURATED_ITEMS,
  PICKER_ITEMS,
  ROLE_ITEMS,
  ROLES_FILTER,
  type PickerItem,
} from "../data/pickerItems";
import { PROVIDERS, binaryFor } from "../data/providers";

const CATEGORY_COLORS: Record<string, string> = {
  Backend: "#3fb950",
  Frontend: "#58a6ff",
  DevOps: "#bc8cff",
  Testing: "#d29922",
  Web3: "#f0883e",
  Architects: "#a371f7",
  // The bare-roles pill is deliberately neutral, not a category colour.
  [ROLES_FILTER]: "#8b949e",
};

const categoryPillStyle = (active: boolean, color: string, activeBg = color + "20"): React.CSSProperties => ({
  padding: "3px 8px",
  borderRadius: "12px",
  fontSize: "10px",
  fontWeight: 600,
  border: `1px solid ${active ? color : "var(--border)"}`,
  backgroundColor: active ? activeBg : "transparent",
  color: active ? color : "var(--text-muted)",
  cursor: "pointer",
});

const categoryBadgeStyle = (color: string): React.CSSProperties => ({
  fontSize: "9px",
  fontWeight: 700,
  fontFamily: "monospace",
  color,
  backgroundColor: color + "20",
  padding: "1px 5px",
  borderRadius: "3px",
});

interface AgentPickerProps {
  onClose: () => void;
}

export default function AgentPicker({ onClose }: AgentPickerProps) {
  const [query, setQuery] = useState("");
  // Hold the keyboard while this panel is open, so a click on a
  // non-focusable part of it does not send typing to the terminal behind.
  useEffect(() => claimKeyboard("agent-picker"), []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [installedProviders, setInstalledProviders] = useState<Set<Provider>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const getActivePtyId = useTabStore((s) => s.getActivePtyId);
  const getActivePane = useTabStore((s) => s.getActivePane);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const [activeProvider, setActiveProvider] = useState<Provider>(defaultProvider);

  // Detect installed CLI providers on mount
  useEffect(() => {
    const detect = async () => {
      const installed = new Set<Provider>();
      for (const p of PROVIDERS) {
        try {
          await invoke<string>("check_command_exists", { command: binaryFor(p.id) });
          installed.add(p.id);
        } catch {
          // not installed
        }
      }
      setInstalledProviders(installed);
      if (!installed.has(defaultProvider) && installed.size > 0) {
        setActiveProvider([...installed][0]);
      }
    };
    detect();
  }, [defaultProvider]);

  // A query that reads like a task description gets a suggested agent.
  const suggestedAgent = useMemo(
    () => (isTaskDescription(query) ? routeTask(query)?.agent ?? null : null),
    [query],
  );

  // Filter the list. Curated pairs and bare roles are searched together, so
  // "architect" reaches both the Auth Architect pair and the Architect role.
  const filtered = useMemo(() => {
    let items: PickerItem[];
    if (activeCategory === ROLES_FILTER) items = ROLE_ITEMS;
    else if (activeCategory) items = CURATED_ITEMS.filter((p) => p.badge === activeCategory);
    else items = PICKER_ITEMS;

    if (query) {
      // A suggestion goes first, followed by every agent (in the active category) instead of a text match.
      if (suggestedAgent) {
        // Put the suggestion first, then the rest of the active category.
        const suggestedItem = CURATED_ITEMS.find((p) => p.id === suggestedAgent.id);
        const rest = items.filter((p) => p.id !== suggestedAgent.id);
        return suggestedItem ? [suggestedItem, ...rest] : rest;
      }
      const q = query.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.badge.toLowerCase().includes(q),
      );
    }
    return items;
  }, [query, activeCategory, suggestedAgent]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[suggestedAgent && filtered[0]?.id === suggestedAgent.id ? 1 : selectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, suggestedAgent, filtered]);

  /**
   * Compose a spec's role markdown, write it, and build the provider command
   * that reads it. Shared by the curated pairs and the bare roles — a bare
   * role is just a spec with no domain. Returns null after reporting why.
   */
  const buildCommand = useCallback(async (spec: AgentSpec, cwd?: string) => {
    // Clear first: an error from a previous attempt (a failed Codex launch,
    // say) must not outlive the attempt that replaces it.
    setLaunchError(null);

    const role = getRole(spec.roleId);
    if (!role) return null;
    const domain = spec.domainId ? getDomain(spec.domainId) : undefined;

    // Resolve ~/.ade/roles to an absolute path before it reaches a shell.
    let roleDir: string;
    try {
      roleDir = await ensureRoleDir();
    } catch (err) {
      setLaunchError(`Could not create the role directory: ${err}`);
      return null;
    }
    // Only the BMAD tasks for the methodology of the project the agent starts
    // in (v6 when it is on neither or unknown), and a role file keyed by it so
    // a launch in a project on the other methodology never shares it.
    const methodology = await methodologyOf(cwd);
    const rolePath = rolePathFor(spec, roleDir, methodology);

    // Build the command before writing anything. A provider without a verified
    // role-delivery mechanism can never launch, so writing its role file first
    // would leave a file on disk that nothing will ever read.
    const settings = useSettingsStore.getState();
    const result = buildLaunchCommand(spec.provider, rolePath, {
      continuous: continuousMode,
      ollamaModel: settings.ollamaModel,
      roleId: spec.roleId,
      domainId: spec.domainId,
    });
    if (result.kind === "unsupported") {
      setLaunchError(result.reason);
      return null;
    }

    try {
      // Ollama takes a system prompt only through a Modelfile, so the file we
      // write is one; every other provider reads the role markdown directly.
      const roleText = composeRoleMarkdown(role, domain, methodology);
      const content = spec.provider === "ollama"
        ? toModelfile(roleText, settings.ollamaModel || "deepseek-r1")
        : roleText;
      await invoke("write_text_file", { path: rolePath, content });
    } catch (err) {
      setLaunchError(`Could not write the role file: ${err}`);
      return null;
    }

    return { command: result.command };
  }, [continuousMode]);

  // Picking an agent asks where to run it: this terminal or a new tab.
  const [choice, setChoice] = useState<PickerItem | null>(null);
  const [target, setTarget] = useState<"current" | "new">("current");
  const currentPtyId = getActivePtyId();

  /**
   * Whether "This terminal" is a real option. A pane already running something
   * cannot take an agent: the launch command would be typed into that process's
   * stdin and discarded, while the tracker still recorded a session, so the
   * fleet showed an agent that was never started.
   */
  const canUseCurrent = useCallback(() => {
    if (currentPtyId === null) return false;
    const pane = getActivePane();
    return !(pane && hasActiveProcess(pane.id));
  }, [currentPtyId, getActivePane]);

  const launchItem = useCallback((item: PickerItem) => {
    // A terminal already running something can't take a new agent.
    setTarget(canUseCurrent() ? "current" : "new");
    setChoice(item);
  }, [canUseCurrent]);

  const runAgent = useCallback(async (item: PickerItem, where: "current" | "new") => {
    const spec: AgentSpec = { roleId: item.roleId, domainId: item.domainId, provider: activeProvider };

    // Built before the tab is created: a role file that cannot be written, or
    // a provider that cannot take one, should not leave an empty tab behind.
    // Either way the agent starts in the active pane's folder: "This terminal"
    // runs there, and a new tab inherits it.
    const from = getActivePane();
    const cwd = from ? usePaneCwd.getState().cwds[from.id] ?? from.initialCwd ?? undefined : undefined;
    const built = await buildCommand(spec, cwd);
    if (!built) return;
    const cmd = built.command;

    const ptyId = getActivePtyId();
    let paneId: string | null = null;
    if (where === "new" || ptyId === null) {
      onClose();
      // Runs in the new tab's own shell, even if you switch tabs meanwhile.
      paneId = await runInNewTabPane(item.name, cwd, cmd);
      if (!paneId) return;
    } else {
      await writePty(ptyId, cmd + "\r").catch(() => {});
      paneId = getActivePane()?.id ?? null;
    }

    if (paneId) {
      useAgentTrackerStore.getState().startSession(
        paneId,
        item.name,
        item.icon,
        spec.provider,
        spec.roleId,
      );
    }

    // The last provider used becomes the default.
    if (activeProvider !== defaultProvider) {
      setDefaultProvider(activeProvider);
    }

    onClose();
  }, [buildCommand, getActivePtyId, getActivePane, onClose, activeProvider, defaultProvider, setDefaultProvider]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (choice) {
      e.preventDefault();
      const k = e.key.toLowerCase();
      if (e.key === "Escape") setChoice(null);
      else if (["arrowleft", "arrowright", "arrowup", "arrowdown", "tab"].includes(k)) {
        if (canUseCurrent()) setTarget((t) => (t === "current" ? "new" : "current"));
      } else if (e.key === "Enter") runAgent(choice, target);
      else if (k === "c" && canUseCurrent()) runAgent(choice, "current");
      else if (k === "n") runAgent(choice, "new");
      return;
    }
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
      launchItem(filtered[selectedIndex]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const providerIds = PROVIDERS.map((p) => p.id);
      const idx = providerIds.indexOf(activeProvider);
      setActiveProvider(providerIds[(idx + 1) % providerIds.length]);
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
          maxHeight: "580px",
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
            placeholder="Search agents or describe a task..."
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

          {/* Provider selector + Category pills */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            {/* Provider buttons */}
            <div style={{ display: "flex", gap: "4px" }}>
              {PROVIDERS.map((p) => {
                const isActive = activeProvider === p.id;
                const isInstalled = installedProviders.has(p.id);
                // A provider with no verified role-delivery mechanism can never
                // launch an agent, whether or not its CLI is installed. Say so
                // in the row rather than letting the user find out at launch.
                const canDeliverRole = supportsRoleDelivery(p.id);
                const title = !canDeliverRole
                  ? `${p.name} (unavailable \u2014 no verified way to pass a role definition)`
                  : isInstalled ? p.name : `${p.name} (not installed)`;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActiveProvider(p.id)}
                    title={title}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      border: `1px solid ${isActive ? p.color : "var(--border)"}`,
                      backgroundColor: isActive ? p.color + "20" : "transparent",
                      color: isActive ? p.color : "var(--text-muted)",
                      cursor: "pointer",
                      opacity: canDeliverRole && isInstalled ? 1 : 0.4,
                      textDecoration: canDeliverRole ? "none" : "line-through",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {isActive && <span style={{ fontSize: "8px" }}>{"\u25CF"}</span>}
                    {p.name}
                    {!canDeliverRole && (
                      <span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.04em" }}>
                        UNAVAILABLE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Category pills: wrap, so every category stays reachable */}
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                onClick={() => setActiveCategory(null)}
                style={categoryPillStyle(!activeCategory, "var(--accent)", "var(--accent-subtle)")}
              >
                All
              </button>
              {[...AGENT_CATEGORIES, ROLES_FILTER].map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(isActive ? null : cat)}
                    style={categoryPillStyle(isActive, CATEGORY_COLORS[cat] ?? "#ff7b72")}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {launchError && (
          <div role="alert" style={{ padding: "6px 12px", fontSize: "11px", color: "var(--red)" }}>
            {launchError}
          </div>
        )}

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
              role="switch"
              aria-checked={continuousMode}
              aria-label="Continuous mode"
              onClick={() => (continuousMode ? setContinuousMode(false) : setShowDisclaimer(true))}
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

        {/* Suggested agent banner */}
        {suggestedAgent && (
          <div
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--accent-subtle)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600 }}>
              {"\u26A1"} Suggested:
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>
              {suggestedAgent.name}
            </span>
            <span style={categoryBadgeStyle(suggestedAgent.color)}>
              {suggestedAgent.category}
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
              press {"\u21B5"} to launch
            </span>
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
            filtered.map((profile, i) => {
              const isSuggested = suggestedAgent?.id === profile.id;
              const role = getRole(profile.roleId);
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={profile.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 16px",
                    cursor: "pointer",
                    backgroundColor:
                      isSelected ? "var(--accent-subtle)" : "transparent",
                    borderLeft:
                      isSelected
                        ? `2px solid ${profile.color}`
                        : "2px solid transparent",
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => launchItem(profile)}
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
                          color: isSelected
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {profile.name}
                      </span>
                      <span style={categoryBadgeStyle(profile.color)}>
                        {profile.badge}
                      </span>
                      {role && profile.group === "agent" && (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 600,
                            fontFamily: "monospace",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border)",
                            padding: "1px 5px",
                            borderRadius: "3px",
                          }}
                        >
                          {role.title}
                        </span>
                      )}
                      {isSuggested && (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            color: "var(--accent)",
                            backgroundColor: "var(--accent-subtle)",
                            padding: "1px 5px",
                            borderRadius: "3px",
                          }}
                        >
                          MATCH
                        </span>
                      )}
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
                    {isSelected && role && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          marginTop: "4px",
                        }}
                      >
                        {role.owns.length > 0 ? (
                          <>
                            Declares ownership of{" "}
                            {role.owns.map((glob, idx) => (
                              <span key={glob}>
                                {idx > 0 && ", "}
                                <code
                                  style={{
                                    fontFamily: "monospace",
                                    backgroundColor: "var(--bg-tertiary)",
                                    padding: "1px 4px",
                                    borderRadius: "3px",
                                  }}
                                >
                                  {glob}
                                </code>
                              </span>
                            ))}
                          </>
                        ) : (
                          "No file ownership declared — advisory role."
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {choice && (
          <div className="agent-where" role="group" aria-label={`Where to run ${choice.name}`}>
            <span className="agent-where__title">
              Run <b style={{ color: choice.color }}>{choice.name}</b> in
            </span>
            <button
              className="agent-where__opt"
              aria-pressed={target === "current"}
              disabled={!canUseCurrent()}
              onMouseEnter={() => setTarget("current")}
              onClick={() => runAgent(choice, "current")}
            >
              This terminal <kbd>C</kbd>
            </button>
            <button
              className="agent-where__opt"
              aria-pressed={target === "new"}
              onMouseEnter={() => setTarget("new")}
              onClick={() => runAgent(choice, "new")}
            >
              New tab <kbd>N</kbd>
            </button>
            <button className="agent-where__back" onClick={() => { setChoice(null); inputRef.current?.focus(); }}>Back (Esc)</button>
          </div>
        )}

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
            <span>{"\u2191\u2193"} navigate</span>
            <span>{"\u21B5"} launch</span>
            <span>tab provider</span>
            <span>esc close</span>
          </div>
          <span>
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""} {"\u00B7"} {PROVIDERS.find((p) => p.id === activeProvider)?.name}
          </span>
        </div>
      </div>
    </div>
  );
}
