//! `ade open`: the CLI that asks ADE to open a sub-terminal in the caller's
//! tab. It is the `ade-hook` helper under a second name: `mode()` tells the
//! two apart. The contract is `.ade/context/terminal-open.md` ("The CLI",
//! "The request", "The answer").
//!
//! This file is compiled into the `ade-hook` binary and into ADE for its
//! tests, like `hook_forward.rs`. It uses only `std` and `serde_json`.

// ADE compiles this file only for its tests; the helper uses all of it.
#![allow(dead_code)]

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

const ENV_PORT: &str = "ADE_HOOK_PORT";
const ENV_TOKEN: &str = "ADE_HOOK_TOKEN";
const ENV_PTY: &str = "ADE_PTY_ID";
const HEADER_TOKEN: &str = "X-ADE-Token";
const HEADER_PTY: &str = "X-ADE-PTY";

/// The first arguments that make `ade-hook` the CLI under its own name.
pub const CLI_VERBS: [&str; 3] = ["open", "help", "--help"];

/// How long the CLI waits for ADE's answer. ADE answers within 11 s.
pub const DEADLINE: Duration = Duration::from_secs(15);

pub const USAGE: &str = "\
usage: ade open [--cwd DIR] [--split right|down] [--name NAME] [--focus] [-- COMMAND [ARG...]]
       ade help

  open      open a sub-terminal in the tab of the ADE terminal this runs in
    --cwd DIR       its folder (default: the current folder)
    --split DIR     open it as a pane to the right or below instead
    --name NAME     its name (not with --split)
    --focus         show and focus it
    -- COMMAND ...  type this command into it

exit codes: 0 opened, 1 ADE refused or didn't answer, 2 usage,
            3 not in an ADE terminal (ADE_HOOK_PORT, ADE_HOOK_TOKEN, ADE_PTY_ID),
            4 ADE or this terminal is gone
";

/// What the helper is in this run.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    /// `ade open`, `ade help`.
    Cli,
    /// Claude Code's hook: forward an event, print `{}`, exit 0.
    Hook,
}

/// Which mode `argv0` and the arguments after it select. Pure.
pub fn mode(argv0: &str, args: &[String]) -> Mode {
    let first = args.first().map(String::as_str);
    if first == Some("guard") {
        return Mode::Hook;
    }
    let base = argv0.rsplit(['/', '\\']).next().unwrap_or(argv0);
    if base == "ade" || base == "ade.exe" || first.is_some_and(|verb| CLI_VERBS.contains(&verb)) {
        Mode::Cli
    } else {
        Mode::Hook
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Split {
    Right,
    Down,
}

/// `ade open`'s flags, as given.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct OpenArgs {
    pub cwd: Option<String>,
    pub split: Option<Split>,
    pub name: Option<String>,
    pub focus: bool,
    pub command: Option<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    Help,
    Open(OpenArgs),
}

/// The CLI's arguments (the verb first), or a usage error's message.
pub fn parse(args: &[String]) -> Result<Command, String> {
    let open = match args.first().map(String::as_str) {
        None => return Err("no command given".into()),
        Some("help" | "--help") if args.len() == 1 => return Ok(Command::Help),
        Some("help" | "--help") => return Err("help takes no arguments".into()),
        Some("open") => {
            let mut open = OpenArgs::default();
            let mut rest = args[1..].iter();
            while let Some(arg) = rest.next() {
                let mut value = |flag: &str| rest.next().cloned().ok_or(format!("{flag} needs a value"));
                match arg.as_str() {
                    "--cwd" => open.cwd = Some(value("--cwd")?),
                    "--name" => open.name = Some(value("--name")?),
                    "--split" => {
                        open.split = Some(match value("--split")?.as_str() {
                            "right" => Split::Right,
                            "down" => Split::Down,
                            other => return Err(format!("--split takes right or down, not {other:?}")),
                        })
                    }
                    "--focus" => open.focus = true,
                    "--" => {
                        let words: Vec<String> = rest.by_ref().cloned().collect();
                        if words.is_empty() {
                            return Err("-- needs a command after it".into());
                        }
                        open.command = Some(words);
                    }
                    other => return Err(format!("unknown argument {other:?}")),
                }
            }
            open
        }
        Some(other) => return Err(format!("unknown command {other:?}")),
    };
    if open.name.is_some() && open.split.is_some() {
        return Err("--name can't be used with --split".into());
    }
    Ok(Command::Open(open))
}

/// `dir` joined to `pwd` when relative, with `.` and `..` removed lexically.
pub fn normalise(pwd: &str, dir: &str) -> String {
    let mut out = PathBuf::from("/");
    for part in Path::new(pwd).join(dir).components() {
        match part {
            Component::Normal(name) => out.push(name),
            Component::ParentDir => {
                out.pop();
            }
            Component::RootDir | Component::CurDir | Component::Prefix(_) => {}
        }
    }
    out.to_string_lossy().into_owned()
}

/// The folder to send: `--cwd` resolved against `pwd` and checked to be a
/// folder, or `pwd` itself.
pub fn resolve_cwd(pwd: &str, cwd: Option<&str>) -> Result<String, String> {
    let Some(dir) = cwd else { return Ok(pwd.to_string()) };
    let path = normalise(pwd, dir);
    match std::fs::metadata(&path) {
        Ok(meta) if meta.is_dir() => Ok(path),
        _ => Err("--cwd: no such folder".into()),
    }
}

/// The request body: exactly the contract's five fields.
pub fn body(cwd: &str, open: &OpenArgs) -> Value {
    json!({
        "cwd": cwd,
        "command": open.command,
        "split": open.split.map(|s| match s {
            Split::Right => "right",
            Split::Down => "down",
        }),
        "name": open.name,
        "focus": open.focus,
    })
}

/// ADE's variables in this terminal, or the message naming the one that is
/// unset or malformed.
fn ade_vars(var: impl Fn(&str) -> Option<String>) -> Result<(u16, String, u32), String> {
    let get = |name: &str| var(name).ok_or(format!("{name} is not set; run this in an ADE terminal"));
    let bad = |name: &str| format!("{name} is malformed; run this in an ADE terminal");
    let port = get(ENV_PORT)?.trim().parse::<u16>().map_err(|_| bad(ENV_PORT))?;
    let token = get(ENV_TOKEN)?;
    if token.is_empty() {
        return Err(bad(ENV_TOKEN));
    }
    let pty = get(ENV_PTY)?.trim().parse::<u32>().map_err(|_| bad(ENV_PTY))?;
    Ok((port, token, pty))
}

/// Why no answer came back.
#[derive(Debug)]
enum Failure {
    Refused,
    NoAnswer,
}

/// `POST /open` to ADE, and its status and body, giving up after `timeout`.
fn post_open(port: u16, pty: u32, token: &str, body: &str, timeout: Duration) -> Result<(u16, Vec<u8>), Failure> {
    let deadline = Instant::now() + timeout;
    let left = || deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(1));
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = match TcpStream::connect_timeout(&addr, left()) {
        Ok(stream) => stream,
        Err(e) if e.kind() == std::io::ErrorKind::ConnectionRefused => return Err(Failure::Refused),
        Err(_) => return Err(Failure::NoAnswer),
    };
    let request = format!(
        "POST /open HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{HEADER_TOKEN}: {token}\r\n{HEADER_PTY}: {pty}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.set_write_timeout(Some(left()));
    stream.write_all(request.as_bytes()).map_err(|_| Failure::NoAnswer)?;
    let mut got = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        if let Some(answer) = parse_answer(&got) {
            return Ok(answer);
        }
        if Instant::now() >= deadline {
            return Err(Failure::NoAnswer);
        }
        let _ = stream.set_read_timeout(Some(left()));
        match stream.read(&mut buf) {
            Ok(0) => return parse_answer_at_end(&got).ok_or(Failure::NoAnswer),
            Ok(n) => got.extend_from_slice(&buf[..n]),
            Err(_) => return Err(Failure::NoAnswer),
        }
    }
}

/// The status and body of a complete answer with a `Content-Length`.
fn parse_answer(got: &[u8]) -> Option<(u16, Vec<u8>)> {
    let end = got.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = String::from_utf8_lossy(&got[..end]);
    let status = head.split(' ').nth(1)?.parse::<u16>().ok()?;
    let length = head.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(|| value.trim().parse::<usize>().ok()).flatten()
    })?;
    let body = got.get(end + 4..end + 4 + length)?;
    Some((status, body.to_vec()))
}

/// The status and body of an answer that ended with the connection.
fn parse_answer_at_end(got: &[u8]) -> Option<(u16, Vec<u8>)> {
    let end = got.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = String::from_utf8_lossy(&got[..end]);
    let status = head.split(' ').nth(1)?.parse::<u16>().ok()?;
    Some((status, got[end + 4..].to_vec()))
}

const GONE_HINT: &str = "if this shell runs in tmux or screen, it may have outlived the ADE terminal that started it";

/// The exit code and message for ADE's answer, or for its absence.
fn outcome(answer: Result<(u16, Vec<u8>), Failure>) -> (i32, Option<String>) {
    let (status, body) = match answer {
        Ok(answer) => answer,
        Err(Failure::Refused) => return (4, Some(format!("ADE isn't listening on {ENV_PORT}; {GONE_HINT}"))),
        Err(Failure::NoAnswer) => return (1, Some("ADE didn't answer in 15 s; nothing was opened".into())),
    };
    let error = serde_json::from_slice::<Value>(&body).ok().and_then(|v| v.get("error").and_then(Value::as_str).map(String::from));
    match status {
        200 => (0, None),
        401 => (4, Some(format!("ADE didn't accept this terminal's token; {GONE_HINT}"))),
        410 => {
            let message = error.unwrap_or_else(|| "the terminal you ran this from is gone".into());
            (4, Some(format!("{message}; {GONE_HINT}")))
        }
        400 if error.is_none() => (1, Some("this ADE is too old for ade open; restart ADE".into())),
        _ => (1, Some(error.unwrap_or_else(|| format!("ADE answered {status}; nothing was opened")))),
    }
}

/// The CLI's whole run apart from the process. `args` starts at the verb.
pub fn run(
    args: &[String],
    var: impl Fn(&str) -> Option<String>,
    pwd: &str,
    out: &mut impl Write,
    err: &mut impl Write,
    timeout: Duration,
) -> i32 {
    let mut fail = |code: i32, message: &str, usage: bool| {
        let _ = writeln!(err, "ade: {message}");
        if usage {
            let _ = err.write_all(USAGE.as_bytes());
        }
        code
    };
    let open = match parse(args) {
        Ok(Command::Help) => {
            let _ = out.write_all(USAGE.as_bytes());
            return 0;
        }
        Ok(Command::Open(open)) => open,
        Err(message) => return fail(2, &message, true),
    };
    let cwd = match resolve_cwd(pwd, open.cwd.as_deref()) {
        Ok(cwd) => cwd,
        Err(message) => return fail(2, &message, false),
    };
    let (port, token, pty) = match ade_vars(var) {
        Ok(vars) => vars,
        Err(message) => return fail(3, &message, false),
    };
    let request = body(&cwd, &open).to_string();
    match outcome(post_open(port, pty, &token, &request, timeout)) {
        (code, Some(message)) => fail(code, &message, false),
        (code, None) => code,
    }
}

/// The working folder: `$PWD` when it names the current folder (so a path
/// through a symlink stays as the user typed it), or the current folder.
fn working_folder() -> String {
    let here = std::env::current_dir().ok();
    if let (Ok(pwd), Some(here)) = (std::env::var("PWD"), &here) {
        let same = Path::new(&pwd).is_absolute()
            && std::fs::canonicalize(&pwd).ok() == std::fs::canonicalize(here).ok();
        if same {
            return pwd;
        }
    }
    here.map(|h| h.to_string_lossy().into_owned()).unwrap_or_else(|| "/".into())
}

/// The CLI as a process: `args` starts at the verb. Returns the exit code.
pub fn main(args: &[String]) -> i32 {
    run(args, |k| std::env::var(k).ok(), &working_folder(), &mut std::io::stdout().lock(), &mut std::io::stderr().lock(), DEADLINE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::mpsc;

    fn s(words: &[&str]) -> Vec<String> {
        words.iter().map(|w| w.to_string()).collect()
    }

    // ---- C1: mode ----

    #[test]
    fn ade_and_ade_exe_are_the_cli() {
        for argv0 in ["ade", "ade.exe"] {
            assert_eq!(mode(argv0, &[]), Mode::Cli, "{argv0}");
            assert_eq!(mode(argv0, &s(&["open"])), Mode::Cli, "{argv0} open");
            assert_eq!(mode(argv0, &s(&["--whatever"])), Mode::Cli, "{argv0} --whatever");
        }
    }

    #[test]
    fn open_help_and_dash_help_are_the_cli() {
        for verb in ["open", "help", "--help"] {
            assert_eq!(mode("ade-hook", &s(&[verb])), Mode::Cli, "{verb}");
            assert_eq!(mode("/x/ade-hook", &s(&[verb, "--focus"])), Mode::Cli, "{verb}");
        }
    }

    #[test]
    fn no_arguments_under_the_hook_name_are_the_hook() {
        assert_eq!(mode("ade-hook", &[]), Mode::Hook);
        assert_eq!(mode("/Applications/ADE.app/Contents/MacOS/ade-hook", &[]), Mode::Hook);
        assert_eq!(mode("ade-hook", &s(&["frob"])), Mode::Hook);
    }

    #[test]
    fn guard_is_never_the_cli() {
        for argv0 in ["ade-hook", "ade", "ade.exe", "/a/bin/release/ade"] {
            assert_eq!(mode(argv0, &s(&["guard"])), Mode::Hook, "{argv0} guard");
            assert_eq!(mode(argv0, &s(&["guard", "--headless"])), Mode::Hook, "{argv0} guard --headless");
        }
    }

    #[test]
    fn the_basename_of_argv0_decides() {
        assert_eq!(mode("/Users/x/Library/Application Support/ade/bin/release/ade", &[]), Mode::Cli);
        assert_eq!(mode("C:\\Program Files\\ADE\\bin\\ade.exe", &[]), Mode::Cli);
        assert_eq!(mode("./ade", &[]), Mode::Cli);
        assert_eq!(mode("/usr/local/ade/ade-hook", &[]), Mode::Hook);
        assert_eq!(mode("/ade/bin/made", &[]), Mode::Hook);
        assert_eq!(mode("ade-x", &[]), Mode::Hook);
    }

    #[test]
    fn an_unknown_verb_under_ade_is_still_the_cli() {
        assert_eq!(mode("ade", &s(&["frob"])), Mode::Cli);
        assert_eq!(mode("/bin/release/ade", &s(&["frob"])), Mode::Cli);
    }

    // ---- C6: the hook mode ----

    #[test]
    fn the_hook_mode_is_what_ade_hook_did_before() {
        assert_eq!(mode("ade-hook", &[]), Mode::Hook);
        let main_rs = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("ade-hook/src/main.rs")).unwrap();
        assert_eq!(main_rs.matches("hook_forward::main()").count(), 1, "one call to the hook");
        assert!(main_rs.contains("Mode::Hook => hook_forward::main()"), "only the Hook arm reaches hook_forward::main");
        assert!(main_rs.contains("Mode::Cli => std::process::exit(ade_cli::main("), "the Cli arm runs the CLI");
    }

    // ---- C5: usage ----

    #[test]
    fn help_prints_usage_and_exits_0() {
        for verb in ["help", "--help"] {
            let (code, out, err, _) = cli(&[verb], 1, "/");
            assert_eq!(code, 0, "{verb}");
            assert!(out.contains("ade open"), "{verb}: usage names open: {out}");
            for flag in ["--cwd", "--split", "--name", "--focus"] {
                assert!(out.contains(flag), "{verb}: usage lists {flag}");
            }
            assert!(err.is_empty(), "{verb}: {err}");
        }
        // Help needs no ADE variables.
        let (code, _, _, _) = cli_env(&["help"], |_| None, "/", None);
        assert_eq!(code, 0);
    }

    #[test]
    fn an_unknown_verb_is_usage_2() {
        for args in [&["frob"][..], &[][..], &["open", "--frob"][..], &["open", "extra"][..]] {
            let (code, out, err, _) = cli(args, 1, "/");
            assert_eq!(code, 2, "{args:?}");
            assert!(out.is_empty(), "{args:?}: nothing on stdout");
            assert!(err.contains("usage: ade open"), "{args:?}: usage on stderr: {err}");
        }
    }

    #[test]
    fn name_with_split_is_usage_2_and_sends_nothing() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        listener.set_nonblocking(true).unwrap();
        let tmp = temp_dir("name-split");
        let (code, _, err, _) = cli(&["open", "--split", "right", "--name", "api"], port, &tmp);
        assert_eq!(code, 2);
        assert!(err.contains("ade: --name can't be used with --split"), "{err}");
        assert!(listener.accept().is_err(), "no connection was made");
        assert_eq!(parse(&s(&["open", "--name", "a", "--split", "down"])), Err("--name can't be used with --split".into()));
    }

    #[test]
    fn a_split_value_other_than_right_or_down_is_usage_2() {
        let (code, _, err, _) = cli(&["open", "--split", "left"], 1, "/");
        assert_eq!(code, 2);
        assert!(err.starts_with("ade: "), "{err}");
        assert_eq!(parse(&s(&["open", "--split", "right"])).unwrap(), Command::Open(OpenArgs { split: Some(Split::Right), ..Default::default() }));
        assert_eq!(parse(&s(&["open", "--split", "down"])).unwrap(), Command::Open(OpenArgs { split: Some(Split::Down), ..Default::default() }));
    }

    #[test]
    fn a_flag_missing_its_value_is_usage_2() {
        for args in [&["open", "--name"][..], &["open", "--cwd"][..], &["open", "--split"][..], &["open", "--focus=yes"][..], &["open", "--"][..]] {
            let (code, _, err, _) = cli(args, 1, "/");
            assert_eq!(code, 2, "{args:?}");
            assert!(err.starts_with("ade: "), "{args:?}: {err}");
        }
        assert_eq!(
            parse(&s(&["open", "--focus", "--name", "api", "--cwd", "x", "--", "npm", "run", "dev"])).unwrap(),
            Command::Open(OpenArgs {
                cwd: Some("x".into()),
                split: None,
                name: Some("api".into()),
                focus: true,
                command: Some(s(&["npm", "run", "dev"])),
            })
        );
    }

    // ---- C3: --cwd ----

    #[test]
    fn cwd_joins_pwd_and_normalises_lexically() {
        assert_eq!(normalise("/a/b", "../x/./y"), "/a/x/y");
        assert_eq!(normalise("/a/b", "/abs/./p/../q"), "/abs/q");
        assert_eq!(normalise("/a", "../../.."), "/");
        assert_eq!(normalise("/a/b/", "."), "/a/b");
        // A real folder for the stat: PWD is <tmp>/a/b, --cwd ../x/./y is <tmp>/a/x/y.
        let tmp = temp_dir("cwd-join");
        std::fs::create_dir_all(format!("{tmp}/a/b")).unwrap();
        std::fs::create_dir_all(format!("{tmp}/a/x/y")).unwrap();
        assert_eq!(resolve_cwd(&format!("{tmp}/a/b"), Some("../x/./y")), Ok(format!("{tmp}/a/x/y")));
        // The logical path is sent, not the physical one: through a symlink.
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(format!("{tmp}/a/x"), format!("{tmp}/link")).unwrap();
            assert_eq!(resolve_cwd(&tmp, Some("link/y")), Ok(format!("{tmp}/link/y")));
        }
        // And through the whole CLI.
        let (port, rx) = answer_once("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 24\r\n\r\n{\"ok\":true,\"typed\":true}");
        let (code, _, err, _) = cli(&["open", "--cwd", "../x/./y"], port, &format!("{tmp}/a/b"));
        assert_eq!(code, 0, "{err}");
        assert_eq!(request_body(&rx.recv().unwrap())["cwd"], format!("{tmp}/a/x/y"));
    }

    #[test]
    fn a_missing_cwd_folder_is_usage_2() {
        let tmp = temp_dir("cwd-missing");
        std::fs::write(format!("{tmp}/file"), "x").unwrap();
        for dir in ["nope", "file"] {
            let (code, _, err, _) = cli(&["open", "--cwd", dir], 1, &tmp);
            assert_eq!(code, 2, "{dir}");
            assert_eq!(err.trim_end(), "ade: --cwd: no such folder", "{dir}");
        }
    }

    #[test]
    fn without_cwd_the_pwd_is_sent() {
        let tmp = temp_dir("cwd-pwd");
        let (port, rx) = answer_once("HTTP/1.1 200 OK\r\nContent-Length: 24\r\n\r\n{\"ok\":true,\"typed\":true}");
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 0, "{err}");
        assert_eq!(request_body(&rx.recv().unwrap())["cwd"], tmp);
    }

    // ---- C4: the request ----

    #[test]
    fn the_body_has_exactly_the_contract_fields() {
        let tmp = temp_dir("body");
        let (port, rx) = answer_once("HTTP/1.1 200 OK\r\nContent-Length: 24\r\n\r\n{\"ok\":true,\"typed\":true}");
        let (code, _, err, _) = cli(&["open", "--name", "api", "--focus"], port, &tmp);
        assert_eq!(code, 0, "{err}");
        let request = rx.recv().unwrap();
        assert!(request.starts_with("POST /open HTTP/1.1\r\n"), "{request}");
        assert!(request.contains(&format!("\r\nHost: 127.0.0.1:{port}\r\n")), "{request}");
        assert!(request.contains("\r\nContent-Type: application/json\r\n"), "{request}");
        assert!(request.contains("\r\nX-ADE-PTY: 7\r\n"), "{request}");
        assert_eq!(request_body(&request), json!({"cwd": tmp, "command": null, "split": null, "name": "api", "focus": true}));
        // The builder, for the fields the endpoint refuses today.
        let open = OpenArgs { split: Some(Split::Down), command: Some(s(&["npm", "test"])), ..Default::default() };
        assert_eq!(body("/w", &open), json!({"cwd": "/w", "command": ["npm", "test"], "split": "down", "name": null, "focus": false}));
        assert_eq!(body("/w", &OpenArgs::default()).as_object().unwrap().len(), 5);
    }

    #[test]
    fn the_token_comes_from_the_environment_only() {
        let tmp = temp_dir("token");
        let token = "f00dfeedcafe0123456789abcdef0123456789abcdef0123456789abcdef0123";
        let args = s(&["open", "--focus"]);
        assert!(!args.iter().any(|a| a.contains(token)), "the argv carries no token");
        let (port, rx) = answer_once("HTTP/1.1 200 OK\r\nContent-Length: 24\r\n\r\n{\"ok\":true,\"typed\":true}");
        let env = vec![(ENV_PORT, port.to_string()), (ENV_TOKEN, token.to_string()), (ENV_PTY, "7".to_string())];
        let (code, _, err, _) = cli_env(&["open", "--focus"], |k| env.iter().find(|(n, _)| *n == k).map(|(_, v)| v.clone()), &tmp, None);
        assert_eq!(code, 0, "{err}");
        assert!(rx.recv().unwrap().contains(&format!("\r\nX-ADE-Token: {token}\r\n")));
        // No flag takes a token.
        assert!(!USAGE.to_lowercase().contains("token "), "no --token flag");
        assert_eq!(cli(&["open", "--token", token], 1, &tmp).0, 2);
    }

    #[test]
    fn split_and_command_come_back_422_not_supported_yet_and_exit_1() {
        let tmp = temp_dir("422");
        for (args, message) in [
            (&["open", "--split", "right"][..], "--split is not supported yet"),
            (&["open", "--", "npm", "run", "dev"][..], "a command is not supported yet; open the terminal and type it"),
        ] {
            let (port, rx) = answer_once(&http(422, &json!({ "error": message }).to_string()));
            let (code, out, err, _) = cli(args, port, &tmp);
            assert_eq!(code, 1, "{args:?}");
            assert!(out.is_empty());
            assert_eq!(err.trim_end(), format!("ade: {message}"), "{args:?}");
            let sent = request_body(&rx.recv().unwrap());
            assert!(sent["split"] == "right" || sent["command"] == json!(["npm", "run", "dev"]), "{sent}");
        }
    }

    // ---- C2: exit codes ----

    #[test]
    fn exit_0_when_opened() {
        let tmp = temp_dir("exit0");
        let (port, rx) = answer_once("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 24\r\n\r\n{\"ok\":true,\"typed\":true}");
        let (code, out, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 0, "{err}");
        assert!(out.is_empty() && err.is_empty(), "nothing printed: {out:?} {err:?}");
        rx.recv().unwrap();
    }

    #[test]
    fn exit_1_for_an_old_ade_that_answers_400_with_empty_object() {
        let tmp = temp_dir("exit1-old");
        let (port, _rx) = answer_once(&http(400, "{}"));
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 1);
        assert_eq!(err.trim_end(), "ade: this ADE is too old for ade open; restart ADE");
    }

    #[test]
    fn exit_1_for_422_with_its_message() {
        let tmp = temp_dir("exit1-422");
        for status in [400, 404, 409, 422, 429] {
            let (port, _rx) = answer_once(&http(status, r#"{"error":"the folder is not a folder"}"#));
            let (code, _, err, _) = cli(&["open"], port, &tmp);
            assert_eq!(code, 1, "{status}");
            assert_eq!(err.trim_end(), "ade: the folder is not a folder", "{status}");
        }
        // A 404 `{}` from screen() still says something.
        let (port, _rx) = answer_once(&http(404, "{}"));
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 1);
        assert!(err.starts_with("ade: ") && err.trim_end().len() > 5, "{err}");
    }

    #[test]
    fn exit_1_for_504_with_its_message() {
        let tmp = temp_dir("exit1-504");
        let (port, _rx) = answer_once(&http(504, r#"{"error":"ADE didn't answer; no terminal was opened"}"#));
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 1);
        assert_eq!(err.trim_end(), "ade: ADE didn't answer; no terminal was opened");
    }

    #[test]
    fn exit_1_when_no_answer_before_the_deadline() {
        let tmp = temp_dir("exit1-silent");
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (hold_tx, hold_rx) = mpsc::channel::<()>();
        std::thread::spawn(move || {
            let (_stream, _) = listener.accept().unwrap();
            let _ = hold_rx.recv(); // keep the connection open, say nothing
        });
        let started = Instant::now();
        let (code, _, err, _) = cli_env(&["open"], env_fn(port), &tmp, Some(Duration::from_millis(200)));
        drop(hold_tx);
        assert_eq!(code, 1);
        assert!(err.starts_with("ade: ") && err.trim_end().len() > 5, "{err}");
        assert!(started.elapsed() < Duration::from_secs(5), "the injected deadline is used");
    }

    #[test]
    fn exit_2_for_usage() {
        assert_eq!(cli(&["frob"], 1, "/").0, 2);
        assert_eq!(cli(&["open", "--split", "up"], 1, "/").0, 2);
        // Usage is checked before the variables.
        assert_eq!(cli_env(&["open", "--frob"], |_| None, "/", None).0, 2);
    }

    #[test]
    fn exit_3_for_an_unset_or_malformed_variable() {
        let tmp = temp_dir("exit3");
        for (var, value) in [
            (ENV_PORT, None),
            (ENV_PORT, Some("abc")),
            (ENV_PORT, Some("70000")),
            (ENV_TOKEN, None),
            (ENV_TOKEN, Some("")),
            (ENV_PTY, None),
            (ENV_PTY, Some("x7")),
        ] {
            let env = |k: &str| -> Option<String> {
                if k == var {
                    value.map(String::from)
                } else {
                    env_fn(1)(k)
                }
            };
            let (code, out, err, _) = cli_env(&["open"], env, &tmp, None);
            assert_eq!(code, 3, "{var}={value:?}");
            assert!(out.is_empty());
            assert!(err.starts_with("ade: ") && err.contains(var), "{var}={value:?}: {err}");
        }
    }

    #[test]
    fn exit_4_when_connection_is_refused() {
        let tmp = temp_dir("exit4-refused");
        let port = {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 4, "{err}");
        assert!(err.starts_with("ade: ") && err.contains("tmux") && err.contains("screen"), "{err}");
    }

    #[test]
    fn exit_4_for_401() {
        let tmp = temp_dir("exit4-401");
        let (port, _rx) = answer_once(&http(401, "{}"));
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 4);
        assert!(err.starts_with("ade: ") && err.contains("tmux") && err.contains("screen"), "{err}");
    }

    #[test]
    fn exit_4_for_410_this_terminal_has_closed() {
        let tmp = temp_dir("exit4-410");
        let (port, _rx) = answer_once(&http(410, r#"{"error":"the terminal you ran this from is gone"}"#));
        let (code, _, err, _) = cli(&["open"], port, &tmp);
        assert_eq!(code, 4);
        assert!(err.starts_with("ade: the terminal you ran this from is gone"), "{err}");
        assert!(err.contains("tmux") && err.contains("screen"), "{err}");
    }

    // ---- helpers ----

    fn env_fn(port: u16) -> impl Fn(&str) -> Option<String> {
        move |k: &str| match k {
            ENV_PORT => Some(port.to_string()),
            ENV_TOKEN => Some("a-test-token".to_string()),
            ENV_PTY => Some("7".to_string()),
            _ => None,
        }
    }

    /// Run the CLI with ADE's variables pointing at `port`.
    fn cli(args: &[&str], port: u16, pwd: &str) -> (i32, String, String, ()) {
        cli_env(args, env_fn(port), pwd, None)
    }

    fn cli_env(args: &[&str], var: impl Fn(&str) -> Option<String>, pwd: &str, timeout: Option<Duration>) -> (i32, String, String, ()) {
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let code = run(&s(args), var, pwd, &mut out, &mut err, timeout.unwrap_or(Duration::from_secs(5)));
        (code, String::from_utf8(out).unwrap(), String::from_utf8(err).unwrap(), ())
    }

    fn http(status: u16, body: &str) -> String {
        format!("HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}", body.len())
    }

    /// A listener that answers one request with `answer` and sends the
    /// request it read down the channel.
    fn answer_once(answer: &str) -> (u16, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let answer = answer.to_string();
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
            let _ = stream.write_all(answer.as_bytes());
            let _ = tx.send(String::from_utf8_lossy(&got).into_owned());
        });
        (port, rx)
    }

    fn request_body(request: &str) -> Value {
        let at = request.find("\r\n\r\n").expect("a request with a body");
        serde_json::from_str(&request[at + 4..]).expect("a JSON body")
    }

    /// A fresh, empty folder under the system temp folder, as a string.
    fn temp_dir(tag: &str) -> String {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ade-cli-{}-{tag}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // The logical path the test passes as PWD; on macOS /var is a symlink, which is fine.
        dir.to_str().unwrap().trim_end_matches('/').to_string()
    }
}
