import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Agent definitions name the BMAD tasks that do their job, so an agent reaches
 * for create-next-story instead of improvising a story format. That only holds
 * while the names are real: BMAD is vendored and pinned, and a version bump
 * that renames or drops a task would otherwise leave definitions pointing at a
 * /BMad:tasks: command that does not exist, which fails at the worst moment —
 * inside a running agent, as a silent no-op.
 */
const REPO = resolve(__dirname, "..");
const AGENTS = join(REPO, "vendor", "ade-setup", "agents");
const TASKS = join(REPO, "src-tauri", "resources", "bmad", "bmad-core", "tasks");

/** Task names referenced from a "## BMAD tasks (v4)" section, as `- \`name\` — why`. */
function referencedTasks(body: string): string[] {
  const start = body.indexOf("## BMAD tasks (v4)");
  if (start < 0) return [];
  const rest = body.slice(start + 1);
  const next = rest.search(/^## /m);
  const section = next < 0 ? rest : rest.slice(0, next);
  return Array.from(section.matchAll(/^- `([a-z0-9-]+)`/gm), (m) => m[1]);
}

describe("BMAD task references", () => {
  const files = readdirSync(AGENTS).filter((f) => f.endsWith(".md"));

  it("is not vacuous — some definitions do reference tasks", () => {
    const total = files.reduce((n, f) => n + referencedTasks(readFileSync(join(AGENTS, f), "utf8")).length, 0);
    expect(total, "no agent references any BMAD task").toBeGreaterThan(10);
  });

  it("every referenced task ships in bmad-core/tasks", () => {
    for (const f of files) {
      for (const task of referencedTasks(readFileSync(join(AGENTS, f), "utf8"))) {
        expect(existsSync(join(TASKS, `${task}.md`)), `${f} names ${task}, which BMAD does not ship`).toBe(true);
      }
    }
  });

  it("gives the path for providers that have no slash commands", () => {
    // /BMad:tasks: is Claude Code only. An ollama agent needs the file.
    for (const f of files) {
      const body = readFileSync(join(AGENTS, f), "utf8");
      if (!body.includes("## BMAD tasks (v4)")) continue;
      expect(body, `${f} gives only the Claude Code command`).toContain(".bmad-core/tasks/");
    }
  });

  it("keeps the verifier out of implementation", () => {
    // apply-qa-fixes implements what the gate asked for. A verifier that
    // repairs what it measures can make its own verdict come true.
    const qa = readFileSync(join(AGENTS, "qa.md"), "utf8");
    expect(referencedTasks(qa)).not.toContain("apply-qa-fixes");
    expect(referencedTasks(readFileSync(join(AGENTS, "developer.md"), "utf8"))).toContain("apply-qa-fixes");
  });

  it("every v6 task citation names a skill in the vendored v6 tree", () => {
    const skills = readdirSync(join(__dirname, "../src-tauri/resources/bmad-v6/skills"));
    for (const f of files) {
      const body = readFileSync(join(AGENTS, f), "utf8");
      const v6 = body.split("## BMAD tasks (v6)")[1]?.split(/^## /m)[0] ?? "";
      for (const m of v6.matchAll(/`(bmad[\w-]+)`/g)) {
        expect(skills, `${f} cites ${m[1]}`).toContain(m[1]);
      }
    }
  });

  it("the QA v6 section names the gate file by ticket id", () => {
    // Review Focus #4: an agent must know the filename is the ticket id.
    const qa = readFileSync(join(AGENTS, "qa.md"), "utf8");
    const v6 = qa.split("## BMAD tasks (v6)")[1]?.split(/^## /m)[0] ?? "";
    expect(v6).toContain(".ade/gates/<ticket-id>.yml");
    expect(v6).toContain("PASS|CONCERNS|FAIL|WAIVED");
  });

  it("the guide never sends v6 users to v4 task files", () => {
    for (const f of ["../docs/guide/agents.md", "../docs/guide/settings.md", "../docs/guide/project-setup.md"]) {
      const body = readFileSync(join(__dirname, f), "utf8");
      for (const line of body.split("\n")) {
        if (line.includes(".bmad-core/tasks/") || line.includes("/BMad:tasks:")) {
          expect(line.includes("v4"), `${f}: v4-only path without v4 context`).toBe(true);
        }
      }
    }
  });
});
