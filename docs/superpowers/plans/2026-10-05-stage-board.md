# Stage Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show where a project stands in its BMAD workflow, in one tab, by reading the artifacts BMAD already produces.

**Architecture:** Four pure modules parse BMAD's own files — `core-config.yaml` for paths, a workflow YAML for the sequence, story markdown for status, gate YAML for verdicts — and a Zustand store assembles them into a view refreshed by the existing recursive `watch_directory`. The store holds no persisted state: the files are the state. The tab renders a terminal pane beside a panel; the panel never writes a file except for the two human gates.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Tauri 2 commands (`read_file`, `list_directory`, `project_root`, `watch_directory`).

**Spec:** `docs/superpowers/specs/2026-10-05-stage-board-design.md`

## Global Constraints

- **BMAD is the root.** `BMAD_PHASES = ["Planning", "Dev cycle"]` is kept and promoted to the top level of the rail; it is not replaced.
- **Paths come from `.bmad-core/core-config.yaml`**, never from a constant. Documented defaults when it is absent: `qaLocation: docs/qa`, `prdFile: docs/prd.md`, `prdShardedLocation: docs/prd`, `architectureFile: docs/architecture.md`, `architectureShardedLocation: docs/architecture`, `devStoryLocation: docs/stories`.
- **No new statuses.** BMAD's are `Draft`, `Approved`, `InProgress`, `Review`, `Done`.
- **No new file formats, agents or process.** Everything is read from what BMAD and the nineteen roles already write.
- **The store persists nothing.** No `localStorage`, no JSON on disk. Files are the state.
- **The panel writes a file for exactly two actions:** promoting a story `Draft → Approved`, and recording a stage advance.
- **Done requires evidence.** A story renders Done only with a gate file whose `gate: PASS`. Status alone renders as `claimed`.
- **Nothing dispatches below `Approved`.**
- **All new tests that read files live in `scripts/`,** never `src/`: test files under `src/` importing `node:fs` have broken CI's typecheck before.
- **Commit author:** `alvin-reyes <areyesonl@gmail.com>`. Do not bump the app version.

## Review Focus

Five things the spec implies, that a person will hit, and that no task's happy path covers. Each has its test added to the task that owns the code.

1. **A project with no `.bmad-core/core-config.yaml` at all.** Every new project starts this way. Expected: documented defaults are used and the board says it fell back, rather than reporting a project with no artifacts. — Task 1.
2. **A sharded PRD where `docs/prd.md` does not exist.** `prdSharded: true` is BMAD's default. Expected: the Design stage resolves from the directory, not reported missing. — Task 2.
3. **A story file whose Status is absent, lowercase, or a word BMAD does not define.** Hand-written and older stories exist. Expected: it still renders, with status `unknown`, never guessed into a real one. — Task 3.
4. **A gate file that is not valid YAML, or is missing `gate:`.** Expected: the story renders with the parse error attached, and does not silently become Done or vanish. — Task 4.
5. **A story whose own Status says `Done` while no gate file exists.** This is the headline case the whole design exists for. Expected: renders as `claimed`, never as Done. — Task 5.

---

### Task 1: Resolve BMAD paths from `core-config.yaml`

**Files:**
- Create: `src/lib/bmadConfig.ts`
- Test: `scripts/bmadConfig.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface BmadPaths { qaLocation: string; prdFile: string; prdSharded: boolean; prdShardedLocation: string; architectureFile: string; architectureSharded: boolean; architectureShardedLocation: string; devStoryLocation: string; usedDefaults: boolean }`
  - `export const BMAD_DEFAULTS: BmadPaths`
  - `export function parseBmadConfig(yaml: string | null): BmadPaths`
  - `export function gatesDir(p: BmadPaths): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/bmadConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BMAD_DEFAULTS, parseBmadConfig, gatesDir } from "../src/lib/bmadConfig";

const VENDORED = resolve(__dirname, "..", "src-tauri/resources/bmad/bmad-core/core-config.yaml");

describe("parseBmadConfig", () => {
  it("reads the vendored config BMAD actually ships", () => {
    const p = parseBmadConfig(readFileSync(VENDORED, "utf8"));
    expect(p.qaLocation).toBe("docs/qa");
    expect(p.prdFile).toBe("docs/prd.md");
    expect(p.prdSharded).toBe(true);
    expect(p.prdShardedLocation).toBe("docs/prd");
    expect(p.architectureFile).toBe("docs/architecture.md");
    expect(p.architectureSharded).toBe(true);
    expect(p.devStoryLocation).toBe("docs/stories");
    expect(p.usedDefaults).toBe(false);
  });

  it("honours a customised layout", () => {
    const p = parseBmadConfig(`qa:\n  qaLocation: quality\nprd:\n  prdFile: spec/prd.md\n  prdSharded: false\ndevStoryLocation: work/stories\n`);
    expect(p.qaLocation).toBe("quality");
    expect(p.prdFile).toBe("spec/prd.md");
    expect(p.prdSharded).toBe(false);
    expect(p.devStoryLocation).toBe("work/stories");
  });

  // Review Focus 1: every new project has no config yet.
  it("falls back to the documented defaults, and says so", () => {
    const p = parseBmadConfig(null);
    expect(p).toEqual({ ...BMAD_DEFAULTS, usedDefaults: true });
    expect(p.qaLocation).toBe("docs/qa");
  });

  it("fills in only what a partial config omits", () => {
    const p = parseBmadConfig("devStoryLocation: work/stories\n");
    expect(p.devStoryLocation).toBe("work/stories");
    expect(p.qaLocation).toBe("docs/qa");
    expect(p.usedDefaults).toBe(false);
  });

  it("puts gates under qaLocation, not at the root", () => {
    expect(gatesDir(parseBmadConfig(null))).toBe("docs/qa/gates");
    expect(gatesDir(parseBmadConfig("qa:\n  qaLocation: quality\n"))).toBe("quality/gates");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/bmadConfig.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/bmadConfig"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bmadConfig.ts`:

```ts
/**
 * Where BMAD keeps things in this project.
 *
 * Every path is configurable in `.bmad-core/core-config.yaml`, so none of them
 * may be hardcoded: a board looking for `docs/prd.md` reports "missing" on a
 * project that configured BMAD differently, which is worse than saying nothing.
 *
 * Parsed by hand rather than with a YAML library. The file is two levels deep
 * with scalar values, the app ships no YAML dependency, and adding one to read
 * eight keys is not worth the bytes.
 */
export interface BmadPaths {
  qaLocation: string;
  prdFile: string;
  prdSharded: boolean;
  prdShardedLocation: string;
  architectureFile: string;
  architectureSharded: boolean;
  architectureShardedLocation: string;
  devStoryLocation: string;
  /** True when no config was found and these are the documented defaults. */
  usedDefaults: boolean;
}

/** BMAD's own defaults, from the vendored core-config.yaml. */
export const BMAD_DEFAULTS: BmadPaths = {
  qaLocation: "docs/qa",
  prdFile: "docs/prd.md",
  prdSharded: true,
  prdShardedLocation: "docs/prd",
  architectureFile: "docs/architecture.md",
  architectureSharded: true,
  architectureShardedLocation: "docs/architecture",
  devStoryLocation: "docs/stories",
  usedDefaults: false,
};

/** `key: value` at any indentation, ignoring comments and quotes. */
function scalars(yaml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of yaml.split("\n")) {
    const line = raw.replace(/#.*$/, "");
    const m = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[3].trim().replace(/^["']|["']$/g, "");
    if (value) out.set(m[2], value);
  }
  return out;
}

export function parseBmadConfig(yaml: string | null): BmadPaths {
  if (yaml === null) return { ...BMAD_DEFAULTS, usedDefaults: true };
  const s = scalars(yaml);
  const str = (k: string, fallback: string) => s.get(k) ?? fallback;
  const bool = (k: string, fallback: boolean) => {
    const v = s.get(k);
    return v === undefined ? fallback : v === "true";
  };
  return {
    qaLocation: str("qaLocation", BMAD_DEFAULTS.qaLocation),
    prdFile: str("prdFile", BMAD_DEFAULTS.prdFile),
    prdSharded: bool("prdSharded", BMAD_DEFAULTS.prdSharded),
    prdShardedLocation: str("prdShardedLocation", BMAD_DEFAULTS.prdShardedLocation),
    architectureFile: str("architectureFile", BMAD_DEFAULTS.architectureFile),
    architectureSharded: bool("architectureSharded", BMAD_DEFAULTS.architectureSharded),
    architectureShardedLocation: str("architectureShardedLocation", BMAD_DEFAULTS.architectureShardedLocation),
    devStoryLocation: str("devStoryLocation", BMAD_DEFAULTS.devStoryLocation),
    usedDefaults: false,
  };
}

/** Gates live under qaLocation, which defaults to docs/qa — not a top-level gates/. */
export function gatesDir(p: BmadPaths): string {
  return `${p.qaLocation}/gates`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/bmadConfig.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmadConfig.ts scripts/bmadConfig.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Resolve BMAD paths from core-config.yaml

Every path BMAD uses is configurable, so none may be hardcoded: a board
looking for docs/prd.md reports missing on a project that configured BMAD
differently. Parsed by hand because the file is two levels of scalars and
the app ships no YAML dependency.

A project with no config yet - which every new project is - gets the
documented defaults and a usedDefaults flag, so the board can say it fell
back rather than claim the project has no artifacts."
```

---

### Task 2: Resolve which artifacts exist, sharded or not

**Files:**
- Create: `src/lib/bmadArtifacts.ts`
- Test: `scripts/bmadArtifacts.test.ts`

**Interfaces:**
- Consumes: `BmadPaths`, `gatesDir` from Task 1.
- Produces:
  - `type ArtifactId = "brief" | "prd" | "architecture" | "backlog" | "reviews" | "threatModel" | "securityReview"`
  - `interface Artifact { id: ArtifactId; label: string; path: string; present: boolean; isDirectory: boolean }`
  - `export function artifactCandidates(p: BmadPaths): { id: ArtifactId; label: string; paths: string[]; directory: boolean }[]`
  - `export function resolveArtifacts(p: BmadPaths, exists: (path: string) => boolean): Artifact[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/bmadArtifacts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseBmadConfig } from "../src/lib/bmadConfig";
import { resolveArtifacts } from "../src/lib/bmadArtifacts";

const paths = parseBmadConfig(null);
const find = (list: ReturnType<typeof resolveArtifacts>, id: string) =>
  list.find((a) => a.id === id)!;

describe("resolveArtifacts", () => {
  it("reports nothing present in an empty project", () => {
    const got = resolveArtifacts(paths, () => false);
    expect(got.every((a) => !a.present)).toBe(true);
  });

  // Review Focus 2: prdSharded is BMAD's default, so docs/prd.md may never exist.
  it("resolves a sharded PRD from its directory when the single file is absent", () => {
    const got = resolveArtifacts(paths, (p) => p === "docs/prd");
    const prd = find(got, "prd");
    expect(prd.present).toBe(true);
    expect(prd.path).toBe("docs/prd");
    expect(prd.isDirectory).toBe(true);
  });

  it("resolves an unsharded PRD from the single file", () => {
    const single = { ...paths, prdSharded: false };
    const prd = find(resolveArtifacts(single, (p) => p === "docs/prd.md"), "prd");
    expect(prd.present).toBe(true);
    expect(prd.path).toBe("docs/prd.md");
    expect(prd.isDirectory).toBe(false);
  });

  it("accepts either spelling of the brief", () => {
    // Roles own docs/brief.md; BMAD's greenfield workflow creates project-brief.md.
    expect(find(resolveArtifacts(paths, (p) => p === "docs/brief.md"), "brief").present).toBe(true);
    expect(find(resolveArtifacts(paths, (p) => p === "docs/project-brief.md"), "brief").present).toBe(true);
  });

  it("finds the audit artifacts the ADE roles own", () => {
    const got = resolveArtifacts(paths, (p) =>
      ["docs/reviews", "docs/threat-model.md", "docs/security-review.md"].includes(p));
    expect(find(got, "reviews").present).toBe(true);
    expect(find(got, "threatModel").present).toBe(true);
    expect(find(got, "securityReview").present).toBe(true);
  });

  it("follows a customised layout rather than docs/", () => {
    const custom = parseBmadConfig("prd:\n  prdFile: spec/prd.md\n  prdSharded: false\n");
    expect(find(resolveArtifacts(custom, (p) => p === "spec/prd.md"), "prd").present).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/bmadArtifacts.test.ts`
Expected: FAIL — cannot resolve `../src/lib/bmadArtifacts`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bmadArtifacts.ts`:

```ts
import type { BmadPaths } from "./bmadConfig";

/**
 * Which BMAD artifacts exist in a project.
 *
 * Pure: it is handed an `exists` predicate rather than touching the disk, so it
 * can be tested without fixtures and the store owns all I/O. Parsing is the
 * part most likely to be wrong, so it is the part with no dependencies.
 */
export type ArtifactId =
  | "brief" | "prd" | "architecture" | "backlog"
  | "reviews" | "threatModel" | "securityReview";

export interface Artifact {
  id: ArtifactId;
  label: string;
  /** The path that resolved, or the first candidate when none did. */
  path: string;
  present: boolean;
  isDirectory: boolean;
}

/**
 * Candidates per artifact, most canonical first.
 *
 * Two spellings exist for several of these: ADE's roles declare they own
 * `docs/brief.md`, while BMAD's greenfield workflow creates `project-brief.md`.
 * Reporting a stage incomplete because of a filename is worse than accepting
 * two names for one thing, so both are candidates.
 */
export function artifactCandidates(p: BmadPaths) {
  return [
    { id: "brief" as const, label: "Brief", directory: false,
      paths: ["docs/brief.md", "docs/project-brief.md", "docs/brainstorming-session-results.md"] },
    { id: "prd" as const, label: "PRD", directory: p.prdSharded,
      paths: p.prdSharded ? [p.prdShardedLocation, p.prdFile] : [p.prdFile, p.prdShardedLocation] },
    { id: "architecture" as const, label: "Architecture", directory: p.architectureSharded,
      paths: p.architectureSharded
        ? [p.architectureShardedLocation, p.architectureFile]
        : [p.architectureFile, p.architectureShardedLocation] },
    { id: "backlog" as const, label: "Backlog", directory: false, paths: ["docs/backlog.md"] },
    { id: "reviews" as const, label: "Reviews", directory: true, paths: ["docs/reviews"] },
    { id: "threatModel" as const, label: "Threat model", directory: false, paths: ["docs/threat-model.md"] },
    { id: "securityReview" as const, label: "Security review", directory: false, paths: ["docs/security-review.md"] },
  ];
}

export function resolveArtifacts(p: BmadPaths, exists: (path: string) => boolean): Artifact[] {
  return artifactCandidates(p).map((c) => {
    const hit = c.paths.find(exists);
    return {
      id: c.id,
      label: c.label,
      path: hit ?? c.paths[0],
      present: hit !== undefined,
      // A sharded artifact resolves to a directory; the fallback spelling may not be.
      isDirectory: hit ? hit === c.paths[0] && c.directory : c.directory,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/bmadArtifacts.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmadArtifacts.ts scripts/bmadArtifacts.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Resolve which BMAD artifacts a project has

Takes an exists predicate rather than touching disk, so the parsing has no
dependencies and the store owns all I/O.

Two details that would otherwise report a healthy project as empty. With
prdSharded true, which is BMAD's default, the PRD is docs/prd/ and
docs/prd.md may never exist, so a sharded artifact resolves from its
directory. And ADE's roles own docs/brief.md while BMAD's greenfield
workflow creates project-brief.md, so both spellings satisfy it: failing a
stage over a filename is worse than accepting two names for one thing."
```

---

### Task 3: Parse story files

**Files:**
- Create: `src/lib/bmadStories.ts`
- Test: `scripts/bmadStories.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type StoryStatus = "Draft" | "Approved" | "InProgress" | "Review" | "Done" | "unknown"`
  - `interface Story { file: string; id: string; title: string; status: StoryStatus; rawStatus: string; acceptanceCriteria: string[] }`
  - `export const STORY_STATUSES: StoryStatus[]`
  - `export function parseStory(file: string, markdown: string): Story`
  - `export function isDispatchable(s: Story): boolean`

- [ ] **Step 1: Write the failing test**

Create `scripts/bmadStories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStory, isDispatchable } from "../src/lib/bmadStories";

const story = (status: string) => `# Story 2.4: Refund reversal

## Status

${status}

## Story

**As a** finance operator,
**I want** refunds to reverse the ledger entry,
**so that** the balance projection does not double-count.

## Acceptance Criteria

1. A refund writes a reversal, not a negative entry.
2. The balance projection is unchanged after a refund round-trip.
`;

describe("parseStory", () => {
  it("reads the id, title, status and acceptance criteria", () => {
    const s = parseStory("docs/stories/2.4.refund-reversal.md", story("Approved"));
    expect(s.id).toBe("2.4");
    expect(s.title).toBe("Refund reversal");
    expect(s.status).toBe("Approved");
    expect(s.acceptanceCriteria).toHaveLength(2);
    expect(s.acceptanceCriteria[0]).toContain("writes a reversal");
  });

  it("accepts every status BMAD defines", () => {
    for (const st of ["Draft", "Approved", "InProgress", "Review", "Done"]) {
      expect(parseStory("a.md", story(st)).status).toBe(st);
    }
  });

  // Review Focus 3: hand-written and older stories exist.
  it.each([
    ["an unknown word", "Shipped"],
    ["an empty status", ""],
  ])("renders a story with %s rather than guessing", (_label, raw) => {
    const s = parseStory("docs/stories/9.9.odd.md", story(raw));
    expect(s.status).toBe("unknown");
    expect(s.rawStatus).toBe(raw.trim());
    expect(s.title).toBe("Odd"); // still rendered, from the filename
  });

  it("reads a lowercase status, since humans write them", () => {
    expect(parseStory("a.md", story("approved")).status).toBe("Approved");
  });

  it("falls back to the filename when there is no heading", () => {
    const s = parseStory("docs/stories/3.1.settlement-export.md", "no heading here");
    expect(s.id).toBe("3.1");
    expect(s.title).toBe("Settlement export");
    expect(s.status).toBe("unknown");
  });
});

describe("isDispatchable", () => {
  it("is true only at or past Approved", () => {
    const at = (st: string) => isDispatchable(parseStory("a.md", story(st)));
    expect(at("Draft")).toBe(false);
    expect(at("Shipped")).toBe(false); // unknown
    expect(at("Approved")).toBe(true);
    expect(at("InProgress")).toBe(true);
    expect(at("Review")).toBe(true);
    expect(at("Done")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/bmadStories.test.ts`
Expected: FAIL — cannot resolve `../src/lib/bmadStories`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bmadStories.ts`:

```ts
/**
 * BMAD story files, from `devStoryLocation`.
 *
 * The format is BMAD's story-tmpl: a `# Story {epic}.{n}: {title}` heading, a
 * `## Status` section holding one of five words, and `## Acceptance Criteria`.
 *
 * Anything with a readable name still renders. BMAD's format may change and
 * hand-written stories exist; a story the board cannot see is worse than one it
 * shows as unknown, because the board would then be lying about what the
 * project contains.
 */
export type StoryStatus = "Draft" | "Approved" | "InProgress" | "Review" | "Done" | "unknown";

/** BMAD's own lifecycle, in order. */
export const STORY_STATUSES: StoryStatus[] = ["Draft", "Approved", "InProgress", "Review", "Done"];

export interface Story {
  /** Path relative to the project root. */
  file: string;
  /** "{epic}.{n}", from the heading or the filename. */
  id: string;
  title: string;
  status: StoryStatus;
  /** Exactly what the file said, so an unrecognised value stays visible. */
  rawStatus: string;
  acceptanceCriteria: string[];
}

function section(md: string, heading: RegExp): string {
  const start = md.search(heading);
  if (start < 0) return "";
  const after = md.slice(start);
  const rest = after.slice(after.indexOf("\n") + 1);
  const next = rest.search(/^#{1,3} /m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/** "2.4.refund-reversal.md" -> { id: "2.4", title: "Refund reversal" } */
function fromFilename(file: string): { id: string; title: string } {
  const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const m = /^(\d+\.\d+)\.(.*)$/.exec(base);
  if (!m) return { id: base, title: base };
  const words = m[2].replace(/[-_]+/g, " ").trim();
  return { id: m[1], title: words.charAt(0).toUpperCase() + words.slice(1) };
}

export function parseStory(file: string, markdown: string): Story {
  const name = fromFilename(file);
  const heading = /^#\s+Story\s+(\d+\.\d+):\s*(.+)$/m.exec(markdown);

  const rawStatus = section(markdown, /^##\s+Status\s*$/m).split("\n")[0].trim();
  const matched = STORY_STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());

  const acceptanceCriteria = section(markdown, /^##\s+Acceptance Criteria\s*$/m)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter(Boolean);

  return {
    file,
    id: heading?.[1] ?? name.id,
    title: heading?.[2].trim() ?? name.title,
    status: matched ?? "unknown",
    rawStatus,
    acceptanceCriteria,
  };
}

/**
 * Approved or beyond. The gate is BMAD's own: its development loop makes
 * "You -> Review and approve story" a human step, and nothing may be handed to
 * an agent before that has happened.
 */
export function isDispatchable(s: Story): boolean {
  const i = STORY_STATUSES.indexOf(s.status);
  return i >= STORY_STATUSES.indexOf("Approved");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/bmadStories.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmadStories.ts scripts/bmadStories.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Parse BMAD story files

Reads the id, title, status and acceptance criteria from BMAD's story
template, with the five statuses it defines and no new ones.

A story whose status is missing, lowercase or a word BMAD does not define
still renders, as unknown, with the raw value kept. Hand-written and older
stories exist, and a story the board cannot see is worse than one it shows
as unknown: the board would be lying about what the project contains.

isDispatchable encodes BMAD's own gate - its development loop makes
'You: review and approve story' a human step - so nothing reaches an agent
below Approved."
```

---

### Task 4: Parse QA gate files

**Files:**
- Create: `src/lib/bmadGates.ts`
- Test: `scripts/bmadGates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GateVerdict = "PASS" | "CONCERNS" | "FAIL" | "WAIVED"`
  - `interface Gate { file: string; storyId: string; verdict: GateVerdict | null; reason: string; waived: boolean; error: string | null }`
  - `export function parseGate(file: string, yaml: string): Gate`
  - `export function gateFor(storyId: string, gates: Gate[]): Gate | undefined`

- [ ] **Step 1: Write the failing test**

Create `scripts/bmadGates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseGate, gateFor } from "../src/lib/bmadGates";

const gate = (verdict: string, extra = "") => `schema: 1
story: "2.1"
story_title: "Ledger write path"
gate: ${verdict}
status_reason: "All acceptance criteria covered by passing tests."
reviewer: "Quinn (Test Architect)"
updated: "2026-10-05T10:00:00Z"
${extra}`;

describe("parseGate", () => {
  it("reads the verdict, story and reason", () => {
    const g = parseGate("docs/qa/gates/2.1-ledger.yml", gate("PASS"));
    expect(g.verdict).toBe("PASS");
    expect(g.storyId).toBe("2.1");
    expect(g.reason).toContain("acceptance criteria");
    expect(g.error).toBeNull();
    expect(g.waived).toBe(false);
  });

  it.each(["PASS", "CONCERNS", "FAIL", "WAIVED"])("reads %s", (v) => {
    expect(parseGate("g.yml", gate(v)).verdict).toBe(v);
  });

  it("marks a waiver active, so it can be shown as one", () => {
    const g = parseGate("g.yml", gate("WAIVED", 'waiver: { active: true }\n'));
    expect(g.waived).toBe(true);
  });

  // Review Focus 4: a malformed gate must not vanish or become a pass.
  it("keeps a gate with no verdict visible, with the problem attached", () => {
    const g = parseGate("docs/qa/gates/3.1-x.yml", 'story: "3.1"\nreviewer: "Quinn"\n');
    expect(g.verdict).toBeNull();
    expect(g.error).toMatch(/gate/i);
    expect(g.storyId).toBe("3.1");
  });

  it("keeps a gate with an unrecognised verdict visible", () => {
    const g = parseGate("g.yml", gate("MAYBE"));
    expect(g.verdict).toBeNull();
    expect(g.error).toContain("MAYBE");
  });

  it("falls back to the filename for the story id", () => {
    const g = parseGate("docs/qa/gates/4.2-settlement.yml", "gate: PASS\n");
    expect(g.storyId).toBe("4.2");
  });
});

describe("gateFor", () => {
  it("matches a gate to its story", () => {
    const gates = [parseGate("docs/qa/gates/2.1-a.yml", gate("PASS"))];
    expect(gateFor("2.1", gates)?.verdict).toBe("PASS");
    expect(gateFor("2.2", gates)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/bmadGates.test.ts`
Expected: FAIL — cannot resolve `../src/lib/bmadGates`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bmadGates.ts`:

```ts
/**
 * QA gate files, from `{qaLocation}/gates/`.
 *
 * BMAD's qa-gate-tmpl: a flat YAML document whose `gate:` key carries one of
 * four verdicts. This is the evidence that decides Done, so a gate it cannot
 * read is reported rather than ignored — silently dropping one would let a
 * story claim Done with nothing behind it, which is the single thing the board
 * exists to prevent.
 */
export type GateVerdict = "PASS" | "CONCERNS" | "FAIL" | "WAIVED";

const VERDICTS: GateVerdict[] = ["PASS", "CONCERNS", "FAIL", "WAIVED"];

export interface Gate {
  file: string;
  storyId: string;
  /** Null when absent or unrecognised; `error` then says why. */
  verdict: GateVerdict | null;
  reason: string;
  waived: boolean;
  error: string | null;
}

function topLevel(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "").replace(/#.*$/, "").trim();
}

/** "2.1-ledger-write-path.yml" -> "2.1" */
function idFromFilename(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return /^(\d+\.\d+)/.exec(base)?.[1] ?? base.replace(/\.ya?ml$/, "");
}

export function parseGate(file: string, yaml: string): Gate {
  const raw = topLevel(yaml, "gate");
  const verdict = raw && VERDICTS.includes(raw as GateVerdict) ? (raw as GateVerdict) : null;

  let error: string | null = null;
  if (raw === null) error = "no gate: key in this file";
  else if (verdict === null) error = `unrecognised gate verdict "${raw}"`;

  return {
    file,
    storyId: topLevel(yaml, "story") ?? idFromFilename(file),
    verdict,
    reason: topLevel(yaml, "status_reason") ?? "",
    waived: /waiver:\s*\{[^}]*active:\s*true/.test(yaml),
    error,
  };
}

export function gateFor(storyId: string, gates: Gate[]): Gate | undefined {
  return gates.find((g) => g.storyId === storyId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/bmadGates.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmadGates.ts scripts/bmadGates.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Parse QA gate files

BMAD's qa-gate-tmpl, whose gate: key carries PASS, CONCERNS, FAIL or
WAIVED. This is the evidence that decides Done.

A gate with no verdict, or one the parser does not recognise, is kept
visible with the problem attached rather than dropped. Dropping it would
let a story claim Done with nothing behind it, which is the one thing the
board exists to prevent."
```

---

### Task 5: Decide what a story's state really is

**Files:**
- Create: `src/lib/storyState.ts`
- Test: `scripts/storyState.test.ts`

**Interfaces:**
- Consumes: `Story`, `isDispatchable` (Task 3); `Gate`, `gateFor` (Task 4).
- Produces:
  - `type StoryState = "draft" | "approved" | "in-progress" | "review" | "done" | "claimed" | "unknown"`
  - `interface StoryView { story: Story; gate: Gate | undefined; state: StoryState; dispatchable: boolean; note: string }`
  - `export function storyView(story: Story, gates: Gate[]): StoryView`
  - `export function executionComplete(views: StoryView[]): boolean`

- [ ] **Step 1: Write the failing test**

Create `scripts/storyState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStory } from "../src/lib/bmadStories";
import { parseGate } from "../src/lib/bmadGates";
import { storyView, executionComplete } from "../src/lib/storyState";

const md = (status: string) => `# Story 2.1: Ledger write path\n\n## Status\n\n${status}\n`;
const story = (status: string) => parseStory("docs/stories/2.1.ledger.md", md(status));
const gate = (v: string, id = "2.1") =>
  parseGate(`docs/qa/gates/${id}-x.yml`, `story: "${id}"\ngate: ${v}\nstatus_reason: "why"\n`);

describe("storyView", () => {
  it("is done when the status says Done and a gate passed", () => {
    const v = storyView(story("Done"), [gate("PASS")]);
    expect(v.state).toBe("done");
  });

  // Review Focus 5: the case the whole design exists for.
  it("is claimed, not done, when Done has no gate behind it", () => {
    const v = storyView(story("Done"), []);
    expect(v.state).toBe("claimed");
    expect(v.note).toMatch(/no gate/i);
  });

  it("is claimed when the gate did not pass", () => {
    expect(storyView(story("Done"), [gate("FAIL")]).state).toBe("claimed");
    expect(storyView(story("Done"), [gate("CONCERNS")]).state).toBe("claimed");
  });

  it("treats a waiver as done, and says it was waived", () => {
    const v = storyView(story("Done"), [gate("WAIVED")]);
    expect(v.state).toBe("done");
    expect(v.note).toMatch(/waived/i);
  });

  it("carries the other statuses straight through", () => {
    expect(storyView(story("Draft"), []).state).toBe("draft");
    expect(storyView(story("Approved"), []).state).toBe("approved");
    expect(storyView(story("InProgress"), []).state).toBe("in-progress");
    expect(storyView(story("Review"), []).state).toBe("review");
  });

  it("never dispatches below Approved", () => {
    expect(storyView(story("Draft"), []).dispatchable).toBe(false);
    expect(storyView(story("Shipped"), []).dispatchable).toBe(false);
    expect(storyView(story("Approved"), []).dispatchable).toBe(true);
  });

  it("surfaces an unreadable gate instead of ignoring it", () => {
    const broken = parseGate("docs/qa/gates/2.1-x.yml", 'story: "2.1"\n');
    const v = storyView(story("Review"), [broken]);
    expect(v.note).toMatch(/gate/i);
  });
});

describe("executionComplete", () => {
  it("is false while any story is short of done", () => {
    const views = [storyView(story("Done"), [gate("PASS")]), storyView(story("Review"), [])];
    expect(executionComplete(views)).toBe(false);
  });

  it("is true when every story is done", () => {
    expect(executionComplete([storyView(story("Done"), [gate("PASS")])])).toBe(true);
  });

  it("is false for an empty backlog, since nothing has been planned", () => {
    expect(executionComplete([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/storyState.test.ts`
Expected: FAIL — cannot resolve `../src/lib/storyState`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/storyState.ts`:

```ts
import { gateFor, type Gate } from "./bmadGates";
import { isDispatchable, type Story } from "./bmadStories";

/**
 * What a story's state actually is, as opposed to what its file claims.
 *
 * BMAD's development loop names two steps as the human's: "You -> Review and
 * approve story" and "You -> Verify completion", and its knowledge base says
 * each status change requires user verification. Nothing enforces that today,
 * so a file can say Done with nothing behind it.
 *
 * We cannot stop an agent writing Done into a file. We can decline to believe
 * it, which is what "no agent certifies its own work" means in practice.
 */
export type StoryState =
  | "draft" | "approved" | "in-progress" | "review" | "done" | "claimed" | "unknown";

export interface StoryView {
  story: Story;
  gate: Gate | undefined;
  state: StoryState;
  dispatchable: boolean;
  /** Why the state differs from the file, or what the gate said. */
  note: string;
}

const PLAIN: Record<string, StoryState> = {
  Draft: "draft",
  Approved: "approved",
  InProgress: "in-progress",
  Review: "review",
  unknown: "unknown",
};

export function storyView(story: Story, gates: Gate[]): StoryView {
  const gate = gateFor(story.id, gates);
  const dispatchable = isDispatchable(story);

  if (story.status !== "Done") {
    const note = gate?.error ? `gate unreadable: ${gate.error}` : gate?.reason ?? "";
    return { story, gate, state: PLAIN[story.status] ?? "unknown", dispatchable, note };
  }

  // Done is the one status that is not taken at face value.
  if (gate?.verdict === "PASS") {
    return { story, gate, state: "done", dispatchable, note: gate.reason };
  }
  if (gate?.verdict === "WAIVED") {
    return {
      story, gate, state: "done", dispatchable,
      note: `waived: ${gate.reason || "no reason given"}`,
    };
  }
  const why = gate
    ? gate.error
      ? `gate unreadable: ${gate.error}`
      : `gate says ${gate.verdict}`
    : "no gate file";
  return { story, gate, state: "claimed", dispatchable, note: why };
}

/**
 * Execution is complete only when every story is finished.
 *
 * "The story directory exists" is satisfied by a single story, which would let
 * a project leave Execution with the backlog barely started. An empty backlog
 * is not complete either: nothing has been planned yet.
 */
export function executionComplete(views: StoryView[]): boolean {
  return views.length > 0 && views.every((v) => v.state === "done");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/storyState.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storyState.ts scripts/storyState.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Decide a story's state from evidence, not its own claim

A story is Done only when a gate file says PASS, or says WAIVED with its
reason shown. A file claiming Done with no gate renders as claimed, with
why attached.

BMAD already names 'You: verify completion' as a human step and says each
status change requires user verification; nothing enforces it, so a file
can say anything. We cannot stop an agent writing Done. We can decline to
believe it.

executionComplete needs every story done, not merely present: a single
story would otherwise satisfy the stage. An empty backlog is not complete
either, since nothing has been planned."
```

---

### Task 6: Map workflow agents to ADE roles

**Files:**
- Create: `src/lib/bmadWorkflow.ts`
- Test: `scripts/bmadWorkflow.test.ts`

**Interfaces:**
- Consumes: `ROLES` from `src/data/roles.ts` (each has `id`, `title`).
- Produces:
  - `export const WORKFLOW_AGENT_TO_ROLE: Record<string, string>`
  - `export function roleIdForWorkflowAgent(agent: string): string | null`
  - `export function workflowAgents(yaml: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/bmadWorkflow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROLES } from "../src/data/roles";
import { roleIdForWorkflowAgent, workflowAgents } from "../src/lib/bmadWorkflow";

const DIR = resolve(__dirname, "..", "src-tauri/resources/bmad/bmad-core/workflows");
const files = readdirSync(DIR).filter((f) => f.endsWith(".yaml"));

describe("workflow agent names map to ADE roles", () => {
  it("finds the agents in a shipped workflow", () => {
    const yaml = readFileSync(resolve(DIR, "greenfield-fullstack.yaml"), "utf8");
    const agents = workflowAgents(yaml);
    expect(agents).toEqual(expect.arrayContaining(["analyst", "pm", "architect", "po", "sm", "dev"]));
  });

  it.each([
    ["pm", "product-manager"],
    ["po", "product-owner"],
    ["sm", "scrum-master"],
    ["dev", "developer"],
    ["ux-expert", "designer"],
    ["qa", "qa"],
    ["analyst", "analyst"],
    ["architect", "architect"],
  ])("%s -> %s", (agent, roleId) => {
    expect(roleIdForWorkflowAgent(agent)).toBe(roleId);
  });

  it("resolves a compound name to its first agent", () => {
    // greenfield-fullstack has `agent: analyst/pm` and `agent: pm/architect`.
    expect(roleIdForWorkflowAgent("analyst/pm")).toBe("analyst");
  });

  it("returns null for the placeholder, rather than inventing a role", () => {
    expect(roleIdForWorkflowAgent("various")).toBeNull();
  });

  // The whole point: a BMAD upgrade that renames an agent must fail the build,
  // not silently spawn nothing.
  it("every agent in every bundled workflow resolves to one of the 19 roles", () => {
    const known = new Set(ROLES.map((r) => r.id));
    const unmapped: string[] = [];
    for (const f of files) {
      for (const agent of workflowAgents(readFileSync(resolve(DIR, f), "utf8"))) {
        if (agent === "various") continue;
        const id = roleIdForWorkflowAgent(agent);
        if (!id || !known.has(id)) unmapped.push(`${f}: ${agent}`);
      }
    }
    expect(unmapped, `unmapped workflow agents: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("checks more than one workflow, so a rename anywhere is caught", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/bmadWorkflow.test.ts`
Expected: FAIL — cannot resolve `../src/lib/bmadWorkflow`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bmadWorkflow.ts`:

```ts
/**
 * BMAD workflows name their agents differently from ADE's roles.
 *
 * A workflow says `pm`, `po`, `sm`, `ux-expert`; the nineteen roles are
 * `product-manager`, `product-owner`, `scrum-master`, `designer`. The story
 * template uses a third spelling again. Without one table owning the
 * translation, a workflow step silently spawns nothing.
 */
export const WORKFLOW_AGENT_TO_ROLE: Record<string, string> = {
  analyst: "analyst",
  pm: "product-manager",
  po: "product-owner",
  sm: "scrum-master",
  dev: "developer",
  qa: "qa",
  architect: "architect",
  "ux-expert": "designer",
};

/**
 * The role for a workflow agent, or null when there is none.
 *
 * Compound names appear in the shipped workflows (`analyst/pm`,
 * `pm/architect`) to mean either will do; the first is used. `various` is
 * BMAD's placeholder for "whichever role owns the flagged document" and
 * deliberately has no mapping — inventing one would spawn the wrong agent.
 */
export function roleIdForWorkflowAgent(agent: string): string | null {
  const first = agent.split("/")[0].trim();
  return WORKFLOW_AGENT_TO_ROLE[first] ?? null;
}

/** Every `agent:` named in a workflow YAML, in order, deduplicated. */
export function workflowAgents(yaml: string): string[] {
  const seen = new Set<string>();
  for (const m of yaml.matchAll(/^\s*-?\s*agent:\s*([^\s#]+)/gm)) seen.add(m[1].trim());
  return [...seen];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/bmadWorkflow.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bmadWorkflow.ts scripts/bmadWorkflow.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Map BMAD workflow agents to ADE roles

Workflows say pm, po, sm, ux-expert; the nineteen roles are
product-manager, product-owner, scrum-master, designer. One table owns the
translation, because without it a workflow step silently spawns nothing.

A test walks every agent in all six bundled workflows and fails if any
does not resolve, so a BMAD upgrade that renames one breaks the build
rather than the board. 'various' is BMAD's placeholder for whichever role
owns a flagged document and stays unmapped on purpose: inventing a mapping
would spawn the wrong agent."
```

---

### Task 7: Assemble the board state

**Files:**
- Create: `src/stores/stageBoardStore.ts`
- Test: `scripts/stageBoardStore.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:
  - `type StageId = "brainstorming" | "design" | "audit" | "execution" | "review"`
  - `interface Stage { id: StageId; label: string; phase: "Planning" | "Dev cycle"; evidence: ArtifactId[]; complete: boolean }`
  - `interface BoardState { paths: BmadPaths; artifacts: Artifact[]; stories: StoryView[]; stages: Stage[]; currentStage: StageId; usedDefaults: boolean }`
  - `export function buildBoard(input: { config: string | null; artifactExists: (p: string) => boolean; stories: { file: string; markdown: string }[]; gates: { file: string; yaml: string }[] }): BoardState`
  - `export function canAdvance(board: BoardState, from: StageId): boolean`

- [ ] **Step 1: Write the failing test**

Create `scripts/stageBoardStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBoard, canAdvance } from "../src/stores/stageBoardStore";

const storyMd = (id: string, status: string) =>
  `# Story ${id}: Something\n\n## Status\n\n${status}\n`;
const gateYaml = (id: string, v: string) => `story: "${id}"\ngate: ${v}\nstatus_reason: "ok"\n`;

const empty = { config: null, artifactExists: () => false, stories: [], gates: [] };

describe("buildBoard", () => {
  it("describes an empty project without erroring", () => {
    const b = buildBoard(empty);
    expect(b.stories).toEqual([]);
    expect(b.currentStage).toBe("brainstorming");
    expect(b.stages.every((s) => !s.complete)).toBe(true);
    expect(b.usedDefaults).toBe(true);
  });

  it("puts the five stages under BMAD's two phases", () => {
    const b = buildBoard(empty);
    expect(b.stages.map((s) => s.id)).toEqual([
      "brainstorming", "design", "audit", "execution", "review",
    ]);
    expect(b.stages.filter((s) => s.phase === "Planning").map((s) => s.id))
      .toEqual(["brainstorming", "design", "audit"]);
    expect(b.stages.filter((s) => s.phase === "Dev cycle").map((s) => s.id))
      .toEqual(["execution", "review"]);
  });

  it("completes a stage when its evidence resolves", () => {
    const b = buildBoard({ ...empty, artifactExists: (p) => p === "docs/brief.md" });
    expect(b.stages.find((s) => s.id === "brainstorming")!.complete).toBe(true);
    expect(b.currentStage).toBe("design");
  });

  it("needs both the PRD and the architecture for Design", () => {
    const only = buildBoard({ ...empty, artifactExists: (p) => ["docs/brief.md", "docs/prd"].includes(p) });
    expect(only.stages.find((s) => s.id === "design")!.complete).toBe(false);

    const both = buildBoard({
      ...empty,
      artifactExists: (p) => ["docs/brief.md", "docs/prd", "docs/architecture"].includes(p),
    });
    expect(both.stages.find((s) => s.id === "design")!.complete).toBe(true);
  });

  it("needs every story done before Execution completes, not merely one", () => {
    const base = {
      ...empty,
      artifactExists: () => true,
      gates: [{ file: "docs/qa/gates/1.1-a.yml", yaml: gateYaml("1.1", "PASS") }],
    };
    const partial = buildBoard({ ...base, stories: [
      { file: "docs/stories/1.1.a.md", markdown: storyMd("1.1", "Done") },
      { file: "docs/stories/1.2.b.md", markdown: storyMd("1.2", "Review") },
    ]});
    expect(partial.stages.find((s) => s.id === "execution")!.complete).toBe(false);

    const all = buildBoard({ ...base, stories: [
      { file: "docs/stories/1.1.a.md", markdown: storyMd("1.1", "Done") },
    ]});
    expect(all.stages.find((s) => s.id === "execution")!.complete).toBe(true);
  });

  it("does not believe a Done story with no gate", () => {
    const b = buildBoard({ ...empty, artifactExists: () => true,
      stories: [{ file: "docs/stories/1.1.a.md", markdown: storyMd("1.1", "Done") }] });
    expect(b.stories[0].state).toBe("claimed");
    expect(b.stages.find((s) => s.id === "execution")!.complete).toBe(false);
  });
});

describe("canAdvance", () => {
  it("refuses while the stage's evidence is missing", () => {
    expect(canAdvance(buildBoard(empty), "brainstorming")).toBe(false);
  });

  it("allows it once the evidence is there", () => {
    const b = buildBoard({ ...empty, artifactExists: (p) => p === "docs/brief.md" });
    expect(canAdvance(b, "brainstorming")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/stageBoardStore.test.ts`
Expected: FAIL — cannot resolve `../src/stores/stageBoardStore`.

- [ ] **Step 3: Write minimal implementation**

Create `src/stores/stageBoardStore.ts`:

```ts
import { parseBmadConfig, type BmadPaths } from "../lib/bmadConfig";
import { resolveArtifacts, type Artifact, type ArtifactId } from "../lib/bmadArtifacts";
import { parseStory } from "../lib/bmadStories";
import { parseGate } from "../lib/bmadGates";
import { executionComplete, storyView, type StoryView } from "../lib/storyState";

/**
 * The board's view of a project.
 *
 * Holds no persisted state of its own: the files are the state. That is the
 * whole answer to "nothing survives", and it means there is no second source of
 * truth to drift from the first. Everything here is a pure function of what was
 * read from disk, so the store is tested without mocking Tauri.
 */
export type StageId = "brainstorming" | "design" | "audit" | "execution" | "review";

export interface Stage {
  id: StageId;
  label: string;
  /** BMAD's own two-phase approach, which the five stages sit inside. */
  phase: "Planning" | "Dev cycle";
  evidence: ArtifactId[];
  complete: boolean;
}

export interface BoardState {
  paths: BmadPaths;
  artifacts: Artifact[];
  stories: StoryView[];
  stages: Stage[];
  /** The first incomplete stage. */
  currentStage: StageId;
  usedDefaults: boolean;
}

const STAGES: { id: StageId; label: string; phase: Stage["phase"]; evidence: ArtifactId[] }[] = [
  { id: "brainstorming", label: "Brainstorming", phase: "Planning", evidence: ["brief"] },
  { id: "design", label: "Design", phase: "Planning", evidence: ["prd", "architecture"] },
  { id: "audit", label: "Audit", phase: "Planning", evidence: ["reviews"] },
  { id: "execution", label: "Execution", phase: "Dev cycle", evidence: [] },
  { id: "review", label: "Review", phase: "Dev cycle", evidence: [] },
];

export function buildBoard(input: {
  config: string | null;
  artifactExists: (path: string) => boolean;
  stories: { file: string; markdown: string }[];
  gates: { file: string; yaml: string }[];
}): BoardState {
  const paths = parseBmadConfig(input.config);
  const artifacts = resolveArtifacts(paths, input.artifactExists);
  const gates = input.gates.map((g) => parseGate(g.file, g.yaml));
  const stories = input.stories
    .map((s) => storyView(parseStory(s.file, s.markdown), gates))
    .sort((a, b) => a.story.id.localeCompare(b.story.id, undefined, { numeric: true }));

  const present = (id: ArtifactId) => artifacts.find((a) => a.id === id)?.present ?? false;
  const done = executionComplete(stories);

  const stages: Stage[] = STAGES.map((s) => ({
    ...s,
    complete:
      s.id === "execution" || s.id === "review"
        ? done
        : s.evidence.length > 0 && s.evidence.every(present),
  }));

  return {
    paths,
    artifacts,
    stories,
    stages,
    currentStage: stages.find((s) => !s.complete)?.id ?? "review",
    usedDefaults: paths.usedDefaults,
  };
}

/**
 * Evidence on disk is necessary but not sufficient: an agent can write a stub,
 * and a click alone is how a project reaches Execution with no PRD. The human
 * action lives in the component; this answers whether it may be offered.
 */
export function canAdvance(board: BoardState, from: StageId): boolean {
  return board.stages.find((s) => s.id === from)?.complete ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/stageBoardStore.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/stores/stageBoardStore.ts scripts/stageBoardStore.test.ts
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -m "Assemble the board from what is on disk

A pure function of the files read: config, artifacts, stories, gates. The
store persists nothing, because the files are the state - which is the
whole answer to nothing surviving, and leaves no second source of truth to
drift from the first.

The five stages sit under BMAD's own two phases rather than replacing
them. Execution and Review share a completion test because BMAD's loop
interleaves them: stories reach review individually while others are still
being built, so presenting them as sequential would make the board wrong
on day two.

A stage completes only when its evidence resolves, and Execution only when
every story is done - not when one exists."
```

---

## Self-Review

**1. Spec coverage.** Every spec section maps to a task: BMAD-as-root and the two phases (Task 7), paths from `core-config.yaml` including sharding (Tasks 1–2), the namespace mapping (Task 6), conflicting artifact names (Task 2), the three gates (Tasks 3, 5, 7), stages-not-sequential (Task 7), failure modes (Tasks 1–4), testing (every task).

**Deliberately out of scope for this plan:** the `StageBoard.tsx` component, the terminal pane, dispatch, and removing `OrchestratorTab`. Those are the second plan. This one delivers the complete, tested logic the component renders — working, testable software on its own, with no UI risk mixed into it. Splitting here is the point where a reviewer could reject the view without rejecting the engine.

**2. Placeholder scan.** No TBDs; every step carries runnable code and an exact command.

**3. Type consistency.** `BmadPaths` (1) → `resolveArtifacts` (2) → `buildBoard` (7). `Story`/`isDispatchable` (3) and `Gate`/`gateFor` (4) → `storyView` (5) → `buildBoard` (7). `ArtifactId` is defined in Task 2 and re-used in Task 7's `Stage.evidence`. `StoryView` is produced in Task 5 and consumed in Task 7.

**4. Review Focus.** All five have tests in their owning tasks: no config (1), sharded PRD (2), unknown status (3), malformed gate (4), Done without a gate (5).
