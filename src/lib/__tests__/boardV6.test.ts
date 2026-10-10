import { describe, expect, it } from "vitest";
import { buildBoardV6 } from "../boardV6";
import { memFs } from "../bmadRuntime/fs";
import { seedV6Tree } from "./fixtures/v6tree";

const STORE = "/p/_bmad-output/initiative-demo";
const PASS = 'story: "1.1"\ngate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n';

const oneTicket = (status: string) => ({
  initiative: { slug: "demo" },
  epics: [{ id: 1, slug: "cart" }],
  tickets: [{ id: 1, title: "Cart total", epic: "cart", type: "story" as const }],
  plans: { "1.1": { status } },
});

describe("buildBoardV6", () => {
  it("shows an empty v6 project at the first stage", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [], tickets: [], plans: {} });
    const board = await buildBoardV6("/p", fs);
    expect(board.currentStage).toBe("design");
    expect(board.stories).toEqual([]);
    expect(board.usedDefaults).toBe(false);
  });

  it("marks execution complete only when every ticket is done with a readable gate", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    const board = await buildBoardV6("/p", fs);
    expect(board.stories.map((s) => s.story.id)).toEqual(["1.1"]);
    expect(board.stories[0].state).toBe("done");
    expect(board.stages.every((s) => s.complete)).toBe(true);
    expect(board.currentStage).toBe("review");
  });

  it("a ticket marked done with no gate renders as claimed and holds execution open", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    const board = await buildBoardV6("/p", fs);
    expect(board.stories[0].state).toBe("claimed");
    expect(board.currentStage).toBe("audit");
  });

  it("a done ticket whose gate is unreadable is claimed, not done", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", 'story: "1.1"\ngate: "MAYBE"\n');
    const board = await buildBoardV6("/p", fs);
    expect(board.stories[0].state).toBe("claimed");
    expect(board.currentStage).toBe("execution");
  });

  it("an epic with zero pulled leaves never claims completion", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }], tickets: [], plans: {} });
    const board = await buildBoardV6("/p", fs);
    expect(board.stories).toEqual([]);
    expect(board.currentStage).toBe("audit");
    expect(board.stages.find((s) => s.id === "execution")?.complete).toBe(false);
  });

  it("surfaces a stale gate for a dropped ticket as unmatched", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [], tickets: [], plans: {} });
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/9.yml", 'gate: "FAIL"\n');
    const board = await buildBoardV6("/p", fs);
    expect(board.unmatchedGates.map((g) => g.file)).toEqual([".ade/gates/9.yml"]);
    expect(board.supersededGates).toEqual([]);
  });

  it("keeps an older gate for a live ticket as superseded, not unmatched", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    await fs.writeText("/p/.ade/gates/1.1-old.yml", 'story: "1.1"\ngate: "FAIL"\nupdated: "2026-01-01"\n');
    const board = await buildBoardV6("/p", fs);
    expect(board.stories[0].gate?.file).toBe(".ade/gates/1.1.yml");
    expect(board.supersededGates.map((g) => g.file)).toEqual([".ade/gates/1.1-old.yml"]);
    expect(board.unmatchedGates).toEqual([]);
  });

  it("credits a letter-suffixed gate to its own ticket, not to the ticket it extends", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [
        { id: 6, title: "Cart total", epic: "cart" },
        { id: "6a", title: "Cart total rounding", epic: "cart" },
      ],
      plans: { "1.6": { status: "done" }, "1.6a": { status: "done" } },
    });
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.6a.yml", 'gate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n');
    const board = await buildBoardV6("/p", fs);
    const byId = Object.fromEntries(board.stories.map((s) => [s.story.id, s]));
    expect(byId["1.6a"].state).toBe("done");
    expect(byId["1.6a"].gate?.file).toBe(".ade/gates/1.6a.yml");
    expect(byId["1.6"].state).toBe("claimed");
    expect(byId["1.6"].gate).toBeUndefined();
  });

  it("does not cite a missing epic doc as present", async () => {
    // The runtime port refuses an epic folder without its doc, so this models
    // the doc vanishing after the ticket tree was read (an edit under a
    // watcher; the board looks for gates next): the board must check, not assume.
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    const doc = `${STORE}/epic-cart/epic-cart.md`;
    const vanishing = {
      ...fs,
      exists: async (path: string) => {
        if (path === "/p/.ade/gates") await fs.delete(doc);
        return fs.exists(path);
      },
    };
    const board = await buildBoardV6("/p", vanishing);
    expect(board.artifacts.find((a) => a.id === "architecture")).toMatchObject({
      path: "_bmad-output/initiative-demo/epic-cart/epic-cart.md",
      present: false,
    });
    expect(board.paths.architectureFile).toBe("_bmad-output/initiative-demo/epic-cart/epic-cart.md");
  });

  it("reads the initiative doc at <folder>/<folder>.md for brainstorming and design", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }], tickets: [], plans: {} });
    await fs.delete(`${STORE}/initiative-demo.md`);
    const board = await buildBoardV6("/p", fs);
    expect(board.stages.find((s) => s.id === "brainstorming")?.complete).toBe(false);
    expect(board.stages.find((s) => s.id === "design")?.complete).toBe(false);
    expect(board.currentStage).toBe("brainstorming");
    const brief = board.artifacts.find((a) => a.id === "brief");
    expect(brief).toMatchObject({ path: "_bmad-output/initiative-demo/initiative-demo.md", present: false });
  });

  it("cites v6 files as the stage artifacts", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    const board = await buildBoardV6("/p", fs);
    const byId = Object.fromEntries(board.artifacts.map((a) => [a.id, a]));
    expect(byId.brief).toMatchObject({ path: "_bmad-output/initiative-demo/initiative-demo.md", present: true, isDirectory: false });
    expect(byId.prd).toMatchObject({ path: "_bmad-output/initiative-demo/initiative-demo.md", present: true });
    expect(byId.architecture).toMatchObject({ path: "_bmad-output/initiative-demo/epic-cart/epic-cart.md", present: true });
    expect(byId.reviews).toMatchObject({ path: ".ade/gates", present: true, isDirectory: true });
    expect(board.paths).toMatchObject({ qaLocation: ".ade", devStoryLocation: "_bmad-output/initiative-demo", usedDefaults: false });
  });

  it("counts a plan with a Code Review section as audit evidence", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("in-review"));
    const planPath = `${STORE}/epic-cart/story-cart-total-plan.md`;
    await fs.writeText(planPath, (await fs.readText(planPath)) + "\n## Code Review\n\nLooks fine.\n");
    const board = await buildBoardV6("/p", fs);
    expect(board.stages.find((s) => s.id === "audit")?.complete).toBe(true);
    expect(board.artifacts.find((a) => a.id === "reviews")).toMatchObject({
      path: "_bmad-output/initiative-demo/epic-cart/story-cart-total-plan.md",
      present: true,
      isDirectory: false,
    });
    expect(board.currentStage).toBe("execution");
  });

  it("a plan without a Code Review section is not audit evidence", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("in-review"));
    const board = await buildBoardV6("/p", fs);
    expect(board.stages.find((s) => s.id === "audit")?.complete).toBe(false);
    expect(board.artifacts.find((a) => a.id === "reviews")?.present).toBe(false);
  });

  it("returns an empty board when no initiative is active, still surfacing orphan gates", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\n');
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    const board = await buildBoardV6("/p", fs);
    expect(board.stories).toEqual([]);
    expect(board.stages.every((s) => !s.complete)).toBe(true);
    expect(board.currentStage).toBe("brainstorming");
    expect(board.unmatchedGates.map((g) => g.file)).toEqual([".ade/gates/1.1.yml"]);
  });

  it("propagates errors other than a missing active initiative", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText(
      "/p/_bmad/config.toml",
      '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\nactive_initiative = "initiative-gone"\n',
    );
    await expect(buildBoardV6("/p", fs)).rejects.toThrow(/active initiative folder not found/);
  });
});
