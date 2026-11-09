//! `ade-hook`: run by Claude Code's `command` hooks inside ADE's terminals.
//! With no arguments it forwards agent-status events
//! (`src-tauri/src/hook_forward.rs`); `ade-hook guard [--headless]` is the
//! command guard's PreToolUse hook (`src-tauri/src/cli_guard/`), checked
//! first. Under the name `ade`, or as `ade-hook open|help|--help`, it is the
//! `ade open` CLI (`src-tauri/src/ade_cli.rs`). `ade_cli::dispatch` decides;
//! `src-tauri/ade-hook/tests/dispatch.rs` runs this binary to check it.

#[path = "../../src/hook_forward.rs"]
mod hook_forward;

#[path = "../../src/cli_guard/mod.rs"]
mod cli_guard;

#[path = "../../src/ade_cli.rs"]
mod ade_cli;

fn main() {
    let argv: Vec<std::ffi::OsString> = std::env::args_os().collect();
    let args: Vec<String> = argv.iter().skip(1).map(|a| a.to_string_lossy().into_owned()).collect();
    if args.first().map(String::as_str) == Some("guard") {
        cli_guard::main(args.iter().skip(1).any(|a| a == "--headless"));
        return;
    }
    match ade_cli::dispatch(argv) {
        ade_cli::Action::Cli(args) => std::process::exit(ade_cli::main(&args)),
        ade_cli::Action::Hook => hook_forward::main(),
    }
}
