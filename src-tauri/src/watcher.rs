use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum WatchEvent {
    #[serde(rename = "changed")]
    Changed { path: String, content: String },
    #[serde(rename = "created")]
    Created { path: String },
    #[serde(rename = "removed")]
    Removed { path: String },
    #[serde(rename = "error")]
    Error { message: String },
}

pub struct WatcherManager {
    watchers: Mutex<HashMap<u32, RecommendedWatcher>>,
    next_id: AtomicU32,
}

impl WatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

/// The event for a modified file. With `with_content` the file is read and its
/// text sent along (the preview and file browser show it); without, nothing is
/// read and `content` is empty, for callers that only need to know it changed.
fn changed_event(path: &Path, with_content: bool) -> WatchEvent {
    WatchEvent::Changed {
        content: if with_content {
            std::fs::read_to_string(path).unwrap_or_default()
        } else {
            String::new()
        },
        path: path.to_string_lossy().to_string(),
    }
}

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

/// Whether two path components name the same entry: case-insensitively where
/// the platform's file systems usually are (Windows, macOS), exactly elsewhere.
fn same_component(a: &std::ffi::OsStr, b: &std::ffi::OsStr) -> bool {
    if cfg!(any(windows, target_os = "macos")) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// `path` is an excluded folder or inside one. Whole path components are
/// compared, so `archive2` is not under `archive`; a trailing separator on the
/// prefix does not matter, and `Path` treats both separators alike on Windows.
fn excluded(path: &Path, exclude: &[PathBuf]) -> bool {
    exclude.iter().any(|prefix| {
        let mut inside = path.components();
        prefix
            .components()
            .all(|want| inside.next().is_some_and(|got| same_component(got.as_os_str(), want.as_os_str())))
    })
}

/// `with_content` defaults to true; the board panel passes false, since it
/// rebuilds from disk anyway and every modify would otherwise read the file.
///
/// `exclude` is path prefixes whose events are dropped. The board passes
/// `.ade/archive` for its `.ade/` watch: the archive is history, and a switch
/// writes it in one burst. A recursive watch on Linux still registers the
/// archive's folders with inotify; that cost is accepted, since the archive is
/// written once per switch. An event listing several paths is filtered path by
/// path: only the excluded ones are dropped.
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

    let extensions: Vec<String> = extensions.iter().map(|e| e.to_lowercase()).collect();
    let wanted = move |p: &PathBuf| {
        extensions.is_empty()
            || p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| extensions.contains(&e.to_lowercase()))
    };

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            let event = match res {
                Ok(event) => event,
                Err(e) => {
                    let _ = on_event.send(WatchEvent::Error { message: e.to_string() });
                    return;
                }
            };
            for path in event.paths.iter().filter(|p| wanted(p) && !excluded(p, &exclude)) {
                let path_str = path.to_string_lossy().to_string();
                let ev = match event.kind {
                    EventKind::Create(_) => WatchEvent::Created { path: path_str },
                    EventKind::Modify(_) => changed_event(path, with_content),
                    EventKind::Remove(_) => WatchEvent::Removed { path: path_str },
                    _ => continue,
                };
                let _ = on_event.send(ev);
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", dir, e))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.watchers.lock().unwrap().insert(id, watcher);
    Ok(id)
}

#[tauri::command]
pub fn unwatch_directory(
    state: tauri::State<'_, WatcherManager>,
    id: u32,
) -> Result<(), String> {
    state.watchers.lock().unwrap().remove(&id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str, body: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ade-watch-{}-{}", name, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("story.md");
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn a_change_carries_the_file_content_by_default() {
        let path = temp_file("with", "# Story");
        match changed_event(&path, true) {
            WatchEvent::Changed { content, .. } => assert_eq!(content, "# Story"),
            _ => panic!("expected a change"),
        }
    }

    #[test]
    fn a_change_without_content_does_not_read_the_file() {
        let path = temp_file("without", "# Story");
        match changed_event(&path, false) {
            WatchEvent::Changed { path: p, content } => {
                assert_eq!(content, "");
                assert_eq!(p, path.to_string_lossy());
            }
            _ => panic!("expected a change"),
        }
    }

    #[test]
    fn drops_events_under_an_excluded_prefix() {
        let exclude = vec![PathBuf::from("/p/.ade/archive")];
        assert!(excluded(Path::new("/p/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md"), &exclude));
        assert!(excluded(Path::new("/p/.ade/archive"), &exclude), "the folder itself");
        assert!(!excluded(Path::new("/p/.ade/archive2/x.md"), &exclude), "a prefix ends at a path separator");
        assert!(!excluded(Path::new("/p/.ade/archived-notes.md"), &exclude));
        assert!(!excluded(Path::new("/p/.ade"), &exclude), "the parent is not under the prefix");
        assert!(!excluded(Path::new("/p/.ade/stage"), &exclude));
        assert!(!excluded(Path::new("/p/.ade/stage"), &[]));
    }

    #[test]
    fn a_trailing_separator_on_the_prefix_is_tolerated() {
        let exclude = vec![PathBuf::from("/p/.ade/archive/")];
        assert!(excluded(Path::new("/p/.ade/archive/x.md"), &exclude));
        assert!(!excluded(Path::new("/p/.ade/archive2/x.md"), &exclude));
    }

    #[cfg(windows)]
    #[test]
    fn windows_separators_and_case_are_tolerated() {
        let exclude = vec![PathBuf::from(r"C:\p\.ade\archive")];
        assert!(excluded(Path::new("C:/p/.ade/archive/x.md"), &exclude));
        assert!(excluded(Path::new(r"c:\P\.ADE\Archive\x.md"), &exclude));
        assert!(!excluded(Path::new(r"C:\p\.ade\archive2\x.md"), &exclude));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn case_matters_where_the_file_system_cares() {
        let exclude = vec![PathBuf::from("/p/.ade/archive")];
        assert!(!excluded(Path::new("/p/.ade/Archive/x.md"), &exclude));
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    fn case_is_ignored_where_the_file_system_ignores_it() {
        let exclude = vec![PathBuf::from("/p/.ade/archive")];
        assert!(excluded(Path::new("/p/.ade/Archive/x.md"), &exclude));
    }

    #[test]
    fn an_exclusion_is_absolute_or_under_the_watched_folder() {
        let dir = std::env::temp_dir().join(format!("ade-watch-exclude-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let elsewhere = std::env::temp_dir().join("elsewhere").join("x");
        let found = exclusions(&dir, &["archive".to_string(), elsewhere.to_string_lossy().into_owned()]);
        assert!(found.contains(&dir.join("archive")), "{found:?}");
        assert!(found.contains(&elsewhere), "{found:?}");
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
}
