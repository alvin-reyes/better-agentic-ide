import { describe, expect, it } from "vitest";
import { CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER, ROLES, methodologyFiles } from "../projectMethodology";
import { isSetupCandidate, summarize } from "../projectSetup";

describe("ADE methodology", () => {
  it("ships all eight BMAD roles as Claude Code sub-agents", () => {
    expect(ROLES.map((r) => r.name)).toEqual([
      "product-manager", "architect", "designer", "scrum-master", "developer", "qa", "devops", "adversarial-reviewer",
    ]);
    for (const f of methodologyFiles("demo").filter((f) => f.path.startsWith(".claude/agents/"))) {
      expect(f.content).toMatch(/^---\nname: [a-z-]+\ndescription: ".+"\n---\n/);
    }
  });

  it("writes the rules, context store, decision log, journal, CLAUDE.md and llms.txt", () => {
    const paths = methodologyFiles("demo").map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "CLAUDE.md", "llms.txt", ".ade/rules.md", ".ade/context/README.md", ".ade/context/decisions/README.md", ".ade/session.md",
    ]));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("loads the rules from CLAUDE.md, new or existing", () => {
    const claude = methodologyFiles("demo").find((f) => f.path === "CLAUDE.md")!;
    expect(claude.content).toContain("@.ade/rules.md");
    expect(CLAUDE_MD_IMPORT).toContain(CLAUDE_MD_IMPORT_MARKER);
    expect(CLAUDE_MD_IMPORT).toContain("@.ade/rules.md");
  });

  it("carries no Cadre-engine leftovers", () => {
    const all = methodologyFiles("demo").map((f) => f.content).join("\n");
    expect(all).not.toMatch(/Cadre|\.cadre\/|the engine|CTO|result marker/);
  });
});

describe("project setup", () => {
  it("never treats home folders or the root as projects", () => {
    for (const p of ["/", "/Users/alice", "/home/bob/", "C:\\Users\\carol"]) expect(isSetupCandidate(p)).toBe(false);
    expect(isSetupCandidate("/Users/alice/code/app")).toBe(true);
  });

  it("summarizes what a setup wrote", () => {
    expect(summarize({ created: new Array(20).fill("x"), appendedImport: true, agents: 8, bmadFiles: 6 })).toBe("BMAD, 8 agents, the methodology and a line in CLAUDE.md");
    expect(summarize({ created: [], appendedImport: false, agents: 0, bmadFiles: 0 })).toBeNull();
  });
});

describe("agents by project type", () => {
  it("adds Web3, Go and Rust agents for their stacks", async () => {
    const { stackAgentFiles, agentCatalog } = await import("../projectMethodology");
    const ids = (s: Parameters<typeof stackAgentFiles>[0]) => stackAgentFiles(s).map((f) => f.path.replace(/^\.claude\/agents\/|\.md$/g, ""));
    expect(ids(["evm"])).toEqual(["web3-solidity", "web3-auditor", "web3-gas", "web3-devops"]);
    expect(ids(["solana"])).toEqual(["backend-rust", "web3-auditor", "web3-solana", "web3-devops"]);
    expect(ids(["go"])).toEqual(["backend-go"]);
    expect(ids([])).toEqual([]);
    // Every agent a stack names exists in the catalog.
    const catalog = new Set(agentCatalog().map((a) => a.id));
    const { STACK_AGENTS } = await import("../projectMethodology");
    for (const list of Object.values(STACK_AGENTS)) for (const id of list) expect(catalog.has(id)).toBe(true);
  });

  it("offers every agent on demand, core roles first, architects excluded", async () => {
    const { agentCatalog } = await import("../projectMethodology");
    const c = agentCatalog();
    expect(c[0].group).toBe("Core");
    expect(c.some((a) => a.group === "Architects")).toBe(false);
    expect(new Set(c.map((a) => a.file.path)).size).toBe(c.length);
    for (const a of c) expect(a.file.content).toMatch(/^---\nname: [a-z0-9-]+\ndescription: ".+"\n---\n/);
  });
});
