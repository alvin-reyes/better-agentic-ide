import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { renderSkill, renderTemplate } from "../render";
import { memFs, type Fs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

/**
 * Every golden here was captured from the pinned Python
 * (`src-tauri/resources/bmad-v6/skills/bmad/scripts/render_skill.py`) by
 * `goldens/render/capture.sh`, which records the seed, the commands and the
 * rewrites behind each file. Where the port disagrees with a golden, the port
 * changes.
 *
 * The Python names the generation `<slug>-<root-hash>/<generation-hash>`, where
 * the generation hash is over the renderer's own bytes and jinja2's version —
 * two things a port cannot share. The test collapses that pair on both sides
 * (`normalizeSnapshots`) and pins the port's own shape separately, so every
 * other byte of the rendering still compares.
 */
const goldenText = (name: string) => readFile(join(__dirname, "goldens/render", name), "utf8");
const goldenExit = async (name: string) => Number((await goldenText(`${name}.exit`)).trim());

const REPO = join(__dirname, "../../../..");
const BUILD = join(REPO, "src-tauri/resources/bmad-v6/skills/bmad-build");
const WALKTHROUGH = join(REPO, "src-tauri/resources/bmad-v6/skills/bmad-walkthrough");

/** The Python's namespace and generation segments — `<slug>-<root-hash>/<hash>` —
 * collapse on both sides, whether they are followed by a path or end the line
 * (a refusal names the generation itself). */
const normalizeSnapshots = (text: string) =>
  text.replace(/(\/_bmad\/render\/[^/\s`"';]+\/)[^/\s`"';]+\/[^/\s`"';]+(?=\/|[\s`"';]|$)/g, "$1<snapshot>");

/** The generation directory the stdout line points at. */
const snapshotDir = (stdout: string) =>
  stdout.trim().replace(/^read and follow /, "").replace(/\/workflow\.md$/, "");

/** Every file under a directory, relative paths, sorted — over `Fs` alone,
 * which has no dirent types: the one probe both implementations answer is
 * `list` (the same probe the port's own source walk uses). */
async function walk(fs: Fs, dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const name of (await fs.list(dir)).sort()) {
    const path = `${dir}/${name}`;
    if (await isDirectory(fs, path)) out.push(...(await walk(fs, path, `${prefix}${name}/`)));
    else out.push(`${prefix}${name}`);
  }
  return out.sort();
}

async function isDirectory(fs: Fs, path: string): Promise<boolean> {
  try {
    await fs.list(path);
    return true;
  } catch {
    return false;
  }
}

/** The same listing over a golden directory. */
async function walkGolden(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(__dirname, "goldens/render", dir), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await walkGolden(`${dir}/${entry.name}`)).map((n) => `${entry.name}/${n}`));
    else out.push(entry.name);
  }
  return out.sort();
}

/** The seeded project, plus the vendored skill tree in the same `Fs`: the port
 * reads the skill's sources through the filesystem it is handed, so a test
 * filesystem has to hold them. */
async function seed(skillRoot?: string, root = "/p"): Promise<Fs> {
  const fs = memFs();
  await seedTicketTree(fs, root, { epics: [], stories: [] });
  if (skillRoot) await copyTree(skillRoot, fs, skillRoot);
  return fs;
}

async function copyTree(from: string, fs: Fs, at: string): Promise<void> {
  await fs.mkdir(at);
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) await copyTree(path, fs, `${at}/${entry.name}`);
    else await fs.writeText(`${at}/${entry.name}`, await readFile(path, "utf8"));
  }
}

const hex = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));

describe("render port", () => {
  it("publishes the Python's route=full generation, file for file", async () => {
    const fs = await seed(BUILD);
    const out = await renderSkill("/p", BUILD, { "workflow.route": "full" }, fs);

    expect(await goldenExit("build-full")).toBe(0);
    expect(normalizeSnapshots(out)).toBe(normalizeSnapshots(await goldenText("build-full.stdout")));
    // The port's own naming: <slug>-<root hash>/<generation hash>.
    expect(out).toMatch(/^read and follow \/p\/_bmad\/render\/bmad-build\/p-[0-9a-f]{12}\/[0-9a-f]{20}\/workflow\.md\n$/);

    const dest = snapshotDir(out);
    const published = await walk(fs, dest);
    // Same files as the Python — including the omitted step-oneshot.md, whose
    // body renders empty on route=full — and the manifest.
    expect(published).toEqual(await walkGolden("build-full"));

    for (const name of published) {
      if (name === "manifest.json") continue;
      expect(normalizeSnapshots(await fs.readText(`${dest}/${name}`)), name).toBe(
        normalizeSnapshots(await goldenText(`build-full/${name}`)),
      );
    }

    // Every snapshot path a rendered file names is a file this run published.
    const named = [...(await fs.readText(`${dest}/workflow.md`)).matchAll(/`([^`]*\/_bmad\/render\/[^`]+)`/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const path of named) expect(await fs.exists(path), path).toBe(true);

    // The manifest: the Python's shape and everything its identity shares with
    // the port — the resolved values and the source hashes — minus the
    // renderer's own bytes and jinja2's version, which only the Python has.
    const goldenManifest = JSON.parse(await goldenText("build-full/manifest.json"));
    const manifest = JSON.parse(await fs.readText(`${dest}/manifest.json`));
    expect(manifest.schema_version).toBe(goldenManifest.schema_version);
    expect(manifest.skill).toBe(goldenManifest.skill);
    expect(manifest.project_root).toBe(goldenManifest.project_root);
    expect(manifest.project_slug).toBe("p");
    expect(manifest.inputs.project_root).toBe(goldenManifest.inputs.project_root);
    expect(manifest.inputs.skill_root).toBe(BUILD);
    expect(manifest.inputs.renderer_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.inputs.template_engine).toBeTruthy();
    expect(manifest.inputs.resolved_values).toEqual(goldenManifest.inputs.resolved_values);
    expect(manifest.inputs.source_sha256).toEqual(goldenManifest.inputs.source_sha256);
    expect(Object.keys(manifest.outputs).sort()).toEqual(Object.keys(goldenManifest.outputs).sort());
    expect(manifest.generation_hash).toBe(dest.split("/").pop());
    expect(manifest.root_hash).toBe(dest.split("/").slice(-2, -1)[0].split("-").pop());
    expect(manifest.root_hash).toHaveLength(12);
    for (const [name, hash] of Object.entries(manifest.outputs)) {
      expect(hash, name).toBe(hex(await fs.readText(`${dest}/${name}`)));
    }
  });

  it("publishes the bmad-walkthrough generation with no override", async () => {
    const fs = await seed(WALKTHROUGH);
    const out = await renderSkill("/p", WALKTHROUGH, {}, fs);
    expect(await goldenExit("walkthrough")).toBe(0);
    expect(normalizeSnapshots(out)).toBe(normalizeSnapshots(await goldenText("walkthrough.stdout")));
    const dest = snapshotDir(out);
    expect(await walk(fs, dest)).toEqual(await walkGolden("walkthrough"));
    for (const name of await walkGolden("walkthrough")) {
      if (name === "manifest.json") continue;
      expect(normalizeSnapshots(await fs.readText(`${dest}/${name}`)), name).toBe(
        normalizeSnapshots(await goldenText(`walkthrough/${name}`)),
      );
    }
    // `{% raw %}`: the review-log template keeps the agent's own placeholders.
    expect(await fs.readText(`${dest}/templates/log-template.md`)).toContain("{{review_identifier}}");
  });

  it("reuses the generation it already published", async () => {
    const fs = await seed(BUILD);
    const first = await renderSkill("/p", BUILD, { "workflow.route": "full" }, fs);
    const dest = snapshotDir(first);
    const before = await fs.readText(`${dest}/step-01-clarify-and-route.md`);
    const second = await renderSkill("/p", BUILD, { "workflow.route": "full" }, fs);
    expect(second).toBe(first);
    expect(await fs.readText(`${dest}/step-01-clarify-and-route.md`)).toBe(before);
  });

  it("halts on a generation that lost a rendered file", async () => {
    const fs = await seed(BUILD);
    const dest = snapshotDir(await renderSkill("/p", BUILD, { "workflow.route": "full" }, fs));
    await fs.delete(`${dest}/step-01-clarify-and-route.md`);
    const out = await renderSkill("/p", BUILD, { "workflow.route": "full" }, fs);
    expect(await goldenExit("build-missing-output")).toBe(1);
    expect(normalizeSnapshots(out)).toBe(normalizeSnapshots(await goldenText("build-missing-output.stdout")));
    expect(out).toContain("deleting that folder is safe");
  });

  it("halts with the Python's own line and publishes nothing", async () => {
    const cases: [string, Record<string, string>][] = [
      ["build-bogus-route", { "workflow.route": "bogus" }],
      ["build-unknown-set", { "workflow.selector": "nope" }],
      ["build-unused-set", { "workflow.route": "full", "workflow.route_selection": "choose-it" }],
    ];
    for (const [name, set] of cases) {
      const fs = await seed(BUILD);
      expect(await renderSkill("/p", BUILD, set, fs), name).toBe(await goldenText(`${name}.stdout`));
      expect(await goldenExit(name), name).toBe(1);
      expect(await fs.exists("/p/_bmad/render/bmad-build"), name).toBe(false);
    }
  });

  it("halts on a persistent override the skill does not declare", async () => {
    const fs = await seed(BUILD);
    await fs.writeText("/p/_bmad/custom/bmad-build.toml", "[workflow]\non_compleet = \"typo\"\n");
    expect(await renderSkill("/p", BUILD, {}, fs)).toBe(await goldenText("build-undeclared-custom.stdout"));
    expect(await goldenExit("build-undeclared-custom")).toBe(1);
  });

  it("halts rather than throwing when the project or the skill is not set up", async () => {
    // Same refusals as the Python, in this port's own words: a project with no
    // _bmad/config.toml refuses through Task 3's resolver, and a skill
    // directory that is not there refuses through the filesystem. Both print a
    // HALT line, which is what the bootstrap in a skill's SKILL.md reads.
    const bare = memFs();
    await bare.mkdir("/p/_bmad/custom");
    await copyTree(BUILD, bare, BUILD);
    expect(await renderSkill("/p", BUILD, {}, bare)).toContain("config.toml");
    expect(await goldenExit("build-unconfigured")).toBe(1);
    expect(await goldenText("build-unconfigured.stdout")).toMatch(/^HALT: /);

    const fs = await seed(BUILD);
    const out = await renderSkill("/p", `${BUILD}-nope`, {}, fs);
    expect(out).toMatch(/^HALT: /);
    expect(out).toContain("bmad-build-nope");
    expect(await goldenExit("build-missing-skill")).toBe(1);
  });
});

describe("renderTemplate", () => {
  it("interpolates dotted paths, and an absent one refuses like StrictUndefined", () => {
    expect(renderTemplate("a {{ config.core.active_initiative }} b", { config: { core: { active_initiative: "demo" } } })).toBe("a demo b");
    expect(() => renderTemplate("{{ config.nope }}", { config: {} })).toThrow("'config.nope' is undefined");
  });

  it("takes if / elif / else, and Python's truthiness", () => {
    const tpl = '{% if workflow.route == "full" %}F{% elif workflow.route == "oneshot" %}O{% else %}A{% endif %}';
    expect(renderTemplate(tpl, { workflow: { route: "full" } })).toBe("F");
    expect(renderTemplate(tpl, { workflow: { route: "oneshot" } })).toBe("O");
    expect(renderTemplate(tpl, { workflow: { route: "auto" } })).toBe("A");
    const guard = "{% if workflow.empty %}yes{% else %}no{% endif %}";
    for (const empty of ["", 0, false, null, [], {}]) expect(renderTemplate(guard, { workflow: { empty } })).toBe("no");
    expect(renderTemplate(guard, { workflow: { empty: "x" } })).toBe("yes");
  });

  it("loops a list, and a string is not one", () => {
    expect(renderTemplate("{% for item in workflow.items %}<{{ item }}>{% endfor %}", { workflow: { items: ["a", "b"] } })).toBe("<a><b>");
    expect(renderTemplate("{% for item in workflow.items %}<{{ item }}>{% endfor %}", { workflow: { items: [] } })).toBe("");
    expect(() => renderTemplate("{% for item in workflow.items %}{{ item }}{% endfor %}", { workflow: { items: "ab" } })).toThrow(
      "`workflow.items` is a string, not a list",
    );
  });

  it("binds set, joins with ~, and trims block-tag lines the way the pinned sources are written", () => {
    expect(renderTemplate('{% set mode = "quick" %}review {{ mode }}', {})).toBe("review quick");
    expect(renderTemplate('{{ "a" ~ 1 ~ config.x }}', { config: { x: "!" } })).toBe("a1!");
    // `trim_blocks` + `lstrip_blocks`: a guard line of its own leaves nothing.
    expect(renderTemplate('{% if workflow.on %}\nrun\n{% endif %}\nend', { workflow: { on: true } })).toBe("run\nend");
    expect(renderTemplate('{% if workflow.on %}\nrun\n{% endif %}\nend', { workflow: { on: false } })).toBe("end");
  });

  it("passes {% raw %} through untouched", () => {
    expect(renderTemplate("{% raw %}{{keep}}{{ this }}{% endraw %} after", {})).toBe("{{keep}}{{ this }} after");
  });
});
