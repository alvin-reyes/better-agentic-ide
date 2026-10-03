# Selectable methodologies

A project chooses how it works. Today it cannot: `RULES_MD` is a 4,096-character
template literal in `src/lib/projectMethodology.ts`, written into every project
as `.ade/rules.md`, and it is the only methodology ADE has.

## The problem

ADE imposes one process — *verified, not vibed*: Plan → Approve → Shard →
Build → Verify, with a story Done only when the agreed verification command
passes. That process is good, and for a greenfield product build it is the
right one. It is also the only one on offer, which makes ADE wrong for work it
should handle well:

- **A brownfield service** where the architecture already exists does not need
  a plan-and-approve phase; it needs a change to be scoped against what is
  there. BMAD ships three brownfield workflows ADE never uses.
- **A team running Shape Up** bets on a fixed appetite and ships what fits. ADE
  would tell it to shard stories it does not have.
- **A team running Scrum** has ceremonies, a sprint boundary and a velocity
  signal that ADE's flow cannot express.

Meanwhile BMAD is vendored into every project — 21 tasks, 6 workflows, 6
checklists, 13 templates — and the methodology never refers to any of it. The
six workflows are the clearest evidence of the gap: greenfield and brownfield,
each for fullstack, service and UI. They are six different processes sitting
unused next to a methodology that assumes one.

## Goals

1. A project declares its methodology, and setup writes that one.
2. BMAD's workflows become reachable as methodologies rather than an unused
   directory.
3. ADE's thesis survives the choice. Switching methodology must not become a
   way to opt out of verification.
4. The definitions live in `ade-setup`, like the roles, so a methodology can be
   shared and improved without an app release.

## Non-goals

- **Authoring methodologies in the app.** They are markdown in a git
  repository, edited there.
- **Mixing two methodologies in one project.** One per project; a monorepo with
  genuinely different processes has genuinely different projects.
- **Migrating existing projects.** A project with no declared methodology is an
  `ade` project and is left alone. See **Migration**.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| What a methodology controls | The **flow**, its ceremonies and its artifacts | These are what actually differ between processes |
| What it cannot control | The **core rules** | They are ADE's thesis, not a process preference — see below |
| Where the choice lives | `.ade/ade.json` → `{ "methodology": "<id>" }` | One file already describes the project to ADE |
| Where definitions live | `ade-setup/methodologies/<id>/` | Same source as the roles, same vendoring |
| Roles per methodology | A **subset of the nineteen**, never new ids | Renaming ids is what caused the drift Step 1 cleaned up |
| BMAD's library | **Still installed, always** | It is a task library, not a methodology; the tasks are useful under any flow |
| Default | `ade` | Nothing changes for anyone who does not choose |

### The core rules are not negotiable

Three rules move out of `rules.md` into a `core.md` that every methodology
inherits and none may override:

1. **No agent certifies its own work.** The verifier is never the builder.
2. **Done means the agreed verification command passed** — on the commit in
   question, with the output shown.
3. **Shared contracts are recorded** in the context store before they are
   duplicated.

This is the decision that makes the feature safe. Without it, "selectable
methodology" is a setting that disables verification, and the first team under
deadline pressure will select its way out of the thing that makes ADE worth
using. A methodology defines *how work moves*; it does not get a vote on
whether the work is checked.

`core.md` is written to `.ade/core.md` and imported by `.ade/rules.md`, so the
split is visible on disk rather than implied.

## The methodologies to ship

Five, chosen because each one changes the flow in a way the others cannot
express — not to pad a list.

| id | Flow | Backed by |
|---|---|---|
| `ade` | Plan → Approve → Shard → Build → Verify | the current rules (default) |
| `bmad-greenfield` | Analysis → PRD → Architecture → Shard → Build → QA gate | BMAD `greenfield-*.yaml` |
| `bmad-brownfield` | Document existing → Scope change → Epic/story → Build → QA gate | BMAD `brownfield-*.yaml` |
| `shape-up` | Pitch → Bet → Build (fixed appetite) → Cool-down | — |
| `kanban` | Continuous flow with WIP limits; no iteration boundary | — |

Scrum is deliberately absent from the first set. Its distinguishing features
are ceremonies and a sprint boundary, and a fleet of agents has neither a
standup nor a two-week cadence; modelling it would produce a methodology whose
every rule is inert. If a user asks for it, it is a `kanban` variant with a
boundary, and that is the shape to build it as.

`bmad-greenfield` and `bmad-brownfield` each pick their fullstack, service or UI
variant from the project's stack detection, which already distinguishes those
cases.

## Layout

```
ade-setup/
  methodologies/
    core.md                      the three rules, inherited by all
    ade/methodology.md
    ade/roles.txt                which of the nineteen participate
    bmad-greenfield/methodology.md
    bmad-greenfield/roles.txt
    …
vendor/ade-setup/methodologies/  pinned copy, parsed at build time
```

`methodology.md` carries the flow, its phases and its Definition of Done.
`roles.txt` is one role id per line — data, parsed the same way `owns` globs
are, so a methodology that names a role that does not exist fails a test rather
than shipping.

Parsing mirrors `src/data/roles.ts`: `import.meta.glob`, eager, no prose in
TypeScript. The guard in `scripts/agentSource.test.ts` extends to cover it.

## What setup writes

```
.ade/
  core.md        the three rules                     (new, every project)
  rules.md       the chosen methodology's flow       (was: the only methodology)
  ade.json       { "methodology": "bmad-greenfield" } (new)
.bmad-core/      unchanged — the task library, always installed
CLAUDE.md        @.ade/core.md and @.ade/rules.md
```

`CLAUDE.md` imports both, so an agent reads the core rules before the flow and
cannot be handed a flow without them.

## Choosing one

Two entry points, both of which already exist in some form:

- **New project dialog** — a methodology row beside the stack detection, with
  `ade` preselected.
- **Command palette** — `Project: Change methodology`, which rewrites
  `.ade/rules.md` and the `ade.json` key, and reports what changed.

Changing methodology mid-project rewrites `rules.md` and nothing else. Stories,
context and the journal are the project's, not the methodology's, and survive
the switch. A switch that would orphan an artifact (shaping a `docs/pitch.md`
when leaving `shape-up`) says so and leaves the file.

## Migration

A project whose `.ade/ade.json` has no `methodology` key is an `ade` project.
Setup adds the key on its next run and writes `core.md`; it does not rewrite an
existing `rules.md`, because a hand-edited methodology is the user's. The toast
says which methodology was assumed.

## Risks

- **A methodology that quietly weakens verification.** Mitigated by `core.md`
  being separate, inherited, and asserted by a test that every shipped
  methodology's `rules.md` contains no rule contradicting it. The test can only
  catch textual contradiction; a reviewer still has to read a new methodology.
- **Role subsets that strand an artifact.** `shape-up` has no Scrum Master, so
  `docs/stories/**` has no steward under it. A test asserts every glob owned by
  a participating role is reachable, and the methodology declares which
  artifacts it does not use.
- **Five methodologies, one real user.** If only `ade` and the two BMAD ones
  get used, `shape-up` and `kanban` are maintenance with no payer. Ship the
  three that are backed by something real first, then the other two.

## Testing

- Every methodology parses: a flow, a Definition of Done, a `roles.txt` whose
  every id exists in the catalog.
- `core.md` is written to every project regardless of methodology, and
  `CLAUDE.md` imports it before `rules.md`.
- No shipped methodology's text contradicts the three core rules.
- Switching methodology rewrites `rules.md` and leaves stories, context and the
  journal untouched.
- A project with no `methodology` key is treated as `ade` and its existing
  `rules.md` is not rewritten.

## Scope

`src/lib/projectMethodology.ts` (the literal becomes a parser),
`src/lib/projectSetup.ts`, `src/data/methodologies.ts` (new),
`vendor/ade-setup/methodologies/` (new), `scripts/agentSource.test.ts`,
`src/components/NewTabDialog.tsx`, `src/components/CommandPalette.tsx`,
`src-tauri/src/projectsetup.rs`, and the methodology text in `README.md` and
`docs/guide/project-setup.md`.

## Open

- **Whether a methodology may add a role** that is not one of the nineteen.
  Argued no for now — the catalog is the catalog — but a methodology with a
  genuinely new accountability has no way to express it.
- **Whether `core.md` should be user-extensible.** A team with its own
  non-negotiable (every PR has a security review) has nowhere to put it that a
  methodology switch will not erase.
