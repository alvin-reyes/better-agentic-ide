import { useSettingsStore } from "../stores/settingsStore";
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

/** Open a terminal tab in a project folder and remember it. */
export function openProjectTab(path: string) {
  rememberProject(path);
  useTabStore.getState().addTab(undefined, path);
}
