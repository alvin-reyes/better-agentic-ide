import { absolutePath, splitFlag } from "./compat";
import { loadCentralConfig, resolveCustomization } from "./config";
import { tickets } from "./tickets";
import { renderSkill } from "./render";
import { memlog } from "./memlog";
import type { Fs } from "./fs";

/**
 * The CLI the patched tree invokes: `node {project-root}/_bmad/ade-runtime.mjs
 * <script-name> <script args…>`, where `<script-name>` is the Python stem the
 * call site carried before Task 1 rewrote it. Every ported script — this task's
 * four plus the late ports below — has one shape, `(argv, fs)` in and the
 * Python's stdout and exit code out.
 */
export type Port = (argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>;

/**
 * The trio the vendored tree invokes whose ports land in Task 5b. Their names
 * dispatch today through the late-port branch below, so a caller never sees the
 * "unknown runtime script" answer; until their modules are bundled they answer
 * a not-ported line and exit 1. Nothing needs to change here when the ports
 * land, as long as `helpers.ts` (Task 5c) re-exports them — it is the one
 * bundled late-import the dispatcher reads by name.
 */
const PENDING_PORTS = new Set(["roster", "knowledge", "validate_manifests"]);

/**
 * The value after `--flag` — as the two tokens argparse took (`--flag value`),
 * or as the single `--flag=value` token it also took — or null when the flag is
 * absent or left without a value. A missing required argument is the Python's
 * exit-2 usage error, which `usageError` reproduces.
 */
function flagValue(argv: string[], flag: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = splitFlag(argv[i]);
    if (name !== flag) continue;
    if (inline !== null) return inline;
    return i + 1 < argv.length ? argv[i + 1] : null;
  }
  return null;
}

function usageError(script: string, message: string): { stdout: string; exitCode: number } {
  return { stdout: `${script}: error: ${message}`, exitCode: 2 };
}

/**
 * The project root as the Python saw it. `Path.resolve()`d before anything was
 * derived from it — and the ports derive slugs and directory hashes from the
 * string they are handed (render.ts), so `--project-root` must arrive absolute
 * and slash-normalized, as the Task 5 review ruled. `--project-root .` arrives
 * as the working directory, which is what the interpreter resolved it to.
 */
function absoluteRoot(root: string): string {
  return absolutePath(root);
}

/** Python `repr()` of the ASCII text the refusals quote back. */
function pyRepr(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * The `--set` overrides, in every shape a command line writes them: the two
 * tokens `--set k=v` (what argparse itself takes), the single token
 * `--set=k=v`, and the single quoted token `"--set k=v"` the plan's brief
 * spells. The assignment splits on the first `=` — the Python's
 * `partition("=")` — so a value may itself hold `=`. An assignment with no key
 * or no value is reported, not dropped: the Python refuses it too.
 */
function setOverrides(argv: string[]): { set: Record<string, string>; invalid: string[] } {
  const set: Record<string, string> = {};
  const invalid: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    let assignment: string | null = null;
    if (token === "--set") assignment = argv[++i] ?? "";
    else if (token.startsWith("--set=")) assignment = token.slice("--set=".length);
    else if (token.startsWith("--set ")) assignment = token.slice("--set ".length);
    if (assignment === null) continue;
    const cut = assignment.indexOf("=");
    if (cut <= 0) invalid.push(assignment);
    else set[assignment.slice(0, cut)] = assignment.slice(cut + 1);
  }
  return { set, invalid };
}

/**
 * Every `--key`/`-k` dotted path, in the order given: the Python's repeatable
 * `action="append"` argument, in both spellings the call sites use (`--key
 * core.output_folder`, `-k workflow`) and the `--key=k` form argparse also
 * takes. Repeats are kept — the Python emits one entry per requested key.
 */
function keyPaths(argv: string[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--key" || token === "-k") {
      const value = argv[++i];
      if (value !== undefined) keys.push(value);
    } else if (token.startsWith("--key=")) {
      keys.push(token.slice("--key=".length));
    }
  }
  return keys;
}

/** The Python's `_MISSING`. */
const MISSING = Symbol("missing");

/** The Python's `extract_key`: the dotted path walks nested tables only — a
 * missing part, or a scalar or list along the way, is missing. */
function extractKey(data: unknown, dotted: string): unknown {
  let current: unknown = data;
  for (const part of dotted.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return MISSING;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * What the two resolvers print: without `--key`, the whole merged table; with
 * it, the Python's filter — one entry per requested dotted path that resolved,
 * under the path as it was written, in the order requested, a key that is not
 * there omitted rather than an error. 13 call sites read values this way.
 */
function resolveOutput(merged: Record<string, unknown>, argv: string[]): unknown {
  const keys = keyPaths(argv);
  if (keys.length === 0) return merged;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = extractKey(merged, key);
    if (value !== MISSING) out[key] = value;
  }
  return out;
}

/** `validate_manifests` → `validateManifests`: the helper ports export the
 * Python stem in camelCase, while the tree invokes the stem as written. */
function camel(stem: string): string {
  return stem.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export async function cliMain(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }> {
  const [script, ...rest] = argv;
  if (script === undefined) {
    return { stdout: "usage: node ade-runtime.mjs <script> <script args…>", exitCode: 2 };
  }
  switch (script) {
    case "tickets":
    case "read_store":
      // read_store.py's CLI is tickets.ts's, subcommand-less argv and all.
      return tickets(rest, fs);

    case "resolve_config": {
      const root = flagValue(rest, "--project-root");
      if (root === null) return usageError("resolve_config", "the following arguments are required: --project-root");
      const cfg = await loadCentralConfig(absoluteRoot(root), fs);
      return { stdout: JSON.stringify(resolveOutput(cfg, rest), null, 2), exitCode: 0 };
    }

    case "resolve_customization": {
      const root = flagValue(rest, "--project-root");
      const skillRoot = flagValue(rest, "--skill");
      if (root === null) return usageError("resolve_customization", "the following arguments are required: --project-root");
      if (skillRoot === null) return usageError("resolve_customization", "the following arguments are required: --skill");
      // The skill's name is its install folder — Python's `Path(skill_root).name`.
      const skill = skillRoot.replace(/\/+$/, "").split("/").pop() ?? skillRoot;
      const merged = await resolveCustomization(absoluteRoot(root), skillRoot, skill, fs);
      return { stdout: JSON.stringify(resolveOutput(merged, rest), null, 2), exitCode: 0 };
    }

    case "render_skill": {
      const root = flagValue(rest, "--project-root");
      const skill = flagValue(rest, "--skill");
      if (root === null) return usageError("render_skill", "the following arguments are required: --project-root");
      if (skill === null) return usageError("render_skill", "the following arguments are required: --skill");
      const { set, invalid } = setOverrides(rest);
      if (invalid.length > 0) {
        // The Python raises this inside the renderer: a HALT refusal, exit 1.
        // The CLI answers it here because a malformed token cannot survive the
        // map the renderSkill port takes — and dropping it would silently
        // render with defaults.
        return {
          stdout: `HALT: invalid --set assignment ${pyRepr(invalid[0])}; expected bare dotted key=value\n`,
          exitCode: 1,
        };
      }
      // The render's stdout line, printed as the Python printed it — and with
      // the Python's exit code: `HALT: <reason>` is a refusal, exit 1, so a
      // caller that checks the code rather than the line halts too.
      const stdout = await renderSkill(absoluteRoot(root), skill, set, fs);
      return { stdout, exitCode: stdout.startsWith("HALT:") ? 1 : 0 };
    }

    case "memlog":
      // The pinned memlog.py is a CLI: its argv passes straight through, no
      // parsing here (Task 5 ruling).
      return memlog(rest, fs);

    default: {
      // The late ports — Task 5b's trio and Task 5c's skill-root helpers —
      // export by name from one module that the bundle inlines, so names
      // dispatch as they land without touching this switch.
      const helpers = (await import("./helpers")) as Record<string, Port | undefined>;
      const fn = helpers[script] ?? helpers[camel(script)];
      if (typeof fn === "function") return fn(rest, fs);
      if (PENDING_PORTS.has(script)) {
        return { stdout: `${script}: not ported into this runtime build yet`, exitCode: 1 };
      }
      return { stdout: `unknown runtime script: ${script}`, exitCode: 2 };
    }
  }
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("ade-runtime.mjs")) {
  const { realFs } = await import("./fs");
  try {
    const r = await cliMain(process.argv.slice(2), realFs());
    // A port's stdout is the Python's bytes, its newline included; the CLI's
    // own messages and JSON have none, so this is where exactly one is ensured.
    // Setting exitCode rather than calling process.exit keeps a piped stdout
    // from being cut off.
    if (r.stdout) process.stdout.write(r.stdout.endsWith("\n") ? r.stdout : `${r.stdout}\n`);
    process.exitCode = r.exitCode;
  } catch (error) {
    // A crash the Python never caught: its exception line is the portable part
    // (the memlog port's ruling), and the interpreter's exit code was 1.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
