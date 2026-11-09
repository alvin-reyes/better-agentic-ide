//! `ade-hook`: run by Claude Code's `command` hooks inside ADE's terminals.
//! The logic, and its tests, live in `src-tauri/src/hook_forward.rs`.
//! Under the name `ade`, or as `ade-hook open|help|--help`, it is the
//! `ade open` CLI (`src-tauri/src/ade_cli.rs`). `ade_cli::dispatch` decides;
//! `src-tauri/ade-hook/tests/dispatch.rs` runs this binary to check it.

#[path = "../../src/hook_forward.rs"]
mod hook_forward;

#[path = "../../src/ade_cli.rs"]
mod ade_cli;

fn main() {
    let argv: Vec<std::ffi::OsString> = std::env::args_os().collect();
    match ade_cli::dispatch(argv) {
        ade_cli::Action::Cli(args) => std::process::exit(ade_cli::main(&args)),
        ade_cli::Action::Hook => hook_forward::main(),
    }
}
