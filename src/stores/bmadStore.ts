import { create } from "zustand";

const KEY = "ade-bmad-dismissed";

function load(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

interface BmadStore {
  dismissedPaths: string[];
  dismiss: (path: string) => void;
  isDismissed: (path: string) => boolean;
}

export const useBmadStore = create<BmadStore>((set, get) => ({
  dismissedPaths: load(),
  dismiss: (path) =>
    set((state) => {
      if (state.dismissedPaths.includes(path)) return state;
      const next = [...state.dismissedPaths, path];
      localStorage.setItem(KEY, JSON.stringify(next));
      return { dismissedPaths: next };
    }),
  isDismissed: (path) => get().dismissedPaths.includes(path),
}));
