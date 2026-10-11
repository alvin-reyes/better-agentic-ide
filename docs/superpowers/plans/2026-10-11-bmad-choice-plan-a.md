# BMAD Version Choice, Plan A (Ask Before Setup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every setup of a project with no BMAD asks which version first (a shared dialog, or a toast from the `cd` hook), a project that has BMAD keeps its version without a question, a v4 setup writes the `.ade/methodology` marker, and a setup that fails removes what it wrote.

**Architecture:** In Rust, `projectsetup::apply` fills a report the caller owns, both installs record the folders they create through one `mkdirs` helper, the v4 install returns its errors, and `project_setup_apply` takes back a failed setup from that report. In the frontend, one function, `askMethodology(root)`, decides the version for every entry point: it returns the version on disk, or asks through a UI the caller can swap (the modal `MethodologyPrompt` by default, a toast for the `cd` hook). Every per-project list keys on `normRoot`.

**Tech Stack:** Rust (Tauri 2 commands, `std::fs`), TypeScript, React, zustand, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-11-bmad-version-choice-design.md`. This plan covers plan A only: "The root", "A project with no BMAD (plan A)", "Setup's error reporting (plan A)" with "v4 writes the marker", "`CLAUDE_MD` for both versions (plan A)", the plan-A part of "Docs", and "Testing → Plan A".

## Global Constraints

- Commit messages carry no AI attribution: no `Co-Authored-By` trailer for a model, no "Generated with" line. Commit as the repo's configured git user.
- Run every command from the repo root (`/Users/alvin-reyes/Project/better-agentic-ide/.claude/worktrees/stage-board`). Stay on branch `bmad-version-switch`.
- Frontend tests: `npx vitest run <file>`; before each commit also `npx tsc --noEmit`.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml <filter>`.
- Match the surrounding code's style: comments explain why, not what; names as in neighbouring files.
- User-facing copy, exactly as the spec words it. The dialog: "Set up **shop** with **BMAD v6** (default) or **BMAD v4**?" (`shop` is the project folder's name; the three bold runs are `<b>` elements). The toast: "Set up **shop** with BMAD?" with the buttons **v6**, **v4** and **Not now**, in that order.
- Enter in the dialog picks v6.
- Nothing in plan A mentions or creates the archive, the kept list, the keep-or-switch question, the switch, the permission rule or the watcher exclusion. Those are plan B.
- A project that has BMAD (the marker, else `.bmad-core/`) never sees the question, from any entry point.
- `autoProjectSetup` off, or a declined project: New Tab and the `cd` hook neither set up nor ask. The palette and both **Set up now** buttons always work.
- The session-dismiss set is a module-level `Set`, never localStorage: the next launch asks again.
- `project_setup_apply` keeps its signature. Setup never overwrites a file that exists.
- An existing project's `CLAUDE.md` is never rewritten.
- Line numbers below are as of commit `76da871`. Earlier tasks shift later ones, so find each edit by the code quoted with it.

## Amendment: the question must be answered (owner decision, 2026-10-11)

This overrides the task briefs and the plan's Global Constraints wherever they
conflict. The spec was updated to match ("The question must be answered" in
"A project with no BMAD (plan A)").

**Rule.** A project with no BMAD gets an answer: v6 or v4. The question offers
no way to skip.

1. **The dialog** (`MethodologyPrompt`, choose mode):
   - No Cancel or close (✕) button. A click on the backdrop does nothing.
   - Escape does nothing, and must not reach a panel beneath the dialog: the
     dialog registers on the `useEscapeToClose` stack with a handler that
     does nothing (it swallows Escape while it is the top entry).
   - Enter picks the highlighted row (v6 until the arrows move it), but only
     when the event target is the dialog itself or an option, never another
     control. Ignore auto-repeat Enter (`e.repeat`).
   - Copy unchanged: "Set up **shop** with **BMAD v6** (default) or **BMAD v4**?"
2. **`askMethodology`**:
   - The `once` option and the session-dismiss `Set` are removed. Nothing
     dismisses.
   - `{ kind: "dismissed" }` stays in the union, only for a question
     superseded by one for another root, and for the host unmounting (its
     effect cleanup settles an open question as dismissed). Callers treat it
     as "do nothing".
   - A failed detection (`detectOnDisk` rejects) still falls through to the
     question; log it with `console.warn`.
3. **New Tab**: a folder with no BMAD is not opened until a version is
   picked. There is no "Escape opens it without setup". A new project is
   still `git init`ed first. If the answer is `dismissed` (superseded), the
   folder is not opened.
4. **The `cd` hook's toast**:
   - Two actions, in this order: **v6**, **v4**. No "Not now".
   - `GuardToast` gains `sticky?: boolean`; App's toast timer does not start
     for a sticky toast. The setup question is sticky.
   - Showing it adds nothing to any dismiss set. While a project is still
     unanswered, each hook run for it shows the toast again (same handlers,
     one pending question per root), so a toast replaced by another comes
     back on the next `cd` or tab switch. It must not set up twice if both
     an old and a re-shown toast's buttons are clicked.
5. **Palette "Set up BMAD" and both Set up now buttons**: the modal, which
   must be answered.
6. **Unchanged**: `autoProjectSetup` off or a declined project — New Tab and
   the hook neither set up nor ask. Undo after a setup still declines the
   project. A project that has BMAD never sees the question.
7. **Tests**: replace every Escape / Cancel / Not now / session-dismiss test
   with tests of the rule above (Escape does nothing and doesn't close a panel
   beneath; no close button; toast has two actions and is sticky; re-shown
   after being replaced; New Tab doesn't open a no-BMAD folder unanswered;
   Enter on a non-option control doesn't pick).
8. **Docs (Task 11)**: the guide says the question must be answered, and
   names the two ways out (the setting, Undo).

The task text below was written before this amendment. Where a task still shows Escape, a Cancel button, "Not now", `once` or the session-dismiss set, the amendment wins.

## Review Focus

1. **A setup the person asked for fails** (a v4 copy error, a folder that can't be written). They are told in a toast, from New Tab and from the `cd` toast's **v6**/**v4** buttons, and the project is left as it was. Today the error is swallowed and half a setup stays on disk. (Task 1 `a_failed_setup_leaves_nothing_behind`; Task 6 "reports a setup that fails"; Task 7 "says so when the setup it was asked for fails".)
2. **A v4 project from before the marker** (`.bmad-core/` and no `.ade/methodology`). It is never asked, stays v4, and its next setup writes the marker. (Task 2 `a_v4_setup_writes_the_marker_and_counts_it`; Task 6 "does not ask about a project that is already on a version".)
3. **New Tab on a folder inside a larger git repository, then the `cd` hook.** The hook resolves the repository above the folder while the folder's setup is still running, or after its question was dismissed. It must not ask about the repository. (Task 7 "does not ask about the repository while New tab is setting up a folder inside it".)
4. **Escape with the dialog open over another panel** (Agents tab → **Set up now**). Escape cancels the question and leaves the Integrations panel open. Today every open panel hears Escape. (Task 5 `useEscapeToClose` tests.)
5. **A Windows path, or a root with a trailing separator.** `C:\code\shop\` is the same project as `C:\code\shop`, and the dialog names it "shop". (Task 3 "strips trailing separators"; Task 5 "names a Windows project by its folder".)

## Decisions made in this plan

The spec leaves these open; each is decided here.

1. **Where the created folders are recorded.** `SetupReport` and both `ScaffoldReport`s gain `created_dirs: Vec<PathBuf>`. On `SetupReport` it is `#[serde(skip)]`: only Rust reads it, and a non-UTF-8 path must not fail the command's response. `mkdirs` lives in `projectsetup.rs` as `pub(crate)`.
2. **AI attribution is turned off last in `apply`,** after the install. Nothing after it can fail, so a failed setup has never edited an existing `.claude/settings.json` and there is nothing to restore.
3. **The failed-setup cleanup is `apply_or_clean`,** a function `project_setup_apply` calls, so it is tested without an `AppHandle`. `project_setup_undo` keeps its behaviour and shares the unchanged-only removal and the import strip with it.
4. **A v4 install with no bundled `bmad-core/` is an error,** not a silent success.
5. **The v4 marker replaces a marker that says something else,** as the v6 install already does for v6. A marker already reading `v4` is kept and not reported as created.
6. **`normRoot` also keys the removed-agents map and the in-flight setup map,** and `setUpProject` passes the normalised root on. Otherwise a trailing slash could start a second setup of the same project.
7. **`askMethodology`'s shape** (see Task 5 Interfaces): a discriminated union on `kind`, an injectable `ask` UI, and a `once` option that owns the session-dismiss set. One modal at a time: a question for another root resolves the earlier one as dismissed; the same root shares one dialog.
8. **The `cd` hook goes through `askMethodology` too,** passing a toast as the `ask` UI. A toast that times out leaves its promise unsettled; nothing else waits on it.
9. **The toast's body:** "ADE adds BMAD, the methodology and the role agents. Existing files are left as they were." The spec gives only the title. The title is one string, already rendered bold, so the project name is not set apart inside it.
10. **`action` and `actions` are one rule.** A toast with either is not dismissed by a click on its body, since the spec calls `action` shorthand for one. The Undo and `/compact` toasts therefore stay until their button is clicked or 15 s pass.
11. **New Tab closes before the question.** A new project is `git init`ed first, while the dialog can still show that error; then the dialog closes and the shared dialog asks. Escape on a new project leaves it `git init`ed and open, without setup.
12. **`useEscapeToClose` becomes a stack:** only the panel opened last hears Escape. Needed for Review Focus 4; it also stops Escape closing two stacked panels at once.
13. **The hook's root is `setupRootOf(cwd)`.** A project that has BMAD is set up where it sits, even below the git root. A project with none is asked about only at a git root, as today.
14. **A setup that fails after an explicit answer is reported** through the existing `project-setup-failed` event (New Tab) or a toast (the hook). The spec is silent; silence after a click reads as a broken button.
15. **`isComplete` for v6** is the v6 marker. v4 still needs `.bmad-core/VERSION`, so a v4 project that lost its engine still reads "Incomplete".
16. **The Agents tab's project** becomes `setupRootOf(cwd)` in `IntegrationsPanel`. The MCP and Anti-slop tabs keep the repository root.
17. **The guide's section is titled "Choosing the BMAD version".** The spec's title, "Choosing and switching the BMAD version", would promise a switch that plan A doesn't ship; plan B renames the section when it adds that part.
18. **The arrow keys move the highlight in the dialog** and Enter picks the highlighted row, which is v6 until moved. This is the New Tab list's behaviour, kept.

---

### Task 1: Setup reports what it wrote, and a failed setup removes it

**Files:**
- Modify: `src-tauri/src/projectsetup.rs:31-47` (`SetupReport`), `:58-64` (add `mkdirs` after `project`), `:129-194` (`apply`), `:243-308` (`project_setup_apply`, `project_setup_undo`), `:324-580` (tests)
- Modify: `src-tauri/src/bmad.rs:5-9` (`ScaffoldReport`), `:17-38` (`copy_tree`), `:47-73` (`install`, `scaffold_bmad`), `:91-137` (tests)
- Modify: `src-tauri/src/bmadv6.rs:31-35` (`ScaffoldReport`), `:74-90` (`copy_tree`), `:105-147` (`install`), tests (append)

**Interfaces:**
- Produces (Rust, `crate::projectsetup`):
  - `pub(crate) fn mkdirs(path: &Path, created: &mut Vec<PathBuf>) -> Result<(), String>`: creates `path` and its missing parents, pushing each level it creates, outermost first. An existing folder is `Ok` and records nothing. A file in the way is an `Err`.
  - `pub fn apply(dir: &Path, files: &[SetupFile], import: Option<&str>, marker: &str, methodology: Methodology, methodology_src: Option<&Path>, report: &mut SetupReport) -> Result<(), String>`
  - `SetupReport.created_dirs: Vec<PathBuf>` (`#[serde(skip)]`)
  - `pub(crate) static APPLY: std::sync::Mutex<()>`
  - `fn apply_or_clean(dir: &Path, files: &[SetupFile], import: Option<&str>, marker: &str, methodology: Methodology, methodology_src: Option<&Path>) -> Result<SetupReport, String>` (private)
  - test helpers in `projectsetup.rs`'s `tests` module: `fn run(...) -> Result<SetupReport, String>` (same arguments as `apply_or_clean`, no cleanup) and `fn v4_source() -> PathBuf`
- Produces (`crate::bmad`): `pub fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport) -> Result<(), String>`, `pub fn install(res_root: &Path, project: &Path, report: &mut ScaffoldReport) -> Result<(), String>`, `ScaffoldReport.created_dirs: Vec<PathBuf>`; test helpers `fn temp(name: &str) -> PathBuf` and `fn v4_source(name: &str) -> PathBuf` in its `tests` module.
- Produces (`crate::bmadv6`): `ScaffoldReport.created_dirs: Vec<PathBuf>`. `install`'s signature is unchanged (`src-tauri/tests/bmadv6_e2e.rs` calls it).

- [ ] **Step 1: Write the failing tests in `src-tauri/src/projectsetup.rs`**

In the `tests` module, add these two helpers after `fn files()` (line 347):

```rust
    /// apply() into a fresh report, as project_setup_apply does, without the cleanup.
    fn run(
        dir: &Path,
        files: &[SetupFile],
        import: Option<&str>,
        marker: &str,
        methodology: Methodology,
        methodology_src: Option<&Path>,
    ) -> Result<SetupReport, String> {
        let mut report = SetupReport::default();
        apply(dir, files, import, marker, methodology, methodology_src, &mut report).map(|()| report)
    }

    /// A miniature of the bundled v4 resource root.
    fn v4_source() -> PathBuf {
        let src = temp();
        std::fs::create_dir_all(src.join("bmad-core/tasks")).unwrap();
        std::fs::write(src.join("bmad-core/core-config.yaml"), "x").unwrap();
        std::fs::write(src.join("bmad-core/tasks/a.md"), "a").unwrap();
        std::fs::write(src.join("VERSION"), "v4.1\n").unwrap();
        src
    }
```

In the same module, replace every existing call `apply(` with `run(`. There are ten, on lines 354, 361, 371, 391, 393, 403, 413, 469, 471 and 483; the arguments stay as they are.

Append these tests at the end of the module:

```rust
    #[test]
    fn mkdirs_records_each_level_it_creates() {
        let dir = temp();
        std::fs::create_dir_all(dir.join("a")).unwrap();
        let mut made = Vec::new();
        mkdirs(&dir.join("a/b/c"), &mut made).unwrap();
        assert_eq!(made, [dir.join("a/b"), dir.join("a/b/c")]);
        // Again: nothing to create, nothing recorded.
        mkdirs(&dir.join("a/b/c"), &mut made).unwrap();
        assert_eq!(made.len(), 2);
        // A file in the way is an error, not a silent skip.
        std::fs::write(dir.join("a/f"), "x").unwrap();
        assert!(mkdirs(&dir.join("a/f"), &mut made).is_err());
        assert!(mkdirs(&dir.join("a/f/g"), &mut made).is_err());
        assert_eq!(made.len(), 2);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_keeps_its_partial_report_when_the_install_fails() {
        let dir = temp();
        let src = v4_source();
        // A file where the install needs a folder: its copy fails partway.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();
        let mut report = SetupReport::default();
        let err = apply(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src), &mut report).unwrap_err();
        assert!(err.contains("tasks"), "{err}");
        assert!(report.created.contains(&dir.join(".ade/rules.md").to_string_lossy().into_owned()), "{:?}", report.created);
        assert!(report.created_dirs.contains(&dir.join(".ade")), "{:?}", report.created_dirs);
        assert!(!dir.join(".claude/settings.json").exists(), "settings are written last, so a failed setup never edits them");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_failed_setup_leaves_nothing_behind() {
        let dir = temp();
        let src = v4_source();
        std::fs::write(dir.join("CLAUDE.md"), "# Mine\n").unwrap();
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();
        let import = "\n<!-- m -->\n@.ade/rules.md\n";

        assert!(apply_or_clean(&dir, &files(), Some(import), "<!-- m -->", Methodology::V4, Some(&src)).is_err());

        let names = |d: &Path| {
            let mut v: Vec<String> =
                std::fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            v.sort();
            v
        };
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# Mine\n", "the appended import is stripped");
        assert_eq!(names(&dir), [".bmad-core", "CLAUDE.md"], "created files and the folders made for them are gone");
        assert_eq!(names(&dir.join(".bmad-core")), ["tasks"], "what the install copied before it failed is gone");
        assert_eq!(std::fs::read_to_string(dir.join(".bmad-core/tasks")).unwrap(), "mine");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_setup_that_succeeds_keeps_what_it_wrote() {
        let dir = temp();
        let src = v4_source();
        let r = apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src)).unwrap();
        assert!(dir.join(".bmad-core/tasks/a.md").is_file());
        assert!(dir.join(".ade/rules.md").is_file());
        assert!(r.created_dirs.contains(&dir.join(".bmad-core").join("tasks")), "{:?}", r.created_dirs);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }
```

- [ ] **Step 2: Write the failing tests in `src-tauri/src/bmad.rs`**

In the `tests` module, add after `use super::*;`:

```rust
    /// A fresh folder per test and process: fixed names collide across runs.
    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A miniature of the bundled v4 resource root.
    fn v4_source(name: &str) -> std::path::PathBuf {
        let src = temp(name);
        std::fs::create_dir_all(src.join("bmad-core/tasks")).unwrap();
        std::fs::write(src.join("bmad-core/core-config.yaml"), "x").unwrap();
        std::fs::write(src.join("bmad-core/tasks/a.md"), "a").unwrap();
        std::fs::write(src.join("VERSION"), "v4.1\n").unwrap();
        src
    }
```

In `copy_tree_is_idempotent`, change the two calls to `copy_tree(&src, &dst, &mut r1).unwrap();` and `copy_tree(&src, &dst, &mut r2).unwrap();`.

Append:

```rust
    #[test]
    fn install_copies_the_core_and_records_its_folders() {
        let src = v4_source("ade_bmad_install_src");
        let dir = temp("ade_bmad_install");
        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();
        assert!(dir.join(".bmad-core/tasks/a.md").is_file());
        assert_eq!(std::fs::read_to_string(dir.join(".bmad-core/VERSION")).unwrap(), "v4.1\n");
        assert!(report.created_dirs.contains(&dir.join(".bmad-core")), "{:?}", report.created_dirs);
        assert!(report.created_dirs.contains(&dir.join(".bmad-core").join("tasks")), "{:?}", report.created_dirs);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn install_fails_when_a_copy_fails() {
        let src = v4_source("ade_bmad_fail_src");
        let dir = temp("ade_bmad_fail");
        // A file where the install needs a folder.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();
        let mut report = ScaffoldReport::default();
        let err = install(&src, &dir, &mut report).unwrap_err();
        assert!(err.contains("tasks"), "{err}");
        assert_eq!(std::fs::read_to_string(dir.join(".bmad-core/tasks")).unwrap(), "mine");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn install_fails_without_the_bundled_core() {
        let src = temp("ade_bmad_empty_src");
        let dir = temp("ade_bmad_empty");
        let mut report = ScaffoldReport::default();
        let err = install(&src, &dir, &mut report).unwrap_err();
        assert!(err.contains("v4"), "{err}");
        assert!(!dir.join(".bmad-core").exists());
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }
```

- [ ] **Step 3: Write the failing test in `src-tauri/src/bmadv6.rs`**

Append to the `tests` module:

```rust
    /// Empty folders such as `_bmad-output/` hold no file a report could name,
    /// so the install says which folders it made.
    #[test]
    fn install_records_the_folders_it_creates() {
        let dir = temp("bmadv6-dirs");
        let src = fixture("bmadv6-dirs-src");
        fs::create_dir_all(src.join("skills/bmad")).unwrap();
        fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();

        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();
        for d in [".claude/skills/bmad", "_bmad", "_bmad/custom", "_bmad-output", ".ade"] {
            assert!(report.created_dirs.contains(&dir.join(d)), "{d}: {:?}", report.created_dirs);
        }

        let mut again = ScaffoldReport::default();
        install(&src, &dir, &mut again).unwrap();
        assert!(again.created_dirs.is_empty(), "{:?}", again.created_dirs);
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml projectsetup`
Expected: FAIL to compile, with errors such as "cannot find function `mkdirs` in this scope", "cannot find function `apply_or_clean`" and "no field `created_dirs`".

- [ ] **Step 5: Implement in `src-tauri/src/projectsetup.rs`**

Add the field to `SetupReport`, after `settings_error` (line 46):

```rust
    /// Folders this setup created, outermost first. Only Rust reads it: a
    /// failed setup removes the ones still empty.
    #[serde(skip)]
    pub created_dirs: Vec<PathBuf>,
```

Add after `fn project` (line 64):

```rust
/// Create `path` and any missing parents, recording each level created,
/// outermost first. A folder that holds no file (`_bmad-output/`) is otherwise
/// unknown to whoever has to take a setup back.
pub(crate) fn mkdirs(path: &Path, created: &mut Vec<PathBuf>) -> Result<(), String> {
    if path.is_dir() {
        return Ok(());
    }
    if path.exists() {
        return Err(format!("{}: exists and is not a folder", path.display()));
    }
    let mut missing = Vec::new();
    let mut at = Some(path);
    while let Some(p) = at {
        if p.as_os_str().is_empty() || p.exists() {
            break;
        }
        missing.push(p.to_path_buf());
        at = p.parent();
    }
    for p in missing.into_iter().rev() {
        match std::fs::create_dir(&p) {
            Ok(()) => created.push(p),
            // Someone else made it first: it isn't this setup's to remove.
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && p.is_dir() => {}
            Err(e) => return Err(format!("{}: {e}", p.display())),
        }
    }
    Ok(())
}
```

Replace `apply` and its doc comment (lines 129-194) with:

```rust
/// Write the files the project is missing, load the methodology from an
/// existing CLAUDE.md, and install the project's methodology from
/// `methodology_src` (its resource root). Nothing that exists is overwritten.
///
/// The report is the caller's, so what was written before an error is still
/// known and can be taken back.
pub fn apply(
    dir: &Path,
    files: &[SetupFile],
    import: Option<&str>,
    marker: &str,
    methodology: Methodology,
    methodology_src: Option<&Path>,
    report: &mut SetupReport,
) -> Result<(), String> {
    // Decide the import before writing, so a CLAUDE.md we create isn't appended to.
    let append = import.is_some() && dir.join("CLAUDE.md").is_file() && !has_import(dir, marker);
    for f in files {
        let dst = inside(dir, &f.path)?;
        if dst.exists() {
            continue;
        }
        if let Some(parent) = dst.parent() {
            mkdirs(parent, &mut report.created_dirs)?;
        }
        std::fs::write(&dst, &f.content).map_err(|e| format!("{}: {e}", f.path))?;
        if f.path.starts_with(".claude/agents/") {
            report.agents += 1;
        }
        report.created.push(dst.to_string_lossy().into_owned());
    }
    if append {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().append(true).open(dir.join("CLAUDE.md")).map_err(|e| e.to_string())?;
        file.write_all(import.unwrap_or_default().as_bytes()).map_err(|e| e.to_string())?;
        report.appended_import = true;
    }
    match (methodology, methodology_src) {
        (Methodology::V4, Some(src)) => {
            let mut bmad = crate::bmad::ScaffoldReport::default();
            let installed = crate::bmad::install(src, dir, &mut bmad);
            // Recorded before the error is returned: what a failed install
            // copied is still this setup's to take back.
            report.bmad_files = bmad.created.len();
            report.created.extend(bmad.created);
            report.created_dirs.extend(bmad.created_dirs);
            installed?;
        }
        (Methodology::V6, Some(src)) => {
            let mut v6 = crate::bmadv6::ScaffoldReport::default();
            let installed = crate::bmadv6::install(src, dir, &mut v6);
            report.bmadv6_files = v6.created.len();
            report.created.extend(v6.created.iter().map(|p| p.to_string_lossy().into_owned()));
            report.created_dirs.extend(v6.created_dirs);
            installed?;
        }
        _ => {}
    }
    // A full setup also has agents commit as the user: no AI co-author trailer
    // or "Generated with" line. A broken settings file is reported, not fatal.
    // Last, because nothing after it can fail: a setup that fails has then
    // never edited a settings file the project already had.
    if import.is_some() {
        let settings = dir.join(".claude").join("settings.json");
        let existed = settings.exists();
        let hidden = mkdirs(&dir.join(".claude"), &mut report.created_dirs).and_then(|()| crate::usage::hide_attribution(dir));
        match hidden {
            Ok(changed) => {
                report.attribution_off = changed;
                if changed && !existed {
                    report.created.push(settings.to_string_lossy().into_owned());
                }
            }
            Err(e) => report.settings_error = Some(e),
        }
    }
    Ok(())
}

/// apply(), and on an error take back what it wrote: a failed setup leaves
/// nothing behind.
fn apply_or_clean(
    dir: &Path,
    files: &[SetupFile],
    import: Option<&str>,
    marker: &str,
    methodology: Methodology,
    methodology_src: Option<&Path>,
) -> Result<SetupReport, String> {
    let mut report = SetupReport::default();
    match apply(dir, files, import, marker, methodology, methodology_src, &mut report) {
        Ok(()) => Ok(report),
        Err(e) => {
            remove_unchanged(dir, &report.created, files);
            if let (true, Some(import)) = (report.appended_import, import) {
                let _ = strip_import(dir, import);
            }
            // Innermost first. A folder something else has written into since stays.
            for d in report.created_dirs.iter().rev() {
                let _ = std::fs::remove_dir(d);
            }
            Err(e)
        }
    }
}

/// Remove the files in `created` that are still as setup wrote them (by
/// content for `files`; BMAD's own, if still there). Returns the ones removed;
/// anything edited since is left.
fn remove_unchanged(dir: &Path, created: &[String], files: &[SetupFile]) -> Vec<PathBuf> {
    let ours: std::collections::HashMap<PathBuf, &str> =
        files.iter().filter_map(|f| inside(dir, &f.path).ok().map(|p| (p, f.content.as_str()))).collect();
    let mut removed = Vec::new();
    for path in created.iter().map(PathBuf::from) {
        if !path.starts_with(dir) {
            continue;
        }
        let unchanged = match ours.get(&path) {
            Some(content) => std::fs::read_to_string(&path).map(|s| s == *content).unwrap_or(false),
            // BMAD files: removed only if they're still where setup put them.
            None => path.is_file(),
        };
        if unchanged && std::fs::remove_file(&path).is_ok() {
            removed.push(path);
        }
    }
    removed
}

/// Take the import block setup appended back off the end of CLAUDE.md.
fn strip_import(dir: &Path, import: &str) -> Result<(), String> {
    let claude = dir.join("CLAUDE.md");
    if let Ok(text) = std::fs::read_to_string(&claude) {
        if let Some(stripped) = text.strip_suffix(import) {
            std::fs::write(&claude, stripped).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

Replace `project_setup_apply` and `project_setup_undo` (lines 243-308) with:

```rust
/// One setup at a time: two at once could both see CLAUDE.md without the
/// import and append it twice. Crate-visible so another command that sets a
/// project up can hold it for its whole run.
pub(crate) static APPLY: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[tauri::command(async)]
pub fn project_setup_apply(
    app: tauri::AppHandle,
    root: String,
    files: Vec<SetupFile>,
    import: String,
    marker: String,
    methodology: String,
    full: bool,
) -> Result<SetupReport, String> {
    let dir = project(&root)?;
    let _one = APPLY.lock().unwrap_or_else(|e| e.into_inner());
    // The owner's answer from the setup prompt; anything else is the v6 default.
    let methodology = if methodology.trim().eq_ignore_ascii_case("v4") { Methodology::V4 } else { Methodology::V6 };
    // A full setup also loads the methodology from CLAUDE.md and installs the
    // project's methodology; adding agents on their own touches nothing else.
    let root = |wanted| match wanted {
        Methodology::V4 => crate::bmad::resource_root(&app).ok(),
        Methodology::V6 => crate::bmadv6::resource_root(&app).ok(),
    };
    let src = install_source(methodology, crate::bmadv6::detect_on_disk(&dir), full, &dir, root)?;
    apply_or_clean(&dir, &files, full.then_some(import.as_str()), &marker, methodology, src.as_deref())
}

/// Remove what a setup created (files still unchanged since, by content) and
/// the import block it appended. Leaves anything the user has edited.
#[tauri::command(async)]
pub fn project_setup_undo(root: String, created: Vec<String>, files: Vec<SetupFile>, import: Option<String>) -> Result<usize, String> {
    let dir = project(&root)?;
    let removed = remove_unchanged(&dir, &created, &files);
    for path in &removed {
        // Tidy directories setup created that are now empty.
        let mut parent = path.parent();
        while let Some(p) = parent {
            if p == dir || std::fs::remove_dir(p).is_err() {
                break;
            }
            parent = p.parent();
        }
    }
    if let Some(import) = import {
        strip_import(&dir, &import)?;
    }
    Ok(removed.len())
}
```

- [ ] **Step 6: Implement in `src-tauri/src/bmad.rs`**

Replace `ScaffoldReport` (lines 5-9) with:

```rust
#[derive(Serialize, Clone, Debug, Default)]
pub struct ScaffoldReport {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
    /// Folders the install created, outermost first.
    #[serde(skip)]
    pub created_dirs: Vec<std::path::PathBuf>,
}
```

Replace `copy_tree` (lines 17-38) with:

```rust
/// Copy a file or a tree, leaving what exists alone. An error stops the copy:
/// a setup that half-succeeds silently is worse than one that says why it failed.
pub fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    if src.is_dir() {
        crate::projectsetup::mkdirs(dst, &mut report.created_dirs)?;
        for entry in std::fs::read_dir(src).map_err(|e| format!("{}: {e}", src.display()))? {
            let entry = entry.map_err(|e| format!("{}: {e}", src.display()))?;
            copy_tree(&entry.path(), &dst.join(entry.file_name()), report)?;
        }
    } else if src.is_file() {
        if dst.exists() {
            report.skipped.push(dst.to_string_lossy().to_string());
        } else {
            if let Some(parent) = dst.parent() {
                crate::projectsetup::mkdirs(parent, &mut report.created_dirs)?;
            }
            std::fs::copy(src, dst).map_err(|e| format!("{}: {e}", dst.display()))?;
            report.created.push(dst.to_string_lossy().to_string());
        }
    }
    Ok(())
}
```

Replace `install` and `scaffold_bmad` (lines 47-73) with:

```rust
/// Copy BMAD into a project: .bmad-core/ and the /BMad Claude Code commands.
/// Existing files are left alone.
pub fn install(res_root: &Path, project: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    let core = res_root.join("bmad-core");
    if !core.is_dir() {
        return Err(format!("bmad v4 resources not found at {}", core.display()));
    }
    copy_tree(&core, &project.join(".bmad-core"), report)?;
    let cmd_src = res_root.join("claude-commands").join("BMad");
    if cmd_src.is_dir() {
        copy_tree(&cmd_src, &project.join(".claude").join("commands").join("BMad"), report)?;
    }
    // VERSION marker for bmad_status.
    if let Ok(v) = std::fs::read_to_string(res_root.join("VERSION")) {
        let marker = project.join(".bmad-core").join("VERSION");
        if !marker.exists() {
            std::fs::write(&marker, v).map_err(|e| format!("{}: {e}", marker.display()))?;
            report.created.push(marker.to_string_lossy().to_string());
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn scaffold_bmad(app: tauri::AppHandle, path: String) -> Result<ScaffoldReport, String> {
    let project = Path::new(&path);
    if !project.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let mut report = ScaffoldReport::default();
    install(&resource_root(&app)?, project, &mut report)?;
    Ok(report)
}
```

- [ ] **Step 7: Implement in `src-tauri/src/bmadv6.rs`**

Replace `ScaffoldReport` (lines 31-35) with:

```rust
#[derive(Default)]
pub struct ScaffoldReport {
    pub created: Vec<PathBuf>,
    pub kept: Vec<PathBuf>,
    /// Folders the install created, outermost first.
    pub created_dirs: Vec<PathBuf>,
}
```

In `copy_tree` (line 80), replace

```rust
            fs::create_dir_all(&to).map_err(|e| e.to_string())?;
```

with

```rust
            crate::projectsetup::mkdirs(&to, &mut report.created_dirs)?;
```

In `install`, replace line 109

```rust
    fs::create_dir_all(dir.join("_bmad/custom")).map_err(|e| e.to_string())?;
```

with

```rust
    crate::projectsetup::mkdirs(&dir.join("_bmad/custom"), &mut report.created_dirs)?;
```

replace line 132

```rust
    fs::create_dir_all(dir.join("_bmad-output")).map_err(|e| e.to_string())?;
```

with

```rust
    crate::projectsetup::mkdirs(&dir.join("_bmad-output"), &mut report.created_dirs)?;
```

and replace line 139

```rust
    fs::create_dir_all(dir.join(".ade")).map_err(|e| e.to_string())?;
```

with

```rust
    crate::projectsetup::mkdirs(&dir.join(".ade"), &mut report.created_dirs)?;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml projectsetup`
Expected: PASS, including `mkdirs_records_each_level_it_creates`, `apply_keeps_its_partial_report_when_the_install_fails`, `a_failed_setup_leaves_nothing_behind`, `a_setup_that_succeeds_keeps_what_it_wrote` and the twelve earlier tests.

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmad`
Expected: PASS for `bmad::tests` (six tests), `bmadv6::tests` (eight tests) and the `bmadv6_e2e` integration tests.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/projectsetup.rs src-tauri/src/bmad.rs src-tauri/src/bmadv6.rs
git commit -m "fix(setup): a failed setup removes what it wrote, and the v4 install reports its errors"
```

---

### Task 2: A v4 setup writes the methodology marker

**Files:**
- Modify: `src-tauri/src/bmad.rs` (`install`, and its tests)
- Modify: `src-tauri/src/projectsetup.rs` (tests, append)

**Interfaces:**
- Consumes (Task 1): `crate::projectsetup::mkdirs(path: &Path, created: &mut Vec<PathBuf>) -> Result<(), String>`; `bmad::install(res_root: &Path, project: &Path, report: &mut ScaffoldReport) -> Result<(), String>`; `ScaffoldReport { created: Vec<String>, skipped: Vec<String>, created_dirs: Vec<PathBuf> }`; test helpers `temp(name: &str) -> PathBuf` and `v4_source(name: &str) -> PathBuf` in `bmad.rs`'s tests, and `run(dir, files, import, marker, methodology, methodology_src) -> Result<SetupReport, String>` and `v4_source() -> PathBuf` in `projectsetup.rs`'s tests.
- Produces: after `bmad::install`, `<project>/.ade/methodology` holds `v4\n`, and its path is in `report.created` unless it already read `v4`.

- [ ] **Step 1: Write the failing tests**

Append to the `tests` module of `src-tauri/src/bmad.rs`:

```rust
    #[test]
    fn install_writes_the_v4_marker_once() {
        let src = v4_source("ade_bmad_marker_src");
        let dir = temp("ade_bmad_marker");
        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        let marker = dir.join(".ade").join("methodology");
        assert_eq!(std::fs::read_to_string(&marker).unwrap(), "v4\n");
        assert!(report.created.contains(&marker.to_string_lossy().to_string()), "{:?}", report.created);
        assert!(report.created_dirs.contains(&dir.join(".ade")), "{:?}", report.created_dirs);

        // The marker alone says v4, with `.bmad-core/` gone.
        std::fs::remove_dir_all(dir.join(".bmad-core")).unwrap();
        assert_eq!(crate::bmadv6::detect_on_disk(&dir), Some(crate::bmadv6::Methodology::V4));

        // A second run keeps it, and doesn't claim to have created it.
        let mut again = ScaffoldReport::default();
        install(&src, &dir, &mut again).unwrap();
        assert!(!again.created.contains(&marker.to_string_lossy().to_string()), "{:?}", again.created);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    /// An explicit v4 install over a marker that says otherwise: the tree is
    /// v4 now, so the marker must be too.
    #[test]
    fn a_v4_install_replaces_a_marker_that_says_otherwise() {
        let src = v4_source("ade_bmad_flip_src");
        let dir = temp("ade_bmad_flip");
        std::fs::create_dir_all(dir.join(".ade")).unwrap();
        std::fs::write(dir.join(".ade/methodology"), "v6\n").unwrap();
        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join(".ade/methodology")).unwrap(), "v4\n");
        assert_eq!(crate::bmadv6::detect_on_disk(&dir), Some(crate::bmadv6::Methodology::V4));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }
```

Append to the `tests` module of `src-tauri/src/projectsetup.rs`:

```rust
    #[test]
    fn a_v4_setup_writes_the_marker_and_counts_it() {
        let dir = temp();
        let src = v4_source();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, Some(&src)).unwrap();

        assert_eq!(std::fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(), "v4");
        // core-config.yaml, tasks/a.md, VERSION, the marker.
        assert_eq!(r.bmad_files, 4, "{:?}", r.created);
        assert!(r.created.contains(&dir.join(".ade").join("methodology").to_string_lossy().into_owned()), "{:?}", r.created);
        let status = project_setup_status(dir.to_string_lossy().into(), vec![], "<!-- m -->".into()).unwrap();
        assert_eq!(status.methodology.as_deref(), Some("v4"));
        assert!(status.bmad_installed);

        // A project from before the marker: `.bmad-core/` only. Its next setup writes it.
        let old = temp();
        std::fs::create_dir_all(old.join(".bmad-core")).unwrap();
        let again = run(&old, &files(), None, "<!-- m -->", Methodology::V4, Some(&src)).unwrap();
        assert_eq!(std::fs::read_to_string(old.join(".ade/methodology")).unwrap().trim(), "v4");
        assert!(again.created.contains(&old.join(".ade").join("methodology").to_string_lossy().into_owned()));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(old).ok();
        std::fs::remove_dir_all(src).ok();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml marker`
Expected: FAIL. `install_writes_the_v4_marker_once` and `a_v4_setup_writes_the_marker_and_counts_it` panic with "No such file or directory" reading `.ade/methodology`; `a_v4_install_replaces_a_marker_that_says_otherwise` fails its `assert_eq!` (`"v6\n"` vs `"v4\n"`).

- [ ] **Step 3: Implement**

In `src-tauri/src/bmad.rs`, in `install`, insert before the final `Ok(())`:

```rust
    // The methodology marker, as the v6 install writes it: without one a v4
    // project reads as v4 only while `.bmad-core/` exists. It is ADE's own
    // file, so an explicit v4 install replaces a marker that says otherwise.
    let methodology = project.join(".ade").join("methodology");
    if std::fs::read_to_string(&methodology).map(|s| s.trim() == "v4").unwrap_or(false) {
        report.skipped.push(methodology.to_string_lossy().to_string());
    } else {
        crate::projectsetup::mkdirs(&project.join(".ade"), &mut report.created_dirs)?;
        std::fs::write(&methodology, "v4\n").map_err(|e| format!("{}: {e}", methodology.display()))?;
        report.created.push(methodology.to_string_lossy().to_string());
    }
```

Change the doc comment above `install` to:

```rust
/// Copy BMAD into a project: .bmad-core/, the /BMad Claude Code commands and
/// the methodology marker. Existing files are left alone.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml marker`
Expected: PASS (three tests, plus the earlier `status_reports_the_methodology_on_disk_marker_first` and the v6 marker tests that match the filter).

Run: `cargo test --manifest-path src-tauri/Cargo.toml projectsetup`
Expected: PASS. `a_failed_setup_leaves_nothing_behind` still passes: the marker is written last, so a failed copy never reaches it.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bmad.rs src-tauri/src/projectsetup.rs
git commit -m "fix(setup): a v4 setup writes the methodology marker"
```

---

### Task 3: One normalised root for every per-project list, and the setup root

**Files:**
- Modify: `src/lib/projectSetup.ts:42-129` (the list helpers), `:194-226` (`inFlight`, `isSettingUp`, `setUpProject`); add `setupRootOf` and `foldersUpTo` after `methodologyOf` (line 188)
- Test: `src/lib/__tests__/projectSetup.test.ts` (extend the mock, append)

**Interfaces:**
- Produces (all exported from `src/lib/projectSetup.ts`):
  - `normRoot(root: string): string`: `root` without trailing `/` or `\`; a bare `/` stays `/`.
  - `setupRootOf(cwd: string): Promise<string>`: the BMAD project `cwd` is in (`bmadRootOf`), else `project_root(cwd)`; normalised. Never rejects.
  - `foldersUpTo(dir: string, stop: string): string[]`: `dir` and each folder above it, up to and including `stop`, all normalised. Just `[dir]` when `dir` isn't under `stop`.
  - `wasSetUp`, `setupDeclined`, `removedAgents`, `isSettingUp` and `setUpProject` keep their signatures and now key on `normRoot(root)`. `setUpProject` resolves with `root: normRoot(root)` and passes that root to `project_setup_apply`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/projectSetup.test.ts`, add two cases to the `invoke` mock's `switch`, before `default:`:

```ts
      case "project_setup_undo":
        return 0;
      case "project_agent_remove":
        return true;
```

Replace the import on line 40 with:

```ts
import {
  addAgent, addStackAgents, bmadRootOf, detectOnDisk, foldersUpTo, isSettingUp, methodologyOf, normRoot, removeAgent, removedAgents,
  setUpProject, setupDeclined, setupRootOf, undoSetup, wasSetUp,
} from "../projectSetup";
```

Add `localStorage.clear();` as the first line of the `beforeEach` (line 44).

Append to the file:

```ts
describe("the normalised root", () => {
  it("strips trailing separators and leaves a bare root alone", () => {
    expect(normRoot("/code/shop/")).toBe("/code/shop");
    expect(normRoot("/code/shop//")).toBe("/code/shop");
    expect(normRoot("C:\\code\\shop\\")).toBe("C:\\code\\shop");
    expect(normRoot("/code/shop")).toBe("/code/shop");
    expect(normRoot("/")).toBe("/");
  });

  it("marks a project set up under one key, with or without a trailing slash", async () => {
    const result = await setUpProject("/code/shop/", "v6", []);
    expect(result.root).toBe("/code/shop");
    expect(lastApply().root).toBe("/code/shop");
    expect(wasSetUp("/code/shop")).toBe(true);
    expect(wasSetUp("/code/shop/")).toBe(true);
    expect(JSON.parse(localStorage.getItem("ade-project-setup-done")!)).toEqual(["/code/shop"]);
  });

  it("normalises keys written before, when it reads them", () => {
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/old/", "/code/old"]));
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["C:\\code\\old\\"]));
    expect(wasSetUp("/code/old")).toBe(true);
    expect(setupDeclined("C:\\code\\old")).toBe(true);
  });

  it("declines under the normalised root, and a later setup clears it", async () => {
    const result = await setUpProject("/code/shop", "v6", []);
    await undoSetup({ ...result, root: "/code/shop/" });
    expect(setupDeclined("/code/shop")).toBe(true);
    expect(JSON.parse(localStorage.getItem("ade-project-setup-declined")!)).toEqual(["/code/shop"]);
    await setUpProject("/code/shop/", "v6", []);
    expect(setupDeclined("/code/shop")).toBe(false);
  });

  it("keeps removed agents under the normalised root", async () => {
    await removeAgent("/code/shop/", "qa");
    expect(removedAgents("/code/shop")).toEqual(["qa"]);
    localStorage.setItem("ade-project-agents-removed", JSON.stringify({ "/code/old/": ["qa"], "/code/old": ["architect"] }));
    expect(removedAgents("/code/old").sort()).toEqual(["architect", "qa"]);
  });

  it("shares a running setup across spellings of the root", async () => {
    const first = setUpProject("/code/shop", "v6", []);
    expect(isSettingUp("/code/shop/")).toBe(true);
    expect(setUpProject("/code/shop/", "v6", [])).toBe(first);
    await first;
    expect(tauri.applies).toHaveLength(1);
    expect(isSettingUp("/code/shop")).toBe(false);
  });
});

describe("setupRootOf", () => {
  it("is the BMAD project the folder is in", async () => {
    tauri.byDir = { "/mono": null, "/mono/app": "v4", "/mono/app/src": null };
    tauri.roots = { "/mono/app/src": "/mono" };
    expect(await setupRootOf("/mono/app/src")).toBe("/mono/app");
  });

  it("falls back to the project root, normalised", async () => {
    tauri.roots = { "/mono/app/src": "/mono/" };
    expect(await setupRootOf("/mono/app/src")).toBe("/mono");
  });
});

describe("foldersUpTo", () => {
  it("lists the folder and each one above it, up to the stop", () => {
    expect(foldersUpTo("/mono/app/src", "/mono")).toEqual(["/mono/app/src", "/mono/app", "/mono"]);
    expect(foldersUpTo("/mono/", "/mono")).toEqual(["/mono"]);
    expect(foldersUpTo("C:\\p\\src", "C:\\p")).toEqual(["C:\\p\\src", "C:\\p"]);
  });

  it("is just the folder when it isn't under the stop", () => {
    expect(foldersUpTo("/elsewhere/x", "/mono")).toEqual(["/elsewhere/x"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts`
Expected: FAIL. The new tests fail with "normRoot is not a function" (and the same for `setupRootOf` and `foldersUpTo`); the earlier tests in the file still pass.

- [ ] **Step 3: Implement the list helpers**

In `src/lib/projectSetup.ts`, replace lines 42-129 (from `const DONE_KEY` through the end of `withoutRemoved`) with:

```ts
const DONE_KEY = "ade-project-setup-done";
const REMOVED_KEY = "ade-project-agents-removed";
const DECLINED_KEY = "ade-project-setup-declined";

/**
 * One spelling per project: no trailing separator. Every per-project list keys
 * on it, so `/code/shop/` and `/code/shop` are one project.
 */
export function normRoot(root: string): string {
  return root.replace(/[\\/]+$/, "") || root;
}

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(v)) return [];
    // Lists written before roots were normalised may hold a trailing separator.
    return [...new Set(v.filter((r): r is string => typeof r === "string").map(normRoot))];
  } catch {
    return [];
  }
}

function writeList(key: string, root: string, on: boolean) {
  const at = normRoot(root);
  const list = readList(key).filter((r) => r !== at);
  if (on) list.push(at);
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
}

/** The user undid setup here: automatic setup leaves this project alone. */
export function setupDeclined(root: string): boolean {
  return readList(DECLINED_KEY).includes(normRoot(root));
}

const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

/** Home folders and the filesystem root are never projects. */
export function isSetupCandidate(root: string): boolean {
  return !/^(\/|[A-Za-z]:\\?|\/(Users|home)\/[^/]+\/?|[A-Za-z]:\\Users\\[^\\]+\\?)$/.test(root);
}

export function wasSetUp(root: string): boolean {
  return readList(DONE_KEY).includes(normRoot(root));
}

function markSetUp(root: string, done: boolean) {
  writeList(DONE_KEY, root, done);
}

function readRemoved(): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(REMOVED_KEY) ?? "{}");
    if (!v || typeof v !== "object") return {};
    // Two spellings of one root, from before roots were normalised, are merged.
    const out: Record<string, string[]> = {};
    for (const [root, ids] of Object.entries(v as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      const at = normRoot(root);
      out[at] = [...new Set([...(out[at] ?? []), ...ids.filter((id): id is string => typeof id === "string")])];
    }
    return out;
  } catch {
    return {};
  }
}

/** Agents the user removed from a project, which setup won't bring back. */
export function removedAgents(root: string): string[] {
  return readRemoved()[normRoot(root)] ?? [];
}

function setRemoved(root: string, id: string, removed: boolean) {
  const at = normRoot(root);
  const all = readRemoved();
  const list = (all[at] ?? []).filter((x) => x !== id);
  if (removed) list.push(id);
  all[at] = list;
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: a removed agent may come back with the stack.
  }
}

const withoutRemoved = (root: string, files: MethodologyFile[]) => {
  const removed = new Set(removedAgents(root).map((id) => `.claude/agents/${id}.md`));
  return files.filter((f) => !removed.has(f.path));
};
```

- [ ] **Step 4: Implement `setupRootOf` and `foldersUpTo`**

In `src/lib/projectSetup.ts`, add after `methodologyOf` (it ends at line 188 before this task's edits):

```ts
/**
 * The folder a setup started from `cwd` works on: the BMAD project `cwd` is in,
 * else its project root (the nearest `.git` ancestor, or `cwd` itself).
 */
export async function setupRootOf(cwd: string): Promise<string> {
  const found = await bmadRootOf(cwd);
  return normRoot(found?.root ?? (await invoke<string>("project_root", { path: cwd }).catch(() => cwd)));
}

/**
 * `dir` and each folder above it, up to and including `stop`. Just `dir` when
 * it isn't under `stop`.
 */
export function foldersUpTo(dir: string, stop: string): string[] {
  const end = normRoot(stop);
  const out: string[] = [];
  let at: string | null = normRoot(dir);
  // Bounded, as bmadRootOf is: a dir that is somehow not under its stop still ends.
  for (let i = 0; at && i < 64; i++) {
    out.push(at);
    if (at === end || !at.startsWith(end)) break;
    at = parentDir(at);
  }
  return out;
}
```

- [ ] **Step 5: Key the in-flight map on the normalised root**

In `src/lib/projectSetup.ts`, replace `isSettingUp` and `setUpProject` (the block from `/** A setup for this project is running right now. */` through the end of `setUpProject`; keep `setUpProject`'s doc comment as it is) with:

```ts
/** A setup for this project is running right now. */
export function isSettingUp(root: string): boolean {
  return inFlight.has(normRoot(root));
}

/**
 * Set up a project: BMAD, methodology, the core roles and its stack's agents.
 * Safe to run again; a setup already running for the project is shared.
 * Running it by hand clears an earlier Undo.
 *
 * `methodology` is the owner's answer from the setup prompt. Without one, the
 * project's own marker (else `.bmad-core/`) decides, and a project with
 * neither — a new one — gets the v6 default.
 */
export function setUpProject(root: string, methodology?: Methodology, stacks?: Stack[]): Promise<SetupResult> {
  const at = normRoot(root);
  const running = inFlight.get(at);
  if (running) return running;
  const job = (async () => {
    // Only ask the project itself when the callers left something unresolved.
    const status = methodology !== undefined && stacks !== undefined ? null : await setupStatus(at);
    const chosen = methodology ?? status?.methodology ?? "v6";
    const detected = stacks ?? status?.stacks ?? [];
    const files = withoutRemoved(at, methodologyFiles(baseName(at), detected, chosen));
    const report = await apply(at, files, chosen);
    markSetUp(at, true);
    writeList(DECLINED_KEY, at, false);
    return { root: at, report, files, stacks: detected };
  })().finally(() => inFlight.delete(at));
  inFlight.set(at, job);
  return job;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts src/lib/__tests__/persistedKeys.test.ts src/lib/__tests__/projectMethodology.test.ts`
Expected: PASS. `persistedKeys` still passes: no storage key was added.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projectSetup.ts src/lib/__tests__/projectSetup.test.ts
git commit -m "fix(setup): key every per-project list on one normalised root"
```

---

### Task 4: Toasts with several actions

**Files:**
- Modify: `src/hooks/useContextGuard.ts:8-13` (`GuardToast`)
- Create: `src/components/Toast.tsx`
- Modify: `src/App.tsx:10` (import), `:14` (import), `:158-164` (`showToast`), `:529-567` (the inline toast)
- Test: `src/components/__tests__/Toast.test.tsx`

**Interfaces:**
- Produces (from `src/hooks/useContextGuard.ts`):
  - `interface ToastAction { label: string; command?: string; run?: () => void }`
  - `interface GuardToast { title: string; body: string; action?: ToastAction; actions?: ToastAction[] }`
  - `toastActions(t: GuardToast): ToastAction[]`: `t.actions`, else `[t.action]`, else `[]`.
- Produces: `src/components/Toast.tsx`, default export `Toast({ toast, onDismiss }: { toast: GuardToast; onDismiss: () => void })`. A toast with any action is not dismissed by a click on its body; clicking an action runs it, then dismisses.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/Toast.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const terminal = vi.hoisted(() => ({ sendToActiveTerminal: vi.fn(async (_command: string, _run: boolean) => true) }));
vi.mock("../../lib/terminalCommands", () => terminal);

import Toast from "../Toast";
import { toastActions, type GuardToast } from "../../hooks/useContextGuard";

beforeEach(() => terminal.sendToActiveTerminal.mockClear());

describe("toastActions", () => {
  it("reads `action` as shorthand for one action", () => {
    const undo = { label: "Undo", run: vi.fn() };
    expect(toastActions({ title: "t", body: "b", action: undo })).toEqual([undo]);
    expect(toastActions({ title: "t", body: "b", actions: [undo, undo] })).toHaveLength(2);
    expect(toastActions({ title: "t", body: "b" })).toEqual([]);
  });
});

describe("Toast", () => {
  const ask = (runs: Record<string, () => void>): GuardToast => ({
    title: "Set up shop with BMAD?",
    body: "Existing files are left as they were.",
    actions: [
      { label: "v6", run: runs.v6 },
      { label: "v4", run: runs.v4 },
      { label: "Not now", run: runs.notNow },
    ],
  });

  it("shows every action as a button, in order", () => {
    render(<Toast toast={ask({})} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["v6", "v4", "Not now"]);
  });

  it("is not dismissed by a click on its body when it has actions", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={ask({})} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Set up shop with BMAD?"));
    fireEvent.click(screen.getByText("Existing files are left as they were."));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("runs the action clicked, only that one, then dismisses", () => {
    const runs = { v6: vi.fn(), v4: vi.fn(), notNow: vi.fn() };
    const onDismiss = vi.fn();
    render(<Toast toast={ask(runs)} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "v4" }));
    expect(runs.v4).toHaveBeenCalledOnce();
    expect(runs.v6).not.toHaveBeenCalled();
    expect(runs.notNow).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("is dismissed by a click anywhere when it has no action", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ title: "Agent finished", body: "Done." }} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Done."));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("types a command action into the terminal without running it", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ title: "Context at 80%", body: "b", action: { label: "Type /compact", command: "/compact" } }} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Type /compact" }));
    expect(terminal.sendToActiveTerminal).toHaveBeenCalledWith("/compact", false);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/Toast.test.tsx`
Expected: FAIL, "Failed to resolve import "../Toast"".

- [ ] **Step 3: Extend `GuardToast`**

In `src/hooks/useContextGuard.ts`, replace lines 8-13 (the `GuardToast` interface) with:

```ts
/** A command typed into the active terminal for review (never run), or a callback. */
export interface ToastAction {
  label: string;
  command?: string;
  run?: () => void;
}

export interface GuardToast {
  title: string;
  body: string;
  /** Shorthand for a single action. */
  action?: ToastAction;
  /** Several buttons, in order. A toast with any action is not dismissed by a click on its body. */
  actions?: ToastAction[];
}

export function toastActions(t: GuardToast): ToastAction[] {
  return t.actions ?? (t.action ? [t.action] : []);
}
```

- [ ] **Step 4: Create `src/components/Toast.tsx`**

```tsx
import { toastActions, type GuardToast } from "../hooks/useContextGuard";
import { sendToActiveTerminal } from "../lib/terminalCommands";

/** The app's one toast, bottom right. */
export default function Toast({ toast, onDismiss }: { toast: GuardToast; onDismiss: () => void }) {
  const actions = toastActions(toast);
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "60px",
        right: "20px",
        zIndex: 2500,
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius)",
        padding: "12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        animation: "toast-slide-in 0.3s ease",
        maxWidth: "320px",
      }}
      // A toast that asks something is answered with its buttons: a stray
      // click on the body must not throw the question away.
      onClick={() => { if (!actions.length) onDismiss(); }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>
        {toast.title}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
        {toast.body}
      </div>
      {actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              className="contracts-action"
              onClick={() => {
                if (a.run) a.run();
                else if (a.command) void sendToActiveTerminal(a.command, false);
                onDismiss();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Use it in `src/App.tsx`**

Replace line 10

```tsx
import { writePty, sendToActiveTerminal } from "./lib/terminalCommands";
```

with

```tsx
import { writePty } from "./lib/terminalCommands";
import Toast from "./components/Toast";
```

Replace line 14

```tsx
import { useContextGuard, type GuardToast } from "./hooks/useContextGuard";
```

with

```tsx
import { useContextGuard, toastActions, type GuardToast } from "./hooks/useContextGuard";
```

In `showToast` (line 163), replace

```tsx
    toastTimer.current = window.setTimeout(() => setToast(null), t.action ? 15000 : 4000);
```

with

```tsx
    toastTimer.current = window.setTimeout(() => setToast(null), toastActions(t).length ? 15000 : 4000);
```

Replace the whole inline toast (lines 529-567, from `{toast && (` through its closing `)}`) with:

```tsx
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/Toast.test.tsx src/hooks/__tests__/announceSetup.test.ts`
Expected: PASS (6 tests in `Toast.test.tsx`, 2 in `announceSetup.test.ts`).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. (An unused `sendToActiveTerminal` import in `App.tsx` would fail here: `noUnusedLocals` is on.)

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useContextGuard.ts src/components/Toast.tsx src/components/__tests__/Toast.test.tsx src/App.tsx
git commit -m "feat(toast): several actions, and a toast with actions keeps its question"
```

---

### Task 5: `askMethodology` and the shared dialog

**Files:**
- Create: `src/lib/methodologyPrompt.ts`
- Create: `src/components/MethodologyPrompt.tsx`
- Modify: `src/components/useEscapeToClose.ts` (whole file)
- Modify: `src/App.tsx` (one import; one element before the toast)
- Test: `src/lib/__tests__/methodologyPrompt.test.ts`, `src/components/__tests__/MethodologyPrompt.test.tsx`, `src/components/__tests__/useEscapeToClose.test.tsx`

**Interfaces:**
- Consumes (Task 3): `normRoot(root: string): string`, `detectOnDisk(root: string): Promise<Methodology | null>`, `setUpProject(root: string, methodology?: Methodology, stacks?: Stack[]): Promise<SetupResult>`, all from `src/lib/projectSetup.ts`.
- Produces (from `src/lib/methodologyPrompt.ts`):
  - `type MethodologyAnswer = { kind: "chosen"; methodology: Methodology; asked: boolean } | { kind: "dismissed" }`. `asked` is true when a person picked it and false when it was read from disk.
  - `type AskUi = (root: string) => Promise<MethodologyAnswer>`
  - `askMethodology(root: string, opts?: { ask?: AskUi; once?: boolean }): Promise<MethodologyAnswer>`. Returns the version on disk with `asked: false` and no UI when the project has BMAD. Otherwise asks through `opts.ask`, by default the modal. With `once: true` it returns `{ kind: "dismissed" }` without UI if the root was already asked this session, and otherwise marks the root before asking; a `chosen` answer clears the mark.
  - `dismissedThisSession(root: string): boolean`
  - `askAndSetUp(root: string): Promise<SetupResult | null>`: `askMethodology`, then `setUpProject` on the answer and a `project-setup-done` window event; `null` when not chosen. Rejects if setup fails.
  - `useMethodologyPrompt` (zustand store, state `{ request: { root: string } | null }`), `settlePrompt(answer: MethodologyAnswer): void`, `projectName(root: string): string`, `__resetPromptForTests(): void`.
- Produces (from `src/components/MethodologyPrompt.tsx`): named export `MethodologyPrompt({ root, onAnswer, onDismiss })` and default export `MethodologyPromptHost()`, which renders the dialog for the store's request.
- Produces: `useEscapeToClose(onClose)` keeps its signature; only the panel mounted last hears Escape.
- **How plan B extends this without reshaping callers.** Every caller branches on `answer.kind === "chosen"` and treats any other kind as "don't set up", so a `{ kind: "blocked"; reason: string }` member is additive: callers that want to show the reason add a branch, the rest already do the right thing. The keep-or-switch mode is a further optional field on `opts`, passed only by New Tab; the other callers' calls don't change. The dialog component gains a mode prop with choose as its default.

- [ ] **Step 1: Write the failing test for the Escape stack**

Create `src/components/__tests__/useEscapeToClose.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useEscapeToClose } from "../useEscapeToClose";

function Panel({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose);
  return null;
}

const escape = () => fireEvent.keyDown(window, { key: "Escape" });

describe("useEscapeToClose", () => {
  it("closes only the panel opened last", () => {
    const under = vi.fn();
    const over = vi.fn();
    render(<Panel onClose={under} />);
    const top = render(<Panel onClose={over} />);
    escape();
    expect(over).toHaveBeenCalledOnce();
    expect(under).not.toHaveBeenCalled();

    top.unmount();
    escape();
    expect(under).toHaveBeenCalledOnce();
  });

  it("keeps its place when the panel under it re-renders with a new callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const over = vi.fn();
    const bottom = render(<Panel onClose={first} />);
    const top = render(<Panel onClose={over} />);
    bottom.rerender(<Panel onClose={second} />);
    escape();
    expect(over).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    // The callback in use is the latest one.
    top.unmount();
    escape();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/useEscapeToClose.test.tsx`
Expected: FAIL. "closes only the panel opened last" fails on `expect(under).not.toHaveBeenCalled()`: today every mounted panel hears Escape.

- [ ] **Step 3: Rewrite `src/components/useEscapeToClose.ts`**

Replace the whole file with:

```ts
import { useEffect, useRef } from "react";

/** Panels listening for Escape, in the order they opened. */
const open: object[] = [];

/**
 * Closes a panel on Escape. Capture phase: the terminal keeps focus and xterm
 * stops Escape bubbling.
 *
 * Only the panel opened last answers, so a dialog over a panel closes alone.
 */
export function useEscapeToClose(onClose: () => void) {
  // Callers pass a new arrow each render. Re-registering on each would move a
  // panel to the top of the stack whenever it re-rendered.
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const entry = {};
    open.push(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open[open.length - 1] !== entry) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      open.splice(open.indexOf(entry), 1);
    };
  }, []);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/__tests__/useEscapeToClose.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `askMethodology`**

Create `src/lib/__tests__/methodologyPrompt.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  applies: [] as Record<string, unknown>[],
  statusFails: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_setup_status":
        if (tauri.statusFails) throw new Error("not a folder");
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: tauri.byDir[args.root as string] ?? null };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import {
  __resetPromptForTests, askAndSetUp, askMethodology, dismissedThisSession, projectName, settlePrompt, useMethodologyPrompt,
  type MethodologyAnswer,
} from "../methodologyPrompt";

const request = () => useMethodologyPrompt.getState().request;
const asked = (root: string) => vi.waitFor(() => expect(request()).toEqual({ root }));

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.applies.length = 0;
  tauri.statusFails = false;
  __resetPromptForTests();
});

describe("askMethodology", () => {
  it("returns the version on disk without asking", async () => {
    tauri.byDir = { "/code/old": "v4", "/code/new": "v6" };
    expect(await askMethodology("/code/old")).toEqual({ kind: "chosen", methodology: "v4", asked: false });
    expect(await askMethodology("/code/new/")).toEqual({ kind: "chosen", methodology: "v6", asked: false });
    expect(request()).toBeNull();
  });

  it("asks about a project with no BMAD, and resolves with the answer", async () => {
    const answer = askMethodology("/code/shop/");
    await asked("/code/shop");
    settlePrompt({ kind: "chosen", methodology: "v4", asked: true });
    expect(await answer).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    expect(request()).toBeNull();
  });

  it("resolves as dismissed when the question is closed", async () => {
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    expect(await answer).toEqual({ kind: "dismissed" });
  });

  it("asks when the check on disk fails, rather than guessing a version", async () => {
    tauri.statusFails = true;
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
  });

  it("shares one question between two callers asking about the same project", async () => {
    const a = askMethodology("/code/shop");
    const b = askMethodology("/code/shop/");
    await asked("/code/shop");
    settlePrompt({ kind: "chosen", methodology: "v6", asked: true });
    expect(await a).toEqual({ kind: "chosen", methodology: "v6", asked: true });
    expect(await b).toEqual({ kind: "chosen", methodology: "v6", asked: true });
  });

  it("dismisses the question it replaces when another project asks", async () => {
    const first = askMethodology("/code/shop");
    await asked("/code/shop");
    const second = askMethodology("/code/other");
    await asked("/code/other");
    expect(await first).toEqual({ kind: "dismissed" });
    settlePrompt({ kind: "chosen", methodology: "v6", asked: true });
    expect(await second).toEqual({ kind: "chosen", methodology: "v6", asked: true });
  });

  it("uses the caller's own question instead of the dialog", async () => {
    const ask = vi.fn(async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v4", asked: true }));
    expect(await askMethodology("/code/shop/", { ask })).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    expect(ask).toHaveBeenCalledWith("/code/shop");
    expect(request()).toBeNull();
  });
});

describe("asking once per session", () => {
  it("marks the project before the question shows, and doesn't ask it again", async () => {
    // A question that is never answered: a toast that timed out.
    const ask = vi.fn(() => new Promise<MethodologyAnswer>(() => {}));
    void askMethodology("/code/shop", { once: true, ask });
    await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce());
    expect(dismissedThisSession("/code/shop/")).toBe(true);

    expect(await askMethodology("/code/shop/", { once: true, ask })).toEqual({ kind: "dismissed" });
    expect(ask).toHaveBeenCalledOnce();
  });

  it("stays dismissed after the question is closed", async () => {
    const ask = async (): Promise<MethodologyAnswer> => ({ kind: "dismissed" });
    expect(await askMethodology("/code/shop", { once: true, ask })).toEqual({ kind: "dismissed" });
    expect(dismissedThisSession("/code/shop")).toBe(true);
  });

  it("clears the mark when a version is chosen", async () => {
    const ask = async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v6", asked: true });
    await askMethodology("/code/shop", { once: true, ask });
    expect(dismissedThisSession("/code/shop")).toBe(false);
  });

  it("still asks a dismissed project when the caller doesn't ask once", async () => {
    await askMethodology("/code/shop", { once: true, ask: async () => ({ kind: "dismissed" }) });
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
  });

  it("never dismisses a project that has BMAD", async () => {
    tauri.byDir = { "/code/old": "v4" };
    await askMethodology("/code/old", { once: true });
    expect(dismissedThisSession("/code/old")).toBe(false);
  });

  it("keeps the dismissals in memory only", async () => {
    await askMethodology("/code/shop", { once: true, ask: async () => ({ kind: "dismissed" }) });
    expect(localStorage.length).toBe(0);
  });
});

describe("askAndSetUp", () => {
  it("sets the project up on the answer and announces it", async () => {
    const done = vi.fn();
    window.addEventListener("project-setup-done", done);
    const result = askAndSetUp("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "chosen", methodology: "v4", asked: true });
    expect((await result)?.root).toBe("/code/shop");
    expect(tauri.applies).toHaveLength(1);
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4", full: true });
    expect(done).toHaveBeenCalledOnce();
    window.removeEventListener("project-setup-done", done);
  });

  it("sets up a project that has BMAD on its own version, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    await askAndSetUp("/code/old");
    expect(request()).toBeNull();
    expect(tauri.applies[0]).toMatchObject({ root: "/code/old", methodology: "v4" });
  });

  it("sets nothing up when the question is dismissed", async () => {
    const result = askAndSetUp("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    expect(await result).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("projectName", () => {
  it("is the folder's name, on either separator", () => {
    expect(projectName("/code/shop")).toBe("shop");
    expect(projectName("/code/shop/")).toBe("shop");
    expect(projectName("C:\\code\\shop")).toBe("shop");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/methodologyPrompt.test.ts`
Expected: FAIL, "Failed to resolve import "../methodologyPrompt"".

- [ ] **Step 7: Create `src/lib/methodologyPrompt.ts`**

```ts
/**
 * Which BMAD version a setup uses. Every entry point asks here: a project that
 * has BMAD keeps its version without a question, and one with neither is asked.
 */
import { create } from "zustand";
import { detectOnDisk, normRoot, setUpProject, type Methodology, type SetupResult } from "./projectSetup";

/**
 * `chosen` is the only answer that sets a project up. Callers treat every
 * other kind as "leave it", so a new kind needs no change in them.
 */
export type MethodologyAnswer =
  /** `asked`: a person picked it, rather than the project already being on it. */
  | { kind: "chosen"; methodology: Methodology; asked: boolean }
  | { kind: "dismissed" };

/** A way to put the question to a person. The default is the dialog. */
export type AskUi = (root: string) => Promise<MethodologyAnswer>;

/** The project the dialog is asking about; MethodologyPromptHost renders it. */
export const useMethodologyPrompt = create<{ request: { root: string } | null }>(() => ({ request: null }));

let waiting: { root: string; promise: Promise<MethodologyAnswer>; resolve: (a: MethodologyAnswer) => void } | null = null;

const askByDialog: AskUi = (root) => {
  if (waiting?.root === root) return waiting.promise;
  // One dialog at a time: a question that is covered by a newer one is over.
  waiting?.resolve({ kind: "dismissed" });
  let resolve!: (a: MethodologyAnswer) => void;
  const promise = new Promise<MethodologyAnswer>((r) => { resolve = r; });
  waiting = { root, promise, resolve };
  useMethodologyPrompt.setState({ request: { root } });
  return promise;
};

/** Answer the open dialog and close it. */
export function settlePrompt(answer: MethodologyAnswer) {
  const open = waiting;
  waiting = null;
  useMethodologyPrompt.setState({ request: null });
  open?.resolve(answer);
}

/**
 * Projects asked about since launch that weren't given a version. In memory on
 * purpose: the next launch asks again.
 */
const dismissed = new Set<string>();

export function dismissedThisSession(root: string): boolean {
  return dismissed.has(normRoot(root));
}

/**
 * The version to set `root` up on: the one on disk, or the person's answer.
 *
 * `ask` swaps the dialog for another way of asking (the cd hook's toast).
 * `once` asks a project at most once per app session, for the entry points
 * nobody chose to run: New tab and the cd hook.
 */
export async function askMethodology(root: string, opts: { ask?: AskUi; once?: boolean } = {}): Promise<MethodologyAnswer> {
  const at = normRoot(root);
  const detected = await detectOnDisk(at).catch(() => null);
  if (detected) return { kind: "chosen", methodology: detected, asked: false };
  if (opts.once) {
    if (dismissed.has(at)) return { kind: "dismissed" };
    // Marked before the question shows: a toast that times out, or is
    // replaced by another, never answers.
    dismissed.add(at);
  }
  const answer = await (opts.ask ?? askByDialog)(at);
  if (answer.kind === "chosen") dismissed.delete(at);
  return answer;
}

/**
 * Ask, then set up: what the palette's command and both "Set up now" buttons
 * run. Null when no version was chosen.
 */
export async function askAndSetUp(root: string): Promise<SetupResult | null> {
  const answer = await askMethodology(root);
  if (answer.kind !== "chosen") return null;
  const result = await setUpProject(root, answer.methodology);
  window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result }));
  return result;
}

/** "/code/shop" → "shop", on either separator. */
export const projectName = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? root;

/** Test seam: forget this session's dismissals and any open question. */
export function __resetPromptForTests() {
  dismissed.clear();
  waiting = null;
  useMethodologyPrompt.setState({ request: null });
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/lib/__tests__/methodologyPrompt.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 9: Write the failing test for the dialog**

Create `src/components/__tests__/MethodologyPrompt.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "project_setup_status") {
      return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: null };
    }
    throw new Error(`unexpected command: ${command}`);
  }),
}));

import MethodologyPromptHost, { MethodologyPrompt } from "../MethodologyPrompt";
import { __resetPromptForTests, askMethodology, useMethodologyPrompt } from "../../lib/methodologyPrompt";

const dialog = () => screen.getByRole("dialog", { name: "Set up project" });
const question = () => document.querySelector(".new-tab-ask");

beforeEach(() => __resetPromptForTests());

describe("MethodologyPrompt, choose mode", () => {
  it("asks in the spec's words, with the project and both versions in bold", () => {
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} onDismiss={vi.fn()} />);
    expect(question()!.textContent).toBe("Set up shop with BMAD v6 (default) or BMAD v4?");
    expect([...question()!.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["shop", "BMAD v6", "BMAD v4"]);
  });

  it("names a Windows project by its folder", () => {
    render(<MethodologyPrompt root={"C:\\code\\shop"} onAnswer={vi.fn()} onDismiss={vi.fn()} />);
    expect(question()!.textContent).toBe("Set up shop with BMAD v6 (default) or BMAD v4?");
  });

  it("picks v6 on Enter", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(dialog());
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("v6");
  });

  it("picks v4 by click, or by arrow and Enter", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    expect(onAnswer).toHaveBeenLastCalledWith("v4");
    fireEvent.keyDown(dialog(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /BMAD v4/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenLastCalledWith("v4");
  });

  it("is dismissed by Escape, the close button and a click outside, without an answer", () => {
    const onAnswer = vi.fn();
    const onDismiss = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(dialog().parentElement!);
    expect(onDismiss).toHaveBeenCalledTimes(3);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("MethodologyPromptHost", () => {
  it("shows nothing until a project is asked about", () => {
    render(<MethodologyPromptHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the question askMethodology raises and resolves it with the answer", async () => {
    render(<MethodologyPromptHost />);
    const answer = askMethodology("/code/shop");
    expect((await screen.findByRole("dialog", { name: "Set up project" })).textContent).toContain("Set up shop with");
    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    expect(await answer).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves as dismissed on Escape and closes", async () => {
    render(<MethodologyPromptHost />);
    const answer = askMethodology("/code/shop");
    await screen.findByRole("dialog", { name: "Set up project" });
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(await answer).toEqual({ kind: "dismissed" });
    expect(useMethodologyPrompt.getState().request).toBeNull();
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/MethodologyPrompt.test.tsx`
Expected: FAIL, "Failed to resolve import "../MethodologyPrompt"".

- [ ] **Step 11: Create `src/components/MethodologyPrompt.tsx`**

```tsx
import { useCallback, useState } from "react";
import { projectName, settlePrompt, useMethodologyPrompt } from "../lib/methodologyPrompt";
import type { Methodology } from "../lib/projectSetup";
import { useEscapeToClose } from "./useEscapeToClose";

const VERSIONS: { methodology: Methodology; icon: string; title: string; detail: string }[] = [
  { methodology: "v6", icon: "▣", title: "BMAD v6 (default)", detail: "Skills, _bmad/ and the runtime — the current BMAD" },
  { methodology: "v4", icon: "▤", title: "BMAD v4", detail: "Classic .bmad-core/ and the /BMad commands" },
];

interface Props {
  root: string;
  onAnswer(methodology: Methodology): void;
  onDismiss(): void;
}

/** "Which BMAD version?", for a project that has neither. */
export function MethodologyPrompt({ root, onAnswer, onDismiss }: Props) {
  const [cursor, setCursor] = useState(0);
  // A stable ref callback: an inline arrow would run again on every render and
  // pull focus back to the dialog.
  const focusOnMount = useCallback((el: HTMLDivElement | null) => el?.focus(), []);
  useEscapeToClose(onDismiss);

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-label="Set up project"
        tabIndex={-1}
        ref={focusOnMount}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => 1 - c); }
          else if (e.key === "Enter") { e.preventDefault(); onAnswer(VERSIONS[cursor].methodology); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>Set up project</h2>
          <span className="contracts-panel__root" title={root}>{root}</span>
          <button className="contracts-panel__close" onClick={onDismiss} aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <p className="new-tab-ask">Set up <b>{projectName(root)}</b> with <b>BMAD v6</b> (default) or <b>BMAD v4</b>?</p>
        <ul className="new-tab-list" role="listbox" aria-label="BMAD version">
          {VERSIONS.map((v, i) => (
            <li
              key={v.methodology}
              role="option"
              aria-selected={cursor === i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onAnswer(v.methodology)}
            >
              <span className="new-tab-icon" aria-hidden="true">{v.icon}</span>
              <span className="new-tab-main"><b>{v.title}</b><small>{v.detail}</small></span>
              {i === 0 && <kbd>↵</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Renders the dialog for whichever project askMethodology is asking about. */
export default function MethodologyPromptHost() {
  const request = useMethodologyPrompt((s) => s.request);
  if (!request) return null;
  return (
    <MethodologyPrompt
      // A new project is a new question: the highlight starts on v6 again.
      key={request.root}
      root={request.root}
      onAnswer={(methodology) => settlePrompt({ kind: "chosen", methodology, asked: true })}
      onDismiss={() => settlePrompt({ kind: "dismissed" })}
    />
  );
}
```

- [ ] **Step 12: Mount the host in `src/App.tsx`**

Add with the other component imports at the top (after the `Toast` import Task 4 added):

```tsx
import MethodologyPromptHost from "./components/MethodologyPrompt";
```

Insert on the line before `{toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}`:

```tsx
      {/* After the panels in the DOM, so it sits over one that raised it. */}
      <MethodologyPromptHost />
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/MethodologyPrompt.test.tsx src/lib/__tests__/methodologyPrompt.test.ts src/components/__tests__/useEscapeToClose.test.tsx src/components/__tests__/NewTabDialog.test.tsx`
Expected: PASS (8, 17, 3 and 4 tests). `NewTabDialog.test.tsx` is unchanged here and still passes with the new Escape hook.

- [ ] **Step 14: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 15: Commit**

```bash
git add src/lib/methodologyPrompt.ts src/lib/__tests__/methodologyPrompt.test.ts src/components/MethodologyPrompt.tsx src/components/__tests__/MethodologyPrompt.test.tsx src/components/useEscapeToClose.ts src/components/__tests__/useEscapeToClose.test.tsx src/App.tsx
git commit -m "feat(setup): askMethodology and the shared BMAD version dialog"
```

---

### Task 6: New Tab asks through the shared dialog

**Files:**
- Modify: `src/lib/newTab.ts:1-4` (imports), `:41-60` (`openProjectTab`, `newProjectTab`)
- Modify: `src/components/NewTabDialog.tsx` (whole file)
- Test: `src/components/__tests__/NewTabDialog.test.tsx` (whole file)

**Interfaces:**
- Consumes (Task 3): `bmadRootOf(cwd): Promise<{ root: string; methodology: Methodology } | null>`, `normRoot(root): string`, `isSetupCandidate(root): boolean`, `setupDeclined(root): boolean`, `setUpProject(root, methodology?, stacks?): Promise<SetupResult>` from `src/lib/projectSetup.ts`.
- Consumes (Task 5): `askMethodology(root: string, opts?: { ask?: AskUi; once?: boolean }): Promise<MethodologyAnswer>` and `dismissedThisSession(root): boolean` from `src/lib/methodologyPrompt.ts`; `MethodologyPromptHost` (default export of `src/components/MethodologyPrompt.tsx`); `__resetPromptForTests()`.
- Produces (from `src/lib/newTab.ts`):
  - `openProjectTab(path: string): Promise<void>`: remembers the folder, decides the setup (asking where the project has no BMAD), opens the tab, then starts the setup without waiting for it. A setup that fails dispatches `project-setup-failed` with `{ why }`.
  - `initProject(path: string): Promise<void>`: `git init`. Replaces `newProjectTab`, which is removed.
- The root rule: the picked folder, unless `bmadRootOf(path)` finds a folder with BMAD at or above it, in which case that one.

- [ ] **Step 1: Rewrite the test**

Replace the whole of `src/components/__tests__/NewTabDialog.test.tsx` with:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewTabDialog from "../NewTabDialog";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests, dismissedThisSession } from "../../lib/methodologyPrompt";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";

// Setup is IPC only: the status command says what a folder is on, and the
// apply calls record the root and version the dialog's answer led to.
const tauri = vi.hoisted(() => ({
  /** What a folder is on when `byDir` doesn't name it. */
  methodology: null as "v4" | "v6" | null,
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  applies: [] as Record<string, unknown>[],
  applyError: null as string | null,
  gitInit: [] as string[],
  gitInitError: null as string | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
      case "project_setup_status":
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: (args.root as string) in tauri.byDir ? tauri.byDir[args.root as string] : tauri.methodology,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        if (tauri.applyError) throw new Error(tauri.applyError);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0, bmadv6Files: 0 };
      case "project_git_init":
        if (tauri.gitInitError) throw new Error(tauri.gitInitError);
        tauri.gitInit.push(String(args.root));
        return true;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// The folder picker is native: the test answers it with the path under test.
const picker = vi.hoisted(() => ({ picked: null as string | null }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => picker.picked) }));

const NEWAPP = "/Users/testuser/code/newapp";
const ASK_NEWAPP = "Set up newapp with BMAD v6 (default) or BMAD v4?";

const lastApply = () => tauri.applies[tauri.applies.length - 1];
const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
const prompt = () => screen.getByRole("dialog", { name: "Set up project" });
const open = (label: RegExp) => fireEvent.click(screen.getByRole("option", { name: label }));
const tabs = () => useTabStore.getState().tabs.length;
/** The dialog beside the app-level host that shows the question it raises. */
const renderDialog = (onClose = vi.fn()) => {
  render(<><NewTabDialog onClose={onClose} /><MethodologyPromptHost /></>);
  return onClose;
};

beforeEach(() => {
  localStorage.clear();
  tauri.methodology = null;
  tauri.byDir = {};
  tauri.roots = {};
  tauri.applies.length = 0;
  tauri.applyError = null;
  tauri.gitInit.length = 0;
  tauri.gitInitError = null;
  __resetPromptForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("the BMAD version question", () => {
  it("asks for a new project through the shared dialog and sets it up on the answer", async () => {
    picker.picked = NEWAPP;
    const onClose = renderDialog();

    open(/New project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    // git init ran, and the New tab dialog closed, before the question.
    expect(tauri.gitInit).toEqual([NEWAPP]);
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(lastApply().root).toBe(NEWAPP);
    expect(lastApply().full).toBe(true);
  });

  it("picks v6 on Enter", async () => {
    picker.picked = NEWAPP;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(lastApply()?.methodology).toBe("v6"));
    expect(tauri.gitInit).toEqual([]);
  });

  it("does not ask about a project that is already on a version", async () => {
    tauri.methodology = "v4";
    picker.picked = "/Users/testuser/code/oldapp";
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(question()).toBeNull();
    expect(tauri.applies[0].full).toBe(true);
  });

  it("opens the folder without setup on Escape, and does not ask again this session", async () => {
    picker.picked = NEWAPP;
    const onClose = renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    expect(tabs()).toBe(before); // the tab waits for the answer

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
    // Escape went to the question, not to the dialog under it.
    expect(onClose).toHaveBeenCalledOnce();
    expect(dismissedThisSession(NEWAPP)).toBe(true);

    // The same project, spelled with a trailing slash: it opens, with no question.
    picker.picked = `${NEWAPP}/`;
    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 2));
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });

  it("neither sets up nor asks when automatic setup is off", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });

  it("neither sets up nor asks about a project whose setup was undone", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify([NEWAPP]));
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("which folder is the project", () => {
  const MONO = "/Users/testuser/code/mono";

  it("sets up the picked folder when nothing above it has BMAD", async () => {
    tauri.roots = { [`${MONO}/app`]: MONO };
    picker.picked = `${MONO}/app`;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe("Set up app with BMAD v6 (default) or BMAD v4?"));
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(lastApply()?.root).toBe(`${MONO}/app`));
  });

  it("uses the project above the picked folder when that one has BMAD", async () => {
    tauri.roots = { [`${MONO}/app`]: MONO };
    tauri.byDir = { [MONO]: "v4" };
    picker.picked = `${MONO}/app`;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(lastApply()?.root).toBe(MONO));
    expect(lastApply().methodology).toBe("v4");
    expect(question()).toBeNull();
  });
});

describe("when something fails", () => {
  it("shows a git init error in the dialog and keeps it open", async () => {
    tauri.gitInitError = "git is not installed";
    picker.picked = NEWAPP;
    const onClose = renderDialog();
    const before = tabs();

    open(/New project/);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("git is not installed"));
    expect(onClose).not.toHaveBeenCalled();
    expect(question()).toBeNull();
    expect(tabs()).toBe(before);
  });

  it("reports a setup that fails", async () => {
    tauri.applyError = "disk full";
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    picker.picked = NEWAPP;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain("disk full");
    window.removeEventListener("project-setup-failed", failed);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/NewTabDialog.test.tsx`
Expected: FAIL. The first test times out waiting for `question()` to be `"Set up newapp with BMAD v6 (default) or BMAD v4?"` (the dialog still shows "Methodology: BMAD v6 (default) or BMAD v4" in its own list). The Escape, subfolder and failure tests fail the same way.

- [ ] **Step 3: Rewrite `openProjectTab` in `src/lib/newTab.ts`**

Replace lines 1-4 (the imports) with:

```ts
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { askMethodology } from "./methodologyPrompt";
import { bmadRootOf, isSetupCandidate, normRoot, setUpProject, setupDeclined, type Methodology } from "./projectSetup";
import { useTabStore } from "../stores/tabStore";
```

Replace lines 41-60 (`openProjectTab` and `newProjectTab`, with their doc comments) with:

```ts
/**
 * What opening `path` sets up, and on which BMAD version; null for nothing.
 * Asks which version when the project has none.
 */
async function setupFor(path: string): Promise<{ root: string; methodology: Methodology } | null> {
  if (!useSettingsStore.getState().autoProjectSetup) return null;
  // A folder picked to be a project is the project, unless a folder above it
  // already has BMAD: then that one is.
  const root = normRoot((await bmadRootOf(path))?.root ?? path);
  if (!isSetupCandidate(root) || setupDeclined(root)) return null;
  // Once per session: after Escape the folder still opens, and neither this
  // dialog nor the cd hook asks about it again until the next launch.
  const answer = await askMethodology(root, { once: true });
  return answer.kind === "chosen" ? { root, methodology: answer.methodology } : null;
}

/**
 * Open a terminal tab in a project folder, remember it, and set the project up
 * (BMAD, the ADE methodology, the role agents) unless that's turned off.
 *
 * The question comes before the tab: a tab opened first would have the cd hook
 * asking about the same project at the same moment.
 */
export async function openProjectTab(path: string): Promise<void> {
  rememberProject(path);
  const setup = await setupFor(path);
  useTabStore.getState().addTab(undefined, path);
  if (!setup) return;
  setUpProject(setup.root, setup.methodology)
    .then((result) => window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result })))
    .catch((e) => window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why: `Project setup failed: ${e}` } })));
}

/** Start a new project in a folder: git init. openProjectTab then opens it. */
export async function initProject(path: string): Promise<void> {
  await invoke("project_git_init", { root: path });
}
```

- [ ] **Step 4: Rewrite `src/components/NewTabDialog.tsx`**

Replace the whole file with:

```tsx
import { useCallback, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePaneCwd, baseName } from "../stores/paneMetaStore";
import { forgetProject, initProject, openProjectTab, recentProjects } from "../lib/newTab";
import { useEscapeToClose } from "./useEscapeToClose";

const home = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, "~");

/** "Plain terminal or a project?" when opening a new tab. */
export default function NewTabDialog({ onClose }: { onClose: () => void }) {
  const addTab = useTabStore((s) => s.addTab);
  const setAskOnNewTab = useSettingsStore((s) => s.setAskOnNewTab);
  const openProjects = usePaneCwd((s) => s.projects);
  const [recents, setRecents] = useState(recentProjects);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // A folder is being opened. A ref, not state: nothing renders from it, and a
  // second pick must see it at once.
  const opening = useRef(false);

  // A stable ref callback: an inline arrow has a new identity every render, so
  // React would re-run it after each keystroke and state change and pull focus
  // back off whatever is inside — the "ask on new tab" checkbox, for one.
  const focusOnMount = useCallback((el: HTMLDivElement | null) => el?.focus(), []);
  useEscapeToClose(onClose);

  // Remembered projects first, then ones open in other tabs.
  const projects = useMemo(() => {
    const seen = new Set(recents);
    // A folder outside any git repo is its own "project"; the home folder isn't one.
    const others = [...new Set(Object.values(openProjects))].filter((p) => !seen.has(p) && home(p) !== "~" && p !== "/");
    return [...recents, ...others].slice(0, 9);
  }, [recents, openProjects]);

  // Rows: plain terminal, new project, open project, then recent projects.
  const FIXED = 3;
  const rows = FIXED + projects.length;

  const plain = () => { addTab(); onClose(); };

  /**
   * Open a picked folder. A new project is `git init`ed first, while this
   * dialog can still show why that failed. Then the dialog closes: asking
   * which BMAD version, where the project has none, is the shared dialog's job.
   */
  const pick = async (path: string, isNew: boolean) => {
    if (opening.current) return;
    opening.current = true;
    setError(null);
    try {
      if (isNew) await initProject(path);
      onClose();
      await openProjectTab(path);
    } catch (e) {
      setError(String(e));
    } finally {
      opening.current = false;
    }
  };

  const project = (path: string) => { void pick(path, false); };
  const browse = async () => {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false, title: "Open a project folder" });
      if (typeof picked === "string") await pick(picked, false);
    } catch (e) {
      setError(String(e));
    }
  };
  const create = async () => {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false, title: "Choose or create a folder for the new project" });
      if (typeof picked === "string") await pick(picked, true);
    } catch (e) {
      setError(String(e));
    }
  };
  const choose = (i: number) => {
    i === 0 ? plain() : i === 1 ? create() : i === 2 ? browse() : project(projects[i - FIXED]);
  };

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-label="New tab"
        tabIndex={-1}
        ref={focusOnMount}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % rows); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + rows) % rows); }
          else if (e.key === "Enter") { e.preventDefault(); choose(cursor); }
          else if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); plain(); }
          else if (e.key.toLowerCase() === "o" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); browse(); }
          else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); create(); }
          else if (/^[1-9]$/.test(e.key) && projects[+e.key - 1]) { e.preventDefault(); project(projects[+e.key - 1]); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>New tab</h2>
          <span className="contracts-panel__root" />
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <ul className="new-tab-list" role="listbox" aria-label="Start in">
          <li role="option" aria-selected={cursor === 0} onMouseEnter={() => setCursor(0)} onClick={plain}>
            <span className="new-tab-icon" aria-hidden="true">›_</span>
            <span className="new-tab-main"><b>Terminal</b><small>A shell in your home folder</small></span>
            <kbd>T</kbd>
          </li>
          <li role="option" aria-selected={cursor === 1} onMouseEnter={() => setCursor(1)} onClick={create}>
            <span className="new-tab-icon" aria-hidden="true">+</span>
            <span className="new-tab-main"><b>New project…</b><small>Pick or create a folder: git, BMAD, the methodology and all agents</small></span>
            <kbd>N</kbd>
          </li>
          <li role="option" aria-selected={cursor === 2} onMouseEnter={() => setCursor(2)} onClick={browse}>
            <span className="new-tab-icon" aria-hidden="true">⌂</span>
            <span className="new-tab-main"><b>Open project…</b><small>An existing folder; ADE adds what's missing</small></span>
            <kbd>O</kbd>
          </li>
          {projects.length > 0 && <li className="new-tab-heading" aria-hidden="true">Recent projects</li>}
          {projects.map((p, i) => (
            <li
              key={p}
              role="option"
              aria-selected={cursor === i + FIXED}
              onMouseEnter={() => setCursor(i + FIXED)}
              onClick={() => project(p)}
              title={p}
            >
              <span className="new-tab-icon" aria-hidden="true">▣</span>
              <span className="new-tab-main"><b>{baseName(p)}</b><small>{home(p)}</small></span>
              {recents.includes(p) && (
                <button
                  className="new-tab-forget"
                  aria-label={`Forget ${baseName(p)}`}
                  title="Remove from recents"
                  onClick={(e) => { e.stopPropagation(); forgetProject(p); setRecents(recentProjects()); }}
                >
                  ✕
                </button>
              )}
              <kbd>{i + 1}</kbd>
            </li>
          ))}
        </ul>
        {error && <div className="integrations-msg" data-kind="error" role="alert">{error}</div>}
        <label className="new-tab-foot">
          <input type="checkbox" onChange={(e) => setAskOnNewTab(!e.target.checked)} />
          Don't ask again: always open a plain terminal (change it in Settings → Terminal)
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/NewTabDialog.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 6: Type-check and check the command contract**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npx vitest run src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS. `project_git_init` is still invoked with `{ root }`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/newTab.ts src/components/NewTabDialog.tsx src/components/__tests__/NewTabDialog.test.tsx
git commit -m "feat(setup): New tab asks the BMAD version through the shared dialog"
```

---

### Task 7: The `cd` hook asks with a toast

**Files:**
- Modify: `src/hooks/useProjectSetup.ts` (whole file)
- Test: `src/hooks/__tests__/useProjectSetup.test.tsx` (create)

**Interfaces:**
- Consumes (Task 3): `setupRootOf(cwd: string): Promise<string>`, `foldersUpTo(dir: string, stop: string): string[]`, `isSettingUp(root): boolean`, `wasSetUp(root): boolean`, `setupDeclined(root): boolean` from `src/lib/projectSetup.ts`.
- Consumes (Task 4): `GuardToast` with `actions?: ToastAction[]` from `src/hooks/useContextGuard.ts`.
- Consumes (Task 5): `askMethodology(root, opts?: { ask?: AskUi; once?: boolean })`, `dismissedThisSession(root)`, `type AskUi`, `settlePrompt(answer)`, `useMethodologyPrompt`, `__resetPromptForTests()` from `src/lib/methodologyPrompt.ts`.
- Consumes (Task 6, in the test only): `openProjectTab(path: string): Promise<void>` from `src/lib/newTab.ts`.
- Produces: `useProjectSetup(cwd: string | null, show: (t: GuardToast) => void)` and `announceSetup(r, show, stackOnly?)` keep their signatures. For a project with no BMAD the hook calls `show` once per session with `{ title: "Set up <name> with BMAD?", body, actions: [v6, v4, Not now] }` and sets up only when **v6** or **v4** is clicked.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useProjectSetup.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  /** Folders with no `.git`. */
  notGit: new Set<string>(),
  applies: [] as Record<string, unknown>[],
  applyError: null as string | null,
  /** When set, project_setup_apply waits for it: the setup is still running. */
  applyGate: null as Promise<void> | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
      case "project_setup_status":
        return {
          isGit: !tauri.notGit.has(args.root as string), missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        if (tauri.applyGate) await tauri.applyGate;
        if (tauri.applyError) throw new Error(tauri.applyError);
        return { created: [`${args.root}/.ade/rules.md`], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import { useProjectSetup } from "../useProjectSetup";
import type { GuardToast } from "../useContextGuard";
import { __resetPromptForTests, settlePrompt, useMethodologyPrompt } from "../../lib/methodologyPrompt";
import { openProjectTab } from "../../lib/newTab";
import { useSettingsStore } from "../../stores/settingsStore";

const show = vi.fn<(t: GuardToast) => void>();
const mount = (cwd: string | null) =>
  renderHook(({ cwd }: { cwd: string | null }) => useProjectSetup(cwd, show), { initialProps: { cwd } });
const toasts = () => show.mock.calls.map(([t]) => t);
/** The toasts that ask: the ones with v6, v4 and Not now. */
const questions = () => toasts().filter((t) => t.actions?.length === 3);
/** Let the hook's chain of awaits run out, to assert that nothing happened. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.roots = {};
  tauri.notGit = new Set();
  tauri.applies.length = 0;
  tauri.applyError = null;
  tauri.applyGate = null;
  show.mockClear();
  __resetPromptForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("a project with no BMAD", () => {
  it("is asked with a toast and three actions, not the dialog, and nothing is set up", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    const toast = questions()[0];
    expect(toast.title).toBe("Set up shop with BMAD?");
    expect(toast.actions!.map((a) => a.label)).toEqual(["v6", "v4", "Not now"]);
    expect(useMethodologyPrompt.getState().request).toBeNull();
    await settle();
    expect(tauri.applies).toHaveLength(0);
  });

  it("is set up on the version clicked, and the setup is announced", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    act(() => questions()[0].actions![1].run!());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4", full: true });
    await waitFor(() => expect(toasts().some((t) => t.title === "Set up shop")).toBe(true));
  });

  it("is not set up after Not now, and is not asked again this session", async () => {
    const first = mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    act(() => questions()[0].actions![2].run!());
    first.unmount();

    mount("/code/shop");
    await settle();
    expect(questions()).toHaveLength(1);
    expect(tauri.applies).toHaveLength(0);
  });

  it("is not asked again after its toast timed out or was replaced", async () => {
    tauri.roots = { "/code/shop/src": "/code/shop" };
    const hook = mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    // Nothing tells the hook a toast timed out or was replaced by another:
    // showing it is what dismisses the project.
    hook.rerender({ cwd: "/code/other" });
    await waitFor(() => expect(questions()).toHaveLength(2));

    hook.rerender({ cwd: "/code/shop/" });
    await settle();
    hook.rerender({ cwd: "/code/shop/src" });
    await settle();
    expect(questions()).toHaveLength(2);
    expect(tauri.applies).toHaveLength(0);
  });

  it("says so when the setup it was asked for fails", async () => {
    tauri.applyError = "disk full";
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    act(() => questions()[0].actions![0].run!());
    await waitFor(() => expect(toasts().some((t) => t.title === "Project setup" && t.body.includes("disk full"))).toBe(true));
  });

  it("is left alone outside a git repository", async () => {
    tauri.notGit.add("/code/loose");
    mount("/code/loose");
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("a project that has BMAD", () => {
  it("is set up on its own version, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    mount("/code/old");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/old", methodology: "v4" });
    expect(questions()).toHaveLength(0);
    expect(useMethodologyPrompt.getState().request).toBeNull();
  });

  it("is set up where it sits, below the repository root", async () => {
    tauri.roots = { "/code/mono/app/src": "/code/mono", "/code/mono/app": "/code/mono" };
    tauri.byDir = { "/code/mono/app": "v6" };
    tauri.notGit.add("/code/mono/app");
    mount("/code/mono/app/src");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/mono/app", methodology: "v6" });
    expect(questions()).toHaveLength(0);
  });
});

describe("when automatic setup doesn't apply", () => {
  it("does nothing with automatic setup off", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    mount("/code/shop");
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(tauri.applies).toHaveLength(0);
  });

  it("does nothing for a project whose setup was undone", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop/"]));
    mount("/code/shop");
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(tauri.applies).toHaveLength(0);
  });

  it("does not ask about a project already set up", async () => {
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/shop"]));
    mount("/code/shop");
    await settle();
    expect(show).not.toHaveBeenCalled();
  });
});

describe("after the New tab dialog", () => {
  it("does not ask again once its question was dismissed", async () => {
    const opened = openProjectTab("/code/shop");
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop" }));
    act(() => settlePrompt({ kind: "dismissed" }));
    await opened;

    mount("/code/shop");
    await settle();
    expect(questions()).toHaveLength(0);
    expect(tauri.applies).toHaveLength(0);
  });

  it("does not ask about the repository while New tab is setting up a folder inside it", async () => {
    let release!: () => void;
    tauri.applyGate = new Promise<void>((r) => { release = r; });
    tauri.roots = { "/code/mono/app": "/code/mono" };
    const opened = openProjectTab("/code/mono/app");
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/mono/app" }));
    act(() => settlePrompt({ kind: "chosen", methodology: "v6", asked: true }));
    await opened;
    await waitFor(() => expect(tauri.applies).toHaveLength(1));

    // The marker isn't written yet, so the hook resolves the repository above.
    mount("/code/mono/app");
    await settle();
    expect(questions()).toHaveLength(0);
    expect(tauri.applies).toHaveLength(1);
    release();
    await settle();
  });

  it("does not ask about the repository after a folder inside it was dismissed", async () => {
    tauri.roots = { "/code/mono/app": "/code/mono" };
    const opened = openProjectTab("/code/mono/app");
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/mono/app" }));
    act(() => settlePrompt({ kind: "dismissed" }));
    await opened;

    mount("/code/mono/app");
    await settle();
    expect(questions()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: FAIL. "is asked with a toast and three actions" times out with `questions()` empty: the hook still sets up v6 without asking, so `tauri.applies` has one entry instead.

- [ ] **Step 3: Rewrite `src/hooks/useProjectSetup.ts`**

Replace the whole file with:

```ts
import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { GuardToast } from "./useContextGuard";
import { STACK_LABELS } from "../lib/projectMethodology";
import { askMethodology, dismissedThisSession, type AskUi } from "../lib/methodologyPrompt";
import {
  addStackAgents, foldersUpTo, isComplete, isSettingUp, isSetupCandidate, setUpProject, setupDeclined, setupRootOf, setupStatus,
  summarize, undoSetup, wasSetUp,
  type Methodology, type SetupResult,
} from "../lib/projectSetup";

const nameOf = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? root;

/** Show what a setup wrote, with Undo. */
export function announceSetup(r: SetupResult, show: (t: GuardToast) => void, stackOnly = false) {
  const what = summarize(r.report);
  const failed = r.report.settingsError ? `AI attribution is still on: ${r.report.settingsError}.` : "";
  if (!what && !failed) return;
  const stacks = r.stacks.map((s) => STACK_LABELS[s]).join(", ");
  const added = !what ? "" : stackOnly
    ? `Added ${what} for it. Remove any in Integrations > Agents.`
    : `Added ${what}${stacks ? ` (${stacks} project)` : ""}. Existing files were left as they were.`;
  show({
    title: stackOnly ? `${stacks} detected in ${nameOf(r.root)}` : `Set up ${nameOf(r.root)}`,
    body: [added, failed].filter(Boolean).join(" "),
    action: { label: "Undo", run: () => { void undoSetup(r); } },
  });
}

/**
 * The cd hook's way of asking which BMAD version: a toast, never a dialog over
 * the terminal someone is typing in. A toast that times out or is replaced
 * leaves this unanswered, which is why the hook asks `once`: askMethodology
 * marks the project before the toast shows.
 */
const askByToast = (show: (t: GuardToast) => void): AskUi => (root) =>
  new Promise((resolve) => {
    const choose = (methodology: Methodology) => () => resolve({ kind: "chosen", methodology, asked: true });
    show({
      title: `Set up ${nameOf(root)} with BMAD?`,
      body: "ADE adds BMAD, the methodology and the role agents. Existing files are left as they were.",
      actions: [
        { label: "v6", run: choose("v6") },
        { label: "v4", run: choose("v4") },
        { label: "Not now", run: () => resolve({ kind: "dismissed" }) },
      ],
    });
  });

/**
 * Every git project a terminal opens in is set up once: BMAD, the ADE
 * methodology, the core roles and the agents for its stack. A project with no
 * BMAD is asked which version first, in a toast; nothing is set up until one
 * is picked. On later opens, agents for a stack the project has gained since
 * are added.
 */
export function useProjectSetup(cwd: string | null, show: (t: GuardToast) => void) {
  const enabled = useSettingsStore((s) => s.autoProjectSetup);
  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    (async () => {
      const root = await setupRootOf(cwd);
      // Skip projects whose setup the user undid.
      if (cancelled || !isSetupCandidate(root) || setupDeclined(root)) return;
      // And ones the new-tab dialog is setting up right now, or asked about
      // this session. That project can be a folder below `root`: New tab sets
      // up the folder that was picked, and until its marker is written this
      // hook resolves the repository above it.
      if (foldersUpTo(cwd, root).some((dir) => isSettingUp(dir) || dismissedThisSession(dir))) return;
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
      const answer = await askMethodology(root, { once: true, ask: askByToast(show) });
      if (answer.kind !== "chosen") return;
      // An answer someone clicked stands even if the terminal has moved on since.
      if (cancelled && !answer.asked) return;
      const result = await setUpProject(root, answer.methodology, status.stacks).catch((e) => {
        if (answer.asked) show({ title: "Project setup", body: `Project setup failed: ${e}` });
        return null;
      });
      if (result && (answer.asked || !cancelled) && !quiet) announceSetup(result, show);
    })();
    return () => { cancelled = true; };
  }, [cwd, enabled, show]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useProjectSetup.test.tsx src/hooks/__tests__/announceSetup.test.ts`
Expected: PASS (14 tests in `useProjectSetup.test.tsx`, 2 in `announceSetup.test.ts`).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useProjectSetup.ts src/hooks/__tests__/useProjectSetup.test.tsx
git commit -m "feat(setup): the cd hook asks the BMAD version in a toast instead of installing v6"
```

---

### Task 8: The palette and both Set up now buttons ask; "BMAD: Initialize" is removed

**Files:**
- Modify: `src/components/CommandPalette.tsx:91-130` (the `project-setup` and `bmad-init` items)
- Modify: `src/components/board/BoardPanel.tsx:2` (import), `:14` (import), `:45-57` (root effect), `:124-138` (Set up now)
- Modify: `src/components/AgentsTab.tsx:4` (import), `:57-69` (`setUpNow`)
- Modify: `src/components/IntegrationsPanel.tsx:1-6` (imports), `:27-41` (roots), `:142` (header), `:287-288` (`AgentsTab` root)
- Modify: `src-tauri/src/bmad.rs` (remove `scaffold_bmad`), `src-tauri/src/lib.rs:446` (remove its registration)
- Test: `src/components/__tests__/CommandPalette.test.tsx` (create), `src/components/__tests__/AgentsTab.test.tsx` (create), `src/components/__tests__/BoardPanel.test.tsx` (extend)

**Interfaces:**
- Consumes (Task 3): `setupRootOf(cwd: string): Promise<string>`, `isSetupCandidate(root): boolean` from `src/lib/projectSetup.ts`.
- Consumes (Task 5): `askAndSetUp(root: string): Promise<SetupResult | null>` (dispatches `project-setup-done` itself; `null` when the question was dismissed; rejects when setup fails) and `__resetPromptForTests()` from `src/lib/methodologyPrompt.ts`; `MethodologyPromptHost` from `src/components/MethodologyPrompt.tsx`.
- Produces: no new exports. The `scaffold_bmad` Tauri command and the palette item `bmad-init` no longer exist.

- [ ] **Step 1: Write the failing palette test**

Create `src/components/__tests__/CommandPalette.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  applies: [] as Record<string, unknown>[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return String(args.path).replace(/\/src$/, "");
      case "project_setup_status":
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// The palette asks the active pane for its folder; there is no terminal here.
const pane = vi.hoisted(() => ({ cwd: "/code/shop/src" as string | null }));
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => pane.cwd) }));

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
// The palette calls it to keep the selected row visible.
Element.prototype.scrollIntoView = vi.fn();

import CommandPalette from "../CommandPalette";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests } from "../../lib/methodologyPrompt";
import { useSettingsStore } from "../../stores/settingsStore";

const COMMAND = "Project: Set up BMAD, methodology and agents";
const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
const renderPalette = () =>
  render(
    <>
      <CommandPalette onClose={vi.fn()} onToggleScratchpad={vi.fn()} onOpenAgentPicker={vi.fn()} />
      <MethodologyPromptHost />
    </>,
  );

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.applies.length = 0;
  pane.cwd = "/code/shop/src";
  __resetPromptForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("Project: Set up BMAD, methodology and agents", () => {
  it("asks which version for a project with no BMAD, then sets it up", async () => {
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(question()).toBe("Set up shop with BMAD v6 (default) or BMAD v4?"));
    expect(tauri.applies).toHaveLength(0);

    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4", full: true });
  });

  it("still asks with automatic setup off, and for a project whose setup was undone", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop"]));
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(question()).toBe("Set up shop with BMAD v6 (default) or BMAD v4?"));
  });

  it("sets up a project that has BMAD on its own version, with no question", async () => {
    tauri.byDir = { "/code/shop": "v4" };
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4" });
    expect(question()).toBeNull();
  });

  it("cancels on Escape: nothing is set up", async () => {
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(question()).toBeNull());
    expect(tauri.applies).toHaveLength(0);
  });

  it("says why when the active tab has no folder", async () => {
    pane.cwd = null;
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain("no folder");
    window.removeEventListener("project-setup-failed", failed);
  });
});

describe("BMAD: Initialize", () => {
  it("is gone from the palette", () => {
    renderPalette();
    expect(screen.queryByText(/BMAD: Initialize/)).toBeNull();
  });

  it("and so is the command it called, which then had no caller", () => {
    const tauriSrc = resolve(__dirname, "../../../src-tauri/src");
    expect(readFileSync(resolve(tauriSrc, "lib.rs"), "utf8")).not.toContain("scaffold_bmad");
    expect(readFileSync(resolve(tauriSrc, "bmad.rs"), "utf8")).not.toContain("scaffold_bmad");
    expect(readFileSync(resolve(__dirname, "../CommandPalette.tsx"), "utf8")).not.toContain("scaffold_bmad");
  });
});
```

- [ ] **Step 2: Write the failing Agents tab test**

Create `src/components/__tests__/AgentsTab.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  /** `.bmad-core/VERSION` is on disk. */
  bmadInstalled: false,
  applies: [] as Record<string, unknown>[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
      case "project_setup_status":
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: tauri.bmadInstalled, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        // The setup writes the marker: the project is on that version from here on.
        tauri.byDir[args.root as string] = args.methodology as "v4" | "v6";
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      case "mcp_list":
        return {};
      case "vault_list":
        return [];
      case "check_command_exists":
        throw new Error("not installed");
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import AgentsTab from "../AgentsTab";
import IntegrationsPanel from "../IntegrationsPanel";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests } from "../../lib/methodologyPrompt";

const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
const renderTab = (root: string) =>
  render(
    <>
      <AgentsTab root={root} onNotice={vi.fn()} onError={vi.fn()} />
      <MethodologyPromptHost />
    </>,
  );

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.roots = {};
  tauri.bmadInstalled = false;
  tauri.applies.length = 0;
  __resetPromptForTests();
});

describe("Set up now on the Agents tab", () => {
  it("asks which BMAD version before it sets the project up", async () => {
    renderTab("/code/shop");
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).toBe("Set up shop with BMAD v6 (default) or BMAD v4?"));
    expect(tauri.applies).toHaveLength(0);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Set up project" }), { key: "Enter" });
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v6", full: true });
  });

  it("cancels on Escape and can be clicked again", async () => {
    renderTab("/code/shop");
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(question()).toBeNull());
    expect(tauri.applies).toHaveLength(0);
    await waitFor(() => expect((screen.getByRole("button", { name: "Set up now" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("re-checks a v4 project on its own version, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    tauri.bmadInstalled = true;
    renderTab("/code/old");
    fireEvent.click(await screen.findByRole("button", { name: "Re-check" }));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/old", methodology: "v4" });
    expect(question()).toBeNull();
  });
});

describe("the Agents tab's project", () => {
  it("is the BMAD project the pane is in, not the repository above it", async () => {
    tauri.roots = { "/code/mono/app/src": "/code/mono", "/code/mono/app": "/code/mono" };
    tauri.byDir = { "/code/mono/app": "v6" };
    render(<IntegrationsPanel cwd="/code/mono/app/src" initialTab="agents" onClose={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".contracts-panel__root")?.textContent).toBe("/code/mono/app"));
  });
});
```

- [ ] **Step 3: Write the failing board tests**

In `src/components/__tests__/BoardPanel.test.tsx`, add one line to the `invoke` mock, before its final `return null;` (line 25):

```tsx
    if (cmd === "project_setup_apply") return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
```

Add two imports after the `import BoardPanel from "../board/BoardPanel";` line (line 43):

```tsx
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests } from "../../lib/methodologyPrompt";
```

Add `__resetPromptForTests();` and `localStorage.clear();` as the first two lines of the `beforeEach` (line 50).

Append inside `describe("BoardPanel", …)`, after the test "offers setup for a project with no BMAD, naming the folder it would set up" (it ends at line 156):

```tsx
  const applies = () =>
    vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "project_setup_apply").map(([, args]) => args as Record<string, unknown>);
  const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
  const renderWithPrompt = () =>
    render(
      <>
        <BoardPanel cwd="/p/src" onClose={vi.fn()} />
        <MethodologyPromptHost />
      </>,
    );

  it("asks which BMAD version before Set up now sets the project up", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    renderWithPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).toBe("Set up p with BMAD v6 (default) or BMAD v4?"));
    expect(applies()).toHaveLength(0);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Set up project" }), { key: "Enter" });
    await waitFor(() => expect(applies()).toHaveLength(1));
    expect(applies()[0]).toMatchObject({ root: "/p", methodology: "v6", full: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("sets nothing up when the question is dismissed", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    renderWithPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(question()).toBeNull());
    expect(applies()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/AgentsTab.test.tsx src/components/__tests__/BoardPanel.test.tsx`
Expected: FAIL. In all three files the "asks which version" tests time out waiting for the question (each entry point still calls `setUpProject` directly, so an apply happens instead). "is gone from the palette" and "and so is the command it called" fail because both still exist. "is the BMAD project the pane is in" fails with the header reading `/code/mono`.

- [ ] **Step 5: Change the palette**

In `src/components/CommandPalette.tsx`, replace lines 91-130 (the `project-setup` item and the `bmad-init` item) with:

```tsx
      { id: "project-setup", label: "Project: Set up BMAD, methodology and agents", category: "Project", action: () => {
        onClose();
        const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
        // Every failure below used to land in a bare .catch(() => {}): the
        // palette closed and nothing happened at all — no setup, no event, no
        // error. Say what went wrong instead.
        const failed = (why: string) =>
          window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why } }));
        if (!tab) return failed("No active tab to set up.");
        import("../hooks/useTerminal").then(({ getPtyCwd }) =>
          getPtyCwd(tab.activePaneId).then(async (dir) => {
            // getPtyCwd is null for any pane with no live shell — an
            // orchestrator, editor, fleet or browser tab.
            if (!dir) return failed("This tab has no folder. Open a terminal in the project first.");
            const { setupRootOf } = await import("../lib/projectSetup");
            const { askAndSetUp } = await import("../lib/methodologyPrompt");
            // A project with no BMAD is asked which version first; Escape cancels.
            await askAndSetUp(await setupRootOf(dir));
          }),
        ).catch((err) => failed(`Project setup failed: ${err}`));
      } },
```

- [ ] **Step 6: Change the board's Set up now**

In `src/components/board/BoardPanel.tsx`:

Delete line 2 (`import { invoke } from "@tauri-apps/api/core";`): nothing else in the file uses it.

Replace line 14

```tsx
import { setUpProject, isSetupCandidate, bmadRootOf } from "../../lib/projectSetup";
```

with

```tsx
import { isSetupCandidate, setupRootOf } from "../../lib/projectSetup";
import { askAndSetUp } from "../../lib/methodologyPrompt";
```

Replace the root effect (lines 45-57) with:

```tsx
  // The active pane's project, by the same walk-up agent launches use: the
  // nearest BMAD project from cwd up to the project root, else the project
  // root itself (which is what the setup card would set up).
  useEffect(() => {
    let live = true;
    if (!cwd) { setRoot(null); return; }
    setRoot(undefined);
    setupRootOf(cwd).then((r) => { if (live) setRoot(isSetupCandidate(r) ? r : null); });
    return () => { live = false; };
  }, [cwd]);
```

Replace the button's `onClick` (lines 126-135) with:

```tsx
            onClick={async () => {
              setSetupError(null);
              try {
                // Asks which BMAD version first; a dismissed question leaves the project as it is.
                if (await askAndSetUp(root)) await refresh();
              } catch (e) {
                setSetupError(String(e));
              }
            }}
```

- [ ] **Step 7: Change the Agents tab and its root**

In `src/components/AgentsTab.tsx`, replace line 4

```tsx
import { addAgent, isComplete, removeAgent, setUpProject, setupStatus, type SetupStatus } from "../lib/projectSetup";
```

with

```tsx
import { addAgent, isComplete, removeAgent, setupStatus, type SetupStatus } from "../lib/projectSetup";
import { askAndSetUp } from "../lib/methodologyPrompt";
```

and replace `setUpNow` (lines 57-69) with:

```tsx
  const setUpNow = async () => {
    if (!root) return;
    setBusy("setup");
    try {
      // Asks which BMAD version when the project has none; Escape cancels.
      if (await askAndSetUp(root)) await refresh();
    } catch (e) {
      onError(errText(e));
    } finally {
      setBusy(null);
    }
  };
```

In `src/components/IntegrationsPanel.tsx`, add an import after line 6:

```tsx
import { setupRootOf } from "../lib/projectSetup";
```

Add a state after `const [root, setRoot] = useState<string | null>(null);` (line 27):

```tsx
  // The Agents tab works on the BMAD project the pane is in, which can sit
  // below the repository root the other tabs use.
  const [agentsRoot, setAgentsRoot] = useState<string | null>(null);
```

Replace the effect on lines 38-41 with:

```tsx
  useEffect(() => {
    if (!cwd) return;
    invoke<string>("project_root", { path: cwd }).then(setRoot).catch(() => setRoot(cwd));
    setupRootOf(cwd).then(setAgentsRoot);
  }, [cwd]);
```

Replace the header span on line 142 with:

```tsx
          <span className="contracts-panel__root" title={(tab === "agents" ? agentsRoot : root) ?? ""}>{tab === "secrets" ? "System keychain" : tab === "agents" ? (agentsRoot ?? "Open a terminal in a project") : root ? (tab === "mcp" ? `${root}/.mcp.json` : root) : "Open a terminal in a project"}</span>
```

In the `<AgentsTab` element (lines 287-288), replace `root={root}` with `root={agentsRoot}`. Leave `<AntiSlopTab root={root}` as it is.

- [ ] **Step 8: Remove `scaffold_bmad`**

In `src-tauri/src/bmad.rs`, delete the whole command:

```rust
#[tauri::command(async)]
pub fn scaffold_bmad(app: tauri::AppHandle, path: String) -> Result<ScaffoldReport, String> {
    let project = Path::new(&path);
    if !project.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let mut report = ScaffoldReport::default();
    install(&resource_root(&app)?, project, &mut report)?;
    Ok(report)
}
```

In `src-tauri/src/lib.rs`, delete line 446:

```rust
            bmad::scaffold_bmad,
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/AgentsTab.test.tsx src/components/__tests__/BoardPanel.test.tsx src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS (7 tests in `CommandPalette.test.tsx`, 4 in `AgentsTab.test.tsx`, every test in `BoardPanel.test.tsx` including the two new ones, and the contract test: no frontend call names `scaffold_bmad` any more).

Run: `cargo test --manifest-path src-tauri/Cargo.toml bmad`
Expected: PASS. `bmad::install` is still called from `projectsetup::apply`, so nothing in `bmad.rs` is left unused.

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add src/components/CommandPalette.tsx src/components/board/BoardPanel.tsx src/components/AgentsTab.tsx src/components/IntegrationsPanel.tsx src/components/__tests__/CommandPalette.test.tsx src/components/__tests__/AgentsTab.test.tsx src/components/__tests__/BoardPanel.test.tsx src-tauri/src/bmad.rs src-tauri/src/lib.rs
git commit -m "feat(setup): the palette and Set up now ask the BMAD version; remove BMAD: Initialize"
```

---

### Task 9: The Agents tab shows a v6 project as set up

**Files:**
- Modify: `src/lib/projectSetup.ts` (`isComplete`, about line 190 before this plan; add `hasBmad` above it)
- Modify: `src/components/AgentsTab.tsx:4` (import), `:87` (the "BMAD isn't installed." note)
- Test: `src/lib/__tests__/projectSetup.test.ts` (append), `src/components/__tests__/AgentsTab.test.tsx` (append)

**Interfaces:**
- Consumes: `SetupStatus { isGit: boolean; missing: string[]; needsImport: boolean; bmadInstalled: boolean; stacks: Stack[]; methodology: Methodology | null }` from `src/lib/projectSetup.ts`. `bmadInstalled` is "`.bmad-core/VERSION` exists" (v4 only).
- Consumes (Task 8): `src/components/__tests__/AgentsTab.test.tsx` with its `tauri` mock state (`byDir`, `bmadInstalled`) and `renderTab(root)` helper.
- Produces: `hasBmad(s: SetupStatus): boolean` (exported): v4's `.bmad-core/VERSION`, or the v6 marker. `isComplete(s)` keeps its signature and uses it.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/projectSetup.test.ts`, add `hasBmad`, `isComplete` and `type SetupStatus` to the import from `"../projectSetup"`:

```ts
import {
  addAgent, addStackAgents, bmadRootOf, detectOnDisk, foldersUpTo, hasBmad, isComplete, isSettingUp, methodologyOf, normRoot, removeAgent,
  removedAgents, setUpProject, setupDeclined, setupRootOf, undoSetup, wasSetUp,
  type SetupStatus,
} from "../projectSetup";
```

Append to the file:

```ts
describe("isComplete", () => {
  const status = (over: Partial<SetupStatus>): SetupStatus => ({
    isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: null, ...over,
  });

  it("counts a v6 project as having BMAD", () => {
    // bmadInstalled is `.bmad-core/VERSION`, which a v6 project never has.
    expect(hasBmad(status({ methodology: "v6" }))).toBe(true);
    expect(isComplete(status({ methodology: "v6" }))).toBe(true);
  });

  it("still needs the engine on disk for a v4 project", () => {
    expect(isComplete(status({ methodology: "v4" }))).toBe(false);
    expect(isComplete(status({ methodology: "v4", bmadInstalled: true }))).toBe(true);
  });

  it("is incomplete with no BMAD, a missing file, or a CLAUDE.md that doesn't load the rules", () => {
    expect(isComplete(status({}))).toBe(false);
    expect(isComplete(status({ methodology: "v6", missing: [".ade/rules.md"] }))).toBe(false);
    expect(isComplete(status({ methodology: "v6", needsImport: true }))).toBe(false);
  });
});
```

Append to `src/components/__tests__/AgentsTab.test.tsx`:

```tsx
describe("the Project setup card", () => {
  it("shows a v6 project as set up", async () => {
    tauri.byDir = { "/code/shop": "v6" };
    renderTab("/code/shop");
    expect(await screen.findByText("Set up")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Re-check" })).toBeTruthy();
    expect(screen.queryByText("Incomplete")).toBeNull();
    expect(screen.queryByText(/BMAD isn't installed/)).toBeNull();
  });

  it("shows a project with no BMAD as incomplete, and says BMAD isn't installed", async () => {
    renderTab("/code/shop");
    expect(await screen.findByText("Incomplete")).toBeTruthy();
    expect(screen.getByText(/BMAD isn't installed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up now" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts src/components/__tests__/AgentsTab.test.tsx`
Expected: FAIL. `projectSetup.test.ts` fails with "hasBmad is not a function"; "shows a v6 project as set up" fails to find "Set up" (the tag reads "Incomplete").

- [ ] **Step 3: Implement**

In `src/lib/projectSetup.ts`, replace `isComplete` with:

```ts
/**
 * BMAD is in the project: v4's `.bmad-core/VERSION`, or the v6 marker. A v6
 * project has no `.bmad-core/`, so `bmadInstalled` alone called every v6
 * project incomplete.
 */
export function hasBmad(s: SetupStatus): boolean {
  return s.bmadInstalled || s.methodology === "v6";
}

export function isComplete(s: SetupStatus): boolean {
  return s.missing.length === 0 && !s.needsImport && hasBmad(s);
}
```

In `src/components/AgentsTab.tsx`, add `hasBmad` to the import from `"../lib/projectSetup"`:

```tsx
import { addAgent, hasBmad, isComplete, removeAgent, setupStatus, type SetupStatus } from "../lib/projectSetup";
```

and replace line 87

```tsx
            {status && !status.bmadInstalled && " BMAD isn't installed."}
```

with

```tsx
            {status && !hasBmad(status) && " BMAD isn't installed."}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/projectSetup.test.ts src/components/__tests__/AgentsTab.test.tsx src/hooks/__tests__/useProjectSetup.test.tsx`
Expected: PASS. The hook's tests still pass: its `quiet` check reads `isComplete`, and none of them sets up a complete v6 project.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projectSetup.ts src/lib/__tests__/projectSetup.test.ts src/components/AgentsTab.tsx src/components/__tests__/AgentsTab.test.tsx
git commit -m "fix(agents): the Agents tab shows a v6 project as set up"
```

---

### Task 10: `CLAUDE.md` names both BMAD versions

**Files:**
- Modify: `src/lib/projectMethodology.ts:153-154` (the first two lines of `CLAUDE_MD`'s BMAD bullet)
- Test: `src/lib/__tests__/projectMethodology.test.ts` (append one test)

**Interfaces:**
- Consumes: `methodologyFiles(projectName: string, stacks?: Stack[], methodology?: "v4" | "v6"): MethodologyFile[]` from `src/lib/projectMethodology.ts`; the `CLAUDE.md` entry's content is `CLAUDE_MD(projectName)`, the same for both versions.
- Produces: no signature change. New projects get the paragraph; an existing project's `CLAUDE.md` is never rewritten (setup only writes files that are missing).

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/projectMethodology.test.ts`, add inside `describe("ADE methodology", …)`, after the test "makes the ADE rules win over the BMAD slash commands" (it ends at line 107):

```ts
  it("names both BMAD versions in CLAUDE.md and points at the marker", () => {
    for (const methodology of ["v4", "v6"] as const) {
      const claude = methodologyFiles("demo", [], methodology).find((f) => f.path === "CLAUDE.md")!.content;
      const bmad = claude.slice(claude.indexOf("- **BMAD**"), claude.indexOf("- `adversarial-reviewer`"));
      expect(bmad).toContain("`.ade/methodology`");
      expect(bmad).toMatch(/\*\*v4\*\*: the `\/BMad:tasks:` slash commands in `\.bmad-core\/`/);
      expect(bmad).toMatch(/\*\*v6\*\*: the skills\s+in `\.claude\/skills\/`, with work in `_bmad-output\/`/);
      // The rule that mattered before still closes the paragraph.
      expect(bmad).toMatch(/never override/i);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/projectMethodology.test.ts`
Expected: FAIL on ``expect(bmad).toContain("`.ade/methodology`")``: the paragraph names only the `/BMad:tasks:` commands.

- [ ] **Step 3: Implement**

In `src/lib/projectMethodology.ts`, replace lines 153-154

```ts
- **BMAD** tasks, checklists, templates and workflows: the \`/BMad:tasks:\` slash commands
  (\`.bmad-core/\`). These are optional helpers you may run inside the flow. BMAD's own
```

with

```ts
- **BMAD** tasks, checklists, templates and workflows, in the version \`.ade/methodology\`
  names. **v4**: the \`/BMad:tasks:\` slash commands in \`.bmad-core/\`. **v6**: the skills
  in \`.claude/skills/\`, with work in \`_bmad-output/\`. Either way these are optional
  helpers you may run inside the flow. BMAD's own
```

The lines after it ("personas are deliberately not installed — …" through "stop and surface the conflict.") stay as they are.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/projectMethodology.test.ts`
Expected: PASS, including "makes the ADE rules win over the BMAD slash commands" (the paragraph still contains `/BMad:` and "never override").

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/projectMethodology.ts src/lib/__tests__/projectMethodology.test.ts
git commit -m "docs(methodology): CLAUDE.md names both BMAD versions and the marker"
```

---

### Task 11: The guide says when ADE asks

**Files:**
- Modify: `docs/guide/project-setup.md:18-33` (the "v6 or v4" and "When it runs" sections)
- Modify: `docs/guide/settings.md:29`
- Test: `scripts/setupGuide.test.ts` (create)

**Interfaces:**
- Consumes: the palette label `Project: Set up BMAD, methodology and agents` in `src/components/CommandPalette.tsx`; the copy from Tasks 5 and 7.
- Produces: the guide section "Choosing the BMAD version", anchor `#choosing-the-bmad-version`. Plan B renames and extends it.
- Constraint from `scripts/bmadTaskRefs.test.ts`: in the guide, any line that contains `/BMad:tasks:` or `.bmad-core/tasks/` must also contain `v4`.

- [ ] **Step 1: Write the failing test**

Create `scripts/setupGuide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The guide tells people when ADE asks which BMAD version and which commands
 * set a project up. Those are claims about the app, so they are checked
 * against it: a renamed command or a removed one must not outlive itself here.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");
const guide = read("docs/guide/project-setup.md");
const settings = read("docs/guide/settings.md");
const palette = read("src/components/CommandPalette.tsx");

describe("the project setup guide", () => {
  it("names a palette command that exists", () => {
    const label = "Project: Set up BMAD, methodology and agents";
    expect(palette).toContain(`label: "${label}"`);
    expect(guide).toContain(label);
  });

  it("does not send anyone to the removed command", () => {
    for (const page of [guide, settings, read("docs/guide/agents.md")]) {
      expect(page).not.toContain("BMAD: Initialize");
    }
  });

  it("says how each entry point asks", () => {
    expect(guide).toContain("## Choosing the BMAD version");
    const section = guide.slice(guide.indexOf("## Choosing the BMAD version"), guide.indexOf("## When it runs"));
    expect(section).toContain("**BMAD v6 (default)**");
    expect(section).toContain("**BMAD v4**");
    expect(section).toContain("*Set up shop with BMAD?*");
    for (const button of ["**v6**", "**v4**", "**Not now**"]) expect(section).toContain(button);
    expect(section).toContain("**Set up now**");
    expect(section).toMatch(/never asked/);
  });

  it("no longer says a project is set up on v6 without a question", () => {
    expect(guide).not.toMatch(/without a question/);
    expect(guide).not.toMatch(/Only that dialog asks/);
    expect(settings).not.toMatch(/it gets v6/);
  });

  it("links the settings page to the section that exists", () => {
    expect(settings).toContain("#choosing-the-bmad-version");
    expect(settings).not.toContain("#v6-or-v4");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/setupGuide.test.ts`
Expected: FAIL. "says how each entry point asks" fails on `## Choosing the BMAD version`; "no longer says…" and "links the settings page…" fail on the current text. The first two tests pass.

- [ ] **Step 3: Rewrite the two sections of `docs/guide/project-setup.md`**

Replace lines 18-33 (from `## v6 or v4` through the paragraph that ends "…in the command palette.") with:

```markdown
## Choosing the BMAD version

A project with no BMAD is asked which version to use before anything is written: **BMAD v6 (default)** or **BMAD v4**, the classic `.bmad-core/` with the `/BMad:tasks:` slash commands for Claude Code (v4 only). The answer is written to `.ade/methodology`, for v4 as well as v6. How ADE asks depends on how the project was opened:

- **New project** or **Open project** in the New tab dialog: a dialog, *Set up shop with BMAD v6 (default) or BMAD v4?* <kbd>Enter</kbd> picks v6. <kbd>Esc</kbd> opens the folder without setting it up, and ADE doesn't ask about it again until it is restarted. The folder you picked is the project, unless a folder above it already has BMAD: then that project is used and nothing is asked.
- **A terminal `cd`s into a git repository**: a toast, *Set up shop with BMAD?*, with **v6**, **v4** and **Not now**. Nothing is set up unless you click **v6** or **v4**. A toast you dismissed, or that timed out, isn't shown again for that project until ADE is restarted.
- ***Project: Set up BMAD, methodology and agents*** in the command palette, and **Set up now** on the stage board and the Agents tab: the same dialog. <kbd>Esc</kbd> cancels.

With **Set up every project I open** off, or for a project whose setup you undid, the New tab dialog and the terminal neither set up nor ask. The palette command and **Set up now** always work.

A project that already has BMAD is never asked. One with `.ade/methodology` follows it; one with `.bmad-core/` and no marker is treated as v4 and stays that way. A v4 project keeps its QA gates in `docs/qa/gates/`; v6 projects use `.ade/gates/`, same format.

## When it runs

Setup runs once per project, when the project is opened in any of these ways:

- **New project** or **Open project**
- any git repository that a terminal `cd`s into

A project with no BMAD is [asked which version](#choosing-the-bmad-version) first, and nothing is written until you answer.

When setup is done, a toast lists what was added. **Undo** in the toast removes those files again, but keeps any file you've edited since. If setup fails partway, ADE removes what it had written and says why, so a failed setup leaves nothing behind.

To stop automatic setup, turn off **Set up every project I open** in *Settings → Terminal*. It's on by default. You can still set up a project by hand with *Project: Set up BMAD, methodology and agents* in the command palette.
```

- [ ] **Step 4: Update `docs/guide/settings.md`**

Replace line 29 with:

```markdown
**Set up every project I open** (*Settings → Terminal*) is on by default. A project with no BMAD is asked whether to use BMAD v6 or v4 before it is set up; see [Project setup]({{ '/guide/project-setup/' | relative_url }}#choosing-the-bmad-version).
```

- [ ] **Step 5: Run the doc tests to verify they pass**

Run: `npx vitest run scripts/setupGuide.test.ts scripts/bmadTaskRefs.test.ts`
Expected: PASS (5 tests in `setupGuide.test.ts`; `bmadTaskRefs.test.ts` still passes: the one guide line naming `/BMad:tasks:` also says "v4").

- [ ] **Step 6: Run everything**

Run: `npx vitest run`
Expected: PASS, every file.

Run: `npx tsc --noEmit`
Expected: no output.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, every test, including the `bmadv6_e2e` integration tests.

- [ ] **Step 7: Check plan A's boundary**

Run: `git diff origin/main --stat -- src src-tauri docs/guide scripts`
Expected: only the files this plan names.

Run: `git diff origin/main --stat -G"[Aa]rchive|ade-bmad-kept|bmad_switch|keep-or-switch" -- src src-tauri/src docs/guide scripts`
Expected: no output. No line this branch adds or removes in the app, the guide or the scripts mentions plan B's archive, kept list or switch.

- [ ] **Step 8: Commit**

```bash
git add docs/guide/project-setup.md docs/guide/settings.md scripts/setupGuide.test.ts
git commit -m "docs(guide): when ADE asks which BMAD version"
```
