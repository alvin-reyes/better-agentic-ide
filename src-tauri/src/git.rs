//! Running git without taking its optional locks, and never for longer than
//! a fixed limit. The slop check and the switch use this. `sync.rs`,
//! `usage.rs` and `projectsetup.rs` still call git directly.

use std::path::Path;
use std::process::{Child, Command, Output, Stdio};
use std::time::{Duration, Instant};

/// How long one git command may run. Every caller asks while a person waits,
/// and the switch asks under the lock that holds every setup back; a
/// repository on a network drive that has gone away would otherwise hold
/// them for as long as it likes.
const LIMIT: Duration = Duration::from_secs(10);

/// The program to run. Callers pass it on, so a test can name one that doesn't
/// exist and see what a machine without git sees.
pub(crate) const GIT: &str = "git";

/// `--no-optional-locks` first: `git status` otherwise refreshes the index and
/// takes `index.lock`, which fails the commit of an agent running beside ADE.
fn arguments<'a>(args: &[&'a str]) -> Vec<&'a str> {
    let mut all = vec!["--no-optional-locks"];
    all.extend_from_slice(args);
    all
}

#[cfg(test)]
thread_local! {
    /// What this thread has asked git, in order, whether or not git answered.
    /// A test of a caller reads it to see which questions were asked; each
    /// test runs on a thread of its own.
    pub(crate) static ASKED: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(Vec::new()) };
}

fn output(program: &str, dir: &Path, args: &[&str]) -> Option<Output> {
    #[cfg(test)]
    ASKED.with_borrow_mut(|asked| asked.push(args.join(" ")));
    let child = Command::new(program)
        .current_dir(dir)
        .args(arguments(args))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    finish(child, LIMIT)
}

/// What `child` printed and how it ended, when it ends within `limit`. One
/// still running then is killed and reaped, and the answer is `None`, the
/// "couldn't tell" every caller already has for a machine without git.
fn finish(mut child: Child, limit: Duration) -> Option<Output> {
    // Both pipes are read on threads, so a command that prints more than a
    // pipe holds can't stall. Over channels rather than join(): a process
    // git left behind can hold a pipe open after git has ended, and waiting
    // for its end would have no limit.
    fn reader<R: std::io::Read + Send + 'static>(pipe: Option<R>) -> std::sync::mpsc::Receiver<Vec<u8>> {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            if let Some(mut pipe) = pipe {
                let _ = pipe.read_to_end(&mut bytes);
            }
            let _ = tx.send(bytes);
        });
        rx
    }
    let (stdout, stderr) = (reader(child.stdout.take()), reader(child.stderr.take()));
    let deadline = Instant::now() + limit;
    // Most commands end within a few milliseconds: look often at first.
    let mut nap = Duration::from_millis(1);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(nap);
                nap = (nap * 2).min(Duration::from_millis(50));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    // It has ended, so what it printed is already written: a moment is
    // enough even when the limit has just run out.
    let left = deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(100));
    Some(Output { status, stdout: stdout.recv_timeout(left).ok()?, stderr: stderr.recv_timeout(left).ok()? })
}

/// What the command printed, when it ran and succeeded.
pub(crate) fn run(program: &str, dir: &Path, args: &[&str]) -> Option<String> {
    let out = output(program, dir, args)?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// The command's exit code, when it ran at all. For commands that answer with
/// it, such as `check-ignore -q`.
pub(crate) fn code(program: &str, dir: &Path, args: &[&str]) -> Option<i32> {
    output(program, dir, args)?.status.code()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ade-git-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // Needs the git binary; CI has it. Says so and skips on a machine without it.
    #[test]
    fn runs_git_and_returns_its_output() {
        let dir = temp("run");
        if run(GIT, &dir, &["--version"]).is_none() {
            eprintln!("git is not installed; skipping");
            return;
        }
        assert!(run(GIT, &dir, &["init", "-q"]).is_some());
        assert_eq!(run(GIT, &dir, &["rev-parse", "--is-inside-work-tree"]).as_deref().map(str::trim), Some("true"));
        // A command that fails is None from run(), and its exit code from code().
        assert_eq!(run(GIT, &dir, &["rev-parse", "--verify", "-q", "HEAD"]), None);
        assert_eq!(code(GIT, &dir, &["rev-parse", "--verify", "-q", "HEAD"]), Some(1));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_missing_git_is_none() {
        let dir = temp("missing");
        assert_eq!(run("ade-no-such-git", &dir, &["status"]), None);
        assert_eq!(code("ade-no-such-git", &dir, &["status"]), None);
        std::fs::remove_dir_all(dir).ok();
    }

    /// Whether a process with this id is there. `kill -0` only asks.
    #[cfg(unix)]
    fn running(pid: u32) -> bool {
        Command::new("kill").args(["-0", &pid.to_string()]).stderr(Stdio::null()).status().is_ok_and(|status| status.success())
    }

    #[cfg(unix)]
    fn sh(script: &str) -> Child {
        Command::new("sh").args(["-c", script]).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap()
    }

    // Unix only: the stand-in for a git that hangs is a shell's `sleep`.
    #[cfg(unix)]
    #[test]
    fn a_command_that_hangs_is_stopped_at_the_limit_and_answers_nothing() {
        let hung = sh("exec sleep 5");
        let pid = hung.id();
        let started = Instant::now();
        assert!(finish(hung, Duration::from_millis(200)).is_none(), "couldn't tell");
        assert!(started.elapsed() < Duration::from_secs(4), "it was not waited for: {:?}", started.elapsed());
        assert!(!running(pid), "no child process is left");
    }

    #[cfg(unix)]
    #[test]
    fn a_command_that_ends_in_time_answers_with_all_it_printed() {
        // More than a pipe holds: read as it comes, or the command would stall.
        let out = finish(sh("head -c 300000 /dev/zero; echo oops >&2; exit 3"), Duration::from_secs(30)).unwrap();
        assert_eq!(out.stdout.len(), 300_000);
        assert_eq!(String::from_utf8_lossy(&out.stderr), "oops\n");
        assert_eq!(out.status.code(), Some(3));
    }

    // git can leave a process behind (a file-system monitor, a background
    // gc) that holds its output open after git itself has ended.
    #[cfg(unix)]
    #[test]
    fn a_process_left_holding_the_output_does_not_keep_the_answer_waiting() {
        let started = Instant::now();
        assert!(finish(sh("sleep 5 & echo done"), Duration::from_millis(200)).is_none());
        assert!(started.elapsed() < Duration::from_secs(4), "{:?}", started.elapsed());
    }

    #[test]
    fn never_takes_an_optional_lock() {
        assert_eq!(arguments(&["status", "--porcelain"]), ["--no-optional-locks", "status", "--porcelain"]);
    }
}
