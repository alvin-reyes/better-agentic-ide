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

/// `with_content` defaults to true; the board panel passes false, since it
/// rebuilds from disk anyway and every modify would otherwise read the file.
#[tauri::command]
pub fn watch_directory(
    state: tauri::State<'_, WatcherManager>,
    dir: String,
    extensions: Vec<String>,
    with_content: Option<bool>,
    on_event: Channel<WatchEvent>,
) -> Result<u32, String> {
    let with_content = with_content.unwrap_or(true);
    let watch_path = PathBuf::from(&dir);
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }

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
            for path in event.paths.iter().filter(|p| wanted(p)) {
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
}
