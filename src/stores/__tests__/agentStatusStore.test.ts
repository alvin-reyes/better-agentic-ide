import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  invoke: vi.fn(async (_cmd: string, _args?: unknown) => null as unknown),
  channels: [] as { onmessage: ((u: unknown) => void) | null }[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: backend.invoke,
  Channel: class {
    onmessage: ((u: unknown) => void) | null = null;
    constructor() {
      backend.channels.push(this);
    }
  },
}));

import {
  applyUpdate, isAnsweringKey, mostUrgent, needsYouToasts, reportAnsweringKey, tabAgentState,
  useAgentStatusStore, watchAgentStatus, type AgentState,
} from "../agentStatusStore";
import type { Tab } from "../tabStore";

const pane = (id: string, ptyId: number | null) => ({ type: "pane" as const, pane: { id, ptyId } });

const tab = (id: string, ...ptys: (number | null)[]): Tab => ({
  id,
  name: id,
  activePaneId: `${id}-0`,
  root: ptys.length === 1
    ? pane(`${id}-0`, ptys[0])
    : { type: "split", direction: "horizontal", children: ptys.map((p, i) => pane(`${id}-${i}`, p)) },
});

const key = (key: string, o: Partial<KeyboardEvent> = {}) =>
  ({ type: "keydown", key, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...o }) as KeyboardEvent;

beforeEach(() => {
  backend.invoke.mockClear();
  useAgentStatusStore.setState({ byPty: {} });
});

describe("rolling state up", () => {
  it("picks the most urgent: needs you, waiting, working, ready, finished", () => {
    expect(mostUrgent(["finished", "working", "ready"])).toBe("working");
    expect(mostUrgent(["waiting", "needsYou", "working"])).toBe("needsYou");
    expect(mostUrgent(["ready", "waiting"])).toBe("waiting");
    expect(mostUrgent([undefined, null])).toBeNull();
    expect(mostUrgent([])).toBeNull();
  });

  it("rolls a tab's panes up to the tab", () => {
    const byPty: Record<number, AgentState> = { 1: "working", 2: "needsYou", 3: "waiting" };
    expect(tabAgentState(tab("a", 1, 2), byPty)).toBe("needsYou");
    expect(tabAgentState(tab("b", 1, 3), byPty)).toBe("waiting");
    expect(tabAgentState(tab("c", 4, null), byPty)).toBeNull();
  });

  it("applies updates, dropping a pane whose state is null", () => {
    let byPty = applyUpdate({}, { ptyId: 1, state: "working" });
    byPty = applyUpdate(byPty, { ptyId: 2, state: "ready" });
    byPty = applyUpdate(byPty, { ptyId: 1, state: null });
    expect(byPty).toEqual({ 2: "ready" });
  });

  it("subscribes once and applies what the channel streams", async () => {
    watchAgentStatus();
    watchAgentStatus();
    const watches = backend.invoke.mock.calls.filter(([cmd]) => cmd === "agent_status_watch");
    expect(watches).toHaveLength(1);
    const channel = backend.channels[backend.channels.length - 1];
    channel.onmessage?.({ ptyId: 5, state: "needsYou" });
    expect(useAgentStatusStore.getState().byPty).toEqual({ 5: "needsYou" });
  });
});

describe("answering keys", () => {
  it("counts Enter, Esc, digits, y and n, pressed down with no modifier", () => {
    for (const k of ["Enter", "Escape", "0", "1", "9", "y", "n", "Y", "N"]) expect(isAnsweringKey(key(k)), k).toBe(true);
    for (const k of ["a", "Tab", "ArrowDown", " ", "Shift", "F1"]) expect(isAnsweringKey(key(k)), k).toBe(false);
    expect(isAnsweringKey(key("Enter", { type: "keyup" }))).toBe(false);
    expect(isAnsweringKey(key("Enter", { type: "keypress" }))).toBe(false);
    expect(isAnsweringKey(key("y", { ctrlKey: true }))).toBe(false);
    expect(isAnsweringKey(key("1", { metaKey: true }))).toBe(false);
    expect(isAnsweringKey(key("n", { altKey: true }))).toBe(false);
    expect(isAnsweringKey(key("1", { isComposing: true }))).toBe(false);
  });

  it("reports a key only for a pane that needs you", () => {
    useAgentStatusStore.setState({ byPty: { 1: "needsYou", 2: "working" } });
    reportAnsweringKey(2);
    expect(backend.invoke).not.toHaveBeenCalled();
    reportAnsweringKey(1);
    expect(backend.invoke).toHaveBeenCalledWith("agent_status_key", { ptyId: 1 });
  });
});

describe("needs-you toasts", () => {
  const out = new Set<number>();
  const notInView = () => false;

  it("toasts a pane that isn't in view, once until it leaves needs you", () => {
    let r = needsYouToasts({ 1: "needsYou", 2: "working" }, new Set(), notInView);
    expect(r.show).toEqual([1]);
    r = needsYouToasts({ 1: "needsYou" }, r.handled, notInView);
    expect(r.show).toEqual([]);
    r = needsYouToasts({ 1: "working" }, r.handled, notInView);
    expect(r.handled.size).toBe(0);
    r = needsYouToasts({ 1: "needsYou" }, r.handled, notInView);
    expect(r.show).toEqual([1]);
  });

  it("doesn't toast a pane in view, nor later for the same prompt", () => {
    let r = needsYouToasts({ 3: "needsYou" }, out, (p) => p === 3);
    expect(r.show).toEqual([]);
    r = needsYouToasts({ 3: "needsYou" }, r.handled, notInView);
    expect(r.show).toEqual([]);
  });
});
