import { describe, expect, it } from "vitest";
import { parseBmadConfig } from "../src/lib/bmadConfig";
import { resolveArtifacts } from "../src/lib/bmadArtifacts";

const paths = parseBmadConfig(null);
const find = (list: ReturnType<typeof resolveArtifacts>, id: string) =>
  list.find((a) => a.id === id)!;

describe("resolveArtifacts", () => {
  it("reports nothing present in an empty project", () => {
    const got = resolveArtifacts(paths, () => false);
    expect(got.every((a) => !a.present)).toBe(true);
  });

  // Review Focus 2: prdSharded is BMAD's default, so docs/prd.md may never exist.
  it("resolves a sharded PRD from its directory when the single file is absent", () => {
    const got = resolveArtifacts(paths, (p) => p === "docs/prd");
    const prd = find(got, "prd");
    expect(prd.present).toBe(true);
    expect(prd.path).toBe("docs/prd");
    expect(prd.isDirectory).toBe(true);
  });

  it("resolves an unsharded PRD from the single file", () => {
    const single = { ...paths, prdSharded: false };
    const prd = find(resolveArtifacts(single, (p) => p === "docs/prd.md"), "prd");
    expect(prd.present).toBe(true);
    expect(prd.path).toBe("docs/prd.md");
    expect(prd.isDirectory).toBe(false);
  });

  it("accepts either spelling of the brief", () => {
    // Roles own docs/brief.md; BMAD's greenfield workflow creates project-brief.md.
    expect(find(resolveArtifacts(paths, (p) => p === "docs/brief.md"), "brief").present).toBe(true);
    expect(find(resolveArtifacts(paths, (p) => p === "docs/project-brief.md"), "brief").present).toBe(true);
  });

  it("finds the audit artifacts the ADE roles own", () => {
    const got = resolveArtifacts(paths, (p) =>
      ["docs/reviews", "docs/threat-model.md", "docs/security-review.md"].includes(p));
    expect(find(got, "reviews").present).toBe(true);
    expect(find(got, "threatModel").present).toBe(true);
    expect(find(got, "securityReview").present).toBe(true);
  });

  it("follows a customised layout rather than docs/", () => {
    const custom = parseBmadConfig("prd:\n  prdFile: spec/prd.md\n  prdSharded: false\n");
    expect(find(resolveArtifacts(custom, (p) => p === "spec/prd.md"), "prd").present).toBe(true);
  });
});

describe("the architecture filenames BMAD's workflows actually create", () => {
  // grep "creates: .*architecture" across the six bundled workflows gives
  // architecture.md, fullstack-architecture.md, front-end-architecture.md and
  // brownfield-architecture.md. Looking only for the config spelling means
  // Design never completes on a project BMAD itself built.
  it.each([
    "docs/fullstack-architecture.md",
    "docs/front-end-architecture.md",
    "docs/brownfield-architecture.md",
  ])("resolves %s", (path) => {
    const a = find(resolveArtifacts(paths, (p) => p === path), "architecture");
    expect(a.present).toBe(true);
    expect(a.path).toBe(path);
    expect(a.isDirectory).toBe(false);
  });

  it("still prefers the sharded directory when it exists", () => {
    const a = find(
      resolveArtifacts(paths, (p) => ["docs/architecture", "docs/fullstack-architecture.md"].includes(p)),
      "architecture",
    );
    expect(a.path).toBe("docs/architecture");
    expect(a.isDirectory).toBe(true);
  });
});

describe("isDirectory follows the path that resolved", () => {
  it("is true for a sharded directory even when the config says unsharded", () => {
    // The PO shards the PRD; nobody flips prdSharded. The directory is still
    // a directory, and a UI that opens it as a file would fail.
    const single = { ...paths, prdSharded: false };
    const prd = find(resolveArtifacts(single, (p) => p === "docs/prd"), "prd");
    expect(prd.present).toBe(true);
    expect(prd.path).toBe("docs/prd");
    expect(prd.isDirectory).toBe(true);
  });
});
