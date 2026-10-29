import { create } from "zustand";
import type { HoverCard } from "../lib/hoverPreview";

/**
 * The window's file hover card: what the hover controller (`hoverPreview.ts`)
 * last showed, or null. `FileHoverCard` renders it.
 */
interface FileHoverState {
  card: HoverCard | null;
  show: (card: HoverCard) => void;
  hide: () => void;
}

export const useFileHoverStore = create<FileHoverState>((set) => ({
  card: null,
  show: (card) => set({ card }),
  hide: () => set({ card: null }),
}));
