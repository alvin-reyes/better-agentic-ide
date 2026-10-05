import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROLES } from "../src/data/roles";
import { roleIdForWorkflowAgent, workflowAgents } from "../src/lib/bmadWorkflow";

const DIR = resolve(__dirname, "..", "src-tauri/resources/bmad/bmad-core/workflows");
const files = readdirSync(DIR).filter((f) => f.endsWith(".yaml"));

describe("workflow agent names map to ADE roles", () => {
  it("finds the agents in a shipped workflow", () => {
    const yaml = readFileSync(resolve(DIR, "greenfield-fullstack.yaml"), "utf8");
    const agents = workflowAgents(yaml);
    expect(agents).toEqual(expect.arrayContaining(["analyst", "pm", "architect", "po", "sm", "dev"]));
  });

  it.each([
    ["pm", "product-manager"],
    ["po", "product-owner"],
    ["sm", "scrum-master"],
    ["dev", "developer"],
    ["ux-expert", "designer"],
    ["qa", "qa"],
    ["analyst", "analyst"],
    ["architect", "architect"],
  ])("%s -> %s", (agent, roleId) => {
    expect(roleIdForWorkflowAgent(agent)).toBe(roleId);
  });

  it("resolves a compound name to its first agent", () => {
    // greenfield-fullstack has `agent: analyst/pm` and `agent: pm/architect`.
    expect(roleIdForWorkflowAgent("analyst/pm")).toBe("analyst");
  });

  it("returns null for the placeholder, rather than inventing a role", () => {
    expect(roleIdForWorkflowAgent("various")).toBeNull();
  });

  // The whole point: a BMAD upgrade that renames an agent must fail the build,
  // not silently spawn nothing.
  it("every agent in every bundled workflow resolves to one of the 19 roles", () => {
    const known = new Set(ROLES.map((r) => r.id));
    const unmapped: string[] = [];
    for (const f of files) {
      for (const agent of workflowAgents(readFileSync(resolve(DIR, f), "utf8"))) {
        if (agent === "various") continue;
        const id = roleIdForWorkflowAgent(agent);
        if (!id || !known.has(id)) unmapped.push(`${f}: ${agent}`);
      }
    }
    expect(unmapped, `unmapped workflow agents: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("checks more than one workflow, so a rename anywhere is caught", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });
});
