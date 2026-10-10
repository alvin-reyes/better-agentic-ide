import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { memlog } from "../memlog";
import { memFs, type Fs } from "../fs";
import { seedTicketTree } from "./fixtures/ticketTree";

/**
 * Every golden here was captured from the pinned Python
 * (`src-tauri/resources/bmad-v6/skills/bmad/scripts/memlog.py`) by
 * `goldens/render/capture.sh`, which records the seed and the commands behind
 * each file, and rewrites the capture workspace to `/p`. Where the port
 * disagrees with a golden, the port changes: the checks that exit non-zero
 * compare against the Python's own stderr text (the port has one output
 * channel, stdout), and the two crash tails compare against the exception line
 * the Python printed — a traceback has no contract beyond its last line.
 */
const goldenFile = (name: string, ext: string) => readFile(join(__dirname, "goldens/memlog", `${name}.${ext}`), "utf8");
const goldenExit = async (name: string) => Number((await goldenFile(name, "exit")).trim());

/** The Python stamps `updated:` with its own local minute; the capture's stamp
 * cannot equal the run's, so both sides collapse it. */
const normalizeStamp = (text: string) => text.replace(/^updated: .*$/m, "updated: <stamp>");

async function seed(root = "/p"): Promise<Fs> {
  const fs = memFs();
  await seedTicketTree(fs, root, { epics: [], stories: [] });
  await fs.mkdir(`${root}/ws`);
  return fs;
}

describe("memlog port", () => {
  it("runs the pinned init/append/set sequence and leaves the Python's log", async () => {
    const fs = await seed();
    const run = async (name: string, ext: string, argv: string[]) => {
      const r = await memlog(argv, fs);
      expect(r.stdout, name).toBe(await goldenFile(name, ext));
      expect(r.exitCode, name).toBe(await goldenExit(name));
      return r;
    };

    await run("memlog-init", "json", ["init", "--workspace", "/p/ws", "--field", "topic=Onboarding flow"]);
    await run("memlog-init-exists", "err", ["init", "--workspace", "/p/ws"]);
    await run("memlog-append", "json", ["append", "--workspace", "/p/ws", "--type", "decision", "--text", "lead with one account"]);
    await run("memlog-append-tagged", "json", ["append", "--workspace", "/p/ws", "--type", "idea", "--by", "user", "--text", "try sample data first"]);
    await run("memlog-set", "json", ["set", "--workspace", "/p/ws", "--key", "goal", "--value", "lift week-1 retention"]);

    expect(normalizeStamp(await fs.readText("/p/ws/.memlog.md"))).toBe(
      normalizeStamp(await goldenFile("memlog-file", "md")),
    );
    // The stamp itself is normalized away above, so its shape is pinned here:
    // local time, `%Y-%m-%dT%H:%M`, last field, written by init and by set.
    const log = await fs.readText("/p/ws/.memlog.md");
    expect(log).toMatch(/^updated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/m);
    const stamp = /^updated: (.*)$/m.exec(log)![1];
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(stamp.slice(0, 13)).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}`);
  });

  it("appends one entry per call, never rewriting what is there", async () => {
    const fs = await seed();
    await memlog(["init", "--workspace", "/p/ws"], fs);
    const first = await fs.readText("/p/ws/.memlog.md");
    await memlog(["append", "--workspace", "/p/ws", "--text", "one line"], fs);
    const second = await fs.readText("/p/ws/.memlog.md");
    expect(second.startsWith(first)).toBe(true);
    expect(second.slice(first.length)).toBe("- one line\n");
  });

  it("appends through Fs.append, one OS append per entry", async () => {
    // The Python's `append_line` is an O_APPEND write, not a read-modify-write:
    // two writers appending at once must both land. The port has to use the
    // append the Fs offers, so this records which method each call took.
    const base = await seed();
    const calls: string[] = [];
    const fs: Fs = {
      ...base,
      append: (p, body) => { calls.push("append"); return base.append(p, body); },
      writeText: (p, body) => { calls.push("writeText"); return base.writeText(p, body); },
    };
    await memlog(["init", "--workspace", "/p/ws"], fs);
    calls.length = 0;
    await memlog(["append", "--workspace", "/p/ws", "--type", "decision", "--text", "first"], fs);
    await memlog(["append", "--workspace", "/p/ws", "--type", "idea", "--text", "second"], fs);

    expect(calls).toEqual(["append", "append"]);
    const log = await base.readText("/p/ws/.memlog.md");
    expect(log.trimEnd().split("\n").slice(-2)).toEqual(["- (decision) first", "- (idea) second"]);
  });

  it("initialises a slashless --path without inventing a folder", async () => {
    // `Path(".memlog.md").parent` is the working directory: slicing before the
    // last `/` would make the junk folder `.memlog.m`.
    const fs = await seed();
    const r = await memlog(["init", "--path", "log.md", "--field", "topic=Slashless"], fs);
    expect(r.exitCode).toBe(0);
    expect(await fs.exists("log.md")).toBe(true);
    expect(await fs.exists("log.m")).toBe(false);
  });

  /** A field name is a dict key: `__proto__` and `constructor` are fields like
   * any other, and assigning one must not touch the prototype. */
  it("keeps a field name that Object.prototype also carries", async () => {
    const fs = await seed();
    const init = await memlog(
      ["init", "--workspace", "/p/ws", "--field", "__proto__=sneaky", "--field", "constructor=plain"],
      fs,
    );
    expect(init.exitCode).toBe(0);
    const log = await fs.readText("/p/ws/.memlog.md");
    expect(log).toContain("__proto__: sneaky");
    expect(log).toContain("constructor: plain");
    const set = await memlog(["set", "--workspace", "/p/ws", "--key", "constructor", "--value", "changed"], fs);
    expect(set.exitCode).toBe(0);
    expect(await fs.readText("/p/ws/.memlog.md")).toContain("constructor: changed");
  });

  it("refuses with the Python's own line, exit and nothing written", async () => {
    const cases: [string, string[], number][] = [
      // A missing log: the Python's FileNotFoundError line, exit 1.
      ["memlog-append-missing", ["append", "--path", "/p/ws/none/.memlog.md", "--text", "x"], 1],
      // A log whose frontmatter never opened: its ValueError line, exit 1.
      ["memlog-append-malformed", ["append", "--path", "/p/ws/malformed/.memlog.md", "--text", "x"], 1],
      // argparse's error line (its usage block wraps to the terminal), exit 2.
      ["memlog-append-no-text", ["append", "--workspace", "/p/ws"], 2],
      ["memlog-no-target", ["append", "--text", "x"], 2],
    ];
    for (const [name, argv, exit] of cases) {
      const fs = await seed();
      await fs.mkdir("/p/ws/malformed");
      await fs.writeText("/p/ws/malformed/.memlog.md", "no frontmatter here\n");
      const r = await memlog(argv, fs);
      expect(r.stdout, name).toBe(await goldenFile(name, "err.line"));
      expect(r.exitCode, name).toBe(exit);
      expect(await goldenExit(name), name).toBe(exit);
      // Neither refusal creates the log it was pointed at.
      expect(await fs.exists("/p/ws/.memlog.md"), name).toBe(false);
      expect(await fs.exists("/p/ws/none/.memlog.md"), name).toBe(false);
    }
  });
});
