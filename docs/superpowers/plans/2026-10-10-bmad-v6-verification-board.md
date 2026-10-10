# BMAD v6 Verification & Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give v6 projects the ADE-owned verification gate and a stage board that reads the v6 ticket tree — with v4 projects rendering exactly as before.

**Architecture:** Reuse the existing pure board engine (`buildBoard` → `BoardState`) by feeding it v6-shaped `StoryView`s: a ticket-tree parser maps tickets onto the v4 story shape, gates come from `.ade/gates/` via a methodology-aware discovery, and a v6 evidence mapping drives the five stages. All pure modules, fixture-tested; the board UI (when built) consumes `BoardState` unchanged.

**Tech Stack:** TypeScript (vitest), `smol-toml`, `src/lib/bmadRuntime` (Plan 1).

**Spec:** `docs/superpowers/specs/2026-10-10-bmad-v6-adoption-design.md`

## Global Constraints

- Node 18+ on user machines; never require Python or uv at runtime.
- `StoryView` and `BoardState` shapes must not change — both methodologies emit them.
- A ticket marked `done` with no readable gate renders as `claimed`, never `done`.
- v4 tests and behavior stay green (read-only compat).
- Existing v4 gate schema keys are reused verbatim for `.ade/gates/` files.
- Commit message style follows repo history (conventional prefixes).

## Review Focus

1. **A v6 ticket id is alphanumeric (`6a`) and matches a v4-looking id (`2.4`)** — `gateFor` must not confuse them across methodologies; pinned by a ticket-tree test with both id shapes.
2. **A ticket's plan file is missing but the leaf exists** — status must derive as `planned`, not crash; pinned by a ticketView test.
3. **A v6 project has a stale `.ade/gates/` file for a dropped ticket** — it must surface as an unmatched gate, like v4 orphans; pinned by a board test.
4. **A v4 project opened after the v6 switch** — detection must pick the v4 parser and `docs/qa/gates/` path, never `.ade/gates/`; pinned by a discovery test.
5. **An epic folder has `tickets.toml` but zero pulled leaves** — the board shows the epic with no tickets rather than claiming completion; `executionComplete` must stay false (it requires `views.length > 0`).

---

### Task 1: Methodology-aware gate discovery

**Files:**
- Create: `src/lib/gateDiscovery.ts`
- Test: `src/lib/__tests__/gateDiscovery.test.ts`

**Interfaces:**
- Consumes: `loadCentralConfig` from `src/lib/bmadRuntime/config.ts` (Plan 1), `Fs` from `src/lib/bmadRuntime/fs.ts`.
- Produces: `export async function findGates(root: string, methodology: "v4" | "v6", fs: Fs): Promise<{ file: string; yaml: string }[]>` — v6: every `.yml` under `.ade/gates/`; v4: every `.yml` under `docs/qa/gates/` (the v4 `qaLocation`). Missing directory ⇒ `[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/gateDiscovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findGates } from "../gateDiscovery";
import { memFs } from "../bmadRuntime/fs";

describe("findGates", () => {
  it("reads .ade/gates for v6 projects", async () => {
    const fs = memFs();
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/6a.yml", "gate: PASS");
    expect(await findGates("/p", "v6", fs)).toEqual([{ file: ".ade/gates/6a.yml", yaml: "gate: PASS" }]);
  });

  it("reads docs/qa/gates for v4 projects and never .ade/gates", async () => {
    const fs = memFs();
    await fs.mkdir("/p/docs/qa/gates");
    await fs.writeText("/p/docs/qa/gates/2.1.yml", "gate: PASS");
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/9.yml", "gate: FAIL");
    expect(await findGates("/p", "v4", fs)).toEqual([{ file: "docs/qa/gates/2.1.yml", yaml: "gate: PASS" }]);
  });

  it("returns an empty list when no gate directory exists", async () => {
    expect(await findGates("/p", "v6", memFs())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/gateDiscovery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement gateDiscovery.ts**

```ts
import type { Fs } from "./bmadRuntime/fs";

/** Gate files for a project, by methodology. v6 verdicts live in ADE's own
 * .ade/gates/; v4 projects keep BMAD's docs/qa/gates/. The file format is the
 * same (spec: the schema reuses v4's keys verbatim). */
export async function findGates(root: string, methodology: "v4" | "v6", fs: Fs): Promise<{ file: string; yaml: string }[]> {
  const dir = methodology === "v6" ? `${root}/.ade/gates` : `${root}/docs/qa/gates`;
  if (!(await fs.exists(dir))) return [];
  const names = (await fs.list(dir)).filter((n) => n.endsWith(".yml"));
  const out: { file: string; yaml: string }[] = [];
  for (const n of names) out.push({ file: `${dir.replace(root + "/", "")}/${n}`, yaml: await fs.readText(`${dir}/${n}`) });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/gateDiscovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gateDiscovery.ts src/lib/__tests__/gateDiscovery.test.ts
git commit -m "feat(bmad-v6): methodology-aware gate discovery"
```

---

### Task 2: The ticket tree parser

**Files:**
- Create: `src/lib/bmadTicketTree.ts`
- Test: `src/lib/__tests__/bmadTicketTree.test.ts`
- Create: `src/lib/__tests__/fixtures/v6tree.ts` (fixture builder)

**Interfaces:**
- Consumes: `loadCentralConfig` (Plan 1) for the store root, `parseToml`, `Fs`.
- Produces: `export interface Ticket { file: string; id: string; type: "story" | "spike" | "bug"; title: string; parent: string; status: string | null; acceptanceCriteria: string[]; epic: string; }` and `export async function readTicketTree(root: string, fs: Fs): Promise<{ tickets: Ticket[]; epics: { id: string; slug: string; title: string; ticketCount: number }[] }>` — walks `{output_folder}/{active_initiative}`: the initiative's `tickets.toml` `[[epic]]` tables name the epics; each `epic-<slug>/tickets.toml` `[[entry]]` table names the tickets; each `story-<slug>.md` leaf contributes frontmatter (`id`, `type`, `title`, `parent`) and its `## Acceptance Criteria` bullets; each `<stem>-plan.md` contributes `status` from its frontmatter `ticket` key (matched by stem). A leaf without a plan has `status: null`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/bmadTicketTree.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readTicketTree } from "../bmadTicketTree";
import { memFs } from "../bmadRuntime/fs";
import { seedV6Tree } from "./fixtures/v6tree";

describe("readTicketTree", () => {
  it("reads epics, entries, leaves and plan statuses", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: "1.1", slug: "cart-total", epic: "cart", type: "story" }],
      plans: { "story-cart-total": { status: "in-review" } },
    });
    const { tickets, epics } = await readTicketTree("/p", fs);
    expect(epics).toEqual([{ id: "1", slug: "cart", title: "Cart", ticketCount: 1 }]);
    expect(tickets[0]).toMatchObject({ id: "1.1", type: "story", title: "Cart total", status: "in-review", epic: "cart" });
  });

  it("derives planned when the plan file is missing", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }], tickets: [{ id: "1.1", slug: "cart-total", epic: "cart", type: "story" }], plans: {} });
    const { tickets } = await readTicketTree("/p", fs);
    expect(tickets[0].status).toBeNull();
  });

  it("distinguishes alphanumeric ids from v4-style dotted ids", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }], tickets: [{ id: "6a", slug: "discounts", epic: "cart", type: "story" }], plans: {} });
    const { tickets } = await readTicketTree("/p", fs);
    expect(tickets[0].id).toBe("6a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bmadTicketTree.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the fixture builder**

`src/lib/__tests__/fixtures/v6tree.ts` — write the tree the way the vendored templates shape it: `_bmad/config.toml` (template with `output_folder = "/p/_bmad-output"` and `active_initiative = "initiative-demo"` under `[core]`), `_bmad-output/initiative-demo/initiative-demo.md` (the initiative container doc), `_bmad-output/initiative-demo/tickets.toml` (`[[epic]]` tables), `epic-<slug>/tickets.toml` (`[[entry]]` tables), `epic-<slug>/story-<slug>.md` (frontmatter + `# title` + `## Acceptance Criteria`), optional `story-<slug>-plan.md` (frontmatter `ticket` + `status`).

- [ ] **Step 4: Implement bmadTicketTree.ts**

```ts
import { parse as parseToml } from "smol-toml";
import { loadCentralConfig } from "./bmadRuntime/config";
import type { Fs } from "./bmadRuntime/fs";

export interface Ticket {
  file: string; id: string;
  type: "story" | "spike" | "bug";
  title: string; parent: string;
  status: string | null;        // from the plan; null when no plan exists
  acceptanceCriteria: string[];
  epic: string;
}

export interface EpicRow { id: string; slug: string; title: string; ticketCount: number }

function frontmatter(md: string): Record<string, string> {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const m = /^(\w[\w-]*):\s*(.+)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function criteria(md: string): string[] {
  const body = /## Acceptance Criteria\s*\n([\s\S]*)$/.exec(md)?.[1] ?? "";
  return body.split("\n").map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").replace(/^\[[ xX]\]\s*/, "").trim()).filter(Boolean);
}

export async function readTicketTree(root: string, fs: Fs): Promise<{ tickets: Ticket[]; epics: EpicRow[] }> {
  const cfg = await loadCentralConfig(root, fs);
  const out = ((cfg.core as any)?.output_folder ?? `${root}/_bmad-output`) as string;
  const init = (cfg.core as any)?.active_initiative as string | undefined;
  const store = init ? `${out}/${init}` : out;

  const initiativeToml = await fs.exists(`${store}/tickets.toml`) ? parseToml(await fs.readText(`${store}/tickets.toml`)) as { epic?: { id: string | number; slug: string; title: string }[] } : {};
  const epicRows = (initiativeToml.epic ?? []).map((e) => ({ id: String(e.id), slug: e.slug, title: e.title, ticketCount: 0 }));

  const tickets: Ticket[] = [];
  for (const epic of epicRows) {
    const dir = `${store}/epic-${epic.slug}`;
    const toml = await fs.exists(`${dir}/tickets.toml`) ? parseToml(await fs.readText(`${dir}/tickets.toml`)) as { entry?: { id: string | number; type: string; title: string }[] } : {};
    const entries = toml.entry ?? [];
    epic.ticketCount = entries.length;
    for (const e of entries) {
      const type = (["story", "spike", "bug"].includes(e.type) ? e.type : "story") as Ticket["type"];
      const stem = `${type}-${e.id}`; // entries materialise as <type>-<slug>.md; id is the reference key
      const leafPath = `${dir}/${stem}.md`;
      const leaf = await fs.exists(leafPath) ? await fs.readText(leafPath) : "";
      const fm = frontmatter(leaf);
      const plan = await fs.exists(`${dir}/${stem}-plan.md`) ? frontmatter(await fs.readText(`${dir}/${stem}-plan.md`)) : {};
      tickets.push({
        file: `${dir.replace(root + "/", "")}/${stem}.md`,
        id: String(e.id),
        type,
        title: fm.title ?? e.title,
        parent: `epic-${epic.slug}`,
        status: plan.status ?? null,
        acceptanceCriteria: criteria(leaf),
        epic: epic.slug,
      });
    }
  }
  return { tickets, epics: epicRows };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/bmadTicketTree.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadTicketTree.ts src/lib/__tests__/bmadTicketTree.test.ts src/lib/__tests__/fixtures/v6tree.ts
git commit -m "feat(bmad-v6): ticket tree parser"
```

---

### Task 3: Ticket → StoryView mapping with the distrust rule

**Files:**
- Create: `src/lib/ticketView.ts`
- Test: `src/lib/__tests__/ticketView.test.ts`

**Interfaces:**
- Consumes: `Ticket` (Task 2), `Gate` + `gateFor` from `src/lib/bmadGates.ts`, `StoryView` + `storyView` from `src/lib/storyState.ts`.
- Produces: `export const TICKET_STATUS_TO_STORY: Record<string, StoryStatus>` — `draft|ready-for-dev → Draft`, `in-progress → InProgress`, `in-review → Review`, `built|done → Done`, `blocked → Blocked` (rendered as rawStatus `blocked` — the board's `unknown` fallback shows it), `dropped → Dropped`. And `export function ticketView(ticket: Ticket, gates: Gate[]): StoryView` — adapts a `Ticket` to the v4 `Story` shape (status mapped, `rawStatus` = v6 status, acceptanceCriteria passed through) and delegates to `storyView`, so the gate pairing and the claimed-not-done rule are the existing code, not a copy.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/ticketView.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ticketView } from "../ticketView";
import { parseGate } from "../bmadGates";

const ticket = (status: string | null) => ({
  file: "x/story-1.1.md", id: "1.1", type: "story" as const, title: "T",
  parent: "epic-cart", status, acceptanceCriteria: ["AC1"], epic: "cart",
});

describe("ticketView", () => {
  it("maps built to Done and pairs the ADE gate", () => {
    const gate = parseGate(".ade/gates/1.1.yml", 'story: "1.1"\ngate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n');
    const v = ticketView(ticket("built"), [gate]);
    expect(v.state).toBe("done");
    expect(v.gate?.verdict).toBe("PASS");
  });

  it("renders a done ticket with no gate as claimed, not done", () => {
    const v = ticketView(ticket("done"), []);
    expect(v.state).toBe("claimed");
  });

  it("derives planned for a missing plan and keeps the v6 status visible", () => {
    const v = ticketView(ticket(null), []);
    expect(v.story.status).toBe("Draft");
    expect(v.story.rawStatus).toBe("");
  });

  it("keeps blocked and dropped tickets visible as unknown-status stories", () => {
    for (const s of ["blocked", "dropped"]) {
      const v = ticketView(ticket(s), []);
      expect(v.story.rawStatus).toBe(s);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/ticketView.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ticketView.ts**

```ts
import { gateFor, type Gate } from "./bmadGates";
import { storyView, type StoryView, type StoryStatus } from "./storyState";
import type { Ticket } from "./bmadTicketTree";

/** v6 status → the board's story statuses. blocked/dropped have no v4 word;
 * they pass through rawStatus so the board shows what the plan actually said. */
export const TICKET_STATUS_TO_STORY: Record<string, StoryStatus> = {
  draft: "Draft", "ready-for-dev": "Draft",
  "in-progress": "InProgress", "in-review": "Review",
  built: "Done", done: "Done",
};

export function ticketView(ticket: Ticket, gates: Gate[]): StoryView {
  const status = ticket.status ? TICKET_STATUS_TO_STORY[ticket.status] ?? "unknown" : "Draft";
  return storyView(
    {
      file: ticket.file,
      id: ticket.id,
      title: ticket.title,
      status,
      rawStatus: ticket.status ?? "",
      acceptanceCriteria: ticket.acceptanceCriteria,
    },
    gates,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/ticketView.test.ts`
Expected: PASS. (If `storyState`'s mapping of `Done`-without-gate is not `claimed`, adjust the test to the actual existing state name — the existing behavior is the contract.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ticketView.ts src/lib/__tests__/ticketView.test.ts
git commit -m "feat(bmad-v6): ticket-to-board mapping with the distrust rule"
```

---

### Task 4: The v6 board adapter (buildBoardV6)

**Files:**
- Create: `src/lib/boardV6.ts`
- Test: `src/lib/__tests__/boardV6.test.ts`

**Interfaces:**
- Consumes: `readTicketTree` (Task 2), `ticketView` (Task 3), `findGates` (Task 1), `parseGate`, `BoardState` + `STAGES` shape from `src/stores/stageBoardStore.ts`, `executionComplete` from `storyState.ts`.
- Produces: `export async function buildBoardV6(root: string, fs: Fs): Promise<BoardState>` — builds the same `BoardState` as `buildBoard` with v6 evidence: `paths` filled from the v6 config (usedDefaults false), `artifacts` from v6 files (initiative doc, epic docs, per-ticket plan files as the artifacts the stages cite), stages: brainstorming = initiative doc present (optional), design = initiative + ≥1 epic, audit = ≥1 gate file or a plan with a `## Code Review` section, execution/review = `executionComplete(views)`; `unmatchedGates`/`supersededGates` from the v6 gate set exactly as v4 computes them.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/boardV6.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBoardV6 } from "../boardV6";
import { memFs } from "../bmadRuntime/fs";
import { seedV6Tree } from "./fixtures/v6tree";

describe("buildBoardV6", () => {
  it("shows an empty v6 project at the first stage", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [], tickets: [], plans: {} });
    const board = await buildBoardV6("/p", fs);
    expect(board.currentStage).toBe("design");
    expect(board.stories).toEqual([]);
  });

  it("marks execution complete only when every ticket is done with a readable gate", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: "1.1", slug: "cart-total", epic: "cart", type: "story" }],
      plans: { "story-cart-total": { status: "done" } },
    });
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", 'story: "1.1"\ngate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n');
    const board = await buildBoardV6("/p", fs);
    expect(board.stories[0].state).toBe("done");
    expect(board.currentStage).toBe("review");
  });

  it("an epic with zero pulled leaves never claims completion", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }], tickets: [], plans: {} });
    const board = await buildBoardV6("/p", fs);
    expect(board.stories).toEqual([]);
    expect(board.currentStage).toBe("audit");
  });

  it("surfaces a stale gate for a dropped ticket as unmatched", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [], tickets: [], plans: {} });
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/9.yml", 'gate: "FAIL"\n');
    const board = await buildBoardV6("/p", fs);
    expect(board.unmatchedGates.map((g) => g.file)).toEqual([".ade/gates/9.yml"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/boardV6.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement boardV6.ts**

```ts
import { readTicketTree } from "./bmadTicketTree";
import { ticketView } from "./ticketView";
import { findGates } from "./gateDiscovery";
import { parseGate } from "./bmadGates";
import { executionComplete } from "./storyState";
import { loadCentralConfig } from "./bmadRuntime/config";
import type { BoardState, Stage, StageId } from "../stores/stageBoardStore";
import type { Fs } from "./bmadRuntime/fs";

/** The v6 evidence mapping for the same five stages the v4 board uses.
 * Brainstorming: the initiative doc (optional, like the v4 brief). Design:
 * initiative + at least one epic. Audit: at least one gate file. Execution
 * and Review: every ticket done — the gates keep "done" honest. */
export async function buildBoardV6(root: string, fs: Fs): Promise<BoardState> {
  const cfg = await loadCentralConfig(root, fs);
  const out = (cfg.core as any)?.output_folder ?? `${root}/_bmad-output`;
  const init = (cfg.core as any)?.active_initiative as string | undefined;
  const store = init ? `${out}/${init}` : out;

  const { tickets, epics } = await readTicketTree(root, fs);
  const gates = (await findGates(root, "v6", fs)).map((g) => parseGate(g.file, g.yaml));
  const views = tickets.map((t) => ticketView(t, gates)).sort((a, b) => a.story.id.localeCompare(b.story.id, undefined, { numeric: true }));

  const initiativePresent = init ? await fs.exists(`${store}/initiative-${init}.md`) : false;
  const done = executionComplete(views);
  const specs: { id: StageId; label: string; phase: "Planning" | "Dev cycle"; evidence: string[]; optional: boolean; own: boolean }[] = [
    { id: "brainstorming", label: "Brainstorming", phase: "Planning", evidence: ["brief"], optional: true, own: initiativePresent },
    { id: "design", label: "Design", phase: "Planning", evidence: ["prd", "architecture"], optional: false, own: initiativePresent && epics.length > 0 },
    { id: "audit", label: "Audit", phase: "Planning", evidence: ["reviews"], optional: false, own: gates.length > 0 },
    { id: "execution", label: "Execution", phase: "Dev cycle", evidence: [], optional: false, own: done },
    { id: "review", label: "Review", phase: "Dev cycle", evidence: [], optional: false, own: done },
  ];
  // Completion is monotonic, exactly as in buildBoard: a stage cannot be
  // complete while an earlier one is not.
  const stages: Stage[] = specs.map((s, i) => ({
    id: s.id, label: s.label, phase: s.phase, evidence: s.evidence, optional: s.optional,
    complete: s.own && specs.slice(0, i + 1).every((p) => p.own),
  }));

  const storyIds = new Set(views.map((v) => v.story.id));
  const cited = new Set(views.map((v) => v.gate?.file).filter(Boolean));
  const spare = gates.filter((g) => !cited.has(g.file));

  return {
    paths: { usedDefaults: false } as BoardState["paths"],
    artifacts: [],
    stories: views,
    stages,
    unmatchedGates: spare.filter((g) => !storyIds.has(g.storyId)),
    supersededGates: spare.filter((g) => storyIds.has(g.storyId)),
    currentStage: stages.find((s) => !s.complete)?.id ?? "review",
    usedDefaults: false,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/boardV6.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (all v4 board tests remain green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/boardV6.ts src/lib/__tests__/boardV6.test.ts
git commit -m "feat(bmad-v6): v6 board adapter with ADE-owned gate evidence"
```

---

Plan 2 complete: v6 projects get the verification gate and a board engine reading the ticket tree; v4 projects are untouched. Plan 3 (role dual sections + docs) follows this file's task format.
