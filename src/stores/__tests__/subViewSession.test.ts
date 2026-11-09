import { describe, it, expect, beforeEach, vi } from "vitest";

// Only panes that have been shown have a live terminal; the rest have none.
const live = vi.hoisted(() => new Map<string, { buffer: string; cwd: string }>());
const busy = vi.hoisted(() => ({ paneBusy: vi.fn(async (_id: string): Promise<string | null> => "node") }));
vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: (id: string) => live.get(id)?.buffer ?? null,
  getPtyCwd: async (id: string) => live.get(id)?.cwd ?? null,
  getTerminalDimensions: (id: string) => (live.has(id) ? { cols: 80, rows: 24 } : null),
  paneBusy: busy.paneBusy,
  destroyInstance: vi.fn(),
  detachInstance: vi.fn(),
}));

import { useTabStore, saveSession, loadSession, findAllPanes, ownView, ownViewOnly, type Tab, type PaneNode, type View } from "../tabStore";
import { viewRunning } from "../../hooks/useGuardedClose";

const KEY = "ade-session";
const leaf = (id: string, ptyId: number | null = null): PaneNode => ({ type: "pane", pane: { id, ptyId } });
const saved = () => JSON.parse(localStorage.getItem(KEY)!);

/** Tab "api" (own pane a1) with sub-terminals "dev server" (one pane) and "tests" (split, second pane active). */
function tabWithSubTerminals(): Tab {
  const dev: View = { id: "view-dev", name: "dev server", spawnedBy: "own", root: leaf("d1", 7), activePaneId: "d1", restored: false };
  const tests: View = {
    id: "view-tests", name: "tests", spawnedBy: null, activePaneId: "t2", restored: false,
    root: { type: "split", direction: "vertical", children: [leaf("t1", 8), leaf("t2", 9)] },
  };
  const own = ownViewOnly(leaf("a1", 6), "a1");
  return {
    id: "tab-api", name: "api",
    views: { ...own.views, [dev.id]: dev, [tests.id]: tests },
    viewOrder: ["own", dev.id, tests.id],
    shownView: tests.id,
  };
}

beforeEach(() => {
  localStorage.clear();
  live.clear();
  busy.paneBusy.mockClear();
});

describe("saving sub-terminals", () => {
  it("a tab with sub-terminals round-trips its subViews and shownView", async () => {
    live.set("a1", { buffer: "own-buf", cwd: "/code/api" });
    live.set("d1", { buffer: "dev-buf", cwd: "/code/api/web" });
    live.set("t1", { buffer: "t1-buf", cwd: "/code/api" });
    live.set("t2", { buffer: "t2-buf", cwd: "/code/api/e2e" });
    useTabStore.setState({ tabs: [tabWithSubTerminals()], activeTabId: "tab-api" });

    await saveSession();
    const s = saved().tabs[0];
    expect(s.root).toEqual({ type: "pane", pane: { id: "a1", serializedBuffer: "own-buf", savedCwd: "/code/api" } });
    expect(s.shownView).toBe("view-tests");
    expect(s.subViews).toEqual([
      { id: "view-dev", name: "dev server", activePaneId: "d1",
        root: { type: "pane", pane: { id: "d1", serializedBuffer: "dev-buf", savedCwd: "/code/api/web" } } },
      { id: "view-tests", name: "tests", activePaneId: "t2",
        root: { type: "split", direction: "vertical", children: [
          { type: "pane", pane: { id: "t1", serializedBuffer: "t1-buf", savedCwd: "/code/api" } },
          { type: "pane", pane: { id: "t2", serializedBuffer: "t2-buf", savedCwd: "/code/api/e2e" } },
        ] } },
    ]);

    // Loaded back: the same views, in order, with new ids, and the shown one remapped.
    live.clear();
    expect(loadSession()).toBe(true);
    const [t] = useTabStore.getState().tabs;
    expect(t.viewOrder).toHaveLength(3);
    expect(t.viewOrder[0]).toBe("own");
    const [, devId, testsId] = t.viewOrder;
    expect(devId).not.toBe("view-dev");
    expect(testsId).not.toBe("view-tests");
    expect(t.shownView).toBe(testsId);
    expect(t.views[devId].name).toBe("dev server");
    expect(t.views[testsId].name).toBe("tests");
    const shape = (n: PaneNode): unknown => n.type === "pane"
      ? [n.pane.savedCwd, n.pane.serializedBuffer, n.pane.initialCwd]
      : { [n.direction]: n.children.map(shape) };
    expect(shape(t.views[devId].root)).toEqual(["/code/api/web", "dev-buf", "/code/api/web"]);
    expect(shape(t.views[testsId].root)).toEqual({ vertical: [
      ["/code/api", "t1-buf", "/code/api"],
      ["/code/api/e2e", "t2-buf", "/code/api/e2e"],
    ] });
    // Each view's active pane is kept (the second pane of "tests").
    expect(t.views[testsId].activePaneId).toBe(findAllPanes(t.views[testsId].root)[1].id);
    expect(t.views[devId].activePaneId).toBe(findAllPanes(t.views[devId].root)[0].id);
  });

  it("a shownView that names no saved view loads as own", () => {
    localStorage.setItem(KEY, JSON.stringify({
      tabs: [{ id: "t", name: "api", root: leaf("a"), activePaneId: "a",
        subViews: [{ id: "view-1", name: "npm", activePaneId: "x", root: { type: "pane", pane: { id: "x" } } }],
        shownView: "view-gone" }],
      activeTabId: "t",
    }));
    expect(loadSession()).toBe(true);
    const [t] = useTabStore.getState().tabs;
    expect(t.viewOrder).toHaveLength(2);
    expect(t.shownView).toBe("own");
  });

  it("a restored sub-terminal has no ptyId, is marked restored and is not counted as running", async () => {
    useTabStore.setState({ tabs: [tabWithSubTerminals()], activeTabId: "tab-api" });
    await saveSession();
    expect(loadSession()).toBe(true);
    const [t] = useTabStore.getState().tabs;

    expect(ownView(t).restored).toBe(false);
    for (const id of t.viewOrder.slice(1)) {
      const view = t.views[id];
      expect(view.restored).toBe(true);
      expect(view.spawnedBy).toBeNull();
      for (const p of findAllPanes(view.root)) expect(p.ptyId).toBeNull();
      // Not running, though paneBusy would name a program for any pane it was asked about.
      expect(await viewRunning(view)).toBeNull();
    }
    expect(busy.paneBusy).not.toHaveBeenCalled();
  });

  it("saved sub-terminals carry no spawnedBy, status or command", async () => {
    const tab = tabWithSubTerminals();
    // Whatever else a view or pane may carry in memory stays there.
    (tab.views["view-dev"] as View & Record<string, unknown>).status = "running";
    (tab.views["view-dev"] as View & Record<string, unknown>).command = ["npm", "run", "dev", "--token=sk-live-1"];
    (tab.views["view-dev"] as View & Record<string, unknown>).line = "npm run dev --token=sk-live-1";
    useTabStore.setState({ tabs: [tab], activeTabId: "tab-api" });

    await saveSession();
    const json = localStorage.getItem(KEY)!;
    for (const word of ["spawnedBy", "restored", "status", "command", "line", "sk-live-1", "ptyId"]) {
      expect(json, word).not.toContain(word);
    }
    for (const sub of saved().tabs[0].subViews) {
      expect(Object.keys(sub).sort()).toEqual(["activePaneId", "id", "name", "root"]);
    }
  });

  it("a session over 5 MB whose bulk is in a sub-terminal is truncated", async () => {
    const big = "x".repeat(6 * 1024 * 1024) + "TAIL";
    live.set("a1", { buffer: "own-buf", cwd: "/code/api" });
    live.set("t2", { buffer: big, cwd: "/code/api/e2e" });
    useTabStore.setState({ tabs: [tabWithSubTerminals()], activeTabId: "tab-api" });

    await saveSession();
    const json = localStorage.getItem(KEY)!;
    expect(json.length).toBeLessThan(5 * 1024 * 1024);
    const buf = saved().tabs[0].subViews[1].root.children[1].pane.serializedBuffer;
    // The tail of the scrollback is kept.
    expect(buf.length).toBe(10000);
    expect(buf.endsWith("TAIL")).toBe(true);
    expect(saved().tabs[0].root.pane.serializedBuffer).toBe("own-buf");
  });
});

describe("truncation and surrogate pairs", () => {
  it("truncation never splits an emoji into a lone surrogate", async () => {
    // 10,000 code units from the end falls inside an emoji: "😀" is two.
    const big = "x".repeat(6 * 1024 * 1024) + "😀".repeat(5000) + "x";
    live.set("a1", { buffer: "own-buf", cwd: "/code/api" });
    live.set("d1", { buffer: big, cwd: "/code/api/web" });
    useTabStore.setState({ tabs: [tabWithSubTerminals()], activeTabId: "tab-api" });

    await saveSession();
    const json = localStorage.getItem(KEY)!;
    expect(json.length).toBeLessThan(5 * 1024 * 1024);
    // JSON.stringify writes a lone surrogate as an escape; no such escape is there.
    expect(json).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/i);
    const buf: string = saved().tabs[0].subViews[0].root.pane.serializedBuffer;
    expect(buf).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(buf.endsWith("😀x")).toBe(true);
    expect(buf.length).toBeLessThanOrEqual(10000);
    expect(buf.length).toBeGreaterThanOrEqual(9999);
  });

  it("a cut that falls between two emoji keeps the full tail", async () => {
    // Nothing after the emoji: 10,000 code units from the end is a pair boundary.
    const big = "x".repeat(6 * 1024 * 1024) + "😀".repeat(5000);
    live.set("d1", { buffer: big, cwd: "/code/api/web" });
    useTabStore.setState({ tabs: [tabWithSubTerminals()], activeTabId: "tab-api" });

    await saveSession();
    const buf: string = saved().tabs[0].subViews[0].root.pane.serializedBuffer;
    expect(buf.length).toBe(10000);
    expect(buf).toBe("😀".repeat(5000));
    expect(localStorage.getItem(KEY)!).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/i);
  });
});

describe("a saved session with broken sub-terminals", () => {
  const good = { id: "view-1", name: "npm", activePaneId: "s1", root: { type: "pane", pane: { id: "s1", savedCwd: "/code/api/web" } } };
  const BROKEN: [string, unknown][] = [
    ["an entry with no root", { id: "view-2", name: "x", activePaneId: "z" }],
    ["a split with no children", { id: "view-2", name: "x", activePaneId: "z", root: { type: "split", direction: "vertical", children: [] } }],
    ["a pane node with no pane", { id: "view-2", name: "x", activePaneId: "z", root: { type: "pane" } }],
    ["a null entry", null],
  ];
  /** Tab "api" with `subViews`, then tab "web" whose scrollback must survive. */
  const store = (subViews: unknown) => localStorage.setItem(KEY, JSON.stringify({
    tabs: [
      { id: "t1", name: "api", activePaneId: "a", root: { type: "pane", pane: { id: "a", savedCwd: "/code/api" } }, subViews, shownView: "view-1" },
      { id: "t2", name: "web", activePaneId: "b", root: { type: "pane", pane: { id: "b", savedCwd: "/code/web", serializedBuffer: "web-history" } } },
    ],
    activeTabId: "t2",
  }));
  const webKept = () => {
    const web = useTabStore.getState().tabs.find((t) => t.name === "web")!;
    expect(findAllPanes(ownView(web).root)[0].serializedBuffer).toBe("web-history");
    expect(localStorage.getItem(KEY)).not.toBeNull();
  };

  for (const [what, entry] of BROKEN) {
    it(`skips ${what} and keeps the rest of the session`, () => {
      store([good, entry]);
      expect(loadSession()).toBe(true);
      const api = useTabStore.getState().tabs.find((t) => t.name === "api")!;
      expect(api.viewOrder).toHaveLength(2);
      expect(api.views[api.viewOrder[1]].name).toBe("npm");
      expect(api.shownView).toBe(api.viewOrder[1]);
      webKept();
    });
  }

  it("skips subViews that are not a list and keeps the rest of the session", () => {
    store({ "view-1": good });
    expect(loadSession()).toBe(true);
    const api = useTabStore.getState().tabs.find((t) => t.name === "api")!;
    expect(api.viewOrder).toEqual(["own"]);
    expect(api.shownView).toBe("own");
    webKept();
  });
});

describe("storage full", () => {
  it("the fallback drops the scrollback of every sub-terminal too", async () => {
    live.set("a1", { buffer: "own-buf", cwd: "/code/api" });
    live.set("d1", { buffer: "dev-buf", cwd: "/code/api/web" });
    live.set("t2", { buffer: "t2-buf", cwd: "/code/api/e2e" });
    useTabStore.setState({ tabs: [tabWithSubTerminals()], activeTabId: "tab-api" });
    const real = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("QuotaExceededError"); });
    try {
      await saveSession();
    } finally {
      setItem.mockRestore();
      expect(Storage.prototype.setItem).toBe(real);
    }
    const json = localStorage.getItem(KEY)!;
    expect(json).not.toContain("serializedBuffer");
    for (const buf of ["own-buf", "dev-buf", "t2-buf"]) expect(json).not.toContain(buf);
    // The folders and the views are kept.
    const s = saved().tabs[0];
    expect(s.subViews).toHaveLength(2);
    expect(s.subViews[0].root.pane.savedCwd).toBe("/code/api/web");
    expect(s.subViews[1].root.children[1].pane.savedCwd).toBe("/code/api/e2e");
  });
});
