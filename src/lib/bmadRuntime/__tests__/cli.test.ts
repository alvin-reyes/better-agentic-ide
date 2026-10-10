import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cliMain } from "../cli";
import { memFs, type Fs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

const REPO = join(__dirname, "../../../..");
const WALKTHROUGH = join(REPO, "src-tauri/resources/bmad-v6/skills/bmad-walkthrough");

/** The skill's files in the same `Fs` the render reads: the port reads a
 * skill's sources through the filesystem it is handed. */
async function copyTree(from: string, fs: Fs, at: string): Promise<void> {
  await fs.mkdir(at);
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) await copyTree(path, fs, `${at}/${entry.name}`);
    else await fs.writeText(`${at}/${entry.name}`, await readFile(path, "utf8"));
  }
}

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

describe("render_skill exit codes", () => {
  it("exits 1 with the HALT line when the render refuses", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["render_skill", "--project-root", "/p", "--skill", "/p/skills/bmad-nope"], fs);
    expect(r.exitCode).toBe(1);
    expect(r.stdout.startsWith("HALT: ")).toBe(true);
  });

  it("exits 0 with the render line when the render succeeds", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    await copyTree(WALKTHROUGH, fs, WALKTHROUGH);
    const r = await cliMain(["render_skill", "--project-root", "/p", "--skill", WALKTHROUGH], fs);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(
      /^read and follow \/p\/_bmad\/render\/bmad-walkthrough\/p-[0-9a-f]{12}\/[0-9a-f]{20}\/workflow\.md\n$/,
    );
  });
});
