import { describe, expect, it } from "vitest";
import { watchTargets } from "../boardWatch";
import { BMAD_DEFAULTS } from "../bmadConfig";

describe("watchTargets", () => {
  it("watches v6's three folders", () => {
    expect(watchTargets("/p", "v6", null)).toEqual(["/p/_bmad", "/p/_bmad-output", "/p/.ade"]);
  });

  it("watches v4's configured locations, collapsing ones inside docs/", () => {
    expect(watchTargets("/p", "v4", BMAD_DEFAULTS)).toEqual(["/p/.bmad-core", "/p/.ade", "/p/docs"]);
  });

  it("adds a configured location outside docs/, and a single file's folder", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "work/stories", prdSharded: false, prdFile: "spec/prd.md" };
    expect(watchTargets("/p", "v4", paths)).toEqual(["/p/.bmad-core", "/p/.ade", "/p/docs", "/p/spec", "/p/work/stories"]);
  });

  it("never watches the project root, even for a file at the top level", () => {
    const paths = { ...BMAD_DEFAULTS, prdSharded: false, prdFile: "prd.md" };
    expect(watchTargets("/p", "v4", paths)).not.toContain("/p");
  });

  it("drops `..` that escapes the project", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: ".." };
    const result = watchTargets("/p", "v4", paths);
    expect(result).not.toContain("/p/..");
    expect(result.every((p) => p.startsWith("/p/"))).toBe(true);
  });

  it("drops `docs/..` that normalizes to root", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "docs/.." };
    const result = watchTargets("/p", "v4", paths);
    expect(result).not.toContain("/p");
    expect(result.every((p) => p.startsWith("/p/"))).toBe(true);
  });

  it("drops `a/../..` that escapes", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "a/../.." };
    const result = watchTargets("/p", "v4", paths);
    expect(result).not.toContain("/p/..");
    expect(result.every((p) => p.startsWith("/p/"))).toBe(true);
  });

  it("drops `../shared/stories` that escapes", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "../shared/stories" };
    const result = watchTargets("/p", "v4", paths);
    expect(result.every((p) => p.startsWith("/p/"))).toBe(true);
  });

  it("drops absolute paths like `/abs/stories`", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "/abs/stories" };
    const result = watchTargets("/p", "v4", paths);
    expect(result.every((p) => p.startsWith("/p/"))).toBe(true);
  });

  it("normalizes `./docs/stories` and `docs/./stories` under `/p/docs`", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "./docs/stories" };
    const result = watchTargets("/p", "v4", paths);
    expect(result).toContain("/p/docs");
    expect(result).not.toContain("/p/docs/stories");
  });

  it("normalizes `docs/./stories` under `/p/docs`", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "docs/./stories" };
    const result = watchTargets("/p", "v4", paths);
    expect(result).toContain("/p/docs");
    expect(result).not.toContain("/p/docs/stories");
  });
});
