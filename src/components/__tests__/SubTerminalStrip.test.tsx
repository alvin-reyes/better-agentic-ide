import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), Channel: class { onmessage: unknown = null; } }));
const term = vi.hoisted(() => ({ focusActiveTerminal: vi.fn(() => true), shownAtFocus: [] as string[] }));
vi.mock("../../hooks/useTerminal", () => ({ focusActiveTerminal: term.focusActiveTerminal }));

import SubTerminalStrip, { SubTerminalAnnouncer, SUB_TERMINAL_CONTENT_ID } from "../SubTerminalStrip";
import { useTabStore, ownViewOnly, type Tab, type PaneNode } from "../../stores/tabStore";
import { usePaneCwd } from "../../stores/paneMetaStore";

const leaf = (id: string): PaneNode => ({ type: "pane", pane: { id, ptyId: 1 } });
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

let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion,
    media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  term.focusActiveTerminal.mockClear();
  term.focusActiveTerminal.mockImplementation(() => {
    const { tabs, activeTabId } = useTabStore.getState();
    term.shownAtFocus.push(tabs.find((t) => t.id === activeTabId)!.shownView);
    return true;
  });
  term.shownAtFocus.length = 0;
  usePaneCwd.setState({ cwds: { a1: "/code/api", b1: "/code/web" } });
  useTabStore.setState({ tabs: [terminalTab("a", "a1"), terminalTab("b", "b1")], activeTabId: "a", closedTabs: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
  it("showing a view focuses its active pane", () => {
    const id = addView("a", "tests");
    render(<SubTerminalStrip tabId="a" />);

    fireEvent.click(entries()[1]);
    expect(tab("a").shownView).toBe(id);
    expect(term.focusActiveTerminal).toHaveBeenCalledTimes(1);
    // It focused once the view was in sight.
    expect(term.shownAtFocus).toEqual([id]);

    fireEvent.click(entries()[0]);
    expect(tab("a").shownView).toBe("own");
    expect(term.shownAtFocus).toEqual([id, "own"]);
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

  it("arrow, Home and End keys move focus without wrapping", () => {
    addView("a", "one");
    addView("a", "two");
    render(<SubTerminalStrip tabId="a" />);
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
    // Moving focus shows nothing.
    expect(tab("a").shownView).toBe("own");
    expect(term.focusActiveTerminal).not.toHaveBeenCalled();
  });

  it("Enter and Space show the focused entry", () => {
    const v1 = addView("a", "one");
    const v2 = addView("a", "two");
    render(<SubTerminalStrip tabId="a" />);

    act(() => entries()[1].focus());
    fireEvent.keyDown(entries()[1], { key: "Enter" });
    expect(tab("a").shownView).toBe(v1);
    expect(term.shownAtFocus).toEqual([v1]);

    act(() => entries()[2].focus());
    fireEvent.keyDown(entries()[2], { key: " " });
    expect(tab("a").shownView).toBe(v2);
    expect(term.shownAtFocus).toEqual([v1, v2]);
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
