import { describe, expect, it } from "vitest";
import { MCP_CATALOG, MCP_CATEGORIES, envRefs, matchCatalog } from "../mcpCatalog";

describe("MCP catalog", () => {
  it("has unique ids and known categories", () => {
    const ids = MCP_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of MCP_CATALOG) {
      expect(MCP_CATEGORIES).toContain(e.category);
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("declares every secret a server reads, and never stores a value", () => {
    for (const e of MCP_CATALOG) {
      expect(envRefs(e.server)).toEqual((e.secrets ?? []).map((s) => s.name).sort());
      expect(JSON.stringify(e.server)).not.toMatch(/ghp_|sk_live|Bearer [a-z0-9]{8}/i);
    }
  });

  it("finds env references anywhere in the config", () => {
    expect(envRefs({ args: ["--dsn", "${DB_URL}"], headers: { a: "Bearer ${TOKEN:-x}" }, env: { K: "$NOT" } })).toEqual(["DB_URL", "TOKEN"]);
  });

  it("sign-in servers carry no secret and use https", () => {
    const signIn = MCP_CATALOG.filter((e) => e.oauth);
    expect(signIn.map((e) => e.id)).toContain("orgo");
    for (const e of signIn) {
      expect(e.secrets, e.id).toBeUndefined();
      expect(envRefs(e.server), e.id).toEqual([]);
      expect(new URL(String(e.server.url)).protocol, e.id).toBe("https:");
    }
    expect(MCP_CATALOG.find((e) => e.id === "orgo")?.server).toEqual({ type: "http", url: "https://www.orgo.ai/mcp" });
  });

  it("searches name, category and description", () => {
    expect(matchCatalog(MCP_CATALOG, "storage").map((e) => e.id)).toContain("supabase");
    expect(matchCatalog(MCP_CATALOG, "browser click").map((e) => e.id)).toEqual(["playwright"]);
    expect(matchCatalog(MCP_CATALOG, "cloud computer").map((e) => e.id)).toEqual(["orgo"]);
    expect(matchCatalog(MCP_CATALOG, "")).toHaveLength(MCP_CATALOG.length);
  });
});
