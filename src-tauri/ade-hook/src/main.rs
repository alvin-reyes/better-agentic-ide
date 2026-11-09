//! `ade-hook`: run by Claude Code's `command` hooks inside ADE's terminals.
//! The logic, and its tests, live in `src-tauri/src/hook_forward.rs`.
//! Under the name `ade`, or as `ade-hook open|help|--help`, it is the
//! `ade open` CLI (`src-tauri/src/ade_cli.rs`).

#[path = "../../src/hook_forward.rs"]
mod hook_forward;

#[path = "../../src/ade_cli.rs"]
mod ade_cli;

fn main() {
    let mut argv = std::env::args_os().map(|a| a.to_string_lossy().into_owned());
    let argv0 = argv.next().unwrap_or_default();
    let args: Vec<String> = argv.collect();
    match ade_cli::mode(&argv0, &args) {
        ade_cli::Mode::Cli => std::process::exit(ade_cli::main(&args)),
        ade_cli::Mode::Hook => hook_forward::main(),
    }
}
