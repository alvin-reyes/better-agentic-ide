import { create } from "zustand";
import { readJson } from "../lib/storage";

const KEY = "ade-bmad-dismissed";

interface BmadStore {
  dismissedPaths: string[];
  dismiss: (path: string) => void;
  isDismissed: (path: string) => boolean;
}

export const useBmadStore = create<BmadStore>((set, get) => ({
  dismissedPaths: readJson<string[]>(KEY, []),
  dismiss: (path) =>
    set((state) => {
      if (state.dismissedPaths.includes(path)) return state;
      const next = [...state.dismissedPaths, path];
      localStorage.setItem(KEY, JSON.stringify(next));
      return { dismissedPaths: next };
    }),
  isDismissed: (path) => get().dismissedPaths.includes(path),
}));
