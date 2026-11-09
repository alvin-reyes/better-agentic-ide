//! `ade-hook`: run by Claude Code's `command` hooks inside ADE's terminals.
//! With no arguments it forwards agent-status events
//! (`src-tauri/src/hook_forward.rs`); `ade-hook guard [--headless]` is the
//! command guard's PreToolUse hook (`src-tauri/src/cli_guard/`).

#[path = "../../src/hook_forward.rs"]
mod hook_forward;

#[path = "../../src/cli_guard/mod.rs"]
mod cli_guard;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("guard") {
        cli_guard::main(args.iter().skip(1).any(|a| a == "--headless"));
    } else {
        hook_forward::main();
    }
}
