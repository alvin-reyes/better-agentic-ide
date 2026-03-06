import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

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

function loadPersistedState() {
  try {
    const raw = localStorage.getItem("ade-file-browser");
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function persistState(state: { isOpen: boolean; width: number; showHidden: boolean }) {
  try {
    localStorage.setItem("ade-file-browser", JSON.stringify(state));
  } catch {}
}

// Convert snake_case Rust response to camelCase
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

// Collect all expanded directory paths
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

const persisted = loadPersistedState();

export const useFileBrowserStore = create<FileBrowserStore>((set, get) => ({
  isOpen: persisted.isOpen ?? false,
  width: persisted.width ?? 240,
  rootPath: null,
  tree: [],
  showHidden: persisted.showHidden ?? false,

  toggle: () => {
    const next = !get().isOpen;
    set({ isOpen: next });
    persistState({ isOpen: next, width: get().width, showHidden: get().showHidden });
  },

  setOpen: (open) => {
    set({ isOpen: open });
    persistState({ isOpen: open, width: get().width, showHidden: get().showHidden });
  },

  setWidth: (width) => {
    set({ width });
    persistState({ isOpen: get().isOpen, width, showHidden: get().showHidden });
  },

  setRootPath: (path) => {
    set({ rootPath: path, tree: [] });
    if (path) {
      get().loadDirectory(path).then((entries) => {
        set({
          tree: entries.map((e) => ({
            entry: e,
            children: null,
            isExpanded: false,
            isLoading: false,
          })),
        });
      });
    }
  },

  setShowHidden: (show) => {
    set({ showHidden: show });
    persistState({ isOpen: get().isOpen, width: get().width, showHidden: show });
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
    // Mark as loading
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
        children: entries.map((e) => ({
          entry: e,
          children: null,
          isExpanded: false,
          isLoading: false,
        })),
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

    // Get all expanded paths before refresh
    const expandedPaths = new Set(getExpandedPaths(tree));

    // Reload root
    const rootEntries = await loadDirectory(rootPath);
    let newTree: TreeNode[] = rootEntries.map((e) => ({
      entry: e,
      children: null,
      isExpanded: false,
      isLoading: false,
    }));

    // Re-expand previously expanded dirs
    for (const expPath of expandedPaths) {
      const entries = await loadDirectory(expPath);
      newTree = findAndUpdate(newTree, expPath, (node) => ({
        ...node,
        isExpanded: true,
        children: entries.map((e) => ({
          entry: e,
          children: null,
          isExpanded: expandedPaths.has(e.path),
          isLoading: false,
        })),
      }));
    }

    set({ tree: newTree });
  },
}));
