import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { attachSolely } from "../useTerminal";

/**
 * Each terminal lives in a detached wrapper div that is moved into the pane's
 * container. The effect that does the move is async and its cleanup only
 * removes its own wrapper, so a re-attach — a split, a tab switch, a remount —
 * could land while a previous wrapper was still in place.
 *
 * Both wrappers are height 100% of a one-screen container, so the second one
 * renders entirely below the fold. Worse, it is the one that just called
 * term.focus(): the terminal on screen is stale while the terminal receiving
 * keystrokes is scrolled out of view. Typing works, the buffer fills, and the
 * terminal looks dead.
 */
function div() {
  return document.createElement("div");
}

describe("attachSolely", () => {
  it("attaches the wrapper when the container is empty", () => {
    const c = div(), w = div();
    attachSolely(c, w);
    expect(c.childElementCount).toBe(1);
    expect(c.firstElementChild).toBe(w);
  });

  it("evicts a previous instance's wrapper instead of stacking on it", () => {
    const c = div(), stale = div(), fresh = div();
    c.appendChild(stale);
    attachSolely(c, fresh);
    expect(c.childElementCount).toBe(1);
    expect(c.firstElementChild).toBe(fresh);
    expect(stale.parentElement).toBe(null);
  });

  it("clears several stale wrappers, not just the last", () => {
    const c = div(), a = div(), b = div(), fresh = div();
    c.append(a, b);
    attachSolely(c, fresh);
    expect(c.childElementCount).toBe(1);
    expect(c.firstElementChild).toBe(fresh);
  });

  it("is idempotent: re-attaching the same wrapper keeps it in place", () => {
    const c = div(), w = div();
    attachSolely(c, w);
    attachSolely(c, w);
    expect(c.childElementCount).toBe(1);
    expect(c.firstElementChild).toBe(w);
  });

  it("moves the wrapper out of a container it was previously in", () => {
    const from = div(), to = div(), w = div();
    attachSolely(from, w);
    attachSolely(to, w);
    expect(from.childElementCount).toBe(0);
    expect(to.firstElementChild).toBe(w);
  });

  /** The visible symptom: a second wrapper lands at index 1, below the fold. */
  it("never leaves the live wrapper at a non-zero index", () => {
    const c = div(), stale = div(), fresh = div();
    c.appendChild(stale);
    attachSolely(c, fresh);
    expect(Array.prototype.indexOf.call(c.children, fresh)).toBe(0);
  });
});

/**
 * attachSolely evicts whatever else is in the container, which is only correct
 * for the instance that currently owns the pane. attach() awaits twice before
 * calling it — for a non-zero container size, then for the shell to start — and
 * in that window the pane can be closed, or detached to its own window and
 * reattached, which replaces the instance. Seating the old wrapper then would
 * throw out the live one and leave a disposed terminal on screen: the bug
 * attachSolely exists to prevent, arrived at from the other side.
 */
describe("attach() staleness guard", () => {
  const SOURCE = readFileSync(resolve(__dirname, "../useTerminal.ts"), "utf8");

  it("bails out before attaching if the instance is no longer the pane's", () => {
    const guard = SOURCE.indexOf("if (cancelled || instances.get(paneId) !== inst) return;");
    const attach = SOURCE.indexOf("attachSolely(container, inst.wrapper)");
    expect(guard, "staleness guard not found in attach()").toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(-1);
    expect(guard, "the guard must run before the wrapper is seated").toBeLessThan(attach);
  });
});
