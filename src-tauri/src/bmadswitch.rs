//! Switching a project's BMAD version. The old version's files move into
//! `.ade/archive/bmad-<from>-<date>/` inside the project, then the other
//! version is set up fresh. Nothing is deleted.
//!
//! `ARCHIVE.md` in the archive is the journal. It is written before the first
//! move, so a switch that was interrupted can be finished by hand, and its
//! front matter is how ADE knows one didn't finish.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

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

impl Journal {
    pub(crate) fn new(from: &str, to: &str, date: &str, moves: &[Move]) -> Self {
        Journal {
            status: "in-progress",
            phase: "moving",
            from: from.to_string(),
            to: to.to_string(),
            date: date.to_string(),
            moves: moves.iter().map(|m| (m.from.clone(), m.to.clone(), MoveState::Pending)).collect(),
        }
    }

    pub(crate) fn render(&self) -> String {
        let (old, new, date) = (&self.from, &self.to, &self.date);
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
             While `status` above is `in-progress` or `incomplete`, ADE neither sets this project up nor switches it. \
             Look at `phase` above:\n\n\
             - `phase: moving`: a path marked *moving* may be at either place, so check both. \
             Move each path marked *moving* or *moved* back to its place if it is in this archive.\n\
             - `phase: setup`: every path was moved. BMAD {new}'s files may be partly written at the old paths. \
             Remove them first, then move the archive's paths back.\n\
             - `phase: rules` or `phase: done`: the switch finished and there is nothing to undo. \
             Set `status: complete` above.\n\n\
             Otherwise, when you have moved everything back, set `status: abandoned` above.\n"
        ));
        out
    }

    pub(crate) fn write(&self, archive: &Path) -> Result<(), String> {
        let path = archive.join(JOURNAL);
        crate::state::atomic_write(&path, &self.render()).map_err(|e| format!("{}: {e}", path.display()))
    }
}

/// The `key: value` lines between a file's opening `---` and the next one.
pub(crate) fn front_matter(text: &str) -> Option<HashMap<String, String>> {
    let mut lines = text.lines();
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
    for entry in entries.flatten() {
        let archive = format!("{ARCHIVE_DIR}/{}", entry.file_name().to_string_lossy());
        if !entry.path().is_dir() {
            continue;
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
}
