//! Story 9, H1 to H3: the owner's flow end to end. A caller shell in a real
//! PTY made as `create_pty` makes one runs `ade open` (the CLI's own code,
//! in-process, with the caller's environment and no TTY) against the real
//! hook endpoint and `OpenService`. A test thread stands in for the window:
//! it receives `OpenMessage`, makes the sub-terminal through `create_pty`'s
//! core and answers as `terminal_open_done` does. Shells are
//! `bash --norc --noprofile -i` and `sh`, never the user's rc files.
//!
//! Not covered here (manual checks M1 to M5): a real shell expanding
//! `"$ADE_HOOK_BIN"`, the Tauri window, the frontend store, a real Claude
//! Code session.

use crate::agent_status::AgentStatus;
use crate::pty::{create_pty_core, NewPty, PtyManager};
use crate::ptysink::testing::Window;
use crate::terminal_open::{type_when_ready, Done, OpenMessage, OpenService, Ptys, RequestMessage};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

const BASH: [&str; 4] = ["bash", "--norc", "--noprofile", "-i"];

/// ADE as far as `/open` goes: the endpoint, the PTY table, the service.
struct Ade {
    agent: AgentStatus,
    ptys: Arc<PtyManager>,
    service: Arc<OpenService>,
    /// What the window was sent.
    got: Arc<Mutex<Vec<OpenMessage>>>,
    /// Kept alive: each terminal's output.
    windows: Arc<Mutex<Vec<Window>>>,
}

impl Ade {
    /// ADE with a window labelled `main` whose stand-in makes each requested
    /// sub-terminal with `sub_shell` and answers with `line`.
    fn start(sub_shell: &'static [&'static str], line: &'static str) -> Ade {
        let agent = AgentStatus::start(Ok(PathBuf::from("/Applications/ADE.app/Contents/MacOS/ade-hook")));
        let ptys = Arc::new(PtyManager::new());
        let service = Arc::new(OpenService::with(ptys.clone(), Arc::new(Instant::now), crate::terminal_open::ANSWER_WITHIN, false).with_shell("/bin/bash"));
        agent.set_open_handler(service.clone());
        let got = Arc::new(Mutex::new(Vec::new()));
        let windows = Arc::new(Mutex::new(Vec::new()));
        let (send, requests) = mpsc::channel::<RequestMessage>();
        let seen = got.clone();
        service.listen(
            "main",
            Arc::new(move |m: OpenMessage| {
                seen.lock().unwrap().push(m.clone());
                if let OpenMessage::Request { request } = m {
                    let _ = send.send(request);
                }
                true
            }),
        );
        // The window: create the terminal at once, then terminal_open_done.
        let (svc, table, agent2, kept) = (service.clone(), ptys.clone(), agent.clone(), windows.clone());
        std::thread::spawn(move || {
            for request in requests {
                let window = Window::new();
                let shell = (sub_shell[0].to_string(), sub_shell[1..].iter().map(|a| a.to_string()).collect());
                let new = NewPty { rows: 24, cols: 80, cwd: Some(request.cwd.clone()), request_id: Some(request.request_id), owner: "main", shell, vault: vec![] };
                let made = create_pty_core(&table, &agent2, new, window.out());
                kept.lock().unwrap().push(window);
                let done = match made {
                    Ok(pty) => Done { pty_id: Some(pty), line: request.command.as_ref().map(|_| line.to_string()), ..Default::default() },
                    Err(e) => Done { error: Some(e), ..Default::default() },
                };
                svc.done(request.request_id, done);
            }
        });
        Ade { agent, ptys, service, got, windows }
    }

    /// A caller terminal in `dir`, as `create_pty` makes one, at its prompt.
    fn caller(&self, dir: &Path) -> u32 {
        let window = Window::new();
        let shell = (BASH[0].to_string(), BASH[1..].iter().map(|a| a.to_string()).collect());
        let new = NewPty { rows: 24, cols: 80, cwd: Some(dir.to_string_lossy().into_owned()), request_id: None, owner: "main", shell, vault: vec![] };
        let id = create_pty_core(&self.ptys, &self.agent, new, window.out()).unwrap();
        self.windows.lock().unwrap().push(window);
        let deadline = Instant::now() + Duration::from_secs(10);
        type_when_ready(|| Ptys::line_editor_ready(&*self.ptys, id), &Instant::now, &std::thread::sleep, deadline).expect("the caller's prompt");
        id
    }

    /// Type `line` into terminal `id`, as the user would.
    fn type_into(&self, id: u32, line: &str) {
        assert!(Ptys::type_line(&*self.ptys, id, format!("{line}\r").into_bytes()), "terminal {id} is live");
    }

    /// The four `ADE_*` variables as the caller's shell sees them.
    fn caller_env(&self, caller: u32, dir: &Path) -> Vec<(&'static str, String)> {
        let file = dir.join("caller-env");
        self.type_into(caller, &format!("printf '%s\\n' \"$ADE_HOOK_PORT\" \"$ADE_HOOK_TOKEN\" \"$ADE_PTY_ID\" \"$ADE_HOOK_BIN\" > {}", file.display()));
        wait_for("the caller's variables", Duration::from_secs(10), || std::fs::read_to_string(&file).is_ok_and(|t| t.lines().count() == 4));
        let text = std::fs::read_to_string(&file).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines[2], caller.to_string(), "the caller's own ADE_PTY_ID");
        assert!(lines[3].ends_with("ade-hook"), "ADE_HOOK_BIN is the helper: {}", lines[3]);
        vec![("ADE_HOOK_PORT", lines[0].into()), ("ADE_HOOK_TOKEN", lines[1].into()), ("ADE_PTY_ID", lines[2].into())]
    }

    fn requests(&self) -> Vec<RequestMessage> {
        self.got.lock().unwrap().iter().filter_map(|m| if let OpenMessage::Request { request } = m { Some(request.clone()) } else { None }).collect()
    }
}

/// Every shell the test made ends with it, a failing assertion included.
impl Drop for Ade {
    fn drop(&mut self) {
        self.ptys.kill_all_for_test();
    }
}

/// `ade open ARGS` from the caller's folder with its variables, and no TTY.
fn ade_open(args: &[&str], dir: &Path, vars: Vec<(&'static str, String)>) -> (i32, String, String) {
    let args: Vec<OsString> = args.iter().map(OsString::from).collect();
    let env = crate::ade_cli::Env { pwd: Some(dir.as_os_str().to_owned()), here: Ok(dir.to_path_buf()), vars };
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = crate::ade_cli::run_with(&args, env, &mut out, &mut err, crate::ade_cli::DEADLINE);
    (code, String::from_utf8(out).unwrap(), String::from_utf8(err).unwrap())
}

fn wait_for(what: &str, limit: Duration, done: impl Fn() -> bool) {
    let deadline = Instant::now() + limit;
    while !done() {
        assert!(Instant::now() < deadline, "timed out after {limit:?} waiting for {what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// A fresh folder whose path needs no quoting.
fn folder(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ade-e2e-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("sub")).unwrap();
    dir.canonicalize().unwrap()
}

/// The caller is still a live shell: a line typed into it runs.
fn caller_keeps_running(ade: &Ade, caller: u32, dir: &Path) {
    assert!(Ptys::facts(&*ade.ptys, caller).is_some(), "the caller's PTY is live");
    let marker = dir.join("caller-after");
    ade.type_into(caller, &format!("touch {}", marker.display()));
    wait_for("the caller to run a line after the open", Duration::from_secs(10), || marker.exists());
}

/// Review finding m8: an e2e test that fails still ends every shell it made.
#[test]
fn e2e_a_failing_test_leaves_no_shell_behind() {
    let dir = folder("m8");
    let ptys = {
        let ade = Ade::start(&BASH, "true");
        let caller = ade.caller(&dir);
        let ptys = ade.ptys.clone();
        let failed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            let _ade = ade;
            panic!("an assertion fails");
        }));
        assert!(failed.is_err());
        assert!(Ptys::facts(&*ptys, caller).is_none(), "the caller's PTY was killed and forgotten");
        ptys
    };
    assert_eq!(ptys.live_for_test(), 0, "no PTY is left");
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn e2e_open_from_a_caller_adds_types_and_keeps_the_caller_running() {
    let dir = folder("h1");
    let ade = Ade::start(&BASH, "touch smoke-marker");
    let caller = ade.caller(&dir);
    let vars = ade.caller_env(caller, &dir);
    let sub = dir.join("sub");

    let (code, out, err) = ade_open(&["open", "--cwd", "sub", "--name", "smoke", "--", "touch", "smoke-marker"], &dir, vars);
    assert_eq!((code, out.as_str(), err.as_str()), (0, "", ""), "exit 0 with nothing printed");

    let [request] = ade.requests().try_into().unwrap_or_else(|r: Vec<_>| panic!("one request: {r:?}"));
    assert_eq!(request.caller_pty_id, caller);
    assert_eq!(request.cwd, sub.to_string_lossy());
    assert_eq!(request.name.as_deref(), Some("smoke"));
    assert_eq!(request.command, Some(vec!["touch".to_string(), "smoke-marker".into()]));
    let typed: Vec<_> = ade.got.lock().unwrap().iter().filter(|m| matches!(m, OpenMessage::Typed { .. })).cloned().collect();
    assert_eq!(typed, vec![OpenMessage::Typed { typed: request.request_id, ok: true, why: None }]);

    // The typed line ran in the new shell, in its folder.
    wait_for("the typed command's marker", Duration::from_secs(10), || sub.join("smoke-marker").exists());
    assert_eq!(Ptys::opened_count(&*ade.ptys), 1, "the sub-terminal is claimed");
    caller_keeps_running(&ade, caller, &dir);
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn e2e_a_shell_that_never_prompts_keeps_the_caller_running_and_exits_5() {
    let dir = folder("h2");
    let ade = Ade::start(&["sh", "-c", "exec sleep 30"], "touch never-marker");
    let caller = ade.caller(&dir);
    let vars = ade.caller_env(caller, &dir);

    let start = Instant::now();
    let (code, out, err) = ade_open(&["open", "--cwd", "sub", "--", "touch", "never-marker"], &dir, vars);
    let took = start.elapsed();
    assert_eq!(code, 5, "{err}");
    assert!(out.is_empty());
    assert_eq!(err, "ade: opened, but the command wasn't typed: the shell's line editor didn't start\n");
    assert!(took >= Duration::from_secs(5) && took < Duration::from_secs(11), "answered at {took:?}");
    assert!(!dir.join("sub/never-marker").exists(), "nothing was typed");
    caller_keeps_running(&ade, caller, &dir);
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn e2e_a_closed_caller_gets_exit_4_and_opens_nothing() {
    let dir = folder("h3");
    let ade = Ade::start(&BASH, "touch closed-marker");
    let caller = ade.caller(&dir);
    let vars = ade.caller_env(caller, &dir);
    ade.ptys.kill_for_test(caller);
    let next = Ptys::next_id(&*ade.ptys);

    let (code, out, err) = ade_open(&["open", "--", "touch", "closed-marker"], &dir, vars);
    assert_eq!(code, 4, "{err}");
    assert!(out.is_empty());
    assert!(err.starts_with("ade: the terminal you ran this from is gone"), "{err}");
    assert!(ade.got.lock().unwrap().is_empty(), "the window received no request");
    assert_eq!(Ptys::next_id(&*ade.ptys), next, "no PTY was created");
    let _ = &ade.service;
    std::fs::remove_dir_all(dir).ok();
}
