# Choosing and switching the BMAD version

ADE sets up every project with BMAD, v6 by default or v4 per project. Today
only the New Tab dialog asks which version, and only for a folder with no
BMAD; every other way into setup picks v6 silently. A project that already has
BMAD can't change version: there is no way to move the old install aside, and
setting up the other version installs it beside the old one, leaving a mixed
tree.

This spec makes the choice explicit everywhere and adds a switch that moves
the old version into an archive inside the project, then sets up the other
version in its place.

## Decisions

- **Ask on every setup.** Every entry point that would install BMAD asks v4 or
  v6 first, through one shared dialog.
- **A project with BMAD is asked once.** The first time it is opened, ADE
  offers to keep its version or switch. Keep is remembered; after that,
  switching is on demand.
- **Archive inside the project.** A switch moves the old version's engine and
  work products into `.ade/archive/bmad-<from>-<date>/`, then sets up the
  other version fresh. Nothing is deleted.
- **One Rust command does the switch**, with a dry run for the confirmation
  dialog and a rollback if any step fails.
- **ade-setup is updated** so agents know both versions and treat the archive
  as read-only history.

Rejected:

- **A git-based switch** (`git mv`, then commit). It fails for non-git
  projects and uncommitted work, and makes a commit in the user's name.
- **Moves driven from the frontend** through a generic move command. Nothing
  could undo a half-done switch, and a general move command is a larger
  capability than the webview needs.
- **A copy of the project at another location.** Two folders to keep in sync.

## When ADE asks

### A project with no BMAD

One dialog, `MethodologyPrompt` in *choose* mode:

> Set up **shop** with **BMAD v6** (default) or **BMAD v4**?

Enter picks v6. Escape cancels: no setup, and the project is not marked
declined, so ADE asks again next time.

Every entry point opens it through `askMethodology(root)`:

- the New Tab dialog (its own methodology list moves into the shared dialog)
- the terminal-`cd` setup hook (`useProjectSetup`), which today sets up v6
  without asking
- the palette's "Project: Set up BMAD, methodology and agents"
- "Set up now" on the board panel and on the Agents tab

The palette's "BMAD: Initialize in current project" installs v4 without
writing `.ade/methodology`. It is removed; "Set up BMAD" covers it.

`autoProjectSetup` and the declined list keep their meaning: with auto-setup
off, or for a declined project, the automatic entry points (New Tab, the `cd`
hook) neither set up nor ask. The explicit ones (palette, Set up now) always
ask.

### A project that already has BMAD

The first time it is opened from New Tab or reached by the `cd` hook, the
dialog opens in *keep or switch* mode:

> **shop** uses **BMAD v4**. **Keep v4** (default) · **Switch to v6…**

Keep is remembered per project on this machine, in localStorage
`ade-bmad-kept` beside `ade-project-setup-declined`, and ADE does not ask
again. Escape keeps the version for now and asks again next time.

### Switching on demand

- Palette: **BMAD: Switch to v6…** or **BMAD: Switch to v4…**, whichever is
  the other version for the active pane's project.
- Board panel: a small **Switch to BMAD v6…** (or v4) link at the bottom.

### Confirming a switch

Switch never acts immediately. The dialog opens in *confirm* mode, filled
from the dry run:

- the archive folder, `.ade/archive/bmad-v4-2026-10-11/`
- every path that will move there, including edited role files
- what the new version installs
- when git shows uncommitted changes: "Uncommitted changes stay as they are.
  Commit first if you want the move in its own commit."
- any reason the switch cannot go ahead, with **Archive and switch** disabled

On success, a toast summarises the switch, links to `ARCHIVE.md`, and notes
that agents already running keep their old role prompt until restarted. The
board rebuilds and shows the new version.

There is no Undo button. Everything is moved, nothing is deleted, `ARCHIVE.md`
says how to move it back, and git sees the files as moved. Switching back is
another switch, which archives the newer version in turn.

## The switch, in Rust

`src-tauri/src/bmadswitch.rs`, two commands.

### `bmad_switch_plan(root, to) -> SwitchPlan`

A dry run:

```
SwitchPlan {
  from: "v4" | "v6",
  to: "v4" | "v6",
  archive: String,          // project-relative, e.g. ".ade/archive/bmad-v4-2026-10-11"
  moves: Vec<Move>,         // { from, to }, both project-relative
  dirty: bool,              // `git status --porcelain` is non-empty; false outside git
  blocked: Option<String>,  // why it can't go ahead
}
```

`from` is the project's detected version (`bmadv6::detect_on_disk`). Blocked
when there is no BMAD to switch from, when `to == from`, or when a planned
path is unsafe (below).

### What moves

Only paths that exist. Never `.git/`, `.ade/archive/`, or the project root.
The ADE files both versions share (`.ade/rules.md`, `.ade/context/`,
`.ade/session.md`, `.ade/knowledge/`, `CLAUDE.md`, `llms.txt`,
`.claude/settings.json`) stay.

**v4 → v6**

- `.bmad-core/`, `.claude/commands/BMad/`
- the locations in `.bmad-core/core-config.yaml`, read in Rust with the same
  keys and defaults as `src/lib/bmadConfig.ts`:
  - `prd.prdFile` (`docs/prd.md`) and `prd.prdShardedLocation` (`docs/prd`)
  - `architecture.architectureFile` (`docs/architecture.md`) and
    `architecture.architectureShardedLocation` (`docs/architecture`)
  - `devStoryLocation` (`docs/stories`)
  - `qa.qaLocation` (`docs/qa`)
- `.ade/stage`

**v6 → v4**

- `_bmad/`
- the output folder from `_bmad/config.toml` (`output_folder`,
  `{project-root}` substituted; default `_bmad-output`)
- the skills ADE installed: each folder in `.claude/skills/` whose name is a
  folder in the bundled v6 skills. A user's own skills stay.
- `.ade/approvals/`, `.ade/gates/`

**Both directions**

- `.ade/methodology`
- the core role files ADE writes, `.claude/agents/<role>.md` for each id in
  `ROLES`, edited or not. Agents the user added stay.

**Unsafe paths.** A location that resolves outside the project, to the root,
or into `.git/` or `.ade/archive/` is not moved, and the plan is blocked with
the path named. A location nested inside another planned move (a sharded PRD
under `docs/prd/` when `docs/prd/` moves) is dropped as redundant.

### Archive

`.ade/archive/bmad-<from>-<YYYY-MM-DD>/`, or `…-2`, `…-3` when the name is
taken. Paths mirror the project: `docs/prd.md` →
`.ade/archive/bmad-v4-2026-10-11/docs/prd.md`.

`ARCHIVE.md` at the archive's root lists the date, both versions, every move,
and how to move it all back (move each path to its original place, then run
setup for the old version).

### `bmad_switch_apply(root, to, moves, files, import) -> SwitchResult`

`moves` is the list the dialog showed. `files` and `import` are what
`project_setup_apply` takes today, for the new version.

1. Recompute the plan. Stop if it is blocked or its moves differ from
   `moves`: nothing moves that the person didn't see.
2. Check every source exists and no destination exists.
3. Rename each source into the archive, creating parent folders, recording
   each move. Renames are instant and keep the move visible to git.
4. Write `ARCHIVE.md`.
5. Make sure `.ade/rules.md` carries the archive rule (see *Agents and the
   archive*): append the rule's section if the file lacks its marker. Recorded
   for rollback like the `CLAUDE.md` import.
6. Run setup for the new version (`projectsetup::apply`, full setup). The old
   role files are gone, so the new version's are written.

If any step fails: remove what setup created (the same check as
`project_setup_undo`: a file is removed only if unchanged), strip the appended
rules section, reverse the moves in reverse order, and remove `ARCHIVE.md`
and any folders the switch created. Return the error. The project ends as it
was.

`SwitchResult` carries the archive path, the moves and setup's report.

### v4 writes the marker

`bmad::install` (v4) does not write `.ade/methodology` today, so a v4 project
reads as v4 only while `.bmad-core/` exists. Setup for v4 now writes
`.ade/methodology` = `v4`, like v6 does, and records it in `created`.

## Agents and the archive

An agent that reads `.ade/archive/bmad-v4-…/docs/prd.md` as the current PRD
would build the wrong thing. The rule, in every place agents read rules:

> `.ade/archive/` holds earlier BMAD versions of this project. It is
> read-only history: never treat it as current documents, never write to it,
> and read it only when a person asks about the earlier work.

- **ADE's generated files**: `RULES_MD` in `src/lib/projectMethodology.ts`
  gains the rule, so new projects get it. Existing projects get it when they
  switch (step 5 above). The `CLAUDE.md` import is unchanged; it already
  imports `.ade/rules.md`.
- **The board and the watchers** ignore `.ade/archive/`: the v6 map and the
  v4 board never read it, and the `.ade/` watch skips events under it.

## ade-setup

`alvin-reyes/ade-setup` still describes BMAD as v4 only.

- **`rules.md`** and **`claude/CLAUDE.md`**: BMAD per version. v4 is the
  `/BMad:tasks:` commands in `.bmad-core/`. v6 is the skills in
  `.claude/skills/`, with work in `_bmad-output/`. `.ade/methodology` says
  which the project uses. Plus the archive rule above.
- **README**: both versions, the once-per-project choice, switching, and the
  archive layout with `ARCHIVE.md`.
- Released as v1.1.0 through its own PR (no AI attribution), then re-vendored
  into ADE with `npm run sync:agents`.

## Docs

`docs/guide/project-setup.md` gets a "Choosing and switching the BMAD version"
section: the questions, what moves for each direction, where it goes, and how
to move it back.

## Testing

Rust, on temporary folders:

- the plan for v4 → v6 and v6 → v4, with `core-config.yaml` locations and a
  custom `output_folder`
- a location outside the project, at the root, or in `.git/` blocks the plan
- a nested location is dropped
- a taken archive name gets `-2`
- a user's own skill and a user's own agent do not move; an edited role file
  does
- apply refuses when `moves` differs from the recomputed plan
- a failure during setup leaves the project byte-for-byte as it was
- v4 setup writes the `v4` marker

Frontend:

- the dialog in each mode, including the disabled confirm with a blocked plan
  and the uncommitted-changes note
- each entry point calls `askMethodology` and never sets up directly
- a kept project is not asked again; Escape on keep-or-switch asks again next
  time
- auto-setup off or a declined project: the automatic entry points do
  nothing; the palette still asks
- `.ade/archive/` changes do not trigger a board rebuild

## Non-goals

- Converting v4 documents into v6 tickets, or the reverse. The new version
  starts fresh; the old work stays readable in the archive.
- Restoring an archive from the UI.
- Switching several projects at once.
