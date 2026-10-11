# BMAD Version Choice, Plan B (The Switch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project that already has BMAD is asked from New Tab, once, to keep its version or switch; a switch (also on demand, from the palette and the board) archives the old version inside the project under `.ade/archive/bmad-<from>-<date>/`, sets up the other version fresh, and undoes itself if a step fails.

**Architecture:** One Rust module, `bmadswitch.rs`, plans a switch (a dry run the dialog shows), journals it in `ARCHIVE.md` before the first move, moves the paths, runs the same setup `project_setup_apply` runs, and rolls everything back on an error. Agents are told the archive is history by a section of `.ade/rules.md` and one `permissions.deny` entry; the watcher drops the archive's events. In the frontend, the shared `MethodologyPrompt` gains a keep-or-switch mode and a confirm mode, a kept list stops the question repeating, and a `switching` set keeps setup and the board out of a project while it is being moved.

**Tech Stack:** Rust (Tauri 2 commands, `std::fs`, the `toml` crate), TypeScript, React, zustand, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-11-bmad-version-choice-design.md`. This plan covers plan B only: "A project that already has BMAD (plan B)", "Switching on demand (plan B)", "Confirming a switch (plan B)", "The switch, in Rust (plan B)", "Agents and the archive (plan B)", the plan-B parts of "Docs" and "Testing → Plan B", and every item of "Notes for plan B, from building plan A". Plan A is merged (PR #45). Plan C (ade-setup) is out of scope.

## Global Constraints

- Commit messages carry no AI attribution: no `Co-Authored-By` trailer for a model, no "Generated with" line. Commit as the repo's configured git user.
- Run every command from the repo root (`/Users/alvin-reyes/Project/better-agentic-ide/.claude/worktrees/stage-board`). Stay on branch `bmad-switch`. Do not switch branches.
- Frontend tests: `npx vitest run <file>`; before each commit also `npx tsc --noEmit`.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml <filter>`.
- Match the surrounding code's style: comments explain why, not what; names as in neighbouring files.
- User-facing copy, exactly as the spec words it:
  - keep-or-switch: "**shop** uses **BMAD v4**. **Keep v4** (default) · **Switch to v6…**" (`shop` is the project folder's name; the four bold runs are `<b>` elements; the versions follow the project)
  - the confirm button: **Archive and switch**
  - a ticked `docs/prd.md` or `docs/architecture.md`: "ADE's rules use this file (the PRD / the verification command). The new version starts without it." (see Decision 9 for which half each file shows)
  - git unavailable: "Couldn't check git."
  - open panes and agents: "Stop agents before switching: they may keep writing into moved folders"
  - uncommitted changes: "They stay as they are. Commit first if you want the move in its own commit."
  - palette: **BMAD: Switch to v6…** / **BMAD: Switch to v4…**; board: **Switch to BMAD v6…** / **Switch to BMAD v4…**
- Both questions must be answered. Choose mode (plan A) and keep-or-switch have no Cancel or close button; Escape and a click outside do nothing; Enter keeps the version in keep-or-switch.
- The confirm step of a switch is a deliberate action and has a way back: **Back** (to keep-or-switch, when it came from there) or **Cancel** (closes, when it came from the palette or the board link). Escape does the same. See Decision 1.
- Documents stay unless ticked. A document the dialog did not offer is never moved, whatever the webview sends.
- Nothing is deleted by a switch. A rollback removes only what the switch and its setup created.
- The switch never emits `project-setup-done` and offers no Undo. It reports through its own event, `bmad-switch-done`.
- `usage::add_deny_rules`, `valid_rule` and the `context_deny` command are unchanged.
- The archive rule's text, exactly:
  > `.ade/archive/` holds earlier BMAD versions of this project. It is
  > read-only history: never treat it as current documents, never write to it,
  > and read it only when a person asks about the earlier work.
- The permission rule is exactly `Edit(/.ade/archive/**)`. Setup never adds it; only the switch does.
- Keep-or-switch is asked from New Tab only, never from the `cd` hook, and only when auto-setup is on and the project is neither declined nor kept.
- Line numbers below are as of commit `019737f`. Earlier tasks shift later ones, so find each edit by the code quoted with it.

## Review Focus

1. **An agent writes into a folder the switch has just moved, and the switch then fails.** `rename` onto an existing file replaces it without a word on Unix, so a careless rollback would overwrite what the agent wrote. The reverse move refuses, what the agent wrote stays, and the journal is left `incomplete`. (Task 7 `rollback_never_overwrites_what_reappeared`.)
2. **A malformed `.claude/settings.json`.** The switch still completes; the permission rule is not added, `archive_denied` is false, the file is left byte for byte, and the toast says the rule couldn't be added. (Task 7 `a_malformed_settings_file_does_not_stop_the_switch`; Task 15 "says so when the permission rule couldn't be added".)
3. **A double click on Archive and switch.** One switch runs; the second click gets the first one's promise. (Task 10 "runs one switch when asked twice"; Task 12 "disables both buttons while the switch runs".)
4. **A project reached through a symlinked path** (macOS `/tmp` and `/var`, a linked home folder). The "leaves the project through a symlink" check compares resolved paths on both sides, so the project is not blocked; the watcher's exclusion also matches the resolved path the OS reports. (Task 5 `a_project_under_a_linked_path_is_not_blocked`; Task 8 `excludes_the_resolved_path_too`.)
5. **A `core-config.yaml` with Windows line endings.** The Rust reader reads the configured locations; without that, the debug log and the documents at custom locations would be silently left out of the plan. (Task 3 `reads_a_config_with_windows_line_endings`.)

## Decisions made in this plan

The spec leaves these open; each is decided here.

1. **Confirm has a way back.** The spec says both *questions* must be answered and is silent on the confirm step. Confirm is a deliberate, destructive-looking action, so it has **Back** (returns to keep-or-switch) when it came from that question, and **Cancel** (closes the dialog, nothing changes) when it came from the palette or the board link. Escape does what that button does. While the switch is running neither works.
2. **New Tab does not open a project that has BMAD until keep-or-switch is answered,** as with choose mode. A switch then runs before any terminal sits in the folder, which is when a rename is least likely to fail. After **Keep**, the folder opens and is set up on its version as today. After a switch, it opens with no second setup. If the switch fails, the error shows in the confirm dialog and **Back** still works.
3. **A blocked project (a pending switch) still opens from New Tab,** without setup, and the reason is reported through the existing `project-setup-failed` event. The person needs a terminal there to resolve it. The palette and both **Set up now** buttons show the reason where they already show errors. The `cd` hook stays silent; the board carries the warning.
4. **`bmad_switch_apply` also takes `marker`.** The spec's signature is `(root, to, plan, files, import)`, but the setup it runs (`projectsetup::apply`) needs the import marker to tell whether `CLAUDE.md` already loads the rules.
5. **Apply never trusts the plan's destinations.** The plan comes back from the webview. Apply recomputes the plan itself, compares only the *set of sources*, takes only the archive's name from the shown plan (validated against `.ade/archive/bmad-<from>-YYYY-MM-DD[-N]`), and derives every destination from that.
6. **`SwitchPlan.from` is `""` when the project has no BMAD.** The plan is then `blocked` and lists nothing.
7. **The first blocking reason is the one shown.** The plan is still filled in, so the dialog shows what would move beside why it can't.
8. **`SwitchResult.moved` is the number of files moved,** the sum of the plan's file counts, not the number of paths.
9. **The document warning is per file.** `docs/prd.md` shows "ADE's rules use this file (the PRD). The new version starts without it."; `docs/architecture.md` shows "ADE's rules use this file (the verification command). The new version starts without it." The spec writes both halves in one sentence. The plan carries the warning on those two paths whether ticked or not; the dialog shows it when the box is ticked.
10. **"What the new version installs" is fixed copy in the dialog,** one sentence per target version. `SwitchPlan` has no field for it.
11. **The archive rule lives in one file, `src-tauri/src/archive_rule.md`.** Rust reads it with `include_str!`, `RULES_MD` imports it with `?raw` (as `projectMethodology.ts` already imports the vendored knowledge README). Its marker is `<!-- ade:archive -->`, its heading "## 4. The archive".
12. **The core role names are a Rust constant, `CORE_ROLES`,** since the plan command gets no file list. A vitest in `scripts/` fails if it drifts from `ROLES`.
13. **The archive date is UTC.** The crate has no date library; `civil_date` is the inverse of the algorithm `usage.rs` already uses. Apply uses the shown plan's archive name, so the date only matters when the plan is made.
14. **`devDebugLog` defaults to `.ai/debug-log.md`** when the config doesn't set it, BMAD v4's own default. Only a path that exists is moved.
15. **A v6 project with no `_bmad/config.toml` is not blocked.** The output folder is then `_bmad-output`, as it is when `core.output_folder` is unset or empty. A layer that exists and doesn't parse blocks, named.
16. **The Rust TOML merge deep-merges tables and lets a later layer replace anything else.** The TS reader also merges keyed arrays; no array decides where the output folder is.
17. **The Rust YAML reader strips a trailing `\r`;** the TS reader is unchanged, as the spec says, and reads nothing from a CRLF file. The shared fixture uses LF. (Review Focus 5.)
18. **`watch_directory`'s `exclude` is `Option<Vec<String>>`,** like `with_content`: the preview and the file browser call the command without it. Entries are absolute path prefixes; a relative one is taken under the watched folder. The board passes `<root>/.ade/archive`.
19. **`archive_ignored` asks git about `.ade/archive/`,** which is ignored when `.ade/` is.
20. **A settings file that can't be edited doesn't fail the switch.** `archive_denied` is false and the toast says so, as setup already does for AI attribution.
21. **A switch marks the project set up and kept, and clears a decline,** as running setup by hand clears an earlier Undo.
22. **A second request for the same project while a switch runs returns the running switch's promise.** A setup in flight makes `runSwitch` reject with "Project setup is running. Try again when it has finished."
23. **The kept-list migration runs in `main.tsx`,** in the main window only, right after `hydrateFromDisk()` and `startAutoSave()`, so its write is mirrored to disk.
24. **While a switch runs the board shows only "Switching…".** A half-moved tree would otherwise render as a project with no BMAD.
25. **Test seams.** `bmadswitch::Env` carries the git program's name (a name that doesn't exist stands in for a machine without git), each version's resource root (`None` is "didn't resolve"), today's date, the device lookup, the rename function, and `fail_after_rules`, which fails the run at the last point a real failure can come from. Setup edits `.claude/settings.json` last and nothing after it can fail, so without that last seam "`settings.json` restored" could not be tested.
26. **No Undo entry on the Agents tab in this plan.** The spec makes it optional. Undo belongs to setup; the switch offers none by design, and a switched project's way back is the other switch. It stays a follow-up for a setup-focused change.
27. **Paths over 247 characters get the `\\?\` prefix on Windows.** The spec says 260; folder creation fails from 248.

---

### Task 1: Failed-setup cleanup the switch will rely on

The switch's rollback reuses setup's cleanup. The spec's notes ask for three tests first. Two pin behaviour plan A already has. The third fails today: a copy that dies partway leaves a file no report names.

**Files:**
- Modify: `src-tauri/src/projectsetup.rs:70-98` (add `write_or_clean` after `mkdirs`), `:188` (the file write in `apply`), `:415-791` (tests, append)
- Modify: `src-tauri/src/bmad.rs:36` (`copy_tree`'s copy)
- Modify: `src-tauri/src/bmadv6.rs:87` (`copy_tree`'s copy), `:99` (`copy_file`'s copy)

**Interfaces:**
- Produces (`crate::projectsetup`): `pub(crate) fn write_or_clean(dst: &Path, write: impl FnOnce(&Path) -> std::io::Result<()>) -> std::io::Result<()>`: runs `write`, and on an error removes whatever is at `dst` before returning the error.

- [ ] **Step 1: Write the tests**

Append to the `tests` module of `src-tauri/src/projectsetup.rs`:

```rust
    /// A miniature of the bundled v6 resource root, with or without the runtime.
    fn v6_source(with_runtime: bool) -> PathBuf {
        let src = temp();
        std::fs::create_dir_all(src.join("skills/bmad")).unwrap();
        std::fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        if with_runtime {
            std::fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();
        }
        src
    }

    fn names(d: &Path) -> Vec<String> {
        let mut v: Vec<String> =
            std::fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        v.sort();
        v
    }

    #[test]
    fn a_failed_setup_leaves_what_the_project_had_alone() {
        let dir = temp();
        let src = v4_source();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/mine.md"), "my agent").unwrap();
        std::fs::write(dir.join(".claude/settings.json"), "{\"model\":\"sonnet\"}").unwrap();
        // A file where the install needs a folder: its copy fails partway.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();

        assert!(apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src)).is_err());

        assert_eq!(names(&dir), [".bmad-core", ".claude"]);
        assert_eq!(names(&dir.join(".claude")), ["agents", "settings.json"]);
        assert_eq!(names(&dir.join(".claude/agents")), ["mine.md"], "the role file setup wrote is gone, the folder stays");
        assert_eq!(std::fs::read_to_string(dir.join(".claude/settings.json")).unwrap(), "{\"model\":\"sonnet\"}");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_failed_v6_setup_is_taken_back() {
        let dir = temp();
        // No runtime bundle: the install fails after the skills and `_bmad/` are written.
        let src = v6_source(false);
        assert!(apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V6, Some(&src)).is_err());
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_half_written_file_is_removed() {
        let dir = temp();
        let dst = dir.join("half.md");
        let err = write_or_clean(&dst, |to| {
            std::fs::write(to, "half")?;
            Err(std::io::Error::other("disk full"))
        })
        .unwrap_err();
        assert_eq!(err.to_string(), "disk full");
        assert!(!dst.exists(), "the half-written file is gone");

        // A write that succeeds keeps its file.
        write_or_clean(&dst, |to| std::fs::write(to, "whole")).unwrap();
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "whole");
        std::fs::remove_dir_all(dir).ok();
    }
```

- [ ] **Step 2: Run them**

Run: `cargo test --manifest-path src-tauri/Cargo.toml projectsetup`
Expected: FAIL to compile with "cannot find function `write_or_clean` in this scope". (The other two tests pin what plan A built and pass once the file compiles. If either fails then, stop: the switch's rollback depends on that cleanup.)

- [ ] **Step 3: Add `write_or_clean`**

In `src-tauri/src/projectsetup.rs`, after `mkdirs` (which ends at line 98):

```rust
/// Run `write` for a file setup is creating at `dst`. A write that fails
/// partway (a full disk, a lost volume) leaves a file no report names, so
/// nothing would ever take it back: it is removed here instead.
pub(crate) fn write_or_clean(dst: &Path, write: impl FnOnce(&Path) -> std::io::Result<()>) -> std::io::Result<()> {
    write(dst).inspect_err(|_| {
        let _ = std::fs::remove_file(dst);
    })
}
```

- [ ] **Step 4: Use it where setup creates a file**

Every call below is only reached when the destination does not exist yet, so removing it on failure removes nothing of the user's.

`src-tauri/src/projectsetup.rs`, in `apply`, replace

```rust
        std::fs::write(&dst, &f.content).map_err(|e| format!("{}: {e}", f.path))?;
```

with

```rust
        write_or_clean(&dst, |to| std::fs::write(to, &f.content)).map_err(|e| format!("{}: {e}", f.path))?;
```

`src-tauri/src/bmad.rs`, in `copy_tree`, replace

```rust
            std::fs::copy(src, dst).map_err(|e| format!("{}: {e}", dst.display()))?;
```

with

```rust
            crate::projectsetup::write_or_clean(dst, |to| std::fs::copy(src, to).map(|_| ()))
                .map_err(|e| format!("{}: {e}", dst.display()))?;
```

`src-tauri/src/bmadv6.rs`, in `copy_tree`, replace

```rust
            fs::copy(&from, &to).map_err(|e| format!("{}: {e}", from.display()))?;
```

with

```rust
            crate::projectsetup::write_or_clean(&to, |to| fs::copy(&from, to).map(|_| ()))
                .map_err(|e| format!("{}: {e}", from.display()))?;
```

and in `copy_file`, replace

```rust
        fs::copy(src, dst).map_err(|e| format!("{}: {e}", src.display()))?;
```

with

```rust
        crate::projectsetup::write_or_clean(dst, |to| fs::copy(src, to).map(|_| ()))
            .map_err(|e| format!("{}: {e}", src.display()))?;
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml projectsetup`
Expected: PASS, including the three new tests.

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmad`
Expected: PASS (both installs' existing tests).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/projectsetup.rs src-tauri/src/bmad.rs src-tauri/src/bmadv6.rs
git commit -m "fix(setup): remove a file left half-written by a failed copy"
```

---

### Task 2: One git helper, run without optional locks

**Files:**
- Create: `src-tauri/src/git.rs`
- Modify: `src-tauri/src/antislop.rs:4-13` (drop its own `git`)
- Modify: `src-tauri/src/lib.rs:1-17` (add `mod git;`)

**Interfaces:**
- Produces (`crate::git`):
  - `pub(crate) const GIT: &str = "git";`
  - `pub(crate) fn run(program: &str, dir: &Path, args: &[&str]) -> Option<String>`: stdout when the command ran and exited 0, else `None`.
  - `pub(crate) fn code(program: &str, dir: &Path, args: &[&str]) -> Option<i32>`: the exit code when the command ran, else `None`.
  - Both pass `--no-optional-locks` first.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/git.rs`:

```rust
//! The one way this crate runs git.

use std::path::Path;
use std::process::{Command, Output};

/// The program to run. Callers pass it on, so a test can name one that doesn't
/// exist and see what a machine without git sees.
pub(crate) const GIT: &str = "git";

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ade-git-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn runs_git_and_returns_its_output() {
        let dir = temp("run");
        assert!(run(GIT, &dir, &["init", "-q"]).is_some());
        assert_eq!(run(GIT, &dir, &["rev-parse", "--is-inside-work-tree"]).as_deref().map(str::trim), Some("true"));
        // A command that fails is None from run(), and its exit code from code().
        assert_eq!(run(GIT, &dir, &["rev-parse", "--verify", "-q", "HEAD"]), None);
        assert_eq!(code(GIT, &dir, &["rev-parse", "--verify", "-q", "HEAD"]), Some(1));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_missing_git_is_none() {
        let dir = temp("missing");
        assert_eq!(run("ade-no-such-git", &dir, &["status"]), None);
        assert_eq!(code("ade-no-such-git", &dir, &["status"]), None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn never_takes_an_optional_lock() {
        assert_eq!(arguments(&["status", "--porcelain"]), ["--no-optional-locks", "status", "--porcelain"]);
    }
}
```

In `src-tauri/src/lib.rs`, add the module after `mod contracts;` (line 6), keeping the list alphabetical:

```rust
mod git;
```

- [ ] **Step 2: Run it**

Run: `cargo test --manifest-path src-tauri/Cargo.toml git::`
Expected: FAIL to compile with "cannot find function `run` in this scope".

- [ ] **Step 3: Implement**

In `src-tauri/src/git.rs`, between the `GIT` constant and the tests:

```rust
/// `--no-optional-locks` first: `git status` otherwise refreshes the index and
/// takes `index.lock`, which fails the commit of an agent running beside ADE.
fn arguments<'a>(args: &[&'a str]) -> Vec<&'a str> {
    let mut all = vec!["--no-optional-locks"];
    all.extend_from_slice(args);
    all
}

fn output(program: &str, dir: &Path, args: &[&str]) -> Option<Output> {
    Command::new(program).current_dir(dir).args(arguments(args)).output().ok()
}

/// What the command printed, when it ran and succeeded.
pub(crate) fn run(program: &str, dir: &Path, args: &[&str]) -> Option<String> {
    let out = output(program, dir, args)?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// The command's exit code, when it ran at all. For commands that answer with
/// it, such as `check-ignore -q`.
pub(crate) fn code(program: &str, dir: &Path, args: &[&str]) -> Option<i32> {
    output(program, dir, args)?.status.code()
}
```

- [ ] **Step 4: Move `antislop` onto it**

In `src-tauri/src/antislop.rs`, replace

```rust
fn git(project: &str, args: &[&str]) -> Option<String> {
    let out = Command::new("git").current_dir(project).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}
```

with

```rust
fn git(project: &str, args: &[&str]) -> Option<String> {
    crate::git::run(crate::git::GIT, Path::new(project), args)
}
```

`Command` is still used by this file's tests only. Change the import at line 5 from `use std::process::Command;` to nothing, and add `use std::process::Command;` as the second line of its `mod tests` (after `use super::*;`).

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml git::`
Expected: PASS (3 tests).

Run: `cargo test --manifest-path src-tauri/Cargo.toml antislop`
Expected: PASS (2 tests), with no unused-import warning for `Command`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/git.rs src-tauri/src/antislop.rs src-tauri/src/lib.rs
git commit -m "refactor(git): one git helper, run with --no-optional-locks"
```

---

### Task 3: The config readers, in Rust, agreeing with the TS ones

The plan needs two facts the frontend already reads: where a v4 project keeps its documents and debug log (`.bmad-core/core-config.yaml`), and where a v6 project writes its output (the merged `_bmad` config).

**Files:**
- Modify: `src-tauri/Cargo.toml:30` (add `toml`)
- Create: `src-tauri/src/bmadconfig.rs`
- Create: `src-tauri/src/fixtures/switch/core-config.yaml`, `config.toml`, `config.team.toml`, `config.user.toml`, `expected.json`
- Modify: `src-tauri/src/lib.rs:1-17` (add `mod bmadconfig;`)
- Test: `scripts/switchFixtures.test.ts` (create)

**Interfaces:**
- Produces (`crate::bmadconfig`):
  - `pub(crate) struct V4Paths { pub qa_location: String, pub prd_file: String, pub prd_sharded_location: String, pub architecture_file: String, pub architecture_sharded_location: String, pub dev_story_location: String, pub dev_debug_log: String }`
  - `pub(crate) fn parse_core_config(yaml: Option<&str>) -> V4Paths`: `None`, or a config that sets none of the eight path keys, gives BMAD's defaults. `dev_debug_log` is the config's `devDebugLog`, else `.ai/debug-log.md`.
  - `pub(crate) fn load_central_config(root: &Path) -> Result<toml::Table, String>`: `_bmad/config.toml`, then `_bmad/custom/config.toml`, then `_bmad/custom/config.user.toml`, tables deep-merged, later layers winning. A missing layer is skipped. A layer that doesn't parse is an `Err` naming it.
  - `pub(crate) fn output_folder(root: &Path, config: &toml::Table) -> String`: `core.output_folder` with `{project-root}` replaced by `root`; `_bmad-output` when unset, empty or not a string.

- [ ] **Step 1: Add the dependency and the fixtures**

In `src-tauri/Cargo.toml`, after `glob = "0.3"` (line 30):

```toml
# The switch reads a v6 project's merged `_bmad` config to find its output folder.
toml = "0.8"
```

Create `src-tauri/src/fixtures/switch/core-config.yaml`:

```yaml
# Shared by src-tauri/src/bmadconfig.rs and scripts/switchFixtures.test.ts.
markdownExploder: true
qa:
  qaLocation: "quality"   # the gates live here
prd:
  prdFile: 'spec/prd#1.md'
  prdSharded: True
  prdShardedLocation: spec/prd
architecture:
    architectureFile: docs/architecture.md
devDebugLog: logs/debug.md
devStoryLocation: work/stories # sharded stories
slashPrefix: BMad
```

Create `src-tauri/src/fixtures/switch/config.toml`:

```toml
[core]
project_name = "shop"
output_folder = "{project-root}/_bmad-output"
communication_language = "English"

[modules.demo]
enabled = true
```

Create `src-tauri/src/fixtures/switch/config.team.toml`:

```toml
[core]
project_name = "team-shop"
output_folder = "{project-root}/docs/out"
```

Create `src-tauri/src/fixtures/switch/config.user.toml`:

```toml
[core]
output_folder = "{project-root}/work/out"

[modules.demo]
level = 2
```

Create `src-tauri/src/fixtures/switch/expected.json`:

```json
{
  "yaml": {
    "qaLocation": "quality",
    "prdFile": "spec/prd#1.md",
    "prdShardedLocation": "spec/prd",
    "architectureFile": "docs/architecture.md",
    "architectureShardedLocation": "docs/architecture",
    "devStoryLocation": "work/stories"
  },
  "toml": {
    "root": "/code/shop",
    "projectName": "team-shop",
    "communicationLanguage": "English",
    "outputFolder": "/code/shop/work/out",
    "demoEnabled": true,
    "demoLevel": 2
  }
}
```

- [ ] **Step 2: Write the failing Rust tests**

Create `src-tauri/src/bmadconfig.rs`:

```rust
//! Where BMAD keeps things in a project, read for the switch: the v4
//! locations from `.bmad-core/core-config.yaml` and the v6 output folder from
//! the merged `_bmad` config. Ports of src/lib/bmadConfig.ts and
//! src/lib/bmadRuntime/config.ts; the fixtures in `fixtures/switch/` are read
//! by both languages' tests.

use std::collections::HashMap;
use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;

    const YAML: &str = include_str!("fixtures/switch/core-config.yaml");
    const EXPECTED: &str = include_str!("fixtures/switch/expected.json");

    fn expected() -> serde_json::Value {
        serde_json::from_str(EXPECTED).unwrap()
    }

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ade-bmadconfig-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("_bmad/custom")).unwrap();
        dir
    }

    #[test]
    fn reads_the_shared_yaml_fixture_as_the_ts_reader_does() {
        let p = parse_core_config(Some(YAML));
        let want = &expected()["yaml"];
        assert_eq!(p.qa_location, want["qaLocation"]);
        assert_eq!(p.prd_file, want["prdFile"]);
        assert_eq!(p.prd_sharded_location, want["prdShardedLocation"]);
        assert_eq!(p.architecture_file, want["architectureFile"]);
        assert_eq!(p.architecture_sharded_location, want["architectureShardedLocation"]);
        assert_eq!(p.dev_story_location, want["devStoryLocation"]);
        // Rust only: the TS reader has no use for the debug log.
        assert_eq!(p.dev_debug_log, "logs/debug.md");
    }

    #[test]
    fn a_config_with_no_path_keys_means_the_defaults() {
        for yaml in [None, Some(""), Some("markdownExploder: true\nslashPrefix: BMad\n")] {
            let p = parse_core_config(yaml);
            assert_eq!(p.qa_location, "docs/qa");
            assert_eq!(p.prd_file, "docs/prd.md");
            assert_eq!(p.prd_sharded_location, "docs/prd");
            assert_eq!(p.architecture_file, "docs/architecture.md");
            assert_eq!(p.architecture_sharded_location, "docs/architecture");
            assert_eq!(p.dev_story_location, "docs/stories");
            assert_eq!(p.dev_debug_log, ".ai/debug-log.md");
        }
        // The debug log is read even when nothing else is set.
        assert_eq!(parse_core_config(Some("devDebugLog: tmp/log.md\n")).dev_debug_log, "tmp/log.md");
    }

    #[test]
    fn reads_the_vendored_config() {
        let p = parse_core_config(Some(include_str!("../resources/bmad/bmad-core/core-config.yaml")));
        assert_eq!(p.dev_story_location, "docs/stories");
        assert_eq!(p.dev_debug_log, ".ai/debug-log.md");
    }

    #[test]
    fn reads_a_config_with_windows_line_endings() {
        let p = parse_core_config(Some("qa:\r\n  qaLocation: quality\r\ndevDebugLog: logs/debug.md\r\n"));
        assert_eq!(p.qa_location, "quality");
        assert_eq!(p.dev_debug_log, "logs/debug.md");
    }

    #[test]
    fn keeps_a_hash_inside_quotes_and_a_key_with_no_value_takes_nothing() {
        let p = parse_core_config(Some("prd:\n  prdFile: \"docs/a#b/prd.md\" # the PRD\ndevStoryLocation:\nqa:\n  qaLocation: q\n"));
        assert_eq!(p.prd_file, "docs/a#b/prd.md");
        assert_eq!(p.dev_story_location, "docs/stories", "an empty value is not a location");
    }

    #[test]
    fn merges_the_shared_toml_layers_as_the_ts_reader_does() {
        let dir = temp("layers");
        std::fs::write(dir.join("_bmad/config.toml"), include_str!("fixtures/switch/config.toml")).unwrap();
        std::fs::write(dir.join("_bmad/custom/config.toml"), include_str!("fixtures/switch/config.team.toml")).unwrap();
        std::fs::write(dir.join("_bmad/custom/config.user.toml"), include_str!("fixtures/switch/config.user.toml")).unwrap();
        let config = load_central_config(&dir).unwrap();
        let want = &expected()["toml"];
        let core = config["core"].as_table().unwrap();
        assert_eq!(core["project_name"].as_str(), want["projectName"].as_str());
        assert_eq!(core["communication_language"].as_str(), want["communicationLanguage"].as_str());
        let demo = config["modules"]["demo"].as_table().unwrap();
        assert_eq!(demo["enabled"].as_bool(), want["demoEnabled"].as_bool());
        assert_eq!(demo["level"].as_integer(), want["demoLevel"].as_i64());
        let root = Path::new(want["root"].as_str().unwrap());
        assert_eq!(output_folder(root, &config), want["outputFolder"].as_str().unwrap());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_layer_that_does_not_parse_is_named() {
        let dir = temp("broken");
        std::fs::write(dir.join("_bmad/config.toml"), "[core]\noutput_folder = \"out\"\n").unwrap();
        std::fs::write(dir.join("_bmad/custom/config.toml"), "not = [toml").unwrap();
        let err = load_central_config(&dir).unwrap_err();
        assert!(err.contains("_bmad/custom/config.toml"), "{err}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn no_config_or_no_output_folder_means_the_default_folder() {
        let dir = temp("none");
        let config = load_central_config(&dir).unwrap();
        assert_eq!(output_folder(&dir, &config), "_bmad-output");
        std::fs::write(dir.join("_bmad/config.toml"), "[core]\noutput_folder = \"\"\n").unwrap();
        assert_eq!(output_folder(&dir, &load_central_config(&dir).unwrap()), "_bmad-output");
        std::fs::remove_dir_all(dir).ok();
    }
}
```

In `src-tauri/src/lib.rs`, add after `mod bmad;` (line 2):

```rust
mod bmadconfig;
```

- [ ] **Step 3: Run them**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadconfig`
Expected: FAIL to compile with "cannot find function `parse_core_config` in this scope".

- [ ] **Step 4: Implement the readers**

In `src-tauri/src/bmadconfig.rs`, between the `use` lines and the tests:

```rust
/// A v4 project's configured locations, project-relative unless the config
/// says otherwise.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct V4Paths {
    pub qa_location: String,
    pub prd_file: String,
    pub prd_sharded_location: String,
    pub architecture_file: String,
    pub architecture_sharded_location: String,
    pub dev_story_location: String,
    /// Read here only: the frontend has no use for it.
    pub dev_debug_log: String,
}

/// The keys that name a path, for deciding whether a config said anything.
const PATH_KEYS: [&str; 8] = [
    "qaLocation", "prdFile", "prdSharded", "prdShardedLocation",
    "architectureFile", "architectureSharded", "architectureShardedLocation",
    "devStoryLocation",
];

/// `key: value` at any indentation, as `scalars` in bmadConfig.ts reads it:
/// the comment is cut after the quotes are found, since a path may hold `#`.
/// A trailing `\r` is dropped first, so a file saved on Windows reads the same.
fn scalars(yaml: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for raw in yaml.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw).trim_start();
        let key_len = line
            .char_indices()
            .take_while(|&(i, c)| if i == 0 { c.is_ascii_alphabetic() || c == '_' } else { c.is_ascii_alphanumeric() || c == '_' || c == '-' })
            .count();
        // The key is ASCII, so its length in characters is its length in bytes.
        let (key, rest) = line.split_at(key_len);
        let Some(value) = rest.strip_prefix(':') else { continue };
        if key.is_empty() {
            continue;
        }
        let mut cut = value.len();
        let mut quote: Option<char> = None;
        for (i, c) in value.char_indices() {
            if let Some(q) = quote {
                if c == q {
                    quote = None;
                }
            } else if c == '"' || c == '\'' {
                quote = Some(c);
            } else if c == '#' {
                cut = i;
                break;
            }
        }
        let value = value[..cut].trim();
        let quoted = value.len() >= 2
            && (value.starts_with('"') || value.starts_with('\''))
            && value.chars().next() == value.chars().last();
        let value = if quoted { &value[1..value.len() - 1] } else { value };
        if !value.is_empty() {
            out.insert(key.to_string(), value.to_string());
        }
    }
    out
}

/// The locations a v4 project is configured with. A config that sets none of
/// the path keys supplies nothing here, so BMAD's own defaults stand.
pub(crate) fn parse_core_config(yaml: Option<&str>) -> V4Paths {
    let all = yaml.map(scalars).unwrap_or_default();
    let said_anything = PATH_KEYS.iter().any(|k| all.contains_key(*k));
    let path = |key: &str, fallback: &str| {
        all.get(key).filter(|_| said_anything).cloned().unwrap_or_else(|| fallback.to_string())
    };
    V4Paths {
        qa_location: path("qaLocation", "docs/qa"),
        prd_file: path("prdFile", "docs/prd.md"),
        prd_sharded_location: path("prdShardedLocation", "docs/prd"),
        architecture_file: path("architectureFile", "docs/architecture.md"),
        architecture_sharded_location: path("architectureShardedLocation", "docs/architecture"),
        dev_story_location: path("devStoryLocation", "docs/stories"),
        dev_debug_log: all.get("devDebugLog").cloned().unwrap_or_else(|| ".ai/debug-log.md".to_string()),
    }
}

/// Merge `over` into `base`: tables merge key by key, anything else is replaced.
fn merge(base: &mut toml::Table, over: toml::Table) {
    for (key, value) in over {
        if let toml::Value::Table(inner) = value {
            if let Some(toml::Value::Table(existing)) = base.get_mut(&key) {
                merge(existing, inner);
                continue;
            }
            base.insert(key, toml::Value::Table(inner));
        } else {
            base.insert(key, value);
        }
    }
}

/// The three layers of a v6 project's central config, in the order they apply.
const LAYERS: [&str; 3] = ["_bmad/config.toml", "_bmad/custom/config.toml", "_bmad/custom/config.user.toml"];

/// `_bmad/config.toml` ← `_bmad/custom/config.toml` ← `_bmad/custom/config.user.toml`.
/// A layer the project doesn't have is skipped; one that can't be parsed is an
/// error naming it, since guessing where the output folder is could move the
/// wrong one.
pub(crate) fn load_central_config(root: &Path) -> Result<toml::Table, String> {
    let mut merged = toml::Table::new();
    for layer in LAYERS {
        let Ok(text) = std::fs::read_to_string(root.join(layer)) else { continue };
        let table: toml::Table = toml::from_str(&text).map_err(|e| format!("{layer} can't be read: {}", e.message()))?;
        merge(&mut merged, table);
    }
    Ok(merged)
}

/// The project's output folder as configured, `{project-root}` filled in.
pub(crate) fn output_folder(root: &Path, config: &toml::Table) -> String {
    let configured = config
        .get("core")
        .and_then(|core| core.get("output_folder"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or_default();
    if configured.is_empty() {
        return "_bmad-output".to_string();
    }
    configured.replace("{project-root}", &root.to_string_lossy())
}
```

- [ ] **Step 5: Run the Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadconfig`
Expected: PASS (8 tests). An "unused" warning for this module is expected until Task 5 uses it.

- [ ] **Step 6: Write the TS side of the agreement**

Create `scripts/switchFixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBmadConfig } from "../src/lib/bmadConfig";
import { loadCentralConfig } from "../src/lib/bmadRuntime/config";
import { memFs } from "../src/lib/bmadRuntime/fs";

/**
 * The switch reads two configs in Rust that the app reads in TypeScript. If
 * the two readers disagreed, the dialog would list one folder and the board
 * would watch another. Both are run over the same fixtures, and both are held
 * to the same expected.json (src-tauri/src/bmadconfig.rs has the Rust half).
 */
const FIXTURES = resolve(__dirname, "..", "src-tauri/src/fixtures/switch");
const read = (name: string) => readFileSync(resolve(FIXTURES, name), "utf8");
const expected = JSON.parse(read("expected.json"));

describe("the switch's shared config fixtures", () => {
  it("core-config.yaml: the TS reader finds what the Rust reader finds", () => {
    const paths = parseBmadConfig(read("core-config.yaml"));
    for (const [key, value] of Object.entries(expected.yaml)) {
      expect(paths[key as keyof typeof paths], key).toBe(value);
    }
  });

  it("the v6 layers: the TS reader merges them as the Rust reader does", async () => {
    const root: string = expected.toml.root;
    const fs = memFs();
    await fs.mkdir(`${root}/_bmad/custom`);
    await fs.writeText(`${root}/_bmad/config.toml`, read("config.toml"));
    await fs.writeText(`${root}/_bmad/custom/config.toml`, read("config.team.toml"));
    await fs.writeText(`${root}/_bmad/custom/config.user.toml`, read("config.user.toml"));
    const config = (await loadCentralConfig(root, fs)) as Record<string, any>;
    expect(config.core.project_name).toBe(expected.toml.projectName);
    expect(config.core.communication_language).toBe(expected.toml.communicationLanguage);
    expect(config.modules.demo.enabled).toBe(expected.toml.demoEnabled);
    expect(config.modules.demo.level).toBe(expected.toml.demoLevel);
    expect(String(config.core.output_folder).replaceAll("{project-root}", root)).toBe(expected.toml.outputFolder);
  });
});
```

- [ ] **Step 7: Run it**

Run: `npx vitest run scripts/switchFixtures.test.ts`
Expected: PASS (2 tests). The TS readers are unchanged; this pins that they agree with the fixtures the Rust tests just passed.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/bmadconfig.rs src-tauri/src/fixtures/switch src-tauri/src/lib.rs scripts/switchFixtures.test.ts
git commit -m "feat(switch): read the v4 locations and the v6 output folder in Rust"
```

---

### Task 4: The journal, and finding a switch that didn't finish

**Files:**
- Create: `src-tauri/src/bmadswitch.rs`
- Modify: `src-tauri/src/lib.rs:1-17` (add `mod bmadswitch;`), `:445` (register `bmad_switch_pending`)

**Interfaces:**
- Consumes: `crate::state::atomic_write(path: &Path, contents: &str) -> std::io::Result<()>`.
- Produces (`crate::bmadswitch`):
  - `pub(crate) const ARCHIVE_DIR: &str = ".ade/archive";` and `pub(crate) const JOURNAL: &str = "ARCHIVE.md";`
  - `pub(crate) fn at(root: &Path, rel: &str) -> PathBuf`: a project-relative, `/`-separated path under `root`.
  - `pub struct Move { pub from: String, pub to: String, pub files: u32, pub ignored: String }` (serde, camelCase; `ignored` is `"none" | "some" | "all"`).
  - `pub(crate) enum MoveState { Pending, Moved, MovedBack }`
  - `pub(crate) struct Journal { pub status: &'static str, pub phase: &'static str, pub from: String, pub to: String, pub date: String, pub moves: Vec<(String, String, MoveState)> }` with `Journal::new(from: &str, to: &str, date: &str, moves: &[Move]) -> Journal` (status `in-progress`, phase `moving`, every move pending), `render(&self) -> String`, `write(&self, archive: &Path) -> Result<(), String>`.
  - `pub(crate) fn front_matter(text: &str) -> Option<HashMap<String, String>>`
  - `pub struct PendingSwitch { pub archive: String, pub status: String, pub phase: String, pub from: String, pub to: String, pub date: String }` (serde, camelCase; `archive` is project-relative).
  - `pub(crate) fn pending(root: &Path) -> Vec<PendingSwitch>`
  - Tauri command `bmad_switch_pending(root: String) -> Vec<PendingSwitch>`
  - test helpers in its `tests` module: `fn temp() -> PathBuf`, `fn write(root: &Path, rel: &str, body: &str)`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/bmadswitch.rs`:

```rust
//! Switching a project's BMAD version. The old version's files move into
//! `.ade/archive/bmad-<from>-<date>/` inside the project, then the other
//! version is set up fresh. Nothing is deleted.
//!
//! `ARCHIVE.md` in the archive is the journal. It is written before the first
//! move, so a switch that was interrupted can be finished by hand, and its
//! front matter is how ADE knows one didn't finish.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn temp() -> PathBuf {
        // A counter, not the clock: parallel tests drew the same folder.
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!(
            "ade-switch-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    pub(super) fn write(root: &Path, rel: &str, body: &str) {
        let path = at(root, rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn two_moves() -> Vec<Move> {
        let archive = format!("{ARCHIVE_DIR}/bmad-v4-2026-10-11");
        vec![
            Move { from: ".bmad-core".into(), to: format!("{archive}/.bmad-core"), files: 2, ignored: "none".into() },
            Move { from: ".ade/stage".into(), to: format!("{archive}/.ade/stage"), files: 1, ignored: "none".into() },
        ]
    }

    #[test]
    fn at_joins_a_project_relative_path() {
        assert_eq!(at(Path::new("/p"), ".claude/agents/qa.md"), Path::new("/p").join(".claude").join("agents").join("qa.md"));
        assert_eq!(at(Path::new("/p"), ""), Path::new("/p"));
    }

    #[test]
    fn the_journal_opens_with_front_matter_a_machine_can_read() {
        let journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        let text = journal.render();
        assert!(text.starts_with("---\nstatus: in-progress\nphase: moving\nfrom: v4\nto: v6\ndate: 2026-10-11\n---\n"), "{text}");
        let fm = front_matter(&text).unwrap();
        assert_eq!(fm["status"], "in-progress");
        assert_eq!(fm["phase"], "moving");
        assert_eq!(fm["from"], "v4");
        assert_eq!(fm["to"], "v6");
        assert_eq!(fm["date"], "2026-10-11");
    }

    #[test]
    fn the_journal_lists_each_move_with_its_state_and_both_ways_out() {
        let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        journal.moves[0].2 = MoveState::Moved;
        let text = journal.render();
        assert!(text.contains("- `.bmad-core` → `.ade/archive/bmad-v4-2026-10-11/.bmad-core`: moved\n"), "{text}");
        assert!(text.contains("- `.ade/stage` → `.ade/archive/bmad-v4-2026-10-11/.ade/stage`: pending\n"), "{text}");
        journal.moves[0].2 = MoveState::MovedBack;
        assert!(journal.render().contains(".bmad-core`: moved back\n"));
        assert!(text.contains("## To go back to BMAD v4"), "{text}");
        assert!(text.contains("**BMAD: Switch to v4…**"), "{text}");
        assert!(text.contains("`git add -A`"), "{text}");
        assert!(text.contains("## To finish an interrupted switch by hand"), "{text}");
        assert!(text.contains("`status: abandoned`"), "{text}");
    }

    #[test]
    fn front_matter_needs_an_opening_and_a_closing_line() {
        assert!(front_matter("status: complete\n").is_none());
        assert!(front_matter("---\nstatus: complete\n").is_none(), "never closed");
        assert_eq!(front_matter("---\r\nstatus:  abandoned \r\n---\r\n").unwrap()["status"], "abandoned");
    }

    #[test]
    fn pending_finds_in_progress_and_incomplete_only() {
        let dir = temp();
        for (name, status) in [("a", "in-progress"), ("b", "incomplete"), ("c", "complete"), ("d", "abandoned")] {
            let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
            journal.status = status;
            let archive = at(&dir, &format!("{ARCHIVE_DIR}/bmad-v4-{name}"));
            std::fs::create_dir_all(&archive).unwrap();
            journal.write(&archive).unwrap();
        }
        let found = pending(&dir);
        assert_eq!(
            found.iter().map(|p| (p.archive.as_str(), p.status.as_str())).collect::<Vec<_>>(),
            [(".ade/archive/bmad-v4-a", "in-progress"), (".ade/archive/bmad-v4-b", "incomplete")]
        );
        assert_eq!(found[0].from, "v4");
        assert_eq!(found[0].to, "v6");
        assert_eq!(found[0].phase, "moving");
        assert_eq!(found[0].date, "2026-10-11");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_folder_with_no_readable_journal_is_not_pending() {
        let dir = temp();
        assert!(pending(&dir).is_empty(), "no archive folder at all");
        std::fs::create_dir_all(at(&dir, ".ade/archive/empty")).unwrap();
        write(&dir, ".ade/archive/notes/ARCHIVE.md", "my own notes, no front matter\n");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }
}
```

In `src-tauri/src/lib.rs`, add after `mod bmadconfig;`:

```rust
mod bmadswitch;
```

- [ ] **Step 2: Run them**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadswitch`
Expected: FAIL to compile with "cannot find function `at` in this scope".

- [ ] **Step 3: Implement the journal and `pending`**

In `src-tauri/src/bmadswitch.rs`, between the `use` lines and the tests:

```rust
/// Where archives live, project-relative.
pub(crate) const ARCHIVE_DIR: &str = ".ade/archive";
/// The journal inside each archive.
pub(crate) const JOURNAL: &str = "ARCHIVE.md";

/// A project-relative, `/`-separated path, under `root`.
pub(crate) fn at(root: &Path, rel: &str) -> PathBuf {
    rel.split('/').filter(|s| !s.is_empty()).fold(root.to_path_buf(), |p, s| p.join(s))
}

/// One path a switch moves. Both ends are project-relative and `/`-separated.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Move {
    pub from: String,
    pub to: String,
    pub files: u32,
    /// What git ignores of it today: "none", "some" or "all".
    pub ignored: String,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum MoveState {
    Pending,
    Moved,
    MovedBack,
}

impl MoveState {
    fn label(self) -> &'static str {
        match self {
            MoveState::Pending => "pending",
            MoveState::Moved => "moved",
            MoveState::MovedBack => "moved back",
        }
    }
}

/// `ARCHIVE.md`: what a switch set out to do and how far it got.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Journal {
    /// in-progress | complete | incomplete | abandoned
    pub status: &'static str,
    /// moving | setup | rules | done
    pub phase: &'static str,
    pub from: String,
    pub to: String,
    pub date: String,
    /// (from, to, state), in the order they are moved.
    pub moves: Vec<(String, String, MoveState)>,
}

impl Journal {
    pub(crate) fn new(from: &str, to: &str, date: &str, moves: &[Move]) -> Self {
        Journal {
            status: "in-progress",
            phase: "moving",
            from: from.to_string(),
            to: to.to_string(),
            date: date.to_string(),
            moves: moves.iter().map(|m| (m.from.clone(), m.to.clone(), MoveState::Pending)).collect(),
        }
    }

    pub(crate) fn render(&self) -> String {
        let (old, new, date) = (&self.from, &self.to, &self.date);
        let mut out = format!(
            "---\nstatus: {}\nphase: {}\nfrom: {old}\nto: {new}\ndate: {date}\n---\n\n\
             # BMAD {old}, archived on {date}\n\n\
             ADE moved this project's BMAD {old} files here when it switched the project to BMAD {new}.\n\
             This folder is read-only history. Paths inside it mirror the project.\n\n\
             ## Moves\n\n",
            self.status, self.phase
        );
        for (src, dst, state) in &self.moves {
            out.push_str(&format!("- `{src}` → `{dst}`: {}\n", state.label()));
        }
        if self.moves.is_empty() {
            out.push_str("Nothing was moved.\n");
        }
        out.push_str(&format!(
            "\n## To go back to BMAD {old}\n\n\
             1. Run **BMAD: Switch to {old}…** from the command palette. It archives BMAD {new} the same way.\n\
             2. Move the paths in this archive back to their places, replacing the fresh role files in `.claude/agents/` and `.ade/methodology`.\n\
             3. Run `git add -A`. Git usually shows tracked files as renames.\n\n\
             ## To finish an interrupted switch by hand\n\n\
             While `status` above is `in-progress` or `incomplete`, ADE neither sets this project up nor switches it.\n\n\
             1. Move each path marked *moved* back to its place.\n\
             2. Set `status: abandoned` above.\n"
        ));
        out
    }

    pub(crate) fn write(&self, archive: &Path) -> Result<(), String> {
        let path = archive.join(JOURNAL);
        crate::state::atomic_write(&path, &self.render()).map_err(|e| format!("{}: {e}", path.display()))
    }
}

/// The `key: value` lines between a file's opening `---` and the next one.
pub(crate) fn front_matter(text: &str) -> Option<HashMap<String, String>> {
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    let mut out = HashMap::new();
    for line in lines {
        if line.trim_end() == "---" {
            return Some(out);
        }
        if let Some((key, value)) = line.split_once(':') {
            out.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    None
}

/// A switch that started and didn't finish.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingSwitch {
    /// The archive folder, project-relative.
    pub archive: String,
    pub status: String,
    pub phase: String,
    pub from: String,
    pub to: String,
    pub date: String,
}

/// The switches in `.ade/archive/` whose journal says `in-progress` or
/// `incomplete`. After a crash the project may have neither version on disk,
/// so these block both another switch and setup.
pub(crate) fn pending(root: &Path) -> Vec<PendingSwitch> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(at(root, ARCHIVE_DIR)) else { return out };
    for entry in entries.flatten() {
        let Ok(text) = std::fs::read_to_string(entry.path().join(JOURNAL)) else { continue };
        let Some(fm) = front_matter(&text) else { continue };
        let get = |key: &str| fm.get(key).cloned().unwrap_or_default();
        let status = get("status");
        if status != "in-progress" && status != "incomplete" {
            continue;
        }
        out.push(PendingSwitch {
            archive: format!("{ARCHIVE_DIR}/{}", entry.file_name().to_string_lossy()),
            status,
            phase: get("phase"),
            from: get("from"),
            to: get("to"),
            date: get("date"),
        });
    }
    out.sort_by(|a, b| a.archive.cmp(&b.archive));
    out
}

/// The one way the frontend reads the archive: which switches didn't finish.
#[tauri::command(async)]
pub fn bmad_switch_pending(root: String) -> Vec<PendingSwitch> {
    pending(Path::new(&root))
}
```

In `src-tauri/src/lib.rs`, register the command after `bmad::bmad_status,` (line 445):

```rust
            bmadswitch::bmad_switch_pending,
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadswitch`
Expected: PASS (6 tests). `Deserialize` and `Move`'s fields are unused until Task 5; a warning for that is expected.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bmadswitch.rs src-tauri/src/lib.rs
git commit -m "feat(switch): the ARCHIVE.md journal and bmad_switch_pending"
```

---

### Task 5: `bmad_switch_plan`, the dry run

**Files:**
- Modify: `src-tauri/src/bmadswitch.rs` (add the plan above the tests; append tests)
- Modify: `src-tauri/src/projectsetup.rs:62` (`project` becomes `pub(crate)`)
- Modify: `src-tauri/src/lib.rs` (register `bmad_switch_plan`)
- Test: `scripts/switchFixtures.test.ts` (append the role-name parity test)

**Interfaces:**
- Consumes: `crate::bmadconfig::{parse_core_config, load_central_config, output_folder, V4Paths}` (Task 3); `crate::git::{run, code, GIT}` (Task 2); `pending`, `at`, `Move`, `ARCHIVE_DIR`, `JOURNAL` (Task 4); `crate::bmadv6::{detect_on_disk, Methodology, resource_root}`; `crate::bmad::resource_root`.
- Produces (`crate::bmadswitch`):
  - `pub(crate) const CORE_ROLES: [&str; 8]`
  - `pub struct Document { pub path: String, pub files: u32, pub ticked: bool, pub warning: Option<String> }`, `pub struct Note { pub path: String, pub reason: String }` (serde, camelCase)
  - `pub struct SwitchPlan { pub from: String, pub to: String, pub archive: String, pub moves: Vec<Move>, pub documents: Vec<Document>, pub leftovers: Vec<Move>, pub left_in_place: Vec<Note>, pub dirty: Option<bool>, pub archive_ignored: Option<bool>, pub blocked: Option<String> }` (serde both ways, camelCase: `leftInPlace`, `archiveIgnored`)
  - `pub(crate) struct Env { pub git: &'static str, pub v4_src: Option<PathBuf>, pub v6_src: Option<PathBuf>, pub today: String, pub device: fn(&Path) -> Option<u64> }` (Task 7 adds two fields)
  - `pub(crate) fn plan(root: &Path, to: Methodology, ticked: &[String], env: &Env) -> SwitchPlan`
  - `pub(crate) fn plan_into(root: &Path, to: Methodology, ticked: &[String], env: &Env, archive: Option<&str>) -> SwitchPlan`: the same, with the archive's name given instead of chosen.
  - `pub(crate) fn present(path: &Path) -> bool` (exists, a dangling link included), `pub(crate) fn today() -> String`, `pub(crate) fn civil_date(days: i64) -> String`, `pub(crate) fn device_of(path: &Path) -> Option<u64>`
  - `fn target(to: &str) -> Result<Methodology, String>` and `fn env(app: &tauri::AppHandle) -> Env` (private; Task 7 uses both)
  - Tauri command `bmad_switch_plan(app, root: String, to: String, documents: Vec<String>) -> Result<SwitchPlan, String>`
  - test helpers: `fn v4_src() -> PathBuf`, `fn v6_src() -> PathBuf`, `fn env() -> Env`, `fn v4_project() -> PathBuf`, `fn v4_project_in(dir: &Path)`, `fn v6_project() -> PathBuf`, `fn sources(moves: &[Move]) -> Vec<&str>`.
- Produces (`crate::projectsetup`): `pub(crate) fn project(root: &str) -> Result<PathBuf, String>`.

- [ ] **Step 1: Write the failing tests**

Append to the `tests` module of `src-tauri/src/bmadswitch.rs`:

```rust
    use crate::bmadv6::Methodology::{V4, V6};
    use std::sync::OnceLock;

    /// A miniature of the bundled v4 resource root, shared by every test.
    pub(super) fn v4_src() -> PathBuf {
        static SRC: OnceLock<PathBuf> = OnceLock::new();
        SRC.get_or_init(|| {
            let src = temp();
            write(&src, "bmad-core/core-config.yaml", "devStoryLocation: docs/stories\n");
            write(&src, "bmad-core/tasks/a.md", "a");
            write(&src, "claude-commands/BMad/tasks/x.md", "x");
            write(&src, "VERSION", "v4.1\n");
            src
        })
        .clone()
    }

    /// A miniature of the bundled v6 resource root: two skills and the runtime.
    pub(super) fn v6_src() -> PathBuf {
        static SRC: OnceLock<PathBuf> = OnceLock::new();
        SRC.get_or_init(|| {
            let src = temp();
            write(&src, "skills/bmad/SKILL.md", "bmad skill");
            write(&src, "skills/bmad-prd/SKILL.md", "prd skill");
            write(&src, "ade-runtime.mjs", "// runtime");
            src
        })
        .clone()
    }

    fn one_device(_: &Path) -> Option<u64> {
        Some(1)
    }

    /// No git (the name doesn't exist), both versions' resources, a fixed day.
    pub(super) fn env() -> Env {
        Env { git: "ade-no-such-git", v4_src: Some(v4_src()), v6_src: Some(v6_src()), today: "2026-10-11".into(), device: one_device }
    }

    pub(super) fn v4_project_in(dir: &Path) {
        write(
            dir,
            ".bmad-core/core-config.yaml",
            "prd:\n  prdFile: docs/prd.md\n  prdShardedLocation: docs/prd\narchitecture:\n  architectureFile: docs/architecture.md\n  architectureShardedLocation: docs/architecture\ndevStoryLocation: docs/stories\nqa:\n  qaLocation: docs/qa\ndevDebugLog: .ai/debug-log.md\n",
        );
        write(dir, ".bmad-core/tasks/a.md", "a");
        write(dir, ".claude/commands/BMad/tasks/x.md", "x");
        write(dir, ".ai/debug-log.md", "log");
        write(dir, ".ade/stage", "build");
        write(dir, ".ade/methodology", "v4\n");
        write(dir, ".ade/rules.md", "old rules\n");
        write(dir, ".claude/agents/qa.md", "edited qa");
        write(dir, ".claude/agents/mine.md", "my agent");
        write(dir, "docs/prd.md", "prd");
        write(dir, "docs/architecture.md", "arch");
        write(dir, "docs/stories/1.1.md", "story");
        write(dir, "CLAUDE.md", "# Mine\n");
    }

    pub(super) fn v4_project() -> PathBuf {
        let dir = temp();
        v4_project_in(&dir);
        dir
    }

    pub(super) fn v6_project() -> PathBuf {
        let dir = temp();
        write(&dir, ".ade/methodology", "v6\n");
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \"{project-root}/_bmad-output\"\n");
        write(&dir, "_bmad/ade-runtime.mjs", "// runtime");
        write(&dir, "_bmad-output/shop/1.md", "ticket");
        write(&dir, ".claude/skills/bmad/SKILL.md", "bmad skill");
        write(&dir, ".claude/skills/mine/SKILL.md", "my skill");
        write(&dir, ".ade/gates/1.yml", "gate");
        write(&dir, ".ade/approvals/1", "ok");
        write(&dir, ".ade/rules.md", "old rules\n");
        write(&dir, ".claude/agents/qa.md", "qa for v6");
        write(&dir, ".claude/agents/mine.md", "my agent");
        write(&dir, "docs/prd.md", "prd");
        write(&dir, "CLAUDE.md", "# Mine\n");
        dir
    }

    pub(super) fn sources(moves: &[Move]) -> Vec<&str> {
        moves.iter().map(|m| m.from.as_str()).collect()
    }

    const ARCHIVE: &str = ".ade/archive/bmad-v4-2026-10-11";

    #[test]
    fn the_plan_for_v4_to_v6() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!((plan.from.as_str(), plan.to.as_str(), plan.archive.as_str()), ("v4", "v6", ARCHIVE));
        assert_eq!(
            sources(&plan.moves),
            [".bmad-core", ".claude/commands/BMad", ".ai/debug-log.md", ".ade/stage", ".ade/methodology", ".claude/agents/qa.md"],
            "the engine, the commands, the debug log, the stage, the marker and the role file, edited or not"
        );
        assert_eq!(plan.moves[0], Move { from: ".bmad-core".into(), to: format!("{ARCHIVE}/.bmad-core"), files: 2, ignored: "none".into() });
        assert_eq!(plan.moves[5].to, format!("{ARCHIVE}/.claude/agents/qa.md"));
        assert!(plan.leftovers.is_empty() && plan.left_in_place.is_empty());
        // Documents stay: offered, unticked, and not among the moves.
        assert_eq!(plan.documents.iter().map(|d| d.path.as_str()).collect::<Vec<_>>(), ["docs/prd.md", "docs/architecture.md", "docs/stories"]);
        assert!(plan.documents.iter().all(|d| !d.ticked));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn ticked_documents_move_and_carry_the_warning() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &["docs/prd.md".into(), "docs/stories".into()], &env());
        assert_eq!(plan.blocked, None);
        assert!(sources(&plan.moves).ends_with(&["docs/prd.md", "docs/stories"]), "{:?}", sources(&plan.moves));
        assert_eq!(plan.moves.last().unwrap().to, format!("{ARCHIVE}/docs/stories"));
        let doc = |path: &str| plan.documents.iter().find(|d| d.path == path).unwrap();
        assert!(doc("docs/prd.md").ticked && doc("docs/stories").ticked && !doc("docs/architecture.md").ticked);
        assert_eq!(doc("docs/prd.md").warning.as_deref(), Some("ADE's rules use this file (the PRD). The new version starts without it."));
        assert_eq!(
            doc("docs/architecture.md").warning.as_deref(),
            Some("ADE's rules use this file (the verification command). The new version starts without it.")
        );
        assert_eq!(doc("docs/stories").warning, None);
        assert_eq!(doc("docs/stories").files, 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_path_that_was_not_offered_never_moves() {
        let dir = v4_project();
        write(&dir, "src/main.rs", "fn main() {}");
        let plan = plan(&dir, V6, &["src".into(), "docs".into(), "CLAUDE.md".into(), "../elsewhere".into()], &env());
        assert_eq!(sources(&plan.moves).len(), 6, "{:?}", sources(&plan.moves));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn docs_itself_and_the_parent_of_another_location_are_not_offered() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "qa:\n  qaLocation: docs\ndevStoryLocation: work\nprd:\n  prdFile: work/prd.md\n");
        write(&dir, "work/prd.md", "prd");
        write(&dir, "work/1.1.md", "story");
        let plan = plan(&dir, V6, &["docs".into(), "work".into()], &env());
        let offered: Vec<&str> = plan.documents.iter().map(|d| d.path.as_str()).collect();
        assert!(!offered.contains(&"docs"), "{offered:?}");
        assert!(!offered.contains(&"work"), "work holds work/prd.md: {offered:?}");
        assert!(offered.contains(&"work/prd.md"), "{offered:?}");
        assert!(!sources(&plan.moves).contains(&"docs") && !sources(&plan.moves).contains(&"work"));
        assert_eq!(plan.blocked, None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_plan_for_v6_to_v4() {
        let dir = v6_project();
        let plan = plan(&dir, V4, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(plan.archive, ".ade/archive/bmad-v6-2026-10-11");
        assert_eq!(
            sources(&plan.moves),
            ["_bmad", "_bmad-output", ".claude/skills/bmad", ".ade/approvals", ".ade/gates", ".ade/methodology", ".claude/agents/qa.md"],
            "a user's own skill and agent stay; the absolute output folder under the root is project-relative"
        );
        assert!(plan.documents.is_empty(), "documents are offered for v4 → v6 only");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_output_folder_comes_from_the_merged_config() {
        let dir = v6_project();
        write(&dir, "_bmad/custom/config.toml", "[core]\noutput_folder = \"docs/out\"\n");
        write(&dir, "_bmad/custom/config.user.toml", "[core]\noutput_folder = \"{project-root}/work/out\"\n");
        write(&dir, "work/out/1.md", "ticket");
        let plan = plan(&dir, V4, &[], &env());
        assert!(sources(&plan.moves).contains(&"work/out"), "{:?}", sources(&plan.moves));
        assert!(!sources(&plan.moves).contains(&"_bmad-output"), "the default folder is no longer the configured one");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_skill_is_ades_by_its_name_whatever_the_case() {
        let dir = v6_project();
        std::fs::rename(dir.join(".claude/skills/bmad"), dir.join(".claude/skills/BMAD-PRD")).unwrap();
        let plan = plan(&dir, V4, &[], &env());
        assert!(sources(&plan.moves).contains(&".claude/skills/BMAD-PRD"), "{:?}", sources(&plan.moves));
        assert!(!sources(&plan.moves).contains(&".claude/skills/mine"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn locations_outside_the_project_are_left_in_place_not_blocked() {
        let outside = temp();
        write(&outside, "debug.md", "log");
        write(&outside, "qa/gate.yml", "gate");
        write(&outside, "out/1.md", "ticket");
        let slash = |p: PathBuf| p.to_string_lossy().replace('\\', "/");

        let v4 = v4_project();
        write(
            &v4,
            ".bmad-core/core-config.yaml",
            &format!("devDebugLog: {}\nqa:\n  qaLocation: {}\n", slash(outside.join("debug.md")), slash(outside.join("qa"))),
        );
        let plan4 = plan(&v4, V6, &[], &env());
        assert_eq!(plan4.blocked, None);
        let noted: Vec<&str> = plan4.left_in_place.iter().map(|n| n.path.as_str()).collect();
        assert!(noted.iter().any(|p| p.ends_with("debug.md")), "{noted:?}");
        assert!(noted.iter().any(|p| p.ends_with("qa")), "{noted:?}");
        assert!(plan4.left_in_place.iter().all(|n| n.reason.contains("outside the project")));
        assert!(!sources(&plan4.moves).iter().any(|p| p.contains("debug")), "never moved");
        assert!(!plan4.documents.iter().any(|d| d.path.ends_with("qa")), "a document outside the project is not offered");

        let v6 = v6_project();
        write(&v6, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{}\"\n", slash(outside.join("out"))));
        let plan6 = plan(&v6, V4, &[], &env());
        assert_eq!(plan6.blocked, None);
        assert_eq!(plan6.left_in_place.len(), 1);
        assert!(plan6.left_in_place[0].path.ends_with("out"));
        for dir in [outside, v4, v6] {
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn blocked_without_bmad_or_when_already_on_the_version() {
        let empty = temp();
        let none = plan(&empty, V6, &[], &env());
        assert_eq!(none.from, "");
        assert!(none.blocked.as_deref().unwrap().contains("no BMAD"), "{:?}", none.blocked);
        assert!(none.moves.is_empty());
        let dir = v4_project();
        assert!(plan(&dir, V4, &[], &env()).blocked.as_deref().unwrap().contains("already on BMAD v4"));
        std::fs::remove_dir_all(empty).ok();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_either_versions_resources_are_missing() {
        let dir = v4_project();
        let blocked = |e: Env| plan(&dir, V6, &[], &e).blocked.unwrap_or_default();
        assert!(blocked(Env { v6_src: None, ..env() }).contains("v6"), "the target's, to install");
        assert!(blocked(Env { v4_src: None, ..env() }).contains("v4"), "the current one's too");
        // A resource root that resolves to a folder with nothing in it is no better.
        assert!(blocked(Env { v6_src: Some(temp()), ..env() }).contains("v6"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_a_config_layer_cannot_be_parsed() {
        let dir = v6_project();
        write(&dir, "_bmad/custom/config.toml", "not = [toml");
        let blocked = plan(&dir, V4, &[], &env()).blocked.unwrap();
        assert!(blocked.contains("_bmad/custom/config.toml"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_a_moved_path_is_the_root_in_git_or_under_the_archive() {
        for (configured, needle) in [("{project-root}", "project folder itself"), (".git/out", "git"), (".ade/archive/old", ".ade/archive"), (".ade", ".ade/archive")] {
            let dir = v6_project();
            write(&dir, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{configured}\"\n"));
            write(&dir, ".git/out/1.md", "x");
            write(&dir, ".ade/archive/old/1.md", "x");
            let blocked = plan(&dir, V4, &[], &env()).blocked.unwrap_or_default();
            assert!(blocked.contains(needle), "{configured}: {blocked}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[cfg(unix)]
    #[test]
    fn blocked_when_a_parent_leaves_the_project_through_a_link() {
        let dir = v4_project();
        let outside = temp();
        write(&outside, "debug.md", "log");
        std::os::unix::fs::symlink(&outside, dir.join("logs")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: logs/debug.md\n");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert!(blocked.contains("logs/debug.md") && blocked.contains("link"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_project_under_a_linked_path_is_not_blocked() {
        let real = temp();
        v4_project_in(&real.join("shop"));
        let links = temp();
        std::os::unix::fs::symlink(&real, links.join("code")).unwrap();
        let plan = plan(&links.join("code").join("shop"), V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(sources(&plan.moves).len(), 6);
        std::fs::remove_dir_all(real).ok();
        std::fs::remove_dir_all(links).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_folder_is_planned_as_the_link() {
        let dir = v4_project();
        let outside = temp();
        write(&outside, "a.md", "a");
        write(&outside, "b.md", "b");
        std::fs::remove_dir_all(dir.join(".claude/commands/BMad")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join(".claude/commands/BMad")).unwrap();
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        let link = plan.moves.iter().find(|m| m.from == ".claude/commands/BMad").unwrap();
        assert_eq!(link.files, 1, "the link itself, not the two files behind it");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    #[test]
    fn a_location_nested_in_another_move_is_dropped() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: .bmad-core/debug.md\nqa:\n  qaLocation: .bmad-core/qa\n");
        write(&dir, ".bmad-core/debug.md", "log");
        write(&dir, ".bmad-core/qa/gate.yml", "gate");
        let plan = plan(&dir, V6, &[], &env());
        assert!(!sources(&plan.moves).contains(&".bmad-core/debug.md"), "{:?}", sources(&plan.moves));
        assert!(!plan.documents.iter().any(|d| d.path == ".bmad-core/qa"), "it goes with the engine");
        std::fs::remove_dir_all(dir).ok();
    }

    fn two_devices(path: &Path) -> Option<u64> {
        Some(if path.ends_with("debug-log.md") { 2 } else { 1 })
    }

    #[test]
    fn blocked_when_a_source_is_on_another_device() {
        let dir = v4_project();
        let blocked = plan(&dir, V6, &[], &Env { device: two_devices, ..env() }).blocked.unwrap();
        assert!(blocked.contains(".ai/debug-log.md") && blocked.contains("another volume"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_while_an_earlier_switch_is_pending() {
        let dir = v4_project();
        let archive = at(&dir, ".ade/archive/bmad-v6-2026-10-01");
        std::fs::create_dir_all(&archive).unwrap();
        Journal::new("v6", "v4", "2026-10-01", &[]).write(&archive).unwrap();
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert!(blocked.contains("didn't finish") && blocked.contains(".ade/archive/bmad-v6-2026-10-01/ARCHIVE.md"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn leftovers_of_the_target_version_go_to_their_own_folder() {
        let dir = v4_project();
        write(&dir, "_bmad/config.toml", "[core]\n");
        write(&dir, ".claude/skills/bmad/SKILL.md", "old skill");
        write(&dir, ".claude/skills/mine/SKILL.md", "my skill");
        let to_v6 = plan(&dir, V6, &[], &env());
        assert_eq!(sources(&to_v6.leftovers), ["_bmad", ".claude/skills/bmad"]);
        assert_eq!(to_v6.leftovers[0].to, format!("{ARCHIVE}/leftovers-v6/_bmad"));
        assert_eq!(to_v6.blocked, None);

        let other = v6_project();
        write(&other, ".bmad-core/tasks/a.md", "a");
        write(&other, ".claude/commands/BMad/x.md", "x");
        let to_v4 = plan(&other, V4, &[], &env());
        assert_eq!(sources(&to_v4.leftovers), [".bmad-core", ".claude/commands/BMad"]);
        assert_eq!(to_v4.leftovers[1].to, ".ade/archive/bmad-v6-2026-10-11/leftovers-v4/.claude/commands/BMad");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(other).ok();
    }

    #[test]
    fn a_taken_archive_name_gets_a_number() {
        let dir = v4_project();
        std::fs::create_dir_all(at(&dir, ARCHIVE)).unwrap();
        assert_eq!(plan(&dir, V6, &[], &env()).archive, format!("{ARCHIVE}-2"));
        std::fs::create_dir_all(at(&dir, &format!("{ARCHIVE}-2"))).unwrap();
        assert_eq!(plan(&dir, V6, &[], &env()).archive, format!("{ARCHIVE}-3"));
        // Given a name, the plan uses it as it is.
        assert_eq!(plan_into(&dir, V6, &[], &env(), Some(".ade/archive/bmad-v4-2026-10-10")).archive, ".ade/archive/bmad-v4-2026-10-10");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn without_git_the_git_facts_are_unknown() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!((plan.dirty, plan.archive_ignored), (None, None));
        assert!(plan.moves.iter().all(|m| m.ignored == "none"));
        assert_eq!(plan.blocked, None, "git is never needed to switch");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn with_git_the_plan_says_what_is_dirty_and_what_is_ignored() {
        let dir = v6_project();
        let git = |args: &[&str]| assert!(crate::git::run(crate::git::GIT, &dir, args).is_some(), "git {args:?}");
        git(&["init", "-q"]);
        write(&dir, ".gitignore", "/_bmad-output/\n*.user.toml\n");
        write(&dir, "_bmad/custom/config.user.toml", "[core]\n");
        let real = Env { git: crate::git::GIT, ..env() };
        let first = plan(&dir, V4, &[], &real);
        let ignored = |from: &str| first.moves.iter().find(|m| m.from == from).unwrap().ignored.clone();
        assert_eq!(first.dirty, Some(true), "everything is untracked");
        assert_eq!(ignored("_bmad-output"), "all");
        assert_eq!(ignored("_bmad"), "some", "one ignored file inside");
        assert_eq!(ignored(".ade/gates"), "none");
        assert_eq!(first.archive_ignored, Some(false));

        write(&dir, ".gitignore", "/_bmad-output/\n*.user.toml\n/.ade/\n");
        assert_eq!(plan(&dir, V4, &[], &real).archive_ignored, Some(true));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn civil_dates() {
        assert_eq!(civil_date(0), "1970-01-01");
        assert_eq!(civil_date(19_782), "2024-02-29");
        assert_eq!(civil_date(20_737), "2026-10-11");
        assert_eq!(today().len(), 10);
    }
```

Append to `scripts/switchFixtures.test.ts`:

```ts
import { ROLES } from "../src/lib/projectMethodology";

describe("the core roles, as the switch knows them", () => {
  it("are the roles setup writes", () => {
    const rust = readFileSync(resolve(__dirname, "..", "src-tauri/src/bmadswitch.rs"), "utf8");
    const list = /const CORE_ROLES: \[&str; \d+\] = \[([^\]]*)\]/.exec(rust);
    expect(list, "CORE_ROLES not found in bmadswitch.rs").not.toBeNull();
    const names = [...list![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(ROLES.map((r) => r.name));
  });
});
```

Move that `import` line up beside the file's other imports.

- [ ] **Step 2: Run them**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadswitch`
Expected: FAIL to compile with "cannot find struct, variant or union type `Env` in this scope".

Run: `npx vitest run scripts/switchFixtures.test.ts`
Expected: FAIL, "CORE_ROLES not found in bmadswitch.rs".

- [ ] **Step 3: Make `project` crate-visible**

In `src-tauri/src/projectsetup.rs`, change line 62 from

```rust
fn project(root: &str) -> Result<PathBuf, String> {
```

to

```rust
pub(crate) fn project(root: &str) -> Result<PathBuf, String> {
```

- [ ] **Step 4: Implement the plan**

In `src-tauri/src/bmadswitch.rs`, change the imports at the top to

```rust
use crate::bmadconfig::V4Paths;
use crate::bmadv6::Methodology;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
```

and add, after `bmad_switch_pending` and before the tests:

```rust
/// The core roles' names: `ROLES` in src/lib/projectMethodology.ts, whose role
/// files setup writes as `.claude/agents/<name>.md`. The plan command gets no
/// file list, so it carries the names; scripts/switchFixtures.test.ts fails
/// when the two lists differ.
pub(crate) const CORE_ROLES: [&str; 8] = ["product-manager", "architect", "designer", "scrum-master", "developer", "qa", "devops", "adversarial-reviewer"];

/// Documents BMAD v4's own templates write, beside the configured locations.
const V4_TEMPLATE_OUTPUTS: [&str; 8] = [
    "docs/brief.md",
    "docs/project-brief.md",
    "docs/front-end-spec.md",
    "docs/ui-architecture.md",
    "docs/brownfield-architecture.md",
    "docs/market-research.md",
    "docs/competitor-analysis.md",
    "docs/brainstorming-session-results.md",
];

/// One of the person's documents, which stays unless they tick it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub files: u32,
    pub ticked: bool,
    /// What moving it would cost, for the two files ADE's rules name.
    pub warning: Option<String>,
}

/// Something the switch leaves where it is, and why.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub path: String,
    pub reason: String,
}

/// What a switch would do. The dialog shows it; apply checks it again.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchPlan {
    /// "v4" or "v6"; empty when the project has no BMAD.
    pub from: String,
    pub to: String,
    /// The archive folder, project-relative.
    pub archive: String,
    pub moves: Vec<Move>,
    /// v4 → v6 only.
    pub documents: Vec<Document>,
    pub leftovers: Vec<Move>,
    pub left_in_place: Vec<Note>,
    /// `None`: git is missing or failed.
    pub dirty: Option<bool>,
    pub archive_ignored: Option<bool>,
    /// Why the switch can't go ahead.
    pub blocked: Option<String>,
}

/// What a switch needs from outside the project. Tests swap each part.
pub(crate) struct Env {
    /// The git program. A name that doesn't exist is a machine without git.
    pub git: &'static str,
    /// Each version's bundled resources, when they resolve.
    pub v4_src: Option<PathBuf>,
    pub v6_src: Option<PathBuf>,
    /// Today, `YYYY-MM-DD`.
    pub today: String,
    /// The device a path is on, where that can be known.
    pub device: fn(&Path) -> Option<u64>,
}

/// Exists, a link that points nowhere included: a link is moved as the link.
pub(crate) fn present(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// Unix `st_dev`: a rename can't cross devices. Unknown elsewhere, where the
/// rename itself reports it.
pub(crate) fn device_of(path: &Path) -> Option<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        std::fs::symlink_metadata(path).ok().map(|m| m.dev())
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

/// Days since 1970-01-01 as `YYYY-MM-DD` (Howard Hinnant's algorithm, the
/// inverse of the one usage.rs reads dates with).
pub(crate) fn civil_date(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Today in UTC: the crate has no time-zone data, and the date only names a folder.
pub(crate) fn today() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    civil_date((secs / 86_400) as i64)
}

/// Files under `path`, links not followed: a link counts as the one thing it is.
fn count_files(path: &Path) -> u32 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if !meta.is_dir() {
        return 1;
    }
    std::fs::read_dir(path).map(|entries| entries.flatten().map(|e| count_files(&e.path())).sum()).unwrap_or(0)
}

/// `path` with `.` and `..` folded, without touching the disk: a configured
/// location need not exist.
fn lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Where a configured location is: project-relative, or its absolute path
/// when that is outside the project.
enum Located {
    Inside(String),
    Outside(String),
}

/// An absolute path under the root is project-relative: v6's own setup writes
/// `output_folder` as an absolute path.
fn locate(root: &Path, configured: &str) -> Located {
    let given = Path::new(configured.trim());
    let abs = lexical(&if given.is_absolute() { given.to_path_buf() } else { root.join(given) });
    match abs.strip_prefix(lexical(root)) {
        Ok(rel) => Located::Inside(rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/")),
        Err(_) => Located::Outside(abs.to_string_lossy().into_owned()),
    }
}

/// The project-relative path of a configured location. One outside the
/// project is never moved and never blocks: it is noted, when it exists.
fn inside(root: &Path, configured: &str, what: &str, notes: &mut Vec<Note>) -> Option<String> {
    match locate(root, configured) {
        Located::Inside(rel) => Some(rel),
        Located::Outside(abs) => {
            if present(Path::new(&abs)) && !notes.iter().any(|n| n.path == abs) {
                notes.push(Note { path: abs, reason: format!("{what} is outside the project, so it stays where it is.") });
            }
            None
        }
    }
}

/// `path` is inside `other`. Everything is inside the root (`""`).
fn nested(path: &str, other: &str) -> bool {
    if other.is_empty() {
        return !path.is_empty();
    }
    path.starts_with(&format!("{other}/"))
}

/// The v4 document locations the dialog may offer: the configured ones and
/// the template outputs, inside the project. Not `docs` itself, the root, or
/// a folder that holds another location: ticking one of those would take far
/// more than the document it names.
fn documents(root: &Path, paths: &V4Paths, notes: &mut Vec<Note>) -> Vec<String> {
    let configured = [
        &paths.prd_file,
        &paths.prd_sharded_location,
        &paths.architecture_file,
        &paths.architecture_sharded_location,
        &paths.dev_story_location,
        &paths.qa_location,
    ];
    let mut locations: Vec<String> = Vec::new();
    for location in configured.into_iter().map(String::as_str).chain(V4_TEMPLATE_OUTPUTS) {
        if let Some(rel) = inside(root, location, "This document location", notes) {
            if !locations.contains(&rel) {
                locations.push(rel);
            }
        }
    }
    locations
        .iter()
        .filter(|rel| !rel.is_empty() && rel.as_str() != "docs")
        .filter(|rel| !locations.iter().any(|other| nested(other, rel)))
        .filter(|rel| present(&at(root, rel)))
        .cloned()
        .collect()
}

fn warning(path: &str) -> Option<String> {
    let what = match path {
        "docs/prd.md" => "the PRD",
        "docs/architecture.md" => "the verification command",
        _ => return None,
    };
    Some(format!("ADE's rules use this file ({what}). The new version starts without it."))
}

/// The folders in `.claude/skills/` that ADE installed: those named like a
/// bundled v6 skill, whatever the case. A person's own skills stay.
fn bundled_skills(root: &Path, v6_src: &Path) -> Vec<String> {
    let bundled: std::collections::HashSet<String> = std::fs::read_dir(v6_src.join("skills"))
        .map(|entries| entries.flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().to_lowercase()).collect())
        .unwrap_or_default();
    let mut found: Vec<String> = std::fs::read_dir(at(root, ".claude/skills"))
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|name| bundled.contains(&name.to_lowercase()))
                .map(|name| format!(".claude/skills/{name}"))
                .collect()
        })
        .unwrap_or_default();
    found.sort();
    found
}

/// The first archive name not taken: `bmad-<from>-<date>`, then `-2`, `-3`.
fn free_archive(root: &Path, from: Methodology, today: &str) -> String {
    let base = format!("{ARCHIVE_DIR}/bmad-{}-{today}", from.as_str());
    if !present(&at(root, &base)) {
        return base;
    }
    (2..).map(|n| format!("{base}-{n}")).find(|name| !present(&at(root, name))).unwrap_or(base)
}

/// What git ignores of a path today. Once it moves, a rule like
/// `/_bmad-output/` no longer matches it, so the dialog says so. The trailing
/// `/` lets a directory-only rule match.
fn ignored_of(git: &str, root: &Path, rel: &str) -> &'static str {
    let is_dir = std::fs::symlink_metadata(at(root, rel)).map(|m| m.is_dir()).unwrap_or(false);
    let spec = if is_dir { format!("{rel}/") } else { rel.to_string() };
    match crate::git::code(git, root, &["check-ignore", "-q", "--", &spec]) {
        Some(0) => "all",
        Some(1) if is_dir => {
            let inside = crate::git::run(git, root, &["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "--", &spec]);
            if inside.is_some_and(|listed| !listed.trim().is_empty()) {
                "some"
            } else {
                "none"
            }
        }
        _ => "none",
    }
}

/// Why `rel` can't be moved, if it can't.
fn refuse(root: &Path, canonical_root: &Path, git_dir: &Path, rel: &str, archive_device: Option<u64>, env: &Env) -> Option<String> {
    if rel.is_empty() {
        return Some("A configured location is the project folder itself, which can't be moved.".to_string());
    }
    if rel == ARCHIVE_DIR || nested(rel, ARCHIVE_DIR) || nested(ARCHIVE_DIR, rel) {
        return Some(format!("{rel} holds or is inside {ARCHIVE_DIR}/, so it can't be moved there."));
    }
    let path = at(root, rel);
    // The path itself may be a link, which moves as the link. Its parent must
    // be a real folder of this project, with both sides resolved: a project is
    // often reached through a link itself (/tmp on macOS).
    let parent = path.parent().and_then(|p| std::fs::canonicalize(p).ok());
    let Some(parent) = parent.filter(|p| p.starts_with(canonical_root)) else {
        return Some(format!("{rel} is reached through a link that leaves the project."));
    };
    let real = parent.join(path.file_name().unwrap_or_default());
    if real.starts_with(git_dir) || git_dir.starts_with(&real) {
        return Some(format!("{rel} is part of git's own folder."));
    }
    if let (Some(here), Some(there)) = ((env.device)(&path), archive_device) {
        if here != there {
            return Some(format!("{rel} is on another volume than the archive, so it can't be moved there in one step."));
        }
    }
    None
}

/// What switching `root` to `to` would do. `ticked` is the documents the
/// person ticked; only ones the plan itself offers are taken.
pub(crate) fn plan(root: &Path, to: Methodology, ticked: &[String], env: &Env) -> SwitchPlan {
    plan_into(root, to, ticked, env, None)
}

/// plan(), into the archive folder given rather than the next free one: apply
/// uses the name the person saw, so a plan made before midnight still applies.
pub(crate) fn plan_into(root: &Path, to: Methodology, ticked: &[String], env: &Env, archive: Option<&str>) -> SwitchPlan {
    let from = crate::bmadv6::detect_on_disk(root);
    let mut plan = SwitchPlan {
        from: from.map(|m| m.as_str().to_string()).unwrap_or_default(),
        to: to.as_str().to_string(),
        archive: String::new(),
        moves: Vec::new(),
        documents: Vec::new(),
        leftovers: Vec::new(),
        left_in_place: Vec::new(),
        dirty: None,
        archive_ignored: None,
        blocked: None,
    };
    let Some(from) = from else {
        plan.blocked = Some("This project has no BMAD to switch from.".to_string());
        return plan;
    };
    if from == to {
        plan.blocked = Some(format!("This project is already on BMAD {}.", to.as_str()));
        return plan;
    }
    plan.archive = archive.map(str::to_string).unwrap_or_else(|| free_archive(root, from, &env.today));
    plan.dirty = crate::git::run(env.git, root, &["status", "--porcelain", "--", "."]).map(|out| !out.trim().is_empty());
    plan.archive_ignored = match crate::git::code(env.git, root, &["check-ignore", "-q", "--", ".ade/archive/"]) {
        Some(0) => Some(true),
        Some(1) => Some(false),
        _ => None,
    };

    // The first reason is the one shown; the rest of the plan is still filled
    // in, so the dialog shows what would move beside why it can't.
    let mut blocked: Option<String> = None;
    let mut block = |why: String| {
        if blocked.is_none() {
            blocked = Some(why);
        }
    };
    // Both versions' resources: the target's to install, the current one's to
    // know which skills are ADE's.
    if !env.v4_src.as_deref().is_some_and(|src| src.join("bmad-core").is_dir()) {
        block("ADE's bundled BMAD v4 files weren't found, so it can't switch.".to_string());
    }
    if !env.v6_src.as_deref().is_some_and(|src| src.join("skills").is_dir()) {
        block("ADE's bundled BMAD v6 files weren't found, so it can't switch.".to_string());
    }
    if let Some(earlier) = pending(root).first() {
        block(format!("An earlier switch here didn't finish. See {}/{JOURNAL}.", earlier.archive));
    }

    let mut moves: Vec<String> = Vec::new();
    let mut leftovers: Vec<String> = Vec::new();
    let mut notes: Vec<Note> = Vec::new();
    let mut offered: Vec<String> = Vec::new();
    let v6_skills = env.v6_src.as_deref().map(|src| bundled_skills(root, src)).unwrap_or_default();
    match from {
        Methodology::V4 => {
            let config = std::fs::read_to_string(at(root, ".bmad-core/core-config.yaml")).ok();
            let paths = crate::bmadconfig::parse_core_config(config.as_deref());
            moves.extend([".bmad-core".to_string(), ".claude/commands/BMad".to_string()]);
            if let Some(rel) = inside(root, &paths.dev_debug_log, "The debug log", &mut notes) {
                moves.push(rel);
            }
            moves.push(".ade/stage".to_string());
            offered = documents(root, &paths, &mut notes);
            leftovers.push("_bmad".to_string());
            leftovers.extend(v6_skills);
        }
        Methodology::V6 => {
            moves.push("_bmad".to_string());
            match crate::bmadconfig::load_central_config(root) {
                Ok(config) => {
                    let configured = crate::bmadconfig::output_folder(root, &config);
                    if let Some(rel) = inside(root, &configured, "The output folder", &mut notes) {
                        moves.push(rel);
                    }
                }
                Err(why) => block(why),
            }
            moves.extend(v6_skills);
            moves.extend([".ade/approvals".to_string(), ".ade/gates".to_string()]);
            leftovers.extend([".bmad-core".to_string(), ".claude/commands/BMad".to_string()]);
        }
    }
    // Both directions: the marker, and the role files ADE writes, edited or
    // not. Agents the person added have other names and stay.
    moves.push(".ade/methodology".to_string());
    moves.extend(CORE_ROLES.iter().map(|role| format!(".claude/agents/{role}.md")));

    // Only paths that exist, each once.
    let existing = |paths: Vec<String>| {
        let mut out: Vec<String> = Vec::new();
        for path in paths {
            if !out.contains(&path) && present(&at(root, &path)) {
                out.push(path);
            }
        }
        out
    };
    let mut moves = existing(moves);
    let leftovers = existing(leftovers);
    // A document that goes with a move anyway isn't one to offer.
    offered.retain(|doc| !moves.iter().chain(&leftovers).any(|other| other == doc || nested(doc, other)));
    // A document moves only when it was ticked, and only one that is offered:
    // the list comes back from the webview.
    let ticked: Vec<String> = offered.iter().filter(|doc| ticked.contains(doc)).cloned().collect();
    moves.extend(ticked.iter().cloned());
    // A path inside another planned move goes with it.
    let all: Vec<String> = moves.iter().chain(&leftovers).cloned().collect();
    let top = |paths: Vec<String>| -> Vec<String> { paths.into_iter().filter(|path| !all.iter().any(|other| nested(path, other))).collect() };
    let moves = top(moves);
    let leftovers = top(leftovers);

    let canonical_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    // `--absolute-git-dir` also answers for a worktree, whose `.git` is a file.
    let git_dir = crate::git::run(env.git, root, &["rev-parse", "--absolute-git-dir"])
        .map(|out| PathBuf::from(out.trim()))
        .unwrap_or_else(|| root.join(".git"));
    let git_dir = std::fs::canonicalize(&git_dir).unwrap_or(git_dir);
    let archive_device = at(root, &plan.archive).ancestors().find(|p| present(p)).and_then(|p| (env.device)(p));
    for rel in moves.iter().chain(&leftovers) {
        if let Some(why) = refuse(root, &canonical_root, &git_dir, rel, archive_device, env) {
            block(why);
        }
    }

    let archive = plan.archive.clone();
    let leftovers_dir = format!("{archive}/leftovers-{}", to.as_str());
    let moved = |rel: &String, into: &str| Move {
        from: rel.clone(),
        to: format!("{into}/{rel}"),
        files: count_files(&at(root, rel)),
        ignored: ignored_of(env.git, root, rel).to_string(),
    };
    plan.moves = moves.iter().map(|rel| moved(rel, &archive)).collect();
    plan.leftovers = leftovers.iter().map(|rel| moved(rel, &leftovers_dir)).collect();
    plan.documents = offered
        .iter()
        .map(|rel| Document { path: rel.clone(), files: count_files(&at(root, rel)), ticked: ticked.contains(rel), warning: warning(rel) })
        .collect();
    plan.left_in_place = notes;
    plan.blocked = blocked;
    plan
}

fn target(to: &str) -> Result<Methodology, String> {
    match to.trim() {
        "v4" => Ok(Methodology::V4),
        "v6" => Ok(Methodology::V6),
        other => Err(format!("Not a BMAD version: {other}")),
    }
}

fn env(app: &tauri::AppHandle) -> Env {
    Env {
        git: crate::git::GIT,
        v4_src: crate::bmad::resource_root(app).ok(),
        v6_src: crate::bmadv6::resource_root(app).ok(),
        today: today(),
        device: device_of,
    }
}

/// The dry run the confirm dialog shows. Nothing is written.
#[tauri::command(async)]
pub fn bmad_switch_plan(app: tauri::AppHandle, root: String, to: String, documents: Vec<String>) -> Result<SwitchPlan, String> {
    let dir = crate::projectsetup::project(&root)?;
    Ok(plan(&dir, target(&to)?, &documents, &env(&app)))
}
```

Two notes for whoever types this in:

- An output folder configured as `{project-root}` resolves to the root, `""`. Every other move is then nested in it and dropped, so the root is the one path left to refuse. That is what `nested`'s special case for `""` is for (`blocked_when_a_moved_path_is_the_root_in_git_or_under_the_archive`).
- The `block` closure borrows `blocked` until its last call (the `for` loop), so `plan.blocked = blocked` must stay after that loop.

In `src-tauri/src/lib.rs`, register the command after `bmadswitch::bmad_switch_pending,`:

```rust
            bmadswitch::bmad_switch_plan,
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadswitch`
Expected: PASS, the six tests from Task 4 and every test added here (three of them are Unix-only).

Run: `npx vitest run scripts/switchFixtures.test.ts`
Expected: PASS (3 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/bmadswitch.rs src-tauri/src/projectsetup.rs src-tauri/src/lib.rs scripts/switchFixtures.test.ts
git commit -m "feat(switch): bmad_switch_plan, the dry run a switch is confirmed from"
```

---

### Task 6: The archive rule, for people's agents and for Claude Code

**Files:**
- Create: `src-tauri/src/archive_rule.md`
- Modify: `src/lib/projectMethodology.ts:12` (import), `:213` and `:280` (`RULES_MD`)
- Modify: `src-tauri/src/bmadswitch.rs` (the rule's constants; one test)
- Modify: `src-tauri/src/usage.rs:583-600` (add `deny_archive_edits` after `hide_attribution`), tests (append)
- Test: `src/lib/__tests__/projectMethodology.test.ts` (append)

**Interfaces:**
- Produces (`crate::bmadswitch`): `pub(crate) const ARCHIVE_RULE: &str` (the section, from `archive_rule.md`, ending in a newline) and `pub(crate) const ARCHIVE_RULE_MARKER: &str = "<!-- ade:archive -->";`
- Produces (`crate::usage`): `pub const ARCHIVE_DENY_RULE: &str = "Edit(/.ade/archive/**)";` and `pub fn deny_archive_edits(root: &Path) -> Result<bool, String>`: adds the rule to `permissions.deny` in `.claude/settings.json`, keeping every other key. `Ok(true)` when the file changed, `Ok(false)` when the rule was there, `Err` when the file isn't valid JSON.
- Produces (TS, `src/lib/projectMethodology.ts`): `export const ARCHIVE_RULE_MARKER = "<!-- ade:archive -->";`. `RULES_MD` ends with the archive section.

- [ ] **Step 1: Write the rule**

Create `src-tauri/src/archive_rule.md` with exactly these five lines and a final newline:

```markdown
<!-- ade:archive -->
## 4. The archive
`.ade/archive/` holds earlier BMAD versions of this project. It is
read-only history: never treat it as current documents, never write to it,
and read it only when a person asks about the earlier work.
```

- [ ] **Step 2: Write the failing tests**

Append to the `describe` block of `src/lib/__tests__/projectMethodology.test.ts` (its last test is "names both BMAD versions in CLAUDE.md and points at the marker"), and add `ARCHIVE_RULE_MARKER` to the import from `"../projectMethodology"` on line 2:

```ts
  it("tells agents the archive is read-only history, once", () => {
    const rule =
      "`.ade/archive/` holds earlier BMAD versions of this project. It is\n" +
      "read-only history: never treat it as current documents, never write to it,\n" +
      "and read it only when a person asks about the earlier work.\n";
    expect(RULES_MD).toContain(rule);
    expect(RULES_MD.split(ARCHIVE_RULE_MARKER)).toHaveLength(2);
    // After the Definition of Done, set apart by one blank line.
    expect(RULES_MD).toContain(`no overrides by assertion.\n\n${ARCHIVE_RULE_MARKER}\n## 4. The archive\n`);
    expect(RULES_MD.endsWith(rule)).toBe(true);
    // New projects get it with the rest of the rules.
    expect(methodologyFiles("demo").find((f) => f.path === ".ade/rules.md")!.content).toBe(RULES_MD);
  });
```

Append to the `tests` module of `src-tauri/src/bmadswitch.rs`:

```rust
    #[test]
    fn the_archive_rule_is_the_specs_text_under_its_marker() {
        assert!(ARCHIVE_RULE.starts_with(&format!("{ARCHIVE_RULE_MARKER}\n## 4. The archive\n")), "{ARCHIVE_RULE}");
        assert!(ARCHIVE_RULE.ends_with(
            "`.ade/archive/` holds earlier BMAD versions of this project. It is\n\
             read-only history: never treat it as current documents, never write to it,\n\
             and read it only when a person asks about the earlier work.\n"
        ));
    }
```

Append to the `tests` module of `src-tauri/src/usage.rs`:

```rust
    #[test]
    fn archive_edits_are_denied_once_and_other_keys_are_kept() {
        let d = tmp("archive_deny");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(settings_path(&d), r#"{"model":"sonnet","permissions":{"allow":["Bash(npm test)"],"deny":["Read(./dist/**)"]}}"#).unwrap();
        assert!(deny_archive_edits(&d).unwrap());
        let v = read_json::<Value>(&settings_path(&d)).unwrap();
        assert_eq!(v["model"], "sonnet");
        assert_eq!(v["permissions"]["allow"][0], "Bash(npm test)");
        assert_eq!(v["permissions"]["deny"], serde_json::json!(["Read(./dist/**)", "Edit(/.ade/archive/**)"]));
        // Again: nothing to add, and the file is not rewritten.
        let before = std::fs::read_to_string(settings_path(&d)).unwrap();
        assert!(!deny_archive_edits(&d).unwrap());
        assert_eq!(std::fs::read_to_string(settings_path(&d)).unwrap(), before);
    }

    #[test]
    fn archive_edits_are_denied_in_a_project_with_no_settings() {
        let d = tmp("archive_deny_new");
        assert!(deny_archive_edits(&d).unwrap());
        assert_eq!(read_json::<Value>(&settings_path(&d)).unwrap(), serde_json::json!({ "permissions": { "deny": ["Edit(/.ade/archive/**)"] } }));
    }

    #[test]
    fn archive_deny_reports_a_malformed_settings_file_and_leaves_it() {
        let d = tmp("archive_deny_bad");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(settings_path(&d), "{ not json").unwrap();
        assert!(deny_archive_edits(&d).unwrap_err().contains("not valid JSON"));
        assert_eq!(std::fs::read_to_string(settings_path(&d)).unwrap(), "{ not json");
    }

    /// The webview's command adds heavy-path Read rules and nothing else: the
    /// archive rule is the switch's to add, not something a page can ask for.
    #[test]
    fn the_webviews_deny_command_still_refuses_the_archive_rule() {
        let d = tmp("archive_deny_webview");
        assert!(!valid_rule(ARCHIVE_DENY_RULE));
        assert!(add_deny_rules(&d, &[ARCHIVE_DENY_RULE.to_string()]).is_err());
        assert!(!settings_path(&d).exists());
    }
```

- [ ] **Step 3: Run them**

Run: `npx vitest run src/lib/__tests__/projectMethodology.test.ts`
Expected: FAIL, `ARCHIVE_RULE_MARKER` is undefined and `RULES_MD` lacks the rule.

Run: `cargo test --manifest-path src-tauri/Cargo.toml archive`
Expected: FAIL to compile with "cannot find function `deny_archive_edits` in this scope".

- [ ] **Step 4: Implement**

`src/lib/projectMethodology.ts`: add after the `KNOWLEDGE_README` import (line 12):

```ts
// One file holds the archive rule: the switch (Rust) appends it to a project's
// existing rules, and new projects get it here.
import ARCHIVE_RULE from "../../src-tauri/src/archive_rule.md?raw";
```

Change line 213 from

```ts
export const RULES_MD = `# The ADE methodology
```

to

```ts
const RULES_BODY = `# The ADE methodology
```

and, directly after that template's closing `` `; `` (the line after "If any is false, the story is not Done: no exceptions, no overrides by assertion."), add:

```ts
/** Marks the archive section, so a project that switches twice gets it once. */
export const ARCHIVE_RULE_MARKER = "<!-- ade:archive -->";

export const RULES_MD = `${RULES_BODY}\n${ARCHIVE_RULE}`;
```

`src-tauri/src/bmadswitch.rs`: add after the `JOURNAL` constant:

```rust
/// The rule agents read about the archive. One file holds it:
/// src/lib/projectMethodology.ts gives it to new projects in `RULES_MD`, and a
/// switch appends it to the rules a project already has.
pub(crate) const ARCHIVE_RULE: &str = include_str!("archive_rule.md");
/// Its first line. A `rules.md` that has it already has the rule.
pub(crate) const ARCHIVE_RULE_MARKER: &str = "<!-- ade:archive -->";
```

`src-tauri/src/usage.rs`: add after `hide_attribution` (which ends at line 600):

```rust
/// The rule that keeps Claude Code's file-editing tools out of the archive.
/// `Edit` covers every file-editing tool, and the leading `/` anchors the path
/// to the project wherever the session was started. It does not stop a shell
/// command; `.ade/rules.md` is the guard for those. Reading stays allowed.
pub const ARCHIVE_DENY_RULE: &str = "Edit(/.ade/archive/**)";

/// Add `ARCHIVE_DENY_RULE` to `permissions.deny` in the project's
/// `.claude/settings.json`, keeping everything else in the file. Returns
/// whether the file changed. Only a switch calls this: a project with no
/// archive needs no rule, and setup must not edit every project's shared
/// settings. It is separate from `add_deny_rules`, whose `valid_rule` keeps
/// the webview to the heavy-path `Read` rules.
pub fn deny_archive_edits(root: &Path) -> Result<bool, String> {
    let path = settings_path(root);
    let mut v = load_settings(&path)?;
    let obj = v.as_object_mut().ok_or("settings.json is not a JSON object")?;
    let perms = obj.entry("permissions").or_insert_with(|| Value::Object(Default::default()));
    let perms = perms.as_object_mut().ok_or("permissions is not an object")?;
    let deny = perms.entry("deny").or_insert_with(|| Value::Array(vec![]));
    let deny = deny.as_array_mut().ok_or("permissions.deny is not a list")?;
    if deny.iter().any(|x| x.as_str() == Some(ARCHIVE_DENY_RULE)) {
        return Ok(false);
    }
    deny.push(Value::String(ARCHIVE_DENY_RULE.to_string()));
    save_settings(&path, &v)?;
    Ok(true)
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/__tests__/projectMethodology.test.ts`
Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml archive`
Expected: PASS (the four `usage` tests and `the_archive_rule_is_the_specs_text_under_its_marker`).

Run: `cargo test --manifest-path src-tauri/Cargo.toml usage`
Expected: PASS: `deny_rules_merge_into_settings` and `deny_refuses_other_rules_and_bad_json` are untouched.

Run: `npx vitest run`
Expected: PASS. `RULES_MD` grew; if a test elsewhere compared it to a fixed length or snapshot, it is that test's expectation that changes, not the rule.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/archive_rule.md src-tauri/src/bmadswitch.rs src-tauri/src/usage.rs src/lib/projectMethodology.ts src/lib/__tests__/projectMethodology.test.ts
git commit -m "feat(switch): the archive rule in the rules, and a deny rule for edits to it"
```

---

### Task 7: `bmad_switch_apply`, with rollback

**Files:**
- Modify: `src-tauri/src/bmadswitch.rs` (`Env` gains two fields; add apply above the tests; append tests)
- Modify: `src-tauri/src/projectsetup.rs:272` (`remove_unchanged` becomes `pub(crate)`), `:293` (`strip_import` becomes `pub(crate)`)
- Modify: `src-tauri/src/lib.rs` (register `bmad_switch_apply`)
- Test: `scripts/switchFixtures.test.ts` (append the lock pin)

**Interfaces:**
- Consumes: `plan_into`, `Journal`, `MoveState`, `at`, `present`, `Env`, `target`, `env`, `ARCHIVE_RULE`, `ARCHIVE_RULE_MARKER` (Tasks 4–6); `crate::usage::deny_archive_edits` (Task 6); `crate::projectsetup::{apply, mkdirs, remove_unchanged, strip_import, project, SetupFile, SetupReport, APPLY}`.
- Produces (`crate::bmadswitch`):
  - `Env` gains `pub rename: fn(&Path, &Path) -> std::io::Result<()>` and `pub fail_after_rules: bool`.
  - `pub struct SwitchResult { pub archive: String, pub moved: u32, pub setup: SetupReport, pub rules_appended: bool, pub archive_denied: bool }` (Serialize, camelCase: `rulesAppended`, `archiveDenied`)
  - `pub(crate) struct SetupInput<'a> { pub files: &'a [SetupFile], pub import: &'a str, pub marker: &'a str }`
  - `pub(crate) fn apply(root: &Path, to: Methodology, shown: &SwitchPlan, setup: &SetupInput, env: &Env) -> Result<SwitchResult, String>`
  - `pub(crate) fn verbatim(path: &str) -> String`
  - Tauri command `bmad_switch_apply(app, root: String, to: String, plan: SwitchPlan, files: Vec<SetupFile>, import: String, marker: String) -> Result<SwitchResult, String>`, holding `projectsetup::APPLY` for its whole run.

The order of a switch, and of its undoing, is the spec's ("`bmad_switch_apply`", steps 1–7, and "Rollback"). Two things in the code below go beyond a plain reading of it:

- **The marker.** `.ade/methodology` is itself one of the moves, so the old marker sits in the archive while setup writes the new one, and the reverse move brings it back. The run also records the old marker's text before anything moves and, after the reverse moves, puts that text back if the file says anything else (or removes a marker the project never had). That covers a marker something recreated between the move and setup, which setup would then *replace* and report as created.
- **A reverse move never overwrites.** If something is at the original path again, that move is left `moved` and the journal `incomplete` (Review Focus 1).

- [ ] **Step 1: Write the failing tests**

In the `tests` module of `src-tauri/src/bmadswitch.rs`, change `env()` (from Task 5) to fill the two new fields:

```rust
    pub(super) fn env() -> Env {
        Env {
            git: "ade-no-such-git",
            v4_src: Some(v4_src()),
            v6_src: Some(v6_src()),
            today: "2026-10-11".into(),
            device: one_device,
            rename: fs_rename,
            fail_after_rules: false,
        }
    }
```

and append:

```rust
    use crate::projectsetup::SetupFile;
    use std::collections::BTreeMap;

    const IMPORT: &str = "\n<!-- m -->\n@.ade/rules.md\n";

    /// What the frontend sends: the methodology files for the new version.
    fn files() -> Vec<SetupFile> {
        vec![
            SetupFile { path: "CLAUDE.md".into(), content: "# new\n@.ade/rules.md\n".into() },
            SetupFile { path: ".ade/rules.md".into(), content: format!("new rules\n\n{ARCHIVE_RULE}") },
            SetupFile { path: ".claude/agents/qa.md".into(), content: "fresh qa".into() },
        ]
    }

    fn switch(dir: &Path, to: Methodology, shown: &SwitchPlan, env: &Env) -> Result<SwitchResult, String> {
        let files = files();
        apply(dir, to, shown, &SetupInput { files: &files, import: IMPORT, marker: "<!-- m -->" }, env)
    }

    /// Every file under `root` with its content, and every folder (with a
    /// trailing `/`): what "left as it was" is compared on.
    fn tree(root: &Path) -> BTreeMap<String, String> {
        fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, String>) {
            for entry in std::fs::read_dir(dir).unwrap().flatten() {
                let path = entry.path();
                let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
                if std::fs::symlink_metadata(&path).unwrap().is_dir() {
                    out.insert(format!("{rel}/"), String::new());
                    walk(root, &path, out);
                } else {
                    out.insert(rel, std::fs::read_to_string(&path).unwrap_or_default());
                }
            }
        }
        let mut out = BTreeMap::new();
        walk(root, root, &mut out);
        out
    }

    fn read(dir: &Path, rel: &str) -> String {
        std::fs::read_to_string(at(dir, rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
    }

    /// A destination inside an archive: a forward move. A reverse move goes
    /// the other way.
    fn into_archive(to: &Path) -> bool {
        to.components().any(|c| c.as_os_str() == "archive")
    }

    fn fail_at_stage(from: &Path, to: &Path) -> std::io::Result<()> {
        if from.ends_with(".ade/stage") && into_archive(to) {
            return Err(std::io::Error::other("the file is in use"));
        }
        std::fs::rename(from, to)
    }

    fn fail_at_stage_and_core_back(from: &Path, to: &Path) -> std::io::Result<()> {
        if to.ends_with(".bmad-core") && !into_archive(to) {
            return Err(std::io::Error::other("the folder is locked"));
        }
        fail_at_stage(from, to)
    }

    /// An agent that keeps working: once `.bmad-core` has moved, it writes
    /// into `.bmad-core/` again. Then the switch fails.
    fn agent_writes_then_stage_fails(from: &Path, to: &Path) -> std::io::Result<()> {
        fail_at_stage(from, to)?;
        if from.ends_with(".bmad-core") && into_archive(to) {
            std::fs::create_dir_all(from)?;
            std::fs::write(from.join("new.md"), "written by an agent")?;
        }
        Ok(())
    }

    #[test]
    fn a_switch_from_v4_to_v6() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        let result = switch(&dir, V6, &shown, &env()).unwrap();

        assert_eq!(result.archive, ARCHIVE);
        assert_eq!(result.moved, 7, "2 engine files, 1 command, the log, the stage, the marker, the role file");
        // The old version is in the archive, mirrored.
        assert!(!at(&dir, ".bmad-core").exists() && !at(&dir, ".claude/commands/BMad").exists());
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.bmad-core/tasks/a.md")), "a");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.ade/methodology")), "v4\n");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.claude/agents/qa.md")), "edited qa", "an edited role file is archived, not lost");
        // The new version is set up fresh.
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        assert_eq!(read(&dir, ".claude/agents/qa.md"), "fresh qa");
        assert!(at(&dir, "_bmad/ade-runtime.mjs").is_file() && at(&dir, ".claude/skills/bmad/SKILL.md").is_file());
        assert_eq!(result.setup.bmadv6_files, 6, "{:?}", result.setup.created);
        // What both versions share stays.
        assert_eq!(read(&dir, ".claude/agents/mine.md"), "my agent");
        assert_eq!(read(&dir, "docs/prd.md"), "prd");
        assert_eq!(read(&dir, "docs/stories/1.1.md"), "story");
        assert_eq!(read(&dir, "CLAUDE.md"), format!("# Mine\n{IMPORT}"));
        // The rules a project already had gain the archive section, once.
        assert!(result.rules_appended);
        assert_eq!(read(&dir, ".ade/rules.md"), format!("old rules\n\n{ARCHIVE_RULE}"));
        // Claude Code is kept out of the archive.
        assert!(result.archive_denied);
        let settings: serde_json::Value = serde_json::from_str(&read(&dir, ".claude/settings.json")).unwrap();
        assert_eq!(settings["permissions"]["deny"], serde_json::json!(["Edit(/.ade/archive/**)"]));
        // The journal says it finished, so nothing is pending.
        let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: complete\nphase: done\nfrom: v4\nto: v6\ndate: 2026-10-11\n---\n"), "{journal}");
        assert!(!journal.contains(": pending"), "{journal}");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_switch_from_v6_to_v4_and_back_again() {
        let dir = v6_project();
        let shown = plan(&dir, V4, &[], &env());
        let result = switch(&dir, V4, &shown, &env()).unwrap();
        let archive = ".ade/archive/bmad-v6-2026-10-11";
        assert_eq!(result.archive, archive);
        assert!(!at(&dir, "_bmad").exists() && !at(&dir, "_bmad-output").exists() && !at(&dir, ".ade/gates").exists());
        assert_eq!(read(&dir, &format!("{archive}/_bmad-output/shop/1.md")), "ticket");
        assert_eq!(read(&dir, &format!("{archive}/.claude/skills/bmad/SKILL.md")), "bmad skill");
        assert_eq!(read(&dir, ".claude/skills/mine/SKILL.md"), "my skill", "a person's own skill stays");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a");
        assert_eq!(read(&dir, ".claude/commands/BMad/tasks/x.md"), "x");

        // Back to v6 the same day: a second archive beside the first, which is not touched.
        let back = plan(&dir, V6, &[], &env());
        assert_eq!(back.blocked, None);
        assert_eq!(back.archive, ".ade/archive/bmad-v4-2026-10-11");
        let before = tree(&at(&dir, archive));
        switch(&dir, V6, &back, &env()).unwrap();
        assert_eq!(tree(&at(&dir, archive)), before);
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        // The rules already have the section, and the settings the rule.
        assert_eq!(read(&dir, ".ade/rules.md").matches(ARCHIVE_RULE_MARKER).count(), 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_project_with_no_rules_gets_the_full_rules_with_the_section_once() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/rules.md")).unwrap();
        let result = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert!(!result.rules_appended, "setup wrote rules that already carry it");
        assert_eq!(read(&dir, ".ade/rules.md"), format!("new rules\n\n{ARCHIVE_RULE}"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rules_with_no_final_newline_still_get_a_clean_section() {
        let dir = v4_project();
        write(&dir, ".ade/rules.md", "old rules");
        switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert_eq!(read(&dir, ".ade/rules.md"), format!("old rules\n\n{ARCHIVE_RULE}"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_malformed_settings_file_does_not_stop_the_switch() {
        let dir = v4_project();
        write(&dir, ".claude/settings.json", "{ not json");
        let result = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert!(!result.archive_denied);
        assert!(result.setup.settings_error.is_some());
        assert_eq!(read(&dir, ".claude/settings.json"), "{ not json");
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_uses_the_archive_the_person_saw() {
        let dir = v4_project();
        // Planned yesterday, confirmed after midnight.
        let shown = plan(&dir, V6, &[], &Env { today: "2026-10-10".into(), ..env() });
        let result = switch(&dir, V6, &shown, &env()).unwrap();
        assert_eq!(result.archive, ".ade/archive/bmad-v4-2026-10-10");
        assert!(at(&dir, ".ade/archive/bmad-v4-2026-10-10/.bmad-core").is_dir());
        assert!(!at(&dir, ARCHIVE).exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_refuses_when_the_sources_differ_from_the_plan() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        let before = tree(&dir);
        // Something the person didn't see would move now.
        write(&dir, ".claude/agents/architect.md", "architect");
        let err = switch(&dir, V6, &shown, &env()).unwrap_err();
        assert!(err.contains("changed since"), "{err}");
        std::fs::remove_file(at(&dir, ".claude/agents/architect.md")).unwrap();
        assert_eq!(tree(&dir), before, "nothing moved");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_takes_only_the_archives_name_from_the_plan() {
        let dir = v4_project();
        let honest = plan(&dir, V6, &[], &env());
        let before = tree(&dir);
        for archive in ["../elsewhere", ".ade/archive/../../x", ".ade/archive/bmad-v6-2026-10-11", ".ade/archive/bmad-v4-2026-10-11/..", "docs"] {
            let shown = SwitchPlan { archive: archive.to_string(), ..honest.clone() };
            assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("archive"), "{archive}");
            assert_eq!(tree(&dir), before, "{archive}");
        }
        // Destinations the webview sends are not the ones used.
        let mut shown = honest.clone();
        for m in &mut shown.moves {
            m.to = format!("docs/stolen/{}", m.from);
        }
        switch(&dir, V6, &shown, &env()).unwrap();
        assert!(!at(&dir, "docs/stolen").exists());
        assert!(at(&dir, &format!("{ARCHIVE}/.bmad-core")).is_dir());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_refuses_when_the_archive_folder_now_exists() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        std::fs::create_dir_all(at(&dir, ARCHIVE)).unwrap();
        assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("already exists"));
        assert!(at(&dir, ".bmad-core").is_dir());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_after_a_failed_move_puts_everything_back() {
        let dir = v4_project();
        let before = tree(&dir);
        let failing = Env { rename: fail_at_stage, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/stage") && err.contains("in use"), "the path that failed is named: {err}");
        assert_eq!(tree(&dir), before, "every file back, and no folder left: the archive is gone, journal included");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_after_a_failed_setup_puts_everything_back() {
        let dir = v4_project();
        let before = tree(&dir);
        // A v6 resource root with skills but no runtime: setup fails after it
        // has written files, folders and the import line.
        let broken = temp();
        write(&broken, "skills/bmad/SKILL.md", "bmad skill");
        let failing = Env { v6_src: Some(broken.clone()), ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains("ade-runtime.mjs"), "{err}");
        assert_eq!(tree(&dir), before, "what setup created is gone, the import is stripped, the moves are reversed");
        assert_eq!(read(&dir, ".claude/agents/qa.md"), "edited qa");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(broken).ok();
    }

    #[test]
    fn rollback_at_the_last_step_restores_settings_rules_and_the_marker() {
        let dir = v4_project();
        write(&dir, ".claude/settings.json", "{\"model\":\"sonnet\"}");
        let before = tree(&dir);
        // Setup has finished: the marker says v6, the settings carry two new
        // keys and the rule, the rules carry the section.
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&dir), before);
        assert_eq!(read(&dir, ".claude/settings.json"), "{\"model\":\"sonnet\"}");
        assert_eq!(read(&dir, ".ade/rules.md"), "old rules\n");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n", "the old marker, not the one setup wrote");
        assert_eq!(read(&dir, "CLAUDE.md"), "# Mine\n");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_leaves_no_marker_in_a_project_that_had_none() {
        let dir = v4_project();
        // A v4 project from before the marker: `.bmad-core/` alone says v4.
        std::fs::remove_file(at(&dir, ".ade/methodology")).unwrap();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&dir), before);
        assert!(!at(&dir, ".ade/methodology").exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_failed_reverse_move_leaves_an_incomplete_journal() {
        let dir = v4_project();
        let failing = Env { rename: fail_at_stage_and_core_back, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains("in use") && err.contains(&format!("{ARCHIVE}/ARCHIVE.md")), "{err}");
        let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: incomplete\n"), "{journal}");
        assert!(journal.contains(&format!("- `.bmad-core` → `{ARCHIVE}/.bmad-core`: moved\n")), "{journal}");
        assert!(journal.contains(&format!("- `.claude/commands/BMad` → `{ARCHIVE}/.claude/commands/BMad`: moved back\n")), "{journal}");
        assert!(journal.contains(&format!("- `.ade/stage` → `{ARCHIVE}/.ade/stage`: pending\n")), "{journal}");
        // What couldn't go back is still in the archive, and the next switch is blocked.
        assert!(at(&dir, &format!("{ARCHIVE}/.bmad-core/tasks/a.md")).is_file());
        assert_eq!(pending(&dir).len(), 1);
        assert!(plan(&dir, V6, &[], &env()).blocked.unwrap().contains("didn't finish"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_never_overwrites_what_reappeared() {
        let dir = v4_project();
        let failing = Env { rename: agent_writes_then_stage_fails, ..env() };
        switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(read(&dir, ".bmad-core/new.md"), "written by an agent", "what the agent wrote is still there");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.bmad-core/tasks/a.md")), "a", "and the engine is still in the archive");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_folder_moves_as_the_link() {
        let dir = v4_project();
        let outside = temp();
        write(&outside, "a.md", "a");
        std::fs::remove_dir_all(at(&dir, ".claude/commands/BMad")).unwrap();
        std::os::unix::fs::symlink(&outside, at(&dir, ".claude/commands/BMad")).unwrap();
        switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        let moved = at(&dir, &format!("{ARCHIVE}/.claude/commands/BMad"));
        assert!(std::fs::symlink_metadata(&moved).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read_to_string(outside.join("a.md")).unwrap(), "a", "what it points at is untouched");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    #[test]
    fn long_windows_paths_get_the_verbatim_prefix() {
        let short = r"C:\code\shop\.ade\archive";
        assert_eq!(verbatim(short), short);
        let long = format!("C:/code/{}/x.md", "deep/".repeat(60));
        assert_eq!(verbatim(&long), format!(r"\\?\{}", long.replace('/', r"\")));
        let already = format!(r"\\?\C:\{}", "deep\\".repeat(60));
        assert_eq!(verbatim(&already), already);
        let relative = "deep/".repeat(60);
        assert_eq!(verbatim(&relative), relative, "only an absolute path can carry it");
    }
```

Append to `scripts/switchFixtures.test.ts`:

```ts
describe("bmad_switch_apply", () => {
  it("holds setup's lock for its whole run", () => {
    const rust = readFileSync(resolve(__dirname, "..", "src-tauri/src/bmadswitch.rs"), "utf8");
    const command = rust.slice(rust.indexOf("pub fn bmad_switch_apply("));
    const body = command.slice(0, command.indexOf("\n}\n"));
    // Taken before the switch starts, and bound to a name so it lives to the end.
    expect(body).toMatch(/let _one = crate::projectsetup::APPLY\.lock\(\)[\s\S]*\n\s+apply\(/);
  });
});
```

- [ ] **Step 2: Run them**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadswitch`
Expected: FAIL to compile with "struct `Env` has no field named `rename`".

- [ ] **Step 3: Open up what rollback reuses from setup**

In `src-tauri/src/projectsetup.rs`, change

```rust
fn remove_unchanged(dir: &Path, created: &[String], files: &[SetupFile]) -> Vec<PathBuf> {
```

to

```rust
pub(crate) fn remove_unchanged(dir: &Path, created: &[String], files: &[SetupFile]) -> Vec<PathBuf> {
```

and

```rust
fn strip_import(dir: &Path, import: &str) -> Result<(), String> {
```

to

```rust
pub(crate) fn strip_import(dir: &Path, import: &str) -> Result<(), String> {
```

- [ ] **Step 4: Implement apply**

In `src-tauri/src/bmadswitch.rs`, add to the `use` lines at the top:

```rust
use crate::projectsetup::{SetupFile, SetupReport};
```

Add the two fields to `Env`, after `device`:

```rust
    /// `std::fs::rename`. A test's stand-in fails a chosen move.
    pub rename: fn(&Path, &Path) -> std::io::Result<()>,
    /// Test seam: fail once the rules step has run, the last point a real
    /// failure can come from (the journal's final write).
    pub fail_after_rules: bool,
```

and fill them in `fn env(app: &tauri::AppHandle)`, after `device: device_of,`:

```rust
        rename: fs_rename,
        fail_after_rules: false,
```

Add, after `bmad_switch_plan` and before the tests:

```rust
fn fs_rename(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}

/// A Windows path too long for the classic API, with the `\\?\` prefix that
/// lifts the limit. Folder creation fails from 248 characters, so that is the
/// threshold. Anything else is returned as it is.
pub(crate) fn verbatim(path: &str) -> String {
    let absolute = path.len() > 2 && path.as_bytes()[1] == b':';
    if path.len() < 248 || !absolute || path.starts_with(r"\\?\") {
        return path.to_string();
    }
    format!(r"\\?\{}", path.replace('/', r"\"))
}

/// `path`, in the form the OS will take however deep the archive mirrors it.
fn long(path: PathBuf) -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(verbatim(&path.to_string_lossy()))
    } else {
        path
    }
}

/// What a finished switch reports.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    /// The archive folder, project-relative.
    pub archive: String,
    /// Files moved into it.
    pub moved: u32,
    pub setup: SetupReport,
    /// The archive section was appended to an existing `.ade/rules.md`.
    pub rules_appended: bool,
    /// `.claude/settings.json` denies edits to the archive.
    pub archive_denied: bool,
}

/// The new version's setup files, as `project_setup_apply` takes them.
pub(crate) struct SetupInput<'a> {
    pub files: &'a [SetupFile],
    pub import: &'a str,
    pub marker: &'a str,
}

/// `.ade/archive/bmad-<from>-YYYY-MM-DD`, with an optional `-N`. The name
/// comes back from the webview, and everything the switch writes goes under it.
fn valid_archive(archive: &str, from: &str) -> bool {
    let Some(rest) = archive.strip_prefix(&format!("{ARCHIVE_DIR}/bmad-{from}-")) else { return false };
    if !rest.is_ascii() || rest.len() < 10 {
        return false;
    }
    let (date, number) = rest.split_at(10);
    let date_ok = date.char_indices().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() });
    let number_ok = number.is_empty() || number.strip_prefix('-').is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()));
    date_ok && number_ok
}

/// Append the archive section to the rules a project already has. Returns
/// what was appended, so a rollback can take exactly that off again.
fn append_archive_rule(root: &Path) -> Result<Option<String>, String> {
    let rules = at(root, ".ade/rules.md");
    let Ok(text) = std::fs::read_to_string(&rules) else { return Ok(None) };
    if text.contains(ARCHIVE_RULE_MARKER) {
        return Ok(None);
    }
    let added = format!("{}{ARCHIVE_RULE}", if text.ends_with('\n') { "\n" } else { "\n\n" });
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new().append(true).open(&rules).map_err(|e| format!(".ade/rules.md: {e}"))?;
    file.write_all(added.as_bytes()).map_err(|e| format!(".ade/rules.md: {e}"))?;
    Ok(Some(added))
}

/// One switch under way: what it has done so far, which is what a rollback undoes.
struct Run<'a> {
    root: &'a Path,
    /// The archive folder, project-relative.
    archive: String,
    journal: Journal,
    journaled: bool,
    /// Folders the switch itself created, outermost first.
    dirs: Vec<PathBuf>,
    report: SetupReport,
    /// `.ade/methodology` before anything moved; `Some(None)` when there was none.
    marker: Option<Option<String>>,
    /// `.claude/settings.json` before setup ran; `Some(None)` when there was none.
    settings: Option<Option<Vec<u8>>>,
    /// What was appended to `.ade/rules.md`.
    rules: Option<String>,
}

impl Run<'_> {
    fn save(&self) -> Result<(), String> {
        self.journal.write(&at(self.root, &self.archive))
    }

    fn forward(&mut self, to: Methodology, plan: &SwitchPlan, setup: &SetupInput, env: &Env) -> Result<SwitchResult, String> {
        let root = self.root;
        // 2. Journal, before the first move.
        crate::projectsetup::mkdirs(&long(at(root, &self.archive)), &mut self.dirs)?;
        self.save()?;
        self.journaled = true;
        self.marker = Some(std::fs::read_to_string(at(root, ".ade/methodology")).ok());

        // 3. Move, recording each one.
        for i in 0..self.journal.moves.len() {
            let (from, into) = (self.journal.moves[i].0.clone(), self.journal.moves[i].1.clone());
            let dst = long(at(root, &into));
            if let Some(parent) = dst.parent() {
                crate::projectsetup::mkdirs(parent, &mut self.dirs)?;
            }
            (env.rename)(&long(at(root, &from)), &dst).map_err(|e| format!("Couldn't move {from}: {e}"))?;
            self.journal.moves[i].2 = MoveState::Moved;
            self.save()?;
        }

        // 4. Snapshot the settings setup and the deny rule may edit.
        self.settings = Some(std::fs::read(at(root, ".claude/settings.json")).ok());

        // 5. Set up the new version, keeping its report even when it fails.
        self.journal.phase = "setup";
        self.save()?;
        let src = match to {
            Methodology::V4 => env.v4_src.as_deref(),
            Methodology::V6 => env.v6_src.as_deref(),
        }
        .ok_or_else(|| format!("ADE's bundled BMAD {} files weren't found.", to.as_str()))?;
        crate::projectsetup::apply(root, setup.files, Some(setup.import), setup.marker, to, Some(src), &mut self.report)?;

        // 6. Rules, after setup: a project with no rules.md has the full rules by now.
        self.journal.phase = "rules";
        self.save()?;
        self.rules = append_archive_rule(root)?;
        // A settings file that can't be edited is reported, not fatal.
        let archive_denied = crate::usage::deny_archive_edits(root).is_ok();
        if env.fail_after_rules {
            return Err("failed on purpose, after the rules step".to_string());
        }

        // 7. Done.
        self.journal.status = "complete";
        self.journal.phase = "done";
        self.save()?;
        Ok(SwitchResult {
            archive: self.archive.clone(),
            moved: plan.moves.iter().chain(&plan.leftovers).map(|m| m.files).sum(),
            setup: std::mem::take(&mut self.report),
            rules_appended: self.rules.is_some(),
            archive_denied,
        })
    }

    /// Undo what forward() did, and return the error to report. Every file
    /// goes back to its path and content, and nothing the switch created is
    /// left; directory times and git's index can't be restored.
    fn rollback(&mut self, error: String, setup: &SetupInput, env: &Env) -> String {
        let root = self.root;
        // The rules section first: a rules.md setup wrote must read as setup
        // wrote it to be removed below.
        if let Some(added) = self.rules.take() {
            let rules = at(root, ".ade/rules.md");
            if let Some(stripped) = std::fs::read_to_string(&rules).ok().and_then(|text| text.strip_suffix(added.as_str()).map(str::to_string)) {
                let _ = std::fs::write(&rules, stripped);
            }
        }
        if let Some(snapshot) = self.settings.take() {
            let settings = at(root, ".claude/settings.json");
            match snapshot {
                Some(bytes) => {
                    if std::fs::read(&settings).ok().as_deref() != Some(bytes.as_slice()) {
                        let _ = std::fs::write(&settings, bytes);
                    }
                }
                None => {
                    let _ = std::fs::remove_file(&settings);
                }
            }
        }
        // What setup created, a file only if it is still as setup wrote it.
        crate::projectsetup::remove_unchanged(root, &self.report.created, setup.files);
        if self.report.appended_import {
            let _ = crate::projectsetup::strip_import(root, setup.import);
        }
        // Innermost first. A folder something else has written into stays.
        for dir in self.report.created_dirs.iter().rev() {
            let _ = std::fs::remove_dir(dir);
        }

        // The moves, last first.
        let mut stuck = false;
        for i in (0..self.journal.moves.len()).rev() {
            if self.journal.moves[i].2 != MoveState::Moved {
                continue;
            }
            let (back_to, from) = (long(at(root, &self.journal.moves[i].0)), long(at(root, &self.journal.moves[i].1)));
            // rename() replaces a file that is in the way without a word. If
            // something is there again, an agent or a person wrote it since:
            // it stays, and this move stays in the archive.
            let back = if present(&back_to) {
                Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "something is there again"))
            } else {
                (env.rename)(&from, &back_to)
            };
            match back {
                Ok(()) => self.journal.moves[i].2 = MoveState::MovedBack,
                Err(_) => stuck = true,
            }
        }

        // The marker says what the project is on. Whatever happened to the
        // file in between, it reads as it did before the switch.
        if let Some(old) = self.marker.take() {
            let marker = at(root, ".ade/methodology");
            match old {
                Some(text) => {
                    if std::fs::read_to_string(&marker).ok().as_deref() != Some(text.as_str()) {
                        let _ = std::fs::write(&marker, text);
                    }
                }
                None => {
                    let _ = std::fs::remove_file(&marker);
                }
            }
        }

        let archive = at(root, &self.archive);
        if stuck {
            self.journal.status = "incomplete";
            let _ = self.save();
            return format!("{error} The switch couldn't be fully undone: see {}/{JOURNAL}.", self.archive);
        }
        // Everything is back: the archive goes, journal included. Only what
        // the switch made is removed, so anything else written there stays.
        if self.journaled {
            let _ = std::fs::remove_file(archive.join(JOURNAL));
        }
        for dir in self.dirs.iter().rev() {
            let _ = std::fs::remove_dir(dir);
        }
        error
    }
}

/// Switch `root` to `to`, as `shown` said it would go. On any failure the
/// project is put back as it was.
pub(crate) fn apply(root: &Path, to: Methodology, shown: &SwitchPlan, setup: &SetupInput, env: &Env) -> Result<SwitchResult, String> {
    // 1. Recompute. The plan came back from the webview: only the archive's
    // name is taken from it, checked, and every destination follows from that.
    let ticked: Vec<String> = shown.documents.iter().filter(|d| d.ticked).map(|d| d.path.clone()).collect();
    let fresh = plan_into(root, to, &ticked, env, Some(&shown.archive));
    if fresh.archive.is_empty() {
        // No BMAD, or already on the version: there is no archive to name.
        return Err(fresh.blocked.unwrap_or_else(|| "There is nothing to switch.".to_string()));
    }
    if !valid_archive(&fresh.archive, &fresh.from) {
        return Err(format!("{} isn't an archive folder ADE would make.", shown.archive));
    }
    if let Some(why) = &fresh.blocked {
        return Err(why.clone());
    }
    let sources = |p: &SwitchPlan| -> std::collections::BTreeSet<String> { p.moves.iter().chain(&p.leftovers).map(|m| m.from.clone()).collect() };
    // Nothing moves that the person didn't see.
    if sources(&fresh) != sources(shown) {
        return Err("The project changed since this was shown. Review the switch again.".to_string());
    }
    if present(&at(root, &fresh.archive)) {
        return Err(format!("{} already exists. Review the switch again.", fresh.archive));
    }

    let moves: Vec<Move> = fresh.moves.iter().chain(&fresh.leftovers).cloned().collect();
    let mut run = Run {
        root,
        archive: fresh.archive.clone(),
        journal: Journal::new(&fresh.from, &fresh.to, &env.today, &moves),
        journaled: false,
        dirs: Vec::new(),
        report: SetupReport::default(),
        marker: None,
        settings: None,
        rules: None,
    };
    match run.forward(to, &fresh, setup, env) {
        Ok(result) => Ok(result),
        Err(error) => Err(run.rollback(error, setup, env)),
    }
}

/// Archive the old version and set up the other one. `plan` is the plan the
/// dialog showed; `files`, `import` and `marker` are the new version's setup
/// files, as `project_setup_apply` takes them.
#[tauri::command(async)]
pub fn bmad_switch_apply(
    app: tauri::AppHandle,
    root: String,
    to: String,
    plan: SwitchPlan,
    files: Vec<SetupFile>,
    import: String,
    marker: String,
) -> Result<SwitchResult, String> {
    let dir = crate::projectsetup::project(&root)?;
    // Held for the whole run: no setup may write into a tree that is half moved.
    let _one = crate::projectsetup::APPLY.lock().unwrap_or_else(|e| e.into_inner());
    apply(&dir, target(&to)?, &plan, &SetupInput { files: &files, import: &import, marker: &marker }, &env(&app))
}
```

In `src-tauri/src/lib.rs`, register the command after `bmadswitch::bmad_switch_plan,`:

```rust
            bmadswitch::bmad_switch_apply,
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmadswitch`
Expected: PASS, every `bmadswitch` test from Tasks 4 to 7.

If `a_switch_from_v4_to_v6` fails on `bmadv6_files`, print `result.setup.created` and count: two skill files, `_bmad/config.toml`, `_bmad/custom/.gitignore`, the runtime and the marker are six. Correct the number to what the fixture really installs; the other assertions are the contract.

Run: `npx vitest run scripts/switchFixtures.test.ts`
Expected: PASS (4 tests).

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, every Rust test.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/bmadswitch.rs src-tauri/src/projectsetup.rs src-tauri/src/lib.rs scripts/switchFixtures.test.ts
git commit -m "feat(switch): bmad_switch_apply, which archives, sets up and rolls back"
```

---

### Task 8: The watcher drops the archive's events

**Files:**
- Modify: `src-tauri/src/watcher.rs:49-92` (`watch_directory`), tests (append)

**Interfaces:**
- Produces: `watch_directory(state, dir: String, extensions: Vec<String>, with_content: Option<bool>, exclude: Option<Vec<String>>, on_event)`. `exclude` holds path prefixes whose events are dropped; an absolute entry is used as it is, a relative one is taken under `dir`. Callers that pass nothing are unchanged.
- Produces (private, tested): `fn exclusions(dir: &Path, exclude: &[String]) -> Vec<PathBuf>` and `fn excluded(path: &Path, exclude: &[PathBuf]) -> bool`.

- [ ] **Step 1: Write the failing tests**

Append to the `tests` module of `src-tauri/src/watcher.rs`:

```rust
    #[test]
    fn drops_events_under_an_excluded_prefix() {
        let exclude = vec![PathBuf::from("/p/.ade/archive")];
        assert!(excluded(Path::new("/p/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md"), &exclude));
        assert!(excluded(Path::new("/p/.ade/archive"), &exclude), "the folder itself");
        assert!(!excluded(Path::new("/p/.ade/archive2/x.md"), &exclude), "a prefix ends at a path separator");
        assert!(!excluded(Path::new("/p/.ade/stage"), &exclude));
        assert!(!excluded(Path::new("/p/.ade/stage"), &[]));
    }

    #[test]
    fn an_exclusion_is_absolute_or_under_the_watched_folder() {
        let dir = std::env::temp_dir().join(format!("ade-watch-exclude-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let found = exclusions(&dir, &["archive".to_string(), "/elsewhere/x".to_string()]);
        assert!(found.contains(&dir.join("archive")), "{found:?}");
        assert!(found.contains(&PathBuf::from("/elsewhere/x")), "{found:?}");
        assert!(exclusions(&dir, &[]).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    /// The OS reports events under the watched folder's resolved path
    /// (`/private/var/...` for `/var/...` on macOS), so a prefix given through
    /// a link must match that spelling too.
    #[cfg(unix)]
    #[test]
    fn excludes_the_resolved_path_too() {
        let base = std::env::temp_dir().join(format!("ade-watch-link-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("real/.ade")).unwrap();
        std::os::unix::fs::symlink(base.join("real"), base.join("link")).unwrap();
        let watched = base.join("link/.ade");
        let given = watched.join("archive").to_string_lossy().into_owned();
        let found = exclusions(&watched, &[given]);
        let resolved = std::fs::canonicalize(base.join("real/.ade")).unwrap().join("archive");
        assert!(excluded(&resolved.join("x.md"), &found), "{found:?}");
        assert!(excluded(&watched.join("archive/x.md"), &found), "{found:?}");
        std::fs::remove_dir_all(base).ok();
    }
```

- [ ] **Step 2: Run them**

Run: `cargo test --manifest-path src-tauri/Cargo.toml watcher`
Expected: FAIL to compile with "cannot find function `excluded` in this scope".

- [ ] **Step 3: Implement**

In `src-tauri/src/watcher.rs`, add after `changed_event` (which ends at line 47):

```rust
/// The path prefixes whose events are dropped: each entry as given (taken
/// under `dir` when relative), and under `dir`'s resolved path as well, which
/// is the spelling the OS reports events in when `dir` is reached through a link.
fn exclusions(dir: &Path, exclude: &[String]) -> Vec<PathBuf> {
    let resolved = std::fs::canonicalize(dir).ok();
    let mut out = Vec::new();
    for entry in exclude {
        let given = Path::new(entry);
        let abs = if given.is_absolute() { given.to_path_buf() } else { dir.join(given) };
        if let (Some(resolved), Ok(rest)) = (resolved.as_ref(), abs.strip_prefix(dir)) {
            let twin = resolved.join(rest);
            if twin != abs {
                out.push(twin);
            }
        }
        out.push(abs);
    }
    out
}

/// `path` is an excluded folder or inside one. Whole path components are
/// compared, so `archive2` is not under `archive`.
fn excluded(path: &Path, exclude: &[PathBuf]) -> bool {
    exclude.iter().any(|prefix| path.starts_with(prefix))
}
```

Change the doc comment and signature of `watch_directory` from

```rust
/// `with_content` defaults to true; the board panel passes false, since it
/// rebuilds from disk anyway and every modify would otherwise read the file.
#[tauri::command]
pub fn watch_directory(
    state: tauri::State<'_, WatcherManager>,
    dir: String,
    extensions: Vec<String>,
    with_content: Option<bool>,
    on_event: Channel<WatchEvent>,
) -> Result<u32, String> {
    let with_content = with_content.unwrap_or(true);
    let watch_path = PathBuf::from(&dir);
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }
```

to

```rust
/// `with_content` defaults to true; the board panel passes false, since it
/// rebuilds from disk anyway and every modify would otherwise read the file.
///
/// `exclude` is path prefixes whose events are dropped. The board passes
/// `.ade/archive` for its `.ade/` watch: the archive is history, and a switch
/// writes it in one burst. A recursive watch on Linux still registers the
/// archive's folders with inotify; that cost is accepted, since the archive is
/// written once per switch.
#[tauri::command]
pub fn watch_directory(
    state: tauri::State<'_, WatcherManager>,
    dir: String,
    extensions: Vec<String>,
    with_content: Option<bool>,
    exclude: Option<Vec<String>>,
    on_event: Channel<WatchEvent>,
) -> Result<u32, String> {
    let with_content = with_content.unwrap_or(true);
    let watch_path = PathBuf::from(&dir);
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }
    let exclude = exclusions(&watch_path, &exclude.unwrap_or_default());
```

and in the callback change

```rust
            for path in event.paths.iter().filter(|p| wanted(p)) {
```

to

```rust
            for path in event.paths.iter().filter(|p| wanted(p) && !excluded(p, &exclude)) {
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml watcher`
Expected: PASS, the two existing tests and the three added here (one is Unix-only).

Run: `npx vitest run src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS: `watch_directory` is a plain `#[tauri::command]`, so its argument names are checked, and the three existing callers pass only names it still accepts.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/watcher.rs
git commit -m "feat(watcher): drop events under excluded path prefixes"
```

---

### Task 9: The kept list, its migration, and a separator boundary for roots

**Files:**
- Modify: `src/lib/projectSetup.ts:42-44` (the key), `:88-94` (the list's functions, after `markSetUp`), `:169-184` (`bmadRootOf`), `:208-219` (`foldersUpTo`)
- Modify: `src/lib/persistence.ts:34-38` (`PERSISTED_KEYS`)
- Modify: `src/main.tsx:72-75` (run the migration)
- Test: `src/lib/__tests__/projectSetup.test.ts`, `src/lib/__tests__/persistence.test.ts`

**Interfaces:**
- Produces (`src/lib/projectSetup.ts`):
  - `export function isKept(root: string): boolean`
  - `export function markKept(root: string): void`
  - `export function migrateKept(): void`: when `ade-bmad-kept` is absent (not merely empty), writes it with every root in `ade-project-setup-done`, normalised.
  - `export function isWithin(dir: string, root: string): boolean`: `dir` is `root` or inside it, on a separator boundary, for `/` and `\`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/projectSetup.test.ts`, add `isKept, isWithin, markKept, migrateKept` to the import from `"../projectSetup"`, add these two imports at the top of the file

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
```

and append:

```ts
describe("the kept list", () => {
  const kept = () => JSON.parse(localStorage.getItem("ade-bmad-kept")!);

  it("keeps a project under its normalised root", () => {
    expect(isKept("/code/shop")).toBe(false);
    markKept("/code/shop/");
    expect(isKept("/code/shop")).toBe(true);
    expect(isKept("/code/shop/")).toBe(true);
    expect(kept()).toEqual(["/code/shop"]);
  });

  it("is seeded once from the projects already set up, with their roots normalised", () => {
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/old/", "/code/older", "/code/old"]));
    migrateKept();
    expect(kept()).toEqual(["/code/old", "/code/older"]);
    expect(isKept("/code/old")).toBe(true);
  });

  it("is not seeded once the key exists, even empty", () => {
    localStorage.setItem("ade-bmad-kept", "[]");
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/old"]));
    migrateKept();
    expect(isKept("/code/old")).toBe(false);
  });

  it("is written even when nothing was set up, so the migration runs once", () => {
    migrateKept();
    expect(localStorage.getItem("ade-bmad-kept")).toBe("[]");
    // A project set up afterwards is not one the user "already had".
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/new"]));
    migrateKept();
    expect(isKept("/code/new")).toBe(false);
  });

  it("is migrated after the saved state is restored, in the main window", () => {
    const main = readFileSync(resolve(__dirname, "../../main.tsx"), "utf8");
    const hydrated = main.indexOf("await hydrateFromDisk();");
    const saving = main.indexOf("startAutoSave();", hydrated);
    const migrated = main.indexOf("migrateKept();");
    expect(hydrated).toBeGreaterThan(-1);
    // After hydration, or the key would always look absent; after auto-save
    // starts, or the write would never reach disk.
    expect(saving).toBeGreaterThan(hydrated);
    expect(migrated).toBeGreaterThan(saving);
  });
});

describe("isWithin", () => {
  it("is true for the root and for folders inside it", () => {
    expect(isWithin("/mono", "/mono")).toBe(true);
    expect(isWithin("/mono/", "/mono")).toBe(true);
    expect(isWithin("/mono/app/src", "/mono/")).toBe(true);
    expect(isWithin("C:\\p\\src", "C:\\p")).toBe(true);
    expect(isWithin("/x", "/")).toBe(true);
  });

  it("needs a separator after the root", () => {
    expect(isWithin("/mono2", "/mono")).toBe(false);
    expect(isWithin("/mono2/app", "/mono")).toBe(false);
    expect(isWithin("C:\\p2\\src", "C:\\p")).toBe(false);
    expect(isWithin("/mon", "/mono")).toBe(false);
  });
});

describe("a folder beside the project, with a longer name", () => {
  it("is not listed as above a folder that isn't under the stop", () => {
    expect(foldersUpTo("/mono2/app", "/mono")).toEqual(["/mono2/app"]);
  });

  it("is not walked into when looking for the BMAD project", async () => {
    // `project_root` answers /mono for a cwd in /mono2: the walk must not
    // carry on up /mono2 as if it were inside /mono.
    tauri.roots = { "/mono2/app": "/mono" };
    tauri.byDir = { "/mono2": "v4" };
    expect(await bmadRootOf("/mono2/app")).toBeNull();
  });
});
```

In `src/lib/__tests__/persistence.test.ts`, inside "covers app state keys and recording prefixes only", add:

```ts
    expect(isPersistedKey("ade-bmad-kept")).toBe(true);
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts src/lib/__tests__/persistence.test.ts`
Expected: FAIL: `isKept` is not exported, `foldersUpTo("/mono2/app", "/mono")` returns `["/mono2/app", "/mono2"]`, `bmadRootOf` returns `/mono2`, and `ade-bmad-kept` is not a persisted key.

- [ ] **Step 3: Implement the list and the boundary**

`src/lib/projectSetup.ts`, after `const DECLINED_KEY = "ade-project-setup-declined";` (line 44):

```ts
const KEPT_KEY = "ade-bmad-kept";
```

After `markSetUp` (which ends at line 94):

```ts
/**
 * Don't ask this project the keep-or-switch question. Keeping its version
 * adds it; so does answering which version to set up, and finishing a switch.
 */
export function isKept(root: string): boolean {
  return readList(KEPT_KEY).includes(normRoot(root));
}

export function markKept(root: string) {
  writeList(KEPT_KEY, root, true);
}

/**
 * Run once, after the saved state is restored. The first launch with this
 * list finds no key at all: every project already set up is added, so the
 * update doesn't ask about projects the user already has. An empty list is a
 * list, and is left alone.
 */
export function migrateKept() {
  try {
    if (localStorage.getItem(KEPT_KEY) !== null) return;
    localStorage.setItem(KEPT_KEY, JSON.stringify(readList(DONE_KEY)));
  } catch {
    // Storage blocked: each project is asked once more.
  }
}

/**
 * `dir` is `root` or a folder inside it. A separator has to follow the root:
 * `/mono2` is not inside `/mono`.
 */
export function isWithin(dir: string, root: string): boolean {
  const at = normRoot(dir);
  const top = normRoot(root);
  if (at === top) return true;
  if (!at.startsWith(top)) return false;
  // A filesystem root keeps its separator (`/`), so the next character is a name.
  return /[\\/]$/.test(top) || /[\\/]/.test(at[top.length]);
}
```

In `bmadRootOf`, change

```ts
    if (dir === stop || !dir.startsWith(stop)) break;
```

to

```ts
    if (dir === stop || !isWithin(dir, stop)) break;
```

In `foldersUpTo`, change

```ts
    if (at === end || !at.startsWith(end)) break;
```

to

```ts
    if (at === end || !isWithin(at, end)) break;
```

`src/lib/persistence.ts`, in `PERSISTED_KEYS`, after `"ade-project-setup-declined",`:

```ts
  // Which projects have answered "keep this BMAD version or switch". Lost,
  // every project with BMAD is asked again the next time it is opened.
  "ade-bmad-kept",
```

`src/main.tsx`, change

```ts
    await hydrateFromDisk();
    startAutoSave();
    startPeriodicSync();
```

to

```ts
    await hydrateFromDisk();
    startAutoSave();
    // After the restore, so "no kept list yet" is true only on the first
    // launch with one; after auto-save starts, so the list reaches disk.
    const { migrateKept } = await import("./lib/projectSetup");
    migrateKept();
    startPeriodicSync();
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts src/lib/__tests__/persistence.test.ts src/lib/__tests__/persistedKeys.test.ts`
Expected: PASS. `persistedKeys.test.ts` finds the new key declared in `projectSetup.ts` and listed in `persistence.ts`.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projectSetup.ts src/lib/persistence.ts src/main.tsx src/lib/__tests__/projectSetup.test.ts src/lib/__tests__/persistence.test.ts
git commit -m "feat(switch): the kept list with its migration, and roots compared on a separator"
```

---

### Task 10: The frontend's switch: plan, run, and keeping setup out meanwhile

**Files:**
- Create: `src/lib/bmadSwitch.ts`
- Modify: `src/lib/projectSetup.ts:131-134` (`setupFiles`, after `withoutRemoved`), `:234-251` (the `switching` set, `isSettingUp`), `:262-265` (`setUpProject`'s rejection)
- Test: `src/lib/__tests__/bmadSwitch.test.ts` (create)

**Interfaces:**
- Consumes: `isWithin`, `markKept` (Task 9); the Tauri commands `bmad_switch_plan`, `bmad_switch_pending`, `bmad_switch_apply` (Tasks 4, 5, 7).
- Produces (`src/lib/projectSetup.ts`):
  - `export const SWITCH_RUNNING = "a BMAD switch is running";`
  - `export function isSwitching(root: string): boolean`
  - `export function beginSwitch(root: string): () => void`: registers the switch; the returned function ends it.
  - `export function onSwitchChange(listener: (root: string, running: boolean) => void): () => void`
  - `isSettingUp(root)` is also true while a switch runs for `root`.
  - `setUpProject(root, …)` rejects with `SWITCH_RUNNING` while a switch runs for `root`.
  - `export function setupFiles(root: string, stacks: Stack[], methodology: Methodology): MethodologyFile[]`: what setup writes for the project, without the agents the person removed.
  - `export function markSwitched(root: string): void`: set up, kept, and no longer declined.
- Produces (`src/lib/bmadSwitch.ts`):
  - `export interface SwitchMove { from: string; to: string; files: number; ignored: "none" | "some" | "all" }`
  - `export interface SwitchDocument { path: string; files: number; ticked: boolean; warning: string | null }`
  - `export interface SwitchNote { path: string; reason: string }`
  - `export interface SwitchPlan { from: Methodology | ""; to: Methodology; archive: string; moves: SwitchMove[]; documents: SwitchDocument[]; leftovers: SwitchMove[]; leftInPlace: SwitchNote[]; dirty: boolean | null; archiveIgnored: boolean | null; blocked: string | null }`
  - `export interface SwitchResult { archive: string; moved: number; setup: SetupReport; rulesAppended: boolean; archiveDenied: boolean }`
  - `export interface PendingSwitch { archive: string; status: string; phase: string; from: string; to: string; date: string }`
  - `export interface SwitchDone { root: string; from: Methodology; to: Methodology; result: SwitchResult }`
  - `export const SWITCH_DONE_EVENT = "bmad-switch-done";`
  - `export const otherVersion: (m: Methodology) => Methodology`
  - `export function planSwitch(root: string, to: Methodology, documents?: string[]): Promise<SwitchPlan>`
  - `export function pendingSwitches(root: string): Promise<PendingSwitch[]>`: `[]` when the command fails.
  - `export function runSwitch(root: string, plan: SwitchPlan): Promise<SwitchResult>`
  - `export interface OpenInProject { panes: { tab: string; cwd: string }[]; agents: { name: string; cwd: string }[] }`
  - `export function openInProject(root: string): Promise<OpenInProject>`

These names match the Rust structs field for field: `SwitchPlan`, `Move`, `Document`, `Note`, `SwitchResult` and `PendingSwitch` are all `#[serde(rename_all = "camelCase")]`, so `left_in_place` is `leftInPlace`, `archive_ignored` is `archiveIgnored`, `rules_appended` is `rulesAppended` and `archive_denied` is `archiveDenied`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/bmadSwitch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  calls: [] as { command: string; args: Record<string, unknown> }[],
  /** When set, bmad_switch_apply waits for it: the switch is still running. */
  applyGate: null as Promise<void> | null,
  applyError: null as string | null,
  /** When set, project_setup_apply waits for it: a setup is still running. */
  setupGate: null as Promise<void> | null,
  pending: [] as unknown,
  pendingFails: false,
}));

const RESULT = {
  archive: ".ade/archive/bmad-v4-2026-10-11",
  moved: 7,
  setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 },
  rulesAppended: true,
  archiveDenied: true,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    tauri.calls.push({ command, args });
    switch (command) {
      case "project_setup_status":
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: true, stacks: ["go"], methodology: "v4" };
      case "project_setup_apply":
        if (tauri.setupGate) await tauri.setupGate;
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      case "bmad_switch_plan":
        return { ...PLAN, to: args.to };
      case "bmad_switch_pending":
        if (tauri.pendingFails) throw new Error("not a folder");
        return tauri.pending;
      case "bmad_switch_apply":
        if (tauri.applyGate) await tauri.applyGate;
        if (tauri.applyError) throw tauri.applyError;
        return RESULT;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// Panes are asked for their folder; there is no terminal here.
const pane = vi.hoisted(() => ({ cwd: "/code/shop/src" as string | null }));
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => pane.cwd) }));

import {
  SWITCH_DONE_EVENT, openInProject, otherVersion, pendingSwitches, planSwitch, runSwitch,
  type SwitchDone, type SwitchPlan,
} from "../bmadSwitch";
import { SWITCH_RUNNING, isKept, isSettingUp, isSwitching, onSwitchChange, setUpProject, setupDeclined, wasSetUp } from "../projectSetup";
import { useFleetStore } from "../../stores/fleetStore";

const PLAN: SwitchPlan = {
  from: "v4",
  to: "v6",
  archive: ".ade/archive/bmad-v4-2026-10-11",
  moves: [{ from: ".bmad-core", to: ".ade/archive/bmad-v4-2026-10-11/.bmad-core", files: 2, ignored: "none" }],
  documents: [],
  leftovers: [],
  leftInPlace: [],
  dirty: false,
  archiveIgnored: false,
  blocked: null,
};

const called = (command: string) => tauri.calls.filter((c) => c.command === command).map((c) => c.args);
const gate = () => {
  let open!: () => void;
  tauri.applyGate = new Promise<void>((r) => { open = r; });
  return open;
};

beforeEach(() => {
  localStorage.clear();
  tauri.calls.length = 0;
  tauri.applyGate = null;
  tauri.applyError = null;
  tauri.setupGate = null;
  tauri.pending = [];
  tauri.pendingFails = false;
  pane.cwd = "/code/shop/src";
  useFleetStore.setState({ subagents: [] });
});

describe("planSwitch and pendingSwitches", () => {
  it("asks for the dry run on the normalised root, with the ticked documents", async () => {
    await planSwitch("/code/shop/", "v6", ["docs/prd.md"]);
    expect(called("bmad_switch_plan")).toEqual([{ root: "/code/shop", to: "v6", documents: ["docs/prd.md"] }]);
    await planSwitch("/code/shop", "v4");
    expect(called("bmad_switch_plan")[1]).toEqual({ root: "/code/shop", to: "v4", documents: [] });
  });

  it("names the other version", () => {
    expect(otherVersion("v4")).toBe("v6");
    expect(otherVersion("v6")).toBe("v4");
  });

  it("is empty when nothing is pending, the command fails, or it answers with something else", async () => {
    expect(await pendingSwitches("/code/shop")).toEqual([]);
    tauri.pendingFails = true;
    expect(await pendingSwitches("/code/shop")).toEqual([]);
    tauri.pendingFails = false;
    tauri.pending = null;
    expect(await pendingSwitches("/code/shop")).toEqual([]);
  });
});

describe("runSwitch", () => {
  it("sends the plan with the new version's setup files, then marks the project set up and kept", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop"]));
    localStorage.setItem("ade-project-agents-removed", JSON.stringify({ "/code/shop": ["qa"] }));
    const result = await runSwitch("/code/shop/", PLAN);
    expect(result).toEqual(RESULT);

    const [sent] = called("bmad_switch_apply");
    expect(sent.root).toBe("/code/shop");
    expect(sent.to).toBe("v6");
    expect(sent.plan).toEqual(PLAN);
    expect(sent.import).toContain("@.ade/rules.md");
    expect(sent.marker).toBe("<!-- ade:methodology -->");
    const paths = (sent.files as { path: string }[]).map((f) => f.path);
    expect(paths).toContain(".ade/rules.md");
    expect(paths).toContain(".claude/agents/architect.md");
    expect(paths, "an agent the person removed isn't brought back").not.toContain(".claude/agents/qa.md");
    expect(paths, "the stack's agents come too").toContain(".claude/agents/backend-go.md");

    expect(isKept("/code/shop")).toBe(true);
    expect(wasSetUp("/code/shop")).toBe(true);
    expect(setupDeclined("/code/shop")).toBe(false);
  });

  it("reports through its own event, never project-setup-done", async () => {
    const setupDone = vi.fn();
    const switchDone = vi.fn();
    window.addEventListener("project-setup-done", setupDone);
    window.addEventListener(SWITCH_DONE_EVENT, switchDone);
    await runSwitch("/code/shop", PLAN);
    expect(setupDone).not.toHaveBeenCalled();
    expect(switchDone).toHaveBeenCalledOnce();
    expect((switchDone.mock.calls[0][0] as CustomEvent<SwitchDone>).detail).toEqual({ root: "/code/shop", from: "v4", to: "v6", result: RESULT });
    window.removeEventListener("project-setup-done", setupDone);
    window.removeEventListener(SWITCH_DONE_EVENT, switchDone);
  });

  it("keeps setup out while it runs: setUpProject rejects rather than sharing the promise", async () => {
    const changes: [string, boolean][] = [];
    const stop = onSwitchChange((root, running) => changes.push([root, running]));
    const open = gate();
    const running = runSwitch("/code/shop", PLAN);
    await vi.waitFor(() => expect(called("bmad_switch_apply")).toHaveLength(1));
    expect(isSwitching("/code/shop/")).toBe(true);
    expect(isSettingUp("/code/shop")).toBe(true);
    await expect(setUpProject("/code/shop", "v6")).rejects.toBe(SWITCH_RUNNING);
    expect(SWITCH_RUNNING).toBe("a BMAD switch is running");
    expect(called("project_setup_apply")).toHaveLength(0);
    // Another project is not held up.
    await setUpProject("/code/other", "v6", []);
    expect(called("project_setup_apply")).toHaveLength(1);

    open();
    await running;
    expect(isSwitching("/code/shop")).toBe(false);
    expect(isSettingUp("/code/shop")).toBe(false);
    expect(changes).toEqual([["/code/shop", true], ["/code/shop", false]]);
    stop();
  });

  it("runs one switch when asked twice", async () => {
    const open = gate();
    const first = runSwitch("/code/shop", PLAN);
    const second = runSwitch("/code/shop/", PLAN);
    await vi.waitFor(() => expect(called("bmad_switch_apply")).toHaveLength(1));
    open();
    expect(await second).toBe(await first);
    expect(called("bmad_switch_apply")).toHaveLength(1);
  });

  it("leaves the project as it was listed when the switch fails", async () => {
    tauri.applyError = "Couldn't move .ade/stage: the file is in use";
    const switchDone = vi.fn();
    window.addEventListener(SWITCH_DONE_EVENT, switchDone);
    await expect(runSwitch("/code/shop", PLAN)).rejects.toBe("Couldn't move .ade/stage: the file is in use");
    expect(isKept("/code/shop")).toBe(false);
    expect(isSwitching("/code/shop")).toBe(false);
    expect(switchDone).not.toHaveBeenCalled();
    window.removeEventListener(SWITCH_DONE_EVENT, switchDone);
  });

  it("does not start while a setup of the project is running", async () => {
    let finish!: () => void;
    tauri.setupGate = new Promise<void>((r) => { finish = r; });
    const setup = setUpProject("/code/shop", "v4", []);
    await vi.waitFor(() => expect(called("project_setup_apply")).toHaveLength(1));
    await expect(runSwitch("/code/shop", PLAN)).rejects.toBe("Project setup is running. Try again when it has finished.");
    expect(called("bmad_switch_apply")).toHaveLength(0);
    finish();
    await setup;
  });
});

describe("openInProject", () => {
  it("lists the terminal panes whose folder is inside the project", async () => {
    const open = await openInProject("/code/shop");
    expect(open.panes.length).toBeGreaterThan(0);
    expect(open.panes.every((p) => p.cwd === "/code/shop/src")).toBe(true);
  });

  it("leaves out a pane in a folder that only starts with the project's name, or with no folder", async () => {
    pane.cwd = "/code/shop2/src";
    expect((await openInProject("/code/shop")).panes).toEqual([]);
    pane.cwd = null;
    expect((await openInProject("/code/shop")).panes).toEqual([]);
  });

  it("lists the agents still running in the project", async () => {
    const agent = { agentType: "qa", description: "Verify story 1.2", model: null, startTime: 1, cwd: "/code/shop" };
    useFleetStore.setState({
      subagents: [
        { ...agent, id: "a", endTime: null },
        { ...agent, id: "b", endTime: 5 },
        { ...agent, id: "c", endTime: null, cwd: "/code/other" },
        { ...agent, id: "d", endTime: null, description: "" },
      ],
    });
    expect((await openInProject("/code/shop/")).agents).toEqual([
      { name: "Verify story 1.2", cwd: "/code/shop" },
      { name: "qa", cwd: "/code/shop" },
    ]);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/lib/__tests__/bmadSwitch.test.ts`
Expected: FAIL, "Failed to resolve import "../bmadSwitch"".

- [ ] **Step 3: Add the `switching` set to `projectSetup.ts`**

`src/lib/projectSetup.ts`, after `withoutRemoved` (which ends at line 134):

```ts
/** What setup writes for a project on `methodology`, without the agents the person removed. */
export function setupFiles(root: string, stacks: Stack[], methodology: Methodology): MethodologyFile[] {
  const at = normRoot(root);
  return withoutRemoved(at, methodologyFiles(baseName(at), stacks, methodology));
}
```

After `const inFlight = new Map<string, Promise<SetupResult>>();` (line 234):

```ts
/**
 * Projects a BMAD switch is moving right now. Apart from `inFlight`: a setup
 * asked for meanwhile must not be handed the switch's promise, which resolves
 * to something else, and must not write into a tree that is half moved.
 */
const switching = new Set<string>();

type SwitchListener = (root: string, running: boolean) => void;
const switchListeners = new Set<SwitchListener>();

/** What `setUpProject` rejects with while the project is being switched. */
export const SWITCH_RUNNING = "a BMAD switch is running";

export function isSwitching(root: string): boolean {
  return switching.has(normRoot(root));
}

/** Hear when a switch starts and ends. Returns the way to stop listening. */
export function onSwitchChange(listener: SwitchListener): () => void {
  switchListeners.add(listener);
  return () => { switchListeners.delete(listener); };
}

function tellSwitch(root: string, running: boolean) {
  for (const listener of [...switchListeners]) {
    try { listener(root, running); } catch (e) { console.warn("A switch listener failed", e); }
  }
}

/** Register a switch of `root` as running. The returned function ends it. */
export function beginSwitch(root: string): () => void {
  const at = normRoot(root);
  switching.add(at);
  tellSwitch(at, true);
  return () => {
    if (switching.delete(at)) tellSwitch(at, false);
  };
}

/** A finished switch set the project up: it is set up, kept, and no longer declined. */
export function markSwitched(root: string) {
  markSetUp(root, true);
  writeList(DECLINED_KEY, root, false);
  markKept(root);
}
```

Change `isSettingUp` from

```ts
/** A setup for this project is running right now. */
export function isSettingUp(root: string): boolean {
  return inFlight.has(normRoot(root));
}
```

to

```ts
/** A setup for this project is running right now, or a switch, which sets it up too. */
export function isSettingUp(root: string): boolean {
  const at = normRoot(root);
  return inFlight.has(at) || switching.has(at);
}
```

In `setUpProject`, change

```ts
  const at = normRoot(root);
  const running = inFlight.get(at);
  if (running) return running;
```

to

```ts
  const at = normRoot(root);
  // A string, as Tauri's own rejections are: callers show it as it is.
  if (switching.has(at)) return Promise.reject(SWITCH_RUNNING);
  const running = inFlight.get(at);
  if (running) return running;
```

- [ ] **Step 4: Create `src/lib/bmadSwitch.ts`**

```ts
/**
 * Switching a project's BMAD version: the dry run the confirm dialog shows,
 * the switch itself, and what is open in the project while it runs. The work
 * is one Rust command (src-tauri/src/bmadswitch.rs); this is its frontend.
 */
import { invoke } from "@tauri-apps/api/core";
import { CLAUDE_MD_IMPORT, CLAUDE_MD_IMPORT_MARKER } from "./projectMethodology";
import {
  beginSwitch, isSettingUp, isWithin, markSwitched, normRoot, setupFiles, setupStatus,
  type Methodology, type SetupReport,
} from "./projectSetup";
import { useFleetStore } from "../stores/fleetStore";
import { findAllPanes, useTabStore } from "../stores/tabStore";

export interface SwitchMove {
  /** Project-relative. */
  from: string;
  to: string;
  files: number;
  /** What git ignores of it today. */
  ignored: "none" | "some" | "all";
}

export interface SwitchDocument {
  path: string;
  files: number;
  ticked: boolean;
  warning: string | null;
}

export interface SwitchNote {
  path: string;
  reason: string;
}

/** What a switch would do: `bmad_switch_plan`'s answer. */
export interface SwitchPlan {
  /** Empty when the project has no BMAD; the plan is then blocked. */
  from: Methodology | "";
  to: Methodology;
  /** The archive folder, project-relative. */
  archive: string;
  moves: SwitchMove[];
  documents: SwitchDocument[];
  leftovers: SwitchMove[];
  leftInPlace: SwitchNote[];
  /** Null: git is missing or failed. */
  dirty: boolean | null;
  archiveIgnored: boolean | null;
  blocked: string | null;
}

export interface SwitchResult {
  archive: string;
  moved: number;
  setup: SetupReport;
  rulesAppended: boolean;
  archiveDenied: boolean;
}

export interface PendingSwitch {
  archive: string;
  status: string;
  phase: string;
  from: string;
  to: string;
  date: string;
}

/** The detail of the event a finished switch reports through. */
export interface SwitchDone {
  root: string;
  from: Methodology;
  to: Methodology;
  result: SwitchResult;
}

/** Not `project-setup-done`: that one offers Undo, which would leave the project with no BMAD. */
export const SWITCH_DONE_EVENT = "bmad-switch-done";

export const otherVersion = (m: Methodology): Methodology => (m === "v6" ? "v4" : "v6");

/** The dry run. `documents` is the document paths the person ticked. */
export function planSwitch(root: string, to: Methodology, documents: string[] = []): Promise<SwitchPlan> {
  return invoke<SwitchPlan>("bmad_switch_plan", { root: normRoot(root), to, documents });
}

/** Switches of this project that started and didn't finish. They block setup and another switch. */
export async function pendingSwitches(root: string): Promise<PendingSwitch[]> {
  const found = await invoke<PendingSwitch[]>("bmad_switch_pending", { root: normRoot(root) }).catch(() => []);
  return Array.isArray(found) ? found : [];
}

const running = new Map<string, Promise<SwitchResult>>();

/**
 * Archive the old version and set up the other one, as `plan` showed. A
 * second request for the same project gets the running switch.
 */
export function runSwitch(root: string, plan: SwitchPlan): Promise<SwitchResult> {
  const at = normRoot(root);
  const already = running.get(at);
  if (already) return already;
  if (isSettingUp(at)) return Promise.reject("Project setup is running. Try again when it has finished.");
  const end = beginSwitch(at);
  const job = (async () => {
    const { stacks } = await setupStatus(at);
    const result = await invoke<SwitchResult>("bmad_switch_apply", {
      root: at,
      to: plan.to,
      plan,
      files: setupFiles(at, stacks, plan.to),
      import: CLAUDE_MD_IMPORT,
      marker: CLAUDE_MD_IMPORT_MARKER,
    });
    markSwitched(at);
    const detail: SwitchDone = { root: at, from: otherVersion(plan.to), to: plan.to, result };
    window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail }));
    return result;
  })().finally(() => {
    running.delete(at);
    end();
  });
  running.set(at, job);
  return job;
}

export interface OpenInProject {
  panes: { tab: string; cwd: string }[];
  agents: { name: string; cwd: string }[];
}

/**
 * The terminals and agents working inside the project. A switch renames
 * folders under them: an agent still running may keep writing into one that
 * moved, and on Windows a folder that is a process's cwd can't be renamed.
 */
export async function openInProject(root: string): Promise<OpenInProject> {
  const { getPtyCwd } = await import("../hooks/useTerminal");
  const panes: OpenInProject["panes"] = [];
  for (const tab of useTabStore.getState().tabs) {
    for (const pane of findAllPanes(tab.root)) {
      const cwd = await getPtyCwd(pane.id).catch(() => null);
      if (cwd && isWithin(cwd, root)) panes.push({ tab: tab.name, cwd });
    }
  }
  const agents = useFleetStore
    .getState()
    .subagents.filter((s) => s.endTime === null && !!s.cwd && isWithin(s.cwd, root))
    .map((s) => ({ name: s.description || s.agentType, cwd: s.cwd }));
  return { panes, agents };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/__tests__/bmadSwitch.test.ts`
Expected: PASS. (`backend-go` is `STACK_AGENTS.go` in `src/lib/projectMethodology.ts`: the mocked status reports a Go project.)

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS: the three new commands are registered, and existing setup tests are unaffected.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bmadSwitch.ts src/lib/projectSetup.ts src/lib/__tests__/bmadSwitch.test.ts
git commit -m "feat(switch): run a switch from the frontend and keep setup out meanwhile"
```

---

### Task 11: `askMethodology` knows a blocked project and remembers an answer

**Files:**
- Modify: `src/lib/methodologyPrompt.ts:14-21` (the union), `:64-100` (`askMethodology`, `askAndSetUp`)
- Modify: `src/lib/newTab.ts:64-77` (`openProjectTab`)
- Test: `src/lib/__tests__/methodologyPrompt.test.ts`, `src/components/__tests__/NewTabDialog.test.tsx`, `src/hooks/__tests__/useProjectSetup.test.tsx`

**Interfaces:**
- Consumes: `pendingSwitches(root): Promise<PendingSwitch[]>` (Task 10); `markKept(root)` (Task 9).
- Produces (`src/lib/methodologyPrompt.ts`):
  - `MethodologyAnswer` gains `{ kind: "blocked"; reason: string }`.
  - `askMethodology(root)` returns `blocked` when the project has a pending switch, before it looks at the disk or asks. A `chosen` answer a person gave (`asked: true`) adds the project to the kept list.
  - `askAndSetUp(root)` throws the `reason` (a string) for a blocked project.
- `openProjectTab(path)` opens a blocked project without setup and reports the reason through `project-setup-failed`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/methodologyPrompt.test.ts`:

Add `pending: [] as unknown[]` to the hoisted `tauri` object, add this case to the mock's `switch`

```ts
      case "bmad_switch_pending":
        return tauri.pending;
```

add `tauri.pending = [];` to `beforeEach`, add `isKept` to the import from `"../projectSetup"`, and append:

```ts
describe("a project whose BMAD switch didn't finish", () => {
  const PENDING = { archive: ".ade/archive/bmad-v4-2026-10-11", status: "incomplete", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" };

  it("is blocked, before the disk is looked at and with no question", async () => {
    tauri.pending = [PENDING];
    tauri.statusFails = true;
    const answer = await askMethodology("/code/shop/");
    expect(answer).toEqual({
      kind: "blocked",
      reason: "A BMAD switch in shop didn't finish. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
    });
    expect(request()).toBeNull();
  });

  it("is not set up by the palette or Set up now, which say why", async () => {
    tauri.pending = [PENDING];
    await expect(askAndSetUp("/code/shop")).rejects.toMatch(/didn't finish.*ARCHIVE\.md/);
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("the kept list", () => {
  it("gains a project when its question is answered", async () => {
    const answer = askMethodology("/code/shop/");
    await asked("/code/shop");
    expect(isKept("/code/shop")).toBe(false);
    settlePrompt({ kind: "chosen", methodology: "v4", asked: true });
    await answer;
    expect(isKept("/code/shop")).toBe(true);
  });

  it("gains it when the question was put another way, such as the cd hook's toast", async () => {
    const ask = vi.fn(async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v6", asked: true }));
    await askMethodology("/code/shop", { ask });
    expect(isKept("/code/shop")).toBe(true);
  });

  it("does not gain a project that merely has a version, or whose question was dismissed", async () => {
    tauri.byDir = { "/code/old": "v4" };
    await askMethodology("/code/old");
    expect(isKept("/code/old")).toBe(false);

    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
    expect(isKept("/code/shop")).toBe(false);
  });
});
```

In `src/components/__tests__/NewTabDialog.test.tsx`:

Add `pending: [] as unknown[]` to the hoisted `tauri` object, add this case to the mock's `switch`

```ts
      case "bmad_switch_pending":
        return tauri.pending;
```

add `tauri.pending = [];` to `beforeEach`, and append to `describe("when something fails", …)`:

```ts
  it("opens a project whose switch didn't finish, without setting it up, and says why", async () => {
    tauri.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "in-progress", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain(".ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
    // A terminal there is how the person resolves it.
    expect(tabs()).toBe(before + 1);
    expect(recentProjects()).toEqual([NEWAPP]);
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
    window.removeEventListener("project-setup-failed", failed);
  });
```

In `src/hooks/__tests__/useProjectSetup.test.tsx`:

Add `pending: [] as unknown[]` to the hoisted `tauri` object, add the same `bmad_switch_pending` case to the mock's `switch`, add `tauri.pending = [];` to `beforeEach`, and append to `describe("when automatic setup doesn't apply", …)`:

```ts
  it("neither asks nor sets up a project whose switch didn't finish, and shows no toast", async () => {
    tauri.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "incomplete", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    mount("/code/shop");
    await settle();
    expect(toasts()).toHaveLength(0);
    expect(tauri.applies).toHaveLength(0);
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/NewTabDialog.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: FAIL: a blocked project is asked about (the dialog or the toast appears), `askAndSetUp` resolves instead of rejecting, and an answered project isn't kept.

- [ ] **Step 3: Implement**

`src/lib/methodologyPrompt.ts`: change the imports at the top to

```ts
import { create } from "zustand";
import { pendingSwitches } from "./bmadSwitch";
import {
  detectOnDisk, isSetupCandidate, markKept, normRoot, onProjectSetUp, setUpProject, type Methodology, type SetupResult,
} from "./projectSetup";
```

Change the union from

```ts
  | { kind: "chosen"; methodology: Methodology; asked: boolean; done?: SetupResult }
  | { kind: "dismissed" };
```

to

```ts
  | { kind: "chosen"; methodology: Methodology; asked: boolean; done?: SetupResult }
  | { kind: "dismissed" }
  /**
   * Setup can't run here: an earlier BMAD switch didn't finish, so the project
   * may have neither version on disk and setup would write into a half-moved
   * tree. `reason` is for the person.
   */
  | { kind: "blocked"; reason: string };
```

Replace `askMethodology` (its doc comment included) with

```ts
/**
 * The version to set `root` up on: the one on disk, or the person's answer.
 * The question must be answered; `dismissed` only means another project's
 * question replaced it, or the dialog's host went away. `blocked` is a project
 * with a BMAD switch that didn't finish: nothing is asked and nothing is set up.
 *
 * `ask` swaps the dialog for another way of asking (the cd hook's toast).
 */
export async function askMethodology(root: string, opts: { ask?: AskUi } = {}): Promise<MethodologyAnswer> {
  const at = normRoot(root);
  const [pending] = await pendingSwitches(at);
  if (pending) {
    return {
      kind: "blocked",
      reason: `A BMAD switch in ${projectName(at)} didn't finish. Setup waits until it is resolved: see ${pending.archive}/ARCHIVE.md.`,
    };
  }
  const detected = await detectOnDisk(at).catch((e) => {
    console.warn("BMAD check failed; asking which version", e);
    return null;
  });
  if (detected) return { kind: "chosen", methodology: detected, asked: false };
  const answer = await (opts.ask ?? askByDialog)(at);
  // A version someone picked is their answer to "which one" for good: New Tab
  // doesn't follow it with keep-or-switch.
  if (answer.kind === "chosen" && answer.asked) markKept(at);
  return answer;
}
```

In `askAndSetUp`, change

```ts
  const answer = await askMethodology(root);
  if (answer.kind !== "chosen") return null;
```

to

```ts
  const answer = await askMethodology(root);
  // Thrown as the string it is, like NOT_A_PROJECT: callers show it as it is.
  if (answer.kind === "blocked") throw answer.reason;
  if (answer.kind !== "chosen") return null;
```

`src/lib/newTab.ts`: replace `openProjectTab` (its doc comment included) with

```ts
/**
 * Open a terminal tab in a project folder, remember it, and set the project up
 * (BMAD, the ADE methodology, the role agents) unless that's turned off.
 *
 * A project with no BMAD is asked which version first, and the question must
 * be answered: until it is, the folder is neither opened nor remembered. That
 * also keeps the cd hook from asking about the same project at the same moment.
 *
 * A project whose BMAD switch didn't finish is opened as it is, with no setup:
 * a terminal there is how it gets resolved.
 */
export async function openProjectTab(path: string): Promise<void> {
  const root = await setupRootFor(path);
  const answer = root ? await askMethodology(root) : null;
  if (answer?.kind === "blocked") {
    rememberProject(path);
    useTabStore.getState().addTab(undefined, path);
    window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: answer.reason } }));
    return;
  }
  // Not answered: a question about another project took this one's place.
  if (answer && answer.kind !== "chosen") return;
  rememberProject(path);
  useTabStore.getState().addTab(undefined, path);
  // `done`: set up, and announced, by another route while the question was open.
  if (!root || !answer || answer.done) return;
  // Not awaited: the terminal is usable while the files are written.
  versionToSetUp(root, answer)
    .then((methodology) => setUpProject(root, methodology))
    .then((result) => window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result })))
    .catch((e) => window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: `Project setup failed: ${e}` } })));
}
```

`src/hooks/useProjectSetup.ts` needs no change: it already returns on any answer that isn't `chosen`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/NewTabDialog.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/BoardPanel.test.tsx src/components/__tests__/AgentsTab.test.tsx`
Expected: PASS. The palette's, the board's and the Agents tab's mocks don't know `bmad_switch_pending`: `pendingSwitches` turns their rejection (or the board mock's `null`) into "nothing pending".

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/methodologyPrompt.ts src/lib/newTab.ts src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/NewTabDialog.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx
git commit -m "feat(switch): setup waits for a switch that didn't finish, and an answer is kept"
```

---

### Task 12: The confirm dialog

A component on its own first: Task 13 puts it behind the shared prompt.

**Files:**
- Create: `src/components/SwitchConfirm.tsx`
- Modify: `src/index.css:651` (styles, after `.new-tab-foot`)
- Test: `src/components/__tests__/SwitchConfirm.test.tsx` (create)

**Interfaces:**
- Consumes: `planSwitch`, `runSwitch`, `openInProject`, `SwitchPlan`, `SwitchMove`, `SwitchResult`, `OpenInProject` (Task 10); `useEscapeToClose`.
- Produces: `export default function SwitchConfirm(props: { root: string; to: Methodology; leaveLabel: "Back" | "Cancel"; onLeave(): void; onDone(result: SwitchResult): void })`. It is a dialog named `Switch to BMAD <to>`. `onLeave` is the way back: the leave button and Escape, never while the switch runs.

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/SwitchConfirm.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OpenInProject, SwitchPlan } from "../../lib/bmadSwitch";

const ARCHIVE = ".ade/archive/bmad-v4-2026-10-11";
const RESULT = { archive: ARCHIVE, moved: 3, setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true };

const tauri = vi.hoisted(() => ({
  /** Overrides for the next plans. */
  plan: {} as Record<string, unknown>,
  plans: [] as Record<string, unknown>[],
  applies: [] as Record<string, unknown>[],
  applyGate: null as Promise<void> | null,
  applyError: null as string | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "bmad_switch_plan": {
        tauri.plans.push(args);
        const ticked = args.documents as string[];
        return {
          from: "v4",
          to: args.to,
          archive: ".ade/archive/bmad-v4-2026-10-11",
          moves: [
            { from: ".bmad-core", to: ".ade/archive/bmad-v4-2026-10-11/.bmad-core", files: 2, ignored: "none" },
            { from: ".ade/stage", to: ".ade/archive/bmad-v4-2026-10-11/.ade/stage", files: 1, ignored: "none" },
          ],
          documents: [
            { path: "docs/prd.md", files: 1, ticked: ticked.includes("docs/prd.md"), warning: "ADE's rules use this file (the PRD). The new version starts without it." },
            { path: "docs/stories", files: 4, ticked: ticked.includes("docs/stories"), warning: null },
          ],
          leftovers: [],
          leftInPlace: [],
          dirty: false,
          archiveIgnored: false,
          blocked: null,
          ...tauri.plan,
        };
      }
      case "project_setup_status":
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: true, stacks: [], methodology: "v4" };
      case "bmad_switch_apply":
        tauri.applies.push(args);
        if (tauri.applyGate) await tauri.applyGate;
        if (tauri.applyError) throw tauri.applyError;
        return { archive: ".ade/archive/bmad-v4-2026-10-11", moved: 3, setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// What is open in the project is the lib's to work out; here it is given.
const open = vi.hoisted(() => ({ value: { panes: [], agents: [] } as OpenInProject }));
vi.mock("../../lib/bmadSwitch", async (original) => ({
  ...(await original<typeof import("../../lib/bmadSwitch")>()),
  openInProject: vi.fn(async () => open.value),
}));

import SwitchConfirm from "../SwitchConfirm";
import { useEscapeToClose } from "../useEscapeToClose";

const dialog = () => screen.getByRole("dialog", { name: "Switch to BMAD v6" });
const confirm = () => screen.getByRole("button", { name: /Archive and switch|Switching…/ }) as HTMLButtonElement;
const renderConfirm = (leaveLabel: "Back" | "Cancel" = "Back") => {
  const onLeave = vi.fn();
  const onDone = vi.fn();
  render(<SwitchConfirm root="/code/shop" to="v6" leaveLabel={leaveLabel} onLeave={onLeave} onDone={onDone} />);
  return { onLeave, onDone };
};
/** The dry run has come back and is on screen. */
const planned = () => screen.findByText(`${ARCHIVE}/`);

beforeEach(() => {
  localStorage.clear();
  tauri.plan = {};
  tauri.plans.length = 0;
  tauri.applies.length = 0;
  tauri.applyGate = null;
  tauri.applyError = null;
  open.value = { panes: [], agents: [] };
});

describe("SwitchConfirm", () => {
  it("shows the archive folder, what moves with its file count, and what the new version installs", async () => {
    renderConfirm();
    await planned();
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    const moves = screen.getByRole("region", { name: "Moves to the archive" });
    expect(moves.textContent).toContain(".bmad-core");
    expect(moves.textContent).toContain("2 files");
    expect(moves.textContent).toContain(".ade/stage");
    expect(moves.textContent).toContain("1 file");
    expect(screen.getByRole("region", { name: "The new version installs" }).textContent).toContain(".claude/skills/");
    expect(confirm().textContent).toBe("Archive and switch");
    expect(confirm().disabled).toBe(false);
  });

  it("leaves the documents where they are unless ticked, and re-plans when a box changes", async () => {
    renderConfirm();
    await planned();
    const docs = screen.getByRole("region", { name: "Your documents (stay)" });
    const prd = screen.getByRole("checkbox", { name: /docs\/prd\.md/ }) as HTMLInputElement;
    expect(docs.textContent).toContain("Archive this too");
    expect(prd.checked).toBe(false);
    expect(tauri.plans).toEqual([{ root: "/code/shop", to: "v6", documents: [] }]);
    expect(screen.queryByText(/ADE's rules use this file/)).toBeNull();

    fireEvent.click(prd);
    await waitFor(() => expect(tauri.plans).toHaveLength(2));
    expect(tauri.plans[1].documents).toEqual(["docs/prd.md"]);
    expect(await screen.findByText("ADE's rules use this file (the PRD). The new version starts without it.")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/stories/ }));
    await waitFor(() => expect(tauri.plans).toHaveLength(3));
    expect(tauri.plans[2].documents).toEqual(["docs/prd.md", "docs/stories"]);

    fireEvent.click(prd);
    await waitFor(() => expect(tauri.plans).toHaveLength(4));
    expect(tauri.plans[3].documents).toEqual(["docs/stories"]);
    await waitFor(() => expect(screen.queryByText(/ADE's rules use this file/)).toBeNull());
  });

  it("says why a blocked switch can't go ahead, and disables the button", async () => {
    tauri.plan = { blocked: "An earlier switch here didn't finish. See .ade/archive/bmad-v6-2026-10-01/ARCHIVE.md." };
    renderConfirm();
    await planned();
    expect(screen.getByRole("alert").textContent).toContain("didn't finish");
    expect(confirm().disabled).toBe(true);
    fireEvent.click(confirm());
    expect(tauri.applies).toHaveLength(0);
  });

  it("lists what is left in place, with why, and leftovers", async () => {
    tauri.plan = {
      leftInPlace: [{ path: "/shared/out", reason: "The output folder is outside the project, so it stays where it is." }],
      leftovers: [{ from: "_bmad", to: `${ARCHIVE}/leftovers-v6/_bmad`, files: 5, ignored: "none" }],
    };
    renderConfirm();
    await planned();
    const left = screen.getByRole("region", { name: "Left in place" });
    expect(left.textContent).toContain("/shared/out");
    expect(left.textContent).toContain("outside the project");
    const leftovers = screen.getByRole("region", { name: "Leftovers" });
    expect(leftovers.textContent).toContain("_bmad");
    expect(leftovers.textContent).toContain(`${ARCHIVE}/leftovers-v6/`);
  });

  it("gives the git notes: uncommitted changes, ignored paths, and whether the archive is ignored", async () => {
    tauri.plan = {
      dirty: true,
      archiveIgnored: true,
      moves: [{ from: "_bmad-output", to: `${ARCHIVE}/_bmad-output`, files: 9, ignored: "all" }, { from: "_bmad", to: `${ARCHIVE}/_bmad`, files: 3, ignored: "some" }],
    };
    renderConfirm();
    await planned();
    const git = screen.getByRole("region", { name: "Git" });
    expect(git.textContent).toContain("They stay as they are. Commit first if you want the move in its own commit.");
    expect(git.textContent).toContain("Git ignores _bmad-output, _bmad today");
    expect(git.textContent).toContain("/_bmad-output/");
    expect(git.textContent).toContain("no longer matches once they move");
    expect(git.textContent).toContain(".ade/ is ignored by git");
    expect(screen.getByRole("region", { name: "Moves to the archive" }).textContent).toContain("9 files, ignored by git");
  });

  it("says Couldn't check git when git is missing, and nothing else about git", async () => {
    tauri.plan = { dirty: null, archiveIgnored: null };
    renderConfirm();
    await planned();
    expect(screen.getByRole("region", { name: "Git" }).textContent).toBe("GitCouldn't check git.");
  });

  it("lists the panes and agents open in the project, and says to stop agents first", async () => {
    open.value = { panes: [{ tab: "shop", cwd: "/code/shop/src" }], agents: [{ name: "Verify story 1.2", cwd: "/code/shop" }] };
    renderConfirm();
    await planned();
    const section = await screen.findByRole("region", { name: "Open in this project" });
    expect(section.textContent).toContain("shop");
    expect(section.textContent).toContain("/code/shop/src");
    expect(section.textContent).toContain("Verify story 1.2");
    expect(section.textContent).toContain("Stop agents before switching: they may keep writing into moved folders");
  });

  it("has no Open in this project section when nothing is open there", async () => {
    renderConfirm();
    await planned();
    expect(screen.queryByRole("region", { name: "Open in this project" })).toBeNull();
  });

  it.each(["Back", "Cancel"] as const)("has a way back: %s, and Escape", async (label) => {
    const { onLeave } = renderConfirm(label);
    await planned();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("doesn't let Escape reach a panel beneath it", async () => {
    const under = vi.fn();
    function Under() { useEscapeToClose(under); return null; }
    render(<Under />);
    renderConfirm();
    await planned();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(under).not.toHaveBeenCalled();
  });

  it("does not switch on Enter: the button has to be clicked", async () => {
    renderConfirm();
    await planned();
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(tauri.applies).toHaveLength(0);
  });

  it("switches with the plan that is on screen, and hands back the result", async () => {
    const { onDone } = renderConfirm();
    await planned();
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/prd\.md/ }));
    // The warning comes from the new plan: once it shows, that plan is the one on screen.
    await screen.findByText(/ADE's rules use this file/);
    fireEvent.click(confirm());
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));
    expect(tauri.applies).toHaveLength(1);
    const sent = tauri.applies[0].plan as SwitchPlan;
    expect(sent.archive).toBe(ARCHIVE);
    expect(sent.documents.find((d) => d.path === "docs/prd.md")!.ticked).toBe(true);
  });

  it("disables both buttons while the switch runs, so a second click and Escape do nothing", async () => {
    let finish!: () => void;
    tauri.applyGate = new Promise<void>((r) => { finish = r; });
    const { onLeave, onDone } = renderConfirm();
    await planned();
    fireEvent.click(confirm());
    await waitFor(() => expect(confirm().textContent).toBe("Switching…"));
    expect(confirm().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLeave).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(tauri.applies).toHaveLength(1);
  });

  it("shows why a switch failed, plans again, and lets the person go back", async () => {
    tauri.applyError = "Couldn't move .ade/stage: the file is in use";
    const { onLeave, onDone } = renderConfirm();
    await planned();
    fireEvent.click(confirm());
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't move .ade/stage: the file is in use");
    expect(onDone).not.toHaveBeenCalled();
    // The project was put back; what would move is worked out afresh.
    await waitFor(() => expect(tauri.plans).toHaveLength(2));
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("says so when the dry run itself fails", async () => {
    tauri.plan = {};
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValueOnce("/code/shop isn't a folder.");
    renderConfirm();
    expect((await screen.findByRole("alert")).textContent).toContain("isn't a folder");
    expect(confirm().disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/components/__tests__/SwitchConfirm.test.tsx`
Expected: FAIL, "Failed to resolve import "../SwitchConfirm"".

- [ ] **Step 3: Implement the component**

Create `src/components/SwitchConfirm.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  openInProject, planSwitch, runSwitch,
  type OpenInProject, type SwitchMove, type SwitchPlan, type SwitchResult,
} from "../lib/bmadSwitch";
import type { Methodology } from "../lib/projectSetup";
import { useEscapeToClose } from "./useEscapeToClose";

/** What the new version puts in the project. */
const INSTALLS: Record<Methodology, string> = {
  v6: "BMAD v6: its skills in .claude/skills/, _bmad/ with the config and the runtime, an empty _bmad-output/, .ade/methodology, and fresh role files in .claude/agents/.",
  v4: "BMAD v4: .bmad-core/, the /BMad commands in .claude/commands/BMad/, .ade/methodology, and fresh role files in .claude/agents/.",
};

const count = (n: number) => (n === 1 ? "1 file" : `${n} files`);
const ignoredNote = (m: SwitchMove) =>
  m.ignored === "all" ? ", ignored by git" : m.ignored === "some" ? ", partly ignored by git" : "";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="switch-confirm__section" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Moves({ moves }: { moves: SwitchMove[] }) {
  return (
    <ul>
      {moves.map((m) => (
        <li key={m.from}>
          <code>{m.from}</code> <small>{count(m.files)}{ignoredNote(m)}</small>
        </li>
      ))}
    </ul>
  );
}

function GitNotes({ plan }: { plan: SwitchPlan }) {
  if (plan.dirty === null) return <p>Couldn't check git.</p>;
  const ignored = [...plan.moves, ...plan.leftovers].filter((m) => m.ignored !== "none").map((m) => m.from);
  return (
    <>
      {plan.dirty && (
        <p>This project has uncommitted changes. They stay as they are. Commit first if you want the move in its own commit.</p>
      )}
      {ignored.length > 0 && (
        <p>
          Git ignores {ignored.join(", ")} today. An ignore rule like <code>/_bmad-output/</code> no longer matches once they move.
        </p>
      )}
      {plan.archiveIgnored === true && <p><code>.ade/</code> is ignored by git, so the archive won't be committed.</p>}
      {plan.archiveIgnored === false && <p><code>.ade/archive/</code> isn't ignored by git: the archive shows up as new files.</p>}
    </>
  );
}

interface Props {
  root: string;
  to: Methodology;
  /** "Back" to the keep-or-switch question; "Cancel" when it came from the palette or the board. */
  leaveLabel: "Back" | "Cancel";
  onLeave(): void;
  onDone(result: SwitchResult): void;
}

/**
 * "This is what a switch would do": the dry run, shown before anything moves.
 * A switch never acts on the click that asked for it.
 */
export default function SwitchConfirm({ root, to, leaveLabel, onLeave, onDone }: Props) {
  const [plan, setPlan] = useState<SwitchPlan | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [open, setOpen] = useState<OpenInProject | null>(null);
  // Why the dry run failed, and why the switch did: one doesn't clear the other.
  const [planError, setPlanError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Bumped after a failed switch: the project was put back, so plan again.
  const [round, setRound] = useState(0);
  const dialog = useRef<HTMLDivElement | null>(null);
  const focusOnMount = useCallback((el: HTMLDivElement | null) => { dialog.current = el; el?.focus(); }, []);
  // Confirming is a deliberate step, so unlike the two questions it has a way
  // back. Not while the switch runs: there is nothing to go back to mid-move.
  useEscapeToClose(() => { if (!running) onLeave(); });

  // The dry run, again whenever a box changes: a ticked document moves.
  const tickedKey = ticked.join("\n");
  useEffect(() => {
    let live = true;
    planSwitch(root, to, ticked)
      .then((p) => { if (live) { setPlan(p); setPlanError(null); } })
      .catch((e) => { if (live) { setPlan(null); setPlanError(String(e)); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ticked paths, not the array
  }, [root, to, tickedKey, round]);

  useEffect(() => {
    let live = true;
    openInProject(root).then((o) => { if (live) setOpen(o); }).catch(() => {});
    return () => { live = false; };
  }, [root]);

  const tick = (path: string, on: boolean) =>
    setTicked((t) => (on ? [...t.filter((p) => p !== path), path] : t.filter((p) => p !== path)));

  const confirm = async () => {
    if (!plan || plan.blocked || running) return;
    setRunning(true);
    setError(null);
    try {
      onDone(await runSwitch(root, plan));
    } catch (e) {
      setError(String(e));
      setRunning(false);
      setRound((r) => r + 1);
    }
  };

  const busyOpen = open && (open.panes.length > 0 || open.agents.length > 0);

  return (
    <div
      className="contracts-panel-overlay"
      // A press on the backdrop must not take the keyboard from the dialog.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        dialog.current?.focus();
      }}
    >
      <div
        className="contracts-panel new-tab-dialog switch-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={`Switch to BMAD ${to}`}
        tabIndex={-1}
        ref={focusOnMount}
      >
        <div className="contracts-panel__header">
          <h2>Switch to BMAD {to}</h2>
          <span className="contracts-panel__root" title={root}>{root}</span>
        </div>
        <div className="switch-confirm__body">
          {!plan && !planError && <p>Checking what would move…</p>}
          {planError && <div className="integrations-msg" data-kind="error" role="alert">{planError}</div>}
          {plan && (
            <>
              {plan.archive && (
                <p>
                  The old version moves into <code>{plan.archive}/</code> inside this project. Nothing is deleted.
                </p>
              )}
              {plan.moves.length > 0 && (
                <Section title="Moves to the archive"><Moves moves={plan.moves} /></Section>
              )}
              {plan.documents.length > 0 && (
                <Section title="Your documents (stay)">
                  <ul>
                    {plan.documents.map((d) => (
                      <li key={d.path}>
                        <label>
                          <input
                            type="checkbox"
                            checked={ticked.includes(d.path)}
                            disabled={running}
                            onChange={(e) => tick(d.path, e.target.checked)}
                          />
                          <code>{d.path}</code> <small>{count(d.files)}</small> <span>Archive this too</span>
                        </label>
                        {d.ticked && d.warning && <p className="switch-confirm__warning">{d.warning}</p>}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {plan.leftInPlace.length > 0 && (
                <Section title="Left in place">
                  <ul>
                    {plan.leftInPlace.map((n) => (
                      <li key={n.path}><code>{n.path}</code> <small>{n.reason}</small></li>
                    ))}
                  </ul>
                </Section>
              )}
              {plan.leftovers.length > 0 && (
                <Section title="Leftovers">
                  <p>
                    Files of BMAD {to} already in the project. They move to <code>{plan.archive}/leftovers-{to}/</code> so setup starts clean.
                  </p>
                  <Moves moves={plan.leftovers} />
                </Section>
              )}
              <Section title="The new version installs"><p>{INSTALLS[to]}</p></Section>
              {busyOpen && (
                <Section title="Open in this project">
                  <ul>
                    {open.panes.map((p, i) => (
                      <li key={`pane-${i}`}>Terminal <b>{p.tab}</b> <small>{p.cwd}</small></li>
                    ))}
                    {open.agents.map((a, i) => (
                      <li key={`agent-${i}`}>Agent <b>{a.name}</b> <small>{a.cwd}</small></li>
                    ))}
                  </ul>
                  <p className="switch-confirm__warning">Stop agents before switching: they may keep writing into moved folders</p>
                </Section>
              )}
              <Section title="Git"><GitNotes plan={plan} /></Section>
              {plan.blocked && <div className="integrations-msg" data-kind="error" role="alert">{plan.blocked}</div>}
            </>
          )}
          {error && <div className="integrations-msg" data-kind="error" role="alert">{error}</div>}
        </div>
        <div className="switch-confirm__actions">
          <button type="button" className="ig-btn" disabled={running} onClick={onLeave}>{leaveLabel}</button>
          <button type="button" className="ig-btn" data-primary disabled={!plan || !!plan.blocked || running} onClick={confirm}>
            {running ? "Switching…" : "Archive and switch"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Add to `src/index.css`, after the `.new-tab-foot` rule (line 651):

```css
/* The switch's confirm step: a list of what would move, tall enough to scroll. */
.switch-confirm { width: min(620px, 94vw); }
.switch-confirm__body { max-height: 60vh; overflow-y: auto; padding: 10px 16px; font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 10px; }
.switch-confirm__body p { margin: 0; }
.switch-confirm__body code { font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); }
.switch-confirm__section h3 { margin: 0 0 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
.switch-confirm__section ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.switch-confirm__section small { color: var(--text-muted); }
.switch-confirm__section label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.switch-confirm__warning { color: var(--text-primary); }
.switch-confirm__actions { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/__tests__/SwitchConfirm.test.tsx`
Expected: PASS.

Two things the tests lean on, in case one fails:
- A `<section>` has the `region` role only when it has an accessible name. `aria-label={title}` gives it one.
- In "says Couldn't check git…", the section's text is its heading followed by the one note, hence `"GitCouldn't check git."`.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/SwitchConfirm.tsx src/components/__tests__/SwitchConfirm.test.tsx src/index.css
git commit -m "feat(switch): the confirm dialog, filled from the dry run"
```

---

### Task 13: Keep or switch, asked from New Tab

**Files:**
- Modify: `src/lib/methodologyPrompt.ts:26-55` (the store, the open questions, `settlePrompt`), `:106-111` (the test seam; add the switch entry points before it)
- Modify: `src/components/MethodologyPrompt.tsx` (whole file)
- Modify: `src/lib/newTab.ts` (`openProjectTab`)
- Test: `src/components/__tests__/MethodologyPrompt.test.tsx`, `src/lib/__tests__/methodologyPrompt.test.ts`, `src/components/__tests__/NewTabDialog.test.tsx`, `src/hooks/__tests__/useProjectSetup.test.tsx`

**Interfaces:**
- Consumes: `SwitchConfirm` (Task 12); `otherVersion`, `SwitchResult` (Task 10); `isKept`, `markKept` (Task 9).
- Produces (`src/lib/methodologyPrompt.ts`):
  - `export type PromptRequest = { root: string; mode: "choose" } | { root: string; mode: "keep"; methodology: Methodology } | { root: string; mode: "confirm"; from: Methodology; to: Methodology; back: boolean }`. `useMethodologyPrompt`'s `request` is `PromptRequest | null`.
  - `export type SwitchAnswer = { kind: "kept" } | { kind: "switched"; result: SwitchResult } | { kind: "dismissed" }`
  - `export function askKeepOrSwitch(root: string, methodology: Methodology): Promise<SwitchAnswer>`: the keep-or-switch question.
  - `export function askSwitch(root: string, from: Methodology): Promise<SwitchAnswer>`: the confirm step on its own, with **Cancel**.
  - `export function switchOnDemand(root: string): Promise<SwitchAnswer>`: `askSwitch` for whatever the project is on; throws "This project has no BMAD to switch from." when it has none.
  - `export function keepVersion(): void`, `startSwitch(): void`, `leaveConfirm(): void`, `finishSwitch(result: SwitchResult): void`: what the dialog's buttons do.
  - `export function dismissPrompts(): void`: settle whatever is open as dismissed.
- Produces (`src/components/MethodologyPrompt.tsx`): `MethodologyPrompt` takes `mode?: "choose"` with `onAnswer`, or `mode: "keep"` with `methodology`, `onKeep` and `onSwitch`. The host renders `SwitchConfirm` for a `confirm` request.

- [ ] **Step 1: Update the tests that read the request's shape**

A request now carries its mode. Change these six expectations (the line numbers are from before Task 11 added to these files; find each by its text):

`src/lib/__tests__/methodologyPrompt.test.ts` line 36:

```ts
const asked = (root: string) => vi.waitFor(() => expect(request()).toEqual({ root, mode: "choose" }));
```

and lines 174 and 182, both:

```ts
    expect(request()).toEqual({ root: "/code/shop", mode: "choose" });
```

`src/components/__tests__/MethodologyPrompt.test.tsx` line 143:

```ts
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "choose" });
```

`src/hooks/__tests__/useProjectSetup.test.tsx` line 286:

```ts
  const dialogAsks = (root: string) => waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root, mode: "choose" }));
```

and line 408:

```ts
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/mono/app", mode: "choose" }));
```

- [ ] **Step 2: Write the failing tests**

Append to `src/components/__tests__/MethodologyPrompt.test.tsx` (add `askKeepOrSwitch, askSwitch` to its import from `"../../lib/methodologyPrompt"`, and `isKept` from `"../../lib/projectSetup"`):

```tsx
describe("MethodologyPrompt, keep-or-switch mode", () => {
  const keepDialog = () => screen.getByRole("dialog", { name: "BMAD version" });
  const renderKeep = () => {
    const onKeep = vi.fn();
    const onSwitch = vi.fn();
    render(<MethodologyPrompt mode="keep" root="/code/shop" methodology="v4" onKeep={onKeep} onSwitch={onSwitch} />);
    return { onKeep, onSwitch };
  };

  it("asks in the spec's words, with the project, its version and both answers in bold", () => {
    renderKeep();
    expect(question()!.textContent).toBe("shop uses BMAD v4. Keep v4 (default) · Switch to v6…");
    expect([...question()!.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["shop", "BMAD v4", "Keep v4", "Switch to v6…"]);
  });

  it("follows the version the project is on", () => {
    render(<MethodologyPrompt mode="keep" root="/code/shop" methodology="v6" onKeep={vi.fn()} onSwitch={vi.fn()} />);
    expect(question()!.textContent).toBe("shop uses BMAD v6. Keep v6 (default) · Switch to v4…");
  });

  it("keeps the version on Enter", () => {
    const { onKeep, onSwitch } = renderKeep();
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    expect(onKeep).toHaveBeenCalledOnce();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("goes to the switch by click, or by arrow and Enter", () => {
    const { onKeep, onSwitch } = renderKeep();
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(keepDialog(), { key: "ArrowDown" });
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    expect(onSwitch).toHaveBeenCalledTimes(2);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("must be answered: no close button, and Escape and a click outside do nothing", () => {
    const { onKeep, onSwitch } = renderKeep();
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(keepDialog().parentElement!);
    fireEvent.click(keepDialog().parentElement!);
    expect(onKeep).not.toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
    expect(keepDialog()).toBeTruthy();
  });
});

describe("MethodologyPromptHost, keeping or switching", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the version, and remembers not to ask this project again", async () => {
    render(<MethodologyPromptHost />);
    const answer = askKeepOrSwitch("/code/shop/", "v4");
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "BMAD version" }), { key: "Enter" });
    expect(await answer).toEqual({ kind: "kept" });
    expect(isKept("/code/shop")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the confirm step for Switch, and Back returns to the question unanswered", async () => {
    render(<MethodologyPromptHost />);
    let settled = false;
    void askKeepOrSwitch("/code/shop", "v4").then(() => { settled = true; });
    fireEvent.click(await screen.findByRole("option", { name: /Switch to v6…/ }));
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "confirm", from: "v4", to: "v6", back: true });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    expect(settled).toBe(false);
    expect(isKept("/code/shop")).toBe(false);
  });

  it("offers Cancel when the switch was asked for on its own, and Cancel closes it", async () => {
    render(<MethodologyPromptHost />);
    const answer = askSwitch("/code/shop", "v6");
    await screen.findByRole("dialog", { name: "Switch to BMAD v4" });
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "confirm", from: "v6", to: "v4", back: false });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await answer).toEqual({ kind: "dismissed" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("settles an open keep-or-switch question as dismissed when the host unmounts", async () => {
    const host = render(<MethodologyPromptHost />);
    const answer = askKeepOrSwitch("/code/shop", "v4");
    await screen.findByRole("dialog", { name: "BMAD version" });
    host.unmount();
    expect(await answer).toEqual({ kind: "dismissed" });
  });
});
```

`SwitchConfirm` plans as soon as it mounts. In that file's `@tauri-apps/api/core` mock, add before the `throw`:

```ts
    if (command === "bmad_switch_plan") {
      return { from: "v4", to: "v6", archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [], leftInPlace: [], dirty: null, archiveIgnored: null, blocked: null };
    }
    if (command === "bmad_switch_pending") return [];
```

and add, below that mock:

```ts
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null) }));
```

Append to `src/lib/__tests__/methodologyPrompt.test.ts` (add `askKeepOrSwitch, askSwitch, switchOnDemand` to its import from `"../methodologyPrompt"`):

```ts
describe("one dialog at a time, across both questions", () => {
  it("dismisses a keep-or-switch question when another project is asked about", async () => {
    const keep = askKeepOrSwitch("/code/old", "v4");
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v4" });
    const choose = askMethodology("/code/shop");
    await asked("/code/shop");
    expect(await keep).toEqual({ kind: "dismissed" });
    settlePrompt({ kind: "dismissed" });
    await choose;
  });

  it("dismisses a choose question when a switch is asked for", async () => {
    const choose = askMethodology("/code/shop");
    await asked("/code/shop");
    void askSwitch("/code/old", "v4");
    expect(await choose).toEqual({ kind: "dismissed" });
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: false });
  });

  it("shares one keep-or-switch question between two callers for the same project", () => {
    expect(askKeepOrSwitch("/code/old/", "v4")).toBe(askKeepOrSwitch("/code/old", "v4"));
  });

  it("is not closed by a choose answer that isn't its own", () => {
    void askKeepOrSwitch("/code/old", "v4");
    settlePrompt({ kind: "dismissed" });
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v4" });
  });

  it("blocks New Tab while keep-or-switch is open, as while choosing", () => {
    useSettingsStore.setState({ askOnNewTab: false });
    const before = useTabStore.getState().tabs.length;
    void askKeepOrSwitch("/code/old", "v4");
    requestNewTab();
    expect(useTabStore.getState().tabs).toHaveLength(before);
  });
});

describe("switchOnDemand", () => {
  it("opens the confirm step for the other version than the project is on", async () => {
    tauri.byDir = { "/code/old": "v4", "/code/new": "v6" };
    void switchOnDemand("/code/old/");
    await vi.waitFor(() => expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: false }));
    void switchOnDemand("/code/new");
    await vi.waitFor(() => expect(request()).toEqual({ root: "/code/new", mode: "confirm", from: "v6", to: "v4", back: false }));
  });

  it("refuses a project with no BMAD", async () => {
    await expect(switchOnDemand("/code/shop")).rejects.toBe("This project has no BMAD to switch from.");
    expect(request()).toBeNull();
  });
});
```

In `src/components/__tests__/NewTabDialog.test.tsx`:

Add `switches: [] as Record<string, unknown>[]` to the hoisted `tauri` object, add these cases to the mock's `switch`

```ts
      case "bmad_switch_plan":
        return {
          from: "v4", to: args.to, archive: ".ade/archive/bmad-v4-2026-10-11",
          moves: [{ from: ".bmad-core", to: ".ade/archive/bmad-v4-2026-10-11/.bmad-core", files: 2, ignored: "none" }],
          documents: [], leftovers: [], leftInPlace: [], dirty: false, archiveIgnored: false, blocked: null,
        };
      case "bmad_switch_apply":
        tauri.switches.push(args);
        return {
          archive: ".ade/archive/bmad-v4-2026-10-11", moved: 2,
          setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true,
        };
```

add `tauri.switches.length = 0;` to `beforeEach`, add below the `plugin-dialog` mock

```ts
// The confirm step asks every pane for its folder; there is no terminal here.
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null), destroyInstance: vi.fn(), detachInstance: vi.fn() }));
```

and add this helper beside `settle`:

```ts
/** Projects that have already answered keep-or-switch. */
const kept = (...roots: string[]) => localStorage.setItem("ade-bmad-kept", JSON.stringify(roots));
```

Two existing tests open a project that has BMAD and expect no question. That is now true only of a kept project, so make them say so. In "does not ask about a project that is already on a version", add as the first line of the test body

```ts
    kept("/Users/testuser/code/oldapp");
```

and in "uses the project above the picked folder when that one has BMAD", add as the first line

```ts
    kept(MONO);
```

Then append:

```ts
describe("a project that already has BMAD", () => {
  const OLDAPP = "/Users/testuser/code/oldapp";
  const ASK = "oldapp uses BMAD v4. Keep v4 (default) · Switch to v6…";
  const keepDialog = () => screen.getByRole("dialog", { name: "BMAD version" });
  const isKeptNow = () => JSON.parse(localStorage.getItem("ade-bmad-kept") ?? "[]") as string[];

  beforeEach(() => {
    tauri.methodology = "v4";
    picker.picked = OLDAPP;
  });

  it("is asked to keep or switch, and is not opened until that is answered", async () => {
    const onClose = renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    expect(onClose).toHaveBeenCalledOnce();
    expect(tabs()).toBe(before);

    // Escape is no answer.
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(question()).toBe(ASK);
    expect(tabs()).toBe(before);
    expect(tauri.applies).toHaveLength(0);

    // Enter keeps the version: the folder opens and is set up on it.
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(lastApply().root).toBe(OLDAPP);
    expect(isKeptNow()).toEqual([OLDAPP]);
    expect(question()).toBeNull();
    expect(tauri.switches).toHaveLength(0);
  });

  it("is not asked again once kept", async () => {
    kept(OLDAPP);
    renderDialog();
    open(/Open project/);
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(question()).toBeNull();
  });

  it("is asked about the project above the picked folder when that one has BMAD", async () => {
    const MONO = "/Users/testuser/code/mono";
    tauri.methodology = null;
    tauri.roots = { [`${MONO}/app`]: MONO };
    tauri.byDir = { [MONO]: "v6" };
    picker.picked = `${MONO}/app`;
    renderDialog();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe("mono uses BMAD v6. Keep v6 (default) · Switch to v4…"));
  });

  it("goes to the confirm step on Switch, and Back returns to the question", async () => {
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    await screen.findByRole("dialog", { name: "Switch to BMAD v6" });
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(question()).toBe(ASK));
    expect(tabs()).toBe(before);
    expect(tauri.switches).toHaveLength(0);
    expect(isKeptNow()).toEqual([]);
  });

  it("opens after a switch, kept, with no second setup", async () => {
    const setupDone = vi.fn();
    window.addEventListener("project-setup-done", setupDone);
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    const confirm = await screen.findByRole("button", { name: "Archive and switch" });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(tauri.switches).toHaveLength(1);
    expect(tauri.switches[0]).toMatchObject({ root: OLDAPP, to: "v6" });
    expect(isKeptNow()).toEqual([OLDAPP]);
    await settle();
    expect(tauri.applies, "the switch set the project up").toHaveLength(0);
    expect(setupDone).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    window.removeEventListener("project-setup-done", setupDone);
  });

  it("is not asked with automatic setup off, or when its setup was undone", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();

    useSettingsStore.getState().setAutoProjectSetup(true);
    localStorage.setItem("ade-project-setup-declined", JSON.stringify([OLDAPP]));
    await openProjectTab(OLDAPP);
    expect(tabs()).toBe(before + 2);
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});
```

Append to `src/hooks/__tests__/useProjectSetup.test.tsx`, inside `describe("a project that has BMAD", …)`:

```ts
  it("is never asked to keep or switch from the cd hook, kept or not", async () => {
    tauri.byDir = { "/code/old": "v4" };
    expect(localStorage.getItem("ade-bmad-kept")).toBeNull();
    mount("/code/old");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    await settle();
    expect(useMethodologyPrompt.getState().request).toBeNull();
    expect(questions()).toHaveLength(0);
    expect(toasts().some((t) => /Keep|Switch/.test(`${t.title} ${t.body}`))).toBe(false);
  });
```

- [ ] **Step 3: Run them**

Run: `npx vitest run src/components/__tests__/MethodologyPrompt.test.tsx src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/NewTabDialog.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: FAIL: `askKeepOrSwitch` is not exported, the request has no `mode`, and New Tab opens a project that has BMAD without asking.

- [ ] **Step 4: Implement the prompt's modes in `src/lib/methodologyPrompt.ts`**

Change the imports at the top to

```ts
import { create } from "zustand";
import { otherVersion, pendingSwitches, type SwitchResult } from "./bmadSwitch";
import {
  detectOnDisk, isSetupCandidate, markKept, normRoot, onProjectSetUp, setUpProject, type Methodology, type SetupResult,
} from "./projectSetup";
```

Replace everything from `/** The project the dialog is asking about; MethodologyPromptHost renders it. */` down to and including `settlePrompt` (lines 26–48) with

```ts
/**
 * What the shared dialog is showing, which MethodologyPromptHost renders:
 * which version to set up (`choose`), keep the version or switch (`keep`), or
 * the switch's confirm step (`confirm`). `back`: confirm came from the
 * keep-or-switch question and returns to it; otherwise it closes.
 */
export type PromptRequest =
  | { root: string; mode: "choose" }
  | { root: string; mode: "keep"; methodology: Methodology }
  | { root: string; mode: "confirm"; from: Methodology; to: Methodology; back: boolean };

export const useMethodologyPrompt = create<{ request: PromptRequest | null }>(() => ({ request: null }));

/** How a keep-or-switch question, or a switch asked for on its own, ended. */
export type SwitchAnswer =
  | { kind: "kept" }
  | { kind: "switched"; result: SwitchResult }
  | { kind: "dismissed" };

let waiting: { root: string; promise: Promise<MethodologyAnswer>; resolve: (a: MethodologyAnswer) => void } | null = null;
let deciding: { root: string; promise: Promise<SwitchAnswer>; resolve: (a: SwitchAnswer) => void } | null = null;

/** One dialog at a time: a question that is covered by a newer one is over. */
function supersede() {
  const [choose, decide] = [waiting, deciding];
  waiting = null;
  deciding = null;
  choose?.resolve({ kind: "dismissed" });
  decide?.resolve({ kind: "dismissed" });
}

const askByDialog: AskUi = (root) => {
  if (waiting?.root === root) return waiting.promise;
  supersede();
  let resolve!: (a: MethodologyAnswer) => void;
  const promise = new Promise<MethodologyAnswer>((r) => { resolve = r; });
  waiting = { root, promise, resolve };
  useMethodologyPrompt.setState({ request: { root, mode: "choose" } });
  return promise;
};

/** Answer the open "which version" dialog and close it. */
export function settlePrompt(answer: MethodologyAnswer) {
  const open = waiting;
  waiting = null;
  // Only its own dialog: a keep-or-switch question on screen is someone else's.
  if (useMethodologyPrompt.getState().request?.mode === "choose") useMethodologyPrompt.setState({ request: null });
  open?.resolve(answer);
}
```

Add, directly above `/** Test seam: forget any open question. */`:

```ts
function decide(request: PromptRequest): Promise<SwitchAnswer> {
  if (deciding?.root === request.root) return deciding.promise;
  supersede();
  let resolve!: (a: SwitchAnswer) => void;
  const promise = new Promise<SwitchAnswer>((r) => { resolve = r; });
  deciding = { root: request.root, promise, resolve };
  useMethodologyPrompt.setState({ request });
  return promise;
}

function settleSwitch(answer: SwitchAnswer) {
  const open = deciding;
  deciding = null;
  if (useMethodologyPrompt.getState().request?.mode !== "choose") useMethodologyPrompt.setState({ request: null });
  open?.resolve(answer);
}

/**
 * "shop uses BMAD v4. Keep v4 (default) · Switch to v6…": asked from New Tab
 * about a project that already has BMAD, until it is answered once. Like the
 * version question it must be answered; `dismissed` only means another
 * project's question replaced it, or the dialog's host went away.
 */
export function askKeepOrSwitch(root: string, methodology: Methodology): Promise<SwitchAnswer> {
  return decide({ root: normRoot(root), mode: "keep", methodology });
}

/**
 * The switch's confirm step on its own, for the palette and the board. It has
 * Cancel: nobody was asked a question, so there is nothing that must be answered.
 */
export function askSwitch(root: string, from: Methodology): Promise<SwitchAnswer> {
  return decide({ root: normRoot(root), mode: "confirm", from, to: otherVersion(from), back: false });
}

const NO_BMAD = "This project has no BMAD to switch from.";

/** Switch `root` to the other version than it is on, after the confirm step. */
export async function switchOnDemand(root: string): Promise<SwitchAnswer> {
  const at = normRoot(root);
  const from = await detectOnDisk(at);
  // A string, as NOT_A_PROJECT is: callers show it as it is.
  if (!from) throw NO_BMAD;
  return askSwitch(at, from);
}

/** Keep: the project stays on its version, and isn't asked again. */
export function keepVersion() {
  if (deciding) markKept(deciding.root);
  settleSwitch({ kind: "kept" });
}

/** Switch…: on to the confirm step. Nothing has changed yet. */
export function startSwitch() {
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode !== "keep") return;
  const to = otherVersion(request.methodology);
  useMethodologyPrompt.setState({ request: { root: request.root, mode: "confirm", from: request.methodology, to, back: true } });
}

/** Back, or Cancel: leave the confirm step with the project as it was. */
export function leaveConfirm() {
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode !== "confirm") return;
  if (request.back) useMethodologyPrompt.setState({ request: { root: request.root, mode: "keep", methodology: request.from } });
  else settleSwitch({ kind: "dismissed" });
}

/** The switch ran. runSwitch has already added the project to the kept list. */
export function finishSwitch(result: SwitchResult) {
  settleSwitch({ kind: "switched", result });
}

/** Nobody is left to answer: whatever is open is over. */
export function dismissPrompts() {
  settlePrompt({ kind: "dismissed" });
  settleSwitch({ kind: "dismissed" });
}
```

Replace the test seam with

```ts
/** Test seam: forget any open question. */
export function __resetPromptForTests() {
  waiting = null;
  deciding = null;
  useMethodologyPrompt.setState({ request: null });
}
```

- [ ] **Step 5: Give the dialog its keep-or-switch mode**

Replace `src/components/MethodologyPrompt.tsx` with

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  dismissPrompts, finishSwitch, keepVersion, leaveConfirm, projectName, settlePrompt, startSwitch, useMethodologyPrompt,
} from "../lib/methodologyPrompt";
import { otherVersion } from "../lib/bmadSwitch";
import type { Methodology } from "../lib/projectSetup";
import SwitchConfirm from "./SwitchConfirm";
import { useEscapeToClose } from "./useEscapeToClose";

const VERSIONS: { methodology: Methodology; icon: string; title: string; detail: string }[] = [
  { methodology: "v6", icon: "▣", title: "BMAD v6 (default)", detail: "Skills, _bmad/ and the runtime — the current BMAD" },
  { methodology: "v4", icon: "▤", title: "BMAD v4", detail: "Classic .bmad-core/ and the /BMad commands" },
];

const noop = () => {};

interface Row {
  key: string;
  icon: string;
  title: string;
  detail: string;
  pick(): void;
}

type Props =
  /** "Which BMAD version?", for a project that has neither. */
  | { root: string; mode?: "choose"; onAnswer(methodology: Methodology): void }
  /** "Keep it or switch?", for a project that already has one. */
  | { root: string; mode: "keep"; methodology: Methodology; onKeep(): void; onSwitch(): void };

/** A question about a project's BMAD version that must be answered. The first row is the default. */
export function MethodologyPrompt(props: Props) {
  const { root } = props;
  const name = projectName(root);
  let heading: string;
  let question: ReactNode;
  let rows: Row[];
  if (props.mode === "keep") {
    const { methodology, onKeep, onSwitch } = props;
    const other = otherVersion(methodology);
    heading = "BMAD version";
    question = (
      <>
        <b>{name}</b> uses <b>BMAD {methodology}</b>. <b>Keep {methodology}</b> (default) · <b>Switch to {other}…</b>
      </>
    );
    rows = [
      { key: "keep", icon: "▣", title: `Keep ${methodology} (default)`, detail: "Open the project as it is", pick: onKeep },
      {
        key: "switch",
        icon: "⇄",
        title: `Switch to ${other}…`,
        detail: `Archive ${methodology} inside the project, then set up ${other}. You confirm first.`,
        pick: onSwitch,
      },
    ];
  } else {
    const { onAnswer } = props;
    heading = "Set up project";
    question = (
      <>
        Set up <b>{name}</b> with <b>BMAD v6</b> (default) or <b>BMAD v4</b>?
      </>
    );
    rows = VERSIONS.map((v) => ({ key: v.methodology, icon: v.icon, title: v.title, detail: v.detail, pick: () => onAnswer(v.methodology) }));
  }

  const [cursor, setCursor] = useState(0);
  // A stable ref callback: an inline arrow would run again on every render and
  // pull focus back to the dialog.
  const dialog = useRef<HTMLDivElement | null>(null);
  const focusOnMount = useCallback((el: HTMLDivElement | null) => { dialog.current = el; el?.focus(); }, []);
  // The question must be answered. Registered anyway so that, as the top of
  // the stack, it keeps Escape from closing a panel beneath it.
  useEscapeToClose(noop);

  return (
    <div
      className="contracts-panel-overlay"
      // A press on the backdrop answers nothing, and must not take the keyboard
      // from the dialog either: Enter and the arrows would stop working.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        dialog.current?.focus();
      }}
    >
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        ref={focusOnMount}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => 1 - c); }
          else if (e.key === "Enter" && !e.repeat && (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute("role") === "option")) { e.preventDefault(); rows[cursor].pick(); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>{heading}</h2>
          <span className="contracts-panel__root" title={root}>{root}</span>
        </div>
        <p className="new-tab-ask">{question}</p>
        <ul className="new-tab-list" role="listbox" aria-label="BMAD version">
          {rows.map((row, i) => (
            <li
              key={row.key}
              role="option"
              aria-selected={cursor === i}
              onMouseEnter={() => setCursor(i)}
              onClick={row.pick}
            >
              <span className="new-tab-icon" aria-hidden="true">{row.icon}</span>
              <span className="new-tab-main"><b>{row.title}</b><small>{row.detail}</small></span>
              {i === 0 && <kbd>↵</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Renders the dialog for whichever project is being asked about, in the mode it is asked in. */
export default function MethodologyPromptHost() {
  const request = useMethodologyPrompt((s) => s.request);
  // Nobody is left to answer a question the host can no longer show.
  useEffect(() => () => dismissPrompts(), []);
  if (!request) return null;
  if (request.mode === "confirm") {
    return (
      <SwitchConfirm
        key={`confirm:${request.root}`}
        root={request.root}
        to={request.to}
        leaveLabel={request.back ? "Back" : "Cancel"}
        onLeave={leaveConfirm}
        onDone={finishSwitch}
      />
    );
  }
  if (request.mode === "keep") {
    return (
      <MethodologyPrompt
        // A new project, or the way back from confirm, is a new question: the highlight starts on Keep again.
        key={`keep:${request.root}`}
        mode="keep"
        root={request.root}
        methodology={request.methodology}
        onKeep={keepVersion}
        onSwitch={startSwitch}
      />
    );
  }
  return (
    <MethodologyPrompt
      // A new project is a new question: the highlight starts on v6 again.
      key={request.root}
      root={request.root}
      onAnswer={(methodology) => settlePrompt({ kind: "chosen", methodology, asked: true })}
    />
  );
}
```

- [ ] **Step 6: Ask from New Tab**

`src/lib/newTab.ts`: change the imports of the two libs to

```ts
import { askKeepOrSwitch, askMethodology, useMethodologyPrompt, versionToSetUp } from "./methodologyPrompt";
import { bmadRootOf, isKept, isSetupCandidate, normRoot, setUpProject, setupDeclined } from "./projectSetup";
```

and replace `openProjectTab` (its doc comment included) with

```ts
/**
 * Open a terminal tab in a project folder, remember it, and set the project up
 * (BMAD, the ADE methodology, the role agents) unless that's turned off.
 *
 * A project with no BMAD is asked which version first; one that has BMAD and
 * hasn't been asked before is asked to keep it or switch. Both must be
 * answered: until then the folder is neither opened nor remembered. That also
 * keeps the cd hook from asking about the same project at the same moment, and
 * means a switch runs before any terminal sits in the folders it moves.
 *
 * A project whose BMAD switch didn't finish is opened as it is, with no setup:
 * a terminal there is how it gets resolved.
 */
export async function openProjectTab(path: string): Promise<void> {
  const root = await setupRootFor(path);
  const answer = root ? await askMethodology(root) : null;
  if (answer?.kind === "blocked") {
    rememberProject(path);
    useTabStore.getState().addTab(undefined, path);
    window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: answer.reason } }));
    return;
  }
  // Not answered: a question about another project took this one's place.
  if (answer && answer.kind !== "chosen") return;
  // Only New Tab asks this, and only once per project: the cd hook never does.
  let switched = false;
  if (root && answer && !answer.asked && !answer.done && !isKept(root)) {
    const decision = await askKeepOrSwitch(root, answer.methodology);
    if (decision.kind === "dismissed") return;
    switched = decision.kind === "switched";
  }
  rememberProject(path);
  useTabStore.getState().addTab(undefined, path);
  // `done`: set up, and announced, by another route while the question was
  // open. `switched`: the switch set it up, and reports through its own event.
  if (!root || !answer || answer.done || switched) return;
  // Not awaited: the terminal is usable while the files are written.
  versionToSetUp(root, answer)
    .then((methodology) => setUpProject(root, methodology))
    .then((result) => window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result })))
    .catch((e) => window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: `Project setup failed: ${e}` } })));
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components/__tests__/MethodologyPrompt.test.tsx src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/NewTabDialog.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: PASS.

Run: `npx vitest run src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/BoardPanel.test.tsx src/components/__tests__/AgentsTab.test.tsx`
Expected: PASS: those entry points still see choose mode only.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/methodologyPrompt.ts src/lib/newTab.ts src/components/MethodologyPrompt.tsx src/components/__tests__/MethodologyPrompt.test.tsx src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/NewTabDialog.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx
git commit -m "feat(switch): New Tab asks a project that has BMAD to keep its version or switch"
```

---

### Task 14: The board during a switch, and after one that didn't finish

**Files:**
- Modify: `src/lib/boardWatch.ts:15` (add `watchExcludes` after `watchExtensions`)
- Modify: `src/components/board/useBoardWatchers.ts:3`, `:62` (pass `exclude`)
- Modify: `src/components/board/BoardPanel.tsx:1-19` (imports), `:36-75` (state, effects, watch targets), `:113-117` (the body), `:163-167` (the warning)
- Test: `src/lib/__tests__/boardWatch.test.ts`, `src/components/__tests__/BoardPanel.test.tsx`

**Interfaces:**
- Consumes: `isSwitching(root)`, `onSwitchChange(listener)`, `beginSwitch(root)` (Task 10); `pendingSwitches(root)`, `PendingSwitch` (Task 10); `watch_directory`'s `exclude` (Task 8).
- Produces (`src/lib/boardWatch.ts`): `export function watchExcludes(dir: string): string[]`: `[<dir>/archive]` for a `.ade` folder, `[]` for any other.
- The board shows "Switching…" in place of everything else while its project is being switched, watches nothing and refreshes nothing meanwhile, refreshes once when the switch ends, and shows a warning that links to `ARCHIVE.md` when a switch is pending.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/boardWatch.test.ts`, add `watchExcludes` to the import from `"../boardWatch"` and append:

```ts
describe("watchExcludes", () => {
  it("keeps the archive out of the .ade watch, and nothing out of any other", () => {
    expect(watchExcludes("/p/.ade")).toEqual(["/p/.ade/archive"]);
    expect(watchExcludes("/p/.ade/")).toEqual(["/p/.ade/archive"]);
    expect(watchExcludes("C:\\p\\.ade")).toEqual(["C:\\p\\.ade/archive"]);
    expect(watchExcludes("/p/docs")).toEqual([]);
    expect(watchExcludes("/p/.adept")).toEqual([]);
  });
});
```

In `src/components/__tests__/BoardPanel.test.tsx`:

Add `pending: [] as unknown[]` to the hoisted `disk` object, add this line to the `invoke` mock before `return null;`

```ts
    if (cmd === "bmad_switch_pending") return disk.pending;
```

add `disk.pending = [];` to `beforeEach`, add below the `agentLaunch` mock

```ts
const opened = vi.hoisted(() => ({ file: vi.fn() }));
vi.mock("../../lib/openFile", async (original) => ({
  ...(await original<typeof import("../../lib/openFile")>()),
  openFileFromTerminal: opened.file,
}));
```

add `import { beginSwitch } from "../../lib/projectSetup";` beside the other imports, and append:

```tsx
describe("BoardPanel and a BMAD switch", () => {
  const unwatched = () => vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "unwatch_directory").length;

  it("passes the archive exclusion for its .ade watch, and none for the others", async () => {
    disk.exists = new Set(["/p/.ade", "/p/docs"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toEqual(expect.arrayContaining(["/p/.ade", "/p/docs"])));
    const args = (dir: string) => vi.mocked(invoke).mock.calls.find(([cmd, a]) => cmd === "watch_directory" && (a as { dir: string }).dir === dir)![1];
    expect(args("/p/.ade")).toMatchObject({ exclude: ["/p/.ade/archive"] });
    expect(args("/p/docs")).toMatchObject({ exclude: [] });
  });

  it("shows Switching… instead of Set up now while its project is being switched, then refreshes once", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Set up now" });

    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    expect(screen.getByText("Switching…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up now" })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    act(() => end());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.queryByText("Switching…")).toBeNull();
  });

  it("stops watching and ignores a focus refresh while the switch runs, then watches again", async () => {
    const scheduleRefresh = vi.fn();
    disk.exists = new Set(["/p/.ade"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false, scheduleRefresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toEqual(["/p/.ade"]));

    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    await waitFor(() => expect(unwatched()).toBe(1));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(scheduleRefresh).not.toHaveBeenCalled();

    act(() => end());
    await waitFor(() => expect(watched()).toEqual(["/p/.ade", "/p/.ade"]));
  });

  it("is not disturbed by another project's switch", async () => {
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Set up now" });
    let end!: () => void;
    act(() => { end = beginSwitch("/elsewhere"); });
    expect(screen.queryByText("Switching…")).toBeNull();
    act(() => end());
  });

  it("warns about a switch that didn't finish, and links to its ARCHIVE.md", async () => {
    disk.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "incomplete", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    const warning = await screen.findByRole("alert");
    expect(warning.textContent).toContain("A BMAD switch didn't finish here");
    fireEvent.click(screen.getByRole("button", { name: "ARCHIVE.md" }));
    expect(opened.file).toHaveBeenCalledWith("/p/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
  });

  it("shows no warning when nothing is pending", async () => {
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "bmad_switch_pending")).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/lib/__tests__/boardWatch.test.ts src/components/__tests__/BoardPanel.test.tsx`
Expected: FAIL: `watchExcludes` is not exported, the watch passes no `exclude`, the board shows "Set up now" during a switch, and there is no warning.

- [ ] **Step 3: Implement the exclusion**

`src/lib/boardWatch.ts`, after `watchExtensions` (which ends at line 15):

```ts
/**
 * Path prefixes whose events the watcher drops. `.ade/archive/` holds earlier
 * BMAD versions: the board never reads it, and a switch writes it in one burst.
 */
export function watchExcludes(dir: string): string[] {
  return /(^|[\\/])\.ade[\\/]*$/.test(dir) ? [`${dir.replace(/[\\/]+$/, "")}/archive`] : [];
}
```

`src/components/board/useBoardWatchers.ts`: change line 3 to

```ts
import { watchExcludes, watchExtensions } from "../../lib/boardWatch";
```

and line 62 from

```ts
        const id = await invoke<number>("watch_directory", { dir, extensions: watchExtensions(dir, methodology ?? "v4"), withContent: false, onEvent: channel }).catch(() => null);
```

to

```ts
        const id = await invoke<number>("watch_directory", { dir, extensions: watchExtensions(dir, methodology ?? "v4"), withContent: false, exclude: watchExcludes(dir), onEvent: channel }).catch(() => null);
```

- [ ] **Step 4: Implement the board's side**

`src/components/board/BoardPanel.tsx`. Change line 1 and the `projectSetup` import, and add one import:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
```

```tsx
import { isSetupCandidate, isSwitching, onSwitchChange, setupRootOf } from "../../lib/projectSetup";
import { pendingSwitches, type PendingSwitch } from "../../lib/bmadSwitch";
```

After `const dispatchKey = …` (line 34), add:

```tsx
/** Any switch starting or ending may be this project's: the panel asks again which. */
const subscribeToSwitches = (changed: () => void) => onSwitchChange(() => changed());

const LINK: React.CSSProperties = { background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit", textDecoration: "underline" };
```

After `const provider = useSettingsStore((s) => s.defaultProvider);` (line 43), add:

```tsx
  // A switch is moving this project's folders. Until it is over the board
  // watches nothing and rebuilds nothing: a half-moved tree reads as a project
  // with no BMAD, and every move would otherwise be a rebuild.
  const switching = useSyncExternalStore(subscribeToSwitches, () => !!root && isSwitching(root));
  const switchingRef = useRef(switching);
  switchingRef.current = switching;
  const [pending, setPending] = useState<PendingSwitch[]>([]);
```

Change the focus effect from

```tsx
    const onFocus = () => scheduleRefresh();
```

to

```tsx
    const onFocus = () => { if (!switchingRef.current) scheduleRefresh(); };
```

Change the watch targets from

```tsx
  const dirs = useMemo(
    () => (root && methodology ? watchTargets(root, methodology, board?.paths ?? null, map?.outputFolder) : []),
    [root, methodology, board?.paths, map?.outputFolder],
  );
```

to

```tsx
  const dirs = useMemo(
    () => (root && methodology && !switching ? watchTargets(root, methodology, board?.paths ?? null, map?.outputFolder) : []),
    [root, methodology, switching, board?.paths, map?.outputFolder],
  );
```

After `useBoardWatch(existing, methodology, scheduleRefresh);`, add:

```tsx
  // One refresh when the switch ends, whether it went through or was undone.
  const wasSwitching = useRef(false);
  useEffect(() => {
    if (wasSwitching.current && !switching) void refresh();
    wasSwitching.current = switching;
  }, [switching, refresh]);

  // A switch that didn't finish. This is the one thing the board reads from the
  // archive, and it asks again after each rebuild: resolving one by hand is an
  // edit to ARCHIVE.md, which the watcher (rightly) doesn't report.
  useEffect(() => {
    let live = true;
    if (!root || switching) { setPending([]); return; }
    pendingSwitches(root).then((found) => { if (live) setPending(found); });
    return () => { live = false; };
  }, [root, switching, board, map]);
```

In `body`, after `if (root === undefined) return <Empty>Loading…</Empty>;`, add:

```tsx
    if (switching) return <Empty>Switching…</Empty>;
```

In the returned JSX, between the header `<div>` (the one holding "Board") and `{body}`, add:

```tsx
      {root && pending.length > 0 && (
        <div role="alert" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
          A BMAD switch didn't finish here. Setup and switching wait until it is resolved:{" "}
          <button type="button" style={LINK} onClick={() => openFileFromTerminal(joinPath(root, `${pending[0].archive}/ARCHIVE.md`))}>ARCHIVE.md</button>
        </div>
      )}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/__tests__/boardWatch.test.ts src/components/__tests__/BoardPanel.test.tsx src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS. The contract test checks `exclude` against `watch_directory`'s parameters.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/boardWatch.ts src/components/board/useBoardWatchers.ts src/components/board/BoardPanel.tsx src/lib/__tests__/boardWatch.test.ts src/components/__tests__/BoardPanel.test.tsx
git commit -m "feat(board): step back during a BMAD switch, warn about one that didn't finish"
```

---

### Task 15: The switch's own toast

**Files:**
- Modify: `src/hooks/useProjectSetup.ts:1-26` (imports; add `announceSwitch` after `announceSetup`)
- Modify: `src/App.tsx:8-9` (imports), `:174-185` (listen for the switch's event)
- Test: `src/hooks/__tests__/announceSwitch.test.ts` (create)

**Interfaces:**
- Consumes: `SwitchDone`, `SWITCH_DONE_EVENT` (Task 10); `GuardToast`.
- Produces (`src/hooks/useProjectSetup.ts`): `export function announceSwitch(done: SwitchDone, show: (t: GuardToast) => void): void`. One action, **Open ARCHIVE.md**. No Undo.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/announceSwitch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const opened = vi.hoisted(() => ({ file: vi.fn() }));
vi.mock("../../lib/openFile", () => ({ openFileFromTerminal: opened.file }));

import { announceSwitch } from "../useProjectSetup";
import { toastActions, toastLifetime, type GuardToast } from "../useContextGuard";
import type { SwitchDone } from "../../lib/bmadSwitch";

const done = (over: Partial<SwitchDone["result"]> = {}): SwitchDone => ({
  root: "/code/shop",
  from: "v4",
  to: "v6",
  result: {
    archive: ".ade/archive/bmad-v4-2026-10-11",
    moved: 7,
    setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 },
    rulesAppended: true,
    archiveDenied: true,
    ...over,
  },
});

const announced = (d: SwitchDone): GuardToast => {
  const show = vi.fn<(t: GuardToast) => void>();
  announceSwitch(d, show);
  expect(show).toHaveBeenCalledOnce();
  return show.mock.calls[0][0];
};

beforeEach(() => opened.file.mockClear());

describe("announceSwitch", () => {
  it("says what was switched and where the old version went", () => {
    const toast = announced(done());
    expect(toast.title).toBe("Switched shop to BMAD v6");
    expect(toast.body).toContain("Moved 7 files to .ade/archive/bmad-v4-2026-10-11/.");
    expect(announced(done({ moved: 1 })).body).toContain("Moved 1 file to");
  });

  it("says agents already running keep their old role prompt until restarted", () => {
    expect(announced(done()).body).toContain("Agents already running keep their old role prompt until restarted.");
  });

  it("links to ARCHIVE.md and offers no Undo", () => {
    const toast = announced(done());
    const actions = toastActions(toast);
    expect(actions.map((a) => a.label)).toEqual(["Open ARCHIVE.md"]);
    actions[0].run!();
    expect(opened.file).toHaveBeenCalledWith("/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
    // A link, so it gets the time a button gets.
    expect(toastLifetime(toast)).toBe(15000);
  });

  it("says agents can't edit the archive when the permission rule is in place", () => {
    expect(announced(done()).body).toContain("Agents can't edit the archive");
  });

  it("says so when the permission rule couldn't be added", () => {
    const body = announced(done({ archiveDenied: false })).body;
    expect(body).toContain("couldn't be added to .claude/settings.json");
    expect(body).not.toContain("Agents can't edit the archive");
  });
});

describe("App", () => {
  it("announces a switch from its own event, apart from setup's", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(app).toMatch(/const onSwitch = \(e: Event\) => announceSwitch\(/);
    expect(app).toContain("window.addEventListener(SWITCH_DONE_EVENT, onSwitch);");
    expect(app).toContain("window.removeEventListener(SWITCH_DONE_EVENT, onSwitch);");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/hooks/__tests__/announceSwitch.test.ts`
Expected: FAIL, `announceSwitch` is not exported from `../useProjectSetup`.

- [ ] **Step 3: Implement**

`src/hooks/useProjectSetup.ts`: add to the imports

```ts
import type { SwitchDone } from "../lib/bmadSwitch";
import { joinPath } from "../lib/bmadRuntime/paths";
import { openFileFromTerminal } from "../lib/openFile";
```

and add after `announceSetup` (which ends at line 26):

```ts
/**
 * Say that a switch went through. Unlike a setup's toast it offers no Undo:
 * undoing the setup would leave the project with no BMAD at all. The way back
 * is in ARCHIVE.md, which it links to.
 */
export function announceSwitch(done: SwitchDone, show: (t: GuardToast) => void) {
  const { archive, moved, archiveDenied } = done.result;
  const guard = archiveDenied
    ? "Agents can't edit the archive: a permission rule in .claude/settings.json stops them."
    : "The permission rule that stops agents editing the archive couldn't be added to .claude/settings.json.";
  show({
    title: `Switched ${projectName(done.root)} to BMAD ${done.to}`,
    body: `Moved ${moved === 1 ? "1 file" : `${moved} files`} to ${archive}/. ${guard} Agents already running keep their old role prompt until restarted.`,
    action: { label: "Open ARCHIVE.md", run: () => openFileFromTerminal(joinPath(done.root, `${archive}/ARCHIVE.md`)) },
  });
}
```

`src/App.tsx`: change line 8 to

```tsx
import { useProjectSetup, announceSetup, announceSwitch } from "./hooks/useProjectSetup";
```

add after line 9 (`import type { SetupResult } from "./lib/projectSetup";`)

```tsx
import { SWITCH_DONE_EVENT, type SwitchDone } from "./lib/bmadSwitch";
```

and change the effect that listens for setups from

```tsx
  // Setups run elsewhere (new-tab dialog, command palette) report here.
  useEffect(() => {
    const onSetup = (e: Event) => announceSetup((e as CustomEvent<SetupResult>).detail, showToast);
    const onSetupFailed = (e: Event) =>
      showToast({ title: "Project setup", body: (e as CustomEvent<{ why: string }>).detail.why });
    window.addEventListener("project-setup-done", onSetup);
    window.addEventListener("project-setup-failed", onSetupFailed);
    return () => {
      window.removeEventListener("project-setup-done", onSetup);
      window.removeEventListener("project-setup-failed", onSetupFailed);
    };
  }, [showToast]);
```

to

```tsx
  // Setups run elsewhere (new-tab dialog, command palette) report here. A BMAD
  // switch has its own event: a setup's toast offers Undo, and undoing the
  // setup a switch ran would leave the project with no BMAD.
  useEffect(() => {
    const onSetup = (e: Event) => announceSetup((e as CustomEvent<SetupResult>).detail, showToast);
    const onSetupFailed = (e: Event) =>
      showToast({ title: "Project setup", body: (e as CustomEvent<{ why: string }>).detail.why });
    const onSwitch = (e: Event) => announceSwitch((e as CustomEvent<SwitchDone>).detail, showToast);
    window.addEventListener("project-setup-done", onSetup);
    window.addEventListener("project-setup-failed", onSetupFailed);
    window.addEventListener(SWITCH_DONE_EVENT, onSwitch);
    return () => {
      window.removeEventListener("project-setup-done", onSetup);
      window.removeEventListener("project-setup-failed", onSetupFailed);
      window.removeEventListener(SWITCH_DONE_EVENT, onSwitch);
    };
  }, [showToast]);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/hooks/__tests__/announceSwitch.test.ts src/hooks/__tests__/announceSetup.test.ts src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProjectSetup.ts src/App.tsx src/hooks/__tests__/announceSwitch.test.ts
git commit -m "feat(switch): report a finished switch in its own toast, with no Undo"
```

---

### Task 16: Switching on demand: the palette and the board link

**Files:**
- Modify: `src/components/CommandPalette.tsx:46-48` (the active pane's project), `:111` (the command, after "Project: Set up BMAD…"), `:189` (the memo's dependencies)
- Modify: `src/components/board/BoardPanel.tsx` (imports; the link at the bottom)
- Test: `src/components/__tests__/CommandPalette.test.tsx`, `src/components/__tests__/BoardPanel.test.tsx`

**Interfaces:**
- Consumes: `switchOnDemand(root): Promise<SwitchAnswer>` (Task 13); `otherVersion` (Task 10); `bmadRootOf(cwd)`.
- Produces: the palette command **BMAD: Switch to v6…** or **BMAD: Switch to v4…**, present only when the active pane is in a project that has BMAD; the board's **Switch to BMAD v6…** or **Switch to BMAD v4…** link at the bottom, present when the board shows a project with BMAD. Both open the confirm step with **Cancel**.

- [ ] **Step 1: Write the failing tests**

In `src/components/__tests__/CommandPalette.test.tsx`:

Add these cases to the `invoke` mock's `switch`

```ts
      case "bmad_switch_pending":
        return [];
      case "bmad_switch_plan":
        return {
          from: "v4", to: args.to, archive: ".ade/archive/bmad-v4-2026-10-11",
          moves: [], documents: [], leftovers: [], leftInPlace: [], dirty: null, archiveIgnored: null, blocked: null,
        };
```

add `useMethodologyPrompt` to the import from `"../../lib/methodologyPrompt"`, and append:

```tsx
describe("BMAD: Switch to the other version", () => {
  const request = () => useMethodologyPrompt.getState().request;

  it("offers v6 for a v4 project, and opens the confirm step with Cancel", async () => {
    tauri.byDir = { "/code/shop": "v4" };
    renderPalette();
    fireEvent.click(await screen.findByText("BMAD: Switch to v6…"));
    await waitFor(() => expect(request()).toEqual({ root: "/code/shop", mode: "confirm", from: "v4", to: "v6", back: false }));
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(tauri.applies).toHaveLength(0);
  });

  it("offers v4 for a v6 project", async () => {
    tauri.byDir = { "/code/shop": "v6" };
    renderPalette();
    expect(await screen.findByText("BMAD: Switch to v4…")).toBeTruthy();
    expect(screen.queryByText("BMAD: Switch to v6…")).toBeNull();
  });

  it("is not offered for a project with no BMAD, or a pane with no folder", async () => {
    renderPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/BMAD: Switch to/)).toBeNull();
  });

  it("is not offered for a pane with no folder", async () => {
    pane.cwd = null;
    tauri.byDir = { "/code/shop": "v4" };
    renderPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/BMAD: Switch to/)).toBeNull();
  });
});
```

In `src/components/__tests__/BoardPanel.test.tsx`:

Add this line to the `invoke` mock before `return null;`

```ts
    if (cmd === "bmad_switch_plan") {
      return { from: "v4", to: args.to, archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [], leftInPlace: [], dirty: null, archiveIgnored: null, blocked: null };
    }
```

add below the other mocks

```ts
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null), destroyInstance: vi.fn(), detachInstance: vi.fn() }));
```

add `useMethodologyPrompt` to the import from `"../../lib/methodologyPrompt"`, and append to `describe("BoardPanel and a BMAD switch", …)`:

```tsx
  it("links to the switch to the other version at the bottom, and opens the confirm step", async () => {
    disk.bmad = { "/p": "v4" };
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<><BoardPanel cwd="/p" onClose={vi.fn()} /><MethodologyPromptHost /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to BMAD v6…" }));
    await waitFor(() =>
      expect(useMethodologyPrompt.getState().request).toEqual({ root: "/p", mode: "confirm", from: "v4", to: "v6", back: false }),
    );
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
  });

  it("links to v4 from a v6 project", async () => {
    useBoardPanel.setState({ root: "/p", methodology: "v6", board: null, map: v6Map(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Switch to BMAD v4…" })).toBeTruthy();
  });

  it("has no switch link for a project with no BMAD, or while a switch runs", async () => {
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Set up now" });
    expect(screen.queryByRole("button", { name: /Switch to BMAD/ })).toBeNull();

    act(() => { useBoardPanel.setState({ methodology: "v4", board: v4Board() }); });
    await screen.findByRole("button", { name: "Switch to BMAD v6…" });
    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    expect(screen.queryByRole("button", { name: /Switch to BMAD/ })).toBeNull();
    act(() => end());
  });

  it("says why when the switch can't be offered after all", async () => {
    // The board still shows v4, but the marker is gone from disk.
    disk.bmad = {};
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to BMAD v6…" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This project has no BMAD to switch from.");
  });
```

`v6Map()` is the fixture the file's own "BoardPanel v6" test already uses.

- [ ] **Step 2: Run them**

Run: `npx vitest run src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/BoardPanel.test.tsx`
Expected: FAIL: neither the command nor the link exists.

- [ ] **Step 3: Implement the palette command**

`src/components/CommandPalette.tsx`. After `const { tabs, activeTabId, addTab, setActiveTab } = useTabStore();` (line 46), add:

```tsx
  // The BMAD project the active pane is in, and the version it is on: the
  // palette offers the switch to the other one. Null until that is known, and
  // for a pane with no folder or a project with no BMAD.
  const [bmadProject, setBmadProject] = useState<{ root: string; methodology: "v4" | "v6" } | null>(null);
  useEffect(() => {
    let live = true;
    const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    import("../hooks/useTerminal")
      .then(({ getPtyCwd }) => getPtyCwd(tab.activePaneId))
      .then(async (dir) => (dir ? (await import("../lib/projectSetup")).bmadRootOf(dir) : null))
      .then((found) => { if (live) setBmadProject(found); })
      .catch(() => {});
    return () => { live = false; };
  }, [activeTabId]);
```

After the `project-setup` item (which ends with `} },` on line 111), add:

```tsx
      ...(bmadProject
        ? [{
            id: "bmad-switch",
            label: `BMAD: Switch to ${bmadProject.methodology === "v6" ? "v4" : "v6"}…`,
            category: "BMAD",
            action: () => {
              onClose();
              // Never switches on this click: the confirm step shows what would move first.
              import("../lib/methodologyPrompt")
                .then(({ switchOnDemand }) => switchOnDemand(bmadProject.root))
                .catch((err) => window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: `BMAD switch failed: ${err}` } })));
            },
          }]
        : []),
```

Add `bmadProject` to the `useMemo` dependency list on line 189:

```tsx
  }, [tabs, activeTabId, addTab, setActiveTab, onClose, onToggleScratchpad, onOpenAgentPicker, onTogglePreview, onToggleFileBrowser, onOpenRecordings, bmadProject]);
```

- [ ] **Step 4: Implement the board link**

`src/components/board/BoardPanel.tsx`. Change the `methodologyPrompt` and `bmadSwitch` imports to

```tsx
import { askAndSetUp, switchOnDemand } from "../../lib/methodologyPrompt";
import { otherVersion, pendingSwitches, type PendingSwitch } from "../../lib/bmadSwitch";
```

After `const [setupError, setSetupError] = useState<string | null>(null);`, add:

```tsx
  const [switchError, setSwitchError] = useState<string | null>(null);
```

In the returned JSX, after `{body}`, add:

```tsx
      {root && methodology && storeRoot === root && !switching && (
        <div style={{ marginTop: "auto", padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
          <button
            type="button"
            style={LINK}
            onClick={() => {
              setSwitchError(null);
              // Opens the confirm step; nothing moves until that is confirmed.
              switchOnDemand(root).catch((e) => setSwitchError(String(e)));
            }}
          >
            Switch to BMAD {otherVersion(methodology)}…
          </button>
          {switchError && <div role="alert">{switchError}</div>}
        </div>
      )}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/BoardPanel.test.tsx src/components/__tests__/BoardView.test.tsx src/components/__tests__/V6MapView.test.tsx`
Expected: PASS.

If an existing BoardPanel test now finds two alerts or two buttons where it expected one, it is querying by role alone: narrow that query by name (`{ name: "Set up now" }`) rather than moving the link.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/CommandPalette.tsx src/components/board/BoardPanel.tsx src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/BoardPanel.test.tsx
git commit -m "feat(switch): switch on demand from the palette and the board"
```

---

### Task 17: The question toast stays put inside its project

From the notes on plan A: the `cd` hook's question toast is withdrawn and shown again a moment later whenever the terminal changes folder inside the same project. The hook withdrew it in its effect cleanup, before the next run knew which project it was in. The next run now decides.

**Files:**
- Modify: `src/hooks/useProjectSetup.ts:1` (imports), `:108-186` (`useProjectSetup`)
- Test: `src/hooks/__tests__/useProjectSetup.test.tsx`

**Interfaces:**
- `useProjectSetup(cwd, show, withdraw)` keeps its signature. A question toast is withdrawn when the terminal's project changes, when the pane has no folder, when automatic setup is turned off, when the project is set up some other way, when a run for the same project finds nothing to ask, and when the hook unmounts. It is not withdrawn by a folder change inside the same project.

- [ ] **Step 1: Write the failing tests, and bring one test in line**

In `src/hooks/__tests__/useProjectSetup.test.tsx`, inside `describe("the question toast leaves with its project", …)`:

The run that withdraws the toast now has to learn the new folder's project first, which is asynchronous. In "is withdrawn when the terminal moves to another project, and shown again on return", change

```ts
    hook.rerender({ cwd: "/code/other" });
    expect(screen.toast).toBeNull();
    await settle();
    expect(screen.toast).toBeNull();
```

to

```ts
    hook.rerender({ cwd: "/code/other" });
    await waitFor(() => expect(screen.toast).toBeNull());
    await settle();
    expect(screen.toast).toBeNull();
```

and append to that `describe`:

```ts
  it("stays where it is when the terminal changes folder inside the project", async () => {
    tauri.roots = { "/code/shop/src": "/code/shop", "/code/shop/src/lib": "/code/shop" };
    const hook = mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));

    hook.rerender({ cwd: "/code/shop/src" });
    await settle();
    hook.rerender({ cwd: "/code/shop/src/lib" });
    await settle();
    // Withdrawn and shown again, it would flicker on every cd.
    expect(withdraw).not.toHaveBeenCalled();
    expect(screen.toast?.title).toBe(SHOP);

    // Still one question: answered once.
    act(() => screen.toast!.actions![0].run!());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    await settle();
    expect(tauri.applies).toHaveLength(1);
  });

  it("goes when a run for the same project finds nothing left to ask", async () => {
    tauri.roots = { "/code/shop/src": "/code/shop" };
    const hook = mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));
    // Set up meanwhile by another window: no event reached this one.
    setUpBefore("/code/shop");
    hook.rerender({ cwd: "/code/shop/src" });
    await waitFor(() => expect(screen.toast).toBeNull());
  });

  it("goes when the hook does", async () => {
    const hook = mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));
    hook.unmount();
    expect(screen.toast).toBeNull();
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: FAIL: "stays where it is…" fails on `expect(withdraw).not.toHaveBeenCalled()` (the cleanup withdrew it twice).

- [ ] **Step 3: Implement**

`src/hooks/useProjectSetup.ts`: change line 1 to

```ts
import { useCallback, useEffect, useRef } from "react";
```

and replace `useProjectSetup` (its doc comment included) with

```ts
/**
 * Every git project a terminal opens in is set up once: BMAD, the ADE
 * methodology, the core roles and the agents for its stack. A project with no
 * BMAD is asked which version first, in a toast; nothing is set up until one
 * is picked. On later opens, agents for a stack the project has gained since
 * are added.
 *
 * The question belongs to the project the terminal is in. Its toast is taken
 * down (by key, so no other toast goes with it) when the terminal leaves the
 * project, when automatic setup is turned off, and when the project is set up
 * some other way. It is the next run that takes it down, once it knows which
 * project the new folder is in: a `cd` inside the same project leaves the
 * toast where it is, rather than withdrawing it and showing it again.
 */
export function useProjectSetup(cwd: string | null, show: (t: GuardToast) => void, withdraw: (key: string) => void) {
  const enabled = useSettingsStore((s) => s.autoProjectSetup);
  // The project whose question toast this hook has put on screen, if any.
  const questionFor = useRef<string | null>(null);
  const withdrawQuestion = useCallback(() => {
    const root = questionFor.current;
    questionFor.current = null;
    if (root) withdraw(questionKey(root));
  }, [withdraw]);
  useEffect(() => onProjectSetUp(({ root }) => {
    const open = asking.get(root);
    // An answered question is its own run's to finish; an open one is over.
    if (open && !open.answered) {
      asking.delete(root);
      open.leave();
    }
    if (questionFor.current === root) questionFor.current = null;
    withdraw(questionKey(root));
  }), [withdraw]);
  // The toast goes when the hook does.
  useEffect(() => withdrawQuestion, [withdrawQuestion]);
  useEffect(() => {
    // No folder, or automatic setup is off: there is no project to ask about.
    if (!enabled || !cwd) {
      withdrawQuestion();
      return;
    }
    let cancelled = false;
    // This run put the question up, or put it up again.
    let asked = false;
    const byToast = askByToast(show);
    const ask: AskUi = (root) => {
      // The terminal has left: this run has no place to ask from any more.
      if (cancelled) return Promise.resolve(LEAVE_IT);
      asked = true;
      questionFor.current = root;
      return byToast(root);
    };
    const run = async (root: string) => {
      // Skip projects whose setup the user undid.
      if (!isSetupCandidate(root) || setupDeclined(root)) return;
      // And ones the new-tab dialog is setting up right now. That project can
      // be a folder below `root`: New tab sets up the folder that was picked,
      // and until its marker is written this hook resolves the repository
      // above it.
      if (foldersUpTo(cwd, root).some(isSettingUp)) return;
      const status = await setupStatus(root).catch(() => null);
      if (!status || cancelled) return;
      if (wasSetUp(root)) {
        if (!status.stacks.length) return;
        const r = await addStackAgents(root, status.stacks, status.methodology ?? "v6").catch(() => null);
        if (r && !cancelled) announceSetup(r, show, true);
        return;
      }
      // A project that has BMAD is set up where it sits. One with none is
      // only asked about when it is a git repository.
      if (!status.methodology && !status.isGit) return;
      const quiet = isComplete(status);
      // The project's own version, with no question; a project with neither is asked.
      const answer = await askMethodology(root, { ask });
      if (answer.kind !== "chosen") return;
      if (!answer.asked) {
        if (cancelled) return;
        // Not asked for, so a failure stays quiet: the next cd tries again.
        const result = await setUpProject(root, answer.methodology, status.stacks).catch(() => null);
        if (result && !cancelled && !quiet) announceSetup(result, show);
        return;
      }
      // An answer someone clicked stands even if the terminal has moved on
      // since, unless the project was set up some other way while it waited.
      try {
        // And on the version the project has, if it gained one by hand.
        const methodology = await versionToSetUp(root, answer);
        if (isSettingUp(root) || wasSetUp(root)) return;
        const result = await setUpProject(root, methodology, status.stacks).catch((e) => {
          show({ title: "Project setup", body: `Project setup failed: ${e}` });
          return null;
        });
        if (result && !quiet) announceSetup(result, show);
      } finally {
        // Kept until here so a run already under way doesn't ask again while
        // the setup is running. After a failure the next run asks afresh.
        asking.delete(normRoot(root));
      }
    };
    (async () => {
      const root = await setupRootOf(cwd);
      if (cancelled) return;
      // Another project's question leaves with it. The same project's stays.
      if (questionFor.current !== root) withdrawQuestion();
      await run(root);
      // This run found nothing to ask (set up meanwhile, declined, mid-setup):
      // a question still up for the project has had its day.
      if (!cancelled && !asked && questionFor.current === root) withdrawQuestion();
    })();
    return () => {
      // The question stays open, and so does its toast until the next run
      // knows whether the terminal is still in the project.
      cancelled = true;
    };
  }, [cwd, enabled, show, withdraw, withdrawQuestion]);
}
```

The body of `run` is the hook's previous body from "Skip projects whose setup the user undid" down, unchanged except that its first check no longer tests `cancelled` (the caller has).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: PASS, every test in the file. In particular "is asked again on the next run after another toast replaced its question", "does not take a different toast off the screen" and "is not shown by a run the terminal has already left" pass unchanged.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProjectSetup.ts src/hooks/__tests__/useProjectSetup.test.tsx
git commit -m "fix(setup): keep the question toast in place when cd stays inside the project"
```

---

### Task 18: The guide, and the whole suite

**Files:**
- Modify: `docs/guide/project-setup.md:18-30` (the section), `:37` (the anchor), `:68-70` ("Agents from an older setup"), `:92-109` (the file layout)
- Modify: `docs/guide/settings.md:29`
- Test: `scripts/setupGuide.test.ts`

**Interfaces:**
- Consumes: the palette label and board link (Task 16), **Archive and switch** (Task 12), `ARCHIVE_DENY_RULE` (Task 6).
- Produces: the guide section "Choosing and switching the BMAD version", anchor `#choosing-and-switching-the-bmad-version`.

- [ ] **Step 1: Write the failing tests**

In `scripts/setupGuide.test.ts`:

Replace every `"## Choosing the BMAD version"` with `"## Choosing and switching the BMAD version"` (three places: lines 29, 30 and 41).

Change "links the settings page to the section that exists" to

```ts
  it("links the settings page to the section that exists", () => {
    expect(settings).toContain("#choosing-and-switching-the-bmad-version");
    expect(settings).not.toContain("#choosing-the-bmad-version");
    expect(guide).not.toContain("#choosing-the-bmad-version");
    expect(settings).not.toContain("#v6-or-v4");
  });
```

and append, inside `describe("the project setup guide", …)`:

```ts
  const section = () =>
    guide.slice(guide.indexOf("## Choosing and switching the BMAD version"), guide.indexOf("## When it runs"));

  it("says when a project that has BMAD is asked to keep or switch", () => {
    expect(section()).toContain("### Keeping or switching");
    expect(section()).toContain("*shop uses BMAD v4.* **Keep v4** (default) · **Switch to v6…**");
    expect(section()).toMatch(/never asks from a terminal/);
    expect(section()).toMatch(/has to be answered/);
    expect(read("src/components/MethodologyPrompt.tsx")).toContain("(default) · <b>Switch to {other}…</b>");
  });

  it("names the two ways to switch on demand, as the app spells them", () => {
    expect(section()).toContain("*BMAD: Switch to v6…*");
    expect(palette).toContain("label: `BMAD: Switch to ${");
    expect(section()).toContain("**Switch to BMAD v6…**");
    expect(read("src/components/board/BoardPanel.tsx")).toContain("Switch to BMAD {otherVersion(methodology)}…");
    expect(section()).toContain("**Archive and switch**");
    expect(read("src/components/SwitchConfirm.tsx")).toContain('"Archive and switch"');
  });

  it("says what moves in each direction, and that documents stay unless ticked", () => {
    expect(section()).toContain("### What a switch moves");
    for (const path of ["`.bmad-core/`", "`.claude/commands/BMad/`", "`.ade/stage`", "`_bmad/`", "`.ade/approvals/`", "`.ade/gates/`", "`.ade/methodology`"]) {
      expect(section(), path).toContain(path);
    }
    expect(section()).toMatch(/Nothing is deleted/);
    expect(section()).toMatch(/your documents/i);
    expect(section()).toContain("Archive this too");
    expect(section()).toMatch(/leftovers-v6/);
  });

  it("describes the archive, its journal and what a pending switch means", () => {
    expect(section()).toContain("### The archive");
    expect(section()).toContain("`.ade/archive/bmad-v4-2026-10-11/`");
    expect(section()).toContain("`ARCHIVE.md`");
    for (const status of ["`status: incomplete`", "`status: in-progress`", "`status: abandoned`"]) {
      expect(section(), status).toContain(status);
    }
    expect(section()).toMatch(/neither sets the project up nor switches it/);
    // The permission rule, as the app writes it.
    expect(section()).toContain("`Edit(/.ade/archive/**)`");
    expect(read("src-tauri/src/usage.rs")).toContain('pub const ARCHIVE_DENY_RULE: &str = "Edit(/.ade/archive/**)";');
    expect(section()).toMatch(/until you restart them/);
  });

  it("says how to go back, and promises no restore button", () => {
    expect(section()).toContain("### Going back");
    expect(section()).toMatch(/git add -A/);
    expect(section()).toMatch(/no button that restores an archive/);
  });

  it("lists the archive in the file layout", () => {
    expect(guide).toMatch(/\.ade\/archive\/ +earlier BMAD versions/);
  });

  it("no longer says role files stay on the old version after a move", () => {
    expect(guide).not.toMatch(/those files still name v4 tasks/);
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run scripts/setupGuide.test.ts`
Expected: FAIL: the guide's section is still "Choosing the BMAD version" and says nothing about switching.

- [ ] **Step 3: Write the guide**

`docs/guide/project-setup.md`:

Change the heading on line 18 from `## Choosing the BMAD version` to

```markdown
## Choosing and switching the BMAD version
```

Change the paragraph that starts "A project that already has BMAD is never asked." (line 26) to

```markdown
A project that already has BMAD is never asked which version to set up. One with `.ade/methodology` follows it; one with `.bmad-core/` and no marker is treated as v4 and stays that way. A v4 project keeps its QA gates in `docs/qa/gates/`; v6 projects use `.ade/gates/`, same format.
```

After the paragraph that starts "There are two ways not to have BMAD in a project." (line 28) and before `## When it runs`, add:

````markdown
### Keeping or switching

The first time you open a project that already has BMAD from the New tab dialog, ADE asks once: *shop uses BMAD v4.* **Keep v4** (default) · **Switch to v6…** Press <kbd>Enter</kbd> to keep the version. Like the version question, this one has to be answered, and the folder isn't opened until it is. ADE doesn't ask that project again, and it never asks from a terminal `cd`. Projects ADE had set up before this question existed aren't asked at all.

You can switch a project at any time:

- *BMAD: Switch to v6…* (or *v4*) in the command palette, for the project the active terminal is in;
- **Switch to BMAD v6…** (or *v4*) at the bottom of the stage board.

A switch never happens on that click. A dialog first shows what it would do: the archive folder, every path that moves with its file count, your documents, anything left in place, what git makes of it, and the terminals and agents open in the project. **Archive and switch** runs it. **Back** or **Cancel** leaves the project as it was. Stop agents working in the project before you switch: they may keep writing into folders that have moved.

### What a switch moves

Nothing is deleted. The old version's files move into a folder inside the project, `.ade/archive/bmad-v4-2026-10-11/` (the version you left and the date), and the other version is set up fresh.

| Direction | Moves to the archive |
|---|---|
| v4 → v6 | `.bmad-core/`, `.claude/commands/BMad/`, the debug log (`.ai/debug-log.md`), `.ade/stage` |
| v6 → v4 | `_bmad/`, the output folder (`_bmad-output/`, or the one your config names), the BMAD skills ADE installed in `.claude/skills/`, `.ade/approvals/`, `.ade/gates/` |
| Both | `.ade/methodology`, and the eight core role files in `.claude/agents/`, edited or not |

Everything else stays: `.ade/rules.md`, `.ade/context/`, `.ade/session.md`, `.ade/knowledge/`, `CLAUDE.md`, `llms.txt`, `.claude/settings.json`, your own skills and agents, and your documents. `docs/` (the PRD, the architecture, stories, QA) is used by both versions, so a switch from v4 leaves it alone unless you tick a document in the dialog (*Archive this too*). A location your config puts outside the project is never moved.

If the project already holds files of the version you are switching to, they move to `leftovers-v6/` (or `leftovers-v4/`) inside the archive, so setup starts clean.

### The archive

Paths in the archive mirror the project. `ARCHIVE.md` at its top is the journal: what moved, and how to go back.

Agents are told the archive is read-only history. The rule is added to `.ade/rules.md`, and `.claude/settings.json` gets one `permissions.deny` entry, `Edit(/.ade/archive/**)`, which keeps Claude Code's file-editing tools out of it. Reading it stays allowed, and a shell command can still change it. Agents that were already running keep their old role prompt until you restart them.

If a step fails, ADE puts everything back and removes the archive. If it can't put everything back (a file is locked, or something wrote into a folder that had moved), it stops and says so. `ARCHIVE.md` then reads `status: incomplete`, the stage board shows a warning that links to it, and ADE neither sets the project up nor switches it until you resolve it: move the paths marked *moved* back to their places, then set `status: abandoned` in `ARCHIVE.md`. The same goes for a switch cut short by a crash, which is left at `status: in-progress`.

### Going back

Switch again: *BMAD: Switch to v4…* archives v6 the same way and sets up v4 fresh. To have your old v4 files back as they were, then move the paths from the first archive to their places, replacing the fresh role files and `.ade/methodology`. After `git add -A`, git usually shows tracked files as renames. ADE has no button that restores an archive.
````

Change the anchor on line 37 from `(#choosing-the-bmad-version)` to `(#choosing-and-switching-the-bmad-version)`.

Change the paragraph under "### Agents from an older setup" (line 70) to

```markdown
A core role's file carries the BMAD tasks for one methodology, the project's. A project set up before ADE supported v6 is treated as v4, and its role files list the v4 tasks, which is correct for it. [Switching the project](#keeping-or-switching) archives those role files and writes fresh ones for the new version. To bring a single role up to date without switching, **Remove** it and **Add** it again on the Agents tab: the file is rewritten for the project's methodology. Copy out anything you changed in it first.
```

In the file layout block, after the `.ade/stage` line, add:

```text
.ade/archive/                 earlier BMAD versions, moved here by a switch; read-only history
```

`docs/guide/settings.md` line 29: change `#choosing-the-bmad-version` to `#choosing-and-switching-the-bmad-version`, and add this sentence before "See [Project setup]":

```markdown
A project that already has BMAD is asked once, from the New tab dialog, whether to keep its version or switch.
```

- [ ] **Step 4: Run the guide's tests**

Run: `npx vitest run scripts/setupGuide.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything**

Run: `npx vitest run`
Expected: PASS, every test file.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, every Rust test, with no warnings from `bmadswitch.rs`, `bmadconfig.rs` or `git.rs` (everything in them is used by now).

- [ ] **Step 6: Commit**

```bash
git add docs/guide/project-setup.md docs/guide/settings.md scripts/setupGuide.test.ts
git commit -m "docs(guide): choosing and switching the BMAD version"
```

---

## Spec coverage

| Spec (plan B) | Task |
|---|---|
| Keep-or-switch question, must be answered, from New Tab only | 13 (the hook: 13's `cd` test) |
| The kept list, `PERSISTED_KEYS`, the migration | 9; kept on choose 11, on keep 13, on switch 10 |
| Switching on demand: palette, board link | 16 |
| Confirming a switch: every listed part of the dialog | 12; reached from the prompt 13 |
| Own event and toast, no Undo, links to `ARCHIVE.md` | 10 (event), 15 (toast) |
| `bmad_switch_plan`, git facts, blocked rules, what moves, leftovers, links, nesting | 5 |
| Shared git helper with `--no-optional-locks` | 2 |
| YAML and TOML readers ported, shared fixtures in both languages | 3 |
| Archive naming, journal, `bmad_switch_pending` | 4 (journal, pending), 5 (naming) |
| Pending blocks a switch, blocks setup, warns on the board | 5, 11, 14 |
| `bmad_switch_apply`: recompute, journal, move, snapshot, set up, rules, done; rollback | 7 |
| Holding `APPLY`; the `switching` set; `setUpProject` rejects; board "Switching…", paused, one refresh | 7, 10, 14 |
| `RULES_MD` archive rule under a marker; appended on switch | 6, 7 |
| `usage::deny_archive_edits`; `add_deny_rules` unchanged | 6; called in 7 |
| The watcher's `exclude`; the board passes it | 8, 14 |
| Docs | 18 |
| Note: restore a replaced marker on rollback | 7 |
| Note: cleanup tests (pre-existing agents and settings; v6 taken back; half-written file) | 1 |
| Note: separator boundary in `foldersUpTo` and `bmadRootOf` | 9 |
| Note: the question toast flickers inside a project | 17 |
| Note: an Undo entry on the Agents tab | not built: Decision 26 |
