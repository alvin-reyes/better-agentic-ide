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
