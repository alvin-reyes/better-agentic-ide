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
- **A project that already has BMAD is asked from New Tab until answered,**
  to keep its version or switch. After that, switching is on demand.
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
  permission rule that stops file edits to it.

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

Three plans, built in this order. Each ships on its own.

- **A. Ask before setup.** The shared dialog in choose mode, every entry
  point, the toast's buttons, removing "BMAD: Initialize",
  the Agents tab's `isComplete`, the v4 marker, setup's error reporting, and
  the `CLAUDE_MD` paragraph for both versions. Nothing in A mentions the
  archive.
- **B. The switch.** The keep-or-switch question, the kept list and its
  migration, `bmadswitch.rs`, the confirm dialog, the on-demand entry points,
  the archive rule in `RULES_MD`, the permission rule, and the watcher's
  exclusion.
- **C. ade-setup.** A PR in `alvin-reyes/ade-setup`.

## When ADE asks

### The root

- **New Tab**: the picked folder, unless a folder above it already has BMAD
  (`bmadRootOf`), in which case that one. A folder picked to be a project is
  the project.
- **The `cd` hook, the palette, Set up now**: `bmadRootOf(cwd)`, the nearest
  folder up to the git root holding a marker or `.bmad-core/`, falling back
  to `project_root`.

Every per-project list (set up, declined, kept) keys on one normalised
root, `normRoot`: no trailing separator. Existing
keys are normalised when read.

### A project with no BMAD (plan A)

`MethodologyPrompt` in *choose* mode:

> Set up **shop** with **BMAD v6** (default) or **BMAD v4**?

Enter picks v6.

**The question must be answered.** The person picks v6 or v4; the question
offers no way to skip. The dialog has no Cancel or close button, Escape and
a click outside it do nothing, and Escape does not reach a panel beneath it.

Every entry point goes through `askMethodology(root)`. It returns the
detected version without a dialog when the project has BMAD; choose mode is
only for a project with neither.

- **New Tab**: its own methodology list becomes the shared dialog. A folder
  with no BMAD is not opened until a version is picked.
- **The `cd` hook** (`useProjectSetup`): no modal, so typing in the terminal
  is never blocked. A toast, "Set up **shop** with BMAD?", with **v6** and
  **v4**. It stays until answered: it has no timeout and a click on its body
  doesn't dismiss it. If another toast takes its place, the hook shows it
  again the next time it runs for that project. The hook no longer sets up
  v6 without asking.
- **Palette** "Project: Set up BMAD, methodology and agents", and **Set up
  now** on the board and the Agents tab: the modal.

The ways not to have BMAD in a project are outside the question:
`autoProjectSetup` off, or a declined project (**Undo** after a setup
declines it). For those, New Tab and the `cd` hook neither set up nor ask.
The palette and Set up now always work.

**The toast.** `GuardToast` gains `actions: { label, run }[]`; `action`
stays as shorthand for one. A toast with actions is not dismissed by a click
on its body. `GuardToast` also gains `sticky?: boolean`: a sticky toast has
no timeout.

The palette's "BMAD: Initialize in current project" is removed, and with it
the `scaffold_bmad` command, which then has no caller. "Set up BMAD" covers
it.

The Agents tab's `isComplete` treats a v6 project as having BMAD (today it
requires `.bmad-core/VERSION`, so every v6 project shows "Incomplete").

### A project that already has BMAD (plan B)

Asked only from **New Tab**, and only when auto-setup is on and the project
is not declined or kept. Never from the `cd` hook.

> **shop** uses **BMAD v4**. **Keep v4** (default) · **Switch to v6…**

The **kept list** (`ade-bmad-kept`, localStorage, in `PERSISTED_KEYS`) means
"don't ask this project the keep-or-switch question". Keep adds the project.
So does answering choose mode, and finishing a switch. This question must
be answered too: Enter keeps the version, and Escape does nothing.

**Migration.** When `ade-bmad-kept` is absent (not merely empty), after
hydration, every root in `ade-project-setup-done` is added to it. The update
therefore doesn't ask about projects the user already has; only projects
opened afresh are asked. Those existing projects can still switch on demand.

### Switching on demand (plan B)

- Palette: **BMAD: Switch to v6…** or **BMAD: Switch to v4…**, whichever is
  the other version for the active pane's project.
- Board panel: a **Switch to BMAD v6…** (or v4) link at the bottom.

### Confirming a switch (plan B)

Switch never acts immediately. `MethodologyPrompt` in *confirm* mode, filled
from the dry run, shows:

- the archive folder, `.ade/archive/bmad-v4-2026-10-11/`
- **Moves to the archive**: every path, with its file count
- **Your documents (stay)**: the v4 document locations, each with an
  "Archive this too" checkbox, off by default (v4 → v6 only). Ticking
  `docs/prd.md` or `docs/architecture.md` shows: "ADE's rules use this file
  (the PRD / the verification command). The new version starts without it."
- **Left in place**: anything configured outside the project, with why
- **Leftovers**: files of the target version already in the project, which
  move to `<archive>/leftovers-<to>/` so setup starts clean
- what the new version installs
- **Open in this project**: every terminal pane whose cwd (`getPtyCwd`) is
  inside the root, and fleet agents whose cwd is inside it, with "Stop agents
  before switching: they may keep writing into moved folders"
- git notes: uncommitted changes ("They stay as they are. Commit first if
  you want the move in its own commit."); paths git ignores today, since an
  ignore rule like `/_bmad-output/` no longer matches once they move; whether
  `.ade/` itself is ignored. When git is missing or fails: "Couldn't check
  git."
- any reason the switch can't go ahead, with **Archive and switch** disabled

On success, the switch reports through its own event and toast, never
`project-setup-done`, so no **Undo** is offered (Undo would remove the new
version and leave the project without BMAD). The toast links to `ARCHIVE.md`
and says agents already running keep their old role prompt until restarted.

## Setup's error reporting (plan A)

The switch needs to undo a setup that failed partway, and a normal setup that
fails today leaves files nobody can undo.

- `projectsetup::apply` takes `report: &mut SetupReport` and returns
  `Result<(), String>`, so the report survives an error.
- A `mkdirs(path, &mut created_dirs)` helper records each directory level it
  creates. `apply` and both installs' `copy_tree` use it, so empty folders
  such as `_bmad-output/` and `_bmad/custom/` are known.
- `bmad::install` (v4) and its `copy_tree` return `Result`. Today they
  swallow every copy error, so a v4 setup can half-succeed silently.
- `project_setup_apply` keeps its signature. On error it removes what it
  created (the unchanged-only rule `project_setup_undo` uses), strips an
  import it appended, removes the folders it created if empty, then returns
  the error. A failed setup leaves nothing behind.
- `APPLY`, the mutex inside `project_setup_apply`, becomes a `pub(crate)
  static` so the switch can hold it.

### v4 writes the marker

`bmad::install` (v4) writes `.ade/methodology` = `v4`, as v6 does, and
records it in `created`. Today it writes none, so a v4 project reads as v4
only while `.bmad-core/` exists. (`docs/guide/project-setup.md` already says
v4 writes it; that becomes true.)

## The switch, in Rust (plan B)

`src-tauri/src/bmadswitch.rs`.

### `bmad_switch_plan(root, to, documents) -> SwitchPlan`

`documents` is the document paths the person ticked (empty at first; the
dialog re-plans when a box changes).

```
SwitchPlan {
  from: "v4" | "v6",
  to: "v4" | "v6",
  archive: String,             // project-relative
  moves: Vec<Move>,            // { from, to, files: u32, ignored: "none" | "some" | "all" }
  documents: Vec<Document>,    // { path, files, ticked, warning: Option<String> }, v4 → v6 only
  leftovers: Vec<Move>,
  left_in_place: Vec<Note>,    // { path, reason }
  dirty: Option<bool>,         // None: git missing or failed
  archive_ignored: Option<bool>,
  blocked: Option<String>,
}
```

`from` is `bmadv6::detect_on_disk`.

**Git.** One helper, `antislop::git` moved to a shared module, run with
`--no-optional-locks` so it never takes `index.lock` from a running agent.
`dirty` is `git status --porcelain -- .` in the root. Ignored paths come from
`git check-ignore -q`, with a trailing `/` on directories so directory-only
rules match. The git dir is `git rev-parse --absolute-git-dir`, falling back
to `<root>/.git`; this also covers a worktree, whose `.git` is a file.

**Blocked** when:

- there is no BMAD to switch from, or `to == from`
- either version's bundled resources don't resolve (the target's to install;
  the current one's to know which skills are ADE's)
- a v6 config layer can't be parsed (named, with the error)
- a path the plan would move is the root, the git dir, inside
  `.ade/archive/`, or has a parent that leaves the project through a symlink
- on Unix, a source is on another device than the archive (`st_dev`)
- a pending switch exists (below)

### What moves

Only paths that exist. The ADE files both versions share stay:
`.ade/rules.md`, `.ade/context/`, `.ade/session.md`, `.ade/knowledge/`,
`CLAUDE.md`, `llms.txt`, `.claude/settings.json`, and `docs/` unless ticked.

Any configured location that resolves **outside the project** (an output
folder, `devDebugLog`, a document location) is never moved and never blocks.
It is listed under left in place with the reason. A document outside the
project is not offered.

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
means the defaults. A shared YAML fixture is tested in both languages.
`devDebugLog` is read in Rust only; the TS reader is unchanged.

**v6 → v4**

- `_bmad/`
- the output folder from the merged v6 config. Rust gains the `toml` crate
  and ports `loadCentralConfig` (`src/lib/bmadRuntime/config.ts`):
  `_bmad/config.toml`, then `_bmad/custom/config.toml`, then
  `_bmad/custom/config.user.toml`, tables deep-merged, later layers winning,
  `{project-root}` substituted. A shared TOML fixture is tested in both
  languages. An absolute path under the root is treated as project-relative.
- the skills ADE installed: each folder in `.claude/skills/` whose name is a
  folder in the bundled v6 skills, compared case-insensitively. A user's own
  skills stay. (Skills an older ADE bundled under names since dropped are not
  recognised; the dialog shows what stays.)
- `.ade/approvals/`, `.ade/gates/`

**Both directions**

- `.ade/methodology`
- the core role files ADE writes, `.claude/agents/<name>.md` for each
  `name` in `ROLES`, edited or not. Agents the user added stay.

**Leftovers.** Files of the target version already present (a mixed tree):
for → v6, `_bmad/` and ADE's bundled skills; for → v4, `.bmad-core/` and
`.claude/commands/BMad/`. They move to `<archive>/leftovers-<to>/`.

A path that is a symlink is moved as the link, never followed. A path nested
inside another planned move is dropped as redundant.

### Archive and journal

`.ade/archive/bmad-<from>-<YYYY-MM-DD>/`, or `…-2`, `…-3` when taken. Paths
mirror the project. On Windows, paths over 260 characters use the `\\?\`
prefix.

`ARCHIVE.md` is the journal. Its front matter is the machine-readable part:

```
---
status: in-progress | complete | incomplete | abandoned
phase: moving | setup | rules | done
from: v4
to: v6
date: 2026-10-11
---
```

Its body lists every planned move with its state (pending, moved, moved
back), and two sets of instructions:

- **To go back** to the old version: run **Switch to <old>** (which archives
  the newer version), then move this archive's paths back to their places,
  replacing the fresh role files and `.ade/methodology`. After `git add -A`,
  git usually shows tracked files as renames.
- **To finish an interrupted switch by hand**: move the paths marked *moved*
  back to their places, then set `status: abandoned`.

A rollback that fully succeeds removes the archive folder, journal included.

**Pending switches.** `bmad_switch_pending(root)` reads the front matter of
`.ade/archive/*/ARCHIVE.md` and returns those with `status: in-progress` or
`incomplete`. A pending switch:

- blocks another switch
- blocks setup: `askMethodology` returns `blocked`, since after a crash the
  project may have neither version on disk and setup would write into a
  half-moved tree
- shows a warning on the board for that project, linking to `ARCHIVE.md`

This is the one place the board reads the archive, through that command.

### `bmad_switch_apply(root, to, plan, files, import) -> SwitchResult`

```
SwitchResult { archive: String, moved: u32, setup: SetupReport, rules_appended: bool, archive_denied: bool }
```

`plan` is the plan the dialog showed. `files` and `import` are the new
version's setup files, as `project_setup_apply` takes them (`withoutRemoved`
applied). The switch runs a full setup and resolves resources through the
`AppHandle`.

**Exclusion.** The command holds `APPLY` for its whole run. In the frontend,
a switch registers in a `switching` set, separate from setup's in-flight
map: `isSettingUp(root)` checks both, and `setUpProject` rejects with "a BMAD
switch is running" rather than sharing the switch's promise. The board shows
"Switching…" instead of "Set up now"; its watchers and refresh are paused,
then refreshed once at the end.

1. **Recompute.** Use the plan's `archive` as given. Recompute the sources;
   stop if they differ, as a set, from the plan's, or if the archive folder
   now exists. Nothing moves that the person didn't see.
2. **Journal.** Create the archive folder and write `ARCHIVE.md`:
   `status: in-progress`, `phase: moving`, every move pending.
3. **Move.** Rename each source to its archive path, creating parent folders
   and recording each in the journal. A rename that fails (on Windows, a
   file in use, a folder that is some process's cwd, or another volume)
   fails the step and names the path.
4. **Snapshot.** Record whether `.claude/settings.json` exists, and its bytes.
5. **Set up** the new version (`phase: setup`), collecting the report even on
   error.
6. **Rules.** If `.ade/rules.md` lacks the archive marker, append the
   archive section (`phase: rules`). This runs after setup, so a project with
   no `rules.md` gets the full rules first.
7. **Done.** `status: complete`, `phase: done`.

**Rollback**, on a failure at any step:

- remove what setup created, a file only if unchanged
- strip the import block setup appended to `CLAUDE.md`
  (`report.appended_import`)
- restore `.claude/settings.json` from the snapshot
- strip the appended rules section
- reverse the recorded moves in reverse order
- remove the folders the switch and setup created, if empty

When every reverse move succeeds, remove the archive folder. If a reverse
move fails (an agent recreated the destination, a file is locked), keep
`ARCHIVE.md` with `status: incomplete` and each move's state, and return that
in the error. Rollback restores every file to its path and content and
leaves nothing the switch created; it can't restore directory times or git's
index.

## Agents and the archive (plan B)

The rule, wherever agents read rules:

> `.ade/archive/` holds earlier BMAD versions of this project. It is
> read-only history: never treat it as current documents, never write to it,
> and read it only when a person asks about the earlier work.

- **`RULES_MD`** gains the rule under a marker, so new projects get it.
  Existing projects get it when they switch (step 6). The marker stops a
  project from getting it twice.
- **The permission rule.** A new `usage::deny_archive_edits(root)`, modelled
  on `hide_attribution`, adds one `permissions.deny` entry to
  `.claude/settings.json`: `Edit(/.ade/archive/**)`. In Claude Code, `Edit`
  covers every file-editing tool, and the leading `/` anchors the path to
  the project, wherever the session was started. It does not stop shell
  commands such as `mv` or a script; the rule text is the guard for those.
  Reading stays allowed: a person may ask about the earlier work.
  - It is idempotent and keeps every other key.
  - The switch calls it. Setup does not: a project with no archive needs no
    rule, and setup must not quietly edit every project's shared settings.
  - `SwitchResult.archive_denied` reports it, and the switch's toast
    says so.
  - `add_deny_rules` and the webview's `context_deny` are unchanged. Their
    `valid_rule` still refuses anything but the heavy-path `Read` rules.
- **The watchers.** `watch_directory` gains `exclude: Vec<String>`, path
  prefixes whose events are dropped in the callback, by a pure function
  tested in Rust. The board passes `.ade/archive` for its `.ade/` watch. On
  Linux a recursive watch still registers the archive's folders with inotify;
  that cost is accepted, since the archive is written once per switch.
- **The board** never reads the archive's contents, only pending switches
  through `bmad_switch_pending`.

## `CLAUDE_MD` for both versions (plan A)

`CLAUDE_MD` in `src/lib/projectMethodology.ts` says BMAD is the
`/BMad:tasks:` commands in `.bmad-core/`, even for a v6 project. Its BMAD
paragraph becomes one that covers both and points at `.ade/methodology`: v4
is the `/BMad:tasks:` commands in `.bmad-core/`; v6 is the skills in
`.claude/skills/`, with work in `_bmad-output/`.

New projects get it. An existing project's `CLAUDE.md` is never rewritten.
That is a known gap for v6 projects set up before this release.

## ade-setup (plan C)

ADE vendors only ade-setup's `agents/` and `templates/`
(`scripts/syncAgents.mjs`). The rules and `CLAUDE.md` projects receive are
ADE's own `RULES_MD` and `CLAUDE_MD`, changed in plans A and B. ade-setup is
the shared, provider-neutral source others read, so it gets the same
content, as a separate PR with no AI attribution:

- **`rules.md`**: the archive rule.
- **`claude/CLAUDE.md`**: the BMAD paragraph for both versions, replacing the
  v4-only one (lines 23–28).
- **README**: both versions, the choice, switching, and the archive layout
  with `ARCHIVE.md`. It replaces the v4-only `bmad/` text.

Its CI tags the release, and the version follows from what changed. ADE
re-vendors with `npm run sync:agents` only if `agents/` changed.

## Docs

`docs/guide/project-setup.md`, new section "Choosing and switching the BMAD
version":

- when ADE asks (plan A adds this part)
- what moves in each direction, and that documents stay unless ticked
- the archive, its journal, and what a pending switch means
- how to go back

## Testing

### Plan A

Rust:

- `apply` returns its partial report on error; a failed setup removes what
  it created, the appended import and its empty folders
- the v4 install's copy errors fail setup; v4 setup writes the `v4` marker
- `mkdirs` records each level it creates

Frontend:

- the dialog in choose mode; Enter picks v6; it has no close button, and
  Escape and a click outside do nothing; Escape doesn't close a panel
  beneath it
- each entry point calls `askMethodology`; a project with BMAD never sees
  choose mode
- the `cd` hook shows a toast with two actions (v6, v4), not a modal; the
  toast is sticky (no timeout) and a click on its body doesn't dismiss it;
  after another toast replaces it, the next hook run shows it again
- New Tab does not open a folder with no BMAD until a version is picked
- New Tab then the `cd` hook: one question, not two
- New Tab on a subfolder with no BMAD above it sets up that folder
- lists key on the normalised root (a trailing slash doesn't ask twice)
- auto-setup off or declined: New Tab and the hook do nothing; the palette
  still asks
- the Agents tab shows a v6 project as complete
- `CLAUDE_MD` names both versions

### Plan B

Rust, on temporary folders, with a seam to fail setup's resource resolver and
a chosen rename:

- the plan for v4 → v6 and v6 → v4, including ticked documents (with the
  warning on `docs/prd.md` and `docs/architecture.md`), a custom and an
  absolute `output_folder`, and the merged v6 config
- left in place, not blocked: an output folder, a `devDebugLog` and a
  document location outside the project
- blocked: a moved path at the root, in the git dir or under the archive; a
  parent that leaves through a symlink; a `docs` location not offered; a
  cross-device source; an unparseable config layer; either version's
  resources missing; a pending switch
- a symlinked folder moves as the link; a nested location is dropped
- leftovers in a mixed tree
- a taken archive name gets `-2`. Apply uses the plan's archive, so a plan
  made before midnight still applies.
- a user's own skill and agent don't move; an edited role file does
- apply refuses when the sources differ from the plan
- rollback after a failed move and after a failed setup: every file back with
  its content, no created file or folder left, `settings.json` restored, the
  appended import and rules section gone. A failed reverse move leaves an
  `incomplete` journal.
- `bmad_switch_pending` finds `in-progress` and `incomplete`, and not
  `complete` or `abandoned`
- a project with no `rules.md`: after a switch it has the full rules plus
  the archive section, once
- `deny_archive_edits` adds the rule once and keeps other keys;
  `add_deny_rules` still refuses it
- the watcher's exclude filter
- git missing from `PATH`: `dirty` and `archive_ignored` are `None`
- the Rust and TS readers agree on the shared YAML and TOML fixtures

Frontend:

- the dialog in keep-or-switch and confirm modes: ticking a document
  re-plans; a blocked plan disables the button; the git, ignored and
  open-panes notes; "Couldn't check git"
- the kept list: answering choose, keeping and switching each add the
  project; the migration runs when the key is absent, after hydration, and
  normalises the roots it copies
- keep-or-switch is asked from New Tab only, never from the `cd` hook
- `setUpProject` during a switch rejects rather than sharing the promise;
  the board shows "Switching…"
- a pending switch: the board warns, `askMethodology` returns `blocked`
- the switch never emits `project-setup-done`
- the board's `.ade/` watch passes the archive exclusion

## Non-goals

- Converting v4 documents into v6 tickets, or the reverse.
- Restoring an archive from the UI.
- Rewriting an existing project's `CLAUDE.md`.
- Stopping shell commands from changing the archive.
- Switching several projects at once.

## Notes for plan B, from building plan A

- **A replaced marker is recorded as created.** When an install replaces a
  `.ade/methodology` that read the other version, the path goes into
  `created`, so setup's failed-setup cleanup deletes it rather than putting
  the old value back. Plan A can't reach that (a project with BMAD keeps its
  version). The switch's rollback must record the old marker and restore it.
- **Cleanup tests to add** before the switch relies on them: a failed setup
  leaves a pre-existing `.claude/agents/` and `.claude/settings.json` alone;
  a failed v6 setup is taken back; a file left half-written by a failed copy
  is removed.
- **`foldersUpTo` and `bmadRootOf`** compare paths with `startsWith` and no
  separator boundary (`/mono2` reads as inside `/mono`). Fix it when the
  switch starts resolving roots.
- **The question toast flickers** when the terminal's folder changes inside
  the same project: it is withdrawn, then shown again a moment later. Keep it
  in place when the project hasn't changed.
- **Undo is the only way back** from a forced answer, and it lives in a
  15-second toast. Consider an Undo entry on the Agents tab.

## Amendments made while planning the switch

- **A v6 output folder that holds documents stays.** When a v6 project's
  output folder is `docs`, is or is inside a documents location, or contains
  one, it is listed under "Your documents (stay)" and moves only when ticked.
  "What moves, v6 → v4" and the `documents` field therefore apply in both
  directions. Documents locations are `docs`, the six v4 locations and the
  v4 template outputs.
- **A move never swallows what must stay.** A planned move that equals or
  contains a path that stays, or an unticked documents location, blocks the
  plan and is named. So does a source called `ARCHIVE.md` or `leftovers-*`
  at the project's top level.
- **Only "not found" means absent.** A marker or `settings.json` that exists
  but can't be read fails the switch; rollback never removes or replaces it.
- **The journal leads the disk.** Each move is recorded as `moving` before
  its rename, so a crash never leaves a move the journal doesn't name.
  `ARCHIVE.md` gives the hand steps per phase.
- **Rollback reports its own failures** and keeps the journal `incomplete`
  when a restore step fails.
- **The pending-switch check fails closed.** If it can't run, setup is
  blocked with "Couldn't check for an unfinished BMAD switch."
