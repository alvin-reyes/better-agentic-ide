import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { formatModified, formatSize, peekContent, peekFile, peekKind, PeekCache, placeCard, stripAnsi, unframe, type PeekEntry } from "../filePeek";

const REPO = resolve(__dirname, "../../..");

/** The `hex` block of the contract file, as bytes: the vector Rust's `frame` is tested against. */
function contractVector(): number[] {
  const doc = readFileSync(resolve(REPO, ".ade/context/file-peek.md"), "utf8");
  const block = doc.split("```hex")[1]?.split("```")[0];
  if (!block) throw new Error("no ```hex block in file-peek.md");
  return block.trim().split(/\s+/).map((h) => parseInt(h, 16));
}

const HEADER = {
  size: 2,
  modifiedMs: -1500,
  stamp: "2:-1500000000:-1500000000:66306:42",
  body: { type: "text", text: "é", truncated: false },
};

describe("unframe", () => {
  it("unframe reads the contract vector in every IPC shape", () => {
    const vector = contractVector();
    expect(vector.length).toBe(4 + 127);
    const withPayload = [...vector, 0x00, 0xff, 0x7f];

    for (const [bytes, payload] of [[vector, []], [withPayload, [0x00, 0xff, 0x7f]]] as const) {
      const shapes: [string, ArrayBuffer | Uint8Array | number[]][] = [
        ["ArrayBuffer", new Uint8Array(bytes).buffer],
        ["Uint8Array", new Uint8Array(bytes)],
        ["number[]", [...bytes]],
      ];
      // A view into the middle of a larger buffer, padded on both sides.
      const padded = new Uint8Array(bytes.length + 7);
      padded.fill(0x41);
      padded.set(bytes, 3);
      const view = new Uint8Array(padded.buffer, 3, bytes.length);
      expect(view.byteLength).toBeLessThan(view.buffer.byteLength);
      shapes.push(["offset view", view]);

      for (const [shape, raw] of shapes) {
        const { peek, payload: got } = unframe(raw);
        expect(peek, shape).toEqual(HEADER);
        expect([...got], shape).toEqual(payload);
      }
    }

    expect(() => unframe(new Uint8Array([0, 0, 0]))).toThrow();
    expect(() => unframe([0, 0, 0, 9, 0x7b, 0x7d])).toThrow();
    expect(() => unframe(new Uint8Array(vector.slice(0, 100)))).toThrow();
    const notJson = [0, 0, 0, 3, 0x61, 0x62, 0x63];
    expect(() => unframe(notJson)).toThrow();
  });
});

describe("peekKind", () => {
  it("peekKind follows viewerKind", () => {
    for (const p of ["/a/README.md", "/a/src/App.ts", "/a/docker/Dockerfile"]) expect(peekKind(p), p).toBe("text");
    for (const p of ["/a/shot.png", "/a/logo.svg", "/a/favicon.ico"]) expect(peekKind(p), p).toBe("image");
    expect(peekKind("/a/report.pdf")).toBe("pdf");
    expect(peekKind("/a/index.html")).toBe("html");
    expect(peekKind("/a/old.htm")).toBe("html");
    expect(peekKind("/a/spec.docx")).toBe("meta");
  });
});

describe("peekFile", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(new Uint8Array(contractVector()).buffer);
  });

  it("one literal call site", async () => {
    const { peek } = await peekFile("/p/a.md", "text", "1:2");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("peek_file", { path: "/p/a.md", kind: "text", known: "1:2" });
    expect(peek).toEqual(HEADER);

    const source = readFileSync(resolve(REPO, "src/lib/filePeek.ts"), "utf8");
    expect(source.match(/invoke\s*(<[^>]*>)?\s*\(\s*["'`]peek_file/g)).toHaveLength(1);
    expect(source).toContain('invoke<ArrayBuffer>("peek_file", { path, kind, known })');
  });

  it("stops asking for bytes after the IPC fallback", async () => {
    vi.resetModules();
    const fresh = await import("../filePeek");
    // ArrayBuffer answers (the normal path) never switch byte kinds off,
    // however many arrive.
    await fresh.peekFile("/p/a.png", "image");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/a.png", kind: "image", known: undefined });
    await fresh.peekFile("/p/r.pdf", "pdf");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/r.pdf", kind: "pdf", known: undefined });
    await fresh.peekFile("/p/b.md", "text");
    await fresh.peekFile("/p/a.png", "image");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/a.png", kind: "image", known: undefined });
    await fresh.peekFile("/p/r.pdf", "pdf");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/r.pdf", kind: "pdf", known: undefined });

    // The postMessage fallback hands the bytes over as a JSON array.
    // The call that meets it still asked for the bytes; only later ones switch.
    invoke.mockResolvedValueOnce(contractVector());
    const { peek } = await fresh.peekFile("/p/c.png", "image");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/c.png", kind: "image", known: undefined });
    expect(peek).toEqual(HEADER);

    await fresh.peekFile("/p/a.png", "image");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/a.png", kind: "meta", known: undefined });
    await fresh.peekFile("/p/r.pdf", "pdf", "s");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/r.pdf", kind: "meta", known: "s" });
    await fresh.peekFile("/p/b.md", "text");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/b.md", kind: "text", known: undefined });
    await fresh.peekFile("/p/i.html", "html");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/i.html", kind: "html", known: undefined });

    vi.resetModules();
    const again = await import("../filePeek");
    await again.peekFile("/p/a.png", "image");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/a.png", kind: "image", known: undefined });
    await again.peekFile("/p/r.pdf", "pdf");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/r.pdf", kind: "pdf", known: undefined });
  });
});

describe("card formats", () => {
  it("formats size and modified time", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(999)).toBe("999 B");
    expect(formatSize(1000)).toBe("1.0 KB");
    expect(formatSize(12_345)).toBe("12.3 KB");
    expect(formatSize(999_999)).toBe("1.0 MB");
    expect(formatSize(4_100_000)).toBe("4.1 MB");
    expect(formatSize(10_000_000)).toBe("10.0 MB");
    expect(formatSize(1_234_567_890)).toBe("1.2 GB");

    const now = new Date(2026, 9, 29, 12, 0, 0).getTime();
    expect(formatModified(now, now)).toBe("just now");
    expect(formatModified(now - 59_999, now)).toBe("just now");
    expect(formatModified(now - 60_000, now)).toBe("1 min ago");
    expect(formatModified(now - 3 * 60_000 - 5_000, now)).toBe("3 min ago");
    expect(formatModified(now - 3_599_999, now)).toBe("59 min ago");
    expect(formatModified(now - 3_600_000, now)).toBe("1 h ago");
    expect(formatModified(now - 86_399_999, now)).toBe("23 h ago");
    // From 24 hours on: the local date.
    expect(formatModified(now - 86_400_000, now)).toBe("2026-10-28");
    expect(formatModified(new Date(2024, 0, 5, 23, 59).getTime(), now)).toBe("2024-01-05");
    // A file from the future (clock skew) was modified "just now".
    expect(formatModified(now + 3_600_000, now)).toBe("just now");
    // Before 1970: negative, still a date.
    const old = new Date(1969, 11, 25, 12, 0, 0).getTime();
    expect(old).toBeLessThan(0);
    expect(formatModified(old, now)).toBe("1969-12-25");
    // No mtime on this platform: no date at all.
    expect(formatModified(null, now)).toBeNull();
  });
});

describe("placeCard", () => {
  // The card's largest size is 320 x 340, with a 12 px gap and an 8 px margin.
  const viewport = { width: 1200, height: 800 };

  it("places the card inside the window", () => {
    // Open space: right of and below the pointer.
    expect(placeCard({ x: 100, y: 100 }, viewport)).toEqual({ left: 112, top: 112 });
    // Exactly fits on the right (100 + 12 + 320 = 432 <= 440 - 8).
    expect(placeCard({ x: 100, y: 100 }, { width: 440, height: 800 })).toEqual({ left: 112, top: 112 });
    // Four pixels short of the margin: it doesn't fit there, nor to the left.
    expect(placeCard({ x: 100, y: 100 }, { width: 436, height: 800 })).toEqual({ left: 8, top: 112 });
    expect(placeCard({ x: 100, y: 100 }, { width: 1200, height: 456 })).toEqual({ left: 112, top: 8 });
    // Near the right edge: anchored by `right`, to the pointer's left.
    expect(placeCard({ x: 1000, y: 100 }, viewport)).toEqual({ right: 1200 - 988, top: 112 });
    // Near the bottom edge: anchored by `bottom`, above the pointer.
    expect(placeCard({ x: 100, y: 600 }, viewport)).toEqual({ left: 112, bottom: 800 - 588 });
    // Bottom-right corner: both.
    expect(placeCard({ x: 1150, y: 780 }, viewport)).toEqual({ right: 1200 - 1138, bottom: 800 - 768 });
    // A window smaller than the card: pinned to the margin.
    expect(placeCard({ x: 150, y: 150 }, { width: 300, height: 300 })).toEqual({ left: 8, top: 8 });
    // Neither side fits horizontally, the bottom does.
    expect(placeCard({ x: 250, y: 600 }, { width: 500, height: 800 })).toEqual({ left: 8, bottom: 800 - 588 });
  });
});

describe("PeekCache", () => {
  const text = (t: string, stamp = "s"): PeekEntry => ({ stamp, size: t.length, modifiedMs: 0, content: { type: "text", text: t, truncated: false } });

  it("cache is bounded and LRU", () => {
    const cache = new PeekCache();
    for (let i = 0; i < 32; i++) cache.set(`/f${i}`, text(`file ${i}`));
    expect(cache.size).toBe(32);
    // Reading /f0 makes it the most recent, so /f1 is the oldest now.
    expect(cache.get("/f0")?.content).toEqual({ type: "text", text: "file 0", truncated: false });
    cache.set("/f32", text("file 32"));
    expect(cache.size).toBe(32);
    expect(cache.get("/f1")).toBeUndefined();
    expect(cache.get("/f0")).toBeDefined();
    expect(cache.get("/f32")).toBeDefined();
    // Setting an existing path replaces it, it does not add one.
    cache.set("/f0", text("again", "s2"));
    expect(cache.size).toBe(32);
    expect(cache.get("/f0")?.stamp).toBe("s2");

    // Weight: text counts 2 bytes per UTF-16 code unit, against 32 MB.
    const weighed = new PeekCache();
    const eightMillion = "x".repeat(8_000_000); // 16 MB
    weighed.set("/a", text(eightMillion));
    weighed.set("/b", text(eightMillion));
    expect(weighed.size).toBe(2); // exactly 32 MB fits
    expect(weighed.get("/a")).toBeDefined(); // /b is now the oldest
    weighed.set("/c", text("y"));
    expect(weighed.get("/b")).toBeUndefined();
    expect(weighed.get("/a")).toBeDefined();
    expect(weighed.get("/c")).toBeDefined();
    weighed.delete("/c");
    expect(weighed.get("/c")).toBeUndefined();
    expect(weighed.size).toBe(1);
  });
});

describe("PeekCache with images", () => {
  const image = (stamp: string): PeekEntry => ({
    stamp,
    size: 10_000_000,
    modifiedMs: 0,
    content: { type: "image", blob: new Blob([new Uint8Array(10_000_000)], { type: "image/png" }), width: 640, height: 480 },
  });
  const text = (t: string): PeekEntry => ({ stamp: "t", size: t.length, modifiedMs: 0, content: { type: "text", text: t, truncated: false } });

  it("cache counts image bytes", () => {
    // Three 10 MB images fit the 32 MB budget; a fourth evicts the oldest.
    const cache = new PeekCache();
    for (const n of [1, 2, 3, 4]) cache.set(`/i${n}.png`, image(`s${n}`));
    expect(cache.size).toBe(3);
    expect(cache.get("/i1.png")).toBeUndefined();
    for (const n of [2, 3, 4]) expect(cache.get(`/i${n}.png`)?.stamp).toBe(`s${n}`);

    // An image weighs its Blob's size: 30 MB of images and 2 MB of text is exactly the budget.
    cache.set("/t", text("x".repeat(1_000_000)));
    expect(cache.size).toBe(4);
    cache.set("/t", text("x".repeat(1_000_001)));
    expect(cache.get("/i2.png")).toBeUndefined();
    expect(cache.size).toBe(3);
    // Deleting an image gives its weight back.
    cache.delete("/i3.png");
    cache.set("/i5.png", image("s5"));
    expect(cache.size).toBe(3);
  });
});

describe("peekContent", () => {
  it("only an image kind's bytes become an image", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const bytes = { type: "bytes", length: 3, width: 2, height: 1 } as const;
    expect(peekContent("/a/shot.png", bytes, payload)).toMatchObject({ type: "image", width: 2, height: 1 });
    expect((peekContent("/a/logo.SVG", { type: "bytes", length: 3 }, payload) as { blob: Blob }).blob.type).toBe("image/svg+xml");
    // Story 4 sends PDF bytes: they are not an image.
    expect(peekContent("/a/report.pdf", bytes, payload)).toBeUndefined();
    expect(peekContent("/a/notes.txt", bytes, payload)).toBeUndefined();
    const text = { type: "text", text: "hi", truncated: false } as const;
    expect(peekContent("/a/notes.txt", text, payload)).toBe(text);
    for (const body of [{ type: "binary" }, { type: "none" }, { type: "unchanged" }, { type: "tooLarge", limit: 1 }] as const) {
      expect(peekContent("/a/shot.png", body, payload)).toBeUndefined();
    }
  });
});

describe("stripAnsi", () => {
  it("ANSI escapes are stripped", () => {
    // CSI: colors, cursor moves, erase, private modes.
    expect(stripAnsi("\x1b[1;31merror\x1b[0m: bad")).toBe("error: bad");
    expect(stripAnsi("a\x1b[2Kb\x1b[10;20Hc\x1b[?25ld")).toBe("abcd");
    // OSC: a title ended by BEL, a hyperlink ended by ST.
    expect(stripAnsi("\x1b]0;my title\x07after")).toBe("after");
    expect(stripAnsi("\x1b]8;;https://x.dev\x1b\\link\x1b]8;;\x1b\\ done")).toBe("link done");
    // Tabs and newlines stay.
    expect(stripAnsi("\tcol\x1b[32m1\x1b[0m\n\tcol2\n")).toBe("\tcol1\n\tcol2\n");
    expect(stripAnsi("plain text")).toBe("plain text");
    // Two- and three-byte escapes: charset (`tput sgr0` ends with ESC ( B),
    // save/restore cursor, keypad modes.
    expect(stripAnsi("a\x1b(Bb\x1b7c\x1b8d\x1b=e\x1b>f")).toBe("abcdef");
    // DCS ... ST, and the 8-bit CSI.
    expect(stripAnsi("x\x1bP1$r0m\x1b\\y")).toBe("xy");
    expect(stripAnsi("\x9b31mred\x9b0m")).toBe("red");
    // An OSC cut off by the read: everything after it goes.
    expect(stripAnsi("before\x1b]0;a title that never\nends")).toBe("before");
  });
});
