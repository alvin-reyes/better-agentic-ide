import { execFile } from "node:child_process";
import type { Fs } from "./fs";
import { pyJson, pyRepr } from "./knowledge";
import { splitFlag, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-retrospective/scripts/git_evidence.py` — measure the
 * commit and per-file change volume over a revision range, as one JSON object.
 * The goldens in `__tests__/goldens/helpers/gitEvidence-*.json` are the
 * contract: the no-range answer, the two refusals, the pinned repository's
 * measurement, and the local git failure.
 *
 * The Python runs two `git log --numstat` passes through `subprocess`; the port
 * runs the same commands through `node:child_process`, which is what a bundled
 * runtime that must measure a repository has instead. `Fs` plays no part —
 * git reads the repository itself — and the argv names the repo and the range.
 * `--skill-root` is Task 1's patcher artifact: the call site writes it and the
 * Python never read its own location, so the port accepts it and ignores it,
 * as the neighbouring ports do.
 *
 * One documented divergence: the Python decoded git's output with
 * `errors="surrogateescape"`, so two distinct non-UTF-8 paths stay distinct.
 * This port decodes as UTF-8 with replacement, which merges them — a
 * repository with non-UTF-8 paths in the measured range is the only shape that
 * shows it.
 */

const UNIT_SEP = "\x1f";
// sha, space-separated parents (empty for a root commit), subject.
const LOG_FORMAT = `--format=%H${UNIT_SEP}%P${UNIT_SEP}%s`;

function emit(payload: unknown, code = 0): PortResult {
  // `_emit` writes the JSON without a trailing newline and exits: the shape is
  // JSON-only, and the CLI is what appends a line for a terminal.
  return { stdout: pyJson(payload, { ensureAscii: true }), exitCode: code };
}

/** `JsonArgumentParser.error`: the JSON-only stdout contract, exit 2. */
function argumentError(message: string): PortResult {
  return emit({ ok: false, error: `argument error: ${message}` }, 2);
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** `subprocess.run`: the argv as given, the environment without any GIT_ var. */
function runGit(cmd: string[]): Promise<GitResult> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("GIT_") && value !== undefined) env[key] = value;
  return new Promise((resolve, reject) => {
    execFile(
      cmd[0],
      cmd.slice(1),
      { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code === "string") return reject(error);
        const code = error && typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });
}

/** `_git_log`: one `git log --numstat` pass over the range. */
function gitLog(repo: string, extraArgs: string[], range: string): Promise<string> {
  return runGit([
    "git",
    "-c",
    "core.quotePath=false",
    "-c",
    "log.diffMerges=separate",
    "-C",
    repo,
    "log",
    "--numstat",
    "--no-renames",
    ...extraArgs,
    LOG_FORMAT,
    range,
    "--", // terminate rev parsing so the range can never match a pathspec
  ]).then((proc) => {
    if (proc.code !== 0) {
      // stderr can be empty (a signal kill, a quiet failure); the exit code is
      // then the only thing left to report.
      throw new GitFailure(proc.stderr.trim() || `git exited ${proc.code}`);
    }
    return proc.stdout;
  });
}

class GitFailure extends Error {}

function parseNumstatLine(line: string): { added: number | null; deleted: number | null; path: string } | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;
  const [addedRaw, deletedRaw, ...rest] = parts;
  return {
    added: addedRaw === "-" ? null : Number.parseInt(addedRaw, 10),
    deleted: deletedRaw === "-" ? null : Number.parseInt(deletedRaw, 10),
    path: rest.join("\t"),
  };
}

interface Commit {
  sha: string;
  subject: string;
  stories: string[];
  is_merge: boolean;
}

interface FileEntry {
  path: string;
  added: number;
  deleted: number;
  binary_revisions: number;
  commit_count: number;
}

/** `_parse_log`: one pass's commits and per-path churn. */
export function parseLog(output: string, stories: string[]): { commits: Commit[]; files: Map<string, FileEntry> } {
  const commits: Commit[] = [];
  const files = new Map<string, FileEntry>();
  const seen = new Set<string>();
  let counting = true;

  for (const raw of output.split("\n")) {
    if (raw.includes(UNIT_SEP)) {
      const [sha, parents, ...subjectParts] = raw.split(UNIT_SEP);
      const subject = subjectParts.join(UNIT_SEP);
      // Under -m, git repeats a merge's header once per parent; only the first
      // block for a sha is counted, so no churn is double counted.
      counting = !seen.has(sha);
      if (!counting) continue;
      seen.add(sha);
      commits.push({
        sha,
        subject,
        // Every id the subject names, in --stories order, word-boundary
        // matched so "1-2" does not also match "11-2".
        stories: stories.filter((id) => new RegExp(`\\b${escapeRegExp(id)}\\b`).test(subject)),
        is_merge: parents.split(/\s+/).filter(Boolean).length > 1,
      });
      continue;
    }

    if (!counting || !raw.trim()) continue;
    const parsed = parseNumstatLine(raw);
    if (parsed === null) continue;

    let entry = files.get(parsed.path);
    if (entry === undefined) {
      entry = { path: parsed.path, added: 0, deleted: 0, binary_revisions: 0, commit_count: 0 };
      files.set(parsed.path, entry);
    }
    entry.commit_count += 1;
    if (parsed.added === null || parsed.deleted === null) {
      // A binary revision is unmeasurable, not zero.
      entry.binary_revisions += 1;
    } else {
      entry.added += parsed.added;
      entry.deleted += parsed.deleted;
    }
  }
  return { commits, files };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileList(files: Map<string, FileEntry>): Record<string, unknown>[] {
  return [...files.values()].map((entry) => ({
    path: entry.path,
    added: entry.added,
    deleted: entry.deleted,
    net: entry.added - entry.deleted,
    commit_count: entry.commit_count,
    binary_revisions: entry.binary_revisions,
  }));
}

/** The uniform port shape: git_evidence prints JSON for every outcome. */
export async function gitEvidence(argv: string[], _fs: Fs): Promise<PortResult> {
  let repo = ".";
  let range: string | null = null;
  let storiesArg: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--repo") {
      const taken = value();
      if (taken === undefined) return argumentError("argument --repo: expected one argument");
      repo = taken;
    } else if (flag === "--range") {
      const taken = value();
      if (taken === undefined) return argumentError("argument --range: expected one argument");
      range = taken;
    } else if (flag === "--stories") {
      const taken = value();
      if (taken === undefined) return argumentError("argument --stories: expected one argument");
      storiesArg = taken;
    } else if (flag === "--skill-root") {
      // The patched call site (bmad-retrospective's evidence-gathering.md)
      // writes `--skill-root {skill-root}` first; nothing derives from its own
      // location, so the value is read and discarded (Task 5c's convention).
      if (value() === undefined) return argumentError("argument --skill-root: expected one argument");
    } else return argumentError(`unrecognized arguments: ${argv[i]}`);
  }

  // dict.fromkeys dedupes while keeping the caller's order.
  const stories = storiesArg ? [...new Set(storiesArg.split(",").map((id) => id.trim()).filter(Boolean))] : [];

  if (range === null) {
    return emit({ range: null, note: "no range supplied", commits: [], files: [] });
  }

  // Accept only an explicit REV..REV range: a leading "-", a single rev, an
  // empty endpoint or a three-dot range all measure something else.
  const cut = range.indexOf("..");
  const left = cut < 0 ? range : range.slice(0, cut);
  const right = cut < 0 ? "" : range.slice(cut + 2);
  if (range !== range.trim() || range.startsWith("-") || !left || !right || right.startsWith(".")) {
    return emit({ ok: false, error: `invalid --range ${pyRepr(range)}: expected a revision range like REV..REV` }, 2);
  }

  try {
    const first = parseLog(await gitLog(repo, [], range), stories);
    const mergeCount = first.commits.filter((commit) => commit.is_merge).length;
    let mergeCommits: Commit[] = [];
    let mergeFiles = new Map<string, FileEntry>();
    if (mergeCount) {
      // Pass 2 measures only the merges on the range head's first-parent spine.
      const second = parseLog(await gitLog(repo, ["-m", "--first-parent", "--min-parents=2"], range), stories);
      mergeCommits = second.commits;
      mergeFiles = second.files;
    }
    return emit({
      range,
      commit_count: first.commits.length,
      merge_count: mergeCount,
      merges_measured: mergeCommits.length,
      commits: first.commits,
      files: fileList(first.files),
      merge_files: fileList(mergeFiles),
      stories_supplied: stories,
    });
  } catch (error) {
    const message = error instanceof GitFailure ? error.message : (error as Error).message;
    return emit({ ok: false, error: message }, 1);
  }
}
