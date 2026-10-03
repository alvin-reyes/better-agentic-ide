import { describe, it, expect } from "vitest";
import { ROLES, getRole } from "../roles";

const EXPECTED_IDS = [
  "analyst", "product-manager", "designer", "architect", "product-owner",
  "scrum-master", "developer", "qa", "devops", "adversarial-reviewer",
  "technical-writer", "advisor", "brainstorming-architect",
];

describe("ROLES", () => {
  it("defines exactly the thirteen expected roles", () => {
    expect(ROLES.map((r) => r.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("gives every role a non-empty title, mission and boundaries", () => {
    for (const role of ROLES) {
      expect(role.title.length, `${role.id} title`).toBeGreaterThan(0);
      expect(role.mission.length, `${role.id} mission`).toBeGreaterThan(80);
      expect(role.boundaries.length, `${role.id} boundaries`).toBeGreaterThan(40);
    }
  });

  it("gives every delivery role at least one owned artifact", () => {
    // advisor is the deliberate exception: it produces guidance, not artifacts.
    for (const role of ROLES.filter((r) => r.id !== "advisor")) {
      expect(role.owns.length, `${role.id} owns`).toBeGreaterThan(0);
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
