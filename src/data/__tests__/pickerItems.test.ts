import { describe, it, expect } from "vitest";
import { CURATED_ITEMS, PICKER_ITEMS, ROLE_ITEMS, roleInitials, roleSummary } from "../pickerItems";
import { ROLES, getRole } from "../roles";
import { CURATED_AGENTS } from "../curatedAgents";

describe("picker items", () => {
  it("keeps every curated pair", () => {
    expect(CURATED_ITEMS.length).toBe(CURATED_AGENTS.length);
    expect(CURATED_ITEMS.length).toBe(45);
  });

  it("offers every role as a bare, domainless launch", () => {
    expect(ROLE_ITEMS.length).toBe(ROLES.length);
    for (const item of ROLE_ITEMS) {
      expect(item.domainId, `${item.id} must launch with no domain`).toBe(undefined);
      expect(getRole(item.roleId), `${item.id} points at a real role`).toBeTruthy();
    }
  });

  it("makes the three roles no curated pair covers reachable", () => {
    // Before the Roles group these could not be launched by any means: the
    // curated pairs never reference them, and BmadPanel's persona buttons —
    // which used to run /BMad:agents:pm and friends — were removed.
    const covered = new Set(CURATED_AGENTS.map((a) => a.roleId));
    const orphaned = ["product-manager", "product-owner", "scrum-master"];
    for (const roleId of orphaned) {
      expect(covered.has(roleId), `${roleId} unexpectedly has a curated pair`).toBe(false);
      expect(
        ROLE_ITEMS.some((i) => i.roleId === roleId),
        `${roleId} is not launchable from the picker`
      ).toBe(true);
    }
  });

  it("gives every item a unique id across both groups", () => {
    expect(new Set(PICKER_ITEMS.map((i) => i.id)).size).toBe(PICKER_ITEMS.length);
  });

  it("lists the curated pairs before the roles", () => {
    expect(PICKER_ITEMS.slice(0, CURATED_ITEMS.length).every((i) => i.group === "agent")).toBe(true);
    expect(PICKER_ITEMS.slice(CURATED_ITEMS.length).every((i) => i.group === "role")).toBe(true);
  });

  it("gives every item a non-empty name, description and icon", () => {
    for (const item of PICKER_ITEMS) {
      expect(item.name.length, `${item.id} name`).toBeGreaterThan(0);
      expect(item.description.length, `${item.id} description`).toBeGreaterThan(0);
      expect(item.icon.length, `${item.id} icon`).toBeGreaterThan(0);
    }
  });

  it("drops the mission's title-restating opening sentence from a role summary", () => {
    const qa = ROLES.find((r) => r.id === "qa")!;
    expect(roleSummary(qa).startsWith("You own independent verification")).toBe(true);
  });

  it("builds a readable monogram for each role", () => {
    expect(roleInitials("Product Manager")).toBe("PM");
    expect(roleInitials("Adversarial Reviewer")).toBe("AR");
    expect(roleInitials("QA")).toBe("QA");
    expect(roleInitials("UX Expert")).toBe("UX");
    expect(roleInitials("Architect")).toBe("ARC");
  });
});
