//! Switching a project's BMAD version. The old version's files move into
//! `.ade/archive/bmad-<from>-<date>/` inside the project, then the other
//! version is set up fresh. Nothing is deleted.
//!
//! `ARCHIVE.md` in the archive is the journal. It is written before the first
//! move, so a switch that was interrupted can be finished by hand, and its
//! front matter is how ADE knows one didn't finish.

use crate::bmadconfig::V4Paths;
use crate::bmadv6::Methodology;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

/// Where archives live, project-relative.
pub(crate) const ARCHIVE_DIR: &str = ".ade/archive";
/// The journal inside each archive.
pub(crate) const JOURNAL: &str = "ARCHIVE.md";

/// A project-relative, `/`-separated path, under `root`.
pub(crate) fn at(root: &Path, rel: &str) -> PathBuf {
    rel.split('/').filter(|s| !s.is_empty()).fold(root.to_path_buf(), |p, s| p.join(s))
}

/// One path a switch moves. Both ends are project-relative and `/`-separated.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Move {
    pub from: String,
    pub to: String,
    pub files: u32,
    /// What git ignores of it today: "none", "some" or "all".
    pub ignored: String,
}

/// The journal leads the disk: a move is written `Moving` before its rename
/// and `Moved` after it, so after a crash the journal never names fewer moves
/// than happened. A `Moving` path may be at either end.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum MoveState {
    Pending,
    Moving,
    Moved,
    MovedBack,
}

impl MoveState {
    fn label(self) -> &'static str {
        match self {
            MoveState::Pending => "pending",
            MoveState::Moving => "moving",
            MoveState::Moved => "moved",
            MoveState::MovedBack => "moved back",
        }
    }
}

/// `ARCHIVE.md`: what a switch set out to do and how far it got.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Journal {
    /// in-progress | complete | incomplete | abandoned
    pub status: &'static str,
    /// moving | setup | rules | done
    pub phase: &'static str,
    pub from: String,
    pub to: String,
    pub date: String,
    /// (from, to, state), in the order they are moved.
    pub moves: Vec<(String, String, MoveState)>,
}

/// Front matter is line-oriented: a newline or control character in a value
/// could start a line of its own, such as a later `status:` that wins.
fn clean(value: &str) -> String {
    value.chars().filter(|c| !c.is_control()).collect()
}

impl Journal {
    pub(crate) fn new(from: &str, to: &str, date: &str, moves: &[Move]) -> Self {
        Journal {
            status: "in-progress",
            phase: "moving",
            from: clean(from),
            to: clean(to),
            date: clean(date),
            moves: moves.iter().map(|m| (m.from.clone(), m.to.clone(), MoveState::Pending)).collect(),
        }
    }

    pub(crate) fn render(&self) -> String {
        let (old, new, date) = (clean(&self.from), clean(&self.to), clean(&self.date));
        let mut out = format!(
            "---\nstatus: {}\nphase: {}\nfrom: {old}\nto: {new}\ndate: {date}\n---\n\n\
             # BMAD {old}, archived on {date}\n\n\
             ADE moved this project's BMAD {old} files here when it switched the project to BMAD {new}.\n\
             This folder is read-only history. Paths inside it mirror the project.\n\n\
             ## Moves\n\n",
            self.status, self.phase
        );
        for (src, dst, state) in &self.moves {
            out.push_str(&format!("- `{src}` → `{dst}`: {}\n", state.label()));
        }
        if self.moves.is_empty() {
            out.push_str("Nothing was moved.\n");
        }
        out.push_str(&format!(
            "\n## To go back to BMAD {old}\n\n\
             1. Run **BMAD: Switch to {old}…** from the command palette. It archives BMAD {new} the same way.\n\
             2. Move the paths in this archive back to their places, replacing the fresh role files in `.claude/agents/` and `.ade/methodology`.\n\
             3. Run `git add -A`. Git usually shows tracked files as renames.\n\n\
             ## To finish an interrupted switch by hand\n\n\
             While `status` above is `in-progress` or `incomplete`, ADE neither sets this project up nor switches it.\n\n\
             {}\n"
        , self.hand_instructions()));
        out
    }

    /// What a person does by hand. While the switch is running, `phase` says
    /// how far it got. Once it is `incomplete`, a restore step failed after the
    /// phase was set, so `phase` no longer says what is where: the moves do.
    fn hand_instructions(&self) -> String {
        let new = clean(&self.to);
        match self.status {
            "in-progress" => format!(
                "Look at `phase` above:\n\n\
                 - `phase: moving`: a path marked *moving* may be at either place, so check both. \
                 Move each path marked *moving* or *moved* back to its place if it is in this archive.\n\
                 - `phase: setup`: every path was moved. BMAD {new}'s files may be partly written at the old paths. \
                 Remove them first, then move the archive's paths back.\n\
                 - `phase: rules` or `phase: done`: the switch finished and there is nothing to undo. \
                 Set `status: complete` above.\n\n\
                 Otherwise, when you have moved everything back, set `status: abandoned` above."
            ),
            "incomplete" => "A restore step failed, so ignore `phase` and use each move's state in the list above:\n\n\
                 - marked *moved*: it is in this archive. Move it back to its place.\n\
                 - marked *moving*: it may be at either place, so check both.\n\
                 - marked *moved back* or *pending*: it is at its original place.\n\n\
                 BMAD's files written at the old paths by the new version may still be there. \
                 Remove them before moving a path back. Then set `status: abandoned` above."
                .to_string(),
            _ => "This switch is no longer open. There is nothing to do.".to_string(),
        }
    }

    pub(crate) fn write(&self, archive: &Path) -> Result<(), String> {
        let path = archive.join(JOURNAL);
        crate::state::atomic_write(&path, &self.render()).map_err(|e| format!("{}: {e}", path.display()))
    }
}

/// The `key: value` lines between a file's opening `---` and the next one.
pub(crate) fn front_matter(text: &str) -> Option<HashMap<String, String>> {
    // A Windows editor may add a byte order mark when a person edits the file.
    let mut lines = text.strip_prefix('\u{feff}').unwrap_or(text).lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    let mut out = HashMap::new();
    for line in lines {
        if line.trim_end() == "---" {
            return Some(out);
        }
        if let Some((key, value)) = line.split_once(':') {
            out.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    None
}

/// A switch that started and didn't finish.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingSwitch {
    /// The archive folder, project-relative.
    pub archive: String,
    pub status: String,
    pub phase: String,
    pub from: String,
    pub to: String,
    pub date: String,
}

/// The switches in `.ade/archive/` whose journal says `in-progress` or
/// `incomplete`. After a crash the project may have neither version on disk,
/// so these block both another switch and setup.
pub(crate) fn pending(root: &Path) -> Vec<PendingSwitch> {
    let dir = at(root, ARCHIVE_DIR);
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        // Can't tell what is in there, and a switch may be: block.
        Err(_) => return vec![unknown(ARCHIVE_DIR.to_string())],
    };
    let mut out = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else {
            out.push(unknown(ARCHIVE_DIR.to_string()));
            continue;
        };
        let archive = format!("{ARCHIVE_DIR}/{}", entry.file_name().to_string_lossy());
        match std::fs::metadata(entry.path()) {
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => continue,
            // A dangling link is nothing to read.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => {
                out.push(unknown(archive));
                continue;
            }
        }
        let text = match std::fs::read_to_string(entry.path().join(JOURNAL)) {
            Ok(text) => text,
            // A folder with no journal is not one of ours.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => {
                out.push(unknown(archive));
                continue;
            }
        };
        let Some(fm) = front_matter(&text) else {
            out.push(unknown(archive));
            continue;
        };
        let get = |key: &str| fm.get(key).cloned().unwrap_or_default();
        let status = get("status");
        match status.as_str() {
            "complete" | "abandoned" => continue,
            "in-progress" | "incomplete" => {}
            _ => {
                out.push(unknown(archive));
                continue;
            }
        }
        out.push(PendingSwitch {
            archive,
            status,
            phase: get("phase"),
            from: get("from"),
            to: get("to"),
            date: get("date"),
        });
    }
    out.sort_by(|a, b| a.archive.cmp(&b.archive));
    out
}

/// A journal that exists but can't be read or understood. It may belong to a
/// switch that didn't finish, so it blocks like one.
fn unknown(archive: String) -> PendingSwitch {
    let unknown = || "unknown".to_string();
    PendingSwitch { archive, status: unknown(), phase: unknown(), from: unknown(), to: unknown(), date: unknown() }
}

/// The one way the frontend reads the archive: which switches didn't finish.
#[tauri::command(async)]
pub fn bmad_switch_pending(root: String) -> Vec<PendingSwitch> {
    pending(Path::new(&root))
}

/// The core roles' names: `ROLES` in src/lib/projectMethodology.ts, whose role
/// files setup writes as `.claude/agents/<name>.md`. The plan command gets no
/// file list, so it carries the names; scripts/switchFixtures.test.ts fails
/// when the two lists differ.
pub(crate) const CORE_ROLES: [&str; 8] = ["product-manager", "architect", "designer", "scrum-master", "developer", "qa", "devops", "adversarial-reviewer"];

/// Documents BMAD v4's own templates write, beside the configured locations.
const V4_TEMPLATE_OUTPUTS: [&str; 8] = [
    "docs/brief.md",
    "docs/project-brief.md",
    "docs/front-end-spec.md",
    "docs/ui-architecture.md",
    "docs/brownfield-architecture.md",
    "docs/market-research.md",
    "docs/competitor-analysis.md",
    "docs/brainstorming-session-results.md",
];

/// What both versions use, so a switch leaves it where it is. A planned move
/// that is one of these, or holds one, would take it along.
const STAYS: [&str; 9] =
    [".ade/rules.md", ".ade/context", ".ade/session.md", ".ade/knowledge", "CLAUDE.md", "llms.txt", ".claude/settings.json", ".claude", ".ade"];

/// The most entries one path's file count looks at. A moved folder can hold a
/// `node_modules`; the dialog must not wait on it. A count that reaches this
/// is "at least this many".
const COUNT_LIMIT: u32 = 50_000;

/// One of the person's documents, which stays unless they tick it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub files: u32,
    pub ticked: bool,
    /// What moving it would cost, for the two files ADE's rules name.
    pub warning: Option<String>,
}

/// Something the switch leaves where it is, and why.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub path: String,
    pub reason: String,
}

/// What a switch would do. The dialog shows it; apply checks it again.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchPlan {
    /// "v4" or "v6"; empty when the project has no BMAD.
    pub from: String,
    pub to: String,
    /// The archive folder, project-relative.
    pub archive: String,
    pub moves: Vec<Move>,
    /// What stays unless ticked: the v4 document locations (v4 → v6), or a v6
    /// output folder that holds documents (v6 → v4).
    pub documents: Vec<Document>,
    pub leftovers: Vec<Move>,
    pub left_in_place: Vec<Note>,
    /// `None`: git is missing or failed.
    pub dirty: Option<bool>,
    pub archive_ignored: Option<bool>,
    /// Why the switch can't go ahead.
    pub blocked: Option<String>,
}

/// What a switch needs from outside the project. Tests swap each part.
pub(crate) struct Env {
    /// The git program. A name that doesn't exist is a machine without git.
    pub git: &'static str,
    /// Each version's bundled resources, when they resolve.
    pub v4_src: Option<PathBuf>,
    pub v6_src: Option<PathBuf>,
    /// Today, `YYYY-MM-DD`.
    pub today: String,
    /// The device a path is on, where that can be known.
    pub device: fn(&Path) -> Option<u64>,
}

/// Exists, a link that points nowhere included: a link is moved as the link.
pub(crate) fn present(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// Unix `st_dev`: a rename can't cross devices. Unknown elsewhere, where the
/// rename itself reports it.
pub(crate) fn device_of(path: &Path) -> Option<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        std::fs::symlink_metadata(path).ok().map(|m| m.dev())
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

/// Days since 1970-01-01 as `YYYY-MM-DD` (Howard Hinnant's algorithm, the
/// inverse of the one usage.rs reads dates with).
pub(crate) fn civil_date(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Today in UTC: the crate has no time-zone data, and the date only names a folder.
pub(crate) fn today() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    civil_date((secs / 86_400) as i64)
}

/// Files under `path`, links not followed: a link counts as the one thing it
/// is. Stops once it has looked at `limit` entries, folders included, so a
/// huge tree costs no more than a large one.
fn count_up_to(path: &Path, limit: u32) -> u32 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if !meta.is_dir() {
        return 1;
    }
    let (mut files, mut seen) = (0u32, 0u32);
    let mut folders = vec![path.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let Ok(entries) = std::fs::read_dir(&folder) else { continue };
        for entry in entries.flatten() {
            if seen >= limit {
                return files;
            }
            seen += 1;
            // `file_type` is the entry's own type: a linked folder is a link.
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                folders.push(entry.path());
            } else {
                files += 1;
            }
        }
    }
    files
}

fn count_files(path: &Path) -> u32 {
    count_up_to(path, COUNT_LIMIT)
}

/// `path` with `.` and `..` folded, without touching the disk: a configured
/// location need not exist.
fn lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// A path's components joined with `/`, the way the plan spells every path.
fn slashed(rel: &Path) -> String {
    rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/")
}

/// `path` with every link in it resolved, as far as it exists.
fn resolved(path: &Path) -> PathBuf {
    let mut rest = Vec::new();
    let mut here = path;
    loop {
        if let Ok(real) = std::fs::canonicalize(here) {
            return rest.iter().rev().fold(real, |p, name| p.join(name));
        }
        match (here.parent(), here.file_name()) {
            (Some(parent), Some(name)) => {
                rest.push(name);
                here = parent;
            }
            _ => return path.to_path_buf(),
        }
    }
}

/// Where a configured location is: project-relative, or its absolute path
/// when that is outside the project.
#[derive(Debug, PartialEq)]
enum Located {
    Inside(String),
    Outside(String),
}

/// An absolute path under the root is project-relative: v6's own setup writes
/// `output_folder` as an absolute path. Paths are compared a component at a
/// time, never as text: `/code/shop2` is not inside `/code/shop`, and on
/// Windows the configured value mixes `\` and `/`.
fn locate(root: &Path, configured: &str) -> Located {
    let given = Path::new(configured.trim());
    let abs = lexical(&if given.is_absolute() { given.to_path_buf() } else { root.join(given) });
    if let Ok(rel) = abs.strip_prefix(lexical(root)) {
        return Located::Inside(slashed(rel));
    }
    // The config may spell the project another way than it was opened (/tmp
    // and /private/tmp on macOS). The parent is resolved, not the path
    // itself: a path that is a link is that link.
    if let (Some(parent), Some(name), Ok(real_root)) = (abs.parent(), abs.file_name(), std::fs::canonicalize(root)) {
        if let Ok(rel) = resolved(parent).join(name).strip_prefix(&real_root) {
            return Located::Inside(slashed(rel));
        }
    }
    Located::Outside(abs.to_string_lossy().into_owned())
}

/// The project-relative path of a configured location. One outside the
/// project is never moved and never blocks: it is noted, when it exists.
fn inside(root: &Path, configured: &str, what: &str, notes: &mut Vec<Note>) -> Option<String> {
    match locate(root, configured) {
        Located::Inside(rel) => Some(rel),
        Located::Outside(abs) => {
            if present(Path::new(&abs)) && !notes.iter().any(|n| n.path == abs) {
                notes.push(Note { path: abs, reason: format!("{what} is outside the project, so it stays where it is.") });
            }
            None
        }
    }
}

/// `path` is inside `other`. Everything is inside the root (`""`).
fn nested(path: &str, other: &str) -> bool {
    if other.is_empty() {
        return !path.is_empty();
    }
    path.starts_with(&format!("{other}/"))
}

/// `path` is `other` or inside it, whatever the case of either. `.Claude` is
/// `.claude` on the disks macOS and Windows use, so what protects a path
/// protects every spelling of it. On a disk that tells them apart this only
/// refuses, or keeps, more than it had to.
fn within(path: &str, other: &str) -> bool {
    let (path, other) = (path.to_lowercase(), other.to_lowercase());
    path == other || nested(&path, &other)
}

/// Where a project's documents are: `docs`, the v4 configured locations and
/// the v4 template outputs, those inside the project. Each once, whatever the
/// case.
fn document_locations(root: &Path, paths: &V4Paths, notes: &mut Vec<Note>) -> Vec<String> {
    let configured = [
        &paths.prd_file,
        &paths.prd_sharded_location,
        &paths.architecture_file,
        &paths.architecture_sharded_location,
        &paths.dev_story_location,
        &paths.qa_location,
    ];
    let mut locations: Vec<String> = vec!["docs".to_string()];
    for location in configured.into_iter().map(String::as_str).chain(V4_TEMPLATE_OUTPUTS) {
        if let Some(rel) = inside(root, location, "This document location", notes) {
            if !locations.iter().any(|known| known.to_lowercase() == rel.to_lowercase()) {
                locations.push(rel);
            }
        }
    }
    locations
}

/// The document locations the dialog may offer. Not `docs` itself, the root,
/// or a folder that holds another location: ticking one of those would take
/// far more than the document it names.
fn documents(root: &Path, locations: &[String]) -> Vec<String> {
    locations
        .iter()
        .filter(|rel| !rel.is_empty() && rel.to_lowercase() != "docs")
        .filter(|rel| !locations.iter().any(|other| nested(other, rel)))
        .filter(|rel| present(&at(root, rel)))
        .cloned()
        .collect()
}

fn warning(path: &str) -> Option<String> {
    let what = match path {
        "docs/prd.md" => "the PRD",
        "docs/architecture.md" => "the verification command",
        _ => return None,
    };
    Some(format!("ADE's rules use this file ({what}). The new version starts without it."))
}

/// `.bmad-core/core-config.yaml`, `None` when the project has none. One that
/// is there and can't be read is an error: it may name the debug log and the
/// documents, and BMAD's defaults would stand in for them unnoticed.
fn core_config(root: &Path) -> Result<Option<String>, String> {
    const CONFIG: &str = ".bmad-core/core-config.yaml";
    match std::fs::read_to_string(at(root, CONFIG)) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{CONFIG} can't be read: {e}")),
    }
}

/// The folders in `.claude/skills/` that ADE installed: those named like a
/// bundled v6 skill, whatever the case. A person's own skills stay.
fn bundled_skills(root: &Path, v6_src: &Path) -> Vec<String> {
    let bundled: std::collections::HashSet<String> = std::fs::read_dir(v6_src.join("skills"))
        .map(|entries| entries.flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().to_lowercase()).collect())
        .unwrap_or_default();
    let mut found: Vec<String> = std::fs::read_dir(at(root, ".claude/skills"))
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|name| bundled.contains(&name.to_lowercase()))
                .map(|name| format!(".claude/skills/{name}"))
                .collect()
        })
        .unwrap_or_default();
    found.sort();
    found
}

/// The first archive name not taken: `bmad-<from>-<date>`, then `-2`, `-3`.
fn free_archive(root: &Path, from: Methodology, today: &str) -> String {
    let base = format!("{ARCHIVE_DIR}/bmad-{}-{today}", from.as_str());
    if !present(&at(root, &base)) {
        return base;
    }
    (2..).map(|n| format!("{base}-{n}")).find(|name| !present(&at(root, name))).unwrap_or(base)
}

/// What git ignores of a path today. Once it moves, a rule like
/// `/_bmad-output/` no longer matches it, so the dialog says so. The trailing
/// `/` lets a directory-only rule match.
fn ignored_of(git: &str, root: &Path, rel: &str) -> &'static str {
    let is_dir = std::fs::symlink_metadata(at(root, rel)).map(|m| m.is_dir()).unwrap_or(false);
    let spec = if is_dir { format!("{rel}/") } else { rel.to_string() };
    match crate::git::code(git, root, &["check-ignore", "-q", "--", &spec]) {
        Some(0) => "all",
        Some(1) if is_dir => {
            let inside = crate::git::run(git, root, &["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "--", &spec]);
            if inside.is_some_and(|listed| !listed.trim().is_empty()) {
                "some"
            } else {
                "none"
            }
        }
        _ => "none",
    }
}

/// What a planned move is held against.
struct Limits<'a> {
    root: &'a Path,
    /// The root and git's folder with every link resolved: a project is often
    /// reached through a link itself (/tmp on macOS).
    real_root: PathBuf,
    git_dir: PathBuf,
    /// Every planned source, to catch one reached a second way through a link.
    planned: &'a [String],
    /// The document locations that exist and weren't ticked.
    kept: &'a [String],
    archive_device: Option<u64>,
    device: fn(&Path) -> Option<u64>,
}

/// Why nothing may be moved from `spot`, as the rest of a sentence about it.
fn forbidden(spot: &str, kept: &[String]) -> Option<String> {
    if within(spot, ARCHIVE_DIR) || within(ARCHIVE_DIR, spot) {
        return Some(format!("holds or is inside {ARCHIVE_DIR}/, so it can't be moved there."));
    }
    let top_level = !spot.contains('/');
    let name = spot.to_lowercase();
    // A worktree's `.git` is a file, and git's own folder is elsewhere.
    if name.split('/').next() == Some(".git") {
        return Some("is part of git's own folder.".to_string());
    }
    // The archive mirrors the project, so these would land on its own files.
    if top_level && (name == JOURNAL.to_lowercase() || name.starts_with("leftovers-")) {
        return Some(format!("is named like the archive's own {JOURNAL} and leftovers folders, so it can't be moved there."));
    }
    if let Some(stay) = STAYS.iter().find(|stay| within(stay, spot)) {
        return Some(if stay.to_lowercase() == name {
            "is used by both BMAD versions, so it stays.".to_string()
        } else {
            format!("holds {stay}, which both BMAD versions use, so it stays.")
        });
    }
    if let Some(doc) = kept.iter().find(|doc| within(doc, spot)) {
        return Some(if doc.to_lowercase() == name {
            "is one of your documents, which stay unless you tick them.".to_string()
        } else {
            format!("holds {doc}, one of your documents, which stay unless you tick them.")
        });
    }
    None
}

/// Why `rel` can't be moved, if it can't.
fn refuse(rel: &str, limits: &Limits) -> Option<String> {
    if rel.is_empty() {
        return Some("A configured location is the project folder itself, which can't be moved.".to_string());
    }
    let path = at(limits.root, rel);
    // The path itself may be a link, which moves as the link. Its parent must
    // be a real folder of this project, with both sides resolved.
    let parent = path.parent().and_then(|p| std::fs::canonicalize(p).ok());
    let Some(parent) = parent.filter(|p| p.starts_with(&limits.real_root)) else {
        return Some(format!("{rel} is reached through a link that leaves the project."));
    };
    let real = parent.join(path.file_name().unwrap_or_default());
    if let Some(why) = forbidden(rel, limits.kept) {
        return Some(format!("{rel} {why}"));
    }
    // A link that stays inside the project: the path is really somewhere
    // else in it, and that place is held to the same rules.
    let real_rel = real.strip_prefix(&limits.real_root).map(slashed).unwrap_or_else(|_| rel.to_string());
    if real_rel != rel {
        if let Some(why) = forbidden(&real_rel, limits.kept) {
            return Some(format!("{rel} leads through a link to {real_rel}, which {why}"));
        }
        if let Some(other) = limits.planned.iter().find(|other| other.as_str() != rel && within(&real_rel, other)) {
            return Some(format!("{rel} leads through a link into {other}, which is also moved."));
        }
    }
    if real.starts_with(&limits.git_dir) || limits.git_dir.starts_with(&real) {
        return Some(format!("{rel} is part of git's own folder."));
    }
    if let (Some(here), Some(there)) = ((limits.device)(&path), limits.archive_device) {
        if here != there {
            return Some(format!("{rel} is on another volume than the archive, so it can't be moved there in one step."));
        }
    }
    None
}

/// What switching `root` to `to` would do. `ticked` is the documents the
/// person ticked; only ones the plan itself offers are taken. Nothing is
/// written.
pub(crate) fn plan(root: &Path, to: Methodology, ticked: &[String], env: &Env) -> SwitchPlan {
    plan_into(root, to, ticked, env, None)
}

/// plan(), into the archive folder given rather than the next free one: apply
/// uses the name the person saw, so a plan made before midnight still applies.
pub(crate) fn plan_into(root: &Path, to: Methodology, ticked: &[String], env: &Env, archive: Option<&str>) -> SwitchPlan {
    let from = crate::bmadv6::detect_on_disk(root);
    let mut plan = SwitchPlan {
        from: from.map(|m| m.as_str().to_string()).unwrap_or_default(),
        to: to.as_str().to_string(),
        archive: String::new(),
        moves: Vec::new(),
        documents: Vec::new(),
        leftovers: Vec::new(),
        left_in_place: Vec::new(),
        dirty: None,
        archive_ignored: None,
        blocked: None,
    };
    let Some(from) = from else {
        plan.blocked = Some("This project has no BMAD to switch from.".to_string());
        return plan;
    };
    if from == to {
        plan.blocked = Some(format!("This project is already on BMAD {}.", to.as_str()));
        return plan;
    }
    plan.archive = archive.map(str::to_string).unwrap_or_else(|| free_archive(root, from, &env.today));
    plan.dirty = crate::git::run(env.git, root, &["status", "--porcelain", "--", "."]).map(|out| !out.trim().is_empty());
    plan.archive_ignored = match crate::git::code(env.git, root, &["check-ignore", "-q", "--", ".ade/archive/"]) {
        Some(0) => Some(true),
        Some(1) => Some(false),
        _ => None,
    };

    // Every reason is collected and the first is the one shown; the rest of
    // the plan is still filled in, so the dialog shows what would move beside
    // why it can't.
    let mut reasons: Vec<String> = Vec::new();
    // Both versions' resources: the target's to install, the current one's to
    // know which skills are ADE's.
    if !env.v4_src.as_deref().is_some_and(|src| src.join("bmad-core").is_dir()) {
        reasons.push("ADE's bundled BMAD v4 files weren't found, so it can't switch.".to_string());
    }
    if !env.v6_src.as_deref().is_some_and(|src| src.join("skills").is_dir()) {
        reasons.push("ADE's bundled BMAD v6 files weren't found, so it can't switch.".to_string());
    }
    if let Some(earlier) = pending(root).first() {
        reasons.push(format!("An earlier switch here didn't finish. See {}/{JOURNAL}.", earlier.archive));
    }

    let mut moves: Vec<String> = Vec::new();
    let mut leftovers: Vec<String> = Vec::new();
    let mut notes: Vec<Note> = Vec::new();
    let mut offered: Vec<String> = Vec::new();
    // A v6 project reads the v4 config only if an earlier version left one.
    let config = core_config(root).unwrap_or_else(|why| {
        reasons.push(why);
        None
    });
    let paths = crate::bmadconfig::parse_core_config(config.as_deref());
    let v6_skills = env.v6_src.as_deref().map(|src| bundled_skills(root, src)).unwrap_or_default();
    let locations = match from {
        Methodology::V4 => {
            moves.extend([".bmad-core".to_string(), ".claude/commands/BMad".to_string()]);
            if let Some(rel) = inside(root, &paths.dev_debug_log, "The debug log", &mut notes) {
                moves.push(rel);
            }
            moves.push(".ade/stage".to_string());
            let locations = document_locations(root, &paths, &mut notes);
            offered = documents(root, &locations);
            leftovers.push("_bmad".to_string());
            leftovers.extend(v6_skills);
            locations
        }
        Methodology::V6 => {
            // Where v4 would keep documents, so an output folder among them
            // is recognised. One of those outside the project is no news here.
            let locations = document_locations(root, &paths, &mut Vec::new());
            moves.push("_bmad".to_string());
            match crate::bmadconfig::load_central_config(root) {
                Ok(config) => {
                    let configured = crate::bmadconfig::output_folder(root, &config);
                    if let Some(rel) = inside(root, &configured, "The output folder", &mut notes) {
                        // An output folder among the documents is one of
                        // them: it stays unless ticked. The root still goes
                        // to the moves, where it is refused.
                        let holds_documents = !rel.is_empty() && locations.iter().any(|doc| within(&rel, doc) || within(doc, &rel));
                        if !holds_documents {
                            moves.push(rel);
                        } else if present(&at(root, &rel)) {
                            offered.push(rel);
                        }
                    }
                }
                Err(why) => reasons.push(why),
            }
            moves.extend(v6_skills);
            moves.extend([".ade/approvals".to_string(), ".ade/gates".to_string()]);
            leftovers.extend([".bmad-core".to_string(), ".claude/commands/BMad".to_string()]);
            locations
        }
    };
    // Both directions: the marker, and the role files ADE writes, edited or
    // not. Agents the person added have other names and stay.
    moves.push(".ade/methodology".to_string());
    moves.extend(CORE_ROLES.iter().map(|role| format!(".claude/agents/{role}.md")));

    // Only paths that exist, each once.
    let existing = |paths: Vec<String>| {
        let mut out: Vec<String> = Vec::new();
        for path in paths {
            if !out.contains(&path) && present(&at(root, &path)) {
                out.push(path);
            }
        }
        out
    };
    let mut moves = existing(moves);
    let leftovers = existing(leftovers);
    // A document that goes with a move anyway isn't one to offer.
    offered.retain(|doc| !moves.iter().chain(&leftovers).any(|other| other == doc || nested(doc, other)));
    // A document moves only when it was ticked, and only one that is offered:
    // the list comes back from the webview.
    let ticked: Vec<String> = offered.iter().filter(|doc| ticked.contains(doc)).cloned().collect();
    moves.extend(ticked.iter().cloned());
    // A path inside another planned move goes with it.
    let all: Vec<String> = moves.iter().chain(&leftovers).cloned().collect();
    let top = |paths: Vec<String>| -> Vec<String> { paths.into_iter().filter(|path| !all.iter().any(|other| nested(path, other))).collect() };
    let moves = top(moves);
    let leftovers = top(leftovers);

    // What must not be taken along: every document location that exists and
    // every offered document, unless it was ticked or is inside one that was.
    let kept: Vec<String> = locations
        .iter()
        .filter(|doc| present(&at(root, doc)))
        .chain(&offered)
        .filter(|doc| !ticked.iter().any(|taken| within(doc, taken)))
        .cloned()
        .collect();
    let planned: Vec<String> = moves.iter().chain(&leftovers).cloned().collect();
    // `--absolute-git-dir` also answers for a worktree, whose `.git` is a file.
    let git_dir = crate::git::run(env.git, root, &["rev-parse", "--absolute-git-dir"])
        .map(|out| PathBuf::from(out.trim()))
        .unwrap_or_else(|| root.join(".git"));
    let limits = Limits {
        root,
        real_root: std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf()),
        git_dir: std::fs::canonicalize(&git_dir).unwrap_or(git_dir),
        planned: &planned,
        kept: &kept,
        archive_device: at(root, &plan.archive).ancestors().find(|p| present(p)).and_then(|p| (env.device)(p)),
        device: env.device,
    };
    reasons.extend(planned.iter().filter_map(|rel| refuse(rel, &limits)));

    let archive = plan.archive.clone();
    let leftovers_dir = format!("{archive}/leftovers-{}", to.as_str());
    // Without a git that answers, each path would cost two failed runs.
    let git = plan.dirty.is_some().then_some(env.git);
    let moved = |rel: &String, into: &str| Move {
        from: rel.clone(),
        to: format!("{into}/{rel}"),
        files: count_files(&at(root, rel)),
        ignored: git.map_or("none", |git| ignored_of(git, root, rel)).to_string(),
    };
    plan.moves = moves.iter().map(|rel| moved(rel, &archive)).collect();
    plan.leftovers = leftovers.iter().map(|rel| moved(rel, &leftovers_dir)).collect();
    plan.documents = offered
        .iter()
        .map(|rel| Document { path: rel.clone(), files: count_files(&at(root, rel)), ticked: ticked.contains(rel), warning: warning(rel) })
        .collect();
    plan.left_in_place = notes;
    plan.blocked = reasons.into_iter().next();
    plan
}

fn target(to: &str) -> Result<Methodology, String> {
    match to.trim() {
        "v4" => Ok(Methodology::V4),
        "v6" => Ok(Methodology::V6),
        other => Err(format!("Not a BMAD version: {other}")),
    }
}

fn env(app: &tauri::AppHandle) -> Env {
    Env {
        git: crate::git::GIT,
        v4_src: crate::bmad::resource_root(app).ok(),
        v6_src: crate::bmadv6::resource_root(app).ok(),
        today: today(),
        device: device_of,
    }
}

/// The dry run the confirm dialog shows. Nothing is written.
#[tauri::command(async)]
pub fn bmad_switch_plan(app: tauri::AppHandle, root: String, to: String, documents: Vec<String>) -> Result<SwitchPlan, String> {
    let dir = crate::projectsetup::project(&root)?;
    Ok(plan(&dir, target(&to)?, &documents, &env(&app)))
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn temp() -> PathBuf {
        // A counter, not the clock: parallel tests drew the same folder.
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!(
            "ade-switch-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    pub(super) fn write(root: &Path, rel: &str, body: &str) {
        let path = at(root, rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn two_moves() -> Vec<Move> {
        let archive = format!("{ARCHIVE_DIR}/bmad-v4-2026-10-11");
        vec![
            Move { from: ".bmad-core".into(), to: format!("{archive}/.bmad-core"), files: 2, ignored: "none".into() },
            Move { from: ".ade/stage".into(), to: format!("{archive}/.ade/stage"), files: 1, ignored: "none".into() },
        ]
    }

    #[test]
    fn at_joins_a_project_relative_path() {
        assert_eq!(at(Path::new("/p"), ".claude/agents/qa.md"), Path::new("/p").join(".claude").join("agents").join("qa.md"));
        assert_eq!(at(Path::new("/p"), ""), Path::new("/p"));
    }

    #[test]
    fn the_journal_opens_with_front_matter_a_machine_can_read() {
        let journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        let text = journal.render();
        assert!(text.starts_with("---\nstatus: in-progress\nphase: moving\nfrom: v4\nto: v6\ndate: 2026-10-11\n---\n"), "{text}");
        let fm = front_matter(&text).unwrap();
        assert_eq!(fm["status"], "in-progress");
        assert_eq!(fm["phase"], "moving");
        assert_eq!(fm["from"], "v4");
        assert_eq!(fm["to"], "v6");
        assert_eq!(fm["date"], "2026-10-11");
    }

    #[test]
    fn the_journal_lists_each_move_with_its_state_and_both_ways_out() {
        let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        journal.moves[0].2 = MoveState::Moved;
        let text = journal.render();
        assert!(text.contains("- `.bmad-core` → `.ade/archive/bmad-v4-2026-10-11/.bmad-core`: moved\n"), "{text}");
        assert!(text.contains("- `.ade/stage` → `.ade/archive/bmad-v4-2026-10-11/.ade/stage`: pending\n"), "{text}");
        let mut back = journal.clone();
        back.moves[0].2 = MoveState::MovedBack;
        assert!(back.render().contains(".bmad-core`: moved back\n"));
        assert!(text.contains("## To go back to BMAD v4"), "{text}");
        assert!(text.contains("**BMAD: Switch to v4…**"), "{text}");
        assert!(text.contains("`git add -A`"), "{text}");
        assert!(text.contains("## To finish an interrupted switch by hand"), "{text}");
        assert!(text.contains("`status: abandoned`"), "{text}");
    }

    #[test]
    fn front_matter_needs_an_opening_and_a_closing_line() {
        assert!(front_matter("status: complete\n").is_none());
        assert!(front_matter("---\nstatus: complete\n").is_none(), "never closed");
        assert_eq!(front_matter("---\r\nstatus:  abandoned \r\n---\r\n").unwrap()["status"], "abandoned");
    }

    #[test]
    fn pending_finds_in_progress_and_incomplete_only() {
        let dir = temp();
        for (name, status) in [("a", "in-progress"), ("b", "incomplete"), ("c", "complete"), ("d", "abandoned")] {
            let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
            journal.status = status;
            let archive = at(&dir, &format!("{ARCHIVE_DIR}/bmad-v4-{name}"));
            std::fs::create_dir_all(&archive).unwrap();
            journal.write(&archive).unwrap();
        }
        let found = pending(&dir);
        assert_eq!(
            found.iter().map(|p| (p.archive.as_str(), p.status.as_str())).collect::<Vec<_>>(),
            [(".ade/archive/bmad-v4-a", "in-progress"), (".ade/archive/bmad-v4-b", "incomplete")]
        );
        assert_eq!(found[0].from, "v4");
        assert_eq!(found[0].to, "v6");
        assert_eq!(found[0].phase, "moving");
        assert_eq!(found[0].date, "2026-10-11");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_move_is_journalled_as_moving_before_it_is_moved() {
        let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        journal.moves[0].2 = MoveState::Moving;
        let text = journal.render();
        assert!(text.contains(".bmad-core`: moving\n"), "{text}");
        assert!(text.contains("may be at either place"), "{text}");
    }

    #[test]
    fn the_hand_instructions_say_what_to_do_in_each_phase() {
        let text = Journal::new("v4", "v6", "2026-10-11", &two_moves()).render();
        for needle in [
            "`phase: moving`",
            "`phase: setup`",
            "partly written at the old paths",
            "`phase: rules` or `phase: done`",
            "nothing to undo",
        ] {
            assert!(text.contains(needle), "missing {needle:?} in {text}");
        }
    }


    #[test]
    fn an_incomplete_journal_is_followed_by_its_moves_whatever_its_phase() {
        let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        journal.status = "incomplete";
        journal.phase = "rules";
        let text = journal.render();
        assert!(!text.contains("nothing to undo"), "{text}");
        assert!(!text.contains("`status: complete`"), "{text}");
        assert!(text.contains("ignore `phase`"), "{text}");
        for needle in ["marked *moved*", "marked *moving*", "*moved back*", "*pending*"] {
            assert!(text.contains(needle), "missing {needle:?} in {text}");
        }
        // The phase guidance is for a switch that is still running.
        let running = Journal::new("v4", "v6", "2026-10-11", &two_moves()).render();
        assert!(running.contains("nothing to undo"), "{running}");
    }

    #[test]
    fn a_newline_or_control_character_cannot_add_a_front_matter_line() {
        let evil = "v4\nstatus: complete\r\u{7}";
        let journal = Journal::new(evil, "v6\nstatus: complete", "2026\nstatus: complete", &two_moves());
        let text = journal.render();
        let fm = front_matter(&text).unwrap();
        assert_eq!(fm["status"], "in-progress");
        assert_eq!(fm["from"], "v4status: complete");
        assert_eq!(fm.keys().count(), 5, "{fm:?}");
    }

    #[test]
    fn a_byte_order_mark_does_not_hide_the_front_matter() {
        let text = ["\u{feff}", &Journal::new("v4", "v6", "2026-10-11", &two_moves()).render()].concat();
        assert_eq!(front_matter(&text).unwrap()["status"], "in-progress");
        assert_eq!(front_matter("\u{feff}---\r\nstatus: abandoned\r\n---\r\n").unwrap()["status"], "abandoned");
    }

    #[test]
    fn a_bom_edited_journal_is_read_by_pending() {
        let dir = temp();
        write(&dir, ".ade/archive/a/ARCHIVE.md", "\u{feff}---\nstatus: abandoned\nphase: moving\n---\n");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn awkward_paths_and_edited_bodies_never_change_the_parsed_status() {
        let moves = vec![Move {
            from: "odd |: `x`\nstatus: complete\n---\nstatus: complete".into(),
            to: "a|b:c`d\n---\nstatus: abandoned".into(),
            files: 1,
            ignored: "none".into(),
        }];
        let journal = Journal::new("v4", "v6", "2026-10-11", &moves);
        let text = journal.render();
        let fm = front_matter(&text).unwrap();
        assert_eq!(fm["status"], "in-progress");
        assert_eq!(fm["phase"], "moving");
        // Whatever a person does to the body, the front matter decides.
        let (head, body) = text.split_once("\n---\n\n").unwrap();
        let edited = format!("{head}\n---\n\nstatus: complete\n---\nstatus: abandoned\n{body}");
        assert_eq!(front_matter(&edited).unwrap()["status"], "in-progress");
    }

    #[test]
    fn a_journal_written_to_disk_reads_back_through_pending() {
        let dir = temp();
        let archive = at(&dir, ".ade/archive/bmad-v4-x");
        std::fs::create_dir_all(&archive).unwrap();
        Journal::new("v4", "v6", "2026-10-11", &two_moves()).write(&archive).unwrap();
        let found = pending(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].from.as_str(), found[0].to.as_str()), ("v4", "v6"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_folder_with_no_journal_is_not_pending() {
        let dir = temp();
        assert!(pending(&dir).is_empty(), "no archive folder at all");
        std::fs::create_dir_all(at(&dir, ".ade/archive/empty")).unwrap();
        write(&dir, ".ade/archive/stray-file", "not an archive folder\n");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_journal_that_cannot_be_parsed_blocks_as_unknown() {
        let dir = temp();
        write(&dir, ".ade/archive/notes/ARCHIVE.md", "my own notes, no front matter\n");
        write(&dir, ".ade/archive/odd/ARCHIVE.md", "---\nstatus: halfway\nphase: moving\n---\n");
        write(&dir, ".ade/archive/bare/ARCHIVE.md", "---\nphase: moving\n---\n");
        let found = pending(&dir);
        assert_eq!(
            found.iter().map(|p| (p.archive.as_str(), p.status.as_str())).collect::<Vec<_>>(),
            [
                (".ade/archive/bare", "unknown"),
                (".ade/archive/notes", "unknown"),
                (".ade/archive/odd", "unknown"),
            ]
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_journal_that_cannot_be_read_blocks_as_unknown() {
        let dir = temp();
        // A directory where the file should be: reading it fails on every OS.
        std::fs::create_dir_all(at(&dir, ".ade/archive/bmad-v4-x/ARCHIVE.md")).unwrap();
        let found = pending(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].archive, ".ade/archive/bmad-v4-x");
        assert_eq!(found[0].status, "unknown");
        std::fs::remove_dir_all(dir).ok();
    }

    use crate::bmadv6::Methodology::{V4, V6};
    use std::sync::OnceLock;

    /// A miniature of the bundled v4 resource root, shared by every test.
    pub(super) fn v4_src() -> PathBuf {
        static SRC: OnceLock<PathBuf> = OnceLock::new();
        SRC.get_or_init(|| {
            let src = temp();
            write(&src, "bmad-core/core-config.yaml", "devStoryLocation: docs/stories\n");
            write(&src, "bmad-core/tasks/a.md", "a");
            write(&src, "claude-commands/BMad/tasks/x.md", "x");
            write(&src, "VERSION", "v4.1\n");
            src
        })
        .clone()
    }

    /// A miniature of the bundled v6 resource root: two skills and the runtime.
    pub(super) fn v6_src() -> PathBuf {
        static SRC: OnceLock<PathBuf> = OnceLock::new();
        SRC.get_or_init(|| {
            let src = temp();
            write(&src, "skills/bmad/SKILL.md", "bmad skill");
            write(&src, "skills/bmad-prd/SKILL.md", "prd skill");
            write(&src, "ade-runtime.mjs", "// runtime");
            src
        })
        .clone()
    }

    fn one_device(_: &Path) -> Option<u64> {
        Some(1)
    }

    /// No git (the name doesn't exist), both versions' resources, a fixed day.
    pub(super) fn env() -> Env {
        Env { git: "ade-no-such-git", v4_src: Some(v4_src()), v6_src: Some(v6_src()), today: "2026-10-11".into(), device: one_device }
    }

    pub(super) fn v4_project_in(dir: &Path) {
        write(
            dir,
            ".bmad-core/core-config.yaml",
            "prd:\n  prdFile: docs/prd.md\n  prdShardedLocation: docs/prd\narchitecture:\n  architectureFile: docs/architecture.md\n  architectureShardedLocation: docs/architecture\ndevStoryLocation: docs/stories\nqa:\n  qaLocation: docs/qa\ndevDebugLog: .ai/debug-log.md\n",
        );
        write(dir, ".bmad-core/tasks/a.md", "a");
        write(dir, ".claude/commands/BMad/tasks/x.md", "x");
        write(dir, ".ai/debug-log.md", "log");
        write(dir, ".ade/stage", "build");
        write(dir, ".ade/methodology", "v4\n");
        write(dir, ".ade/rules.md", "old rules\n");
        write(dir, ".claude/agents/qa.md", "edited qa");
        write(dir, ".claude/agents/mine.md", "my agent");
        write(dir, "docs/prd.md", "prd");
        write(dir, "docs/architecture.md", "arch");
        write(dir, "docs/stories/1.1.md", "story");
        write(dir, "CLAUDE.md", "# Mine\n");
    }

    pub(super) fn v4_project() -> PathBuf {
        let dir = temp();
        v4_project_in(&dir);
        dir
    }

    pub(super) fn v6_project() -> PathBuf {
        let dir = temp();
        write(&dir, ".ade/methodology", "v6\n");
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \"{project-root}/_bmad-output\"\n");
        write(&dir, "_bmad/ade-runtime.mjs", "// runtime");
        write(&dir, "_bmad-output/shop/1.md", "ticket");
        write(&dir, ".claude/skills/bmad/SKILL.md", "bmad skill");
        write(&dir, ".claude/skills/mine/SKILL.md", "my skill");
        write(&dir, ".ade/gates/1.yml", "gate");
        write(&dir, ".ade/approvals/1", "ok");
        write(&dir, ".ade/rules.md", "old rules\n");
        write(&dir, ".claude/agents/qa.md", "qa for v6");
        write(&dir, ".claude/agents/mine.md", "my agent");
        write(&dir, "docs/prd.md", "prd");
        write(&dir, "CLAUDE.md", "# Mine\n");
        dir
    }

    pub(super) fn sources(moves: &[Move]) -> Vec<&str> {
        moves.iter().map(|m| m.from.as_str()).collect()
    }

    const ARCHIVE: &str = ".ade/archive/bmad-v4-2026-10-11";

    #[test]
    fn the_plan_for_v4_to_v6() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!((plan.from.as_str(), plan.to.as_str(), plan.archive.as_str()), ("v4", "v6", ARCHIVE));
        assert_eq!(
            sources(&plan.moves),
            [".bmad-core", ".claude/commands/BMad", ".ai/debug-log.md", ".ade/stage", ".ade/methodology", ".claude/agents/qa.md"],
            "the engine, the commands, the debug log, the stage, the marker and the role file, edited or not"
        );
        assert_eq!(plan.moves[0], Move { from: ".bmad-core".into(), to: format!("{ARCHIVE}/.bmad-core"), files: 2, ignored: "none".into() });
        assert_eq!(plan.moves[5].to, format!("{ARCHIVE}/.claude/agents/qa.md"));
        assert!(plan.leftovers.is_empty() && plan.left_in_place.is_empty());
        // Documents stay: offered, unticked, and not among the moves.
        assert_eq!(plan.documents.iter().map(|d| d.path.as_str()).collect::<Vec<_>>(), ["docs/prd.md", "docs/architecture.md", "docs/stories"]);
        assert!(plan.documents.iter().all(|d| !d.ticked));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn ticked_documents_move_and_carry_the_warning() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &["docs/prd.md".into(), "docs/stories".into()], &env());
        assert_eq!(plan.blocked, None);
        assert!(sources(&plan.moves).ends_with(&["docs/prd.md", "docs/stories"]), "{:?}", sources(&plan.moves));
        assert_eq!(plan.moves.last().unwrap().to, format!("{ARCHIVE}/docs/stories"));
        let doc = |path: &str| plan.documents.iter().find(|d| d.path == path).unwrap();
        assert!(doc("docs/prd.md").ticked && doc("docs/stories").ticked && !doc("docs/architecture.md").ticked);
        assert_eq!(doc("docs/prd.md").warning.as_deref(), Some("ADE's rules use this file (the PRD). The new version starts without it."));
        assert_eq!(
            doc("docs/architecture.md").warning.as_deref(),
            Some("ADE's rules use this file (the verification command). The new version starts without it.")
        );
        assert_eq!(doc("docs/stories").warning, None);
        assert_eq!(doc("docs/stories").files, 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_path_that_was_not_offered_never_moves() {
        let dir = v4_project();
        write(&dir, "src/main.rs", "fn main() {}");
        let plan = plan(&dir, V6, &["src".into(), "docs".into(), "CLAUDE.md".into(), "../elsewhere".into()], &env());
        assert_eq!(sources(&plan.moves).len(), 6, "{:?}", sources(&plan.moves));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn docs_itself_and_the_parent_of_another_location_are_not_offered() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "qa:\n  qaLocation: docs\ndevStoryLocation: work\nprd:\n  prdFile: work/prd.md\n");
        write(&dir, "work/prd.md", "prd");
        write(&dir, "work/1.1.md", "story");
        let plan = plan(&dir, V6, &["docs".into(), "work".into()], &env());
        let offered: Vec<&str> = plan.documents.iter().map(|d| d.path.as_str()).collect();
        assert!(!offered.contains(&"docs"), "{offered:?}");
        assert!(!offered.contains(&"work"), "work holds work/prd.md: {offered:?}");
        assert!(offered.contains(&"work/prd.md"), "{offered:?}");
        assert!(!sources(&plan.moves).contains(&"docs") && !sources(&plan.moves).contains(&"work"));
        assert_eq!(plan.blocked, None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_plan_for_v6_to_v4() {
        let dir = v6_project();
        let plan = plan(&dir, V4, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(plan.archive, ".ade/archive/bmad-v6-2026-10-11");
        assert_eq!(
            sources(&plan.moves),
            ["_bmad", "_bmad-output", ".claude/skills/bmad", ".ade/approvals", ".ade/gates", ".ade/methodology", ".claude/agents/qa.md"],
            "a user's own skill and agent stay; the absolute output folder under the root is project-relative"
        );
        assert!(plan.documents.is_empty(), "an output folder that holds no documents is a move, and docs is never offered here");
        std::fs::remove_dir_all(dir).ok();
    }

    /// A v6 project whose output folder is `configured`, with one ticket at `rel`.
    fn v6_with_output(configured: &str, rel: &str) -> PathBuf {
        let dir = v6_project();
        write(&dir, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{configured}\"\n"));
        write(&dir, &format!("{rel}/shop/1.md"), "ticket");
        dir
    }

    // R1: `docs` itself, a folder inside a documents location, and a folder
    // that holds one (a location an earlier v4 config names).
    const DOCUMENT_OUTPUTS: [(&str, &str); 3] = [("docs", "docs"), ("{project-root}/docs/out", "docs/out"), ("work", "work")];

    fn v6_with_document_output(configured: &str, rel: &str) -> PathBuf {
        let dir = v6_with_output(configured, rel);
        if rel == "work" {
            write(&dir, ".bmad-core/core-config.yaml", "devStoryLocation: work/stories\n");
            write(&dir, "work/stories/1.1.md", "story");
        }
        dir
    }

    #[test]
    fn an_output_folder_that_holds_documents_is_offered_and_stays() {
        for (configured, rel) in DOCUMENT_OUTPUTS {
            let dir = v6_with_document_output(configured, rel);
            let plan = plan(&dir, V4, &[], &env());
            assert_eq!(plan.blocked, None, "{configured}");
            assert!(!sources(&plan.moves).contains(&rel), "{configured}: {:?}", sources(&plan.moves));
            assert!(sources(&plan.moves).contains(&"_bmad"), "{configured}: the rest still moves");
            assert_eq!(plan.documents.len(), 1, "{configured}: {:?}", plan.documents);
            assert_eq!((plan.documents[0].path.as_str(), plan.documents[0].ticked), (rel, false), "{configured}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn an_output_folder_that_holds_documents_moves_when_ticked() {
        for (configured, rel) in DOCUMENT_OUTPUTS {
            let dir = v6_with_document_output(configured, rel);
            let plan = plan(&dir, V4, &[rel.to_string()], &env());
            assert_eq!(plan.blocked, None, "{configured}");
            let moved = plan.moves.iter().find(|m| m.from == rel).unwrap_or_else(|| panic!("{configured}: {:?}", sources(&plan.moves)));
            assert_eq!(moved.to, format!(".ade/archive/bmad-v6-2026-10-11/{rel}"));
            assert_eq!(plan.documents.len(), 1, "{configured}: {:?}", plan.documents);
            assert_eq!((plan.documents[0].path.as_str(), plan.documents[0].ticked), (rel, true), "{configured}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn the_output_folder_comes_from_the_merged_config() {
        let dir = v6_project();
        write(&dir, "_bmad/custom/config.toml", "[core]\noutput_folder = \"docs/out\"\n");
        write(&dir, "_bmad/custom/config.user.toml", "[core]\noutput_folder = \"{project-root}/work/out\"\n");
        write(&dir, "work/out/1.md", "ticket");
        let plan = plan(&dir, V4, &[], &env());
        assert!(sources(&plan.moves).contains(&"work/out"), "{:?}", sources(&plan.moves));
        assert!(!sources(&plan.moves).contains(&"_bmad-output"), "the default folder is no longer the configured one");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_skill_is_ades_by_its_name_whatever_the_case() {
        let dir = v6_project();
        std::fs::rename(dir.join(".claude/skills/bmad"), dir.join(".claude/skills/BMAD-PRD")).unwrap();
        let plan = plan(&dir, V4, &[], &env());
        assert!(sources(&plan.moves).contains(&".claude/skills/BMAD-PRD"), "{:?}", sources(&plan.moves));
        assert!(!sources(&plan.moves).contains(&".claude/skills/mine"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn locations_outside_the_project_are_left_in_place_not_blocked() {
        let outside = temp();
        write(&outside, "debug.md", "log");
        write(&outside, "qa/gate.yml", "gate");
        write(&outside, "out/1.md", "ticket");
        let slash = |p: PathBuf| p.to_string_lossy().replace('\\', "/");

        let v4 = v4_project();
        write(
            &v4,
            ".bmad-core/core-config.yaml",
            &format!("devDebugLog: {}\nqa:\n  qaLocation: {}\n", slash(outside.join("debug.md")), slash(outside.join("qa"))),
        );
        let plan4 = plan(&v4, V6, &[], &env());
        assert_eq!(plan4.blocked, None);
        let noted: Vec<&str> = plan4.left_in_place.iter().map(|n| n.path.as_str()).collect();
        assert!(noted.iter().any(|p| p.ends_with("debug.md")), "{noted:?}");
        assert!(noted.iter().any(|p| p.ends_with("qa")), "{noted:?}");
        assert!(plan4.left_in_place.iter().all(|n| n.reason.contains("outside the project")));
        assert!(!sources(&plan4.moves).iter().any(|p| p.contains("debug")), "never moved");
        assert!(!plan4.documents.iter().any(|d| d.path.ends_with("qa")), "a document outside the project is not offered");

        let v6 = v6_project();
        write(&v6, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{}\"\n", slash(outside.join("out"))));
        let plan6 = plan(&v6, V4, &[], &env());
        assert_eq!(plan6.blocked, None);
        assert_eq!(plan6.left_in_place.len(), 1);
        assert!(plan6.left_in_place[0].path.ends_with("out"));
        for dir in [outside, v4, v6] {
            std::fs::remove_dir_all(dir).ok();
        }
    }

    // Inside or outside is decided on the folded path, one component at a
    // time: a sibling whose name starts with the project's is not inside it.
    #[test]
    fn inside_the_project_is_decided_component_by_component() {
        let parent = temp();
        let root = parent.join("shop");
        std::fs::create_dir_all(&root).unwrap();
        let text = |p: PathBuf| p.to_string_lossy().into_owned();
        assert_eq!(locate(&root, "docs/../_bmad-output"), Located::Inside("_bmad-output".into()));
        assert_eq!(locate(&root, &text(root.join("sub").join("..").join("out"))), Located::Inside("out".into()));
        assert_eq!(locate(&root, &format!("{}/work/out", root.to_string_lossy())), Located::Inside("work/out".into()), "mixed separators on Windows");
        assert_eq!(locate(&root, "."), Located::Inside(String::new()));
        assert!(matches!(locate(&root, "docs/../../elsewhere"), Located::Outside(_)));
        assert!(matches!(locate(&root, &text(parent.join("shop2").join("out"))), Located::Outside(_)), "shop2 is not inside shop");
        assert!(matches!(locate(&root, &text(root.join("..").join("shop2"))), Located::Outside(_)));
        std::fs::remove_dir_all(parent).ok();
    }

    #[test]
    fn blocked_without_bmad_or_when_already_on_the_version() {
        let empty = temp();
        let none = plan(&empty, V6, &[], &env());
        assert_eq!(none.from, "");
        assert!(none.blocked.as_deref().unwrap().contains("no BMAD"), "{:?}", none.blocked);
        assert!(none.moves.is_empty());
        let dir = v4_project();
        assert!(plan(&dir, V4, &[], &env()).blocked.as_deref().unwrap().contains("already on BMAD v4"));
        std::fs::remove_dir_all(empty).ok();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_either_versions_resources_are_missing() {
        let dir = v4_project();
        let blocked = |e: Env| plan(&dir, V6, &[], &e).blocked.unwrap_or_default();
        assert!(blocked(Env { v6_src: None, ..env() }).contains("v6"), "the target's, to install");
        assert!(blocked(Env { v4_src: None, ..env() }).contains("v4"), "the current one's too");
        // A resource root that resolves to a folder with nothing in it is no better.
        assert!(blocked(Env { v6_src: Some(temp()), ..env() }).contains("v6"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_a_config_layer_cannot_be_parsed() {
        let dir = v6_project();
        write(&dir, "_bmad/custom/config.toml", "not = [toml");
        let blocked = plan(&dir, V4, &[], &env()).blocked.unwrap();
        assert!(blocked.contains("_bmad/custom/config.toml"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    // Only a missing core-config means the defaults. One that is there and
    // can't be read may name the debug log and the documents.
    #[test]
    fn blocked_when_the_v4_config_cannot_be_read() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".bmad-core/core-config.yaml")).unwrap();
        assert_eq!(plan(&dir, V6, &[], &env()).blocked, None, "no config: BMAD's defaults");
        // A directory where the file should be: reading it fails on every OS.
        std::fs::create_dir_all(at(&dir, ".bmad-core/core-config.yaml")).unwrap();
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert!(blocked.contains(".bmad-core/core-config.yaml"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_a_moved_path_is_the_root_in_git_or_under_the_archive() {
        for (configured, needle) in [("{project-root}", "project folder itself"), (".git/out", "git"), (".ade/archive/old", ".ade/archive"), (".ade", ".ade/archive")] {
            let dir = v6_project();
            write(&dir, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{configured}\"\n"));
            write(&dir, ".git/out/1.md", "x");
            write(&dir, ".ade/archive/old/1.md", "x");
            let blocked = plan(&dir, V4, &[], &env()).blocked.unwrap_or_default();
            assert!(blocked.contains(needle), "{configured}: {blocked}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    // A worktree's `.git` is a file, and git's own folder is elsewhere.
    #[test]
    fn blocked_when_a_moved_path_is_a_worktrees_git_file() {
        let dir = v6_project();
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \".git\"\n");
        write(&dir, ".git", "gitdir: /elsewhere/.git/worktrees/shop\n");
        let blocked = plan(&dir, V4, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.contains(".git"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    // R8: a move never swallows what must stay.
    #[test]
    fn blocked_when_a_move_would_take_the_documents_with_it() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: docs\n");
        let first = plan(&dir, V6, &[], &env());
        let blocked = first.blocked.clone().unwrap_or_default();
        assert!(blocked.starts_with("docs ") && blocked.contains("stay"), "{blocked}");
        assert!(first.documents.is_empty(), "nothing inside a planned move is offered: {:?}", first.documents);
        // A single document that is also the debug log is no different.
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: docs/prd.md\n");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with("docs/prd.md ") && blocked.contains("stay"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_when_a_move_would_take_a_file_both_versions_share() {
        // `.Claude` is `.claude` on a disk that ignores case, so it blocks everywhere.
        for (configured, kept) in [(".claude", ".claude"), (".Claude", ".Claude"), (".ade/context", ".ade/context"), ("CLAUDE.md", "CLAUDE.md")] {
            let dir = v6_project();
            write(&dir, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{configured}\"\n"));
            if !present(&at(&dir, configured)) {
                write(&dir, &format!("{configured}/1.md"), "x");
            }
            let blocked = plan(&dir, V4, &[], &env()).blocked.unwrap_or_default();
            assert!(blocked.starts_with(&format!("{kept} ")) && blocked.contains("stay"), "{configured}: {blocked}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn blocked_when_a_source_would_land_on_the_archives_own_names() {
        for name in ["ARCHIVE.md", "leftovers-v6", "leftovers-old"] {
            let dir = v4_project();
            write(&dir, ".bmad-core/core-config.yaml", &format!("devDebugLog: {name}\n"));
            write(&dir, name, "log");
            let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap_or_default();
            assert!(blocked.starts_with(&format!("{name} ")), "{name}: {blocked}");
            std::fs::remove_dir_all(dir).ok();
        }
        // Deeper in the tree the name is harmless.
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: logs/ARCHIVE.md\n");
        write(&dir, "logs/ARCHIVE.md", "log");
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert!(sources(&plan.moves).contains(&"logs/ARCHIVE.md"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn blocked_when_a_parent_leaves_the_project_through_a_link() {
        let dir = v4_project();
        let outside = temp();
        write(&outside, "debug.md", "log");
        std::os::unix::fs::symlink(&outside, dir.join("logs")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: logs/debug.md\n");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert!(blocked.contains("logs/debug.md") && blocked.contains("link"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    // A link that stays inside the project is followed to where the path
    // really is, and that place is held to the same rules.
    #[cfg(unix)]
    #[test]
    fn a_path_reached_through_a_link_inside_the_project_is_judged_where_it_is() {
        let dir = v4_project();
        write(&dir, ".claude/settings.json", "{}");
        std::os::unix::fs::symlink(dir.join(".claude"), dir.join("logs")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: logs/settings.json\n");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with("logs/settings.json ") && blocked.contains(".claude/settings.json"), "{blocked}");

        // Into a folder that moves anyway: the same file would be moved twice.
        std::fs::remove_file(dir.join("logs")).unwrap();
        std::os::unix::fs::symlink(dir.join(".bmad-core"), dir.join("logs")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: logs/debug.md\n");
        write(&dir, ".bmad-core/debug.md", "log");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with("logs/debug.md ") && blocked.contains(".bmad-core"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_project_under_a_linked_path_is_not_blocked() {
        let real = temp();
        v4_project_in(&real.join("shop"));
        let links = temp();
        std::os::unix::fs::symlink(&real, links.join("code")).unwrap();
        let plan = plan(&links.join("code").join("shop"), V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(sources(&plan.moves).len(), 6);
        std::fs::remove_dir_all(real).ok();
        std::fs::remove_dir_all(links).ok();
    }

    // The config names the folder by its resolved path, the project is opened
    // through a link (and the other way round): it is the same folder.
    #[cfg(unix)]
    #[test]
    fn an_absolute_location_is_inside_however_the_project_was_reached() {
        let real = temp();
        std::fs::create_dir_all(real.join("shop")).unwrap();
        let links = temp();
        std::os::unix::fs::symlink(&real, links.join("code")).unwrap();
        let linked = links.join("code").join("shop");
        let resolved = std::fs::canonicalize(&linked).unwrap();
        write(&resolved, "_bmad-output/1.md", "ticket");
        let text = |p: PathBuf| p.to_string_lossy().into_owned();
        assert_eq!(locate(&linked, &text(resolved.join("_bmad-output"))), Located::Inside("_bmad-output".into()));
        assert_eq!(locate(&resolved, &text(linked.join("_bmad-output"))), Located::Inside("_bmad-output".into()));
        std::fs::remove_dir_all(real).ok();
        std::fs::remove_dir_all(links).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_folder_is_planned_as_the_link() {
        let dir = v4_project();
        let outside = temp();
        write(&outside, "a.md", "a");
        write(&outside, "b.md", "b");
        std::fs::remove_dir_all(dir.join(".claude/commands/BMad")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join(".claude/commands/BMad")).unwrap();
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        let link = plan.moves.iter().find(|m| m.from == ".claude/commands/BMad").unwrap();
        assert_eq!(link.files, 1, "the link itself, not the two files behind it");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    #[test]
    fn counting_stops_at_its_limit() {
        let dir = temp();
        for n in 0..6 {
            write(&dir, &format!("a/b/{n}.md"), "x");
        }
        write(&dir, "a/c.md", "x");
        assert_eq!(count_up_to(&dir, 1_000), 7, "files, not folders");
        assert_eq!(count_up_to(&dir.join("a").join("c.md"), 1_000), 1);
        assert_eq!(count_up_to(&dir.join("missing"), 1_000), 0);
        // The limit is on entries looked at, folders included.
        assert_eq!(count_up_to(&dir.join("a").join("b"), 4), 4, "a huge tree is not walked to the end");
        assert!(count_up_to(&dir, 4) <= 4);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_location_nested_in_another_move_is_dropped() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: .bmad-core/debug.md\n");
        write(&dir, ".bmad-core/debug.md", "log");
        let first = plan(&dir, V6, &[], &env());
        assert!(!sources(&first.moves).contains(&".bmad-core/debug.md"), "{:?}", sources(&first.moves));
        assert_eq!(first.blocked, None);

        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: .bmad-core/debug.md\nqa:\n  qaLocation: .bmad-core/qa\n");
        write(&dir, ".bmad-core/qa/gate.yml", "gate");
        let plan = plan(&dir, V6, &[], &env());
        assert!(!sources(&plan.moves).contains(&".bmad-core/debug.md"), "{:?}", sources(&plan.moves));
        assert!(!plan.documents.iter().any(|d| d.path == ".bmad-core/qa"), "it goes with the engine");
        // R8: the engine would take a document location with it, so it blocks.
        let blocked = plan.blocked.clone().unwrap_or_default();
        assert!(blocked.starts_with(".bmad-core ") && blocked.contains(".bmad-core/qa"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    fn two_devices(path: &Path) -> Option<u64> {
        Some(if path.ends_with("debug-log.md") { 2 } else { 1 })
    }

    #[test]
    fn blocked_when_a_source_is_on_another_device() {
        let dir = v4_project();
        let blocked = plan(&dir, V6, &[], &Env { device: two_devices, ..env() }).blocked.unwrap();
        assert!(blocked.contains(".ai/debug-log.md") && blocked.contains("another volume"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn blocked_while_an_earlier_switch_is_pending() {
        let dir = v4_project();
        let archive = at(&dir, ".ade/archive/bmad-v6-2026-10-01");
        std::fs::create_dir_all(&archive).unwrap();
        Journal::new("v6", "v4", "2026-10-01", &[]).write(&archive).unwrap();
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert!(blocked.contains("didn't finish") && blocked.contains(".ade/archive/bmad-v6-2026-10-01/ARCHIVE.md"), "{blocked}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn leftovers_of_the_target_version_go_to_their_own_folder() {
        let dir = v4_project();
        write(&dir, "_bmad/config.toml", "[core]\n");
        write(&dir, ".claude/skills/bmad/SKILL.md", "old skill");
        write(&dir, ".claude/skills/mine/SKILL.md", "my skill");
        let to_v6 = plan(&dir, V6, &[], &env());
        assert_eq!(sources(&to_v6.leftovers), ["_bmad", ".claude/skills/bmad"]);
        assert_eq!(to_v6.leftovers[0].to, format!("{ARCHIVE}/leftovers-v6/_bmad"));
        assert_eq!(to_v6.blocked, None);

        let other = v6_project();
        write(&other, ".bmad-core/tasks/a.md", "a");
        write(&other, ".claude/commands/BMad/x.md", "x");
        let to_v4 = plan(&other, V4, &[], &env());
        assert_eq!(sources(&to_v4.leftovers), [".bmad-core", ".claude/commands/BMad"]);
        assert_eq!(to_v4.leftovers[1].to, ".ade/archive/bmad-v6-2026-10-11/leftovers-v4/.claude/commands/BMad");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(other).ok();
    }

    #[test]
    fn a_taken_archive_name_gets_a_number() {
        let dir = v4_project();
        std::fs::create_dir_all(at(&dir, ARCHIVE)).unwrap();
        assert_eq!(plan(&dir, V6, &[], &env()).archive, format!("{ARCHIVE}-2"));
        std::fs::create_dir_all(at(&dir, &format!("{ARCHIVE}-2"))).unwrap();
        assert_eq!(plan(&dir, V6, &[], &env()).archive, format!("{ARCHIVE}-3"));
        // Given a name, the plan uses it as it is.
        assert_eq!(plan_into(&dir, V6, &[], &env(), Some(".ade/archive/bmad-v4-2026-10-10")).archive, ".ade/archive/bmad-v4-2026-10-10");
        std::fs::remove_dir_all(dir).ok();
    }

    /// Every file under `dir` with its contents, to see that nothing changed.
    fn snapshot(dir: &Path) -> Vec<(PathBuf, Vec<u8>)> {
        let mut out = Vec::new();
        let mut stack = vec![dir.to_path_buf()];
        while let Some(next) = stack.pop() {
            for entry in std::fs::read_dir(&next).unwrap().flatten() {
                if entry.file_type().unwrap().is_dir() {
                    out.push((entry.path(), Vec::new()));
                    stack.push(entry.path());
                } else {
                    out.push((entry.path(), std::fs::read(entry.path()).unwrap()));
                }
            }
        }
        out.sort();
        out
    }

    #[test]
    fn the_plan_writes_nothing() {
        for (dir, to) in [(v4_project(), V6), (v6_project(), V4)] {
            let before = snapshot(&dir);
            let made = plan(&dir, to, &["docs/prd.md".into()], &env());
            assert_eq!(made.blocked, None);
            assert_eq!(snapshot(&dir), before, "not even the archive folder");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn without_git_the_git_facts_are_unknown() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!((plan.dirty, plan.archive_ignored), (None, None));
        assert!(plan.moves.iter().all(|m| m.ignored == "none"));
        assert_eq!(plan.blocked, None, "git is never needed to switch");
        std::fs::remove_dir_all(dir).ok();
    }

    // Needs the git binary; CI has it. Says so and skips on a machine without it.
    #[test]
    fn with_git_the_plan_says_what_is_dirty_and_what_is_ignored() {
        let dir = v6_project();
        if crate::git::run(crate::git::GIT, &dir, &["--version"]).is_none() {
            eprintln!("git is not installed; skipping");
            return;
        }
        let git = |args: &[&str]| assert!(crate::git::run(crate::git::GIT, &dir, args).is_some(), "git {args:?}");
        git(&["init", "-q"]);
        write(&dir, ".gitignore", "/_bmad-output/\n*.user.toml\n");
        write(&dir, "_bmad/custom/config.user.toml", "[core]\n");
        let real = Env { git: crate::git::GIT, ..env() };
        let first = plan(&dir, V4, &[], &real);
        let ignored = |from: &str| first.moves.iter().find(|m| m.from == from).unwrap().ignored.clone();
        assert_eq!(first.blocked, None);
        assert_eq!(first.dirty, Some(true), "everything is untracked");
        assert_eq!(ignored("_bmad-output"), "all");
        assert_eq!(ignored("_bmad"), "some", "one ignored file inside");
        assert_eq!(ignored(".ade/gates"), "none");
        assert_eq!(first.archive_ignored, Some(false));

        write(&dir, ".gitignore", "/_bmad-output/\n*.user.toml\n/.ade/\n");
        assert_eq!(plan(&dir, V4, &[], &real).archive_ignored, Some(true));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_plan_reaches_the_dialog_in_camel_case() {
        let dir = v4_project();
        let json = serde_json::to_value(plan(&dir, V6, &[], &env())).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["archive", "archiveIgnored", "blocked", "dirty", "documents", "from", "leftInPlace", "leftovers", "moves", "to"]);
        let mut doc: Vec<&str> = json["documents"][0].as_object().unwrap().keys().map(String::as_str).collect();
        doc.sort_unstable();
        assert_eq!(doc, ["files", "path", "ticked", "warning"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn civil_dates() {
        assert_eq!(civil_date(0), "1970-01-01");
        assert_eq!(civil_date(19_782), "2024-02-29");
        assert_eq!(civil_date(20_737), "2026-10-11");
        assert_eq!(today().len(), 10);
    }
}
