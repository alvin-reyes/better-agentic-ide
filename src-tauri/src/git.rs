//! Running git without taking its optional locks. The switch and the slop
//! check use this; `sync.rs`, `usage.rs` and `projectsetup.rs` still call git
//! themselves (they write, or pass their own flags).

use std::path::Path;
use std::process::{Command, Output};

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

fn output(program: &str, dir: &Path, args: &[&str]) -> Option<Output> {
    Command::new(program).current_dir(dir).args(arguments(args)).output().ok()
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

    #[test]
    fn never_takes_an_optional_lock() {
        assert_eq!(arguments(&["status", "--porcelain"]), ["--no-optional-locks", "status", "--porcelain"]);
    }
}
