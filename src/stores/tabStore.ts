import { create } from "zustand";

export type SplitDirection = "horizontal" | "vertical";

export interface Pane {
  id: string;
  ptyId: number | null;
  initialCwd?: string | null;
  serializedBuffer?: string;
  savedCwd?: string;
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

export interface Tab {
  id: string;
  name: string;
  type?: "terminal" | "orchestrator" | "browser" | "editor" | "fleet" | "contracts";
  orchestratorSessionId?: string;
  /** Project root of a contracts workbench tab. */
  contractsRoot?: string;
  browserUrl?: string;
  editorFilePath?: string;
  root: PaneNode;
  activePaneId: string;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string;

  addTab: (name?: string, initialCwd?: string) => void;
  addOrchestratorTab: (sessionId: string) => string;
  addBrowserTab: (url?: string) => string;
  addFleetTab: () => string;
  addContractsTab: (root: string) => string;
  addEditorTab: (filePath: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;

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
}

let paneCounter = 0;
const newPaneId = () => `pane-${++paneCounter}`;
let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;

function createDefaultPane(initialCwd?: string | null): Pane {
  const pane: Pane = { id: newPaneId(), ptyId: null };
  if (initialCwd) pane.initialCwd = initialCwd;
  return pane;
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
  const initialPane = createDefaultPane();
  const initialTabId = newTabId();

  /** Append a tab and activate it. Non-terminal tabs carry a placeholder pane. */
  const openTab = (fields: Omit<Tab, "id" | "root" | "activePaneId">, pane = createDefaultPane()): string => {
    const tab: Tab = { ...fields, id: newTabId(), root: { type: "pane", pane }, activePaneId: pane.id };
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
    const allPanes = findAllPanes(tab.root);
    if (allPanes.length <= 1) return;
    const idx = allPanes.findIndex((p) => p.id === tab.activePaneId);
    const next = allPanes[(idx + step + allPanes.length) % allPanes.length];
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: next.id } : t)),
    }));
  };

  return {
    tabs: [
      {
        id: initialTabId,
        name: "Terminal",
        root: { type: "pane", pane: initialPane },
        activePaneId: initialPane.id,
      },
    ],
    activeTabId: initialTabId,

    addTab: (name, initialCwd) => {
      openTab({ name: name || "Terminal" }, createDefaultPane(initialCwd));
    },

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
      if (tab) {
        // Imported lazily: useTerminal imports this store.
        import("../hooks/useTerminal").then(({ destroyInstance }) => {
          for (const pane of findAllPanes(tab.root)) destroyInstance(pane.id);
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

    setActivePaneInTab: (tabId, paneId) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, activePaneId: paneId } : t,
        ),
      })),

    setPtyId: (paneId, ptyId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => ({
          ...t,
          root: updatePaneInNode(t.root, paneId, (p) => ({ ...p, ptyId })),
        })),
      })),

    splitPane: (tabId, paneId, direction, initialCwd) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const result = splitPaneInNode(tab.root, paneId, direction, initialCwd);
      if (!result.newPaneId) return;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, root: result.node, activePaneId: result.newPaneId! }
            : t,
        ),
      }));
    },

    closePane: (tabId, paneId) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (findAllPanes(tab.root).length <= 1) return; // don't close the last pane
      import("../hooks/useTerminal").then(({ destroyInstance }) => destroyInstance(paneId));
      const newRoot = removePaneFromNode(tab.root, paneId);
      if (!newRoot) return;
      const newActive = tab.activePaneId === paneId ? findAllPanes(newRoot)[0].id : tab.activePaneId;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, root: newRoot, activePaneId: newActive } : t,
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
        for (const pane of findAllPanes(tab.root)) detachInstance(pane.id);
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
      return findPane(tab.root, tab.activePaneId);
    },

    getActivePtyId: () => get().getActivePane()?.ptyId ?? null,
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

interface SavedTab {
  id: string;
  name: string;
  type?: string;
  root: unknown; // serialized PaneNode tree
  activePaneId: string;
  editorFilePath?: string;
  browserUrl?: string;
  orchestratorSessionId?: string;
  contractsRoot?: string;
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

function deserializePaneNode(data: any): PaneNode {
  if (data.type === "pane") {
    const pane: Pane = {
      id: newPaneId(),
      ptyId: null,
      initialCwd: data.pane.savedCwd || null,
      serializedBuffer: data.pane.serializedBuffer,
      savedCwd: data.pane.savedCwd,
    };
    return { type: "pane", pane };
  }
  return {
    type: "split",
    direction: data.direction,
    children: (data.children || []).map(deserializePaneNode),
  };
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
        root: { type: "pane", pane: { id: tab.activePaneId } },
        activePaneId: tab.activePaneId,
        editorFilePath: tab.editorFilePath,
        browserUrl: tab.browserUrl,
        orchestratorSessionId: tab.orchestratorSessionId,
        contractsRoot: tab.contractsRoot,
      });
      continue;
    }
    const panes = findAllPanes(tab.root);
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

    savedTabs.push({
      id: tab.id,
      name: tab.name,
      type: tab.type,
      root: serializePaneNode(tab.root, paneData),
      activePaneId: tab.activePaneId,
    });
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
          node.pane.serializedBuffer = node.pane.serializedBuffer.slice(-10000);
        } else if (node.children) {
          node.children.forEach(truncateNode);
        }
      };
      truncateNode(tab.root);
    }
    json = JSON.stringify(session);
  }

  try {
    localStorage.setItem(SESSION_KEY, json);
  } catch {
    // Storage full: drop the stale session rather than restore an old one.
    localStorage.removeItem(SESSION_KEY);
  }
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
        root,
        activePaneId: findAllPanes(root)[0]?.id || "",
        editorFilePath: saved.editorFilePath,
        browserUrl: saved.browserUrl,
        orchestratorSessionId: saved.orchestratorSessionId,
        contractsRoot: saved.contractsRoot,
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
