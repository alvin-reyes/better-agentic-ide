/**
 * Vendor-time patch: rewrite every `uv run …/scripts/<name>.py` call site in the
 * vendored SKILL.md files to the ADE runtime. Idempotent, and it throws on any
 * call site it does not recognise — upstream churn must not ship unpatched.
 */
const CALL = /uv run \{project-root\}\/_bmad\/scripts\/([\w.]+\.py)([\s\S]*?)(?=`|$)/g;

/** The runtime scripts the TS port covers (spec: architecture section). */
const PORTED = new Set([
  "resolve_config.py", "resolve_customization.py", "config_utils.py",
  "tickets.py", "read_store.py", "render_skill.py", "memlog.py",
  // Called by the vendored tree at the pinned revision (main @ bda3c59) but
  // missing from the spec's port list. Vendoring cannot complete without
  // rewriting these — an unpatched call site would ship Python to users — so
  // `ade-runtime.mjs` must grow `roster`, `knowledge` and `validate_manifests`
  // too. See task-1-report.md.
  "roster.py", "knowledge.py", "validate_manifests.py",
]);

export function rewriteCallSite(line: string): string {
  if (!line.includes("uv run")) return line;
  const m = /_bmad\/scripts\/([\w.]+\.py)/.exec(line);
  if (!m) throw new Error(`unrecognised uv run call site: ${line.slice(0, 120)}`);
  const script = m[1];
  if (!PORTED.has(script)) {
    throw new Error(`unrecognised uv run call site — no TS port for ${script}; call site cannot be patched: ${line.slice(0, 120)}`);
  }
  return line.replace(
    new RegExp(`uv run \\{project-root\\}\\/_bmad\\/scripts\\/${script.replace(".", "\\.")}`, "g"),
    `node {project-root}/_bmad/ade-runtime.mjs ${script.replace(/\.py$/, "")}`,
  );
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
  /** An invocation, wherever it appears — inline (between backticks) or in a
   * fenced block, continued across lines with trailing backslashes. The script
   * token must be real, so the generic call *form* the tooling docs spell out
   * (`.../scripts/<name>.py`) is documentation, not a call site, and is left
   * alone; anything script-shaped is still rewritten or rejected. */
  const CALL = /uv run \{project-root\}\/_bmad\/scripts\/[\w.]+\.py(?:(?!uv run)[^\n`\\]|\\\n)*/g;
  for (const p of walk(root)) {
    const body = readFileSync(p, "utf8");
    const next = body.replace(CALL, rewriteCallSite);
    if (next !== body) writeFileSync(p, next);
  }
}

if (process.argv[1]?.endsWith("patchBmadSkills.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
