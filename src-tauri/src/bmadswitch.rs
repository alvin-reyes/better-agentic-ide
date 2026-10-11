//! Switching a project's BMAD version. The old version's files move into
//! `.ade/archive/bmad-<from>-<date>/` inside the project, then the other
//! version is set up fresh. Nothing is deleted.
//!
//! `ARCHIVE.md` in the archive is the journal. It is written before the first
//! move, so a switch that was interrupted can be finished by hand, and its
//! front matter is how ADE knows one didn't finish.

use crate::bmadconfig::V4Paths;
use crate::bmadv6::Methodology;
use crate::projectsetup::{SetupFile, SetupReport};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

/// Where archives live, project-relative.
pub(crate) const ARCHIVE_DIR: &str = ".ade/archive";
/// The journal inside each archive.
pub(crate) const JOURNAL: &str = "ARCHIVE.md";
/// The rules' section about the archive, which `RULES_MD` in
/// src/lib/projectMethodology.ts ends with too, and the marker that keeps a
/// project from getting it twice.
pub(crate) const ARCHIVE_RULE: &str = include_str!("archive_rule.md");
pub(crate) const ARCHIVE_RULE_MARKER: &str = "<!-- ade:archive -->";

/// What the switch reads and edits beside the paths it moves, project-relative.
const MARKER: &str = ".ade/methodology";
const RULES: &str = ".ade/rules.md";
const SETTINGS: &str = ".claude/settings.json";

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
    /// The files in it. `COUNT_LIMIT` means "unknown, or at least that many":
    /// the count stopped there, or a folder inside couldn't be read.
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
    /// What a rollback couldn't put back. The error that says so is shown
    /// once; this is what the person still has when they open the file.
    pub problems: Vec<String>,
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
            problems: Vec::new(),
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
        if !self.problems.is_empty() {
            out.push_str("\n## What couldn't be put back\n\n");
            for problem in &self.problems {
                out.push_str(&format!("- {}\n", clean(problem)));
            }
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

/// What a switch moves whatever the configs say, beside ADE's skills and
/// role files.
const ADES: [&str; 7] = [".bmad-core", ".claude/commands/BMad", ".ade/stage", "_bmad", ".ade/approvals", ".ade/gates", ".ade/methodology"];

/// Where a person's own skills, agents and commands are. ADE's entries inside
/// these move; the folders themselves never do.
const OWN: [(&str, &str); 3] = [(".claude/agents", "agents"), (".claude/skills", "skills"), (".claude/commands", "commands")];

/// The files ADE's rules name, and what the rules use each for.
const RULE_FILES: [(&str, &str); 2] = [("docs/prd.md", "the PRD"), ("docs/architecture.md", "the verification command")];

/// The most entries one path's file count looks at. A moved folder can hold a
/// `node_modules`; the dialog must not wait on it. A `files` equal to this is
/// "unknown, or at least this many": the count stopped here, or met a folder
/// it couldn't read, which may hold any number. The dialog shows it as
/// "50,000+", and a total that includes one is a lower bound. The frontend
/// keeps the same number.
pub(crate) const COUNT_LIMIT: u32 = 50_000;

/// One of the person's documents, which stays unless they tick it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    /// As `Move.files`: `COUNT_LIMIT` means "unknown, or at least that many".
    pub files: u32,
    pub ticked: bool,
    /// What moving it would cost: it is, or holds, a file ADE's rules name.
    pub warning: Option<String>,
    /// Where it leads, when the path is itself a link: ticking it moves the
    /// link and leaves what is behind it. `None` for a real file or folder.
    pub link_to: Option<String>,
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
pub struct Env {
    /// The git program. A name that doesn't exist is a machine without git.
    pub git: &'static str,
    /// Each version's bundled resources, when they resolve.
    pub v4_src: Option<PathBuf>,
    pub v6_src: Option<PathBuf>,
    /// Today, `YYYY-MM-DD`.
    pub today: String,
    /// The device a path is on, where that can be known.
    pub device: fn(&Path) -> Option<u64>,
    /// `std::fs::rename`. A test's stand-in fails a chosen move.
    pub rename: fn(&Path, &Path) -> std::io::Result<()>,
    /// `std::fs::hard_link`, which puts a file back without ever replacing
    /// one that is there. A test's stand-in has one appear, or has none.
    pub link: fn(&Path, &Path) -> std::io::Result<()>,
    /// Test seam: fail once the rules step has run, the last point a real
    /// failure can come from (the journal's final write).
    pub fail_after_rules: bool,
    /// Test seam: runs as a rollback starts, where a test changes the project
    /// as a person or an agent might while a switch runs. Nothing otherwise.
    pub before_rollback: fn(&Path),
}

/// Exists, a link that points nowhere included: a link is moved as the link.
pub(crate) fn present(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// Unix `st_dev`: a rename can't cross devices. Unknown elsewhere, where the
/// rename itself reports it.
pub fn device_of(path: &Path) -> Option<u64> {
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
pub fn today() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    civil_date((secs / 86_400) as i64)
}

/// Files under `path`, links not followed: a link counts as the one thing it
/// is. Stops once it has looked at `limit` entries, folders included, so a
/// huge tree costs no more than a large one, and then answers `limit`: "at
/// least". A folder that can't be read answers the same, since what is in it
/// is unknown and a smaller number would pass for exact.
fn count_up_to(path: &Path, limit: u32) -> u32 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if !meta.is_dir() {
        return 1;
    }
    let (mut files, mut seen) = (0u32, 0u32);
    let mut folders = vec![path.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let Ok(entries) = std::fs::read_dir(&folder) else { return limit };
        for entry in entries {
            let Ok(entry) = entry else { return limit };
            if seen >= limit {
                return limit;
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

/// Why a path of the project has no real place in it.
#[derive(Debug, PartialEq)]
enum Unreal {
    /// A link on the way to it leads out of the project.
    Leaves,
    /// The way to it couldn't be followed, with the system's reason.
    Unreadable(String),
}

impl Unreal {
    fn why(&self, shown: &str) -> String {
        match self {
            Unreal::Leaves => format!("{shown} is reached through a link that leaves the project."),
            Unreal::Unreadable(error) => format!("{shown} can't be checked: the folder it is in can't be read ({error})."),
        }
    }
}

/// `name` as `folder` spells it. On a disk that ignores case a name reaches
/// an entry spelled another way; where case counts, the entry found is the
/// one asked for.
fn disk_name(folder: &Path, name: &std::ffi::OsStr) -> std::ffi::OsString {
    let Ok(entries) = std::fs::read_dir(folder) else { return name.to_os_string() };
    let wanted = name.to_string_lossy().to_lowercase();
    let mut other_case = None;
    for entry in entries.flatten() {
        let found = entry.file_name();
        if found == name {
            return found;
        }
        if found.to_string_lossy().to_lowercase() == wanted {
            other_case = Some(found);
        }
    }
    other_case.unwrap_or_else(|| name.to_os_string())
}

/// Where `rel` really is in the project: every link on the way resolved, and
/// spelled as the disk spells it (`.BMAD-CORE` is `.bmad-core` on a disk that
/// ignores case). A path that is itself a link is that link, so only its
/// parent is resolved, and its name is read from the folder; one that doesn't
/// exist keeps the name it was given. Everything the plan compares is one of
/// these, so two ways to the same file are one path.
fn real_rel(root: &Path, real_root: &Path, rel: &str) -> Result<String, Unreal> {
    if rel.is_empty() {
        return Ok(String::new());
    }
    let path = at(root, rel);
    let link = std::fs::symlink_metadata(&path).ok().map(|meta| meta.file_type().is_symlink());
    let real = if link == Some(false) {
        std::fs::canonicalize(&path).map_err(|e| Unreal::Unreadable(e.to_string()))?
    } else {
        let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else { return Ok(rel.to_string()) };
        match std::fs::canonicalize(parent) {
            Ok(parent) if link == Some(true) => parent.join(disk_name(&parent, name)),
            Ok(parent) => parent.join(name),
            // Not there yet: as far as it exists.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => resolved(parent).join(name),
            Err(e) => return Err(Unreal::Unreadable(e.to_string())),
        }
    };
    real.strip_prefix(real_root).map(slashed).map_err(|_| Unreal::Leaves)
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

/// The first part of `rel` that is a link, as a project-relative path.
fn first_link(root: &Path, rel: &str) -> Option<String> {
    let parts: Vec<&str> = rel.split('/').filter(|part| !part.is_empty()).collect();
    (1..=parts.len())
        .map(|n| parts[..n].join("/"))
        .find(|prefix| std::fs::symlink_metadata(at(root, prefix)).is_ok_and(|meta| meta.file_type().is_symlink()))
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

/// Somewhere a project's documents are.
#[derive(Clone, Debug, PartialEq)]
struct Place {
    path: String,
    /// The core-config key that names it, when one does.
    key: Option<&'static str>,
    /// False for the folder a linked location leads to: it is protected like
    /// the location, but the dialog offers what the config names.
    offered: bool,
}

/// Where a project's documents are: `docs`, the v4 configured locations and
/// the v4 template outputs, those inside the project, each where it really
/// is (`settle`). Each once, whatever the case. A location that is itself a
/// link keeps its name, so the folder it leads to is listed too: `docs ->
/// realdocs` makes `realdocs` the documents as much as `docs`.
fn document_locations(
    root: &Path,
    real_root: &Path,
    paths: &V4Paths,
    notes: &mut Vec<Note>,
    settle: &mut dyn FnMut(String) -> String,
) -> Vec<Place> {
    let configured = [
        (&paths.prd_file, "prdFile"),
        (&paths.prd_sharded_location, "prdShardedLocation"),
        (&paths.architecture_file, "architectureFile"),
        (&paths.architecture_sharded_location, "architectureShardedLocation"),
        (&paths.dev_story_location, "devStoryLocation"),
        (&paths.qa_location, "qaLocation"),
    ];
    let all = std::iter::once(("docs", None))
        .chain(configured.into_iter().map(|(location, key)| (location.as_str(), Some(key))))
        .chain(V4_TEMPLATE_OUTPUTS.into_iter().map(|location| (location, None)));
    let mut places: Vec<Place> = Vec::new();
    for (location, key) in all {
        let Some(path) = inside(root, location, "This document location", notes).map(&mut *settle) else { continue };
        let behind = std::fs::canonicalize(at(root, &path))
            .ok()
            .and_then(|real| real.strip_prefix(real_root).ok().map(slashed))
            // `docs -> .` leads to the project itself, which is no place of
            // its own: everything is inside it.
            .filter(|real| !real.is_empty() && real.to_lowercase() != path.to_lowercase());
        for (path, offered) in std::iter::once((path, true)).chain(behind.map(|real| (real, false))) {
            if !places.iter().any(|known| known.path.to_lowercase() == path.to_lowercase()) {
                places.push(Place { path, key, offered });
            }
        }
    }
    places
}

/// The document locations the dialog may offer. Not `docs` itself, the root,
/// or a folder that holds another location: ticking one of those would take
/// far more than the document it names.
fn documents(root: &Path, places: &[Place]) -> Vec<String> {
    places
        .iter()
        .filter(|place| place.offered)
        .map(|place| &place.path)
        .filter(|rel| !rel.is_empty() && rel.to_lowercase() != "docs")
        .filter(|rel| !places.iter().any(|other| nested(&other.path, rel)))
        .filter(|rel| present(&at(root, rel)))
        .cloned()
        .collect()
}

/// What archiving `path` would cost: it is one of the files ADE's rules
/// name, or a folder that holds one. One sentence for each. The rules read
/// `docs/prd.md` by that name; the disk may spell it `Docs/prd.md`, or keep
/// it behind a link, and `path` is spelled the disk's way, so each file is
/// looked for under both spellings.
fn warning(root: &Path, real_root: &Path, path: &str) -> Option<String> {
    let sentences: Vec<String> = RULE_FILES
        .iter()
        .filter_map(|(file, what)| {
            let real = real_rel(root, real_root, file).unwrap_or_else(|_| file.to_string());
            let spellings = [*file, real.as_str()];
            if spellings.iter().any(|spelling| spelling.to_lowercase() == path.to_lowercase()) {
                Some(format!("ADE's rules use this file ({what}). The new version starts without it."))
            } else if spellings.iter().any(|spelling| within(spelling, path)) && present(&at(root, file)) {
                Some(format!("This folder holds {file}, which ADE's rules use ({what}). The new version starts without it."))
            } else {
                None
            }
        })
        .collect();
    (!sentences.is_empty()).then(|| sentences.join(" "))
}

/// Where `rel` leads when it is itself a link, `None` when it is not one:
/// project-relative for a target in the project (`.` for the project
/// itself), the system's spelling for one outside, and what the link says
/// when it leads nowhere.
fn link_target(root: &Path, real_root: &Path, rel: &str) -> Option<String> {
    let path = at(root, rel);
    if !std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return None;
    }
    Some(match std::fs::canonicalize(&path) {
        Ok(real) => match real.strip_prefix(real_root) {
            Ok(inside) if inside.as_os_str().is_empty() => ".".to_string(),
            Ok(inside) => slashed(inside),
            Err(_) => real.to_string_lossy().into_owned(),
        },
        Err(_) => std::fs::read_link(&path).map(|to| to.to_string_lossy().into_owned()).unwrap_or_default(),
    })
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
    // The root would be asked about as `/`, which is no path of the project.
    if rel.is_empty() {
        return "none";
    }
    let is_dir = std::fs::symlink_metadata(at(root, rel)).map(|m| m.is_dir()).unwrap_or(false);
    let spec = if is_dir { format!("{rel}/") } else { rel.to_string() };
    // A folder named `out[1]` or `:(top)` is that name, not a pattern.
    // `ls-files` takes `--literal-pathspecs` for it. `check-ignore` given
    // that option stops answering for `_bmad-output/` under a `/_bmad-output/`
    // rule; it takes path names, not patterns, and `./` keeps a leading `:`
    // from being read as pathspec magic.
    match crate::git::code(git, root, &["check-ignore", "-q", "--", &format!("./{spec}")]) {
        Some(0) => "all",
        Some(1) if is_dir => {
            let inside = crate::git::run(
                git,
                root,
                &["--literal-pathspecs", "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "--", &spec],
            );
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
    real_root: &'a Path,
    git_dir: PathBuf,
    /// The document locations that exist and weren't ticked.
    kept: &'a [Place],
    /// The planned paths a config names, with where it names them: what to
    /// change when one can't be moved.
    sources: &'a [(String, &'static str)],
    /// (where a path really is, how the project's config spelled it).
    aliases: &'a [(String, String)],
    /// The planned paths a switch moves whatever the configs say.
    ades: &'a [String],
    archive_device: Option<u64>,
    device: fn(&Path) -> Option<u64>,
}

impl Limits<'_> {
    /// How the config spelled `rel`, when a link makes that another path.
    /// Another case of the same name is not worth a word.
    fn said(&self, rel: &str) -> Option<&str> {
        self.aliases.iter().find(|(real, said)| real == rel && said.to_lowercase() != rel.to_lowercase()).map(|(_, said)| said.as_str())
    }
}

/// `spot` as a reason names it: with the config's spelling first when a link
/// makes that another path.
fn shown(spot: &str, said: Option<&str>) -> String {
    match said {
        Some(said) => format!("{said}, which is {spot} through a link,"),
        None => spot.to_string(),
    }
}

/// Why nothing may be moved from `spot`, which the config spelled `said`
/// when a link makes that another path. `source` is the config key to change
/// to unblock it, when there is one.
fn forbidden(spot: &str, said: Option<&str>, kept: &[Place], source: Option<&str>) -> Option<String> {
    let shown = shown(spot, said);
    if within(spot, ARCHIVE_DIR) || within(ARCHIVE_DIR, spot) {
        return Some(format!("{shown} holds or is inside {ARCHIVE_DIR}/, so it can't be moved there."));
    }
    let top_level = !spot.contains('/');
    let name = spot.to_lowercase();
    // A worktree's `.git` is a file, and git's own folder is elsewhere.
    if name.split('/').next() == Some(".git") {
        return Some(format!("{shown} is part of git's own folder."));
    }
    // The archive mirrors the project, so these would land on its own files.
    if top_level && (name == JOURNAL.to_lowercase() || name.starts_with("leftovers-")) {
        return Some(format!("{shown} is named like the archive's own {JOURNAL} and leftovers folders, so it can't be moved there."));
    }
    if let Some(stay) = STAYS.iter().find(|stay| within(stay, spot)) {
        return Some(if stay.to_lowercase() == name {
            format!("{shown} is used by both BMAD versions, so it stays.")
        } else {
            format!("{shown} holds {stay}, which both BMAD versions use, so it stays.")
        });
    }
    if let Some((own, what)) = OWN.iter().find(|(own, _)| within(own, spot)) {
        return Some(format!("{shown} would take your own {what} in {own} with it, so it stays."));
    }
    // A document location inside a planned move is never offered, so there
    // is no tick to promise: the reason says what to change.
    if let Some(doc) = kept.iter().find(|doc| within(&doc.path, spot)) {
        let same = doc.path.to_lowercase() == name;
        let named = match said {
            Some(said) => format!("`{said}`, which is `{spot}` through a link,"),
            None => format!("`{spot}`"),
        };
        let what = if same {
            format!("{named} is a document location, so it stays.")
        } else {
            format!("{named} holds `{}`, a document location.", doc.path)
        };
        let to_do = match (source, doc.key) {
            (Some(source), _) => format!("Change {source}."),
            (None, Some(key)) if same => format!("Change `{key}` in core-config.yaml."),
            (None, Some(key)) => format!("Move it out, or change `{key}` in core-config.yaml."),
            (None, None) => "Move it out.".to_string(),
        };
        return Some(format!("{what} {to_do}"));
    }
    None
}

/// Why `rel` can't be moved, if it can't.
fn refuse(rel: &str, limits: &Limits) -> Option<String> {
    if rel.is_empty() {
        return Some("A configured location is the project folder itself, which can't be moved.".to_string());
    }
    let said = limits.said(rel);
    let shown = shown(rel, said);
    // Every planned path is where it really is by now. One that has no real
    // place in the project kept the spelling it came with, and stops here.
    if let Err(unreal) = real_rel(limits.root, limits.real_root, rel) {
        return Some(unreal.why(&shown));
    }
    // A config key that names a path ADE moves anyway is not what to
    // change: the path would still move.
    let own = limits.ades.iter().any(|path| path == rel);
    let source = limits.sources.iter().find(|(path, _)| !own && path == rel).map(|(_, source)| *source);
    if let Some(why) = forbidden(rel, said, limits.kept, source) {
        return Some(why);
    }
    let real = at(limits.real_root, rel);
    if real.starts_with(&limits.git_dir) || limits.git_dir.starts_with(&real) {
        return Some(format!("{shown} is part of git's own folder."));
    }
    if let (Some(here), Some(there)) = ((limits.device)(&at(limits.root, rel)), limits.archive_device) {
        if here != there {
            return Some(format!("{shown} is on another volume than the archive, so it can't be moved there in one step."));
        }
    }
    None
}

/// What switching `root` to `to` would do. `ticked` is the documents the
/// person ticked; only ones the plan itself offers are taken. Nothing is
/// written.
pub fn plan(root: &Path, to: Methodology, ticked: &[String], env: &Env) -> SwitchPlan {
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
    let real_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());

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
    // The archive stays in the project: a link on the way to it could put
    // every moved file somewhere else.
    for folder in [".ade", ARCHIVE_DIR] {
        if std::fs::symlink_metadata(at(root, folder)).is_ok_and(|meta| meta.file_type().is_symlink()) {
            reasons.push(format!("{folder} is a link, so the archive would not be kept in the project."));
        }
    }
    if !resolved(&lexical(&at(root, &plan.archive))).starts_with(&real_root) {
        reasons.push(format!("The archive folder {} would be outside the project.", plan.archive));
    }
    if let Some(earlier) = pending(root).first() {
        // An archive that can't be read may hold no journal to point at, and
        // isn't known to be unfinished.
        reasons.push(if earlier.status == "unknown" {
            format!("ADE can't read {}, so it can't tell whether an earlier switch here finished.", earlier.archive)
        } else {
            format!("An earlier switch here didn't finish. See {}/{JOURNAL}.", earlier.archive)
        });
    }

    let mut moves: Vec<String> = Vec::new();
    let mut leftovers: Vec<String> = Vec::new();
    let mut notes: Vec<Note> = Vec::new();
    let mut offered: Vec<String> = Vec::new();
    let mut sources: Vec<(String, &'static str)> = Vec::new();
    let mut aliases: Vec<(String, String)> = Vec::new();
    // Every path is compared where it really is. One with no real place in
    // the project keeps its spelling and is refused below.
    let mut settle = |rel: String| -> String {
        match real_rel(root, &real_root, &rel) {
            Ok(real) => {
                if real != rel {
                    aliases.push((real.clone(), rel));
                }
                real
            }
            Err(_) => rel,
        }
    };
    // A v6 project reads the v4 config only if an earlier version left one.
    let config = core_config(root).unwrap_or_else(|why| {
        reasons.push(why);
        None
    });
    let paths = crate::bmadconfig::parse_core_config(config.as_deref());
    let v6_skills = env.v6_src.as_deref().map(|src| bundled_skills(root, src)).unwrap_or_default();
    let ades: Vec<String> = ADES
        .iter()
        .map(|path| path.to_string())
        .chain(v6_skills.iter().cloned())
        .chain(CORE_ROLES.iter().map(|role| format!(".claude/agents/{role}.md")))
        .collect();
    let places = match from {
        Methodology::V4 => {
            moves.extend([".bmad-core".to_string(), ".claude/commands/BMad".to_string()]);
            if let Some(rel) = inside(root, &paths.dev_debug_log, "The debug log", &mut notes).map(&mut settle) {
                sources.push((rel.clone(), "`devDebugLog` in core-config.yaml"));
                moves.push(rel);
            }
            moves.push(".ade/stage".to_string());
            let places = document_locations(root, &real_root, &paths, &mut notes, &mut settle);
            offered = documents(root, &places);
            leftovers.push("_bmad".to_string());
            leftovers.extend(v6_skills);
            places
        }
        Methodology::V6 => {
            // Where v4 would keep documents, so an output folder among them
            // is recognised. One of those outside the project is no news here.
            let places = document_locations(root, &real_root, &paths, &mut Vec::new(), &mut settle);
            moves.push("_bmad".to_string());
            match crate::bmadconfig::load_central_config(root) {
                Ok(config) => {
                    let configured = crate::bmadconfig::output_folder(root, &config);
                    if let Some(rel) = inside(root, &configured, "The output folder", &mut notes).map(&mut settle) {
                        // An output folder among the documents is one of
                        // them: it stays unless ticked. The root still goes
                        // to the moves, where it is refused.
                        let holds_documents = !rel.is_empty() && places.iter().any(|doc| within(&rel, &doc.path) || within(&doc.path, &rel));
                        if !holds_documents {
                            sources.push((rel.clone(), "`output_folder` in the _bmad config"));
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
            places
        }
    };
    // Both directions: the marker, and the role files ADE writes, edited or
    // not. Agents the person added have other names and stay.
    moves.push(".ade/methodology".to_string());
    moves.extend(CORE_ROLES.iter().map(|role| format!(".claude/agents/{role}.md")));

    // Only paths that exist, each where it really is, each once.
    let mut existing = |paths: Vec<String>| {
        let mut out: Vec<String> = Vec::new();
        for path in paths {
            if present(&at(root, &path)) {
                let real = settle(path);
                if !out.contains(&real) {
                    out.push(real);
                }
            }
        }
        out
    };
    let mut moves = existing(moves);
    let leftovers = existing(leftovers);
    let ades = existing(ades);
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

    // A link on the way to something that moves is not moved itself, and
    // will point nowhere afterwards.
    for (real, said) in &aliases {
        if said.to_lowercase() == real.to_lowercase() {
            continue;
        }
        let Some(link) = first_link(root, said) else { continue };
        let Some(leads_to) = std::fs::canonicalize(at(root, &link)).ok().and_then(|to| to.strip_prefix(&real_root).ok().map(slashed)) else { continue };
        let planned = || moves.iter().chain(&leftovers);
        if planned().any(|path| within(&link, path)) || !planned().any(|path| within(&leads_to, path)) || notes.iter().any(|note| note.path == link) {
            continue;
        }
        notes.push(Note { reason: format!("`{link}` is a link to `{leads_to}`, which moves; the link is left in place."), path: link });
    }

    // What must not be taken along: every document location that exists and
    // every offered document, unless it was ticked or is inside one that was.
    let mut kept: Vec<Place> = places.iter().filter(|place| present(&at(root, &place.path))).cloned().collect();
    kept.extend(offered.iter().filter(|doc| !places.iter().any(|place| &place.path == *doc)).map(|doc| Place { path: doc.clone(), key: None, offered: true }));
    kept.retain(|place| !ticked.iter().any(|taken| within(&place.path, taken)));
    // `--absolute-git-dir` also answers for a worktree, whose `.git` is a file.
    let git_dir = crate::git::run(env.git, root, &["rev-parse", "--absolute-git-dir"])
        .map(|out| PathBuf::from(out.trim()))
        .unwrap_or_else(|| root.join(".git"));
    let limits = Limits {
        root,
        real_root: &real_root,
        git_dir: std::fs::canonicalize(&git_dir).unwrap_or(git_dir),
        kept: &kept,
        sources: &sources,
        aliases: &aliases,
        ades: &ades,
        archive_device: at(root, &plan.archive).ancestors().find(|p| present(p)).and_then(|p| (env.device)(p)),
        device: env.device,
    };
    reasons.extend(moves.iter().chain(&leftovers).filter_map(|rel| refuse(rel, &limits)));

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
        .map(|rel| Document {
            path: rel.clone(),
            files: count_files(&at(root, rel)),
            ticked: ticked.contains(rel),
            warning: warning(root, &real_root, rel),
            link_to: link_target(root, &real_root, rel),
        })
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
        rename: fs_rename,
        link: fs_link,
        fail_after_rules: false,
        before_rollback: nothing,
    }
}

/// The dry run the confirm dialog shows. Nothing is written.
#[tauri::command(async)]
pub fn bmad_switch_plan(app: tauri::AppHandle, root: String, to: String, documents: Vec<String>) -> Result<SwitchPlan, String> {
    let dir = crate::projectsetup::project(&root)?;
    Ok(plan(&dir, target(&to)?, &documents, &env(&app)))
}

fn fs_rename(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}

fn fs_link(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::hard_link(from, to)
}

fn nothing(_: &Path) {}

/// A Windows path too long for the classic API, with the `\\?\` prefix that
/// lifts the limit. Folder creation fails from 248 characters, so that is the
/// threshold. Anything else is returned as it is.
pub(crate) fn verbatim(path: &str) -> String {
    let absolute = path.len() > 2 && path.as_bytes()[1] == b':';
    if path.len() < 248 || !absolute || path.starts_with(r"\\?\") {
        return path.to_string();
    }
    format!(r"\\?\{}", path.replace('/', r"\"))
}

/// `path`, in the form the OS will take however deep the archive mirrors it.
fn long(path: PathBuf) -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(verbatim(&path.to_string_lossy()))
    } else {
        path
    }
}

/// What a finished switch reports.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    /// The archive folder, project-relative.
    pub archive: String,
    /// Files moved into it. At least that many when `moved_capped`.
    pub moved: u32,
    /// A moved path's count stopped at `COUNT_LIMIT` (it holds that many
    /// files or more, or a folder in it couldn't be read), so `moved` is a
    /// lower bound.
    pub moved_capped: bool,
    pub setup: SetupReport,
    /// The archive section was appended to an existing `.ade/rules.md`.
    pub rules_appended: bool,
    /// `.claude/settings.json` denies edits to the archive.
    pub archive_denied: bool,
}

/// The new version's setup files, as `project_setup_apply` takes them.
pub struct SetupInput<'a> {
    pub files: &'a [SetupFile],
    pub import: &'a str,
    pub marker: &'a str,
}

/// `.ade/archive/bmad-<from>-YYYY-MM-DD`, with an optional `-N`. The name
/// comes back from the webview, and everything the switch writes goes under it.
fn valid_archive(archive: &str, from: &str) -> bool {
    let Some(rest) = archive.strip_prefix(&format!("{ARCHIVE_DIR}/bmad-{from}-")) else { return false };
    if !rest.is_ascii() || rest.len() < 10 {
        return false;
    }
    let (date, number) = rest.split_at(10);
    let date_ok = date.char_indices().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() })
        && matches!(date[5..7].parse::<u8>(), Ok(1..=12))
        && matches!(date[8..10].parse::<u8>(), Ok(1..=31));
    let number_ok = number.is_empty() || number.strip_prefix('-').is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()));
    date_ok && number_ok
}

/// The files a plan moves, and whether that is only a lower bound: one of
/// its counts stopped at `COUNT_LIMIT`.
fn moved_files(plan: &SwitchPlan) -> (u32, bool) {
    let counts = || plan.moves.iter().chain(&plan.leftovers).map(|m| m.files);
    (counts().fold(0, u32::saturating_add), counts().any(|files| files >= COUNT_LIMIT))
}

/// The archive folder, once made, is a folder of this project: every level
/// on the way to it is a real folder, not a link that could lead anywhere.
/// The plan refuses the same before anything is written; this is the check
/// on what was made.
fn archive_in_project(root: &Path, archive: &str) -> Result<(), String> {
    let parts: Vec<&str> = archive.split('/').collect();
    for n in 1..=parts.len() {
        let level = parts[..n].join("/");
        // A link's own metadata is never a folder's.
        if !std::fs::symlink_metadata(at(root, &level)).is_ok_and(|meta| meta.is_dir()) {
            return Err(format!("{level} is not a folder of this project, so the archive would not be kept in it."));
        }
    }
    Ok(())
}

/// A file's bytes, or `None` when there is no such file. Only "not found" is
/// absent: a file that is there and can't be read is an error, so nothing
/// later takes it for one the switch may remove or replace.
fn read_or_absent(path: &Path) -> std::io::Result<Option<Vec<u8>>> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        // A link that leads nowhere reads as not found, and is there.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !present(path) => Ok(None),
        Err(e) => Err(e),
    }
}

/// What `rel` holds before the switch changes it, for a rollback to put back.
fn snapshot_of(root: &Path, rel: &str) -> Result<Option<Vec<u8>>, String> {
    read_or_absent(&at(root, rel)).map_err(|e| format!("{rel} can't be read: {e}"))
}

/// Write `bytes` as the whole of `path`, in one step where they are text.
fn write_whole(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    match std::str::from_utf8(bytes) {
        Ok(text) => crate::state::atomic_write(path, text),
        Err(_) => std::fs::write(path, bytes),
    }
}

/// Make `rel` hold `old` again. A file that is there now and can't be read
/// is left as it is, and that is the error.
fn restore(root: &Path, rel: &str, old: &[u8]) -> Result<(), String> {
    let path = at(root, rel);
    let now = read_or_absent(&path).map_err(|e| format!("{rel} can't be read, so it was left as it is: {e}"))?;
    if now.as_deref() == Some(old) {
        return Ok(());
    }
    write_whole(&path, old).map_err(|e| format!("{rel}: {e}"))
}

/// What the switch knows of `.claude/settings.json`.
struct Settings {
    /// Its bytes before setup ran; `None` when there was no file.
    old: Option<Vec<u8>>,
    /// Where it led, when it was a link. Setup's save replaces a link with
    /// a regular file and never writes the link's target.
    link: Option<PathBuf>,
    /// Its bytes as the switch last left it, the outer `None` when that
    /// couldn't be read. A rollback undoes only what still reads like this:
    /// anything else was edited by someone since, and is theirs.
    written: Option<Option<Vec<u8>>>,
}

impl Settings {
    fn snapshot(root: &Path) -> Result<Self, String> {
        let old = snapshot_of(root, SETTINGS)?;
        Ok(Settings { link: std::fs::read_link(at(root, SETTINGS)).ok(), written: Some(old.clone()), old })
    }

    /// The switch has just edited the file, or may have.
    fn note(&mut self, root: &Path) {
        self.written = read_or_absent(&at(root, SETTINGS)).ok();
    }

    /// Put the file back as it was before setup ran.
    fn restore(&self, root: &Path) -> Result<(), String> {
        let path = at(root, SETTINGS);
        let now = read_or_absent(&path).map_err(|e| format!("{SETTINGS} can't be read, so it was left as it is: {e}"))?;
        let was_replaced = self.link.is_some() && !std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink());
        if now == self.old && !was_replaced {
            return Ok(());
        }
        if self.written.as_ref() != Some(&now) {
            return Err(format!("{SETTINGS} changed after the switch edited it, so it was left as it is"));
        }
        match (&self.link, &self.old) {
            (Some(target), _) if was_replaced => self.relink(&path, target),
            (_, Some(old)) => write_whole(&path, old).map_err(|e| format!("{SETTINGS}: {e}")),
            (_, None) => std::fs::remove_file(&path).map_err(|e| format!("{SETTINGS}: {e}")),
        }
    }

    /// The file was a link to `target` and is a regular file now. The target
    /// was never written, so when it still holds the old bytes the link goes
    /// back in one step, over the file the switch wrote.
    fn relink(&self, path: &Path, target: &Path) -> Result<(), String> {
        let replaced = || format!("{SETTINGS} was a link to {} and is now a regular file", target.display());
        #[cfg(unix)]
        {
            let behind = path.parent().map(|folder| folder.join(target)).unwrap_or_else(|| target.to_path_buf());
            if std::fs::read(&behind).ok() != self.old {
                return Err(format!("{} (what it led to has changed)", replaced()));
            }
            let fresh = path.with_file_name(".settings.json.ade-link");
            // A name that is taken is someone's file, and stays.
            std::os::unix::fs::symlink(target, &fresh).map_err(|e| format!("{} ({e})", replaced()))?;
            std::fs::rename(&fresh, path).map_err(|e| {
                // This call made it, and nothing will look for it.
                match std::fs::remove_file(&fresh) {
                    Err(left) if left.kind() != std::io::ErrorKind::NotFound => format!("{} ({e}; {} is left beside it: {left})", replaced(), fresh.display()),
                    _ => format!("{} ({e})", replaced()),
                }
            })
        }
        #[cfg(not(unix))]
        {
            // Making a link needs a privilege here that the app may not have.
            let _ = path;
            Err(replaced())
        }
    }
}

/// How an entry failed to come back from the archive.
enum Back {
    /// Something is at its place again. It stays, and so does the archived one.
    Occupied,
    Failed(std::io::Error),
    /// It is back, and the same file is still in the archive under its name there.
    CopyLeft(std::io::Error),
}

/// Move `archived` back to `home` without replacing anything there.
///
/// A rename replaces a file that is in its way without a word, on Unix and
/// on Windows, so a file goes back as a hard link, which fails when the name
/// is taken, and then the archive's name for it is removed. A folder is
/// renamed: a rename onto a folder with anything in it fails, and an empty
/// one loses nothing. A link is renamed too, as is a file on a volume with
/// no hard links: there the check and the rename are two steps, and a file
/// written between those two calls would be replaced. Nothing else runs
/// between them.
fn move_back(archived: &Path, home: &Path, env: &Env) -> Result<(), Back> {
    let meta = std::fs::symlink_metadata(archived).map_err(Back::Failed)?;
    if meta.is_file() {
        match (env.link)(archived, home) {
            Ok(()) => return std::fs::remove_file(archived).map_err(Back::CopyLeft),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return Err(Back::Occupied),
            // No hard links here, or not for this file: the rename below.
            Err(_) => {}
        }
    }
    if present(home) {
        return Err(Back::Occupied);
    }
    (env.rename)(archived, home).map_err(Back::Failed)
}

/// Append the archive section to the rules a project already has. Returns
/// what was appended, so a rollback can take exactly that off again.
fn append_archive_rule(root: &Path) -> Result<Option<String>, String> {
    use std::io::{Seek, Write};
    let rules = at(root, RULES);
    let text = match std::fs::read_to_string(&rules) {
        Ok(text) => text,
        // A link that leads nowhere reads as not found, and is there.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !present(&rules) => return Ok(None),
        // Rules that are there and can't be read may or may not carry it.
        Err(e) => return Err(format!("{RULES} can't be read: {e}")),
    };
    if text.contains(ARCHIVE_RULE_MARKER) {
        return Ok(None);
    }
    let added = format!("{}{ARCHIVE_RULE}", if text.ends_with('\n') { "\n" } else { "\n\n" });
    // In place, at the end: the file keeps its permissions, and a link stays a link.
    let mut file = std::fs::OpenOptions::new().write(true).open(&rules).map_err(|e| format!("{RULES}: {e}"))?;
    let wrote = file.seek(std::io::SeekFrom::End(0)).and_then(|_| file.write_all(added.as_bytes())).and_then(|()| file.sync_all());
    if let Err(e) = wrote {
        // Part of a section is neither the rule nor something a rollback
        // would recognise: cut the file back to what it was.
        return Err(match file.set_len(text.len() as u64) {
            Ok(()) => format!("{RULES}: {e}"),
            Err(cut) => format!("{RULES}: {e} (and what was written of the archive section couldn't be taken off: {cut})"),
        });
    }
    Ok(Some(added))
}

/// Take the appended section off the end of the rules again. Rules that no
/// longer end with it were edited since, and are left as they are.
fn strip_archive_rule(root: &Path, added: &str) -> Result<(), String> {
    let rules = at(root, RULES);
    let text = std::fs::read_to_string(&rules).map_err(|e| format!("{RULES}: {e}"))?;
    if !text.ends_with(added) {
        return Err(format!("{RULES} changed after the archive section was added to it, so the section is still there"));
    }
    let file = std::fs::OpenOptions::new().write(true).open(&rules).map_err(|e| format!("{RULES}: {e}"))?;
    file.set_len((text.len() - added.len()) as u64).map_err(|e| format!("{RULES}: {e}"))
}

/// One switch under way: what it has done so far, which is what a rollback undoes.
struct Run<'a> {
    root: &'a Path,
    /// The archive folder, project-relative.
    archive: String,
    journal: Journal,
    /// The journal is on disk.
    journaled: bool,
    /// Folders the switch itself created, outermost first.
    dirs: Vec<PathBuf>,
    /// Setup has started: the new version's files may be in the project.
    setup_ran: bool,
    report: SetupReport,
    /// `.ade/methodology` before anything moved; `Some(None)` when there was none.
    marker: Option<Option<Vec<u8>>>,
    /// `.claude/settings.json`, once setup is about to run.
    settings: Option<Settings>,
    /// What was appended to `.ade/rules.md`.
    rules: Option<String>,
}

impl<'a> Run<'a> {
    /// A switch about to start, as the plan apply() made itself says it goes.
    fn new(root: &'a Path, plan: &SwitchPlan, env: &Env) -> Self {
        let moves: Vec<Move> = plan.moves.iter().chain(&plan.leftovers).cloned().collect();
        Run {
            root,
            archive: plan.archive.clone(),
            journal: Journal::new(&plan.from, &plan.to, &env.today, &moves),
            journaled: false,
            dirs: Vec::new(),
            setup_ran: false,
            report: SetupReport::default(),
            marker: None,
            settings: None,
            rules: None,
        }
    }

    fn save(&self) -> Result<(), String> {
        self.journal.write(&long(at(self.root, &self.archive)))
    }

    fn note_settings(&mut self) {
        if let Some(settings) = &mut self.settings {
            settings.note(self.root);
        }
    }

    /// The move that takes the marker, if the plan has one.
    fn marker_move(&self) -> Option<usize> {
        self.journal.moves.iter().position(|m| m.0.to_lowercase() == MARKER)
    }

    fn forward(&mut self, to: Methodology, plan: &SwitchPlan, setup: &SetupInput, env: &Env) -> Result<SwitchResult, String> {
        let root = self.root;
        // What the marker says now, before anything is made or moved.
        self.marker = Some(snapshot_of(root, MARKER)?);

        // 2. The archive folder and the journal, before the first move.
        // `create_dir` refuses a folder that appeared since apply() looked.
        let archive = long(at(root, &self.archive));
        if let Some(parent) = archive.parent() {
            crate::projectsetup::mkdirs(parent, &mut self.dirs)?;
        }
        std::fs::create_dir(&archive).map_err(|e| format!("{}: {e}", self.archive))?;
        self.dirs.push(archive);
        archive_in_project(root, &self.archive)?;
        self.save()?;
        self.journaled = true;

        // 3. Move. The journal leads the disk: each move is written down as
        // `moving` before its rename, so a crash never leaves one it doesn't name.
        for i in 0..self.journal.moves.len() {
            let (from, into) = (self.journal.moves[i].0.clone(), self.journal.moves[i].1.clone());
            self.journal.moves[i].2 = MoveState::Moving;
            self.save()?;
            let dst = long(at(root, &into));
            if let Some(parent) = dst.parent() {
                crate::projectsetup::mkdirs(parent, &mut self.dirs)?;
            }
            // rename() replaces a file that is in the way without a word.
            if present(&dst) {
                // Nothing was moved, and what is there is not this move's.
                self.journal.moves[i].2 = MoveState::Pending;
                return Err(format!("Couldn't move {from}: {into} already exists."));
            }
            // No copy for another volume: a rename is one step or nothing.
            (env.rename)(&long(at(root, &from)), &dst).map_err(|e| format!("Couldn't move {from}: {e}"))?;
            self.journal.moves[i].2 = MoveState::Moved;
            self.save()?;
        }

        // 4. Snapshot the settings setup and the deny rule may edit.
        self.settings = Some(Settings::snapshot(root)?);

        // 5. Set up the new version, keeping its report even when it fails.
        self.journal.phase = "setup";
        self.save()?;
        let src = match to {
            Methodology::V4 => env.v4_src.as_deref(),
            Methodology::V6 => env.v6_src.as_deref(),
        }
        .ok_or_else(|| format!("ADE's bundled BMAD {} files weren't found.", to.as_str()))?;
        self.setup_ran = true;
        // Setup edits the settings last, and only when all else worked.
        crate::projectsetup::apply(root, setup.files, Some(setup.import), setup.marker, to, Some(src), &mut self.report)?;
        self.note_settings();

        // 6. Rules, after setup: a project with no rules.md has the full rules by now.
        self.journal.phase = "rules";
        self.save()?;
        self.rules = append_archive_rule(root)?;
        // A settings file that can't be edited is reported, not fatal.
        let archive_denied = crate::usage::deny_archive_edits(root).is_ok();
        self.note_settings();
        if env.fail_after_rules {
            return Err("failed on purpose, after the rules step".to_string());
        }

        // 7. Done.
        self.journal.status = "complete";
        self.journal.phase = "done";
        self.save()?;
        let (moved, moved_capped) = moved_files(plan);
        Ok(SwitchResult {
            archive: self.archive.clone(),
            moved,
            moved_capped,
            setup: std::mem::take(&mut self.report),
            rules_appended: self.rules.is_some(),
            archive_denied,
        })
    }

    /// Undo what forward() did, and return the error to report. Every file
    /// goes back to its path and content, and nothing the switch created is
    /// left; directory times and git's index can't be restored. A step that
    /// can't be undone doesn't stop the ones after it: each is named in the
    /// error and in the journal, which then stays, `incomplete`, with the
    /// archive.
    fn rollback(&mut self, error: String, setup: &SetupInput, env: &Env) -> String {
        let root = self.root;
        // `incomplete` from the first write. Its hand text (ignore the
        // phase, use each move's state) is true at every instant of a
        // rollback, and it blocks the project if this is interrupted.
        // Whatever forward() last set, `complete` included, would not.
        //
        // A rollback that can't write that does not start. The journal on
        // disk is then still true (each move's state was written before the
        // move), the project stays blocked by it, and the person follows it;
        // undoing things under a journal that can't be changed would make
        // it false.
        let said = self.journal.status;
        self.journal.status = "incomplete";
        if self.journaled {
            if let Err(e) = self.save() {
                self.journal.status = said;
                return format!(
                    "{}. Couldn't record the rollback in {}/{JOURNAL} ({e}), so nothing was undone. {JOURNAL} describes the project as it is.",
                    error.trim_end_matches('.'),
                    self.archive
                );
            }
        }
        (env.before_rollback)(root);
        let mut failed: Vec<String> = Vec::new();

        // The rules section first: a rules.md setup wrote must read as setup
        // wrote it to be taken back below.
        if let Some(added) = self.rules.take() {
            if let Err(e) = strip_archive_rule(root, &added) {
                failed.push(e);
            }
        }
        // The settings before setup's folders, which go only when empty.
        if let Some(settings) = self.settings.take() {
            if let Err(e) = settings.restore(root) {
                failed.push(e);
            }
        }
        // What setup created: a file only if it is still as setup wrote it,
        // the import it appended, the folders it made that are empty. That
        // cleanup removes a file of the engine's whatever it holds by now,
        // so two paths are kept from it. The settings: the step above put
        // them back, or left them because someone has edited them since.
        // The marker: the step below removes one that still reads as the
        // switch left it, and leaves one that someone has rewritten.
        let mut report = self.report.clone();
        let (settings, marker) = (at(root, SETTINGS), at(root, MARKER));
        report.created.retain(|path| Path::new(path) != settings && Path::new(path) != marker);
        let taken_back = crate::projectsetup::take_back(root, &report, setup.files, Some(setup.import));
        // That cleanup leaves, without a word, a file someone changed after
        // setup wrote it, and an import that is no longer the end of
        // CLAUDE.md. A file where a move's source was is the reverse move's
        // to report.
        for path in &report.created {
            let created = Path::new(path);
            let Ok(rel) = created.strip_prefix(root).map(slashed) else { continue };
            let a_moves = self.journal.moves.iter().any(|m| within(&rel, &m.0));
            if present(created) && !a_moves && !taken_back.iter().any(|problem| problem.starts_with(path.as_str())) {
                failed.push(format!("{rel} was changed after setup wrote it, so it was left"));
            }
        }
        failed.extend(taken_back);
        if report.appended_import {
            let claude = root.join("CLAUDE.md");
            match std::fs::read_to_string(&claude) {
                Ok(text) if text.contains(setup.import) => {
                    failed.push("CLAUDE.md changed after the import was added to it, so the import is still there".to_string())
                }
                Ok(_) => {}
                // Gone, and the import with it.
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && !present(&claude) => {}
                Err(e) => failed.push(format!("couldn't check CLAUDE.md for the import line, which may still be in it: {e}")),
            }
        }

        // The marker is ADE's own file. Setup wrote the new one, or kept one
        // that already said the new version, which its report doesn't name.
        // Left there it would keep the old marker from coming back. It goes
        // only once setup has run (before that nothing of the switch's
        // writes one), only when it reads as the new version, and only when
        // the old one is safe in the archive or there never was one. A
        // marker that says anything else is someone's: it stays. Where the
        // project had one, the reverse move reports it; where it had none,
        // this does.
        if let (true, Some(old)) = (self.setup_ran, &self.marker) {
            let stray = at(root, MARKER);
            let old_is_safe = match old {
                Some(_) => self.marker_move().is_some_and(|i| present(&long(at(root, &self.journal.moves[i].1)))),
                None => true,
            };
            let says_the_new_version = std::fs::symlink_metadata(&stray).is_ok_and(|meta| meta.is_file())
                && std::fs::read_to_string(&stray).is_ok_and(|text| text.trim() == self.journal.to);
            if says_the_new_version && old_is_safe {
                if let Err(e) = std::fs::remove_file(&stray) {
                    failed.push(format!("{MARKER}: {e}"));
                }
            } else if old.is_none() && present(&stray) {
                failed.push(format!("{MARKER} appeared during the switch and is not what the switch wrote, so it was left"));
            }
        }

        // The moves, last first.
        for i in (0..self.journal.moves.len()).rev() {
            let (from, into, state) = self.journal.moves[i].clone();
            if !matches!(state, MoveState::Moving | MoveState::Moved) {
                continue;
            }
            let (home, archived) = (long(at(root, &from)), long(at(root, &into)));
            if !present(&archived) {
                if state == MoveState::Moving {
                    // Its rename failed, so it never left.
                    self.journal.moves[i].2 = MoveState::Pending;
                } else {
                    failed.push(format!("{from}: {into} is no longer in the archive"));
                }
                continue;
            }
            // The journal leads the disk on the way back too. This save is
            // progress for a crash to find; the one that ends the rollback
            // is the one that counts, and reports.
            self.journal.moves[i].2 = MoveState::Moving;
            let _progress = self.save();
            // Its folder was there when it left, unless someone removed it since.
            let folder = home.parent().map_or(Ok(()), std::fs::create_dir_all);
            // If something is there again, an agent or a person wrote it
            // since: it stays, and this move stays in the archive.
            self.journal.moves[i].2 = match folder.map_err(Back::Failed).and_then(|()| move_back(&archived, &home, env)) {
                Ok(()) => MoveState::MovedBack,
                Err(Back::Occupied) => {
                    failed.push(format!("{from}: something is there again, so what was moved is still at {into}"));
                    MoveState::Moved
                }
                Err(Back::Failed(e)) => {
                    failed.push(format!("{from}: {e}"));
                    MoveState::Moved
                }
                Err(Back::CopyLeft(e)) => {
                    failed.push(format!("{from} is back, but is still also at {into}, which couldn't be removed: {e}"));
                    MoveState::MovedBack
                }
            };
            let _progress = self.save();
        }

        // The marker says what the project is on. Once setup has run,
        // whatever happened to the file in between, it reads as it did
        // before the switch, unless the old one is still in the archive,
        // which the moves above reported.
        if let (true, Some(Some(old))) = (self.setup_ran, &self.marker) {
            let in_archive = self.marker_move().is_some_and(|i| matches!(self.journal.moves[i].2, MoveState::Moving | MoveState::Moved));
            if !in_archive {
                if let Err(e) = restore(root, MARKER, old) {
                    failed.push(e);
                }
            }
        }

        if !failed.is_empty() {
            self.journal.problems = failed.clone();
            if let Err(e) = self.save() {
                failed.push(e);
            }
            return format!(
                "{}. The switch couldn't be fully undone: {}. See {}/{JOURNAL}.",
                error.trim_end_matches('.'),
                failed.join("; "),
                self.archive
            );
        }
        // Everything is back: the archive goes, journal included. Only what
        // the switch made is removed, so anything else written there stays.
        let mut left: Vec<String> = Vec::new();
        if self.journaled {
            let journal = long(at(root, &self.archive)).join(JOURNAL);
            match std::fs::remove_file(&journal) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                // It says `incomplete`, which blocks the project.
                Err(e) => {
                    return format!(
                        "{}. Everything was put back, but {}/{JOURNAL} couldn't be removed ({e}). Delete it, or set `status: abandoned` in it.",
                        error.trim_end_matches('.'),
                        self.archive
                    )
                }
            }
        }
        for dir in self.dirs.iter().rev() {
            if let Err(e) = std::fs::remove_dir(dir) {
                if !matches!(e.kind(), std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty) {
                    left.push(format!("{}: {e}", dir.display()));
                }
            }
        }
        if left.is_empty() {
            error
        } else {
            format!("{}. Everything was put back, but an empty folder couldn't be removed: {}.", error.trim_end_matches('.'), left.join("; "))
        }
    }
}

/// Switch `root` to `to`, as `shown` said it would go. On any failure the
/// project is put back as it was.
pub fn apply(root: &Path, to: Methodology, shown: &SwitchPlan, setup: &SetupInput, env: &Env) -> Result<SwitchResult, String> {
    // 1. Recompute. The plan came back from the webview: only the archive's
    // name is taken from it, checked, and every destination follows from that.
    let ticked: Vec<String> = shown.documents.iter().filter(|d| d.ticked).map(|d| d.path.clone()).collect();
    let fresh = plan_into(root, to, &ticked, env, Some(&shown.archive));
    if fresh.from.is_empty() || fresh.from == fresh.to {
        // No BMAD, or already on the version: there is nothing to archive.
        return Err(fresh.blocked.unwrap_or_else(|| "There is nothing to switch.".to_string()));
    }
    if !valid_archive(&fresh.archive, &fresh.from) {
        return Err(format!("{:?} isn't an archive folder ADE would make.", shown.archive));
    }
    if let Some(why) = &fresh.blocked {
        return Err(why.clone());
    }
    let sources = |p: &SwitchPlan| -> std::collections::BTreeSet<String> { p.moves.iter().chain(&p.leftovers).map(|m| m.from.clone()).collect() };
    // Nothing moves that the person didn't see.
    if sources(&fresh) != sources(shown) {
        return Err("The project changed since this was shown. Review the switch again.".to_string());
    }
    if present(&at(root, &fresh.archive)) {
        return Err(format!("{} already exists. Review the switch again.", fresh.archive));
    }

    let mut run = Run::new(root, &fresh, env);
    match run.forward(to, &fresh, setup, env) {
        Ok(result) => Ok(result),
        Err(error) => Err(run.rollback(error, setup, env)),
    }
}

/// Archive the old version and set up the other one. `plan` is the plan the
/// dialog showed; `files`, `import` and `marker` are the new version's setup
/// files, as `project_setup_apply` takes them.
#[tauri::command(async)]
pub fn bmad_switch_apply(
    app: tauri::AppHandle,
    root: String,
    to: String,
    plan: SwitchPlan,
    files: Vec<SetupFile>,
    import: String,
    marker: String,
) -> Result<SwitchResult, String> {
    let dir = crate::projectsetup::project(&root)?;
    // Held for the whole run: no setup may write into a tree that is half moved.
    let _one = crate::projectsetup::APPLY.lock().unwrap_or_else(|e| e.into_inner());
    apply(&dir, target(&to)?, &plan, &SetupInput { files: &files, import: &import, marker: &marker }, &env(&app))
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
        Env {
            git: "ade-no-such-git",
            v4_src: Some(v4_src()),
            v6_src: Some(v6_src()),
            today: "2026-10-11".into(),
            device: one_device,
            rename: fs_rename,
            link: fs_link,
            fail_after_rules: false,
            before_rollback: nothing,
        }
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
        assert_eq!(blocked, ".git is part of git's own folder.");
        std::fs::remove_dir_all(dir).ok();
    }

    // The rule itself: by name, whatever the case, and only git's own name.
    #[test]
    fn anything_under_a_folder_named_git_is_refused() {
        for spot in [".git", ".GIT/x", ".git/hooks/pre-commit"] {
            assert_eq!(forbidden(spot, None, &[], None), Some(format!("{spot} is part of git's own folder.")));
        }
        for spot in [".github/workflows", ".gitignore", "logs/.git"] {
            assert_eq!(forbidden(spot, None, &[], None), None, "{spot}");
        }
    }

    // R13: a person's own skills, agents and commands are in these folders.
    #[test]
    fn blocked_when_a_move_would_take_a_persons_own_skills_agents_or_commands() {
        let v6 = v6_project();
        write(&v6, "_bmad/config.toml", "[core]\noutput_folder = \".claude/skills\"\n");
        let blocked = plan(&v6, V4, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with(".claude/skills ") && blocked.contains("your own skills"), "{blocked}");

        let v4 = v4_project();
        write(&v4, ".bmad-core/core-config.yaml", "devDebugLog: .claude/agents\n");
        let blocked = plan(&v4, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with(".claude/agents ") && blocked.contains("your own agents"), "{blocked}");
        write(&v4, ".bmad-core/core-config.yaml", "devDebugLog: .claude/commands\n");
        let blocked = plan(&v4, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with(".claude/commands ") && blocked.contains("your own commands"), "{blocked}");
        std::fs::remove_dir_all(v6).ok();
        std::fs::remove_dir_all(v4).ok();
    }

    // Decision 7: the dialog shows what would move beside why it can't.
    #[test]
    fn a_blocked_plan_still_lists_what_would_move() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: docs\n");
        let plan = plan(&dir, V6, &[], &env());
        assert!(plan.blocked.is_some());
        assert_eq!(sources(&plan.moves), [".bmad-core", ".claude/commands/BMad", "docs", ".ade/stage", ".ade/methodology", ".claude/agents/qa.md"]);
        assert_eq!(plan.archive, ARCHIVE);
        std::fs::remove_dir_all(dir).ok();
    }

    // `.BMAD-CORE` is `.bmad-core` on a disk that ignores case: one move, not
    // two, and nothing about links. Where the disk tells them apart the
    // second spelling doesn't exist, and the plan is the same.
    #[test]
    fn a_second_spelling_of_a_planned_path_is_not_planned_twice() {
        let dir = v4_project();
        write(&dir, ".bmad-core/debug.md", "log");
        for configured in [".BMAD-CORE", ".BMAD-CORE/debug.md", ".Bmad-Core/tasks"] {
            write(&dir, ".bmad-core/core-config.yaml", &format!("devDebugLog: {configured}\n"));
            let plan = plan(&dir, V6, &[], &env());
            assert_eq!(plan.blocked, None, "{configured}");
            assert_eq!(
                sources(&plan.moves),
                [".bmad-core", ".claude/commands/BMad", ".ade/stage", ".ade/methodology", ".claude/agents/qa.md"],
                "{configured}"
            );
        }
        std::fs::remove_dir_all(dir).ok();
    }

    // R14: the archive stays in the project.
    #[cfg(unix)]
    #[test]
    fn blocked_when_the_archive_would_be_reached_through_a_link() {
        let outside = temp();
        let dir = v4_project();
        std::os::unix::fs::symlink(&outside, at(&dir, ".ade/archive")).unwrap();
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with(".ade/archive is a link"), "{blocked}");

        // `.ade` itself, even to another folder of this project.
        let other = v4_project();
        std::fs::rename(other.join(".ade"), other.join("state")).unwrap();
        std::os::unix::fs::symlink("state", other.join(".ade")).unwrap();
        let blocked = plan(&other, V6, &[], &env()).blocked.unwrap_or_default();
        assert!(blocked.starts_with(".ade is a link"), "{blocked}");
        for dir in [outside, dir, other] {
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn blocked_when_the_archive_given_is_outside_the_project() {
        let dir = v4_project();
        for archive in ["../elsewhere", ".ade/archive/../../../elsewhere"] {
            let blocked = plan_into(&dir, V6, &[], &env(), Some(archive)).blocked.unwrap_or_default();
            assert!(blocked.contains("outside the project"), "{archive}: {blocked}");
        }
        std::fs::remove_dir_all(dir).ok();
    }

    // R11: a folder that holds the files ADE's rules name warns for each.
    #[test]
    fn a_folder_that_holds_the_rule_files_carries_their_warnings() {
        const PRD: &str = "This folder holds docs/prd.md, which ADE's rules use (the PRD). The new version starts without it.";
        const ARCHITECTURE: &str =
            "This folder holds docs/architecture.md, which ADE's rules use (the verification command). The new version starts without it.";
        let dir = v6_with_output("docs", "docs");
        let warning = |ticked: &[String]| {
            let plan = plan(&dir, V4, ticked, &env());
            assert_eq!(plan.blocked, None);
            assert_eq!(plan.documents.len(), 1);
            plan.documents[0].warning.clone()
        };
        let docs = ["docs".to_string()];
        assert_eq!(warning(&docs).as_deref(), Some(PRD), "v6_project has docs/prd.md");
        assert_eq!(warning(&[]).as_deref(), Some(PRD), "carried whether ticked or not");
        write(&dir, "docs/architecture.md", "arch");
        assert_eq!(warning(&docs), Some(format!("{PRD} {ARCHITECTURE}")));
        std::fs::remove_file(at(&dir, "docs/prd.md")).unwrap();
        assert_eq!(warning(&docs).as_deref(), Some(ARCHITECTURE));
        std::fs::remove_file(at(&dir, "docs/architecture.md")).unwrap();
        assert_eq!(warning(&docs), None);
        std::fs::remove_dir_all(&dir).ok();
    }

    // R8: a move never swallows what must stay.
    #[test]
    fn blocked_when_a_move_would_take_the_documents_with_it() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: docs\n");
        let first = plan(&dir, V6, &[], &env());
        // R12: the documents inside it aren't offered, so the reason says what
        // to change instead of promising a tick.
        assert_eq!(first.blocked.as_deref(), Some("`docs` is a document location, so it stays. Change `devDebugLog` in core-config.yaml."));
        assert!(first.documents.is_empty(), "nothing inside a planned move is offered: {:?}", first.documents);
        // A single document that is also the debug log is no different.
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: docs/prd.md\n");
        assert_eq!(
            plan(&dir, V6, &[], &env()).blocked.as_deref(),
            Some("`docs/prd.md` is a document location, so it stays. Change `devDebugLog` in core-config.yaml.")
        );
        // A folder that holds one.
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: work\ndevStoryLocation: work/stories\n");
        write(&dir, "work/stories/1.1.md", "story");
        assert_eq!(
            plan(&dir, V6, &[], &env()).blocked.as_deref(),
            Some("`work` holds `work/stories`, a document location. Change `devDebugLog` in core-config.yaml.")
        );
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
            // Named as the disk spells it, which is either case here.
            assert!(blocked.to_lowercase().starts_with(&format!("{} ", kept.to_lowercase())) && blocked.contains("stay"), "{configured}: {blocked}");
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
        assert_eq!(blocked, "logs/settings.json, which is .claude/settings.json through a link, is used by both BMAD versions, so it stays.");

        // Into a folder that moves anyway: it is that folder's file, and goes
        // with it once.
        std::fs::remove_file(dir.join("logs")).unwrap();
        std::os::unix::fs::symlink(dir.join(".bmad-core"), dir.join("logs")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: logs/debug.md\n");
        write(&dir, ".bmad-core/debug.md", "log");
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(sources(&plan.moves), [".bmad-core", ".claude/commands/BMad", ".ade/stage", ".ade/methodology", ".claude/agents/qa.md"]);
        // The link itself is not moved, and will point nowhere afterwards.
        assert_eq!(
            plan.left_in_place,
            [Note { path: "logs".into(), reason: "`logs` is a link to `.bmad-core`, which moves; the link is left in place.".into() }]
        );
        std::fs::remove_dir_all(dir).ok();
    }

    // R9: the output folder is among the documents wherever a link says it is.
    #[cfg(unix)]
    #[test]
    fn an_output_folder_reached_through_a_link_into_the_documents_is_one_of_them() {
        let dir = v6_with_output("link/out", "docs/out");
        std::os::unix::fs::symlink("docs", dir.join("link")).unwrap();
        let unticked = plan(&dir, V4, &[], &env());
        assert_eq!(unticked.blocked, None);
        assert!(!sources(&unticked.moves).iter().any(|from| from.ends_with("/out")), "{:?}", sources(&unticked.moves));
        assert_eq!(unticked.documents.len(), 1, "{:?}", unticked.documents);
        assert_eq!((unticked.documents[0].path.as_str(), unticked.documents[0].ticked), ("docs/out", false));

        let ticked = plan(&dir, V4, &["docs/out".into()], &env());
        assert_eq!(ticked.blocked, None);
        assert!(sources(&ticked.moves).contains(&"docs/out"), "moved from where it really is: {:?}", sources(&ticked.moves));
        assert!(!sources(&ticked.moves).contains(&"link/out"));
        std::fs::remove_dir_all(dir).ok();
    }

    // R8 through a link: the debug log is really a document location.
    #[cfg(unix)]
    #[test]
    fn a_move_reached_through_a_link_into_the_documents_is_blocked() {
        let dir = v4_project();
        std::os::unix::fs::symlink("docs", dir.join("link")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: link/stories\n");
        assert_eq!(
            plan(&dir, V6, &[], &env()).blocked.as_deref(),
            Some("`link/stories`, which is `docs/stories` through a link, is a document location, so it stays. Change `devDebugLog` in core-config.yaml.")
        );
        // Not a location, but a folder that holds one.
        write(&dir, "docs/work/stories/1.1.md", "story");
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: link/work\ndevStoryLocation: docs/work/stories\n");
        assert_eq!(
            plan(&dir, V6, &[], &env()).blocked.as_deref(),
            Some(
                "`link/work`, which is `docs/work` through a link, holds `docs/work/stories`, a document location. Change `devDebugLog` in core-config.yaml."
            )
        );
        std::fs::remove_dir_all(dir).ok();
    }

    /// A project whose `docs` is a link to `realdocs`, another of its folders.
    #[cfg(unix)]
    fn with_linked_docs(dir: PathBuf) -> PathBuf {
        std::fs::rename(dir.join("docs"), dir.join("realdocs")).unwrap();
        std::os::unix::fs::symlink("realdocs", dir.join("docs")).unwrap();
        dir
    }

    #[cfg(unix)]
    const PRD_IN_FOLDER: &str = "This folder holds docs/prd.md, which ADE's rules use (the PRD). The new version starts without it.";

    // The folder `docs` leads to is the documents as much as `docs` is.
    #[cfg(unix)]
    #[test]
    fn a_linked_docs_folder_is_still_the_documents() {
        let dir = with_linked_docs(v6_with_output("docs/out", "docs/out"));
        let unticked = plan(&dir, V4, &[], &env());
        assert_eq!(unticked.blocked, None);
        assert!(!sources(&unticked.moves).iter().any(|from| from.ends_with("/out")), "{:?}", sources(&unticked.moves));
        assert_eq!(unticked.documents.len(), 1, "{:?}", unticked.documents);
        assert_eq!((unticked.documents[0].path.as_str(), unticked.documents[0].ticked), ("realdocs/out", false));
        let ticked = plan(&dir, V4, &["realdocs/out".into()], &env());
        assert_eq!(ticked.blocked, None);
        assert!(sources(&ticked.moves).contains(&"realdocs/out"), "{:?}", sources(&ticked.moves));

        // The output folder is the link, or the folder behind it: offered
        // either way, with the warning for the PRD it holds.
        for output in ["docs", "realdocs"] {
            write(&dir, "_bmad/config.toml", &format!("[core]\noutput_folder = \"{output}\"\n"));
            let plan = plan(&dir, V4, &[], &env());
            assert_eq!(plan.blocked, None, "{output}");
            assert!(!sources(&plan.moves).contains(&output), "{output}: {:?}", sources(&plan.moves));
            assert_eq!(plan.documents.len(), 1, "{output}: {:?}", plan.documents);
            assert_eq!(plan.documents[0].path, output);
            assert_eq!(plan.documents[0].warning.as_deref(), Some(PRD_IN_FOLDER), "{output}");
        }
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_v4_project_with_a_linked_docs_folder_keeps_its_documents() {
        let dir = with_linked_docs(v4_project());
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(plan.documents.iter().map(|d| d.path.as_str()).collect::<Vec<_>>(), ["realdocs/prd.md", "realdocs/architecture.md", "realdocs/stories"]);
        assert_eq!(plan.documents[0].warning.as_deref(), Some("ADE's rules use this file (the PRD). The new version starts without it."));
        assert_eq!(
            plan.documents[1].warning.as_deref(),
            Some("ADE's rules use this file (the verification command). The new version starts without it.")
        );
        assert_eq!(plan.documents[2].warning, None);
        // The folder behind the link can't be taken as the debug log, nor the link.
        for log in ["realdocs", "docs"] {
            write(&dir, ".bmad-core/core-config.yaml", &format!("devDebugLog: {log}\n"));
            let blocked = super::plan(&dir, V6, &[], &env()).blocked.unwrap_or_default();
            assert_eq!(blocked, format!("`{log}` is a document location, so it stays. Change `devDebugLog` in core-config.yaml."));
        }
        std::fs::remove_dir_all(dir).ok();
    }

    // The disk may spell `docs` its own way where it ignores case. ADE's rules
    // still read docs/prd.md there, so the warning still holds.
    #[test]
    fn a_docs_folder_spelled_another_way_still_carries_the_warnings() {
        let dir = v4_project();
        std::fs::rename(dir.join("docs"), dir.join("docs-moving")).unwrap();
        std::fs::rename(dir.join("docs-moving"), dir.join("Docs")).unwrap();
        if !present(&at(&dir, "docs/prd.md")) {
            eprintln!("this disk tells Docs from docs; nothing to check");
            std::fs::remove_dir_all(dir).ok();
            return;
        }
        let v4 = plan(&dir, V6, &[], &env());
        assert_eq!(v4.blocked, None);
        let prd = v4.documents.iter().find(|d| d.path.to_lowercase() == "docs/prd.md").expect("the PRD is offered");
        assert_eq!(prd.warning.as_deref(), Some("ADE's rules use this file (the PRD). The new version starts without it."));

        // The same folder as a v6 project's output folder.
        std::fs::remove_dir_all(dir.join(".bmad-core")).unwrap();
        write(&dir, ".ade/methodology", "v6\n");
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \"docs\"\n");
        let v6 = plan(&dir, V4, &[], &env());
        assert_eq!(v6.blocked, None);
        assert_eq!(v6.documents.len(), 1, "{:?}", v6.documents);
        assert_eq!(
            v6.documents[0].warning.as_deref(),
            Some(
                "This folder holds docs/prd.md, which ADE's rules use (the PRD). The new version starts without it. \
                 This folder holds docs/architecture.md, which ADE's rules use (the verification command). The new version starts without it."
            )
        );
        std::fs::remove_dir_all(dir).ok();
    }

    // R12: when the path is one ADE moves anyway, changing the key that also
    // names it would not help; the location inside it is what to change.
    #[test]
    fn the_advice_names_the_key_that_would_unblock() {
        let dir = v4_project();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: .bmad-core\nqa:\n  qaLocation: .bmad-core/qa\n");
        write(&dir, ".bmad-core/qa/gate.yml", "gate");
        assert_eq!(
            plan(&dir, V6, &[], &env()).blocked.as_deref(),
            Some("`.bmad-core` holds `.bmad-core/qa`, a document location. Move it out, or change `qaLocation` in core-config.yaml.")
        );
        std::fs::remove_dir_all(dir).ok();
    }

    // A path that is itself a link has one name, however the config cases it.
    #[cfg(unix)]
    #[test]
    fn a_second_spelling_of_a_planned_link_is_not_planned_twice() {
        let dir = v4_project();
        let outside = temp();
        std::fs::remove_dir_all(dir.join(".claude/commands/BMad")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join(".claude/commands/BMad")).unwrap();
        write(&dir, ".bmad-core/core-config.yaml", "devDebugLog: .claude/commands/bmad\n");
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.blocked, None);
        assert_eq!(sources(&plan.moves), [".bmad-core", ".claude/commands/BMad", ".ade/stage", ".ade/methodology", ".claude/agents/qa.md"]);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    // A folder that can't be resolved is said to be that, not a link.
    #[cfg(unix)]
    #[test]
    fn where_a_path_really_is() {
        let dir = v4_project();
        let outside = temp();
        let real_root = std::fs::canonicalize(&dir).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("out")).unwrap();
        std::os::unix::fs::symlink("docs", dir.join("link")).unwrap();
        std::os::unix::fs::symlink("loop", dir.join("loop")).unwrap();
        assert_eq!(real_rel(&dir, &real_root, "link/stories/1.1.md"), Ok("docs/stories/1.1.md".to_string()));
        assert_eq!(real_rel(&dir, &real_root, "link"), Ok("link".to_string()), "a link is itself");
        assert_eq!(real_rel(&dir, &real_root, "docs/not-there.md"), Ok("docs/not-there.md".to_string()));
        assert_eq!(real_rel(&dir, &real_root, ""), Ok(String::new()));
        assert_eq!(real_rel(&dir, &real_root, "out/debug.md"), Err(Unreal::Leaves));
        let unreadable = real_rel(&dir, &real_root, "loop/debug.md").unwrap_err();
        assert!(matches!(unreadable, Unreal::Unreadable(_)), "{unreadable:?}");
        let why = unreadable.why("loop/debug.md");
        assert!(why.starts_with("loop/debug.md can't be checked") && !why.contains("leaves the project"), "{why}");
        assert_eq!(Unreal::Leaves.why("out/debug.md"), "out/debug.md is reached through a link that leaves the project.");
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
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
        // R10: the limit is on entries looked at, folders included, and a
        // count that stopped there is the limit itself: "at least".
        assert_eq!(count_up_to(&dir.join("a").join("b"), 4), 4, "a huge tree is not walked to the end");
        assert_eq!(count_up_to(&dir, 4), 4, "whatever it had counted when it stopped");
        assert_eq!(count_up_to(&dir, 2), 2);
        assert_eq!(COUNT_LIMIT, 50_000);
        std::fs::remove_dir_all(dir).ok();
    }

    // What is in a folder that can't be read is unknown, which the one
    // inexact answer there is says: "at least".
    #[cfg(unix)]
    #[test]
    fn a_folder_that_cannot_be_read_counts_as_capped() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp();
        write(&dir, "a/b/1.md", "x");
        write(&dir, "a/c.md", "x");
        let locked = dir.join("a").join("b");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read_dir(&locked).is_ok() {
            eprintln!("running as a user who reads everything; skipping");
        } else {
            assert_eq!(count_up_to(&dir, 1_000), 1_000);
        }
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
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
        // R12: it isn't offered, so the reason says what to do about it.
        assert_eq!(
            plan.blocked.as_deref(),
            Some("`.bmad-core` holds `.bmad-core/qa`, a document location. Move it out, or change `qaLocation` in core-config.yaml.")
        );
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

    // What can't be read isn't known to be unfinished, and may have no journal
    // to point at.
    #[test]
    fn blocked_by_an_archive_that_cannot_be_read_without_saying_more_than_is_known() {
        let dir = v4_project();
        write(&dir, ".ade/archive/notes/ARCHIVE.md", "my own notes, no front matter\n");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert_eq!(blocked, "ADE can't read .ade/archive/notes, so it can't tell whether an earlier switch here finished.");
        std::fs::remove_dir_all(&dir).ok();

        // A file where the archive folder should be: no folder to list.
        let dir = v4_project();
        write(&dir, ".ade/archive", "not a folder\n");
        let blocked = plan(&dir, V6, &[], &env()).blocked.unwrap();
        assert_eq!(blocked, "ADE can't read .ade/archive, so it can't tell whether an earlier switch here finished.");
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

    #[test]
    fn a_file_with_the_archives_name_takes_the_name_too() {
        let dir = v4_project();
        write(&dir, ARCHIVE, "a file, not a folder\n");
        let plan = plan(&dir, V6, &[], &env());
        assert_eq!(plan.archive, format!("{ARCHIVE}-2"));
        assert_eq!(plan.blocked, None);
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

        // A name git would read as a pattern is asked about as the name it is.
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \"out[1]\"\n");
        // `out1` holds an ignored file; `out[1]` itself holds none. (Git reads
        // this one as the name with or without the option; the `:(top)` case
        // below is the one that needs it.)
        write(&dir, "out[1]/keep.md", "ticket");
        write(&dir, "out1/all.user.toml", "[core]\n");
        let odd = plan(&dir, V4, &[], &real);
        assert_eq!(odd.moves.iter().find(|m| m.from == "out[1]").map(|m| m.ignored.as_str()), Some("none"), "{:?}", sources(&odd.moves));
        write(&dir, "out[1]/mine.user.toml", "[core]\n");
        assert_eq!(ignored_of(crate::git::GIT, &dir, "out[1]"), "some");
        // Nor as pathspec magic: `:(top)out1/` would be the folder `out1`.
        // (Windows has no `:` in file names.)
        #[cfg(unix)]
        {
            write(&dir, ":(top)out1/keep.md", "ticket");
            assert_eq!(ignored_of(crate::git::GIT, &dir, ":(top)out1"), "none", "ls-files runs with --literal-pathspecs");
        }
        // The root is never a path to ask git about.
        assert_eq!(ignored_of(crate::git::GIT, &dir, ""), "none");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn what_the_plan_does_not_know_reaches_the_dialog_as_null() {
        let dir = v4_project();
        let json = serde_json::to_value(plan(&dir, V6, &[], &env())).unwrap();
        assert!(json["blocked"].is_null(), "{json}");
        assert!(json["dirty"].is_null() && json["archiveIgnored"].is_null(), "no git: {json}");
        assert_eq!(json["documents"][2]["path"], "docs/stories");
        assert!(json["documents"][2]["warning"].is_null(), "{json}");
        assert!(json["documents"][0]["warning"].is_string());
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
        assert_eq!(doc, ["files", "linkTo", "path", "ticked", "warning"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn civil_dates() {
        assert_eq!(civil_date(0), "1970-01-01");
        assert_eq!(civil_date(19_782), "2024-02-29");
        assert_eq!(civil_date(20_737), "2026-10-11");
        assert_eq!(today().len(), 10);
    }

    #[test]
    fn the_archive_rule_is_the_specs_text_under_its_marker() {
        assert!(ARCHIVE_RULE.starts_with(&format!("{ARCHIVE_RULE_MARKER}\n## 4. The archive\n")), "{ARCHIVE_RULE}");
        assert!(ARCHIVE_RULE.ends_with(
            "`.ade/archive/` holds earlier BMAD versions of this project. It is\n\
             read-only history: never treat it as current documents, never write to it,\n\
             and read it only when a person asks about the earlier work.\n"
        ));
    }

    // R16: a document that is itself a link says where it leads.
    #[cfg(unix)]
    #[test]
    fn a_linked_document_says_what_it_is_a_link_to() {
        let dir = with_linked_docs(v6_with_output("docs", "docs"));
        let linked = plan(&dir, V4, &["docs".into()], &env());
        assert_eq!(linked.blocked, None);
        assert_eq!(linked.documents.len(), 1, "{:?}", linked.documents);
        assert_eq!((linked.documents[0].path.as_str(), linked.documents[0].link_to.as_deref()), ("docs", Some("realdocs")));
        assert!(sources(&linked.moves).contains(&"docs") && !sources(&linked.moves).contains(&"realdocs"), "only the link: {:?}", sources(&linked.moves));
        let json = serde_json::to_value(&linked).unwrap();
        assert_eq!(json["documents"][0]["linkTo"], "realdocs");

        // The folder behind it is no link.
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \"realdocs\"\n");
        let real = plan(&dir, V4, &[], &env());
        assert_eq!((real.documents[0].path.as_str(), real.documents[0].link_to.as_deref()), ("realdocs", None));
        assert!(serde_json::to_value(&real).unwrap()["documents"][0]["linkTo"].is_null());

        // A link that leaves the project is named as the system spells it.
        let outside = temp();
        std::fs::remove_file(dir.join("docs")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("docs")).unwrap();
        write(&dir, "_bmad/config.toml", "[core]\noutput_folder = \"docs\"\n");
        let away = plan(&dir, V4, &[], &env());
        let real_outside = std::fs::canonicalize(&outside).unwrap();
        assert_eq!(away.documents[0].link_to.as_deref(), Some(real_outside.to_string_lossy().as_ref()));
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    #[test]
    fn a_document_that_is_no_link_has_no_link_target() {
        let dir = v4_project();
        let plan = plan(&dir, V6, &[], &env());
        assert!(!plan.documents.is_empty() && plan.documents.iter().all(|d| d.link_to.is_none()), "{:?}", plan.documents);
        // A plan from a webview that predates the field still reads.
        let mut json = serde_json::to_value(&plan).unwrap();
        for doc in json["documents"].as_array_mut().unwrap() {
            doc.as_object_mut().unwrap().remove("linkTo");
        }
        assert_eq!(serde_json::from_value::<SwitchPlan>(json).unwrap(), plan);
        std::fs::remove_dir_all(dir).ok();
    }

    // R16: `docs -> .` would make the whole project "the documents".
    #[cfg(unix)]
    #[test]
    fn a_docs_link_to_the_project_itself_adds_no_place() {
        let dir = v6_project();
        std::fs::remove_dir_all(dir.join("docs")).unwrap();
        std::os::unix::fs::symlink(".", dir.join("docs")).unwrap();
        let real_root = std::fs::canonicalize(&dir).unwrap();
        let paths = crate::bmadconfig::parse_core_config(None);
        let places = document_locations(&dir, &real_root, &paths, &mut Vec::new(), &mut |rel: String| rel);
        assert!(places.iter().all(|place| !place.path.is_empty()), "{places:?}");
        // So the output folder is still an ordinary move, not a document.
        let plan = plan(&dir, V4, &[], &env());
        assert_eq!(plan.blocked, None);
        assert!(sources(&plan.moves).contains(&"_bmad-output"), "{:?}", sources(&plan.moves));
        assert!(plan.documents.is_empty(), "{:?}", plan.documents);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_journal_lists_what_a_rollback_could_not_put_back() {
        let mut journal = Journal::new("v4", "v6", "2026-10-11", &two_moves());
        assert!(!journal.render().contains("couldn't be put back"));
        journal.status = "incomplete";
        journal.problems = vec![".ade/rules.md changed\nstatus: complete".into(), ".claude/settings.json can't be read".into()];
        let text = journal.render();
        assert!(text.contains("## What couldn't be put back\n\n- .ade/rules.md changedstatus: complete\n- .claude/settings.json can't be read\n"), "{text}");
        assert_eq!(front_matter(&text).unwrap()["status"], "incomplete");
    }

    // ---- bmad_switch_apply ----

    use crate::projectsetup::SetupFile;
    use std::cell::Cell;
    use std::collections::BTreeMap;

    const IMPORT: &str = "\n<!-- m -->\n@.ade/rules.md\n";
    const ARCHIVE_V6: &str = ".ade/archive/bmad-v6-2026-10-11";

    /// What the frontend sends: the methodology files for the new version.
    fn files() -> Vec<SetupFile> {
        vec![
            SetupFile { path: "CLAUDE.md".into(), content: "# new\n@.ade/rules.md\n".into() },
            SetupFile { path: ".ade/rules.md".into(), content: format!("new rules\n\n{ARCHIVE_RULE}") },
            SetupFile { path: ".claude/agents/qa.md".into(), content: "fresh qa".into() },
        ]
    }

    fn switch(dir: &Path, to: Methodology, shown: &SwitchPlan, env: &Env) -> Result<SwitchResult, String> {
        let files = files();
        apply(dir, to, shown, &SetupInput { files: &files, import: IMPORT, marker: "<!-- m -->" }, env)
    }

    /// Every file under `root` with its content, every folder (with a
    /// trailing `/`) and every link with where it points: what "left as it
    /// was" is compared on.
    fn tree(root: &Path) -> BTreeMap<String, String> {
        fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, String>) {
            for entry in std::fs::read_dir(dir).unwrap().flatten() {
                let path = entry.path();
                let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
                let meta = std::fs::symlink_metadata(&path).unwrap();
                if meta.file_type().is_symlink() {
                    out.insert(rel, format!("-> {}", std::fs::read_link(&path).unwrap().display()));
                } else if meta.is_dir() {
                    out.insert(format!("{rel}/"), String::new());
                    walk(root, &path, out);
                } else {
                    out.insert(rel, String::from_utf8_lossy(&std::fs::read(&path).unwrap()).into_owned());
                }
            }
        }
        let mut out = BTreeMap::new();
        walk(root, root, &mut out);
        out
    }

    fn read(dir: &Path, rel: &str) -> String {
        std::fs::read_to_string(at(dir, rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
    }

    /// The archive holds what `plan` moved, at the same paths, with the
    /// content it had in `before`, and beside the journal nothing else.
    fn assert_mirrored(dir: &Path, plan: &SwitchPlan, before: &BTreeMap<String, String>) {
        let mut expected: BTreeMap<String, String> = BTreeMap::new();
        for (path, content) in before {
            let file = path.trim_end_matches('/');
            if plan.moves.iter().any(|m| file == m.from || nested(file, &m.from)) {
                expected.insert(path.clone(), content.clone());
                // The folders on the way to it, which the archive had to make.
                let mut parent = Path::new(file).parent();
                while let Some(p) = parent.filter(|p| !p.as_os_str().is_empty()) {
                    expected.insert(format!("{}/", slashed(p)), String::new());
                    parent = p.parent();
                }
            }
        }
        let mut found = tree(&at(dir, &plan.archive));
        assert!(found.remove(JOURNAL).is_some(), "the journal is in the archive");
        assert_eq!(found, expected);
    }

    /// A destination inside an archive: a forward move. A reverse move goes
    /// the other way.
    fn into_archive(to: &Path) -> bool {
        to.components().any(|c| c.as_os_str() == "archive")
    }

    fn fail_at_stage(from: &Path, to: &Path) -> std::io::Result<()> {
        if from.ends_with(".ade/stage") && into_archive(to) {
            return Err(std::io::Error::other("the file is in use"));
        }
        std::fs::rename(from, to)
    }

    fn fail_at_stage_and_core_back(from: &Path, to: &Path) -> std::io::Result<()> {
        if to.ends_with(".bmad-core") && !into_archive(to) {
            return Err(std::io::Error::other("the folder is locked"));
        }
        fail_at_stage(from, to)
    }

    /// An agent that keeps working: once `.bmad-core` has moved, it writes
    /// into `.bmad-core/` again. Then the switch fails.
    fn agent_writes_then_stage_fails(from: &Path, to: &Path) -> std::io::Result<()> {
        fail_at_stage(from, to)?;
        if from.ends_with(".bmad-core") && into_archive(to) {
            std::fs::create_dir_all(from)?;
            std::fs::write(from.join("new.md"), "written by an agent")?;
        }
        Ok(())
    }

    thread_local! {
        /// The forward move `fail_at_nth` fails at, and how many it has seen.
        /// A rename seam is a plain function, and each test has its own thread.
        static NTH: Cell<(usize, usize)> = const { Cell::new((0, 0)) };
    }

    /// As Windows does for a folder that is some process's cwd.
    fn fail_at_nth(from: &Path, to: &Path) -> std::io::Result<()> {
        if into_archive(to) {
            let (nth, seen) = NTH.get();
            NTH.set((nth, seen + 1));
            if seen == nth {
                return Err(std::io::Error::other("the folder is in use by another process"));
            }
        }
        std::fs::rename(from, to)
    }

    /// Something writes a v4 marker as soon as the old one has moved.
    fn a_v4_marker_reappears(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)?;
        if from.ends_with(".ade/methodology") && into_archive(to) {
            std::fs::write(from, "v4\n")?;
        }
        Ok(())
    }

    fn a_v4_marker_reappears_then_the_role_file_fails(from: &Path, to: &Path) -> std::io::Result<()> {
        if from.ends_with(".claude/agents/qa.md") && into_archive(to) {
            return Err(std::io::Error::other("the file is in use"));
        }
        a_v4_marker_reappears(from, to)
    }

    #[test]
    fn a_switch_from_v4_to_v6() {
        let dir = v4_project();
        let before = tree(&dir);
        let shown = plan(&dir, V6, &[], &env());
        let result = switch(&dir, V6, &shown, &env()).unwrap();

        assert_eq!(result.archive, ARCHIVE);
        assert_eq!(result.moved, 7, "2 engine files, 1 command, the log, the stage, the marker, the role file");
        assert!(!result.moved_capped);
        // The old version is in the archive, mirrored.
        assert!(!at(&dir, ".bmad-core").exists() && !at(&dir, ".claude/commands/BMad").exists());
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.bmad-core/tasks/a.md")), "a");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.ade/methodology")), "v4\n");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.claude/agents/qa.md")), "edited qa", "an edited role file is archived, not lost");
        assert_mirrored(&dir, &shown, &before);
        // The new version is set up fresh.
        assert_eq!(crate::bmadv6::detect_on_disk(&dir), Some(V6));
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        assert_eq!(read(&dir, ".claude/agents/qa.md"), "fresh qa");
        assert!(at(&dir, "_bmad/ade-runtime.mjs").is_file() && at(&dir, ".claude/skills/bmad/SKILL.md").is_file());
        assert_eq!(result.setup.bmadv6_files, 6, "{:?}", result.setup.created);
        // What both versions share stays, and so do the documents.
        assert_eq!(read(&dir, ".claude/agents/mine.md"), "my agent");
        assert_eq!(read(&dir, "docs/prd.md"), "prd");
        assert_eq!(read(&dir, "docs/architecture.md"), "arch");
        assert_eq!(read(&dir, "docs/stories/1.1.md"), "story");
        assert_eq!(read(&dir, "CLAUDE.md"), format!("# Mine\n{IMPORT}"));
        // The rules a project already had gain the archive section, once.
        assert!(result.rules_appended);
        assert_eq!(read(&dir, ".ade/rules.md"), format!("old rules\n\n{ARCHIVE_RULE}"));
        // Claude Code is kept out of the archive.
        assert!(result.archive_denied);
        let settings: serde_json::Value = serde_json::from_str(&read(&dir, ".claude/settings.json")).unwrap();
        assert_eq!(settings["permissions"]["deny"], serde_json::json!(["Edit(/.ade/archive/**)"]));
        // The journal says it finished, so nothing is pending.
        let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: complete\nphase: done\nfrom: v4\nto: v6\ndate: 2026-10-11\n---\n"), "{journal}");
        assert!(!journal.contains(": pending") && !journal.contains(": moving"), "{journal}");
        assert_eq!(journal.matches(": moved\n").count(), 6, "{journal}");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_switch_from_v6_to_v4_and_back_again() {
        let dir = v6_project();
        let before = tree(&dir);
        let shown = plan(&dir, V4, &[], &env());
        let result = switch(&dir, V4, &shown, &env()).unwrap();
        assert_eq!(result.archive, ARCHIVE_V6);
        assert!(!at(&dir, "_bmad").exists() && !at(&dir, "_bmad-output").exists() && !at(&dir, ".ade/gates").exists());
        assert_eq!(read(&dir, &format!("{ARCHIVE_V6}/_bmad-output/shop/1.md")), "ticket");
        assert_eq!(read(&dir, &format!("{ARCHIVE_V6}/.claude/skills/bmad/SKILL.md")), "bmad skill");
        assert_mirrored(&dir, &shown, &before);
        assert_eq!(read(&dir, ".claude/skills/mine/SKILL.md"), "my skill", "a person's own skill stays");
        assert_eq!(read(&dir, ".claude/agents/mine.md"), "my agent");
        assert_eq!(read(&dir, "docs/prd.md"), "prd");
        assert_eq!(crate::bmadv6::detect_on_disk(&dir), Some(V4));
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a");
        assert_eq!(read(&dir, ".claude/commands/BMad/tasks/x.md"), "x");
        assert!(read(&dir, &format!("{ARCHIVE_V6}/ARCHIVE.md")).starts_with("---\nstatus: complete\nphase: done\nfrom: v6\nto: v4\n"));

        // Back to v6 the same day: a second archive beside the first, which is not touched.
        let back = plan(&dir, V6, &[], &env());
        assert_eq!(back.blocked, None);
        assert_eq!(back.archive, ".ade/archive/bmad-v4-2026-10-11");
        let first = tree(&at(&dir, ARCHIVE_V6));
        switch(&dir, V6, &back, &env()).unwrap();
        assert_eq!(tree(&at(&dir, ARCHIVE_V6)), first);
        assert_eq!(crate::bmadv6::detect_on_disk(&dir), Some(V6));
        // The rules already have the section, and the settings the rule.
        assert_eq!(read(&dir, ".ade/rules.md").matches(ARCHIVE_RULE_MARKER).count(), 1);
        assert_eq!(read(&dir, ".claude/settings.json").matches("Edit(/.ade/archive/**)").count(), 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_project_with_no_rules_gets_the_full_rules_with_the_section_once() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/rules.md")).unwrap();
        let result = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert!(!result.rules_appended, "setup wrote rules that already carry it");
        assert_eq!(read(&dir, ".ade/rules.md"), format!("new rules\n\n{ARCHIVE_RULE}"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rules_with_no_final_newline_still_get_a_clean_section() {
        let dir = v4_project();
        write(&dir, ".ade/rules.md", "old rules");
        switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert_eq!(read(&dir, ".ade/rules.md"), format!("old rules\n\n{ARCHIVE_RULE}"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_malformed_settings_file_does_not_stop_the_switch() {
        let dir = v4_project();
        write(&dir, ".claude/settings.json", "{ not json");
        let result = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert!(!result.archive_denied);
        assert!(result.setup.settings_error.is_some());
        assert_eq!(read(&dir, ".claude/settings.json"), "{ not json");
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_uses_the_archive_the_person_saw() {
        let dir = v4_project();
        // Planned yesterday, confirmed after midnight.
        let shown = plan(&dir, V6, &[], &Env { today: "2026-10-10".into(), ..env() });
        let result = switch(&dir, V6, &shown, &env()).unwrap();
        assert_eq!(result.archive, ".ade/archive/bmad-v4-2026-10-10");
        assert!(at(&dir, ".ade/archive/bmad-v4-2026-10-10/.bmad-core").is_dir());
        assert!(!at(&dir, ARCHIVE).exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_refuses_when_the_sources_differ_from_the_plan() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        let before = tree(&dir);
        // Something the person didn't see would move now.
        write(&dir, ".claude/agents/architect.md", "architect");
        let err = switch(&dir, V6, &shown, &env()).unwrap_err();
        assert!(err.contains("changed since"), "{err}");
        std::fs::remove_file(at(&dir, ".claude/agents/architect.md")).unwrap();
        assert_eq!(tree(&dir), before, "nothing moved");
        // Something the person saw is gone.
        std::fs::remove_file(at(&dir, ".ade/stage")).unwrap();
        assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("changed since"));
        assert!(at(&dir, ".bmad-core").is_dir() && !at(&dir, ".ade/archive").exists());
        std::fs::remove_dir_all(dir).ok();
    }

    // The plan comes back from the webview. A document it never offered
    // doesn't move, whatever the plan says.
    #[test]
    fn apply_refuses_a_document_the_plan_never_offered() {
        let dir = v4_project();
        write(&dir, "src/main.rs", "fn main() {}");
        let mut shown = plan(&dir, V6, &[], &env());
        let before = tree(&dir);
        shown.documents.push(Document { path: "src".into(), files: 1, ticked: true, warning: None, link_to: None });
        shown.moves.push(Move { from: "src".into(), to: format!("{ARCHIVE}/src"), files: 1, ignored: "none".into() });
        assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("changed since"));
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_takes_only_the_archives_name_from_the_plan() {
        let dir = v4_project();
        let honest = plan(&dir, V6, &[], &env());
        let before = tree(&dir);
        for archive in [
            "../elsewhere",
            ".ade/archive/../../x",
            ".ade/archive/bmad-v6-2026-10-11",
            ".ade/archive/bmad-v4-2026-10-11/..",
            ".ade/archive/bmad-v4-2026-10-11/x",
            ".ade/archive/bmad-v4-2026-10-11-",
            ".ade\\archive\\bmad-v4-2026-10-11",
            "docs",
            "",
        ] {
            let shown = SwitchPlan { archive: archive.to_string(), ..honest.clone() };
            assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("archive"), "{archive}");
            assert_eq!(tree(&dir), before, "{archive}");
        }
        // Destinations the webview sends are not the ones used.
        let mut shown = honest.clone();
        for m in &mut shown.moves {
            m.to = format!("docs/stolen/{}", m.from);
        }
        switch(&dir, V6, &shown, &env()).unwrap();
        assert!(!at(&dir, "docs/stolen").exists());
        assert!(at(&dir, &format!("{ARCHIVE}/.bmad-core")).is_dir());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_refuses_when_the_archive_folder_now_exists() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        std::fs::create_dir_all(at(&dir, ARCHIVE)).unwrap();
        assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("already exists"));
        assert!(at(&dir, ".bmad-core").is_dir());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_refuses_while_another_switch_is_in_progress() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        // Another switch has started since the plan was shown.
        let other = at(&dir, ".ade/archive/bmad-v4-2026-10-01");
        std::fs::create_dir_all(&other).unwrap();
        Journal::new("v4", "v6", "2026-10-01", &[]).write(&other).unwrap();
        let before = tree(&dir);
        let err = switch(&dir, V6, &shown, &env()).unwrap_err();
        assert!(err.contains("didn't finish") && err.contains(".ade/archive/bmad-v4-2026-10-01/ARCHIVE.md"), "{err}");
        assert_eq!(tree(&dir), before, "nothing moved, and no second archive");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn apply_refuses_when_the_new_versions_files_are_not_found() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        let before = tree(&dir);
        let err = switch(&dir, V6, &shown, &Env { v6_src: None, ..env() }).unwrap_err();
        assert!(err.contains("weren't found"), "{err}");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    // R14, at the moment the archive folder is made.
    #[cfg(unix)]
    #[test]
    fn an_archive_reached_through_a_link_is_refused_when_it_is_made() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        std::fs::create_dir_all(at(&dir, ARCHIVE)).unwrap();
        assert_eq!(archive_in_project(&dir, ARCHIVE), Ok(()));
        // `.ade/archive` becomes a link out of the project after the plan.
        let outside = temp();
        std::fs::remove_dir_all(at(&dir, ARCHIVE_DIR)).unwrap();
        std::os::unix::fs::symlink(&outside, at(&dir, ARCHIVE_DIR)).unwrap();
        std::fs::create_dir_all(at(&dir, ARCHIVE)).unwrap();
        let why = archive_in_project(&dir, ARCHIVE).unwrap_err();
        assert!(why.starts_with(".ade/archive is not a folder of this project"), "{why}");
        // Apply plans again first, and refuses there: nothing is made
        // where the link leads.
        std::fs::remove_dir_all(outside.join("bmad-v4-2026-10-11")).unwrap();
        assert!(switch(&dir, V6, &shown, &env()).unwrap_err().contains("is a link"));
        assert!(at(&dir, ".bmad-core").is_dir());
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    // A rename can fail at any move: on Windows, a folder that is some
    // process's cwd. Wherever it stops, everything goes back.
    #[test]
    fn rollback_after_a_failed_move_puts_everything_back_whichever_move_failed() {
        for (project, to, moves) in [(v4_project as fn() -> PathBuf, V6, 6), (v6_project as fn() -> PathBuf, V4, 7)] {
            for nth in 0..moves {
                let dir = project();
                let before = tree(&dir);
                let failing = Env { rename: fail_at_nth, ..env() };
                let shown = plan(&dir, to, &[], &failing);
                assert_eq!(shown.moves.len(), moves);
                NTH.set((nth, 0));
                let err = switch(&dir, to, &shown, &failing).unwrap_err();
                assert_eq!(err, format!("Couldn't move {}: the folder is in use by another process", shown.moves[nth].from), "the path that failed is named");
                assert_eq!(tree(&dir), before, "move {nth}: every file back, and no folder left: the archive is gone, journal included");
                assert!(pending(&dir).is_empty());
                // And the project can still be switched.
                switch(&dir, to, &plan(&dir, to, &[], &env()), &env()).unwrap();
                std::fs::remove_dir_all(dir).ok();
            }
        }
    }

    thread_local! {
        /// What the journal on disk said as each rename was asked for, and
        /// whether that rename was a forward move.
        static JOURNALS: std::cell::RefCell<Vec<(bool, String)>> = const { std::cell::RefCell::new(Vec::new()) };
    }

    fn note_the_journal(from: &Path, to: &Path) {
        let forward = into_archive(to);
        let archived = if forward { to } else { from };
        let journal = archived.ancestors().map(|folder| folder.join(JOURNAL)).find(|file| file.is_file());
        let text = journal.map(|file| std::fs::read_to_string(file).unwrap()).unwrap_or_default();
        JOURNALS.with_borrow_mut(|seen| seen.push((forward, text)));
    }

    fn noting_the_journal(from: &Path, to: &Path) -> std::io::Result<()> {
        note_the_journal(from, to);
        std::fs::rename(from, to)
    }

    /// The same for a file on its way back, which is linked, not renamed.
    fn noting_the_journal_link(from: &Path, to: &Path) -> std::io::Result<()> {
        note_the_journal(from, to);
        std::fs::hard_link(from, to)
    }

    // R3: the journal leads the disk, on the way in and on the way back.
    #[test]
    fn each_move_is_journalled_as_moving_before_its_rename() {
        let dir = v4_project();
        let failing = Env { rename: noting_the_journal, link: noting_the_journal_link, fail_after_rules: true, ..env() };
        let shown = plan(&dir, V6, &[], &failing);
        JOURNALS.with_borrow_mut(Vec::clear);
        switch(&dir, V6, &shown, &failing).unwrap_err();
        let seen = JOURNALS.with_borrow(Clone::clone);
        let count = shown.moves.len();
        assert_eq!(seen.len(), count * 2, "every move, there and back");
        let state = |journal: &str, m: &Move| {
            let line = journal.lines().find(|line| line.starts_with(&format!("- `{}` → ", m.from))).unwrap_or_else(|| panic!("{} in {journal}", m.from));
            line.rsplit_once(": ").unwrap().1.to_string()
        };
        for (k, (forward, journal)) in seen[..count].iter().enumerate() {
            assert!(*forward && journal.starts_with("---\nstatus: in-progress\nphase: moving\n"), "{journal}");
            for (j, m) in shown.moves.iter().enumerate() {
                let expected = if j < k { "moved" } else if j == k { "moving" } else { "pending" };
                assert_eq!(state(journal, m), expected, "forward move {k}, line {j}: {journal}");
            }
        }
        // Back, last first.
        for (n, (forward, journal)) in seen[count..].iter().enumerate() {
            let k = count - 1 - n;
            // A rollback's journal says `incomplete` from its first write:
            // its hand text is true at every instant of one.
            assert!(!*forward && journal.starts_with("---\nstatus: incomplete\nphase: rules\n"), "{journal}");
            for (j, m) in shown.moves.iter().enumerate() {
                let expected = if j < k { "moved" } else if j == k { "moving" } else { "moved back" };
                assert_eq!(state(journal, m), expected, "reverse move {k}, line {j}: {journal}");
            }
        }
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_after_a_failed_move_puts_everything_back() {
        let dir = v4_project();
        let before = tree(&dir);
        let failing = Env { rename: fail_at_stage, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/stage") && err.contains("in use"), "the path that failed is named: {err}");
        assert_eq!(tree(&dir), before, "every file back, and no folder left: the archive is gone, journal included");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    // R2: a settings file that is there and can't be read stops the switch,
    // and the rollback leaves it alone.
    #[test]
    fn a_settings_file_that_cannot_be_read_fails_the_switch_and_is_left_alone() {
        let dir = v4_project();
        // A directory where the file should be: reading it fails on every OS.
        std::fs::create_dir_all(at(&dir, ".claude/settings.json/inner")).unwrap();
        let before = tree(&dir);
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap_err();
        assert!(err.starts_with(".claude/settings.json can't be read"), "{err}");
        assert_eq!(tree(&dir), before, "the moves are reversed and the unreadable file is neither removed nor replaced");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    // R2: the same for the marker, before anything has moved.
    #[test]
    fn a_marker_that_cannot_be_read_fails_the_switch_and_is_left_alone() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/methodology")).unwrap();
        std::fs::create_dir_all(at(&dir, ".ade/methodology/inner")).unwrap();
        let before = tree(&dir);
        let shown = plan(&dir, V6, &[], &env());
        assert_eq!(shown.blocked, None, "`.bmad-core/` says v4");
        let err = switch(&dir, V6, &shown, &env()).unwrap_err();
        assert!(err.starts_with(".ade/methodology can't be read"), "{err}");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_after_a_failed_setup_puts_everything_back() {
        let dir = v4_project();
        let before = tree(&dir);
        // A v6 resource root with skills but no runtime: setup fails after it
        // has written files, folders and the import line.
        let broken = temp();
        write(&broken, "skills/bmad/SKILL.md", "bmad skill");
        let failing = Env { v6_src: Some(broken.clone()), ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains("ade-runtime.mjs"), "{err}");
        assert_eq!(tree(&dir), before, "what setup created is gone, the import is stripped, the moves are reversed");
        assert_eq!(read(&dir, ".claude/agents/qa.md"), "edited qa");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(broken).ok();
    }

    // The rules step: rules that are there and can't be read.
    #[test]
    fn rollback_after_a_failed_rules_step_puts_everything_back() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/rules.md")).unwrap();
        std::fs::create_dir_all(at(&dir, ".ade/rules.md/inner")).unwrap();
        write(&dir, ".claude/settings.json", "{\"model\":\"sonnet\"}");
        let before = tree(&dir);
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap_err();
        assert!(err.starts_with(".ade/rules.md can't be read"), "{err}");
        assert_eq!(tree(&dir), before, "setup had finished: all of it is taken back");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_at_the_last_step_restores_settings_rules_and_the_marker() {
        let dir = v4_project();
        write(&dir, ".claude/settings.json", "{\"model\":\"sonnet\"}");
        let before = tree(&dir);
        // Setup has finished: the marker says v6, the settings carry two new
        // keys and the rule, the rules carry the section.
        let failing = Env { fail_after_rules: true, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step", "a rollback that worked adds nothing");
        assert_eq!(tree(&dir), before);
        assert_eq!(read(&dir, ".claude/settings.json"), "{\"model\":\"sonnet\"}");
        assert_eq!(read(&dir, ".ade/rules.md"), "old rules\n");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n", "the old marker, not the one setup wrote");
        assert_eq!(read(&dir, "CLAUDE.md"), "# Mine\n");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_at_the_last_step_of_a_switch_to_v4() {
        let dir = v6_project();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&dir, V4, &plan(&dir, V4, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&dir), before, "no settings file, no engine, no commands, no archive");
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        assert_eq!(read(&dir, ".claude/agents/qa.md"), "qa for v6");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_leaves_no_marker_in_a_project_that_had_none() {
        let dir = v4_project();
        // A v4 project from before the marker: `.bmad-core/` alone says v4.
        std::fs::remove_file(at(&dir, ".ade/methodology")).unwrap();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&dir), before);
        assert!(!at(&dir, ".ade/methodology").exists());
        std::fs::remove_dir_all(dir).ok();
    }

    // The explicit guard. A marker written while the old one is in the
    // archive is one setup keeps and doesn't report: the v4 install finds it
    // already saying v4. Left there, it would keep the old marker from coming
    // back, on a tree that is v6 again.
    #[test]
    fn rollback_restores_the_marker_over_one_setup_kept() {
        let dir = v6_project();
        let before = tree(&dir);
        let failing = Env { rename: a_v4_marker_reappears, fail_after_rules: true, ..env() };
        let err = switch(&dir, V4, &plan(&dir, V4, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step");
        assert_eq!(read(&dir, ".ade/methodology"), "v6\n");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    /// Something writes a v6 marker once the v4 engine has moved.
    fn a_v6_marker_appears(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)?;
        if from.ends_with(".bmad-core") && into_archive(to) {
            std::fs::write(from.parent().unwrap().join(".ade").join("methodology"), "v6\n")?;
        }
        Ok(())
    }

    // The same for a project that had no marker: the v6 install keeps one
    // that already says v6, and the project ends with none again.
    #[test]
    fn rollback_leaves_no_marker_where_setup_kept_one() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/methodology")).unwrap();
        let before = tree(&dir);
        let failing = Env { rename: a_v6_marker_appears, fail_after_rules: true, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step");
        assert!(!present(&at(&dir, ".ade/methodology")));
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    /// The marker in the archive is rewritten while the switch runs.
    fn the_archived_marker_is_rewritten(root: &Path) {
        std::fs::write(at(root, &format!("{ARCHIVE}/.ade/methodology")), "something else\n").unwrap();
    }

    // Whatever happened to the marker in between, it reads as it did.
    #[test]
    fn rollback_puts_the_markers_old_text_back() {
        let dir = v4_project();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, before_rollback: the_archived_marker_is_rewritten, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    // Before setup has run, nothing of the switch's writes a marker: one
    // that appears is someone else's, and stays like anything else.
    #[test]
    fn a_marker_written_before_setup_ran_is_not_the_switchs_to_remove() {
        let dir = v6_project();
        let failing = Env { rename: a_v4_marker_reappears_then_the_role_file_fails, ..env() };
        let err = switch(&dir, V4, &plan(&dir, V4, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/methodology") && err.contains(&format!("{ARCHIVE_V6}/ARCHIVE.md")), "{err}");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n", "what was written stays");
        assert_eq!(read(&dir, &format!("{ARCHIVE_V6}/.ade/methodology")), "v6\n", "and the old marker is still in the archive");
        assert_eq!(read(&dir, "_bmad/ade-runtime.mjs"), "// runtime", "the rest is back");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_failed_reverse_move_leaves_an_incomplete_journal() {
        let dir = v4_project();
        let failing = Env { rename: fail_at_stage_and_core_back, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains("in use") && err.contains(&format!("{ARCHIVE}/ARCHIVE.md")), "{err}");
        assert!(err.contains(".bmad-core: the folder is locked"), "what couldn't be restored is listed: {err}");
        let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: incomplete\n"), "{journal}");
        assert!(journal.contains(&format!("- `.bmad-core` → `{ARCHIVE}/.bmad-core`: moved\n")), "{journal}");
        assert!(journal.contains(&format!("- `.claude/commands/BMad` → `{ARCHIVE}/.claude/commands/BMad`: moved back\n")), "{journal}");
        assert!(journal.contains(&format!("- `.ade/stage` → `{ARCHIVE}/.ade/stage`: pending\n")), "{journal}");
        assert!(journal.contains("## What couldn't be put back\n\n- .bmad-core: the folder is locked\n"), "{journal}");
        // What couldn't go back is still in the archive, and the next switch is blocked.
        assert!(at(&dir, &format!("{ARCHIVE}/.bmad-core/tasks/a.md")).is_file());
        assert!(!at(&dir, ".bmad-core").exists());
        assert_eq!(read(&dir, ".claude/commands/BMad/tasks/x.md"), "x");
        assert_eq!(read(&dir, ".ai/debug-log.md"), "log");
        assert_eq!(pending(&dir).len(), 1);
        assert!(plan(&dir, V6, &[], &env()).blocked.unwrap().contains("didn't finish"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rollback_never_overwrites_what_reappeared() {
        let dir = v4_project();
        let failing = Env { rename: agent_writes_then_stage_fails, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".bmad-core: something is there again"), "{err}");
        assert_eq!(read(&dir, ".bmad-core/new.md"), "written by an agent", "what the agent wrote is still there");
        assert!(!at(&dir, ".bmad-core/tasks").exists(), "nothing was merged into it");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.bmad-core/tasks/a.md")), "a", "and the engine is still in the archive");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        std::fs::remove_dir_all(dir).ok();
    }

    /// The archive section is no longer the end of the rules.
    fn the_rules_are_edited(root: &Path) {
        let rules = at(root, ".ade/rules.md");
        let text = std::fs::read_to_string(&rules).unwrap();
        std::fs::write(&rules, format!("{text}\nA line a person added.\n")).unwrap();
    }

    // R4: a restore step that fails is reported, and the journal stays.
    #[test]
    fn a_rules_section_that_cannot_be_taken_off_is_reported() {
        let dir = v4_project();
        let mut before = tree(&dir);
        let failing = Env { fail_after_rules: true, before_rollback: the_rules_are_edited, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.starts_with("failed on purpose, after the rules step. The switch couldn't be fully undone: .ade/rules.md"), "{err}");
        assert!(err.ends_with(&format!("See {ARCHIVE}/ARCHIVE.md.")), "{err}");
        assert_eq!(read(&dir, ".ade/rules.md"), format!("old rules\n\n{ARCHIVE_RULE}\nA line a person added.\n"), "left as the person has it");
        // The archive is kept with its journal, which says what is wrong.
        let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: incomplete\n"), "{journal}");
        assert!(journal.contains("## What couldn't be put back\n\n- .ade/rules.md"), "{journal}");
        assert_eq!(journal.matches(": moved back\n").count(), 6, "{journal}");
        assert_eq!(pending(&dir).len(), 1);
        // Everything else was still put back.
        let mut after = tree(&dir);
        after.retain(|path, _| !path.starts_with(".ade/archive") && path != ".ade/rules.md");
        before.remove(".ade/rules.md");
        assert_eq!(after, before);
        std::fs::remove_dir_all(dir).ok();
    }

    /// The settings file becomes something that can't be read.
    fn the_settings_become_unreadable(root: &Path) {
        let settings = at(root, ".claude/settings.json");
        std::fs::remove_file(&settings).unwrap();
        std::fs::create_dir_all(settings.join("inner")).unwrap();
    }

    // R2 and R4: settings that can't be read at rollback are not replaced.
    #[test]
    fn settings_that_cannot_be_read_at_rollback_are_left_and_reported() {
        let dir = v4_project();
        write(&dir, ".claude/settings.json", "{\"model\":\"sonnet\"}");
        let failing = Env { fail_after_rules: true, before_rollback: the_settings_become_unreadable, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".claude/settings.json can't be read, so it was left as it is"), "{err}");
        assert!(at(&dir, ".claude/settings.json/inner").is_dir(), "neither removed nor replaced");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        // The rest went back.
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n");
        assert_eq!(read(&dir, ".ade/rules.md"), "old rules\n");
        assert_eq!(read(&dir, "CLAUDE.md"), "# Mine\n");
        std::fs::remove_dir_all(dir).ok();
    }

    // R1 and R9: a v6 output folder among the documents.
    #[test]
    fn a_v6_output_folder_among_the_documents_stays_unless_ticked() {
        let stays = v6_with_output("docs", "docs");
        let shown = plan(&stays, V4, &[], &env());
        assert_eq!(shown.documents.len(), 1);
        switch(&stays, V4, &shown, &env()).unwrap();
        assert_eq!(read(&stays, "docs/shop/1.md"), "ticket", "it stays by default");
        assert_eq!(read(&stays, "docs/prd.md"), "prd");
        assert!(!at(&stays, &format!("{ARCHIVE_V6}/docs")).exists());
        assert_eq!(crate::bmadv6::detect_on_disk(&stays), Some(V4));

        let moves = v6_with_output("docs", "docs");
        let shown = plan(&moves, V4, &["docs".into()], &env());
        assert!(shown.documents[0].ticked);
        switch(&moves, V4, &shown, &env()).unwrap();
        assert!(!at(&moves, "docs").exists(), "it moves when ticked");
        assert_eq!(read(&moves, &format!("{ARCHIVE_V6}/docs/shop/1.md")), "ticket");
        assert_eq!(read(&moves, &format!("{ARCHIVE_V6}/docs/prd.md")), "prd");

        let back = v6_with_output("docs", "docs");
        let before = tree(&back);
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&back, V4, &plan(&back, V4, &["docs".into()], &failing), &failing).unwrap_err();
        assert_eq!(tree(&back), before, "and it comes back on rollback");
        for dir in [stays, moves, back] {
            std::fs::remove_dir_all(dir).ok();
        }
    }

    // What an earlier try of the new version left goes to its own folder,
    // so the fresh install has the paths to itself; a rollback takes the
    // fresh files away before the old ones come back.
    #[test]
    fn leftovers_are_archived_apart_and_come_back_on_rollback() {
        let project = || {
            let dir = v4_project();
            write(&dir, "_bmad/config.toml", "[core]\nproject_name = \"old\"\n");
            write(&dir, ".claude/skills/bmad/SKILL.md", "old skill");
            write(&dir, ".claude/skills/mine/SKILL.md", "my skill");
            dir
        };
        let back = project();
        let before = tree(&back);
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&back, V6, &plan(&back, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&back), before);

        let dir = project();
        let result = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        assert_eq!(result.moved, 9, "the seven of the old version and the two left over");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/leftovers-v6/_bmad/config.toml")), "[core]\nproject_name = \"old\"\n");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/leftovers-v6/.claude/skills/bmad/SKILL.md")), "old skill");
        assert_eq!(read(&dir, ".claude/skills/bmad/SKILL.md"), "bmad skill", "the fresh one");
        assert!(read(&dir, "_bmad/config.toml").contains("output_folder"), "the fresh config");
        assert_eq!(read(&dir, ".claude/skills/mine/SKILL.md"), "my skill");
        for dir in [back, dir] {
            std::fs::remove_dir_all(dir).ok();
        }
    }

    // Rules setup wrote without the section get it appended, and a rollback
    // takes the section off first, so the file reads as setup wrote it and goes.
    #[test]
    fn rules_setup_wrote_without_the_section_are_taken_back_too() {
        let mut files = files();
        files[1].content = "rules from an older frontend\n".into();
        let input = SetupInput { files: &files, import: IMPORT, marker: "<!-- m -->" };
        let project = || {
            let dir = v4_project();
            std::fs::remove_file(at(&dir, ".ade/rules.md")).unwrap();
            dir
        };
        let dir = project();
        let result = apply(&dir, V6, &plan(&dir, V6, &[], &env()), &input, &env()).unwrap();
        assert!(result.rules_appended);
        assert_eq!(read(&dir, ".ade/rules.md"), format!("rules from an older frontend\n\n{ARCHIVE_RULE}"));

        let back = project();
        let before = tree(&back);
        let failing = Env { fail_after_rules: true, ..env() };
        apply(&back, V6, &plan(&back, V6, &[], &failing), &input, &failing).unwrap_err();
        assert_eq!(tree(&back), before);
        for dir in [dir, back] {
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn a_ticked_document_moves_and_the_others_stay() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &["docs/stories".into()], &env());
        let result = switch(&dir, V6, &shown, &env()).unwrap();
        assert_eq!(result.moved, 8);
        assert!(!at(&dir, "docs/stories").exists());
        assert_eq!(read(&dir, &format!("{ARCHIVE}/docs/stories/1.1.md")), "story");
        assert_eq!(read(&dir, "docs/prd.md"), "prd");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_folder_moves_as_the_link() {
        let dir = v4_project();
        let outside = temp();
        write(&outside, "a.md", "a");
        std::fs::remove_dir_all(at(&dir, ".claude/commands/BMad")).unwrap();
        std::os::unix::fs::symlink(&outside, at(&dir, ".claude/commands/BMad")).unwrap();
        let before = tree(&dir);

        // Rolled back, the link is a link again, at its place.
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&dir), before);
        assert!(std::fs::symlink_metadata(at(&dir, ".claude/commands/BMad")).unwrap().file_type().is_symlink());

        switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        let moved = at(&dir, &format!("{ARCHIVE}/.claude/commands/BMad"));
        assert!(std::fs::symlink_metadata(&moved).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read_link(&moved).unwrap(), outside);
        assert!(!present(&at(&dir, ".claude/commands/BMad")));
        assert_eq!(std::fs::read_to_string(outside.join("a.md")).unwrap(), "a", "what it points at is untouched");
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 1);
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_dir_all(outside).ok();
    }

    // R16: ticking a linked `docs` moves the link; the documents stay behind it.
    #[cfg(unix)]
    #[test]
    fn a_ticked_document_that_is_a_link_moves_only_the_link() {
        let dir = with_linked_docs(v6_with_output("docs", "docs"));
        let shown = plan(&dir, V4, &["docs".into()], &env());
        assert_eq!(shown.blocked, None);
        switch(&dir, V4, &shown, &env()).unwrap();
        assert!(!present(&at(&dir, "docs")));
        assert!(std::fs::symlink_metadata(at(&dir, &format!("{ARCHIVE_V6}/docs"))).unwrap().file_type().is_symlink());
        assert_eq!(read(&dir, "realdocs/prd.md"), "prd", "the documents stay where they are");
        assert_eq!(read(&dir, "realdocs/shop/1.md"), "ticket");
        std::fs::remove_dir_all(dir).ok();
    }

    // ---- fix round 1 ----

    fn input(files: &[SetupFile]) -> SetupInput<'_> {
        SetupInput { files, import: IMPORT, marker: "<!-- m -->" }
    }

    // Step 7 sets `complete` in memory and then saves. Whatever the journal
    // said when something failed, a rollback never writes that again.
    #[test]
    fn a_rollback_writes_incomplete_whatever_the_journal_said() {
        let dir = v4_project();
        let noting = Env { rename: noting_the_journal, link: noting_the_journal_link, ..env() };
        let shown = plan(&dir, V6, &[], &noting);
        let files = files();
        let mut run = Run::new(&dir, &shown, &noting);
        run.forward(V6, &shown, &input(&files), &noting).unwrap();
        assert_eq!((run.journal.status, run.journal.phase), ("complete", "done"));
        assert!(read(&dir, &format!("{ARCHIVE}/ARCHIVE.md")).starts_with("---\nstatus: complete\n"));

        JOURNALS.with_borrow_mut(Vec::clear);
        let err = run.rollback("the last write failed".into(), &input(&files), &noting);
        let seen = JOURNALS.with_borrow(Clone::clone);
        assert!(seen.len() >= 5, "{}", seen.len());
        for (_, journal) in &seen {
            assert!(journal.starts_with("---\nstatus: incomplete\n"), "while moves are reversed: {journal}");
        }
        // The fresh role file is in the way of the old one, so it stays open.
        assert!(err.contains("couldn't be fully undone"), "{err}");
        assert!(read(&dir, &format!("{ARCHIVE}/ARCHIVE.md")).starts_with("---\nstatus: incomplete\n"));
        assert_eq!(pending(&dir).len(), 1);
        std::fs::remove_dir_all(dir).ok();
    }

    /// Read-only: nothing can be made in it, renamed in it or taken out of it.
    #[cfg(unix)]
    fn lock(folder: &Path) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(folder, std::fs::Permissions::from_mode(0o555)).unwrap();
    }

    #[cfg(unix)]
    fn unlock(folder: &Path) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(folder, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    /// Whether a locked folder really refuses: it doesn't for root.
    #[cfg(unix)]
    fn refuses_writes(folder: &Path) -> bool {
        let probe = folder.join("probe");
        let refused = std::fs::write(&probe, "x").is_err();
        std::fs::remove_file(probe).ok();
        if !refused {
            eprintln!("running as a user who writes everywhere; skipping");
        }
        refused
    }

    // A rollback that can't write `incomplete` into its journal does not
    // start: the journal on disk is then still true, move by move.
    #[cfg(unix)]
    #[test]
    fn a_rollback_that_cannot_record_itself_changes_nothing() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        let files = files();
        let mut run = Run::new(&dir, &shown, &env());
        run.forward(V6, &shown, &input(&files), &env()).unwrap();
        // As if it had failed after the rules step.
        (run.journal.status, run.journal.phase) = ("in-progress", "rules");
        run.save().unwrap();
        let archive = at(&dir, ARCHIVE);
        lock(&archive);
        if refuses_writes(&archive) {
            let before = tree(&dir);
            let err = run.rollback("It failed.".into(), &input(&files), &env());
            assert!(err.starts_with(&format!("It failed. Couldn't record the rollback in {ARCHIVE}/ARCHIVE.md (")), "{err}");
            assert!(err.ends_with("), so nothing was undone. ARCHIVE.md describes the project as it is."), "{err}");
            assert_eq!(tree(&dir), before, "no path moved back; settings, rules and CLAUDE.md as the switch left them; the journal unchanged");
            assert_eq!(read(&dir, ".claude/agents/qa.md"), "fresh qa");
            assert!(read(&dir, ".ade/rules.md").contains(ARCHIVE_RULE_MARKER));
            assert_eq!(run.journal.status, "in-progress", "memory says what the disk says");
            let open = pending(&dir);
            assert_eq!(open.len(), 1);
            assert_eq!((open[0].status.as_str(), open[0].phase.as_str()), ("in-progress", "rules"));
        }
        unlock(&archive);
        std::fs::remove_dir_all(dir).ok();
    }

    /// The archive folder stops taking writes once the rollback has begun.
    #[cfg(unix)]
    fn the_archive_is_locked(root: &Path) {
        lock(&at(root, ARCHIVE));
    }

    // Only the first save works: the rollback runs, and the disk says
    // `incomplete` whatever the later saves do.
    #[cfg(unix)]
    #[test]
    fn a_rollback_whose_later_saves_fail_has_already_said_incomplete() {
        let dir = v4_project();
        let failing = Env { fail_after_rules: true, before_rollback: the_archive_is_locked, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        let archive = at(&dir, ARCHIVE);
        if archive.exists() {
            let status = front_matter(&read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"))).unwrap()["status"].clone();
            unlock(&archive);
            assert_eq!(status, "incomplete");
            assert!(err.contains("couldn't be fully undone") && err.contains("ARCHIVE.md"), "{err}");
            assert_eq!(read(&dir, ".ade/rules.md"), "old rules\n", "the rollback ran");
            assert_eq!(read(&dir, "CLAUDE.md"), "# Mine\n");
            assert_eq!(pending(&dir).len(), 1);
        } else {
            eprintln!("running as a user who writes everywhere; skipping");
        }
        std::fs::remove_dir_all(dir).ok();
    }

    /// The journal on disk says `incomplete`, and nothing is undone yet.
    fn the_journal_says_incomplete_before_anything_is_undone(root: &Path) {
        let journal = read(root, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: incomplete\nphase: rules\n"), "{journal}");
        assert!(read(root, ".ade/rules.md").contains(ARCHIVE_RULE_MARKER), "the rules strip has not run");
        assert!(read(root, ".claude/settings.json").contains("Edit(/.ade/archive/**)"), "nor the settings restore");
        assert!(read(root, "CLAUDE.md").ends_with(IMPORT) && read(root, ".claude/agents/qa.md") == "fresh qa", "nor setup's take-back");
        assert!(!at(root, ".bmad-core").exists(), "nor a move");
    }

    #[test]
    fn the_journal_says_incomplete_before_the_first_thing_is_undone() {
        let dir = v4_project();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, before_rollback: the_journal_says_incomplete_before_anything_is_undone, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    // Setup wrote the new marker, so its report lists it, and its cleanup
    // would remove whatever is at that path. Rewritten since, it is not the
    // switch's any more.
    #[test]
    fn a_marker_setup_wrote_and_someone_rewrote_is_left_and_reported() {
        // The project had a marker: it stays in the archive.
        let dir = v4_project();
        let failing = Env { fail_after_rules: true, before_rollback: the_marker_is_rewritten, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/methodology: something is there again"), "{err}");
        assert_eq!(read(&dir, ".ade/methodology"), "mine\n", "the rewritten bytes are still there");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.ade/methodology")), "v4\n", "and the old marker is in the archive");
        let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
        assert!(journal.starts_with("---\nstatus: incomplete\n"), "{journal}");
        assert!(journal.contains(&format!("- `.ade/methodology` → `{ARCHIVE}/.ade/methodology`: moved\n")), "{journal}");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a", "the rest is back");
        std::fs::remove_dir_all(dir).ok();

        // The project had none.
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/methodology")).unwrap();
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/methodology appeared during the switch"), "{err}");
        assert_eq!(read(&dir, ".ade/methodology"), "mine\n");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a", "the rest is back");
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    fn claude_md_cannot_be_read(root: &Path) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(root.join("CLAUDE.md"), std::fs::Permissions::from_mode(0o000)).unwrap();
    }

    // Setup's cleanup says nothing when it can't read CLAUDE.md either.
    #[cfg(unix)]
    #[test]
    fn a_claude_md_that_cannot_be_read_at_rollback_is_reported() {
        use std::os::unix::fs::PermissionsExt;
        let dir = v4_project();
        let failing = Env { fail_after_rules: true, before_rollback: claude_md_cannot_be_read, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        let unreadable = std::fs::read(dir.join("CLAUDE.md")).is_err();
        std::fs::set_permissions(dir.join("CLAUDE.md"), std::fs::Permissions::from_mode(0o644)).unwrap();
        if unreadable {
            assert!(err.contains("couldn't check CLAUDE.md for the import line"), "{err}");
            assert_eq!(read(&dir, "CLAUDE.md"), format!("# Mine\n{IMPORT}"), "left as it was");
            assert_eq!(pending(&dir)[0].status, "incomplete");
        } else {
            eprintln!("running as a user who reads everything; skipping");
        }
        std::fs::remove_dir_all(dir).ok();
    }

    /// The stage file links back, and then its folder in the archive stops
    /// letting a name be removed.
    #[cfg(unix)]
    fn the_archive_name_cannot_be_removed(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::hard_link(from, to)?;
        if to.ends_with(".ade/stage") {
            lock(from.parent().unwrap());
        }
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn a_file_that_is_back_and_still_in_the_archive_is_reported() {
        let dir = v4_project();
        let failing = Env { link: the_archive_name_cannot_be_removed, fail_after_rules: true, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        let folder = at(&dir, &format!("{ARCHIVE}/.ade"));
        if folder.exists() {
            unlock(&folder);
            assert!(err.contains(&format!(".ade/stage is back, but is still also at {ARCHIVE}/.ade/stage")), "{err}");
            assert_eq!(read(&dir, ".ade/stage"), "build");
            assert_eq!(read(&dir, &format!("{ARCHIVE}/.ade/stage")), "build");
            let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
            assert!(journal.starts_with("---\nstatus: incomplete\n"), "{journal}");
            assert!(journal.contains(&format!("- `.ade/stage` → `{ARCHIVE}/.ade/stage`: moved back\n")), "{journal}");
        } else {
            eprintln!("running as a user who writes everywhere; skipping");
        }
        std::fs::remove_dir_all(dir).ok();
    }

    // A temp name the relink didn't make is not its to remove.
    #[cfg(unix)]
    #[test]
    fn a_relink_leaves_a_file_it_did_not_make() {
        let dir = v4_project();
        write(&dir, "shared/settings.json", "{\"model\":\"sonnet\"}");
        std::os::unix::fs::symlink("../shared/settings.json", at(&dir, ".claude/settings.json")).unwrap();
        write(&dir, ".claude/.settings.json.ade-link", "someone's");
        let failing = Env { fail_after_rules: true, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".claude/settings.json was a link to ../shared/settings.json and is now a regular file"), "{err}");
        assert_eq!(read(&dir, ".claude/.settings.json.ade-link"), "someone's");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        std::fs::remove_dir_all(dir).ok();
    }

    /// An agent writes the stage file again in the instant before the old
    /// one is put back.
    fn a_file_appears_before_the_link(from: &Path, to: &Path) -> std::io::Result<()> {
        if to.ends_with(".ade/stage") {
            std::fs::write(to, "written by an agent")?;
        }
        std::fs::hard_link(from, to)
    }

    fn no_hard_links(_: &Path, _: &Path) -> std::io::Result<()> {
        Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "no hard links on this volume"))
    }

    fn a_file_appears_where_there_are_no_hard_links(from: &Path, to: &Path) -> std::io::Result<()> {
        if to.ends_with(".ade/stage") {
            std::fs::write(to, "written by an agent")?;
        }
        no_hard_links(from, to)
    }

    // A rename replaces a file that is in its way, on every OS. A file is
    // put back with a hard link, which refuses instead.
    #[test]
    fn a_file_that_appears_as_the_old_one_comes_back_is_not_overwritten() {
        for link in [a_file_appears_before_the_link as fn(&Path, &Path) -> std::io::Result<()>, a_file_appears_where_there_are_no_hard_links] {
            let dir = v4_project();
            let failing = Env { link, fail_after_rules: true, ..env() };
            let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
            assert!(err.contains(".ade/stage: something is there again"), "{err}");
            assert_eq!(read(&dir, ".ade/stage"), "written by an agent");
            assert_eq!(read(&dir, &format!("{ARCHIVE}/.ade/stage")), "build", "the old one is kept, in the archive");
            let journal = read(&dir, &format!("{ARCHIVE}/ARCHIVE.md"));
            assert!(journal.starts_with("---\nstatus: incomplete\n"), "{journal}");
            assert!(journal.contains(&format!("- `.ade/stage` → `{ARCHIVE}/.ade/stage`: moved\n")), "{journal}");
            assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a", "the rest is back");
            assert_eq!(read(&dir, ".ade/methodology"), "v4\n");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn where_there_are_no_hard_links_a_file_still_comes_back() {
        let dir = v4_project();
        let before = tree(&dir);
        let failing = Env { link: no_hard_links, fail_after_rules: true, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_file_put_back_is_the_one_file_again_and_a_link_is_a_link() {
        use std::os::unix::fs::MetadataExt;
        let dir = v4_project();
        // The stage is a link to a file elsewhere in the project.
        write(&dir, "real-stage", "build");
        std::fs::remove_file(at(&dir, ".ade/stage")).unwrap();
        std::os::unix::fs::symlink("../real-stage", at(&dir, ".ade/stage")).unwrap();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, ..env() };
        switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(tree(&dir), before, "the archive copy is gone with the archive");
        for file in [".ai/debug-log.md", ".ade/methodology", ".claude/agents/qa.md"] {
            assert_eq!(std::fs::metadata(at(&dir, file)).unwrap().nlink(), 1, "{file}");
        }
        assert!(std::fs::symlink_metadata(at(&dir, ".ade/stage")).unwrap().file_type().is_symlink());
        std::fs::remove_dir_all(dir).ok();
    }

    /// Something is already where the next move would land in the archive.
    fn the_next_destination_is_taken(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)?;
        if from.ends_with(".bmad-core") && into_archive(to) {
            let commands = to.parent().unwrap().join(".claude").join("commands");
            std::fs::create_dir_all(&commands)?;
            std::fs::write(commands.join("BMad"), "not the switch's")?;
        }
        Ok(())
    }

    // The archive folder is new, so nothing should be in a move's way there.
    // If something is, it is never replaced.
    #[test]
    fn a_move_never_replaces_what_is_in_the_archive() {
        let dir = v4_project();
        let failing = Env { rename: the_next_destination_is_taken, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.starts_with(&format!("Couldn't move .claude/commands/BMad: {ARCHIVE}/.claude/commands/BMad already exists")), "{err}");
        assert_eq!(read(&dir, &format!("{ARCHIVE}/.claude/commands/BMad")), "not the switch's");
        assert_eq!(read(&dir, ".claude/commands/BMad/tasks/x.md"), "x", "it never left");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a", "and what had moved is back");
        assert!(pending(&dir).is_empty(), "the journal is gone; what isn't the switch's stays");
        std::fs::remove_dir_all(dir).ok();
    }

    // The surviving mutation: an archive folder that appears after apply()
    // looked is not the switch's to write into.
    #[test]
    fn an_archive_folder_that_appeared_is_left_untouched() {
        let dir = v4_project();
        let shown = plan(&dir, V6, &[], &env());
        let files = files();
        let mut run = Run::new(&dir, &shown, &env());
        write(&dir, &format!("{ARCHIVE}/theirs.md"), "someone else's");
        let before = tree(&dir);
        let error = run.forward(V6, &shown, &input(&files), &env()).unwrap_err();
        assert!(error.starts_with(ARCHIVE), "{error}");
        assert_eq!(run.rollback(error.clone(), &input(&files), &env()), error);
        assert_eq!(tree(&dir), before, "no journal in it, nothing moved into it, and it is still there");
        std::fs::remove_dir_all(dir).ok();
    }

    fn a_line_is_added_to_claude_md(root: &Path) {
        let text = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        std::fs::write(root.join("CLAUDE.md"), format!("{text}A line a person added.\n")).unwrap();
    }

    // R4: setup's own cleanup says nothing when it can't strip the import.
    #[test]
    fn an_import_that_cannot_be_stripped_is_reported() {
        let dir = v4_project();
        let failing = Env { fail_after_rules: true, before_rollback: a_line_is_added_to_claude_md, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains("CLAUDE.md changed after the import was added to it, so the import is still there"), "{err}");
        assert_eq!(read(&dir, "CLAUDE.md"), format!("# Mine\n{IMPORT}A line a person added.\n"));
        assert_eq!(pending(&dir)[0].status, "incomplete");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a", "the rest is back");
        std::fs::remove_dir_all(dir).ok();
    }

    // Setup's save replaces a linked settings file with a regular one. The
    // link's target was never written, so the link is put back.
    #[cfg(unix)]
    #[test]
    fn a_linked_settings_file_is_a_link_again_after_a_rollback() {
        let dir = v4_project();
        write(&dir, "shared/settings.json", "{\"model\":\"sonnet\"}");
        std::os::unix::fs::symlink("../shared/settings.json", at(&dir, ".claude/settings.json")).unwrap();
        let before = tree(&dir);
        let failing = Env { fail_after_rules: true, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert_eq!(err, "failed on purpose, after the rules step");
        assert_eq!(tree(&dir), before);
        assert_eq!(std::fs::read_link(at(&dir, ".claude/settings.json")).unwrap(), Path::new("../shared/settings.json"));
        assert_eq!(read(&dir, "shared/settings.json"), "{\"model\":\"sonnet\"}", "the target still holds the old bytes");
        std::fs::remove_dir_all(dir).ok();
    }

    fn the_settings_are_edited(root: &Path) {
        std::fs::write(at(root, ".claude/settings.json"), "{\"model\":\"opus\"}").unwrap();
    }

    // Settings someone edited after the switch did are theirs: left, and said.
    #[test]
    fn settings_edited_during_the_switch_are_left_and_reported() {
        for existed in [true, false] {
            let dir = v4_project();
            if existed {
                write(&dir, ".claude/settings.json", "{\"model\":\"sonnet\"}");
            }
            let failing = Env { fail_after_rules: true, before_rollback: the_settings_are_edited, ..env() };
            let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
            assert!(err.contains(".claude/settings.json changed after the switch edited it, so it was left as it is"), "{existed}: {err}");
            assert_eq!(read(&dir, ".claude/settings.json"), "{\"model\":\"opus\"}", "{existed}: neither restored nor removed");
            assert_eq!(pending(&dir)[0].status, "incomplete");
            assert_eq!(read(&dir, ".ade/methodology"), "v4\n", "the rest is back");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    fn the_marker_is_rewritten(root: &Path) {
        std::fs::write(at(root, ".ade/methodology"), "mine\n").unwrap();
    }

    // The pre-clean takes only a marker that reads as the new version, which
    // is what setup writes or keeps. Anything else is someone's, and stays.
    #[test]
    fn a_marker_that_is_not_the_new_versions_is_left_and_reported() {
        // The project had a marker: the old one can't come back over it.
        let dir = v6_project();
        let failing = Env { rename: a_v4_marker_reappears, fail_after_rules: true, before_rollback: the_marker_is_rewritten, ..env() };
        let err = switch(&dir, V4, &plan(&dir, V4, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/methodology: something is there again"), "{err}");
        assert_eq!(read(&dir, ".ade/methodology"), "mine\n");
        assert_eq!(read(&dir, &format!("{ARCHIVE_V6}/.ade/methodology")), "v6\n");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        std::fs::remove_dir_all(dir).ok();

        // The project had none: it has one now that isn't the switch's.
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/methodology")).unwrap();
        let failing = Env { rename: a_v6_marker_appears, fail_after_rules: true, before_rollback: the_marker_is_rewritten, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/methodology appeared during the switch"), "{err}");
        assert_eq!(read(&dir, ".ade/methodology"), "mine\n");
        assert_eq!(pending(&dir)[0].status, "incomplete");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a", "the rest is back");
        std::fs::remove_dir_all(dir).ok();
    }

    // Rules behind a link that leads nowhere are there, and can't be read.
    #[cfg(unix)]
    #[test]
    fn a_dangling_rules_link_fails_the_switch() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/rules.md")).unwrap();
        std::os::unix::fs::symlink("nowhere.md", at(&dir, ".ade/rules.md")).unwrap();
        let before = tree(&dir);
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap_err();
        assert!(err.starts_with(".ade/rules.md can't be read"), "{err}");
        assert_eq!(tree(&dir), before);
        std::fs::remove_dir_all(dir).ok();
    }

    /// The rules setup wrote are edited before the rollback.
    fn the_new_rules_are_edited(root: &Path) {
        let rules = at(root, ".ade/rules.md");
        let text = std::fs::read_to_string(&rules).unwrap();
        std::fs::write(&rules, format!("{text}A line a person added.\n")).unwrap();
    }

    // A file setup wrote and someone edited since is left by setup's
    // cleanup, without a word. It is no move's to report, so this says it.
    #[test]
    fn a_setup_file_edited_during_the_switch_is_left_and_reported() {
        let dir = v4_project();
        std::fs::remove_file(at(&dir, ".ade/rules.md")).unwrap();
        let failing = Env { fail_after_rules: true, before_rollback: the_new_rules_are_edited, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.contains(".ade/rules.md was changed after setup wrote it, so it was left"), "{err}");
        assert!(read(&dir, ".ade/rules.md").ends_with("A line a person added.\n"));
        assert_eq!(pending(&dir)[0].status, "incomplete");
        assert_eq!(read(&dir, ".claude/agents/qa.md"), "edited qa", "the rest is back");
        std::fs::remove_dir_all(dir).ok();
    }

    /// The journal becomes something that can't be removed as a file.
    fn the_journal_becomes_a_folder(root: &Path) {
        let journal = at(root, &format!("{ARCHIVE}/ARCHIVE.md"));
        std::fs::remove_file(&journal).unwrap();
        std::fs::create_dir_all(journal.join("inner")).unwrap();
    }

    #[test]
    fn a_journal_that_cannot_be_removed_after_a_clean_rollback_is_said() {
        let dir = v4_project();
        let failing = Env { fail_after_rules: true, before_rollback: the_journal_becomes_a_folder, ..env() };
        let err = switch(&dir, V6, &plan(&dir, V6, &[], &failing), &failing).unwrap_err();
        assert!(err.starts_with("failed on purpose, after the rules step. Everything was put back, but"), "{err}");
        assert!(err.contains(&format!("{ARCHIVE}/ARCHIVE.md couldn't be removed")), "{err}");
        assert_eq!(read(&dir, ".bmad-core/tasks/a.md"), "a");
        assert_eq!(read(&dir, ".ade/methodology"), "v4\n");
        assert_eq!(pending(&dir).len(), 1, "it still blocks, as the error says");
        std::fs::remove_dir_all(dir).ok();
    }

    // The v4 install fails partway: a file where its commands folder goes.
    #[test]
    fn rollback_after_a_failed_setup_of_v4_puts_everything_back() {
        let dir = v6_project();
        write(&dir, ".claude/commands", "a file, not a folder");
        let before = tree(&dir);
        let shown = plan(&dir, V4, &[], &env());
        assert_eq!(shown.blocked, None);
        let err = switch(&dir, V4, &shown, &env()).unwrap_err();
        assert!(err.contains("commands"), "{err}");
        assert_eq!(tree(&dir), before, "the engine it had copied is gone, and v6 is back");
        assert!(pending(&dir).is_empty());
        std::fs::remove_dir_all(dir).ok();
    }

    fn a_move(files: u32) -> Move {
        Move { from: "x".into(), to: "y".into(), files, ignored: "none".into() }
    }

    // R17: a total that includes a capped count is a lower bound, and says so.
    #[test]
    fn the_files_moved_say_when_a_count_was_capped() {
        let dir = v4_project();
        let mut plan = plan(&dir, V6, &[], &env());
        assert_eq!(moved_files(&plan), (7, false));
        plan.leftovers = vec![a_move(3)];
        assert_eq!(moved_files(&plan), (10, false), "leftovers move too");
        plan.moves.push(a_move(COUNT_LIMIT));
        assert_eq!(moved_files(&plan), (10 + COUNT_LIMIT, true));
        plan.moves.push(a_move(u32::MAX));
        assert_eq!(moved_files(&plan), (u32::MAX, true), "a count can't overflow it");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_result_reaches_the_frontend_in_camel_case() {
        let dir = v4_project();
        let result = switch(&dir, V6, &plan(&dir, V6, &[], &env()), &env()).unwrap();
        let json = serde_json::to_value(&result).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["archive", "archiveDenied", "moved", "movedCapped", "rulesAppended", "setup"]);
        assert_eq!(json["movedCapped"], false);
        assert_eq!(json["setup"]["bmadv6Files"], 6);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn archive_names_are_only_the_ones_ade_makes() {
        for good in [".ade/archive/bmad-v4-2026-10-11", ".ade/archive/bmad-v4-2026-10-11-2", ".ade/archive/bmad-v4-2026-10-11-17"] {
            assert!(valid_archive(good, "v4"), "{good}");
        }
        for bad in [
            ".ade/archive/bmad-v4-2026-10-11",
            ".ade/archive/bmad-v6-2026-10-1",
            ".ade/archive/bmad-v6-2026-10-11-",
            ".ade/archive/bmad-v6-2026-10-11-x",
            ".ade/archive/bmad-v6-2026-10-11/..",
            ".ade/archive/bmad-v6-2026_10_11",
            ".ade/archive/bmad-v6-２０２６-10-11",
            ".ade/archive/bmad-v6-2026-13-01",
            ".ade/archive/bmad-v6-2026-00-10",
            ".ade/archive/bmad-v6-2026-10-32",
            ".ade/archive/bmad-v6-2026-10-00",
            "bmad-v6-2026-10-11",
        ] {
            assert!(!valid_archive(bad, "v6"), "{bad}");
        }
    }

    #[test]
    fn long_windows_paths_get_the_verbatim_prefix() {
        let short = r"C:\code\shop\.ade\archive";
        assert_eq!(verbatim(short), short);
        let long = format!("C:/code/{}/x.md", "deep/".repeat(60));
        assert_eq!(verbatim(&long), format!(r"\\?\{}", long.replace('/', r"\")));
        let already = format!(r"\\?\C:\{}", "deep\\".repeat(60));
        assert_eq!(verbatim(&already), already);
        let relative = "deep/".repeat(60);
        assert_eq!(verbatim(&relative), relative, "only an absolute path can carry it");
    }
}
