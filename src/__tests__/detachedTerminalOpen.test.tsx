import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// A detached window's terminals can run `ade open` too: DetachedApp listens
// for its requests as App does, and stops when it goes.
const h = vi.hoisted(() => ({ stop: vi.fn(), start: vi.fn() }));
vi.mock("../lib/terminalOpen", () => ({ startTerminalOpen: h.start }));
vi.mock("../components/PaneContainer", () => ({ default: () => null }));
vi.mock("../components/Scratchpad", () => ({ default: () => null }));
vi.mock("../stores/agentStatusStore", () => ({ watchAgentStatus: () => () => {} }));
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ getActiveTheme: () => ({}) }) },
  applyThemeToDOM: () => {},
}));

import DetachedApp from "../DetachedApp";
import { ownViewOnly } from "../stores/tabStore";
import type { SerializedTab } from "../lib/detachWindow";

const detached = { id: "t1", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "p1", ptyId: 7 } }, "p1") } as unknown as SerializedTab;

afterEach(() => cleanup());

describe("a detached window and ade open", () => {
  it("listens for requests while it is open", () => {
    h.start.mockReset().mockReturnValue(h.stop);
    h.stop.mockReset();
    const { unmount } = render(<DetachedApp tab={detached} />);
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.stop).not.toHaveBeenCalled();
    unmount();
    expect(h.stop).toHaveBeenCalledTimes(1);
  });
});
