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

  it("throws on an unrecognised uv run call site instead of shipping it unpatched", () => {
    expect(() => rewriteCallSite("`uv run {project-root}/_bmad/scripts/some_new_script.py --weird`"))
      .toThrow(/unrecognised/);
  });
});
