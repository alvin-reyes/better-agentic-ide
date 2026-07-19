# BMAD Integration + Claude Code Sub-Agent Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake BMAD-METHOD scaffolding + an in-app BMAD panel into new terminal projects, and add a live view of the sub-agents Claude Code spawns via its `Task` tool.

**Architecture:** Both features key off a terminal pane's working directory. Rust gains commands to detect/scaffold BMAD assets (bundled as a Tauri resource) and to tail the active Claude Code session transcript (`~/.claude/projects/<encoded-cwd>/<session>.jsonl`) incrementally, emitting sub-agent lifecycle events over a Tauri `Channel`. The frontend adds two Zustand stores and two panels styled after the existing `AgentDashboard`, plus a non-blocking "Initialize BMAD?" banner. Persona buttons inject prompts via the existing `write_pty` command.

**Tech Stack:** Tauri v2 (Rust) · React 19 + TypeScript · Zustand · Vitest (added here) · `cargo test`.

## Global Constraints

- BMAD only — WATED is out of scope.
- BMAD assets are bundled and version-pinned; runtime does no network/`npx`. Only the one-time vendoring step (Task 2) touches the network.
- Scaffolding is never silent: prompt-on-new-folder, dismissible, remembered per-path. Never offer for `$HOME` or when no `initialCwd`.
- Sub-agent detection is transcript-tailing only — no Claude Code hooks, no PTY scraping.
- Sub-agent tracking is Claude Code only (no other providers).
- Scaffolding is idempotent and never overwrites user-modified files without reporting.
- PTY injection uses the existing `invoke("write_pty", { id, data })` path.
- CC project-dir encoding: replace `/` and `.` in the absolute cwd with `-`.
- Tauri app identifier: `com.betterterminal.dev`. Rust commands registered in `src-tauri/src/lib.rs` `invoke_handler![]`; managed state via `.manage(...)`.

---

### Task 0: Test infrastructure (frontend Vitest + Rust cargo test)

No test runner exists yet. Establish both so later tasks are TDD.

**Files:**
- Modify: `package.json` (add devDeps + `test` script)
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/sanity.test.ts`
- Create: `src-tauri/src/subagent.rs` (empty module stub with one test, wired in Task 5; here just prove `cargo test` runs)

**Interfaces:**
- Produces: `npm test` (vitest run) and `cargo test` (in `src-tauri/`) both green.

- [ ] **Step 1: Add Vitest deps and script**

In `package.json`, add to `devDependencies`:

```json
"vitest": "^2.1.0",
"@testing-library/react": "^16.0.0",
"@testing-library/jest-dom": "^6.4.0",
"jsdom": "^25.0.0"
```

Add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Write a sanity test**

`src/lib/__tests__/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test infra", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Install and run frontend tests**

Run: `npm install && npm test`
Expected: PASS (1 test).

- [ ] **Step 5: Prove `cargo test` runs**

Create `src-tauri/src/subagent.rs`:

```rust
// Sub-agent transcript parsing — filled in by later tasks.

#[cfg(test)]
mod tests {
    #[test]
    fn cargo_test_runs() {
        assert_eq!(2 + 2, 4);
    }
}
```

Add `mod subagent;` near the other `mod` declarations at the top of `src-tauri/src/lib.rs`.

Run: `cd src-tauri && cargo test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/__tests__/sanity.test.ts src-tauri/src/subagent.rs src-tauri/src/lib.rs
git commit -m "chore: add vitest + cargo test infrastructure"
```

---

### Task 1: CC project-path encoding (Rust, pure fn)

The linchpin for sub-agent views: turn a cwd into its `~/.claude/projects/<encoded>` dir.

**Files:**
- Modify: `src-tauri/src/subagent.rs`

**Interfaces:**
- Produces: `pub fn encode_project_dir(cwd: &str) -> String` — replaces every `/` and `.` with `-`.
- Produces: `pub fn claude_project_path(home: &Path, cwd: &str) -> PathBuf` — `home/.claude/projects/<encoded>`.

- [ ] **Step 1: Write failing tests**

In `src-tauri/src/subagent.rs`, replace the `tests` module with:

```rust
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_plain_path() {
        assert_eq!(
            encode_project_dir("/Users/alvin-reyes/Project/caiden-web"),
            "-Users-alvin-reyes-Project-caiden-web"
        );
    }

    #[test]
    fn encodes_dotted_path() {
        assert_eq!(
            encode_project_dir("/Users/alvin-reyes/.claude-mem/x"),
            "-Users-alvin-reyes--claude-mem-x"
        );
    }

    #[test]
    fn builds_full_project_path() {
        let p = claude_project_path(Path::new("/home/u"), "/a/b");
        assert_eq!(p, PathBuf::from("/home/u/.claude/projects/-a-b"));
    }
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd src-tauri && cargo test subagent`
Expected: FAIL (functions not found).

- [ ] **Step 3: Implement**

Add above the `tests` module:

```rust
pub fn encode_project_dir(cwd: &str) -> String {
    cwd.chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

pub fn claude_project_path(home: &Path, cwd: &str) -> PathBuf {
    home.join(".claude")
        .join("projects")
        .join(encode_project_dir(cwd))
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd src-tauri && cargo test subagent`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/subagent.rs
git commit -m "feat: encode cwd to Claude Code project dir"
```

---

### Task 2: Vendor pinned BMAD assets as a Tauri resource

One-time vendoring + resource registration. Network is used here only.

**Files:**
- Create: `src-tauri/resources/bmad/` (vendored tree)
- Create: `src-tauri/resources/bmad/VERSION`
- Modify: `src-tauri/tauri.conf.json` (`bundle.resources`)
- Create: `docs/bmad-vendoring.md`

**Interfaces:**
- Produces: a bundled asset tree resolvable at runtime via Tauri's resource resolver under `resources/bmad/`.

- [ ] **Step 1: Vendor pinned BMAD v4.44.3 + generate Claude Code commands**

Pin to BMAD-METHOD tag `v4.44.3` (the last v4 release; v5+/v6 dropped the static
`bmad-core/` bundle model). The raw repo does NOT contain `.claude/commands/BMad/` —
the installer generates it. Replicate that generation here so scaffolding ships
ready-to-use command files and needs no `npx` at runtime.

The generation rule (from the v4 installer `tools/installer/lib/ide-setup.js`):
for each `bmad-core/agents/<id>.md` (and `bmad-core/tasks/<id>.md`), write
`.claude/commands/BMad/agents/<id>.md` (resp. `tasks/<id>.md`) whose content is:

```
# /<id> Command

When this command is used, adopt the following agent persona:

<agent file body, with every `{root}` replaced by `.bmad-core`>
```

Run once (requires network for the clone only):

```bash
mkdir -p src-tauri/resources/bmad
git clone --depth 1 --branch v4.44.3 https://github.com/bmad-code-org/BMAD-METHOD /tmp/bmad-src
cp -R /tmp/bmad-src/bmad-core src-tauri/resources/bmad/bmad-core

# Generate Claude Code command files (agents + tasks) the way the installer does.
gen() {           # $1 = subdir (agents|tasks), $2 = header verb
  local src="/tmp/bmad-src/bmad-core/$1"
  local out="src-tauri/resources/bmad/claude-commands/BMad/$1"
  mkdir -p "$out"
  for f in "$src"/*.md; do
    [ -e "$f" ] || continue
    local id; id="$(basename "$f" .md)"
    { printf '# /%s Command\n\n%s\n\n' "$id" "$2";
      sed 's|{root}|.bmad-core|g' "$f"; } > "$out/$id.md"
  done
}
gen agents "When this command is used, adopt the following agent persona:"
gen tasks  "When this command is used, execute the following task:"

echo "v4.44.3" > src-tauri/resources/bmad/VERSION
rm -rf /tmp/bmad-src
```

Verify the tree exists and commands were generated:

Run: `find src-tauri/resources/bmad -maxdepth 3 -type d | sort && ls src-tauri/resources/bmad/claude-commands/BMad/agents`
Expected: shows `bmad-core` (agents/templates/tasks/checklists/workflows) and
`claude-commands/BMad/agents` + `.../tasks`; the agents dir lists `analyst.md`,
`architect.md`, `dev.md`, `pm.md`, `po.md`, `qa.md`, `sm.md`, `ux-expert.md`,
`bmad-master.md`, `bmad-orchestrator.md`.

- [ ] **Step 2: Register the resource**

In `src-tauri/tauri.conf.json`, add to the `bundle` object:

```json
"resources": ["resources/bmad/**/*"]
```

- [ ] **Step 3: Document the process**

`docs/bmad-vendoring.md`:

```markdown
# Vendoring BMAD assets

ADE bundles a pinned copy of BMAD-METHOD under `src-tauri/resources/bmad/`.

- Pinned version: see `src-tauri/resources/bmad/VERSION`.
- To upgrade: re-run the clone+copy in Task 2 of the implementation plan
  with a new tag, update `VERSION`, and re-test scaffolding idempotency.
- Runtime never fetches BMAD; only this manual step touches the network.
```

- [ ] **Step 4: Verify the app still builds with the resource**

Run: `cd src-tauri && cargo build`
Expected: builds; no resource errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/resources/bmad src-tauri/tauri.conf.json docs/bmad-vendoring.md
git commit -m "feat: vendor pinned BMAD assets as bundled resource"
```

---

### Task 3: `bmad_status` command (Rust)

**Files:**
- Create: `src-tauri/src/bmad.rs`
- Modify: `src-tauri/src/lib.rs` (`mod bmad;`, register command)

**Interfaces:**
- Produces: `#[tauri::command] fn bmad_status(path: String) -> BmadStatus`
  where `BmadStatus { installed: bool, version: Option<String> }` (Serialize).
- Produces: `pub fn read_status(project: &Path) -> BmadStatus` (pure; testable).

- [ ] **Step 1: Write failing test**

`src-tauri/src/bmad.rs`:

```rust
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BmadStatus {
    pub installed: bool,
    pub version: Option<String>,
}

pub fn read_status(project: &Path) -> BmadStatus {
    let core = project.join(".bmad-core");
    if !core.is_dir() {
        return BmadStatus { installed: false, version: None };
    }
    let version = std::fs::read_to_string(core.join("VERSION"))
        .ok()
        .map(|s| s.trim().to_string());
    BmadStatus { installed: true, version }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_when_no_core() {
        let dir = std::env::temp_dir().join("ade_bmad_absent");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_status(&dir), BmadStatus { installed: false, version: None });
    }

    #[test]
    fn present_with_version() {
        let dir = std::env::temp_dir().join("ade_bmad_present");
        let core = dir.join(".bmad-core");
        std::fs::create_dir_all(&core).unwrap();
        std::fs::write(core.join("VERSION"), "v4.1\n").unwrap();
        assert_eq!(
            read_status(&dir),
            BmadStatus { installed: true, version: Some("v4.1".to_string()) }
        );
    }
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd src-tauri && cargo test bmad`
Expected: FAIL (module not declared).

- [ ] **Step 3: Wire the module + command**

In `src-tauri/src/lib.rs`, add `mod bmad;` near the top. Append the command wrapper to `src-tauri/src/bmad.rs`, above `tests`:

```rust
#[tauri::command]
pub fn bmad_status(path: String) -> BmadStatus {
    read_status(Path::new(&path))
}
```

Add `bmad::bmad_status,` to the `invoke_handler![]` list in `lib.rs`.

- [ ] **Step 4: Run tests, verify pass**

Run: `cd src-tauri && cargo test bmad`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bmad.rs src-tauri/src/lib.rs
git commit -m "feat: bmad_status command to detect .bmad-core"
```

---

### Task 4: `scaffold_bmad` command (Rust, idempotent)

**Files:**
- Modify: `src-tauri/src/bmad.rs`
- Modify: `src-tauri/src/lib.rs` (register command)

**Interfaces:**
- Consumes: bundled resource dir (resolved by the command via `AppHandle::path().resolve("resources/bmad", Resource)`).
- Produces: `#[tauri::command] fn scaffold_bmad(app, path: String) -> Result<ScaffoldReport, String>`.
- Produces: `pub fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport)` — copies recursively, records `created` vs `skipped` (existing files), never overwrites.
- Produces: `ScaffoldReport { created: Vec<String>, skipped: Vec<String> }` (Serialize).

- [ ] **Step 1: Write failing test for idempotent copy**

Add to `src-tauri/src/bmad.rs` (inside `tests`):

```rust
#[test]
fn copy_tree_is_idempotent() {
    let base = std::env::temp_dir().join("ade_bmad_copy");
    let _ = std::fs::remove_dir_all(&base);
    let src = base.join("src");
    let dst = base.join("dst");
    std::fs::create_dir_all(src.join("a")).unwrap();
    std::fs::write(src.join("a/f.txt"), "hi").unwrap();

    let mut r1 = ScaffoldReport::default();
    copy_tree(&src, &dst, &mut r1);
    assert_eq!(r1.created.len(), 1);
    assert!(dst.join("a/f.txt").is_file());

    // Second run: file already exists -> skipped, not overwritten.
    std::fs::write(dst.join("a/f.txt"), "user-edit").unwrap();
    let mut r2 = ScaffoldReport::default();
    copy_tree(&src, &dst, &mut r2);
    assert_eq!(r2.created.len(), 0);
    assert_eq!(r2.skipped.len(), 1);
    assert_eq!(std::fs::read_to_string(dst.join("a/f.txt")).unwrap(), "user-edit");
}
```

Add near the top of `bmad.rs`:

```rust
#[derive(Serialize, Clone, Debug, Default)]
pub struct ScaffoldReport {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
}
```

- [ ] **Step 2: Run test, verify fail**

Run: `cd src-tauri && cargo test copy_tree_is_idempotent`
Expected: FAIL (`copy_tree` not found).

- [ ] **Step 3: Implement `copy_tree`**

```rust
pub fn copy_tree(src: &Path, dst: &Path, report: &mut ScaffoldReport) {
    if src.is_dir() {
        let _ = std::fs::create_dir_all(dst);
        if let Ok(entries) = std::fs::read_dir(src) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                copy_tree(&entry.path(), &dst.join(&name), report);
            }
        }
    } else if src.is_file() {
        if dst.exists() {
            report.skipped.push(dst.to_string_lossy().to_string());
        } else {
            if let Some(parent) = dst.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::copy(src, dst).is_ok() {
                report.created.push(dst.to_string_lossy().to_string());
            }
        }
    }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd src-tauri && cargo test copy_tree_is_idempotent`
Expected: PASS.

- [ ] **Step 5: Implement the command using the bundled resource**

Add to `bmad.rs`:

```rust
use tauri::Manager;

#[tauri::command]
pub fn scaffold_bmad(app: tauri::AppHandle, path: String) -> Result<ScaffoldReport, String> {
    let project = Path::new(&path);
    if !project.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let res_root = app
        .path()
        .resolve("resources/bmad", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resource not found: {}", e))?;

    let mut report = ScaffoldReport::default();
    // .bmad-core/
    copy_tree(&res_root.join("bmad-core"), &project.join(".bmad-core"), &mut report);
    // Claude Code commands
    let cmd_src = res_root.join("claude-commands").join("BMad");
    if cmd_src.is_dir() {
        copy_tree(&cmd_src, &project.join(".claude").join("commands").join("BMad"), &mut report);
    }
    // Write VERSION marker into .bmad-core for bmad_status.
    if let Ok(v) = std::fs::read_to_string(res_root.join("VERSION")) {
        let marker = project.join(".bmad-core").join("VERSION");
        if !marker.exists() {
            let _ = std::fs::write(&marker, v);
        }
    }
    Ok(report)
}
```

Register `bmad::scaffold_bmad,` in the `invoke_handler![]` list in `lib.rs`.

- [ ] **Step 6: Verify build + tests**

Run: `cd src-tauri && cargo test bmad && cargo build`
Expected: tests PASS, build OK.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/bmad.rs src-tauri/src/lib.rs
git commit -m "feat: scaffold_bmad copies bundled BMAD assets idempotently"
```

---

### Task 5: Transcript line parser (Rust, pure fn)

Parse one JSONL line into an optional sub-agent event.

**Files:**
- Modify: `src-tauri/src/subagent.rs`

**Interfaces:**
- Produces: `pub enum SubagentEvent { Spawn { id, agent_type, description }, Complete { id } }` (Serialize, `#[serde(tag="kind")]`).
- Produces: `pub fn parse_line(line: &str) -> Vec<SubagentEvent>` — extracts `Task` `tool_use` blocks (spawn) and `tool_result` blocks (complete) from a transcript line; ignores everything else and malformed JSON.

- [ ] **Step 1: Write failing tests with real shapes**

Add to `src-tauri/src/subagent.rs`:

```rust
use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind")]
pub enum SubagentEvent {
    Spawn { id: String, agent_type: String, description: String },
    Complete { id: String },
}
```

In its `tests` module add:

```rust
#[test]
fn parses_task_spawn() {
    let line = r#"{"message":{"role":"assistant","content":[
      {"type":"text","text":"ok"},
      {"type":"tool_use","id":"toolu_1","name":"Task",
       "input":{"description":"Find footer","prompt":"...","subagent_type":"Explore"}}
    ]}}"#;
    assert_eq!(
        parse_line(line),
        vec![SubagentEvent::Spawn {
            id: "toolu_1".into(),
            agent_type: "Explore".into(),
            description: "Find footer".into(),
        }]
    );
}

#[test]
fn parses_tool_result_complete() {
    let line = r#"{"message":{"role":"user","content":[
      {"type":"tool_result","tool_use_id":"toolu_1","content":"done"}
    ]}}"#;
    assert_eq!(parse_line(line), vec![SubagentEvent::Complete { id: "toolu_1".into() }]);
}

#[test]
fn ignores_non_task_tool_use() {
    let line = r#"{"message":{"content":[
      {"type":"tool_use","id":"x","name":"Bash","input":{"command":"ls"}}
    ]}}"#;
    assert_eq!(parse_line(line), Vec::<SubagentEvent>::new());
}

#[test]
fn ignores_malformed_line() {
    assert_eq!(parse_line("{not json"), Vec::<SubagentEvent>::new());
    assert_eq!(parse_line(""), Vec::<SubagentEvent>::new());
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd src-tauri && cargo test subagent`
Expected: FAIL (`parse_line` not found).

- [ ] **Step 3: Implement using `serde_json::Value`**

Confirm `serde_json` is a dependency:

Run: `grep serde_json src-tauri/Cargo.toml`
Expected: present (Tauri pulls it in; if absent, add `serde_json = "1"`).

Implement:

```rust
pub fn parse_line(line: &str) -> Vec<SubagentEvent> {
    let mut out = Vec::new();
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return out,
    };
    let content = match v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return out,
    };
    for block in content {
        let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match btype {
            "tool_use" if block.get("name").and_then(|n| n.as_str()) == Some("Task") => {
                let id = block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                let input = block.get("input");
                let agent_type = input
                    .and_then(|i| i.get("subagent_type"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let description = input
                    .and_then(|i| i.get("description"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                if !id.is_empty() {
                    out.push(SubagentEvent::Spawn { id, agent_type, description });
                }
            }
            "tool_result" => {
                if let Some(id) = block.get("tool_use_id").and_then(|i| i.as_str()) {
                    out.push(SubagentEvent::Complete { id: id.to_string() });
                }
            }
            _ => {}
        }
    }
    out
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd src-tauri && cargo test subagent`
Expected: PASS (all subagent tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/subagent.rs src-tauri/Cargo.toml
git commit -m "feat: parse Claude Code transcript lines into sub-agent events"
```

---

### Task 6: Transcript tailer command (Rust, incremental)

Watch the active session transcript and stream `SubagentEvent`s over a `Channel`.

**Files:**
- Modify: `src-tauri/src/subagent.rs`
- Modify: `src-tauri/src/lib.rs` (register command + manage state)

**Interfaces:**
- Consumes: `encode_project_dir`/`claude_project_path` (Task 1), `parse_line` (Task 5).
- Produces: `pub fn newest_transcript(project_dir: &Path) -> Option<PathBuf>` — newest `*.jsonl` by mtime.
- Produces: `#[tauri::command] fn watch_subagents(state, cwd: String, on_event: Channel<SubagentEvent>) -> Result<u32, String>` and `fn unwatch_subagents(state, id: u32)`.
- Produces: `pub struct SubagentWatcherManager` (managed state, mirrors `WatcherManager`).

- [ ] **Step 1: Write failing test for `newest_transcript`**

Add to `subagent.rs` tests:

```rust
#[test]
fn picks_newest_jsonl() {
    let dir = std::env::temp_dir().join("ade_tx_newest");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("old.jsonl"), "{}").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    std::fs::write(dir.join("new.jsonl"), "{}").unwrap();
    let picked = newest_transcript(&dir).unwrap();
    assert_eq!(picked.file_name().unwrap(), "new.jsonl");
}

#[test]
fn none_when_empty() {
    let dir = std::env::temp_dir().join("ade_tx_empty");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    assert!(newest_transcript(&dir).is_none());
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd src-tauri && cargo test subagent`
Expected: FAIL (`newest_transcript` not found).

- [ ] **Step 3: Implement `newest_transcript`**

```rust
pub fn newest_transcript(project_dir: &Path) -> Option<PathBuf> {
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(project_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let mtime = entry.metadata().and_then(|m| m.modified()).ok()?;
        if newest.as_ref().map_or(true, |(t, _)| mtime > *t) {
            newest = Some((mtime, path));
        }
    }
    newest.map(|(_, p)| p)
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd src-tauri && cargo test subagent`
Expected: PASS.

- [ ] **Step 5: Implement the watcher command**

Model state after `WatcherManager` in `watcher.rs`. Add to `subagent.rs`:

```rust
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::sync::{Arc, Mutex};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::ipc::Channel;

pub struct SubagentWatcherManager {
    watchers: Arc<Mutex<HashMap<u32, RecommendedWatcher>>>,
    next_id: Arc<Mutex<u32>>,
}

impl SubagentWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
        }
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

#[tauri::command]
pub fn watch_subagents(
    state: tauri::State<'_, SubagentWatcherManager>,
    cwd: String,
    on_event: Channel<SubagentEvent>,
) -> Result<u32, String> {
    let home = home_dir().ok_or("no HOME")?;
    let project_dir = claude_project_path(&home, &cwd);
    // Emit events already present, then tail appends.
    let mut offset: u64 = 0;
    if let Some(path) = newest_transcript(&project_dir) {
        offset = emit_from_offset(&path, 0, &on_event);
    }
    let watch_dir = project_dir.clone();
    let channel = on_event.clone();
    let cursor = Arc::new(Mutex::new(offset));

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    if let Some(path) = newest_transcript(&watch_dir) {
                        let mut cur = cursor.lock().unwrap();
                        *cur = emit_from_offset(&path, *cur, &channel);
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    // Directory may not exist yet; create so the watch succeeds and future sessions appear.
    let _ = std::fs::create_dir_all(&project_dir);
    watcher
        .watch(&project_dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    let id = {
        let mut next = state.next_id.lock().unwrap();
        let id = *next;
        *next += 1;
        id
    };
    state.watchers.lock().unwrap().insert(id, watcher);
    Ok(id)
}

#[tauri::command]
pub fn unwatch_subagents(state: tauri::State<'_, SubagentWatcherManager>, id: u32) {
    state.watchers.lock().unwrap().remove(&id);
}

fn emit_from_offset(path: &Path, from: u64, channel: &Channel<SubagentEvent>) -> u64 {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return from,
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    if len < from {
        // File truncated/rotated — restart from beginning.
        return emit_from_offset(path, 0, channel);
    }
    if file.seek(SeekFrom::Start(from)).is_err() {
        return from;
    }
    let mut buf = String::new();
    if file.read_to_string(&mut buf).is_err() {
        return from;
    }
    // Only consume complete lines; leave a trailing partial line for next append.
    let mut consumed = from;
    for line in buf.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break; // partial trailing line
        }
        for ev in parse_line(line.trim_end()) {
            let _ = channel.send(ev);
        }
        consumed += line.len() as u64;
    }
    consumed
}
```

Add `use std::path::{Path, PathBuf};` at the top if not already present (Task 1 added `Path, PathBuf`).

- [ ] **Step 6: Wire into `lib.rs`**

Add `.manage(subagent::SubagentWatcherManager::new())` next to the other `.manage(...)` calls, and add `subagent::watch_subagents,` and `subagent::unwatch_subagents,` to `invoke_handler![]`.

- [ ] **Step 7: Verify build + tests**

Run: `cd src-tauri && cargo test subagent && cargo build`
Expected: tests PASS, build OK.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/subagent.rs src-tauri/src/lib.rs
git commit -m "feat: tail Claude Code transcript and stream sub-agent events"
```

---

### Task 7: `subagentStore` (frontend Zustand)

**Files:**
- Create: `src/stores/subagentStore.ts`
- Create: `src/stores/__tests__/subagentStore.test.ts`

**Interfaces:**
- Consumes: `SubagentEvent` shape from Task 6 (`{ kind: "Spawn", id, agent_type, description } | { kind: "Complete", id }`).
- Produces: `Subagent { id, agentType, description, status: "running" | "completed" }`.
- Produces: `useSubagentStore` with `applyEvent(ev)`, `reset()`, `list: Subagent[]`.

- [ ] **Step 1: Write failing test**

`src/stores/__tests__/subagentStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useSubagentStore } from "../subagentStore";

describe("subagentStore", () => {
  beforeEach(() => useSubagentStore.getState().reset());

  it("adds a running sub-agent on Spawn", () => {
    useSubagentStore.getState().applyEvent({
      kind: "Spawn", id: "t1", agent_type: "Explore", description: "Find X",
    });
    const list = useSubagentStore.getState().list;
    expect(list).toEqual([
      { id: "t1", agentType: "Explore", description: "Find X", status: "running" },
    ]);
  });

  it("marks completed on Complete", () => {
    const s = useSubagentStore.getState();
    s.applyEvent({ kind: "Spawn", id: "t1", agent_type: "Explore", description: "Find X" });
    s.applyEvent({ kind: "Complete", id: "t1" });
    expect(useSubagentStore.getState().list[0].status).toBe("completed");
  });

  it("ignores Complete for unknown id", () => {
    useSubagentStore.getState().applyEvent({ kind: "Complete", id: "ghost" });
    expect(useSubagentStore.getState().list).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test -- subagentStore`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement store**

`src/stores/subagentStore.ts`:

```ts
import { create } from "zustand";

export type SubagentEvent =
  | { kind: "Spawn"; id: string; agent_type: string; description: string }
  | { kind: "Complete"; id: string };

export interface Subagent {
  id: string;
  agentType: string;
  description: string;
  status: "running" | "completed";
}

interface SubagentStore {
  list: Subagent[];
  applyEvent: (ev: SubagentEvent) => void;
  reset: () => void;
}

export const useSubagentStore = create<SubagentStore>((set) => ({
  list: [],
  applyEvent: (ev) =>
    set((state) => {
      if (ev.kind === "Spawn") {
        if (state.list.some((s) => s.id === ev.id)) return state;
        return {
          list: [
            ...state.list,
            { id: ev.id, agentType: ev.agent_type, description: ev.description, status: "running" as const },
          ],
        };
      }
      return {
        list: state.list.map((s) =>
          s.id === ev.id ? { ...s, status: "completed" as const } : s
        ),
      };
    }),
  reset: () => set({ list: [] }),
}));
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- subagentStore`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/subagentStore.ts src/stores/__tests__/subagentStore.test.ts
git commit -m "feat: subagentStore reducer for sub-agent lifecycle"
```

---

### Task 8: `SubagentPanel` component + wiring

**Files:**
- Create: `src/components/SubagentPanel.tsx`
- Modify: `src/App.tsx` (toggle + mount, mirroring how `AgentDashboard` is toggled)

**Interfaces:**
- Consumes: `useSubagentStore` (Task 7); `watch_subagents`/`unwatch_subagents` (Task 6); the active pane's `cwd` via `get_pty_cwd` (existing).
- Produces: `<SubagentPanel activeCwd={string | null} onClose={() => void} />`.

- [ ] **Step 1: Locate the AgentDashboard toggle pattern**

Run: `grep -n "AgentDashboard\|showAgentDashboard\|showDashboard" src/App.tsx`
Expected: shows the boolean state + conditional render to mirror.

- [ ] **Step 2: Implement the panel**

`src/components/SubagentPanel.tsx`:

```tsx
import { useEffect } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useSubagentStore, type SubagentEvent } from "../stores/subagentStore";

interface SubagentPanelProps {
  activeCwd: string | null;
  onClose: () => void;
}

export default function SubagentPanel({ activeCwd, onClose }: SubagentPanelProps) {
  const list = useSubagentStore((s) => s.list);
  const applyEvent = useSubagentStore((s) => s.applyEvent);
  const reset = useSubagentStore((s) => s.reset);

  useEffect(() => {
    if (!activeCwd) return;
    let watchId: number | null = null;
    let cancelled = false;
    reset();
    const channel = new Channel<SubagentEvent>();
    channel.onmessage = (ev) => applyEvent(ev);
    invoke<number>("watch_subagents", { cwd: activeCwd, onEvent: channel })
      .then((id) => { if (cancelled) { invoke("unwatch_subagents", { id }); } else { watchId = id; } })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watchId != null) invoke("unwatch_subagents", { id: watchId });
    };
  }, [activeCwd, applyEvent, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="subagent-panel">
      <div className="subagent-panel__header">
        <span>Sub-agents{activeCwd ? "" : " (no active terminal)"}</span>
        <button onClick={onClose}>✕</button>
      </div>
      {list.length === 0 ? (
        <div className="subagent-panel__empty">
          No sub-agents yet. They appear when Claude Code runs a Task.
        </div>
      ) : (
        <ul className="subagent-panel__list">
          {list.map((s) => (
            <li key={s.id} className={`subagent-row subagent-row--${s.status}`}>
              <span className="subagent-row__type">{s.agentType || "agent"}</span>
              <span className="subagent-row__desc">{s.description}</span>
              <span className="subagent-row__status">{s.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount + toggle in `App.tsx`**

Following the `AgentDashboard` pattern found in Step 1, add a `showSubagents` boolean state, resolve the active pane's cwd (reuse the same mechanism `AgentDashboard`/`get_pty_cwd` uses), and conditionally render `<SubagentPanel activeCwd={cwd} onClose={() => setShowSubagents(false)} />`. Add a toggle entry to `CommandPalette.tsx` ("Sub-agents: Toggle panel").

- [ ] **Step 4: Add minimal styles**

Append to `src/index.css` a `.subagent-panel` block matching the existing overlay/panel styling used by `AgentDashboard` (reuse the same background/border variables).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: `tsc` + vite build succeed (no type errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/SubagentPanel.tsx src/App.tsx src/components/CommandPalette.tsx src/index.css
git commit -m "feat: SubagentPanel live view of Claude Code Task sub-agents"
```

---

### Task 9: `bmadStore` + Initialize banner

**Files:**
- Create: `src/stores/bmadStore.ts`
- Create: `src/stores/__tests__/bmadStore.test.ts`
- Create: `src/components/BmadInitBanner.tsx`

**Interfaces:**
- Consumes: `bmad_status`/`scaffold_bmad` (Tasks 3–4).
- Produces: `useBmadStore` with `dismissedPaths: string[]`, `dismiss(path)`, `isDismissed(path)` — persisted to localStorage under `ade-bmad-dismissed`.
- Produces: `<BmadInitBanner cwd={string} onInitialized={() => void} />`.

- [ ] **Step 1: Write failing test for dismissal persistence**

`src/stores/__tests__/bmadStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useBmadStore } from "../bmadStore";

describe("bmadStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useBmadStore.setState({ dismissedPaths: [] });
  });

  it("records and reports dismissals", () => {
    useBmadStore.getState().dismiss("/proj/a");
    expect(useBmadStore.getState().isDismissed("/proj/a")).toBe(true);
    expect(useBmadStore.getState().isDismissed("/proj/b")).toBe(false);
  });

  it("persists dismissals to localStorage", () => {
    useBmadStore.getState().dismiss("/proj/a");
    expect(localStorage.getItem("ade-bmad-dismissed")).toContain("/proj/a");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test -- bmadStore`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement store**

`src/stores/bmadStore.ts`:

```ts
import { create } from "zustand";

const KEY = "ade-bmad-dismissed";

function load(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

interface BmadStore {
  dismissedPaths: string[];
  dismiss: (path: string) => void;
  isDismissed: (path: string) => boolean;
}

export const useBmadStore = create<BmadStore>((set, get) => ({
  dismissedPaths: load(),
  dismiss: (path) =>
    set((state) => {
      if (state.dismissedPaths.includes(path)) return state;
      const next = [...state.dismissedPaths, path];
      localStorage.setItem(KEY, JSON.stringify(next));
      return { dismissedPaths: next };
    }),
  isDismissed: (path) => get().dismissedPaths.includes(path),
}));
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- bmadStore`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the banner**

`src/components/BmadInitBanner.tsx`:

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useBmadStore } from "../stores/bmadStore";

interface BmadStatus { installed: boolean; version: string | null; }
interface Props { cwd: string; onInitialized: () => void; }

function isHome(path: string): boolean {
  // Never offer in the home directory.
  return path.replace(/\/+$/, "") === (import.meta.env.HOME ?? "").replace(/\/+$/, "")
    || /^\/Users\/[^/]+$|^\/home\/[^/]+$/.test(path.replace(/\/+$/, ""));
}

export default function BmadInitBanner({ cwd, onInitialized }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const dismiss = useBmadStore((s) => s.dismiss);
  const isDismissed = useBmadStore((s) => s.isDismissed);

  useEffect(() => {
    let active = true;
    if (!cwd || isHome(cwd) || isDismissed(cwd)) { setVisible(false); return; }
    invoke<BmadStatus>("bmad_status", { path: cwd })
      .then((st) => { if (active) setVisible(!st.installed); })
      .catch(() => { if (active) setVisible(false); });
    return () => { active = false; };
  }, [cwd, isDismissed]);

  if (!visible) return null;

  const init = async () => {
    setBusy(true);
    try {
      await invoke("scaffold_bmad", { path: cwd });
      setVisible(false);
      onInitialized();
    } finally { setBusy(false); }
  };

  return (
    <div className="bmad-banner">
      <span>Initialize BMAD in this project?</span>
      <div className="bmad-banner__actions">
        <button disabled={busy} onClick={init}>{busy ? "Initializing…" : "Initialize"}</button>
        <button disabled={busy} onClick={() => { dismiss(cwd); setVisible(false); }}>Dismiss</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build + tests**

Run: `npm test -- bmadStore && npm run build`
Expected: tests PASS, build OK.

- [ ] **Step 7: Commit**

```bash
git add src/stores/bmadStore.ts src/stores/__tests__/bmadStore.test.ts src/components/BmadInitBanner.tsx
git commit -m "feat: BMAD init banner + per-path dismissal store"
```

---

### Task 10: `BmadPanel` (personas + phases + injection) and wiring

**Files:**
- Create: `src/components/BmadPanel.tsx`
- Create: `src/data/bmadPersonas.ts`
- Modify: `src/App.tsx` (mount banner for active pane cwd + toggle panel)
- Modify: `src/components/CommandPalette.tsx` ("BMAD: Initialize", "BMAD: Toggle panel")
- Modify: `src/index.css` (banner + panel styles)

**Interfaces:**
- Consumes: `write_pty` (existing) with the active pane's `ptyId`; `bmad_status` (Task 3).
- Produces: `BmadPersona { id, title, command }[]` in `bmadPersonas.ts`.
- Produces: `<BmadPanel ptyId={number | null} cwd={string | null} onClose={() => void} />`.

- [ ] **Step 1: Define personas + activation commands**

`src/data/bmadPersonas.ts`. Claude Code namespaces a command file at
`.claude/commands/BMad/agents/<id>.md` as the slash-command `/BMad:agents:<id>`
(directory path joined with colons). These `<id>` values are the vendored agent
filenames confirmed in Task 2:

```ts
export interface BmadPersona {
  id: string;
  title: string;
  command: string; // typed into the terminal to activate the agent
}

export const BMAD_PERSONAS: BmadPersona[] = [
  { id: "analyst",    title: "Analyst",         command: "/BMad:agents:analyst" },
  { id: "pm",         title: "Product Manager", command: "/BMad:agents:pm" },
  { id: "ux-expert",  title: "UX Expert",       command: "/BMad:agents:ux-expert" },
  { id: "architect",  title: "Architect",       command: "/BMad:agents:architect" },
  { id: "po",         title: "Product Owner",   command: "/BMad:agents:po" },
  { id: "sm",         title: "Scrum Master",    command: "/BMad:agents:sm" },
  { id: "dev",        title: "Developer",       command: "/BMad:agents:dev" },
  { id: "qa",         title: "QA",              command: "/BMad:agents:qa" },
];

export const BMAD_PHASES = ["Planning", "Dev cycle"] as const;
```

> The `command` values must match the vendored files under
> `src-tauri/resources/bmad/claude-commands/BMad/agents/` (Task 2). If a filename
> differs, correct the `id`/`command` here — the vendored tree is the source of truth.

- [ ] **Step 2: Implement the panel**

`src/components/BmadPanel.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";
import { BMAD_PERSONAS, BMAD_PHASES } from "../data/bmadPersonas";

interface Props {
  ptyId: number | null;
  cwd: string | null;
  onClose: () => void;
}

export default function BmadPanel({ ptyId, onClose }: Props) {
  const launch = async (command: string) => {
    if (ptyId == null) return;
    await invoke("write_pty", { id: ptyId, data: command + "\n" }).catch(() => {});
  };

  return (
    <div className="bmad-panel">
      <div className="bmad-panel__header">
        <span>BMAD</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="bmad-panel__phases">
        {BMAD_PHASES.map((p) => (
          <span key={p} className="bmad-phase">{p}</span>
        ))}
      </div>
      <ul className="bmad-panel__personas">
        {BMAD_PERSONAS.map((persona) => (
          <li key={persona.id} className="bmad-persona">
            <span className="bmad-persona__title">{persona.title}</span>
            <button disabled={ptyId == null} onClick={() => launch(persona.command)}>
              Launch
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Wire banner + panel into `App.tsx`**

Mount `<BmadInitBanner cwd={activeCwd} onInitialized={...} />` where global overlays render (reuse the active-pane cwd resolved for Task 8). Add a `showBmad` toggle state and render `<BmadPanel ptyId={activePtyId} cwd={activeCwd} onClose={() => setShowBmad(false)} />`. Resolve `activePtyId` the same way `Scratchpad` resolves the active pane's `ptyId` for `write_pty` (grep `write_pty` in `Scratchpad.tsx` for the exact accessor).

- [ ] **Step 4: Add command-palette entries + styles**

In `CommandPalette.tsx` add entries invoking `scaffold_bmad` for the current cwd ("BMAD: Initialize in current project") and toggling the panel. Append `.bmad-banner`, `.bmad-panel` styles to `src/index.css` using the existing panel color variables.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/BmadPanel.tsx src/data/bmadPersonas.ts src/App.tsx src/components/CommandPalette.tsx src/index.css
git commit -m "feat: BMAD panel with persona prompt injection via write_pty"
```

---

### Task 11: End-to-end manual verification

**Files:** none (verification only). Uses `superpowers:verification-before-completion`.

- [ ] **Step 1: Full build**

Run: `npm run build && cd src-tauri && cargo build && cd ..`
Expected: both succeed.

- [ ] **Step 2: Run the app**

Run: `npm run tauri dev`
Expected: app launches.

- [ ] **Step 3: BMAD scaffolding**

Open a terminal in a fresh empty folder → confirm the "Initialize BMAD?" banner appears (and does NOT appear in `$HOME`). Click Initialize. Verify on disk:

Run: `ls -a <that folder> && ls <that folder>/.bmad-core && cat <that folder>/.bmad-core/VERSION`
Expected: `.bmad-core/` and `.claude/commands/BMad/` exist; VERSION matches the pinned tag. Re-open the folder → banner does NOT reappear (status shows installed).

- [ ] **Step 4: Persona injection**

Open the BMAD panel, click a persona's Launch → confirm the slash-command is typed into the active terminal.

- [ ] **Step 5: Sub-agent view**

In a terminal running Claude Code, trigger a `Task` sub-agent (e.g. ask it to dispatch an Explore agent). Open the Sub-agents panel → confirm the sub-agent appears as "running" and flips to "completed" when done.

- [ ] **Step 6: Final commit / branch ready**

```bash
git add -A && git commit -m "test: manual E2E verification notes for BMAD + sub-agent views" --allow-empty
```
