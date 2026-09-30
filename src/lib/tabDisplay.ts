import { findAllPanes, type Tab } from "../stores/tabStore";
import { baseName } from "../stores/paneMetaStore";

/** Colors offered in a tab's context menu. */
export const TAB_COLORS = [
  { name: "Orange", value: "#ff8a3d" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Blue", value: "#58a6ff" },
  { name: "Green", value: "#3fb950" },
  { name: "Pink", value: "#f778ba" },
  { name: "Yellow", value: "#e3b341" },
];

export const DEFAULT_NAME = /^Terminal( \d+)?$/;

/** The folder a tab's active pane is in, if known. */
export function tabCwd(tab: Tab, cwds: Record<string, string>): string | null {
  if (tab.type && tab.type !== "terminal") return null;
  const panes = findAllPanes(tab.root);
  const pane = panes.find((p) => p.id === tab.activePaneId) ?? panes[0];
  return (pane && (cwds[pane.id] || pane.savedCwd || pane.initialCwd)) || null;
}

/** A tab still called "Terminal" shows its folder instead. */
export function tabLabel(tab: Tab, cwd: string | null): string {
  return cwd && DEFAULT_NAME.test(tab.name) ? baseName(cwd) : tab.name;
}

/** The project a terminal tab is in: the folder's git root, once known. */
export function tabProject(tab: Tab, cwds: Record<string, string>, projects: Record<string, string>): string | null {
  const cwd = tabCwd(tab, cwds);
  return cwd ? projects[cwd] ?? null : null;
}

export interface TabGroup {
  project: string;
  /** Indexes into the tab list, inclusive. */
  start: number;
  end: number;
}

/** Runs of two or more neighbouring tabs in the same project. */
export function groupRuns(projects: (string | null)[]): TabGroup[] {
  const groups: TabGroup[] = [];
  let i = 0;
  while (i < projects.length) {
    const p = projects[i];
    let j = i;
    while (p && j + 1 < projects.length && projects[j + 1] === p) j++;
    if (p && j > i) groups.push({ project: p, start: i, end: j });
    i = j + 1;
  }
  return groups;
}

/** A stable color for a project's group label. */
export function projectColor(project: string): string {
  let h = 0;
  for (const c of project) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAB_COLORS[h % TAB_COLORS.length].value;
}

/** Tabs matching a switcher query by name, folder or project. */
export function matchTabs<T extends { label: string; cwd: string | null; project: string | null }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const words = q.split(/\s+/);
  return items.filter((it) => {
    const hay = `${it.label} ${it.cwd ?? ""} ${it.project ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
