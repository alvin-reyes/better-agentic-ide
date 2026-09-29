import { describe, it, expect } from "vitest";
import { compactText, estimateTokens, stripAnsi } from "../compactText";

describe("compactText", () => {
  it("strips colors, hyperlinks and titles", () => {
    expect(stripAnsi("\x1b[1;31merror\x1b[0m: \x1b]8;;http://x\x07link\x1b]8;;\x07")).toBe("error: link");
  });

  it("keeps only the last state of a redrawn progress line", () => {
    const r = compactText("Downloading  10%\rDownloading  55%\rDownloading 100%\ndone");
    expect(r.text).toBe("Downloading 100%\ndone");
  });

  it("collapses repeated lines and lines that only differ in numbers", () => {
    const log = ["compiling", ...Array.from({ length: 50 }, (_, i) => `  fetched chunk ${i} of 50`), "ok"].join("\n");
    expect(compactText(log).text).toBe("compiling\n  fetched chunk 49 of 50 [×50]\nok");
    expect(compactText("a\na\na\nb").text).toBe("a [×3]\nb");
  });

  it("never merges errors that differ only in a number", () => {
    const r = compactText("src/a.ts:12 error: x\nsrc/a.ts:40 error: x");
    expect(r.text.split("\n")).toHaveLength(2);
  });

  it("squeezes blank runs and trims trailing spaces", () => {
    expect(compactText("a   \n\n\n\nb\n\n").text).toBe("a\n\nb");
  });

  it("keeps the head, the tail and errors from a long middle", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${String.fromCharCode(97 + (i % 26))}${i % 7}`);
    lines[500] = "FATAL: disk quota exceeded";
    const r = compactText(lines.join("\n"), { maxLines: 300, head: 60, tail: 160 });
    const out = r.text.split("\n");
    expect(out[0]).toBe(lines[0]);
    expect(out[out.length - 1]).toBe(lines[999]);
    expect(r.text).toContain("FATAL: disk quota exceeded");
    expect(r.text).toMatch(/… \d+ lines omitted; 1 lines with errors or warnings kept below …/);
    expect(r.after).toBeLessThan(r.before / 3);
  });

  it("leaves short clean text alone", () => {
    const prose = "Please refactor the parser.\n\nKeep the public API the same.";
    expect(compactText(prose).text).toBe(prose);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
