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
});
