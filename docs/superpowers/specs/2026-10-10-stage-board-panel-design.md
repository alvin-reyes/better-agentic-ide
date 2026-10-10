# Stage board panel

Addendum to `2026-10-05-stage-board-design.md`. That spec defines the stages,
the gates and the doctrine; the BMAD v6 work built both board engines
(`buildBoard` for v4 in `src/stores/stageBoardStore.ts`, `buildBoardV6` in
`src/lib/boardV6.ts`). Neither is on screen yet. This spec puts them there.

Two parts, built in order:

- **A, the read-only panel.** The board, live, for the active pane's project.
- **B, human actions.** Approve, dispatch, stage advance.

Out of scope here: retiring `OrchestratorTab` and the v4 workflow graph. Both
come after B.

## Approach

The engines run in the webview over a Tauri-backed `Fs`. `buildBoardV6` already
takes an `Fs` (`src/lib/bmadRuntime/fs.ts`), and `buildBoard` takes plain
inputs that the same adapter can gather. One engine per methodology, the one
already tested, and no second copy of the gate or distrust rules in Rust.

Rejected:

- **A Rust `board` command.** Ports both engines to Rust and keeps two
  implementations of the distrust rule in step forever.
- **Polling.** Stale for seconds while an agent writes, and reads the tree
  constantly. The watcher already exists.

## A: the read-only panel

### Placement

A right-hand **Board** panel beside the terminal tabs, toggled like Preview:
a keyboard shortcut and a *View: Toggle stage board* palette command. It
replaces the static `BmadPanel` overlay, which is deleted along with its
toggle.

The panel follows the **active pane's project**: the pane's working directory,
walked up to the project root by the same rule agent launches use. Switching
panes to another project rebuilds the board for that project. A pane with no
project (a home directory, no cwd yet) shows "No project in this pane".

### Data

**`tauriFs`** (`src/lib/tauriFs.ts`) implements `Fs` over Tauri commands:

| `Fs` method | Command |
|---|---|
| `readText` | `read_file` (existing) |
| `writeText` | `write_text_file` (existing) |
| `list` | `list_directory` (existing), names only |
| `mkdir` | `create_directory` (existing) |
| `exists` | `path_exists` (new) |
| `isSymlink` | `path_is_symlink` (new, does not follow the link) |
| `append` | throws "not available in the board panel" |
| `delete` | throws "not available in the board panel" |

The two new commands are one-liners in `src-tauri/src/lib.rs` with Rust unit
tests. `append` and `delete` get no commands: the panel only reads through the
engines and writes whole files, and a generic delete command in the webview is
a capability it has no use for. `buildBoardV6` is tested through an `Fs` whose
`append` and `delete` throw, so an engine change that starts calling them fails
the build instead of the panel.

`list_directory` skips `node_modules`, `.git`, `target` and `dist`; that is
acceptable for every path the engines walk (`_bmad-output/`, `docs/`,
`.ade/gates/`), and the adapter's tests say so.

### Engine additions

`BoardState` today has a flat `stories` list and no place for the v6 ticket
tree's `problems`, and an empty v6 board cannot say *why* it is empty. Three
optional fields, filled only by `buildBoardV6`, plus the v6 approvals below:

- `epics?: { slug: string; title: string }[]`, in the tree's order. Rows
  group under the epic whose `slug` is the ticket's `parent` folder; a ticket
  whose folder is not a listed epic goes under "Other".
- `problems?: string[]`, the tree's `problems` passed through.
- `noInitiative?: true` when the tree read failed with "no active initiative".

`buildBoard` (v4) is unchanged.

**Which engine.** `project_setup_status` reports `methodology`:

- `v6` → `buildBoardV6(root, tauriFs)`
- `v4` → read `.bmad-core/core-config.yaml`, the story and gate files through
  `tauriFs`, then `buildBoard({...})`. The gathering lives in
  `src/lib/boardV4Inputs.ts` so it is testable with an in-memory `Fs`.
- none → a card: "This project isn't set up for BMAD" with **Set up now**,
  which runs the existing setup path.

**The store** (`src/stores/boardPanelStore.ts`, zustand like its neighbours)
holds `{ root, methodology, board | null, error | null, loading }` for the
project on screen. It owns nothing the files do not: the board is always
rebuilt from disk.

### Refresh

- `watch_directory` on the directories the engine reads, not the project root,
  extensions `md, yml, yaml, toml`, debounced 300 ms. The watcher has no skip
  list, so a recursive watch on the root would register all of
  `node_modules`, `target` and `.git` (inotify limits on Linux) and turn an
  `npm install` into a storm of rebuilds from vendored Markdown.
  - v6: `_bmad/`, `_bmad-output/`, `.ade/`
  - v4: `.bmad-core/`, `.ade/`, and the story, PRD, architecture and QA
    locations from `core-config.yaml` (the parent folder for a single file)
  - Only directories that exist are watched; the set is recomputed after each
    rebuild, so a folder an agent creates is picked up on the next one.
  - All are unwatched when the panel closes or the project changes.
- A rebuild on window focus, so a missed event costs a refresh, not
  correctness.
- A rebuild that throws keeps the last good board on screen with the error
  above it. Only a first build that throws shows the error alone.
- Rebuilds do not overlap: one in flight, at most one queued.

### Rendering

Top to bottom:

1. **Stage rail.** BMAD's two phases with the five stages inside, the current
   stage marked. An optional stage that was passed without its own evidence
   shows as skipped, not complete.
2. **Artifacts.** Each expected artifact, present (click opens it in an editor
   tab) or missing.
3. **Work items.** v4: stories. v6: tickets grouped under epic headers. Each
   row shows its title and state:
   - `draft`, `approved`, `in-progress`, `review` (v6 shows its own status word, e.g. `ready-for-dev`, beside the state)
   - **done ✓**: done with a PASS gate behind it
   - **waived**: done on a WAIVED gate, its reason always visible
   - **claimed**: says done, no PASS or WAIVED gate
   - anything else (`blocked`, `dropped`, an unknown word) as the raw word

   Clicking a row expands its gate: verdict, reason, file.
4. **Gate problems.** Unmatched gates (no story or ticket with that id),
   superseded gates, and gates that failed to parse, each with its file and
   error. Last on the panel, never hidden.

### Empty and failure states

- Unparseable story, ticket or gate files render as themselves plus the error.
- The v6 ticket tree's `problems` render as a list under the work items.
- A v6 project with no active initiative renders an empty board saying so.
- Missing artifacts are normal and render as missing, not as errors.

## B: human actions

The panel writes files for these actions only, each on a click. Nothing is
written in the background.

### Approve

- **v4:** rewrites the story's status, the first non-empty line under
  `## Status`, from `Draft` to `Approved`. Every other byte of the file is
  unchanged, line endings included. The rewrite is in `src/lib/storyStatus.ts`
  and is tested on its own.
- **v6:** writes **`.ade/approvals/<ref>`**, one line holding the ISO date.
  The ticket and its plan are not touched.

  v6 has no human approval status. `ready-for-dev` is written by agents
  (`bmad-build-auto` sets it when its own plan is done), which is why
  `ticketView` already maps it to Draft; marking it from the panel would make
  the human gate indistinguishable from an agent finishing a plan. ADE owns
  the approval the way it owns the gate, in `.ade/`. `buildBoardV6` reads
  `.ade/approvals/`: a ticket with an approval file whose state is draft
  renders as **approved** and is dispatchable. Past `ready-for-dev`
  (in-progress, review, done) a ticket is dispatchable as a v4 story past
  Approved is, so a ticket an agent already started is not stranded.

The button appears only on draft rows. A failed write leaves the row as it was
and shows the error on it.

### Dispatch

On approved rows and later only. **Nothing below approved can be
dispatched**, and a test reintroduces the violation to prove it fails.
Dispatch opens a new terminal tab in the project root and launches the
developer role through the agent picker's launch path, moved out of
`AgentPicker.tsx` into `src/lib/agentLaunch.ts` so both use one copy, with the story file or
ticket ref as its opening task. No prompt is typed for the user.

`buildLaunchCommand` cannot carry a task today: `LaunchOptions` has none. It
gains `task?: string`, passed as the provider's initial prompt argument and
shell-quoted like the role path. A provider with no initial-prompt argument
returns `{ kind: "unsupported" }` for a launch with a task, and the Dispatch
button shows that reason instead of launching an agent with nothing to do.

### Stage advance

Today the current stage is derived from evidence alone (the first incomplete
stage), so an agent writing a stub PRD advances the project. B adds the human
half of the gate.

- **`.ade/stage`** holds the stage a person confirmed: one line, a `StageId`.
  It sits in `.ade/` and is committed like the rest of it; git is the history.
- **Shown stage** = the confirmed stage when the file exists, is valid, and
  every stage before it is complete on the evidence.
- **The file is not trusted on its own.** Any agent can write `.ade/stage`,
  as any agent can write `Status: Done`. A confirmed stage whose earlier
  stages lack their evidence renders as **claimed**, with the evidence-derived
  stage beside it, the same distrust rule as a claimed story. The panel
  cannot stop the write; it declines to believe it.
- **Next →** appears when `canAdvance(board, confirmed)` is true: the confirmed
  stage's evidence is on disk. Clicking writes the next stage.
- **Back** is always available from any stage past the first. It writes the
  earlier stage and deletes nothing.
- **No file, or an unreadable or unknown value:** the shown stage is the
  evidence-derived one, exactly as today, so existing projects do not jump
  backwards when this ships. An invalid file also shows a one-line warning.
  Without a valid file there is nothing to advance from, so instead of Next
  the rail offers **Track stage**, which writes the shown stage to
  `.ade/stage`; from then on the project moves only on Next and Back. Setup
  never writes the file: it adds missing files to projects it has already
  set up, and writing the first stage there would send them backwards.
- Execution completes only when every story or ticket is done (gated) or
  dropped. That rule is the engines' and is not restated here.

Stage logic is pure (`src/lib/confirmedStage.ts`: confirmed value + board →
shown stage, whether Next and Back are offered) so it is tested without
Tauri.

## Testing

- `tauriFs`: each method calls its command with the right arguments
  (mocked `invoke`); the two new Rust commands have unit tests; `append` and `delete` throw.
- `boardV4Inputs`: gathers config, stories and gates from an in-memory `Fs`
  fixture and produces the same board `buildBoard` gives for those inputs.
- Store: debounce coalesces a burst of events into one rebuild; a throwing
  rebuild keeps the last good board; a project switch unwatches the old root.
- Rendering: one test per row state, including claimed and waived; gate
  problems render; no-methodology renders the setup card.
- B, each verified by reintroducing the violation:
  - nothing dispatches below approved
  - Next does not appear without the evidence on disk
  - the v4 approve rewrite changes only the status line under `## Status`
  - a v6 ticket at draft with no approval file is not dispatchable
  - a missing or garbled `.ade/stage` falls back to evidence
  - a `.ade/stage` ahead of the evidence renders as claimed
  - Dispatch passes the ref as the task, and a provider without an initial
    prompt disables Dispatch rather than launching empty

## Non-goals

- Editing story or ticket content from the panel.
- A history view of stage advances (git has it).
- Multiple projects on screen at once.
- Retiring `OrchestratorTab`; the v4 workflow graph.
