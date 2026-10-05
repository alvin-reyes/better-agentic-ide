import { describe, expect, it } from "vitest";
import { buildBoard, canAdvance } from "../src/stores/stageBoardStore";

const storyMd = (id: string, status: string) =>
  `# Story ${id}: Something\n\n## Status\n\n${status}\n`;
const gateYaml = (id: string, v: string) => `story: "${id}"\ngate: ${v}\nstatus_reason: "ok"\n`;

const empty = { config: null, artifactExists: () => false, stories: [], gates: [] };

describe("buildBoard", () => {
  it("describes an empty project without erroring", () => {
    const b = buildBoard(empty);
    expect(b.stories).toEqual([]);
    expect(b.currentStage).toBe("brainstorming");
    expect(b.stages.every((s) => !s.complete)).toBe(true);
    expect(b.usedDefaults).toBe(true);
  });

  it("puts the five stages under BMAD's two phases", () => {
    const b = buildBoard(empty);
    expect(b.stages.map((s) => s.id)).toEqual([
      "brainstorming", "design", "audit", "execution", "review",
    ]);
    expect(b.stages.filter((s) => s.phase === "Planning").map((s) => s.id))
      .toEqual(["brainstorming", "design", "audit"]);
    expect(b.stages.filter((s) => s.phase === "Dev cycle").map((s) => s.id))
      .toEqual(["execution", "review"]);
  });

  it("completes a stage when its evidence resolves", () => {
    const b = buildBoard({ ...empty, artifactExists: (p: string) => p === "docs/brief.md" });
    expect(b.stages.find((s) => s.id === "brainstorming")!.complete).toBe(true);
    expect(b.currentStage).toBe("design");
  });

  it("needs both the PRD and the architecture for Design", () => {
    const only = buildBoard({
      ...empty,
      artifactExists: (p: string) => ["docs/brief.md", "docs/prd"].includes(p),
    });
    expect(only.stages.find((s) => s.id === "design")!.complete).toBe(false);

    const both = buildBoard({
      ...empty,
      artifactExists: (p: string) => ["docs/brief.md", "docs/prd", "docs/architecture"].includes(p),
    });
    expect(both.stages.find((s) => s.id === "design")!.complete).toBe(true);
  });

  it("needs every story done before Execution completes, not merely one", () => {
    const base = {
      ...empty,
      artifactExists: () => true,
      gates: [{ file: "docs/qa/gates/1.1-a.yml", yaml: gateYaml("1.1", "PASS") }],
    };
    const partial = buildBoard({ ...base, stories: [
      { file: "docs/stories/1.1.a.md", markdown: storyMd("1.1", "Done") },
      { file: "docs/stories/1.2.b.md", markdown: storyMd("1.2", "Review") },
    ]});
    expect(partial.stages.find((s) => s.id === "execution")!.complete).toBe(false);

    const all = buildBoard({ ...base, stories: [
      { file: "docs/stories/1.1.a.md", markdown: storyMd("1.1", "Done") },
    ]});
    expect(all.stages.find((s) => s.id === "execution")!.complete).toBe(true);
  });

  it("does not believe a Done story with no gate", () => {
    const b = buildBoard({ ...empty, artifactExists: () => true,
      stories: [{ file: "docs/stories/1.1.a.md", markdown: storyMd("1.1", "Done") }] });
    expect(b.stories[0].state).toBe("claimed");
    expect(b.stages.find((s) => s.id === "execution")!.complete).toBe(false);
  });
});

describe("canAdvance", () => {
  it("refuses while the stage's evidence is missing", () => {
    expect(canAdvance(buildBoard(empty), "brainstorming")).toBe(false);
  });

  it("allows it once the evidence is there", () => {
    const b = buildBoard({ ...empty, artifactExists: (p: string) => p === "docs/brief.md" });
    expect(canAdvance(b, "brainstorming")).toBe(true);
  });
});
