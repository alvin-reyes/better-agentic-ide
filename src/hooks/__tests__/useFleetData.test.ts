import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: ((ev: unknown) => void) | null = null;
  },
}));

import { acquireWatch, __resetWatchForTests } from "../useFleetData";
import { useFleetStore } from "../../stores/fleetStore";

const spawn = {
  kind: "Spawn" as const,
  id: "s1",
  agent_type: "Explore",
  description: "d",
  model: null,
  started_at: "2026-08-07T05:29:32.936Z",
};

function calls(cmd: string) {
  return invoke.mock.calls.filter((c) => c[0] === cmd);
}

/** Let the invoke promises inside start/stopWatch settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("acquireWatch", () => {
  beforeEach(() => {
    invoke.mockReset();
    let nextId = 1;
    invoke.mockImplementation(async (cmd: string) =>
      cmd === "watch_subagents" ? nextId++ : undefined,
    );
    __resetWatchForTests();
    useFleetStore.getState().reset();
  });

  it("starts exactly one watcher for two views on the same cwd", async () => {
    const a = acquireWatch("/proj");
    const b = acquireWatch("/proj");
    await flush();
    expect(calls("watch_subagents")).toHaveLength(1);
    a();
    b();
  });

  it("does not reset the store when a second view mounts", async () => {
    acquireWatch("/proj");
    useFleetStore.getState().applyEvent(spawn, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(1);

    acquireWatch("/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(1);
  });

  it("keeps the watcher alive while any view still holds it", async () => {
    const a = acquireWatch("/proj");
    const b = acquireWatch("/proj");
    await flush();

    a();
    await flush();
    expect(calls("unwatch_subagents")).toHaveLength(0);

    b();
    await flush();
    expect(calls("unwatch_subagents")).toHaveLength(1);
  });

  it("ignores a double release from the same holder", async () => {
    const a = acquireWatch("/proj");
    const b = acquireWatch("/proj");
    await flush();

    a();
    a();
    await flush();
    expect(calls("unwatch_subagents")).toHaveLength(0);
    b();
  });

  it("restarts and resets on an actual cwd change", async () => {
    const a = acquireWatch("/proj");
    useFleetStore.getState().applyEvent(spawn, "/proj");
    await flush();

    const b = acquireWatch("/other");
    await flush();
    expect(useFleetStore.getState().subagents).toHaveLength(0);
    expect(calls("watch_subagents")).toHaveLength(2);
    expect(calls("unwatch_subagents")).toHaveLength(1);
    a();
    b();
  });

  it("re-acquiring the same cwd after a full release starts a fresh watcher", async () => {
    acquireWatch("/proj")();
    await flush();
    acquireWatch("/proj");
    await flush();
    expect(calls("watch_subagents")).toHaveLength(2);
  });
});
