import { describe, it, expect } from "vitest";
import { ROLES, ROLE_ORDER, getRole } from "../roles";

const EXPECTED_IDS = [
  "analyst", "product-manager", "designer", "architect", "product-owner",
  "scrum-master", "developer", "qa", "devops", "adversarial-reviewer",
  "technical-writer", "advisor", "security-engineer", "sre",
  "release-manager", "engineering-manager", "support-engineer", "solutions-engineer", "brainstorming-architect",
];

describe("ROLES", () => {
  it("defines exactly the nineteen expected roles", () => {
    expect(ROLES.map((r) => r.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("parses a title, a summary and a boundaries section out of every definition", () => {
    for (const role of ROLES) {
      expect(role.title.length, `${role.id} title`).toBeGreaterThan(0);
      // A parse that silently half-worked is the failure mode to catch: an
      // empty summary or a body with no boundaries means the markdown drifted
      // from the shape this module reads.
      expect(role.summary.length, `${role.id} summary`).toBeGreaterThan(40);
      expect(role.body, `${role.id} body`).toMatch(/^## (Boundaries|Anti-patterns)/m);
      expect(role.body, `${role.id} what-you-own`).toContain("## What you own");
    }
  });

  it("carries the definition verbatim, with nothing recomposed", () => {
    // The body is handed to a provider CLI as-is, so it must still contain the
    // sections this module does not model.
    const qa = getRole("qa")!;
    expect(qa.body).toContain("## How you work");
    expect(qa.body).toContain("Never edit code or tests");
    const dev = getRole("developer")!;
    expect(dev.body).toContain("## The one hard rule");
  });

  it("declares a display order that covers every vendored definition", () => {
    // An id vendored but absent from ORDER still renders, at the end. This
    // fails instead, so a new definition gets a deliberate position.
    const ids = new Set(ROLES.map((r) => r.id));
    expect([...ids].filter((id) => !ROLE_ORDER.includes(id))).toEqual([]);
    expect(ROLE_ORDER.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("puts the delivery flow before the advisory roles", () => {
    const at = (id: string) => ROLES.findIndex((r) => r.id === id);
    expect(at("analyst")).toBeLessThan(at("developer"));
    expect(at("developer")).toBeLessThan(at("qa"));
    expect(at("qa")).toBeLessThan(at("advisor"));
  });

  it("gives every delivery role at least one owned artifact", () => {
    // advisor is the deliberate exception: it produces guidance, not artifacts.
    for (const role of ROLES.filter((r) => r.id !== "advisor")) {
      expect(role.owns.length, `${role.id} owns`).toBeGreaterThan(0);
    }
  });

  it("keeps the ownership overlaps the contract documents", () => {
    // These are the worked examples in Role.owns: overlap is intentional and
    // resolves by specificity. Narrowing either side of a pair leaves paths
    // with no steward — which is exactly how technical-writer's docs/**
    // catch-all was lost once, reverted here, and then silently restored to
    // the narrow value when the catalog began parsing the vendored files.
    expect(getRole("technical-writer")!.owns, "the docs catch-all").toContain("docs/**");
    expect(getRole("product-manager")!.owns, "beats the catch-all").toContain("docs/prd.md");
    expect(getRole("sre")!.owns, "beats the catch-all").toContain("docs/runbooks/**");
  });

  it("leaves test files unclaimed, on purpose", () => {
    // The Developer authors them test-first; QA must not edit what it
    // measures. A role declaring stewardship of tests contradicts both.
    for (const role of ROLES) {
      const claimed = role.owns.filter((g) => /(^|\/)tests?\/|\.test\./.test(g));
      expect(claimed, `${role.id} claims test files`).toEqual([]);
    }
  });

  it("has unique ids", () => {
    expect(new Set(ROLES.map((r) => r.id)).size).toBe(ROLES.length);
  });

  it("looks a role up by id", () => {
    expect(getRole("architect")?.title).toBe("Architect");
    expect(getRole("nope")).toBe(undefined);
  });
});
