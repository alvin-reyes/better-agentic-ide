# BMAD v6 Adoption — Design

Date: 2026-10-10
Status: approved design (pre-implementation-plan)

## Context

ADE vendors BMAD-METHOD v4.44.3 and scaffolds it into every project. A previous
decision (`docs/bmad-vendoring.md`, commit 342da16) pinned ADE to the v4 line,
citing three blockers in v6: it removed the QA gate (the artifact ADE's board
exists to enforce), it imposes Python/uv on every project, and its task commands
differ from the ones eight ADE roles cite.

The decision is now reversed because its first "what would change the decision"
condition is met: **ADE owns the verification gate as its own artifact**, so v6's
missing gate no longer blocks. This spec covers adopting BMAD v6 (pinned at upstream main commit bda3c59, self-described 6.13.0-next)
as the default methodology, with v4 retained as an option and read-only
compatibility for existing v4 projects.

## Decisions (confirmed with the user)

1. **Why now**: ADE owns the verification gate; v6's lack of gates is filled by
   an ADE-owned artifact under `.ade/`.
2. **Delivery**: ADE vendors the v6 assets itself. No Python/uv on user
   machines — v6's runtime scripts are ported to TypeScript.
3. **Mode**: v6 is the primary/default methodology for new projects; v4 remains
   selectable.
4. **Existing v4 projects**: read-only compatibility — the board keeps parsing
   v4 stories and gates. No migration or conversion tooling in this effort.
5. **Gate**: ADE-owned per-story verdict files in `.ade/gates/` with the
   PASS|CONCERNS|FAIL|WAIVED verdict; v4 projects keep their classic
   `docs/qa/gates/` files.
6. **Choice point**: per-project, chosen at setup; terminals and agents inherit
   the project's methodology.
7. **Roles**: the eight roles citing v4 task commands get dual
   `## BMAD tasks (v4)` / `## BMAD tasks (v6)` sections, composed per project
   methodology.
8. **Approach**: vendor the skills, port the runtime to TypeScript, patch the
   skills to call the ported runtime (approach 1 of the vendoring assessment).

## Architecture

### Vendored layout

- v6 skills (all 33 skill dirs plus the `bmod-*` module records — skills
  reference each other by name and modules validate their members) live at
  `src-tauri/resources/bmad-v6/skills/`, pinned at upstream main commit `bda3c59` (6.13.0-next), stamped by a
  `VERSION` file.
- The existing v4 tree at `src-tauri/resources/bmad/` stays untouched for
  legacy projects.
- Skills are scaffolded project-local into `.claude/skills/` — v6's own rules
  say a project copy shadows a global one; a global install is not required.

### TypeScript runtime

The eight runtime scripts are ported to one TypeScript module,
`src/lib/bmadRuntime/`:

- `config_utils.py` — recursive structural merge; arrays keyed-merged by
  `code`/`id` when every item carries one, else appended
- `resolve_config.py` — merges `_bmad/config.toml` ←
  `_bmad/custom/config.toml` ← `_bmad/custom/config.user.toml` to JSON
- `resolve_customization.py` — per-skill `customize.toml` ←
  `_bmad/custom/<skill>.toml` ← `<skill>.user.toml`
- `tickets.py` + `read_store.py` — the ticket tree: `next`, `status`, `find`,
  `pull`, `mark`, `mirror`
- `render_skill.py` — renders a skill's markdown workflow with a
  jinja2-subset templater
- `memlog.py` — append-only JSON-lines memory log
- `setup.py` (the scaffolding half) — replaced by the Rust-side scaffold
  below, not ported as an agent-facing command

A vendored TOML parser is bundled; the module has no runtime dependencies.

**Two consumers, one port:**

- The app's UI (stage board, scaffold, gate reading) imports the TS module
  directly.
- Agents in terminals cannot invoke Tauri commands, so the build bundles the
  module to a single dependency-free `_bmad/ade-runtime.mjs` scaffolded into
  each v6 project — the same delivery pattern as `.bmad-core/` today.

**Patched skills.** At vendor time a patch script rewrites every
`uv run …/scripts/foo.py` call site in the vendored SKILL.md files to
`node _bmad/ade-runtime.mjs foo …` with identical arguments. The patch is
idempotent and fails loudly on any call site it does not recognize, so
upstream churn cannot silently ship unpatched.

**Node requirement.** User machines need Node (any version Claude Code
supports — Node 18+) — acceptable because ADE's primary agent is Claude Code,
which itself requires Node. No Python or uv is ever needed.

### Project scaffold and the methodology marker

- A project's methodology is recorded in a new `.ade/methodology` file
  (`v6` or `v4`) written by setup. Detection falls back to what is on disk
  (`.bmad-core/` ⇒ v4) so projects from before this change read correctly.
  New projects are asked at setup: **v6 (default) or v4**. Terminals and
  agents inherit the project's methodology. Nothing here converts a v4
  project.
- A v6 scaffold writes (never overwriting existing files):
  - `.claude/skills/` — the 33 vendored skill dirs
  - `_bmad/config.toml` — `project_name` and `output_folder`
  - `_bmad/custom/` + protective `.gitignore`
  - `_bmad/ade-runtime.mjs`
  - `_bmad-output/` — the tickets folder
  - Initiative/epic/story/tickets templates stay inside the vendored
    `bmad-ticket` skill for the agent to use; ADE does not pre-create
    initiatives (v6's own setup doesn't either).
- A v4 scaffold is unchanged (`.bmad-core/`).
- The setup prompt (Settings → `autoProjectSetup` flow) gains the methodology
  question.

### The ADE-owned gate

- `.ade/gates/<ticket-id>.yml` keeps the schema of v4's gate template:
  `story`, `gate:` (PASS|CONCERNS|FAIL|WAIVED), `status_reason`, `updated`,
  `waiver`. The existing gate parser, `gateFor`, and `storyView` reuse
  unchanged — they are keyed by story id and file-agnostic. v6 ticket ids are
  alphanumeric (e.g. `6a`), which the schema tolerates.
- **Writer**: the QA role, v6-composed — after `bmad-code-review` and the
  Closure check it records the verdict in `.ade/gates/<ticket-id>.yml`,
  replacing v4's `qa-gate` task. The dev role never writes a gate.
- **Reader**: the stage board. A ticket marked `done` with no readable gate
  renders as *claimed*, not verified — "no agent certifies its own work"
  survives the version switch by moving from BMAD's file to ADE's.
- **Errors**: an unreadable gate surfaces on the board (existing behavior).
  A missing `ade-runtime.mjs` or skills folder in an older v6 project is fixed
  by setup's existing re-apply-missing-files pass.

### Stage board for the v6 ticket tree

New parser `src/lib/bmadTicketTree.ts`, reading:

- `tickets.toml` per folder — the initiative's `[[epic]]` tables and each
  epic's `[[entry]]` tables, with the same vendored TOML parser the runtime
  uses
- Leaf files `story-<slug>.md` — frontmatter carries `id`, `type`
  (`story|spike|bug`), `title`, `parent`
- Plan files `story-<slug>-plan.md` — frontmatter carries `ticket` (the join
  key) and `status`; v6 deliberately keeps status out of the leaf

Status mapping onto the board's existing vocabulary:

| v6 status | board state |
|---|---|
| `draft`, `ready-for-dev` | planned |
| `in-progress` | in-progress |
| `in-review` | review |
| `built`, `done` | done (claimed unless a readable gate says otherwise) |
| `blocked` | blocked |
| `dropped` | dropped |

Epics become group headers; tickets are cards. Both methodologies emit the
same `StoryView[]`; the project's methodology marker decides which parser
runs, so the board component itself is untouched. v4 projects keep the
existing parser and gates, read-only.

### Role definitions

The eight roles (analyst, designer, developer, brainstorming-architect,
product-owner, qa, scrum-master, technical-writer) keep one file each; the
current `## BMAD tasks` section is renamed `## BMAD tasks (v4)` and a new
`## BMAD tasks (v6)` section cites the real v6 equivalents:

| v4 command | v6 section cites |
|---|---|
| create-next-story / create-story | `bmad-ticket` — pull, next, validate |
| validate-next-story | `bmad-ticket` validate + Closure check |
| trace-requirements | `bmad-architecture` spine + ticket Tree validation (`covers`) |
| review-story | `bmad-code-review` |
| shard-doc | `bmad-spec` |
| brownfield-create-story | `bmad-deep-recon` + existing-codebase flow |
| qa-gate | ADE's gate write: after `bmad-code-review` + Closure check, record the verdict in `.ade/gates/<ticket-id>.yml` |
| nfr-assess / test-design / risk-profile | no core equivalent (moved to the external TEA module) — folded into review lenses + the `risk:` field + Closure check |

`composeRoleMarkdown()` in `src/lib/agentComposition.ts` gains a methodology
parameter and emits only the matching section, so an agent in a v6 project
never sees commands that don't exist there.

## Testing

- **Parsers**: fixture-driven, as today's bmad* suites are. v6 fixtures are
  real upstream outputs (tickets.toml, leaf, plan, config samples) captured
  from that commit and committed — CI needs no Python.
- **Runtime port**: golden tests. Dev-time, run the real Python scripts once
  to capture expected JSON; the TS port asserts against the committed goldens.
- **Scaffold**: temp-dir tests — v6 setup produces the exact file tree and
  respects nothing-overwrites; v4 scaffold regression stays green.
- **Gate**: round-trip write/parse of `.ade/gates/` files, including
  alphanumeric ids.
- **Composition**: dual-section tests — v6 projects see only the v6 section,
  v4 only the v4 section.
- **Board**: `storyView` parity for both methodologies on shared inputs.

## Vendoring mechanics

- `scripts/vendor-bmad-v6.sh`: clone at the pinned tag → copy `skills/` → run
  the patch script → stamp `VERSION` → run the test suites.
- CI checks the vendored tree matches the pinned tag.
- Re-vendoring stays a manual step, as with v4 today.

## Milestones

1. **Vendoring + scaffold** — bundle the skills, the patch step, the
   per-project v4/v6 choice at setup, the `_bmad/` scaffold
2. **Runtime port** — config merge, tickets, workflow rendering, memlog, with
   goldens
3. **ADE-owned gate** — `.ade/gates/` write/read, QA role v6 section, board
   distrust rule
4. **Stage board for v6** — ticket tree parser + status mapping; v4 read-only
   retained
5. **Role definitions** — dual sections in ade-setup's eight roles, composed
   per methodology
6. **Docs/site** — rewrite `docs/bmad-vendoring.md`, guide updates, release

Each milestone lands with tests green on main (repo convention).

## Non-goals

- No v4 → v6 migration/conversion tooling
- No per-terminal methodology choice (projects are the unit)
- No bundling of the external TEA (Test Architect) module
- No changes to how v4 projects work
