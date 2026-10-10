//! BMAD v6 scaffold: vendored skills into .claude/skills, the _bmad/ tree,
//! the runtime bundle, and the methodology marker. Mirrors v6's own setup.py
//! output; nothing that exists is overwritten.

use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// v6's own `_bmad/custom/.gitignore` (setup.py's CUSTOM_GITIGNORE): setup reads
/// a custom folder whose ignore file lacks `*.user.toml` as unprotected, because
/// user answers would otherwise be committed.
const CUSTOM_GITIGNORE: &str = "# user-scoped overrides\n*.user.toml\n";

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Methodology {
    V4,
    V6,
}

impl Methodology {
    /// The marker's spelling: what `.ade/methodology` holds, and what the
    /// frontend's `methodology` argument accepts.
    pub fn as_str(self) -> &'static str {
        match self {
            Methodology::V4 => "v4",
            Methodology::V6 => "v6",
        }
    }
}

#[derive(Default)]
pub struct ScaffoldReport {
    pub created: Vec<PathBuf>,
    pub kept: Vec<PathBuf>,
}

/// The bundled v6 resources: `skills/`, `VERSION` and the runtime bundle.
/// tauri.conf.json maps the built bundle into this folder at bundle time, so the
/// single root install() reads is the same one that ships.
pub fn resource_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("resources/bmad-v6", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resource not found: {}", e))
}

/// What methodology a project says it is on: the marker, otherwise disk evidence
/// (.bmad-core/ => v4) for projects from before the marker existed. `None` is a
/// project with neither — a new one, which the frontend asks about and setup
/// then marks.
pub fn detect_on_disk(dir: &Path) -> Option<Methodology> {
    if let Ok(marker) = fs::read_to_string(dir.join(".ade/methodology")) {
        match marker.trim() {
            "v4" => return Some(Methodology::V4),
            "v6" => return Some(Methodology::V6),
            _ => {}
        }
    }
    dir.join(".bmad-core").is_dir().then_some(Methodology::V4)
}

/// `detect_on_disk`, with a project that has neither defaulting to v6. Setup
/// itself decides with `detect_on_disk`, which keeps a new project apart from a
/// v6 one.
#[allow(dead_code)]
pub fn detect_methodology(dir: &Path) -> Methodology {
    detect_on_disk(dir).unwrap_or(Methodology::V6)
}

/// A TOML basic string's contents, escaped the way v6's setup.py does.
fn toml_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| format!("{}: {e}", src.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            fs::create_dir_all(&to).map_err(|e| e.to_string())?;
            copy_tree(&from, &to, report)?;
        } else if to.exists() {
            report.kept.push(to);
        } else {
            fs::copy(&from, &to).map_err(|e| format!("{}: {e}", from.display()))?;
            report.created.push(to);
        }
    }
    Ok(())
}

/// Copy one file, unless the project already has it.
fn copy_file(src: &Path, dst: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    if dst.exists() {
        report.kept.push(dst.to_path_buf());
    } else {
        fs::copy(src, dst).map_err(|e| format!("{}: {e}", src.display()))?;
        report.created.push(dst.to_path_buf());
    }
    Ok(())
}

/// Scaffold a v6 project: the skills, the `_bmad/` tree with the runtime bundle,
/// `_bmad-output/` and the methodology marker. Existing files are left alone.
pub fn install(src: &Path, dir: &Path, report: &mut ScaffoldReport) -> Result<(), String> {
    // Skills: .claude/skills/*
    copy_tree(&src.join("skills"), &dir.join(".claude/skills"), report)?;
    // _bmad/ tree
    fs::create_dir_all(dir.join("_bmad/custom")).map_err(|e| e.to_string())?;
    let config = dir.join("_bmad/config.toml");
    if config.exists() {
        report.kept.push(config);
    } else {
        let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let body = format!(
            "[core]\nproject_name = \"{}\"\noutput_folder = \"{}/_bmad-output\"\n",
            toml_escape(&name),
            toml_escape(&dir.to_string_lossy()),
        );
        fs::write(&config, body).map_err(|e| e.to_string())?;
        report.created.push(config);
    }
    let gitignore = dir.join("_bmad/custom/.gitignore");
    if gitignore.exists() {
        report.kept.push(gitignore);
    } else {
        fs::write(&gitignore, CUSTOM_GITIGNORE).map_err(|e| e.to_string())?;
        report.created.push(gitignore);
    }
    // Runtime bundle: the patched skills call `node {project-root}/_bmad/ade-runtime.mjs`.
    copy_file(&src.join("ade-runtime.mjs"), &dir.join("_bmad/ade-runtime.mjs"), report)?;
    fs::create_dir_all(dir.join("_bmad-output")).map_err(|e| e.to_string())?;
    // Methodology marker: ADE's own file, not user content, so an explicit v6
    // install is allowed to replace it. A marker left reading "v4" beside a v6
    // tree is the mixed state that would keep every later detect_on_disk — and
    // so setup's own methodology choice — on v4. Nothing else here is
    // overwritten; everything else keeps the nothing-overwrites rule.
    let marker = dir.join(".ade/methodology");
    fs::create_dir_all(dir.join(".ade")).map_err(|e| e.to_string())?;
    if fs::read_to_string(&marker).map(|s| s.trim() == "v6").unwrap_or(false) {
        report.kept.push(marker);
    } else {
        fs::write(&marker, "v6\n").map_err(|e| e.to_string())?;
        report.created.push(marker);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A miniature of the bundled v6 resource root: skills/ + the runtime bundle.
    fn fixture(name: &str) -> PathBuf {
        let src = temp(name);
        fs::create_dir_all(src.join("skills")).unwrap();
        fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();
        src
    }

    #[test]
    fn installs_the_v6_tree_and_marker() {
        let dir = std::env::temp_dir().join(format!("bmadv6-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // src is a tiny fixture tree, not the real vendored skills:
        let src = std::env::temp_dir().join(format!("bmadv6-src-{}", std::process::id()));
        fs::create_dir_all(src.join("skills/bmad")).unwrap();
        fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();

        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        assert!(dir.join(".claude/skills/bmad/SKILL.md").is_file());
        assert!(dir.join("_bmad/config.toml").is_file());
        assert!(dir.join("_bmad/custom/.gitignore").is_file());
        assert!(dir.join("_bmad/ade-runtime.mjs").is_file());
        assert!(dir.join("_bmad-output").is_dir());
        assert_eq!(fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(), "v6");
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }

    #[test]
    fn never_overwrites_existing_files() {
        let dir = std::env::temp_dir().join(format!("bmadv6-keep-{}", std::process::id()));
        fs::create_dir_all(dir.join("_bmad")).unwrap();
        fs::write(dir.join("_bmad/config.toml"), "custom").unwrap();
        let src = std::env::temp_dir().join(format!("bmadv6-src-keep-{}", std::process::id()));
        fs::create_dir_all(src.join("skills")).unwrap();
        fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();

        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        assert_eq!(fs::read_to_string(dir.join("_bmad/config.toml")).unwrap(), "custom");
        assert!(!report.created.iter().any(|p| p.ends_with("config.toml")));
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }

    /// The ruled path "owner answers v6 over an actually-v4 project": the tree
    /// becomes v6, so the marker must too. A v4 marker beside v6 skills is the
    /// mixed state every later detection reads as v4.
    #[test]
    fn a_v6_install_over_a_v4_marker_flips_it() {
        let dir = temp("bmadv6-flip");
        fs::create_dir_all(dir.join(".ade")).unwrap();
        fs::write(dir.join(".ade/methodology"), "v4\n").unwrap();
        let src = fixture("bmadv6-flip-src");

        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        assert_eq!(fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(), "v6");
        assert_eq!(detect_on_disk(&dir), Some(Methodology::V6));
        assert!(
            report.created.iter().any(|p| p.ends_with(".ade/methodology")),
            "the flipped marker is setup's write: {:?}",
            report.created
        );
        assert!(
            !report.kept.iter().any(|p| p.ends_with(".ade/methodology")),
            "the v4 marker is not kept"
        );

        // A second run finds a v6 marker: nothing to flip, so nothing kept
        // against the nothing-overwrites rule either.
        let mut again = ScaffoldReport::default();
        install(&src, &dir, &mut again).unwrap();
        assert!(again.created.is_empty(), "{:?}", again.created);
        assert!(again.kept.iter().any(|p| p.ends_with(".ade/methodology")), "{:?}", again.kept);
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }

    #[test]
    fn detects_v4_projects_without_a_marker() {
        let dir = std::env::temp_dir().join(format!("bmadv6-detect-{}", std::process::id()));
        fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        assert_eq!(detect_methodology(&dir), Methodology::V4);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_project_with_neither_methodology_is_new() {
        let dir = temp("bmadv6-new");
        assert_eq!(detect_on_disk(&dir), None, "a new project is not on either methodology yet");
        assert_eq!(detect_methodology(&dir), Methodology::V6, "new projects default to v6");
        fs::remove_dir_all(&dir).ok();
    }

    /// What setup writes must read back as a v6 project: v6's own tooling finds
    /// its output folder through this config, and its setup reports a custom
    /// folder whose ignore file lacks `*.user.toml` as unprotected.
    #[test]
    fn the_config_marker_and_gitignore_say_v6() {
        let dir = temp("bmadv6-conf");
        let src = fixture("bmadv6-conf-src");
        let mut report = ScaffoldReport::default();
        install(&src, &dir, &mut report).unwrap();

        let name = dir.file_name().unwrap().to_string_lossy().into_owned();
        let config = fs::read_to_string(dir.join("_bmad/config.toml")).unwrap();
        assert!(config.contains(&format!("project_name = \"{name}\"")), "{config}");
        assert!(
            config.contains(&format!("output_folder = \"{}/_bmad-output\"", dir.display())),
            "{config}"
        );
        assert_eq!(detect_on_disk(&dir), Some(Methodology::V6), "the marker reads back as v6");
        let ignore = fs::read_to_string(dir.join("_bmad/custom/.gitignore")).unwrap();
        assert!(ignore.lines().any(|l| l.trim() == "*.user.toml"), "{ignore}");
        // A second run adds nothing and keeps what is there.
        let mut again = ScaffoldReport::default();
        install(&src, &dir, &mut again).unwrap();
        assert!(again.created.is_empty(), "{:?}", again.created);
        assert_eq!(fs::read_to_string(dir.join("_bmad/config.toml")).unwrap(), config);
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }

    #[test]
    fn a_missing_runtime_bundle_is_an_error() {
        let dir = temp("bmadv6-noruntime");
        let src = temp("bmadv6-noruntime-src");
        fs::create_dir_all(src.join("skills")).unwrap();
        let mut report = ScaffoldReport::default();
        assert!(install(&src, &dir, &mut report).is_err(), "a scaffold without the bundle would ship broken skills");
        assert!(!dir.join("_bmad/ade-runtime.mjs").exists());
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&src).ok();
    }
}
