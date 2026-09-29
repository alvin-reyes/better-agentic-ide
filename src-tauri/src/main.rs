// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Keep this a thin shim: every command, plugin and state is registered in
// lib.rs's run(), or the shipped binary fails with "Command ... not found".
fn main() {
    better_terminal_lib::run()
}
