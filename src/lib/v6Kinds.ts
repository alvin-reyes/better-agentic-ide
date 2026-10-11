import type { Fs } from "./bmadRuntime/fs";
import { joinPath, pathBasename } from "./bmadRuntime/paths";
import { readFrontmatter } from "./frontmatter";

/**
 * What the v6 skills write, as the board map reads it. Every skill writes one
 * folder per run into the initiative, named by its prefix (`prd-shop/`), with
 * a main file and, for most, a status in some file's frontmatter. One table
 * keeps those facts together: the prefixes, main-file names and status files
 * below come from the vendored skills' customize.toml and SKILL.md.
 *
 * Status words are shown as the doc states them. Agents write them, so they
 * are labels, not gates.
 */

export type V6Phase = "analysis" | "planning" | "implementation" | "validation";
export const V6_PHASES: V6Phase[] = ["analysis", "planning", "implementation", "validation"];
export const PHASE_LABELS: Record<V6Phase, string> = {
  analysis: "Analysis",
  planning: "Planning",
  implementation: "Implementation",
  validation: "Validation",
};

export interface V6Doc {
  kind: string;
  label: string;
  /** The folder's or file's name after its prefix (`shop` for `prd-shop`). */
  name: string;
  /** The main file, project-relative; null when none exists. */
  path: string | null;
  /** As the doc states it, else "present" or "in progress"; "unreadable status" when it cannot be read. */
  status: string;
}

export interface V6Kind {
  kind: string;
  prefix: string;
  phase: V6Phase;
  label: string;
  /** Main-file candidates in order, relative to the folder; `<f>` is the folder's name. */
  main: string[];
  /** The file holding the status (relative, `<f>` substituted) and the keys to try; null when the kind has none. */
  status: { file: string; keys: string[] } | null;
  /** The word when the status file or key is missing. */
  missing: "present" | "in progress";
}

const own = (keys = ["status"]) => ({ file: "<f>.md", keys });
// Brainstorm and forge set their run log's status only when a run finishes.
const runLog = { file: ".memlog.md", keys: ["status"] };

export const V6_KINDS: V6Kind[] = [
  { kind: "brainstorm", prefix: "brainstorm-", phase: "analysis", label: "Brainstorm", main: ["brainstorm.html", "<f>.md"], status: runLog, missing: "in progress" },
  { kind: "forge", prefix: "forge-", phase: "analysis", label: "Forge", main: ["forge-report.html", "<f>.md"], status: runLog, missing: "in progress" },
  { kind: "research", prefix: "research-", phase: "analysis", label: "Research", main: ["<f>.md", "research-briefing.html"], status: own(), missing: "present" },
  { kind: "brief", prefix: "brief-", phase: "analysis", label: "Brief", main: ["<f>.md"], status: own(), missing: "present" },
  { kind: "prfaq", prefix: "prfaq-", phase: "analysis", label: "PRFAQ", main: ["<f>.md"], status: own(["status", "stage"]), missing: "present" },
  { kind: "prd", prefix: "prd-", phase: "planning", label: "PRD", main: ["<f>.md"], status: own(), missing: "present" },
  // The pointer doc is never finalized; bmad-ux marks DESIGN.md final.
  { kind: "ux", prefix: "ux-", phase: "planning", label: "UX", main: ["<f>.md", "EXPERIENCE.md", "DESIGN.md"], status: { file: "DESIGN.md", keys: ["status"] }, missing: "present" },
  { kind: "architecture", prefix: "architecture-", phase: "planning", label: "Architecture", main: ["<f>.md"], status: own(), missing: "present" },
  { kind: "spec", prefix: "spec-", phase: "planning", label: "Spec", main: ["<f>.md"], status: null, missing: "present" },
  { kind: "change", prefix: "change-", phase: "implementation", label: "Course change", main: ["<f>.md"], status: own(), missing: "present" },
  { kind: "walkthrough", prefix: "walkthrough-", phase: "validation", label: "Walkthrough", main: ["<f>.md"], status: null, missing: "present" },
  { kind: "test-summary", prefix: "test-summary-", phase: "validation", label: "Test summary", main: ["<f>.md"], status: null, missing: "present" },
];

export type DocResult = { doc: V6Doc; problem: string | null };

export function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export type Listing = { names: string[]; error: null } | { names: null; error: string };

/** A folder's entries, listed once. A failure is a value, not a throw: the map must survive a folder that vanishes or cannot be read. */
export async function listFolder(path: string, fs: Fs): Promise<Listing> {
  try {
    return { names: await fs.list(path), error: null };
  } catch (e) {
    return { names: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The kind a folder's name says it is; null for anything else. */
export function classifyFolder(name: string): V6Kind | null {
  return V6_KINDS.find((k) => name.startsWith(k.prefix) && name.length > k.prefix.length) ?? null;
}

/** A status word from `path`'s frontmatter, or why it could not be read. A missing file or key is neither. */
async function statusFrom(path: string, keys: string[], fs: Fs): Promise<{ word: string | null; error: string | null }> {
  if (!(await fs.exists(path))) return { word: null, error: null };
  let text: string;
  try {
    text = await fs.readText(path);
  } catch (e) {
    return { word: null, error: `could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
  const fm = readFrontmatter(text);
  if (fm === null) return { word: null, error: "frontmatter is not closed" };
  for (const k of keys) if (fm[k]) return { word: fm[k], error: null };
  return { word: null, error: null };
}

function result(projectRoot: string, doc: Omit<V6Doc, "status">, statusPath: string | null, read: { word: string | null; error: string | null }, missing: string): DocResult {
  return {
    doc: { ...doc, status: read.error ? "unreadable status" : read.word ?? missing },
    problem: read.error && statusPath ? `${relativeTo(projectRoot, statusPath)}: ${read.error}` : null,
  };
}

/**
 * One doc folder's entry: the folder is listed once, the main file is the first
 * candidate the listing holds (no file is opened to probe it), and only the
 * status file is read. Null when it cannot be listed: a stray file named like
 * a doc, or a folder gone since the parent was listed, is not a doc folder.
 * Nothing is read to tell which.
 */
export async function readFolderDoc(projectRoot: string, folder: string, kind: V6Kind, fs: Fs): Promise<DocResult | null> {
  const name = pathBasename(folder);
  const sub = (s: string) => s.replaceAll("<f>", name);
  const base = { kind: kind.kind, label: kind.label, name: name.slice(kind.prefix.length) };
  const listing = await listFolder(folder, fs);
  if (listing.names === null) return null;
  const names = listing.names;
  const main = kind.main.map(sub).find((c) => names.includes(c));
  const path = main ? relativeTo(projectRoot, joinPath(folder, main)) : null;
  const statusName = kind.status ? sub(kind.status.file) : null;
  const statusPath = statusName ? joinPath(folder, statusName) : null;
  const read = kind.status && statusName && statusPath && names.includes(statusName)
    ? await statusFrom(statusPath, kind.status.keys, fs)
    : { word: null, error: null };
  return result(projectRoot, { ...base, path }, statusPath, read, kind.missing);
}

/**
 * A `plan-<slug>.md` outside any ticket: bmad-build's plan for work that has
 * no ticket. A plan whose `ticket` is set belongs to that ticket, which the
 * board already shows, so it is skipped.
 */
export async function readPlanFile(projectRoot: string, file: string, fs: Fs): Promise<DocResult | null> {
  let fm: Record<string, string> | null = {};
  let error: string | null = null;
  try {
    fm = readFrontmatter(await fs.readText(file));
    if (fm === null) error = "frontmatter is not closed";
  } catch (e) {
    error = `could not be read: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (fm && fm.ticket) return null;
  const base = pathBasename(file);
  const doc = {
    kind: "plan",
    label: fm?.route === "oneshot" ? "Quick plan" : "Plan",
    name: base.replace(/^plan-/, "").replace(/\.md$/, ""),
    path: relativeTo(projectRoot, file),
  };
  return result(projectRoot, doc, file, { word: fm?.status || null, error }, "present");
}

/** An epic's retrospective, `<epic>/<epic>-retrospective.md`, with its verdict; null when it has none. */
export async function readRetrospective(projectRoot: string, epicFolder: string, fs: Fs): Promise<DocResult | null> {
  const slug = pathBasename(epicFolder);
  const file = joinPath(epicFolder, `${slug}-retrospective.md`);
  if (!(await fs.exists(file))) return null;
  const read = await statusFrom(file, ["verdict"], fs);
  const doc = { kind: "retrospective", label: "Retrospective", name: slug.replace(/^epic-/, ""), path: relativeTo(projectRoot, file) };
  return result(projectRoot, doc, file, read, "in progress");
}
