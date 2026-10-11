import { describe, expect, it } from "vitest";
import { buildBoard } from "../../stores/stageBoardStore";
import { memFs } from "../bmadRuntime/fs";
import { readStageFile, stageView, writeStage } from "../confirmedStage";

/** A v4 board whose evidence covers stages up to and including `through`. */
const board = (have: string[]) =>
  buildBoard({ config: null, artifactExists: (p) => have.includes(p), stories: [], gates: [] });
const BRIEF = "docs/brief.md";
const DESIGN = ["docs/prd", "docs/architecture"];

describe("stageView", () => {
  it("falls back to the evidence with no file, offering no Next", () => {
    const v = stageView(board([BRIEF]), null);
    expect(v).toMatchObject({ shown: "design", derived: "design", tracked: false, invalid: false, claimed: false, next: null, prev: "brainstorming" });
  });

  it("treats an unknown value as invalid and falls back", () => {
    const v = stageView(board([BRIEF]), "shipping\n");
    expect(v).toMatchObject({ shown: "design", tracked: false, invalid: true, next: null });
  });

  it("shows the tracked stage, and offers Next only once its evidence is on disk", () => {
    expect(stageView(board([BRIEF]), "design\n")).toMatchObject({ shown: "design", tracked: true, next: null });
    expect(stageView(board([BRIEF, ...DESIGN]), "design\n")).toMatchObject({ shown: "design", next: "audit", claimed: false });
  });

  it("holds a tracked stage behind the evidence: Next waits for the click", () => {
    const v = stageView(board([BRIEF, ...DESIGN]), "brainstorming\n");
    expect(v).toMatchObject({ shown: "brainstorming", derived: "audit", next: "design", prev: null });
  });

  it("calls a tracked stage ahead of the evidence claimed", () => {
    const v = stageView(board([]), "execution\n");
    expect(v).toMatchObject({ shown: "execution", claimed: true, next: null, prev: "audit" });
  });

  it("offers no Next from the last stage", () => {
    expect(stageView(board([]), "review").next).toBeNull();
  });
});

describe("stage file", () => {
  it("round-trips through .ade/stage, and reads null when absent", async () => {
    const fs = memFs();
    await fs.mkdir("/p");
    expect(await readStageFile("/p", fs)).toBeNull();
    await writeStage("/p", "audit", fs);
    expect(await fs.readText("/p/.ade/stage")).toBe("audit\n");
    expect(await readStageFile("/p", fs)).toBe("audit\n");
  });

  it("reads an unreadable file as an invalid value instead of failing, so the rail falls back to the evidence with a warning", async () => {
    const fs = memFs();
    await fs.mkdir("/p/.ade/stage"); // a directory where the file should be
    const broken = { ...fs, readText: async () => { throw new Error("Is a directory"); } };
    const value = await readStageFile("/p", broken);
    expect(value).not.toBeNull();
    const v = stageView(board([BRIEF]), value);
    expect(v).toMatchObject({ shown: "design", derived: "design", tracked: false, invalid: true, next: null });
  });
});

describe("stageView while claimed", () => {
  it("never offers Next from a claimed stage, even on a board whose stages are not monotonic", () => {
    // The engines keep completion monotonic, so a claimed stage is never
    // complete today; Next must not depend on that invariant.
    const b = board([]);
    const odd = { ...b, stages: b.stages.map((s) => (s.id === "audit" ? { ...s, complete: true } : s)) };
    const v = stageView(odd, "audit\n");
    expect(v.claimed).toBe(true);
    expect(v.next).toBeNull();
    expect(v.prev).toBe("design");
  });
});
