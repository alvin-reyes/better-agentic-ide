use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
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

#[tauri::command]
pub fn watch_directory(
    state: tauri::State<'_, WatcherManager>,
    dir: String,
    extensions: Vec<String>,
    on_event: Channel<WatchEvent>,
) -> Result<u32, String> {
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
                    EventKind::Modify(_) => WatchEvent::Changed {
                        content: std::fs::read_to_string(path).unwrap_or_default(),
                        path: path_str,
                    },
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
