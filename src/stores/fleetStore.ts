import { create } from "zustand";
import { estimateCost, type AgentSession } from "./agentTrackerStore";

export type SubagentEvent =
  | { kind: "Spawn"; id: string; agent_type: string; description: string;
      model: string | null; started_at: string | null }
  | { kind: "Complete"; id: string; finished_at: string | null };

export interface SubagentRecord {
  id: string;
  agentType: string;
  description: string;
  model: string | null;
  startTime: number;
  endTime: number | null;
  cwd: string;
}

export interface PaneMeta {
  tabId: string;
  tabName: string;
  cwd: string | null;
}

export interface FleetLane {
  id: string;
  kind: "agent" | "subagent";
  parentId: string | null;
  tabId: string | null;
  tabName: string | null;
  paneId: string | null;
  cwd: string | null;
  label: string;
  detail: string;
  provider: string | null;
  model: string | null;
  startTime: number;
  endTime: number | null;
  status: "running" | "completed" | "cancelled";
  costCents: number | null;
  tokens: { input: number; output: number } | null;
}

function agentLaneId(s: AgentSession): string {
  return `agent:${s.paneId}:${s.startTime}`;
}

/**
 * Merge agent sessions and sub-agent records into a flat, time-sorted lane list.
 *
 * A sub-agent attaches to an agent lane only when exactly one agent is running
 * in the same cwd. The transcript records no pane, so with two panes sharing a
 * directory the parent is genuinely unknown — we leave it unattached rather
 * than guess.
 */
export function buildLanes(
  sessions: AgentSession[],
  subagents: SubagentRecord[],
  paneMeta: Record<string, PaneMeta>,
): FleetLane[] {
  const agentLanes: FleetLane[] = sessions.map((s) => {
    const meta = paneMeta[s.paneId];
    return {
      id: agentLaneId(s),
      kind: "agent",
      parentId: null,
      tabId: meta?.tabId ?? null,
      tabName: meta?.tabName ?? null,
      paneId: s.paneId,
      cwd: meta?.cwd ?? null,
      label: s.agentName,
      detail: "",
      provider: s.provider,
      model: null,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      costCents: estimateCost(s),
      tokens: { input: s.estimatedInputTokens, output: s.estimatedOutputTokens },
    };
  });

  const runningByCwd = new Map<string, FleetLane[]>();
  for (const lane of agentLanes) {
    if (lane.status !== "running" || !lane.cwd) continue;
    const list = runningByCwd.get(lane.cwd) ?? [];
    list.push(lane);
    runningByCwd.set(lane.cwd, list);
  }

  const subLanes: FleetLane[] = subagents.map((s) => {
    const candidates = runningByCwd.get(s.cwd) ?? [];
    const parent = candidates.length === 1 ? candidates[0] : null;
    return {
      id: `sub:${s.id}`,
      kind: "subagent",
      parentId: parent ? parent.id : null,
      tabId: parent?.tabId ?? null,
      tabName: parent?.tabName ?? null,
      paneId: parent?.paneId ?? null,
      cwd: s.cwd,
      label: s.agentType || "agent",
      detail: s.description,
      provider: null,
      model: s.model,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.endTime === null ? "running" : "completed",
      costCents: null,
      tokens: null,
    };
  });

  return [...agentLanes, ...subLanes].sort((a, b) => a.startTime - b.startTime);
}

interface FleetStore {
  subagents: SubagentRecord[];
  applyEvent: (ev: SubagentEvent, cwd: string) => void;
  reset: () => void;
}

export const useFleetStore = create<FleetStore>((set) => ({
  subagents: [],
  applyEvent: (ev, cwd) =>
    set((state) => {
      if (ev.kind === "Spawn") {
        if (state.subagents.some((s) => s.id === ev.id)) return state;
        const startTime = ev.started_at ? Date.parse(ev.started_at) : Date.now();
        return {
          subagents: [
            ...state.subagents,
            {
              id: ev.id,
              agentType: ev.agent_type,
              description: ev.description,
              model: ev.model ?? null,
              startTime,
              endTime: null,
              cwd,
            },
          ],
        };
      }
      if (!state.subagents.some((s) => s.id === ev.id)) return state;
      const endTime = ev.finished_at ? Date.parse(ev.finished_at) : Date.now();
      return {
        subagents: state.subagents.map((s) =>
          s.id === ev.id ? { ...s, endTime } : s,
        ),
      };
    }),
  reset: () => set({ subagents: [] }),
}));
