import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { readJson } from "../lib/storage";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  extension: string | null;
  isHidden: boolean;
}

export interface TreeNode {
  entry: FileEntry;
  children: TreeNode[] | null;
  isExpanded: boolean;
  isLoading: boolean;
}

interface FileBrowserStore {
  isOpen: boolean;
  width: number;
  rootPath: string | null;
  tree: TreeNode[];
  showHidden: boolean;

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setRootPath: (path: string | null) => void;
  setShowHidden: (show: boolean) => void;
  loadDirectory: (path: string) => Promise<FileEntry[]>;
  expandNode: (path: string) => Promise<void>;
  collapseNode: (path: string) => void;
  refreshTree: () => Promise<void>;
}

const STORAGE_KEY = "ade-file-browser";

interface PersistedState {
  isOpen: boolean;
  width: number;
  showHidden: boolean;
}

function persistState({ isOpen, width, showHidden }: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen, width, showHidden }));
  } catch {}
}

// The backend sends snake_case fields.
function mapEntry(raw: Record<string, unknown>): FileEntry {
  return {
    name: raw.name as string,
    path: raw.path as string,
    isDir: raw.is_dir as boolean,
    size: raw.size as number,
    extension: (raw.extension as string | null) ?? null,
    isHidden: raw.is_hidden as boolean,
  };
}

const toNode = (entry: FileEntry, isExpanded = false): TreeNode => ({
  entry,
  children: null,
  isExpanded,
  isLoading: false,
});

function findAndUpdate(
  nodes: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.entry.path === targetPath) return updater(node);
    if (node.children) {
      return { ...node, children: findAndUpdate(node.children, targetPath, updater) };
    }
    return node;
  });
}

// Pre-order, so a parent is re-expanded before its children.
function getExpandedPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isExpanded && node.entry.isDir) {
      paths.push(node.entry.path);
      if (node.children) paths.push(...getExpandedPaths(node.children));
    }
  }
  return paths;
}

const persisted = readJson<Partial<PersistedState>>(STORAGE_KEY, {});

export const useFileBrowserStore = create<FileBrowserStore>((set, get) => ({
  isOpen: persisted.isOpen ?? false,
  width: persisted.width ?? 240,
  rootPath: null,
  tree: [],
  showHidden: persisted.showHidden ?? false,

  toggle: () => get().setOpen(!get().isOpen),

  setOpen: (open) => {
    set({ isOpen: open });
    persistState(get());
  },

  setWidth: (width) => {
    set({ width });
    persistState(get());
  },

  setRootPath: (path) => {
    set({ rootPath: path, tree: [] });
    if (path) {
      get().loadDirectory(path).then((entries) => set({ tree: entries.map((e) => toNode(e)) }));
    }
  },

  setShowHidden: (show) => {
    set({ showHidden: show });
    persistState(get());
  },

  loadDirectory: async (path) => {
    try {
      const raw = await invoke<Record<string, unknown>[]>("list_directory", { path });
      return raw.map(mapEntry);
    } catch {
      return [];
    }
  },

  expandNode: async (path) => {
    set({
      tree: findAndUpdate(get().tree, path, (node) => ({
        ...node,
        isLoading: true,
        isExpanded: true,
      })),
    });
    const entries = await get().loadDirectory(path);
    set({
      tree: findAndUpdate(get().tree, path, (node) => ({
        ...node,
        isLoading: false,
        isExpanded: true,
        children: entries.map((e) => toNode(e)),
      })),
    });
  },

  collapseNode: (path) => {
    set({
      tree: findAndUpdate(get().tree, path, (node) => ({
        ...node,
        isExpanded: false,
        // keep children cached
      })),
    });
  },

  refreshTree: async () => {
    const { rootPath, tree, loadDirectory } = get();
    if (!rootPath) return;

    const expandedPaths = new Set(getExpandedPaths(tree));
    let newTree = (await loadDirectory(rootPath)).map((e) => toNode(e));

    for (const expPath of expandedPaths) {
      const entries = await loadDirectory(expPath);
      newTree = findAndUpdate(newTree, expPath, (node) => ({
        ...node,
        isExpanded: true,
        children: entries.map((e) => toNode(e, expandedPaths.has(e.path))),
      }));
    }

    set({ tree: newTree });
  },
}));
