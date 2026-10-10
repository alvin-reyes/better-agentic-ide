import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { roster } from "../roster";
import { memFs, type Fs } from "../fs";

/**
 * Every golden here was captured from the pinned Python
 * (`src-tauri/resources/bmad-v6/skills/bmad/scripts/roster.py`) by
 * `goldens/misc/capture.sh`, which records the seed, the command and the
 * rewrites behind each file. The test replays the recorded argv — the patched
 * call-site shape the runtime answers — against the same tree rebuilt in memFs
 * under `/p`, and compares stdout and the exit code byte for byte. Where the
 * port disagrees with a golden, the port changes.
 */
const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/misc", `${name}.json`), "utf8"));

const REPO = join(__dirname, "../../../..");
const SKILLS = join(REPO, "src-tauri/resources/bmad-v6/skills");

/** capture.sh's project seed, /p-rewritten: the two config layers the capture
 * writes, and a project-local copy of the vendored skills tree. */
async function seed(fs: Fs, withSkills = true): Promise<void> {
  await fs.mkdir("/p/_bmad/custom");
  await fs.writeText(
    "/p/_bmad/config.toml",
    `[core]\nproject_name = "p"\noutput_folder = "/p/_bmad-output"\nactive_initiative = "initiative-demo"\n`,
  );
  await fs.writeText(
    "/p/_bmad/custom/config.toml",
    `[agents.bmad-agent-analyst]\npersona = "A custom persona the user prefers."\n\n[agents.my-own-agent]\nname = "My Own Agent"\ntitle = "Hand-rolled"\ndescription = "An old-style persona paragraph."\n`,
  );
  if (withSkills) await copyTree(SKILLS, fs, "/p/skills");
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
 * stdout, byte for byte. */
async function matches(name: string, fs: Fs): Promise<void> {
  const expected = await golden(name);
  const r = await roster(expected.argv, fs);
  expect(r.exitCode, `${name} exit code`).toBe(expected.exitCode);
  expect(r.stdout, `${name} stdout`).toBe(expected.stdout);
}

describe("roster port", () => {
  it("matches the Python for the patched --skill/--project-root call-site shape", async () => {
    const expected = await golden("roster-skill-project");
    expect(expected.exitCode).toBe(0);
    const fs = memFs();
    await seed(fs);
    await matches("roster-skill-project", fs);
  });

  it("reports a skills root that is not there as the Python does, not as an error", async () => {
    const fs = memFs();
    await seed(fs, false);
    await matches("roster-missing-root", fs);
    const expected = await golden("roster-missing-root");
    const problems = JSON.parse(expected.stdout).problems;
    expect(problems).toEqual([
      {
        kind: "root",
        root: "/p/nope/skills",
        problem: "cannot read root /p/nope/skills: [Errno 2] No such file or directory: '/p/nope/skills'",
      },
    ]);
  });

  it("refuses with neither --skill nor --root, the way argparse did", async () => {
    const r = await roster(["--project-root", "/p"], memFs());
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain("give --skill or --root");
  });

  /** A code is a dict key: `constructor` and `__proto__` are codes like any
   * other, so a roster holding them loads instead of reading Object.prototype
   * (`constructor` as "already defined", `__proto__` as a dropped member). */
  it("reads member and group names that Object.prototype also carries", async () => {
    const fs = memFs();
    await fs.mkdir("/p/skills/mod-a");
    await fs.writeText("/p/skills/mod-a/bmod.toml", '[bmod]\ncode = "mod-a"\nskills = ["mod-a"]\n');
    await fs.writeText(
      "/p/skills/mod-a/roster.toml",
      '[[members]]\ncode = "constructor"\nname = "Constructor"\n\n' +
        '[[members]]\ncode = "__proto__"\nname = "Proto"\n\n' +
        '[[groups]]\nid = "__proto__"\nname = "The prototype club"\n',
    );

    const { collect } = await import("../roster");
    const report = await collect(fs, ["/p/skills"]);

    expect(report.problems).toEqual([]);
    expect(Object.keys(report.members).sort()).toEqual(["__proto__", "constructor"]);
    expect(report.members["constructor"].name).toBe("Constructor");
    expect(report.members["__proto__"].name).toBe("Proto");
    expect(report.groups).toHaveLength(1);
    expect((report.groups[0] as Record<string, unknown>).id).toBe("__proto__");
  });
});
