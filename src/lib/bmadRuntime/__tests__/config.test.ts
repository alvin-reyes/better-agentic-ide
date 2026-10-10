import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { deepMerge, loadCentralConfig, resolveCustomization } from "../config";
import { memFs, type Fs } from "../fs";

/**
 * The goldens are the real Python resolution (`skills/bmad/scripts/resolve_config.py`
 * and `resolve_customization.py` at bda3c59) for the project `setup.py` seeds at
 * /tmp/golden-proj. Each test rebuilds that project in memFs and compares.
 */
const REPO = join(__dirname, "../../../..");
const BMAD_SKILL = join(REPO, "src-tauri/resources/bmad-v6/skills/bmad");
const BUILD_SKILL = join(REPO, "src-tauri/resources/bmad-v6/skills/bmad-build");
const GOLDEN_PROJECT = "/tmp/golden-proj";

const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/config", name), "utf8"));

/** Seed _bmad/config.toml the way setup.py does: `{directory_name}` is filled with
 * the project folder's name, `{project-root}` stays the run-time placeholder it is.
 */
async function seedProject(fs: Fs, root: string): Promise<void> {
  const template = await readFile(join(BMAD_SKILL, "assets/config.template.toml"), "utf8");
  await fs.mkdir(`${root}/_bmad/custom`);
  await fs.writeText(`${root}/_bmad/config.toml`, template.replaceAll("{directory_name}", basename(root)));
}

/** Seed a skill's default customize.toml into memFs at its real skill-root path. */
async function seedSkill(fs: Fs, skillRoot: string): Promise<void> {
  await fs.mkdir(skillRoot);
  await fs.writeText(join(skillRoot, "customize.toml"), await readFile(join(skillRoot, "customize.toml"), "utf8"));
}

/** The layer files /tmp/golden-proj held when the layered goldens were captured. */
const TEAM_CENTRAL = `[core]
project_name = "team-project"

[[modules.demo.panels]]
code = "keep-team"
title = "team keep"

[[modules.demo.panels]]
code = "team-only"
title = "team only"

[[modules.demo.checks]]
code = "lint"
enabled = true

[modules.demo.flags]
alpha = true
beta = false
`;

const USER_CENTRAL = `[core]
active_initiative = "initiative-checkout"

[[modules.demo.panels]]
code = "keep-team"
title = "user override"

[[modules.demo.panels]]
code = "user-only"
title = "user only"

[[modules.demo.checks]]
code = "lint"
enabled = false

[[modules.demo.checks]]
id = "docs"
enabled = true

[modules.demo.flags]
beta = true
`;

const TEAM_BUILD = `[workflow]
persistent_facts = ["team-fact"]
route = "full"

[[workflow.quick_lenses]]
id = "quick"
instruction = "Team review instruction."

[[workflow.thorough_lenses]]
id = "team-lens"
name = "Team Lens"
instruction = "Team thorough lens."
`;

const USER_BUILD = `[workflow]
persistent_facts = ["user-fact"]
on_complete = "User completion note."

[[workflow.thorough_lenses]]
id = "intent-alignment"
name = "Intent Alignment Auditor (user)"
`;

describe("config port", () => {
  it("matches the Python central resolution on the seeded project", async () => {
    const fs = memFs();
    await seedProject(fs, GOLDEN_PROJECT);
    expect(await loadCentralConfig(GOLDEN_PROJECT, fs)).toEqual(await golden("central.json"));
  });

  it("matches the Python central resolution after a user override", async () => {
    const fs = memFs();
    await seedProject(fs, GOLDEN_PROJECT);
    await fs.writeText(`${GOLDEN_PROJECT}/_bmad/custom/config.user.toml`, '[core]\nactive_initiative = "initiative-checkout"\n');
    expect(await loadCentralConfig(GOLDEN_PROJECT, fs)).toEqual(await golden("central-with-user.json"));
  });

  it("matches the Python customization resolution", async () => {
    const fs = memFs();
    // customize.toml lives at the skill root; _bmad/custom/ layers sit beside
    // the central config. Mirror the layout /tmp/golden-proj had when the
    // golden was captured, then compare — the golden is authoritative.
    await seedSkill(fs, BUILD_SKILL);
    await fs.mkdir(`${GOLDEN_PROJECT}/_bmad/custom`);
    expect(await resolveCustomization(GOLDEN_PROJECT, BUILD_SKILL, "bmad-build", fs)).toEqual(
      await golden("customization.json"),
    );
  });

  it("matches the Python central resolution across team and user layers", async () => {
    const fs = memFs();
    await seedProject(fs, GOLDEN_PROJECT);
    await fs.writeText(`${GOLDEN_PROJECT}/_bmad/custom/config.toml`, TEAM_CENTRAL);
    await fs.writeText(`${GOLDEN_PROJECT}/_bmad/custom/config.user.toml`, USER_CENTRAL);
    expect(await loadCentralConfig(GOLDEN_PROJECT, fs)).toEqual(await golden("central-layered.json"));
  });

  it("matches the Python layered skill customization", async () => {
    const fs = memFs();
    await seedSkill(fs, BUILD_SKILL);
    await fs.mkdir(`${GOLDEN_PROJECT}/_bmad/custom`);
    await fs.writeText(`${GOLDEN_PROJECT}/_bmad/custom/bmad-build.toml`, TEAM_BUILD);
    await fs.writeText(`${GOLDEN_PROJECT}/_bmad/custom/bmad-build.user.toml`, USER_BUILD);
    expect(await resolveCustomization(GOLDEN_PROJECT, BUILD_SKILL, "bmad-build", fs)).toEqual(
      await golden("customization-layered.json"),
    );
  });

  it("refuses a project without the required central config", async () => {
    const fs = memFs();
    await expect(loadCentralConfig(GOLDEN_PROJECT, fs)).rejects.toThrow(/_bmad\/config\.toml/);
  });

  it("refuses a skill without its required customize.toml", async () => {
    const fs = memFs();
    await fs.mkdir(`${GOLDEN_PROJECT}/_bmad/custom`);
    await expect(resolveCustomization(GOLDEN_PROJECT, BUILD_SKILL, "bmad-build", fs)).rejects.toThrow(
      /customize\.toml/,
    );
  });

  it("refuses keyed array identifiers the Python refuses", () => {
    expect(() => deepMerge([{ code: 1 }], [{ code: 1 }])).toThrow(/`code` must be a string/);
    expect(() => deepMerge([{ id: "" }], [{ id: "" }])).toThrow(/`id` must not be empty/);
  });
});
