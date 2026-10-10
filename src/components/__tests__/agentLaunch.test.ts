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

  it("builds an absolute path inside an expanded directory", () => {
    // What the launch paths actually pass: the directory create_directory
    // returned, already tilde-expanded, so the quoted path in the shell
    // command points at a file that exists.
    const path = rolePathFor(
      { roleId: "architect", domainId: "security", provider: "claude" },
      "/Users/x/.ade/roles",
    );
    expect(path).toBe("/Users/x/.ade/roles/architect-security.md");
  });

  it("does not double the separator when the directory has a trailing slash", () => {
    const path = rolePathFor({ roleId: "dev", provider: "claude" }, "/Users/x/.ade/roles/");
    expect(path).toBe("/Users/x/.ade/roles/dev.md");
  });

  it("keys the file by methodology, so a v4 and a v6 launch never share one", () => {
    const spec = { roleId: "qa", domainId: "security", provider: "claude" as const };
    expect(rolePathFor(spec, "/r", "v4")).toBe("/r/qa-security.v4.md");
    expect(rolePathFor({ roleId: "qa", provider: "claude" }, "/r", "v6")).toBe("/r/qa.v6.md");
  });
});
