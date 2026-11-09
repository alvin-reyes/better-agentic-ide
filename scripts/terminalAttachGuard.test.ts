import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seating a wrapper (seatTerminal, which calls attachSolely) evicts whatever
 * else is in the container, which is only correct for the instance that
 * currently owns the pane. attach() awaits twice before seating — for a
 * non-zero container size, then for the shell to start — and in that window
 * the pane can be closed, or detached to its own window and reattached, which
 * replaces the instance. Seating the old wrapper then would throw out the live
 * one and leave a disposed terminal on screen: the bug attachSolely exists to
 * prevent, arrived at from the other side. It would also hand a WebGL slot to
 * a pane that is gone.
 */
describe("attach() staleness guard", () => {
  const SOURCE = readFileSync(resolve(__dirname, "../src/hooks/useTerminal.ts"), "utf8");

  /** The source of the function starting at `start`, up to its closing line (`end`). */
  function body(start: string, end: string): { from: number; to: number; text: string } {
    const from = SOURCE.indexOf(start);
    expect(from, `${start} not found in useTerminal.ts`).toBeGreaterThan(-1);
    const to = SOURCE.indexOf(end, from);
    expect(to, `end of ${start} not found`).toBeGreaterThan(from);
    return { from, to, text: SOURCE.slice(from, to) };
  }

  it("bails out before seating if the instance is no longer the pane's", () => {
    // Only the effect's attach(): seatTerminal's definition and createInstance's
    // early seat are elsewhere and can't satisfy or break this.
    const attach = body("const attach = async", "\n    attach();").text;
    const guard = attach.indexOf("if (cancelled || instances.get(paneId) !== inst) return;");
    const seat = attach.indexOf("seatTerminal(");
    expect(guard, "staleness guard not found in attach()").toBeGreaterThan(-1);
    expect(seat, "attach() no longer seats through seatTerminal").toBeGreaterThan(-1);
    expect(guard, "the guard must run before the wrapper is seated").toBeLessThan(seat);
  });

  it("calls attachSolely only from seatTerminal", () => {
    const seatTerminal = body("export function seatTerminal(", "\n}\n");
    const definition = SOURCE.indexOf("export function attachSolely(");
    const calls = [...SOURCE.matchAll(/attachSolely\(/g)].map((m) => m.index!);
    const stray = calls.filter((i) => i !== definition + "export function ".length && (i < seatTerminal.from || i > seatTerminal.to));
    expect(stray.map((i) => SOURCE.slice(0, i).split("\n").length), "attachSolely called outside seatTerminal, at these lines").toEqual([]);
  });
});
