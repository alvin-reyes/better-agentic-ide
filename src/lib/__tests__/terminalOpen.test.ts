import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The window's half of `ade open`: what it does with each message from Rust.
// The terminal itself is faked here (createSubTerminal); the real
// createInstance is exercised in src/hooks/__tests__/createAtOnce.test.tsx.
const h = vi.hoisted(() => ({ destroyInstance: vi.fn(), invoke: vi.fn(async (..._args: unknown[]) => null) }));
vi.mock("../../hooks/useTerminal", () => ({
  destroyInstance: h.destroyInstance,
  createSubTerminalInstance: vi.fn(),
  getTerminalDimensions: () => null,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: class { onmessage: unknown = null; } }));

import { handleOpenMessage, defaultSubTerminalName, startTerminalOpen, commandLine, openStatusOf, useOpenStatus, type OpenDeps, type OpenMessage } from "../terminalOpen";
import { shellQuote } from "../shellQuote";
import { tokenizeFish, tokenizePosix, REAL_SHELLS, shellAvailable, runShell } from "./shellTokenize";
import { useTabStore, ownViewOnly, OWN_VIEW, type Tab, type PaneNode } from "../../stores/tabStore";

const leaf = (id: string, ptyId: number | null): PaneNode => ({ type: "pane", pane: { id, ptyId } });
const terminalTab = (id: string, paneId: string, ptyId: number): Tab => ({ id, name: "Terminal", ...ownViewOnly(leaf(paneId, ptyId), paneId) });
const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;

type Created = { paneId: string; opts: { cwd: string | null; size: { cols: number; rows: number }; requestId: number } };

/** Deps with a terminal that starts at once as PTY `ptyId`, and a recorded invoke. */
function deps(over: Partial<OpenDeps> = {}, ptyId = 40) {
  const created: Created[] = [];
  const invoked: Array<[string, Record<string, unknown>]> = [];
  const d: OpenDeps = {
    invoke: async (cmd, args) => {
      invoked.push([cmd, args]);
      return null;
    },
    store: useTabStore,
    createSubTerminal: async (paneId, setPtyId, opts) => {
      created.push({ paneId, opts });
      setPtyId(paneId, ptyId);
      return { ptyId };
    },
    dimensions: (paneId) => (paneId === "a1" ? { cols: 132, rows: 43 } : null),
    now: () => 1_000,
    ...over,
  };
  return { d, created, invoked };
}

const request = (over: Partial<Extract<OpenMessage, { request: unknown }>["request"]> = {}): OpenMessage => ({
  request: { requestId: 1, expiresAt: 6_000, callerPtyId: 5, cwd: "/work/api", command: null, split: null, name: null, focus: false, ...over },
});

const done = (invoked: Array<[string, Record<string, unknown>]>) => invoked.filter(([cmd]) => cmd === "terminal_open_done").map(([, a]) => a);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  // Tab a's own terminal is PTY 5 (the caller); b is in sight.
  useTabStore.setState({ tabs: [terminalTab("a", "a1", 5), terminalTab("b", "b1", 6)], activeTabId: "b", closedTabs: [] });
  h.destroyInstance.mockClear();
  useOpenStatus.setState({ byView: {} });
});
afterEach(() => vi.useRealTimers());

describe("adding a sub-terminal", () => {
  it("background add keeps selection and focus", async () => {
    const { d, invoked } = deps();
    await handleOpenMessage(request({ name: "api" }), d);
    const a = tab("a");
    expect(a.viewOrder).toHaveLength(2);
    const view = a.views[a.viewOrder[1]];
    expect(view.name).toBe("api");
    expect(a.shownView).toBe(OWN_VIEW);
    expect(useTabStore.getState().activeTabId).toBe("b");
    expect(done(invoked)).toEqual([{ requestId: 1, error: null, ptyId: 40, line: null, focused: false }]);
  });

  it("--focus from the active tab switches to the new sub-terminal", async () => {
    useTabStore.setState({ activeTabId: "a" });
    const { d, invoked } = deps();
    await handleOpenMessage(request({ focus: true }), d);
    const a = tab("a");
    expect(a.shownView).toBe(a.viewOrder[1]);
    expect(useTabStore.getState().activeTabId).toBe("a");
    expect(done(invoked)).toEqual([{ requestId: 1, error: null, ptyId: 40, line: null, focused: true }]);
  });

  it("--focus from a background tab adds in the background and says so", async () => {
    // Tab b is in sight: a command in tab a can't take the window over.
    const { d, invoked } = deps();
    await handleOpenMessage(request({ focus: true }), d);
    const a = tab("a");
    expect(a.viewOrder).toHaveLength(2);
    expect(a.shownView).toBe(OWN_VIEW);
    expect(useTabStore.getState().activeTabId).toBe("b");
    expect(done(invoked)).toEqual([{ requestId: 1, error: null, ptyId: 40, line: null, focused: false }]);
  });

  it("a sub-terminal's add is a sibling in the same tab, spawned by its view", async () => {
    const first = deps({}, 40);
    await handleOpenMessage(request({ requestId: 1 }), first.d);
    const sub = tab("a").viewOrder[1];
    expect(tab("a").views[sub].spawnedBy).toBe("own");
    // The sub-terminal (PTY 40) runs ade open itself.
    const second = deps({}, 41);
    await handleOpenMessage(request({ requestId: 2, callerPtyId: 40 }), second.d);
    const a = tab("a");
    expect(a.viewOrder).toHaveLength(3);
    const sibling = a.views[a.viewOrder[2]];
    expect(sibling.spawnedBy).toBe(sub);
    expect(sibling.root.type).toBe("pane");
    expect(tab("b").viewOrder).toEqual([OWN_VIEW]);
  });

  it("the pane's terminal is created before any mount, at the caller's size", async () => {
    const { d, created } = deps();
    const handled = handleOpenMessage(request({ requestId: 3 }), d);
    // Nothing has been awaited or mounted yet.
    const a = tab("a");
    const paneId = a.views[a.viewOrder[1]].activePaneId;
    expect(created).toEqual([{ paneId, opts: { cwd: "/work/api", size: { cols: 132, rows: 43 }, requestId: 3 } }]);
    await handled;
    expect(tab("a").views[a.viewOrder[1]].root).toMatchObject({ type: "pane", pane: { id: paneId, ptyId: 40 } });
  });

  it("with no caller instance it is 24 by 80", async () => {
    const { d, created } = deps({ dimensions: () => null });
    await handleOpenMessage(request(), d);
    expect(created[0].opts.size).toEqual({ cols: 80, rows: 24 });
  });

  it("a caller this window doesn't have is refused, and nothing is added", async () => {
    const { d, created, invoked } = deps();
    await handleOpenMessage(request({ callerPtyId: 99 }), d);
    expect(tab("a").viewOrder).toEqual([OWN_VIEW]);
    expect(created).toEqual([]);
    const [answer] = done(invoked);
    expect(answer).toMatchObject({ requestId: 1, ptyId: null, line: null });
    expect(typeof answer.error).toBe("string");
  });

  it("a shell that fails to start is answered with an error, and its view is closed", async () => {
    const { d, invoked } = deps({ createSubTerminal: async () => ({ ptyId: null }) });
    await handleOpenMessage(request({ focus: true }), d);
    const [answer] = done(invoked);
    expect(answer).toMatchObject({ requestId: 1, ptyId: null });
    expect(typeof answer.error).toBe("string");
    // No dead "Failed to start shell" sub-terminal is left behind.
    const a = tab("a");
    expect(a.viewOrder).toEqual([OWN_VIEW]);
    expect(a.shownView).toBe(OWN_VIEW);
    await flush();
    expect(h.destroyInstance).toHaveBeenCalledTimes(1);
    // A later expiry for it closes nothing more.
    await handleOpenMessage({ expired: 1 }, d);
    expect(h.destroyInstance).toHaveBeenCalledTimes(1);
  });
});

describe("expiry", () => {
  it("a request past expiresAt does nothing", async () => {
    const { d, created, invoked } = deps({ now: () => 6_001 });
    await handleOpenMessage(request({ expiresAt: 6_000 }), d);
    expect(tab("a").viewOrder).toEqual([OWN_VIEW]);
    expect(created).toEqual([]);
    expect(invoked).toEqual([]);
  });

  it("expired closes the sub-terminal the request added", async () => {
    const { d } = deps();
    await handleOpenMessage(request({ requestId: 7 }), d);
    const a = tab("a");
    const paneId = a.views[a.viewOrder[1]].activePaneId;
    await handleOpenMessage({ expired: 7 }, d);
    expect(tab("a").viewOrder).toEqual([OWN_VIEW]);
    await flush();
    expect(h.destroyInstance).toHaveBeenCalledWith(paneId, 40);
    // Another request's expiry closes nothing.
    await handleOpenMessage(request({ requestId: 8 }), d);
    await handleOpenMessage({ expired: 99 }, d);
    expect(tab("a").viewOrder).toHaveLength(2);
  });

  it("expired before the terminal exists closes it once created", async () => {
    let start: (ptyId: number) => void = () => {};
    const { d, invoked } = deps({
      createSubTerminal: (_paneId, _setPtyId, _opts) => new Promise((resolve) => { start = (ptyId) => resolve({ ptyId }); }),
    });
    const handled = handleOpenMessage(request({ requestId: 9 }), d);
    await handleOpenMessage({ expired: 9 }, d);
    expect(tab("a").viewOrder).toEqual([OWN_VIEW]);
    start(41);
    await handled;
    expect(invoked).toContainEqual(["kill_pty", { id: 41 }]);
    expect(done(invoked)).toEqual([]);
  });
});

describe("default names", () => {
  it("a name given wins", () => {
    expect(defaultSubTerminalName("api", ["npm", "run", "dev"], "/work/web")).toBe("api");
  });
  it('"npm run dev" is named npm', () => {
    expect(defaultSubTerminalName(null, ["npm", "run", "dev"], "/work/web")).toBe("npm");
  });
  it('"env TOKEN=x npm run dev" is named env', () => {
    expect(defaultSubTerminalName(null, ["env", "TOKEN=x", "npm", "run", "dev"], "/work/web")).toBe("env");
  });
  it('"FOO=1 make" is named make', () => {
    expect(defaultSubTerminalName(null, ["FOO=1", "make"], "/work/web")).toBe("make");
    expect(defaultSubTerminalName(null, ["FOO=1", "BAR=2", "/usr/bin/make", "-j4"], "/work/web")).toBe("make");
  });
  it("no command names it after the folder", () => {
    expect(defaultSubTerminalName(null, null, "/work/web")).toBe("web");
    expect(defaultSubTerminalName(null, null, "/work/web/")).toBe("web");
    expect(defaultSubTerminalName(null, ["FOO=1"], "/work/web")).toBe("web");
  });
  it("format and separator characters are cleaned out of a derived name", () => {
    expect(defaultSubTerminalName(null, null, "/work/evil\u202Egpj.exe")).toBe("evilgpj.exe");
    expect(defaultSubTerminalName(null, null, "/work/a\u200Bb\u2028c\u2029d\uFEFF\u0007")).toBe("abcd");
    expect(defaultSubTerminalName(null, ["np\u200Dm", "run"], "/work/web")).toBe("npm");
    // Nothing left: the next fallback.
    expect(defaultSubTerminalName(null, ["\u200B"], "/work/web")).toBe("web");
    expect(defaultSubTerminalName(null, null, "/work/\u202E\u200B")).toBe("Terminal");
    expect(defaultSubTerminalName(null, null, "/work/日本語")).toBe("日本語");
  });
  it("no command and no folder is named Terminal", () => {
    expect(defaultSubTerminalName(null, null, null)).toBe("Terminal");
    expect(defaultSubTerminalName(null, null, "/")).toBe("Terminal");
  });
});

describe("listening", () => {
  it("listens once per window until stopped", () => {
    h.invoke.mockClear();
    const stop = startTerminalOpen();
    startTerminalOpen();
    expect(h.invoke.mock.calls.filter(([cmd]) => cmd === "terminal_open_listen")).toHaveLength(1);
    stop();
    const again = startTerminalOpen();
    expect(h.invoke.mock.calls.filter(([cmd]) => cmd === "terminal_open_listen")).toHaveLength(2);
    again();
  });
});

// ---- Story 9: typing the command ----

describe("the typed line (T2)", () => {
  it("the_line_quotes_each_word_with_shellQuote_except_bare_words", async () => {
    expect(commandLine(["npm", "run", "dev"])).toBe("npm run dev");
    expect(commandLine(["./bin/work", "--name", "a_b-c.d/e"])).toBe("./bin/work --name a_b-c.d/e");
    const words = ["sh", "-c", "echo 'a b'; ls"];
    expect(commandLine(words)).toBe(`sh -c ${shellQuote("echo 'a b'; ls")}`);
    expect(commandLine(words)).toBe("sh -c 'echo '\\''a b'\\''; ls'");
    expect(commandLine(["FOO=1", "make"])).toBe(`${shellQuote("FOO=1")} make`);
    // The window answers with that line.
    const { d, invoked } = deps();
    await handleOpenMessage(request({ command: words }), d);
    expect(done(invoked)).toEqual([{ requestId: 1, error: null, ptyId: 40, line: "sh -c 'echo '\\''a b'\\''; ls'", focused: false }]);
  });

  it("a_word_with_a_quote_or_backslash_is_one_word_in_sh_and_fish", () => {
    const words = ["printf", "%s\\n", "it's", "a\\b", "x'\\'y", "a b", "\\", "'", "-- --x", "~", "$HOME", "`id`", "a;b|c&&d"];
    const line = commandLine(words);
    expect(tokenizePosix(line)).toEqual(words);
    expect(tokenizeFish(line)).toEqual(words);
    // And in the real shells present here (sh and bash at least).
    for (const shell of REAL_SHELLS.filter(shellAvailable)) {
      const got = runShell(shell, line, process.cwd());
      expect(got.stdout, shell.name).toBe(words.slice(2).map((w) => `${w}\n`).join(""));
    }
  });
});

describe("typed (T4, T9)", () => {
  const sub = () => {
    const a = tab("a");
    return { tabId: "a", viewId: a.viewOrder[1] };
  };

  it("a request with a command starts with the spinner; one without has none", async () => {
    const { d } = deps();
    await handleOpenMessage(request({ requestId: 1, command: ["npm", "run", "dev"] }), d);
    const { tabId, viewId } = sub();
    expect(openStatusOf(useOpenStatus.getState(), tabId, viewId)).toMatchObject({ status: "starting", firstWord: "npm", line: "npm run dev" });
    await handleOpenMessage(request({ requestId: 2 }), d);
    const plain = tab("a").viewOrder[2];
    expect(openStatusOf(useOpenStatus.getState(), "a", plain)).toBeNull();
  });

  it("typed_false_sets_the_entry_to_not_typed_with_the_why", async () => {
    const { d } = deps();
    await handleOpenMessage(request({ requestId: 4, command: ["npm", "run", "dev"] }), d);
    await handleOpenMessage({ typed: 4, ok: false, why: "the shell's line editor didn't start" }, d);
    const { tabId, viewId } = sub();
    const entry = openStatusOf(useOpenStatus.getState(), tabId, viewId);
    expect(entry).toMatchObject({ status: "not-typed", why: "the shell's line editor didn't start", line: "npm run dev", firstWord: "npm" });
    expect(entry?.paneId).toBe(tab("a").views[viewId].activePaneId);
    // Held in memory only: nothing of it is in the saved session.
    expect(JSON.stringify(useTabStore.getState().tabs)).not.toContain("npm run dev");
    // Another request's typed message changes nothing.
    await handleOpenMessage({ typed: 99, ok: true, why: null }, d);
    expect(openStatusOf(useOpenStatus.getState(), tabId, viewId)?.status).toBe("not-typed");
  });

  it("the_spinner_clears_when_typed_arrives", async () => {
    const { d } = deps();
    await handleOpenMessage(request({ requestId: 5, command: ["ls"] }), d);
    const first = sub();
    await handleOpenMessage({ typed: 5, ok: true, why: null }, d);
    expect(openStatusOf(useOpenStatus.getState(), first.tabId, first.viewId)).toBeNull();

    await handleOpenMessage(request({ requestId: 6, command: ["ls"] }), d);
    const second = tab("a").viewOrder[2];
    expect(openStatusOf(useOpenStatus.getState(), "a", second)?.status).toBe("starting");
    await handleOpenMessage({ typed: 6, ok: false, why: "x" }, d);
    expect(openStatusOf(useOpenStatus.getState(), "a", second)?.status).toBe("not-typed");

    // At expiry the view closes, and its status goes with it.
    await handleOpenMessage(request({ requestId: 7, command: ["ls"] }), d);
    const third = tab("a").viewOrder[3];
    await handleOpenMessage({ expired: 7 }, d);
    expect(openStatusOf(useOpenStatus.getState(), "a", third)).toBeNull();
  });
});
