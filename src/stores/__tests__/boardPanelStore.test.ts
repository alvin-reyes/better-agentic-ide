import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardPanelStore, REFRESH_DEBOUNCE_MS, type BoardDeps } from "../boardPanelStore";
import { buildBoard, type BoardState } from "../stageBoardStore";

const empty = (): BoardState => buildBoard({ config: null, artifactExists: () => false, stories: [], gates: [] });

/** Deps whose build resolves only when the test says so. */
function controlled(methodology: "v4" | "v6" | null = "v4") {
  const pending: { root: string; resolve: (b: BoardState) => void; reject: (e: Error) => void }[] = [];
  const deps: BoardDeps = {
    methodology: vi.fn(async () => methodology),
    build: vi.fn((root: string) => new Promise<BoardState>((resolve, reject) => pending.push({ root, resolve, reject }))),
    stageFile: vi.fn(async () => null),
  };
  return { deps, pending };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("boardPanelStore", () => {
  afterEach(() => vi.useRealTimers());

  it("builds the board for the project it is shown", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    pending[0].resolve(empty());
    await flush();
    expect(store.getState()).toMatchObject({ root: "/p", methodology: "v4", error: null, loading: false });
    expect(store.getState().board).not.toBeNull();
  });

  it("does not build for a project with no methodology", async () => {
    const { deps } = controlled(null);
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    expect(deps.build).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ methodology: null, board: null, loading: false });
  });

  it("runs one rebuild at a time and queues at most one more", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    void store.getState().refresh();
    void store.getState().refresh();
    void store.getState().refresh();
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(1);
    pending[0].resolve(empty());
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(2);
    pending[1].resolve(empty());
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good board when a rebuild throws, and shows the error", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    const good = empty();
    pending[0].resolve(good);
    await flush();
    void store.getState().refresh();
    await flush();
    pending[1].reject(new Error("tickets.toml: bad"));
    await flush();
    expect(store.getState().board).toBe(good);
    expect(store.getState().error).toBe("tickets.toml: bad");
  });

  it("discards a build for a project that is no longer shown", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/old");
    await flush();
    store.getState().show("/new");
    await flush();
    expect(store.getState().loading).toBe(true);
    pending[0].resolve(empty()); // /old finishes late
    await flush();
    expect(store.getState().root).toBe("/new");
    expect(store.getState().board).toBeNull();
    const last = pending[pending.length - 1];
    expect(last.root).toBe("/new");
    last.resolve(empty());
    await flush();
    expect(store.getState().board).not.toBeNull();
  });

  it("coalesces a burst of change events into one rebuild", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    pending[0].resolve(empty());
    await flush();
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) store.getState().scheduleRefresh();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1);
    expect(deps.build).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(2);
  });

  it("keeps the methodology when the first build fails", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    pending[0].reject(new Error("boom"));
    await flush();
    expect(store.getState()).toMatchObject({ methodology: "v4", board: null, error: "boom", loading: false });
  });

  it("clears everything when shown no project", async () => {
    const { deps } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show(null);
    await flush();
    expect(store.getState()).toMatchObject({ root: null, board: null, methodology: null, loading: false });
  });
});
