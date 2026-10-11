//! End-to-end: a project is switched between BMAD v4 and BMAD v6 on disk, with
//! the resources that ship. Each project is set up through `projectsetup::apply`
//! (what `project_setup_apply` runs), then planned and applied through
//! `bmadswitch::plan` and `bmadswitch::apply` (what `bmad_switch_plan` and
//! `bmad_switch_apply` run). The commands themselves take a Tauri `AppHandle`,
//! which only resolves the two resource roots; here those are the source
//! tree's `resources/`, composed the way the packaging composes them.
//!
//! The plan goes to apply through JSON, as it does through the webview, and
//! the setup files are shaped like the ones src/lib/projectMethodology.ts sends.
//!
//! The tests sit in a `bmadswitch_e2e` module so `cargo test bmadswitch_e2e`
//! selects them: cargo's filter matches test names, and a bare `#[test]` in
//! this file would be filtered out.

use better_terminal_lib::bmadswitch::{self, Env, SetupInput, SwitchPlan, SwitchResult};
use better_terminal_lib::bmadv6::{self, Methodology};
use better_terminal_lib::projectsetup::{self, SetupFile, SetupReport};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// `CLAUDE_MD_IMPORT` and its marker in src/lib/projectMethodology.ts.
const MARKER: &str = "<!-- ade:methodology -->";
const IMPORT: &str = "\n\n<!-- ade:methodology -->\n## ADE methodology\n\nThis project follows the ADE methodology. Read and obey it:\n\n@.ade/rules.md\n";

/// The section a switch appends to rules that don't have it, and the one
/// entry it adds to `permissions.deny` (the guide's "The archive").
const ARCHIVE_RULE: &str = include_str!("../src/archive_rule.md");
const ARCHIVE_DENY: &str = "Edit(/.ade/archive/**)";

/// `ROLES` in src/lib/projectMethodology.ts: the role files setup writes.
const ROLES: [&str; 8] = ["product-manager", "architect", "designer", "scrum-master", "developer", "qa", "devops", "adversarial-reviewer"];

/// Rules from before the archive section existed, edited by the person.
const OLD_RULES: &str = "# Rules\n\n1. Verified, not vibed.\n2. Ask before touching the billing module.\n";

const SETTINGS: &str = "{\n  \"model\": \"sonnet\",\n  \"permissions\": {\n    \"allow\": [\"Bash(pnpm test)\"],\n    \"deny\": [\"Read(./.env)\"]\n  }\n}\n";

/// The person's own files: what a switch never moves unless a document is ticked.
const OWN: [(&str, &str); 7] = [
    ("CLAUDE.md", "# shop\n\nUse pnpm, never npm.\n"),
    (".ade/rules.md", OLD_RULES),
    (".claude/settings.json", SETTINGS),
    (".claude/agents/release-captain.md", "---\nname: release-captain\n---\n\nCuts the release.\n"),
    (".claude/skills/changelog/SKILL.md", "---\nname: changelog\n---\n\nWrites the changelog.\n"),
    ("docs/prd.md", "# PRD\n\nA shop that sells one thing well.\n"),
    ("docs/stories/1.1.story.md", "# Story 1.1\n\nStatus: Draft\n"),
];

/// A pid-named temp dir, emptied first: a leftover from a crashed run would
/// otherwise satisfy the assertions without exercising the switch's writes.
fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A recursive copy — std has none — for composing the packaged resource root.
fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), &target).unwrap();
        }
    }
}

/// The v6 resource root as the packaging builds it: the vendored tree with the
/// bundle at its top level, which is what tauri.conf.json's
/// `"resources/ade-runtime.mjs": "resources/bmad-v6/ade-runtime.mjs"` mapping
/// produces. In the source tree the bundle sits one level up, in `resources/`.
fn packaged_resource_root(into: &Path) -> PathBuf {
    let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
    copy_dir(&resources.join("bmad-v6"), into);
    std::fs::copy(resources.join("ade-runtime.mjs"), into.join("ade-runtime.mjs")).unwrap();
    into.to_path_buf()
}

/// Both versions' resource roots, as `bmad::resource_root` and
/// `bmadv6::resource_root` resolve them in the app.
struct Resources {
    v4: PathBuf,
    v6: PathBuf,
}

fn resources(name: &str) -> Resources {
    Resources {
        v4: Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("bmad"),
        v6: packaged_resource_root(&temp(&format!("{name}-resources"))),
    }
}

/// What the commands' own `env()` builds, with the resource roots given
/// rather than resolved from an `AppHandle`. The rename and the link are
/// `std::fs`'s, as there, and neither test seam is used.
fn env(res: &Resources) -> Env {
    Env {
        git: "git",
        v4_src: Some(res.v4.clone()),
        v6_src: Some(res.v6.clone()),
        today: bmadswitch::today(),
        device: bmadswitch::device_of,
        rename: |from, to| std::fs::rename(from, to),
        link: |from, to| std::fs::hard_link(from, to),
        fail_after_rules: false,
        before_rollback: |_| {},
    }
}

/// A project-relative, `/`-separated path under `root`: the plan spells every
/// path that way, on every OS.
fn at(root: &Path, rel: &str) -> PathBuf {
    rel.split('/').filter(|part| !part.is_empty()).fold(root.to_path_buf(), |path, part| path.join(part))
}

fn write(root: &Path, rel: &str, content: &str) {
    let path = at(root, rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

fn read(root: &Path, rel: &str) -> String {
    std::fs::read_to_string(at(root, rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}

fn root_of(dir: &Path) -> String {
    dir.to_string_lossy().into_owned()
}

fn version(methodology: Methodology) -> &'static str {
    methodology.as_str()
}

/// The rules setup writes today: they end with the archive section, as
/// `RULES_MD` does.
fn rules() -> String {
    format!("# ADE rules\n\n## 1. Verified, not vibed\nA story is Done only when the verification command passes.\n\n{ARCHIVE_RULE}")
}

fn role_file(role: &str, methodology: Methodology) -> String {
    format!("---\nname: {role}\ndescription: The {role} of this project.\n---\n\nThe BMAD {} tasks of the {role}.\n", version(methodology))
}

/// The files the frontend sends for a project on `methodology`: the shape of
/// `methodologyFiles()` in src/lib/projectMethodology.ts, whose role files
/// differ by version.
fn setup_files(dir: &Path, methodology: Methodology) -> Vec<SetupFile> {
    let name = dir.file_name().unwrap().to_string_lossy().into_owned();
    let mut files = vec![
        SetupFile { path: "CLAUDE.md".into(), content: format!("# CLAUDE.md: working in {name}\n\n@.ade/rules.md\n") },
        SetupFile { path: "llms.txt".into(), content: format!("# {name}\n") },
        SetupFile { path: ".ade/rules.md".into(), content: rules() },
        SetupFile { path: ".ade/context/README.md".into(), content: "# Context store\n".into() },
        SetupFile { path: ".ade/context/decisions/README.md".into(), content: "# Decisions\n".into() },
        SetupFile { path: ".ade/session.md".into(), content: format!("# Session journal: {name}\n") },
        SetupFile { path: ".ade/knowledge/README.md".into(), content: "# Knowledge\n".into() },
    ];
    files.extend(ROLES.iter().map(|role| SetupFile { path: format!(".claude/agents/{role}.md"), content: role_file(role, methodology) }));
    files
}

fn source(res: &Resources, methodology: Methodology) -> &Path {
    match methodology {
        Methodology::V4 => &res.v4,
        Methodology::V6 => &res.v6,
    }
}

/// A full setup, as `project_setup_apply` runs it with `full: true`.
fn set_up(dir: &Path, methodology: Methodology, res: &Resources) -> SetupReport {
    let mut report = SetupReport::default();
    projectsetup::apply(dir, &setup_files(dir, methodology), Some(IMPORT), MARKER, methodology, Some(source(res, methodology)), &mut report)
        .unwrap_or_else(|e| panic!("setup on {} failed: {e}", version(methodology)));
    report
}

/// A project a person has worked in on v4: their own files were there before
/// ADE set it up, and v4's working files have been written since.
fn a_v4_project(name: &str, res: &Resources) -> PathBuf {
    let dir = temp(name);
    for (path, content) in OWN {
        write(&dir, path, content);
    }
    set_up(&dir, Methodology::V4, res);
    write(&dir, ".ai/debug-log.md", "# Debug log\n\n- 1.1: the cart test was flaky\n");
    write(&dir, ".ade/stage", "build\n");
    dir
}

/// The same person's project on v6, with a ticket in the output folder, a
/// gate and an approval.
fn a_v6_project(name: &str, res: &Resources) -> PathBuf {
    let dir = temp(name);
    for (path, content) in OWN {
        write(&dir, path, content);
    }
    set_up(&dir, Methodology::V6, res);
    write(&dir, "_bmad-output/backlog/1.1.md", "# 1.1 Cart\n\nstatus: ready\n");
    write(&dir, ".ade/gates/1.1.yml", "gate: PASS\n");
    write(&dir, ".ade/approvals/1.1.md", "approved\n");
    dir
}

/// A folder (`None`) or a file's bytes.
type Listing = BTreeMap<String, Option<Vec<u8>>>;

fn list_into(folder: &Path, prefix: &str, out: &mut Listing) {
    for entry in std::fs::read_dir(folder).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if entry.file_type().unwrap().is_dir() {
            out.insert(rel.clone(), None);
            list_into(&entry.path(), &rel, out);
        } else {
            out.insert(rel, Some(std::fs::read(entry.path()).unwrap()));
        }
    }
}

/// Everything in the project, folders included, by `/`-separated path. Git's
/// own folder is left out: git rewrites it when it is only asked a question.
fn listing(dir: &Path) -> Listing {
    let mut out = Listing::new();
    list_into(dir, "", &mut out);
    out.retain(|path, _| path != ".git" && !path.starts_with(".git/"));
    out
}

/// The paths that are not the same in both, each with what happened to it.
fn differences(before: &Listing, after: &Listing) -> Vec<String> {
    let mut out = Vec::new();
    for (path, was) in before {
        match after.get(path) {
            None => out.push(format!("{path}: gone")),
            Some(now) if now != was => out.push(format!("{path}: changed")),
            Some(_) => {}
        }
    }
    out.extend(after.keys().filter(|path| !before.contains_key(*path)).map(|path| format!("{path}: new")));
    out
}

/// The plan, as the webview hands it back: through JSON, in the commands' camelCase.
fn through_the_webview(plan: &SwitchPlan) -> SwitchPlan {
    serde_json::from_value(serde_json::to_value(plan).unwrap()).unwrap()
}

/// `planSwitch(root, to, documents)`: `ticked` is the documents the person ticked.
fn plan(dir: &Path, to: Methodology, ticked: &[&str], res: &Resources) -> SwitchPlan {
    let ticked: Vec<String> = ticked.iter().map(|doc| doc.to_string()).collect();
    through_the_webview(&bmadswitch::plan(dir, to, &ticked, &env(res)))
}

/// `runSwitch(root, plan)`: the plan that was shown, and the setup files of
/// the version it switches to.
fn apply(dir: &Path, shown: &SwitchPlan, res: &Resources) -> Result<SwitchResult, String> {
    let to = if shown.to == "v4" { Methodology::V4 } else { Methodology::V6 };
    let files = setup_files(dir, to);
    bmadswitch::apply(dir, to, &through_the_webview(shown), &SetupInput { files: &files, import: IMPORT, marker: MARKER }, &env(res))
}

/// Plan with nothing ticked and apply it, expecting both to go through.
fn switch(dir: &Path, to: Methodology, res: &Resources) -> (SwitchPlan, SwitchResult) {
    let shown = plan(dir, to, &[], res);
    assert_eq!(shown.blocked, None, "the plan to {} is blocked", version(to));
    let result = apply(dir, &shown, res).unwrap_or_else(|e| panic!("the switch to {} failed: {e}", version(to)));
    (shown, result)
}

/// Every source path the plan moves, leftovers included.
fn planned(plan: &SwitchPlan) -> BTreeSet<String> {
    plan.moves.iter().chain(&plan.leftovers).map(|m| m.from.clone()).collect()
}

fn set(paths: impl IntoIterator<Item = String>) -> BTreeSet<String> {
    paths.into_iter().collect()
}

fn role_paths() -> impl Iterator<Item = String> {
    ROLES.iter().map(|role| format!(".claude/agents/{role}.md"))
}

/// The bundled v6 skills, as paths in a project.
fn skill_paths(res: &Resources) -> Vec<String> {
    let mut out: Vec<String> = std::fs::read_dir(res.v6.join("skills"))
        .unwrap()
        .map(|entry| entry.unwrap())
        .filter(|entry| entry.file_type().unwrap().is_dir())
        .map(|entry| format!(".claude/skills/{}", entry.file_name().to_string_lossy()))
        .collect();
    out.sort();
    out
}

/// A value of the journal's front matter.
fn front(journal: &str, key: &str) -> String {
    let mut lines = journal.lines();
    assert_eq!(lines.next(), Some("---"), "the journal starts with front matter");
    lines
        .take_while(|line| *line != "---")
        .find_map(|line| line.strip_prefix(&format!("{key}:")).map(|value| value.trim().to_string()))
        .unwrap_or_else(|| panic!("no `{key}` in the journal's front matter:\n{journal}"))
}

/// The files in the archive, the journal aside.
fn archived_files(dir: &Path, archive: &str) -> usize {
    let journal = format!("{archive}/ARCHIVE.md");
    listing(dir).iter().filter(|(path, entry)| path.starts_with(&format!("{archive}/")) && **path != journal && entry.is_some()).count()
}

/// What every finished switch leaves, whatever the direction. `before` is the
/// project as it was; `changed` is the paths the guide says a switch edits in
/// place, which the caller checks itself.
///
/// - every path the plan said would move is in the archive at its mirrored
///   place, with the bytes it had;
/// - everything else is where it was, with the bytes it had;
/// - the journal is there and reads as complete, each move marked *moved*;
/// - nothing is pending;
/// - the result's count is the number of files in the archive.
fn assert_archived(before: &Listing, dir: &Path, shown: &SwitchPlan, result: &SwitchResult, changed: &[&str]) {
    let after = listing(dir);
    let archive = &shown.archive;
    assert_eq!(&result.archive, archive);
    let moves: Vec<_> = shown.moves.iter().chain(&shown.leftovers).collect();
    for m in &moves {
        assert!(before.contains_key(&m.from), "the plan moves {}, which was not in the project", m.from);
    }
    for m in &shown.moves {
        assert_eq!(m.to, format!("{archive}/{}", m.from), "the archive mirrors the project");
    }
    for m in &shown.leftovers {
        assert_eq!(m.to, format!("{archive}/leftovers-{}/{}", shown.to, m.from));
    }
    for (path, was) in before {
        let moved = moves.iter().find(|m| *path == m.from || path.starts_with(&format!("{}/", m.from)));
        match moved {
            Some(m) => {
                let archived = format!("{}{}", m.to, &path[m.from.len()..]);
                assert_eq!(after.get(&archived), Some(was), "{path} is not at {archived} as it was");
            }
            None if changed.contains(&path.as_str()) => assert!(after.contains_key(path), "{path} is gone"),
            None => assert_eq!(after.get(path), Some(was), "{path} moved or changed, and the plan did not say it would"),
        }
    }

    let journal = read(dir, &format!("{archive}/ARCHIVE.md"));
    assert_eq!(front(&journal, "status"), "complete", "{journal}");
    assert_eq!(front(&journal, "phase"), "done", "{journal}");
    assert_eq!(front(&journal, "from"), shown.from);
    assert_eq!(front(&journal, "to"), shown.to);
    for m in &moves {
        let line = format!("- `{}` → `{}`: moved", m.from, m.to);
        assert!(journal.lines().any(|l| l == line), "the journal has no line {line:?}:\n{journal}");
    }
    assert_eq!(bmadswitch::bmad_switch_pending(root_of(dir)), [], "a finished switch is not pending");

    assert!(!result.moved_capped);
    assert_eq!(result.moved as usize, archived_files(dir, archive), "the count the toast shows is the files in the archive");
    assert_eq!(result.setup.settings_error, None);
}

/// `.claude/settings.json` kept everything it had and gained the one deny rule.
fn assert_settings_gained_the_deny_rule(dir: &Path, was: &[u8]) {
    let mut expected: serde_json::Value = serde_json::from_slice(was).unwrap();
    expected["permissions"]["deny"].as_array_mut().unwrap().push(ARCHIVE_DENY.into());
    let now: serde_json::Value = serde_json::from_str(&read(dir, ".claude/settings.json")).unwrap();
    assert_eq!(now, expected);
    // Theirs are still there, by name, whatever setup added before the switch.
    assert_eq!(now["model"], "sonnet");
    assert_eq!(now["permissions"]["allow"], serde_json::json!(["Bash(pnpm test)"]));
    assert_eq!(now["permissions"]["deny"], serde_json::json!(["Read(./.env)", ARCHIVE_DENY]));
}

/// The project is a working v4 project: the bundled core whole, the commands,
/// the marker, v4's role files, and nothing for setup left to add.
fn assert_is_v4(dir: &Path, res: &Resources) {
    assert_eq!(bmadv6::detect_on_disk(dir), Some(Methodology::V4));
    assert_eq!(read(dir, ".ade/methodology").trim(), "v4");
    let mut bundled = Listing::new();
    list_into(&res.v4.join("bmad-core"), ".bmad-core", &mut bundled);
    list_into(&res.v4.join("claude-commands").join("BMad"), ".claude/commands/BMad", &mut bundled);
    assert!(bundled.contains_key(".bmad-core/core-config.yaml"), "the bundled core has its config");
    let now = listing(dir);
    for (path, content) in &bundled {
        assert_eq!(now.get(path), Some(content), "{path} is not the bundled one");
    }
    for role in ROLES {
        assert_eq!(read(dir, &format!(".claude/agents/{role}.md")), role_file(role, Methodology::V4));
    }
    let paths = setup_files(dir, Methodology::V4).into_iter().map(|file| file.path).collect();
    let status = projectsetup::project_setup_status(root_of(dir), paths, MARKER.to_string()).unwrap();
    assert_eq!(status.methodology.as_deref(), Some("v4"));
    assert!(status.bmad_installed);
    assert_eq!(status.missing, Vec::<String>::new());
    assert!(!status.needs_import);
}

/// The project is a working v6 project: every bundled skill, `_bmad/` with
/// the runtime, the output folder, the marker and v6's role files.
fn assert_is_v6(dir: &Path, res: &Resources) {
    assert_eq!(bmadv6::detect_on_disk(dir), Some(Methodology::V6));
    assert_eq!(read(dir, ".ade/methodology").trim(), "v6");
    let mut bundled = Listing::new();
    list_into(&res.v6.join("skills"), ".claude/skills", &mut bundled);
    assert!(bundled.contains_key(".claude/skills/bmad/SKILL.md"), "the bundled skills have the entry skill");
    let now = listing(dir);
    for (path, content) in &bundled {
        assert_eq!(now.get(path), Some(content), "{path} is not the bundled one");
    }
    assert_eq!(std::fs::read(at(dir, "_bmad/ade-runtime.mjs")).unwrap(), std::fs::read(res.v6.join("ade-runtime.mjs")).unwrap());
    assert!(at(dir, "_bmad/config.toml").is_file());
    assert!(at(dir, "_bmad/custom/.gitignore").is_file());
    assert!(at(dir, "_bmad-output").is_dir());
    for role in ROLES {
        assert_eq!(read(dir, &format!(".claude/agents/{role}.md")), role_file(role, Methodology::V6));
    }
}

/// A failed switch put everything back: the project is, path for path and
/// byte for byte, what it was, the archive is gone and nothing is pending.
fn assert_put_back(before: &Listing, dir: &Path, error: &str) {
    assert_eq!(differences(before, &listing(dir)), Vec::<String>::new(), "after: {error}");
    assert_eq!(bmadswitch::bmad_switch_pending(root_of(dir)), [], "after: {error}");
}

/// `ARCHIVE.md` as `Journal::render` writes it for a switch that was cut
/// short after its first move: the front matter is what ADE reads.
fn an_interrupted_journal() -> String {
    "---\nstatus: in-progress\nphase: moving\nfrom: v4\nto: v6\ndate: 2026-01-02\n---\n\n\
     # BMAD v4, archived on 2026-01-02\n\n\
     ADE moved this project's BMAD v4 files here when it switched the project to BMAD v6.\n\
     This folder is read-only history. Paths inside it mirror the project.\n\n\
     ## Moves\n\n\
     - `.ai/debug-log.md` → `.ade/archive/bmad-v4-2026-01-02/.ai/debug-log.md`: moving\n\
     - `.ade/stage` → `.ade/archive/bmad-v4-2026-01-02/.ade/stage`: pending\n"
        .to_string()
}

fn clean_up(dir: &Path, res: &Resources) {
    std::fs::remove_dir_all(dir).ok();
    std::fs::remove_dir_all(&res.v6).ok();
}

#[cfg(test)]
mod bmadswitch_e2e {
    use super::*;

    /// v4 → v6 on a project in git, with the person's own files in it.
    #[test]
    fn v4_to_v6_archives_v4_and_keeps_what_is_the_persons() {
        let res = resources("bmadswitch-e2e-v4-v6");
        let dir = a_v4_project("bmadswitch-e2e-v4-v6", &res);
        // A repository, as most projects are. A machine without git plans the
        // same moves and reports `dirty` as unknown.
        let _ = projectsetup::project_git_init(root_of(&dir));
        let before = listing(&dir);
        // Setup loaded the methodology from the CLAUDE.md that was there.
        assert_eq!(read(&dir, "CLAUDE.md"), format!("# shop\n\nUse pnpm, never npm.\n{IMPORT}"));

        let shown = plan(&dir, Methodology::V6, &[], &res);
        assert_eq!(shown.blocked, None);
        assert_eq!((shown.from.as_str(), shown.to.as_str()), ("v4", "v6"));
        // The version it leaves and the date; the date is not pinned, since midnight may pass.
        assert!(shown.archive.starts_with(".ade/archive/bmad-v4-20"), "{}", shown.archive);
        let v4s = [".bmad-core", ".claude/commands/BMad", ".ai/debug-log.md", ".ade/stage", ".ade/methodology"];
        assert_eq!(planned(&shown), set(v4s.iter().map(|path| path.to_string()).chain(role_paths())));
        assert_eq!(shown.leftovers, [], "the project holds nothing of v6");
        // The documents are offered, unticked. `docs` itself never is.
        let offered: Vec<(&str, bool)> = shown.documents.iter().map(|doc| (doc.path.as_str(), doc.ticked)).collect();
        assert_eq!(offered, [("docs/prd.md", false), ("docs/stories", false)]);
        assert_eq!(differences(&before, &listing(&dir)), Vec::<String>::new(), "a plan writes nothing");

        let result = apply(&dir, &shown, &res).unwrap();

        assert_archived(&before, &dir, &shown, &result, &[".ade/rules.md", ".claude/settings.json"]);
        // v4's own files are in the archive only.
        for gone in [".bmad-core", ".claude/commands/BMad", ".ai/debug-log.md", ".ade/stage"] {
            assert!(!at(&dir, gone).exists(), "{gone} is still in the project");
        }
        assert_eq!(read(&dir, &format!("{}/.ade/methodology", shown.archive)).trim(), "v4");
        // The two files a switch edits in place, as the guide says it does.
        assert!(result.rules_appended);
        assert_eq!(read(&dir, ".ade/rules.md"), format!("{OLD_RULES}\n{ARCHIVE_RULE}"));
        assert!(result.archive_denied);
        assert_settings_gained_the_deny_rule(&dir, before[".claude/settings.json"].as_deref().unwrap());
        // And v6 is set up fresh.
        assert_is_v6(&dir, &res);
        assert!(result.setup.bmadv6_files > 0);
        assert_eq!(result.setup.agents, ROLES.len());
        assert!(!result.setup.appended_import, "CLAUDE.md already loads the methodology");

        clean_up(&dir, &res);
    }

    /// v6 → v4, with a ticket in the output folder, a gate and an approval.
    #[test]
    fn v6_to_v4_archives_v6_with_its_output_folder() {
        let res = resources("bmadswitch-e2e-v6-v4");
        let dir = a_v6_project("bmadswitch-e2e-v6-v4", &res);
        // Rules that carry the archive section already, with a rule of the person's after it.
        let edited = format!("{}\n## 5. Ours\nAsk before touching the billing module.\n", rules());
        write(&dir, ".ade/rules.md", &edited);
        let before = listing(&dir);

        let shown = plan(&dir, Methodology::V4, &[], &res);
        assert_eq!(shown.blocked, None);
        assert_eq!((shown.from.as_str(), shown.to.as_str()), ("v6", "v4"));
        // The version it leaves and the date; the date is not pinned, since midnight may pass.
        assert!(shown.archive.starts_with(".ade/archive/bmad-v6-20"), "{}", shown.archive);
        let v6s = ["_bmad", "_bmad-output", ".ade/approvals", ".ade/gates", ".ade/methodology"];
        assert_eq!(planned(&shown), set(v6s.iter().map(|path| path.to_string()).chain(skill_paths(&res)).chain(role_paths())));
        assert_eq!(shown.leftovers, []);
        assert_eq!(shown.documents, [], "the output folder holds no documents, so it moves and nothing is offered");

        let result = apply(&dir, &shown, &res).unwrap();

        assert_archived(&before, &dir, &shown, &result, &[".claude/settings.json"]);
        assert_eq!(read(&dir, &format!("{}/_bmad-output/backlog/1.1.md", shown.archive)), "# 1.1 Cart\n\nstatus: ready\n");
        for gone in ["_bmad", "_bmad-output", ".ade/approvals", ".ade/gates", ".claude/skills/bmad"] {
            assert!(!at(&dir, gone).exists(), "{gone} is still in the project");
        }
        // The person's skill is the only one left.
        let skills: Vec<String> = std::fs::read_dir(at(&dir, ".claude/skills")).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(skills, ["changelog"]);
        assert!(!result.rules_appended, "the rules had the archive section");
        assert_eq!(read(&dir, ".ade/rules.md"), edited);
        assert!(result.archive_denied);
        assert_settings_gained_the_deny_rule(&dir, before[".claude/settings.json"].as_deref().unwrap());
        assert_is_v4(&dir, &res);
        assert!(result.setup.bmad_files > 0);

        clean_up(&dir, &res);
    }

    /// The guide: leaving v6, an output folder that is `docs` is offered, and
    /// stays unless it is ticked.
    #[test]
    fn v6_to_v4_leaves_an_output_folder_that_is_docs() {
        let res = resources("bmadswitch-e2e-v6-docs");
        let dir = a_v6_project("bmadswitch-e2e-v6-docs", &res);
        // The team's layer of the v6 config puts the output in `docs`.
        write(&dir, "_bmad/custom/config.toml", "[core]\noutput_folder = \"{project-root}/docs\"\n");
        write(&dir, "docs/backlog/1.2.md", "# 1.2 Checkout\n");
        let before = listing(&dir);

        let shown = plan(&dir, Methodology::V4, &[], &res);
        assert_eq!(shown.blocked, None);
        let offered: Vec<(&str, bool)> = shown.documents.iter().map(|doc| (doc.path.as_str(), doc.ticked)).collect();
        assert_eq!(offered, [("docs", false)]);
        assert!(shown.documents[0].warning.as_deref().is_some_and(|w| w.contains("docs/prd.md")), "{:?}", shown.documents[0].warning);
        assert!(!planned(&shown).iter().any(|path| path == "docs" || path.starts_with("docs/")), "{:?}", planned(&shown));

        let result = apply(&dir, &shown, &res).unwrap();

        // `docs` is not among the moves, so this holds it to its bytes.
        assert_archived(&before, &dir, &shown, &result, &[".ade/rules.md", ".claude/settings.json"]);
        assert_eq!(read(&dir, "docs/backlog/1.2.md"), "# 1.2 Checkout\n");
        assert_eq!(read(&dir, "docs/prd.md"), OWN[5].1);
        assert!(!at(&dir, &format!("{}/docs", shown.archive)).exists());
        assert_is_v4(&dir, &res);

        clean_up(&dir, &res);
    }

    /// v4 → v6 → v4 on one project: two archives, nothing of the person's
    /// lost, and a working v4 project at the end.
    #[test]
    fn there_and_back_keeps_two_archives_and_ends_on_v4() {
        let res = resources("bmadswitch-e2e-back");
        let dir = a_v4_project("bmadswitch-e2e-back", &res);
        let start = listing(&dir);

        let (first, went) = switch(&dir, Methodology::V6, &res);
        assert_archived(&start, &dir, &first, &went, &[".ade/rules.md", ".claude/settings.json"]);
        assert_is_v6(&dir, &res);
        // v6 in use: a ticket, a gate and an approval.
        write(&dir, "_bmad-output/backlog/1.1.md", "# 1.1 Cart\n");
        write(&dir, ".ade/gates/1.1.yml", "gate: PASS\n");
        write(&dir, ".ade/approvals/1.1.md", "approved\n");
        let middle = listing(&dir);

        let (second, came) = switch(&dir, Methodology::V4, &res);
        // The first archive is in `middle`, and no move takes it: it is held to its bytes too.
        assert_archived(&middle, &dir, &second, &came, &[]);
        assert_is_v4(&dir, &res);

        assert!(first.archive.starts_with(".ade/archive/bmad-v4-"), "{}", first.archive);
        assert!(second.archive.starts_with(".ade/archive/bmad-v6-"), "{}", second.archive);
        let mut archives: Vec<String> =
            std::fs::read_dir(at(&dir, ".ade/archive")).unwrap().map(|e| format!(".ade/archive/{}", e.unwrap().file_name().to_string_lossy())).collect();
        archives.sort();
        assert_eq!(archives, [first.archive.clone(), second.archive.clone()]);
        // The v4 the person had is whole in the first archive, their edits to it included.
        let end = listing(&dir);
        for (path, was) in &start {
            if let Some(m) = first.moves.iter().find(|m| *path == m.from || path.starts_with(&format!("{}/", m.from))) {
                let archived = format!("{}{}", m.to, &path[m.from.len()..]);
                assert_eq!(end.get(&archived), Some(was), "{path} is not in the first archive as it was");
            }
        }
        // Nothing of the person's is lost. Two of their files were edited, once.
        for (path, content) in OWN {
            match path {
                ".ade/rules.md" => assert_eq!(read(&dir, path), format!("{OLD_RULES}\n{ARCHIVE_RULE}")),
                ".claude/settings.json" => assert_settings_gained_the_deny_rule(&dir, start[path].as_deref().unwrap()),
                "CLAUDE.md" => assert_eq!(read(&dir, path), format!("{content}{IMPORT}")),
                _ => assert_eq!(read(&dir, path), content, "{path}"),
            }
        }
        assert!(went.rules_appended && !came.rules_appended, "the archive section is added once");
        // Back on v4, there is nothing to switch to v4.
        let again = plan(&dir, Methodology::V4, &[], &res);
        assert_eq!(again.blocked.as_deref(), Some("This project is already on BMAD v4."));

        clean_up(&dir, &res);
    }

    /// The guide: "a second switch on the same day gets `-2` added".
    #[test]
    fn a_second_switch_from_the_same_version_gets_its_own_archive() {
        let res = resources("bmadswitch-e2e-twice");
        let dir = a_v4_project("bmadswitch-e2e-twice", &res);

        let (first, _) = switch(&dir, Methodology::V6, &res);
        switch(&dir, Methodology::V4, &res);
        let before = listing(&dir);
        let (third, result) = switch(&dir, Methodology::V6, &res);

        assert_ne!(third.archive, first.archive);
        // Unless midnight (UTC) passed between the two, the date is the same one.
        if third.archive.starts_with(&first.archive) {
            assert_eq!(third.archive, format!("{}-2", first.archive));
        }
        assert_archived(&before, &dir, &third, &result, &[]);
        assert_eq!(front(&read(&dir, &format!("{}/ARCHIVE.md", first.archive)), "status"), "complete");
        assert_is_v6(&dir, &res);

        clean_up(&dir, &res);
    }

    /// The dialog's *Archive this too*: the plan is asked for again with the
    /// ticked document, and that plan is the one applied.
    #[test]
    fn a_ticked_document_moves_and_an_unticked_one_stays() {
        let res = resources("bmadswitch-e2e-ticked");
        let dir = a_v4_project("bmadswitch-e2e-ticked", &res);
        let before = listing(&dir);

        let offered = plan(&dir, Methodology::V6, &[], &res);
        assert!(offered.documents.iter().any(|doc| doc.path == "docs/stories" && !doc.ticked));
        let shown = plan(&dir, Methodology::V6, &["docs/stories"], &res);
        assert_eq!(shown.blocked, None);
        let ticks: Vec<(&str, bool)> = shown.documents.iter().map(|doc| (doc.path.as_str(), doc.ticked)).collect();
        assert_eq!(ticks, [("docs/prd.md", false), ("docs/stories", true)]);
        assert!(planned(&shown).contains("docs/stories"));
        assert!(!planned(&shown).contains("docs/prd.md"));

        let result = apply(&dir, &shown, &res).unwrap();

        assert_archived(&before, &dir, &shown, &result, &[".ade/rules.md", ".claude/settings.json"]);
        assert!(!at(&dir, "docs/stories").exists(), "the ticked folder moved");
        assert_eq!(read(&dir, &format!("{}/docs/stories/1.1.story.md", shown.archive)), OWN[6].1);
        assert_eq!(read(&dir, "docs/prd.md"), OWN[5].1, "the unticked document stayed");
        assert!(!at(&dir, &format!("{}/docs/prd.md", shown.archive)).exists());

        clean_up(&dir, &res);
    }

    /// A real cause, on every OS: a file of the person's named `_bmad-output`,
    /// where v6's setup makes a folder. The plan neither refuses it nor moves
    /// it, so setup fails after every move was made and v6's skills, `_bmad/`
    /// and runtime were written.
    #[test]
    fn a_file_where_setup_needs_a_folder_puts_everything_back() {
        let res = resources("bmadswitch-e2e-file");
        let dir = a_v4_project("bmadswitch-e2e-file", &res);
        write(&dir, "_bmad-output", "notes I keep here\n");
        let before = listing(&dir);

        let shown = plan(&dir, Methodology::V6, &[], &res);
        assert_eq!(shown.blocked, None);
        assert!(!planned(&shown).contains("_bmad-output"));
        let error = apply(&dir, &shown, &res).unwrap_err();

        assert!(error.contains("_bmad-output"), "{error}");
        assert_put_back(&before, &dir, &error);
        assert_is_v4(&dir, &res);

        clean_up(&dir, &res);
    }

    /// A real cause on Unix: the person's `.claude/commands` can't be written,
    /// and v4's setup puts `BMad/` in it after `.bmad-core/` was copied.
    #[cfg(unix)]
    #[test]
    fn a_read_only_folder_where_setup_must_write_puts_everything_back() {
        use std::os::unix::fs::PermissionsExt;
        let res = resources("bmadswitch-e2e-readonly");
        let dir = a_v6_project("bmadswitch-e2e-readonly", &res);
        write(&dir, ".claude/commands/deploy.md", "Deploy to staging.\n");
        let commands = at(&dir, ".claude/commands");
        let lock = |mode: u32| std::fs::set_permissions(&commands, std::fs::Permissions::from_mode(mode)).unwrap();
        lock(0o555);
        // Root writes into a read-only folder: there is no failure to arrange.
        if std::fs::write(commands.join("probe"), "").is_ok() {
            lock(0o755);
            clean_up(&dir, &res);
            return;
        }
        let before = listing(&dir);

        let shown = plan(&dir, Methodology::V4, &[], &res);
        assert_eq!(shown.blocked, None);
        let outcome = apply(&dir, &shown, &res);
        // Before any assertion: a folder left read-only can't be cleaned up.
        lock(0o755);
        let error = outcome.unwrap_err();

        assert!(error.contains("BMad"), "{error}");
        assert_put_back(&before, &dir, &error);
        assert_is_v6(&dir, &res);

        clean_up(&dir, &res);
    }

    /// The guide: a config that points a moved path at the person's own
    /// agents is refused, and the reason names the path. Apply refuses the
    /// plan too, and says the same.
    #[test]
    fn apply_refuses_a_blocked_plan_and_touches_nothing() {
        let res = resources("bmadswitch-e2e-blocked");
        let dir = a_v4_project("bmadswitch-e2e-blocked", &res);
        let config = read(&dir, ".bmad-core/core-config.yaml");
        assert!(config.contains("devDebugLog: .ai/debug-log.md"), "{config}");
        write(&dir, ".bmad-core/core-config.yaml", &config.replace("devDebugLog: .ai/debug-log.md", "devDebugLog: .claude/agents"));
        let before = listing(&dir);

        let shown = plan(&dir, Methodology::V6, &[], &res);
        let why = shown.blocked.clone().expect("the plan is blocked");
        assert!(why.contains(".claude/agents") && why.contains("your own agents"), "{why}");
        assert_eq!(apply(&dir, &shown, &res).unwrap_err(), why);
        // Nor does it take the webview's word that the plan is clear.
        let mut cleared = shown.clone();
        cleared.blocked = None;
        assert_eq!(apply(&dir, &cleared, &res).unwrap_err(), why);

        assert_put_back(&before, &dir, &why);

        clean_up(&dir, &res);
    }

    /// Nothing moves that the person didn't see: a path that appeared after
    /// the plan was shown sends them back to the dialog.
    #[test]
    fn apply_refuses_a_plan_the_project_has_outgrown() {
        let res = resources("bmadswitch-e2e-outgrown");
        let dir = temp("bmadswitch-e2e-outgrown");
        set_up(&dir, Methodology::V4, &res);
        let shown = plan(&dir, Methodology::V6, &[], &res);
        assert_eq!(shown.blocked, None);
        // An agent writes the debug log while the dialog is open.
        write(&dir, ".ai/debug-log.md", "# Debug log\n");
        let before = listing(&dir);

        let error = apply(&dir, &shown, &res).unwrap_err();

        assert_eq!(error, "The project changed since this was shown. Review the switch again.");
        assert_put_back(&before, &dir, &error);

        clean_up(&dir, &res);
    }

    /// A switch that was cut short blocks the project until its journal is
    /// resolved by hand, which the guide does by setting `status: abandoned`.
    ///
    /// Setup's own refusal is the frontend's (`askMethodology` in
    /// src/lib/methodologyPrompt.ts asks `bmad_switch_pending` and stops); the
    /// setup command has no check of its own. What is held here is the answer
    /// it stops on.
    #[test]
    fn a_pending_journal_blocks_the_plan_the_apply_and_what_setup_asks() {
        let res = resources("bmadswitch-e2e-pending");
        let dir = a_v4_project("bmadswitch-e2e-pending", &res);
        // A plan made while the project was clear, as a dialog left open would hold.
        let earlier = plan(&dir, Methodology::V6, &[], &res);
        assert_eq!(earlier.blocked, None);
        let archive = ".ade/archive/bmad-v4-2026-01-02";
        write(&dir, &format!("{archive}/ARCHIVE.md"), &an_interrupted_journal());
        let before = listing(&dir);

        let pending = bmadswitch::bmad_switch_pending(root_of(&dir));
        assert_eq!(pending.len(), 1, "{pending:?}");
        let found = &pending[0];
        assert_eq!(
            (found.archive.as_str(), found.status.as_str(), found.phase.as_str(), found.from.as_str(), found.to.as_str(), found.date.as_str()),
            (archive, "in-progress", "moving", "v4", "v6", "2026-01-02")
        );

        let why = format!("An earlier switch here didn't finish. See {archive}/ARCHIVE.md.");
        let shown = plan(&dir, Methodology::V6, &[], &res);
        assert_eq!(shown.blocked.as_deref(), Some(why.as_str()));
        assert_eq!(apply(&dir, &shown, &res).unwrap_err(), why);
        assert_eq!(apply(&dir, &earlier, &res).unwrap_err(), why, "a plan shown before the journal appeared is refused too");
        assert_eq!(differences(&before, &listing(&dir)), Vec::<String>::new());

        // Resolved by hand: the project switches again.
        write(&dir, &format!("{archive}/ARCHIVE.md"), &an_interrupted_journal().replace("status: in-progress", "status: abandoned"));
        assert_eq!(bmadswitch::bmad_switch_pending(root_of(&dir)), []);
        let (_, result) = switch(&dir, Methodology::V6, &res);
        assert_ne!(result.archive, archive);
        assert_is_v6(&dir, &res);

        clean_up(&dir, &res);
    }
}
