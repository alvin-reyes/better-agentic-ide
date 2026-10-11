# Choosing and switching the BMAD version

ADE sets up every project with BMAD, v6 by default or v4 per project. Today
only the New Tab dialog asks which version, and only for a folder with no
BMAD. The `cd` hook, the palette and "Set up now" follow what is on disk, or
pick v6 for a project with neither; the palette's "BMAD: Initialize" silently
installs v4 in the pane's cwd. A project that already has BMAD can't change
version: nothing moves the old install aside, and setting up the other
version installs it beside the old one, leaving a mixed tree.

This spec makes the choice explicit and adds a switch that archives the old
version inside the project, then sets up the other version in its place.

## Decisions

- **Ask before every setup of a project with no BMAD,** through one shared
  dialog.
- **A project that already has BMAD is asked once,** from New Tab, to keep
  its version or switch. Keep is remembered; after that, switching is on
  demand.
- **Archive inside the project.** A switch moves the old version's engine and
  v4- or v6-only files into `.ade/archive/bmad-<from>-<date>/`, then sets up
  the other version fresh. Nothing is deleted.
- **Documents stay.** `docs/` (PRD, architecture, stories, QA and the rest)
  belongs to ADE's methodology in both versions: `.ade/rules.md`,
  `CLAUDE.md` and the roles all use it. A switch never moves it unless the
  person ticks a document in the confirm dialog.
- **One Rust command does the switch,** with a dry run for the dialog, a
  journal written before the first move, and a rollback if a step fails.
- **Agents are told the archive is history,** in the rules and by a
  permission rule that stops edits to it.

Rejected:

- **A git-based switch** (`git mv`, then commit). It fails outside git and
  with uncommitted work, and makes a commit in the user's name.
- **Moves driven from the frontend** through a generic move command. Nothing
  could undo a half-done switch, and a general move command is a larger
  capability than the webview needs.
- **A copy of the project at another location.** Two folders to keep in sync.
- **Archiving `docs/` by default.** It would take the verification command
  and the PRD out of a project whose rules still point at them, and many v4
  projects never chose v4: earlier ADE versions installed it into every git
  repo a terminal entered, so their `docs/` is the user's own.

## Work split

Three plans, built in this order:

- **A. Ask on every setup.** The shared dialog, every entry point, the kept
  list and its migration, the v4 marker, and the rules and `CLAUDE.md` text.
  Useful on its own.
- **B. The switch.** `bmadswitch.rs`, the confirm dialog, the on-demand
  entry points, the archive rule's enforcement.
- **C. ade-setup.** A PR in `alvin-reyes/ade-setup`.

## When ADE asks

### The root

Every entry point resolves the project root with `bmadRootOf(cwd)`, the
nearest folder up to the git root holding a marker or `.bmad-core/`, falling
back to `project_root`. The board already does this; the palette and the
Agents tab move to it.

### A project with no BMAD

`MethodologyPrompt` in *choose* mode:

> Set up **shop** with **BMAD v6** (default) or **BMAD v4**?

Enter picks v6. Answering sets the project up and adds it to the kept list.

Every entry point goes through `askMethodology(root)`. It returns the
detected version without a dialog when the project has BMAD; choose mode is
only for a project with neither.

- **New Tab**: its own methodology list becomes the shared dialog. Escape
  opens the folder without setup and dismisses the question for this app
  session.
- **The `cd` hook** (`useProjectSetup`): no modal. A toast, "Set up **shop**
  with BMAD?", with **v6**, **v4** and **Not now**. Not now dismisses for this
  app session. The hook no longer sets up v6 without asking.
- **Palette** "Project: Set up BMAD, methodology and agents", and **Set up
  now** on the board and the Agents tab: the modal. Escape cancels.

"For this app session" is an in-memory set: the next launch asks again.
`autoProjectSetup` off, or a declined project: New Tab and the `cd` hook
neither set up nor ask. The palette and Set up now always work.

The palette's "BMAD: Initialize in current project" is removed, and with it
the unused `scaffold_bmad` command. "Set up BMAD" covers it.

The Agents tab's `isComplete` treats a v6 project as having BMAD (today it
requires `.bmad-core/VERSION`, so every v6 project shows "Incomplete").

### A project that already has BMAD

Asked only from **New Tab**, and only when auto-setup is on and the project
is not declined or kept. Never from the `cd` hook.

> **shop** uses **BMAD v4**. **Keep v4** (default) · **Switch to v6…**

Keep adds the project to `ade-bmad-kept` (localStorage, added to
`PERSISTED_KEYS` with the other setup keys). Escape keeps the version and
dismisses for this app session.

**Migration.** On the first launch after this release, every root in
`ade-project-setup-done` is added to `ade-bmad-kept`, so the update doesn't
ask about every project the user already has. Only projects opened afresh
are asked.

### Switching on demand

- Palette: **BMAD: Switch to v6…** or **BMAD: Switch to v4…**, whichever is
  the other version for the active pane's project.
- Board panel: a **Switch to BMAD v6…** (or v4) link at the bottom.

### Confirming a switch

Switch never acts immediately. `MethodologyPrompt` in *confirm* mode, filled
from the dry run, shows:

- the archive folder, `.ade/archive/bmad-v4-2026-10-11/`
- **Moves to the archive**: every path, with its file count
- **Your documents (stay)**: the v4 document locations, each with an
  "Archive this too" checkbox, off by default (v4 → v6 only)
- **Left in place**: anything outside the project, such as a v6 output folder
  configured elsewhere, with why
- **Leftovers**: files of the target version already in the project, which
  move to `<archive>/leftovers-<to>/` so setup starts clean
- what the new version installs
- **Open in this project**: panes whose cwd is inside the project, and agents
  running there, with "Stop agents before switching: they may keep writing
  into moved folders"
- when git shows uncommitted changes: "Uncommitted changes stay as they are.
  Commit first if you want the move in its own commit."
- paths that git ignores today, and whether `.ade/` itself is ignored: once
  moved, an ignore rule like `/_bmad-output/` no longer matches them
- any reason the switch can't go ahead, with **Archive and switch** disabled

On success, the switch reports through its own event and toast, never
`project-setup-done`, so no **Undo** is offered (Undo would remove the new
version and leave the project without BMAD). The toast links to `ARCHIVE.md`
and says agents already running keep their old role prompt until restarted.
The project is added to the kept list.

## The switch, in Rust

`src-tauri/src/bmadswitch.rs`.

### `bmad_switch_plan(root, to, documents) -> SwitchPlan`

`documents` is the document paths the person ticked (empty at first; the
dialog re-plans when a box changes).

```
SwitchPlan {
  from: "v4" | "v6",
  to: "v4" | "v6",
  archive: String,             // project-relative
  moves: Vec<Move>,            // { from, to, files: u32, ignored: bool }
  documents: Vec<Document>,    // { path, files, ticked }, v4 → v6 only
  leftovers: Vec<Move>,
  left_in_place: Vec<Note>,    // { path, reason }
  dirty: bool,
  archive_ignored: bool,
  blocked: Option<String>,
}
```

- `from` is `bmadv6::detect_on_disk`.
- `dirty` is `git status --porcelain -- .` run in the root; false outside git.
- `ignored` and `archive_ignored` use `git check-ignore`.
- Blocked when: there is no BMAD to switch from; `to == from`; the target
  version's bundled resources don't resolve; a path is unsafe; a source and
  the archive are on different devices; or `.ade/archive/` holds a journal
  marked `in progress` (a previous switch was interrupted).

### What moves

Only paths that exist. Never the git dir (from `git rev-parse --git-dir`,
which also covers a worktree whose `.git` is a file), `.ade/archive/`, or the
root. The ADE files both versions share stay: `.ade/rules.md`,
`.ade/context/`, `.ade/session.md`, `.ade/knowledge/`, `CLAUDE.md`,
`llms.txt`, `.claude/settings.json`, and `docs/` unless ticked.

**v4 → v6**

- `.bmad-core/`, `.claude/commands/BMad/`
- `devDebugLog` from `core-config.yaml` (`.ai/debug-log.md`)
- `.ade/stage`
- Documents, ticked only: the core-config locations (`prd.prdFile`,
  `prd.prdShardedLocation`, `architecture.architectureFile`,
  `architecture.architectureShardedLocation`, `devStoryLocation`,
  `qa.qaLocation`) and the v4 template outputs that exist (`docs/brief.md`,
  `docs/project-brief.md`, `docs/front-end-spec.md`,
  `docs/ui-architecture.md`, `docs/brownfield-architecture.md`,
  `docs/market-research.md`, `docs/competitor-analysis.md`,
  `docs/brainstorming-session-results.md`). A location that is `docs` itself,
  the root, or the parent of another location is not offered.

The Rust core-config reader ports `src/lib/bmadConfig.ts`: the flat,
any-indentation key reader and its rule that a config with no path keys
means the defaults. A shared fixture is tested in both languages.

**v6 → v4**

- `_bmad/`
- the output folder from the merged v6 config (`_bmad/config.toml`, then
  `_bmad/custom/config.toml`, then `_bmad/custom/config.user.toml`, as
  `centralConfig` merges them), with `{project-root}` substituted. An
  absolute path under the root is treated as project-relative; an output
  folder outside the project is **left in place** and noted, not blocking.
- the skills ADE installed: each folder in `.claude/skills/` whose name is a
  folder in the bundled v6 skills, compared case-insensitively. A user's own
  skills stay. (Skills an older ADE bundled under names since dropped are not
  recognised; the dialog shows what stays.)
- `.ade/approvals/`, `.ade/gates/`

**Both directions**

- `.ade/methodology`
- the core role files ADE writes, `.claude/agents/<role>.md` for each id in
  `ROLES`, edited or not. Agents the user added stay.

**Leftovers.** Files of the target version already present (a mixed tree):
for → v6, `_bmad/` and ADE's bundled skills; for → v4, `.bmad-core/` and
`.claude/commands/BMad/`. They move to `<archive>/leftovers-<to>/`.

**Unsafe paths.** A path whose parent resolves outside the project, or that
is the root, the git dir or inside `.ade/archive/`, blocks the plan and is
named. A path that is a symlink is moved as the link, never followed. A path
nested inside another planned move is dropped as redundant.

### Archive

`.ade/archive/bmad-<from>-<YYYY-MM-DD>/`, or `…-2`, `…-3` when taken. Paths
mirror the project. On Windows, paths over 260 characters use the `\\?\`
prefix.

`ARCHIVE.md` is the journal: the date, both versions, every planned move with
its state, and a status of `in progress`, `complete`, `rolled back` or
`incomplete`.

How to go back, as written in it: run **Switch to <old>** (which archives the
newer version), then move this archive's paths back to their places,
replacing the fresh role files and `.ade/methodology`. After `git add -A`, git
shows the moves as renames.

### `bmad_switch_apply(root, to, plan, files, import) -> SwitchResult`

`plan` is the plan the dialog showed. `files` and `import` are the new
version's setup files, as `project_setup_apply` takes them (`withoutRemoved`
applied). The switch runs a full setup and resolves resources through the
`AppHandle`.

It holds setup's `APPLY` mutex for its whole run, so no other setup can race
it. The frontend registers it in `projectSetup.ts`'s in-flight map, so
`isSettingUp(root)` is true. The board shows "Switching…" instead of "Set up
now", and its watchers and refresh are paused, then refreshed once at the
end.

1. **Recompute.** Use the plan's `archive` as given. Recompute the sources;
   stop if they differ, as a set, from the plan's, or if the archive folder
   now exists. Nothing moves that the person didn't see.
2. **Journal.** Create the archive folder and write `ARCHIVE.md`, status
   `in progress`, every move pending.
3. **Move.** Rename each source to its archive path, creating parent folders
   and recording each in the journal. A Windows sharing violation (an open
   file, a cwd) fails the step and names the path.
4. **Snapshot.** Record whether `.claude/settings.json` exists, and its bytes.
5. **Set up** the new version. `projectsetup::apply` and both installs now
   return their partial report on error. The v4 install's copy errors become
   fatal, where today they are ignored. Every directory setup creates is
   recorded.
6. **Rules.** If `.ade/rules.md` lacks the archive marker, append the
   archive section. Recorded for rollback. This runs after setup, so a project
   with no `rules.md` gets the full rules first.
7. **Done.** Journal status `complete`.

**Rollback**, on a failure at any step:

- remove what setup created, a file only if unchanged, as
  `project_setup_undo` checks
- restore `.claude/settings.json` from the snapshot
- strip the appended rules section
- reverse the recorded moves in reverse order
- remove the folders the switch and setup created, if empty

When every reverse move succeeds, set the journal to `rolled back` and remove
the archive folder. If a reverse move fails (an agent recreated the
destination, a file is locked), keep `ARCHIVE.md`, set to `incomplete` with
the moves still pending, and return that in the error. Rollback restores
every file to its path and content and leaves nothing the switch created; it
can't restore directory times or git's index.

**Interrupted switch.** A journal left `in progress` (a crash, a kill) blocks
further switches and shows a warning on the board for that project, linking
to `ARCHIVE.md`.

### v4 writes the marker

`bmad::install` (v4) writes `.ade/methodology` = `v4`, as v6 does, and
records it in `created`. Today it writes none, so a v4 project reads as v4
only while `.bmad-core/` exists. (`docs/guide/project-setup.md` already says
v4 writes it; that becomes true.)

## Agents and the archive

The rule, wherever agents read rules:

> `.ade/archive/` holds earlier BMAD versions of this project. It is
> read-only history: never treat it as current documents, never write to it,
> and read it only when a person asks about the earlier work.

- **`RULES_MD`** gains the rule under a marker, so new projects get it.
  Existing projects get it when they switch (step 6). The marker stops a
  project from getting it twice.
- **`CLAUDE_MD`** (plan A) replaces its v4-only BMAD paragraph with one that
  covers both versions and points at `.ade/methodology`: v4 is the
  `/BMad:tasks:` commands in `.bmad-core/`; v6 is the skills in
  `.claude/skills/`, with work in `_bmad-output/`. New projects get it. An
  existing project's `CLAUDE.md` is never rewritten. That is a known gap
  for v6 projects set up before this release.
- **`.claude/settings.json`**: setup and the switch add `permissions.deny`
  entries `Edit(.ade/archive/**)` and `Write(.ade/archive/**)`, beside the
  attribution settings setup already writes. Reading stays allowed: a person
  may ask about the earlier work.
- **The board and the watchers** ignore `.ade/archive/`. The v6 map and the
  v4 board never read it, and the `.ade/` watch filters archive events in the
  Rust watcher, so archive folders don't cost watches or rebuilds.

## ade-setup (plan C)

ADE vendors only ade-setup's `agents/` and `templates/`
(`scripts/syncAgents.mjs`). The rules and `CLAUDE.md` projects receive are
ADE's own `RULES_MD` and `CLAUDE_MD`, changed in plans A and B. ade-setup is
the shared, provider-neutral source others read, so it gets the same
content, as a separate PR with no AI attribution:

- **`rules.md`**: the archive rule.
- **`claude/CLAUDE.md`**: the BMAD paragraph for both versions, replacing the
  v4-only one (lines 23–27).
- **README**: both versions, the once-per-project choice, switching, and the
  archive layout with `ARCHIVE.md`. It replaces the v4-only `bmad/` text.

Its CI tags the release, and the version follows from what changed. ADE
re-vendors with `npm run sync:agents` only if `agents/` changed.

## Docs

`docs/guide/project-setup.md`, new section "Choosing and switching the BMAD
version":

- when ADE asks
- what moves in each direction, and that documents stay unless ticked
- the archive and its journal
- how to go back

## Testing

Rust, on temporary folders, with a seam to fail setup's resource resolver and
a chosen rename:

- the plan for v4 → v6 and v6 → v4, including ticked documents, a custom and
  an absolute `output_folder`, an output folder outside the project (left in
  place), and the merged v6 config
- blocked plans: a location outside the project, at the root or in the git
  dir; a `docs` location not offered; a nested location dropped; a
  cross-device source; an `in progress` journal
- a symlinked folder moves as the link
- leftovers in a mixed tree
- a taken archive name gets `-2`. Apply uses the plan's archive, so a plan
  made before midnight still applies.
- a user's own skill and agent don't move; an edited role file does
- apply refuses when the sources differ from the plan
- rollback after a failed move and after a failed setup: every file back with
  its content, no created file or folder left, `settings.json` restored. A
  failed reverse move leaves an `incomplete` journal.
- a project with no `rules.md`: after a switch it has the full rules plus the
  archive section, once
- v4 setup writes the `v4` marker; the v4 install's copy errors fail setup
- the Rust and TS core-config readers agree on the shared fixture

Frontend:

- the dialog in each mode, including ticking a document re-plans, a
  disabled confirm on a blocked plan, the uncommitted, ignored and
  open-panes notes
- each entry point calls `askMethodology`; a project with BMAD never sees
  choose mode
- the `cd` hook shows a toast, not a modal; Not now and Escape dismiss for
  the session only
- New Tab then the `cd` hook: asked once
- the kept list: answering choose, keeping and switching each add the
  project; the migration seeds it from `ade-project-setup-done`
- auto-setup off or declined: New Tab and the hook do nothing; the palette
  still asks
- the switch never emits `project-setup-done`; the board shows "Switching…"
  during one and a warning for an interrupted one
- `.ade/archive/` changes don't trigger a board rebuild

## Non-goals

- Converting v4 documents into v6 tickets, or the reverse.
- Restoring an archive from the UI.
- Rewriting an existing project's `CLAUDE.md`.
- Switching several projects at once.
