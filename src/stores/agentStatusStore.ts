import { create } from "zustand";
import { invoke, Channel } from "@tauri-apps/api/core";
import { findAllPanes, type Tab } from "./tabStore";

/**
 * Agent status: what each pane's Claude Code agent is doing, streamed from
 * the backend per PTY (see `.ade/context/agent-events.md`).
 */
export type AgentState = "needsYou" | "waiting" | "working" | "ready" | "finished";

/** Least urgent first. */
const URGENCY: AgentState[] = ["finished", "ready", "working", "waiting", "needsYou"];

/** One pane's state as the backend sends it; null once it has no live session. */
export interface AgentStatusUpdate {
  ptyId: number;
  state: AgentState | null;
}

/** The most urgent of `states`, or null when none is known. */
export function mostUrgent(states: (AgentState | null | undefined)[]): AgentState | null {
  let best: AgentState | null = null;
  for (const s of states) {
    if (s && (best === null || URGENCY.indexOf(s) > URGENCY.indexOf(best))) best = s;
  }
  return best;
}

export function applyUpdate(byPty: Record<number, AgentState>, u: AgentStatusUpdate): Record<number, AgentState> {
  const next = { ...byPty };
  if (u.state) next[u.ptyId] = u.state;
  else delete next[u.ptyId];
  return next;
}

/** A tab's state: the most urgent of its panes'. */
export function tabAgentState(tab: Tab, byPty: Record<number, AgentState>): AgentState | null {
  return mostUrgent(findAllPanes(tab.root).map((p) => (p.ptyId === null ? null : byPty[p.ptyId])));
}

/**
 * A real key press that answers a Claude Code prompt: Enter, Esc, a digit, y
 * or n, pressed down with no modifier. Only xterm's key-event handler feeds
 * this, never `onData`, which also carries bytes xterm generates itself.
 */
export function isAnsweringKey(e: KeyboardEvent): boolean {
  if (e.type !== "keydown" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
  return e.key === "Enter" || e.key === "Escape" || /^[0-9yYnN]$/.test(e.key);
}

/**
 * Which panes to toast for: those that became needs you while not in view.
 * A pane is handled once until it leaves needs you, whether or not it was
 * in view, so one prompt gives at most one toast.
 */
export function needsYouToasts(
  byPty: Record<number, AgentState>,
  handled: Set<number>,
  inView: (ptyId: number) => boolean,
): { show: number[]; handled: Set<number> } {
  const next = new Set<number>();
  const show: number[] = [];
  for (const [id, state] of Object.entries(byPty)) {
    const ptyId = Number(id);
    if (state !== "needsYou") continue;
    next.add(ptyId);
    if (!handled.has(ptyId) && !inView(ptyId)) show.push(ptyId);
  }
  return { show, handled: next };
}

interface AgentStatusStore {
  byPty: Record<number, AgentState>;
  apply: (u: AgentStatusUpdate) => void;
}

export const useAgentStatusStore = create<AgentStatusStore>((set) => ({
  byPty: {},
  apply: (u) => set((s) => ({ byPty: applyUpdate(s.byPty, u) })),
}));

let watching = false;

/** Start receiving pane states, once per window. */
export function watchAgentStatus() {
  if (watching) return;
  watching = true;
  const channel = new Channel<AgentStatusUpdate>();
  channel.onmessage = (u) => useAgentStatusStore.getState().apply(u);
  invoke("agent_status_watch", { onEvent: channel }).catch(() => {
    watching = false;
  });
}

/** Tell the backend an answering key was pressed in a pane that needs you. */
export function reportAnsweringKey(ptyId: number) {
  if (useAgentStatusStore.getState().byPty[ptyId] !== "needsYou") return;
  void invoke("agent_status_key", { ptyId }).catch(() => {});
}
