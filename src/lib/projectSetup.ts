/**
 * Project setup: every project ADE opens gets BMAD, the ADE methodology
 * (.ade/, CLAUDE.md, llms.txt) and the role sub-agents in .claude/agents/.
 * Only missing files are written; an existing CLAUDE.md gets one import line.
 */
import { invoke } from "@tauri-apps/api/core";
import { joinPath } from "./bmadRuntime/paths";
import {
  CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER, agentCatalog, methodologyFiles, stackAgentFiles, type AgentEntry, type MethodologyFile, type Stack,
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
  /** AI attribution was turned off in .claude/settings.json. */
  attributionOff?: boolean;
  /** .claude/settings.json couldn't be updated; the rest of setup still ran. */
  settingsError?: string | null;
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
const KEPT_KEY = "ade-bmad-kept";

/**
 * One spelling per project: no trailing separator. Every per-project list keys
 * on it, so `/code/shop/` and `/code/shop` are one project.
 */
export function normRoot(root: string): string {
  return root.replace(/[\\/]+$/, "") || root;
}

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(v)) return [];
    // Lists written before roots were normalised may hold a trailing separator.
    return [...new Set(v.filter((r): r is string => typeof r === "string").map(normRoot))];
  } catch {
    return [];
  }
}

function writeList(key: string, root: string, on: boolean) {
  const at = normRoot(root);
  const list = readList(key).filter((r) => r !== at);
  if (on) list.push(at);
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
}

/** The user undid setup here: automatic setup leaves this project alone. */
export function setupDeclined(root: string): boolean {
  return readList(DECLINED_KEY).includes(normRoot(root));
}

const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

/** Home folders and the filesystem root are never projects. */
export function isSetupCandidate(root: string): boolean {
  return !/^(\/|[A-Za-z]:\\?|\/(Users|home)\/[^/]+\/?|[A-Za-z]:\\Users\\[^\\]+\\?)$/.test(root);
}

export function wasSetUp(root: string): boolean {
  return readList(DONE_KEY).includes(normRoot(root));
}

function markSetUp(root: string, done: boolean) {
  writeList(DONE_KEY, root, done);
}

/**
 * Don't ask this project the keep-or-switch question. Keeping its version
 * adds it; so does answering which version to set up, and finishing a switch.
 */
export function isKept(root: string): boolean {
  return readList(KEPT_KEY).includes(normRoot(root));
}

export function markKept(root: string) {
  writeList(KEPT_KEY, root, true);
}

/**
 * Run once, after the saved state is restored. The first launch with this
 * list finds no key at all: every project already set up is added, so the
 * update doesn't ask about projects the user already has. An empty list is a
 * list, and is left alone.
 */
export function migrateKept() {
  try {
    if (localStorage.getItem(KEPT_KEY) !== null) return;
    localStorage.setItem(KEPT_KEY, JSON.stringify(readList(DONE_KEY)));
  } catch {
    // Storage blocked: each project is asked once more.
  }
}

/**
 * `dir` is `root` or a folder inside it. A separator has to follow the root:
 * `/mono2` is not inside `/mono`.
 */
export function isWithin(dir: string, root: string): boolean {
  const at = normRoot(dir);
  const top = normRoot(root);
  if (at === top) return true;
  if (!at.startsWith(top)) return false;
  // A filesystem root keeps its separator (`/`), so the next character is a name.
  return /[\\/]$/.test(top) || /[\\/]/.test(at[top.length]);
}

function readRemoved(): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(REMOVED_KEY) ?? "{}");
    if (!v || typeof v !== "object") return {};
    // Two spellings of one root, from before roots were normalised, are merged.
    const out: Record<string, string[]> = {};
    for (const [root, ids] of Object.entries(v as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      const at = normRoot(root);
      out[at] = [...new Set([...(out[at] ?? []), ...ids.filter((id): id is string => typeof id === "string")])];
    }
    return out;
  } catch {
    return {};
  }
}

/** Agents the user removed from a project, which setup won't bring back. */
export function removedAgents(root: string): string[] {
  return readRemoved()[normRoot(root)] ?? [];
}

function setRemoved(root: string, id: string, removed: boolean) {
  const at = normRoot(root);
  const all = readRemoved();
  const list = (all[at] ?? []).filter((x) => x !== id);
  if (removed) list.push(id);
  all[at] = list;
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

/** What setup writes for a project on `methodology`, without the agents the person removed. */
export function setupFiles(root: string, stacks: Stack[], methodology: Methodology): MethodologyFile[] {
  const at = normRoot(root);
  return withoutRemoved(at, methodologyFiles(baseName(at), stacks, methodology));
}

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

/** `dir`'s parent, or null at a filesystem root. Handles `/` and `\\`. */
function parentDir(dir: string): string | null {
  const trimmed = dir.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut > 0 ? trimmed.slice(0, cut) : null;
}

/**
 * The BMAD project folder `cwd` is in, and what it is on.
 *
 * A terminal is often cd'd below the project root (`myproject/src`), and the
 * marker and `.bmad-core/` live at the root, so the folders from `cwd` up to its
 * project root (the nearest `.git` ancestor, as the rest of the app resolves
 * it) are asked in turn and the nearest one that says what it is on wins. A
 * BMAD project nested in a bigger repository is found before the repository.
 * Null when none says, or there is no folder.
 */
export async function bmadRootOf(cwd: string | null | undefined): Promise<{ root: string; methodology: Methodology } | null> {
  if (!cwd) return null;
  const root = await invoke<string>("project_root", { path: cwd }).catch(() => cwd);
  const norm = (p: string) => p.replace(/[\\/]+$/, "");
  const stop = norm(root);
  let dir: string | null = norm(cwd);
  // Bounded: a cwd that is somehow not under its root still ends at the
  // filesystem root.
  for (let i = 0; dir && i < 64; i++) {
    const found = await detectOnDisk(dir).catch(() => null);
    if (found) return { root: dir, methodology: found };
    if (dir === stop || !isWithin(dir, stop)) break;
    dir = parentDir(dir);
  }
  return null;
}

/**
 * The methodology an agent launched in folder `cwd` should be composed for:
 * that of the BMAD project it is in (`bmadRootOf`), v6 when there is none or
 * a check fails.
 */
export async function methodologyOf(cwd: string | null | undefined): Promise<Methodology> {
  return (await bmadRootOf(cwd))?.methodology ?? "v6";
}

/**
 * The folder a setup started from `cwd` works on: the BMAD project `cwd` is in,
 * else its project root (the nearest `.git` ancestor, or `cwd` itself).
 */
export async function setupRootOf(cwd: string): Promise<string> {
  const found = await bmadRootOf(cwd);
  return normRoot(found?.root ?? (await invoke<string>("project_root", { path: cwd }).catch(() => cwd)));
}

/**
 * `dir` and each folder above it, up to and including `stop`. Just `dir` when
 * it isn't under `stop`.
 */
export function foldersUpTo(dir: string, stop: string): string[] {
  const end = normRoot(stop);
  const out: string[] = [];
  let at: string | null = normRoot(dir);
  // Bounded, as bmadRootOf is: a dir that is somehow not under its stop still ends.
  for (let i = 0; at && i < 64; i++) {
    out.push(at);
    if (at === end || !isWithin(at, end)) break;
    at = parentDir(at);
  }
  return out;
}

/**
 * BMAD is in the project: v4's `.bmad-core/VERSION`, or the v6 marker. A v6
 * project has no `.bmad-core/`, so `bmadInstalled` alone called every v6
 * project incomplete.
 */
export function hasBmad(s: SetupStatus): boolean {
  return s.bmadInstalled || s.methodology === "v6";
}

export function isComplete(s: SetupStatus): boolean {
  return s.missing.length === 0 && !s.needsImport && hasBmad(s);
}

const inFlight = new Map<string, Promise<SetupResult>>();

/** `done` is the setup's result; a finished switch has none. */
type HasBmadListener = (root: string, methodology: Methodology, done?: SetupResult) => void;
const hasBmadListeners = new Set<HasBmadListener>();

/**
 * Hear when a project now has BMAD, whichever route got it there: a setup that
 * succeeded, or a finished switch. A question still open about that project is
 * over. Returns the way to stop listening.
 */
export function onProjectHasBmad(listener: HasBmadListener): () => void {
  hasBmadListeners.add(listener);
  return () => { hasBmadListeners.delete(listener); };
}

function tellHasBmad(root: string, methodology: Methodology, done?: SetupResult) {
  for (const listener of [...hasBmadListeners]) {
    // The setup is done whatever a listener makes of it.
    try { listener(root, methodology, done); } catch (e) { console.warn("A project-setup listener failed", e); }
  }
}

/**
 * Projects a BMAD switch is moving right now. Apart from `inFlight`: a setup
 * asked for meanwhile must not be handed the switch's promise, which resolves
 * to something else, and must not write into a tree that is half moved.
 */
const switching = new Set<string>();

type SwitchListener = (root: string, running: boolean) => void;
const switchListeners = new Set<SwitchListener>();

/** What `setUpProject` rejects with while the project is being switched. */
export const SWITCH_RUNNING = "a BMAD switch is running";

export function isSwitching(root: string): boolean {
  return switching.has(normRoot(root));
}

/** Hear when a switch starts and ends. Returns the way to stop listening. */
export function onSwitchChange(listener: SwitchListener): () => void {
  switchListeners.add(listener);
  return () => { switchListeners.delete(listener); };
}

function tellSwitch(root: string, running: boolean) {
  for (const listener of [...switchListeners]) {
    try { listener(root, running); } catch (e) { console.warn("A switch listener failed", e); }
  }
}

/** Register a switch of `root` as running. The returned function ends it. */
export function beginSwitch(root: string): () => void {
  const at = normRoot(root);
  switching.add(at);
  tellSwitch(at, true);
  return () => {
    if (switching.delete(at)) tellSwitch(at, false);
  };
}

export interface PendingSwitch {
  archive: string;
  status: string;
  phase: string;
  from: string;
  to: string;
  date: string;
}

/**
 * Switches of this project that started and didn't finish. They block setup
 * and another switch. A failed check rejects: it is not "nothing pending", and
 * the caller must not go on as if the project were clear.
 */
export async function pendingSwitches(root: string): Promise<PendingSwitch[]> {
  const found = await invoke<unknown>("bmad_switch_pending", { root: normRoot(root) });
  if (!Array.isArray(found)) throw new Error("bmad_switch_pending answered with something that is not a list");
  return found as PendingSwitch[];
}

/** Why nothing may be set up in a project right now. */
export interface SwitchBlock {
  /** For the person. */
  reason: string;
  /** The journal of the first unfinished switch, as a full path. Unset when the block is anything else. */
  archiveFile?: string;
}

/**
 * Why setup can't write into `root`: a BMAD switch is running, or an earlier
 * one didn't finish, so the project may have neither version on disk and its
 * journal names paths to move back by hand. Null when it is clear.
 *
 * Every route that writes setup files asks here first. The backend refuses
 * too; asked here, the person gets the reason before anything is attempted.
 */
export async function switchBlock(root: string): Promise<SwitchBlock | null> {
  const at = normRoot(root);
  if (switching.has(at)) return { reason: "A BMAD switch is running." };
  // Fails closed: a check that can't be made is not "nothing pending".
  const pending = await pendingSwitches(at).catch(() => null);
  if (!pending) return { reason: "Couldn't check for an unfinished BMAD switch." };
  if (!pending.length) return null;
  const [first] = pending;
  const where = `${first.archive}/ARCHIVE.md`;
  const name = baseName(at);
  let reason: string;
  if (pending.length > 1) {
    reason = `${pending.length} BMAD switches in ${name} didn't finish. Setup waits until each one is resolved: start with ${where}.`;
  } else if (first.status === "unknown") {
    reason = `A BMAD switch in ${name} left a record that couldn't be read. Setup waits until it is resolved: see ${where}.`;
  } else {
    reason = `A BMAD switch in ${name} didn't finish. Setup waits until it is resolved: see ${where}.`;
  }
  return { reason, archiveFile: joinPath(at, where) };
}

/** A finished switch set the project up: it is set up, kept, and no longer declined. */
export function markSwitched(root: string, methodology: Methodology) {
  markSetUp(root, true);
  writeList(DECLINED_KEY, root, false);
  markKept(root);
  tellHasBmad(normRoot(root), methodology);
}

/** A setup for this project is running right now, or a switch, which sets it up too. */
export function isSettingUp(root: string): boolean {
  const at = normRoot(root);
  return inFlight.has(at) || switching.has(at);
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
  const at = normRoot(root);
  // A string, as Tauri's own rejections are: callers show it as it is.
  if (switching.has(at)) return Promise.reject(SWITCH_RUNNING);
  const running = inFlight.get(at);
  if (running) return running;
  const job = (async () => {
    // Only ask the project itself when the callers left something unresolved.
    const status = methodology !== undefined && stacks !== undefined ? null : await setupStatus(at);
    const chosen = methodology ?? status?.methodology ?? "v6";
    const detected = stacks ?? status?.stacks ?? [];
    const files = withoutRemoved(at, methodologyFiles(baseName(at), detected, chosen));
    const report = await apply(at, files, chosen);
    markSetUp(at, true);
    writeList(DECLINED_KEY, at, false);
    const result: SetupResult = { root: at, report, files, stacks: detected };
    tellHasBmad(at, chosen, result);
    return result;
  })().finally(() => inFlight.delete(at));
  inFlight.set(at, job);
  return job;
}

/** Agents for stacks a set-up project has gained since (e.g. a new foundry.toml). */
export async function addStackAgents(root: string, stacks: Stack[], methodology: Methodology = "v6"): Promise<SetupResult> {
  // Not into `.claude/agents` while a switch is moving it, or after one that
  // didn't finish: the journal may tell the person to move that folder back.
  if (switching.has(normRoot(root))) return Promise.reject(SWITCH_RUNNING);
  const block = await switchBlock(root);
  if (block) return Promise.reject(block.reason);
  const files = withoutRemoved(root, stackAgentFiles(stacks, methodology));
  const report = await invoke<SetupReport>("project_setup_apply", {
    root, files, import: CLAUDE_MD_IMPORT, marker: CLAUDE_MD_IMPORT_MARKER, methodology, full: false,
  });
  return { root, report, files, stacks };
}

/** Add one agent to a project now. */
export async function addAgent(root: string, agent: AgentEntry, methodology: Methodology = "v6"): Promise<void> {
  // As addStackAgents refuses. Before anything is recorded: a refused agent
  // the person had removed stays removed.
  if (switching.has(normRoot(root))) return Promise.reject(SWITCH_RUNNING);
  const block = await switchBlock(root);
  if (block) return Promise.reject(block.reason);
  setRemoved(root, agent.id, false);
  // The entry's file was built for the catalog's default; a core role carries
  // the BMAD section for one methodology, so rebuild it for this project's.
  const file = agentCatalog(methodology).find((a) => a.id === agent.id)?.file ?? agent.file;
  await invoke<SetupReport>("project_setup_apply", {
    root, files: [file], import: CLAUDE_MD_IMPORT, marker: CLAUDE_MD_IMPORT_MARKER, methodology, full: false,
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
  // A settings file setup created is counted below, not as the methodology.
  const settings = r.created.filter((p) => /[\\/]\.claude[\\/]settings\.json$/.test(p)).length;
  const other = r.created.length - r.bmadFiles - r.agents - settings;
  if (other > 0) parts.push("the methodology");
  if (r.appendedImport) parts.push("a line in CLAUDE.md");
  if (r.attributionOff) parts.push("settings that turn off AI attribution");
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
