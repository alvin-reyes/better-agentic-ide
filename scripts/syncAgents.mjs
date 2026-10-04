#!/usr/bin/env node
/**
 * Re-vendor the role definitions from the ade-setup repository.
 *
 * ade-setup is the source for what the roles are; this repository carries a
 * pinned copy so the app builds and runs with no dependency on the network,
 * exactly as .bmad-core is vendored. Nothing else writes vendor/ade-setup.
 *
 *   npm run sync:agents                      # pin to origin/main
 *   ADE_SETUP_REF=v1.2.0 npm run sync:agents # pin to a release
 *   npm run sync:agents -- v1.2.0            # the same, as an argument
 *   ADE_SETUP_REPO=/path/to/clone npm run sync:agents   # a local checkout
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "ade-setup");

/**
 * Everything ADE imports out of the vendored copy. Keep this in step with the
 * imports: a path ADE reads but this does not copy stays at whatever was there
 * when it was first added, while VERSION claims it came from the pinned ref.
 */
const VENDORED = ["agents", "templates"];
const REMOTE = "https://github.com/alvin-reyes/ade-setup.git";
// A released tag is the normal thing to pin; `main` is the escape hatch.
const ref = process.argv[2] || process.env.ADE_SETUP_REF || "main";
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let source = process.env.ADE_SETUP_REPO;
let tmp;
if (!source) {
  tmp = mkdtempSync(join(tmpdir(), "ade-setup-"));
  console.log(`cloning ${REMOTE} at ${ref}`);
  git(["clone", "--quiet", "--depth", "1", "--branch", ref, REMOTE, tmp]);
  source = tmp;
} else {
  console.log(`using local checkout ${source}`);
}

try {
  const sha = git(["rev-parse", "HEAD"], source);
  // Record which release this is, not just its sha. A reviewer reading the pin
  // should be able to find its notes without resolving a hash by hand.
  let release = "";
  try {
    release = git(["describe", "--tags", "--exact-match", "HEAD"], source);
  } catch {
    // Not a tagged commit — pinning main or a sha directly.
  }
  // A ref that does not describe the bytes being copied makes the pin a lie,
  // which matters most for the local-checkout path used while editing roles.
  const dirty = git(["status", "--porcelain", "--", ...VENDORED], source);
  if (dirty) {
    console.error(`\n${source} has uncommitted changes under ${VENDORED.join("/, ")}/:\n${dirty}\n`);
    console.error("Commit them first, or the recorded ref will not match what is vendored.");
    process.exit(1);
  }
  /** Every file under `dir`, as paths relative to it. */
  const walk = (dir, base = "") =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(dir, e.name), join(base, e.name)) : [join(base, e.name)],
        )
      : [];

  const files = VENDORED.flatMap((top) => walk(join(source, top)).map((rel) => join(top, rel))).sort();
  if (!files.some((f) => f.startsWith("agents/"))) throw new Error(`no agent definitions in ${source}`);

  // Report before overwriting: a re-pin that rewrites a definition should be a
  // visible line in a review, not a silent change.
  const before = VENDORED.flatMap((top) => walk(join(VENDOR, top)).map((rel) => join(top, rel)));
  const added = files.filter((f) => !before.includes(f));
  const removed = before.filter((f) => !files.includes(f));
  const changed = files.filter((f) => {
    const dst = join(VENDOR, f);
    return existsSync(dst) && readFileSync(dst, "utf8") !== readFileSync(join(source, f), "utf8");
  });

  for (const f of removed) rmSync(join(VENDOR, f));
  for (const f of files) {
    const dst = join(VENDOR, f);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(join(source, f), "utf8"));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(join(VENDOR, "VERSION"),
    `repo: ${REMOTE.replace(/\.git$/, "")}\n` +
    (release ? `release: ${release}\n` : "") +
    `ref: ${sha}\nvendored: ${stamp}\n\n` +
    "The role definitions ADE ships, vendored and pinned the way .bmad-core is.\n" +
    "These markdown files are the source: src/data/roles.ts parses them and holds\n" +
    "no prose of its own, so the two cannot drift. Run npm run sync:agents to\n" +
    "re-vendor from the repo at a newer ref.\n");

  console.log(`${files.length} files vendored at ${release || sha.slice(0, 8)}`);
  for (const f of added) console.log(`  added    ${f}`);
  for (const f of removed) console.log(`  removed  ${f}`);
  for (const f of changed) console.log(`  changed  ${f}`);
  if (!added.length && !removed.length && !changed.length) console.log("  no changes");
  console.log("\nRun `npx vitest run` next: the catalog is parsed from these files.");
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
