//! Claude Code's settings files, shared by everything in ADE that edits them:
//! reading, merging permission rules, writing, and finding the checkout whose
//! `.claude/settings.local.json` Claude Code reads.
//!
//! serde_json here has no `preserve_order`, so a write re-sorts the file's
//! keys and re-indents it; every key and value is kept.

use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

use crate::state::read_json;

/// A Claude Code settings file, or an empty object when there is none.
pub fn load_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    read_json::<Value>(path).ok_or_else(|| format!("{} is not valid JSON; fix it first", path.display()))
}

pub fn save_settings(path: &Path, v: &Value) -> Result<(), String> {
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())? + "\n";
    crate::state::atomic_write(path, &text).map_err(|e| e.to_string())
}

/// Append each of `rules` missing from `permissions.<list>` of a settings
/// file's top-level object, in order, once. The user's rules keep their order
/// and nothing is removed. Returns the rules added. A `permissions` that isn't
/// an object, or a list that isn't one, is an error and nothing is changed.
pub fn merge_rules(settings: &mut Map<String, Value>, list: &str, rules: &[String]) -> Result<Vec<String>, String> {
    let perms = settings.entry("permissions").or_insert_with(|| Value::Object(Default::default()));
    let perms = perms.as_object_mut().ok_or("permissions is not an object")?;
    let have = perms.entry(list).or_insert_with(|| Value::Array(vec![]));
    let have = have.as_array_mut().ok_or_else(|| format!("permissions.{list} is not a list"))?;
    let mut added = Vec::new();
    for r in rules {
        if !have.iter().any(|x| x.as_str() == Some(r)) {
            have.push(Value::String(r.clone()));
            added.push(r.clone());
        }
    }
    Ok(added)
}

/// The root of the main checkout when `root` is a linked git worktree, where
/// Claude Code reads `.claude/settings.local.json`; `root` itself otherwise:
/// a normal checkout, a submodule or `--separate-git-dir` (no `commondir`), a
/// bare repository's worktree (no main checkout), or anything unreadable.
pub fn main_checkout_root(root: &Path) -> PathBuf {
    linked_main_checkout(root).unwrap_or_else(|| root.to_path_buf())
}

/// Follow `<root>/.git` (a `gitdir:` file) to its `commondir`, only when every
/// step is what `git worktree add` leaves.
fn linked_main_checkout(root: &Path) -> Option<PathBuf> {
    let dot_git = root.join(".git");
    if !dot_git.is_file() {
        return None;
    }
    let text = std::fs::read_to_string(&dot_git).ok()?;
    // A relative gitdir (worktree.useRelativePaths) is relative to the folder
    // holding the .git file; joining an absolute one keeps it as it is.
    let gitdir = root.join(text.lines().next()?.strip_prefix("gitdir:")?.trim());
    let common = std::fs::read_to_string(gitdir.join("commondir")).ok()?;
    let common = gitdir.join(common.trim()).canonicalize().ok()?;
    // Canonical, so a `.git` folder here is the one its parent holds: that
    // parent is the main checkout. A bare repository's is `repo.git`.
    if common.file_name()? != ".git" || !common.is_dir() {
        return None;
    }
    common.parent().map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let d = std::env::temp_dir().join(format!(
            "ade-claude-settings-{name}-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    /// `<d>/main`, a checkout, with a linked worktree's admin folder in it, as
    /// `git worktree add` leaves them.
    fn main_with_worktree_admin(d: &Path) -> PathBuf {
        let main = d.join("main");
        write(&main.join(".git").join("HEAD"), "ref: refs/heads/main\n");
        write(&main.join(".git").join("worktrees").join("wt").join("commondir"), "../..\n");
        main
    }

    #[test]
    fn main_checkout_root_follows_only_real_worktrees() {
        let d = tmp("walk");
        let main = main_with_worktree_admin(&d);

        // A normal checkout is its own main checkout.
        assert_eq!(main_checkout_root(&main), main);

        // A worktree with an absolute gitdir, as git writes by default.
        let wt = d.join("wt");
        write(&wt.join(".git"), &format!("gitdir: {}\n", main.join(".git").join("worktrees").join("wt").display()));
        assert_eq!(main_checkout_root(&wt), main);

        // A relative gitdir (git >= 2.48, worktree.useRelativePaths), resolved
        // against the folder holding the .git file.
        let rel = d.join("rel");
        write(&rel.join(".git"), "gitdir: ../main/.git/worktrees/wt\n");
        assert_eq!(main_checkout_root(&rel), main);

        // A submodule: its gitdir has no commondir, so it is its own root.
        let sub = main.join("sub");
        write(&main.join(".git").join("modules").join("sub").join("HEAD"), "ref: refs/heads/main\n");
        write(&sub.join(".git"), "gitdir: ../.git/modules/sub\n");
        assert_eq!(main_checkout_root(&sub), sub);

        // --separate-git-dir: a gitdir elsewhere, no commondir.
        let sep = d.join("sep");
        write(&d.join("store").join("HEAD"), "ref: refs/heads/main\n");
        write(&sep.join(".git"), &format!("gitdir: {}\n", d.join("store").display()));
        assert_eq!(main_checkout_root(&sep), sep);

        // A bare repository's worktree: the common dir is repo.git, and there
        // is no main checkout to go to.
        let bare = d.join("repo.git");
        write(&bare.join("HEAD"), "ref: refs/heads/main\n");
        write(&bare.join("worktrees").join("bw").join("commondir"), "../..\n");
        let bw = d.join("bw");
        write(&bw.join(".git"), &format!("gitdir: {}\n", bare.join("worktrees").join("bw").display()));
        assert_eq!(main_checkout_root(&bw), bw);

        // Anything unreadable stays where it is.
        let junk = d.join("junk");
        write(&junk.join(".git"), "not a gitdir line\n");
        assert_eq!(main_checkout_root(&junk), junk);
        let gone = d.join("gone");
        write(&gone.join(".git"), "gitdir: ../nowhere/.git/worktrees/x\n");
        assert_eq!(main_checkout_root(&gone), gone);
        let plain = d.join("plain");
        std::fs::create_dir_all(&plain).unwrap();
        assert_eq!(main_checkout_root(&plain), plain);

        std::fs::remove_dir_all(d).ok();
    }
}
