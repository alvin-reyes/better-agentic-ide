import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { peekFile, peekKind, unframe } from "../filePeek";

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
    await fresh.peekFile("/p/a.png", "image");
    expect(invoke).toHaveBeenLastCalledWith("peek_file", { path: "/p/a.png", kind: "image", known: undefined });

    // The postMessage fallback hands the bytes over as a JSON array.
    invoke.mockResolvedValueOnce(contractVector());
    const { peek } = await fresh.peekFile("/p/b.md", "text");
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
  });
});
