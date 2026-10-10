import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rewriteCallSite } from "../patchBmadSkills";

describe("patchBmadSkills", () => {
  it("rewrites uv run script calls to the ADE runtime", () => {
    const line = "`uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key core.output_folder`";
    expect(rewriteCallSite(line)).toBe(
      "`node {project-root}/_bmad/ade-runtime.mjs resolve_config --project-root {project-root} --key core.output_folder`",
    );
  });

  it("is idempotent — a patched line comes back unchanged", () => {
    const patched = "`node {project-root}/_bmad/ade-runtime.mjs resolve_config --project-root {project-root} --key core.output_folder`";
    expect(rewriteCallSite(patched)).toBe(patched);
  });

  it("rewrites the flag-and-quote form the skill bootstraps use", () => {
    const line = "`uv run --no-cache \"{project-root}/_bmad/scripts/render_skill.py\" --project-root \"{project-root}\" --skill \"{skill-root}\"`";
    expect(rewriteCallSite(line)).toBe(
      "`node {project-root}/_bmad/ade-runtime.mjs render_skill --project-root \"{project-root}\" --skill \"{skill-root}\"`",
    );
  });

  it("rewrites module-path and skill-root call sites", () => {
    expect(rewriteCallSite("`uv run {project-root}/_bmad/method/scripts/tickets.py --project-root {project-root} next`"))
      .toBe("`node {project-root}/_bmad/ade-runtime.mjs tickets --project-root {project-root} next`");
    expect(rewriteCallSite("`uv run {skill-root}/scripts/lint_spine.py --project-root {project-root}`"))
      .toBe("`node {project-root}/_bmad/ade-runtime.mjs lint_spine --skill-root {skill-root} --project-root {project-root}`");
  });

  it("throws on a call site whose script has no TS port instead of shipping it unpatched", () => {
    expect(() => rewriteCallSite("`uv run {project-root}/_bmad/scripts/some_new_script.py --weird`"))
      .toThrow(/no TS port/);
  });

  it("leaves the allowlisted dev-tooling forms untouched", () => {
    for (const line of [
      "`uv run {skill-root}/scripts/count_tokens.py …`",
      "`uv run pytest`",
    ]) expect(rewriteCallSite(line)).toBe(line);
  });
});

describe("patchBmadSkills CLI", () => {
  const repo = process.cwd();
  const script = join(repo, "scripts/patchBmadSkills.ts");
  const run = (dir: string) =>
    execFileSync("npx", ["--no-install", "tsx", script, dir], { cwd: repo, encoding: "utf8" });

  it("exits 1 rather than leaving an unknown uv run line unpatched", () => {
    const dir = mkdtempSync(join(tmpdir(), "bmad-patch-fail-"));
    try {
      writeFileSync(join(dir, "broken.md"), "# t\n\n```\nuv run ./some_tool.sh --weird\n```\n");
      let err: (Error & { status?: number; stderr?: string }) | undefined;
      try {
        run(dir);
      } catch (e) {
        err = e as never;
      }
      expect(err, "the patch CLI must fail on an unpatched uv run line").toBeDefined();
      expect(err?.status).toBe(1);
      expect(String(err?.stderr)).toMatch(/unpatched uv run/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("exits 0 on a tree whose only uv run lines are allowlisted, rewriting the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "bmad-patch-clean-"));
    try {
      const patched = join(dir, "call-site.md");
      writeFileSync(
        patched,
        "# t\n\n```\nuv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root}\n```\n",
      );
      writeFileSync(join(dir, "cost.md"), "Measure it: `uv run {skill-root}/scripts/count_tokens.py {target}`.\n");
      expect(() => run(dir)).not.toThrow();
      const out = readFileSync(patched, "utf8");
      expect(out).toContain("node {project-root}/_bmad/ade-runtime.mjs resolve_config");
      expect(out).not.toContain("uv run");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
