/**
 * Vendor-time patch: rewrite every `uv run …/scripts/<name>.py` call site in the
 * vendored skill markdown to the ADE runtime. Idempotent, and it throws on any
 * call site it does not recognise — upstream churn must not ship unpatched.
 */

/** The runtime scripts the TS port covers. The pinned tree invokes the Task 5b
 * trio (roster, knowledge, validate_manifests) and the Task 5c skill-root
 * scripts in addition to the spec's eight. `git_evidence.py` is a real call
 * site (bmad-retrospective's evidence gathering) with no port in the plan:
 * rewriting it keeps uv out of the tree, and `ade-runtime.mjs` must grow a
 * `git_evidence` subcommand. See task-1-report.md (fix round 1). */
const PORTED = new Set([
  "resolve_config.py", "resolve_customization.py", "config_utils.py",
  "tickets.py", "read_store.py", "render_skill.py", "memlog.py",
  "roster.py", "knowledge.py", "validate_manifests.py",
  // Task 5c: skill-root helper scripts (see the plan task for the full list).
  "recon_kit.py", "init_skill.py", "brain.py", "process_template.py",
  "wake.py", "scan_scripts.py", "scan_paths.py", "resolve_party.py",
  "go.py", "scan_legacy_module.py", "registry.py", "read_session_log.py",
  "pick_methods.py", "list_customizable_skills.py", "lint_spine.py",
  "resolve_personas.py", "run_triggers.py", "x.py",
  "git_evidence.py",
]);

/** Lines that legitimately keep `uv run`: dev tooling with external deps
 * (tiktoken), eval tooling, and documentation prose. Anything else throws.
 * The pinned tree forces the entries past `uv run pytest`; every one was
 * checked against the lines that actually remain (task-1-report.md, fix
 * round 1):
 *   setup.py                  — the spec replaces setup with the Rust-side
 *                               scaffold; not ported as an agent-facing command.
 *   convert_cases.py,         — eval tooling, the same ruled category as
 *   aggregate_benchmark.py      run_evals.py.
 *   init-sanctum.py           — memory-agent template asset; no such script
 *                               ships at the pin, so there is nothing to port.
 *   {script}.py, <path>       — template placeholders.
 *   `uv run`                  — prose naming the phrase without a call site. */
const ALLOWED_UV = [
  "count_tokens.py", "prepass.py", "run_evals.py", "word_metrics.py",
  "<name>.py", "uv run pytest",
  "setup.py", "convert_cases.py", "aggregate_benchmark.py",
  "init-sanctum.py", "{script}.py", "<path>", "`uv run`",
];

export function rewriteCallSite(line: string): string {
  if (!line.includes("uv run")) return line;
  // Real call sites take three shapes: `uv run --flags "{project-root}/_bmad/scripts/x.py"`,
  // `uv run {project-root}/_bmad/<module>/scripts/x.py`, and
  // `uv run {skill-root}/scripts/x.py`. Optional flags and quoting sit between
  // `uv run` and the path. The guard is a zero-width lookbehind: a consuming
  // guard would be swallowed by the replacement below, dropping the delimiter
  // before `uv run` (the plan's own first test catches exactly that).
  const m = /(?<![a-z])uv run(?:\s+(?:--?[\w-]+|"[^"]*"|'[^']*'))*\s+"?(\{project-root\}\/_bmad\/(?:\w+\/)?scripts\/([\w.]+\.py)|\{skill-root\}\/scripts\/([\w.]+\.py))"?/.exec(line);
  if (!m) return line;
  const script = m[2] ?? m[3];
  if (ALLOWED_UV.includes(script)) return line;
  if (!PORTED.has(script)) {
    throw new Error(`no TS port for ${script}; call site cannot be patched: ${line.slice(0, 120)}`);
  }
  const skillRoot = m[3] ? " --skill-root {skill-root}" : "";
  return line.replace(m[0], `node {project-root}/_bmad/ade-runtime.mjs ${script.replace(/\.py$/, "")}${skillRoot}`);
}

/** The CLI half. Declared, not inline, because this file is CJS here (no
 * `"type": "module"`): `tsx` refuses top-level await in a CJS output. */
async function main(): Promise<void> {
  const { readFileSync, writeFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = process.argv[2];
  /** Every markdown file under a directory, recursively: call sites live in
   * nested references/*.md too, and an unpatched one would ship Python to
   * users. */
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : []);
  const files = walk(root);
  /** An invocation, wherever it appears — inline in a span, inside a fenced
   * block, or continued across lines with trailing backslashes. Bounded to the
   * invocation itself, so the replacement leaves the surrounding text and the
   * arguments after the script path intact. A span-only pass misses every
   * fenced-block call site — 12 in the pinned tree, including the five
   * render_skill bootstraps it exists to patch (task-1-report.md, fix round 1). */
  const CALL = /(?<![a-z])uv run(?:\s+(?:--?[\w-]+|"[^"]*"|'[^']*'))*\s+"?(\{project-root\}\/_bmad\/(?:\w+\/)?scripts\/[\w.]+\.py|\{skill-root\}\/scripts\/[\w.]+\.py)"?/g;
  for (const p of files) {
    const body = readFileSync(p, "utf8");
    // rewriteCallSite returns allowlisted and non-call spans unchanged; the
    // post-pass below rejects any real `uv run` left over.
    const next = body.replace(CALL, (site) => rewriteCallSite(site));
    if (next !== body) writeFileSync(p, next);
  }
  /** Fail-loudly post-pass: any remaining `uv run` in any walked file must be
   * on the allowlist or the patch cannot claim the tree ships Python-free. */
  for (const p of files) {
    const body = readFileSync(p, "utf8");
    for (const line of body.split("\n")) {
      if (!/\buv run\b/.test(line)) continue;
      if (ALLOWED_UV.some((a) => line.includes(a))) continue;
      console.error(`unpatched uv run in ${p}: ${line.trim().slice(0, 120)}`);
      process.exit(1);
    }
  }
}

if (process.argv[1]?.endsWith("patchBmadSkills.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
