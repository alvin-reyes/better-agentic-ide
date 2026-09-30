import { describe, it, expect } from "vitest";
import { tabLabel, tabCwd, tabProject, groupRuns, matchTabs, projectColor, TAB_COLORS } from "../tabDisplay";
import type { Tab } from "../../stores/tabStore";

const tab = (o: Partial<Tab> & { paneId?: string; savedCwd?: string } = {}): Tab => ({
  id: o.id ?? "t", name: o.name ?? "Terminal", type: o.type,
  root: { type: "pane", pane: { id: o.paneId ?? "p", ptyId: null, savedCwd: o.savedCwd } },
  activePaneId: o.paneId ?? "p",
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
