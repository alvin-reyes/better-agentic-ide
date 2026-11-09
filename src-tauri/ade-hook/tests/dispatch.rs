//! Runs the built `ade-hook` binary: the hook mode, the CLI under the `ade`
//! name and under its own, and the working folder it sends. `cargo test -p
//! ade-hook` runs these; the logic's own tests are in `src/ade_cli.rs`.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const BIN: &str = env!("CARGO_BIN_EXE_ade-hook");
const TOKEN: &str = "f00dfeedcafe0123456789abcdef0123456789abcdef0123456789abcdef0123";

/// A fresh, empty folder under the system temp folder.
fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ade-hook-it-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// The helper with none of ADE's variables, `args` after argv0.
fn helper(program: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args);
    for var in ["ADE_HOOK_BIN", "ADE_HOOK_PORT", "ADE_HOOK_TOKEN", "ADE_PTY_ID"] {
        cmd.env_remove(var);
    }
    cmd.stdin(Stdio::null());
    cmd
}

fn run(mut cmd: Command) -> Output {
    cmd.output().expect("the helper runs")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// A listener that answers one `/open` with 200 and sends the request down
/// the channel.
fn answer_once() -> (u16, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut got = Vec::new();
        let mut buf = [0u8; 1024];
        loop {
            let n = stream.read(&mut buf).unwrap_or(0);
            if n == 0 {
                break;
            }
            got.extend_from_slice(&buf[..n]);
            let text = String::from_utf8_lossy(&got);
            if let Some(end) = text.find("\r\n\r\n") {
                let length = text[..end]
                    .lines()
                    .find_map(|l| l.strip_prefix("Content-Length: "))
                    .and_then(|v| v.trim().parse::<usize>().ok())
                    .unwrap_or(0);
                if got.len() >= end + 4 + length {
                    break;
                }
            }
        }
        let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 24\r\n\r\n{\"ok\":true,\"typed\":true}");
        let _ = tx.send(String::from_utf8_lossy(&got).into_owned());
    });
    (port, rx)
}

/// `ade-hook open` in `dir`, with ADE's variables pointing at a listener and
/// `PWD` as given; the exit code, stderr and the body's `cwd`.
fn open_in(dir: &Path, pwd: Option<&str>) -> (Option<i32>, String, Option<String>) {
    let (port, rx) = answer_once();
    let mut cmd = helper(Path::new(BIN), &["open"]);
    cmd.current_dir(dir).env("ADE_HOOK_PORT", port.to_string()).env("ADE_HOOK_TOKEN", TOKEN).env("ADE_PTY_ID", "7");
    match pwd {
        Some(pwd) => cmd.env("PWD", pwd),
        None => cmd.env_remove("PWD"),
    };
    let out = run(cmd);
    let cwd = rx.recv_timeout(Duration::from_secs(5)).ok().map(|request| {
        let at = request.find("\r\n\r\n").unwrap();
        let body: serde_json::Value = serde_json::from_str(&request[at + 4..]).unwrap();
        body["cwd"].as_str().unwrap().to_string()
    });
    (out.status.code(), text(&out.stderr), cwd)
}

#[test]
fn hook_mode_prints_an_empty_object_and_exits_0() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/fixtures/agent-events/session-start.json");
    let payload = std::fs::read(&fixture).unwrap();
    let mut cmd = helper(Path::new(BIN), &[]);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().unwrap();
    child.stdin.take().unwrap().write_all(&payload).unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(out.status.code(), Some(0), "{}", text(&out.stderr));
    assert_eq!(text(&out.stdout).trim(), "{}");
}

#[cfg(unix)]
#[test]
fn under_the_ade_name_help_exits_0() {
    let dir = temp_dir("ade-name");
    let ade = dir.join("ade");
    std::os::unix::fs::symlink(BIN, &ade).unwrap();
    for verb in ["help", "--help"] {
        let out = run(helper(&ade, &[verb]));
        assert_eq!(out.status.code(), Some(0), "ade {verb}: {}", text(&out.stderr));
        assert!(text(&out.stdout).starts_with("usage: ade open"), "ade {verb}: {}", text(&out.stdout));
    }
    // And `ade` alone is a usage error, not the hook.
    let out = run(helper(&ade, &[]));
    assert_eq!(out.status.code(), Some(2), "{}", text(&out.stderr));
}

#[test]
fn ade_hook_open_without_ade_variables_exits_3() {
    let out = run(helper(Path::new(BIN), &["open"]));
    assert_eq!(out.status.code(), Some(3), "{}", text(&out.stderr));
    assert!(text(&out.stderr).starts_with("ade: ADE_HOOK_PORT is not set"), "{}", text(&out.stderr));
    assert!(out.stdout.is_empty());
}

#[test]
fn ade_hook_help_exits_0() {
    let out = run(helper(Path::new(BIN), &["help"]));
    assert_eq!(out.status.code(), Some(0), "{}", text(&out.stderr));
    assert!(text(&out.stdout).starts_with("usage: ade open"));
}

#[test]
fn the_token_is_in_the_environment_not_the_argv() {
    let dir = temp_dir("token");
    let (port, rx) = answer_once();
    let mut cmd = helper(Path::new(BIN), &["open", "--focus"]);
    cmd.current_dir(&dir).env("ADE_HOOK_PORT", port.to_string()).env("ADE_HOOK_TOKEN", TOKEN).env("ADE_PTY_ID", "7");
    // The argv the process gets, as built.
    let argv: Vec<String> = std::iter::once(cmd.get_program()).chain(cmd.get_args()).map(|a| a.to_string_lossy().into_owned()).collect();
    assert!(!argv.iter().any(|a| a.contains(TOKEN)), "{argv:?}");
    let out = run(cmd);
    assert_eq!(out.status.code(), Some(0), "{}", text(&out.stderr));
    let request = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(request.contains(&format!("\r\nX-ADE-Token: {TOKEN}\r\n")), "{request}");
    assert_eq!(request.matches(TOKEN).count(), 1, "{request}");
}

#[test]
fn without_cwd_the_body_cwd_is_pwd() {
    let dir = temp_dir("pwd");
    let logical = dir.to_str().unwrap().to_string();
    let (code, err, cwd) = open_in(&dir, Some(&logical));
    assert_eq!(code, Some(0), "{err}");
    assert_eq!(cwd.as_deref(), Some(logical.as_str()));
}

#[test]
fn a_spoofed_pwd_is_ignored() {
    let dir = temp_dir("spoof");
    let other = temp_dir("spoof-other");
    let physical = std::fs::canonicalize(&dir).unwrap().to_str().unwrap().to_string();
    for pwd in [Some(other.to_str().unwrap()), Some("/"), Some("relative"), Some("/no/such/folder"), None] {
        let (code, err, cwd) = open_in(&dir, pwd);
        assert_eq!(code, Some(0), "PWD={pwd:?}: {err}");
        assert_eq!(cwd.as_deref(), Some(physical.as_str()), "PWD={pwd:?}");
    }
}

#[cfg(unix)]
#[test]
fn a_pwd_through_a_symlink_is_kept() {
    let dir = temp_dir("link");
    std::fs::create_dir_all(dir.join("real")).unwrap();
    std::os::unix::fs::symlink(dir.join("real"), dir.join("link")).unwrap();
    let link = dir.join("link").to_str().unwrap().to_string();
    let (code, err, cwd) = open_in(&dir.join("real"), Some(&link));
    assert_eq!(code, Some(0), "{err}");
    assert_eq!(cwd.as_deref(), Some(link.as_str()));
}

#[cfg(unix)]
#[test]
fn a_deleted_current_folder_exits_2() {
    let dir = temp_dir("gone");
    // A shell that removes its own folder, then runs the helper there.
    let mut cmd = helper(Path::new("/bin/sh"), &["-c", "mkdir gone && cd gone && rmdir ../gone && exec \"$0\" open", BIN]);
    cmd.current_dir(&dir).env("ADE_HOOK_PORT", "1").env("ADE_HOOK_TOKEN", TOKEN).env("ADE_PTY_ID", "7");
    let out = run(cmd);
    assert_eq!(out.status.code(), Some(2), "{}", text(&out.stderr));
    assert_eq!(text(&out.stderr), "ade: the current folder is gone\n");
}
