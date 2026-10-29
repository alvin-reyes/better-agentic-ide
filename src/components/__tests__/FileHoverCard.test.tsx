import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import FileHoverCard from "../FileHoverCard";
import { useFileHoverStore } from "../../stores/fileHoverStore";
import { placeCard, type PeekBody } from "../../lib/filePeek";
import type { HoverCard } from "../../lib/hoverPreview";

const ABS = "/proj/src/components/App.tsx";

function ready(body: PeekBody, extra: Partial<HoverCard> = {}): HoverCard {
  return {
    abs: ABS,
    point: { x: 100, y: 100 },
    state: "ready",
    content: { size: 12_345, modifiedMs: Date.now() - 3 * 60_000 - 1000, body },
    ...extra,
  };
}

function showCard(card: HoverCard) {
  render(<FileHoverCard />);
  act(() => useFileHoverStore.getState().show(card));
  return screen.getByRole("tooltip");
}

const lines = (card: HTMLElement) => Array.from(within(card).getByTestId("hover-text").children).map((l) => l.textContent);
const text = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

afterEach(() => {
  act(() => useFileHoverStore.getState().hide());
  cleanup();
});

describe("FileHoverCard", () => {
  it("renders text and details as text", () => {
    // Name, detail line, and at most 16 lines, then "…".
    let card = showCard(ready({ type: "text", text: text(20), truncated: false }));
    expect(within(card).getByText("App.tsx")).toBeTruthy();
    expect(within(card).getByText("12.3 KB · modified 3 min ago")).toBeTruthy();
    expect(lines(card)).toEqual(text(16).split("\n"));
    expect(within(card).getByText("…")).toBeTruthy();
    cleanup();

    // Few lines, but the read was cut short: still "…".
    card = showCard(ready({ type: "text", text: text(3), truncated: true }));
    expect(lines(card)).toEqual(["line 1", "line 2", "line 3"]);
    expect(within(card).queryByText("…")).toBeTruthy();
    cleanup();

    // Exactly 16 lines with a final newline, whole: no "…".
    card = showCard(ready({ type: "text", text: text(16) + "\n", truncated: false }));
    expect(lines(card)).toHaveLength(16);
    expect(within(card).queryByText("…")).toBeNull();
    cleanup();

    // ANSI escapes are not shown.
    card = showCard(ready({ type: "text", text: "\x1b[1;31merror\x1b[0m: failed\n\x1b]0;title\x07done", truncated: false }));
    expect(lines(card)).toEqual(["error: failed", "done"]);
    expect(card.textContent).not.toContain("\x1b");
    cleanup();

    // Markup in a file is text, never elements.
    card = showCard(ready({ type: "text", text: '<img src=x onerror=alert(1)>\n<b>bold</b>', truncated: false }));
    expect(lines(card)).toEqual(["<img src=x onerror=alert(1)>", "<b>bold</b>"]);
    expect(document.querySelector("img")).toBeNull();
    expect(card.querySelector("b")).toBeNull();
    cleanup();

    card = showCard(ready({ type: "text", text: "", truncated: false }));
    expect(within(card).getByText("Empty file")).toBeTruthy();
    cleanup();

    card = showCard(ready({ type: "binary" }));
    expect(within(card).getByText("Binary file")).toBeTruthy();
    expect(within(card).getByText("12.3 KB · modified 3 min ago")).toBeTruthy();
    cleanup();

    // `none` (details only), with no mtime: the date is left out.
    card = showCard({ abs: ABS, point: { x: 1, y: 1 }, state: "ready", content: { size: 999, modifiedMs: null, body: { type: "none" } } });
    expect(within(card).getByText("App.tsx")).toBeTruthy();
    expect(within(card).getByText("999 B")).toBeTruthy();
    expect(within(card).queryByTestId("hover-text")).toBeNull();
    expect(card.children).toHaveLength(2);
    cleanup();

    card = showCard({ abs: ABS, point: { x: 1, y: 1 }, state: "error", error: "permission denied" });
    expect(within(card).getByText("App.tsx")).toBeTruthy();
    expect(within(card).getByText("Can't preview: permission denied")).toBeTruthy();
    expect(within(card).queryByTestId("hover-text")).toBeNull();
    cleanup();

    card = showCard({ abs: ABS, point: { x: 1, y: 1 }, state: "loading" });
    expect(within(card).getByText("App.tsx")).toBeTruthy();
    expect(within(card).getByText("Loading…")).toBeTruthy();
  });

  it("never takes focus and sits where placeCard says", () => {
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    render(<FileHoverCard />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    for (const point of [{ x: 100, y: 100 }, { x: 1000, y: 700 }]) {
      act(() => useFileHoverStore.getState().show(ready({ type: "text", text: text(20), truncated: true }, { point })));
      const card = screen.getByRole("tooltip");
      expect(document.activeElement).toBe(input);
      expect(card.style.pointerEvents).toBe("none");
      expect(card.style.position).toBe("fixed");
      expect(card.parentElement).toBe(document.body);
      for (const el of [card, ...Array.from(card.querySelectorAll("*"))]) {
        const tabindex = el.getAttribute("tabindex");
        if (tabindex !== null) expect(tabindex).toBe("-1");
      }

      const want = placeCard(point, { width: window.innerWidth, height: window.innerHeight });
      for (const side of ["left", "top", "right", "bottom"] as const) {
        expect(card.style[side], side).toBe(want[side] === undefined ? "" : `${want[side]}px`);
      }

      // Colors come from the theme only.
      let colored = 0;
      for (const el of [card, ...Array.from(card.querySelectorAll<HTMLElement>("*"))]) {
        for (const decl of (el.getAttribute("style") ?? "").split(";")) {
          const [prop, ...rest] = decl.split(":");
          const value = rest.join(":").trim();
          if (!/^\s*(color|background(-color)?|border(-\w+)?|box-shadow|outline)\s*$/.test(prop ?? "")) continue;
          if (/radius|width|style/.test(prop)) continue;
          colored++;
          expect(value, `${el.tagName} ${prop}`).toMatch(/var\(--/);
          expect(value, `${el.tagName} ${prop}`).not.toMatch(/#|rgb|hsl/);
        }
      }
      expect(colored).toBeGreaterThan(4);
    }
    act(() => useFileHoverStore.getState().hide());
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
