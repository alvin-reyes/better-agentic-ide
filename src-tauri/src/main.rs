// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// All commands, plugins and state are registered in lib.rs. This file used
// to build its own Builder with only the four PTY commands, so the shipped
// binary lacked file reading, the file browser, watchers, the fleet
// sub-agent watcher and BMAD ("Command ... not found" at runtime).
fn main() {
    better_terminal_lib::run()
}
