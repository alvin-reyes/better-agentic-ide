import { describe, expect, it } from "vitest";
import { memFs } from "../bmadRuntime/fs";
import { loadBoard, v4Inputs } from "../loadBoard";
import { buildBoard } from "../../stores/stageBoardStore";

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
