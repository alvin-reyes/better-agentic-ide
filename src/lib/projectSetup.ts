/**
 * Project setup: every project ADE opens gets BMAD, the ADE methodology
 * (.ade/, CLAUDE.md, llms.txt) and the role sub-agents in .claude/agents/.
 * Only missing files are written; an existing CLAUDE.md gets one import line.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER, methodologyFiles, stackAgentFiles, type AgentEntry, type MethodologyFile, type Stack,
} from "./projectMethodology";

/** The two BMAD lines a project can be set up on; v6 is the default. */
export type Methodology = "v6" | "v4";

export interface SetupStatus {
  isGit: boolean;
  missing: string[];
  needsImport: boolean;
  bmadInstalled: boolean;
  stacks: Stack[];
  /** The marker, else `.bmad-core/` ⇒ "v4"; null when the project has neither. */
  methodology: Methodology | null;
}

export interface SetupReport {
  created: string[];
  appendedImport: boolean;
  agents: number;
  bmadFiles: number;
}

export interface SetupResult {
  root: string;
  report: SetupReport;
  files: MethodologyFile[];
  stacks: Stack[];
}

const DONE_KEY = "ade-project-setup-done";
const REMOVED_KEY = "ade-project-agents-removed";
const DECLINED_KEY = "ade-project-setup-declined";

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key: string, root: string, on: boolean) {
  const list = readList(key).filter((r) => r !== root);
  if (on) list.push(root);
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
}

/** The user undid setup here: automatic setup leaves this project alone. */
export function setupDeclined(root: string): boolean {
  return readList(DECLINED_KEY).includes(root);
}

const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

/** Home folders and the filesystem root are never projects. */
export function isSetupCandidate(root: string): boolean {
  return !/^(\/|[A-Za-z]:\\?|\/(Users|home)\/[^/]+\/?|[A-Za-z]:\\Users\\[^\\]+\\?)$/.test(root);
}

function doneRoots(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function wasSetUp(root: string): boolean {
  return doneRoots().includes(root);
}

function markSetUp(root: string, done: boolean) {
  const list = doneRoots().filter((r) => r !== root);
  if (done) list.push(root);
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: setup may run again, which only fills gaps.
  }
}

function readRemoved(): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(REMOVED_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Agents the user removed from a project, which setup won't bring back. */
export function removedAgents(root: string): string[] {
  return readRemoved()[root] ?? [];
}

function setRemoved(root: string, id: string, removed: boolean) {
  const all = readRemoved();
  const list = (all[root] ?? []).filter((x) => x !== id);
  if (removed) list.push(id);
  all[root] = list;
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: a removed agent may come back with the stack.
  }
}

const withoutRemoved = (root: string, files: MethodologyFile[]) => {
  const removed = new Set(removedAgents(root).map((id) => `.claude/agents/${id}.md`));
  return files.filter((f) => !removed.has(f.path));
};

function apply(root: string, files: MethodologyFile[], methodology: Methodology): Promise<SetupReport> {
  return invoke<SetupReport>("project_setup_apply", {
    root, files, import: CLAUDE_MD_IMPORT, marker: CLAUDE_MD_IMPORT_MARKER, methodology, full: true,
  });
}

export function setupStatus(root: string): Promise<SetupStatus> {
  const files = methodologyFiles(baseName(root));
  return invoke<SetupStatus>("project_setup_status", { root, paths: files.map((f) => f.path), marker: CLAUDE_MD_IMPORT_MARKER });
}

/** What a project is on, from its status; null when it has neither. */
export async function detectOnDisk(root: string): Promise<Methodology | null> {
  return (await setupStatus(root)).methodology ?? null;
}

export function isComplete(s: SetupStatus): boolean {
  return s.missing.length === 0 && !s.needsImport && s.bmadInstalled;
}

const inFlight = new Map<string, Promise<SetupResult>>();

/** A setup for this project is running right now. */
export function isSettingUp(root: string): boolean {
  return inFlight.has(root);
}

/**
 * Set up a project: BMAD, methodology, the core roles and its stack's agents.
 * Safe to run again; a setup already running for the project is shared.
 * Running it by hand clears an earlier Undo.
 *
 * `methodology` is the owner's answer from the setup prompt. Without one, the
 * project's own marker (else `.bmad-core/`) decides, and a project with
 * neither — a new one — gets the v6 default.
 */
export function setUpProject(root: string, methodology?: Methodology, stacks?: Stack[]): Promise<SetupResult> {
  const running = inFlight.get(root);
  if (running) return running;
  const job = (async () => {
    // Only ask the project itself when the callers left something unresolved.
    const status = methodology !== undefined && stacks !== undefined ? null : await setupStatus(root);
    const chosen = methodology ?? status?.methodology ?? "v6";
    const detected = stacks ?? status?.stacks ?? [];
    const files = withoutRemoved(root, methodologyFiles(baseName(root), detected));
    const report = await apply(root, files, chosen);
    markSetUp(root, true);
    writeList(DECLINED_KEY, root, false);
    return { root, report, files, stacks: detected };
  })().finally(() => inFlight.delete(root));
  inFlight.set(root, job);
  return job;
}

/** Agents for stacks a set-up project has gained since (e.g. a new foundry.toml). */
export async function addStackAgents(root: string, stacks: Stack[], methodology: Methodology = "v6"): Promise<SetupResult> {
  const files = withoutRemoved(root, stackAgentFiles(stacks));
  const report = await invoke<SetupReport>("project_setup_apply", {
    root, files, import: CLAUDE_MD_IMPORT, marker: CLAUDE_MD_IMPORT_MARKER, methodology, full: false,
  });
  return { root, report, files, stacks };
}

/** Add one agent to a project now. */
export async function addAgent(root: string, agent: AgentEntry, methodology: Methodology = "v6"): Promise<void> {
  setRemoved(root, agent.id, false);
  await invoke<SetupReport>("project_setup_apply", {
    root, files: [agent.file], import: CLAUDE_MD_IMPORT, marker: CLAUDE_MD_IMPORT_MARKER, methodology, full: false,
  });
}

/** Remove one agent from a project; setup won't add it back. */
export async function removeAgent(root: string, id: string): Promise<void> {
  await invoke<boolean>("project_agent_remove", { root, name: id });
  setRemoved(root, id, true);
}

/** Remove what a setup wrote, keeping anything edited since. */
export async function undoSetup(r: SetupResult): Promise<number> {
  const removed = await invoke<number>("project_setup_undo", {
    root: r.root,
    created: r.report.created,
    files: r.files,
    import: r.report.appendedImport ? CLAUDE_MD_IMPORT : null,
  });
  // Stays "set up" so it isn't redone, and declined so stack agents aren't
  // added either. "Set up now" in Integrations > Agents undoes this.
  markSetUp(r.root, true);
  writeList(DECLINED_KEY, r.root, true);
  return removed;
}

/** A short summary of what a setup wrote, or null when it wrote nothing. */
export function summarize(r: SetupReport): string | null {
  const parts: string[] = [];
  if (r.bmadFiles) parts.push("BMAD");
  if (r.agents) parts.push(r.agents === 1 ? "1 agent" : `${r.agents} agents`);
  const other = r.created.length - r.bmadFiles - r.agents;
  if (other > 0) parts.push("the methodology");
  if (r.appendedImport) parts.push("a line in CLAUDE.md");
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
