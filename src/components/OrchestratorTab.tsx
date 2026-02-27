import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useOrchestratorStore, type OrchestratorTask } from "../stores/orchestratorStore";
import { useTabStore } from "../stores/tabStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { AGENT_PROFILES } from "../data/agentProfiles";
import { sendOrchestratorMessage, type ChatTurn } from "../lib/anthropic";
import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";
import mermaid from "mermaid";

interface OrchestratorTabProps {
  sessionId: string;
}

const MIN_PANEL_WIDTH = 260;
const MAX_PANEL_WIDTH = 700;
const DEFAULT_PANEL_WIDTH = 360;

export default function OrchestratorTab({ sessionId }: OrchestratorTabProps) {
  const session = useOrchestratorStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const addMessage = useOrchestratorStore((s) => s.addMessage);
  const setTasks = useOrchestratorStore((s) => s.setTasks);
  const updateTaskStatus = useOrchestratorStore((s) => s.updateTaskStatus);
  const setSessionStatus = useOrchestratorStore((s) => s.setSessionStatus);
  const getDispatchableTasks = useOrchestratorStore((s) => s.getDispatchableTasks);
  const { addTab } = useTabStore();

  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_PANEL_WIDTH);

  // Parse assistant messages as markdown
  const parsedMessages = useMemo(() => {
    const parsed: Record<string, string> = {};
    if (!session) return parsed;
    for (const msg of session.messages) {
      if (msg.role === "assistant") {
        parsed[msg.id] = marked.parse(msg.content) as string;
      }
    }
    return parsed;
  }, [session?.messages]);

  // Parse streaming text as markdown
  const streamingHtml = useMemo(() => {
    if (!streamingText) return "";
    return marked.parse(streamingText) as string;
  }, [streamingText]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, streamingText]);

  // Render mermaid diagrams after messages update
  useEffect(() => {
    const container = chatBodyRef.current;
    if (!container) return;
    const mermaidEls = container.querySelectorAll("pre.mermaid:not([data-processed])");
    if (mermaidEls.length === 0) return;
    mermaid.run({ nodes: mermaidEls as NodeListOf<HTMLElement> }).catch(() => {});
  }, [parsedMessages, streamingHtml]);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || streaming || !session) return;

    addMessage(sessionId, "user", userText);
    setStreaming(true);
    setStreamingText("");

    const history: ChatTurn[] = [
      ...session.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userText },
    ];

    await sendOrchestratorMessage(history, {
      onText: (text) => {
        setStreamingText((prev) => prev + text);
      },
      onTasksCreated: (tasks) => {
        setTasks(sessionId, tasks.map((t) => ({
          title: t.title,
          description: t.description,
          agentProfileId: t.agentProfile,
          priority: t.priority,
          dependencies: t.dependencies ?? [],
        })));
      },
      onDone: (fullText) => {
        addMessage(sessionId, "assistant", fullText);
        setStreaming(false);
        setStreamingText("");
      },
      onError: (error) => {
        addMessage(sessionId, "assistant", `Error: ${error}`);
        setStreaming(false);
        setStreamingText("");
      },
    });
  }, [streaming, session, sessionId, addMessage, setTasks]);

  // Listen for messages from the Scratchpad
  useEffect(() => {
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent).detail;
      sendMessage(text);
    };
    window.addEventListener("orchestrator-send", handler);
    return () => window.removeEventListener("orchestrator-send", handler);
  }, [sendMessage]);

  const dispatchTask = useCallback(async (task: OrchestratorTask) => {
    const profile = AGENT_PROFILES.find((p) => p.id === task.agentProfileId);
    if (!profile) return;

    // Remember the orchestrator tab so we can switch back
    const orchTabId = useTabStore.getState().activeTabId;

    addTab(`Agent: ${task.title}`);

    await new Promise((r) => setTimeout(r, 800));

    const ptyId = useTabStore.getState().getActivePtyId();
    if (ptyId === null) return;

    const activePane = useTabStore.getState().getActivePane();
    const agentTabId = useTabStore.getState().activeTabId;

    const escapedDesc = task.description.replace(/"/g, '\\"');
    const cmd = `claude "${profile.providers.claude} Your task: ${escapedDesc}"`;
    const data = Array.from(new TextEncoder().encode(cmd + "\r"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});

    if (activePane) {
      useAgentTrackerStore.getState().startSession(
        activePane.id,
        task.title,
        profile.icon,
        "claude",
      );
      updateTaskStatus(sessionId, task.id, "running", activePane.id, agentTabId);
    }

    // Switch back to orchestrator tab so dispatch can continue
    useTabStore.getState().setActiveTab(orchTabId);

    setSessionStatus(sessionId, "executing");
  }, [sessionId, addTab, updateTaskStatus, setSessionStatus]);

  const dispatchAll = useCallback(async () => {
    const tasks = getDispatchableTasks(sessionId);
    for (const task of tasks) {
      await dispatchTask(task);
    }
  }, [sessionId, getDispatchableTasks, dispatchTask]);

  // Drag-to-resize the task panel
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;

    const cleanup = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - ev.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const onUp = () => cleanup();

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", cleanup);
  }, [panelWidth]);

  // Poll agent sessions for live elapsed time
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!session?.tasks.some((t) => t.status === "running")) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [session?.tasks]);

  if (!session) return null;

  const formatElapsed = (startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const statusColor = (status: OrchestratorTask["status"]) => {
    switch (status) {
      case "pending": return "var(--text-muted)";
      case "running": return "#22c55e";
      case "completed": return "#a855f7";
      case "failed": return "#ef4444";
    }
  };

  const statusLabel = (status: OrchestratorTask["status"]) => {
    switch (status) {
      case "pending": return "PENDING";
      case "running": return "RUNNING";
      case "completed": return "DONE";
      case "failed": return "FAILED";
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", backgroundColor: "var(--bg-primary)" }}>
      {/* Left: Chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", minWidth: 0 }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span style={{ fontSize: "16px" }}>&#x1f3af;</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
            Orchestrator
          </span>
          <span style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: "3px",
            backgroundColor: session.status === "planning" ? "var(--accent-subtle)" : session.status === "executing" ? "rgba(34,197,94,0.15)" : "rgba(168,85,247,0.15)",
            color: session.status === "planning" ? "var(--accent)" : session.status === "executing" ? "#22c55e" : "#a855f7",
          }}>
            {session.status.toUpperCase()}
          </span>
        </div>

        <div ref={chatBodyRef} style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {session.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {msg.role === "user" ? (
                <div style={{
                  maxWidth: "80%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  backgroundColor: "var(--accent-subtle)",
                  color: "var(--text-primary)",
                  border: "1px solid rgba(88,166,255,0.2)",
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.content}
                </div>
              ) : (
                <div
                  className="markdown-body"
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    lineHeight: 1.6,
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                  dangerouslySetInnerHTML={{ __html: parsedMessages[msg.id] ?? msg.content }}
                />
              )}
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", padding: "0 4px" }}>
                {msg.role === "user" ? "You" : "AI"}
              </span>
            </div>
          ))}

          {streaming && streamingText && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div
                className="markdown-body"
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                dangerouslySetInnerHTML={{ __html: streamingHtml }}
              />
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {streaming && (
          <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            AI is thinking...
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          width: "5px",
          cursor: "col-resize",
          backgroundColor: "transparent",
          flexShrink: 0,
          position: "relative",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent-hover)"; }}
        onMouseLeave={(e) => { if (!draggingRef.current) e.currentTarget.style.backgroundColor = "transparent"; }}
      />

      {/* Right: Backlog */}
      <div style={{ width: panelWidth, display: "flex", flexDirection: "column", backgroundColor: "var(--bg-secondary)", flexShrink: 0 }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
            Tasks ({session.tasks.length})
          </span>
          {session.tasks.length > 0 && session.tasks.some((t) => t.status === "pending") && (
            <button
              onClick={dispatchAll}
              style={{
                padding: "4px 12px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#22c55e",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Dispatch All
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {session.tasks.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 16px", fontSize: "12px" }}>
              Tasks will appear here once the AI breaks down your plan.
            </div>
          )}

          {session.tasks.map((task) => {
            const profile = AGENT_PROFILES.find((p) => p.id === task.agentProfileId);
            const isExpanded = expandedTaskId === task.id;
            return (
              <div
                key={task.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${isExpanded ? "var(--accent)" : task.status === "running" ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                  backgroundColor: isExpanded ? "var(--accent-subtle)" : task.status === "running" ? "rgba(34,197,94,0.05)" : "var(--bg-tertiary)",
                  marginBottom: "6px",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
                onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px" }}>{profile?.icon ?? "?"}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                    {task.title}
                  </span>
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: "3px",
                    backgroundColor: statusColor(task.status) + "20",
                    color: statusColor(task.status),
                  }}>
                    {statusLabel(task.status)}
                  </span>
                </div>

                {!isExpanded && (
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4, margin: 0 }}>
                    {task.description.slice(0, 100)}{task.description.length > 100 ? "..." : ""}
                  </p>
                )}

                {isExpanded && (
                  <div style={{ marginTop: "8px" }}>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 10px 0", whiteSpace: "pre-wrap" }}>
                      {task.description}
                    </p>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "10px", fontFamily: "monospace" }}>
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: "3px",
                        backgroundColor: "var(--bg-primary)",
                        color: "var(--text-secondary)",
                      }}>
                        Agent: {profile?.name ?? task.agentProfileId}
                      </span>
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: "3px",
                        backgroundColor: "var(--bg-primary)",
                        color: "var(--text-secondary)",
                      }}>
                        Priority: {task.priority}
                      </span>
                      {task.dependencies.length > 0 && (
                        <span style={{
                          padding: "2px 6px",
                          borderRadius: "3px",
                          backgroundColor: "var(--bg-primary)",
                          color: "var(--text-secondary)",
                        }}>
                          Depends: {task.dependencies.join(", ")}
                        </span>
                      )}
                    </div>

                    {/* Agent status for running tasks */}
                    {task.status === "running" && task.paneId && (() => {
                      const agentSession = useAgentTrackerStore.getState().getActiveSession(task.paneId);
                      return agentSession ? (
                        <div style={{
                          marginTop: "8px",
                          padding: "6px 10px",
                          borderRadius: "5px",
                          backgroundColor: "rgba(34,197,94,0.08)",
                          border: "1px solid rgba(34,197,94,0.2)",
                          fontSize: "11px",
                          fontFamily: "monospace",
                          color: "#22c55e",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}>
                          <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#22c55e", animation: "blink 1.5s infinite" }} />
                          Running for {formatElapsed(agentSession.startTime)}
                        </div>
                      ) : null;
                    })()}

                    {/* Completed / failed status */}
                    {(task.status === "completed" || task.status === "failed") && (
                      <div style={{
                        marginTop: "8px",
                        padding: "6px 10px",
                        borderRadius: "5px",
                        backgroundColor: task.status === "completed" ? "rgba(168,85,247,0.08)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${task.status === "completed" ? "rgba(168,85,247,0.2)" : "rgba(239,68,68,0.2)"}`,
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: task.status === "completed" ? "#a855f7" : "#ef4444",
                      }}>
                        {task.status === "completed" ? "Task completed" : "Task failed"}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                      {task.status === "pending" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatchTask(task);
                          }}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "5px",
                            border: "none",
                            backgroundColor: "#22c55e",
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Dispatch
                        </button>
                      )}
                      {task.tabId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useTabStore.getState().setActiveTab(task.tabId!);
                          }}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "5px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg-primary)",
                            color: "var(--text-secondary)",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Go to Tab
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {session.tasks.length > 0 && (
          <div style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
            display: "flex",
            gap: "12px",
          }}>
            <span>{session.tasks.filter((t) => t.status === "completed").length}/{session.tasks.length} done</span>
            <span>{session.tasks.filter((t) => t.status === "running").length} running</span>
            <span>{session.tasks.filter((t) => t.status === "pending").length} pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
