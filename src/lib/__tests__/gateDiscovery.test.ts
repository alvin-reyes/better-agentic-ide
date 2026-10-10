import { describe, expect, it } from "vitest";
import { findGates } from "../gateDiscovery";
import { memFs } from "../bmadRuntime/fs";

describe("findGates", () => {
  it("reads .ade/gates for v6 projects", async () => {
    const fs = memFs();
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/6a.yml", "gate: PASS");
    expect(await findGates("/p", "v6", fs)).toEqual([{ file: ".ade/gates/6a.yml", yaml: "gate: PASS" }]);
  });

  it("reads docs/qa/gates for v4 projects and never .ade/gates", async () => {
    const fs = memFs();
    await fs.mkdir("/p/docs/qa/gates");
    await fs.writeText("/p/docs/qa/gates/2.1.yml", "gate: PASS");
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/9.yml", "gate: FAIL");
    expect(await findGates("/p", "v4", fs)).toEqual([{ file: "docs/qa/gates/2.1.yml", yaml: "gate: PASS" }]);
  });

  it("returns an empty list when no gate directory exists", async () => {
    expect(await findGates("/p", "v6", memFs())).toEqual([]);
  });
});
