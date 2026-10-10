# BMAD v6 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor BMAD v6 (upstream main @ bda3c59, 6.13.0-next) into ADE, port its runtime scripts to TypeScript, and scaffold working v6 projects — no Python/uv anywhere.

**Architecture:** The vendored `skills/` tree is patched at vendor time so every `uv run` call site becomes `node _bmad/ade-runtime.mjs`, a single dependency-free bundle of the TS port. The same TS module powers the app UI and the scaffolded per-project CLI. Scaffolding mirrors v6's own setup.py output.

**Tech Stack:** TypeScript (vitest), Rust (Tauri), Node 18+, `smol-toml` (bundled), bash vendor script.

**Spec:** `docs/superpowers/specs/2026-10-10-bmad-v6-adoption-design.md`

## Global Constraints

- Node 18+ on user machines; never require Python or uv at runtime.
- Vendored skills pinned at upstream main SHA `bda3c59` (6.13.0-next); `VERSION` file stamps the SHA and label.
- Nothing overwrites existing files during scaffold.
- The patch script must fail loudly on any `uv run` call site it cannot rewrite.
- The runtime bundle `_bmad/ade-runtime.mjs` is a single dependency-free ESM file.
- Existing v4 behavior (`.bmad-core/`, v4 parsers, v4 tests) must stay green.
- Commit message style follows repo history (conventional prefixes).

## Review Focus

1. **A skill gains a new `uv run` form upstream** — the patch script must reject it (exit non-zero, name the file) so it cannot ship unpatched; pinned by a patch-script unit test with an unknown call site.
2. **`tickets.py mark done` on a ticket that never had a plan** — v6's own behavior (status lives in the plan) must be preserved: the TS port reports the same JSON as Python, pinned by a golden test.
3. **A project scaffolded before this change opens in the new app** — the `.ade/methodology` marker is absent; detection must fall back to `.bmad-core/` ⇒ v4, pinned by a scaffold temp-dir test.
4. **`after` references a ticket id that does not exist** — `tickets.py` validates dependencies; the port must report the same error shape, pinned by a golden test.
5. **Scaffold into a directory that already contains `_bmad/config.toml`** — nothing overwrites; setup reports the existing file as kept, pinned by a scaffold temp-dir test.

---

### Task 1: Vendor the v6 skills (main @ bda3c59) and patch them

**Files:**
- Create: `scripts/vendor-bmad-v6.sh`
- Create: `scripts/patchBmadSkills.ts`
- Create: `scripts/__tests__/patchBmadSkills.test.ts`
- Create (generated): `src-tauri/resources/bmad-v6/skills/**`, `src-tauri/resources/bmad-v6/VERSION`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `src-tauri/resources/bmad-v6/skills/` (33 skill dirs, `uv run` call sites rewritten), `src-tauri/resources/bmad-v6/VERSION` containing `bda3c59 6.13.0-next`.

- [ ] **Step 1: Write the failing test for the patch script**

`scripts/__tests__/patchBmadSkills.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/patchBmadSkills.test.ts`
Expected: FAIL — `rewriteCallSite` is not exported.

- [ ] **Step 3: Implement the patch script**

`scripts/patchBmadSkills.ts`:

```ts
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
  "resolve_personas.py", "run_triggers.py", "x.py", "git_evidence.py",
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

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/__tests__/patchBmadSkills.test.ts`
Expected: PASS (9 tests — 7 matcher shapes + 2 CLI post-pass tests).

- [ ] **Step 5: Write the vendor script**

`scripts/vendor-bmad-v6.sh`:

```bash
#!/usr/bin/env bash
# Re-vendor BMAD v6 skills. Manual step, same policy as v4's vendoring.
# Pinned to a fixed upstream commit: the v6 tags carry the old layout, and
# `--branch <sha>` does not work on clone, so clone main and check out.
set -euo pipefail
SHA="${1:-bda3c59}"
LABEL="${2:-6.13.0-next}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src-tauri/resources/bmad-v6"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet https://github.com/bmad-code-org/BMAD-METHOD "$TMP/bmad"
git -C "$TMP/bmad" checkout --quiet "$SHA"
mkdir -p "$DEST"
rm -rf "$DEST/skills"
cp -R "$TMP/bmad/skills" "$DEST/skills"
echo "$SHA $LABEL" > "$DEST/VERSION"

npx tsx "$ROOT/scripts/patchBmadSkills.ts" "$DEST/skills"
cd "$ROOT" && npx vitest run scripts/__tests__/patchBmadSkills.test.ts
echo "vendored $SHA ($LABEL) at $DEST"
```

- [ ] **Step 6: Run the vendor script**

Run: `bash scripts/vendor-bmad-v6.sh bda3c59 6.13.0-next`
Expected: exit 0; `src-tauri/resources/bmad-v6/skills/` holds 33 dirs; `VERSION` reads `bda3c59 6.13.0-next`; the patch ran (check `grep -rc "ade-runtime.mjs" src-tauri/resources/bmad-v6/skills --include="*.md" | grep -v ":0" | wc -l` is ≥ 1 — tree-wide count, since bmad/SKILL.md itself has no project-root call site at this pin).

- [ ] **Step 7: Add the CI pin check**

In `.github/workflows/ci.yml`, add a job after the frontend tests:

```yaml
  vendored-bmad:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify vendored v6 tree matches the pinned commit
        run: |
          SHA=$(awk '{print $1}' src-tauri/resources/bmad-v6/VERSION)
          rm -rf /tmp/bmad && git clone --quiet https://github.com/bmad-code-org/BMAD-METHOD /tmp/bmad
          git -C /tmp/bmad checkout --quiet "$SHA"
          diff -r --exclude="*.md" src-tauri/resources/bmad-v6/skills /tmp/bmad/skills
          echo "vendored tree matches $SHA"
      - name: No unpatched uv run call sites in vendored markdown
        run: |
          if grep -rn "uv run" src-tauri/resources/bmad-v6/skills/ --include="*.md" \
            | grep -v -e "count_tokens.py" -e "prepass.py" -e "run_evals.py" -e "word_metrics.py" \
                     -e "<name>.py" -e "uv run pytest" -e "setup.py" -e "convert_cases.py" \
                     -e "aggregate_benchmark.py" -e "init-sanctum.py" -e "{script}.py" \
                     -e "<path>" -e '`uv run`'; then
            echo "unpatched uv run call site in vendored markdown" && exit 1
          fi
          echo "no unpatched call sites"
```

- [ ] **Step 8: Commit**

```bash
git add scripts/vendor-bmad-v6.sh scripts/patchBmadSkills.ts scripts/__tests__/patchBmadSkills.test.ts .github/workflows/ci.yml src-tauri/resources/bmad-v6
git commit -m "feat(bmad-v6): vendor v6 skills (main @ bda3c59) with patched runtime call sites"
```

---

### Task 2: Add the TOML dependency and the filesystem abstraction

**Files:**
- Modify: `package.json` (add `smol-toml`)
- Create: `src/lib/bmadRuntime/fs.ts`
- Test: `src/lib/bmadRuntime/__tests__/fs.test.ts`

**Interfaces:**
- Produces:
  - `import { parse as parseToml } from "smol-toml"` available app-wide.
  - `fs.ts` exports `export interface Fs { readText(p: string): Promise<string>; writeText(p: string, body: string): Promise<void>; list(p: string): Promise<string[]>; exists(p: string): Promise<boolean>; mkdir(p: string): Promise<void>; }` and `export function realFs(): Fs` (Node fs wrapper for the CLI bundle) and `export function memFs(): Fs` (in-memory map for tests).

- [ ] **Step 1: Write the failing test**

`src/lib/bmadRuntime/__tests__/fs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { memFs } from "../fs";

describe("memFs", () => {
  it("round-trips text and lists directories", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a");
    await fs.writeText("/p/a/f.txt", "hello");
    expect(await fs.readText("/p/a/f.txt")).toBe("hello");
    expect(await fs.exists("/p/a")).toBe(true);
    expect(await fs.list("/p/a")).toEqual(["f.txt"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/fs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Install smol-toml**

Run: `npm install smol-toml`
Expected: `package.json` and lockfile updated.

- [ ] **Step 4: Implement fs.ts**

```ts
/** Minimal filesystem surface so the runtime port is testable without Tauri or Node. */
export interface Fs {
  readText(p: string): Promise<string>;
  writeText(p: string, body: string): Promise<void>;
  list(p: string): Promise<string[]>;
  exists(p: string): Promise<boolean>;
  mkdir(p: string): Promise<void>;
}

export function memFs(): Fs {
  const files = new Map<string, string>();
  const mkdir = async (p: string) => { files.set(p.endsWith("/") ? p : p + "/", ""); };
  return {
    readText: async (p) => files.get(p) ?? Promise.reject(new Error(`no such file: ${p}`)),
    writeText: async (p, body) => { files.set(p, body); },
    list: async (p) =>
      [...files.keys()]
        .filter((k) => k.startsWith(p + "/") && !k.endsWith("/"))
        .map((k) => k.slice(p.length + 1)),
    exists: async (p) => files.has(p) || files.has(p + "/"),
    mkdir,
  };
}

export function realFs(): Fs {
  return {
    readText: (p) => import("node:fs/promises").then((f) => f.readFile(p, "utf8")),
    writeText: (p, body) => import("node:fs/promises").then((f) => f.writeFile(p, body)),
    list: (p) => import("node:fs/promises").then((f) => f.readdir(p)),
    exists: (p) => import("node:fs/promises").then((f) => f.access(p).then(() => true, () => false)),
    mkdir: (p) => import("node:fs/promises").then((f) => f.mkdir(p, { recursive: true }).then(() => undefined)),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/fs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/bmadRuntime/fs.ts src/lib/bmadRuntime/__tests__/fs.test.ts
git commit -m "feat(bmad-v6): filesystem abstraction for the runtime port"
```

---

### Task 3: Port config resolution (config_utils + resolve_config + resolve_customization)

**Files:**
- Create: `src/lib/bmadRuntime/config.ts`
- Test: `src/lib/bmadRuntime/__tests__/config.test.ts`
- Create: `src/lib/bmadRuntime/__tests__/goldens/config/*.json` (generated in Step 1)

**Interfaces:**
- Consumes: `parseToml` from `smol-toml`, `Fs`.
- Produces: `export async function loadCentralConfig(projectRoot: string, fs: Fs): Promise<Record<string, unknown>>` — merges `_bmad/config.toml` ← `_bmad/custom/config.toml` ← `_bmad/custom/config.user.toml` (required base, later layers override; arrays keyed-merged by `code`/`id` when every item carries one, else appended). Also `export async function resolveCustomization(projectRoot: string, skillRoot: string, skill: string, fs: Fs): Promise<Record<string, unknown>>` — merges `{skillRoot}/customize.toml` (required) ← `_bmad/custom/<skill>.toml` ← `<skill>.user.toml`.

- [ ] **Step 1: Generate goldens from the real Python**

Run once (dev machine has uv; output is committed so CI never needs it):

```bash
cd /tmp/bmad-v6 && uv run skills/bmad/scripts/setup.py --project-root /tmp/golden-proj --skill /tmp/bmad-v6/skills/bmad >/dev/null
mkdir -p src/lib/bmadRuntime/__tests__/goldens/config
uv run /tmp/golden-proj/_bmad/scripts/resolve_config.py --project-root /tmp/golden-proj > \
  src/lib/bmadRuntime/__tests__/goldens/config/central.json
printf '[core]\nactive_initiative = "initiative-checkout"\n' > /tmp/golden-proj/_bmad/custom/config.user.toml
uv run /tmp/golden-proj/_bmad/scripts/resolve_config.py --project-root /tmp/golden-proj > \
  src/lib/bmadRuntime/__tests__/goldens/config/central-with-user.json
uv run /tmp/golden-proj/_bmad/scripts/resolve_customization.py --project-root /tmp/golden-proj --skill /tmp/bmad-v6/skills/bmad-build > \
  src/lib/bmadRuntime/__tests__/goldens/config/customization.json
```

Expected: three JSON files exist; `central-with-user.json` contains `"active_initiative": "initiative-checkout"`.

- [ ] **Step 2: Write the failing test**

`src/lib/bmadRuntime/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCentralConfig, resolveCustomization } from "../config";
import { memFs } from "../fs";

const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/config", name), "utf8"));

describe("config port", () => {
  it("matches the Python central resolution on the seeded project", async () => {
    const fs = memFs();
    // Mirror /tmp/golden-proj: seed from the vendored template the way setup.py does.
    const template = await readFile(join(__dirname, "../../../../src-tauri/resources/bmad-v6/skills/bmad/assets/config.template.toml"), "utf8");
    await fs.mkdir("/p/_bmad/custom");
    await fs.writeText("/p/_bmad/config.toml", template.replaceAll("{project-root}", "/p"));
    expect(await loadCentralConfig("/p", fs)).toEqual(await golden("central.json"));
  });

  it("matches the Python central resolution after a user override", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad/custom");
    await fs.writeText("/p/_bmad/config.toml", (await readFile(join(__dirname, "../../../../src-tauri/resources/bmad-v6/skills/bmad/assets/config.template.toml"), "utf8")).replaceAll("{project-root}", "/p"));
    await fs.writeText("/p/_bmad/custom/config.user.toml", '[core]\nactive_initiative = "initiative-checkout"\n');
    expect(await loadCentralConfig("/p", fs)).toEqual(await golden("central-with-user.json"));
  });

  it("matches the Python customization resolution", async () => {
    const fs = memFs();
    // customize.toml lives at the skill root; _bmad/custom/ layers sit beside
    // the central config. Mirror the layout /tmp/golden-proj had when the
    // golden was captured, then compare — the golden is authoritative.
    const skillRoot = join(__dirname, "../../../../src-tauri/resources/bmad-v6/skills/bmad-build");
    await fs.mkdir("/p/_bmad/custom");
    expect(await resolveCustomization("/p", skillRoot, "bmad-build", fs)).toEqual(await golden("customization.json"));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/config.test.ts`
Expected: FAIL — `config.ts` not found.

- [ ] **Step 4: Implement config.ts**

```ts
import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";

type Toml = Record<string, unknown>;

const KEYED_MERGE_FIELDS = ["code", "id"] as const;

/**
 * The field that identifies every item of both arrays, or null when the arrays
 * are plain lists. Like the Python, `code` wins over `id`, a field must be
 * present on *every* item to identify one, and an identifier that is not a
 * non-empty string is refused rather than coerced.
 */
function keyedMergeField(items: unknown[]): "code" | "id" | null {
  if (
    items.length === 0 ||
    !items.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))
  ) {
    return null;
  }
  const records = items as Record<string, unknown>[];
  for (const field of KEYED_MERGE_FIELDS) {
    if (!records.every((item) => field in item)) continue;
    for (const item of records) {
      const value = item[field];
      if (typeof value !== "string") {
        throw new Error(`keyed array identifier \`${field}\` must be a string, got ${typeof value}`);
      }
      if (!value) throw new Error(`keyed array identifier \`${field}\` must not be empty`);
    }
    return field;
  }
  return null;
}

/** Merge b into a: keys replace; arrays keyed-merge by code/id, else append. */
export function deepMerge(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    const field = keyedMergeField([...a, ...b]);
    if (field === null) return [...a, ...b];
    // A matching identifier replaces its item where it stands; a new one appends.
    const merged = a.map((item) => ({ ...item }));
    const indexByKey = new Map<string, number>();
    a.forEach((item, index) => indexByKey.set(item[field], index));
    for (const item of b) {
      const copy = { ...item };
      const key: string = copy[field];
      const at = indexByKey.get(key);
      if (at === undefined) {
        indexByKey.set(key, merged.length);
        merged.push(copy);
      } else {
        merged[at] = copy;
      }
    }
    return merged;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v);
    return out;
  }
  return b;
}

async function readLayer(fs: Fs, p: string): Promise<Toml | null> {
  if (!(await fs.exists(p))) return null;
  return parseToml(await fs.readText(p)) as Toml;
}

/** Merge `_bmad/config.toml` ← `_bmad/custom/config.toml` ← `_bmad/custom/config.user.toml`. */
export async function loadCentralConfig(projectRoot: string, fs: Fs): Promise<Toml> {
  const base = await readLayer(fs, `${projectRoot}/_bmad/config.toml`);
  if (!base) throw new Error(`no _bmad/config.toml under ${projectRoot}`);
  let out = deepMerge({}, base);
  const team = await readLayer(fs, `${projectRoot}/_bmad/custom/config.toml`);
  if (team) out = deepMerge(out, team);
  const user = await readLayer(fs, `${projectRoot}/_bmad/custom/config.user.toml`);
  if (user) out = deepMerge(out, user);
  return out;
}

/** Merge `{skillRoot}/customize.toml` ← `_bmad/custom/<skill>.toml` ← `<skill>.user.toml`. */
export async function resolveCustomization(
  projectRoot: string,
  skillRoot: string,
  skill: string,
  fs: Fs,
): Promise<Toml> {
  const base = await readLayer(fs, `${skillRoot}/customize.toml`);
  if (!base) throw new Error(`no customize.toml at the root of skill ${skill} (${skillRoot})`);
  let out = deepMerge({}, base);
  const skillLayer = await readLayer(fs, `${projectRoot}/_bmad/custom/${skill}.toml`);
  if (skillLayer) out = deepMerge(out, skillLayer);
  const userLayer = await readLayer(fs, `${projectRoot}/_bmad/custom/${skill}.user.toml`);
  if (userLayer) out = deepMerge(out, userLayer);
  return out;
}

```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/config.test.ts`
Expected: PASS. (If the golden comparison exposes a merge difference, adjust `deepMerge` until the goldens match — the Python behavior is the contract, not this first draft.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadRuntime/config.ts src/lib/bmadRuntime/__tests__/config.test.ts src/lib/bmadRuntime/__tests__/goldens/config
git commit -m "feat(bmad-v6): port layered TOML config resolution"
```

---

### Task 4: Port the ticket tree (tickets.py + read_store.py)

**Files:**
- Create: `src/lib/bmadRuntime/tickets.ts` (shipped, 1988 lines: one module, Python's own sections — constants, python value shapes, paths, fs probes, frontmatter, loading, views, store, the command line, read_store.py, entry)
- Test: `src/lib/bmadRuntime/__tests__/tickets.test.ts` (18 tests)
- Create: `src/lib/bmadRuntime/__tests__/fixtures/ticketTree.ts` — the `seedTicketTree` helper Tasks 5–6 import
- Create: `src/lib/bmadRuntime/__tests__/goldens/tickets/*.json` + `*.exit` + `pull-leaf.md` + `mark-created-plan.md`, with `capture.sh` beside them

**Interfaces:**
- Consumes: `loadCentralConfig` (Task 3), `Fs`.
- Produces: `export async function tickets(argv: string[], fs: Fs, stdin?: string): Promise<{ stdout: string; exitCode: number }>` — dispatches `next`, `status`, `find`, `pull`, `mark`, `mirror` exactly as the Python CLI does, printing JSON to stdout; argv carrying no subcommand is `read_store.py`'s CLI (Task 6 routes `read_store` here), and `stdin` carries `mirror`'s JSON (left out, it is read from the process's own stdin). Resolves `--project-root` (accepted anywhere, which the plan's tests need and argparse does not allow), the store location (`output_folder` + `active_initiative`), and the `after` dependency validation. `mark <ref> <status>` sets the status in the ticket's plan, creating a frontmatter-only plan when there is none, with `--assignee`/`--blocked`; exit 0 ok, 1 a malformed tree, 2 a store refusal or a usage error.

- [x] **Step 1: Generate goldens from the real Python** — shipped as `src/lib/bmadRuntime/__tests__/goldens/tickets/capture.sh`, which reseeds `/tmp/golden-proj` per capture and records every command (the Ruling's capture-script rule). Run it from the worktree root; it is reproducible byte for byte. Fourteen goldens: `next-empty`, `next-unseeded-refusal`, `status-seeded`, `next-seeded`, `find-entry`, `pull` + `pull-leaf.md`, `find-pulled`, `mark-done`, `mark-created` + `mark-created-plan.md`, `after-missing-entry`, `tracker-store-refusal`, `read-store-tickets`, `read-store-starters`, `read-store-jira-starter`. Each capture also writes `<name>.exit`.

Three things the sketch's literal commands could not do, all recorded in `capture.sh`:
- `next` must succeed for its golden: the tree is configured (`_bmad/config.toml` with `output_folder` and `active_initiative`) and the store folder exists with an empty `tickets.toml`. An unseeded tree is captured separately as `next-unseeded-refusal.json` (exit 1).
- `mark 1 done` with no folder runs on the **active initiative**, where a bare numeric ref matches nothing (`no ticket matches '1'`): the golden is the refusal. The working `mark-done.json` names the epic folder: `mark <root>/_bmad-output/initiative-demo/epic-demo 1 done`.
- The seed's leaf file is already pulled, so `pull` is captured on a second entry the seed adds (no leaf file, no plan, full criteria) — which also gives `mark-created` its ticket.
- `capture.sh` copies `_bmad/scripts/config_utils.py` from the vendored tree: the Python loads it, the port does not. The capture project root is rewritten to `/p` on the way out, so the goldens are comparable with the memFs fixtures.

- [x] **Step 2: Write the failing test**

`src/lib/bmadRuntime/__tests__/tickets.test.ts` starts as the plan wrote it — the two golden tests verbatim — and grew to 18: `next-seeded` (byte-for-byte), `find-entry`, `pull` + the leaf it writes, `find-pulled`, `mark-done` (and the plan it edits), `mark-created` (with its date moved to today), the tracker-store and unseeded refusals, `read_store`, two `mirror` cases, and CRLF/BOM preservation (verified against the Python before being pinned).

The plan's third test could not pass as written: `pull --project-root /p 2` is an argparse refusal before any tree loads (the Python exits 2 with `unrecognized arguments: --project-root`, which the shipped port reproduces and asserts), so there is no `after` in its output. The after-validation the test names is exercised on the tree the Python refuses — an entry whose `after` names no entry — against `after-missing-entry.json`, and the brief's argv shape is asserted separately.

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/tickets.test.ts`
Expected: FAIL — `tickets.ts` not found. (Seen.)

- [x] **Step 4: Implement tickets.ts and its fixture builder**

`src/lib/bmadRuntime/__tests__/fixtures/ticketTree.ts` is the plan's fixture plus one thing the sketch omitted: the epic's own container file `<dir>/epic-<slug>.md`. Without it `load_container` refuses every epic folder (`epic-demo: no epic-demo.md`), which the status golden would have failed on.

```ts
import type { Fs } from "../../fs";

/** Seed a minimal v6 project: _bmad/config.toml, the store folders, and the
 * requested epics/stories as [[epic]]/[[entry]] tables plus leaf and plan
 * files. Mirrors the vendored templates' shape. */
export async function seedTicketTree(
  fs: Fs,
  root: string,
  spec: {
    epics: { id: number; slug: string }[];
    stories: { id: string | number; slug: string; parent: string }[];
  },
): Promise<void> {
  await fs.mkdir(`${root}/_bmad/custom`);
  await fs.writeText(
    `${root}/_bmad/config.toml`,
    `[core]\nproject_name = "p"\noutput_folder = "${root}/_bmad-output"\nactive_initiative = "initiative-demo"\n`,
  );
  const store = `${root}/_bmad-output/initiative-demo`;
  await fs.mkdir(store);
  const epicsToml = spec.epics
    .map((e) => `[[epic]]\nid = ${e.id}\nslug = "${e.slug}"\ntitle = "Demo"\n`)
    .join("\n");
  await fs.writeText(`${store}/tickets.toml`, epicsToml);
  for (const e of spec.epics) {
    const dir = `${store}/epic-${e.slug}`;
    await fs.mkdir(dir);
    // Every epic folder carries its own container file: without <folder>.md the
    // loader refuses it ("epic-demo: no epic-demo.md").
    await fs.writeText(`${dir}/epic-${e.slug}.md`, `---\ntype: epic\n---\n# Demo\n`);
    const mine = spec.stories.filter((s) => s.parent === `epic-${e.slug}`);
    await fs.writeText(
      `${dir}/tickets.toml`,
      mine.map((s) => `[[entry]]\nid = ${typeof s.id === "string" ? `"${s.id}"` : s.id}\ntype = "story"\ntitle = "Demo story"\n`).join("\n"),
    );
    for (const s of mine) {
      const stem = `story-${s.id}`;
      await fs.writeText(
        `${dir}/${stem}.md`,
        `---\nid: ${s.id}\ntype: story\ntitle: "Demo story"\nparent: epic-${e.slug}\n---\n# Demo story\n\n## Acceptance Criteria\n- AC1\n`,
      );
      await fs.writeText(`${dir}/${stem}-plan.md`, `---\nticket: ${s.id}\nstatus: draft\n---\n# Plan\n`);
    }
  }
}
```

`src/lib/bmadRuntime/tickets.ts` is the port: the sketch's `storeRoot`/`readStore`/`planFor` shapes became the Python's own `tickets_root`/`load_tree`/`plan_path`, and the commands follow it line for line, including the quirks the goldens pin (a `[[epic]]` `slug` is looked up by slug, not by folder name, so the seed's `slug = "demo"` against folder `epic-demo` leaves `epic_ids` empty and rows `ref` their file names; a bare numeric ref matches nothing outside an epic folder; `state` prefers `tracker_status`).

Three substitutions, all seams with earlier tasks, are documented at the top of the module:
- config comes from Task 3's `loadCentralConfig`, so a missing `_bmad/config.toml` refuses in different words than the Python's own `config_utils.py`;
- output goes to `stdout` alone (the interface has one channel; the Python splits errors onto stderr);
- `read_store.py` finds its starters at its own `../config`, which a bundle cannot know: the port takes `--skill-root` (what the patched call sites pass, defaulting to `<skill-root>/config`) or `--starters-dir`, expands `~`, and refuses a run that names neither rather than dropping the starter layer. `read-store-jira-starter` is the golden for the `--skill-root`-only shape.

argparse's usage line wraps to the terminal and is not reproduced (its error line is).

`mirror`'s rollback needs a delete, which the first cut of `Fs` had no way to do; the controller ruled the gap load-bearing and `delete(p)` was added to `Fs` (realFs `unlink`, memFs removes the entry) with parity tests, so a failed mirror now removes the leaf it had just pulled exactly as the Python does.

The full JSON shapes come from the goldens captured in Step 1 — the port is complete only when every golden passes. A throwaway differential harness (run once, not committed) also diffed 58 command cases against the Python on identical on-disk trees — exit codes, output bytes and the files both sides left behind — which is what caught the optional `<dir>` on `find`/`mark` and a `waiting_on: []` that the Python omits.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/tickets.test.ts`
Expected: PASS (all goldens match).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadRuntime/tickets.ts src/lib/bmadRuntime/__tests__/tickets.test.ts src/lib/bmadRuntime/__tests__/fixtures/ticketTree.ts src/lib/bmadRuntime/__tests__/goldens/tickets
git commit -m "feat(bmad-v6): port the ticket tree commands"
```

---

### Task 5: Port workflow rendering and memlog (render_skill + memlog)

**Files:**
- Create: `src/lib/bmadRuntime/render.ts`
- Create: `src/lib/bmadRuntime/memlog.ts`
- Test: `src/lib/bmadRuntime/__tests__/render.test.ts`, `src/lib/bmadRuntime/__tests__/memlog.test.ts`
- Create: `src/lib/bmadRuntime/__tests__/goldens/render/*.json` (generated in Step 1)

**Interfaces:**
- Consumes: `loadCentralConfig`, `resolveCustomization` (Task 3), `Fs`.
- Produces: `export async function renderSkill(projectRoot: string, skillRoot: string, set: Record<string, string>, fs: Fs): Promise<string>` — renders the skill's SKILL.md with a jinja2 subset (`{{ var }}`, `{% for x in list %}…{% endfor %}`, `{% if x %}…{% endif %}`). And `export async function memlog(projectRoot: string, action: "append" | "read" | "init", entry: string | null, fs: Fs): Promise<string>` — append-only JSON-lines log at `_bmad/memlog.jsonl`.

- [ ] **Step 1: Generate goldens from the real Python**

```bash
mkdir -p /Users/alvin-reyes/Project/better-agentic-ide/src/lib/bmadRuntime/__tests__/goldens/render
uv run /tmp/golden-proj/_bmad/scripts/render_skill.py --project-root /tmp/golden-proj --skill /tmp/bmad-v6/skills/bmad-build --set workflow.route=full > \
  /Users/alvin-reyes/Project/better-agentic-ide/src/lib/bmadRuntime/__tests__/goldens/render/build-full.md
uv run /tmp/golden-proj/_bmad/scripts/memlog.py --project-root /tmp/golden-proj append '{"t":"test"}' >/dev/null
uv run /tmp/golden-proj/_bmad/scripts/memlog.py --project-root /tmp/golden-proj read > \
  /Users/alvin-reyes/Project/better-agentic-ide/src/lib/bmadRuntime/__tests__/goldens/render/memlog.jsonl
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderSkill } from "../render";
import { memlog } from "../memlog";
import { memFs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

describe("render port", () => {
  it("matches Python render_skill output for bmad-build full route", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    // The golden was rendered from the same tag's tree; read the vendored copy.
    const skillRoot = join(__dirname, "../../../../src-tauri/resources/bmad-v6/skills/bmad-build");
    const out = await renderSkill("/p", skillRoot, { "workflow.route": "full" }, fs);
    // The golden is captured with the skill path substituted; substitute the
    // same way before comparing.
    expect(out).toBe((await readFile(join(__dirname, "goldens/render/build-full.md"), "utf8")));
  });

  it("matches Python memlog append/read", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    await memlog("/p", "append", '{"t":"test"}', fs);
    expect(await memlog("/p", "read", null, fs)).toBe(await readFile(join(__dirname, "goldens/render/memlog.jsonl"), "utf8"));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/render.test.ts src/lib/bmadRuntime/__tests__/memlog.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement render.ts and memlog.ts**

```ts
/** jinja2 subset: variable substitution, for-loops, if-blocks. Enough for SKILL.md workflows. */
export function renderTemplate(tpl: string, ctx: Record<string, unknown>): string {
  let out = tpl;
  out = out.replace(/\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, (_, v: string, src: string, body: string) => {
    const list = (src.split(".").reduce((o, k) => (o as any)?.[k], ctx) ?? []) as unknown[];
    return list.map((item) => renderTemplate(body, { ...ctx, [v]: item })).join("");
  });
  out = out.replace(/\{%\s*if\s+([\w.]+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (_, cond: string, body: string) =>
    cond.split(".").reduce((o, k) => (o as any)?.[k], ctx) ? renderTemplate(body, ctx) : "");
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
    String(key.split(".").reduce((o, k) => (o as any)?.[k], ctx) ?? ""));
  return out;
}

export async function renderSkill(projectRoot: string, skillRoot: string, set: Record<string, string>, fs: Fs): Promise<string> {
  const cfg = await loadCentralConfig(projectRoot, fs);
  const skillName = skillRoot.split("/").pop()!;
  const custom = await resolveCustomization(projectRoot, skillRoot, skillName, fs);
  const ctx = { ...cfg, ...custom, workflow: { ...(cfg.workflow as any ?? {}), ...Object.fromEntries(Object.entries(set).map(([k, v]) => [k.split(".").slice(1).join("."), v])) } };
  return renderTemplate(await fs.readText(`${skillRoot}/SKILL.md`), ctx);
}
```

```ts
import type { Fs } from "./fs";

export async function memlog(projectRoot: string, action: "append" | "read" | "init", entry: string | null, fs: Fs): Promise<string> {
  const p = `${projectRoot}/_bmad/memlog.jsonl`;
  if (action === "read") return (await fs.exists(p)) ? await fs.readText(p) : "";
  if (action === "init") { await fs.writeText(p, ""); return ""; }
  const prev = (await fs.exists(p)) ? await fs.readText(p) : "";
  await fs.writeText(p, prev + entry + "\n");
  return "";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/render.test.ts src/lib/bmadRuntime/__tests__/memlog.test.ts`
Expected: PASS. (As in Task 3, adjust to the goldens — Python behavior is the contract.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadRuntime/render.ts src/lib/bmadRuntime/memlog.ts src/lib/bmadRuntime/__tests__/render.test.ts src/lib/bmadRuntime/__tests__/memlog.test.ts src/lib/bmadRuntime/__tests__/goldens/render
git commit -m "feat(bmad-v6): port workflow rendering and memlog"
```

---

### Task 5b: Port roster, knowledge and validate_manifests

**Files:**
- Create: `src/lib/bmadRuntime/roster.ts`, `src/lib/bmadRuntime/knowledge.ts`, `src/lib/bmadRuntime/validateManifests.ts`
- Test: `src/lib/bmadRuntime/__tests__/roster.test.ts`, `src/lib/bmadRuntime/__tests__/knowledge.test.ts`, `src/lib/bmadRuntime/__tests__/validateManifests.test.ts`
- Create: `src/lib/bmadRuntime/__tests__/goldens/misc/*.json` (generated in Step 1)

**Interfaces:**
- Consumes: `Fs`, `loadCentralConfig` (Task 3), the vendored tree paths.
- Produces: `export async function roster(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }>` (party-mode roster, port of `skills/bmad/scripts/roster.py`), `export async function knowledge(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }>` (module knowledge aggregator, port of `skills/bmad/scripts/knowledge.py`), `export async function validateManifests(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }>` (module manifest validation, port of `skills/bmad/scripts/validate_manifests.py`). Each accepts exactly the argument shapes the patched call sites pass — those shapes are the contract, and the goldens pin the output.

- [ ] **Step 1: Find the argument shapes and generate goldens**

The vendored tree was patched in Task 1; every call site is now `node {project-root}/_bmad/ade-runtime.mjs <script> …`. Find them:

Run: `grep -rn "ade-runtime.mjs roster\|ade-runtime.mjs knowledge\|ade-runtime.mjs validate_manifests" src-tauri/resources/bmad-v6/skills/ | head -20`
Expected: the full list of call sites (7 across the tree). These argument shapes are what the ports must accept.

Then, at dev time (Python available), run the real scripts for each distinct call-site shape against /tmp/golden-proj (from Task 3, seeded the same way) and capture stdout+exit to `src/lib/bmadRuntime/__tests__/goldens/misc/<script>-<shape>.json` — one golden per distinct shape. Where a shape depends on a module not present in /tmp/golden-proj, capture the error output as the golden (an error golden is a golden).

- [ ] **Step 2: Write the failing tests**

```ts
// roster.test.ts (same shape for knowledge.test.ts / validateManifests.test.ts)
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { roster } from "../roster";
import { memFs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/misc", name), "utf8"));

describe("roster port", () => {
  it("matches Python for each patched call-site shape", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    for (const name of await fs.list("/shape-list")) { /* per-shape loop driven by the golden files */ }
    const r = await roster(["<the first shape's args>", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(golden("roster-1.json").exitCode);
    expect(JSON.parse(r.stdout)).toEqual(golden("roster-1.json").stdout);
  });
});
```

Write one test per golden file (loop over them is fine); each compares stdout and exitCode against the golden.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/roster.test.ts src/lib/bmadRuntime/__tests__/knowledge.test.ts src/lib/bmadRuntime/__tests__/validateManifests.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the three ports**

Port `skills/bmad/scripts/roster.py` (party roster), `knowledge.py` (module knowledge aggregation), and `validate_manifests.py` (module manifest checks) against the goldens — same discipline as Tasks 3–5: the Python output is the contract; each module is small and reads files under the project root via `Fs`. No external dependencies.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/roster.test.ts src/lib/bmadRuntime/__tests__/knowledge.test.ts src/lib/bmadRuntime/__tests__/validateManifests.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadRuntime/roster.ts src/lib/bmadRuntime/knowledge.ts src/lib/bmadRuntime/validateManifests.ts src/lib/bmadRuntime/__tests__/roster.test.ts src/lib/bmadRuntime/__tests__/knowledge.test.ts src/lib/bmadRuntime/__tests__/validateManifests.test.ts src/lib/bmadRuntime/__tests__/goldens/misc
git commit -m "feat(bmad-v6): port roster, knowledge and manifest validation"
```

---

### Task 5c: Port the skill-root helper scripts

**Files:**
- Create: `src/lib/bmadRuntime/helpers.ts` (one module holding the small helper ports; a helper that grows past ~150 lines gets its own file)
- Test: `src/lib/bmadRuntime/__tests__/helpers.test.ts`
- Create: `src/lib/bmadRuntime/__tests__/goldens/helpers/*.json` (generated in Step 1)

**Interfaces:**
- Consumes: `Fs`, `loadCentralConfig` (Task 3), the Task 5b ports.
- Produces: one export per ported script with the uniform shape `export async function <name>(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }>`, named by the Python stem: `reconKit, initSkill, brain, processTemplate, wake, scanScripts, scanPaths, resolveParty, go, scanLegacyModule, registry, readSessionLog, pickMethods, listCustomizableSkills, lintSpine, resolvePersonas, runTriggers, x`. Skill-root invocations of `tickets.py`, `read_store.py`, `knowledge.py` route to the Task 4/5b ports (the `--skill-root` arg is accepted and, where the Python used it to locate files, honored; otherwise ignored). The Python sources live in the vendored tree — e.g. `skills/bmad-architecture/scripts/lint_spine.py`, `skills/bmad-deep-recon/scripts/recon_kit.py`.

- [ ] **Step 1: Generate goldens from the real Python**

For each of the 19 scripts, find its source in the vendored tree (`find src-tauri/resources/bmad-v6/skills -name "<name>.py" -path "*/scripts/*"`), find its call sites in the vendored markdown (`grep -rn "scripts/<name>.py" src-tauri/resources/bmad-v6/skills --include="*.md"`) to learn the argument shapes, then run the real Python against /tmp/golden-proj (seeded as in Task 3) and capture stdout+exit into `src/lib/bmadRuntime/__tests__/goldens/helpers/<name>-<shape>.json`. Where a script refuses without more setup, capture the refusal — it is a golden too. Scripts that are trivial (a few lines of string building) still get one golden each.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as helpers from "../helpers";
import { memFs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

describe("helper script ports", () => {
  it("matches Python for every captured golden", async () => {
    const dir = join(__dirname, "goldens/helpers");
    for (const f of await readdir(dir)) {
      const [name] = f.split("-");
      const golden = JSON.parse(await readFile(join(dir, f), "utf8"));
      const port = (helpers as Record<string, (argv: string[], fs: unknown) => Promise<{ stdout: string; exitCode: number }>>)[name];
      expect(port, `no port named ${name}`).toBeDefined();
      const fs = memFs();
      await seedTicketTree(fs, "/p", { epics: [], stories: [] });
      const r = await port!(golden.argv, fs);
      expect(r.exitCode, `${name} exit code`).toBe(golden.exitCode);
      expect(r.stdout, `${name} stdout`).toBe(golden.stdout);
    }
  });
});
```

(The golden files carry the `argv` used, so the test replays exactly what the Python saw.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/helpers.test.ts`
Expected: FAIL — no ports yet.

- [ ] **Step 4: Implement helpers.ts**

Port each of the 19 scripts against its goldens — same discipline as Tasks 3–5b: the Python output is the contract, `Fs` for all file access, no external dependencies. Each port is small; group them in one module and split out any that grows past ~150 lines (it then keeps the same export shape in its own file and is re-exported from `helpers.ts`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/helpers.test.ts`
Expected: PASS (one golden each).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadRuntime/helpers.ts src/lib/bmadRuntime/__tests__/helpers.test.ts src/lib/bmadRuntime/__tests__/goldens/helpers
git commit -m "feat(bmad-v6): port the skill-root helper scripts"
```

---

### Task 6: The ade-runtime.mjs CLI bundle

**Files:**
- Create: `src/lib/bmadRuntime/cli.ts`
- Create: `vite.runtime.config.ts`
- Modify: `package.json` (add `"build:runtime": "vite build --config vite.runtime.config.ts"` and hook into the existing `build` script)
- Test: `src/lib/bmadRuntime/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `tickets`, `loadCentralConfig`, `resolveCustomization`, `renderSkill`, `memlog`, `roster`, `knowledge`, `validateManifests` (Task 5b), `realFs`.
- Produces: `dist-runtime/ade-runtime.mjs` — a single ESM file; CLI contract: `node ade-runtime.mjs <script-name> <script args…>` where script-name ∈ `resolve_config|resolve_customization|tickets|read_store|render_skill|memlog|roster|knowledge|validate_manifests`, arguments identical to the Python scripts' (including `--project-root`, `--key`, `--skill`, `--set k=v`).

- [ ] **Step 1: Write the failing test**

`src/lib/bmadRuntime/__tests__/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cliMain } from "../cli";
import { memFs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

describe("cli dispatch", () => {
  it("dispatches tickets next with the same argv shape the patched skills use", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["tickets", "next", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it("resolves --key queries for resolve_config", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["resolve_config", "--project-root", "/p", "--key", "core.output_folder"], fs);
    expect(JSON.parse(r.stdout)).toHaveProperty("core");
  });

  it("reports an unknown script with a non-zero exit", async () => {
    const r = await cliMain(["bogus"], memFs());
    expect(r.exitCode).toBe(2);
  });

  it("dispatches the Task 5b scripts by their patched names", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    for (const name of ["roster", "knowledge", "validate_manifests"] as const) {
      const r = await cliMain([name, "--project-root", "/p"], fs);
      expect(r.exitCode, `${name} should dispatch`).not.toBe(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/cli.test.ts`
Expected: FAIL — `cli.ts` not found.

- [ ] **Step 3: Implement cli.ts**

```ts
import { loadCentralConfig, resolveCustomization } from "./config";
import { tickets } from "./tickets";
import { renderSkill } from "./render";
import { memlog } from "./memlog";
import { roster } from "./roster";
import { knowledge } from "./knowledge";
import { validateManifests } from "./validateManifests";
import type { Fs } from "./fs";

export async function cliMain(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }> {
  const [script, ...rest] = argv;
  switch (script) {
    case "tickets":
    case "read_store":
      return tickets(rest, fs);
    case "resolve_config": {
      const root = rest[rest.indexOf("--project-root") + 1];
      const cfg = await loadCentralConfig(root, fs);
      return { stdout: JSON.stringify(cfg, null, 2), exitCode: 0 };
    }
    case "resolve_customization": {
      const root = rest[rest.indexOf("--project-root") + 1];
      const skillRoot = rest[rest.indexOf("--skill") + 1];
      const skill = skillRoot.split("/").pop()!;
      return { stdout: JSON.stringify(await resolveCustomization(root, skillRoot, skill, fs), null, 2), exitCode: 0 };
    }
    case "render_skill": {
      const root = rest[rest.indexOf("--project-root") + 1];
      const skill = rest[rest.indexOf("--skill") + 1];
      const set = Object.fromEntries(rest.filter((a) => a.startsWith("--set ")).map((a) => a.slice(6).split("=") as [string, string]));
      return { stdout: await renderSkill(root, skill, set, fs), exitCode: 0 };
    }
    case "memlog": {
      const root = rest[rest.indexOf("--project-root") + 1];
      const action = rest.find((a) => ["append", "read", "init"].includes(a)) as "append" | "read" | "init";
      const entry = action === "append" ? rest[rest.length - 1] : null;
      return { stdout: await memlog(root, action, entry, fs), exitCode: 0 };
    }
    case "roster":
      return roster(rest, fs);
    case "knowledge":
      return knowledge(rest, fs);
    case "validate_manifests":
      return validateManifests(rest, fs);
    default: {
      // Task 5c helper scripts dispatch by their Python stem.
      const helpers = await import("./helpers");
      const fn = (helpers as Record<string, (argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>>)[script];
      if (fn) return fn(rest, fs);
      return { stdout: `unknown runtime script: ${script}`, exitCode: 2 };
    }
  }
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("ade-runtime.mjs")) {
  const { realFs } = await import("./fs");
  const r = await cliMain(process.argv.slice(2), realFs());
  if (r.stdout) process.stdout.write(r.stdout + "\n");
  process.exit(r.exitCode);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bmadRuntime/__tests__/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the bundle build**

`vite.runtime.config.ts`:

```ts
import { defineConfig } from "vite";

// Single dependency-free ESM bundle scaffolded into v6 projects as
// _bmad/ade-runtime.mjs. Node 18+ target; everything bundled inline.
export default defineConfig({
  build: {
    lib: { entry: "src/lib/bmadRuntime/cli.ts", formats: ["es"], fileName: "ade-runtime" },
    outDir: "dist-runtime",
    target: "node18",
    minify: false,
    rollupOptions: { external: [] },
  },
});
```

In `package.json`: `"build:runtime": "vite build --config vite.runtime.config.ts"`, and change `"build": "tsc && vite build && npm run build:runtime"`.

- [ ] **Step 6: Build and smoke it**

Run: `npm run build:runtime && node dist-runtime/ade-runtime.mjs bogus; echo "exit=$?"`
Expected: `unknown runtime script: bogus` and `exit=2`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bmadRuntime/cli.ts src/lib/bmadRuntime/__tests__/cli.test.ts vite.runtime.config.ts package.json
git commit -m "feat(bmad-v6): ade-runtime CLI bundle for terminal agents"
```

---

### Task 7: Rust-side v6 scaffold and the methodology marker

**Files:**
- Create: `src-tauri/src/bmadv6.rs`
- Modify: `src-tauri/src/lib.rs` (register the command + resource path)
- Modify: `src-tauri/src/projectsetup.rs` (methodology-aware apply)
- Test: `src-tauri/src/bmadv6.rs` (`#[cfg(test)]` temp-dir tests)

**Interfaces:**
- Consumes: `src-tauri/resources/bmad-v6/` (bundled resource), the runtime bundle at `dist-runtime/ade-runtime.mjs` (bundled as a resource, `src-tauri/resources/ade-runtime.mjs`, copied by the tauri build's `beforeBuildCommand` — add `cp dist-runtime/ade-runtime.mjs src-tauri/resources/ade-runtime.mjs` to `"build"`).
- Produces: `pub fn install(src: &Path, dir: &Path, report: &mut ScaffoldReport) -> Result<(), String>` — writes `.claude/skills/` (33 dirs), `_bmad/config.toml` (project_name + output_folder from the directory name), `_bmad/custom/` + `.gitignore`, `_bmad/ade-runtime.mjs`, `_bmad-output/`, and `.ade/methodology` containing `v6`. Never overwrites. `ScaffoldReport { created: Vec<PathBuf>, kept: Vec<PathBuf> }`.

- [ ] **Step 1: Write the failing Rust tests**

In `bmadv6.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn installs_the_v6_tree_and_marker() {
        let dir = std::env::temp_dir().join(format!("bmadv6-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // src is a tiny fixture tree, not the real vendored skills:
        let src = std::env::temp_dir().join(format!("bmadv6-src-{}", std::process::id()));
        fs::create_dir_all(src.join("skills/bmad")).unwrap();
        fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        fs::write(src.join("runtime.mjs"), "// runtime").unwrap();

        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        assert!(dir.join(".claude/skills/bmad/SKILL.md").is_file());
        assert!(dir.join("_bmad/config.toml").is_file());
        assert!(dir.join("_bmad/custom/.gitignore").is_file());
        assert!(dir.join("_bmad/ade-runtime.mjs").is_file());
        assert!(dir.join("_bmad-output").is_dir());
        assert_eq!(fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(), "v6");
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }

    #[test]
    fn never_overwrites_existing_files() {
        let dir = std::env::temp_dir().join(format!("bmadv6-keep-{}", std::process::id()));
        fs::create_dir_all(dir.join("_bmad")).unwrap();
        fs::write(dir.join("_bmad/config.toml"), "custom").unwrap();
        let src = std::env::temp_dir().join(format!("bmadv6-src-keep-{}", std::process::id()));
        fs::create_dir_all(src.join("skills")).unwrap();

        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        assert_eq!(fs::read_to_string(dir.join("_bmad/config.toml")).unwrap(), "custom");
        assert!(!report.created.iter().any(|p| p.ends_with("config.toml")));
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }

    #[test]
    fn detects_v4_projects_without_a_marker() {
        let dir = std::env::temp_dir().join(format!("bmadv6-detect-{}", std::process::id()));
        fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        assert_eq!(detect_methodology(&dir), Methodology::V4);
        fs::remove_dir_all(&dir).ok();
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test bmadv6`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement bmadv6.rs**

```rust
//! BMAD v6 scaffold: vendored skills into .claude/skills, the _bmad/ tree,
//! the runtime bundle, and the methodology marker. Mirrors v6's own setup.py
//! output; nothing that exists is overwritten.

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Methodology { V4, V6 }

#[derive(Default)]
pub struct ScaffoldReport {
    pub created: Vec<PathBuf>,
    pub kept: Vec<PathBuf>,
}

/// What methodology a project is on: the marker when present, otherwise disk
/// evidence (.bmad-core/ => v4) for projects from before the marker existed.
pub fn detect_methodology(dir: &Path) -> Methodology {
    match fs::read_to_string(dir.join(".ade/methodology")) {
        Ok(m) if m.trim() == "v6" => Methodology::V6,
        _ if dir.join(".bmad-core").is_dir() => Methodology::V4,
        _ => Methodology::V6, // a project with neither is new; setup will ask and write the marker
    }
}

fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let to = dst.join(entry.file_name());
        if entry.path().is_dir() {
            fs::create_dir_all(&to).map_err(|e| e.to_string())?;
            copy_tree(&entry.path(), &to, report)?;
        } else if to.exists() {
            report.kept.push(to.clone());
        } else {
            fs::copy(entry.path(), &to).map_err(|e| e.to_string())?;
            report.created.push(to);
        }
    }
    Ok(())
}

pub fn install(src: &Path, dir: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    // Skills: .claude/skills/*
    copy_tree(&src.join("skills"), &dir.join(".claude/skills"), report)?;
    // _bmad/ tree
    fs::create_dir_all(dir.join("_bmad/custom")).map_err(|e| e.to_string())?;
    let config = dir.join("_bmad/config.toml");
    if config.exists() {
        report.kept.push(config);
    } else {
        let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let body = format!("[core]\nproject_name = \"{name}\"\noutput_folder = \"{}/_bmad-output\"\n",
            dir.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\""));
        fs::write(&config, body).map_err(|e| e.to_string())?;
        report.created.push(config);
    }
    let gitignore = dir.join("_bmad/custom/.gitignore");
    if gitignore.exists() { report.kept.push(gitignore); } else {
        fs::write(&gitignore, "# user-scoped overrides\n").map_err(|e| e.to_string())?;
        report.created.push(gitignore);
    }
    // Runtime bundle
    let runtime = dir.join("_bmad/ade-runtime.mjs");
    if runtime.exists() { report.kept.push(runtime); } else {
        fs::copy(src.join("ade-runtime.mjs"), &runtime).map_err(|e| e.to_string())?;
        report.created.push(runtime);
    }
    fs::create_dir_all(dir.join("_bmad-output")).map_err(|e| e.to_string())?;
    // Methodology marker
    let marker = dir.join(".ade/methodology");
    fs::create_dir_all(dir.join(".ade")).map_err(|e| e.to_string())?;
    if marker.exists() { report.kept.push(marker); } else {
        fs::write(&marker, "v6\n").map_err(|e| e.to_string())?;
        report.created.push(marker);
    }
    Ok(())
}
```

- [ ] **Step 4: Wire it into projectsetup.rs**

In `projectsetup.rs`: `apply()` gains a `methodology: Methodology` parameter; when `Methodology::V6`, call `bmadv6::install` with the resource root `crate::bmadv6::resource_root(&app)` (mirroring `crate::bmad::resource_root`); when `V4`, the existing `bmad::install` path runs unchanged. `project_setup_apply` reads the requested methodology from the frontend and skips the install when `detect_methodology` says the project already has that methodology. Keep `bmad_files` counting v4 files and add `bmadv6_files` for v6.

- [ ] **Step 5: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: PASS (existing v4 scaffold tests stay green).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/bmadv6.rs src-tauri/src/lib.rs src-tauri/src/projectsetup.rs
git commit -m "feat(bmad-v6): scaffold v6 projects with methodology marker"
```

---

### Task 8: Frontend setup flow — the v4/v6 question

**Files:**
- Modify: `src/lib/projectSetup.ts`
- Modify: `src/components/NewTabDialog.tsx` (or wherever the setup prompt renders — follow the existing `autoProjectSetup` flow)
- Test: `src/lib/__tests__/projectSetup.test.ts` (extend; check existing suite name first)

**Interfaces:**
- Consumes: `project_setup_apply` with a new `methodology: "v4" | "v6"` argument; `project_setup_status` unchanged.
- Produces: `setupProject(root, methodology: "v6" | "v4")` — the existing `setupProject(root)` callers now pass the user's choice; default `"v6"`. The setup UI asks once when `autoProjectSetup` is on and the project has neither methodology on disk: "Methodology: BMAD v6 (default) or BMAD v4". Existing v4 projects (`.bmad-core/` present, per `project_setup_status`) skip the question and stay v4.

- [ ] **Step 1: Write the failing test**

Extend the projectSetup suite:

```ts
it("passes the chosen methodology to setup and defaults new projects to v6", async () => {
  // existing mock of invoke("project_setup_apply") records args
  await setupProject("/tmp/proj", "v6");
  expect(lastApplyArgs.methodology).toBe("v6");
  await setupProject("/tmp/proj");
  expect(lastApplyArgs.methodology).toBe("v6");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts`
Expected: FAIL — `methodology` arg not sent.

- [ ] **Step 3: Implement**

`projectSetup.ts`: add `methodology: "v6" | "v4" = "v6"` parameter to the apply invocations; add `detectOnDisk(root): Promise<"v4" | "v6" | null>` via the existing status command (`.bmad-core/` ⇒ v4, `.ade/methodology` ⇒ its value, else null). The setup prompt component asks only when `detectOnDisk` is null; v4-detected projects proceed silently as before.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projectSetup.ts src/components/NewTabDialog.tsx src/lib/__tests__/projectSetup.test.ts
git commit -m "feat(bmad-v6): methodology choice in project setup"
```

---

### Task 9: End-to-end scaffold verification

**Files:**
- Test: `src-tauri/tests/bmadv6_e2e.rs` (integration test behind `#[cfg(test)]`)

**Interfaces:**
- Consumes: Task 7's `install` and Task 6's bundle at `src-tauri/resources/ade-runtime.mjs`.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn scaffolded_project_runs_the_runtime_cli() {
    let dir = std::env::temp_dir().join(format!("bmadv6-e2e-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let src = std::env::temp_dir().join(format!("bmadv6-e2e-src-{}", std::process::id()));
    std::fs::create_dir_all(src.join("skills")).unwrap();
    std::fs::copy(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/ade-runtime.mjs"), src.join("ade-runtime.mjs")).unwrap();

    let mut report = bmadv6::ScaffoldReport::default();
    bmadv6::install(&src, &dir, &mut report).unwrap();

    // `node` must be present for this test; skip otherwise (CI has it).
    if std::process::Command::new("node").arg("--version").output().is_err() { return; }
    let out = std::process::Command::new("node")
        .arg(dir.join("_bmad/ade-runtime.mjs"))
        .arg("resolve_config").arg("--project-root").arg(&dir)
        .output().unwrap();
    assert!(out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("output_folder"), "runtime returned: {stdout}");
    std::fs::remove_dir_all(&dir).ok();
    std::fs::remove_dir_all(&src).ok();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test bmadv6_e2e`
Expected: FAIL until the runtime bundle is built — see Step 3.

- [ ] **Step 3: Ensure the bundle exists before tests**

Add to `package.json` `"build"`: `"tsc && vite build && npm run build:runtime && cp dist-runtime/ade-runtime.mjs src-tauri/resources/ade-runtime.mjs"`. Commit `src-tauri/resources/ade-runtime.mjs` (it is regenerated on every build, like the frontend dist). Run `npm run build:runtime` first so the file exists for `cargo test`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test bmadv6_e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/bmadv6_e2e.rs src-tauri/resources/ade-runtime.mjs package.json
git commit -m "test(bmad-v6): end-to-end scaffold runs the runtime CLI"
```

---

Plan 1 complete: a v6 project scaffolds fully, terminal agents can run the patched skills against `_bmad/ade-runtime.mjs`, and the app knows each project's methodology. Plans 2 (ADE gate + v6 board) and 3 (role sections + docs) follow this file's task format.
