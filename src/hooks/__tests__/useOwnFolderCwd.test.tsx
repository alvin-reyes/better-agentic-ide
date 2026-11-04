import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Each pane's folder: the own view is in /code/shop, the sub-terminal in sight in /elsewhere.
const folders = vi.hoisted(() => ({ byPane: {} as Record<string, string | null> }));
const getPtyCwd = vi.hoisted(() => vi.fn(async (paneId: string) => folders.byPane[paneId] ?? null));
vi.mock("../useTerminal", () => ({ getPtyCwd }));

import { useOwnFolderCwd, CWD_POLL_MS } from "../useOwnFolderCwd";
import type { Tab, PaneNode } from "../../stores/tabStore";

const leaf = (id: string, ptyId: number | null): PaneNode => ({ type: "pane", pane: { id, ptyId } });

/** A terminal tab showing a sub-terminal whose folder differs from the own view's. */
const tabWithSubInSight = (ownPty: number | null = 1): Tab => ({
  id: "t",
  name: "Terminal",
  views: {
    own: { id: "own", name: null, spawnedBy: null, root: leaf("own-pane", ownPty), activePaneId: "own-pane", restored: false },
    "view-9": { id: "view-9", name: "dev server", spawnedBy: null, root: leaf("sub-pane", 2), activePaneId: "sub-pane", restored: false },
  },
  viewOrder: ["own", "view-9"],
  shownView: "view-9",
});

beforeEach(() => {
  folders.byPane = { "own-pane": "/code/shop", "sub-pane": "/elsewhere" };
  getPtyCwd.mockClear();
});

describe("useOwnFolderCwd", () => {
  it("the folder poll reads the own view's folder with a sub-terminal in sight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const tab = tabWithSubInSight();
      const { result } = renderHook(() => useOwnFolderCwd(tab, 1));
      await waitFor(() => expect(result.current).toBe("/code/shop"));
      expect(getPtyCwd.mock.calls.map((c) => c[0])).toEqual(["own-pane"]);

      // A cd in the own terminal is picked up by the poll; the sub-terminal is never read.
      folders.byPane["own-pane"] = "/code/shop/api";
      await act(async () => { await vi.advanceTimersByTimeAsync(CWD_POLL_MS); });
      await waitFor(() => expect(result.current).toBe("/code/shop/api"));
      expect(getPtyCwd.mock.calls.every((c) => c[0] === "own-pane")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-runs when the folder pane's PTY lands, and keeps the last folder for a non-terminal tab", async () => {
    folders.byPane["own-pane"] = null; // no shell yet
    const tab = tabWithSubInSight(null);
    const { result, rerender } = renderHook(({ t, pty }) => useOwnFolderCwd(t, pty), {
      initialProps: { t: tab as Tab | undefined, pty: null as number | null },
    });
    await waitFor(() => expect(getPtyCwd).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();

    folders.byPane["own-pane"] = "/code/shop";
    rerender({ t: tab, pty: 7 });
    await waitFor(() => expect(result.current).toBe("/code/shop"));

    const fleet: Tab = { ...tab, id: "f", type: "fleet" };
    getPtyCwd.mockClear();
    rerender({ t: fleet, pty: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(getPtyCwd).not.toHaveBeenCalled();
    expect(result.current).toBe("/code/shop");
  });
});
