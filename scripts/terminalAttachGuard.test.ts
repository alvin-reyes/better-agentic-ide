import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  const SOURCE = readFileSync(resolve(__dirname, "../src/hooks/useTerminal.ts"), "utf8");

  it("bails out before attaching if the instance is no longer the pane's", () => {
    const guard = SOURCE.indexOf("if (cancelled || instances.get(paneId) !== inst) return;");
    const attach = SOURCE.indexOf("attachSolely(container, inst.wrapper)");
    expect(guard, "staleness guard not found in attach()").toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(-1);
    expect(guard, "the guard must run before the wrapper is seated").toBeLessThan(attach);
  });
});
