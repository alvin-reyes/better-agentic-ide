import { useState, useRef, useEffect, useCallback } from "react";
import { useOrchestratorStore, type OrchestratorTask } from "../stores/orchestratorStore";
import { useTabStore } from "../stores/tabStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { AGENT_PROFILES } from "../data/agentProfiles";
import { sendOrchestratorMessage, type ChatTurn } from "../lib/anthropic";
import { invoke } from "@tauri-apps/api/core";

interface OrchestratorTabProps {
  sessionId: string;
}

export default function OrchestratorTab({ sessionId }: OrchestratorTabProps) {
  const session = useOrchestratorStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const addMessage = useOrchestratorStore((s) => s.addMessage);
  const setTasks = useOrchestratorStore((s) => s.setTasks);
  const updateTaskStatus = useOrchestratorStore((s) => s.updateTaskStatus);
  const setSessionStatus = useOrchestratorStore((s) => s.setSessionStatus);
  const getDispatchableTasks = useOrchestratorStore((s) => s.getDispatchableTasks);
  const { addTab } = useTabStore();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, streamingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming || !session) return;

    const userText = input.trim();
    setInput("");
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
  }, [input, streaming, session, sessionId, addMessage, setTasks]);

  const dispatchTask = useCallback(async (task: OrchestratorTask) => {
    const profile = AGENT_PROFILES.find((p) => p.id === task.agentProfileId);
    if (!profile) return;

    addTab(`Agent: ${task.title}`);

    await new Promise((r) => setTimeout(r, 800));

    const ptyId = useTabStore.getState().getActivePtyId();
    if (ptyId === null) return;

    const activePane = useTabStore.getState().getActivePane();
    const tabId = useTabStore.getState().activeTabId;

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
      updateTaskStatus(sessionId, task.id, "running", activePane.id, tabId);
    }

    setSessionStatus(sessionId, "executing");
  }, [sessionId, addTab, updateTaskStatus, setSessionStatus]);

  const dispatchAll = useCallback(async () => {
    const tasks = getDispatchableTasks(sessionId);
    for (const task of tasks) {
      await dispatchTask(task);
    }
  }, [sessionId, getDispatchableTasks, dispatchTask]);

  if (!session) return null;

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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)" }}>
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

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {session.messages.length === 0 && !streaming && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 20px" }}>
              <p style={{ fontSize: "24px", marginBottom: "12px", opacity: 0.3 }}>&#x1f3af;</p>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                What do you want to build?
              </p>
              <p style={{ fontSize: "13px" }}>
                Describe your project and I'll help you plan it, then dispatch AI agents to build it.
              </p>
            </div>
          )}

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
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: 1.6,
                backgroundColor: msg.role === "user" ? "var(--accent-subtle)" : "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: `1px solid ${msg.role === "user" ? "rgba(88,166,255,0.2)" : "var(--border)"}`,
                whiteSpace: "pre-wrap",
              }}>
                {msg.content}
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", padding: "0 4px" }}>
                {msg.role === "user" ? "You" : "AI"}
              </span>
            </div>
          ))}

          {streaming && streamingText && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: 1.6,
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                whiteSpace: "pre-wrap",
              }}>
                {streamingText}
                <span style={{ display: "inline-block", width: "2px", height: "14px", background: "var(--accent)", animation: "blink 1s infinite", verticalAlign: "text-bottom", marginLeft: "2px" }} />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Describe what you want to build..."
              rows={2}
              style={{
                flex: 1,
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "var(--text-primary)",
                resize: "none",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              style={{
                padding: "0 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: input.trim() && !streaming ? "var(--accent)" : "var(--bg-surface)",
                color: input.trim() && !streaming ? "#fff" : "var(--text-muted)",
                cursor: input.trim() && !streaming ? "pointer" : "default",
                fontSize: "13px",
                fontWeight: 600,
                alignSelf: "flex-end",
                height: "36px",
              }}
            >
              {streaming ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Backlog */}
      <div style={{ width: "340px", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-secondary)" }}>
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
            return (
              <div
                key={task.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${task.status === "running" ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                  backgroundColor: task.status === "running" ? "rgba(34,197,94,0.05)" : "var(--bg-tertiary)",
                  marginBottom: "6px",
                  cursor: task.status === "pending" ? "pointer" : "default",
                }}
                onClick={() => {
                  if (task.status === "pending") dispatchTask(task);
                  if (task.tabId) useTabStore.getState().setActiveTab(task.tabId);
                }}
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
                <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4, margin: 0 }}>
                  {task.description.slice(0, 120)}{task.description.length > 120 ? "..." : ""}
                </p>
                {task.dependencies.length > 0 && (
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", fontFamily: "monospace" }}>
                    depends on: {task.dependencies.join(", ")}
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
