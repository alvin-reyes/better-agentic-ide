import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import FileHoverCard from "../FileHoverCard";
import { useFileHoverStore } from "../../stores/fileHoverStore";
import { placeCard } from "../../lib/filePeek";
import type { HoverCard, HoverContent } from "../../lib/hoverPreview";

const ABS = "/proj/src/components/App.tsx";

function ready(body: HoverContent["body"], extra: Partial<HoverCard> = {}): HoverCard {
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

describe("FileHoverCard images", () => {
  // jsdom has no object URLs: stub both, numbering the URLs made.
  const createObjectURL = vi.fn((_blob: Blob) => `blob:test/${createObjectURL.mock.calls.length}`);
  const revokeObjectURL = vi.fn((_url: string) => {});
  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });
  afterEach(() => {
    // Unmount while the stubs are still there: the card revokes on the way out.
    act(() => useFileHoverStore.getState().hide());
    cleanup();
    const url = URL as unknown as Record<string, unknown>;
    delete url.createObjectURL;
    delete url.revokeObjectURL;
  });

  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

  it("image thumbnail", () => {
    const card = showCard(ready({ type: "image", blob: png, width: 1920, height: 1080 }));
    const imgs = card.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    const img = imgs[0];
    expect(img.getAttribute("src")).toBe("blob:test/1");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.style.objectFit).toBe("contain");
    const box = img.parentElement as HTMLElement;
    expect([box.style.width, box.style.height]).toEqual(["294px", "200px"]);
    // The checkerboard behind it: the one fixed color in the card.
    expect(box.getAttribute("style")).toContain("linear-gradient(45deg, #d0d0d0 25%, transparent 25%)");
    expect(box.style.backgroundSize).toBe("16px 16px");
    expect(within(card).getByText("12.3 KB · modified 3 min ago · 1920 × 1080")).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(png);

    // Re-rendered with the same Blob (a new card object): no second URL.
    act(() => useFileHoverStore.getState().show(ready({ type: "image", blob: png, width: 1920, height: 1080 }, { point: { x: 300, y: 200 } })));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("tooltip").querySelector("img")?.getAttribute("src")).toBe("blob:test/1");

    // Another Blob: the old URL goes, a new one is made.
    const other = new Blob([new Uint8Array([1])], { type: "image/png" });
    act(() => useFileHoverStore.getState().show(ready({ type: "image", blob: other, width: 2, height: 2 })));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("tooltip").querySelector("img")?.getAttribute("src")).toBe("blob:test/2");

    // Unmounting the card revokes its URL.
    act(() => useFileHoverStore.getState().hide());
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:test/2");
  });

  it("a revoked URL is never on screen", () => {
    // At each revoke, the card must not be showing the URL being revoked.
    const onScreen: (string | null | undefined)[] = [];
    revokeObjectURL.mockImplementation((url: string) => {
      const src = document.querySelector("[role=tooltip] img")?.getAttribute("src");
      if (src === url) onScreen.push(src);
    });
    showCard(ready({ type: "image", blob: png, width: 4, height: 4 }));
    for (let i = 0; i < 3; i++) {
      const next = new Blob([new Uint8Array([i])], { type: "image/png" });
      act(() => useFileHoverStore.getState().show(ready({ type: "image", blob: next, width: 4, height: 4 })));
      expect(screen.getByRole("tooltip").querySelector("img")?.getAttribute("src")).toBe(`blob:test/${i + 2}`);
    }
    act(() => useFileHoverStore.getState().hide());
    expect(revokeObjectURL).toHaveBeenCalledTimes(4);
    expect(onScreen).toEqual([]);
    revokeObjectURL.mockImplementation(() => {});
  });

  it("the size shows only when both sides are known", () => {
    const card = showCard(ready({ type: "image", blob: png, width: 5 }));
    expect(within(card).getByText("12.3 KB · modified 3 min ago")).toBeTruthy();
    expect(card.textContent).not.toContain("×");
  });

  it("an image that fails to decode says so", () => {
    let card = showCard(ready({ type: "image", blob: png, width: 4, height: 4 }));
    fireEvent.error(card.querySelector("img") as HTMLImageElement);
    card = screen.getByRole("tooltip");
    expect(within(card).getByText("Can't preview this image")).toBeTruthy();
    expect(card.querySelector("img")).toBeNull();
    // Another image is tried afresh.
    const next = new Blob([new Uint8Array([7])], { type: "image/png" });
    act(() => useFileHoverStore.getState().show(ready({ type: "image", blob: next, width: 4, height: 4 })));
    card = screen.getByRole("tooltip");
    expect(card.querySelector("img")).not.toBeNull();
    expect(within(card).queryByText("Can't preview this image")).toBeNull();
  });

  it("svg is only ever an img", () => {
    const scripts = document.querySelectorAll("script").length;
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><script>window.pwned = 1</script><rect width="9" height="9"/></svg>';
    const blob = new Blob([markup], { type: "image/svg+xml" });
    const card = showCard({ ...ready({ type: "image", blob }), abs: "/proj/logo.svg" });
    const imgs = card.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toMatch(/^blob:/);
    expect(card.querySelector("svg")).toBeNull();
    expect(document.querySelectorAll("script")).toHaveLength(scripts);
    expect(card.textContent).not.toContain("pwned");
    // No size is known for an SVG: the detail line has none.
    expect(within(card).getByText("12.3 KB · modified 3 min ago")).toBeTruthy();
  });

  it("images that are not decoded say why", () => {
    const cases: [HoverContent["body"], string][] = [
      [{ type: "skipped", reason: "pixels", width: 30000, height: 30000 }, "Too large to preview (30000 × 30000)"],
      [{ type: "skipped", reason: "noSize" }, "Can't read image size"],
      [{ type: "skipped", reason: "svgFeatures" }, "SVG not previewed"],
      [{ type: "tooLarge", limit: 10_000_000 }, "Too large to preview (over 10.0 MB)"],
      [{ type: "tooLarge", limit: 1_000_000 }, "Too large to preview (over 1.0 MB)"],
    ];
    for (const [body, message] of cases) {
      const card = showCard(ready(body));
      expect(within(card).getByText(message)).toBeTruthy();
      expect(within(card).getByText("12.3 KB · modified 3 min ago")).toBeTruthy();
      expect(card.querySelector("img")).toBeNull();
      cleanup();
    }
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
