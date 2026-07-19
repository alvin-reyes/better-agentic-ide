use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BmadStatus {
    pub installed: bool,
    pub version: Option<String>,
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
}
