import { describe, expect, it } from "vitest";
import { cliMain } from "../cli";
import { memFs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

describe("cli dispatch", () => {
  it("dispatches tickets next with the same argv shape the patched skills use", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["tickets", "next", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it("resolves --key queries for resolve_config", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["resolve_config", "--project-root", "/p", "--key", "core.output_folder"], fs);
    expect(JSON.parse(r.stdout)).toHaveProperty("core");
  });

  it("reports an unknown script with a non-zero exit", async () => {
    const r = await cliMain(["bogus"], memFs());
    expect(r.exitCode).toBe(2);
  });

  it("dispatches the Task 5b scripts by their patched names", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    for (const name of ["roster", "knowledge", "validate_manifests"] as const) {
      const r = await cliMain([name, "--project-root", "/p"], fs);
      expect(r.exitCode, `${name} should dispatch`).not.toBe(2);
    }
  });
});
