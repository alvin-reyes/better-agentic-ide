import { useEffect } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useSubagentStore, type SubagentEvent } from "../stores/subagentStore";

interface SubagentPanelProps {
  activeCwd: string | null;
  onClose: () => void;
}

export default function SubagentPanel({ activeCwd, onClose }: SubagentPanelProps) {
  const list = useSubagentStore((s) => s.list);
  const applyEvent = useSubagentStore((s) => s.applyEvent);
  const reset = useSubagentStore((s) => s.reset);

  useEffect(() => {
    if (!activeCwd) return;
    let watchId: number | null = null;
    let cancelled = false;
    reset();
    const channel = new Channel<SubagentEvent>();
    channel.onmessage = (ev) => applyEvent(ev);
    invoke<number>("watch_subagents", { cwd: activeCwd, onEvent: channel })
      .then((id) => {
        if (cancelled) {
          invoke("unwatch_subagents", { id });
        } else {
          watchId = id;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watchId != null) invoke("unwatch_subagents", { id: watchId });
    };
  }, [activeCwd, applyEvent, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="subagent-panel-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="subagent-panel" role="dialog" aria-modal="true" aria-labelledby="subagent-panel-title">
        <div className="subagent-panel__header">
          <span id="subagent-panel-title">
            Sub-agents{activeCwd ? "" : " (no active terminal)"}
          </span>
          <button
            onClick={onClose}
            aria-label="Close sub-agents panel"
            className="subagent-panel__close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {list.length === 0 ? (
          <div className="subagent-panel__empty">
            No sub-agents yet. They appear when Claude Code runs a Task.
          </div>
        ) : (
          <ul className="subagent-panel__list">
            {list.map((s) => (
              <li key={s.id} className={`subagent-row subagent-row--${s.status}`}>
                <span className="subagent-row__type">{s.agentType || "agent"}</span>
                <span className="subagent-row__desc">{s.description}</span>
                <span className="subagent-row__status">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
