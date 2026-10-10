import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tickets } from "../tickets";
import { memFs, type Fs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

/**
 * Every golden here was captured from the pinned Python
 * (`src-tauri/resources/bmad-v6/skills/bmad-ticket/scripts/tickets.py`) by
 * `goldens/tickets/capture.sh`, which records the exact seed and command behind
 * each file and rewrites the capture project root to `/p` so these tests can
 * rebuild the same tree in memFs. Where the port disagrees with a golden, the
 * port changes.
 */
const golden = async (name: string) =>
  JSON.parse(await readFile(join(__dirname, "goldens/tickets", name), "utf8"));

const goldenText = (name: string) => readFile(join(__dirname, "goldens/tickets", name), "utf8");

/** The code the captured command exited with: the golden's other half. */
const goldenExit = async (name: string) => Number((await goldenText(`${name}.exit`)).trim());

/** Local calendar date, as Python's `date.today()` prints it. */
const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A golden captured on one day, with its captured date moved to today. */
async function goldenAtToday(name: string): Promise<string> {
  const raw = await goldenText(name);
  const captured = /\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
  return captured ? raw.replaceAll(captured, today()) : raw;
}

/** The epic's `tickets.toml` plus the second entry capture.sh's seed adds:
 * complete criteria, an unknown, and no leaf file or plan yet. */
const SECOND_ENTRY = `\n[[entry]]
id = 2
type = "story"
title = "Second"
description = "The second thing."
verify = "It works."
covers = ["R1"]
after = [1]
hitl = true
risk = "low"
estimate = 2
refine = true
unknown = "Which host?"
references = ["SPINE.md#ad-8"]
notes = ["Reuse the mailer."]
`;

const MISSING_AFTER_ENTRY = `\n[[entry]]
id = 2
type = "story"
title = "Second"
after = [9]
`;

const REPO = join(__dirname, "../../../..");
const epicToml = (root: string) => `${root}/_bmad-output/initiative-demo/epic-demo/tickets.toml`;
const instanceDir = (root: string) => `${root}/_bmad-output/initiative-demo`;
const epicDir = (root: string) => `${instanceDir(root)}/epic-demo`;

/** The golden tree: one epic (id 1, folder epic-demo) holding one story (id 1) with leaf and plan. */
const seedDemoTree = (fs: Fs, root = "/p") =>
  seedTicketTree(fs, root, {
    epics: [{ id: 1, slug: "demo" }],
    stories: [{ id: 1, slug: "demo", parent: "epic-demo" }],
  });

/** seedTicketTree plus the store config that names a tracker store. */
async function seedTrackerStore(fs: Fs, root: string, store: string): Promise<void> {
  await seedDemoTree(fs, root);
  await fs.writeText(`${root}/_bmad/custom/ticketing-store-config.toml`, `[tickets]\nstore = "${store}"\n`);
}

describe("tickets port", () => {
  it("matches Python on an empty project (next)", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await tickets(["next", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("next-empty.json"));
  });

  it("matches Python status on a seeded tree", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [{ id: 1, slug: "demo" }], stories: [{ id: 1, slug: "demo", parent: "epic-demo" }] });
    const r = await tickets(["status", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("status-seeded.json"));
  });

  it("matches Python next on a seeded tree, byte for byte", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    const r = await tickets(["next", "--project-root", "/p"], fs);
    expect(r.stdout).toBe(await goldenText("next-seeded.json"));
    expect(r.exitCode).toBe(0);
  });

  it("rejects an after-reference to a ticket that does not exist, like Python", async () => {
    // The brief's third test ran `pull --project-root /p 2` on an empty tree and
    // looked for "after"; the Python cannot answer that way — that argv is an
    // argparse refusal with no tree loaded (asserted in the next test). The
    // after-validation the test names is exercised here on the tree the Python
    // refuses: an entry whose `after` names no entry.
    const fs = memFs();
    await seedDemoTree(fs);
    await fs.writeText(epicToml("/p"), (await fs.readText(epicToml("/p"))) + MISSING_AFTER_ENTRY);
    const r = await tickets(["status", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(await goldenExit("after-missing-entry"));
    expect(r.stdout).toContain("after");
    expect(JSON.parse(r.stdout)).toEqual(await golden("after-missing-entry.json"));
  });

  it("refuses the brief's argv shape exactly as Python's argparse does", async () => {
    const fs = memFs();
    await seedTicketTree(fs, "/p", { epics: [], stories: [] });
    const r = await tickets(["pull", "--project-root", "/p", "2"], fs);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toMatch(/usage: tickets\.py/);
  });

  it("matches Python find of an entry that has no leaf file yet", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    const r = await tickets(["find", "--project-root", "/p", epicDir("/p"), "1"], fs);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("find-entry.json"));
  });

  it("matches Python pull and writes the leaf file the Python writes", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    await fs.writeText(epicToml("/p"), (await fs.readText(epicToml("/p"))) + SECOND_ENTRY);
    const r = await tickets(["pull", "--project-root", "/p", epicDir("/p"), "2"], fs);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe(await goldenText("pull.json"));
    expect(await fs.readText(`${epicDir("/p")}/story-second.md`)).toBe(await goldenText("pull-leaf.md"));
  });

  it("matches Python find after a pull", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    await fs.writeText(epicToml("/p"), (await fs.readText(epicToml("/p"))) + SECOND_ENTRY);
    await tickets(["pull", "--project-root", "/p", epicDir("/p"), "2"], fs);
    const r = await tickets(["find", "--project-root", "/p", epicDir("/p"), "2"], fs);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("find-pulled.json"));
  });

  it("matches Python mark done on the plan it joins, and edits that plan", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    const r = await tickets(["mark", "--project-root", "/p", epicDir("/p"), "1", "done"], fs);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("mark-done.json"));
    expect(await fs.readText(`${epicDir("/p")}/story-1-plan.md`)).toBe(
      "---\nticket: 1\nstatus: done\n---\n# Plan\n",
    );
  });

  it("matches Python mark that creates a frontmatter-only plan", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    await fs.writeText(epicToml("/p"), (await fs.readText(epicToml("/p"))) + SECOND_ENTRY);
    const r = await tickets(["mark", "--project-root", "/p", epicDir("/p"), "2", "blocked", "--blocked", "legal"], fs);
    expect(r.exitCode).toBe(await goldenExit("mark-created"));
    expect(JSON.parse(r.stdout)).toEqual(JSON.parse(await goldenAtToday("mark-created.json")));
    expect(await fs.readText(`${epicDir("/p")}/story-second-plan.md`)).toBe(
      await goldenAtToday("mark-created-plan.md"),
    );
  });

  it("refuses a tracker store for next, like Python", async () => {
    const fs = memFs();
    await seedTrackerStore(fs, "/p", "jira");
    const r = await tickets(["next", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(await goldenExit("tracker-store-refusal"));
    expect(JSON.parse(r.stdout)).toEqual(await golden("tracker-store-refusal.json"));
  });

  it("refuses a project with no config, like Python", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad/custom");
    const r = await tickets(["next", "--project-root", "/p"], fs);
    expect(r.exitCode).toBe(await goldenExit("next-unseeded-refusal"));
    // The Python's message comes from the project's own config_utils.py, which
    // the port replaces with the Task 3 resolver: same refusal, different words.
    expect(r.stdout).toContain("config.toml");
  });

  it("mirrors what a tracker returned, pulling first, with an explicit stdin", async () => {
    const fs = memFs();
    await seedTrackerStore(fs, "/p", "jira");
    await fs.writeText(epicToml("/p"), (await fs.readText(epicToml("/p"))) + SECOND_ENTRY);
    const r = await tickets(
      ["mirror", "--project-root", "/p", epicDir("/p")],
      fs,
      JSON.stringify([{ ref: 2, tracker_id: "42", tracker_status: "in-progress", assignee: "ann" }]),
    );
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      folder: "epic-demo",
      store: "jira",
      mirrored: [{ ref: "2", file: "story-second.md", pulled: true, set: ["assignee", "tracker_id", "tracker_status"] }],
      unmatched: [],
    });
    const leaf = await fs.readText(`${epicDir("/p")}/story-second.md`);
    expect(leaf).toContain('\ntracker_id: "42"\n');
    expect(leaf).toContain("\ntracker_status: in-progress\n");
    expect(leaf).toContain('\nassignee: "ann"\n');
  });

  it("refuses to mirror on the repo store, like Python", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    const r = await tickets(["mirror", "--project-root", "/p", epicDir("/p")], fs, "[]");
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain("no tracker");
  });

  it("keeps a plan's CRLF endings and byte-order mark, like Python", async () => {
    // Verified byte for byte against the Python before this test was written:
    // `edit_frontmatter` decodes utf-8-sig, edits LF text, then puts the CRLF
    // endings and the BOM back.
    const fs = memFs();
    await seedDemoTree(fs);
    const plan = `${epicDir("/p")}/story-1-plan.md`;
    await fs.writeText(plan, "﻿" + "---\ntitle: 'x'\nticket: 1\nstatus: 'in-progress'\n---\n# x\n".replace(/\n/g, "\r\n"));
    const r = await tickets(["mark", "--project-root", "/p", epicDir("/p"), "1", "done"], fs);
    expect(r.exitCode).toBe(0);
    const written = await fs.readText(plan);
    expect(written.startsWith("﻿")).toBe(true);
    expect(written).toContain("\r\nstatus: done\r\n");
    expect(written.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("keeps a leaf's CRLF endings when it mirrors, like Python", async () => {
    const fs = memFs();
    await seedTrackerStore(fs, "/p", "jira");
    const leaf = `${epicDir("/p")}/story-1.md`;
    await fs.writeText(
      leaf,
      '---\nid: 1\ntype: story\ntitle: "x"\ntracker_id: "41"\nafter: []\nhitl: false\n---\n# x\n'.replace(/\n/g, "\r\n"),
    );
    const r = await tickets(["mirror", "--project-root", "/p", epicDir("/p")], fs, JSON.stringify([{ tracker_id: "41", tracker_status: "done" }]));
    expect(r.exitCode).toBe(0);
    const written = await fs.readText(leaf);
    expect(written).toContain("\r\ntracker_status: done\r\n");
    expect(written.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("read_store port", () => {
  const STARTERS_DIR = join(REPO, "src-tauri/resources/bmad-v6/skills/bmad-ticket/config");

  /** The Python's starters live beside its script, at `<skill-root>/config`; copy
   * the vendored ones into memFs so the port reads them through the same Fs. */
  async function seedStarters(fs: Fs, skillRoot: string): Promise<void> {
    await fs.mkdir(`${skillRoot}/config`);
    for (const name of await readdir(STARTERS_DIR)) {
      await fs.writeText(
        `${skillRoot}/config/${name}`,
        await readFile(join(STARTERS_DIR, name), "utf8"),
      );
    }
  }

  it("matches Python's merged tickets table", async () => {
    const fs = memFs();
    await seedDemoTree(fs);
    await seedStarters(fs, "/p/skill");
    const r = await tickets(["read_store", "--project-root", "/p", "-k", "tickets", "--skill-root", "/p/skill"], fs);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("read-store-tickets.json"));
  });

  it("lists the shipped starters like Python", async () => {
    // The starters are the vendored skill's own files: no memFs seed needed.
    const { realFs } = await import("../fs");
    const r = await tickets(["read_store", "--starters", "--starters-dir", STARTERS_DIR], realFs());
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(await golden("read-store-starters.json"));
  });
});
