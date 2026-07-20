use serde::Serialize;
use std::path::Path;
use tauri::Manager;

#[derive(Serialize, Clone, Debug, Default)]
pub struct ScaffoldReport {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BmadStatus {
    pub installed: bool,
    pub version: Option<String>,
}

pub fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport) {
    if src.is_dir() {
        let _ = std::fs::create_dir_all(dst);
        if let Ok(entries) = std::fs::read_dir(src) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                copy_tree(&entry.path(), &dst.join(&name), report);
            }
        }
    } else if src.is_file() {
        if dst.exists() {
            report.skipped.push(dst.to_string_lossy().to_string());
        } else {
            if let Some(parent) = dst.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::copy(src, dst).is_ok() {
                report.created.push(dst.to_string_lossy().to_string());
            }
        }
    }
}

#[tauri::command]
pub fn scaffold_bmad(app: tauri::AppHandle, path: String) -> Result<ScaffoldReport, String> {
    let project = Path::new(&path);
    if !project.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let res_root = app
        .path()
        .resolve("resources/bmad", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resource not found: {}", e))?;

    let mut report = ScaffoldReport::default();
    // .bmad-core/
    copy_tree(&res_root.join("bmad-core"), &project.join(".bmad-core"), &mut report);
    // Claude Code commands
    let cmd_src = res_root.join("claude-commands").join("BMad");
    if cmd_src.is_dir() {
        copy_tree(&cmd_src, &project.join(".claude").join("commands").join("BMad"), &mut report);
    }
    // Write VERSION marker into .bmad-core for bmad_status.
    if let Ok(v) = std::fs::read_to_string(res_root.join("VERSION")) {
        let marker = project.join(".bmad-core").join("VERSION");
        if !marker.exists() {
            let _ = std::fs::write(&marker, v);
        }
    }
    Ok(report)
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

#[tauri::command]
pub fn bmad_status(path: String) -> BmadStatus {
    read_status(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        copy_tree(&src, &dst, &mut r1);
        assert_eq!(r1.created.len(), 1);
        assert!(dst.join("a/f.txt").is_file());

        // Second run: file already exists -> skipped, not overwritten.
        std::fs::write(dst.join("a/f.txt"), "user-edit").unwrap();
        let mut r2 = ScaffoldReport::default();
        copy_tree(&src, &dst, &mut r2);
        assert_eq!(r2.created.len(), 0);
        assert_eq!(r2.skipped.len(), 1);
        assert_eq!(std::fs::read_to_string(dst.join("a/f.txt")).unwrap(), "user-edit");
    }
}
