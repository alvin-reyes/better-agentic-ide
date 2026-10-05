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
