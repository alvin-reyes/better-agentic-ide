//! `ade-hook`: run by Claude Code's `command` hooks inside ADE's terminals.
//! The logic, and its tests, live in `src-tauri/src/hook_forward.rs`.

#[path = "../../src/hook_forward.rs"]
mod hook_forward;

fn main() {
    hook_forward::main();
}
