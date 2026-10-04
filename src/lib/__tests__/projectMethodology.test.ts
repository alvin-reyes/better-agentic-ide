import { describe, expect, it } from "vitest";
import { CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER, ROLES, RULES_MD, methodologyFiles } from "../projectMethodology";
import { isSetupCandidate, summarize } from "../projectSetup";

describe("ADE methodology", () => {
  it("ships all eight BMAD roles as Claude Code sub-agents", () => {
    expect(ROLES.map((r) => r.name)).toEqual([
      "product-manager", "architect", "designer", "scrum-master", "developer", "qa", "devops", "adversarial-reviewer",
    ]);
    for (const f of methodologyFiles("demo").filter((f) => f.path.startsWith(".claude/agents/"))) {
      expect(f.content).toMatch(/^---\nname: [a-z-]+\ndescription: ".+"\n(tools: .+\n)?(model: .+\n)?---\n/);
    }
  });

  it("writes the rules, context store, decision log, journal, knowledge store, CLAUDE.md and llms.txt", () => {
    const paths = methodologyFiles("demo").map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "CLAUDE.md", "llms.txt", ".ade/rules.md", ".ade/context/README.md", ".ade/context/decisions/README.md", ".ade/session.md", ".ade/knowledge/README.md",
    ]));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("loads the rules from CLAUDE.md, new or existing", () => {
    const claude = methodologyFiles("demo").find((f) => f.path === "CLAUDE.md")!;
    expect(claude.content).toContain("@.ade/rules.md");
    expect(CLAUDE_MD_IMPORT).toContain(CLAUDE_MD_IMPORT_MARKER);
    expect(CLAUDE_MD_IMPORT).toContain("@.ade/rules.md");
  });

  it("restricts the adversarial reviewer to read-only tools", () => {
    const files = methodologyFiles("demo");
    const role = ROLES.find((r) => r.name === "adversarial-reviewer")!;
    // A reviewer that can edit the artifact it judges can make its own verdict
    // come true, so this one is enforced by the allowlist rather than by prose.
    expect(role.tools, "the reviewer must not be able to edit what it judges").toBeTruthy();
    expect(role.tools).not.toMatch(/Write|Edit/);
    expect(role.tools).toMatch(/Bash/);
    expect(files.find((f) => f.path === ".claude/agents/adversarial-reviewer.md")!.content)
      .toContain(`tools: ${role.tools}`);
  });

  it("leaves every producing role, and QA, on the full toolset", () => {
    const files = methodologyFiles("demo");
    // QA writes: the story's Verification section and the journal line it owns.
    // Its lane is narrowed by prose, not by an allowlist that would also stop it
    // recording a verdict.
    for (const name of ["product-manager", "architect", "designer", "scrum-master", "developer", "devops", "qa"]) {
      expect(ROLES.find((r) => r.name === name)!.tools, `${name} should inherit every tool`).toBeUndefined();
      expect(files.find((f) => f.path === `.claude/agents/${name}.md`)!.content).not.toMatch(/^tools:/m);
    }
  });

  it("tells QA what it may write, and what it may never touch", () => {
    const qa = methodologyFiles("demo").find((f) => f.path === ".claude/agents/qa.md")!.content;
    expect(qa).toMatch(/Verification/);
    expect(qa).toContain(".ade/session.md");
    expect(qa, "QA must not edit the code or tests it is judging").toMatch(/[Nn]ever edit code or tests/);
  });

  it("puts cheaper models only on roles that do not judge", () => {
    const files = methodologyFiles("demo");
    const role = (n: string) => ROLES.find((r) => r.name === n)!;
    const agent = (n: string) => files.find((f) => f.path === `.claude/agents/${n}.md`)!.content;

    // QA reads tests and runs a command; the sharding is mechanical.
    expect(role("qa").model).toBe("sonnet");
    expect(agent("qa")).toMatch(/^model: sonnet$/m);
    expect(role("scrum-master").model).toBe("haiku");

    // The reviewer's whole value is catching what everyone else missed. A
    // weaker model rubber-stamps, and "default to BLOCK on any material flaw"
    // is the guarantee the methodology rests on.
    expect(role("adversarial-reviewer").model, "the reviewer must not be downgraded").toBeUndefined();
    expect(agent("adversarial-reviewer")).not.toMatch(/^model:/m);
    expect(role("architect").model, "the architect defines the verification command").toBeUndefined();
  });

  it("names an owner for every journal event", () => {
    const files = methodologyFiles("demo");
    const agent = (n: string) => files.find((f) => f.path === `.claude/agents/${n}.md`)!.content;
    // Plan approved, story sharded, story Done — one owner each, and QA can
    // record its own Done line now that it is not read-only.
    expect(agent("architect")).toContain(".ade/session.md");
    expect(agent("scrum-master")).toContain(".ade/session.md");
    expect(agent("qa")).toContain(".ade/session.md");
    const claude = files.find((f) => f.path === "CLAUDE.md")!.content;
    expect(claude).toContain(".ade/session.md");
    expect(claude).toMatch(/architect/i);
    expect(claude).toMatch(/scrum-master/i);
    expect(claude).toMatch(/\*\*QA\*\* records/);
    // The old hand-off is gone: QA no longer needs the owner to append for it.
    expect(claude).not.toMatch(/owner appends/i);
    expect(RULES_MD).not.toMatch(/QA is read-only/i);
  });

  it("makes the ADE rules win over the BMAD slash commands", () => {
    const claude = methodologyFiles("demo").find((f) => f.path === "CLAUDE.md")!.content;
    expect(claude).toContain("/BMad:");
    expect(claude).toMatch(/never override/i);
  });

  it("gives the coding standards exactly one owner", () => {
    const files = methodologyFiles("demo");
    const architect = files.find((f) => f.path === ".claude/agents/architect.md")!.content;
    expect(files.find((f) => f.path === "CLAUDE.md")!.content).toContain("Coding standards and conventions");
    expect(architect).toContain("Coding standards and conventions");
    expect(architect).not.toContain("and nothing outside it");
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
    for (const a of c) expect(a.file.content).toMatch(/^---\nname: [a-z0-9-]+\ndescription: ".+"\n(tools: .+\n)?(model: .+\n)?---\n/);
  });
});
