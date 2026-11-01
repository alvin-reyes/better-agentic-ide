//! Claude Code's settings files, shared by everything in ADE that edits them:
//! reading, merging permission rules, writing, and finding the checkout whose
//! `.claude/settings.local.json` Claude Code reads.
//!
//! serde_json here has no `preserve_order`, so a write re-sorts the file's
//! keys and re-indents it; every key and value is kept.

use serde::Serialize;
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

/// The user's home folder: `$HOME`, or on unix the passwd entry when
/// `$HOME` is unset, as Node's `os.homedir()` gives Claude Code. None when
/// it is unknown or empty.
pub fn home_dir() -> Option<PathBuf> {
    #[allow(deprecated)]
    std::env::home_dir().filter(|h| !h.as_os_str().is_empty())
}

/// The effective uid, or None on a platform without uids.
pub(crate) fn current_uid() -> Option<u32> {
    #[cfg(unix)]
    {
        // SAFETY: geteuid has no preconditions and cannot fail.
        Some(unsafe { libc::geteuid() })
    }
    #[cfg(not(unix))]
    {
        None
    }
}

/// The folder whose `.claude/settings.local.json` Claude Code reads for a
/// session started anywhere in `root` (a git root, as `project_root` gives
/// it). See `main_checkout_root_for`. The shared entry point for settings
/// writers; the Orgo install passes its own home folder and uid instead.
#[allow(dead_code)]
pub fn main_checkout_root(root: &Path) -> PathBuf {
    main_checkout_root_for(root, home_dir().as_deref(), current_uid())
}

/// `main_checkout_root` with the home folder and the uid passed in, for
/// tests. It mirrors Claude Code's `findCanonicalGitRoot` (2.1.314) with
/// plain file reads and no git process: from a linked worktree whose common
/// dir is named `.git`, the folder holding that `.git`; `root` itself in
/// every other case, including anything unreadable, the home folder, a
/// folder another user owns, and every platform without uids.
pub fn main_checkout_root_for(root: &Path, home: Option<&Path>, uid: Option<u32>) -> PathBuf {
    canonical_root(root, home, uid).unwrap_or_else(|| root.to_path_buf())
}

#[cfg(not(unix))]
fn canonical_root(_root: &Path, _home: Option<&Path>, _uid: Option<u32>) -> Option<PathBuf> {
    None
}

/// The walk's candidate, kept only when Claude Code would move the file
/// there: not the home folder (an unknown one counts as home), and the
/// candidate, its `.git` and its `.claude` (when present) owned by `uid`.
#[cfg(unix)]
fn canonical_root(root: &Path, home: Option<&Path>, uid: Option<u32>) -> Option<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let candidate = linked_main_checkout(root)?;
    let uid = uid?;
    let home = home?.canonicalize().ok()?;
    if candidate == home {
        return None;
    }
    for (path, required) in [(candidate.clone(), true), (candidate.join(".git"), true), (candidate.join(".claude"), false)] {
        match std::fs::symlink_metadata(&path) {
            Ok(m) if m.uid() == uid => {}
            Err(e) if !required && e.kind() == std::io::ErrorKind::NotFound => {}
            _ => return None,
        }
    }
    Some(candidate)
}

/// The trimmed text of a regular file (not a link), or None.
#[cfg(unix)]
fn regular_file_text(path: &Path) -> Option<String> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    if !meta.file_type().is_file() {
        return None;
    }
    Some(std::fs::read_to_string(path).ok()?.trim().to_string())
}

/// Follow `<root>/.git` to the main checkout, only when every step is what
/// `git worktree add` leaves, as Claude Code checks it:
/// 1. `<root>/.git` is a regular file holding the one line `gitdir: <g>`
///    (a relative `<g>` is relative to `<root>`);
/// 2. `<g>/commondir` is a regular file naming `<c>` (relative to `<g>`);
/// 3. `<g>` is in `<c>/worktrees`;
/// 4. `<g>/gitdir` points back at `<root>/.git`;
/// 5. `<c>` is named `.git`: the candidate is its parent. No `core.bare`
///    check, so a bare clone into `proj/.git` gives `proj`.
///
/// No path or file in the walk may hold a backslash.
#[cfg(unix)]
fn linked_main_checkout(root: &Path) -> Option<PathBuf> {
    let no_backslash = |text: &str| (!text.is_empty() && !text.contains('\\')).then_some(());
    no_backslash(&root.to_string_lossy())?;
    let line = regular_file_text(&root.join(".git"))?;
    if line.contains('\n') {
        return None;
    }
    let g = line.strip_prefix("gitdir:")?.trim();
    no_backslash(g)?;
    let g = root.join(g);
    let c = regular_file_text(&g.join("commondir"))?;
    no_backslash(&c)?;
    let c = g.join(c).canonicalize().ok()?;
    if g.canonicalize().ok()?.parent()? != c.join("worktrees") {
        return None;
    }
    let back = regular_file_text(&g.join("gitdir"))?;
    no_backslash(&back)?;
    if g.join(back).canonicalize().ok()? != root.canonicalize().ok()?.join(".git") {
        return None;
    }
    if c.file_name()? != ".git" {
        return None;
    }
    c.parent().map(Path::to_path_buf)
}

/// The settings every Claude Code launch ADE makes carries as its one
/// `--settings` value. See `.ade/context/orgo-permission-rules.md`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRules {
    /// Ask rules: `orgo_rules::MCP_ASK`; the CLI library's Story 2 appends its CLIs' rules.
    pub ask: Vec<String>,
    /// Deny rules for Continuous launches. Empty until Story 1b fills it.
    pub continuous_deny: Vec<String>,
    /// The CLI library's command guard. None until its Story 2 builds it.
    pub guard: Option<Guard>,
}

/// A PreToolUse hook command for an interactive and for a headless (`-p`)
/// session; the launch picks one by whether it is headless.
#[derive(Serialize)]
#[allow(dead_code)] // built by the CLI library's Story 2
pub struct Guard {
    pub interactive: String,
    pub headless: String,
}

/// The same for every launch: no project or folder decides them.
#[tauri::command]
pub fn launch_rules() -> LaunchRules {
    LaunchRules {
        ask: crate::orgo_rules::MCP_ASK.iter().map(|r| r.to_string()).collect(),
        continuous_deny: Vec::new(),
        guard: None,
    }
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

    /// A linked worktree `<wt>` of the repository whose common dir is
    /// `<common>`, as `git worktree add` leaves it: `<wt>/.git` names the
    /// admin folder `<common>/worktrees/<name>`, which holds `commondir`
    /// (`../..`) and the `gitdir` back-pointer (`<wt>/.git`).
    fn worktree(common: &Path, name: &str, wt: &Path) -> PathBuf {
        let admin = common.join("worktrees").join(name);
        write(&admin.join("commondir"), "../..\n");
        write(&admin.join("gitdir"), &format!("{}\n", wt.join(".git").display()));
        write(&wt.join(".git"), &format!("gitdir: {}\n", admin.display()));
        admin
    }

    /// `<d>/main`, a checkout, with a linked worktree's admin folder in it.
    fn main_checkout(d: &Path) -> PathBuf {
        let main = d.join("main");
        write(&main.join(".git").join("HEAD"), "ref: refs/heads/main\n");
        main
    }

    #[cfg(unix)]
    fn owner(p: &Path) -> u32 {
        use std::os::unix::fs::MetadataExt;
        std::fs::symlink_metadata(p).unwrap().uid()
    }

    #[cfg(unix)]
    #[test]
    fn main_checkout_root_follows_only_real_worktrees() {
        let d = tmp("walk");
        let home = tmp("walk-home");
        let main = main_checkout(&d);
        let uid = Some(owner(&main));
        let walk = |root: &Path| main_checkout_root_for(root, Some(&home), uid);

        // Normal checkout: its own main checkout.
        assert_eq!(walk(&main), main, "normal checkout");

        // Linked worktree, absolute gitdir, as git writes by default.
        let wt = d.join("wt");
        worktree(&main.join(".git"), "wt", &wt);
        assert_eq!(walk(&wt), main, "linked worktree, absolute gitdir");

        // Linked worktree, relative gitdir and back-pointer (git >= 2.48,
        // worktree.useRelativePaths): resolved against <root> and <g>.
        let wtrel = d.join("wtrel");
        let admin = main.join(".git").join("worktrees").join("wtrel");
        write(&admin.join("commondir"), "../..\n");
        write(&admin.join("gitdir"), "../../../../wtrel/.git\n");
        write(&wtrel.join(".git"), "gitdir: ../main/.git/worktrees/wtrel\n");
        assert_eq!(walk(&wtrel), main, "linked worktree, relative gitdir");

        // Submodule: its gitdir has no commondir.
        let sub = main.join("sub");
        let modules = main.join(".git").join("modules").join("sub");
        write(&modules.join("HEAD"), "ref: refs/heads/main\n");
        write(&sub.join(".git"), "gitdir: ../.git/modules/sub\n");
        assert_eq!(walk(&sub), sub, "submodule");

        // A worktree of a submodule: the common dir is modules/sub, not named .git.
        let subwt = d.join("subwt");
        worktree(&modules, "subwt", &subwt);
        assert_eq!(walk(&subwt), subwt, "worktree of a submodule");

        // A submodule inside a linked worktree: its gitdir lives under the
        // worktree's admin folder and has no commondir.
        let wtsub = d.join("wtsub");
        let wtsub_admin = worktree(&main.join(".git"), "wtsub", &wtsub);
        assert_eq!(walk(&wtsub), main, "the worktree itself");
        write(&wtsub_admin.join("modules").join("sub").join("HEAD"), "ref: refs/heads/main\n");
        let wtsub_sub = wtsub.join("sub");
        write(&wtsub_sub.join(".git"), &format!("gitdir: {}\n", wtsub_admin.join("modules").join("sub").display()));
        assert_eq!(walk(&wtsub_sub), wtsub_sub, "submodule inside a linked worktree");

        // --separate-git-dir <store>/.git sep: the checkout has no commondir...
        let store = d.join("store");
        write(&store.join(".git").join("HEAD"), "ref: refs/heads/main\n");
        let sep = d.join("sep");
        write(&sep.join(".git"), &format!("gitdir: {}\n", store.join(".git").display()));
        assert_eq!(walk(&sep), sep, "--separate-git-dir checkout");
        // ...and a worktree of it moves to the folder holding <store>/.git.
        let sepwt = d.join("sepwt");
        worktree(&store.join(".git"), "sepwt", &sepwt);
        assert_eq!(walk(&sepwt), store, "worktree of a --separate-git-dir repository");

        // The same with a separate gitdir not named .git.
        let store2 = d.join("store2");
        write(&store2.join("HEAD"), "ref: refs/heads/main\n");
        let sep2wt = d.join("sep2wt");
        worktree(&store2, "sep2wt", &sep2wt);
        assert_eq!(walk(&sep2wt), sep2wt, "separate gitdir not named .git");

        // `git clone --bare … proj/.git`, then `git worktree add proj/feature`:
        // no core.bare check, so proj.
        let proj = d.join("proj");
        write(&proj.join(".git").join("HEAD"), "ref: refs/heads/main\n");
        write(&proj.join(".git").join("config"), "[core]\n\tbare = true\n");
        let feature = proj.join("feature");
        worktree(&proj.join(".git"), "feature", &feature);
        assert_eq!(walk(&feature), proj, "bare clone into proj/.git");

        // `git init --bare repo.git` with a worktree bw.
        let bare = d.join("repo.git");
        write(&bare.join("HEAD"), "ref: refs/heads/main\n");
        let bw = d.join("bw");
        worktree(&bare, "bw", &bw);
        assert_eq!(walk(&bw), bw, "bare repo.git");
        // ...even when the folder holding repo.git is itself a checkout, so
        // only the name says <c> is not a main checkout's .git.
        let outer = d.join("outer");
        write(&outer.join(".git").join("HEAD"), "ref: refs/heads/main\n");
        let inner = outer.join("repo.git");
        write(&inner.join("HEAD"), "ref: refs/heads/main\n");
        let obw = d.join("obw");
        worktree(&inner, "obw", &obw);
        assert_eq!(walk(&obw), obw, "bare repo.git inside a checkout");

        // Back-pointer missing, or pointing at another folder.
        let nobp = d.join("nobp");
        let a = worktree(&main.join(".git"), "nobp", &nobp);
        std::fs::remove_file(a.join("gitdir")).unwrap();
        assert_eq!(walk(&nobp), nobp, "back-pointer missing");
        let elsebp = d.join("elsebp");
        let a = worktree(&main.join(".git"), "elsebp", &elsebp);
        write(&a.join("gitdir"), &format!("{}\n", wt.join(".git").display()));
        assert_eq!(walk(&elsebp), elsebp, "back-pointer at another folder");

        // <g> not under <c>/worktrees.
        let stray = d.join("stray");
        let a = main.join(".git").join("elsewhere").join("stray");
        write(&a.join("commondir"), "../..\n");
        write(&a.join("gitdir"), &format!("{}\n", stray.join(".git").display()));
        write(&stray.join(".git"), &format!("gitdir: {}\n", a.display()));
        assert_eq!(walk(&stray), stray, "<g> not under <c>/worktrees");

        // commondir is a symbolic link.
        let linked = d.join("linked");
        let a = worktree(&main.join(".git"), "linked", &linked);
        std::fs::remove_file(a.join("commondir")).unwrap();
        write(&d.join("commondir-target"), "../..\n");
        std::os::unix::fs::symlink(d.join("commondir-target"), a.join("commondir")).unwrap();
        assert_eq!(walk(&linked), linked, "commondir is a symbolic link");

        // The back-pointer is a symbolic link to a good one.
        let bplink = d.join("bplink");
        let a = worktree(&main.join(".git"), "bplink", &bplink);
        std::fs::rename(a.join("gitdir"), d.join("bplink-target")).unwrap();
        std::os::unix::fs::symlink(d.join("bplink-target"), a.join("gitdir")).unwrap();
        assert_eq!(walk(&bplink), bplink, "back-pointer is a symbolic link");

        // <root>/.git is a symbolic link to a good gitdir file.
        let dotlink = d.join("dotlink");
        worktree(&main.join(".git"), "dotlink", &dotlink);
        std::fs::rename(dotlink.join(".git"), d.join("dotlink-gitfile")).unwrap();
        std::os::unix::fs::symlink(d.join("dotlink-gitfile"), dotlink.join(".git")).unwrap();
        assert_eq!(walk(&dotlink), dotlink, ".git is a symbolic link");

        // A gitdir split over two lines, though the joined path is a real admin folder.
        let split = d.join("split");
        let a = worktree(&main.join(".git"), "sp\nlit", &split);
        assert_eq!(walk(&split), split, "gitdir over two lines");
        std::fs::write(split.join(".git"), format!("gitdir: {}", a.display())).unwrap();
        assert_eq!(walk(&split), split, "gitdir over two lines, no trailing newline");

        // More than the one gitdir line.
        let twolines = d.join("twolines");
        let a = worktree(&main.join(".git"), "twolines", &twolines);
        write(&twolines.join(".git"), &format!("gitdir: {}\nextra\n", a.display()));
        assert_eq!(walk(&twolines), twolines, "two lines");

        // The guards Claude Code applies before it moves the file.
        // The candidate is the home folder.
        assert_eq!(main_checkout_root_for(&wt, Some(&main), uid), wt, "candidate is $HOME");
        // ...through a path that only canonicalises to it.
        let home_link = d.join("home-link");
        std::os::unix::fs::symlink(&main, &home_link).unwrap();
        assert_eq!(main_checkout_root_for(&wt, Some(&home_link), uid), wt, "candidate is $HOME by another name");
        // The home folder is unknown, or can't be canonicalised.
        assert_eq!(main_checkout_root_for(&wt, None, uid), wt, "home unknown");
        assert_eq!(main_checkout_root_for(&wt, Some(&d.join("no-such-home")), uid), wt, "home can't be canonicalised");
        // Owned by another uid.
        assert_eq!(main_checkout_root_for(&wt, Some(&home), Some(uid.unwrap() + 1)), wt, "owned by another uid");
        // No uids.
        assert_eq!(main_checkout_root_for(&wt, Some(&home), None), wt, "no uid");
        // A .claude owned by us is fine.
        std::fs::create_dir_all(main.join(".claude")).unwrap();
        assert_eq!(walk(&wt), main, "with a .claude of our own");

        // Each of the three, alone, owned by someone else (needs root to chown).
        if owner(&main) == 0 {
            for (what, path) in [("candidate", main.clone()), (".git", main.join(".git")), (".claude", main.join(".claude"))] {
                std::os::unix::fs::lchown(&path, Some(65534), None).unwrap();
                assert_eq!(walk(&wt), wt, "{what} owned by another uid");
                std::os::unix::fs::lchown(&path, Some(0), None).unwrap();
                assert_eq!(walk(&wt), main, "{what} owned by us again");
            }
        } else {
            eprintln!("not root: the one-file-at-a-time ownership cases are skipped");
        }

        // A backslash in any of <root>, <g>, <c> or the back-pointer.
        let bs_root = d.join("back\\slash");
        worktree(&main.join(".git"), "bsroot", &bs_root);
        assert_eq!(walk(&bs_root), bs_root, "backslash in <root>");
        let bs_g = d.join("bsg");
        let a = worktree(&main.join(".git"), "bs\\g", &bs_g);
        assert!(a.to_string_lossy().contains('\\'));
        assert_eq!(walk(&bs_g), bs_g, "backslash in <g>");
        let bs_c = d.join("bsc");
        let a = worktree(&main.join(".git"), "bsc", &bs_c);
        write(&a.join("commondir"), "..\\..\n");
        assert_eq!(walk(&bs_c), bs_c, "backslash in <c>");
        let bs_bp = d.join("bsbp");
        let a = worktree(&main.join(".git"), "bsbp", &bs_bp);
        write(&a.join("gitdir"), &format!("{}\\.git\n", bs_bp.display()));
        assert_eq!(walk(&bs_bp), bs_bp, "backslash in the back-pointer");

        // Each alone, where the rest of the walk would succeed.
        // Only <root> has one: main and the worktree share a parent named with a backslash.
        let bsd = d.join("x\\y");
        let bsmain = main_checkout(&bsd);
        let bswt = bsd.join("wt");
        let a = bsmain.join(".git").join("worktrees").join("wt");
        write(&a.join("commondir"), "../..\n");
        write(&a.join("gitdir"), "../../../../wt/.git\n");
        write(&bswt.join(".git"), "gitdir: ../main/.git/worktrees/wt\n");
        assert_eq!(walk(&bswt), bswt, "backslash in <root> only");
        // Only <c>: commondir names a link with a backslash to the real common dir.
        let onlyc = d.join("onlyc");
        let a = worktree(&main.join(".git"), "onlyc", &onlyc);
        std::os::unix::fs::symlink(main.join(".git"), a.join("c\\d")).unwrap();
        write(&a.join("commondir"), "c\\d\n");
        assert_eq!(walk(&onlyc), onlyc, "backslash in <c> only");
        // Only the back-pointer: it passes through a folder with a backslash and back.
        let onlybp = d.join("onlybp");
        let a = worktree(&main.join(".git"), "onlybp", &onlybp);
        std::fs::create_dir_all(onlybp.join("b\\p")).unwrap();
        write(&a.join("gitdir"), &format!("{}/b\\p/../.git\n", onlybp.display()));
        assert_eq!(walk(&onlybp), onlybp, "backslash in the back-pointer only");

        // .git file without a gitdir: line; a gitdir that does not exist; no .git.
        let junk = d.join("junk");
        write(&junk.join(".git"), "not a gitdir line\n");
        assert_eq!(walk(&junk), junk, "no gitdir line");
        let gone = d.join("gone");
        write(&gone.join(".git"), "gitdir: ../nowhere/.git/worktrees/x\n");
        assert_eq!(walk(&gone), gone, "gitdir does not exist");
        let plain = d.join("plain");
        std::fs::create_dir_all(&plain).unwrap();
        assert_eq!(walk(&plain), plain, "no .git");

        // main_checkout_root passes the real home folder and uid.
        assert_eq!(main_checkout_root(&wt), main);

        std::fs::remove_dir_all(d).ok();
        std::fs::remove_dir_all(home).ok();
    }

    /// The layouts real git builds, each giving the table's <main>.
    #[cfg(unix)]
    #[test]
    fn main_checkout_root_matches_real_git_layouts() {
        let git = |dir: &Path, args: &[&str]| {
            let out = std::process::Command::new("git")
                .arg("-C")
                .arg(dir)
                .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "protocol.file.allow=always", "-c", "init.defaultBranch=main"])
                .args(args)
                .env("GIT_TERMINAL_PROMPT", "0")
                .output()
                .expect("git must be installed for this test");
            assert!(out.status.success(), "git {args:?} in {}: {}", dir.display(), String::from_utf8_lossy(&out.stderr));
        };
        let d = tmp("real");
        let home = tmp("real-home");
        let uid = Some(owner(&d));
        let walk = |root: &Path| main_checkout_root_for(root, Some(&home), uid);
        let ds = d.to_str().unwrap();

        // Normal checkout, with one commit.
        let main = d.join("main");
        git(&d, &["init", "-q", "main"]);
        write(&main.join("a.txt"), "a\n");
        git(&main, &["add", "a.txt"]);
        git(&main, &["commit", "-q", "-m", "a"]);
        assert_eq!(walk(&main), main, "normal checkout");

        // Linked worktree.
        let wt = d.join("wt");
        git(&main, &["worktree", "add", "-q", wt.to_str().unwrap()]);
        assert_eq!(walk(&wt), main, "linked worktree");

        // Submodule.
        let lib = d.join("lib");
        git(&d, &["init", "-q", "lib"]);
        write(&lib.join("l.txt"), "l\n");
        git(&lib, &["add", "l.txt"]);
        git(&lib, &["commit", "-q", "-m", "l"]);
        git(&main, &["submodule", "add", "-q", lib.to_str().unwrap(), "sub"]);
        assert_eq!(walk(&main.join("sub")), main.join("sub"), "submodule");

        // --separate-git-dir checkout and its worktree.
        let store = d.join("store");
        let sep = d.join("sep");
        std::fs::create_dir_all(&store).unwrap();
        git(&d, &["init", "-q", "--separate-git-dir", store.join(".git").to_str().unwrap(), "sep"]);
        write(&sep.join("s.txt"), "s\n");
        git(&sep, &["add", "s.txt"]);
        git(&sep, &["commit", "-q", "-m", "s"]);
        assert_eq!(walk(&sep), sep, "--separate-git-dir checkout");
        let sepwt = d.join("sepwt");
        git(&sep, &["worktree", "add", "-q", sepwt.to_str().unwrap()]);
        assert_eq!(walk(&sepwt), store, "worktree of a --separate-git-dir repository");

        // A bare clone into proj/.git with the worktree proj/feature.
        let proj = d.join("proj");
        git(&d, &["clone", "-q", "--bare", main.to_str().unwrap(), &format!("{ds}/proj/.git")]);
        let feature = proj.join("feature");
        git(&proj.join(".git"), &["worktree", "add", "-q", feature.to_str().unwrap()]);
        assert_eq!(walk(&feature), proj, "bare clone into proj/.git");

        // `git init --bare repo.git` with a worktree bw.
        let bare = d.join("repo.git");
        git(&d, &["init", "-q", "--bare", "repo.git"]);
        git(&main, &["push", "-q", bare.to_str().unwrap(), "HEAD:refs/heads/main"]);
        let bw = d.join("bw");
        git(&bare, &["worktree", "add", "-q", bw.to_str().unwrap(), "main"]);
        assert_eq!(walk(&bw), bw, "bare repo.git");

        std::fs::remove_dir_all(d).ok();
        std::fs::remove_dir_all(home).ok();
    }

    /// Off unix, Claude Code keeps settings.local.json with the start folder.
    #[cfg(not(unix))]
    #[test]
    fn main_checkout_root_is_the_root_off_unix() {
        let d = tmp("walk");
        let home = tmp("walk-home");
        let main = main_checkout(&d);
        let wt = d.join("wt");
        worktree(&main.join(".git"), "wt", &wt);
        assert_eq!(main_checkout_root_for(&wt, Some(&home), None), wt);
        assert_eq!(main_checkout_root_for(&main, Some(&home), None), main);
        assert_eq!(main_checkout_root(&wt), wt);
        std::fs::remove_dir_all(d).ok();
        std::fs::remove_dir_all(home).ok();
    }

    #[test]
    fn launch_rules_are_the_ask_list_with_no_guard_yet() {
        let rules = launch_rules();
        assert_eq!(rules.ask, crate::orgo_rules::MCP_ASK);
        assert_eq!(
            serde_json::to_value(launch_rules()).unwrap(),
            serde_json::json!({ "ask": crate::orgo_rules::MCP_ASK, "continuousDeny": [], "guard": null })
        );
    }
}
