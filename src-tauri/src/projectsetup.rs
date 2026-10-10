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
}

/// A relative path that stays inside the project.
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Refusing to write outside the project: {rel}"));
    }
    Ok(root.join(p))
}

fn project(root: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(root);
    if !p.is_dir() {
        return Err(format!("{root} isn't a folder."));
    }
    Ok(p)
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
    })
}

/// Write the files the project is missing, load the methodology from an
/// existing CLAUDE.md, and install the project's methodology from
/// `methodology_src` (its resource root). Nothing that exists is overwritten.
pub fn apply(
    dir: &Path,
    files: &[SetupFile],
    import: Option<&str>,
    marker: &str,
    methodology: Methodology,
    methodology_src: Option<&Path>,
) -> Result<SetupReport, String> {
    let mut report = SetupReport::default();
    // Decide the import before writing, so a CLAUDE.md we create isn't appended to.
    let append = import.is_some() && dir.join("CLAUDE.md").is_file() && !has_import(dir, marker);
    for f in files {
        let dst = inside(dir, &f.path)?;
        if dst.exists() {
            continue;
        }
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
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
            crate::bmad::install(src, dir, &mut bmad);
            report.bmad_files = bmad.created.len();
            report.created.extend(bmad.created);
        }
        (Methodology::V6, Some(src)) => {
            let mut v6 = crate::bmadv6::ScaffoldReport::default();
            crate::bmadv6::install(src, dir, &mut v6)?;
            report.bmadv6_files = v6.created.len();
            report.created.extend(v6.created.iter().map(|p| p.to_string_lossy().into_owned()));
        }
        _ => {}
    }
    Ok(report)
}

/// Whether setup installs this methodology's resources: a full setup of a
/// project that isn't on it yet. A project already on its methodology keeps
/// the scaffold it has.
fn needs_install(methodology: Methodology, on_disk: Option<Methodology>, full: bool) -> bool {
    full && on_disk != Some(methodology)
}

/// The resources a full setup installs from, or `None` when there is nothing to
/// install. A v6 setup whose resources did not resolve is an error: reporting
/// success while writing nothing would leave the project without skills, without
/// `_bmad/` and without a marker — what install() itself refuses to do.
fn install_source(
    methodology: Methodology,
    on_disk: Option<Methodology>,
    full: bool,
    resolve: impl FnOnce(Methodology) -> Option<PathBuf>,
) -> Result<Option<PathBuf>, String> {
    if !needs_install(methodology, on_disk, full) {
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
    // One setup at a time: two at once could both see CLAUDE.md without the
    // import and append it twice.
    static APPLY: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _one = APPLY.lock().unwrap_or_else(|e| e.into_inner());
    // The owner's answer from the setup prompt; anything else is the v6 default.
    let methodology = if methodology.trim().eq_ignore_ascii_case("v4") { Methodology::V4 } else { Methodology::V6 };
    // A full setup also loads the methodology from CLAUDE.md and installs the
    // project's methodology; adding agents on their own touches nothing else.
    let root = |wanted| match wanted {
        Methodology::V4 => crate::bmad::resource_root(&app).ok(),
        Methodology::V6 => crate::bmadv6::resource_root(&app).ok(),
    };
    let src = install_source(methodology, crate::bmadv6::detect_on_disk(&dir), full, root)?;
    apply(&dir, &files, full.then_some(import.as_str()), &marker, methodology, src.as_deref())
}

/// Remove what a setup created (files still unchanged since, by content) and
/// the import block it appended. Leaves anything the user has edited.
#[tauri::command(async)]
pub fn project_setup_undo(root: String, created: Vec<String>, files: Vec<SetupFile>, import: Option<String>) -> Result<usize, String> {
    let dir = project(&root)?;
    let ours: std::collections::HashMap<PathBuf, &str> =
        files.iter().filter_map(|f| inside(&dir, &f.path).ok().map(|p| (p, f.content.as_str()))).collect();
    let mut removed = 0;
    for path in created.iter().map(PathBuf::from) {
        if !path.starts_with(&dir) {
            continue;
        }
        let unchanged = match ours.get(&path) {
            Some(content) => std::fs::read_to_string(&path).map(|s| s == *content).unwrap_or(false),
            // BMAD files: removed only if they're still where setup put them.
            None => path.is_file(),
        };
        if unchanged && std::fs::remove_file(&path).is_ok() {
            removed += 1;
            // Tidy directories setup created that are now empty.
            let mut parent = path.parent();
            while let Some(p) = parent {
                if p == dir || std::fs::remove_dir(p).is_err() {
                    break;
                }
                parent = p.parent();
            }
        }
    }
    if let Some(import) = import {
        let claude = dir.join("CLAUDE.md");
        if let Ok(text) = std::fs::read_to_string(&claude) {
            if let Some(stripped) = text.strip_suffix(&import) {
                std::fs::write(&claude, stripped).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(removed)
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

    #[test]
    fn writes_missing_files_and_never_overwrites() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/qa.md"), "mine").unwrap();
        let r = apply(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join(".claude/agents/qa.md")).unwrap(), "mine");
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "rules");
        assert_eq!(r.created.len(), 2);
        assert!(!r.appended_import, "a CLAUDE.md we created already imports the rules");
        // Running again changes nothing.
        let again = apply(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(again.created.is_empty() && !again.appended_import);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn existing_claude_md_gets_the_import_once_and_undo_restores_it() {
        let dir = temp();
        std::fs::write(dir.join("CLAUDE.md"), "# Mine\n").unwrap();
        let import = "\n<!-- m -->\n@.ade/rules.md\n";
        let r = apply(&dir, &files(), Some(import), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(r.appended_import);
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), format!("# Mine\n{import}"));
        let status = project_setup_status(dir.to_string_lossy().into(), vec!["CLAUDE.md".into()], "<!-- m -->".into()).unwrap();
        assert!(!status.needs_import);

        // Edit one created file: undo keeps it.
        std::fs::write(dir.join(".ade/rules.md"), "edited").unwrap();
        let removed = project_setup_undo(dir.to_string_lossy().into(), r.created.clone(), files(), Some(import.into())).unwrap();
        assert_eq!(removed, 1);
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# Mine\n");
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "edited");
        assert!(!dir.join(".claude").exists(), "empty folders setup created are removed");
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
        assert!(apply(&dir, &bad, None, "m", Methodology::V4, None).is_err());
        let abs = vec![SetupFile { path: "/tmp/evil".into(), content: "x".into() }];
        assert!(apply(&dir, &abs, None, "m", Methodology::V4, None).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_v6_setup_writes_the_v6_scaffold_and_counts_it() {
        let dir = temp();
        let src = temp();
        std::fs::create_dir_all(src.join("skills/bmad")).unwrap();
        std::fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        std::fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();

        let r = apply(&dir, &files(), None, "<!-- m -->", Methodology::V6, Some(&src)).unwrap();

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

    #[test]
    fn a_full_v6_setup_without_resources_is_an_error() {
        // An unresolvable root must not read as a setup that succeeded and wrote nothing.
        let err = install_source(Methodology::V6, None, true, |_| None).unwrap_err();
        assert!(err.contains("v6"), "{err}");
        // With resources, the resolved root is what setup installs from.
        let root = PathBuf::from("/tmp/bmad-v6");
        assert_eq!(
            install_source(Methodology::V6, None, true, |_| Some(root.clone())).unwrap(),
            Some(root)
        );
        // Nothing to install: already on the methodology, or not a full setup.
        assert_eq!(install_source(Methodology::V6, Some(Methodology::V6), true, |_| None).unwrap(), None);
        assert_eq!(install_source(Methodology::V6, None, false, |_| None).unwrap(), None);
        // The v4 path keeps its pre-existing behaviour: a miss is not fatal.
        assert_eq!(install_source(Methodology::V4, None, true, |_| None).unwrap(), None);
    }

    #[test]
    fn a_project_already_on_its_methodology_is_not_installed_again() {
        assert!(!needs_install(Methodology::V6, Some(Methodology::V6), true), "v6 project asked for v6");
        assert!(!needs_install(Methodology::V4, Some(Methodology::V4), true), "v4 project asked for v4");
        assert!(needs_install(Methodology::V6, None, true), "a new project is scaffolded");
        assert!(!needs_install(Methodology::V6, None, false), "adding agents is not a full setup");
        assert!(needs_install(Methodology::V4, Some(Methodology::V6), true), "switching to v4 installs it");
    }
}
