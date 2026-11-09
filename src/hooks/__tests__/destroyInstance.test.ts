import { describe, it, expect, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class { onmessage: unknown = null; } }));

import { destroyInstance } from "../useTerminal";

describe("destroyInstance", () => {
  it("kills a pane with no instance by the store's pty id", () => {
    destroyInstance("never-shown", 77);
    expect(invoke).toHaveBeenCalledWith("kill_pty", { id: 77 });
  });

  it("kills nothing for a pane with no instance and no shell", () => {
    invoke.mockClear();
    destroyInstance("never-shown", null);
    destroyInstance("never-shown");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("destroyInstance, for closing a sub-terminal", () => {
  it("destroyInstance kills by the stored ptyId when no instance exists", () => {
    invoke.mockClear();
    destroyInstance("hidden-sub-terminal-pane", 91);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("kill_pty", { id: 91 });
  });
});
