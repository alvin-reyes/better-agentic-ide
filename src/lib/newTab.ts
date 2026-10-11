import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { askMethodology, useMethodologyPrompt, versionToSetUp } from "./methodologyPrompt";
import { bmadRootOf, isSetupCandidate, normRoot, setUpProject, setupDeclined } from "./projectSetup";
import { useTabStore } from "../stores/tabStore";

const KEY = "ade-recent-projects";
const MAX = 8;

/**
 * Open a new tab: ask "terminal or project?" first unless that's turned off.
 * Not while the BMAD version question is open: it has to be answered first, and
 * a second dialog beneath it could open the same folder twice.
 */
export function requestNewTab() {
  if (useMethodologyPrompt.getState().request) return;
  if (useSettingsStore.getState().askOnNewTab) window.dispatchEvent(new CustomEvent("request-new-tab"));
  else useTabStore.getState().addTab();
}

export function recentProjects(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function rememberProject(path: string) {
  const list = [path, ...recentProjects().filter((p) => p !== path)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: recents are a convenience.
  }
}

export function forgetProject(path: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(recentProjects().filter((p) => p !== path)));
  } catch {
    // As above.
  }
}

/** The project that opening `path` sets up; null when it sets nothing up. */
async function setupRootFor(path: string): Promise<string | null> {
  if (!useSettingsStore.getState().autoProjectSetup) return null;
  // A folder picked to be a project is the project, unless a folder above it
  // already has BMAD: then that one is.
  const root = normRoot((await bmadRootOf(path))?.root ?? path);
  return isSetupCandidate(root) && !setupDeclined(root) ? root : null;
}

/**
 * Open a terminal tab in a project folder, remember it, and set the project up
 * (BMAD, the ADE methodology, the role agents) unless that's turned off.
 *
 * A project with no BMAD is asked which version first, and the question must
 * be answered: until it is, the folder is neither opened nor remembered. That
 * also keeps the cd hook from asking about the same project at the same moment.
 */
export async function openProjectTab(path: string): Promise<void> {
  const root = await setupRootFor(path);
  const answer = root ? await askMethodology(root) : null;
  // Not answered: a question about another project took this one's place.
  if (answer && answer.kind !== "chosen") return;
  rememberProject(path);
  useTabStore.getState().addTab(undefined, path);
  // `done`: set up, and announced, by another route while the question was open.
  if (!root || !answer || answer.done) return;
  // Not awaited: the terminal is usable while the files are written.
  versionToSetUp(root, answer)
    .then((methodology) => setUpProject(root, methodology))
    .then((result) => window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result })))
    .catch((e) => window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: `Project setup failed: ${e}` } })));
}

/** Start a new project in a folder: git init. openProjectTab then opens it. */
export async function initProject(path: string): Promise<void> {
  await invoke("project_git_init", { root: path });
}
