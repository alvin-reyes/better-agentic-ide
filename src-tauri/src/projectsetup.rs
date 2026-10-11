//! Project setup: every project ADE opens gets BMAD, the ADE methodology and
//! the role sub-agents. The frontend owns the content (src/lib/projectMethodology.ts);
//! this writes only what's missing, never overwrites, and can undo its own writes.

use crate::bmadv6::Methodology;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Deserialize, Clone, Debug)]
pub struct SetupFile {
    pub path: String,
    pub content: String,
}

/// What setup needs to bring an existing CLAUDE.md to the project's BMAD
/// version. The texts are the frontend's (src/lib/projectMethodology.ts), with
/// `\n` line ends.
#[derive(Deserialize, Clone, Debug)]
pub struct BmadText {
    /// The paragraph for the project's version, and the same as a marked section.
    pub paragraph: String,
    pub section: String,
    /// Every paragraph ADE has shipped, and each as a marked section. Only
    /// text that is one of these, byte for byte, is ever replaced.
    pub paragraphs: Vec<String>,
    pub sections: Vec<String>,
    /// The first and the last line of a marked section.
    pub open: String,
    pub close: String,
}

/// What a setup did to the BMAD paragraph of a CLAUDE.md that was already there.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeEdit {
    /// "replaced": a shipped paragraph, or a marked section, now reads as the
    /// project's version. "appended": the file had neither, and has a marked
    /// section at its end. "skipped": the file needed the edit and was left.
    pub status: String,
    /// Skipped: why ("link", "read-only", "not-utf8", "twice", "edited-section",
    /// or what reading or writing it failed with). Otherwise "edited" when the
    /// file still holds a BMAD line that is not ADE's, which the person has to
    /// remove; `None` when it holds none.
    pub reason: Option<String>,
    /// The whole file before and after the edit: what taking it back compares
    /// and restores. Empty when skipped.
    pub before: String,
    pub after: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub is_git: bool,
    /** Methodology files the project doesn't have yet. */
    pub missing: Vec<String>,
    /** CLAUDE.md exists but doesn't load the methodology. */
    pub needs_import: bool,
    pub bmad_installed: bool,
    /// Detected stacks: "evm", "solana", "go", "rust".
    pub stacks: Vec<String>,
    /// What the project is on: the marker, else `.bmad-core/` ⇒ "v4". `None`
    /// is a project with neither — the one setup asks about.
    pub methodology: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetupReport {
    /** Absolute paths of every file created, BMAD's included. */
    pub created: Vec<String>,
    /** The import block was appended to an existing CLAUDE.md. */
    pub appended_import: bool,
    pub agents: usize,
    /// BMAD v4 files installed (`.bmad-core/` and the /BMad commands).
    pub bmad_files: usize,
    /// BMAD v6 files scaffolded (skills, `_bmad/`, the methodology marker).
    pub bmadv6_files: usize,
    /// AI attribution was turned off in `.claude/settings.json` by this setup.
    pub attribution_off: bool,
    /// `.claude/settings.json` couldn't be updated; the rest of setup still ran.
    pub settings_error: Option<String>,
    /// The BMAD paragraph of an existing CLAUDE.md was edited, or needed to be
    /// and was left. `None` when the file was already right, or isn't there.
    pub claude_md: Option<ClaudeEdit>,
    /// Folders this setup created, outermost first. Only Rust reads it: a
    /// failed setup removes the ones still empty.
    #[serde(skip)]
    pub created_dirs: Vec<PathBuf>,
}

/// A relative path that stays inside the project.
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Refusing to write outside the project: {rel}"));
    }
    Ok(root.join(p))
}

pub(crate) fn project(root: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(root);
    if !p.is_dir() {
        return Err(format!("{root} isn't a folder."));
    }
    Ok(p)
}

/// Create `path` and any missing parents, recording each level created,
/// outermost first. A folder that holds no file (`_bmad-output/`) is otherwise
/// unknown to whoever has to take a setup back.
pub(crate) fn mkdirs(path: &Path, created: &mut Vec<PathBuf>) -> Result<(), String> {
    if path.is_dir() {
        return Ok(());
    }
    if path.exists() {
        return Err(format!("{}: exists and is not a folder", path.display()));
    }
    let mut missing = Vec::new();
    let mut at = Some(path);
    while let Some(p) = at {
        if p.as_os_str().is_empty() || p.exists() {
            break;
        }
        missing.push(p.to_path_buf());
        at = p.parent();
    }
    for p in missing.into_iter().rev() {
        match std::fs::create_dir(&p) {
            Ok(()) => created.push(p),
            // Someone else made it first: it isn't this setup's to remove.
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && p.is_dir() => {}
            Err(e) => return Err(format!("{}: {e}", p.display())),
        }
    }
    Ok(())
}

/// Create the file at `dst` and let `write` fill it. The create is the check:
/// `create_new` refuses a destination that exists (a file that appeared since
/// the caller looked, a dangling symlink) without touching it, and that is
/// `Ok(false)`, "kept". `Ok(true)` means written.
///
/// A write that fails partway (a full disk, a lost volume) leaves a file no
/// report names, so nothing would ever take it back: the file this call
/// created is removed here, and only that file. A removal that fails is part
/// of the returned error.
pub(crate) fn write_or_clean(dst: &Path, write: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>) -> std::io::Result<bool> {
    let mut file = match std::fs::OpenOptions::new().write(true).create_new(true).open(dst) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
        Err(e) => return Err(e),
    };
    match write(&mut file) {
        Ok(()) => Ok(true),
        Err(e) => {
            drop(file);
            Err(match std::fs::remove_file(dst) {
                Ok(()) => e,
                Err(r) => std::io::Error::new(e.kind(), format!("{e} (and {} could not be removed: {r})", dst.display())),
            })
        }
    }
}

/// Fill a file `write_or_clean` created with a copy of `src`, mode included
/// (as `fs::copy` did: the bundled runtime keeps an executable bit).
pub(crate) fn copy_into(src: &Path, to: &mut std::fs::File) -> std::io::Result<()> {
    let mut from = std::fs::File::open(src)?;
    std::io::copy(&mut from, to)?;
    to.set_permissions(from.metadata()?.permissions())
}

fn has_import(root: &Path, marker: &str) -> bool {
    std::fs::read_to_string(root.join("CLAUDE.md")).map(|s| s.contains(marker) || s.contains("@.ade/rules.md")).unwrap_or(false)
}

fn mentions(path: &Path, needles: &[&str]) -> bool {
    std::fs::read_to_string(path).map(|s| needles.iter().any(|n| s.contains(n))).unwrap_or(false)
}

/// How a BMAD bullet starts in a CLAUDE.md, ADE's or an edited one.
const BMAD_LINE: &str = "- **BMAD";

/// Where `needle` sits in `text` as whole lines: from the start of a line to
/// the end of one. A paragraph someone added words to is not found.
fn whole_lines(text: &str, needle: &str) -> Vec<(usize, usize)> {
    if needle.is_empty() {
        return Vec::new();
    }
    text.match_indices(needle)
        .map(|(from, _)| (from, from + needle.len()))
        .filter(|&(from, to)| {
            let rest = &text[to..];
            (from == 0 || text[..from].ends_with('\n')) && (rest.is_empty() || rest.starts_with('\n') || rest.starts_with("\r\n"))
        })
        .collect()
}

/// The bullet that ends at `to` goes on: the next line is indented and not
/// blank. Someone added to the paragraph, and it is theirs now.
fn continues(text: &str, to: usize) -> bool {
    let rest = &text[to..];
    let Some(next) = rest.strip_prefix("\r\n").or_else(|| rest.strip_prefix('\n')) else { return false };
    let line = next.lines().next().unwrap_or_default();
    line.starts_with([' ', '\t']) && !line.trim().is_empty()
}

/// The edit that brings `before` to the project's BMAD paragraph: the new
/// text and its status ("replaced", "appended") with a reason, `Ok(None)`
/// when it already reads right, `Err(reason)` when the file is not one ADE
/// edits.
///
/// Only text that is byte for byte ADE's is replaced: one shipped paragraph,
/// or one marked section holding one. A file with neither keeps every byte and
/// gains a marked section at its end.
fn bmad_edit(before: &str, bmad: &BmadText) -> Result<Option<ClaudeEdit>, &'static str> {
    // The file's own line ends, for what is written into it.
    let eol = if before.contains("\r\n") { "\r\n" } else { "\n" };
    let with = |text: &str, eol: &str| text.replace('\n', eol);
    let done = |status: &str, after: String, ours: (usize, usize)| {
        // A BMAD bullet outside what was just written is the person's, or one
        // of ADE's they edited: it stays, and they are told.
        let mut at = 0;
        let stale = after.split_inclusive('\n').any(|line| {
            let from = at;
            at += line.len();
            line.starts_with(BMAD_LINE) && !(ours.0 <= from && from < ours.1)
        });
        Ok(Some(ClaudeEdit { status: status.to_string(), reason: stale.then(|| "edited".to_string()), before: before.to_string(), after }))
    };

    let (opens, closes) = (whole_lines(before, &bmad.open), whole_lines(before, &bmad.close));
    if opens.len() > 1 || closes.len() > 1 {
        return Err("twice");
    }
    let section = match (opens.first(), closes.first()) {
        (None, None) => None,
        (Some(open), Some(close)) if open.1 <= close.0 => Some((open.0, close.1)),
        // One marker without the other, or the two the wrong way round.
        _ => return Err("edited-section"),
    };
    // Shipped paragraphs outside the section, in either line end. A paragraph
    // of one line reads the same in both, and is one match.
    let mut loose: Vec<(usize, usize)> = bmad
        .paragraphs
        .iter()
        .flat_map(|p| [with(p, "\n"), with(p, "\r\n")])
        .flat_map(|p| whole_lines(before, &p))
        .filter(|&(from, _)| section.is_none_or(|(start, end)| from < start || from >= end))
        // The whole bullet, not its first lines with more below them.
        .filter(|&(_, to)| !continues(before, to))
        .collect();
    loose.sort_unstable();
    loose.dedup();

    if let Some((start, end)) = section {
        if !loose.is_empty() {
            return Err("twice");
        }
        // A section's last line end is the file's to have or not.
        let reads = |s: &String| with(s.trim_end_matches('\n'), "\n") == before[start..end] || with(s.trim_end_matches('\n'), "\r\n") == before[start..end];
        if reads(&bmad.section) {
            return Ok(None);
        }
        if !bmad.sections.iter().any(reads) {
            return Err("edited-section");
        }
        let fresh = with(bmad.section.trim_end_matches('\n'), eol);
        let after = format!("{}{fresh}{}", &before[..start], &before[end..]);
        return done("replaced", after, (start, start + fresh.len()));
    }
    match loose[..] {
        [] => {
            let gap = if before.is_empty() || before.ends_with('\n') { "" } else { eol };
            let after = format!("{before}{gap}{eol}{}", with(&bmad.section, eol));
            let end = after.len();
            done("appended", after, (before.len(), end))
        }
        [(from, to)] => {
            let old = &before[from..to];
            // In the line end the paragraph had; a single line has the file's.
            let fresh = with(&bmad.paragraph, if old.contains("\r\n") { "\r\n" } else if old.contains('\n') { "\n" } else { eol });
            if fresh == old {
                return Ok(None);
            }
            let after = format!("{}{fresh}{}", &before[..from], &before[to..]);
            done("replaced", after, (from, from + fresh.len()))
        }
        _ => Err("twice"),
    }
}

/// Write the whole of a CLAUDE.md that is a regular file, in one step, with
/// the permissions it had. An error means the file is as it was: once the
/// content is in place, permissions that can't be put back are not a failed
/// write, and whoever recorded the edit must keep the record.
fn write_claude_md(path: &Path, text: &str) -> std::io::Result<()> {
    let permissions = std::fs::metadata(path)?.permissions();
    crate::state::atomic_write(path, text)?;
    let _ = std::fs::set_permissions(path, permissions);
    Ok(())
}

/// Bring the BMAD paragraph of the CLAUDE.md the project already has to its
/// version, and record it. The record is made before the write, so whatever
/// fails afterwards, the edit is known and can be taken back.
///
/// A file that needs the edit and is a link, is read-only or is not UTF-8 is
/// left, as is one holding a paragraph twice; the record says why. A file that
/// already reads right is not written and nothing is recorded.
fn edit_claude_md(dir: &Path, bmad: &BmadText, report: &mut SetupReport) {
    let path = dir.join("CLAUDE.md");
    let Ok(meta) = std::fs::symlink_metadata(&path) else { return };
    let skipped = |reason: String| Some(ClaudeEdit { status: "skipped".to_string(), reason: Some(reason), ..Default::default() });
    let is_link = meta.file_type().is_symlink();
    // Through a link, to know whether there is anything to say about it.
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        // A link that leads nowhere, or to a folder: nothing to bring up to date.
        Err(_) if is_link || !meta.is_file() => return,
        Err(e) => {
            report.claude_md = skipped(format!("it couldn't be read: {e}"));
            return;
        }
    };
    let Ok(before) = String::from_utf8(bytes) else {
        report.claude_md = skipped("not-utf8".to_string());
        return;
    };
    let edit = match bmad_edit(&before, bmad) {
        Ok(None) => return,
        Ok(Some(edit)) => edit,
        Err(reason) => {
            report.claude_md = skipped(reason.to_string());
            return;
        }
    };
    if is_link {
        // Writing would replace the link with a file, or edit a file that
        // is somewhere else and may be shared.
        report.claude_md = skipped("link".to_string());
        return;
    }
    if meta.permissions().readonly() {
        report.claude_md = skipped("read-only".to_string());
        return;
    }
    let after = edit.after.clone();
    report.claude_md = Some(edit);
    if let Err(e) = write_claude_md(&path, &after) {
        // Written in one step or not at all: the file is as it was.
        report.claude_md = skipped(format!("it couldn't be written: {e}"));
    }
}

/// Put CLAUDE.md back as it was before `edit`, while it still reads as the
/// edit left it. Anything else was saved by the person since, and is kept;
/// so is a file that is gone. One that is there and can't be read may still
/// hold the edit, and that is the error.
fn revert_claude_md(dir: &Path, edit: &ClaudeEdit) -> Result<(), String> {
    if edit.status == "skipped" || edit.before == edit.after {
        return Ok(());
    }
    let path = dir.join("CLAUDE.md");
    if !std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.is_file()) {
        return Ok(());
    }
    let now = std::fs::read(&path).map_err(|e| format!("couldn't check CLAUDE.md for the BMAD paragraph setup wrote, which may still be in it: {e}"))?;
    if now != edit.after.as_bytes() {
        return Ok(());
    }
    write_claude_md(&path, &edit.before).map_err(|e| format!("CLAUDE.md: {e}"))
}

/// What the project is built with, from its manifest files.
pub fn detect_stacks(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let hardhat = ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs"];
    if dir.join("foundry.toml").is_file() || hardhat.iter().any(|f| dir.join(f).is_file()) {
        out.push("evm".to_string());
    }
    let solana_crates = ["anchor-lang", "solana-program", "solana-sdk", "pinocchio"];
    let solana_program = std::fs::read_dir(dir.join("programs"))
        .map(|rd| rd.flatten().any(|e| mentions(&e.path().join("Cargo.toml"), &solana_crates)))
        .unwrap_or(false);
    if dir.join("Anchor.toml").is_file() || mentions(&dir.join("Cargo.toml"), &solana_crates) || solana_program {
        out.push("solana".to_string());
    }
    if dir.join("go.mod").is_file() {
        out.push("go".to_string());
    }
    if dir.join("Cargo.toml").is_file() || out.iter().any(|s| s == "solana") {
        out.push("rust".to_string());
    }
    out
}

/// Remove one agent from a project's .claude/agents/.
#[tauri::command]
pub fn project_agent_remove(root: String, name: String) -> Result<bool, String> {
    let dir = project(&root)?;
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Not an agent name: {name}"));
    }
    let path = dir.join(".claude").join("agents").join(format!("{name}.md"));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn project_setup_status(root: String, paths: Vec<String>, marker: String) -> Result<SetupStatus, String> {
    let dir = project(&root)?;
    let missing = paths
        .into_iter()
        .filter(|rel| inside(&dir, rel).map(|p| !p.exists()).unwrap_or(false))
        .collect();
    Ok(SetupStatus {
        is_git: dir.join(".git").exists(),
        missing,
        needs_import: dir.join("CLAUDE.md").is_file() && !has_import(&dir, &marker),
        bmad_installed: dir.join(".bmad-core").join("VERSION").is_file(),
        stacks: detect_stacks(&dir),
        methodology: crate::bmadv6::detect_on_disk(&dir).map(|m| m.as_str().to_string()),
    })
}

/// Write the files the project is missing, load the methodology from an
/// existing CLAUDE.md, and install the project's methodology from
/// `methodology_src` (its resource root). Nothing that exists is overwritten,
/// but the BMAD paragraph of an existing CLAUDE.md, which is brought to the
/// project's version when `bmad` is given (see `bmad_edit`).
///
/// The report is the caller's, so what was written before an error is still
/// known and can be taken back.
pub fn apply(
    dir: &Path,
    files: &[SetupFile],
    import: Option<&str>,
    marker: &str,
    methodology: Methodology,
    methodology_src: Option<&Path>,
    bmad: Option<&BmadText>,
    report: &mut SetupReport,
) -> Result<(), String> {
    // Decide the import before writing, so a CLAUDE.md we create isn't appended to.
    let append = import.is_some() && dir.join("CLAUDE.md").is_file() && !has_import(dir, marker);
    // A full setup brings the CLAUDE.md that is already there to the project's
    // BMAD version: before the import, which then follows a section added at
    // the end. One written below is born with its paragraph. Adding agents on
    // their own never reads the file.
    if let (Some(_), Some(bmad)) = (import, bmad) {
        edit_claude_md(dir, bmad, report);
    }
    for f in files {
        let dst = inside(dir, &f.path)?;
        if dst.exists() {
            continue;
        }
        if let Some(parent) = dst.parent() {
            mkdirs(parent, &mut report.created_dirs)?;
        }
        let wrote = write_or_clean(&dst, |to| std::io::Write::write_all(to, f.content.as_bytes()))
            .map_err(|e| format!("{}: {e}", f.path))?;
        if !wrote {
            // Appeared since the check above: the person's, left as it is.
            continue;
        }
        if f.path.starts_with(".claude/agents/") {
            report.agents += 1;
        }
        report.created.push(dst.to_string_lossy().into_owned());
    }
    if append {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().append(true).open(dir.join("CLAUDE.md")).map_err(|e| format!("CLAUDE.md: {e}"))?;
        file.write_all(import.unwrap_or_default().as_bytes()).map_err(|e| format!("CLAUDE.md: {e}"))?;
        report.appended_import = true;
    }
    match (methodology, methodology_src) {
        (Methodology::V4, Some(src)) => {
            let mut bmad = crate::bmad::ScaffoldReport::default();
            let installed = crate::bmad::install(src, dir, &mut bmad);
            // Recorded before the error is returned: what a failed install
            // copied is still this setup's to take back.
            report.bmad_files = bmad.created.len();
            report.created.extend(bmad.created);
            report.created_dirs.extend(bmad.created_dirs);
            installed?;
        }
        (Methodology::V6, Some(src)) => {
            let mut v6 = crate::bmadv6::ScaffoldReport::default();
            let installed = crate::bmadv6::install(src, dir, &mut v6);
            report.bmadv6_files = v6.created.len();
            report.created.extend(v6.created.iter().map(|p| p.to_string_lossy().into_owned()));
            report.created_dirs.extend(v6.created_dirs);
            installed?;
        }
        _ => {}
    }
    // A full setup also has agents commit as the user: no AI co-author trailer
    // or "Generated with" line. A broken settings file is reported, not fatal.
    // Last, because nothing after it can fail: a setup that fails has then
    // never edited a settings file the project already had.
    if import.is_some() {
        let settings = dir.join(".claude").join("settings.json");
        let existed = settings.exists();
        let hidden = mkdirs(&dir.join(".claude"), &mut report.created_dirs).and_then(|()| crate::usage::hide_attribution(dir));
        match hidden {
            Ok(changed) => {
                report.attribution_off = changed;
                if changed && !existed {
                    report.created.push(settings.to_string_lossy().into_owned());
                }
            }
            Err(e) => report.settings_error = Some(e),
        }
    }
    Ok(())
}

/// apply(), and on an error take back what it wrote: a failed setup leaves
/// nothing behind.
fn apply_or_clean(
    dir: &Path,
    files: &[SetupFile],
    import: Option<&str>,
    marker: &str,
    methodology: Methodology,
    methodology_src: Option<&Path>,
    bmad: Option<&BmadText>,
) -> Result<SetupReport, String> {
    let mut report = SetupReport::default();
    match apply(dir, files, import, marker, methodology, methodology_src, bmad, &mut report) {
        Ok(()) => Ok(report),
        Err(e) => {
            let failed = take_back(dir, &report, files, import);
            Err(if failed.is_empty() { e } else { format!("{e} (not taken back: {})", failed.join("; ")) })
        }
    }
}

/// Take back what a setup wrote, as its report records it: the files still as
/// setup wrote them, the import it appended, its edit to the BMAD paragraph of
/// CLAUDE.md, then the folders it created that are empty. Shared by a failed
/// setup and a failed switch's rollback.
///
/// The paragraph goes back only while CLAUDE.md, the import stripped, still
/// reads as the edit left it: a file the person has saved since is kept, and
/// that is not a failure.
///
/// "Still as setup wrote them" is by content only for the files in `files`;
/// for the rest (the BMAD engine's) it is only "still a file". Returns what
/// it could not undo, each naming its path; a folder that is not empty, or is
/// already gone, is not a failure.
pub(crate) fn take_back(dir: &Path, report: &SetupReport, files: &[SetupFile], import: Option<&str>) -> Vec<String> {
    let mut failed = Vec::new();
    remove_unchanged_noting(dir, &report.created, files, &mut failed);
    if let (true, Some(import)) = (report.appended_import, import) {
        if let Err(e) = strip_import(dir, import) {
            failed.push(format!("CLAUDE.md: {e}"));
        }
    }
    if let Some(edit) = &report.claude_md {
        if let Err(e) = revert_claude_md(dir, edit) {
            failed.push(e);
        }
    }
    // Innermost first. A folder something else has written into since stays.
    for d in report.created_dirs.iter().rev() {
        if let Err(e) = std::fs::remove_dir(d) {
            if !matches!(e.kind(), std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty) {
                failed.push(format!("{}: {e}", d.display()));
            }
        }
    }
    failed
}

/// Remove the files in `created` that are still as setup wrote them (by
/// content for `files`; BMAD's own, if still a file). Returns the ones removed;
/// anything edited since is left.
fn remove_unchanged(dir: &Path, created: &[String], files: &[SetupFile]) -> Vec<PathBuf> {
    remove_unchanged_noting(dir, created, files, &mut Vec::new())
}

/// remove_unchanged(), noting each removal that failed in `failed`.
fn remove_unchanged_noting(dir: &Path, created: &[String], files: &[SetupFile], failed: &mut Vec<String>) -> Vec<PathBuf> {
    let ours: std::collections::HashMap<PathBuf, &str> =
        files.iter().filter_map(|f| inside(dir, &f.path).ok().map(|p| (p, f.content.as_str()))).collect();
    let mut removed = Vec::new();
    for path in created.iter().map(PathBuf::from) {
        if !path.starts_with(dir) {
            continue;
        }
        let unchanged = match ours.get(&path) {
            Some(content) => std::fs::read_to_string(&path).map(|s| s == *content).unwrap_or(false),
            // BMAD files: removed only if they're still where setup put them.
            None => path.is_file(),
        };
        if unchanged {
            match std::fs::remove_file(&path) {
                Ok(()) => removed.push(path),
                Err(e) => failed.push(format!("{}: {e}", path.display())),
            }
        }
    }
    removed
}

/// Take the import block setup appended back off the end of CLAUDE.md.
fn strip_import(dir: &Path, import: &str) -> Result<(), String> {
    let claude = dir.join("CLAUDE.md");
    if let Ok(text) = std::fs::read_to_string(&claude) {
        if let Some(stripped) = text.strip_suffix(import) {
            std::fs::write(&claude, stripped).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Whether setup installs this methodology's resources: a full setup of a
/// project that isn't on it yet, or one whose key files are missing — the
/// spec's "a missing ade-runtime.mjs or skills folder in an older v6 project
/// is fixed by setup's existing re-apply-missing-files pass".
///
/// A full v4 setup always re-applies v4's install, the way it did before the
/// methodology choice landed: that install never overwrites and is idempotent,
/// so re-running it is exactly what tops `.bmad-core/` (and the
/// `.bmad-core/VERSION` marker bmad.rs writes) back up after files were lost.
fn needs_install(methodology: Methodology, on_disk: Option<Methodology>, full: bool, dir: &Path) -> bool {
    if !full {
        return false;
    }
    match methodology {
        Methodology::V4 => true,
        Methodology::V6 => {
            on_disk != Some(Methodology::V6)
                || !dir.join("_bmad/ade-runtime.mjs").is_file()
                || !dir.join(".claude/skills/bmad/SKILL.md").is_file()
        }
    }
}

/// The resources a full setup installs from, or `None` when there is nothing to
/// install. A v6 setup whose resources did not resolve is an error: reporting
/// success while writing nothing would leave the project without skills, without
/// `_bmad/` and without a marker — what install() itself refuses to do.
fn install_source(
    methodology: Methodology,
    on_disk: Option<Methodology>,
    full: bool,
    dir: &Path,
    resolve: impl FnOnce(Methodology) -> Option<PathBuf>,
) -> Result<Option<PathBuf>, String> {
    if !needs_install(methodology, on_disk, full, dir) {
        return Ok(None);
    }
    match resolve(methodology) {
        Some(root) => Ok(Some(root)),
        None if methodology == Methodology::V6 => {
            Err("bmad v6 resources not found: cannot scaffold a v6 project without them".to_string())
        }
        // The v4 path predates this and leaves an unresolved root alone.
        None => Ok(None),
    }
}

/// One setup at a time: two at once could both see CLAUDE.md without the
/// import and append it twice. Crate-visible so another command that sets a
/// project up can hold it for its whole run.
pub(crate) static APPLY: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[tauri::command(async)]
pub fn project_setup_apply(
    app: tauri::AppHandle,
    root: String,
    files: Vec<SetupFile>,
    import: String,
    marker: String,
    methodology: String,
    full: bool,
    bmad: Option<BmadText>,
) -> Result<SetupReport, String> {
    let dir = project(&root)?;
    // The owner's answer from the setup prompt; anything else is the v6 default.
    let methodology = if methodology.trim().eq_ignore_ascii_case("v4") { Methodology::V4 } else { Methodology::V6 };
    set_up(&dir, &files, &import, &marker, bmad.as_ref(), methodology, full, |wanted| match wanted {
        Methodology::V4 => crate::bmad::resource_root(&app).ok(),
        Methodology::V6 => crate::bmadv6::resource_root(&app).ok(),
    })
}

/// What `project_setup_apply` runs once it has the project's folder.
/// `resolve` finds a version's bundled resources, which the command asks the
/// app for. Every setup comes through here: a full one, and an agent or a
/// stack's agents added on their own.
///
/// None of them writes into a project a switch left unfinished: its tree may
/// be half moved, and the journal may tell the person to move back the very
/// folders this would write into. The switch's own setup calls apply() and
/// is not held to this.
pub fn set_up(
    dir: &Path,
    files: &[SetupFile],
    import: &str,
    marker: &str,
    bmad: Option<&BmadText>,
    methodology: Methodology,
    full: bool,
    resolve: impl FnOnce(Methodology) -> Option<PathBuf>,
) -> Result<SetupReport, String> {
    let _one = APPLY.lock().unwrap_or_else(|e| e.into_inner());
    // Under the lock: a switch holds it for its whole run.
    refuse_unfinished(dir)?;
    // A full setup also loads the methodology from CLAUDE.md, brings its BMAD
    // paragraph to the project's version and installs the project's
    // methodology; adding agents on their own touches nothing else.
    let src = install_source(methodology, crate::bmadv6::detect_on_disk(dir), full, dir, resolve)?;
    apply_or_clean(dir, files, full.then_some(import), marker, methodology, src.as_deref(), bmad.filter(|_| full))
}

/// Setup and Undo are refused in a project a switch left unfinished, with
/// the reason the switch itself gives.
fn refuse_unfinished(dir: &Path) -> Result<(), String> {
    crate::bmadswitch::unfinished(dir).map_or(Ok(()), Err)
}

/// The version whose engine a setup installed, read from the list of what it
/// created: only the v4 install writes under `.bmad-core/`, only the v6 one
/// under `_bmad/`. `None` when the list names neither, as after a setup that
/// found the engine already there.
fn installed(dir: &Path, created: &[String]) -> Option<Methodology> {
    let under = |folder: &str| created.iter().any(|path| Path::new(path).starts_with(dir.join(folder)));
    match (under(".bmad-core"), under("_bmad")) {
        (true, false) => Some(Methodology::V4),
        (false, true) => Some(Methodology::V6),
        _ => None,
    }
}

/// Remove what a setup created (files still unchanged since, by content) and
/// the import block it appended, and put back the BMAD paragraph of CLAUDE.md
/// as `claude_md` (the report's own record) says it was. Leaves anything the
/// user has edited: a CLAUDE.md saved since the setup keeps its paragraph.
///
/// The marker is among what a setup creates, and it is ADE's, so "still a
/// file" would remove it whatever it says. It goes only while it names the
/// version the undone setup installed: after a switch it is the other
/// version's. When the list doesn't say which version that was, the marker
/// stays; the count returned has no place to say so.
#[tauri::command(async)]
pub fn project_setup_undo(
    root: String,
    created: Vec<String>,
    files: Vec<SetupFile>,
    import: Option<String>,
    claude_md: Option<ClaudeEdit>,
) -> Result<usize, String> {
    let dir = project(&root)?;
    // As a setup: one at a time, and not under a switch that is moving the tree.
    let _one = APPLY.lock().unwrap_or_else(|e| e.into_inner());
    refuse_unfinished(&dir)?;
    let marker = dir.join(".ade").join("methodology");
    let wrote = installed(&dir, &created);
    let still_names_it = wrote.is_some() && std::fs::read_to_string(&marker).is_ok_and(|text| text.trim() == wrote.map_or("", Methodology::as_str));
    let created: Vec<String> = created.into_iter().filter(|path| still_names_it || Path::new(path) != marker).collect();
    let removed = remove_unchanged(&dir, &created, &files);
    for path in &removed {
        // Tidy directories setup created that are now empty.
        let mut parent = path.parent();
        while let Some(p) = parent {
            if p == dir || std::fs::remove_dir(p).is_err() {
                break;
            }
            parent = p.parent();
        }
    }
    if let Some(import) = import {
        strip_import(&dir, &import)?;
    }
    if let Some(edit) = claude_md {
        revert_claude_md(&dir, &edit)?;
    }
    Ok(removed.len())
}

/// `git init` a new project folder (no commit: the first commit is the owner's).
#[tauri::command(async)]
pub fn project_git_init(root: String) -> Result<bool, String> {
    let dir = project(&root)?;
    if dir.join(".git").exists() {
        return Ok(false);
    }
    let out = std::process::Command::new("git").arg("init").arg("-q").current_dir(&dir).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        // A counter, not the clock: the clock's resolution is coarse enough that
        // parallel tests drew the same folder and deleted each other's tree.
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!(
            "ade-setup-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn files() -> Vec<SetupFile> {
        vec![
            SetupFile { path: "CLAUDE.md".into(), content: "# new\n@.ade/rules.md\n".into() },
            SetupFile { path: ".ade/rules.md".into(), content: "rules".into() },
            SetupFile { path: ".claude/agents/qa.md".into(), content: "qa".into() },
        ]
    }

    /// apply() into a fresh report, as project_setup_apply does, without the cleanup.
    fn run(
        dir: &Path,
        files: &[SetupFile],
        import: Option<&str>,
        marker: &str,
        methodology: Methodology,
        methodology_src: Option<&Path>,
    ) -> Result<SetupReport, String> {
        let mut report = SetupReport::default();
        apply(dir, files, import, marker, methodology, methodology_src, None, &mut report).map(|()| report)
    }

    /// A miniature of the bundled v4 resource root.
    fn v4_source() -> PathBuf {
        let src = temp();
        std::fs::create_dir_all(src.join("bmad-core/tasks")).unwrap();
        std::fs::write(src.join("bmad-core/core-config.yaml"), "x").unwrap();
        std::fs::write(src.join("bmad-core/tasks/a.md"), "a").unwrap();
        std::fs::write(src.join("VERSION"), "v4.1\n").unwrap();
        src
    }

    /// A miniature of the bundled v6 resource root, with or without the runtime.
    fn v6_source(with_runtime: bool) -> PathBuf {
        let src = temp();
        std::fs::create_dir_all(src.join("skills/bmad")).unwrap();
        std::fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        if with_runtime {
            std::fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();
        }
        src
    }

    fn names(d: &Path) -> Vec<String> {
        let mut v: Vec<String> =
            std::fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        v.sort();
        v
    }

    #[test]
    fn a_failed_setup_leaves_what_the_project_had_alone() {
        let dir = temp();
        let src = v4_source();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/mine.md"), "my agent").unwrap();
        std::fs::write(dir.join(".claude/settings.json"), "{\"model\":\"sonnet\"}").unwrap();
        // A file where the install needs a folder: its copy fails partway.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();

        assert!(apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src), None).is_err());

        assert_eq!(names(&dir), [".bmad-core", ".claude"]);
        assert_eq!(names(&dir.join(".claude")), ["agents", "settings.json"]);
        assert_eq!(names(&dir.join(".claude/agents")), ["mine.md"], "the role file setup wrote is gone, the folder stays");
        assert_eq!(std::fs::read_to_string(dir.join(".claude/settings.json")).unwrap(), "{\"model\":\"sonnet\"}");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_failed_v6_setup_is_taken_back() {
        let dir = temp();
        // No runtime bundle: the install fails after the skills and `_bmad/` are written.
        let src = v6_source(false);
        assert!(apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V6, Some(&src), None).is_err());
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_half_written_file_is_removed() {
        use std::io::Write;
        let dir = temp();
        let dst = dir.join("half.md");
        let err = write_or_clean(&dst, |f| {
            f.write_all(b"half")?;
            Err(std::io::Error::other("disk full"))
        })
        .unwrap_err();
        assert_eq!(err.to_string(), "disk full");
        assert!(!dst.exists(), "the half-written file is gone");

        // A write that succeeds keeps its file.
        assert!(write_or_clean(&dst, |f| f.write_all(b"whole")).unwrap());
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "whole");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_destination_that_exists_is_kept_and_not_truncated() {
        use std::io::Write;
        let dir = temp();
        let dst = dir.join("mine.md");
        std::fs::write(&dst, "mine").unwrap();
        // The caller never checked: the create itself refuses.
        let wrote = write_or_clean(&dst, |f| {
            f.write_all(b"theirs")?;
            Err(std::io::Error::other("never reached"))
        })
        .unwrap();
        assert!(!wrote);
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "mine");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_dangling_symlink_at_the_destination_is_left_alone() {
        let dir = temp();
        let dst = dir.join("link.md");
        std::os::unix::fs::symlink(dir.join("missing.md"), &dst).unwrap();
        assert!(!write_or_clean(&dst, |_| Ok(())).unwrap());
        assert!(std::fs::symlink_metadata(&dst).unwrap().file_type().is_symlink());
        assert!(!dir.join("missing.md").exists(), "nothing was written through the link");
        std::fs::remove_dir_all(dir).ok();
    }

    // Unix only: the closure deletes the file while its handle is open, which Windows refuses.
    #[cfg(unix)]
    #[test]
    fn a_failed_removal_is_part_of_the_error() {
        let dir = temp();
        let dst = dir.join("stuck.md");
        // The write fails and leaves a folder where the file was: it can't be removed as a file.
        let err = write_or_clean(&dst, |_| {
            std::fs::remove_file(&dst)?;
            std::fs::create_dir(&dst)?;
            Err(std::io::Error::other("disk full"))
        })
        .unwrap_err();
        assert!(err.to_string().starts_with("disk full"), "{err}");
        assert!(err.to_string().contains("stuck.md"), "{err}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_copy_that_fails_after_the_destination_exists_leaves_nothing() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let src = v4_source();
        // A bundled file that can't be read: the copy fails once its destination was created.
        std::fs::set_permissions(src.join("bmad-core/tasks/a.md"), std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::File::open(src.join("bmad-core/tasks/a.md")).is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let r = apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src), None);
        std::fs::set_permissions(src.join("bmad-core/tasks/a.md"), std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(r.is_err());
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_copy_keeps_the_executable_bit() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let src = temp().join("run.mjs");
        std::fs::write(&src, "x").unwrap();
        std::fs::set_permissions(&src, std::fs::Permissions::from_mode(0o755)).unwrap();
        let dst = dir.join("run.mjs");
        assert!(write_or_clean(&dst, |f| copy_into(&src, f)).unwrap());
        assert_eq!(std::fs::metadata(&dst).unwrap().permissions().mode() & 0o777, 0o755);
        std::fs::remove_dir_all(dir).ok();
    }

    /// Source text as the tests below match it. A Windows checkout has `\r\n`
    /// line ends, which a `\n}\n` would never find.
    fn lf(text: &str) -> String {
        text.replace("\r\n", "\n")
    }

    /// Slice a function's source out of a file: from its `fn` line to the next top-level item.
    fn body<'a>(src: &'a str, sig: &str) -> &'a str {
        let at = src.find(sig).unwrap_or_else(|| panic!("{sig} not found"));
        let rest = &src[at..];
        let end = rest.find("\n}\n").unwrap_or(rest.len());
        &rest[..end]
    }

    #[test]
    fn a_function_is_sliced_the_same_from_a_windows_checkout() {
        let unix = include_str!("projectsetup.rs").replace("\r\n", "\n");
        let windows = lf(&unix.replace('\n', "\r\n"));
        let sliced = body(&windows, "fn apply(");
        // Not assert_eq: a failure would print the whole function twice.
        assert!(sliced == body(&unix, "fn apply("), "the slice of a \\r\\n checkout is not the function's own lines");
        assert!(!sliced.contains("fn apply_or_clean("), "the slice ends where the function does");
    }

    #[test]
    fn files_are_only_written_through_write_or_clean() {
        let setup = lf(include_str!("projectsetup.rs"));
        let v4 = lf(include_str!("bmad.rs"));
        let v6 = lf(include_str!("bmadv6.rs"));
        let sites = [
            ("projectsetup apply", body(&setup, "fn apply(")),
            ("bmad copy_tree", body(&v4, "pub fn copy_tree(")),
            ("bmadv6 copy_tree", body(&v6, "fn copy_tree(")),
            ("bmadv6 copy_file", body(&v6, "fn copy_file(")),
        ];
        for (name, text) in sites {
            assert!(text.contains("write_or_clean("), "{name} must create files through write_or_clean");
            for bare in ["fs::copy(", "fs::write("] {
                assert!(!text.contains(bare), "{name} writes with a bare {bare}");
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn take_back_reports_what_it_could_not_undo() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let sub = dir.join("sub");
        std::fs::create_dir(&sub).unwrap();
        let stuck = sub.join("a.md");
        std::fs::write(&stuck, "x").unwrap();
        // A folder that can't be written to: its file can't be unlinked.
        std::fs::set_permissions(&sub, std::fs::Permissions::from_mode(0o500)).unwrap();
        if std::fs::write(sub.join("probe"), "x").is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let report = SetupReport { created: vec![stuck.to_string_lossy().into_owned()], ..Default::default() };
        let failed = take_back(&dir, &report, &[], None);
        std::fs::set_permissions(&sub, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(failed.len(), 1, "{failed:?}");
        assert!(failed[0].contains("a.md"), "{failed:?}");
        assert!(stuck.exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_clean_take_back_reports_nothing() {
        let dir = temp();
        let mut report = SetupReport::default();
        apply(&dir, &files(), None, "<!-- m -->", Methodology::V4, None, None, &mut report).unwrap();
        assert!(take_back(&dir, &report, &files(), None).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn take_back_removes_what_a_setup_made_and_keeps_what_changed() {
        let dir = temp();
        std::fs::write(dir.join("CLAUDE.md"), "# mine\n").unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None, None, &mut report).unwrap();
        assert!(report.appended_import);
        // The person edits one of the files setup wrote: it stays.
        std::fs::write(dir.join(".claude/agents/qa.md"), "edited").unwrap();

        assert!(take_back(&dir, &report, &files(), Some("\nIMPORT\n")).is_empty());

        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# mine\n", "the import is stripped");
        assert!(!dir.join(".ade").exists(), "an unchanged file and the folder setup made are gone");
        assert_eq!(std::fs::read_to_string(dir.join(".claude/agents/qa.md")).unwrap(), "edited");
        std::fs::remove_dir_all(dir).ok();
    }

    /// A switch that was cut short, as its journal's front matter says it.
    fn a_journal(dir: &Path, status: &str) {
        let archive = dir.join(".ade").join("archive").join("bmad-v4-2026-01-02");
        std::fs::create_dir_all(&archive).unwrap();
        std::fs::write(archive.join("ARCHIVE.md"), format!("---\nstatus: {status}\nphase: moving\nfrom: v4\nto: v6\ndate: 2026-01-02\n---\n")).unwrap();
    }

    const UNFINISHED: &str = "An earlier switch here didn't finish. See .ade/archive/bmad-v4-2026-01-02/ARCHIVE.md.";

    #[test]
    fn setup_refuses_a_project_with_an_unfinished_switch() {
        let dir = temp();
        let src = v4_source();
        let set_up = |full: bool| set_up(&dir, &files(), "\nIMPORT\n", "<!-- m -->", None, Methodology::V4, full, |_| Some(src.clone()));
        for status in ["in-progress", "incomplete"] {
            a_journal(&dir, status);
            assert_eq!(set_up(true).unwrap_err(), UNFINISHED, "{status}");
            // Adding an agent, or a stack's agents, is a setup too.
            assert_eq!(set_up(false).unwrap_err(), UNFINISHED, "{status}");
        }
        assert_eq!(names(&dir), [".ade"], "nothing was written");
        assert_eq!(names(&dir.join(".ade")), ["archive"]);

        // Resolved by hand: setup runs again.
        a_journal(&dir, "abandoned");
        let report = set_up(true).unwrap();
        assert!(report.created.contains(&dir.join(".ade/rules.md").to_string_lossy().into_owned()), "{:?}", report.created);
        assert!(dir.join(".bmad-core/tasks/a.md").is_file());
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    // R7: what can't be read may be a switch that didn't finish.
    #[test]
    fn setup_refuses_when_the_archive_cannot_be_understood() {
        let dir = temp();
        let notes = dir.join(".ade").join("archive").join("notes");
        std::fs::create_dir_all(&notes).unwrap();
        std::fs::write(notes.join("ARCHIVE.md"), "my own notes, no front matter\n").unwrap();
        let err = set_up(&dir, &files(), "\nIMPORT\n", "<!-- m -->", None, Methodology::V4, false, |_| None).unwrap_err();
        assert_eq!(err, "ADE can't read .ade/archive/notes, so it can't tell whether an earlier switch here finished.");
        assert_eq!(names(&dir), [".ade"], "nothing was written");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn undo_refuses_a_project_with_an_unfinished_switch() {
        let dir = temp();
        let root: String = dir.to_string_lossy().into();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, None).unwrap();
        a_journal(&dir, "in-progress");
        assert_eq!(project_setup_undo(root.clone(), r.created.clone(), files(), None, None).unwrap_err(), UNFINISHED);
        assert!(dir.join(".ade/rules.md").is_file() && dir.join(".claude/agents/qa.md").is_file(), "nothing was removed");

        a_journal(&dir, "abandoned");
        assert_eq!(project_setup_undo(root, r.created, files(), None, None).unwrap(), 3);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn undo_removes_the_marker_only_while_it_names_the_version_that_setup_wrote() {
        let marker = |dir: &Path| dir.join(".ade").join("methodology");
        let undo = |dir: &Path, created: Vec<String>| project_setup_undo(dir.to_string_lossy().into(), created, files(), None, None).unwrap();
        let v4 = v4_source();
        let v6 = v6_source(true);

        // Still the marker this setup wrote: it goes with the rest.
        let dir = temp();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, Some(&v4)).unwrap();
        undo(&dir, r.created);
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));

        // The project was switched since: the marker is the other version's.
        for (wrote, src, now) in [(Methodology::V4, &v4, "v6\n"), (Methodology::V6, &v6, "v4\n")] {
            let dir = temp();
            let r = run(&dir, &files(), None, "<!-- m -->", wrote, Some(src)).unwrap();
            std::fs::write(marker(&dir), now).unwrap();
            undo(&dir, r.created);
            assert_eq!(std::fs::read_to_string(marker(&dir)).unwrap(), now, "an undo of a {} setup", wrote.as_str());
            std::fs::remove_dir_all(dir).ok();
        }

        // A list that doesn't say which version its setup installed: the
        // marker is left rather than guessed at.
        let dir = temp();
        std::fs::create_dir_all(dir.join(".ade")).unwrap();
        std::fs::write(marker(&dir), "v4\n").unwrap();
        assert_eq!(undo(&dir, vec![marker(&dir).to_string_lossy().into_owned()]), 0);
        assert_eq!(std::fs::read_to_string(marker(&dir)).unwrap(), "v4\n");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(v4).ok();
        std::fs::remove_dir_all(v6).ok();
    }

    #[test]
    fn writes_missing_files_and_never_overwrites() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/qa.md"), "mine").unwrap();
        let r = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join(".claude/agents/qa.md")).unwrap(), "mine");
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "rules");
        // CLAUDE.md, .ade/rules.md and .claude/settings.json.
        assert_eq!(r.created.len(), 3);
        assert!(!r.appended_import, "a CLAUDE.md we created already imports the rules");
        // Running again changes nothing.
        let again = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(again.created.is_empty() && !again.appended_import);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn existing_claude_md_gets_the_import_once_and_undo_restores_it() {
        let dir = temp();
        std::fs::write(dir.join("CLAUDE.md"), "# Mine\n").unwrap();
        let import = "\n<!-- m -->\n@.ade/rules.md\n";
        let r = run(&dir, &files(), Some(import), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(r.appended_import);
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), format!("# Mine\n{import}"));
        let status = project_setup_status(dir.to_string_lossy().into(), vec!["CLAUDE.md".into()], "<!-- m -->".into()).unwrap();
        assert!(!status.needs_import);

        // Edit one created file: undo keeps it.
        std::fs::write(dir.join(".ade/rules.md"), "edited").unwrap();
        let removed = project_setup_undo(dir.to_string_lossy().into(), r.created.clone(), files(), Some(import.into()), None).unwrap();
        // The agent file and the settings file setup created.
        assert_eq!(removed, 2);
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# Mine\n");
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "edited");
        assert!(!dir.join(".claude").exists(), "empty folders setup created are removed");
        std::fs::remove_dir_all(dir).ok();
    }

    // This text becomes a failed switch's error, where "Permission denied" alone says nothing.
    #[cfg(unix)]
    #[test]
    fn a_claude_md_that_cannot_be_appended_to_is_named_in_the_error() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let claude = dir.join("CLAUDE.md");
        std::fs::write(&claude, "# Mine\n").unwrap();
        std::fs::set_permissions(&claude, std::fs::Permissions::from_mode(0o444)).unwrap();
        if std::fs::OpenOptions::new().append(true).open(&claude).is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let err = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap_err();
        std::fs::set_permissions(&claude, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(err.starts_with("CLAUDE.md: "), "{err}");
        assert_eq!(std::fs::read_to_string(&claude).unwrap(), "# Mine\n");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_full_setup_turns_ai_attribution_off_and_agents_alone_do_not() {
        let dir = temp();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(!r.attribution_off && !dir.join(".claude/settings.json").exists());
        let r = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(r.attribution_off && r.settings_error.is_none());
        let settings = dir.join(".claude").join("settings.json");
        let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&settings).unwrap()).unwrap();
        assert_eq!(v["attribution"]["commit"], "");
        assert_eq!(v["attribution"]["pr"], "");
        assert_eq!(v["includeCoAuthoredBy"], false);
        // Setup created the file, so Undo removes it with the rest.
        assert!(r.created.contains(&settings.to_string_lossy().into_owned()));
        // A later setup is safe: nothing new to write.
        let again = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(!again.attribution_off && again.created.is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_malformed_settings_file_is_reported_and_setup_carries_on() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude")).unwrap();
        std::fs::write(dir.join(".claude/settings.json"), "{ not json").unwrap();
        let r = run(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, None).unwrap();
        assert!(!r.attribution_off);
        assert!(r.settings_error.as_deref().unwrap_or_default().contains("not valid JSON"));
        assert_eq!(std::fs::read_to_string(dir.join(".ade/rules.md")).unwrap(), "rules");
        assert_eq!(std::fs::read_to_string(dir.join(".claude/settings.json")).unwrap(), "{ not json");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn status_reports_the_methodology_on_disk_marker_first() {
        let dir = temp();
        let root: String = dir.to_string_lossy().into();
        let status = || project_setup_status(root.clone(), vec![], "<!-- m -->".into()).unwrap();
        assert_eq!(status().methodology, None, "a brand-new project has neither");

        // `.bmad-core/` without a marker: a v4 project from before the marker.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        assert_eq!(status().methodology.as_deref(), Some("v4"));

        // The marker wins over `.bmad-core/`, as detect_on_disk (and so setup) does.
        std::fs::create_dir_all(dir.join(".ade")).unwrap();
        std::fs::write(dir.join(".ade/methodology"), "v6\n").unwrap();
        assert_eq!(status().methodology.as_deref(), Some("v6"));
        std::fs::write(dir.join(".ade/methodology"), "v4\n").unwrap();
        assert_eq!(status().methodology.as_deref(), Some("v4"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn detects_stacks_from_manifests() {
        let dir = temp();
        assert!(detect_stacks(&dir).is_empty());
        std::fs::write(dir.join("foundry.toml"), "").unwrap();
        std::fs::write(dir.join("go.mod"), "module x").unwrap();
        std::fs::create_dir_all(dir.join("programs/vault")).unwrap();
        std::fs::write(dir.join("programs/vault/Cargo.toml"), "[dependencies]\nanchor-lang = \"0.30\"").unwrap();
        assert_eq!(detect_stacks(&dir), ["evm", "solana", "go", "rust"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn removes_only_agent_files() {
        let dir = temp();
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::write(dir.join(".claude/agents/qa.md"), "x").unwrap();
        let root: String = dir.to_string_lossy().into();
        assert!(project_agent_remove(root.clone(), "qa".into()).unwrap());
        assert!(!project_agent_remove(root.clone(), "qa".into()).unwrap());
        assert!(project_agent_remove(root, "../CLAUDE".into()).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn refuses_paths_outside_the_project() {
        let dir = temp();
        let bad = vec![SetupFile { path: "../evil".into(), content: "x".into() }];
        assert!(run(&dir, &bad, None, "m", Methodology::V4, None).is_err());
        let abs = vec![SetupFile { path: "/tmp/evil".into(), content: "x".into() }];
        assert!(run(&dir, &abs, None, "m", Methodology::V4, None).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_v6_setup_writes_the_v6_scaffold_and_counts_it() {
        let dir = temp();
        let src = temp();
        std::fs::create_dir_all(src.join("skills/bmad")).unwrap();
        std::fs::write(src.join("skills/bmad/SKILL.md"), "hello").unwrap();
        std::fs::write(src.join("ade-runtime.mjs"), "// runtime").unwrap();

        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V6, Some(&src)).unwrap();

        // skills file, config.toml, custom/.gitignore, the runtime, the marker.
        assert_eq!(r.bmadv6_files, 5, "{:?}", r.created);
        assert_eq!(r.bmad_files, 0, "a v6 project installs no v4 files");
        assert!(dir.join(".claude/skills/bmad/SKILL.md").is_file());
        assert!(dir.join("_bmad/ade-runtime.mjs").is_file());
        assert_eq!(
            std::fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(),
            "v6"
        );
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    /// The v6 key files a full setup must find on disk: the skills tree and the
    /// runtime bundle every patched call site runs.
    fn complete_v6_tree(dir: &Path) {
        std::fs::create_dir_all(dir.join(".claude/skills/bmad")).unwrap();
        std::fs::write(dir.join(".claude/skills/bmad/SKILL.md"), "hello").unwrap();
        std::fs::create_dir_all(dir.join("_bmad")).unwrap();
        std::fs::write(dir.join("_bmad/ade-runtime.mjs"), "// runtime").unwrap();
    }

    #[test]
    fn a_full_v6_setup_without_resources_is_an_error() {
        // An unresolvable root must not read as a setup that succeeded and wrote nothing.
        let dir = temp();
        let err = install_source(Methodology::V6, None, true, &dir, |_| None).unwrap_err();
        assert!(err.contains("v6"), "{err}");
        // With resources, the resolved root is what setup installs from.
        let root = PathBuf::from("/tmp/bmad-v6");
        assert_eq!(
            install_source(Methodology::V6, None, true, &dir, |_| Some(root.clone())).unwrap(),
            Some(root)
        );
        // A v6 project whose key files are gone is an install target too, so a
        // miss there is this error, not a silent skip.
        assert!(install_source(Methodology::V6, Some(Methodology::V6), true, &dir, |_| None).is_err());
        // Nothing to install: already on the methodology with its key files
        // present, or not a full setup.
        complete_v6_tree(&dir);
        assert_eq!(install_source(Methodology::V6, Some(Methodology::V6), true, &dir, |_| None).unwrap(), None);
        assert_eq!(install_source(Methodology::V6, None, false, &dir, |_| None).unwrap(), None);
        // The v4 path keeps its pre-existing behaviour: a miss is not fatal.
        assert_eq!(install_source(Methodology::V4, None, true, &dir, |_| None).unwrap(), None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn an_intact_v6_project_is_not_re_scaffolded() {
        let dir = temp();
        complete_v6_tree(&dir);
        assert!(!needs_install(Methodology::V6, Some(Methodology::V6), true, &dir), "v6 project asked for v6, tree intact");
        assert!(needs_install(Methodology::V6, None, true, &dir), "a new project is scaffolded");
        assert!(!needs_install(Methodology::V6, None, false, &dir), "adding agents is not a full setup");
        assert!(needs_install(Methodology::V4, Some(Methodology::V6), true, &dir), "switching to v4 installs it");
        std::fs::remove_dir_all(dir).ok();
    }

    /// The re-apply promise: a deleted key file sets the install running again,
    /// and the install is idempotent, so nothing that is there is disturbed.
    #[test]
    fn a_full_setup_repairs_the_key_files_a_project_lost() {
        let dir = temp();
        complete_v6_tree(&dir);
        assert!(!needs_install(Methodology::V6, Some(Methodology::V6), true, &dir), "an intact v6 tree has nothing to install");

        std::fs::remove_file(dir.join("_bmad/ade-runtime.mjs")).unwrap();
        assert!(
            needs_install(Methodology::V6, Some(Methodology::V6), true, &dir),
            "a v6 project without _bmad/ade-runtime.mjs is repaired"
        );
        std::fs::write(dir.join("_bmad/ade-runtime.mjs"), "// runtime").unwrap();
        std::fs::remove_file(dir.join(".claude/skills/bmad/SKILL.md")).unwrap();
        assert!(
            needs_install(Methodology::V6, Some(Methodology::V6), true, &dir),
            "a v6 project without .claude/skills/bmad/SKILL.md is repaired"
        );

        // v4: a full setup always re-applies v4's idempotent install, so
        // `.bmad-core/` — the `.bmad-core/VERSION` marker bmad.rs writes
        // included — is topped back up.
        let v4 = temp();
        assert!(
            needs_install(Methodology::V4, Some(Methodology::V4), true, &v4),
            "no .bmad-core/VERSION: the v4 install is re-applied"
        );
        std::fs::create_dir_all(v4.join(".bmad-core")).unwrap();
        std::fs::write(v4.join(".bmad-core/VERSION"), "v4.1\n").unwrap();
        assert!(
            needs_install(Methodology::V4, Some(Methodology::V4), true, &v4),
            "an intact v4 tree is still topped up, as it was before the methodology choice"
        );
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(v4).ok();
    }

    #[test]
    fn mkdirs_records_each_level_it_creates() {
        let dir = temp();
        std::fs::create_dir_all(dir.join("a")).unwrap();
        let mut made = Vec::new();
        mkdirs(&dir.join("a/b/c"), &mut made).unwrap();
        assert_eq!(made, [dir.join("a/b"), dir.join("a/b/c")]);
        // Again: nothing to create, nothing recorded.
        mkdirs(&dir.join("a/b/c"), &mut made).unwrap();
        assert_eq!(made.len(), 2);
        // A file in the way is an error, not a silent skip.
        std::fs::write(dir.join("a/f"), "x").unwrap();
        assert!(mkdirs(&dir.join("a/f"), &mut made).is_err());
        assert!(mkdirs(&dir.join("a/f/g"), &mut made).is_err());
        assert_eq!(made.len(), 2);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_keeps_its_partial_report_when_the_install_fails() {
        let dir = temp();
        let src = v4_source();
        // A file where the install needs a folder: its copy fails partway.
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();
        let mut report = SetupReport::default();
        let err = apply(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src), None, &mut report).unwrap_err();
        assert!(err.contains("tasks"), "{err}");
        assert!(report.created.contains(&dir.join(".ade/rules.md").to_string_lossy().into_owned()), "{:?}", report.created);
        assert!(report.created_dirs.contains(&dir.join(".ade")), "{:?}", report.created_dirs);
        assert!(!dir.join(".claude/settings.json").exists(), "settings are written last, so a failed setup never edits them");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_failed_setup_leaves_nothing_behind() {
        let dir = temp();
        let src = v4_source();
        std::fs::write(dir.join("CLAUDE.md"), "# Mine\n").unwrap();
        std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
        std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();
        let import = "\n<!-- m -->\n@.ade/rules.md\n";

        assert!(apply_or_clean(&dir, &files(), Some(import), "<!-- m -->", Methodology::V4, Some(&src), None).is_err());

        let names = |d: &Path| {
            let mut v: Vec<String> =
                std::fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            v.sort();
            v
        };
        assert_eq!(std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap(), "# Mine\n", "the appended import is stripped");
        assert_eq!(names(&dir), [".bmad-core", "CLAUDE.md"], "created files and the folders made for them are gone");
        assert_eq!(names(&dir.join(".bmad-core")), ["tasks"], "what the install copied before it failed is gone");
        assert_eq!(std::fs::read_to_string(dir.join(".bmad-core/tasks")).unwrap(), "mine");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_setup_that_succeeds_keeps_what_it_wrote() {
        let dir = temp();
        let src = v4_source();
        let r = apply_or_clean(&dir, &files(), Some("\nIMPORT\n"), "<!-- m -->", Methodology::V4, Some(&src), None).unwrap();
        assert!(dir.join(".bmad-core/tasks/a.md").is_file());
        assert!(dir.join(".ade/rules.md").is_file());
        assert!(r.created_dirs.contains(&dir.join(".bmad-core").join("tasks")), "{:?}", r.created_dirs);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn a_v4_setup_writes_the_marker_and_counts_it() {
        let dir = temp();
        let src = v4_source();
        let r = run(&dir, &files(), None, "<!-- m -->", Methodology::V4, Some(&src)).unwrap();

        assert_eq!(std::fs::read_to_string(dir.join(".ade/methodology")).unwrap().trim(), "v4");
        // core-config.yaml, tasks/a.md, VERSION, the marker.
        assert_eq!(r.bmad_files, 4, "{:?}", r.created);
        assert!(r.created.contains(&dir.join(".ade").join("methodology").to_string_lossy().into_owned()), "{:?}", r.created);
        let status = project_setup_status(dir.to_string_lossy().into(), vec![], "<!-- m -->".into()).unwrap();
        assert_eq!(status.methodology.as_deref(), Some("v4"));
        assert!(status.bmad_installed);

        // A project from before the marker: `.bmad-core/` only. Its next setup writes it.
        let old = temp();
        std::fs::create_dir_all(old.join(".bmad-core")).unwrap();
        let again = run(&old, &files(), None, "<!-- m -->", Methodology::V4, Some(&src)).unwrap();
        assert_eq!(std::fs::read_to_string(old.join(".ade/methodology")).unwrap().trim(), "v4");
        assert!(again.created.contains(&old.join(".ade").join("methodology").to_string_lossy().into_owned()));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(old).ok();
        std::fs::remove_dir_all(src).ok();
    }

    // ---- The BMAD paragraph of an existing CLAUDE.md ----

    const OLD_ONE_LINE: &str = "- **BMAD** personas and tasks: the `/BMad:` slash commands (`.bmad-core/`).";
    const OLD_LONGER: &str = "- **BMAD** personas and tasks: the `/BMad:` slash commands (`.bmad-core/`). These are\n  optional helpers. The ADE rules always win.";
    const V4_PARAGRAPH: &str = "- **BMAD v4** tasks: the `/BMad:tasks:` slash commands\n  (`.bmad-core/`). These are optional helpers.";
    const V6_PARAGRAPH: &str = "- **BMAD v6** is how work is done in this project. Use its skills in\n  `.claude/skills/`; their work lives in `_bmad-output/`.";
    const BMAD_IMPORT: &str = "\n\n<!-- m -->\n@.ade/rules.md\n";

    fn section(paragraph: &str) -> String {
        format!("<!-- ade:bmad -->\n## BMAD\n\n{paragraph}\n<!-- /ade:bmad -->\n")
    }

    /// What the frontend sends for a project on `methodology`.
    fn bmad(methodology: Methodology) -> BmadText {
        let paragraphs = [V6_PARAGRAPH, V4_PARAGRAPH, OLD_ONE_LINE, OLD_LONGER];
        let paragraph = if methodology == Methodology::V4 { V4_PARAGRAPH } else { V6_PARAGRAPH };
        BmadText {
            paragraph: paragraph.to_string(),
            section: section(paragraph),
            paragraphs: paragraphs.iter().map(|p| p.to_string()).collect(),
            sections: paragraphs.iter().map(|p| section(p)).collect(),
            open: "<!-- ade:bmad -->".to_string(),
            close: "<!-- /ade:bmad -->".to_string(),
        }
    }

    /// A CLAUDE.md as ADE wrote it, around `paragraph`, with the import a
    /// setup of the time put in it.
    fn claude_with(paragraph: &str) -> String {
        format!("# CLAUDE.md: working in shop\n\n@.ade/rules.md\n\n## Agents and commands\n- **Sub-agents** in `.claude/agents/`.\n{paragraph}\n- `qa` can write.\n\n## Project layout\n- `docs/prd.md`\n")
    }

    /// A full setup of a project whose CLAUDE.md reads `claude`, on `methodology`.
    fn full_setup(claude: &[u8], methodology: Methodology) -> (PathBuf, SetupReport) {
        let dir = temp();
        std::fs::write(dir.join("CLAUDE.md"), claude).unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", methodology, None, Some(&bmad(methodology)), &mut report).unwrap();
        (dir, report)
    }

    fn claude(dir: &Path) -> String {
        std::fs::read_to_string(dir.join("CLAUDE.md")).unwrap()
    }

    /// Undo, as the toast's button asks for it.
    fn undo(dir: &Path, report: &SetupReport) {
        let import = report.appended_import.then(|| BMAD_IMPORT.to_string());
        project_setup_undo(dir.to_string_lossy().into(), report.created.clone(), files(), import, report.claude_md.clone()).unwrap();
    }

    fn edit(report: &SetupReport) -> (&str, Option<&str>) {
        let edit = report.claude_md.as_ref().expect("the report records the edit");
        (edit.status.as_str(), edit.reason.as_deref())
    }

    #[test]
    fn a_new_project_gets_claude_md_as_the_frontend_wrote_it() {
        let dir = temp();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut report).unwrap();
        assert_eq!(claude(&dir), "# new\n@.ade/rules.md\n", "written with its version's paragraph, which the files carry");
        assert_eq!(report.claude_md, None, "nothing was edited");
        assert!(!report.appended_import);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_shipped_paragraph_is_replaced_and_every_other_byte_kept() {
        for (old, to, new) in [
            (OLD_ONE_LINE, Methodology::V6, V6_PARAGRAPH),
            (OLD_LONGER, Methodology::V6, V6_PARAGRAPH),
            (V4_PARAGRAPH, Methodology::V6, V6_PARAGRAPH),
            (V6_PARAGRAPH, Methodology::V4, V4_PARAGRAPH),
            (OLD_LONGER, Methodology::V4, V4_PARAGRAPH),
        ] {
            let before = claude_with(old);
            let (dir, report) = full_setup(before.as_bytes(), to);
            assert_eq!(claude(&dir), claude_with(new), "{old}");
            assert_eq!(edit(&report), ("replaced", None));
            let recorded = report.claude_md.as_ref().unwrap();
            assert_eq!((recorded.before.as_str(), recorded.after.as_str()), (before.as_str(), claude_with(new).as_str()));
            assert!(!report.appended_import, "it loads the rules already");

            undo(&dir, &report);
            assert_eq!(claude(&dir), before, "Undo puts the paragraph back");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn a_failed_setups_cleanup_puts_the_paragraph_back() {
        let before = claude_with(V4_PARAGRAPH);
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        assert_ne!(claude(&dir), before);
        assert!(take_back(&dir, &report, &files(), Some(BMAD_IMPORT)).is_empty());
        assert_eq!(claude(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn an_edited_paragraph_is_kept_and_a_marked_section_added() {
        // The person reworded the paragraph ADE wrote: it is theirs now.
        let before = claude_with("- **BMAD** tasks: the `/BMad:` commands. We only use the QA ones.");
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        assert_eq!(claude(&dir), format!("{before}\n{}", section(V6_PARAGRAPH)), "every byte kept, the section at the end");
        assert_eq!(edit(&report), ("appended", Some("edited")), "the old BMAD lines need removing by hand");

        undo(&dir, &report);
        assert_eq!(claude(&dir), before, "Undo removes the section");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_shipped_paragraph_with_words_added_to_it_is_an_edited_one() {
        // The first line is a shipped paragraph's; the bullet is not.
        let before = claude_with(&format!("{OLD_ONE_LINE} Ask Sam first."));
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        assert!(claude(&dir).starts_with(&before));
        assert_eq!(edit(&report), ("appended", Some("edited")));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_shipped_paragraph_with_a_line_added_below_it_is_an_edited_one() {
        for eol in ["\n", "\r\n"] {
            for old in [OLD_ONE_LINE, V4_PARAGRAPH] {
                // Every line ADE wrote is there; the bullet goes on.
                let before = claude_with(&format!("{old}\n  We only use the QA ones.")).replace('\n', eol);
                let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
                assert_eq!(claude(&dir), format!("{before}{eol}{}", section(V6_PARAGRAPH).replace('\n', eol)), "kept, and the section added");
                assert_eq!(edit(&report), ("appended", Some("edited")));
                std::fs::remove_dir_all(dir).ok();
            }
            // A blank line, or a line that isn't indented, is not the bullet's.
            for below in ["\n\nNotes.", "\nNotes."] {
                let before = claude_with(&format!("{OLD_ONE_LINE}{below}")).replace('\n', eol);
                let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
                assert_eq!(claude(&dir), claude_with(&format!("{V6_PARAGRAPH}{below}")).replace('\n', eol));
                assert_eq!(edit(&report), ("replaced", None));
                std::fs::remove_dir_all(dir).ok();
            }
        }
    }

    /// The paragraphs as the app sends them: generated from the frontend's
    /// exports, and scripts/bmadTextFixture.test.ts fails when it is stale.
    fn shipped(methodology: Methodology) -> BmadText {
        let all: serde_json::Value = serde_json::from_str(include_str!("fixtures/bmad-text.json")).unwrap();
        serde_json::from_value(all[methodology.as_str()].clone()).unwrap()
    }

    #[test]
    fn every_shipped_paragraph_is_brought_to_each_version() {
        for to in [Methodology::V6, Methodology::V4] {
            let bmad = shipped(to);
            assert!(bmad.paragraphs.len() >= 6 && bmad.sections.len() == bmad.paragraphs.len());
            assert!(bmad.paragraph.starts_with(&format!("- **BMAD {}**", to.as_str())), "{}", bmad.paragraph);
            for eol in ["\n", "\r\n"] {
                let wanted = claude_with(&bmad.paragraph).replace('\n', eol);
                for (old, old_section) in bmad.paragraphs.iter().zip(&bmad.sections) {
                    // As ADE wrote it into its own CLAUDE.md.
                    let before = claude_with(old).replace('\n', eol);
                    let after = match bmad_edit(&before, &bmad).unwrap() {
                        Some(edit) => {
                            assert_eq!((edit.status.as_str(), edit.reason.as_deref()), ("replaced", None), "{old}");
                            edit.after
                        }
                        None => before.clone(),
                    };
                    assert_eq!(after, wanted, "{old}");
                    assert_eq!(after.lines().filter(|line| line.starts_with(BMAD_LINE)).count(), 1);
                    assert_eq!(bmad_edit(&after, &bmad).unwrap(), None, "nothing left to do");

                    // As a marked section in someone's own file.
                    let before = format!("# Mine\n@.ade/rules.md\n\n{old_section}").replace('\n', eol);
                    let after = bmad_edit(&before, &bmad).unwrap().map_or(before.clone(), |edit| edit.after);
                    assert_eq!(after, format!("# Mine\n@.ade/rules.md\n\n{}", bmad.section).replace('\n', eol), "{old}");
                }
            }
        }
    }

    #[test]
    fn a_claude_md_with_no_paragraph_gains_the_section_before_the_import() {
        let (dir, report) = full_setup(b"# Mine\n", Methodology::V6);
        assert_eq!(claude(&dir), format!("# Mine\n\n{}{BMAD_IMPORT}", section(V6_PARAGRAPH)));
        assert_eq!(edit(&report), ("appended", None), "nothing to warn about");
        assert!(report.appended_import);

        undo(&dir, &report);
        assert_eq!(claude(&dir), "# Mine\n");
        std::fs::remove_dir_all(dir).ok();

        // No line end at the end of the file: the section still starts its own line.
        let (dir, report) = full_setup(b"# Mine", Methodology::V4);
        assert_eq!(claude(&dir), format!("# Mine\n\n{}{BMAD_IMPORT}", section(V4_PARAGRAPH)));
        assert!(take_back(&dir, &report, &files(), Some(BMAD_IMPORT)).is_empty());
        assert_eq!(claude(&dir), "# Mine");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_marked_section_of_the_other_version_is_replaced() {
        // Set up on v4 at an earlier switch; the import is in the file since.
        let before = format!("# Mine\n\n{}{BMAD_IMPORT}Notes of my own.\n", section(V4_PARAGRAPH));
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        assert_eq!(claude(&dir), format!("# Mine\n\n{}{BMAD_IMPORT}Notes of my own.\n", section(V6_PARAGRAPH)));
        assert_eq!(edit(&report), ("replaced", None));

        undo(&dir, &report);
        assert_eq!(claude(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_marked_section_someone_edited_is_left_and_said() {
        let before = format!("# Mine\n\n<!-- ade:bmad -->\n## BMAD\n\n{V4_PARAGRAPH}\nAnd ask Sam.\n<!-- /ade:bmad -->\n@.ade/rules.md\n");
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        assert_eq!(claude(&dir), before);
        assert_eq!(edit(&report), ("skipped", Some("edited-section")));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_claude_md_that_is_already_current_is_not_written() {
        for current in [claude_with(V6_PARAGRAPH), format!("# Mine\n\n{}{BMAD_IMPORT}", section(V6_PARAGRAPH)), format!("# Mine\n@.ade/rules.md\n\n{}", section(V6_PARAGRAPH).trim_end())] {
            let dir = temp();
            let path = dir.join("CLAUDE.md");
            std::fs::write(&path, &current).unwrap();
            // Read-only: a write would be refused and reported.
            let mut permissions = std::fs::metadata(&path).unwrap().permissions();
            permissions.set_readonly(true);
            std::fs::set_permissions(&path, permissions).unwrap();
            let modified = std::fs::metadata(&path).unwrap().modified().unwrap();

            let mut report = SetupReport::default();
            apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut report).unwrap();

            assert_eq!(report.claude_md, None, "nothing reported");
            assert_eq!(claude(&dir), current);
            assert_eq!(std::fs::metadata(&path).unwrap().modified().unwrap(), modified);
            #[allow(clippy::permissions_set_readonly_false)]
            {
                let mut permissions = std::fs::metadata(&path).unwrap().permissions();
                permissions.set_readonly(false);
                std::fs::set_permissions(&path, permissions).unwrap();
            }
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn a_second_setup_finds_nothing_left_to_edit() {
        for start in [claude_with(OLD_LONGER), "# Mine\n".to_string(), claude_with("- **BMAD** my own words.")] {
            let (dir, first) = full_setup(start.as_bytes(), Methodology::V6);
            assert!(first.claude_md.is_some());
            let after = claude(&dir);
            let mut again = SetupReport::default();
            apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut again).unwrap();
            assert_eq!(again.claude_md, None);
            assert_eq!(claude(&dir), after);
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn a_paragraph_with_windows_line_ends_is_replaced_and_keeps_them() {
        let crlf = |text: &str| text.replace('\n', "\r\n");
        let before = crlf(&claude_with(V4_PARAGRAPH));
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        assert_eq!(claude(&dir), crlf(&claude_with(V6_PARAGRAPH)));
        assert_eq!(edit(&report), ("replaced", None));
        undo(&dir, &report);
        assert_eq!(claude(&dir), before);
        std::fs::remove_dir_all(dir).ok();

        // A section added to such a file has its line ends too.
        let (dir, report) = full_setup(b"# Mine\r\n@.ade/rules.md\r\n", Methodology::V6);
        assert_eq!(claude(&dir), format!("# Mine\r\n@.ade/rules.md\r\n\r\n{}", crlf(&section(V6_PARAGRAPH))));
        undo(&dir, &report);
        assert_eq!(claude(&dir), "# Mine\r\n@.ade/rules.md\r\n");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_claude_md_that_is_not_utf8_is_left_and_said() {
        let mut before = claude_with(V4_PARAGRAPH).into_bytes();
        before.extend([0xff, 0xfe, b'\n']);
        let (dir, report) = full_setup(&before, Methodology::V6);
        assert_eq!(edit(&report), ("skipped", Some("not-utf8")));
        // The import is appended as it always was to a file that can't be
        // read as text; no byte the file had is changed.
        assert!(report.appended_import);
        before.extend(BMAD_IMPORT.as_bytes());
        assert_eq!(std::fs::read(dir.join("CLAUDE.md")).unwrap(), before);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_claude_md_holding_a_paragraph_twice_is_left_and_said() {
        for before in [
            format!("{}\n{OLD_ONE_LINE}\n", claude_with(V4_PARAGRAPH)),
            format!("{}\n{}", claude_with(V4_PARAGRAPH), section(V4_PARAGRAPH)),
            format!("# Mine\n@.ade/rules.md\n{}\n{}", section(V4_PARAGRAPH), section(V4_PARAGRAPH)),
        ] {
            let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
            assert_eq!(claude(&dir), before);
            assert_eq!(edit(&report), ("skipped", Some("twice")));
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_claude_md_that_is_a_link_is_left_and_said() {
        let shared = temp();
        let before = claude_with(V4_PARAGRAPH);
        std::fs::write(shared.join("AGENTS.md"), &before).unwrap();
        let dir = temp();
        std::os::unix::fs::symlink(shared.join("AGENTS.md"), dir.join("CLAUDE.md")).unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut report).unwrap();
        assert_eq!(edit(&report), ("skipped", Some("link")));
        assert!(std::fs::symlink_metadata(dir.join("CLAUDE.md")).unwrap().file_type().is_symlink(), "still a link");
        assert_eq!(std::fs::read_to_string(shared.join("AGENTS.md")).unwrap(), before, "what it leads to is untouched");

        // A link to a file that already reads right: there is nothing to say.
        std::fs::write(shared.join("AGENTS.md"), claude_with(V6_PARAGRAPH)).unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut report).unwrap();
        assert_eq!(report.claude_md, None);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(shared).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_read_only_claude_md_is_left_and_said() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let path = dir.join("CLAUDE.md");
        let before = claude_with(V4_PARAGRAPH);
        std::fs::write(&path, &before).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o444)).unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut report).unwrap();
        assert_eq!(edit(&report), ("skipped", Some("read-only")));
        assert_eq!(claude(&dir), before);
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o444);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn an_edit_keeps_the_files_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let path = dir.join("CLAUDE.md");
        std::fs::write(&path, claude_with(V4_PARAGRAPH)).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let mut report = SetupReport::default();
        apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V6, None, Some(&bmad(Methodology::V6)), &mut report).unwrap();
        assert_eq!(edit(&report).0, "replaced");
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(names(&dir).iter().filter(|name| name.contains("CLAUDE.md")).count(), 1, "no temporary file is left: {:?}", names(&dir));
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn an_edit_whose_permissions_cannot_be_put_back_is_still_recorded() {
        use std::os::unix::fs::PermissionsExt;
        // The content is written, so the write succeeded whatever happens to
        // the mode: nothing after the rename may undo the record.
        let dir = temp();
        let path = dir.join("CLAUDE.md");
        std::fs::write(&path, "old").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();
        write_claude_md(&path, "new").unwrap();
        assert_eq!(claude(&dir), "new");
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o640);
        let source = lf(include_str!("projectsetup.rs"));
        let write = body(&source, "fn write_claude_md(");
        assert!(write.contains("let _ = std::fs::set_permissions("), "a failure to restore permissions must not be the write's error");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_claude_md_that_cannot_be_read_when_the_edit_is_taken_back_is_an_error() {
        use std::os::unix::fs::PermissionsExt;
        let before = claude_with(V4_PARAGRAPH);
        let (dir, report) = full_setup(before.as_bytes(), Methodology::V6);
        let path = dir.join("CLAUDE.md");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read(&path).is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        let failed = take_back(&dir, &report, &[], Some(BMAD_IMPORT));
        let undone = project_setup_undo(dir.to_string_lossy().into(), vec![], files(), None, report.claude_md.clone());
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(failed.len(), 1, "{failed:?}");
        assert!(failed[0].starts_with("couldn't check CLAUDE.md for the BMAD paragraph setup wrote, which may still be in it: "), "{failed:?}");
        assert_eq!(undone.unwrap_err(), failed[0]);
        assert_eq!(claude(&dir), claude_with(V6_PARAGRAPH), "left as it was");

        // A file that is gone is not one.
        std::fs::remove_file(&path).unwrap();
        assert!(take_back(&dir, &report, &[], Some(BMAD_IMPORT)).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_claude_md_saved_after_the_edit_is_kept_by_undo_and_by_cleanup() {
        for start in [claude_with(V4_PARAGRAPH), "# Mine\n".to_string()] {
            // Undo.
            let (dir, report) = full_setup(start.as_bytes(), Methodology::V6);
            let theirs = format!("{}\nA line the person added.\n", claude(&dir));
            std::fs::write(dir.join("CLAUDE.md"), &theirs).unwrap();
            undo(&dir, &report);
            assert_eq!(claude(&dir), theirs, "their version is kept");
            std::fs::remove_dir_all(dir).ok();

            // A failed setup's cleanup, and a switch's rollback.
            let (dir, report) = full_setup(start.as_bytes(), Methodology::V6);
            let theirs = claude(&dir).replacen('#', "# Edited:", 1);
            std::fs::write(dir.join("CLAUDE.md"), &theirs).unwrap();
            assert!(take_back(&dir, &report, &files(), Some(BMAD_IMPORT)).is_empty(), "keeping it is not a failure");
            assert_eq!(claude(&dir), theirs.strip_suffix(BMAD_IMPORT).unwrap_or(&theirs));
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn a_setup_that_fails_after_the_edit_has_recorded_it_and_puts_it_back() {
        let src = v4_source();
        for start in [claude_with(V6_PARAGRAPH), "# Mine\n".to_string()] {
            let broken = |dir: &Path| {
                std::fs::write(dir.join("CLAUDE.md"), &start).unwrap();
                // A file where the install needs a folder: its copy fails partway.
                std::fs::create_dir_all(dir.join(".bmad-core")).unwrap();
                std::fs::write(dir.join(".bmad-core/tasks"), "mine").unwrap();
            };
            // The report holds the edit when the error comes back.
            let dir = temp();
            broken(&dir);
            let mut report = SetupReport::default();
            apply(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V4, Some(&src), Some(&bmad(Methodology::V4)), &mut report).unwrap_err();
            let recorded = report.claude_md.clone().expect("recorded before the install ran");
            assert_eq!(recorded.before, start);
            assert_ne!(claude(&dir), start, "the edit was made");
            assert!(claude(&dir).starts_with(&recorded.after));
            std::fs::remove_dir_all(dir).ok();

            // And the setup command takes it back.
            let dir = temp();
            broken(&dir);
            assert!(apply_or_clean(&dir, &files(), Some(BMAD_IMPORT), "<!-- m -->", Methodology::V4, Some(&src), Some(&bmad(Methodology::V4))).is_err());
            assert_eq!(claude(&dir), start);
            assert_eq!(names(&dir), [".bmad-core", "CLAUDE.md"]);
            std::fs::remove_dir_all(dir).ok();
        }
        std::fs::remove_dir_all(src).ok();
    }

    #[test]
    fn adding_agents_never_writes_claude_md() {
        let dir = temp();
        let before = claude_with(V4_PARAGRAPH);
        std::fs::write(dir.join("CLAUDE.md"), &before).unwrap();
        let modified = std::fs::metadata(dir.join("CLAUDE.md")).unwrap().modified().unwrap();
        // The paragraphs are sent all the same: only a full setup uses them.
        let report = set_up(&dir, &files(), BMAD_IMPORT, "<!-- m -->", Some(&bmad(Methodology::V6)), Methodology::V6, false, |_| None).unwrap();
        assert_eq!(report.claude_md, None);
        assert_eq!(claude(&dir), before);
        assert_eq!(std::fs::metadata(dir.join("CLAUDE.md")).unwrap().modified().unwrap(), modified);

        // A full setup of the same project does.
        let v6 = v6_source(true);
        let report = set_up(&dir, &files(), BMAD_IMPORT, "<!-- m -->", Some(&bmad(Methodology::V6)), Methodology::V6, true, |_| Some(v6.clone())).unwrap();
        assert_eq!(edit(&report), ("replaced", None));
        assert_eq!(claude(&dir), claude_with(V6_PARAGRAPH));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(v6).ok();
    }

    #[cfg(unix)]
    #[test]
    fn adding_agents_never_reads_claude_md() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        let path = dir.join("CLAUDE.md");
        std::fs::write(&path, claude_with(V4_PARAGRAPH)).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read(&path).is_ok() {
            eprintln!("skipped: the mode does not bite here (running as root)");
            return;
        }
        // A full setup would say it couldn't read the file.
        let mut full = SetupReport::default();
        edit_claude_md(&dir, &bmad(Methodology::V6), &mut full);
        assert!(edit(&full).1.unwrap_or_default().starts_with("it couldn't be read"), "{:?}", full.claude_md);

        let report = set_up(&dir, &files(), BMAD_IMPORT, "<!-- m -->", Some(&bmad(Methodology::V6)), Methodology::V6, false, |_| None).unwrap();
        assert_eq!(report.claude_md, None);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_report_names_the_edit_as_the_frontend_reads_it() {
        let (dir, report) = full_setup(claude_with(V4_PARAGRAPH).as_bytes(), Methodology::V6);
        let json = serde_json::to_value(&report).unwrap();
        assert_eq!(json["claudeMd"]["status"], "replaced");
        assert_eq!(json["claudeMd"]["reason"], serde_json::Value::Null);
        assert_eq!(json["claudeMd"]["before"], claude_with(V4_PARAGRAPH));
        assert_eq!(json["claudeMd"]["after"], claude_with(V6_PARAGRAPH));
        // And Undo takes it back as it was sent.
        let back: ClaudeEdit = serde_json::from_value(json["claudeMd"].clone()).unwrap();
        assert_eq!(Some(back), report.claude_md);
        assert_eq!(serde_json::to_value(SetupReport::default()).unwrap()["claudeMd"], serde_json::Value::Null);
        std::fs::remove_dir_all(dir).ok();
    }
}
