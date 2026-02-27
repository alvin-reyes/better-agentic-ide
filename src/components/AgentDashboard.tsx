import { useState, useEffect } from "react";
import { useAgentTrackerStore, estimateCost, type AgentSession } from "../stores/agentTrackerStore";
import { isPaneActive } from "../hooks/useTerminal";
import { useTabStore, findAllPanes } from "../stores/tabStore";

interface AgentDashboardProps {
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatCost(cents: number): string {
  if (cents < 1) return "<$0.01";
  if (cents < 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function AgentDashboard({ onClose }: AgentDashboardProps) {
  const sessions = useAgentTrackerStore((s) => s.sessions);
  const totalSpent = useAgentTrackerStore((s) => s.totalSpent);
  const clearHistory = useAgentTrackerStore((s) => s.clearHistory);
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const [now, setNow] = useState(Date.now());
  const [showHistory, setShowHistory] = useState(false);

  // Tick every second for live duration updates
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeSessions = sessions.filter((s) => s.status === "running");
  const completedSessions = sessions.filter((s) => s.status !== "running").slice(-30).reverse();

  // Get all panes across all tabs for status overview
  const allPanes = tabs.flatMap((t) => {
    const panes = findAllPanes(t.root);
    return panes.map((p) => ({ ...p, tabId: t.id, tabName: t.name }));
  });

  // Today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((s) => s.startTime >= today.getTime());
  const todayCost = todaySessions.reduce((sum, s) => sum + estimateCost(s), 0);
  const todayDuration = todaySessions.reduce((sum, s) => {
    const end = s.endTime ?? now;
    return sum + (end - s.startTime);
  }, 0);

  const navigateToPane = (session: AgentSession) => {
    // Find which tab contains this pane
    for (const tab of tabs) {
      const panes = findAllPanes(tab.root);
      if (panes.some((p) => p.id === session.paneId)) {
        setActiveTab(tab.id);
        useTabStore.getState().setActivePaneInTab(tab.id, session.paneId);
        onClose();
        return;
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "640px",
          maxHeight: "80vh",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1" stroke="var(--accent)" strokeWidth="1.3"/>
            <rect x="9" y="1" width="6" height="6" rx="1" stroke="var(--accent)" strokeWidth="1.3"/>
            <rect x="1" y="9" width="6" height="6" rx="1" stroke="var(--accent)" strokeWidth="1.3"/>
            <rect x="9" y="9" width="6" height="6" rx="1" stroke="var(--accent)" strokeWidth="1.3"/>
          </svg>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
            Agent Dashboard
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "var(--radius-sm)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Stats cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: "10px",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <StatCard
            label="Active"
            value={`${activeSessions.length}`}
            color="#22c55e"
          />
          <StatCard
            label="Today"
            value={`${todaySessions.length}`}
            color="var(--accent)"
          />
          <StatCard
            label="Time"
            value={formatDuration(todayDuration)}
            color="#a855f7"
          />
          <StatCard
            label="Est. Cost"
            value={formatCost(todayCost)}
            color="#eab308"
          />
        </div>

        {/* Tab toggle */}
        <div style={{
          display: "flex",
          gap: "4px",
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <TabButton
            active={!showHistory}
            onClick={() => setShowHistory(false)}
            label={`Active (${activeSessions.length})`}
          />
          <TabButton
            active={showHistory}
            onClick={() => setShowHistory(true)}
            label={`History (${completedSessions.length})`}
          />
          <div style={{ flex: 1 }} />
          {showHistory && completedSessions.length > 0 && (
            <button
              onClick={clearHistory}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "11px",
                padding: "4px 8px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Clear
            </button>
          )}
          <span style={{
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
            alignSelf: "center",
          }}>
            Total: {formatCost(totalSpent)} | {formatTokens(
              sessions.reduce((sum, s) => sum + s.estimatedInputTokens + s.estimatedOutputTokens, 0)
            )} tokens
          </span>
        </div>

        {/* Session list */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
        }}>
          {!showHistory && activeSessions.length === 0 && (
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "13px",
            }}>
              <p style={{ fontSize: "24px", marginBottom: "8px", opacity: 0.3 }}>~</p>
              <p>No active agents</p>
              <p style={{ fontSize: "11px", marginTop: "4px" }}>
                Launch an agent with <kbd style={{ fontFamily: "monospace", color: "var(--accent)" }}>Cmd+Shift+A</kbd>
              </p>
            </div>
          )}

          {!showHistory && activeSessions.map((session) => {
            const isActive = isPaneActive(session.paneId);
            const duration = now - session.startTime;
            const cost = estimateCost(session);

            return (
              <SessionRow
                key={`${session.paneId}-${session.startTime}`}
                session={session}
                duration={duration}
                cost={cost}
                isTerminalActive={isActive}
                onClick={() => navigateToPane(session)}
              />
            );
          })}

          {showHistory && completedSessions.length === 0 && (
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "13px",
            }}>
              No session history yet
            </div>
          )}

          {showHistory && completedSessions.map((session, i) => {
            const duration = (session.endTime ?? now) - session.startTime;
            const cost = estimateCost(session);

            return (
              <SessionRow
                key={`${session.paneId}-${session.startTime}-${i}`}
                session={session}
                duration={duration}
                cost={cost}
                isTerminalActive={false}
                onClick={() => navigateToPane(session)}
              />
            );
          })}
        </div>

        {/* Pane overview */}
        <div style={{
          padding: "8px 20px 12px",
          borderTop: "1px solid var(--border)",
          fontSize: "10px",
          color: "var(--text-muted)",
          fontFamily: "monospace",
        }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {allPanes.map((p) => {
              const session = activeSessions.find((s) => s.paneId === p.id);
              const active = isPaneActive(p.id);
              return (
                <span
                  key={p.id}
                  style={{
                    padding: "2px 6px",
                    borderRadius: "3px",
                    backgroundColor: session ? "rgba(34,197,94,0.15)" : active ? "rgba(59,130,246,0.1)" : "var(--bg-tertiary)",
                    color: session ? "#22c55e" : active ? "#3b82f6" : "var(--text-muted)",
                    border: `1px solid ${session ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                  }}
                  title={`${p.tabName} / ${p.id}${session ? ` - ${session.agentName}` : ""}`}
                >
                  {session ? `${session.agentIcon} ${session.agentName}` : p.tabName}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: "var(--radius)",
      backgroundColor: "var(--bg-tertiary)",
      border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: "18px", fontWeight: 700, color, fontFamily: "monospace" }}>
        {value}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: "var(--radius-sm)",
        fontSize: "12px",
        fontWeight: active ? 600 : 400,
        border: "none",
        cursor: "pointer",
        backgroundColor: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {label}
    </button>
  );
}

function SessionRow({
  session,
  duration,
  cost,
  isTerminalActive,
  onClick,
}: {
  session: AgentSession;
  duration: number;
  cost: number;
  isTerminalActive: boolean;
  onClick: () => void;
}) {
  const isRunning = session.status === "running";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        marginBottom: "4px",
        border: `1px solid ${isRunning ? "rgba(34,197,94,0.2)" : "var(--border)"}`,
        backgroundColor: isRunning ? "rgba(34,197,94,0.05)" : "var(--bg-tertiary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isRunning ? "rgba(34,197,94,0.1)" : "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isRunning ? "rgba(34,197,94,0.05)" : "var(--bg-tertiary)";
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: "20px", width: "28px", textAlign: "center" }}>
        {session.agentIcon}
      </span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "2px",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            {session.agentName}
          </span>
          {isRunning && (
            <span style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: "3px",
              backgroundColor: isTerminalActive ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)",
              color: isTerminalActive ? "#22c55e" : "#3b82f6",
              animation: isTerminalActive ? "activity-pulse 1.5s ease-in-out infinite" : "none",
            }}>
              {isTerminalActive ? "WORKING" : "IDLE"}
            </span>
          )}
          {session.status === "completed" && (
            <span style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: "3px",
              backgroundColor: "rgba(168,85,247,0.15)",
              color: "#a855f7",
            }}>
              DONE
            </span>
          )}
          {session.status === "cancelled" && (
            <span style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: "3px",
              backgroundColor: "rgba(239,68,68,0.15)",
              color: "#ef4444",
            }}>
              CANCELLED
            </span>
          )}
        </div>
        <div style={{
          display: "flex",
          gap: "12px",
          fontSize: "11px",
          color: "var(--text-muted)",
          fontFamily: "monospace",
        }}>
          <span>{session.provider}</span>
          <span>{formatDuration(duration)}</span>
          <span>{formatTokens(session.estimatedInputTokens + session.estimatedOutputTokens)} tokens</span>
          <span>{formatCost(cost)}</span>
        </div>
      </div>

      {/* Navigate arrow */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
