import { describe, expect, it } from "vitest";
import { memFs, type Fs } from "../bmadRuntime/fs";
import { loadBoard, v4Inputs } from "../loadBoard";
import { buildBoard } from "../../stores/stageBoardStore";
import { executionComplete } from "../storyState";

const STORY = (status: string) => `# Story 1.1: Cart total\n\n## Status\n\n${status}\n\n## Acceptance Criteria\n\n1. Totals add up\n`;
const PASS = 'story: "1.1"\ngate: "PASS"\nstatus_reason: "ok"\nupdated: "2026-10-10"\n';

async function v4Project() {
  const fs = memFs();
  await fs.mkdir("/p/.bmad-core");
  await fs.writeText("/p/.bmad-core/core-config.yaml", "qaLocation: docs/qa\nprdFile: docs/prd.md\nprdSharded: false\ndevStoryLocation: docs/stories\n");
  await fs.mkdir("/p/docs/stories");
  await fs.writeText("/p/docs/prd.md", "# PRD\n");
  await fs.writeText("/p/docs/stories/1.1.cart-total.md", STORY("Done"));
  await fs.writeText("/p/docs/stories/notes.txt", "not a story");
  await fs.mkdir("/p/docs/qa/gates");
  await fs.writeText("/p/docs/qa/gates/1.1-cart-total.yml", PASS);
  return fs;
}

describe("v4Inputs", () => {
  it("reads the config, the story files, the gates and which artifact paths exist", async () => {
    const fs = await v4Project();
    const input = await v4Inputs("/p", fs);
    expect(input.config).toContain("devStoryLocation: docs/stories");
    expect(input.stories.map((s) => s.file)).toEqual(["docs/stories/1.1.cart-total.md"]);
    expect(input.gates.map((g) => g.file)).toEqual(["docs/qa/gates/1.1-cart-total.yml"]);
    expect(input.artifactExists("docs/prd.md")).toBe(true);
    expect(input.artifactExists("docs/architecture.md")).toBe(false);
  });

  it("uses the defaults when there is no config, and reads nothing that is missing", async () => {
    const fs = memFs();
    await fs.mkdir("/p");
    const input = await v4Inputs("/p", fs);
    expect(input.config).toBeNull();
    expect(input.stories).toEqual([]);
    expect(input.gates).toEqual([]);
  });
});

describe("loadBoard", () => {
  it("builds the same v4 board buildBoard gives for the gathered inputs", async () => {
    const fs = await v4Project();
    const board = await loadBoard("/p", "v4", fs);
    expect(board).toEqual(buildBoard(await v4Inputs("/p", fs)));
    expect(board.stories[0].state).toBe("done");
  });
});

/** `fs`, except that reading any of `broken` fails. */
function unreadable(fs: Fs, broken: string[]): Fs {
  return {
    ...fs,
    readText: async (p) => {
      if (broken.includes(p)) throw new Error("permission denied");
      return fs.readText(p);
    },
  };
}

describe("loadBoard with an unreadable file", () => {
  it("keeps an unreadable story on the board as unknown, says why, and does not count execution complete", async () => {
    const base = await v4Project();
    // Execution would be complete with 1.1 alone (done, behind a PASS gate).
    expect(executionComplete((await loadBoard("/p", "v4", base)).stories)).toBe(true);

    await base.writeText("/p/docs/stories/1.2.checkout.md", STORY("Done"));
    const fs = unreadable(base, ["/p/docs/stories/1.2.checkout.md"]);
    const board = await loadBoard("/p", "v4", fs);
    const row = board.stories.find((s) => s.story.file === "docs/stories/1.2.checkout.md");
    expect(row).toBeDefined();
    expect(row!.state).toBe("unknown");
    expect(board.problems).toEqual(["docs/stories/1.2.checkout.md: could not be read: Error: permission denied"]);
    expect(executionComplete(board.stories)).toBe(false);
  });

  it("keeps an unreadable gate as an errored gate and says why", async () => {
    const base = await v4Project();
    const fs = unreadable(base, ["/p/docs/qa/gates/1.1-cart-total.yml"]);
    const board = await loadBoard("/p", "v4", fs);
    expect(board.problems).toEqual(["docs/qa/gates/1.1-cart-total.yml: could not be read: Error: permission denied"]);
    const gates = [...board.unmatchedGates, ...board.stories.flatMap((s) => (s.gate ? [s.gate] : []))];
    expect(gates.map((g) => g.file)).toContain("docs/qa/gates/1.1-cart-total.yml");
    expect(board.stories[0].state).not.toBe("done");
  });

  it("adds no problems when everything reads", async () => {
    expect((await loadBoard("/p", "v4", await v4Project())).problems).toBeUndefined();
  });
});
