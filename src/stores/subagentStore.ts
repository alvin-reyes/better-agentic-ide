import { create } from "zustand";

export type SubagentEvent =
  | { kind: "Spawn"; id: string; agent_type: string; description: string }
  | { kind: "Complete"; id: string };

export interface Subagent {
  id: string;
  agentType: string;
  description: string;
  status: "running" | "completed";
}

interface SubagentStore {
  list: Subagent[];
  applyEvent: (ev: SubagentEvent) => void;
  reset: () => void;
}

export const useSubagentStore = create<SubagentStore>((set) => ({
  list: [],
  applyEvent: (ev) =>
    set((state) => {
      if (ev.kind === "Spawn") {
        if (state.list.some((s) => s.id === ev.id)) return state;
        return {
          list: [
            ...state.list,
            { id: ev.id, agentType: ev.agent_type, description: ev.description, status: "running" as const },
          ],
        };
      }
      return {
        list: state.list.map((s) =>
          s.id === ev.id ? { ...s, status: "completed" as const } : s
        ),
      };
    }),
  reset: () => set({ list: [] }),
}));
