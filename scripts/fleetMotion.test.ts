import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A running fleet lane is told apart by a pulsing open end, not by color
 * (ADR 0007). The pulse must stop for anyone who asked for reduced motion,
 * and a selectable lane bar, a native button, must show where focus is.
 */
const CSS = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");

/** The body of every `@media (prefers-reduced-motion: reduce)` block. */
function reducedMotionBlocks(css: string): string[] {
  const blocks: string[] = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

/** The declarations of the first top-level rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[2] : null;
}

describe("fleet lane motion and focus", () => {
  it("the live edge stops under reduced motion and bars show focus", () => {
    const edge = rule(CSS, ".fleet-live-edge");
    expect(edge, ".fleet-live-edge rule").not.toBeNull();
    expect(edge).toMatch(/animation:\s*fleet-pulse\b/);
    expect(CSS).toMatch(/@keyframes\s+fleet-pulse\s*\{/);

    const reduced = reducedMotionBlocks(CSS).map((b) => rule(b, ".fleet-live-edge")).find(Boolean);
    expect(reduced, "no .fleet-live-edge rule under prefers-reduced-motion: reduce").toBeTruthy();
    expect(reduced).toMatch(/animation:\s*none/);

    const focus = rule(CSS, ".fleet-lane-bar:focus-visible");
    expect(focus, ".fleet-lane-bar:focus-visible rule").not.toBeNull();
    expect(focus).toMatch(/outline:\s*2px solid var\(--text-primary\)/);
    expect(focus).toMatch(/outline-offset:\s*1px/);
  });
});
