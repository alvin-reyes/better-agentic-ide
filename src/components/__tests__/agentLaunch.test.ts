import { describe, it, expect } from "vitest";
import { specFromCurated, rolePathFor } from "../../lib/agentSpec";

describe("specFromCurated", () => {
  it("resolves a curated id to its role and domain", () => {
    const spec = specFromCurated("backend-auth", "claude");
    expect(spec?.roleId).toBe("architect");
    expect(spec?.domainId).toBe("security");
    expect(spec?.provider).toBe("claude");
  });

  it("resolves a curated id that has no domain", () => {
    const spec = specFromCurated("general-architect", "claude");
    expect(spec?.roleId).toBe("architect");
    expect(spec?.domainId).toBe(undefined);
  });

  it("returns undefined for an unknown id", () => {
    expect(specFromCurated("nope", "claude")).toBe(undefined);
  });
});

describe("rolePathFor", () => {
  it("builds a path under the app's role directory", () => {
    const path = rolePathFor({ roleId: "architect", domainId: "security", provider: "claude" });
    expect(path).toBe("~/.ade/roles/architect-security.md");
  });

  it("builds a bare role path when there is no domain", () => {
    const path = rolePathFor({ roleId: "architect", provider: "claude" });
    expect(path).toBe("~/.ade/roles/architect.md");
  });
});
