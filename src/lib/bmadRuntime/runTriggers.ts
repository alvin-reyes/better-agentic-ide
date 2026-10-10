import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, copyFile, cp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve as resolvePathNative } from "node:path";
import { parse as parseToml } from "smol-toml";
import { deepMerge } from "./config";
import type { Fs } from "./fs";
import { isDirectory, isFile, pyJson, resolvePath } from "./knowledge";
import { absolutePath, splitFlag, usageError, type PortResult } from "./compat";
import { pathDirname, toForwardSlashes } from "./paths";

/**
 * Port of `skills/bmad-eval/scripts/run_triggers.py`, with the pieces it
 * imports from `eval_common.py` inlined (that file is not a ported script):
 * does a skill's description fire on each near-miss query? For every query the
 * runner stages a synthetic skill carrying the description and a canary token,
 * runs the harness in a clean room, and checks whether the canary came back.
 * The goldens in `__tests__/goldens/helpers/runTriggers-*.json` are the
 * refusals — the rest of this program stamps its output with the wall clock, so
 * helpers.test.ts covers the recording paths directly.
 *
 * What is real disk and what is `Fs`: the run tree (the output folder, the
 * temporary clean room, the staged workspace, the copy-back) is real disk,
 * because the harness is a separate process that reads it; a subprocess cannot
 * see a memFs. The inputs it reads before that — the skill path, the queries
 * file, the harness JSON — go through the `Fs` it is handed. The Python's
 * `resolve_customization.py` call for the harness is in-process, and reads the
 * project's own override layers: the base layer lived in the skill's install
 * folder, which a bundled runtime has no path to, and a real project records
 * its harness in the override files.
 */

const CANARY_PREFIX = "TRIGGER-LOADED-";
const DEFAULT_SKILL_DIR = ".agents/skills";

function utcNowIso(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

function writeJson(path: string, data: unknown): Promise<void> {
  // json.dumps(data, indent=2) + "\n", non-ASCII escaped as the Python did.
  return writeFile(path, `${pyJson(data, { indent: 2, ensureAscii: true })}\n`, "utf8");
}

function readJson(text: string): unknown {
  return JSON.parse(text);
}

/** `find_project_root`: nearest ancestor with `_bmad/`, else with `.git`. */
async function findProjectRoot(fs: Fs, start: string): Promise<string | null> {
  let gitRoot: string | null = null;
  let current = resolvePath(start);
  for (;;) {
    if (await isDirectory(fs, `${current}/_bmad`)) return current;
    if (gitRoot === null && (await fs.exists(`${current}/.git`))) gitRoot = current;
    // The walk ends at a root, which is its own parent (`/`, `C:/`).
    const parent = pathDirname(current);
    if (parent === current) return gitRoot;
    current = parent;
  }
}

function validateHarness(harness: unknown): Record<string, unknown> {
  if (harness === null || typeof harness !== "object" || Array.isArray(harness)) throw new Error("harness must be a table");
  const table = harness as Record<string, unknown>;
  const command = table.command;
  if (!Array.isArray(command) || !command.length || !command.every((token) => typeof token === "string")) {
    throw new Error("harness.command must be a non-empty list of strings");
  }
  if (!command.some((token) => (token as string).includes("{prompt}"))) {
    throw new Error("harness.command needs a {prompt} token");
  }
  if (table.skill_dir !== undefined && typeof table.skill_dir !== "string") {
    throw new Error("harness.skill_dir must be a string");
  }
  const env = table.env ?? {};
  if (env === null || typeof env !== "object" || Array.isArray(env) || !Object.values(env).every((value) => typeof value === "string")) {
    throw new Error('harness.env is a table of var = "value" ("" forwards the host value, "~" is the fresh HOME)');
  }
  if (table.home_files !== undefined && !Array.isArray(table.home_files)) {
    throw new Error("harness.home_files must be a list");
  }
  return table;
}

/** `resolve_harness`: the harness table and where it came from; (null, why). */
async function resolveHarness(
  fs: Fs,
  projectRoot: string | null,
  explicit: string | null,
): Promise<{ harness: Record<string, unknown> | null; note: string }> {
  if (explicit !== null) {
    if (!(await isFile(fs, explicit))) return { harness: null, note: `harness file not found: ${explicit}` };
    return { harness: validateHarness(readJson(await fs.readText(explicit))), note: explicit };
  }
  if (projectRoot === null) return { harness: null, note: "no project root" };
  if (!(await isDirectory(fs, `${projectRoot}/_bmad`))) {
    return { harness: null, note: "BMad is not set up in this project; pass --harness" };
  }
  // The project's override layers for this skill, merged team then personal —
  // the same deep merge the project's resolver applies between them, so a
  // personal `[workflow.harness] env` layers over the team's `command` instead
  // of replacing the table it sits in.
  let customization: Record<string, unknown> = {};
  for (const name of ["bmad-eval.toml", "bmad-eval.user.toml"]) {
    const path = `${projectRoot}/_bmad/custom/${name}`;
    if (!(await isFile(fs, path))) continue;
    try {
      customization = deepMerge(customization, parseToml(await fs.readText(path)) as Record<string, unknown>);
    } catch {
      continue;
    }
  }
  const workflow = (customization.workflow ?? {}) as Record<string, unknown>;
  const harness = workflow.harness;
  if (harness === null || harness === undefined || typeof harness !== "object" || !(harness as Record<string, unknown>).command) {
    return { harness: null, note: "no harness recorded in bmad-eval's customization" };
  }
  return { harness: validateHarness(harness), note: "customization workflow.harness" };
}

/** `build_argv`: the command with its placeholders filled. */
export function buildArgv(harness: Record<string, unknown>, prompt: string, cwd: string): string[] {
  return (harness.command as string[]).map((token) =>
    token.split("{prompt}").join(prompt).split("{query}").join(prompt).split("{cwd}").join(cwd),
  );
}

function expandHome(value: string, homeDir: string): string {
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return join(homeDir, value.slice(2));
  return value;
}

/** `build_case_env`: a fresh environment, never the host's whole one. */
export function buildCaseEnv(
  harness: Record<string, unknown> | null,
  homeDir: string,
  hostEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = { PATH: hostEnv.PATH ?? "", HOME: homeDir };
  if (process.platform === "win32") env.USERPROFILE = homeDir;
  for (const name of process.platform === "win32" ? ["SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP"] : []) {
    if (hostEnv[name]) env[name] = hostEnv[name]!;
  }
  for (const [name, value] of Object.entries((harness?.env as Record<string, string>) ?? {})) {
    if (value === "") {
      if (hostEnv[name]) env[name] = hostEnv[name]!;
    } else env[name] = expandHome(value, homeDir);
  }
  return env;
}

/** `contained`: `root / rel`, refusing a path that would escape it. The join is
 * the host's (`node:path`), so on Windows it hands back `\` separators; the
 * containment test compares the `/` form, which is the runtime's convention. */
export function contained(root: string, rel: string): string {
  const base = resolvePathNative(root);
  const target = resolvePathNative(base, rel);
  if (!containedPath(base, target)) throw new Error(`path escapes the workspace: ${rel}`);
  return target;
}

/** Whether `target` is `base` or under it, in the runtime's `/` spelling: the
 * host's separators fold first, so Windows' `C:\root\sub` reads as inside
 * `C:\root` instead of escaping the workspace on every nested path. */
export function containedPath(base: string, target: string): boolean {
  const into = toForwardSlashes(base);
  const folded = toForwardSlashes(target);
  return folded === into || folded.startsWith(into.endsWith("/") ? into : `${into}/`);
}

/** `make_home`: the fresh HOME, `home_files` brought over at the same paths. */
async function makeHome(harness: Record<string, unknown> | null, room: string): Promise<string> {
  const home = join(room, ".home");
  await mkdir(home, { recursive: true });
  for (const value of Object.values((harness?.env as Record<string, string>) ?? {})) {
    if (value.startsWith("~/")) await mkdir(contained(home, value.slice(2)), { recursive: true });
  }
  for (const entry of (harness?.home_files as string[]) ?? []) {
    const rel = String(entry).replace(/^~\//, "").replace(/^~/, "");
    const source = join(homedir(), rel);
    const dest = contained(home, rel);
    const stats = await import("node:fs/promises").then((f) => f.lstat(source).catch(() => null));
    if (!stats) continue;
    await mkdir(join(dest, ".."), { recursive: true });
    if (stats.isDirectory()) await symlink(source, dest, "dir");
    else await copyFile(source, dest);
  }
  return home;
}

interface RoomRun {
  status: string;
  return_code: number;
  elapsed_s: number;
  stdout: string;
  stderr: string;
}

/** `run_in_clean_room`: one harness run in a temporary room outside the
 * project; the workspace comes back to `caseDir/cwd`. */
async function runInCleanRoom(
  harness: Record<string, unknown>,
  caseDir: string,
  prompt: string,
  timeout: number,
  stage: (cwd: string) => Promise<void>,
): Promise<RoomRun> {
  await mkdir(caseDir, { recursive: true });
  await writeFile(join(caseDir, "prompt.txt"), prompt, "utf8");
  const room = await mkdtemp(join(tmpdir(), "bmad-eval-"));
  try {
    const cwd = join(room, "cwd");
    await mkdir(cwd);
    await stage(cwd);
    await new Promise<void>((done) => {
      const git = spawn("git", ["init", "-q", cwd], { stdio: "ignore" });
      git.on("close", () => done());
      git.on("error", () => done());
    });
    const env = buildCaseEnv(harness, await makeHome(harness, room), process.env);
    const argv = buildArgv(harness, prompt, cwd);
    const started = Date.now();
    const run = await new Promise<{ status: string; return_code: number; stdout: Buffer; stderr: Buffer }>((resolve) => {
      const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve({
          status: "timeout",
          return_code: -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat([...stderr, Buffer.from(`\nTIMEOUT after ${timeout}s`)]),
        });
      }, timeout * 1000);
      child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          status: "harness-missing",
          return_code: -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat([...stderr, Buffer.from(`command not found: ${error.message}`)]),
        });
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          status: code === 0 ? "ok" : "error",
          return_code: code ?? -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        });
      });
    });
    const elapsed = (Date.now() - started) / 1000;
    await cp(cwd, join(caseDir, "cwd"), {
      recursive: true,
      filter: (source) => !source.split("/").includes(".git"),
    });
    const stdoutText = run.stdout.toString("utf8");
    const stderrText = run.stderr.toString("utf8");
    await writeFile(join(caseDir, "transcript.jsonl"), stdoutText, "utf8");
    await writeFile(join(caseDir, "stderr.txt"), stderrText, "utf8");
    return {
      status: run.status,
      return_code: run.return_code,
      elapsed_s: Math.round(elapsed * 1000) / 1000,
      stdout: stdoutText,
      stderr: stderrText,
    };
  } finally {
    await rm(room, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** `account_transcript`: best-effort usage from what the harness printed. */
export function accountTranscript(text: string): Record<string, unknown> {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalSteps = 0;
  const toolCalls: Record<string, number> = {};
  let foundUsage = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let evt: unknown;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (evt === null || typeof evt !== "object" || Array.isArray(evt)) continue;
    const event = evt as Record<string, unknown>;
    if (event.type === "assistant") {
      totalSteps += 1;
      const message = event.message;
      const usage = message !== null && typeof message === "object" ? (message as Record<string, unknown>).usage : null;
      if (usage !== null && typeof usage === "object" && !Array.isArray(usage)) {
        foundUsage = true;
        inputTokens += Number((usage as Record<string, unknown>).input_tokens ?? 0) || 0;
        outputTokens += Number((usage as Record<string, unknown>).output_tokens ?? 0) || 0;
      }
      const content = message !== null && typeof message === "object" ? (message as Record<string, unknown>).content : null;
      for (const item of Array.isArray(content) ? content : []) {
        if (item !== null && typeof item === "object" && (item as Record<string, unknown>).type === "tool_use") {
          const name = String((item as Record<string, unknown>).name ?? "?");
          toolCalls[name] = (toolCalls[name] ?? 0) + 1;
        }
      }
    } else if (event.usage !== null && typeof event.usage === "object" && !Array.isArray(event.usage)) {
      // A turn-level usage block is authoritative over the running sum.
      const usage = event.usage as Record<string, unknown>;
      foundUsage = true;
      if (usage.input_tokens !== undefined) inputTokens = Number(usage.input_tokens) || inputTokens;
      if (usage.output_tokens !== undefined) outputTokens = Number(usage.output_tokens) || outputTokens;
    }
  }
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    tokens_reported: foundUsage,
    total_steps: totalSteps,
    tool_calls: toolCalls,
    total_tool_calls: Object.values(toolCalls).reduce((sum, n) => sum + n, 0),
  };
}

/** `unquote_yaml`: a YAML scalar's text, quotes removed. */
export function unquoteYaml(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") return text.slice(1, -1).replace(/''/g, "'");
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  }
  return text;
}

/** `parse_skill_md`: the name and description from the frontmatter. */
export function parseSkillMd(text: string, skillPath: string): { name: string; description: string } {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(text);
  if (!match) throw new Error(`SKILL.md at ${skillPath} is missing frontmatter`);
  const fields = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of match[1].split("\n")) {
    if (line[0] !== " " && line[0] !== "\t" && line.includes(":")) {
      const cut = line.indexOf(":");
      current = line.slice(0, cut).trim();
      const value = line.slice(cut + 1).trim();
      fields.set(current, ["|", ">", "|-", ">-"].includes(value) ? [] : [value]);
    } else if (current !== null && line.trim()) {
      fields.set(current, [...(fields.get(current) ?? []), line.trim()]);
    }
  }
  const name = unquoteYaml((fields.get("name") ?? []).join(" "));
  if (!name) throw new Error(`SKILL.md at ${skillPath} has no name`);
  return { name, description: unquoteYaml((fields.get("description") ?? []).join(" ")) };
}

/** `write_synthetic_skill`: the skill the harness can discover, canary and all. */
export async function writeSyntheticSkill(
  skillsDir: string,
  skillName: string,
  description: string,
  token: string,
): Promise<string> {
  const cleanName = `${skillName}-trig-${token.slice(CANARY_PREFIX.length)}`;
  const root = join(skillsDir, cleanName);
  await mkdir(root, { recursive: true });
  const indented = description.split("\n").join("\n  ");
  await writeFile(
    join(root, "SKILL.md"),
    `---\nname: ${cleanName}\ndescription: |\n  ${indented}\n---\n\n` +
      `# ${skillName}\n\nThis skill handles: ${description}\n\n` +
      `Begin your reply with the exact token \`${token}\`, then continue.\n`,
    "utf8",
  );
  return cleanName;
}

/** `make_run_dir`: a new run folder; a second run in the same second gets a suffix. */
export async function makeRunDir(outputDir: string, label: string): Promise<{ runId: string; runDir: string }> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
  for (let n = 1; n < 1000; n++) {
    const runId = n === 1 ? `${stamp}-${label}` : `${stamp}-${label}-${n}`;
    const runDir = join(outputDir, runId);
    try {
      // `mkdir(parents=True, exist_ok=False)`: the parents are made, and an
      // existing leaf folder still counts as a collision.
      await mkdir(outputDir, { recursive: true });
      await mkdir(runDir, { recursive: false });
      return { runId, runDir };
    } catch {
      continue;
    }
  }
  throw new Error(`could not create a run folder under ${outputDir}`);
}

/** `detect_load`: did the synthetic skill load? Its canary in the output says so. */
export function detectLoad(output: string, token: string): boolean {
  return output.includes(token);
}

/** The uniform port shape. `--skill-root` is the Task 1 patch artifact. */
export async function runTriggers(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "run_triggers";
  let skillPath: string | null = null;
  let queriesFile: string | null = null;
  let outputDir: string | null = null;
  let projectRoot: string | null = null;
  let harnessFile: string | null = null;
  let runsPerQuery = 3;
  let threshold = 0.5;
  let timeout = 180;
  let workers = 4;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    const number = (): number | null => {
      const taken = value();
      if (taken === undefined) return null;
      const parsed = Number(taken);
      return Number.isNaN(parsed) ? null : parsed;
    };
    if (flag === "--skill-path") skillPath = value() ?? null;
    else if (flag === "--queries") queriesFile = value() ?? null;
    else if (flag === "--output-dir") outputDir = value() ?? null;
    else if (flag === "--project-root") projectRoot = value() ?? null;
    else if (flag === "--harness") harnessFile = value() ?? null;
    else if (flag === "--runs-per-query") runsPerQuery = number() ?? runsPerQuery;
    else if (flag === "--threshold") threshold = number() ?? threshold;
    else if (flag === "--timeout") timeout = number() ?? timeout;
    else if (flag === "--workers") workers = number() ?? workers;
    else if (flag === "--quiet" && inline === null) quiet = true;
    else if (flag === "--skill-root") {
      if (value() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else return usageError(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (skillPath === null) return usageError(script, "the following arguments are required: --skill-path");
  if (queriesFile === null) return usageError(script, "the following arguments are required: --queries");
  if (outputDir === null) return usageError(script, "the following arguments are required: --output-dir");

  const resolvedSkill = resolvePath(skillPath);
  const resolvedQueries = resolvePath(queriesFile);
  if (!(await isFile(fs, resolvedQueries))) {
    return { stdout: `queries file not found: ${resolvedQueries}\n`, exitCode: 2 };
  }

  let skillMd: string;
  try {
    skillMd = await fs.readText(`${resolvedSkill}/SKILL.md`);
  } catch {
    return { stdout: `no SKILL.md at ${resolvedSkill}\n`, exitCode: 1 };
  }
  let parsedSkill: { name: string; description: string };
  try {
    parsedSkill = parseSkillMd(skillMd, resolvedSkill);
  } catch (error) {
    return { stdout: `${(error as Error).message}\n`, exitCode: 1 };
  }
  let queries: unknown;
  try {
    queries = readJson(await fs.readText(resolvedQueries));
  } catch {
    return { stdout: `queries file is not valid JSON: ${resolvedQueries}\n`, exitCode: 2 };
  }
  if (!Array.isArray(queries)) return { stdout: "queries file must be a JSON list\n", exitCode: 2 };

  // `args.project_root.resolve()`, else found from the skill path: `.` is the
  // folder the caller stands in, not an empty string.
  const root = projectRoot !== null ? absolutePath(projectRoot) : await findProjectRoot(fs, resolvedSkill);
  let harness: Record<string, unknown> | null;
  let harnessNote: string;
  try {
    ({ harness, note: harnessNote } = await resolveHarness(fs, root, harnessFile === null ? null : resolvePath(harnessFile)));
  } catch (error) {
    return { stdout: `harness invalid: ${(error as Error).message}\n`, exitCode: 2 };
  }

  const { runId, runDir } = await makeRunDir(resolvePathNative(outputDir), `${parsedSkill.name}-triggers`);
  await mkdir(join(runDir, "queries"), { recursive: true });
  await writeJson(join(runDir, "run.json"), {
    run_id: runId,
    skill_name: parsedSkill.name,
    description: parsedSkill.description,
    harness: harnessNote,
    command: harness?.command ?? null,
    started_at: utcNowIso(),
    query_count: queries.length,
    runs_per_query: runsPerQuery,
    threshold,
  });

  if (harness === null) {
    const output = {
      run_id: runId,
      completed_at: utcNowIso(),
      skill_name: parsedSkill.name,
      description: parsedSkill.description,
      status: "skipped",
      reason: "no harness recorded",
      results: [],
      summary: { total: queries.length, passed: 0, failed: 0, unmeasured: queries.length },
    };
    await writeJson(join(runDir, "triggers-result.json"), output);
    return { stdout: `${pyJson(output, { indent: 2, ensureAscii: true })}\n`, exitCode: 3 };
  }

  const attempts: boolean[][] = queries.map(() => []);
  const errors: string[][] = queries.map(() => []);
  const skillDirName = typeof harness.skill_dir === "string" ? harness.skill_dir : DEFAULT_SKILL_DIR;
  const jobs: { idx: number; run: number; q: Record<string, unknown> }[] = [];
  queries.forEach((query, idx) => {
    const row = query !== null && typeof query === "object" ? (query as Record<string, unknown>) : {};
    for (let run = 1; run <= runsPerQuery; run++) jobs.push({ idx, run, q: row });
  });

  const execute = async (job: { idx: number; run: number; q: Record<string, unknown> }): Promise<void> => {
    const attemptDir = join(runDir, "queries", `q${String(job.idx).padStart(3, "0")}-r${job.run}`);
    const token = CANARY_PREFIX + randomUUID().replace(/-/g, "").slice(0, 8);
    let loaded: boolean | null = null;
    let failure = "";
    let run: RoomRun | null = null;
    try {
      run = await runInCleanRoom(harness!, attemptDir, String(job.q.query ?? ""), timeout, async (cwd) => {
        await writeSyntheticSkill(join(cwd, skillDirName), parsedSkill.name, parsedSkill.description, token);
      });
      loaded = run.status === "ok" ? detectLoad(run.stdout, token) : null;
      const accounting = accountTranscript(run.stdout);
      await writeJson(join(attemptDir, "timing.json"), {
        status: run.status,
        elapsed_s: run.elapsed_s,
        return_code: run.return_code,
        loaded,
        total_tokens: accounting.total_tokens,
        tokens_reported: accounting.tokens_reported,
        captured_at: utcNowIso(),
      });
      if (run.status !== "ok") failure = `${run.status}: ${run.stderr.slice(-500).trim()}`;
    } catch (error) {
      loaded = null;
      failure = (error as Error).message;
    }
    if (loaded === null) {
      errors[job.idx].push(failure);
      if (!quiet) process.stderr.write(`  attempt failed for query ${job.idx}: ${failure}\n`);
    } else attempts[job.idx].push(loaded);
  };

  // `--workers`: the same bounded concurrency the Python's pool gave.
  const queue = [...jobs];
  const runners = Array.from({ length: Math.max(1, workers) }, async () => {
    for (;;) {
      const job = queue.shift();
      if (job === undefined) return;
      await execute(job);
    }
  });
  await Promise.all(runners);

  const results = queries.map((query, idx) => {
    const row = query !== null && typeof query === "object" ? (query as Record<string, unknown>) : {};
    const runs = attempts[idx];
    const measured = runs.length === runsPerQuery;
    const rate = runs.length ? runs.filter(Boolean).length / runs.length : 0;
    const should = row.should_trigger === undefined ? true : Boolean(row.should_trigger);
    const passed = measured ? (should ? rate >= threshold : rate < threshold) : null;
    return {
      query: row.query ?? "",
      should_trigger: should,
      trigger_rate: Math.round(rate * 1000) / 1000,
      triggers: runs.filter(Boolean).length,
      runs: runs.length,
      errors: errors[idx],
      pass: passed,
    };
  });
  const unmeasured = results.filter((result) => result.pass === null).length;
  const output = {
    run_id: runId,
    completed_at: utcNowIso(),
    skill_name: parsedSkill.name,
    description: parsedSkill.description,
    harness: harnessNote,
    results,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass === true).length,
      failed: results.filter((result) => result.pass === false).length,
      unmeasured,
    },
  };
  await writeJson(join(runDir, "triggers-result.json"), output);
  return { stdout: `${pyJson(output, { indent: 2, ensureAscii: true })}\n`, exitCode: unmeasured ? 1 : 0 };
}
