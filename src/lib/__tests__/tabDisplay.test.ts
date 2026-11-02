import { describe, it, expect } from "vitest";
import { tabLabel, tabCwd, tabProject, tabFolderPaneId, tabFolderPtyId, groupRuns, matchTabs, projectColor, TAB_COLORS } from "../tabDisplay";
import { ownViewOnly, useTabStore, type Tab } from "../../stores/tabStore";

const tab = (o: Partial<Tab> & { paneId?: string; savedCwd?: string } = {}): Tab => ({
  id: o.id ?? "t", name: o.name ?? "Terminal", type: o.type,
  ...ownViewOnly({ type: "pane", pane: { id: o.paneId ?? "p", ptyId: null, savedCwd: o.savedCwd } }, o.paneId ?? "p"),
});

describe("tab labels", () => {
  it("shows the folder for tabs still called Terminal", () => {
    expect(tabLabel(tab(), "/Users/me/code/acme-api")).toBe("acme-api");
    expect(tabLabel(tab({ name: "Terminal 3" }), "/home/me/web/")).toBe("web");
    expect(tabLabel(tab({ name: "claude" }), "/home/me/web")).toBe("claude");
    expect(tabLabel(tab(), null)).toBe("Terminal");
  });

  it("finds the folder from the live cwd, then what was restored", () => {
    expect(tabCwd(tab({ savedCwd: "/a" }), {})).toBe("/a");
    expect(tabCwd(tab({ savedCwd: "/a" }), { p: "/b" })).toBe("/b");
    expect(tabCwd(tab({ type: "editor", savedCwd: "/a" }), {})).toBeNull();
    expect(tabProject(tab(), { p: "/r/src" }, { "/r/src": "/r" })).toBe("/r");
  });
});

describe("project groups", () => {
  it("groups runs of two or more neighbouring tabs", () => {
    expect(groupRuns(["/a", "/a", "/b", null, "/c", "/c", "/c", "/a"])).toEqual([
      { project: "/a", start: 0, end: 1 },
      { project: "/c", start: 4, end: 6 },
    ]);
    expect(groupRuns([null, null])).toEqual([]);
  });

  it("gives each project a stable color", () => {
    expect(projectColor("/x/api")).toBe(projectColor("/x/api"));
    expect(TAB_COLORS.map((c) => c.value)).toContain(projectColor("/x/web"));
  });
});

describe("tab switcher", () => {
  const items = [
    { label: "api", cwd: "/code/acme-api", project: "/code/acme-api" },
    { label: "claude", cwd: "/code/acme-web/src", project: "/code/acme-web" },
    { label: "notes", cwd: null, project: null },
  ];
  it("matches name, folder and project, all words", () => {
    expect(matchTabs(items, "web").map((i) => i.label)).toEqual(["claude"]);
    expect(matchTabs(items, "acme cla").map((i) => i.label)).toEqual(["claude"]);
    expect(matchTabs(items, "").length).toBe(3);
  });
});

describe("a tab with a hidden view", () => {
  // A hidden view "v1" in another folder (and project); story 2b makes these,
  // here the test builds it.
  const withHidden = (t: Tab, shown = "own"): Tab => ({
    ...t,
    views: {
      ...t.views,
      v1: { id: "v1", name: "vim", spawnedBy: "own", root: { type: "pane", pane: { id: "h", ptyId: null, savedCwd: "/elsewhere/other" } }, activePaneId: "h" },
    },
    viewOrder: ["own", "v1"],
    shownView: shown,
  });
  const cwds = { p: "/r/src", q: "/s/lib", h: "/elsewhere/other" };
  const projects = { "/r/src": "/r", "/s/lib": "/s", "/elsewhere/other": "/elsewhere" };

  it("label, project and sort ignore a hidden view", () => {
    for (const shown of ["own", "v1"]) {
      const plain = tab({ id: "a" });
      const hidden = withHidden(plain, shown);
      expect(tabCwd(hidden, cwds)).toBe(tabCwd(plain, cwds));
      expect(tabLabel(hidden, tabCwd(hidden, cwds))).toBe(tabLabel(plain, tabCwd(plain, cwds)));
      expect(tabProject(hidden, cwds, projects)).toBe(tabProject(plain, cwds, projects));

      const key = (t: Tab) => tabProject(t, cwds, projects) ?? `~${t.id}`;
      const order = (first: Tab) => {
        useTabStore.setState({ tabs: [first, tab({ id: "b", paneId: "q" }), tab({ id: "c" })] });
        useTabStore.getState().sortTabsBy(key);
        return useTabStore.getState().tabs.map((t) => t.id);
      };
      expect(order(hidden)).toEqual(order(plain));
    }
  });

  it("label and folder come from the own view even when a hidden view's pane comes first", () => {
    // The own view's active pane id matches none of its panes (a restored tab
    // can carry ""), so the fallback is "the first pane": the own view's, not
    // the hidden view's that comes first in viewOrder.
    const plain: Tab = { id: "a", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "p", ptyId: null } }, "") };
    const hidden: Tab = { ...withHidden(plain, "v1"), viewOrder: ["v1", "own"] };
    expect(tabCwd(hidden, cwds)).toBe("/r/src");
    expect(tabLabel(hidden, tabCwd(hidden, cwds))).toBe("src");
    expect(tabLabel(hidden, tabCwd(hidden, cwds))).toBe(tabLabel(plain, tabCwd(plain, cwds)));
  });

  it("the tab's folder (activeCwd) is the own view's, even with a hidden view shown", () => {
    const plain = tab({ id: "a" });
    expect(tabFolderPaneId(withHidden(plain, "v1"))).toBe(tabFolderPaneId(plain));
    expect(tabFolderPaneId(withHidden(plain, "v1"))).toBe("p");
  });

  // The palette's BMAD switch and "Set up project" and App's folder poll act on
  // the tab's folder: the own view's pane, cwd and pty, never the view in sight.
  it("project actions and the folder poll use the own view's pane, cwd and pty with a hidden view shown", () => {
    const own: Tab = { id: "a", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "p", ptyId: 5, savedCwd: "/r/src" } }, "p") };
    const shown: Tab = {
      ...own,
      views: { ...own.views, v1: { id: "v1", name: "vim", spawnedBy: "own", root: { type: "pane", pane: { id: "h", ptyId: 9, savedCwd: "/elsewhere/other" } }, activePaneId: "h" } },
      viewOrder: ["own", "v1"],
      shownView: "v1",
    };
    expect(tabFolderPaneId(shown)).toBe("p");
    expect(cwds[tabFolderPaneId(shown) as keyof typeof cwds]).toBe("/r/src");
    expect(tabFolderPtyId(shown)).toBe(5);
    expect(tabFolderPtyId(own)).toBe(5);
  });
});
