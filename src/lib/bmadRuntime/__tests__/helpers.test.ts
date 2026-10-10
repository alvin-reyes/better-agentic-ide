import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as helpers from "../helpers";
import { cliMain } from "../cli";
import { memFs, realFs, type Fs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

/**
 * Every golden in `goldens/helpers` was captured from the pinned Python by
 * `goldens/helpers/capture.sh`, which records the seed, the command, the argv
 * the patched call site writes, both streams and any files the shape wrote.
 * The loop below replays the recorded argv over the same tree rebuilt in memFs
 * under `/p` and compares stdout, the exit code and every recorded write, byte
 * for byte. Where a port disagrees with a golden, the port changes.
 *
 * The plan's sketch seeded only a ticket tree; a ticket tree cannot answer for
 * a CSV catalog, a skills root, a transcript or a git history, so `seed()`
 * below builds the whole tree capture.sh builds — including the plan's
 * `seedTicketTree` line, whose `_bmad/config.toml` every one of these scripts
 * reads exactly as it writes it.
 */

const REPO = join(__dirname, "../../../..");
const SKILLS = join(REPO, "src-tauri/resources/bmad-v6/skills");
const GOLDENS = join(__dirname, "goldens/helpers");
const SEED = join(GOLDENS, "seed");

/**
 * The exports this task ships: one per skill-root script with a Python source
 * at the pin, named by its stem in camelCase. The brief's list also named `go`
 * and `x`; neither is a script — `go.py` and `x.py` appear only as placeholder
 * names in the patcher's own comment and test fixtures (no file, no call site,
 * nothing to port). The controller's ruling dropped them from the patcher's
 * `PORTED` set and from the plan's lists too, so the set below is exactly what
 * the tree can dispatch, and a future pin that grows one fails the patcher
 * loudly rather than arriving here unported.
 */
const PORTS = [
  "reconKit",
  "initSkill",
  "brain",
  "processTemplate",
  "wake",
  "scanScripts",
  "scanPaths",
  "resolveParty",
  "scanLegacyModule",
  "registry",
  "readSessionLog",
  "pickMethods",
  "listCustomizableSkills",
  "lintSpine",
  "resolvePersonas",
  "runTriggers",
  "gitEvidence",
] as const;

type Golden = {
  argv: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  files: Record<string, string>;
};

const golden = async (name: string): Promise<Golden> =>
  JSON.parse(await readFile(join(GOLDENS, `${name}.json`), "utf8"));

/** The seed tree, read off disk once: 69 goldens each need a fresh Fs, and
 * re-reading the same files per golden is the loop's whole cost. */
let seedTree: Promise<{ dirs: string[]; files: [string, string][] }> | null = null;

function loadSeedTree(): Promise<{ dirs: string[]; files: [string, string][] }> {
  const dirs: string[] = ["/", "/p"];
  const files: [string, string][] = [];
  const walk = async (from: string, at: string, replace?: [string, string]): Promise<void> => {
    dirs.push(at);
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const path = `${from}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, `${at}/${entry.name}`, replace);
      else {
        const body = await readFile(path, "utf8");
        files.push([`${at}/${entry.name}`, replace ? body.split(replace[0]).join(replace[1]) : body]);
      }
    }
  };
  return (async () => {
    await walk(SEED, "/p", ["@ROOT@", "/p"]);
    await walk(join(SKILLS, "bmad-party-mode"), "/p/skills/bmad-party-mode");
    return { dirs, files };
  })();
}

/**
 * capture.sh's seed, mirrored: the ticket tree (the project config and store
 * folder), `seed/` with `@ROOT@` rewritten to the memFs project root, and the
 * one vendored skill folder the two collective resolvers read beside their own
 * (`bmad-party-mode`, for its `customize.toml` workflow surface).
 */
async function seed(fs: Fs): Promise<void> {
  await seedTicketTree(fs, "/p", { epics: [], stories: [] });
  const tree = await (seedTree ??= loadSeedTree());
  for (const dir of tree.dirs) await fs.mkdir(dir);
  for (const [path, body] of tree.files) await fs.writeText(path, body);
}

/** The golden shapes that need a tree the shape before them left behind. */
const PRE: Record<string, (fs: Fs) => Promise<void>> = {
  // capture.sh ran this refusal after `initSkill-create` had scaffolded the
  // folder; a fresh Fs per golden needs the folder put back.
  "initSkill-create-exists": async (fs) => {
    await fs.mkdir("/p/out/bmad-new");
  },
};

/**
 * The shapes this loop cannot replay, with the test that does. `gitEvidence`
 * measures a real repository: git reads the disk itself, so a memFs tree under
 * `/p` is invisible to it — the dedicated test below rebuilds the same pinned
 * history and compares against the same golden.
 */
const REAL_DISK: Record<string, string> = {
  "gitEvidence-range": "gitEvidence over a real repository",
};

/**
 * The pinned demo history (`seed-git-demo.sh`), rebuilt in a fresh temp folder:
 * the golden and the call-site test both measure this repository, and its shas
 * are the captured ones because the recipe pins identity, dates and locale.
 */
async function buildGitDemo(): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { mkdtemp } = await import("node:fs/promises");
  const repo = join(await mkdtemp(join(tmpdir(), "ade-gitdemo-")), "git-demo");
  await new Promise<void>((resolve, reject) =>
    execFile("bash", [join(GOLDENS, "seed-git-demo.sh"), repo], (error) => (error ? reject(error) : resolve())),
  );
  return repo;
}

describe("helper script ports", () => {
  it("matches Python for every captured golden", async () => {
    const names = (await readdir(GOLDENS)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
    // One golden per port, at least: a port that lost its capture would go
    // unnoticed if the directory were merely non-empty.
    for (const port of PORTS) expect(names.some((n) => n === port || n.startsWith(`${port}-`)), `no golden for ${port}`).toBe(true);
    expect(names.length).toBeGreaterThanOrEqual(PORTS.length);

    for (const name of names) {
      const [port] = name.split("-");
      const expected = await golden(name);
      const fn = (helpers as Record<string, (argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>>)[port];
      expect(fn, `no port named ${port} (golden ${name})`).toBeDefined();
      if (name in REAL_DISK) continue;

      const fs = memFs();
      await seed(fs);
      await PRE[name]?.(fs);

      const r = await fn!(expected.argv, fs);
      expect(r.exitCode, `${name} exit code`).toBe(expected.exitCode);
      expect(r.stdout, `${name} stdout`).toBe(expected.stdout);
      for (const [path, body] of Object.entries(expected.files)) {
        expect(await fs.readText(path), `${name} wrote ${path}`).toBe(body);
      }
    }
    // 69 goldens over 17 ports, each in its own memFs.
  }, 120_000);

  it("covers every real-disk shape with a test of its own", () => {
    for (const [name, covered] of Object.entries(REAL_DISK)) expect(covered, name).toBeTruthy();
  });

  it("exports every script-backed helper the tree dispatches", () => {
    for (const name of PORTS) expect(typeof (helpers as Record<string, unknown>)[name], name).toBe("function");
  });
});

describe("refusals the Python printed through argparse", () => {
  // argparse's usage text is not reproduced (capture.sh's header): a refusal
  // answers `<script>: error: <message>`, exit 2, the Task 6 convention.
  const refusal = async (name: string, argv: string[], contains: string) => {
    const fn = (helpers as Record<string, (argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>>)[name];
    const r = await fn!(argv, memFs());
    expect(r.exitCode, name).toBe(2);
    expect(r.stdout, name).toContain(contains);
  };

  it("reports a missing required flag instead of crashing", async () => {
    await refusal("reconKit", [], "required");
    await refusal("initSkill", [], "--name");
    await refusal("listCustomizableSkills", [], "--project-root");
    await refusal("resolveParty", [], "--project-root");
    await refusal("gitEvidence", ["--repo", "/p", "--range", "HEAD"], "invalid --range");
  });

  it("refuses the patched --skill-root with no value rather than eating the next argument", async () => {
    await refusal("processTemplate", ["--skill-root"], "argument --skill-root: expected one argument");
    await refusal("gitEvidence", ["--skill-root"], "argument --skill-root: expected one argument");
  });

  it("reports a path that is not a directory the way the pin did", async () => {
    await refusal("scanPaths", ["/p/nope"], "not a directory: /p/nope");
    await refusal("scanScripts", ["/p/nope"], "not a directory: /p/nope");
    await refusal("scanLegacyModule", ["/p/nope"], "not a directory: /p/nope");
    await refusal("initSkill", ["--check", "/p/nope"], "not a directory: /p/nope");
  });

  it("refuses an unknown --allow rule with the pin's own list", async () => {
    const fs = memFs();
    await seed(fs);
    const r = await helpers.scanPaths(["--allow", "nope", "/p/skills/bmad-alpha"], fs);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain("unknown rule(s): nope; rules: ");
  });
});

describe("the pickMethods and brain draws", () => {
  // A random draw cannot be a byte golden; the seed is what is checked.
  it("draws from the catalog, distinct rows, and never beyond the pool", async () => {
    const fs = memFs();
    await seed(fs);
    const r = await helpers.pickMethods(["--file", "/p/catalog/methods.csv", "random", "-n", "2", "--spread"], fs);
    expect(r.exitCode).toBe(0);
    const rows = r.stdout.split("\n").filter(Boolean);
    expect(rows).toHaveLength(2);
    const nums = rows.map((row) => row.split("\t")[0]);
    expect(new Set(nums).size).toBe(2);
    for (const num of nums) expect(["1", "2", "3", "4", "5"]).toContain(num);

    const over = await helpers.pickMethods(["--file", "/p/catalog/methods.csv", "random", "-n", "99"], fs);
    expect(over.exitCode).toBe(0);
    const all = JSON.parse((await helpers.pickMethods(["--file", "/p/catalog/methods.csv", "--json", "list", "--all"], fs)).stdout);
    expect(over.stdout.split("\n").filter(Boolean)).toHaveLength(all.length);
  });

  it("refuses to dump the whole catalog without the deliberate flag", async () => {
    const fs = memFs();
    await seed(fs);
    for (const run of [
      helpers.pickMethods(["--file", "/p/catalog/methods.csv", "list"], fs),
      helpers.brain(["--file", "/p/catalog/brain.csv", "list"], fs),
    ]) {
      const r = await run;
      expect(r.exitCode).toBe(2);
      expect(r.stdout).toContain("needs --category");
    }
  });

  it("names the technique file the Python could not find", async () => {
    const fs = memFs();
    await seed(fs);
    const brain = await helpers.brain(["--file", "/p/catalog/nope.csv", "categories"], fs);
    expect(brain.exitCode).toBe(2);
    expect(brain.stdout).toBe("error: technique file not found: /p/catalog/nope.csv\n");
  });
});

describe("runTriggers against a real harness", () => {
  // The runner's run tree is real disk (a subprocess cannot see a memFs), so
  // these build a throwaway project there. A shell stand-in for the model CLI
  // is the harness: it prints the staged skill, canary included, exactly as a
  // harness that loaded the skill would.
  const tree = async (): Promise<{ root: string; skill: string; queries: string; out: string }> => {
    const { mkdtemp } = await import("node:fs/promises");
    const root = await mkdtemp(join(tmpdir(), "ade-triggers-"));
    const skill = join(root, "skills", "bmad-demo");
    await (await import("node:fs/promises")).mkdir(skill, { recursive: true });
    await (await import("node:fs/promises")).writeFile(
      join(skill, "SKILL.md"),
      "---\nname: bmad-demo\ndescription: Use when a demo is wanted.\n---\n\n# Demo\n",
      "utf8",
    );
    const queries = join(root, "queries.json");
    await (await import("node:fs/promises")).writeFile(
      queries,
      JSON.stringify([
        { query: "demo something for me", should_trigger: true },
        { query: "what is the capital of Peru", should_trigger: false },
      ]),
      "utf8",
    );
    return { root, skill, queries, out: join(root, "out") };
  };

  it("skips the run, records it and answers 3 when no harness is recorded", async () => {
    const { root, skill, queries, out } = await tree();
    try {
      const r = await helpers.runTriggers(
        ["--skill-path", skill, "--queries", queries, "--output-dir", out],
        realFs(),
      );
      expect(r.exitCode).toBe(3);
      const answer = JSON.parse(r.stdout);
      expect(answer.status).toBe("skipped");
      expect(answer.reason).toBe("no harness recorded");
      expect(answer.summary).toEqual({ total: 2, passed: 0, failed: 0, unmeasured: 2 });
      // The run folder is stamped with the wall clock; what it holds is fixed.
      const runs = await readdir(out);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatch(/^\d{8}-\d{6}-bmad-demo-triggers$/);
      const recorded = JSON.parse(await readFile(join(out, runs[0], "run.json"), "utf8"));
      expect(recorded.query_count).toBe(2);
      expect(recorded.harness).toBe("no project root");
      expect(answer.run_id).toBe(runs[0]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  /** The project's resolver merges the override layers deeply: a personal
   * `[workflow.harness] env` is a layer over the team's `command`, not a
   * replacement for the whole table. */
  it("merges the team and personal harness layers instead of replacing one with the other", async () => {
    const { root, skill, queries, out } = await tree();
    try {
      const fs = await import("node:fs/promises");
      await fs.mkdir(join(root, "_bmad", "custom"), { recursive: true });
      await fs.writeFile(
        join(root, "_bmad", "custom", "bmad-eval.toml"),
        '[workflow.harness]\ncommand = ["/bin/sh", "-c", \'printf %s "$ADE_MARKER"; printf %s "{prompt}" >/dev/null\', "{prompt}"]\n',
        "utf8",
      );
      await fs.writeFile(
        join(root, "_bmad", "custom", "bmad-eval.user.toml"),
        '[workflow.harness.env]\nADE_MARKER = "kept-from-the-team-command"\n',
        "utf8",
      );
      const r = await helpers.runTriggers(
        ["--skill-path", skill, "--queries", queries, "--output-dir", out, "--runs-per-query", "1"],
        realFs(),
      );
      expect(r.exitCode).toBe(0);
      const runs = await readdir(out);
      const run = JSON.parse(await readFile(join(out, runs[0], "run.json"), "utf8"));
      expect(run.harness).toBe("customization workflow.harness");
      expect(run.command).toEqual([
        "/bin/sh",
        "-c",
        'printf %s "$ADE_MARKER"; printf %s "{prompt}" >/dev/null',
        "{prompt}",
      ]);
      // The personal layer's env reached the run: the command printed it.
      const transcript = await readFile(join(out, runs[0], "queries", "q000-r1", "transcript.jsonl"), "utf8");
      expect(transcript).toContain("kept-from-the-team-command");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("stages a skill per attempt, detects the canary, and scores the queries", async () => {
    const { root, skill, queries, out } = await tree();
    try {
      const harness = join(root, "harness.json");
      await (await import("node:fs/promises")).writeFile(
        harness,
        JSON.stringify({
          command: ["/bin/sh", "-c", 'cat .agents/skills/*/SKILL.md; printf %s "{prompt}" >/dev/null', "{prompt}"],
          skill_dir: ".agents/skills",
        }),
        "utf8",
      );
      const r = await helpers.runTriggers(
        [
          "--skill-path", skill,
          "--queries", queries,
          "--output-dir", out,
          "--harness", harness,
          "--runs-per-query", "1",
        ],
        realFs(),
      );
      expect(r.exitCode).toBe(0);
      const answer = JSON.parse(r.stdout);
      expect(answer.summary).toEqual({ total: 2, passed: 1, failed: 1, unmeasured: 0 });
      expect(answer.results[0]).toMatchObject({ should_trigger: true, triggers: 1, runs: 1, pass: true });
      expect(answer.results[1]).toMatchObject({ should_trigger: false, triggers: 1, runs: 1, pass: false });

      // Every attempt keeps its own record, and the staged skill came back.
      const runs = await readdir(out);
      const attempt = join(out, runs[0], "queries", "q000-r1");
      const timing = JSON.parse(await readFile(join(attempt, "timing.json"), "utf8"));
      expect(timing.status).toBe("ok");
      expect(timing.loaded).toBe(true);
      expect(await readFile(join(attempt, "prompt.txt"), "utf8")).toContain("demo something for me");
      expect(await readFile(join(attempt, "transcript.jsonl"), "utf8")).toContain("TRIGGER-LOADED-");
      const staged = await readdir(join(attempt, "cwd", ".agents", "skills"));
      expect(staged[0]).toMatch(/^bmad-demo-trig-[0-9a-f]{8}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("the dialect pieces the ports had to bring themselves", () => {
  // These are the substitutions a bundle cannot share with the interpreter
  // (compat.ts): PyYAML's subset, the csv reader and the date arithmetic. A
  // golden exercises each of them through a port; this pins the shapes those
  // goldens do not carry — a `- key: value` entry, a folded block, a value the
  // row stops short of.
  it("reads the YAML dialect legacy module files are written in", async () => {
    const { loadYaml } = await import("../compat");
    const data = loadYaml(
      [
        "code: oldmod",
        "module_version: 1.2.0",
        "greeting: |",
        "  first line",
        "  second line",
        "notes: >",
        "  folded text",
        "  continues here",
        "flags: [plain, spicy]",
        "agents:",
        "  - analyst",
        "  - architect",
        "keys:",
        "  - key: nested",
        "    value: 2",
        "empty:",
      ].join("\n"),
    ) as Record<string, unknown>;
    expect(data.code).toBe("oldmod");
    expect(data.module_version).toBe("1.2.0");
    expect(data.greeting).toBe("first line\nsecond line\n");
    expect(data.notes).toBe("folded text continues here\n");
    expect(data.flags).toEqual(["plain", "spicy"]);
    expect(data.agents).toEqual(["analyst", "architect"]);
    expect(data.keys).toEqual([{ key: "nested", value: 2 }]);
    expect(data.empty).toBeNull();
  });

  /** PyYAML reads a flow collection wherever a value goes: `key: {a: 1}` is a
   * mapping entry whose value is a flow mapping, and `- {a: 1}` a one-entry
   * sequence. The block-mapping refusal is for an inline `key: a: b` only. */
  it("reads flow mappings and sequences as values", async () => {
    const { loadYaml } = await import("../compat");
    expect(loadYaml("key: {a: 1}\n")).toEqual({ key: { a: 1 } });
    expect(loadYaml("key: {a: 1, b: [2, 3]}\n")).toEqual({ key: { a: 1, b: [2, 3] } });
    expect(loadYaml("- {a: 1}\n")).toEqual([{ a: 1 }]);
    expect(loadYaml("key: [1, 2]\n")).toEqual({ key: [1, 2] });
    expect(loadYaml("key:\n  a: 1\n")).toEqual({ key: { a: 1 } });
    expect(() => loadYaml("key: a: b\n")).toThrow(/own line/);
  });

  /** The join is the host's, so Windows hands back `\` separators: the
   * containment test folds them, or every nested path "escapes" there. */
  it("covers Windows-shaped paths in the workspace containment test", async () => {
    const { contained, containedPath } = await import("../runTriggers");
    expect(containedPath("C:\\a\\repo", "C:\\a\\repo\\sub\\step.md")).toBe(true);
    expect(containedPath("C:\\a\\repo", "C:\\a\\repo")).toBe(true);
    expect(containedPath("C:\\", "C:\\a\\step.md")).toBe(true);
    expect(containedPath("C:\\a\\repo", "C:\\a\\other\\step.md")).toBe(false);
    expect(containedPath("C:\\a\\repo", "C:\\a\\repo2\\step.md")).toBe(false);
    expect(containedPath("/a/repo", "/a/repo/sub/step.md")).toBe(true);
    // The host's own join, on this host: `../evil` leaves the workspace.
    expect(contained("/root", "sub/step.md")).toBe("/root/sub/step.md");
    expect(() => contained("/root", "../evil")).toThrow(/escapes the workspace/);
  });

  /** A code is a dict key: `constructor`, `toString` and `__proto__` are codes
   * like any other, and assigning one must not hit Object.prototype instead. */
  it("keeps a party code that Object.prototype also carries", async () => {
    const { buildCollective } = await import("../resolveParty");
    const { buildPool } = await import("../resolvePersonas");
    for (const code of ["constructor", "__proto__", "toString"]) {
      const agents = { [code]: { code, name: code, icon: "", title: "", description: "", persona: "", source: "installed" } };
      const collective = buildCollective(agents, [{ code }]);
      expect(Object.keys(collective.collective), code).toEqual([code]);
      expect(collective.collective[code], code).toMatchObject({ code });
      expect(collective.index.get(code), code).toBe(code);
      const pool = buildPool(agents, [{ code }]);
      expect(Object.keys(pool.pool), code).toEqual([code]);
      expect(pool.pool[code], code).toMatchObject({ code, source: "custom" });
    }
  });

  it("reads CSV the way csv.DictReader did", async () => {
    const { csvDictRows } = await import("../compat");
    const rows = csvDictRows('a,b,c\n1,"two, and a\nnewline",\n"",2\n');
    expect(rows).toEqual([
      { a: "1", b: "two, and a\nnewline", c: "" },
      { a: "", b: "2", c: null },
    ]);
  });

  it("writes a slashless --out path without inventing a folder", async () => {
    // `Path("page.html").parent` is the working directory: slicing before the
    // last `/` would make the junk folder `page.htm`.
    const fs = memFs();
    await seed(fs);
    const r = await helpers.brain(
      ["--file", "/p/catalog/brain.csv", "--extra", "/p/catalog/extra.json", "html", "--out", "page.html"],
      fs,
    );
    expect(r.exitCode).toBe(0);
    expect(await fs.exists("page.html")).toBe(true);
    expect(await fs.exists("page.htm")).toBe(false);
  });

  /** `wake`'s activity scan walks the sanctum: a directory that links back to an
   * ancestor is listed by the OS, so a walk without a visited set re-lists the
   * same folder under ever longer paths. The listing below stops answering
   * after 200 folders, so a missing guard fails the assertion instead of
   * hanging the test. */
  it("lists a symlinked directory in wake without descending into it", async () => {
    const base = memFs();
    await seed(base);
    const memory = "/p/_bmad/memory/demo-agent/memory";
    const link = `${memory}/loop`;
    const through = (p: string) =>
      p === link ? memory : p.startsWith(`${link}/`) ? `${memory}${p.slice(link.length)}` : p;
    const visited: string[] = [];
    const fs: Fs = {
      ...base,
      readText: (p) => base.readText(through(p)),
      writeText: (p, body) => base.writeText(through(p), body),
      append: (p, body) => base.append(through(p), body),
      exists: (p) => base.exists(through(p)),
      mkdir: (p) => base.mkdir(through(p)),
      delete: (p) => base.delete(through(p)),
      isSymlink: async (p) => p === link,
      list: async (p) => {
        visited.push(p);
        if (visited.length > 200) return [];
        const entries = await base.list(through(p));
        return p === memory && !entries.includes("loop") ? [...entries, "loop"] : entries;
      },
    };

    const r = await helpers.wake(["--skill-root", "/p/skills/demo-agent", "--pulse", "/p"], fs);
    expect(r.exitCode).toBe(0);
    // `is_dir()` follows the link, so the folder keeps its line (a link is
    // counted by what it lists); `rglob` never descends, so nothing below the
    // link is walked (its `sessions` subfolder gets no line).
    expect(r.stdout).toContain("memory/loop/ (");
    expect(r.stdout).not.toContain("memory/loop/sessions/");
    expect(visited.length).toBeLessThan(100);
  });

  /** `Path(positional).resolve()`: `.` is the folder the caller stands in, and
   * an empty root would aim the lookups at the filesystem root. */
  it("reads `--project-root .` as the working directory, never the filesystem root", async () => {
    const fs = memFs();
    await fs.mkdir("/_bmad/custom");
    await fs.writeText("/_bmad/custom/bmad-eval.toml", '[workflow.harness]\ncommand = ["/bin/sh", "{prompt}"]\n');
    await fs.mkdir("/p/skills/bmad-demo");
    await fs.writeText(
      "/p/skills/bmad-demo/SKILL.md",
      "---\nname: bmad-demo\ndescription: Use when a demo is wanted.\n---\n\n# Demo\n",
    );
    await fs.writeText("/p/queries.json", "[]");
    const { mkdtemp } = await import("node:fs/promises");
    const out = await mkdtemp(join(tmpdir(), "ade-triggers-dot-"));
    try {
      const r = await helpers.runTriggers(
        ["--skill-path", "/p/skills/bmad-demo", "--queries", "/p/queries.json", "--output-dir", out, "--project-root", "."],
        fs,
      );
      // The harness at the filesystem root is not this project's: the root is
      // the working directory, which has no `_bmad`.
      expect(r.exitCode).toBe(3);
      expect(JSON.parse(r.stdout).reason).toBe("no harness recorded");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it("counts months the way the Python's date arithmetic did", async () => {
    const { addMonths, formatDate, parseDate, compareDates } = await import("../compat");
    expect(formatDate(addMonths(parseDate("2024-01-31"), 1))).toBe("2024-02-29");
    expect(formatDate(addMonths(parseDate("2024-03"), 18))).toBe("2025-09-01");
    expect(compareDates(parseDate("2024-02-29"), parseDate("2024-03-01"))).toBeLessThan(0);
  });
});

describe("gitEvidence over a real repository", () => {
  // The Python's own tests measure a real temp repo; so does this one. The
  // recipe is committed as `seed-git-demo.sh` and pins identity, dates, config
  // and locale, so the rebuilt history has the same shas as the captured one.
  it("measures the same history the Python measured", async () => {
    const repo = await buildGitDemo();
    try {
      const expected = await golden("gitEvidence-range");
      const argv = expected.argv.map((arg) => (arg === "/p/git-demo" ? repo : arg));
      const r = await helpers.gitEvidence(argv, realFs());
      expect(r.exitCode).toBe(expected.exitCode);
      // The one difference the golden cannot carry: where the repo lives.
      expect(r.stdout).toBe(expected.stdout.split("/p/git-demo").join(repo));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

/**
 * The Task 1 patcher rewrites the vendored call sites to
 * `node {project-root}/_bmad/ade-runtime.mjs <script> --skill-root {skill-root} …`,
 * and the runtime CLI must accept every flag those call sites write. The argv
 * below is copied from the vendored call sites themselves (flags and order),
 * and replayed through `cliMain`, which is what `node _bmad/ade-runtime.mjs`
 * dispatches to.
 */
describe("the vendored call sites' argv through cliMain", () => {
  // bmad-retrospective/references/evidence-gathering.md:
  //   git_evidence --skill-root {skill-root} --repo {project-root} --range <range> --stories <story-ids>
  // The golden's argv is the same shape without the flag the patcher added.
  it("runs git_evidence with --skill-root first, as the evidence-gathering call site writes it", async () => {
    const repo = await buildGitDemo();
    try {
      const expected = await golden("gitEvidence-range");
      const r = await cliMain(
        [
          "git_evidence",
          "--skill-root", "/p/skills/bmad-retrospective",
          "--repo", repo,
          "--range", "main~3..main",
          "--stories", "story-1-1,story-1-2",
        ],
        realFs(),
      );
      expect(r.exitCode).toBe(expected.exitCode);
      expect(r.stdout).toBe(expected.stdout.split("/p/git-demo").join(repo));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  // bmad-toolsmith/shapes/{multi-skill-module,single-skill-module,memory-agent}/shape.md:
  //   process_template --skill-root {skill-root} <template> -o <dest> --var key=value … --true <condition> …
  it("runs process_template with --skill-root before the template, as the toolsmith shapes write it", async () => {
    const expected = await golden("processTemplate-out-files");
    const fs = memFs();
    await seed(fs);
    const r = await cliMain(
      [
        "process_template",
        "--skill-root", "/p/skills/bmad-toolsmith",
        "/p/recon/brief.md.tpl",
        "-o", "/p/out/brief.md",
        "--var", "topic=Product direction",
        "--true", "deep",
      ],
      fs,
    );
    expect(r.exitCode).toBe(expected.exitCode);
    expect(r.stdout).toBe(expected.stdout);
    for (const [path, body] of Object.entries(expected.files)) {
      expect(await fs.readText(path), `wrote ${path}`).toBe(body);
    }
  });
});
