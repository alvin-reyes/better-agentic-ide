import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { BoardState } from "./stageBoardStore";
import { buildV6Map, type V6Map } from "../lib/v6Map";
import { loadBoard } from "../lib/loadBoard";
import { readStageFile } from "../lib/confirmedStage";
import { tauriFs } from "../lib/tauriFs";
import { detectOnDisk } from "../lib/projectSetup";

export type BoardResult = { kind: "v4"; board: BoardState } | { kind: "v6"; map: V6Map };

export interface BoardDeps {
  methodology(root: string): Promise<"v4" | "v6" | null>;
  build(root: string, methodology: "v4" | "v6"): Promise<BoardResult>;
  stageFile(root: string): Promise<string | null>;
}

export interface BoardPanelState {
  root: string | null;
  methodology: "v4" | "v6" | null;
  board: BoardState | null;
  map: V6Map | null;
  stageFile: string | null;
  error: string | null;
  loading: boolean;
  show(root: string | null): void;
  refresh(): Promise<void>;
  scheduleRefresh(): void;
}

export const REFRESH_DEBOUNCE_MS = 300;

/**
 * The board panel's view of one project. The files are the state: everything
 * here is rebuilt from disk, and nothing is written.
 *
 * Rebuilds are serialized — one in flight, at most one queued — because an
 * agent writing ten tickets fires ten events and overlapping builds could
 * finish out of order. A build for a project no longer shown is discarded.
 * A failed rebuild keeps the last good board beside the error.
 */
export function createBoardPanelStore(deps: BoardDeps): UseBoundStore<StoreApi<BoardPanelState>> {
  let running: Promise<void> | null = null;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return create<BoardPanelState>((set, get) => {
    async function buildOnce(): Promise<void> {
      const root = get().root;
      if (!root) return;
      set({ loading: true });
      try {
        const methodology = await deps.methodology(root);
        if (get().root !== root) return;
        if (!methodology) {
          set({ methodology: null, board: null, map: null, stageFile: null, error: null });
          return;
        }
        set({ methodology });
        const [result, stageFile] = await Promise.all([deps.build(root, methodology), deps.stageFile(root)]);
        if (get().root !== root) return;
        // One shape at a time: a project set up again on the other methodology
        // must not keep showing the old one beside the new label.
        if (result.kind === "v4") set({ board: result.board, map: null, stageFile, error: null });
        else set({ map: result.map, board: null, stageFile: null, error: null });
      } catch (e) {
        if (get().root !== root) return;
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (get().root === root) set({ loading: false });
      }
    }

    async function refresh(): Promise<void> {
      if (running) {
        queued = true;
        if (get().root) set({ loading: true });
        return running;
      }
      // Cleared inside the loop's own task, so a refresh arriving after the
      // loop exits starts a new build instead of queueing behind a settled one.
      running = (async () => {
        try {
          do {
            queued = false;
            await buildOnce();
          } while (queued);
        } finally {
          running = null;
        }
      })();
      return running;
    }

    return {
      root: null,
      methodology: null,
      board: null,
      map: null,
      stageFile: null,
      error: null,
      loading: false,
      show(root) {
        if (timer) clearTimeout(timer);
        timer = null;
        if (root === get().root && (get().board || get().map)) return;
        set({ root, methodology: null, board: null, map: null, stageFile: null, error: null, loading: !!root });
        if (root) void refresh();
      },
      refresh,
      scheduleRefresh() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void refresh();
        }, REFRESH_DEBOUNCE_MS);
      },
    };
  });
}

export const useBoardPanel = createBoardPanelStore({
  methodology: (root) => detectOnDisk(root),
  build: async (root, methodology) =>
    methodology === "v6"
      ? { kind: "v6", map: await buildV6Map(root, tauriFs) }
      : { kind: "v4", board: await loadBoard(root, tauriFs) },
  stageFile: (root) => readStageFile(root, tauriFs),
});
