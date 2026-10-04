import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The role definitions have one source: the markdown vendored from ade-setup.
 *
 * They used to have three — src/data/roles.ts, ade-setup, and the sub-agent
 * bodies — and the three drifted. QA declared stewardship of `tests/**` while
 * its own body forbade editing tests; two ids named jobs that already existed
 * under other names; a stale BMAD line had to be patched by hand in two
 * repositories on the same afternoon. roles.ts now parses the markdown and
 * holds no prose, which makes that class of drift impossible rather than
 * merely discouraged.
 *
 * These tests guard the arrangement itself, not the content. Nothing here
 * asserts what a role says — that is ade-setup's to change.
 */
const REPO = resolve(__dirname, "..");
const VENDOR = join(REPO, "vendor", "ade-setup");
const AGENTS = join(VENDOR, "agents");
const ROLES_TS = readFileSync(join(REPO, "src", "data", "roles.ts"), "utf8");

describe("vendored role definitions", () => {
  it("are present and pinned to a resolved ref", () => {
    expect(existsSync(AGENTS), "vendor/ade-setup/agents is missing").toBe(true);
    const version = readFileSync(join(VENDOR, "VERSION"), "utf8");
    // A 40-character sha, not a branch name: a branch is not a pin.
    expect(version, "VERSION must record a resolved sha").toMatch(/^ref: [0-9a-f]{40}$/m);
    expect(version).toMatch(/^repo: https:\/\/github\.com\/\S+$/m);
  });

  it("every definition carries the sections the parser reads", () => {
    const files = readdirSync(AGENTS).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const body = readFileSync(join(AGENTS, f), "utf8");
      expect(body, `${f} title`).toMatch(/^#\s+\S/m);
      expect(body, `${f} ownership`).toContain("## What you own");
      expect(body, `${f} boundaries`).toMatch(/^## (Boundaries|Anti-patterns)/m);
      // Ownership must be data, not prose, or `owns` silently parses empty.
      const section = body.slice(body.indexOf("## What you own"));
      const own = section.slice(0, section.search(/\n## /) + 1 || undefined);
      const parseable = /^- `[^`]+`\s*$/m.test(own) || own.includes("No artifacts");
      expect(parseable, `${f}: "## What you own" has no glob bullets`).toBe(true);
    }
  });
});

describe("the catalog holds no prose of its own", () => {
  it("parses the vendored markdown rather than restating it", () => {
    expect(ROLES_TS).toContain('import.meta.glob("../../vendor/ade-setup/agents/*.md"');
  });

  it("contains no role definition text", () => {
    // The tell of a re-added definition: second-person role prose, or a
    // template literal long enough to be a mission. Catching this is the whole
    // point — a copy here is what drifted last time.
    //
    // Comments are stripped first. The doc comments legitimately quote globs in
    // backticks, and the span between two such quotes is long enough to look
    // like a template literal to any regex that cannot tell code from prose.
    const code = ROLES_TS
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/You are (the )?\*\*/);
    const literals = code.match(/`[^`]{200,}`/g) ?? [];
    expect(literals, "a long template literal in roles.ts looks like prose").toEqual([]);
  });

  it("declares ownership nowhere but the markdown", () => {
    // owns is parsed; a hardcoded globs array would shadow the source.
    expect(ROLES_TS).not.toMatch(/owns: \[\s*"/);
  });
});

/**
 * The knowledge store is the project's, the definitions are everyone's.
 *
 * `.ade/knowledge/<role>.md` holds what one role learned about one project.
 * ade-setup holds who the agents are, shared by every project that uses it. A
 * write in the wrong direction is the failure that matters: project A's
 * specifics would ship into project B as if they were part of the role, and a
 * re-vendor would then overwrite A's own knowledge with them.
 */
describe("project knowledge never flows back into the definitions", () => {
  const AGENT_FILES = readdirSync(AGENTS).filter((f) => f.endsWith(".md"));

  it("ships the template a project is scaffolded from", () => {
    const tpl = join(VENDOR, "templates", "knowledge", "README.md");
    expect(existsSync(tpl), "the knowledge template is not vendored").toBe(true);
    const body = readFileSync(tpl, "utf8");
    // The boundary is the whole point of the template; without it the store
    // becomes a second, private context store that parallel agents cannot read.
    expect(body).toContain(".ade/context/");
    expect(body.toLowerCase()).toContain("committed");
  });

  it("every definition points at its own knowledge file, and only its own", () => {
    for (const f of AGENT_FILES) {
      const rid = f.replace(/\.md$/, "");
      const body = readFileSync(join(AGENTS, f), "utf8");
      const referenced = Array.from(body.matchAll(/\.ade\/knowledge\/([a-z-]+)\.md/g), (m) => m[1]);
      expect(referenced, `${f} does not point at a knowledge file`).not.toEqual([]);
      expect([...new Set(referenced)], `${f} points at another role's knowledge`).toEqual([rid]);
    }
  });

  it("no definition carries project-specific knowledge", () => {
    // A definition is written once and read by every project. Dated entries are
    // the shape a knowledge file takes, so one appearing here means a knowledge
    // write landed in the wrong file.
    for (const f of AGENT_FILES) {
      const body = readFileSync(join(AGENTS, f), "utf8");
      const dated = body.match(/^-?\s*\d{4}-\d{2}-\d{2}\b/m);
      expect(dated, `${f} contains a dated entry, which belongs in a project's store`).toBeNull();
    }
  });
});

/**
 * Everything ADE imports out of vendor/ade-setup must be something
 * sync:agents actually copies.
 *
 * The template was added by hand and the sync script still only knew about
 * `agents/`, so re-vendoring a newer release would have left the template at
 * whatever was there when it was added, while VERSION claimed it came from the
 * pinned ref. A pin that describes only some of what it pinned is worse than no
 * pin, because it is believed.
 */
describe("the sync script covers everything vendored", () => {
  const SYNC = readFileSync(join(REPO, "scripts", "syncAgents.mjs"), "utf8");

  it("lists every top-level directory that exists under vendor/ade-setup", () => {
    const declared = /const VENDORED = \[([^\]]*)\]/.exec(SYNC)?.[1] ?? "";
    expect(declared, "VENDORED not found in syncAgents.mjs").not.toBe("");
    const names = Array.from(declared.matchAll(/"([^"]+)"/g), (m) => m[1]);

    const present = readdirSync(VENDOR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const dir of present) {
      expect(names, `vendor/ade-setup/${dir} is not copied by sync:agents`).toContain(dir);
    }
  });

  it("copies the template that project setup imports", () => {
    // projectMethodology.ts imports this path directly, so a sync that skipped
    // it would ship a stale knowledge store into every new project.
    expect(existsSync(join(VENDOR, "templates", "knowledge", "README.md"))).toBe(true);
    const setup = readFileSync(join(REPO, "src", "lib", "projectMethodology.ts"), "utf8");
    expect(setup).toContain("vendor/ade-setup/templates/knowledge/README.md");
  });
});
