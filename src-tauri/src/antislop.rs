//! Anti-slop: the lines added in a project's working tree (for the slop check
//! in the frontend) and where the bundled ADE Claude Code plugin lives.

use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager};

const MAX_FILE_BYTES: u64 = 200_000;

fn git(project: &str, args: &[&str]) -> Option<String> {
    let out = Command::new("git").current_dir(project).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// A unified diff (no context) of tracked changes against HEAD, with each new
/// untracked text file appended as all-added lines.
#[tauri::command(async)]
pub fn slop_diff(project: String) -> Result<String, String> {
    if git(&project, &["rev-parse", "--is-inside-work-tree"]).is_none() {
        return Err(format!("{project} isn't a git repository."));
    }
    let base: &[&str] = if git(&project, &["rev-parse", "--verify", "-q", "HEAD"]).is_some() {
        &["diff", "HEAD", "--no-color", "--no-ext-diff", "-U0"]
    } else {
        &["diff", "--cached", "--no-color", "--no-ext-diff", "-U0"]
    };
    let mut out = git(&project, base).unwrap_or_default();
    let untracked = git(&project, &["ls-files", "--others", "--exclude-standard", "-z"]).unwrap_or_default();
    for rel in untracked.split('\0').filter(|s| !s.is_empty()) {
        let path = Path::new(&project).join(rel);
        if std::fs::metadata(&path).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(true) {
            continue;
        }
        // Text files only.
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        if text.contains('\0') {
            continue;
        }
        out.push_str(&format!("+++ b/{rel}\n"));
        for line in text.lines() {
            out.push('+');
            out.push_str(line);
            out.push('\n');
        }
    }
    Ok(out)
}

/// The marketplace directory of the ADE plugin shipped with the app.
#[tauri::command]
pub fn ade_plugin_marketplace(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .resolve("claude-plugin", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    if !dir.join(".claude-plugin").join("marketplace.json").is_file() {
        return Err("The ADE plugin isn't bundled with this build.".into());
    }
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_includes_changes_and_new_files() {
        let dir = std::env::temp_dir().join(format!(
            "ade-slop-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_string_lossy().to_string();
        let run = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        run(&["init", "-q"]);
        std::fs::write(dir.join("a.ts"), "one\n").unwrap();
        run(&["add", "."]);
        run(&["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "-m", "init"]);
        std::fs::write(dir.join("a.ts"), "one\n// TODO two\n").unwrap();
        std::fs::write(dir.join("new.md"), "We delve.\n").unwrap();
        let diff = slop_diff(p).unwrap();
        assert!(diff.contains("+++ b/a.ts") && diff.contains("+// TODO two"), "{diff}");
        assert!(diff.contains("+++ b/new.md\n+We delve."), "{diff}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn not_a_repo_is_an_error() {
        assert!(slop_diff(std::env::temp_dir().to_string_lossy().into()).is_err());
    }
}
