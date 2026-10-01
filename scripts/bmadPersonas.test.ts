import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BMAD ships ten agents — analyst, architect, dev, pm, po, qa, sm, ux-expert
 * and two orchestrators — and eight of them are the same jobs as ADE's own
 * roles. ADE vendors BMAD into every project it sets up, so shipping both gave
 * each project two `qa` agents with different definitions of Done, and a model
 * could reach for the one that bypasses the verification command.
 *
 * The library is what BMAD is valuable for and stays: tasks, templates,
 * checklists, workflows and the /BMad:tasks: commands. The personas do not.
 *
 * This also guards the next version bump: re-vendoring BMAD would quietly
 * reintroduce them, and that should be a decision rather than an accident.
 */
const BMAD = resolve(__dirname, "..", "src-tauri", "resources", "bmad");

describe("the vendored BMAD ships no personas", () => {
  it("vendors BMAD at all, so this test is not vacuous", () => {
    expect(existsSync(resolve(BMAD, "bmad-core", "tasks"))).toBe(true);
  });

  it("has no bmad-core/agents", () => {
    expect(existsSync(resolve(BMAD, "bmad-core", "agents"))).toBe(false);
  });

  it("has no agent-teams, which are bundles of those agents", () => {
    expect(existsSync(resolve(BMAD, "bmad-core", "agent-teams"))).toBe(false);
  });

  it("has no /BMad:agents: slash commands", () => {
    expect(existsSync(resolve(BMAD, "claude-commands", "BMad", "agents"))).toBe(false);
  });

  it("keeps the library a project actually uses", () => {
    for (const d of ["tasks", "templates", "checklists", "workflows", "data"]) {
      const p = resolve(BMAD, "bmad-core", d);
      expect(existsSync(p), `bmad-core/${d} is missing`).toBe(true);
      expect(readdirSync(p).length, `bmad-core/${d} is empty`).toBeGreaterThan(0);
    }
    expect(readdirSync(resolve(BMAD, "claude-commands", "BMad", "tasks")).length).toBeGreaterThan(0);
  });
});
