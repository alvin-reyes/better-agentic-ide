import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Scratchpad is a drawer, not a modal: `close()` sets isOpen to false and
 * the component returns null, but it stays mounted. Anything cleaned up only on
 * unmount therefore never gets cleaned up in normal use — the app has to quit
 * first.
 *
 * Two things rely on that distinction, and both were wrong.
 */
const SRC = readFileSync(resolve(__dirname, "../Scratchpad.tsx"), "utf8");

describe("Scratchpad lifecycle", () => {
  it("stays mounted when closed, which is why the rest of this matters", () => {
    expect(SRC).toContain("if (!isOpen) return null;");
  });

  it("stops dictation when the drawer closes, not only on unmount", () => {
    // Otherwise the microphone stays open with the control to stop it hidden,
    // and the only way back to it is reopening the panel.
    expect(SRC).toMatch(/if \(!isOpen && isListening\)/);
    expect(SRC).toMatch(/recognitionRef\.current\?\.stop\(\)/);
    // The unmount abort stays: it covers the app actually going away.
    expect(SRC).toContain("recognitionRef.current?.abort()");
  });

  it("flushes the draft on the way out rather than only after the debounce", () => {
    // The draft is written 400ms after the last keystroke, so a quit inside
    // that window would lose it — against the claim that drafts survive a crash.
    expect(SRC).toContain('window.addEventListener("pagehide"');
    expect(SRC).toContain('document.addEventListener("visibilitychange"');
    const flush = /const flush = \(\) => \{[\s\S]*?localStorage\.setItem\(DRAFT_KEY/;
    expect(SRC, "the flush must write the draft, not just listen").toMatch(flush);
  });
});
