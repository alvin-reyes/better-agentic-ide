import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../docs/assets/css/site.css"), "utf8");

/** Every declaration block in the stylesheet, with its selector. */
function blocks(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    out.push({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  }
  return out;
}

/**
 * --term-bg is the terminal surface. It is deliberately dark in BOTH themes,
 * because it stands for a terminal, and so it is the one background token with
 * no light-mode override. --text flips: near-white on dark, near-black on light.
 *
 * Pairing them paints near-black on near-black the moment someone switches to
 * light mode. That shipped: the inline code chips in the feature cards
 * (.claude/agents/, CLAUDE.md, /BMad:tasks:) rendered at a contrast ratio of
 * 1.0, which is invisible rather than merely hard to read.
 *
 * Code chips elsewhere already use --code-bg, which does have a light value.
 */
describe("text is never painted on the terminal surface in a theme-flipping colour", () => {
  it("has no rule setting background var(--term-bg) with color var(--text)", () => {
    const bad = blocks().filter(
      (b) => /background[^;]*var\(--term-bg\)/.test(b.body) && /(^|[^-])color:\s*var\(--text\)\s*[;}]/.test(b.body),
    );
    expect(bad.map((b) => b.selector)).toEqual([]);
  });

  it("still defines --term-bg once, with no light-mode override, which is why the rule above matters", () => {
    const defs = css.match(/--term-bg:/g) ?? [];
    expect(defs.length).toBe(1);
  });

  it("gives --code-bg a value in both themes, so code chips have a safe background", () => {
    const defs = css.match(/--code-bg:/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(2);
  });
});
