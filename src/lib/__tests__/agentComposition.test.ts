import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { composeRoleMarkdown, roleFileName } from "../agentComposition";
import { getRole, type Role } from "../../data/roles";
import { getDomain } from "../../data/domains";

const architect = getRole("architect")!;
const security = getDomain("security")!;

describe("composeRoleMarkdown", () => {
  it("hands over the definition verbatim", () => {
    const md = composeRoleMarkdown(architect);
    expect(md.includes(architect.title)).toBe(true);
    // Verbatim, not rebuilt: a recomposition would drop the sections this
    // codebase does not model.
    expect(md).toBe(architect.body);
  });

  it("lists every owned artifact", () => {
    const md = composeRoleMarkdown(architect);
    for (const glob of architect.owns) {
      expect(md.includes(glob), `missing owned artifact ${glob}`).toBe(true);
    }
  });

  it("appends the domain focus when a domain is given", () => {
    const md = composeRoleMarkdown(architect, security);
    expect(md.includes(security.focus)).toBe(true);
    expect(md.includes(security.title)).toBe(true);
  });

  it("omits any domain section when no domain is given", () => {
    expect(composeRoleMarkdown(architect).includes("## Focus")).toBe(false);
  });

  it("keeps the role's own text intact when a domain is added", () => {
    const withDomain = composeRoleMarkdown(architect, security);
    const boundaries = architect.body.slice(architect.body.search(/^## Boundaries/m));
    expect(boundaries.length).toBeGreaterThan(40);
    expect(withDomain.includes(boundaries.trimEnd())).toBe(true);
  });

  it("produces markdown headings, not a flat blob", () => {
    const md = composeRoleMarkdown(architect, security);
    expect(md.split("\n").filter((l) => l.startsWith("#")).length).toBeGreaterThan(2);
  });
});

const dual = (body: string): Role => ({ id: "qa", title: "QA", body, owns: [], summary: "" });
const DUAL = "# QA\n\nintro\n\n## BMAD tasks (v4)\nv4 stuff\n\n## BMAD tasks (v6)\nv6 stuff\n";

describe("composeRoleMarkdown per methodology", () => {
  it("emits only the v6 task section for v6 projects", () => {
    const out = composeRoleMarkdown(dual(DUAL), undefined, "v6");
    expect(out).toContain("## BMAD tasks (v6)");
    expect(out).toContain("v6 stuff");
    expect(out).not.toContain("v4 stuff");
    expect(out).not.toContain("## BMAD tasks (v4)");
  });

  it("emits only the v4 task section for v4 projects", () => {
    const out = composeRoleMarkdown(dual(DUAL), undefined, "v4");
    expect(out).toContain("## BMAD tasks (v4)");
    expect(out).toContain("v4 stuff");
    expect(out).not.toContain("v6 stuff");
    expect(out).not.toContain("## BMAD tasks (v6)");
  });

  it("defaults to v6", () => {
    const out = composeRoleMarkdown(dual(DUAL));
    expect(out).toContain("v6 stuff");
    expect(out).not.toContain("v4 stuff");
  });

  it("keeps the sections after the task sections in both modes", () => {
    const md = DUAL + "\n## Project knowledge\nknow\n\n## Boundaries & anti-patterns\n- never this\n";
    for (const m of ["v4", "v6"] as const) {
      const out = composeRoleMarkdown(dual(md), undefined, m);
      expect(out, m).toContain("## Project knowledge\nknow");
      expect(out, m).toContain("## Boundaries & anti-patterns\n- never this");
      expect(out.indexOf("## Boundaries"), m).toBeGreaterThan(out.indexOf("## BMAD tasks"));
    }
    expect(composeRoleMarkdown(dual(md), undefined, "v4")).not.toContain("v6 stuff");
  });

  it("keeps the domain focus with the filtered section", () => {
    const out = composeRoleMarkdown(dual(DUAL), security, "v4");
    expect(out).toContain("v4 stuff");
    expect(out).not.toContain("v6 stuff");
    expect(out).toContain(security.focus);
  });

  it("filters CRLF role files too", () => {
    const crlf = (DUAL + "\n## Boundaries\n- keep\n").replace(/\n/g, "\r\n");
    for (const [m, other] of [["v4", "v6"], ["v6", "v4"]] as const) {
      const out = composeRoleMarkdown(dual(crlf), undefined, m);
      expect(out, m).toContain(`${m} stuff`);
      expect(out, m).not.toContain(`${other} stuff`);
      expect(out, m).not.toContain(`## BMAD tasks (${other})`);
      expect(out, m).toContain("## Boundaries\r\n- keep");
    }
  });

  it("passes roles without BMAD task sections through unchanged", () => {
    const role = dual("# SRE\nplain role\n");
    expect(composeRoleMarkdown(role, undefined, "v6")).toBe(role.body);
    expect(composeRoleMarkdown(role, undefined, "v4")).toBe(role.body);
  });

  it("composes each of the eight vendored roles for either methodology with a non-empty section", () => {
    const AGENTS = join(__dirname, "../../../vendor/ade-setup/agents");
    const names = ["analyst", "designer", "developer", "brainstorming-architect", "product-owner", "qa", "scrum-master", "technical-writer"];
    for (const name of names) {
      const md = readFileSync(join(AGENTS, `${name}.md`), "utf8");
      for (const [m, other] of [["v4", "v6"], ["v6", "v4"]] as const) {
        const out = composeRoleMarkdown(dual(md), undefined, m);
        expect(out, `${name} lost its ${m} section`).toContain(`## BMAD tasks (${m})`);
        const section = out.split(`## BMAD tasks (${m})`)[1].split(/^## /m)[0];
        expect(section.trim().length, `${name} ${m} section is empty`).toBeGreaterThan(20);
        expect(out, `${name} ${m} composition leaked ${other}`).not.toContain(`## BMAD tasks (${other})`);
        expect(out, `${name} ${m} lost Project knowledge`).toContain("## Project knowledge");
        expect(out, `${name} ${m} lost Boundaries`).toMatch(/^## Boundaries/m);
      }
    }
  });
});

describe("roleFileName", () => {
  it("names a bare role file", () => {
    expect(roleFileName("architect")).toBe("architect.md");
  });

  it("names a role-and-domain file", () => {
    expect(roleFileName("architect", "security")).toBe("architect-security.md");
  });

  it("adds the methodology when given", () => {
    expect(roleFileName("qa", undefined, "v4")).toBe("qa.v4.md");
    expect(roleFileName("qa", "security", "v6")).toBe("qa-security.v6.md");
  });
});
