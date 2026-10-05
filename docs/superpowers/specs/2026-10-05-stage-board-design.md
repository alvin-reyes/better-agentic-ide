# Stage Board: brainstorm to shipped, in one place

*2026-10-05*

## Why

ADE can already run a disciplined project. It cannot **show** you one.

The method exists in prose: `CLAUDE.md` tells every agent that work flows
*Plan → Approve → Shard → Build → Verify*, and that a story is Done only when
the agreed verification command passes. Nineteen roles declare what they own and
which files they write. BMAD ships the tasks and templates that produce those
files. All of it works, and none of it is visible: to know where a project
stands you read files, and to move it forward you remember what comes next.

So the method is real but optional in practice, which is the gap this closes.

Three symptoms, named by the project owner:

- **Nothing survives.** `orchestratorStore` keeps tasks in `localStorage`,
  capped at 20 sessions and trimmed. They are not in the repo, so they cannot be
  reviewed, diffed, or handed to anyone.
- **It is scattered.** Brainstorming, the task log and the fleet are separate
  tabs. There is nowhere you plan, watch and verify in one view.
- **It exists but goes unused.** `OrchestratorTab` technically does
  brainstorm → tasks → dispatch, and is not how anyone works.

## What this is

A **stage board**: one tab holding a terminal pane and a panel beside it. The
panel shows which of five stages the project is in, spawns that stage's roles
into the terminal, and renders the artifacts those roles produce as the evidence
that the stage actually happened.

It invents no process. Every stage, role, artifact and status below already
exists in the repo; this surfaces them and adds three gates.

## The five stages

| Stage | Roles spawned | Evidence |
|---|---|---|
| **Brainstorming** | analyst, brainstorming-architect | `docs/brainstorming-session-results.md`, `docs/brief.md` |
| **Design** | product-manager, architect, designer | the PRD and the architecture |
| **Audit** | adversarial-reviewer, security-engineer | `docs/reviews/**`, `docs/threat-model.md`, `docs/security-review.md` |
| **Execution** | product-owner, scrum-master, developer | `docs/backlog.md`, the story directory |
| **Review** | qa, adversarial-reviewer | `{qaLocation}/gates/{epic}.{story}-{slug}.yml` |

### Paths come from `core-config.yaml`, never from a constant

BMAD stores its own layout in `.bmad-core/core-config.yaml`, and every path
above is configurable:

```yaml
qa:           { qaLocation: docs/qa }
prd:          { prdFile: docs/prd.md, prdSharded: true, prdShardedLocation: docs/prd }
architecture: { architectureFile: docs/architecture.md, architectureSharded: true,
                architectureShardedLocation: docs/architecture }
devStoryLocation: docs/stories
```

The board reads this file and resolves from it. Two consequences that are easy
to get wrong:

- **Sharded artifacts are directories, not files.** With `prdSharded: true` the
  PRD is `docs/prd/` containing `epic-{n}*.md`, and `docs/prd.md` may not exist
  at all. Evidence for the Design stage therefore means "the PRD resolves",
  which is a different check in each mode.
- **Gates live under `qaLocation`**, which defaults to `docs/qa` — so
  `docs/qa/gates/`, not a top-level `gates/`.

If `core-config.yaml` is absent the board falls back to these defaults and says
so, rather than reporting a project with no artifacts.

Audit sits before Execution deliberately. It audits the **plan**, not the code:
the adversarial reviewer and the security engineer attack the PRD and the
architecture while changing them is still cheap. None of BMAD's six workflows
has this step — they go design → shard → build — and it is the reason the board
is worth building rather than just reading the docs directory by hand.

The architecture document carries the **agreed verification command**, which the
architect owns. Every later gate depends on it, so Design cannot complete
without one.

### The sequence comes from a BMAD workflow, not from these five names

`bmad-core/workflows/` ships six workflows — `greenfield-fullstack`,
`greenfield-service`, `greenfield-ui` and three brownfield variants — and each
already encodes the agent-to-artifact sequence. `greenfield-fullstack` begins:

```yaml
- agent: analyst     creates: project-brief.md
- agent: pm          creates: prd.md
- agent: ux-expert   creates: front-end-spec.md
- agent: architect   creates: fullstack-architecture.md
- agent: po          action: shard_documents
- agent: sm          action: create_story
```

The five stages are a **human-facing grouping over these steps**, not a
replacement for them. The board picks a workflow (a new project defaults to a
greenfield variant; an existing codebase to brownfield), reads its steps, and
buckets each into one of the five stages. Audit is the one stage with no
workflow steps to bucket, so its steps are ADE's own.

This matters because hardcoding five stages would drift from BMAD the moment a
workflow changes, which is the failure this whole design exists to avoid.

### The workflow ships its own diagram, and that diagram is the board

Each workflow file carries a `flow_diagram` — a complete mermaid graph of the
real sequence, including the decision branches (`Architecture suggests PRD
changes?`, `QA found issues?`), the SM → Dev → QA loop, and the optional steps
as dashed edges.

The board **renders that graph and marks where the project actually is**,
derived from which artifacts resolve on disk. It does not draw a picture of its
own. Three consequences, all of them the point:

- **The picture cannot lie about the method**, because it *is* the method's own
  file. If BMAD changes the workflow, the board changes with it.
- **The branches are visible.** A linear five-step rail would hide that the
  workflow genuinely loops and genuinely forks; the shipped graph does not.
- **Optional steps look optional.** `brainstorming`, `market research`,
  `technical research` and the v0 prompt are dashed in the source and stay
  dashed on the board, so skipping one is a visible choice rather than an
  invisible omission.

The five stages become a **coarse overlay** on that graph — a reading aid for
"where are we", not a second model of the work. Where the two disagree, the
workflow file wins.

### Two namespaces have to be mapped

BMAD workflows name agents `analyst`, `pm`, `ux-expert`, `architect`, `po`,
`sm`, `dev`, `qa`. ADE's roles are `analyst`, `product-manager`, `designer`,
`architect`, `product-owner`, `scrum-master`, `developer`, `qa`. The story
template uses a third spelling again (`editors: [scrum-master, dev-agent]`).

A single mapping table owns this translation, and a test asserts every agent
named in every bundled workflow resolves to one of the nineteen roles. Without
it a workflow step silently spawns nothing.

### Artifact names conflict, and config wins

ADE's roles declare they own `docs/brief.md` and `docs/architecture.md`.
BMAD's greenfield-fullstack workflow creates `project-brief.md` and
`fullstack-architecture.md`. A board looking only for ADE's names would report
"missing" on a project BMAD itself built.

`core-config.yaml` is the authority where it has an opinion
(`prdFile`, `architectureFile`, `devStoryLocation`, `qaLocation`). For the
artifacts it says nothing about — the brief, reviews, threat model, backlog —
the board accepts **either** spelling and treats the stage as satisfied if
either resolves. Reporting a stage incomplete because of a filename is worse
than accepting two names for one thing.

## What it replaces

- **`OrchestratorTab`** and `orchestratorStore` — superseded. Its chat is a
  second, bespoke agent channel; stage agents run in a real terminal pane
  through the same path `AgentPicker` already uses.
- **`BmadPanel`** and `BMAD_PHASES` (`["Planning", "Dev cycle"]`) — the stage
  rail replaces both.
- **`FleetTab` survives.** It shows the cross-project timeline, which is not
  tied to any single project's board.

## Architecture

Three units, each independently testable.

**`src/lib/bmadConfig.ts`** — parses `core-config.yaml` into resolved paths,
with the documented defaults when it is missing. Everything else asks this for a
path; nothing hardcodes `docs/`.

**`src/lib/bmadArtifacts.ts`** — pure functions, no I/O. Given file contents,
returns what exists, each story's Status, and each QA gate's verdict. Parsing
is the part most likely to be wrong, so it is the part with no dependencies.

**`src/stores/stageBoardStore.ts`** — holds the parsed view for the active
project. Refreshed by the existing `watch_directory` command. It has **no
persistence of its own**: the files are the state. This is the whole answer to
"nothing survives", and it means there is no second source of truth to drift
from the first.

**`src/components/stage/StageBoard.tsx`** — the tab. A terminal pane, a stage
rail, an artifact list, a story list, and a fleet strip showing which lane is
running against which story.

### Data flow

One direction:

```
agent writes a file in the terminal
  → watch_directory fires
  → artifacts re-parsed
  → board re-renders
```

The UI writes files for exactly two human actions: promoting a story from
`Draft` to `Approved`, and recording a stage advance. Everything else on disk is
written by agents, in the terminal, as they already do.

Dispatching a story opens a pane and sends the launch command. The story file
already names its role and acceptance criteria, so dispatch carries no prompt
the user has to retype.

## The gates

**Stage advance.** The board offers *next* only when the current stage's
evidence exists on disk, and a human then clicks to advance. Evidence alone is
not enough: an agent can write a stub. A click alone is not enough: that is how
a project reaches Execution with no PRD. Going back a stage is always allowed
and never destroys anything.

Execution is the exception, and needs a stronger test than the others. "The
story directory exists" is satisfied by a single story, which would let a
project advance with the backlog barely started. Execution is complete when
**every story is at `Done` or `dropped`** — not when stories merely exist.

### Stages are not strictly sequential once Execution starts

Stories carry their own lifecycle — `Draft → Approved → InProgress → Review →
Done` — and it runs *per story*, inside Execution. So the Review stage does not
mean "all building has finished and reviewing now begins"; stories reach review
individually while others are still being built.

The board models this honestly: Execution and Review are a **loop**, not two
steps. The Review stage shows the gate queue — every story sitting at `Review`
waiting on a QA verdict — and the project leaves the loop only when Execution's
completion test above passes. Presenting them as sequential would misdescribe
how the work actually runs and would make the board wrong on day two.

**Approve.** BMAD's own `Draft → Approved` transition on a story. Only a human
click performs it, and nothing is dispatched to the fleet below `Approved`.

**Done.** Not a checkbox. A story shows Done only when a QA gate file exists for
it with `gate: PASS`. A story whose own Status says `Done` with no passing gate
renders as **"claimed, ungated"**. We cannot stop an agent writing `Done` into a
file; we can decline to believe it, which is what *no agent certifies its own
work* means in practice. `WAIVED` renders distinctly with its reason always
visible, because a waiver should be uncomfortable to look at.

## Failure modes

**Missing artifacts are the normal state**, not an error. A new project has
none, and showing which step is next is the board's main job on day one.

**Malformed artifacts stay visible.** An unparseable story or an invalid gate
YAML renders as itself plus the parse error. A story you cannot see is worse
than one that is broken, and silently dropping it would make the board lie about
what the project contains.

**Stories outside the template** still render. BMAD's format may change and
hand-written stories exist; anything with a readable title appears, with
unknown Status shown as unknown rather than guessed.

**Watcher loss** is inherited, not invented: `watch_directory` is already used
elsewhere and the board re-reads on focus regardless, so a missed event costs a
refresh rather than correctness.

## Testing

**Parsers carry the weight.** Fixtures come from the real templates in
`src-tauri/resources/bmad/bmad-core/templates/`, so if BMAD's story or gate
format moves, the tests fail instead of the board silently misreading files.

**Two rules encode the doctrine**, each verified by reintroducing the violation
and watching the test fail:

- nothing dispatches below `Approved`
- `Done` requires a QA gate with `gate: PASS`; Status alone renders as claimed

**Two rules protect the stage machine**: a stage cannot be advanced while its
evidence is absent, and Execution cannot complete while any story is short of
`Done` or `dropped`.

**One rule protects the namespace mapping**: every agent named in every bundled
BMAD workflow resolves to one of the nineteen ADE roles. This runs against the
vendored workflow files, so a BMAD upgrade that renames an agent fails the build
instead of silently spawning nothing.

## Non-goals

- No new agents. All nineteen roles exist.
- No new file formats. Stories, gates and templates are BMAD's.
- No new statuses. `Draft → Approved → InProgress → Review → Done` is BMAD's.
- No editing of artifacts in the panel. Agents write them in the terminal; the
  board reads them. Adding an editor would create a second writer and the drift
  this design exists to avoid.
- Not a replacement for `FleetTab`.

## Decisions taken, and by whom

Stated by the project owner:

- All four gaps apply: nothing survives, scattered, missing PM/PO artifacts, unused.
- The human sets intent, the PM agent drafts, the human approves.
- Absorb `OrchestratorTab`; keep `FleetTab`.
- A new project still opens a terminal; the board is offered, not imposed.
- Brainstorming happens in the same terminal, with agents spawned per stage.
- The five stages are Brainstorming, Design, Audit, Execution, Review.
- A stage advances when its evidence exists **and** the human advances it.

Assumed here, and worth correcting if wrong:

- Stage roles spawn into the **same** pane in turn, rather than one pane each.
- The board is per-project, following the active project's resolved paths.
- A stage with several roles spawns them one at a time, in the order listed,
  rather than all at once into one pane.

## Risks

**`OrchestratorTab` removal reaches further than the tab.** Ten files reference
it or `orchestratorStore`, and `src/lib/anthropic.ts` is imported by that tab
**alone**. Removing it therefore also retires the direct Anthropic SDK path and
strands two settings users may have configured: `anthropicApiKey` and
`orchestratorProvider`.

That is mostly a gain — it removes a second agent channel, an API-key surface,
and the `@anthropic-ai/sdk` dependency, leaving the CLI providers as the only
way agents run. But it is a user-visible loss for anyone who set that key, and
it must be in the release notes. Sessions in `localStorage` cannot be migrated
into stories without inventing their content, so they are dropped rather than
faked.

Whether to retire the SDK path in the same change or leave it unused for a
release is an open decision for the implementation plan.

**The board is only as good as the artifacts.** If agents write thin PRDs, the
board shows a green stage over a weak plan. The Audit stage is the mitigation,
which is why it is a stage rather than an optional review.

**BMAD's templates are vendored.** A BMAD upgrade can move the formats. The
fixture-based parser tests are what turn that from a silent misread into a
failing build.
