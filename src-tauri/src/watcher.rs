use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
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

struct WatcherEntry {
    _watcher: RecommendedWatcher,
}

pub struct WatcherManager {
    watchers: Arc<Mutex<HashMap<u32, WatcherEntry>>>,
    next_id: Arc<Mutex<u32>>,
}

impl WatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
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

    let ext_set: Vec<String> = extensions.iter().map(|e| e.to_lowercase()).collect();
    let channel = on_event.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            match res {
                Ok(event) => {
                    let paths: Vec<&PathBuf> = event
                        .paths
                        .iter()
                        .filter(|p| {
                            if ext_set.is_empty() {
                                return true;
                            }
                            p.extension()
                                .and_then(|e| e.to_str())
                                .map(|e| ext_set.contains(&e.to_lowercase()))
                                .unwrap_or(false)
                        })
                        .collect();

                    if paths.is_empty() {
                        return;
                    }

                    for path in paths {
                        let path_str = path.to_string_lossy().to_string();
                        match event.kind {
                            EventKind::Create(_) => {
                                let _ = channel.send(WatchEvent::Created {
                                    path: path_str,
                                });
                            }
                            EventKind::Modify(_) => {
                                let content = std::fs::read_to_string(path)
                                    .unwrap_or_default();
                                let _ = channel.send(WatchEvent::Changed {
                                    path: path_str,
                                    content,
                                });
                            }
                            EventKind::Remove(_) => {
                                let _ = channel.send(WatchEvent::Removed {
                                    path: path_str,
                                });
                            }
                            _ => {}
                        }
                    }
                }
                Err(e) => {
                    let _ = channel.send(WatchEvent::Error {
                        message: e.to_string(),
                    });
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", dir, e))?;

    let id = {
        let mut next = state.next_id.lock().unwrap();
        let id = *next;
        *next += 1;
        id
    };

    {
        let mut watchers = state.watchers.lock().unwrap();
        watchers.insert(id, WatcherEntry { _watcher: watcher });
    }

    Ok(id)
}

#[tauri::command]
pub fn unwatch_directory(
    state: tauri::State<'_, WatcherManager>,
    id: u32,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().unwrap();
    watchers.remove(&id);
    Ok(())
}
