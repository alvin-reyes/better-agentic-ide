import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLES, roleFile } from "../src/lib/projectMethodology";
import { getRole } from "../src/data/roles";

/**
 * The eight sub-agents written into `.claude/agents/` used to carry their own
 * copy of each role's prose, restated from the vendored markdown. The copies
 * drifted: when it was finally measured, the local `qa` was 69% of the vendored
 * one, missing its BMAD tasks, its knowledge-store section and part of what it
 * owns. A project scaffolded by ADE got a weaker role than ade-setup defines,
 * and improving either left the other untouched.
 *
 * These assert the prose has one home. Mirrors `scripts/agentSource.test.ts`,
 * which does the same job for the picker's catalog.
 */
const REPO = resolve(__dirname, "..");
const SOURCE = readFileSync(resolve(REPO, "src/lib/projectMethodology.ts"), "utf8");

describe("sub-agent definitions come from the vendored markdown", () => {
  it("every sub-agent has a vendored counterpart", () => {
    const orphans = ROLES.filter((r) => !getRole(r.name)).map((r) => r.name);
    expect(orphans, `no vendored definition for: ${orphans.join(", ")}`).toEqual([]);
  });

  it.each(ROLES.map((r) => r.name))("%s's body is the vendored text", (name) => {
    const vendored = getRole(name)!.body;
    const local = ROLES.find((r) => r.name === name)!.body;
    // Derived, not restated: every line of what we write must appear in the
    // source. A reworded copy would pass a length check but fail this.
    for (const line of local.split("\n").map((l) => l.trim()).filter(Boolean)) {
      expect(vendored, `"${line.slice(0, 60)}…" is not in vendor/ade-setup/agents/${name}.md`)
        .toContain(line);
    }
  });

  it("the ROLES array holds no prose of its own", () => {
    // The file legitimately carries long strings elsewhere - .ade/rules.md and
    // the CLAUDE.md constitution are methodology text it exists to hold. Only
    // the role definitions must be absent, so look just inside ROLES.
    const start = SOURCE.indexOf("export const ROLES: Role[] = [");
    expect(start, "could not find the ROLES array").toBeGreaterThan(-1);
    const end = SOURCE.indexOf("\n];", start);
    const roles = SOURCE.slice(start, end);

    const longStrings = (roles.match(/"(?:[^"\\]|\\.){400,}"/g) ?? []).length;
    expect(longStrings, "a role body is written out again inside ROLES").toBe(0);
    // Every entry must go through the lookup rather than carry text.
    expect((roles.match(/body: vendoredBody\(/g) ?? []).length).toBe(ROLES.length);
  });

  it("does not print the title or preamble twice", () => {
    // roleFile writes its own heading and "Follow the project rules" line; the
    // vendored body opens with both, so they are stripped when embedding.
    for (const role of ROLES) {
      const content = roleFile(role).content;
      expect(
        (content.match(/^# /gm) ?? []).length,
        `${role.name}.md has more than one title`,
      ).toBe(1);
      expect(
        (content.match(/Follow the project rules/g) ?? []).length,
        `${role.name}.md repeats the preamble`,
      ).toBe(1);
    }
  });

  it("carries the sections the vendored definition gained", () => {
    // These are exactly what the stale copies had lost.
    const qa = roleFile(ROLES.find((r) => r.name === "qa")!).content;
    expect(qa).toContain("## BMAD tasks");
    expect(qa).toContain("## Project knowledge");
  });
});
