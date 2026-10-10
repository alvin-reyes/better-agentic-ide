# BMAD v6 Roles & Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the eight methodology-aware roles a v6 task section composed per project, and bring the docs up to the new v6-default world.

**Architecture:** Each role file gains `## BMAD tasks (v6)` beside the renamed `## BMAD tasks (v4)`; `composeRoleMarkdown` emits only the section matching the project's methodology. Docs rewrite the vendoring policy and the guide's v4-specific paths.

**Tech Stack:** TypeScript (vitest), markdown role files in `vendor/ade-setup/agents/`, Jekyll guide.

**Spec:** `docs/superpowers/specs/2026-10-10-bmad-v6-adoption-design.md`

## Global Constraints

- The v6 sections must cite only skills that exist in the vendored tree at `src-tauri/resources/bmad-v6/skills/` — verify each citation before writing it.
- v4 sections keep today's text (read-only compat for v4 projects); only the heading changes to `## BMAD tasks (v4)`.
- The QA v6 section names the ADE gate write as ADE's own step, never as a BMAD task.
- Existing v4 project behavior and tests stay green.
- Commit message style follows repo history (conventional prefixes).

## Review Focus

1. **A v6 citation names a skill that is not in the vendored tree** — a composed role would point an agent at nothing; pinned by a test that walks every `## BMAD tasks (v6)` bullet and asserts the named skill dir exists under `src-tauri/resources/bmad-v6/skills/`.
2. **A v4 project's agent sees v6 commands** — composition must strip the v6 section entirely; pinned by a composition test with methodology `v4`.
3. **A role file loses its `## BMAD tasks` heading** (renamed wrong) — the v4 composition must still find the section; pinned by a test that composes each of the 8 roles for v4 and asserts the section body is non-empty.
4. **The QA gate write tells an agent to write a verdict for a ticket that has no id** — the role text must say the filename is the ticket id from the ticket tree; pinned by a text assertion in the role-content test.
5. **Docs still tell v6 users to read `.bmad-core/tasks/<name>.md`** — the guide must not send v6 users to v4 files; pinned by a grep test over the docs directory.

---

### Task 1: Methodology-aware role composition

**Files:**
- Modify: `src/lib/agentComposition.ts`
- Test: `src/lib/__tests__/agentComposition.test.ts` (extend the existing suite)

**Interfaces:**
- Consumes: `composeRoleMarkdown(role, domain?)` — existing signature.
- Produces: `composeRoleMarkdown(role, domain?, methodology: "v4" | "v6" = "v6")` — emits only the `## BMAD tasks (v4)` section when `methodology` is `"v4"`, only `## BMAD tasks (v6)` when `"v6"`, and drops the other. Roles with no such sections pass through unchanged. Default `"v6"` so new callers default to the primary methodology.

- [ ] **Step 1: Write the failing test**

```ts
it("emits only the v6 task section for v6 projects", () => {
  const role = { id: "qa", name: "QA", markdown: "## BMAD tasks (v4)\nv4 stuff\n\n## BMAD tasks (v6)\nv6 stuff\n" };
  const out = composeRoleMarkdown(role, undefined, "v6");
  expect(out).toContain("v6 stuff");
  expect(out).not.toContain("v4 stuff");
});

it("emits only the v4 task section for v4 projects", () => {
  const role = { id: "qa", name: "QA", markdown: "## BMAD tasks (v4)\nv4 stuff\n\n## BMAD tasks (v6)\nv6 stuff\n" };
  const out = composeRoleMarkdown(role, undefined, "v4");
  expect(out).toContain("v4 stuff");
  expect(out).not.toContain("v6 stuff");
});

it("passes roles without BMAD task sections through unchanged", () => {
  const role = { id: "sre", name: "SRE", markdown: "# SRE\nplain role\n" };
  expect(composeRoleMarkdown(role, undefined, "v6")).toBe(role.markdown);
});

it("composes each of the eight vendored roles for v4 with a non-empty section", () => {
  // Review Focus #3: the heading rename must not break v4 composition.
  const AGENTS = join(__dirname, "../../../vendor/ade-setup/agents");
  const names = ["analyst", "designer", "developer", "brainstorming-architect", "product-owner", "qa", "scrum-master", "technical-writer"];
  for (const name of names) {
    const md = readFileSync(join(AGENTS, `${name}.md`), "utf8");
    const out = composeRoleMarkdown({ id: name, name, markdown: md }, undefined, "v4");
    expect(out, `${name} lost its v4 section`).toContain("## BMAD tasks (v4)");
    expect(out.split("## BMAD tasks (v4)")[1]?.trim().length, `${name} v4 section is empty`).toBeGreaterThan(20);
    expect(out, `${name} v4 composition leaked v6 commands`).not.toContain("## BMAD tasks (v6)");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/agentComposition.test.ts`
Expected: FAIL — the assertions fail against the current single-section behavior.

- [ ] **Step 3: Implement the filter in agentComposition.ts**

Add to `composeRoleMarkdown`:

```ts
/** Keep only the BMAD tasks section for the project's methodology. v4 and v6
 * sections sit in the same role file; an agent must never see the other
 * version's commands, which do not exist in its project. */
function filterBmadSection(md: string, methodology: "v4" | "v6"): string {
  const sections = md.split(/^## BMAD tasks \(v[46]\)$/m);
  if (sections.length !== 3) return md; // no dual sections: leave untouched
  const [head, v4, v6] = sections;
  return head + (methodology === "v4" ? "## BMAD tasks (v4)" + v4 : "## BMAD tasks (v6)" + v6);
}
```

Apply it inside `composeRoleMarkdown` after the role+domain assembly, and thread the new parameter through the call sites in `src/lib/agentCommand.ts` (which composes per launch) — those pass the project's methodology from the launch options.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/agentComposition.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agentComposition.ts src/lib/__tests__/agentComposition.test.ts src/lib/agentCommand.ts
git commit -m "feat(bmad-v6): compose roles per project methodology"
```

---

### Task 2: The eight roles' v6 sections

**Files:**
- Modify: `vendor/ade-setup/agents/analyst.md`, `designer.md`, `developer.md`, `brainstorming-architect.md`, `product-owner.md`, `qa.md`, `scrum-master.md`, `technical-writer.md`
- Test: `scripts/bmadTaskRefs.test.ts` (extend in Task 3)

**Interfaces:**
- Produces: each of the 8 files has `## BMAD tasks (v4)` (today's content, heading renamed) followed by `## BMAD tasks (v6)` with the content below, using the shared v6 intro.

- [ ] **Step 1: Verify each v6 citation against the vendored tree**

Run: `ls src-tauri/resources/bmad-v6/skills/ | tr '\n' ' '`
Expected: the listing includes `bmad`, `bmad-ticket`, `bmad-build`, `bmad-code-review`, `bmad-correct-course`, `bmad-brainstorming`, `bmad-advanced-elicitation`, `bmad-deep-recon`, `bmad-ux`, `bmad-spec`, `bmad-architecture`, `bmad-qa-generate-e2e-tests`. If any is missing, substitute the closest skill that exists and note the substitution in the commit message.

- [ ] **Step 2: Rename the existing section in all 8 files**

In each file, change the heading `## BMAD tasks` to `## BMAD tasks (v4)` (exact string; one occurrence per file).

Run: `grep -c "## BMAD tasks (v4)" vendor/ade-setup/agents/{analyst,designer,developer,brainstorming-architect,product-owner,qa,scrum-master,technical-writer}.md`
Expected: `1` per file.

- [ ] **Step 3: Append the v6 sections with this exact content**

Shared intro (identical in all 8 files, inserted after the v4 section, before the role's next `## ` section):

```markdown
## BMAD tasks (v6)

BMAD v6 is installed in every v6 ADE project as skills under
`.claude/skills/`. Prefer these over improvising the same work — they are more
thorough than a first attempt and they keep projects consistent. Deviate when a
task genuinely does not fit, and say why.

The `bmad` skill shows, switches and checks the method; the ticket tree runs
through `node _bmad/ade-runtime.mjs tickets …` (`bmad-ticket`).
```

Per-role bullets (replacing the v4 bullet list each role had):

`analyst.md`:
```markdown
- `bmad-advanced-elicitation` — turn a question into a research prompt worth actually running
- `bmad-deep-recon` — when the research subject is the existing codebase
```

`designer.md`:
```markdown
- `bmad-ux` — the UX design pass that feeds the build
```

`developer.md`:
```markdown
- `bmad-build` — implement the ticket; its step-04 runs the code-review lenses
- `bmad-code-review` findings triage — apply what the review found, then re-run the verification
```

`brainstorming-architect.md`:
```markdown
- `bmad-brainstorming` — run the session instead of jumping to an answer
- `bmad-advanced-elicitation` — draw out the requirements the first answer did not surface
```

`product-owner.md`:
```markdown
- `bmad-correct-course` — when the plan and reality have diverged, work out the change
```

`qa.md`:
```markdown
- `bmad-code-review` — the full review that ends in findings with verdicts
- `bmad-architecture` — traceability: the architecture spine's lint and the ticket
  Tree validation (`covers`) map each acceptance criterion to the test that proves it
- `bmad-qa-generate-e2e-tests` — end-to-end coverage for a story; risk and test
  design ride the ticket's `risk:` field and the review lenses
- The ADE gate — after the review and the Closure check, record the verdict in
  `.ade/gates/<ticket-id>.yml` with `gate: PASS|CONCERNS|FAIL|WAIVED`,
  `status_reason` and `updated`. This is ADE's own step, replacing v4's
  `qa-gate`; the filename is the ticket id from the ticket tree, and a ticket
  is not done until a readable verdict says so.
```

`scrum-master.md`:
```markdown
- `bmad-ticket` — `next`, `pull` and `validate` run the ticket tree, replacing
  v4's `create-next-story`
- `bmad-deep-recon` + the existing-codebase flow — the same, against a codebase
  that already exists (v4's `brownfield-create-story`)
- Epic creation — write the `[[epic]]` table into the initiative's
  `tickets.toml` (v4's `brownfield-create-epic`)
```

`technical-writer.md`:
```markdown
- `bmad-spec` — condense a codebase into a short spec (v4's `document-project`)
- The docs index has no core v6 equivalent — keep maintaining `docs/` indexes
  by the convention this role used under v4
```

- [ ] **Step 4: Add the citation test that pins Review Focus #1 and #4**

In `scripts/bmadTaskRefs.test.ts`:

```ts
it("every v6 task citation names a skill in the vendored v6 tree", () => {
  const skills = readdirSync(join(__dirname, "../src-tauri/resources/bmad-v6/skills"));
  for (const f of files) {
    const body = readFileSync(join(AGENTS, f), "utf8");
    const v6 = body.split("## BMAD tasks (v6)")[1]?.split(/^## /m)[0] ?? "";
    for (const m of v6.matchAll(/`(bmad[\w-]+)`/g)) {
      expect(skills, `${f} cites ${m[1]}`).toContain(m[1]);
    }
  }
});

it("the QA v6 section names the gate file by ticket id", () => {
  // Review Focus #4: an agent must know the filename is the ticket id.
  const qa = readFileSync(join(AGENTS, "qa.md"), "utf8");
  const v6 = qa.split("## BMAD tasks (v6)")[1]?.split(/^## /m)[0] ?? "";
  expect(v6).toContain(".ade/gates/<ticket-id>.yml");
  expect(v6).toContain("PASS|CONCERNS|FAIL|WAIVED");
});
```

- [ ] **Step 5: Run the task-refs suite**

Run: `npx vitest run scripts/bmadTaskRefs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vendor/ade-setup/agents/analyst.md vendor/ade-setup/agents/designer.md vendor/ade-setup/agents/developer.md vendor/ade-setup/agents/brainstorming-architect.md vendor/ade-setup/agents/product-owner.md vendor/ade-setup/agents/qa.md vendor/ade-setup/agents/scrum-master.md vendor/ade-setup/agents/technical-writer.md scripts/bmadTaskRefs.test.ts
git commit -m "feat(bmad-v6): dual task sections in the eight methodology-aware roles"
```

---

### Task 3: Keep the v4 role sections verified

**Files:**
- Modify: `scripts/bmadTaskRefs.test.ts`

**Interfaces:**
- Consumes: the renamed `## BMAD tasks (v4)` headings.

- [ ] **Step 1: Update the existing test to read the renamed section**

The existing test greps bodies for task references. Change its section extraction from `## BMAD tasks` to `## BMAD tasks (v4)` wherever it splits sections, so the v4 checks keep validating the v4 content and do not accidentally read the v6 section.

- [ ] **Step 2: Run the suite**

Run: `npx vitest run scripts/bmadTaskRefs.test.ts`
Expected: PASS (v4 checks unchanged in substance).

- [ ] **Step 3: Commit**

```bash
git add scripts/bmadTaskRefs.test.ts
git commit -m "test(bmad-v6): v4 task-ref checks read the renamed section"
```

---

### Task 4: Docs — vendoring policy and guide

**Files:**
- Modify: `docs/bmad-vendoring.md` (rewrite)
- Modify: `docs/guide/agents.md` (BMAD section), `docs/guide/index.md` (methodology mention), `docs/guide/settings.md` (setup choice)
- Test: extend `scripts/bmadTaskRefs.test.ts` with the docs grep (Review Focus #5)

**Interfaces:**
- Produces: docs that describe the v6-default world with v4 as an option.

- [ ] **Step 1: Rewrite docs/bmad-vendoring.md**

Replace the "Why ADE stays on v4.44.3" decision with the new policy, keeping the same structure: pinned version (v6.9.0), the v4/v6 per-project choice, ADE's ownership of the gate under `.ade/gates/`, the TS runtime and patched skills (no Python/uv), the v4 read-only compatibility, and the re-vendor instructions:

```bash
bash scripts/vendor-bmad-v6.sh v6.x.y     # skills + patch + VERSION
npx vitest run                           # parsers read the vendored files
```

- [ ] **Step 2: Update the guide pages**

`docs/guide/agents.md`: the BMAD paragraph now says a project is v6 by default (skills under `.claude/skills/`, tickets in `_bmad-output/`, ADE gates in `.ade/gates/`) and v4 is chosen at setup for new projects, existing v4 projects unchanged.

`docs/guide/index.md`: the project-setup paragraph gains the methodology choice line.

`docs/guide/settings.md`: the setup section documents the v6/v4 question.

- [ ] **Step 3: Add the docs grep test**

In `scripts/bmadTaskRefs.test.ts`:

```ts
it("the guide never sends v6 users to v4 task files", () => {
  for (const f of ["../docs/guide/agents.md", "../docs/guide/settings.md"]) {
    const body = readFileSync(join(__dirname, f), "utf8");
    for (const line of body.split("\n")) {
      if (line.includes(".bmad-core/tasks/")) {
        expect(line.includes("v4"), `${f}: v4-only path without v4 context`).toBe(true);
      }
    }
  }
});
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run scripts/bmadTaskRefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/bmad-vendoring.md docs/guide/agents.md docs/guide/index.md docs/guide/settings.md scripts/bmadTaskRefs.test.ts
git commit -m "docs(bmad-v6): vendoring policy and guide for the v6-default world"
```

---

### Task 5: Propagate the roles to ade-setup

**Files:**
- Modify: the 8 role files in the `ade-setup` repo (github.com/alvin-reyes/ade-setup) — same content as Task 2.

**Interfaces:**
- Produces: ade-setup's published roles match the vendored copy; ADE's next pinned-copy bump picks them up.

- [ ] **Step 1: Mirror the changes**

Copy the 8 updated role files from `vendor/ade-setup/agents/` to the local clone of `ade-setup` (clone it if absent: `git clone https://github.com/alvin-reyes/ade-setup /tmp/ade-setup`), commit on a branch, and open a PR with `gh pr create --title "feat: dual BMAD task sections (v4 + v6)"`.

- [ ] **Step 2: Confirm the PR**

Run: `gh pr view` in the ade-setup clone
Expected: the PR lists 8 changed files.

- [ ] **Step 3: Commit (repo side)**

```bash
git add -A
git commit -m "chore(ade-setup): note the v6 role PR in the pinned copy"
```

(No code change to this repo beyond any pointer note; the pinned-copy bump happens on the next scheduled ade-setup sync.)

---

### Task 6: Full verification

- [ ] **Step 1: Run everything**

Run: `npx tsc --noEmit && npm test && cd src-tauri && cargo test`
Expected: PASS — including all v4 suites from before this effort.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "fix(bmad-v6): address full-suite findings"
```

---

Plan 3 complete. The three plans together implement the whole spec: foundation (vendoring, runtime, scaffold), verification & board (gate, ticket tree, v6 board), and roles & docs.
