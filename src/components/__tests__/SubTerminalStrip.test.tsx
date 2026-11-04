import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";

// The real useTerminal, with xterm and the backend faked: a terminal's
// focus() focuses its own textarea, so document.activeElement says which
// pane has the keyboard.
const h = vi.hoisted(() => {
  let nextPty = 1;
  const invoke = vi.fn(async (cmd: string) => (cmd === "create_pty" ? nextPty++ : (null as unknown)));
  class FakeTerminal {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    element: HTMLElement | undefined = undefined;
    textarea: HTMLTextAreaElement | undefined = undefined;
    buffer = { active: { length: 0, getLine: () => undefined } };
    constructor(options: Record<string, unknown>) { this.options = { scrollSensitivity: 1, ...options }; }
    open(parent: HTMLElement) {
      this.element = document.createElement("div");
      this.textarea = document.createElement("textarea");
      this.textarea.className = "xterm-helper-textarea";
      this.element.appendChild(this.textarea);
      parent.appendChild(this.element);
    }
    loadAddon(addon: { activate: (t: unknown) => void }) { addon.activate(this); }
    write() {}
    writeln() {}
    focus() { this.textarea?.focus(); }
    refresh() {}
    dispose() {}
    onData() { return { dispose() {} }; }
    onResize() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
  }
  class Addon {
    activate() {}
    dispose() {}
    onContextLoss() { return { dispose() {} }; }
    fit() {}
    proposeDimensions() { return { cols: 80, rows: 24 }; }
  }
  return { invoke, FakeTerminal, Addon };
});
vi.mock("@xterm/xterm", () => ({ Terminal: h.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: h.Addon }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: h.Addon }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: h.Addon }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: h.Addon }));
vi.mock("@xterm/addon-image", () => ({ ImageAddon: h.Addon }));
vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: h.Addon }));
vi.mock("../../lib/terminalFileLinks", () => ({ registerFileLinks: () => {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: class { onmessage: unknown = null; } }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: async () => {} }));

import SubTerminalStrip, { SubTerminalAnnouncer, SUB_TERMINAL_CONTENT_ID } from "../SubTerminalStrip";
import { useTerminal, destroyInstance, stopIdlePolling } from "../../hooks/useTerminal";
import { useGuardedClose } from "../../hooks/useGuardedClose";
import { useTabStore, ownViewOnly, findAllPanes, shownView, type Tab, type PaneNode } from "../../stores/tabStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { usePaneCwd } from "../../stores/paneMetaStore";

const leaf = (id: string): PaneNode => ({ type: "pane", pane: { id, ptyId: null } });
// "Terminal" tabs show their folder's name: the own view's pane a1 is in /code/api.
const terminalTab = (id: string, paneId: string): Tab => ({ id, name: "Terminal", ...ownViewOnly(leaf(paneId), paneId) });
const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;
const addView = (tabId: string, name: string, cwd: string | null = null, focus = false) => {
  let id = "";
  act(() => { id = useTabStore.getState().addView(tabId, { name, cwd, focus })!; });
  return id;
};
const entries = () => screen.getAllByRole("tab");
const live = () => document.querySelector('[aria-live="polite"]')!;

/** One pane's terminal, mounted through the real hook. */
function Pane({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useTerminal(id, ref);
  return <div ref={ref} data-pane={id} />;
}
/** The strip over the shown view's panes, keyed by position as PaneContainer keys them. */
function TabScreen({ tabId }: { tabId: string }) {
  const t = useTabStore((s) => s.tabs.find((x) => x.id === tabId))!;
  const panes = findAllPanes(shownView(t).root);
  return (
    <>
      <SubTerminalStrip tabId={tabId} />
      <div id={SUB_TERMINAL_CONTENT_ID}>{panes.map((p, i) => <Pane key={i} id={p.id} />)}</div>
    </>
  );
}
/** The pane whose terminal has the keyboard, if any. */
const focusedPane = () => (document.activeElement as HTMLElement | null)?.closest("[data-pane]")?.getAttribute("data-pane") ?? null;

let frames: FrameRequestCallback[] = [];
/** Let every pending attach finish: microtasks, then queued frames, repeatedly. */
async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { for (const cb of frames.splice(0)) cb(0); });
  }
}
/** Real terminals mount only in these tests: a layout, frames and no banner. */
function withTerminals() {
  frames = [];
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  for (const key of ["offsetWidth", "offsetHeight"]) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => 600 });
  }
  useSettingsStore.setState({ gpuRendering: false, showBanner: false });
}

let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion,
    media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  usePaneCwd.setState({ cwds: { a1: "/code/api", b1: "/code/web" } });
  useTabStore.setState({ tabs: [terminalTab("a", "a1"), terminalTab("b", "b1")], activeTabId: "a", closedTabs: [] });
});
afterEach(async () => {
  const panes = useTabStore.getState().tabs.flatMap((t) => t.viewOrder.flatMap((v) => findAllPanes(t.views[v].root)));
  cleanup();
  vi.useRealTimers();
  for (const p of panes) destroyInstance(p.id);
  stopIdlePolling();
  vi.unstubAllGlobals();
  for (const key of ["offsetWidth", "offsetHeight"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
});

describe("when the strip shows", () => {
  it("the strip shows only while the tab has a sub-terminal", () => {
    render(<SubTerminalStrip tabId="a" />);
    expect(screen.queryByRole("tablist")).toBeNull();

    addView("a", "tests");
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(entries()).toHaveLength(2);
  });
});

describe("entries", () => {
  it("the own entry is pinned, shows the tab label and has no close button", () => {
    addView("a", "tests");
    addView("a", "dev server");
    render(<SubTerminalStrip tabId="a" />);

    const [own] = entries();
    expect(own.textContent).toBe("api");
    expect(own.getAttribute("title")).toBe("api — /code/api");
    expect(within(own).queryByRole("button")).toBeNull();
    // Pinned: outside the part of the strip that scrolls.
    const scroller = document.querySelector("[data-sub-scroller]")!;
    expect(scroller.contains(own)).toBe(false);
    expect(entries().slice(1).every((e) => scroller.contains(e))).toBe(true);

    // Renaming the tab renames the entry.
    act(() => useTabStore.getState().renameTab("a", "backend"));
    expect(entries()[0].textContent).toBe("backend");
  });

  it("a sub-terminal entry shows its name and tooltip, never a command", () => {
    const id = addView("a", "dev server", "/work/api");
    render(<SubTerminalStrip tabId="a" />);

    const entry = entries()[1];
    expect(entry.textContent).toBe("dev server");
    expect(entry.getAttribute("title")).toBe("dev server — /work/api");
    // Once its shell reports a folder, the tooltip follows it.
    const paneId = tab("a").views[id].activePaneId;
    act(() => usePaneCwd.getState().setCwd(paneId, "/work/api/src"));
    expect(entries()[1].getAttribute("title")).toBe("dev server — /work/api/src");
    // Nothing on the strip but names and folders.
    const strip = screen.getByRole("tablist");
    expect(strip.textContent).toBe("apidev server");
  });
});

describe("showing", () => {
  it("showing a view focuses its active pane", async () => {
    withTerminals();
    // A sub-terminal split in two whose FIRST pane is active: seating both
    // panes must not hand the keyboard to the last one seated.
    const id = addView("a", "tests");
    const [first] = findAllPanes(tab("a").views[id].root);
    act(() => useTabStore.getState().splitPane("a", first.id, "horizontal"));
    const second = findAllPanes(tab("a").views[id].root)[1];
    act(() => useTabStore.getState().setActivePaneInTab("a", first.id));
    render(<TabScreen tabId="a" />);
    await settle();
    expect(focusedPane()).toBe("a1");

    // First show: the view's terminals don't exist yet.
    fireEvent.click(entries()[1]);
    await settle();
    expect(tab("a").shownView).toBe(id);
    expect(focusedPane()).toBe(first.id);
    expect(focusedPane()).not.toBe(second.id);

    fireEvent.click(entries()[0]);
    await settle();
    expect(focusedPane()).toBe("a1");

    // Shown again: its terminals exist, detached, and are seated again.
    fireEvent.click(entries()[1]);
    await settle();
    expect(focusedPane()).toBe(first.id);

    // The same on a split tab's own view: its active pane, not the last seated.
    fireEvent.click(entries()[0]);
    await settle();
    act(() => useTabStore.getState().splitPane("a", "a1", "vertical"));
    act(() => useTabStore.getState().setActivePaneInTab("a", "a1"));
    fireEvent.click(entries()[1]);
    await settle();
    fireEvent.click(entries()[0]);
    await settle();
    expect(focusedPane()).toBe("a1");
  });
});

describe("accessibility", () => {
  it("the strip is a tablist with a roving tabindex", () => {
    const v1 = addView("a", "tests");
    addView("a", "dev server");
    act(() => useTabStore.getState().showView("a", v1));
    render(<SubTerminalStrip tabId="a" />);

    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-label")).toBe("Terminals in api");
    const all = entries();
    expect(all.map((e) => e.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(all.map((e) => e.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(all.every((e) => e.getAttribute("aria-controls") === SUB_TERMINAL_CONTENT_ID)).toBe(true);
  });

  it("arrow, Home and End keys move focus without wrapping", async () => {
    withTerminals();
    addView("a", "one");
    addView("a", "two");
    render(<TabScreen tabId="a" />);
    await settle();
    const all = () => entries();

    act(() => all()[0].focus());
    fireEvent.keyDown(all()[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(all()[0]);
    fireEvent.keyDown(all()[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(all()[1]);
    expect(all()[1].getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(all()[1], { key: "End" });
    expect(document.activeElement).toBe(all()[2]);
    fireEvent.keyDown(all()[2], { key: "ArrowRight" });
    expect(document.activeElement).toBe(all()[2]);
    fireEvent.keyDown(all()[2], { key: "Home" });
    expect(document.activeElement).toBe(all()[0]);
    // Moving focus shows nothing, and focus stays on the strip.
    await settle();
    expect(tab("a").shownView).toBe("own");
    expect(document.activeElement).toBe(all()[0]);
    expect(focusedPane()).toBeNull();

    // When focus leaves the strip, the selected entry is the way back in.
    fireEvent.keyDown(all()[0], { key: "ArrowRight" });
    expect(all().map((e) => e.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    act(() => (document.activeElement as HTMLElement).blur());
    expect(all().map((e) => e.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("Enter on the selected entry moves focus into its terminal", async () => {
    withTerminals();
    addView("a", "one");
    render(<TabScreen tabId="a" />);
    await settle();

    // Nothing changes view, so no terminal is seated: only the strip can hand focus over.
    act(() => entries()[0].focus());
    expect(focusedPane()).toBeNull();
    fireEvent.keyDown(entries()[0], { key: "Enter" });
    await settle();
    expect(tab("a").shownView).toBe("own");
    expect(focusedPane()).toBe("a1");
  });

  it("Enter and Space show the focused entry", async () => {
    withTerminals();
    const v1 = addView("a", "one");
    const v2 = addView("a", "two");
    render(<TabScreen tabId="a" />);
    await settle();

    act(() => entries()[1].focus());
    fireEvent.keyDown(entries()[1], { key: "Enter" });
    await settle();
    expect(tab("a").shownView).toBe(v1);
    expect(focusedPane()).toBe(tab("a").views[v1].activePaneId);

    act(() => entries()[2].focus());
    fireEvent.keyDown(entries()[2], { key: " " });
    await settle();
    expect(tab("a").shownView).toBe(v2);
    expect(focusedPane()).toBe(tab("a").views[v2].activePaneId);
  });
});

describe("closing from the strip", () => {
  /** The request-close-view events sent while `fn` runs. */
  const closeRequests = (fn: () => void) => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("request-close-view", on);
    try { fn(); } finally { window.removeEventListener("request-close-view", on); }
    return seen;
  };

  it("a sub-terminal's × is labelled Close <name> and is out of the tab order", () => {
    const tests = addView("a", "tests");
    const dev = addView("a", "dev server");
    render(<SubTerminalStrip tabId="a" />);

    const close = screen.getByRole("button", { name: "Close tests" });
    expect(screen.getByRole("button", { name: "Close dev server" })).toBeTruthy();
    expect(close.getAttribute("tabindex")).toBe("-1");
    expect(within(entries()[1]).getByRole("button")).toBe(close);
    // The own entry has none.
    expect(within(entries()[0]).queryByRole("button")).toBeNull();

    // A click asks to close that sub-terminal and does not show it.
    expect(closeRequests(() => fireEvent.click(close))).toEqual([{ tabId: "a", viewId: tests }]);
    expect(tab("a").shownView).toBe("own");
    expect(closeRequests(() => fireEvent.click(screen.getByRole("button", { name: "Close dev server" }))))
      .toEqual([{ tabId: "a", viewId: dev }]);
  });

  it("after Delete closes an entry not in sight, focus moves to the entry on its left", async () => {
    addView("a", "one");
    addView("a", "two");
    function Closer() {
      useGuardedClose();
      return null;
    }
    render(<><Closer /><SubTerminalStrip tabId="a" /></>);

    // Shells not started yet: nothing runs, so Delete closes at once.
    act(() => entries()[2].focus());
    fireEvent.keyDown(entries()[2], { key: "Delete" });
    await settle();

    expect(entries().map((e) => e.textContent)).toEqual(["api", "one"]);
    expect(tab("a").shownView).toBe("own");
    expect(document.activeElement).toBe(entries()[1]);
  });

  it("Delete on an entry calls requestCloseView", () => {
    const tests = addView("a", "tests");
    render(<SubTerminalStrip tabId="a" />);

    act(() => entries()[1].focus());
    expect(closeRequests(() => fireEvent.keyDown(entries()[1], { key: "Delete" }))).toEqual([{ tabId: "a", viewId: tests }]);
    // The own entry closes with its tab, not from the strip.
    expect(closeRequests(() => fireEvent.keyDown(entries()[0], { key: "Delete" }))).toEqual([]);
  });
});

describe("the live announcement", () => {
  it("a background add is announced", () => {
    vi.useFakeTimers();
    render(<SubTerminalAnnouncer />);
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(live().textContent).toBe("");

    addView("b", "tests"); // a tab not in sight
    act(() => { vi.advanceTimersByTime(1000); });
    expect(live().textContent).toBe("Sub-terminal tests opened in web");

    addView("a", "dev server"); // the tab in sight, in the background
    act(() => { vi.advanceTimersByTime(1000); });
    expect(live().textContent).toBe("Sub-terminal dev server opened in api");
  });

  it("adds within one second are merged", () => {
    vi.useFakeTimers();
    render(<SubTerminalAnnouncer />);

    addView("a", "one");
    act(() => { vi.advanceTimersByTime(400); });
    addView("a", "two");
    act(() => { vi.advanceTimersByTime(400); });
    addView("a", "three");
    act(() => { vi.advanceTimersByTime(200); });
    expect(live().textContent).toBe("3 sub-terminals opened in api");

    // A later add starts a new announcement.
    act(() => { vi.advanceTimersByTime(1500); });
    addView("a", "four");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(live().textContent).toBe("Sub-terminal four opened in api");
  });

  it("the same announcement twice is made twice", () => {
    vi.useFakeTimers();
    render(<SubTerminalAnnouncer />);

    addView("a", "npm");
    act(() => { vi.advanceTimersByTime(1000); });
    const first = live().firstChild;
    expect(live().textContent).toBe("Sub-terminal npm opened in api");

    act(() => { vi.advanceTimersByTime(4000); });
    addView("a", "npm");
    act(() => { vi.advanceTimersByTime(1000); });
    // Same words, new content: a live region reads only what changes.
    expect(live().textContent).toBe("Sub-terminal npm opened in api");
    expect(live().firstChild).not.toBe(first);
  });

  it("an add with focus is not announced", () => {
    vi.useFakeTimers();
    render(<SubTerminalAnnouncer />);

    addView("b", "tests", null, true);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(live().textContent).toBe("");
  });
});

describe("the new flash", () => {
  it("a background add flashes once, and not under reduced motion", () => {
    render(<SubTerminalStrip tabId="a" />);

    const bg = addView("a", "tests");
    const flashing = () => entries().filter((e) => e.hasAttribute("data-flash")).map((e) => e.textContent);
    expect(flashing()).toEqual(["tests"]);
    expect(entries()[1].style.animation).toMatch(/1\.2s/);
    // Once: the flash ends with its animation and does not come back.
    fireEvent.animationEnd(entries()[1]);
    expect(flashing()).toEqual([]);
    act(() => useTabStore.getState().showView("a", bg));
    act(() => useTabStore.getState().showView("a", "own"));
    expect(flashing()).toEqual([]);

    // An add with focus does not flash.
    addView("a", "shown", null, true);
    expect(flashing()).toEqual([]);

    // Under reduced motion nothing flashes.
    reducedMotion = true;
    addView("a", "quiet");
    expect(flashing()).toEqual([]);
    expect(entries().every((e) => !e.style.animation)).toBe(true);
  });
});
