import { create } from "zustand";
import { usePaneCwd } from "./paneMetaStore";

export type SplitDirection = "horizontal" | "vertical";

export interface Pane {
  id: string;
  ptyId: number | null;
  initialCwd?: string | null;
  serializedBuffer?: string;
  savedCwd?: string;
  /**
   * The first pane of a tab just opened as a new terminal (addTab, or the
   * launch tab when no session is restored): it opens with the banner. Splits
   * and restored panes never carry it, and it is never saved with a session.
   */
  isNewTab?: boolean;
}

export interface SplitNode {
  type: "pane";
  pane: Pane;
}

export interface SplitContainer {
  type: "split";
  direction: SplitDirection;
  children: PaneNode[];
}

export type PaneNode = SplitNode | SplitContainer;

/** The id of a tab's own view: always present, always first in `viewOrder`. */
export const OWN_VIEW = "own";

/**
 * One pane tree of a tab. A tab without sub-terminals has only its own view;
 * every reader says which view it means (shownView, ownView, allTabPanes,
 * viewOfPane) instead of reading a single tree.
 */
export interface View {
  id: string;
  name: string | null;
  spawnedBy: string | null;
  root: PaneNode;
  activePaneId: string;
  /**
   * A sub-terminal loadSession brought back, for the view's life; false on
   * every other view. Never saved.
   */
  restored: boolean;
}

export interface Tab {
  id: string;
  name: string;
  type?: "terminal" | "orchestrator" | "browser" | "editor" | "fleet" | "contracts";
  orchestratorSessionId?: string;
  /** Project root of a contracts workbench tab. */
  contractsRoot?: string;
  browserUrl?: string;
  editorFilePath?: string;
  /**
   * The document this tab is previewing.
   *
   * Per tab, like browserUrl and editorFilePath, because the preview belongs to
   * the work in the tab. It used to live in PreviewPanel's own state on a single
   * instance mounted outside the tab tree, so every tab shared one document and
   * closing the panel discarded it.
   */
  previewPath?: string | null;
  /** Accent chosen from the tab's context menu. */
  color?: string;
  views: Record<string, View>;
  viewOrder: string[];
  shownView: string;
}

/** The view fields of a tab whose only view is its own, holding `root`. */
export function ownViewOnly(root: PaneNode, activePaneId: string): Pick<Tab, "views" | "viewOrder" | "shownView"> {
  return {
    views: { [OWN_VIEW]: { id: OWN_VIEW, name: null, spawnedBy: null, root, activePaneId, restored: false } },
    viewOrder: [OWN_VIEW],
    shownView: OWN_VIEW,
  };
}

/** The view in sight. */
export function shownView(tab: Tab): View {
  return tab.views[tab.shownView] ?? tab.views[OWN_VIEW];
}

/** The tab's own view: its label, folder and project come from here. */
export function ownView(tab: Tab): View {
  return tab.views[OWN_VIEW];
}

/** Every pane of every view, in `viewOrder`. */
export function allTabPanes(tab: Tab): Pane[] {
  return tab.viewOrder.flatMap((id) => (tab.views[id] ? findAllPanes(tab.views[id].root) : []));
}

/** The view holding `paneId`, or undefined. */
export function viewOfPane(tab: Tab, paneId: string): View | undefined {
  for (const id of tab.viewOrder) {
    const view = tab.views[id];
    if (view && findPane(view.root, paneId)) return view;
  }
  return undefined;
}

/** `tab` with view `viewId` replaced by `update(view)`. */
function withView(tab: Tab, viewId: string, update: (v: View) => View): Tab {
  const view = tab.views[viewId];
  if (!view) return tab;
  return { ...tab, views: { ...tab.views, [viewId]: update(view) } };
}

/** What reopening a closed terminal tab brings back. */
export interface ClosedTab {
  name: string;
  cwd: string | null;
  color?: string;
}

const MAX_CLOSED = 20;

interface TabStore {
  tabs: Tab[];
  activeTabId: string;
  /** Most recently closed terminal tabs, newest last. */
  closedTabs: ClosedTab[];

  /** Opens a terminal tab; returns its id. */
  addTab: (name?: string, initialCwd?: string) => string;
  addOrchestratorTab: (sessionId: string) => string;
  addBrowserTab: (url?: string) => string;
  addFleetTab: () => string;
  addContractsTab: (root: string) => string;
  addEditorTab: (filePath: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  setTabColor: (id: string, color: string | undefined) => void;
  setPreviewPath: (id: string, path: string | null) => void;
  /** Reopen the most recently closed terminal tab in its folder. */
  reopenClosedTab: () => void;
  /** Stable-sort tabs so each project's tabs sit together. */
  sortTabsBy: (key: (tab: Tab) => string) => void;

  setActivePaneInTab: (tabId: string, paneId: string) => void;
  setPtyId: (paneId: string, ptyId: number) => void;
  splitPane: (tabId: string, paneId: string, direction: SplitDirection, initialCwd?: string | null) => void;
  closePane: (tabId: string, paneId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  detachTab: (id: string) => Tab | null;
  focusNextPane: (tabId: string) => void;
  focusPrevPane: (tabId: string) => void;
  getActivePane: () => Pane | null;
  getActivePtyId: () => number | null;
  /**
   * The active pane of a *named* tab, which is not necessarily the focused one.
   * Anything that creates a tab and then waits for its PTY must use this: the
   * user can focus a different tab while the wait is in flight, and reading the
   * globally active pane would then act on their terminal instead.
   */
  getTabActivePane: (tabId: string) => Pane | null;

  /**
   * Adds a sub-terminal to a terminal tab, at the end of `viewOrder`, with one
   * pane in `cwd`; returns its view id (null for an unknown or non-terminal
   * tab). Without `focus` the selection is left alone; with it the view is
   * shown and its tab activated. `spawnedBy` is the spawning view's id.
   */
  addView: (tabId: string, opts: NewView) => string | null;
  /** Shows view `viewId` of tab `tabId`. */
  showView: (tabId: string, viewId: string) => void;
  /**
   * Closes sub-terminal `viewId`: kills each of its panes (through the
   * instance, else the store's ptyId) and removes it. When it was in sight,
   * the entry on its left is shown. The own view never closes this way.
   */
  closeView: (tabId: string, viewId: string) => void;
}

export interface NewView {
  name: string;
  cwd: string | null;
  focus?: boolean;
  spawnedBy?: string | null;
}

let paneCounter = 0;
const newPaneId = () => `pane-${++paneCounter}`;
let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;
let viewCounter = 0;
const newViewId = () => `view-${++viewCounter}`;

function createDefaultPane(initialCwd?: string | null): Pane {
  const pane: Pane = { id: newPaneId(), ptyId: null };
  if (initialCwd) pane.initialCwd = initialCwd;
  return pane;
}

/** The first pane of a new terminal tab: the one that shows the banner. */
function createNewTabPane(initialCwd?: string | null): Pane {
  return { ...createDefaultPane(initialCwd), isNewTab: true };
}

function findPane(node: PaneNode, paneId: string): Pane | null {
  if (node.type === "pane") {
    return node.pane.id === paneId ? node.pane : null;
  }
  for (const child of node.children) {
    const found = findPane(child, paneId);
    if (found) return found;
  }
  return null;
}

function findAllPanes(node: PaneNode): Pane[] {
  if (node.type === "pane") return [node.pane];
  return node.children.flatMap(findAllPanes);
}

function updatePaneInNode(
  node: PaneNode,
  paneId: string,
  updater: (p: Pane) => Pane,
): PaneNode {
  if (node.type === "pane") {
    if (node.pane.id === paneId) {
      return { type: "pane", pane: updater(node.pane) };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) => updatePaneInNode(c, paneId, updater)),
  };
}

function removePaneFromNode(
  node: PaneNode,
  paneId: string,
): PaneNode | null {
  if (node.type === "pane") {
    return node.pane.id === paneId ? null : node;
  }
  const remaining = node.children
    .map((c) => removePaneFromNode(c, paneId))
    .filter((c): c is PaneNode => c !== null);
  if (remaining.length === 0) return null;
  if (remaining.length === 1) return remaining[0];
  return { ...node, children: remaining };
}

const MAX_SPLITS_PER_DIRECTION = 4;

function splitPaneInNode(
  node: PaneNode,
  paneId: string,
  direction: SplitDirection,
  initialCwd?: string | null,
): { node: PaneNode; newPaneId: string | null } {
  if (node.type === "pane") {
    if (node.pane.id === paneId) {
      const newPane = createDefaultPane(initialCwd);
      return {
        node: {
          type: "split",
          direction,
          children: [node, { type: "pane", pane: newPane }],
        },
        newPaneId: newPane.id,
      };
    }
    return { node, newPaneId: null };
  }

  // Splitting a direct child along this container's direction adds a sibling
  // instead of nesting, so the per-direction limit can be enforced.
  if (node.direction === direction) {
    const childIdx = node.children.findIndex(
      (c) => c.type === "pane" && c.pane.id === paneId,
    );
    if (childIdx !== -1) {
      if (node.children.length >= MAX_SPLITS_PER_DIRECTION) {
        return { node, newPaneId: null }; // limit reached
      }
      const newPane = createDefaultPane(initialCwd);
      const newChildren = [...node.children];
      newChildren.splice(childIdx + 1, 0, { type: "pane", pane: newPane });
      return {
        node: { ...node, children: newChildren },
        newPaneId: newPane.id,
      };
    }
  }

  const newChildren: PaneNode[] = [];
  let foundNewPaneId: string | null = null;
  for (const child of node.children) {
    if (foundNewPaneId) {
      newChildren.push(child);
    } else {
      const result = splitPaneInNode(child, paneId, direction, initialCwd);
      newChildren.push(result.node);
      foundNewPaneId = result.newPaneId;
    }
  }
  return { node: { ...node, children: newChildren }, newPaneId: foundNewPaneId };
}

/** The tab to activate when the active one at `idx` is removed from `tabs`. */
function neighbourTabId(tabs: Tab[], idx: number): string {
  return tabs[Math.min(idx, tabs.length - 1)].id;
}

export const useTabStore = create<TabStore>((set, get) => {
  const initialPane = createNewTabPane();
  const initialTabId = newTabId();

  /** Append a tab and activate it. Non-terminal tabs carry a placeholder pane. */
  const openTab = (fields: Omit<Tab, "id" | "views" | "viewOrder" | "shownView">, pane = createDefaultPane()): string => {
    const tab: Tab = { ...fields, id: newTabId(), ...ownViewOnly({ type: "pane", pane }, pane.id) };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  };

  const focusExisting = (match: (t: Tab) => boolean): string | undefined => {
    const existing = get().tabs.find(match);
    if (existing) set({ activeTabId: existing.id });
    return existing?.id;
  };

  const focusPaneBy = (tabId: string, step: 1 | -1) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const view = shownView(tab);
    const allPanes = findAllPanes(view.root);
    if (allPanes.length <= 1) return;
    const idx = allPanes.findIndex((p) => p.id === view.activePaneId);
    const next = allPanes[(idx + step + allPanes.length) % allPanes.length];
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? withView(t, view.id, (v) => ({ ...v, activePaneId: next.id })) : t)),
    }));
  };

  return {
    tabs: [
      {
        id: initialTabId,
        name: "Terminal",
        ...ownViewOnly({ type: "pane", pane: initialPane }, initialPane.id),
      },
    ],
    activeTabId: initialTabId,
    closedTabs: [],

    addTab: (name, initialCwd) => openTab({ name: name || "Terminal" }, createNewTabPane(initialCwd)),

    addOrchestratorTab: (sessionId) =>
      openTab({ name: "Orchestrator", type: "orchestrator", orchestratorSessionId: sessionId }),

    addBrowserTab: (url) =>
      openTab({ name: "Browser", type: "browser", browserUrl: url || "http://localhost:3000" }),

    // Fleet, a project's contracts workbench and a file's editor are opened
    // once; asking again focuses the existing tab.
    addFleetTab: () =>
      focusExisting((t) => t.type === "fleet") ?? openTab({ name: "Fleet", type: "fleet" }),

    addContractsTab: (root) =>
      focusExisting((t) => t.type === "contracts" && t.contractsRoot === root) ??
      openTab({ name: `\u2B21 ${root.split("/").pop() || "contracts"}`, type: "contracts", contractsRoot: root }),

    addEditorTab: (filePath) =>
      focusExisting((t) => t.type === "editor" && t.editorFilePath === filePath) ??
      openTab({ name: filePath.split("/").pop() || filePath, type: "editor", editorFilePath: filePath }),

    closeTab: (id) => {
      const state = get();
      if (state.tabs.length <= 1) return;
      const tab = state.tabs.find((t) => t.id === id);
      if (tab && (!tab.type || tab.type === "terminal")) {
        const own = ownView(tab);
        const pane = findAllPanes(own.root).find((p) => p.id === own.activePaneId) ?? findAllPanes(own.root)[0];
        const cwd = (pane && usePaneCwd.getState().cwds[pane.id]) || pane?.savedCwd || pane?.initialCwd || null;
        const closed = [...state.closedTabs, { name: tab.name, cwd, color: tab.color }].slice(-MAX_CLOSED);
        set({ closedTabs: closed });
      }
      if (tab) {
        // Imported lazily: useTerminal imports this store.
        import("../hooks/useTerminal").then(({ destroyInstance }) => {
          for (const pane of allTabPanes(tab)) destroyInstance(pane.id, pane.ptyId);
        });
      }
      const idx = state.tabs.findIndex((t) => t.id === id);
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActive = state.activeTabId === id ? neighbourTabId(newTabs, idx) : state.activeTabId;
      set({ tabs: newTabs, activeTabId: newActive });
    },

    setActiveTab: (id) => set({ activeTabId: id }),

    renameTab: (id, name) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
      })),

    setTabColor: (id, color) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, color } : t)),
      })),

    setPreviewPath: (id, previewPath) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, previewPath } : t)),
      })),

    reopenClosedTab: () => {
      const closed = get().closedTabs;
      const last = closed[closed.length - 1];
      if (!last) return;
      set({ closedTabs: closed.slice(0, -1) });
      openTab({ name: last.name, color: last.color }, createDefaultPane(last.cwd ?? undefined));
    },

    sortTabsBy: (key) =>
      set((s) => {
        // Groups keep the order of their first tab; tabs keep their order within a group.
        const firstSeen = new Map<string, number>();
        s.tabs.forEach((t, i) => { const k = key(t); if (!firstSeen.has(k)) firstSeen.set(k, i); });
        const tabs = s.tabs
          .map((t, i) => ({ t, i, g: firstSeen.get(key(t))! }))
          .sort((a, b) => a.g - b.g || a.i - b.i)
          .map((x) => x.t);
        return { tabs };
      }),

    setActivePaneInTab: (tabId, paneId) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? withView(t, (viewOfPane(t, paneId) ?? shownView(t)).id, (v) => ({ ...v, activePaneId: paneId }))
            : t,
        ),
      })),

    setPtyId: (paneId, ptyId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          const view = viewOfPane(t, paneId);
          if (!view) return t;
          return withView(t, view.id, (v) => ({ ...v, root: updatePaneInNode(v.root, paneId, (p) => ({ ...p, ptyId })) }));
        }),
      })),

    splitPane: (tabId, paneId, direction, initialCwd) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const view = viewOfPane(tab, paneId);
      if (!view) return;
      const result = splitPaneInNode(view.root, paneId, direction, initialCwd);
      if (!result.newPaneId) return;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? withView(t, view.id, (v) => ({ ...v, root: result.node, activePaneId: result.newPaneId! }))
            : t,
        ),
      }));
    },

    closePane: (tabId, paneId) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const view = viewOfPane(tab, paneId);
      if (!view) return;
      if (findAllPanes(view.root).length <= 1) return; // don't close the last pane
      const ptyId = findPane(view.root, paneId)?.ptyId ?? null;
      import("../hooks/useTerminal").then(({ destroyInstance }) => destroyInstance(paneId, ptyId));
      const newRoot = removePaneFromNode(view.root, paneId);
      if (!newRoot) return;
      const newActive = view.activePaneId === paneId ? findAllPanes(newRoot)[0].id : view.activePaneId;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? withView(t, view.id, (v) => ({ ...v, root: newRoot, activePaneId: newActive })) : t,
        ),
      }));
    },

    reorderTabs: (fromIndex, toIndex) => {
      set((s) => {
        const newTabs = [...s.tabs];
        const [moved] = newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, moved);
        return { tabs: newTabs };
      });
    },

    detachTab: (id) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return null;

      // Dispose the xterm instances but keep the PTYs running for the new window.
      import("../hooks/useTerminal").then(({ detachInstance }) => {
        for (const pane of allTabPanes(tab)) detachInstance(pane.id);
      });

      const idx = state.tabs.findIndex((t) => t.id === id);
      const newTabs = state.tabs.filter((t) => t.id !== id);
      // The last tab stays (the caller adds a new tab first).
      if (newTabs.length === 0) return null;

      const newActive = state.activeTabId === id ? neighbourTabId(newTabs, idx) : state.activeTabId;
      set({ tabs: newTabs, activeTabId: newActive });
      return tab;
    },

    focusNextPane: (tabId) => focusPaneBy(tabId, 1),
    focusPrevPane: (tabId) => focusPaneBy(tabId, -1),

    getActivePane: () => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return null;
      const view = shownView(tab);
      return findPane(view.root, view.activePaneId);
    },

    getActivePtyId: () => get().getActivePane()?.ptyId ?? null,

    getTabActivePane: (tabId) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab) return null;
      const view = shownView(tab);
      return findPane(view.root, view.activePaneId);
    },

    addView: (tabId, { name, cwd, focus, spawnedBy }) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab || (tab.type && tab.type !== "terminal")) return null;
      const pane = createDefaultPane(cwd);
      const view: View = { id: newViewId(), name, spawnedBy: spawnedBy ?? null, root: { type: "pane", pane }, activePaneId: pane.id, restored: false };
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, views: { ...t.views, [view.id]: view }, viewOrder: [...t.viewOrder, view.id], shownView: focus ? view.id : t.shownView }
            : t,
        ),
        ...(focus ? { activeTabId: tabId } : {}),
      }));
      return view.id;
    },

    showView: (tabId, viewId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId && t.views[viewId] ? { ...t, shownView: viewId } : t)),
      })),

    closeView: (tabId, viewId) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      const view = tab?.views[viewId];
      if (!tab || !view || viewId === OWN_VIEW) return;
      import("../hooks/useTerminal").then(({ destroyInstance }) => {
        for (const pane of findAllPanes(view.root)) destroyInstance(pane.id, pane.ptyId);
      });
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          const idx = t.viewOrder.indexOf(viewId);
          const viewOrder = t.viewOrder.filter((id) => id !== viewId);
          const { [viewId]: _closed, ...views } = t.views;
          const shown = t.shownView === viewId ? t.viewOrder[idx - 1] ?? OWN_VIEW : t.shownView;
          return { ...t, views, viewOrder, shownView: shown };
        }),
      }));
    },
  };
});

// Session persistence
const SESSION_KEY = "ade-session";
const MAX_SESSION_SIZE = 5 * 1024 * 1024; // 5MB

interface SavedPane {
  id: string;
  serializedBuffer?: string;
  savedCwd?: string;
}

/** A sub-terminal as saved: no spawnedBy, status, command or restored. */
interface SavedView {
  id: string;
  name: string | null;
  root: unknown; // serialized PaneNode tree
  activePaneId: string;
}

interface SavedTab {
  id: string;
  name: string;
  type?: string;
  root: unknown; // serialized PaneNode tree: the own view's
  activePaneId: string;
  editorFilePath?: string;
  browserUrl?: string;
  previewPath?: string | null;
  orchestratorSessionId?: string;
  contractsRoot?: string;
  color?: string;
  /** Only for a tab with sub-terminals, in viewOrder; absent otherwise. */
  subViews?: SavedView[];
  /** Saved with subViews only: the view in sight, by its saved id. */
  shownView?: string;
}

interface SavedSession {
  tabs: SavedTab[];
  activeTabId: string;
  savedAt: number;
}

function serializePaneNode(node: PaneNode, paneData: Map<string, SavedPane>): unknown {
  if (node.type === "pane") {
    const saved = paneData.get(node.pane.id);
    return {
      type: "pane",
      pane: {
        id: node.pane.id,
        serializedBuffer: saved?.serializedBuffer,
        savedCwd: saved?.savedCwd,
      },
    };
  }
  return {
    type: "split",
    direction: node.direction,
    children: node.children.map((c) => serializePaneNode(c, paneData)),
  };
}

/** A saved tree with new pane ids; `ids` collects saved id -> new id. */
function deserializePaneNode(data: any, ids?: Map<string, string>): PaneNode {
  if (data.type === "pane") {
    const pane: Pane = {
      id: newPaneId(),
      ptyId: null,
      initialCwd: data.pane.savedCwd || null,
      serializedBuffer: data.pane.serializedBuffer,
      savedCwd: data.pane.savedCwd,
    };
    ids?.set(data.pane.id, pane.id);
    return { type: "pane", pane };
  }
  return {
    type: "split",
    direction: data.direction,
    children: (data.children || []).map((c: any) => deserializePaneNode(c, ids)),
  };
}

/** Every saved pane tree of a tab: the own view's, then each sub-terminal's. */
function savedTrees(tab: SavedTab): any[] {
  return [tab.root, ...(tab.subViews ?? []).map((v) => v.root)];
}

/**
 * The last `n` UTF-16 code units of `s`, or one fewer when the cut would leave
 * a lone low surrogate first: JSON.stringify writes that as an escape that
 * strict parsers (serde_json, so sync.rs) refuse.
 */
function tail(s: string, n: number): string {
  const t = s.slice(-n);
  const first = t.charCodeAt(0);
  return first >= 0xdc00 && first <= 0xdfff ? t.slice(1) : t;
}

async function saveSession(): Promise<void> {
  const { serializeTerminalBuffer, getPtyCwd } = await import("../hooks/useTerminal");
  const state = useTabStore.getState();

  const savedTabs: SavedTab[] = [];
  for (const tab of state.tabs) {
    if (tab.type && tab.type !== "terminal") {
      // Non-terminal tabs have no shell to capture: save what reopens them.
      savedTabs.push({
        id: tab.id,
        name: tab.name,
        type: tab.type,
        root: { type: "pane", pane: { id: ownView(tab).activePaneId } },
        activePaneId: ownView(tab).activePaneId,
        editorFilePath: tab.editorFilePath,
        browserUrl: tab.browserUrl,
        orchestratorSessionId: tab.orchestratorSessionId,
        contractsRoot: tab.contractsRoot,
        color: tab.color,
      });
      continue;
    }
    // SavedTab.root is the own view's tree; sub-terminals go in subViews.
    const own = ownView(tab);
    const panes = allTabPanes(tab);
    const paneData = new Map<string, SavedPane>();

    for (const pane of panes) {
      // Only panes that have been shown have a live terminal. A restored tab
      // that hasn't been opened yet keeps what it was restored with.
      const buffer = serializeTerminalBuffer(pane.id);
      const cwd = await getPtyCwd(pane.id);
      paneData.set(pane.id, {
        id: pane.id,
        serializedBuffer: buffer || pane.serializedBuffer || undefined,
        savedCwd: cwd || pane.savedCwd || pane.initialCwd || undefined,
      });
    }

    const saved: SavedTab = {
      id: tab.id,
      name: tab.name,
      type: tab.type,
      root: serializePaneNode(own.root, paneData),
      activePaneId: own.activePaneId,
      color: tab.color,
    };
    // A tab with one view writes exactly what it wrote before sub-terminals.
    if (tab.viewOrder.length > 1) {
      saved.subViews = tab.viewOrder.slice(1).flatMap((id) => {
        const view = tab.views[id];
        if (!view) return [];
        return [{ id: view.id, name: view.name, root: serializePaneNode(view.root, paneData), activePaneId: view.activePaneId }];
      });
      saved.shownView = tab.shownView;
    }
    savedTabs.push(saved);
  }

  if (savedTabs.length === 0) {
    // Every tab was closed: don't bring the old ones back next launch.
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  const session: SavedSession = {
    tabs: savedTabs,
    activeTabId: state.activeTabId,
    savedAt: Date.now(),
  };

  let json = JSON.stringify(session);

  // Over the limit: keep only the tail of each pane's scrollback.
  if (json.length > MAX_SESSION_SIZE) {
    for (const tab of session.tabs) {
      const truncateNode = (node: any) => {
        if (node.type === "pane" && node.pane.serializedBuffer) {
          node.pane.serializedBuffer = tail(node.pane.serializedBuffer, 10000);
        } else if (node.children) {
          node.children.forEach(truncateNode);
        }
      };
      savedTrees(tab).forEach(truncateNode);
    }
    json = JSON.stringify(session);
  }

  try {
    localStorage.setItem(SESSION_KEY, json);
  } catch {
    // Storage full: keep the tabs, splits and folders without scrollback, and
    // only as a last resort drop the stale session rather than restore an old one.
    const stripBuffers = (node: any) => {
      if (node.type === "pane") delete node.pane.serializedBuffer;
      else node.children?.forEach(stripBuffers);
    };
    session.tabs.forEach((t) => savedTrees(t).forEach(stripBuffers));
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }
}

/** Whether every split in a loaded tree has children (a saved `children: []` gives none). */
function hasEveryPane(node: PaneNode): boolean {
  return node.type === "pane" ? true : node.children.length > 0 && node.children.every(hasEveryPane);
}

/**
 * The views of a loaded tab: its own view holding `root`, then each saved
 * sub-terminal with new ids, marked restored, with no shell yet (it starts
 * when the view is first shown). shownView is remapped, own if unknown.
 */
function restoreViews(saved: SavedTab, root: PaneNode): Pick<Tab, "views" | "viewOrder" | "shownView"> {
  const fields = ownViewOnly(root, findAllPanes(root)[0]?.id || "");
  if (saved.type && saved.type !== "terminal") return fields;
  let shown = OWN_VIEW;
  for (const sub of Array.isArray(saved.subViews) ? saved.subViews : []) {
    const ids = new Map<string, string>();
    let subRoot: PaneNode;
    try {
      subRoot = deserializePaneNode(sub.root, ids);
    } catch {
      continue; // A sub-terminal that won't load is skipped; the session is kept.
    }
    if (!hasEveryPane(subRoot)) continue;
    const view: View = {
      id: newViewId(),
      name: sub.name ?? null,
      spawnedBy: null,
      root: subRoot,
      activePaneId: ids.get(sub.activePaneId) ?? findAllPanes(subRoot)[0].id,
      restored: true,
    };
    fields.views[view.id] = view;
    fields.viewOrder.push(view.id);
    if (sub.id === saved.shownView) shown = view.id;
  }
  return { ...fields, shownView: shown };
}

function loadSession(): boolean {
  try {
    const json = localStorage.getItem(SESSION_KEY);
    if (!json) return false;

    const session: SavedSession = JSON.parse(json);
    if (!session.tabs || session.tabs.length === 0) return false;

    // Editor and contracts tabs are useless without their path.
    const kept = session.tabs.filter(
      (saved) => (saved.type !== "editor" || saved.editorFilePath) && (saved.type !== "contracts" || saved.contractsRoot),
    );
    const restoredTabs: Tab[] = kept.map((saved) => {
      const root = deserializePaneNode(saved.root);
      return {
        id: newTabId(),
        name: saved.name,
        type: (saved.type as Tab["type"]) || undefined,
        ...restoreViews(saved, root),
        editorFilePath: saved.editorFilePath,
        browserUrl: saved.browserUrl,
        previewPath: saved.previewPath,
        orchestratorSessionId: saved.orchestratorSessionId,
        contractsRoot: saved.contractsRoot,
        color: saved.color,
      };
    });

    if (restoredTabs.length > 0) {
      // Index into the kept tabs, which restoredTabs mirrors one-to-one.
      const activeIdx = kept.findIndex((t) => t.id === session.activeTabId);
      useTabStore.setState({
        tabs: restoredTabs,
        activeTabId: restoredTabs[Math.max(0, activeIdx)].id,
      });
    }

    // The saved session is kept: auto-save overwrites it as the session
    // changes, and a crash before the next save must still restore something.
    return true;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return false;
  }
}

export { findAllPanes, saveSession, loadSession };
