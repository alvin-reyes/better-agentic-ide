import { beforeEach, describe, expect, it, vi } from "vitest";

// Setup is IPC only. Tauri binds the apply arguments by name, so the recorded
// call is the whole observable contract — especially `methodology`, whose
// absence used to be invisible until the Rust command rejected the call.
const tauri = vi.hoisted(() => ({
  applies: [] as Record<string, unknown>[],
  /** What `project_setup_status` reports the project is already on. */
  methodology: null as "v4" | "v6" | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_setup_status":
        return {
          isGit: true,
          missing: [],
          needsImport: false,
          bmadInstalled: false,
          stacks: [],
          methodology: tauri.methodology,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0, bmadv6Files: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import { agentCatalog } from "../projectMethodology";
import { addAgent, addStackAgents, detectOnDisk, methodologyOf, setUpProject } from "../projectSetup";

const lastApply = () => tauri.applies[tauri.applies.length - 1];

beforeEach(() => {
  tauri.applies.length = 0;
  tauri.methodology = null;
});

describe("methodology in project setup", () => {
  it("passes the chosen methodology to setup and defaults new projects to v6", async () => {
    await setUpProject("/tmp/proj", "v6");
    expect(lastApply().methodology).toBe("v6");
    await setUpProject("/tmp/proj");
    expect(lastApply().methodology).toBe("v6");
  });

  it("keeps a project that says what it is on", async () => {
    tauri.methodology = "v4";
    await setUpProject("/tmp/proj");
    expect(lastApply().methodology).toBe("v4");
    tauri.methodology = "v6";
    await setUpProject("/tmp/proj");
    expect(lastApply().methodology).toBe("v6");
  });

  it("lets the owner's explicit choice win over what the project is on", async () => {
    tauri.methodology = "v4";
    await setUpProject("/tmp/proj", "v6");
    expect(lastApply().methodology).toBe("v6");
  });

  it("reports what a project is on from the status command, null when it has neither", async () => {
    expect(await detectOnDisk("/tmp/proj")).toBeNull();
    tauri.methodology = "v4";
    expect(await detectOnDisk("/tmp/proj")).toBe("v4");
    tauri.methodology = "v6";
    expect(await detectOnDisk("/tmp/proj")).toBe("v6");
  });

  it("sends the methodology when adding stack agents and single agents", async () => {
    await addStackAgents("/tmp/proj", ["go"], "v4");
    expect(lastApply().methodology).toBe("v4");
    await addStackAgents("/tmp/proj", ["go"]);
    expect(lastApply().methodology).toBe("v6");
    await addAgent("/tmp/proj", agentCatalog()[0]);
    expect(lastApply().methodology).toBe("v6");
  });

  const files = () => lastApply().files as { path: string; content: string }[];
  const qaIn = () => files().find((f) => f.path === ".claude/agents/qa.md")?.content ?? "";

  it("writes the core roles with only the project's BMAD section", async () => {
    tauri.methodology = "v4";
    await setUpProject("/tmp/proj");
    expect(qaIn()).toContain("## BMAD tasks (v4)");
    expect(qaIn()).not.toContain("## BMAD tasks (v6)");
    await setUpProject("/tmp/proj", "v6", []);
    expect(qaIn()).toContain("## BMAD tasks (v6)");
    expect(qaIn()).not.toContain("## BMAD tasks (v4)");
  });

  it("adds a single core role on the project's methodology", async () => {
    const qa = agentCatalog().find((a) => a.id === "qa")!;
    await addAgent("/tmp/proj", qa, "v4");
    expect(qaIn()).toContain("## BMAD tasks (v4)");
    expect(qaIn()).not.toContain("## BMAD tasks (v6)");
  });

  it("resolves a launch's methodology from the project, v6 when unknown", async () => {
    expect(await methodologyOf(undefined)).toBe("v6");
    expect(await methodologyOf("/tmp/proj")).toBe("v6");
    tauri.methodology = "v4";
    expect(await methodologyOf("/tmp/proj")).toBe("v4");
  });
});
