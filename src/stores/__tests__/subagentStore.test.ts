import { describe, it, expect, beforeEach } from "vitest";
import { useSubagentStore } from "../subagentStore";

describe("subagentStore", () => {
  beforeEach(() => useSubagentStore.getState().reset());

  it("adds a running sub-agent on Spawn", () => {
    useSubagentStore.getState().applyEvent({
      kind: "Spawn", id: "t1", agent_type: "Explore", description: "Find X",
    });
    const list = useSubagentStore.getState().list;
    expect(list).toEqual([
      { id: "t1", agentType: "Explore", description: "Find X", status: "running" },
    ]);
  });

  it("marks completed on Complete", () => {
    const s = useSubagentStore.getState();
    s.applyEvent({ kind: "Spawn", id: "t1", agent_type: "Explore", description: "Find X" });
    s.applyEvent({ kind: "Complete", id: "t1" });
    expect(useSubagentStore.getState().list[0].status).toBe("completed");
  });

  it("ignores Complete for unknown id", () => {
    useSubagentStore.getState().applyEvent({ kind: "Complete", id: "ghost" });
    expect(useSubagentStore.getState().list).toEqual([]);
  });
});
