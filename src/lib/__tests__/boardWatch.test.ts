import { describe, expect, it } from "vitest";
import { WATCH_EXTENSIONS, watchExcludes, watchExtensions, watchTargets } from "../boardWatch";
import { BMAD_DEFAULTS } from "../bmadConfig";

describe("watchTargets", () => {
  it("watches v6's three folders", () => {
    expect(watchTargets("/p", "v6", null)).toEqual(["/p/_bmad", "/p/_bmad-output", "/p/.ade"]);
  });

  it("watches a v6 project's configured output folder", () => {
    expect(watchTargets("/p", "v6", null, "docs/bmad")).toEqual(["/p/_bmad", "/p/docs/bmad", "/p/.ade"]);
  });

  it("drops a v6 output folder that would escape the project", () => {
    expect(watchTargets("/p", "v6", null, "../elsewhere")).toEqual(["/p/_bmad", "/p/.ade"]);
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

describe("watchExtensions", () => {
  it("watches every file in .ade/, whose stage and approval files have no real extension", () => {
    expect(watchExtensions("/p/.ade", "v4")).toEqual([]);
    expect(watchExtensions("C:\\p\\.ade", "v6")).toEqual([]);
  });

  it("watches only the document extensions everywhere else on v4", () => {
    expect(watchExtensions("/p/docs", "v4")).toEqual(WATCH_EXTENSIONS);
    expect(watchExtensions("/p/my.ade-notes", "v4")).toEqual(WATCH_EXTENSIONS);
  });

  it("adds html on v6, for brainstorm and forge reports", () => {
    expect(watchExtensions("/p/_bmad-output", "v6")).toEqual([...WATCH_EXTENSIONS, "html"]);
  });
});

describe("watchExcludes", () => {
  it("keeps the archive out of the .ade watch, and nothing out of any other", () => {
    expect(watchExcludes("/p/.ade")).toEqual(["/p/.ade/archive"]);
    expect(watchExcludes("/p/.ade/")).toEqual(["/p/.ade/archive"]);
    expect(watchExcludes("C:\\p\\.ade")).toEqual(["C:\\p\\.ade/archive"]);
    expect(watchExcludes("/p/docs")).toEqual([]);
    expect(watchExcludes("/p/.adept")).toEqual([]);
  });
});
