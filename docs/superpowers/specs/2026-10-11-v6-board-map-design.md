# v6 board map

Addendum to `2026-10-10-stage-board-panel-design.md`. That spec put both
board engines in a right-hand panel. For a v6 project the panel still shows
ADE's five stages (Brainstorming, Design, Audit, Execution, Review), with the
initiative doc standing in for both the brief and the PRD. That is v4's
shape, not v6's. This spec replaces the v6 view with one that follows v6's
own workflow.

## What v6 is

The vendored skills (`src-tauri/resources/bmad-v6/skills/`, bmod-method
6.13) define four phases (Analysis, Planning, Implementation, Validation)
and say plainly that they are "not a mandatory sequence"
(`bmod-method/help/help.md`). No skill is required. A small change skips
planning entirely: `bmad-build`'s `oneshot` route (the old quick flow,
whose skills are retired) writes one plan and builds.

Every skill writes into the active initiative's folder,
`{output_folder}/{active_initiative}` (`_bmad-output/initiative-<slug>/`),
one folder per run named by the skill's prefix, beside the ticket tree. With
no active initiative, skills write loose into `_bmad-output/`. There is no
sprint or workflow status file: progress lives on ticket plans, and a doc's
own frontmatter says whether it is a draft.

## Decisions

- **No project-wide stage for v6.** The board is a map of the four phases.
  There is no current stage, no Next or Back, and no Track stage. v6 has no
  order to gate on.
- **The human gates stay on work items:** Approve, Dispatch, the QA gate,
  and the claimed rule, exactly as today.
- **Scope:** the active initiative, plus work outside any initiative (loose
  docs and plans in `_bmad-output/`, and `backlog/` bugs). Choosing the
  initiative stays v6's job (`bmad` sets it); the board follows the config.
- **A separate v6 model and view.** `BoardState`, `BoardView`, the five-stage
  rail and `.ade/stage` stay as they are, for v4 only.

## The map

Top to bottom, in v6's phase order:

**Header.** "Board · BMAD v6" and the active initiative's title. With no
active initiative: "No active initiative", and only the loose group below.

**Analysis**

- Idea work: `brainstorm-*`, `forge-*`, `research-*`
- Briefs (`brief-*`) and PRFAQs (`prfaq-*`)

**Planning**

- PRDs (`prd-*`), UX (`ux-*`), architecture (`architecture-*`), specs (`spec-*`)
- Ticket tree size: N epics, M tickets

**Implementation**

- Tickets grouped by epic: today's rows, with Approve, Dispatch and claimed
- Quick-flow plans (`plan-*.md`), marked "quick" when `route: oneshot`, with
  the plan's status
- Course changes (`change-*`)
- Deferred work (`deferred-work.md`), when present

**Validation**

- Each ticket's QA gate verdict (done ✓, waived, claimed)
- Retrospectives (`epic-*/epic-*-retrospective.md`) with their verdict
- Walkthroughs (`walkthrough-*`) and test summaries (`test-summary-*`)

**Not in an initiative.** The same kinds found loose in `_bmad-output/`
(skipping `initiative-*` folders and `backlog/`), and the bug files in
`_bmad-output/backlog/`. Omitted when there are none.

**Needs attention.** Gate problems (unmatched, superseded, unparseable),
ticket-tree problems, and docs whose status could not be read. Last, never
hidden, as today.

### Rows

- One row per doc. Several docs of one kind are several rows.
- A row shows the label, the folder's slug, and the status word. Clicking it
  opens the doc's main file (rules below). A row with no main file found
  shows the folder name and is not clickable.
- A kind with no doc shows one muted line, e.g. "PRD · none yet". These are
  not warnings: v6 requires none of them.
- Status words are shown as the doc states them. Agents write them, so they
  are labels, not gates; the board certifies nothing about a doc.

## Kinds

One table in code, `V6_KINDS`, drives classification, labels, main file and
status. A folder or file whose name matches no kind is ignored, so a skill
added later never breaks the map.

| Prefix | Phase | Label | Main file (first that exists) | Status from |
|---|---|---|---|---|
| `brainstorm-` | Analysis | Brainstorm | `<f>/<f>.md`, `<f>/brainstorm.html` | run log `status` |
| `forge-` | Analysis | Forge | `<f>/<f>.md`, `<f>/forge-report.html` | run log `status` |
| `research-` | Analysis | Research | `<f>/<f>.md`, `<f>/brief.md` | run log `status` |
| `brief-` | Analysis | Brief | `<f>/<f>.md` | frontmatter `status` |
| `prfaq-` | Analysis | PRFAQ | `<f>/<f>.md` | frontmatter `status`, else `stage` |
| `prd-` | Planning | PRD | `<f>/<f>.md` | frontmatter `status` |
| `ux-` | Planning | UX | `<f>/<f>.md`, `<f>/EXPERIENCE.md`, `<f>/DESIGN.md` | frontmatter `status` |
| `architecture-` | Planning | Architecture | `<f>/<f>.md` | frontmatter `status` |
| `spec-` | Planning | Spec | `<f>/<f>.md` | none: "present" |
| `change-` | Implementation | Course change | `<f>/<f>.md` | frontmatter `status`, else "present" |
| `plan-*.md` (file) | Implementation | Plan / Quick plan | the file | frontmatter `status`; "quick" when `route: oneshot` |
| `deferred-work.md` (file) | Implementation | Deferred work | the file | none: "present" |
| `walkthrough-` | Validation | Walkthrough | `<f>/<f>.md` | none: "present" |
| `test-summary-` | Validation | Test summary | `<f>/<f>.md` | none: "present" |

`<f>` is the folder's own name. The run log is the folder's `.memlog.md`,
read for its `status` key. Retrospectives are found inside each `epic-*`
folder (`epic-<slug>-retrospective.md`), read for `verdict`
(`accepted`, `accepted-with-open-items`, `rejected`), and listed under
Validation. Specs can also sit inside an epic folder
(`epic-<slug>/spec-<slug>/`); those are listed under Planning too.

A status read fails only when a file exists but its frontmatter cannot be
parsed. The row then reads "unreadable status" and the reason goes under
Needs attention. A missing run log or a missing `status` key is not a
failure: the row reads "present".

## Engine

`buildV6Map(root, fs): Promise<V6Map>` in `src/lib/v6Map.ts`, in the webview
over `tauriFs` like the other engines.

- **Initiative.** Resolved through the existing v6 config reader, which
  merges `_bmad/config.toml`, `_bmad/custom/config.toml` and
  `_bmad/custom/config.user.toml`. "No active initiative" is a normal empty
  state, as `buildBoardV6` already treats it.
- **Docs.** List the initiative folder; classify each entry by `V6_KINDS`;
  for each, find the main file and read the status.
- **Tickets.** Epics, tickets, plans, QA gates and approvals come from the
  existing ticket-tree reader and `buildBoardV6`'s ticket logic, factored out
  so both call one function. The claimed and approval rules stay in one
  place. Ticket rows remain `StoryView`s, so `Row` renders them unchanged.
- **Loose work.** The same classification over the top of `_bmad-output/`,
  skipping `initiative-*` and `backlog/`. Backlog bugs are the files in
  `_bmad-output/backlog/`, listed by title (frontmatter `title`, else the
  file name) and clickable.

`V6Map`, roughly:

```ts
interface V6Doc { kind: string; label: string; folder: string; path: string | null; status: string; quick?: boolean }
interface V6Map {
  initiative: { title: string; folder: string } | null;
  phases: Record<"analysis" | "planning" | "implementation" | "validation", V6Doc[]>;
  epics: { slug: string; title: string }[];
  tickets: StoryView[];
  retrospectives: V6Doc[];
  loose: { docs: V6Doc[]; bugs: V6Doc[] };
  unmatchedGates: Gate[];
  supersededGates: Gate[];
  problems: string[];
}
```

## Panel

- `boardPanelStore` holds `board` (v4) or `map` (v6), chosen by methodology,
  with today's rules: one build in flight and at most one queued, a 300 ms
  debounce, the last good result kept on error, and a result for a root no
  longer shown discarded.
- `BoardPanel` renders `V6MapView` for v6 and `BoardView` for v4.
- `V6MapView` reuses `Row` for tickets and the existing "Needs attention"
  rendering for gate problems.

## Refresh

The same watched folders as today: `_bmad/`, `_bmad-output/` and all of
`.ade/`. For v6 the extension list gains `html`, because brainstorm and forge
write `.html` reports. The rest (the focus rebuild, the 5 s re-check for a
missing folder) is unchanged.

## Actions

- Approve and Dispatch on ticket rows, unchanged.
- Quick plans get no Dispatch: `bmad-build` writes them while it is already
  building.
- No stage controls for v6. A v6 project that already has `.ade/stage`
  (from Track stage before this ships) keeps the file; the v6 board ignores
  it.

## Testing

- `V6_KINDS` classification: each prefix lands in its phase; an unknown
  folder is ignored; `initiative-*` and `backlog/` are skipped at the top of
  `_bmad-output/`.
- Main file: `<f>/<f>.md` first, then the listed alternatives, else no path.
- Status: frontmatter `status`; prfaq's `stage` fallback; run log status;
  "present" when nothing says; "unreadable status" plus a problem when the
  frontmatter does not parse.
- Quick plan: `route: oneshot` marks it quick; a plan joined to a ticket is
  shown under its ticket, not as a loose plan.
- Retrospective verdicts, and a spec inside an epic folder.
- No active initiative: only loose work, and the header says so.
- Ticket parity: the tickets, gates and approvals `buildV6Map` returns equal
  what `buildBoardV6` gave for the same tree (the shared function).
- Rendering: four phase sections in order; a "none yet" line for an absent
  kind; a doc row opens its main file; a quick plan has no Dispatch; no
  stage rail and no Next, Back or Track stage on v6.
- Store: a v6 project fills `map`, a v4 project fills `board`.

## Non-goals

- Choosing or switching the active initiative from the panel.
- Viewing other initiatives.
- Editing docs or statuses from the panel.
- Showing code reviews (they live inside plans) or chat-only reviews.
- Any change to the v4 board.
