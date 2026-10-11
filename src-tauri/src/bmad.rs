use serde::Serialize;
use std::path::Path;
use tauri::Manager;

#[derive(Serialize, Clone, Debug, Default)]
pub struct ScaffoldReport {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
    /// Folders the install created, outermost first.
    #[serde(skip)]
    pub created_dirs: Vec<std::path::PathBuf>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BmadStatus {
    pub installed: bool,
    pub version: Option<String>,
}

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
            let wrote = crate::projectsetup::write_or_clean(dst, |to| crate::projectsetup::copy_into(src, to))
                .map_err(|e| format!("{}: {e}", dst.display()))?;
            let list = if wrote { &mut report.created } else { &mut report.skipped };
            list.push(dst.to_string_lossy().to_string());
        }
    }
    Ok(())
}

/// The bundled BMAD resources.
pub fn resource_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .resolve("resources/bmad", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resource not found: {}", e))
}

/// Copy BMAD into a project: .bmad-core/, the /BMad Claude Code commands and
/// the methodology marker. Existing files are left alone.
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
    Ok(())
}

pub fn read_status(project: &Path) -> BmadStatus {
    let core = project.join(".bmad-core");
    if !core.is_dir() {
        return BmadStatus { installed: false, version: None };
    }
    let version = std::fs::read_to_string(core.join("VERSION"))
        .ok()
        .map(|s| s.trim().to_string());
    BmadStatus { installed: true, version }
}

#[tauri::command(async)]
pub fn bmad_status(path: String) -> BmadStatus {
    read_status(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn absent_when_no_core() {
        let dir = std::env::temp_dir().join("ade_bmad_absent");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_status(&dir), BmadStatus { installed: false, version: None });
    }

    #[test]
    fn present_with_version() {
        let dir = std::env::temp_dir().join("ade_bmad_present");
        let core = dir.join(".bmad-core");
        std::fs::create_dir_all(&core).unwrap();
        std::fs::write(core.join("VERSION"), "v4.1\n").unwrap();
        assert_eq!(
            read_status(&dir),
            BmadStatus { installed: true, version: Some("v4.1".to_string()) }
        );
    }

    #[test]
    fn copy_tree_is_idempotent() {
        let base = std::env::temp_dir().join("ade_bmad_copy");
        let _ = std::fs::remove_dir_all(&base);
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("a")).unwrap();
        std::fs::write(src.join("a/f.txt"), "hi").unwrap();

        let mut r1 = ScaffoldReport::default();
        copy_tree(&src, &dst, &mut r1).unwrap();
        assert_eq!(r1.created.len(), 1);
        assert!(dst.join("a/f.txt").is_file());

        // Second run: file already exists -> skipped, not overwritten.
        std::fs::write(dst.join("a/f.txt"), "user-edit").unwrap();
        let mut r2 = ScaffoldReport::default();
        copy_tree(&src, &dst, &mut r2).unwrap();
        assert_eq!(r2.created.len(), 0);
        assert_eq!(r2.skipped.len(), 1);
        assert_eq!(std::fs::read_to_string(dst.join("a/f.txt")).unwrap(), "user-edit");
    }

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
}
