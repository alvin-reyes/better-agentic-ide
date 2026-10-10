import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateManifests } from "../validateManifests";
import { memFs, type Fs } from "../fs";

/**
 * Every golden here was captured from the pinned Python
 * (`src-tauri/resources/bmad-v6/skills/bmad/scripts/validate_manifests.py`) by
 * `goldens/misc/capture.sh`. The Python prints the problems to stderr on
 * failure; the runtime's one return shape has no stderr, so the port carries
 * the same text in stdout, which is what the goldens hold. Where the port
 * disagrees with a golden, the port changes.
 */
const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/misc", `${name}.json`), "utf8"));

const REPO = join(__dirname, "../../../..");
const SKILLS = join(REPO, "src-tauri/resources/bmad-v6/skills");
const BROKEN = join(__dirname, "goldens/misc/broken-repo");

async function copyTree(from: string, fs: Fs, at: string): Promise<void> {
  await fs.mkdir(at);
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) await copyTree(path, fs, `${at}/${entry.name}`);
    else await fs.writeText(`${at}/${entry.name}`, await readFile(path, "utf8"));
  }
}

async function matches(name: string, fs: Fs): Promise<void> {
  const expected = await golden(name);
  const r = await validateManifests(expected.argv, fs);
  expect(r.exitCode, `${name} exit code`).toBe(expected.exitCode);
  expect(r.stdout, `${name} stdout`).toBe(expected.stdout);
}

describe("validate_manifests port", () => {
  it("validates the vendored tree — a real module repository — with the Python's line", async () => {
    const expected = await golden("validate-repo");
    expect(expected.stdout).toBe("bmod files valid: 30 skills, 3 module records, 3 knowledge documents.\n");
    const fs = memFs();
    // The recorded argv names /p/src-tauri/resources/bmad-v6: the repository
    // root, whose skills/ tree is the repository the checks run over.
    await copyTree(SKILLS, fs, "/p/src-tauri/resources/bmad-v6/skills");
    await matches("validate-repo", fs);
  });

  it("reports every problem kind the fixture ships, in the Python's order", async () => {
    const expected = await golden("validate-broken");
    expect(expected.exitCode).toBe(1);
    const problems = expected.stdout.split("\n").filter((line: string) => line.startsWith("  "));
    expect(problems).toHaveLength(20);
    const fs = memFs();
    await copyTree(BROKEN, fs, "/p/broken-repo");
    await matches("validate-broken", fs);
  });

  it("refuses a project with no skills/ tree with the Python's own message", async () => {
    const fs = memFs();
    await fs.mkdir("/p/empty");
    await matches("validate-empty", fs);
    const expected = await golden("validate-empty");
    expect(expected.stdout).toContain(
      "no skills/*/bmod.toml found under /p/empty: pass the repository root with --project-root",
    );
  });
});
