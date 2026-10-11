# v6 board map

Addendum to `2026-10-10-stage-board-panel-design.md`. That spec put both
board engines in a right-hand panel. For a v6 project the panel still shows
ADE's five stages (Brainstorming, Design, Audit, Execution, Review), with the
initiative doc standing in for both the brief and the PRD. That is v4's
shape, not v6's. This spec replaces the v6 view with one that follows v6's
own workflow, and makes the five-stage board v4-only.

## What v6 is

The vendored skills (`src-tauri/resources/bmad-v6/skills/`, bmod-method
6.13) define four phases (Analysis, Planning, Implementation, Validation)
and say plainly that they are "not a mandatory sequence"
(`bmod-method/help/help.md`). No skill is required. A small change skips
planning entirely: `bmad-build`'s `oneshot` route (the old quick flow,
whose skills are retired) writes one plan and builds.

Every skill writes into the active initiative's folder,
`{output_folder}/{active_initiative}`, one folder per run named by the
skill's prefix, beside the ticket tree. `{output_folder}` is
`core.output_folder` from the merged config with `{project-root}`
substituted (usually `_bmad-output/`, but a project can move it). With no
active initiative, skills write loose into `{output_folder}`. There is no
sprint or workflow status file: progress lives on ticket plans, and a doc's
own frontmatter says whether it is a draft.

## Decisions

- **No project-wide stage for v6.** The board is a map of the four phases.
  There is no current stage, no Next or Back, and no Track stage. v6 has no
  order to gate on.
- **The human gates stay on work items:** Approve, Dispatch, the QA gate,
  and the claimed rule, exactly as today, on the initiative's tickets.
- **Scope:** the active initiative, plus work outside it: loose docs and
  plans in `{output_folder}`, and the `backlog/` ticket tree. Choosing the
  initiative stays v6's job (`bmad` sets it); the board follows the config.
- **A separate v6 model and view.** The five-stage board becomes v4-only:
  `buildBoardV6` and `loadBoard`'s v6 branch are deleted, and `BoardState`
  loses its v6-only fields (`epics`, `problems`, `noInitiative`). The parent
  spec's stage rail, Track stage and `.ade/stage` sections now apply to v4
  only.

## The map

The panel header already reads "Board · BMAD v6". Under it, top to bottom:

**Initiative line.** The active initiative's title: frontmatter `title` of
`<initiative>/<initiative>.md`, else the folder name. With no active
initiative: "No active initiative. Set one with the bmad skill." With an
initiative set whose folder is missing: "Initiative <name> not found", plus
a problem. In both cases only the phases' loose part and the backlog have
content.

**Analysis**

- Idea work: `brainstorm-*`, `forge-*`, `research-*`
- Briefs (`brief-*`) and PRFAQs (`prfaq-*`)

**Planning**

- PRDs (`prd-*`), UX (`ux-*`), architecture (`architecture-*`), specs
  (`spec-*`, including specs inside epic folders)
- Ticket tree size: "N epics, M tickets"

**Implementation**

- Tickets grouped by epic: today's rows, with Approve, Dispatch and claimed
- Plans (`plan-*.md` not joined to a ticket), labelled "Quick plan" when
  `route: oneshot`, else "Plan", with the plan's status. Read-only.
- Course changes (`change-*`)
- Deferred work (`deferred-work.md`), when present

**Validation**

- One summary line for the tickets' QA gates: "QA gates: P passed, W waived,
  C claimed" (counts of ticket rows in those states; omitted when all are 0).
  The verdicts themselves stay on the ticket rows, not repeated here.
- Retrospectives, one per epic that has one, with their verdict
- Walkthroughs (`walkthrough-*`) and test summaries (`test-summary-*`)

**Not in an initiative.** The same doc kinds and plans found loose in
`{output_folder}`. Omitted when there are none.

**Backlog.** The `{output_folder}/backlog/` ticket tree's rows (stories and
bugs), read-only: state and title, click opens the leaf. No Approve or
Dispatch, and no gate matching (a backlog ticket's ref is its file name,
which `.ade/gates/` cannot key). A done backlog ticket therefore renders as
claimed. Omitted when there is no backlog.

**Needs attention.** Gate problems (unmatched, superseded, unparseable),
ticket-tree problems, a tree that failed to read, and docs whose frontmatter
could not be read. Last, never hidden, as today.

### Rows

- One row per doc, ordered by folder name within a kind.
- A row shows the label, the folder's slug (the name after the prefix), and
  the status word. Clicking opens the doc's main file. A row with no main
  file found shows the folder name and is not clickable.
- A kind with no doc shows one muted line, e.g. "PRD · none yet". These are
  not warnings: v6 requires none of them. The loose group and the backlog
  show no "none yet" lines.
- Status words are shown as the doc states them. Agents write them, so they
  are labels, not gates; the board certifies nothing about a doc.

## Kinds

One table in code, `V6_KINDS`, drives classification, labels, main file and
status. A folder or file whose name matches no kind is ignored, so a skill
added later never breaks the map.

| Prefix | Phase | Label | Main file (first that exists) | Status from | No status means |
|---|---|---|---|---|---|
| `brainstorm-` | Analysis | Brainstorm | `<f>/brainstorm.html`, `<f>/<f>.md` | run log `status` | in progress |
| `forge-` | Analysis | Forge | `<f>/forge-report.html`, `<f>/<f>.md` | run log `status` | in progress |
| `research-` | Analysis | Research | `<f>/<f>.md`, `<f>/research-briefing.html` | `<f>/<f>.md` `status` | present |
| `brief-` | Analysis | Brief | `<f>/<f>.md` | `<f>/<f>.md` `status` | present |
| `prfaq-` | Analysis | PRFAQ | `<f>/<f>.md` | `<f>/<f>.md` `status`, else `stage` | present |
| `prd-` | Planning | PRD | `<f>/<f>.md` | `<f>/<f>.md` `status` | present |
| `ux-` | Planning | UX | `<f>/<f>.md`, `<f>/EXPERIENCE.md`, `<f>/DESIGN.md` | `<f>/DESIGN.md` `status` | present |
| `architecture-` | Planning | Architecture | `<f>/<f>.md` | `<f>/<f>.md` `status` | present |
| `spec-` | Planning | Spec | `<f>/<f>.md` | none | present |
| `change-` | Implementation | Course change | `<f>/<f>.md` | `<f>/<f>.md` `status` | present |
| `walkthrough-` | Validation | Walkthrough | `<f>/<f>.md` | none | present |
| `test-summary-` | Validation | Test summary | `<f>/<f>.md` | none | present |

`<f>` is the folder's own name. The run log is `<f>/.memlog.md`, read for
its frontmatter `status` key (`memlog set` writes it there; brainstorm and
forge set it only when a run finishes).

Files, not folders:

- `plan-*.md` at the initiative root (or loose in `{output_folder}`):
  Implementation. Skipped when its frontmatter `ticket` is non-empty (the
  plan belongs to that ticket). Status from `status`; "Quick plan" when
  `route: oneshot`.
- `deferred-work.md`: Implementation, "Deferred work", status "present".
- Retrospectives: `<initiative>/<epic slug>/<epic slug>-retrospective.md`
  for each epic the ticket tree lists (by its slug, not a glob). Status from
  `verdict` (`accepted`, `accepted-with-open-items`, `rejected`); no verdict
  yet means "in progress".
- Specs inside epic folders: `<initiative>/<epic slug>/spec-*/`, for each
  epic the tree lists, classified as `spec-` above.

### Reading frontmatter

The repo has no YAML library, and v6 frontmatter holds nested maps (UX
design tokens) and free text with colons (run logs). The board needs only
top-level scalars, so `readFrontmatter(text)` (in `src/lib/frontmatter.ts`)
is lenient:

- No opening `---` on the first line: an empty map (not a failure).
- An opening `---` with no closing `---`: a failure (null).
- Inside the fence, only lines that start in column 0 as `key: value` are
  read, split at the first colon; the value is trimmed and one pair of
  surrounding quotes removed. Indented lines, list items and comments are
  skipped.

A failure makes the row read "unreadable status" and adds
"`<path>`: frontmatter is not closed" under Needs attention. An unreadable
file (permission, a directory) is the same, with the read error. A missing
file or key is not a failure: the row uses its "No status means" word.

## Engine

`buildV6Map(root, fs): Promise<V6Map>` in `src/lib/v6Map.ts`, in the webview
over `tauriFs` like the other engines.

- **Config.** Read through the existing merged config (`loadCentralConfig`).
  A config that fails to parse fails the build; the store keeps the last
  good map with the error above it, as today.
- **Output folder.** `outputFolder(projectRoot, fs)`, exported from the
  tickets port (today's private `ticketsRoot`). A missing output folder is
  an empty map, not an error.
- **Initiative.** The active initiative's name from the config. Unset: the
  "no active initiative" state. Set but its folder missing: the "not found"
  state, with a problem. Both are maps, not errors.
- **Tickets.** `v6Tickets(projectRoot, fs)` (in `src/lib/v6Tickets.ts`),
  factored from `buildBoardV6`: the ticket tree, `ticketView` with `.ade/gates`
  verdicts, `.ade/approvals`, and the unmatched and superseded gate split.
  A tree that fails to read (a malformed `tickets.toml`) becomes a problem
  and no ticket rows; the docs still render.
- **Backlog.** `backlogTickets(projectRoot, fs)`: the port's backlog view
  (`{output_folder}/backlog/`, the view `ticketStatus` drops), reshaped into
  the same `Ticket` rows, then `ticketView` with no gates. Missing backlog:
  none. A backlog that fails to read: a problem.
- **Docs.** List the initiative folder's top level once; classify each entry
  by `V6_KINDS`; for each, probe its main-file candidates and read its status
  file. Epic folders are listed once more for specs; nothing else is
  descended into (not `.working/`, not `imports/`, not companions). A
  symlinked folder is treated like a folder at the same depth: never
  followed further.
- **Loose work.** The same classification over the top of `{output_folder}`,
  skipping `backlog`, `inbox`, every `initiative-*` folder, and the active
  initiative's folder whatever its name.

```ts
interface V6Doc {
  kind: string;        // "prd", "plan", "retrospective", ...
  label: string;       // "PRD", "Quick plan", ...
  name: string;        // the folder's (or file's) name after the prefix
  path: string | null; // the main file, project-relative; null when none exists
  status: string;      // as the doc states it, or "present" / "in progress" / "unreadable status"
}
type V6Phase = "analysis" | "planning" | "implementation" | "validation";
interface V6Map {
  outputFolder: string;  // project-relative, for the watcher
  initiative: { title: string; folder: string } | null;
  initiativeState: "active" | "none" | "missing";
  docs: Record<V6Phase, V6Doc[]>;          // includes plans, deferred work, retrospectives
  loose: V6Doc[];
  epics: { slug: string; title: string; refs: string[] }[];
  tickets: StoryView[];
  backlog: StoryView[];
  unmatchedGates: Gate[];
  supersededGates: Gate[];
  problems: string[];
}
```

## Panel

- The store's build returns `{ kind: "v4"; board } | { kind: "v6"; map }`.
  It holds `board` for v4 and `map` for v6 and clears the other whenever it
  sets one, so a project whose methodology changes never shows the old
  shape. `show()`'s "already showing" check looks at either field. Today's
  rules stay: one build in flight and at most one queued, a 300 ms debounce,
  the last good result kept on error, and a result for a root no longer
  shown discarded.
- `BoardPanel` renders `V6MapView` for v6 and `BoardView` (v4 only) for v4.
  The folder re-check keys on whichever result is held.
- `V6MapView` reuses `Row` for ticket rows (with no actions on backlog rows)
  and the "Needs attention" list, which takes the gate and problem fields
  rather than a whole `BoardState`.

## Refresh

- v6 watches `_bmad/`, the resolved output folder, and all of `.ade/`
  (`watchTargets` takes the map's `outputFolder` instead of assuming
  `_bmad-output`).
- `watchExtensions(dir, methodology)`: v6 adds `html` (brainstorm and forge
  reports) to the document extensions; `.ade/` stays watched whole.
- A brainstorm session appends to its run log after every idea; the 300 ms
  debounce coalesces those into one rebuild per burst. No further throttle.
- The focus rebuild and the 5 s re-check for a missing folder are unchanged.

## Actions

- Approve and Dispatch on the initiative's ticket rows, unchanged.
- Plans, docs and backlog rows are read-only: open only.
- No stage controls for v6. A v6 project that already has `.ade/stage`
  (from Track stage before this ships) keeps the file; the v6 board ignores
  it.

## Testing

- `readFrontmatter`: no fence (empty), unclosed fence (null), nested and
  indented lines skipped, a value with colons kept whole, quotes stripped.
- `V6_KINDS`: each prefix lands in its phase; an unknown folder is ignored.
- Main file: candidates in order, else no path; brainstorm prefers the HTML.
- Status: frontmatter `status`; UX from `DESIGN.md`; research from `<f>.md`;
  prfaq's `stage` fallback; run log status; "in progress" for a run log or
  retrospective with none; "present"; "unreadable status" plus a problem for
  an unclosed fence.
- Plans: `route: oneshot` is "Quick plan"; a plan with a `ticket` is skipped.
- Retrospectives by the tree's epic slugs; a spec inside an epic folder.
- Initiative states: active (title from the doc, else folder), none (loose
  only), missing (problem). A missing output folder is an empty map.
- A malformed `tickets.toml`: docs render, tickets empty, a problem.
- Loose scan skips `backlog`, `inbox`, `initiative-*` and the active folder.
- Backlog rows: read-only, no gate matching; a done backlog ticket is claimed.
- `v6Tickets`: the cases `boardV6.test.ts` covers today (claimed without a
  gate, a letter-suffixed ref, superseded and unmatched gates, approvals)
  move to its tests, asserted against fixtures.
- Store: v6 fills `map` and clears `board`, v4 the reverse; a methodology
  flip clears the old field.
- Watch: `watchExtensions(dir, "v6")` includes `html`; v4 does not;
  `watchTargets` uses the given output folder.
- Rendering: four phase sections in order; a "none yet" line for an absent
  kind; a doc row opens its main file; plans and backlog rows have no
  buttons; the QA summary counts; no stage rail and no Next, Back or Track
  stage on v6.

## Non-goals

- Choosing or switching the active initiative from the panel.
- Viewing other initiatives.
- Editing docs or statuses from the panel.
- Approving, dispatching or gating backlog tickets.
- Showing code reviews (they live inside plans) or chat-only reviews.
- Any change to the v4 board beyond removing its v6 branch.
