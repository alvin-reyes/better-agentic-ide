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

  it("reports an unknown script with a non-zero exit", async () => {
    const r = await cliMain(["bogus"], memFs());
    expect(r.exitCode).toBe(2);
  });

  it("dispatches the Task 5b scripts by their patched names", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });

    // roster and knowledge answer the JSON report their Python prints, exit 0 —
    // a root that is not there is a problem inside the report, not a refusal.
    const rosterRun = await cliMain(["roster", "--root", "/p/nope", "--project-root", "/p"], fs);
    expect(rosterRun.exitCode).toBe(0);
    expect(JSON.parse(rosterRun.stdout).problems).toHaveLength(1);

    const knowledgeRun = await cliMain(["knowledge", "--root", "/p/nope"], fs);
    expect(knowledgeRun.exitCode).toBe(0);
    expect(JSON.parse(knowledgeRun.stdout).problems).toHaveLength(1);

    // validate_manifests answers its own refusal (exit 1) for a project with no
    // skills/ tree — no longer the interim "not ported" line, and never the
    // unknown-script exit 2.
    const validateRun = await cliMain(["validate_manifests", "--project-root", "/p"], fs);
    expect(validateRun.exitCode).toBe(1);
    expect(validateRun.stdout).toContain("pass the repository root with --project-root");
    expect(validateRun.stdout).not.toContain("not ported");
  });

  /** argparse took both spellings of a flag; `--flag=value` is the one the
   * agents' own transcripts write. */
  it("takes the --flag=value form as well as the two-token one", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const inline = await cliMain(["resolve_config", "--project-root=/p", "--key=core.project_name"], fs);
    expect(inline.exitCode).toBe(0);
    expect(JSON.parse(inline.stdout)).toEqual({ "core.project_name": "p" });
    const split = await cliMain(["resolve_config", "--project-root", "/p", "--key", "core.project_name"], fs);
    expect(split.stdout).toBe(inline.stdout);
  });

  /** `Path(".").resolve()` is the folder the caller stands in: an empty root
   * would make validate_manifests check `/skills` instead. */
  it("reads `--project-root .` as the working directory", async () => {
    const r = await cliMain(["validate_manifests", "--project-root", "."], memFs());
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain(process.cwd());
    expect(r.stdout).not.toMatch(/under : /);
  });
});

describe("resolve --key filter", () => {
  it("answers a --key query with the dotted path as written, not the whole table", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["resolve_config", "--project-root", "/p", "--key", "core.output_folder"], fs);
    expect(r.exitCode).toBe(0);
    // The Python's shape: `json.dumps({key: extract_key(merged, key)})`, the
    // dotted path itself as the one entry — not the nested `[core]` table.
    expect(JSON.parse(r.stdout)).toEqual({ "core.output_folder": "/p/_bmad-output" });
  });

  it("keeps the requested order, omits missing keys, and takes the -k spelling", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(
      ["resolve_config", "--project-root", "/p", "-k", "core.active_initiative", "--key", "core.nope", "--key=core.project_name"],
      fs,
    );
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      "core.active_initiative": "initiative-demo",
      "core.project_name": "p",
    });
    expect(Object.keys(JSON.parse(r.stdout))).toEqual(["core.active_initiative", "core.project_name"]);
  });

  it("dumps the whole table when no --key is given", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await cliMain(["resolve_config", "--project-root", "/p"], fs);
    expect(JSON.parse(r.stdout)).toHaveProperty("core");
  });

  it("filters resolve_customization the same way", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    await copyTree(WALKTHROUGH, fs, WALKTHROUGH);
    // A second table comes from the project's own layer: the full merge holds
    // both, the filter holds only what was asked for.
    await fs.writeText("/p/_bmad/custom/bmad-walkthrough.toml", `[agent]\nname = "Team"\n`);
    const r = await cliMain(
      ["resolve_customization", "--skill", WALKTHROUGH, "--project-root", "/p", "--key", "agent", "--key", "workflow", "--key", "nope.x"],
      fs,
    );
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    // The requested order, the requested tables only, and the key that cannot
    // resolve omitted rather than an error — the Python's filter exactly.
    expect(Object.keys(out)).toEqual(["agent", "workflow"]);
    expect(out["agent"]).toEqual({ name: "Team" });
    expect(out["workflow"]).toHaveProperty("persistent_facts");
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

describe("render_skill --set shapes", () => {
  const OVERRIDE = "workflow.on_activation";

  /** Render the walkthrough with the given argv tail. Its `workflow.md` prints
   * `workflow.on_activation` only when the resolved value is non-empty, so the
   * rendered body tells an applied override from one that was dropped. */
  async function render(argv: string[]): Promise<{ stdout: string; exitCode: number; body: string }> {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    await copyTree(WALKTHROUGH, fs, WALKTHROUGH);
    const r = await cliMain(["render_skill", "--project-root", "/p", "--skill", WALKTHROUGH, ...argv], fs);
    if (r.exitCode !== 0) return { ...r, body: "" };
    const dest = r.stdout.trim().replace(/^read and follow /, "").replace(/\/workflow\.md$/, "");
    return { ...r, body: await fs.readText(`${dest}/workflow.md`) };
  }

  it("applies the two-token form the call sites write, changing the render", async () => {
    const plain = await render([]);
    const set = await render(["--set", `${OVERRIDE}=smoke marker`]);
    expect(plain.exitCode).toBe(0);
    expect(set.exitCode).toBe(0);
    expect(plain.body).not.toContain("smoke marker");
    expect(set.body).toContain("smoke marker");
    expect(set.body).not.toBe(plain.body);
  });

  it("applies the `--set=k=v` and single quoted-token forms", async () => {
    const equals = await render([`--set=${OVERRIDE}=equals form`]);
    expect(equals.exitCode).toBe(0);
    expect(equals.body).toContain("equals form");

    const quoted = await render([`--set ${OVERRIDE}=quoted form`]);
    expect(quoted.exitCode).toBe(0);
    expect(quoted.body).toContain("quoted form");
  });

  it("keeps `=` inside the value, splitting at the first one only", async () => {
    const r = await render(["--set", `${OVERRIDE}=keeps=equals`]);
    expect(r.exitCode).toBe(0);
    expect(r.body).toContain("keeps=equals");
  });

  it("refuses a malformed assignment with the Python's HALT line", async () => {
    const r = await render(["--set", "noequals"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("HALT: invalid --set assignment 'noequals'; expected bare dotted key=value\n");
  });
});
