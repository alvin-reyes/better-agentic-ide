use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
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
///
/// Entries are normalised lexically (`.` and `..` resolved). An entry that is
/// blank, has no named component, or is `dir` itself or an ancestor of it is
/// skipped: it would mute the whole watch, and a malformed caller value must
/// not do that.
fn exclusions(dir: &Path, exclude: &[String]) -> Vec<PathBuf> {
    let resolved = std::fs::canonicalize(dir).ok();
    let dir = normalize(dir);
    let mut out = Vec::new();
    for entry in exclude {
        if entry.trim().is_empty() {
            continue;
        }
        let given = Path::new(entry);
        let abs = if given.is_absolute() { normalize(given) } else { normalize(&dir.join(given)) };
        if !abs.components().any(|c| matches!(c, Component::Normal(_))) || excluded(&dir, std::slice::from_ref(&abs)) {
            continue;
        }
        if let (Some(resolved), Ok(rest)) = (resolved.as_ref(), abs.strip_prefix(&dir)) {
            let twin = resolved.join(rest);
            if twin != abs {
                out.push(twin);
            }
        }
        out.push(abs);
    }
    out
}

/// `path` with `.` dropped and `..` applied to the component before it, without
/// touching the file system. A `..` at the root is dropped; a leading `..` of a
/// relative path is kept.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => match out.components().next_back() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                Some(Component::RootDir | Component::Prefix(_)) => {}
                _ => out.push(".."),
            },
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The paths of one event that are not excluded.
fn keep(paths: &[PathBuf], exclude: &[PathBuf]) -> Vec<PathBuf> {
    paths.iter().filter(|p| !excluded(p, exclude)).cloned().collect()
}

/// Whether two path components name the same entry: case-insensitively where
/// the platform's file systems usually are (Windows, macOS), exactly elsewhere.
/// macOS is treated as case-insensitive even on a case-sensitive volume.
fn same_component(a: &std::ffi::OsStr, b: &std::ffi::OsStr) -> bool {
    if a == b {
        return true;
    }
    if cfg!(any(windows, target_os = "macos")) {
        // A name that is not valid text has no case to fold, and lossy
        // conversion would make unlike names equal.
        match (a.to_str(), b.to_str()) {
            (Some(a), Some(b)) => a.to_lowercase() == b.to_lowercase(),
            _ => false,
        }
    } else {
        a == b
    }
}

/// `path` is an excluded folder or inside one. Whole path components are
/// compared, so `archive2` is not under `archive`; a trailing separator on the
/// prefix does not matter, and `Path` treats both separators alike on Windows.
fn excluded(path: &Path, exclude: &[PathBuf]) -> bool {
    exclude.iter().any(|prefix| {
        // An empty prefix would match every path.
        if prefix.as_os_str().is_empty() {
            return false;
        }
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
            for path in keep(&event.paths, &exclude).iter().filter(|p| wanted(p)) {
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

    fn watched() -> PathBuf {
        std::env::temp_dir().join("ade-watch-pure").join(".ade")
    }

    #[test]
    fn an_empty_or_dot_entry_excludes_nothing() {
        let dir = watched();
        for entry in ["", ".", "   ", "./", "././"] {
            let found = exclusions(&dir, &[entry.to_string()]);
            assert!(found.is_empty(), "{entry:?} gave {found:?}");
        }
        assert!(!excluded(&dir.join("stage/x.md"), &[PathBuf::new()]), "an empty prefix matches nothing");
    }

    #[test]
    fn an_entry_that_is_the_watched_folder_or_above_it_is_skipped() {
        let dir = watched();
        let parent = dir.parent().unwrap().to_string_lossy().into_owned();
        assert!(exclusions(&dir, &[dir.to_string_lossy().into_owned()]).is_empty());
        assert!(exclusions(&dir, &[parent]).is_empty());
        assert!(exclusions(&dir, &["..".to_string()]).is_empty());
        assert!(exclusions(&dir, &["../..".to_string()]).is_empty());
        assert!(exclusions(&dir, &["archive/..".to_string()]).is_empty());
    }

    #[test]
    fn dot_and_dotdot_components_are_normalised_before_comparing() {
        let dir = watched();
        let found = exclusions(&dir, &[dir.join("x/../archive").to_string_lossy().into_owned()]);
        assert!(excluded(&dir.join("archive/a.md"), &found), "{found:?}");
        assert!(!excluded(&dir.join("x/a.md"), &found), "{found:?}");
        let found = exclusions(&dir, &["./archive/./sub".to_string()]);
        assert!(excluded(&dir.join("archive/sub/a.md"), &found), "{found:?}");
        assert!(!excluded(&dir.join("archive/a.md"), &found), "{found:?}");
    }

    #[test]
    fn an_entry_that_climbs_out_of_the_watched_folder_excludes_nothing_in_it() {
        let dir = watched();
        let found = exclusions(&dir, &["../sibling".to_string()]);
        assert!(!excluded(&dir.join("stage/a.md"), &found), "{found:?}");
        assert!(!excluded(&dir.join("sibling/a.md"), &found), "{found:?}");
    }

    #[test]
    fn a_relative_entry_is_taken_under_the_watched_folder() {
        let dir = watched();
        let found = exclusions(&dir, &["archive".to_string()]);
        assert!(excluded(&dir.join("archive/a.md"), &found), "{found:?}");
        assert!(!excluded(&dir.join("archive2/a.md"), &found), "{found:?}");
    }

    #[cfg(unix)]
    #[test]
    fn a_non_utf8_name_does_not_panic() {
        use std::ffi::OsStr;
        use std::os::unix::ffi::OsStrExt;
        let odd = PathBuf::from("/p/.ade").join(OsStr::from_bytes(b"arch\xffive"));
        let exclude = vec![odd.clone(), PathBuf::from("/p/.ade/archive")];
        assert!(excluded(&odd.join("x.md"), &exclude));
        assert!(!excluded(&PathBuf::from("/p/.ade").join(OsStr::from_bytes(b"arch\xfeive")), &exclude));
    }

    #[test]
    fn keep_drops_only_the_excluded_paths_of_an_event() {
        let exclude = vec![PathBuf::from("/p/.ade/archive")];
        let paths = vec![PathBuf::from("/p/.ade/archive/a.md"), PathBuf::from("/p/.ade/stage/a.md")];
        assert_eq!(keep(&paths, &exclude), vec![PathBuf::from("/p/.ade/stage/a.md")]);
        assert_eq!(keep(&paths, &[]), paths);
    }

    #[test]
    fn keep_delivers_nothing_when_every_path_is_excluded() {
        let exclude = vec![PathBuf::from("/p/.ade/archive")];
        let paths = vec![PathBuf::from("/p/.ade/archive/a.md"), PathBuf::from("/p/.ade/archive/b.md")];
        assert!(keep(&paths, &exclude).is_empty());
    }
}
