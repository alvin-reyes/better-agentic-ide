import { create } from "zustand";

export type SplitDirection = "horizontal" | "vertical";

export interface Pane {
  id: string;
  ptyId: number | null;
  initialCwd?: string | null;
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
  root: PaneNode;
  activePaneId: string;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string;

  addTab: (name?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;

  setActivePaneInTab: (tabId: string, paneId: string) => void;
  setPtyId: (paneId: string, ptyId: number) => void;
  splitPane: (tabId: string, paneId: string, direction: SplitDirection, initialCwd?: string | null) => void;
  closePane: (tabId: string, paneId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  focusNextPane: (tabId: string) => void;
  focusPrevPane: (tabId: string) => void;
  getActivePane: () => Pane | null;
  getActivePtyId: () => number | null;
}

let paneCounter = 0;
const newPaneId = () => `pane-${++paneCounter}`;
let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;

function createDefaultPane(): Pane {
  return { id: newPaneId(), ptyId: null };
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
      const newPane = createDefaultPane();
      if (initialCwd) newPane.initialCwd = initialCwd;
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

  // If this container matches the split direction and the target pane is a direct child,
  // enforce the max split limit by adding to this container instead of nesting
  if (node.direction === direction) {
    const childIdx = node.children.findIndex(
      (c) => c.type === "pane" && c.pane.id === paneId,
    );
    if (childIdx !== -1) {
      if (node.children.length >= MAX_SPLITS_PER_DIRECTION) {
        return { node, newPaneId: null }; // limit reached
      }
      const newPane = createDefaultPane();
      if (initialCwd) newPane.initialCwd = initialCwd;
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

export const useTabStore = create<TabStore>((set, get) => {
  const initialPane = createDefaultPane();
  const initialTabId = newTabId();

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

    addTab: (name) => {
      const pane = createDefaultPane();
      const tab: Tab = {
        id: newTabId(),
        name: name || "Terminal",
        root: { type: "pane", pane },
        activePaneId: pane.id,
      };
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }));
    },

    closeTab: (id) => {
      const state = get();
      if (state.tabs.length <= 1) return;
      const tab = state.tabs.find((t) => t.id === id);
      // Destroy all PTY instances for panes in this tab
      if (tab) {
        const panes = findAllPanes(tab.root);
        for (const pane of panes) {
          // Lazy import to avoid circular deps — destroyInstance is called async
          import("../hooks/useTerminal").then(({ destroyInstance }) => {
            destroyInstance(pane.id);
          });
        }
      }
      const idx = state.tabs.findIndex((t) => t.id === id);
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActive =
        state.activeTabId === id
          ? newTabs[Math.min(idx, newTabs.length - 1)].id
          : state.activeTabId;
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
      const allPanes = findAllPanes(tab.root);
      if (allPanes.length <= 1) return; // don't close the last pane
      // Destroy the terminal instance
      import("../hooks/useTerminal").then(({ destroyInstance }) => {
        destroyInstance(paneId);
      });
      const newRoot = removePaneFromNode(tab.root, paneId);
      if (!newRoot) return;
      // Pick a new active pane if the closed one was active
      const remainingPanes = findAllPanes(newRoot);
      const newActive = tab.activePaneId === paneId
        ? remainingPanes[0].id
        : tab.activePaneId;
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

    focusNextPane: (tabId) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const allPanes = findAllPanes(tab.root);
      if (allPanes.length <= 1) return;
      const idx = allPanes.findIndex((p) => p.id === tab.activePaneId);
      const next = (idx + 1) % allPanes.length;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, activePaneId: allPanes[next].id } : t,
        ),
      }));
    },

    focusPrevPane: (tabId) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const allPanes = findAllPanes(tab.root);
      if (allPanes.length <= 1) return;
      const idx = allPanes.findIndex((p) => p.id === tab.activePaneId);
      const prev = (idx - 1 + allPanes.length) % allPanes.length;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, activePaneId: allPanes[prev].id } : t,
        ),
      }));
    },

    getActivePane: () => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return null;
      return findPane(tab.root, tab.activePaneId);
    },

    getActivePtyId: () => {
      const pane = get().getActivePane();
      return pane?.ptyId ?? null;
    },
  };
});

export { findAllPanes };
