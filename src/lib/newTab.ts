import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { isSetupCandidate, setUpProject } from "./projectSetup";
import { useTabStore } from "../stores/tabStore";

const KEY = "ade-recent-projects";
const MAX = 8;

/** Open a new tab: ask "terminal or project?" first unless that's turned off. */
export function requestNewTab() {
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

/**
 * Open a terminal tab in a project folder, remember it, and set the project up
 * (BMAD, the ADE methodology, the role agents) unless that's turned off.
 */
export function openProjectTab(path: string) {
  rememberProject(path);
  useTabStore.getState().addTab(undefined, path);
  if (!useSettingsStore.getState().autoProjectSetup || !isSetupCandidate(path)) return;
  setUpProject(path)
    .then((result) => window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result })))
    .catch(() => {});
}

/** Start a new project in a folder: git init, then open and set it up. */
export async function newProjectTab(path: string) {
  await invoke("project_git_init", { root: path });
  openProjectTab(path);
}
