//! What `ade-hook` does with one Claude Code hook event: keep only the fields
//! ADE needs, hash the tool input with a key, find the Claude Code process it
//! runs under, and post that to ADE's endpoint. It always prints `{}` and
//! always exits 0, so it never changes what Claude Code does.
//!
//! This file is the `ade-hook` crate's logic and is also compiled into ADE as
//! a module, so ADE's `cargo test` covers it. It depends only on crates both
//! have: `serde`, `serde_json`, `hmac`, `sha2` and `sysinfo`. The contract is
//! `.ade/context/agent-events.md`.

// ADE compiles this file for its tests and for `ADE_VARS`; the helper uses
// all of it. What one side doesn't call is not dead.
#![allow(dead_code)]

use hmac::{Hmac, Mac};
use serde_json::{Map, Value};
use sha2::Sha256;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::Path;
use std::time::{Duration, Instant};

/// The four variables ADE sets in its terminals, in this order.
pub const ENV_BIN: &str = "ADE_HOOK_BIN";
pub const ENV_PORT: &str = "ADE_HOOK_PORT";
pub const ENV_TOKEN: &str = "ADE_HOOK_TOKEN";
pub const ENV_PTY: &str = "ADE_PTY_ID";
pub const ADE_VARS: [&str; 4] = [ENV_BIN, ENV_PORT, ENV_TOKEN, ENV_PTY];

/// Request headers carrying the token and the PTY id.
pub const HEADER_TOKEN: &str = "X-ADE-Token";
pub const HEADER_PTY: &str = "X-ADE-PTY";

/// The payload fields forwarded as they are. Anything else, the prompt,
/// `tool_input` and `tool_response` included, never leaves the helper.
pub const FORWARDED: &[&str] = &[
    "hook_event_name",
    "session_id",
    "cwd",
    "source",
    "reason",
    "notification_type",
    "tool_name",
    "agent_id",
    "agent_type",
];

/// The whole run: an event and the reply cost Claude Code at most this long.
pub const DEADLINE: Duration = Duration::from_secs(2);

/// How far up the parent chain Claude Code is looked for.
pub const MAX_LEVELS: usize = 5;

/// `value` as JSON with object keys sorted and no whitespace, so the same
/// input gives the same hash whatever order its keys arrived in.
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String((*key).clone()).to_string());
                out.push(':');
                write_canonical(&map[key.as_str()], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&other.to_string()),
    }
}

/// HMAC-SHA-256 of the tool input's canonical JSON, keyed with the token, as
/// lowercase hex. The key stops a short input being recovered from its hash.
pub fn input_hash(tool_input: &Value, key: &[u8]) -> String {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC takes a key of any length");
    mac.update(canonical_json(tool_input).as_bytes());
    mac.finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// The forwarded fields of a hook payload, plus `input_hash` when it carries
/// a `tool_input`. Only string values are kept.
pub fn forwarded(payload: &Value, key: &[u8]) -> Map<String, Value> {
    let mut out = Map::new();
    for name in FORWARDED {
        if let Some(Value::String(s)) = payload.get(*name) {
            out.insert((*name).to_string(), Value::String(s.clone()));
        }
    }
    if let Some(input) = payload.get("tool_input") {
        out.insert("input_hash".into(), Value::String(input_hash(input, key)));
    }
    out
}

/// A hook payload with only the forwarded fields and `tool_input` kept.
/// Every other value, a `tool_response` of any size included, is skipped as
/// it is read and never held.
struct Kept(Map<String, Value>);

impl<'de> serde::Deserialize<'de> for Kept {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Fields;
        impl<'de> serde::de::Visitor<'de> for Fields {
            type Value = Kept;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a hook payload object")
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(self, mut map: A) -> Result<Kept, A::Error> {
                let mut out = Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    if key == "tool_input" || FORWARDED.contains(&key.as_str()) {
                        let value = map.next_value::<Value>()?;
                        out.insert(key, value);
                    } else {
                        map.next_value::<serde::de::IgnoredAny>()?;
                    }
                }
                Ok(Kept(out))
            }
        }
        d.deserialize_map(Fields)
    }
}

/// Read a hook payload from `stdin` to its end, so Claude Code's write never
/// blocks, keeping only what `forwarded` uses. None when it isn't a JSON
/// object.
fn read_payload(stdin: impl Read) -> Option<Value> {
    use serde::Deserialize;
    let mut reader = std::io::BufReader::new(stdin);
    let kept = Kept::deserialize(&mut serde_json::Deserializer::from_reader(&mut reader));
    let _ = std::io::copy(&mut reader, &mut std::io::sink());
    kept.ok().map(|k| Value::Object(k.0))
}

/// What the helper knows of one process on the way up its parent chain.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProcInfo {
    pub ppid: Option<u32>,
    /// The kernel's name for it: on macOS the executable's file name, so the
    /// native install shows its version (`2.1.299`).
    pub name: String,
    pub exe: Option<std::path::PathBuf>,
    /// `argv`, `argv[0]` first.
    pub args: Vec<String>,
    /// Seconds since the epoch. With the pid, it names one process: a reused
    /// pid has another start time.
    pub start: u64,
}

fn base_name(s: &str) -> &str {
    Path::new(s).file_name().and_then(|n| n.to_str()).unwrap_or(s)
}

/// Whether a process is Claude Code: named `claude` (by the kernel or by
/// `argv[0]`); or an executable directly under a `claude/versions/` folder,
/// as the native installer lays it out; or `node` running a script called
/// `claude`, or `cli.js` from `@anthropic-ai/claude-code`.
pub fn is_claude(p: &ProcInfo) -> bool {
    if p.name == "claude" || p.args.first().is_some_and(|a| base_name(a) == "claude") {
        return true;
    }
    if let Some(exe) = &p.exe {
        let parent = exe.parent();
        let folder = parent.and_then(|d| d.file_name()).and_then(|n| n.to_str());
        let above = parent.and_then(|d| d.parent()).and_then(|d| d.file_name()).and_then(|n| n.to_str());
        if folder == Some("versions") && above == Some("claude") {
            return true;
        }
    }
    let exe_name = p.exe.as_deref().and_then(|e| e.file_name()).and_then(|n| n.to_str());
    let is_node = p.name == "node"
        || exe_name == Some("node")
        || p.args.first().is_some_and(|a| base_name(a) == "node");
    is_node
        && p.args.iter().skip(1).any(|a| {
            let a = a.replace('\\', "/");
            base_name(&a) == "claude" || (base_name(&a) == "cli.js" && a.contains("@anthropic-ai/claude-code/"))
        })
}

/// The pid and start time of the first process recognised as Claude Code,
/// starting at `from` (the helper's parent) and going up at most
/// `MAX_LEVELS` processes. Never scans the process table.
pub fn find_claude(from: u32, lookup: impl Fn(u32) -> Option<ProcInfo>) -> Option<(u32, u64)> {
    let mut pid = from;
    for _ in 0..MAX_LEVELS {
        if pid <= 1 {
            return None;
        }
        let info = lookup(pid)?;
        if is_claude(&info) {
            return Some((pid, info.start));
        }
        pid = info.ppid?;
    }
    None
}

/// One process, read from the OS (`proc_pidinfo` on macOS, `/proc` on Linux,
/// through sysinfo), refreshing only that pid.
pub fn process_info(pid: u32) -> Option<ProcInfo> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut sys = System::new();
    let target = Pid::from_u32(pid);
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[target]),
        false,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::Always).with_cmd(UpdateKind::Always),
    );
    let p = sys.process(target)?;
    Some(ProcInfo {
        ppid: p.parent().map(|pp| pp.as_u32()),
        name: p.name().to_string_lossy().into_owned(),
        exe: p.exe().map(|e| e.to_path_buf()),
        args: p.cmd().iter().map(|a| a.to_string_lossy().into_owned()).collect(),
        start: p.start_time(),
    })
}

/// A process's start time, or None once it has gone.
pub fn start_time(pid: u32) -> Option<u64> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    let target = Pid::from_u32(pid);
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[target]), false, ProcessRefreshKind::nothing());
    sys.process(target).map(|p| p.start_time())
}

/// Post `body` to ADE on `127.0.0.1:port`, giving up at `deadline`. The
/// answer is read only so the request completes; its content is ignored.
pub fn post(port: u16, pty: &str, token: &str, body: &str, deadline: Instant) -> std::io::Result<()> {
    let left = || deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(1));
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&addr, left())?;
    stream.set_write_timeout(Some(left()))?;
    let request = format!(
        "POST / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{HEADER_TOKEN}: {token}\r\n{HEADER_PTY}: {pty}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes())?;
    let mut buf = [0u8; 512];
    loop {
        if Instant::now() >= deadline {
            return Ok(());
        }
        stream.set_read_timeout(Some(left()))?;
        match stream.read(&mut buf) {
            Ok(0) => return Ok(()),
            Ok(_) => continue,
            Err(e) => return Err(e),
        }
    }
}

/// Forward one event, if ADE's variables are set. Every failure is silent.
pub fn forward(
    stdin: impl Read,
    var: impl Fn(&str) -> Option<String>,
    parent: u32,
    lookup: impl Fn(u32) -> Option<ProcInfo>,
    deadline: Instant,
) {
    let (Some(port), Some(token), Some(pty)) = (var(ENV_PORT), var(ENV_TOKEN), var(ENV_PTY)) else {
        return;
    };
    let Ok(port) = port.trim().parse::<u16>() else { return };
    if token.is_empty() || pty.parse::<u32>().is_err() {
        return;
    }
    let Some(payload) = read_payload(stdin) else { return };
    let mut body = forwarded(&payload, token.as_bytes());
    if let Some((pid, start)) = find_claude(parent, lookup) {
        body.insert("pid".into(), Value::from(pid));
        body.insert("pid_start".into(), Value::from(start));
    }
    let _ = post(port, &pty, &token, &Value::Object(body).to_string(), deadline);
}

/// The helper's whole run, apart from the process: forward the event, then
/// print `{}`. Returns the exit code, which is always 0.
pub fn run(
    stdin: impl Read,
    stdout: &mut impl Write,
    var: impl Fn(&str) -> Option<String>,
    parent: u32,
    lookup: impl Fn(u32) -> Option<ProcInfo>,
) -> i32 {
    let deadline = Instant::now() + DEADLINE;
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| forward(stdin, var, parent, lookup, deadline)));
    let _ = stdout.write_all(b"{}");
    let _ = stdout.flush();
    0
}

#[cfg(unix)]
fn parent_pid() -> u32 {
    std::os::unix::process::parent_id()
}

#[cfg(not(unix))]
fn parent_pid() -> u32 {
    process_info(std::process::id()).and_then(|p| p.ppid).unwrap_or(0)
}

/// The `ade-hook` executable.
pub fn main() {
    // A panic must not print anything: Claude Code would show it as a hook error.
    std::panic::set_hook(Box::new(|_| {}));
    let code = run(std::io::stdin().lock(), &mut std::io::stdout().lock(), |k| std::env::var(k).ok(), parent_pid(), process_info);
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::path::PathBuf;

    fn fixture(name: &str) -> Value {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/agent-events").join(name);
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap()
    }

    const KEY: &[u8] = b"a-test-token";

    #[test]
    fn forwards_only_the_listed_fields() {
        // A prompt, a tool's input and its output: none of them leaves.
        for name in ["user-prompt-submit.json", "post-tool-use.json", "stop.json", "subagent-stop.json", "notification-permission-prompt.json"] {
            let payload = fixture(name);
            let out = forwarded(&payload, KEY);
            for key in out.keys() {
                assert!(FORWARDED.contains(&key.as_str()) || key == "input_hash", "{name}: {key} forwarded");
            }
            let text = Value::Object(out).to_string();
            for secret in ["prompt", "tool_input", "tool_response", "last_assistant_message", "transcript_path", "message"] {
                assert!(!text.contains(&format!("\"{secret}\"")), "{name}: {secret} leaked");
            }
        }
        let prompt = fixture("user-prompt-submit.json");
        let text = Value::Object(forwarded(&prompt, KEY)).to_string();
        assert!(!text.contains(prompt["prompt"].as_str().unwrap()), "the prompt text never leaves");
        let post = fixture("post-tool-use.json");
        let text = Value::Object(forwarded(&post, KEY)).to_string();
        assert!(!text.contains("touch ade-one.txt"), "the command never leaves");
    }

    #[test]
    fn keeps_what_the_state_needs() {
        let sub = forwarded(&fixture("permission-request-subagent.json"), KEY);
        assert_eq!(sub["hook_event_name"], "PermissionRequest");
        assert_eq!(sub["tool_name"], "Bash");
        assert_eq!(sub["agent_id"], "a78efacac40010482");
        assert_eq!(sub["agent_type"], "general-purpose");
        assert!(sub["session_id"].as_str().is_some() && sub["cwd"].as_str().is_some());
        assert_eq!(forwarded(&fixture("session-start-clear.json"), KEY)["source"], "clear");
        assert_eq!(forwarded(&fixture("session-end-exit.json"), KEY)["reason"], "prompt_input_exit");
        assert_eq!(forwarded(&fixture("notification-idle-prompt.json"), KEY)["notification_type"], "idle_prompt");
        assert!(!forwarded(&fixture("stop.json"), KEY).contains_key("input_hash"));
    }

    #[test]
    fn a_calls_request_and_result_hash_the_same() {
        for (ask, done) in [
            ("permission-request.json", "post-tool-use.json"),
            ("permission-request-subagent.json", "post-tool-use-subagent.json"),
            ("permission-request-ask-mcp.json", "post-tool-use-ask-mcp.json"),
        ] {
            let a = forwarded(&fixture(ask), KEY);
            let b = forwarded(&fixture(done), KEY);
            assert_eq!(a["input_hash"], b["input_hash"], "{ask} / {done}");
        }
        let main = forwarded(&fixture("permission-request.json"), KEY);
        let sub = forwarded(&fixture("permission-request-subagent.json"), KEY);
        assert_ne!(main["input_hash"], sub["input_hash"]);
    }

    #[test]
    fn the_hash_is_keyed_and_ignores_key_order() {
        let a: Value = serde_json::from_str(r#"{"command":"git status","description":"x","n":[1,{"b":2,"a":1}]}"#).unwrap();
        let b: Value = serde_json::from_str(r#"{"n":[1,{"a":1,"b":2}],"description":"x","command":"git status"}"#).unwrap();
        assert_eq!(input_hash(&a, KEY), input_hash(&b, KEY));
        assert_ne!(input_hash(&a, KEY), input_hash(&a, b"another-token"));
        assert_eq!(canonical_json(&b), r#"{"command":"git status","description":"x","n":[1,{"a":1,"b":2}]}"#);
        // Not a plain hash of the input: without the key it can't be recomputed.
        use sha2::Digest;
        let plain: String = sha2::Sha256::digest(canonical_json(&a).as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
        assert_ne!(input_hash(&a, KEY), plain);
        assert_eq!(input_hash(&a, KEY).len(), 64);
    }

    fn proc(ppid: u32, name: &str, exe: &str, args: &[&str], start: u64) -> ProcInfo {
        ProcInfo {
            ppid: Some(ppid),
            name: name.into(),
            exe: Some(PathBuf::from(exe)),
            args: args.iter().map(|a| a.to_string()).collect(),
            start,
        }
    }

    /// The process shapes in `fixtures/agent-events/processes.json`: the
    /// native one as captured, the npm ones as their launchers lay them out.
    fn shapes() -> Value {
        fixture("processes.json")
    }

    fn shape(v: &Value) -> ProcInfo {
        ProcInfo {
            ppid: None,
            name: v["name"].as_str().unwrap().into(),
            exe: v["exe"].as_str().map(PathBuf::from),
            args: v["args"].as_array().unwrap().iter().map(|a| a.as_str().unwrap().to_string()).collect(),
            start: 0,
        }
    }

    #[test]
    fn recognises_the_recorded_installs() {
        let all = shapes();
        for name in ["native", "npm-global", "npx"] {
            assert!(is_claude(&shape(&all[name])), "{name}");
        }
        for name in ["shell", "other-node", "version-named-elsewhere"] {
            assert!(!is_claude(&shape(&all["not"][name])), "{name} is not Claude Code");
        }
    }

    #[test]
    fn finds_claude_under_a_wrapper_within_five_levels() {
        let native = shape(&shapes()["native"]);
        let table = |chain: Vec<(u32, ProcInfo)>| move |pid: u32| chain.iter().find(|(p, _)| *p == pid).map(|(_, i)| i.clone());
        // hook's parent is a shell Claude Code started, then Claude Code, then
        // `caffeinate`, then the user's shell.
        let chain = vec![
            (50, proc(40, "sh", "/bin/sh", &["/bin/sh", "-c", "\"${ADE_HOOK_BIN:-true}\""], 9)),
            (40, ProcInfo { ppid: Some(30), start: 1234, ..native.clone() }),
            (30, proc(20, "caffeinate", "/usr/bin/caffeinate", &["caffeinate", "claude"], 8)),
            (20, proc(1, "zsh", "/bin/zsh", &["-zsh"], 7)),
        ];
        assert_eq!(find_claude(50, table(chain)), Some((40, 1234)));
        let op = vec![
            (40, ProcInfo { ppid: Some(30), start: 77, ..native.clone() }),
            (30, proc(20, "op", "/opt/homebrew/bin/op", &["op", "run", "--", "claude"], 8)),
            (20, proc(1, "zsh", "/bin/zsh", &["-zsh"], 7)),
        ];
        assert_eq!(find_claude(40, table(op)), Some((40, 77)));
        // Six levels up is too far.
        let deep: Vec<(u32, ProcInfo)> = (0..6)
            .map(|i| (100 + i, proc(101 + i, "sh", "/bin/sh", &["sh"], 1)))
            .chain(std::iter::once((106, ProcInfo { ppid: Some(1), ..native.clone() })))
            .collect();
        assert_eq!(find_claude(100, table(deep)), None);
        // Nothing recognised: no pid.
        assert_eq!(find_claude(20, table(vec![(20, proc(1, "zsh", "/bin/zsh", &["-zsh"], 7))])), None);
    }

    #[test]
    fn reads_a_real_process() {
        let me = process_info(std::process::id()).expect("this process");
        assert!(me.start > 0);
        assert!(me.ppid.is_some());
        assert_eq!(start_time(std::process::id()), Some(me.start));
        assert_eq!(start_time(4_294_967_000), None);
    }

    fn env(port: u16) -> impl Fn(&str) -> Option<String> {
        move |k| match k {
            ENV_PORT => Some(port.to_string()),
            ENV_TOKEN => Some("tok".into()),
            ENV_PTY => Some("7".into()),
            ENV_BIN => Some("/x/ade-hook".into()),
            _ => None,
        }
    }

    fn no_procs(_: u32) -> Option<ProcInfo> {
        None
    }

    fn run_with(port: u16) -> (i32, String, Duration) {
        let payload = std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/agent-events/permission-request.json")).unwrap();
        let mut out = Vec::new();
        let started = Instant::now();
        let code = run(&payload[..], &mut out, env(port), 0, no_procs);
        (code, String::from_utf8(out).unwrap(), started.elapsed())
    }

    #[test]
    fn prints_empty_object_and_exits_zero_when_ade_is_down() {
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let (code, out, took) = run_with(port);
        assert_eq!((code, out.as_str()), (0, "{}"));
        assert!(took < Duration::from_millis(2500), "{took:?}");
    }

    #[test]
    fn gives_up_on_a_slow_ade_within_two_seconds() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // Accepts and never answers.
        let held = std::thread::spawn(move || listener.accept().map(|(s, _)| {
            std::thread::sleep(Duration::from_secs(3));
            drop(s)
        }));
        let (code, out, took) = run_with(port);
        assert_eq!((code, out.as_str()), (0, "{}"));
        assert!(took >= Duration::from_millis(1900) && took < Duration::from_millis(2600), "{took:?}");
        let _ = held.join();
    }

    #[test]
    fn sends_the_filtered_event_and_ignores_a_refusal() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut got = Vec::new();
            let mut buf = [0u8; 4096];
            while let Ok(n) = s.read(&mut buf) {
                if n == 0 {
                    break;
                }
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got);
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let len: usize = text[..head_end]
                        .lines()
                        .find_map(|l| l.strip_prefix("Content-Length: "))
                        .unwrap()
                        .parse()
                        .unwrap();
                    if got.len() >= head_end + 4 + len {
                        break;
                    }
                }
            }
            s.write_all(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\n\r\n{}").unwrap();
            String::from_utf8(got).unwrap()
        });
        let (code, out, _) = run_with(port);
        assert_eq!((code, out.as_str()), (0, "{}"));
        let request = server.join().unwrap();
        assert!(request.starts_with("POST / HTTP/1.1\r\n"));
        assert!(request.contains(&format!("Host: 127.0.0.1:{port}\r\n")));
        assert!(request.contains("X-ADE-Token: tok\r\n") && request.contains("X-ADE-PTY: 7\r\n"));
        let body: Value = serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(body["hook_event_name"], "PermissionRequest");
        assert!(body["input_hash"].as_str().is_some());
        assert!(body.get("tool_input").is_none() && body.get("pid").is_none());
    }

    /// Counts what is read through it.
    struct Counted<R> {
        inner: R,
        read: usize,
    }

    impl<R: Read> Read for Counted<R> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let n = self.inner.read(buf)?;
            self.read += n;
            Ok(n)
        }
    }

    /// Accept one request and return its body.
    fn one_body(listener: TcpListener) -> std::thread::JoinHandle<Value> {
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut got = Vec::new();
            let mut buf = [0u8; 4096];
            while let Ok(n) = s.read(&mut buf) {
                if n == 0 {
                    break;
                }
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got);
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let len: usize = text[..head_end].lines().find_map(|l| l.strip_prefix("Content-Length: ")).unwrap().parse().unwrap();
                    if got.len() >= head_end + 4 + len {
                        break;
                    }
                }
            }
            s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").unwrap();
            let text = String::from_utf8(got).unwrap();
            serde_json::from_str(text.split("\r\n\r\n").nth(1).unwrap()).unwrap()
        })
    }

    #[test]
    fn a_payload_over_four_megabytes_is_still_forwarded_and_drained() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = one_body(listener);
        let huge = 5 << 20;
        let head = br#"{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"cat big.log"},"tool_response":{"stdout":""#;
        let tail = br#"","nested":[1,{"a":[true,null]}]},"session_id":"s1","cwd":"/work"}"#;
        let mut stdin = Counted { inner: (&head[..]).chain(std::io::repeat(b'x').take(huge)).chain(&tail[..]), read: 0 };
        let mut out = Vec::new();
        assert_eq!(run(&mut stdin, &mut out, env(port), 0, no_procs), 0);
        assert_eq!(out, b"{}");
        assert_eq!(stdin.read, head.len() + huge as usize + tail.len(), "stdin is read to the end");
        let body = server.join().unwrap();
        assert_eq!(body["hook_event_name"], "PostToolUse");
        assert_eq!(body["session_id"], "s1", "a field after the huge value");
        assert_eq!(body["cwd"], "/work");
        let input: Value = serde_json::json!({"command":"cat big.log"});
        assert_eq!(body["input_hash"], input_hash(&input, b"tok"));
        assert!(body.get("tool_response").is_none());
    }

    #[test]
    fn does_nothing_outside_ade_or_on_bad_input() {
        let mut out = Vec::new();
        assert_eq!(run(&b"{}"[..], &mut out, |_| None, 0, no_procs), 0);
        assert_eq!(out, b"{}");
        let mut out = Vec::new();
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert_eq!(run(&b"not json"[..], &mut out, env(port), 0, no_procs), 0);
        assert_eq!(out, b"{}");
    }
}
