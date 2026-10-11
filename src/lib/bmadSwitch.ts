/**
 * Switching a project's BMAD version: the dry run the confirm dialog shows,
 * the switch itself, and what is open in the project while it runs. The work
 * is one Rust command (src-tauri/src/bmadswitch.rs); this is its frontend.
 */
import { invoke } from "@tauri-apps/api/core";
import { CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER } from "./projectMethodology";
import {
  beginSwitch, isSettingUp, isWithin, markSwitched, normRoot, setupFiles, setupStatus,
  type Methodology, type SetupReport,
} from "./projectSetup";
import { useFleetStore } from "../stores/fleetStore";
import { findAllPanes, useTabStore } from "../stores/tabStore";

/**
 * A `files` equal to this means "unknown, or at least this many": the count
 * stopped here, or met a folder it couldn't read. Keep it equal to
 * `COUNT_LIMIT` in src-tauri/src/bmadswitch.rs (a test compares them).
 */
export const COUNT_LIMIT = 50_000;

/** A file count as the dialog shows it: "50,000+" when it is capped. */
export function countLabel(files: number): string {
  const text = Math.min(files, COUNT_LIMIT).toLocaleString("en-US");
  return files >= COUNT_LIMIT ? `${text}+` : text;
}

export interface SwitchMove {
  /** Project-relative. */
  from: string;
  to: string;
  /** `COUNT_LIMIT` when unknown or at least that many. */
  files: number;
  /** What git ignores of it today. */
  ignored: "none" | "some" | "all";
}

export interface SwitchDocument {
  path: string;
  files: number;
  ticked: boolean;
  warning: string | null;
  /** The real target when the offered path is itself a link; ticking it moves only the link. */
  linkTo: string | null;
}

export interface SwitchNote {
  path: string;
  reason: string;
}

/** What a switch would do: `bmad_switch_plan`'s answer. */
export interface SwitchPlan {
  /** Empty when the project has no BMAD; the plan is then blocked. */
  from: Methodology | "";
  to: Methodology;
  /** The archive folder, project-relative. */
  archive: string;
  moves: SwitchMove[];
  /**
   * What stays unless ticked, in both directions: the v4 document locations
   * (v4 to v6), or a v6 output folder that holds documents (v6 to v4).
   */
  documents: SwitchDocument[];
  leftovers: SwitchMove[];
  leftInPlace: SwitchNote[];
  /** Null: git is missing or failed. */
  dirty: boolean | null;
  archiveIgnored: boolean | null;
  blocked: string | null;
}

export interface SwitchResult {
  archive: string;
  moved: number;
  setup: SetupReport;
  rulesAppended: boolean;
  archiveDenied: boolean;
  /** True when any moved path's count was capped: `moved` is then a lower bound. */
  movedCapped: boolean;
}

/** The toast's count: "1 file", "1,234 files", "50,000+ files". */
export function movedLabel(result: Pick<SwitchResult, "moved" | "movedCapped">): string {
  const n = result.moved;
  // A capped path counts as COUNT_LIMIT at least, so the total is a lower bound.
  if (result.movedCapped) return `${Math.max(n, COUNT_LIMIT).toLocaleString("en-US")}+ files`;
  return n === 1 ? "1 file" : `${n.toLocaleString("en-US")} files`;
}

export interface PendingSwitch {
  archive: string;
  status: string;
  phase: string;
  from: string;
  to: string;
  date: string;
}

/** The detail of the event a finished switch reports through. */
export interface SwitchDone {
  root: string;
  from: Methodology;
  to: Methodology;
  result: SwitchResult;
}

/** Not `project-setup-done`: that one offers Undo, which would leave the project with no BMAD. */
export const SWITCH_DONE_EVENT = "bmad-switch-done";

export const otherVersion = (m: Methodology): Methodology => (m === "v6" ? "v4" : "v6");

/** The dry run. `documents` is the document paths the person ticked. */
export function planSwitch(root: string, to: Methodology, documents: string[] = []): Promise<SwitchPlan> {
  return invoke<SwitchPlan>("bmad_switch_plan", { root: normRoot(root), to, documents });
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

const running = new Map<string, Promise<SwitchResult>>();

/**
 * Archive the old version and set up the other one, as `plan` showed. A
 * second request for the same project gets the running switch.
 */
export function runSwitch(root: string, plan: SwitchPlan): Promise<SwitchResult> {
  const at = normRoot(root);
  const already = running.get(at);
  if (already) return already;
  // The backend checks again; this is the cheap refusal first.
  if (plan.blocked) return Promise.reject(plan.blocked);
  if (plan.from === "") return Promise.reject("This project has no BMAD to switch.");
  if (isSettingUp(at)) return Promise.reject("Project setup is running. Try again when it has finished.");
  const end = beginSwitch(at);
  const job = (async () => {
    const { stacks } = await setupStatus(at);
    const result = await invoke<SwitchResult>("bmad_switch_apply", {
      root: at,
      to: plan.to,
      plan,
      files: setupFiles(at, stacks, plan.to),
      import: CLAUDE_MD_IMPORT,
      marker: CLAUDE_MD_IMPORT_MARKER,
    });
    markSwitched(at, plan.to);
    const detail: SwitchDone = { root: at, from: otherVersion(plan.to), to: plan.to, result };
    window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail }));
    return result;
  })().finally(() => {
    running.delete(at);
    end();
  });
  running.set(at, job);
  return job;
}

export interface OpenInProject {
  panes: { tab: string; cwd: string }[];
  agents: { name: string; cwd: string }[];
}

/**
 * The terminals and agents working inside the project. A switch renames
 * folders under them: an agent still running may keep writing into one that
 * moved, and on Windows a folder that is a process's cwd can't be renamed.
 */
export async function openInProject(root: string): Promise<OpenInProject> {
  const { getPtyCwd } = await import("../hooks/useTerminal");
  const asked = useTabStore.getState().tabs.flatMap((tab) =>
    findAllPanes(tab.root).map(async (pane) => ({ tab: tab.name, cwd: await getPtyCwd(pane.id).catch(() => null) })),
  );
  const panes: OpenInProject["panes"] = [];
  for (const { tab, cwd } of await Promise.all(asked)) {
    if (cwd && isWithin(cwd, root)) panes.push({ tab, cwd });
  }
  const agents = useFleetStore
    .getState()
    .subagents.filter((s) => s.endTime === null && !!s.cwd && isWithin(s.cwd, root))
    .map((s) => ({ name: s.description || s.agentType, cwd: s.cwd }));
  return { panes, agents };
}
