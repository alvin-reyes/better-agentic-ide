//! Project setup: every project ADE opens gets BMAD, the ADE methodology and
//! the role sub-agents. The frontend owns the content (src/lib/projectMethodology.ts);
//! this writes only what's missing, never overwrites, and can undo its own writes.

use crate::bmadv6::Methodology;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Deserialize, Clone, Debug)]
pub struct SetupFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub is_git: bool,
    /** Methodology files the project doesn't have yet. */
    pub missing: Vec<String>,
    /** CLAUDE.md exists but doesn't load the methodology. */
    pub needs_import: bool,
    pub bmad_installed: bool,
    /// Detected stacks: "evm", "solana", "go", "rust".
    pub stacks: Vec<String>,
    /// What the project is on: the marker, else `.bmad-core/` ⇒ "v4". `None`
    /// is a project with neither — the one setup asks about.
    pub methodology: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetupReport {
    /** Absolute paths of every file created, BMAD's included. */
    pub created: Vec<String>,
    /** The import block was appended to an existing CLAUDE.md. */
    pub appended_import: bool,
    pub agents: usize,
    /// BMAD v4 files installed (`.bmad-core/` and the /BMad commands).
    pub bmad_files: usize,
    /// BMAD v6 files scaffolded (skills, `_bmad/`, the methodology marker).
    pub bmadv6_files: usize,
    /// AI attribution was turned off in `.claude/settings.json` by this setup.
    pub attribution_off: bool,
    /// `.claude/settings.json` couldn't be updated; the rest of setup still ran.
    pub settings_error: Option<String>,
    /// Folders this setup created, outermost first. Only Rust reads it: a
    /// failed setup removes the ones still empty.
    #[serde(skip)]
    pub created_dirs: Vec<PathBuf>,
}

/// A relative path that stays inside the project.
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Refusing to write outside the project: {rel}"));
    }
    Ok(root.join(p))
}

pub(crate) fn project(root: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(root);
    if !p.is_dir() {
        return Err(format!("{root} isn't a folder."));
    }
    Ok(p)
}

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

/// Create the file at `dst` and let `write` fill it. The create is the check:
/// `create_new` refuses a destination that exists (a file that appeared since
/// the caller looked, a dangling symlink) without touching it, and that is
/// `Ok(false)`, "kept". `Ok(true)` means written.
///
/// A write that fails partway (a full disk, a lost volume) leaves a file no
/// report names, so nothing would ever take it back: the file this call
/// created is removed here, and only that file. A removal that fails is part
/// of the returned error.
pub(crate) fn write_or_clean(dst: &Path, write: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>) -> std::io::Result<bool> {
    let mut file = match std::fs::OpenOptions::new().write(true).create_new(true).open(dst) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
        Err(e) => return Err(e),
    };
    match write(&mut file) {
        Ok(()) => Ok(true),
        Err(e) => {
            drop(file);
            Err(match std::fs::remove_file(dst) {
                Ok(()) => e,
                Err(r) => std::io::Error::new(e.kind(), format!("{e} (and {} could not be removed: {r})", dst.display())),
            })
        }
    }
}

/// Fill a file `write_or_clean` created with a copy of `src`, mode included
/// (as `fs::copy` did: the bundled runtime keeps an executable bit).
pub(crate) fn copy_into(src: &Path, to: &mut std::fs::File) -> std::io::Result<()> {
    let mut from = std::fs::File::open(src)?;
    std::io::copy(&mut from, to)?;
    to.set_permissions(from.metadata()?.permissions())
}

fn has_import(root: &Path, marker: &str) -> bool {
    std::fs::read_to_string(root.join("CLAUDE.md")).map(|s| s.contains(marker) || s.contains("@.ade/rules.md")).unwrap_or(false)
}

fn mentions(path: &Path, needles: &[&str]) -> bool {
    std::fs::read_to_string(path).map(|s| needles.iter().any(|n| s.contains(n))).unwrap_or(false)
}

/// What the project is built with, from its manifest files.
pub fn detect_stacks(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let hardhat = ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs"];
    if dir.join("foundry.toml").is_file() || hardhat.iter().any(|f| dir.join(f).is_file()) {
        out.push("evm".to_string());
    }
    let solana_crates = ["anchor-lang", "solana-program", "solana-sdk", "pinocchio"];
    let solana_program = std::fs::read_dir(dir.join("programs"))
        .map(|rd| rd.flatten().any(|e| mentions(&e.path().join("Cargo.toml"), &solana_crates)))
        .unwrap_or(false);
    if dir.join("Anchor.toml").is_file() || mentions(&dir.join("Cargo.toml"), &solana_crates) || solana_program {
        out.push("solana".to_string());
    }
    if dir.join("go.mod").is_file() {
        out.push("go".to_string());
    }
    if dir.join("Cargo.toml").is_file() || out.iter().any(|s| s == "solana") {
        out.push("rust".to_string());
    }
    out
}

/// Remove one agent from a project's .claude/agents/.
#[tauri::command]
pub fn project_agent_remove(root: String, name: String) -> Result<bool, String> {
    let dir = project(&root)?;
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Not an agent name: {name}"));
    }
    let path = dir.join(".claude").join("agents").join(format!("{name}.md"));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn project_setup_status(root: String, paths: Vec<String>, marker: String) -> Result<SetupStatus, String> {
    let dir = project(&root)?;
    let missing = paths
        .into_iter()
        .filter(|rel| inside(&dir, rel).map(|p| !p.exists()).unwrap_or(false))
        .collect();
    Ok(SetupStatus {
        is_git: dir.join(".git").exists(),
        missing,
        needs_import: dir.join("CLAUDE.md").is_file() && !has_import(&dir, &marker),
        bmad_installed: dir.join(".bmad-core").join("VERSION").is_file(),
        stacks: detect_stacks(&dir),
        methodology: crate::bmadv6::detect_on_disk(&dir).map(|m| m.as_str().to_string()),
    })
}

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
        let wrote = write_or_clean(&dst, |to| std::io::Write::write_all(to, f.content.as_bytes()))
            .map_err(|e| format!("{}: {e}", f.path))?;
        if !wrote {
            // Appeared since the check above: the person's, left as it is.
            continue;
        }
        if f.path.starts_with(".claude/agents/") {
            report.agents += 1;
        }
        report.created.push(dst.to_string_lossy().into_owned());
    }
    if append {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().append(true).open(dir.join("CLAUDE.md")).map_err(|e| format!("CLAUDE.md: {e}"))?;
        file.write_all(import.unwrap_or_default().as_bytes()).map_err(|e| format!("CLAUDE.md: {e}"))?;
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
            let failed = take_back(dir, &report, files, import);
            Err(if failed.is_empty() { e } else { format!("{e} (not taken back: {})", failed.join("; ")) })
        }
    }
}

/// Take back what a setup wrote, as its report records it: the files still as
/// setup wrote them, the import it appended, then the folders it created that
/// are empty. Shared by a failed setup and a failed switch's rollback.
///
/// "Still as setup wrote them" is by content only for the files in `files`;
/// for the rest (the BMAD engine's) it is only "still a file". Returns what
/// it could not undo, each naming its path; a folder that is not empty, or is
/// already gone, is not a failure.
pub(crate) fn take_back(dir: &Path, report: &SetupReport, files: &[SetupFile], import: Option<&str>) -> Vec<String> {
    let mut failed = Vec::new();
    remove_unchanged_noting(dir, &report.created, files, &mut failed);
    if let (true, Some(import)) = (report.appended_import, import) {
        if let Err(e) = strip_import(dir, import) {
            failed.push(format!("CLAUDE.md: {e}"));
        }
    }
    // Innermost first. A folder something else has written into since stays.
    for d in report.created_dirs.iter().rev() {
        if let Err(e) = std::fs::remove_dir(d) {
            if !matches!(e.kind(), std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty) {
                failed.push(format!("{}: {e}", d.display()));
            }
        }
    }
    failed
}

/// Remove the files in `created` that are still as setup wrote them (by
/// content for `files`; BMAD's own, if still a file). Returns the ones removed;
/// anything edited since is left.
fn remove_unchanged(dir: &Path, created: &[String], files: &[SetupFile]) -> Vec<PathBuf> {
    remove_unchanged_noting(dir, created, files, &mut Vec::new())
}

/// remove_unchanged(), noting each removal that failed in `failed`.
fn remove_unchanged_noting(dir: &Path, created: &[String], files: &[SetupFile], failed: &mut Vec<String>) -> Vec<PathBuf> {
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
        if unchanged {
            match std::fs::remove_file(&path) {
                Ok(()) => removed.push(path),
                Err(e) => failed.push(format!("{}: {e}", path.display())),
            }
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

/// Whether setup installs this methodology's resources: a full setup of a
/// project that isn't on it yet, or one whose key files are missing — the
/// spec's "a missing ade-runtime.mjs or skills folder in an older v6 project
/// is fixed by setup's existing re-apply-missing-files pass".
///
/// A full v4 setup always re-applies v4's install, the way it did before the
/// methodology choice landed: that install never overwrites and is idempotent,
/// so re-running it is exactly what tops `.bmad-core/` (and the
/// `.bmad-core/VERSION` marker bmad.rs writes) back up after files were lost.
fn needs_install(methodology: Methodology, on_disk: Option<Methodology>, full: bool, dir: &Path) -> bool {
    if !full {
        return false;
    }
    match methodology {
        Methodology::V4 => true,
        Methodology::V6 => {
            on_disk != Some(Methodology::V6)
                || !dir.join("_bmad/ade-runtime.mjs").is_file()
                || !dir.join(".claude/skills/bmad/SKILL.md").is_file()
        }
    }
}

/// The resources a full setup installs from, or `None` when there is nothing to
/// install. A v6 setup whose resources did not resolve is an error: reporting
/// success while writing nothing would leave the project without skills, without
/// `_bmad/` and without a marker — what install() itself refuses to do.
fn install_source(
    methodology: Methodology,
    on_disk: Option<Methodology>,
    full: bool,
    dir: &Path,
    resolve: impl FnOnce(Methodology) -> Option<PathBuf>,
) -> Result<Option<PathBuf>, String> {
    if !needs_install(methodology, on_disk, full, dir) {
        return Ok(None);
    }
    match resolve(methodology) {
        Some(root) => Ok(Some(root)),
        None if methodology == Methodology::V6 => {
            Err("bmad v6 resources not found: cannot scaffold a v6 project without them".to_string())
        }
        // The v4 path predates this and leaves an unresolved root alone.
        None => Ok(None),
    }
}

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
    // The owner's answer from the setup prompt; anything else is the v6 default.
    let methodology = if methodology.trim().eq_ignore_ascii_case("v4") { Methodology::V4 } else { Methodology::V6 };
    set_up(&dir, &files, &import, &marker, methodology, full, |wanted| match wanted {
        Methodology::V4 => crate::bmad::resource_root(&app).ok(),
        Methodology::V6 => crate::bmadv6::resource_root(&app).ok(),
    })
}

/// What `project_setup_apply` runs once it has the project's folder.
/// `resolve` finds a version's bundled resources, which the command asks the
/// app for. Every setup comes through here: a full one, and an agent or a
/// stack's agents added on their own.
///
/// None of them writes into a project a switch left unfinished: its tree may
/// be half moved, and the journal may tell the person to move back the very
/// folders this would write into. The switch's own setup calls apply() and
/// is not held to this.
pub fn set_up(
    dir: &Path,
    files: &[SetupFile],
    import: &str,
    marker: &str,
    methodology: Methodology,
    full: bool,
    resolve: impl FnOnce(Methodology) -> Option<PathBuf>,
) -> Result<SetupReport, String> {
    let _one = APPLY.lock().unwrap_or_else(|e| e.into_inner());
    // Under the lock: a switch holds it for its whole run.
    refuse_unfinished(dir)?;
    // A full setup also loads the methodology from CLAUDE.md and installs the
    // project's methodology; adding agents on their own touches nothing else.
    let src = install_source(methodology, crate::bmadv6::detect_on_disk(dir), full, dir, resolve)?;
    apply_or_clean(dir, files, full.then_some(import), marker, methodology, src.as_deref())
}

/// Setup and Undo are refused in a project a switch left unfinished, with
/// the reason the switch itself gives.
fn refuse_unfinished(dir: &Path) -> Result<(), String> {
    crate::bmadswitch::unfinished(dir).map_or(Ok(()), Err)
}

/// The version whose engine a setup installed, read from the list of what it
/// created: only the v4 install writes under `.bmad-core/`, only the v6 one
/// under `_bmad/`. `None` when the list names neither, as after a setup that
/// found the engine already there.
fn installed(dir: &Path, created: &[String]) -> Option<Methodology> {
    let under = |folder: &str| created.iter().any(|path| Path::new(path).starts_with(dir.join(folder)));
    match (under(".bmad-core"), under("_bmad")) {
        (true, false) => Some(Methodology::V4),
        (false, true) => Some(Methodology::V6),
        _ => None,
    }
}

/// Remove what a setup created (files still unchanged since, by content) and
/// the import block it appended. Leaves anything the user has edited.
///
/// The marker is among what a setup creates, and it is ADE's, so "still a
/// file" would remove it whatever it says. It goes only while it names the
/// version the undone setup installed: after a switch it is the other
/// version's. When the list doesn't say which version that was, the marker
/// stays; the count returned has no place to say so.
#[tauri::command(async)]
pub fn project_setup_undo(root: String, created: Vec<String>, files: Vec<SetupFile>, import: Option<String>) -> Result<usize, String> {
    let dir = project(&root)?;
    // As a setup: one at a time, and not under a switch that is moving the tree.
    let _one = APPLY.lock().unwrap_or_else(|e| e.into_inner());
    refuse_unfinished(&dir)?;
    let marker = dir.join(".ade").join("methodology");
    let wrote = installed(&dir, &created);
    let still_names_it = wrote.is_some() && std::fs::read_to_string(&marker).is_ok_and(|text| text.trim() == wrote.map_or("", Methodology::as_str));
    let created: Vec<String> = created.into_iter().filter(|path| still_names_it || Path::new(path) != marker).collect();
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

/// `git init` a new project folder (no commit: the first commit is the owner's).
#[tauri::command(async)]
pub fn project_git_init(root: String) -> Result<bool, String> {
    let dir = project(&root)?;
    if dir.join(".git").exists() {
        return Ok(false);
    }
    let out = std::process::Command::new("git").arg("init").arg("-q").current_dir(&dir).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        // A counter, not the clock: the clock's resolution is coarse enough that
        // parallel tests drew the same folder and deleted each other's tree.
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!(
            "ade-setup-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn files() -> Vec<SetupFile> {
        vec![
            SetupFile { path: "CLAUDE.md".into(), content: "# new\n@.ade/rules.md\n".into() },
            SetupFile { path: ".ade/rules.md".into(), content: "rules".into() },
            SetupFile { path: ".claude/agents/qa.md".into(), content: "qa".into() },
        ]
    }

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
        use std::io::Write;
        let dir = temp();
        let dst = dir.join("half.md");
        let err = write_or_clean(&dst, |f| {
            f.write_all(b"half")?;
            Err(std::io::Error::other("disk full"))
        })
        .unwrap_err();
        assert_eq!(err.to_string(), "disk full");
        assert!(!dst.exists(), "the half-written file is gone");

        // A write that succeeds keeps its file.
        assert!(write_or_clean(&dst, |f| f.write_all(b"whole")).unwrap());
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "whole");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_destination_that_exists_is_kept_and_not_truncated() {
        use std::io::Write;
        let dir = temp();
        let dst = dir.join("mine.md");
        std::fs::write(&dst, "mine").unwrap();
        // The caller never checked: the create itself refuses.
        let wrote = write_or_clean(&dst, |f| {
            f.write_all(b"theirs")?;
            Err(std::io::Error::other("never reached"))
        })
        .unwrap();
        assert!(!wrote);
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "mine");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_dangling_symlink_at_the_destination_is_left_alone() {
        let dir = temp();
        let dst = dir.join("link.md");
        std::os::unix::fs::symlink(dir.join("missing.md"), &dst).unwrap();
        assert!(!write_or_clean(&dst, |_| Ok(())).unwrap());
        assert!(std::fs::symlink_metadata(&dst).unwrap().file_type().is_symlink());
        assert!(!dir.join("missing.md").exists(), "nothing was written through the link");
        std::fs::remove_dir_all(dir).ok();
    }

    // Unix only: the closure deletes the file while its handle is open, which Windows refuses.
    #[cfg(unix)]
    #[test]
    fn a_failed_removal_is_part_of_the_error() {
        let dir = temp();
        let dst = dir.join("stuck.md");
        // The write fails and leaves a folder where the file was: it can't be removed as a file.
        let err = write_or_clean(&dst, |_| {
            std::fs::remove_file(&dst)?;
            std::fs::create_dir(&dst)?;
            Err(std::io::Error::other("disk full"))
        })
        .unwrap_err();
        assert!(err.to_string().starts_with("disk full"), "{err}");
        assert!(err.to_string().contains("stuck.md"), "{err}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_copy_that_fails_after_the_destination_exists_leaves_nothing() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let src = v4_source();
        // A bundled file that can't be read: the copy fails once its destination was created.
        std::fs::set_permissions(src.join("bmad-core/tasks/a.md"), std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::File::open(src.join("bmad-core/tasks/a.md")).is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let r = apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src));
        std::fs::set_permissions(src.join("bmad-core/tasks/a.md"), std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(r.is_err());
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_copy_keeps_the_executable_bit() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let src = temp().join("run.mjs");
        std::fs::write(&src, "x").unwrap();
        std::fs::set_permissions(&src, std::fs::Permissions::from_mode(0o755)).unwrap();
        let dst = dir.join("run.mjs");
        assert!(write_or_clean(&dst, |f| copy_into(&src, f)).unwrap());
        assert_eq!(std::fs::metadata(&dst).unwrap().permissions().mode() & 0o777, 0o755);
        std::fs::remove_dir_all(dir).ok();
    }

    /// Source text as the tests below match it. A Windows checkout has `\r\n`
    /// line ends, which a `\n}\n` would never find.
    fn lf(text: &str) -> String {
        text.replace("\r\n", "\n")
    }

    /// Slice a function's source out of a file: from its `fn` line to the next top-level item.
    fn body<'a>(src: &'a str, sig: &str) -> &'a str {
        let at = src.find(sig).unwrap_or_else(|| panic!("{sig} not found"));
        let rest = &src[at..];
        let end = rest.find("\n}\n").unwrap_or(rest.len());
        &rest[..end]
    }

    #[test]
    fn a_function_is_sliced_the_same_from_a_windows_checkout() {
        let unix = include_str!("projectsetup.rs").replace("\r\n", "\n");
        let windows = lf(&unix.replace('\n', "\r\n"));
        let sliced = body(&windows, "fn apply(");
        // Not assert_eq: a failure would print the whole function twice.
        assert!(sliced == body(&unix, "fn apply("), "the slice of a \\r\\n checkout is not the function's own lines");
        assert!(!sliced.contains("fn apply_or_clean("), "the slice ends where the function does");
    }

    #[test]
    fn files_are_only_written_through_write_or_clean() {
        let setup = lf(include_str!("projectsetup.rs"));
        let v4 = lf(include_str!("bmad.rs"));
        let v6 = lf(include_str!("bmadv6.rs"));
        let sites = [
            ("projectsetup apply", body(&setup, "fn apply(")),
            ("bmad copy_tree", body(&v4, "pub fn copy_tree(")),
            ("bmadv6 copy_tree", body(&v6, "fn copy_tree(")),
            ("bmadv6 copy_file", body(&v6, "fn copy_file(")),
        ];
        for (name, text) in sites {
            assert!(text.contains("write_or_clean("), "{name} must create files through write_or_clean");
            for bare in ["fs::copy(", "fs::write("] {
                assert!(!text.contains(bare), "{name} writes with a bare {bare}");
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn take_back_reports_what_it_could_not_undo() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let sub = dir.join("sub");
        std::fs::create_dir(&sub).unwrap();
        let stuck = sub.join("a.md");
        std::fs::write(&stuck, "x").unwrap();
        // A folder that can't be written to: its file can't be unlinked.
        std::fs::set_permissions(&sub, std::fs::Permissions::from_mode(0o500)).unwrap();
        if std::fs::write(sub.join("probe"), "x").is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let report = SetupReport { created: vec![stuck.to_string_lossy().into_owned()], ..Default::default() };
        let failed = take_back(&dir, &report, &[], None);
        std::fs::set_permissions(&sub, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(failed.len(), 1, "{failed:?}");
        assert!(failed[0].contains("a.md"), "{failed:?}");
        assert!(stuck.exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_clean_take_back_reports_nothing() {
        let dir = temp();
        let mut report = SetupReport::default();
        apply(&dir, &files(), None, "<!-- m -->", Methodology::V4, None, &mut report).unwrap();
        assert!(take_back(&dir, &report, &files(), None).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn take_back_removes_what_a_setup_made_and_keeps_what_changed() {
        let dir = temp();
        std::fs::write(dir.join("CLAUDE.md"), "# mine\n").unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None, &mut report).unwrap();
        assert!(report.appended_import);
        // The person edits one of the files setup wrote: it stays.
        std::fs::write(dir.join(".claude/agents/qa.md"), "edited").unwrap();

        assert!(take_back(&dir, &report, &files(), Some("\nIMPORT\n")).is_empty());

        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# mine\n", "the import is stripped");
        assert!(!dir.join(".ade").exists(), "an unchanged file and the folder setup made are gone");
        assert_eq!(std::fs::read_to_string(dir.join(".claude/agents/qa.md")).unwrap(), "edited");
        std::fs::remove_dir_all(dir).ok();
    }

    /// A switch that was cut short, as its journal's front matter says it.
    fn a_journal(dir: &Path, status: &str) {
        let archive = dir.join(".ade").join("archive").join("bmad-v4-2026-01-02");
        std::fs::create_dir_all(&archive).unwrap();
        std::fs::write(archive.join("ARCHIVE.md"), format!("---\nstatus: {status}\nphase: moving\nfrom: v4\nto: v6\ndate: 2026-01-02\n---\n")).unwrap();
    }

    const UNFINISHED: &str = "An earlier switch here didn't finish. See .ade/archive/bmad-v4-2026-01-02/ARCHIVE.md.";

    #[test]
    fn setup_refuses_a_project_with_an_unfinished_switch() {
        let dir = temp();
        let src = v4_source();
        let set_up = |full: bool| set_up(&dir, &files(), "\nIMPORT\n", "<!-- m -->", Methodology::V4, full, |_| Some(src.clone()));
        for status in ["in-progress", "incomplete"] {
            a_journal(&dir, status);
            assert_eq!(set_up(true).unwrap_err(), UNFINISHED, "{status}");
            // Adding an agent, or a stack's agents, is a setup too.
            assert_eq!(set_up(false).unwrap_err(), UNFINISHED, "{status}");
        }
        assert_eq!(names(&dir), [".ade"], "nothing was written");
        assert_eq!(names(&dir.join(".ade")), ["archive"]);

        // Resolved by hand: setup runs again.
        a_journal(&dir, "abandoned");
        let report = set_up(true).unwrap();
        assert!(report.created.contains(&dir.join(".ade/rules.md").to_string_lossy().into_owned()), "{:?}", report.created);
        assert!(dir.join(".bmad-core/tasks/a.md").is_file());
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    // R7: what can't be read may be a switch that didn't finish.
    #[test]
    fn setup_refuses_when_the_archive_cannot_be_understood() {
        let dir = temp();
        let notes = dir.join(".ade").join("archive").join("notes");
        std::fs::create_dir_all(&notes).unwrap();
        std::fs::write(notes.join("ARCHIVE.md"), "my own notes, no front matter\n").unwrap();
        let err = set_up(&dir, &files(), "\nIMPORT\n", "<!-- m -->", Methodology::V4, false, |_| None).unwrap_err();
        assert_eq!(err, "ADE can't read .ade/archive/notes, so it can't tell whether an earlier switch here finished.");
        assert_eq!(names(&dir), [".ade"], "nothing was written");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn undo_refuses_a_project_with_an_unfinished_switch() {
        let dir = temp();
        let root: String = dir.to_string_lossy().into();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, None).unwrap();
        a_journal(&dir, "in-progress");
        assert_eq!(project_setup_undo(root.clone(), r.created.clone(), files(), None).unwrap_err(), UNFINISHED);
        assert!(dir.join(".ade/rules.md").is_file() && dir.join(".claude/agents/qa.md").is_file(), "nothing was removed");

        a_journal(&dir, "abandoned");
        assert_eq!(project_setup_undo(root, r.created, files(), None).unwrap(), 3);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn undo_removes_the_marker_only_while_it_names_the_version_that_setup_wrote() {
        let marker = |dir: &Path| dir.join(".ade").join("methodology");
        let undo = |dir: &Path, created: Vec<String>| project_setup_undo(dir.to_string_lossy().into(), created, files(), None).unwrap();
        let v4 = v4_source();
        let v6 = v6_source(true);

        // Still the marker this setup wrote: it goes with the rest.
        let dir = temp();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, Some(&v4)).unwrap();
        undo(&dir, r.created);
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));

        // The project was switched since: the marker is the other version's.
        for (wrote, src, now) in [(Methodology::V4, &v4, "v6\n"), (Methodology::V6, &v6, "v4\n")] {
            let dir = temp();
            let r = run(&dir, &files(), None, "<!-- m -->", wrote, Some(src)).unwrap();
            std::fs::write(marker(&dir), now).unwrap();
            undo(&dir, r.created);
            assert_eq!(std::fs::read_to_string(marker(&dir)).unwrap(), now, "an undo of a {} setup", wrote.as_str());
            std::fs::remove_dir_all(dir).ok();
        }

        // A list that doesn't say which version its setup installed: the
        // marker is left rather than guessed at.
        let dir = temp();
        std::fs::create_dir_all(dir.join(".ade")).unwrap();
        std::fs::write(marker(&dir), "v4\n").unwrap();
        assert_eq!(undo(&dir, vec![marker(&dir).to_string_lossy().into_owned()]), 0);
        assert_eq!(std::fs::read_to_string(marker(&dir)).unwrap(), "v4\n");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(v4).ok();
        std::fs::remove_dir_all(v6).ok();
    }

    #[test]
    fn writes_missing_files_and_never_overwrites() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/qa.md"), "mine").unwrap();
        let r = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join(".claude/agents/qa.md")).unwrap(), "mine");
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "rules");
        // CLAUDE.md, .ade/rules.md and .claude/settings.json.
        assert_eq!(r.created.len(), 3);
        assert!(!r.appended_import, "a CLAUDE.md we created already imports the rules");
        // Running again changes nothing.
        let again = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(again.created.is_empty() && !again.appended_import);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn existing_claude_md_gets_the_import_once_and_undo_restores_it() {
        let dir = temp();
        std::fs::write(dir.join("CLAUDE.md"), "# Mine\n").unwrap();
        let import = "\n<!-- m -->\n@.ade/rules.md\n";
        let r = run(&dir, &files(), Some(import), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(r.appended_import);
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), format!("# Mine\n{import}"));
        let status = project_setup_status(dir.to_string_lossy().into(), vec!["CLAUDE.md".into()], "<!-- m -->".into()).unwrap();
        assert!(!status.needs_import);

        // Edit one created file: undo keeps it.
        std::fs::write(dir.join(".ade/rules.md"), "edited").unwrap();
        let removed = project_setup_undo(dir.to_string_lossy().into(), r.created.clone(), files(), Some(import.into())).unwrap();
        // The agent file and the settings file setup created.
        assert_eq!(removed, 2);
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# Mine\n");
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "edited");
        assert!(!dir.join(".claude").exists(), "empty folders setup created are removed");
        std::fs::remove_dir_all(dir).ok();
    }

    // This text becomes a failed switch's error, where "Permission denied" alone says nothing.
    #[cfg(unix)]
    #[test]
    fn a_claude_md_that_cannot_be_appended_to_is_named_in_the_error() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let claude = dir.join("CLAUDE.md");
        std::fs::write(&claude, "# Mine\n").unwrap();
        std::fs::set_permissions(&claude, std::fs::Permissions::from_mode(0o444)).unwrap();
        if std::fs::OpenOptions::new().append(true).open(&claude).is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let err = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap_err();
        std::fs::set_permissions(&claude, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(err.starts_with("CLAUDE.md: "), "{err}");
        assert_eq!(std::fs::read_to_string(&claude).unwrap(), "# Mine\n");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_full_setup_turns_ai_attribution_off_and_agents_alone_do_not() {
        let dir = temp();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(!r.attribution_off && !dir.join(".claude/settings.json").exists());
        let r = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(r.attribution_off && r.settings_error.is_none());
        let settings = dir.join(".claude").join("settings.json");
        let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&settings).unwrap()).unwrap();
        assert_eq!(v["attribution"]["commit"], "");
        assert_eq!(v["attribution"]["pr"], "");
        assert_eq!(v["includeCoAuthoredBy"], false);
        // Setup created the file, so Undo removes it with the rest.
        assert!(r.created.contains(&settings.to_string_lossy().into_owned()));
        // A later setup is safe: nothing new to write.
        let again = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(!again.attribution_off && again.created.is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_malformed_settings_file_is_reported_and_setup_carries_on() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude")).unwrap();
        std::fs::write(dir.join(".claude/settings.json"), "{ not json").unwrap();
        let r = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(!r.attribution_off);
        assert!(r.settings_error.as_deref().unwrap_or_default().contains("not valid JSON"));
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "rules");
        assert_eq!(std::fs::read_to_string(dir.join(".claude/settings.json")).unwrap(), "{ not json");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn status_reports_the_methodology_on_disk_marker_first() {
        let dir = temp();
        let root: String = dir.to_string_lossy().into();
        let status = || project_setup_status(root.clone(), vec![], "<!-- m -->".into()).unwrap();
        assert_eq!(status().methodology, None, "a brand-new project has neither");

        // `.bmad-core/` without a marker: a v4 project from before the marker.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        assert_eq!(status().methodology.as_deref(), Some("v4"));

        // The marker wins over `.bmad-core/`, as detect_on_disk (and so setup) does.
        std::fs::create_dir_all(dir.join(".ade")).unwrap();
        std::fs::write(dir.join(".ade/methodology"), "v6\n").unwrap();
        assert_eq!(status().methodology.as_deref(), Some("v6"));
        std::fs::write(dir.join(".ade/methodology"), "v4\n").unwrap();
        assert_eq!(status().methodology.as_deref(), Some("v4"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn detects_stacks_from_manifests() {
        let dir = temp();
        assert!(detect_stacks(&dir).is_empty());
        std::fs::write(dir.join("foundry.toml"), "").unwrap();
        std::fs::write(dir.join("go.mod"), "module x").unwrap();
        std::fs::create_dir_all(dir.join("programs/vault")).unwrap();
        std::fs::write(dir.join("programs/vault/Cargo.toml"), "[dependencies]\nanchor-lang = \"0.30\"").unwrap();
        assert_eq!(detect_stacks(&dir), ["evm", "solana", "go", "rust"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn removes_only_agent_files() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/qa.md"), "x").unwrap();
        let root: String = dir.to_string_lossy().into();
        assert!(project_agent_remove(root.clone(), "qa".into()).unwrap());
        assert!(!project_agent_remove(root.clone(), "qa".into()).unwrap());
        assert!(project_agent_remove(root, "../CLAUDE".into()).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn refuses_paths_outside_the_project() {
        let dir = temp();
        let bad = vec![SetupFile { path: "../evil".into(), content: "x".into() }];
        assert!(run(&dir, &bad, None, "m", Methodology::V4, None).is_err());
        let abs = vec![SetupFile { path: "/tmp/evil".into(), content: "x".into() }];
        assert!(run(&dir, &abs, None, "m", Methodology::V4, None).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_v6_setup_writes_the_v6_scaffold_and_counts_it() {
        let dir = temp();
        let src = temp();
        std::fs::create_dir_all(src.join("skills/bmad")).unwrap();
        std::fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        std::fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();

        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V6, Some(&src)).unwrap();

        // skills file, config.toml, custom/.gitignore, the runtime, the marker.
        assert_eq!(r.bmadv6_files, 5, "{:?}", r.created);
        assert_eq!(r.bmad_files, 0, "a v6 project installs no v4 files");
        assert!(dir.join(".claude/skills/bmad/SKILL.md").is_file());
        assert!(dir.join("_bmad/ade-runtime.mjs").is_file());
        assert_eq!(
            std::fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(),
            "v6"
        );
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    /// The v6 key files a full setup must find on disk: the skills tree and the
    /// runtime bundle every patched call site runs.
    fn complete_v6_tree(dir: &Path) {
        std::fs::create_dir_all(dir.join(".claude/skills/bmad")).unwrap();
        std::fs::write(dir.join(".claude/skills/bmad/SKILL.md"), "hello").unwrap();
        std::fs::create_dir_all(dir.join("_bmad")).unwrap();
        std::fs::write(dir.join("_bmad/ade-runtime.mjs"), "// runtime").unwrap();
    }

    #[test]
    fn a_full_v6_setup_without_resources_is_an_error() {
        // An unresolvable root must not read as a setup that succeeded and wrote nothing.
        let dir = temp();
        let err = install_source(Methodology::V6, None, true, &dir, |_| None).unwrap_err();
        assert!(err.contains("v6"), "{err}");
        // With resources, the resolved root is what setup installs from.
        let root = PathBuf::from("/tmp/bmad-v6");
        assert_eq!(
            install_source(Methodology::V6, None, true, &dir, |_| Some(root.clone())).unwrap(),
            Some(root)
        );
        // A v6 project whose key files are gone is an install target too, so a
        // miss there is this error, not a silent skip.
        assert!(install_source(Methodology::V6, Some(Methodology::V6), true, &dir, |_| None).is_err());
        // Nothing to install: already on the methodology with its key files
        // present, or not a full setup.
        complete_v6_tree(&dir);
        assert_eq!(install_source(Methodology::V6, Some(Methodology::V6), true, &dir, |_| None).unwrap(), None);
        assert_eq!(install_source(Methodology::V6, None, false, &dir, |_| None).unwrap(), None);
        // The v4 path keeps its pre-existing behaviour: a miss is not fatal.
        assert_eq!(install_source(Methodology::V4, None, true, &dir, |_| None).unwrap(), None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn an_intact_v6_project_is_not_re_scaffolded() {
        let dir = temp();
        complete_v6_tree(&dir);
        assert!(!needs_install(Methodology::V6, Some(Methodology::V6), true, &dir), "v6 project asked for v6, tree intact");
        assert!(needs_install(Methodology::V6, None, true, &dir), "a new project is scaffolded");
        assert!(!needs_install(Methodology::V6, None, false, &dir), "adding agents is not a full setup");
        assert!(needs_install(Methodology::V4, Some(Methodology::V6), true, &dir), "switching to v4 installs it");
        std::fs::remove_dir_all(dir).ok();
    }

    /// The re-apply promise: a deleted key file sets the install running again,
    /// and the install is idempotent, so nothing that is there is disturbed.
    #[test]
    fn a_full_setup_repairs_the_key_files_a_project_lost() {
        let dir = temp();
        complete_v6_tree(&dir);
        assert!(!needs_install(Methodology::V6, Some(Methodology::V6), true, &dir), "an intact v6 tree has nothing to install");

        std::fs::remove_file(dir.join("_bmad/ade-runtime.mjs")).unwrap();
        assert!(
            needs_install(Methodology::V6, Some(Methodology::V6), true, &dir),
            "a v6 project without _bmad/ade-runtime.mjs is repaired"
        );
        std::fs::write(dir.join("_bmad/ade-runtime.mjs"), "// runtime").unwrap();
        std::fs::remove_file(dir.join(".claude/skills/bmad/SKILL.md")).unwrap();
        assert!(
            needs_install(Methodology::V6, Some(Methodology::V6), true, &dir),
            "a v6 project without .claude/skills/bmad/SKILL.md is repaired"
        );

        // v4: a full setup always re-applies v4's idempotent install, so
        // `.bmad-core/` — the `.bmad-core/VERSION` marker bmad.rs writes
        // included — is topped back up.
        let v4 = temp();
        assert!(
            needs_install(Methodology::V4, Some(Methodology::V4), true, &v4),
            "no .bmad-core/VERSION: the v4 install is re-applied"
        );
        std::fs::create_dir_all(v4.join(".bmad-core")).unwrap();
        std::fs::write(v4.join(".bmad-core/VERSION"), "v4.1\n").unwrap();
        assert!(
            needs_install(Methodology::V4, Some(Methodology::V4), true, &v4),
            "an intact v4 tree is still topped up, as it was before the methodology choice"
        );
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(v4).ok();
    }

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
}
