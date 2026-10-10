import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { knowledge } from "../knowledge";
import { memFs, type Fs } from "../fs";

/**
 * Every golden here was captured from the pinned Python
 * (`src-tauri/resources/bmad-v6/skills/bmad/scripts/knowledge.py`) by
 * `goldens/misc/capture.sh`. The two `--skill-root` shapes are Task 1's patch
 * artifact: the Python refuses the flag (argparse exit 2), Task 5c's ruling
 * makes the patched call sites the contract, and the port accepts the flag and
 * ignores it — so those goldens are the Python's output for the same command
 * without it, and the test still replays the argv the runtime receives.
 */
const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/misc", `${name}.json`), "utf8"));

const REPO = join(__dirname, "../../../..");
const SKILLS = join(REPO, "src-tauri/resources/bmad-v6/skills");

/** capture.sh's project seed, /p-rewritten. knowledge reads only the roots; the
 * _bmad layers are here so every test starts from the same tree. */
async function seed(fs: Fs): Promise<void> {
  await fs.mkdir("/p/_bmad/custom");
  await fs.writeText(
    "/p/_bmad/config.toml",
    `[core]\nproject_name = "p"\noutput_folder = "/p/_bmad-output"\nactive_initiative = "initiative-demo"\n`,
  );
  await fs.writeText(
    "/p/_bmad/custom/config.toml",
    `[agents.bmad-agent-analyst]\npersona = "A custom persona the user prefers."\n\n[agents.my-own-agent]\nname = "My Own Agent"\ntitle = "Hand-rolled"\ndescription = "An old-style persona paragraph."\n`,
  );
  await copyTree(SKILLS, fs, "/p/skills");
}

async function copyTree(from: string, fs: Fs, at: string): Promise<void> {
  await fs.mkdir(at);
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) await copyTree(path, fs, `${at}/${entry.name}`);
    else await fs.writeText(`${at}/${entry.name}`, await readFile(path, "utf8"));
  }
}

/** The Python's output for the shape, replayed in the port: exit code and
 * stdout, byte for byte (the Python prints one compact JSON line). */
async function matches(name: string, fs: Fs): Promise<void> {
  const expected = await golden(name);
  const r = await knowledge(expected.argv, fs);
  expect(r.exitCode, `${name} exit code`).toBe(expected.exitCode);
  expect(r.stdout, `${name} stdout`).toBe(expected.stdout);
}

describe("knowledge port", () => {
  it("matches the Python for the --root shape the ecosystem call site writes", async () => {
    const expected = await golden("knowledge-root");
    expect(expected.exitCode).toBe(0);
    const fs = memFs();
    await seed(fs);
    await matches("knowledge-root", fs);
  });

  it("accepts --skill-root and answers what the Python answers without it", async () => {
    const expected = await golden("knowledge-skill-root");
    // The recorded argv carries the patch artifact; the Python never saw it.
    expect(expected.argv).toContain("--skill-root");
    expect(expected.exitCode).toBe(0);
    const fs = memFs();
    await seed(fs);
    await matches("knowledge-skill-root", fs);
  });

  it("accepts --skill-root --content and answers what the Python answers without it", async () => {
    const expected = await golden("knowledge-skill-root-content");
    expect(expected.argv).toContain("--skill-root");
    expect(expected.exitCode).toBe(0);
    const fs = memFs();
    await seed(fs);
    await matches("knowledge-skill-root-content", fs);
    // --content is the difference between the two skill-root goldens: the full
    // help text rides in each document.
    const withContent = JSON.parse(expected.stdout);
    expect(withContent.documents[0].content).toContain("#");
  });

  it("reports a root that is not there as a problem beside the roots that are", async () => {
    const fs = memFs();
    await seed(fs);
    await matches("knowledge-missing-root", fs);
  });

  it("refuses with no --root, the way argparse did", async () => {
    const r = await knowledge(["--content"], memFs());
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain("--root");
  });
});
