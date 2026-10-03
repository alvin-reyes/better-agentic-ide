#!/usr/bin/env node
/**
 * Re-vendor the role definitions from the ade-setup repository.
 *
 * ade-setup is the source for what the roles are; this repository carries a
 * pinned copy so the app builds and runs with no dependency on the network,
 * exactly as .bmad-core is vendored. Nothing else writes vendor/ade-setup.
 *
 *   npm run sync:agents              # pin to origin/main
 *   npm run sync:agents -- v1.2.0    # pin to a tag, branch or sha
 *   ADE_SETUP_REPO=/path/to/clone npm run sync:agents   # a local checkout
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "vendor", "ade-setup", "agents");
const REMOTE = "https://github.com/alvin-reyes/ade-setup.git";
const ref = process.argv[2] || "main";
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
  // A ref that does not describe the bytes being copied makes the pin a lie,
  // which matters most for the local-checkout path used while editing roles.
  const dirty = git(["status", "--porcelain", "--", "agents"], source);
  if (dirty) {
    console.error(`\n${source} has uncommitted changes under agents/:\n${dirty}\n`);
    console.error("Commit them first, or the recorded ref will not match what is vendored.");
    process.exit(1);
  }
  const from = join(source, "agents");
  const files = readdirSync(from).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`no agent definitions in ${from}`);

  // Report before overwriting: a re-pin that rewrites a definition should be a
  // visible line in a review, not a silent change.
  const before = existsSync(DEST) ? readdirSync(DEST).filter((f) => f.endsWith(".md")) : [];
  const added = files.filter((f) => !before.includes(f));
  const removed = before.filter((f) => !files.includes(f));
  const changed = files.filter((f) => {
    const dst = join(DEST, f);
    return existsSync(dst) && readFileSync(dst, "utf8") !== readFileSync(join(from, f), "utf8");
  });

  mkdirSync(DEST, { recursive: true });
  for (const f of removed) rmSync(join(DEST, f));
  for (const f of files) writeFileSync(join(DEST, f), readFileSync(join(from, f), "utf8"));

  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(join(DEST, "..", "VERSION"),
    `repo: ${REMOTE.replace(/\.git$/, "")}\nref: ${sha}\nvendored: ${stamp}\n\n` +
    "The role definitions ADE ships, vendored and pinned the way .bmad-core is.\n" +
    "These markdown files are the source: src/data/roles.ts parses them and holds\n" +
    "no prose of its own, so the two cannot drift. Run npm run sync:agents to\n" +
    "re-vendor from the repo at a newer ref.\n");

  console.log(`${files.length} definitions vendored at ${sha.slice(0, 8)}`);
  for (const f of added) console.log(`  added    ${f}`);
  for (const f of removed) console.log(`  removed  ${f}`);
  for (const f of changed) console.log(`  changed  ${f}`);
  if (!added.length && !removed.length && !changed.length) console.log("  no changes");
  console.log("\nRun `npx vitest run` next: the catalog is parsed from these files.");
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
