import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  ARCHIVE_RULE_MARKER, BMAD_PARAGRAPH, BMAD_SHIPPED, CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER, ROLES, RULES_MD, bmadSection, bmadText, methodologyFiles,
} from "../projectMethodology";
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

  it("has every agent commit as the user, with no AI attribution", () => {
    const rules = RULES_MD.slice(RULES_MD.indexOf("## 2. The non-negotiables"), RULES_MD.indexOf("## 3."));
    expect(rules).toMatch(/own git\s+identity/);
    expect(rules).toMatch(/Co-Authored-By/);
    expect(rules).toMatch(/Generated with/);
  });

  const claudeMd = (methodology: "v4" | "v6") => methodologyFiles("demo", [], methodology).find((f) => f.path === "CLAUDE.md")!.content;

  it("tells a v6 project to use the v6 skills, and names no other version", () => {
    const claude = claudeMd("v6");
    expect(claude).toContain(BMAD_PARAGRAPH.v6);
    expect(methodologyFiles("demo").find((f) => f.path === "CLAUDE.md")!.content, "v6 is the default").toBe(claude);
    for (const old of ["v4", ".bmad-core", "/BMad:"]) expect(claude).not.toContain(old);
    expect(BMAD_PARAGRAPH.v6).toMatch(/^- \*\*BMAD v6\*\* is how work is done in this project\./);
    expect(BMAD_PARAGRAPH.v6).not.toMatch(/optional/i);
    // Their locations win; Done stays with the verification command.
    expect(BMAD_PARAGRAPH.v6).toMatch(/where that differs from the project layout in this file,\s+use the BMAD location/);
    expect(BMAD_PARAGRAPH.v6).toMatch(/a story is Done only when the\s+verification command passes/);
    expect(BMAD_PARAGRAPH.v6).toMatch(/a BMAD skill can \*\*never override\*\* the verification command/);
  });

  it("tells a v4 project about the v4 slash commands, and names no other version", () => {
    const claude = claudeMd("v4");
    expect(claude).toContain(BMAD_PARAGRAPH.v4);
    // No skill: `.bmad-core` is the only "bmad-" a v4 project is told about.
    expect(claude).not.toMatch(/(?<!\.)bmad-[a-z]/);
    for (const other of ["_bmad-output", "v6", ".claude/skills"]) expect(claude).not.toContain(other);
    expect(BMAD_PARAGRAPH.v4).toMatch(/^- \*\*BMAD v4\*\* tasks, checklists, templates and workflows: the `\/BMad:tasks:` slash commands\n {2}\(`\.bmad-core\/`\)\. These are optional helpers/);
    expect(BMAD_PARAGRAPH.v4).toMatch(/a BMAD task can \*\*never override\*\*/);
  });

  it("says nothing about where in the file the paragraph sits, which a section at the end would make false", () => {
    for (const paragraph of Object.values(BMAD_PARAGRAPH)) expect(paragraph).not.toMatch(/\b(above|below)\b/);
    expect(BMAD_PARAGRAPH.v4).toMatch(/the same jobs as ADE's\s+sub-agents,/);
  });

  it("changes nothing of CLAUDE.md between the versions but the BMAD paragraph", () => {
    expect(claudeMd("v4").replace(BMAD_PARAGRAPH.v4, BMAD_PARAGRAPH.v6)).toBe(claudeMd("v6"));
  });

  it("names only skills that are bundled", () => {
    const bundled = readdirSync(resolve(__dirname, "../../../src-tauri/resources/bmad-v6/skills"));
    const named = [...BMAD_PARAGRAPH.v6.matchAll(/`(bmad[a-z-]*)`/g)].map((m) => m[1]);
    expect(named).toEqual(["bmad-prd", "bmad-architecture", "bmad-ux", "bmad-ticket", "bmad-build", "bmad-code-review", "bmad"]);
    for (const skill of named) expect(bundled, skill).toContain(skill);
  });

  it("knows every BMAD paragraph ADE has shipped, as it reads in the file", () => {
    const shipped = [
      // v0.17.0 to v0.17.5.
      "- **BMAD** personas and tasks: the `/BMad:` slash commands (`.bmad-core/`).",
      // Commit 3dc4ace.
      [
        "- **BMAD** personas and tasks: the `/BMad:` slash commands (`.bmad-core/`). These are",
        "  optional helpers you may run inside the flow. The ADE rules in `.ade/rules.md` always",
        "  win: a BMAD task can **never override** the verification command, the Definition of",
        "  Done, or anything in this file. Where they disagree, stop and surface the conflict.",
      ].join("\n"),
      // v0.18.0 to v0.19.0.
      [
        "- **BMAD** tasks, checklists, templates and workflows: the `/BMad:tasks:` slash commands",
        "  (`.bmad-core/`). These are optional helpers you may run inside the flow. BMAD's own",
        "  personas are deliberately not installed — eight of them are the same jobs as the",
        "  sub-agents above, and two definitions of Done is worse than one. The ADE rules in `.ade/rules.md` always",
        "  win: a BMAD task can **never override** the verification command, the Definition of",
        "  Done, or anything in this file. Where they disagree, stop and surface the conflict.",
      ].join("\n"),
      // v0.20.0 and v0.20.1.
      [
        "- **BMAD** tasks, checklists, templates and workflows, in the version `.ade/methodology`",
        "  names. **v4**: the `/BMad:tasks:` slash commands in `.bmad-core/`. **v6**: the skills",
        "  in `.claude/skills/`, with work in `_bmad-output/`. Either way these are optional",
        "  helpers you may run inside the flow. BMAD's own",
        "  personas are deliberately not installed — eight of them are the same jobs as the",
        "  sub-agents above, and two definitions of Done is worse than one. The ADE rules in `.ade/rules.md` always",
        "  win: a BMAD task can **never override** the verification command, the Definition of",
        "  Done, or anything in this file. Where they disagree, stop and surface the conflict.",
      ].join("\n"),
      BMAD_PARAGRAPH.v4,
      BMAD_PARAGRAPH.v6,
    ];
    for (const text of shipped) expect(BMAD_SHIPPED).toContain(text);
    expect(BMAD_SHIPPED).toHaveLength(shipped.length);
    expect(new Set(BMAD_SHIPPED).size).toBe(BMAD_SHIPPED.length);
    // Each is one bullet: nothing after it that a replacement would take with it.
    for (const text of BMAD_SHIPPED) expect(text).toMatch(/^- \*\*BMAD[^\n]*(\n {2}\S[^\n]*)*$/);
  });

  it("wraps the paragraph in a marked section for a CLAUDE.md ADE didn't write", () => {
    expect(bmadSection("v6")).toBe(`<!-- ade:bmad -->\n## BMAD\n\n${BMAD_PARAGRAPH.v6}\n<!-- /ade:bmad -->\n`);
    const text = bmadText("v4");
    expect(text.paragraph).toBe(BMAD_PARAGRAPH.v4);
    expect(text.section).toBe(bmadSection("v4"));
    expect(text.paragraphs).toEqual(BMAD_SHIPPED);
    expect(text.sections).toHaveLength(BMAD_SHIPPED.length);
    expect(text.sections).toContain(bmadSection("v6"));
    expect([text.open, text.close]).toEqual(["<!-- ade:bmad -->", "<!-- /ade:bmad -->"]);
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
    // A settings file setup created is the attribution setting, not the methodology.
    expect(summarize({ created: ["/p/.claude/settings.json"], appendedImport: false, agents: 0, bmadFiles: 0, attributionOff: true }))
      .toBe("settings that turn off AI attribution");
    expect(summarize({ created: new Array(3).fill("x"), appendedImport: false, agents: 1, bmadFiles: 0, attributionOff: true }))
      .toBe("1 agent, the methodology and settings that turn off AI attribution");
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

describe("core role files per methodology", () => {
  const agentFiles = (files: { path: string; content: string }[]) => files.filter((f) => f.path.startsWith(".claude/agents/"));

  it("writes only the v6 task section into a v6 project's agents, and v6 by default", () => {
    for (const files of [methodologyFiles("demo", [], "v6"), methodologyFiles("demo")]) {
      const all = agentFiles(files).map((f) => f.content).join("\n");
      expect(all).toContain("## BMAD tasks (v6)");
      expect(all).not.toContain("## BMAD tasks (v4)");
    }
  });

  it("writes only the v4 task section into a v4 project's agents", () => {
    const files = agentFiles(methodologyFiles("demo", [], "v4"));
    const all = files.map((f) => f.content).join("\n");
    expect(all).toContain("## BMAD tasks (v4)");
    expect(all).not.toContain("## BMAD tasks (v6)");
    const qa = files.find((f) => f.path === ".claude/agents/qa.md")!.content;
    expect(qa).toContain("## Project knowledge");
    expect(qa).toMatch(/^## Boundaries/m);
  });

  it("builds the add-agent catalog for the project's methodology", async () => {
    const { agentCatalog } = await import("../projectMethodology");
    const qa = (m?: "v4" | "v6") => (m ? agentCatalog(m) : agentCatalog()).find((a) => a.id === "qa")!.file.content;
    expect(qa("v4")).toContain("## BMAD tasks (v4)");
    expect(qa("v4")).not.toContain("## BMAD tasks (v6)");
    expect(qa()).toContain("## BMAD tasks (v6)");
    expect(qa()).not.toContain("## BMAD tasks (v4)");
  });

  it("tells agents the archive is read-only history, once", () => {
    const rule =
      "`.ade/archive/` holds earlier BMAD versions of this project. It is\n" +
      "read-only history: never treat it as current documents, never write to it,\n" +
      "and read it only when a person asks about the earlier work.\n";
    expect(RULES_MD).toContain(rule);
    expect(RULES_MD.split(ARCHIVE_RULE_MARKER)).toHaveLength(2);
    // After the Definition of Done, set apart by one blank line.
    expect(RULES_MD).toContain(`no overrides by assertion.\n\n${ARCHIVE_RULE_MARKER}\n## 4. The archive\n`);
    expect(RULES_MD.endsWith(rule)).toBe(true);
    // New projects get it with the rest of the rules.
    expect(methodologyFiles("demo").find((f) => f.path === ".ade/rules.md")!.content).toBe(RULES_MD);
  });
});
