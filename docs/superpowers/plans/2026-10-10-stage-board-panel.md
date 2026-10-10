# Stage Board Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the existing v4/v6 board engines on screen as a live right-hand Board panel for the active pane's project, then add the human actions (approve, dispatch, stage advance).

**Architecture:** The engines (`buildBoard`, `buildBoardV6`) run in the webview over a Tauri-backed `Fs`. A zustand store rebuilds the board from disk (serialized, debounced, keeping the last good board), fed by `watch_directory` on the folders the engine reads plus window focus. A presentational `BoardView` renders `BoardState`; `BoardPanel` wires store, watchers and actions. Actions write single files: the v4 story status line, `.ade/approvals/<ref>` for v6, `.ade/stage` for the confirmed stage.

**Tech Stack:** React 19, zustand 5, Tauri 2 (Rust), vitest 2 + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-10-stage-board-panel-design.md` (addendum to `docs/superpowers/specs/2026-10-05-stage-board-design.md`).

## Global Constraints

- The files are the state: the store never holds board data that is not rebuilt from disk.
- Nothing is written in the background. Every write is one click: approve, dispatch, Next, Back, Track stage, Set up now.
- **Nothing below approved can be dispatched.** v4: `isDispatchable` (status ≥ `Approved`). v6: an approval file, or a status past `ready-for-dev`.
- `Done` is believed only with a PASS or WAIVED gate; otherwise **claimed** (existing `storyView` rule; do not restate it).
- `.ade/stage` is believed only when every stage before it is complete on the evidence; otherwise it renders as **claimed**.
- No generic delete or append command is exposed to the webview: `tauriFs.append` and `tauriFs.delete` throw `"<method> is not available in the board panel"`.
- Watch only the engine's folders, never the project root. Extensions: `md`, `yml`, `yaml`, `toml`. Debounce: 300 ms.
- v6 approvals live in `.ade/approvals/<ref>`, one line: the ISO date (`YYYY-MM-DD`) and `\n`.
- Stage file: `.ade/stage`, one line: a `StageId` and `\n`.
- Run `npm test` (vitest) and, for Rust tasks, `cargo test --manifest-path src-tauri/Cargo.toml`. `npx tsc --noEmit` must pass after every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A burst of file events while a rebuild is running** (an agent writing ten tickets): the store must run at most one rebuild at a time with at most one queued, and must never let an older build overwrite a newer one. Pinned in Task 9.
2. **Switching panes to another project mid-build**: a build for the old root must be discarded, not rendered under the new root. Pinned in Task 9.
3. **A v4 story whose Status section is `Draft` with CRLF endings or extra blank lines**: approve must change only that word and keep every other byte. Pinned in Task 8.
4. **A v6 ref that is not a safe file name** (the port falls back to a file name, which can contain `/`): approve must refuse rather than write outside `.ade/approvals/`. Pinned in Task 8.
5. **A dispatch task containing a newline** (a story title with a line break): the launch command must not submit early in the PTY. Pinned in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `src-tauri/src/lib.rs` (modify) | `path_exists`, `path_is_symlink` commands |
| `src/lib/tauriFs.ts` (create) | `Fs` over Tauri commands |
| `src/lib/agentCommand.ts` (modify) | `LaunchOptions.task` |
| `src/lib/agentLaunch.ts` (create) | role-file + command preparation shared by picker and board; `dispatchAgent` |
| `src/components/AgentPicker.tsx` (modify) | uses `prepareAgentLaunch` |
| `src/stores/stageBoardStore.ts` (modify) | `BoardState` optional `epics`, `problems`, `noInitiative`; export `STAGE_ORDER` |
| `src/lib/boardV6.ts` (modify) | fills the new fields; reads `.ade/approvals/` |
| `src/lib/loadBoard.ts` (create) | v4 input gathering + `loadBoard(root, methodology, fs)` |
| `src/lib/boardWatch.ts` (create) | `watchTargets` (pure) |
| `src/lib/confirmedStage.ts` (create) | `stageView` (pure) + stage file read/write |
| `src/lib/boardActions.ts` (create) | v4 approve rewrite, v6 approval write |
| `src/stores/boardPanelStore.ts` (create) | store: root, methodology, board, stage file, error; serialized debounced rebuild |
| `src/components/board/BoardView.tsx` (create) | presentational render of a board |
| `src/components/board/BoardPanel.tsx` (create) | container: store, watchers, focus, actions |
| `src/App.tsx`, `src/lib/shortcuts.ts`, `src/hooks/useKeybindings.ts`, `src/lib/shortcutList.ts`, `src/components/CommandPalette.tsx`, `src/index.css` (modify) | wiring; `BmadPanel` removed |
| `src/components/BmadPanel.tsx` (delete) | replaced |
| `docs/guide/agents.md`, `docs/guide/project-setup.md` (modify) | user docs |

---

### Task 1: `path_exists` and `path_is_symlink` Tauri commands

**Files:**
- Modify: `src-tauri/src/lib.rs` (add after `read_file`, ~line 362; register in `generate_handler!` ~line 399; tests in `mod tests` ~line 462)

**Interfaces:**
- Produces: Tauri commands `path_exists(path: String) -> bool` and `path_is_symlink(path: String) -> bool` (JS: `invoke<boolean>("path_exists", { path })`). Both expand `~` like `read_file`. `path_is_symlink` does not follow the link; a missing path is `false`.

- [ ] **Step 1: Write the failing tests** — append inside `mod tests` in `src-tauri/src/lib.rs`:

```rust
    #[test]
    fn path_exists_reports_files_and_directories_and_not_missing_paths() {
        use super::path_exists;
        let d = std::env::temp_dir().join(format!("ade_exists_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("f.md"), "x").unwrap();
        assert!(path_exists(d.to_string_lossy().into()));
        assert!(path_exists(d.join("f.md").to_string_lossy().into()));
        assert!(!path_exists(d.join("missing").to_string_lossy().into()));
    }

    #[cfg(unix)]
    #[test]
    fn path_is_symlink_does_not_follow_the_link() {
        use super::path_is_symlink;
        let d = std::env::temp_dir().join(format!("ade_symlink_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("real")).unwrap();
        std::os::unix::fs::symlink(d.join("real"), d.join("link")).unwrap();
        assert!(path_is_symlink(d.join("link").to_string_lossy().into()));
        assert!(!path_is_symlink(d.join("real").to_string_lossy().into()));
        assert!(!path_is_symlink(d.join("missing").to_string_lossy().into()));
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml path_`
Expected: compile error, `cannot find function path_exists`.

- [ ] **Step 3: Implement** — add after `read_file` in `src-tauri/src/lib.rs`:

```rust
/// Whether a path exists (file or directory). The board's `Fs` needs this to
/// tell "missing" from "unreadable"; read_file alone conflates the two.
#[tauri::command(async)]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&expand_home(&path)).exists()
}

/// Whether the path itself is a symbolic link, without following it. The
/// runtime's walks list a linked directory but never descend into it.
#[tauri::command(async)]
fn path_is_symlink(path: String) -> bool {
    std::fs::symlink_metadata(expand_home(&path))
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}
```

Register both in `tauri::generate_handler![...]` next to `read_file`:

```rust
            path_exists,
            path_is_symlink,
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml path_` then `npm test -- src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): path_exists and path_is_symlink for the board's Fs"
```

---

### Task 2: `tauriFs`, the `Fs` adapter

**Files:**
- Create: `src/lib/tauriFs.ts`
- Test: `src/lib/__tests__/tauriFs.test.ts`

**Interfaces:**
- Consumes: `Fs` from `src/lib/bmadRuntime/fs.ts`; commands `read_file {path}`, `write_text_file {path, content}`, `list_directory {path}` → `{ name: string; is_dir: boolean; ... }[]`, `create_directory {path}`, `path_exists {path}`, `path_is_symlink {path}` (Task 1).
- Produces: `export const tauriFs: Fs`.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/tauriFs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as [string, Record<string, unknown>][]);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    calls.push([cmd, args]);
    switch (cmd) {
      case "read_file": return "body";
      case "list_directory":
        return [
          { name: "a.md", path: "/p/a.md", is_dir: false, size: 1, extension: "md", is_hidden: false },
          { name: ".ade", path: "/p/.ade", is_dir: true, size: 0, extension: null, is_hidden: true },
        ];
      case "path_exists": return true;
      case "path_is_symlink": return false;
      case "create_directory": return args.path;
      case "write_text_file": return undefined;
      default: throw new Error(`unexpected ${cmd}`);
    }
  }),
}));

import { tauriFs } from "../tauriFs";

describe("tauriFs", () => {
  beforeEach(() => { calls.length = 0; });

  it("maps each read method to its command with the argument names Tauri binds", async () => {
    expect(await tauriFs.readText("/p/a.md")).toBe("body");
    expect(await tauriFs.exists("/p")).toBe(true);
    expect(await tauriFs.isSymlink("/p")).toBe(false);
    expect(calls).toEqual([
      ["read_file", { path: "/p/a.md" }],
      ["path_exists", { path: "/p" }],
      ["path_is_symlink", { path: "/p" }],
    ]);
  });

  it("lists names only, hidden entries included", async () => {
    expect(await tauriFs.list("/p")).toEqual(["a.md", ".ade"]);
  });

  it("writes with `content`, the name write_text_file takes", async () => {
    await tauriFs.writeText("/p/x.md", "hi");
    await tauriFs.mkdir("/p/d");
    expect(calls).toEqual([
      ["write_text_file", { path: "/p/x.md", content: "hi" }],
      ["create_directory", { path: "/p/d" }],
    ]);
  });

  it("refuses append and delete rather than exposing them to the webview", async () => {
    await expect(tauriFs.append("/p/x", "y")).rejects.toThrow("append is not available in the board panel");
    await expect(tauriFs.delete("/p/x")).rejects.toThrow("delete is not available in the board panel");
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/tauriFs.test.ts`
Expected: FAIL, cannot resolve `../tauriFs`.

- [ ] **Step 3: Implement** — `src/lib/tauriFs.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Fs } from "./bmadRuntime/fs";

/**
 * The runtime's `Fs` over Tauri commands, so the board engines run in the
 * webview unchanged.
 *
 * `append` and `delete` are refused rather than backed by commands: the panel
 * reads through the engines and writes whole files, and a generic delete in
 * the webview is a capability nothing here needs. An engine change that starts
 * calling them fails its tests instead of quietly gaining one.
 *
 * `list_directory` skips node_modules, .git, target and dist, none of which
 * hold anything the engines read.
 */
interface Entry {
  name: string;
}

const refused = (method: string) => async (): Promise<never> => {
  throw new Error(`${method} is not available in the board panel`);
};

export const tauriFs: Fs = {
  readText: (p) => invoke<string>("read_file", { path: p }),
  writeText: async (p, body) => {
    await invoke("write_text_file", { path: p, content: body });
  },
  list: async (p) => (await invoke<Entry[]>("list_directory", { path: p })).map((e) => e.name),
  exists: (p) => invoke<boolean>("path_exists", { path: p }),
  mkdir: async (p) => {
    await invoke("create_directory", { path: p });
  },
  isSymlink: (p) => invoke<boolean>("path_is_symlink", { path: p }),
  append: refused("append"),
  delete: refused("delete"),
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/tauriFs.test.ts src/lib/__tests__/tauriCommandContract.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauriFs.ts src/lib/__tests__/tauriFs.test.ts
git commit -m "feat(board): Tauri-backed Fs for running the board engines in the webview"
```

---

### Task 3: `LaunchOptions.task`

**Files:**
- Modify: `src/lib/agentCommand.ts` (`LaunchOptions` ~line 5; `claudeCommand` ~line 33; `case "ollama"` ~line 95)
- Test: `src/lib/__tests__/agentCommand.test.ts`

**Interfaces:**
- Produces: `LaunchOptions.task?: string`. claude and deepseek append it as a single-quoted positional prompt with every run of `\r`/`\n` collapsed to one space; ollama with a task returns `{ kind: "unsupported", reason }`; codex unchanged.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/__tests__/agentCommand.test.ts` (inside the file, as a new `describe`):

```ts
describe("buildLaunchCommand with a task", () => {
  it("passes the task to claude as its opening prompt, quoted", () => {
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "Implement story 1.2 (docs/stories/1.2.cart.md)" });
    expect(r).toEqual({
      kind: "command",
      command: "claude --append-system-prompt-file '/r/dev.md' 'Implement story 1.2 (docs/stories/1.2.cart.md)'",
    });
  });

  it("passes it to deepseek the same way, since that is claude underneath", () => {
    const r = buildLaunchCommand("deepseek", "/r/dev.md", { task: "go" });
    expect(r.kind === "command" && r.command.endsWith("--append-system-prompt-file '/r/dev.md' 'go'")).toBe(true);
  });

  it("quotes a task carrying a single quote so it cannot end the argument", () => {
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "Fix O'Brien's cart" });
    expect(r.kind === "command" && r.command.endsWith(`'Fix O'\\''Brien'\\''s cart'`)).toBe(true);
  });

  it("never puts a raw line break in the command, which would submit it early", () => {
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "line one\r\nline two\nthree" });
    expect(r.kind === "command" && r.command).not.toMatch(/[\r\n]/);
    expect(r.kind === "command" && r.command.endsWith("'line one line two three'")).toBe(true);
  });

  it("reports ollama as unable to take a task rather than running it one-shot", () => {
    const r = buildLaunchCommand("ollama", "/r/dev.Modelfile", { task: "go" });
    expect(r.kind).toBe("unsupported");
  });

  it("leaves the command unchanged without a task", () => {
    expect(buildLaunchCommand("claude", "/r/dev.md", {})).toEqual({
      kind: "command",
      command: "claude --append-system-prompt-file '/r/dev.md'",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/agentCommand.test.ts`
Expected: FAIL (`task` is not in `LaunchOptions`; the command lacks the prompt; ollama returns a command).

- [ ] **Step 3: Implement** — in `src/lib/agentCommand.ts`, add to `LaunchOptions`:

```ts
  /**
   * The agent's opening task, sent as its first prompt. Line breaks are
   * collapsed: a newline typed into the PTY would submit the command early.
   */
  task?: string;
```

Replace `claudeCommand`:

```ts
/** The claude invocation both the claude and deepseek providers launch. */
function claudeCommand(quotedPath: string, opts: LaunchOptions): string {
  const flags = opts.continuous ? " --dangerously-skip-permissions" : "";
  const task = opts.task ? ` ${shellQuote(opts.task.replace(/[\r\n]+/g, " "))}` : "";
  return `claude${flags} --append-system-prompt-file ${quotedPath}${task}`;
}
```

At the top of `case "ollama": {` add:

```ts
      // `ollama run <model> <prompt>` answers once and exits: an agent sent
      // a task that way would never become the interactive session it should.
      if (opts.task) {
        return {
          kind: "unsupported",
          reason: "Ollama cannot start an interactive session with an opening task. Launch the developer from the agent picker and paste the story path.",
        };
      }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/agentCommand.test.ts src/lib/__tests__/ollamaLaunch.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agentCommand.ts src/lib/__tests__/agentCommand.test.ts
git commit -m "feat(agents): launch an agent with an opening task"
```

---

### Task 4: Shared launch path (`agentLaunch.ts`)

**Files:**
- Create: `src/lib/agentLaunch.ts`
- Modify: `src/components/AgentPicker.tsx` (the `buildCommand` callback, ~lines 155–205)
- Test: `src/lib/__tests__/agentLaunch.test.ts`

**Interfaces:**
- Consumes: `buildLaunchCommand` + `LaunchOptions.task` (Task 3); `ensureRoleDir`, `rolePathFor`, `AgentSpec` (`src/lib/agentSpec.ts`); `methodologyOf` (`src/lib/projectSetup.ts`); `composeRoleMarkdown`, `toModelfile` (`src/lib/agentComposition.ts`); `getRole`, `getDomain`; `runInNewTabPane` (`src/lib/terminalCommands.ts`); `useAgentTrackerStore.startSession(paneId, name, icon, provider, roleId)`.
- Produces:
  - `export type PreparedLaunch = { ok: true; command: string } | { ok: false; error: string }`
  - `export async function prepareAgentLaunch(spec: AgentSpec, cwd: string | undefined, opts?: { continuous?: boolean; task?: string }): Promise<PreparedLaunch>` — `error` is `""` only for an unknown role (the picker's old silent case).
  - `export async function dispatchAgent(args: { name: string; icon: string; spec: AgentSpec; cwd: string; task: string }): Promise<string | null>` — opens a new tab in `cwd`, runs the command, starts a tracker session; returns an error message, or `null` on success.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/agentLaunch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ writes: [] as { path: string; content: string }[], ran: [] as string[] }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "create_directory") return "/home/u/.ade/roles";
    if (cmd === "write_text_file") { io.writes.push(args as { path: string; content: string }); return; }
    throw new Error(`unexpected ${cmd}`);
  }),
}));
vi.mock("../projectSetup", () => ({ methodologyOf: vi.fn(async () => "v6") }));
vi.mock("../terminalCommands", () => ({
  runInNewTabPane: vi.fn(async (_name: string, _cwd: string, cmd: string) => { io.ran.push(cmd); return "pane-1"; }),
}));

import { dispatchAgent, prepareAgentLaunch } from "../agentLaunch";
import { useAgentTrackerStore } from "../../stores/agentTrackerStore";

describe("prepareAgentLaunch", () => {
  beforeEach(() => { io.writes.length = 0; io.ran.length = 0; });

  it("writes the role file and returns a command carrying the task", async () => {
    const r = await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", { task: "Implement story 1.1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.command).toMatch(/^claude --append-system-prompt-file '\/home\/u\/\.ade\/roles\/.+' 'Implement story 1\.1'$/);
    expect(io.writes).toHaveLength(1);
  });

  it("writes nothing for a provider that cannot launch", async () => {
    const r = await prepareAgentLaunch({ roleId: "developer", provider: "codex" }, "/p", {});
    expect(r.ok).toBe(false);
    expect(io.writes).toEqual([]);
  });

  it("returns an empty error for an unknown role", async () => {
    expect(await prepareAgentLaunch({ roleId: "nope", provider: "claude" }, "/p")).toEqual({ ok: false, error: "" });
  });
});

describe("dispatchAgent", () => {
  beforeEach(() => { io.writes.length = 0; io.ran.length = 0; });

  it("runs the command in a new tab and records the session", async () => {
    const start = vi.spyOn(useAgentTrackerStore.getState(), "startSession");
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p", task: "Implement story 1.1",
    });
    expect(err).toBeNull();
    expect(io.ran[0]).toContain("'Implement story 1.1'");
    expect(start).toHaveBeenCalledWith("pane-1", "Developer", "D", "claude", "developer");
  });

  it("returns the reason and opens nothing when the provider cannot take a task", async () => {
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "ollama" }, cwd: "/p", task: "go",
    });
    expect(err).toMatch(/Ollama/);
    expect(io.ran).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/agentLaunch.test.ts`
Expected: FAIL, cannot resolve `../agentLaunch`.

- [ ] **Step 3: Implement** — `src/lib/agentLaunch.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { getRole } from "../data/roles";
import { getDomain } from "../data/domains";
import { composeRoleMarkdown, toModelfile } from "./agentComposition";
import { buildLaunchCommand } from "./agentCommand";
import { ensureRoleDir, rolePathFor, type AgentSpec } from "./agentSpec";
import { methodologyOf } from "./projectSetup";
import { runInNewTabPane } from "./terminalCommands";
import { useSettingsStore } from "../stores/settingsStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";

export type PreparedLaunch = { ok: true; command: string } | { ok: false; error: string };

/**
 * Write an agent's role file and build the command that launches it. Shared
 * by the agent picker and the board's Dispatch so the two cannot drift.
 *
 * The command is built before anything is written: a provider with no
 * verified launch mechanism must not leave a role file nothing will read.
 */
export async function prepareAgentLaunch(
  spec: AgentSpec,
  cwd: string | undefined,
  opts: { continuous?: boolean; task?: string } = {},
): Promise<PreparedLaunch> {
  const role = getRole(spec.roleId);
  if (!role) return { ok: false, error: "" };
  const domain = spec.domainId ? getDomain(spec.domainId) : undefined;

  let roleDir: string;
  try {
    roleDir = await ensureRoleDir();
  } catch (err) {
    return { ok: false, error: `Could not create the role directory: ${err}` };
  }
  // Only the BMAD tasks for the project's methodology, in a role file keyed by
  // it, so a launch in a project on the other methodology never shares it.
  const methodology = await methodologyOf(cwd);
  const rolePath = rolePathFor(spec, roleDir, methodology);

  const settings = useSettingsStore.getState();
  const result = buildLaunchCommand(spec.provider, rolePath, {
    continuous: opts.continuous,
    ollamaModel: settings.ollamaModel,
    roleId: spec.roleId,
    domainId: spec.domainId,
    task: opts.task,
  });
  if (result.kind === "unsupported") return { ok: false, error: result.reason };

  try {
    // Ollama takes a system prompt only through a Modelfile.
    const roleText = composeRoleMarkdown(role, domain, methodology);
    const content = spec.provider === "ollama" ? toModelfile(roleText, settings.ollamaModel || "deepseek-r1") : roleText;
    await invoke("write_text_file", { path: rolePath, content });
  } catch (err) {
    return { ok: false, error: `Could not write the role file: ${err}` };
  }
  return { ok: true, command: result.command };
}

/** Launch an agent with a task in a new tab in `cwd`. Returns an error message, or null. */
export async function dispatchAgent(args: {
  name: string;
  icon: string;
  spec: AgentSpec;
  cwd: string;
  task: string;
}): Promise<string | null> {
  const prepared = await prepareAgentLaunch(args.spec, args.cwd, { task: args.task });
  if (!prepared.ok) return prepared.error || `Unknown role "${args.spec.roleId}"`;
  const paneId = await runInNewTabPane(args.name, args.cwd, prepared.command);
  if (!paneId) return "The new terminal did not start.";
  useAgentTrackerStore.getState().startSession(paneId, args.name, args.icon, args.spec.provider, args.spec.roleId);
  return null;
}
```

In `src/components/AgentPicker.tsx`, replace the body of `buildCommand` (from `const role = getRole(spec.roleId);` through `return { command: result.command };`) with:

```ts
    const r = await prepareAgentLaunch(spec, cwd, { continuous: continuousMode });
    if (!r.ok) {
      if (r.error) setLaunchError(r.error);
      return null;
    }
    return { command: r.command };
```

Add `import { prepareAgentLaunch } from "../lib/agentLaunch";` and remove imports that become unused (`getRole`, `getDomain`, `composeRoleMarkdown`, `toModelfile`, `buildLaunchCommand`, `ensureRoleDir`, `rolePathFor`, `methodologyOf`, `invoke` — keep any still referenced elsewhere in the file; let `npx tsc --noEmit` and the lint of unused imports decide).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/agentLaunch.test.ts src/components/__tests__/AgentPicker.test.tsx src/components/__tests__/agentLaunch.test.ts && npx tsc --noEmit`
Expected: PASS. If an `AgentPicker.test.tsx` mock targets a module the picker no longer imports directly, move that mock to the module `agentLaunch.ts` imports (same module path), not the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agentLaunch.ts src/lib/__tests__/agentLaunch.test.ts src/components/AgentPicker.tsx src/components/__tests__/AgentPicker.test.tsx
git commit -m "refactor(agents): one launch path for the picker and the board"
```

---

### Task 5: v6 board additions — epics, problems, no-initiative, approvals

**Files:**
- Modify: `src/stores/stageBoardStore.ts` (`BoardState` ~line 39; export `STAGE_ORDER`)
- Modify: `src/lib/boardV6.ts` (views ~line 89; return ~line 156)
- Test: `src/lib/__tests__/boardV6.test.ts`

**Interfaces:**
- Produces, in `stageBoardStore.ts`:
  ```ts
  export const STAGE_ORDER: StageId[] = ["brainstorming", "design", "audit", "execution", "review"];
  // BoardState gains:
  epics?: { slug: string; title: string; refs: string[] }[];
  problems?: string[];
  noInitiative?: true;
  ```
- Produces, in `boardV6.ts`: `export const APPROVALS_DIR = ".ade/approvals";`. A ticket whose `StoryView.state` is `"draft"` and whose ref has a file in `.ade/approvals/` becomes `state: "approved", dispatchable: true`.

- [ ] **Step 1: Write the failing tests** — append to `describe("buildBoardV6", ...)` in `src/lib/__tests__/boardV6.test.ts`:

```ts
  it("groups tickets under their epics and passes the tree's problems through", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("draft"));
    const board = await buildBoardV6("/p", fs);
    expect(board.epics).toHaveLength(1);
    expect(board.epics![0].refs).toEqual(["1.1"]);
    expect(board.epics![0].title).toBeTruthy();
    expect(Array.isArray(board.problems)).toBe(true);
    expect(board.noInitiative).toBeUndefined();
  });

  it("says when there is no active initiative", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\n');
    const board = await buildBoardV6("/p", fs);
    expect(board.noInitiative).toBe(true);
    expect(board.epics).toEqual([]);
  });

  it.each(["draft", "ready-for-dev"])("a %s ticket with no approval file is draft and not dispatchable", async (status) => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket(status));
    const v = (await buildBoardV6("/p", fs)).stories[0];
    expect(v.state).toBe("draft");
    expect(v.dispatchable).toBe(false);
  });

  it.each(["draft", "ready-for-dev"])("a %s ticket with an approval file is approved and dispatchable", async (status) => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket(status));
    await fs.mkdir("/p/.ade/approvals");
    await fs.writeText("/p/.ade/approvals/1.1", "2026-10-10\n");
    const v = (await buildBoardV6("/p", fs)).stories[0];
    expect(v.state).toBe("approved");
    expect(v.dispatchable).toBe(true);
  });

  it("an approval file does not change a ticket already past draft", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("in-progress"));
    await fs.mkdir("/p/.ade/approvals");
    await fs.writeText("/p/.ade/approvals/1.1", "2026-10-10\n");
    expect((await buildBoardV6("/p", fs)).stories[0].state).toBe("in-progress");
  });

  it("never appends or deletes, so the panel's Fs can refuse both", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    const strict = { ...fs, append: async () => { throw new Error("append"); }, delete: async () => { throw new Error("delete"); } };
    await expect(buildBoardV6("/p", strict)).resolves.toBeDefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/boardV6.test.ts`
Expected: FAIL on `epics`, `noInitiative`, and the approval tests.

- [ ] **Step 3: Implement**

In `src/stores/stageBoardStore.ts`, add to `BoardState` after `supersededGates`:

```ts
  /** v6 only: the epics in the tree's order, with their tickets' refs, for grouping rows. */
  epics?: { slug: string; title: string; refs: string[] }[];
  /** v6 only: what the ticket tree flags as needing a fix. */
  problems?: string[];
  /** v6 only: the project has no active initiative yet, so the board is empty for that reason. */
  noInitiative?: true;
```

and below `const STAGES: StageSpec[] = [...]`:

```ts
/** The five stages in order, for code that steps between them. */
export const STAGE_ORDER: StageId[] = STAGES.map((s) => s.id);
```

In `src/lib/boardV6.ts`, add after the imports:

```ts
/**
 * ADE's record that a person approved a ticket: one file per ref holding the
 * date. v6 has no human approval status — `ready-for-dev` is written by agents
 * when their own plan is done — so the human gate lives in `.ade/`, beside the
 * verification gates ADE also owns.
 */
export const APPROVALS_DIR = ".ade/approvals";

async function approvedRefs(projectRoot: string, fs: Fs): Promise<Set<string>> {
  const dir = joinPath(projectRoot, APPROVALS_DIR);
  if (!(await fs.exists(dir))) return new Set();
  return new Set(await fs.list(dir));
}

/** A draft ticket a person approved is approved, and may be dispatched. */
function withApproval(v: StoryView, approved: Set<string>): StoryView {
  if (v.state !== "draft" || !approved.has(v.story.id)) return v;
  return { ...v, state: "approved", dispatchable: true };
}
```

Add `import type { StoryView } from "./storyState";` to the imports. Replace the `views` construction:

```ts
  const approved = await approvedRefs(projectRoot, fs);
  const views = tickets
    .map((t) => withApproval(ticketView(t, gates), approved))
    .sort((a, b) => a.story.id.localeCompare(b.story.id, undefined, { numeric: true }));
```

In the returned object, after `supersededGates`, add:

```ts
    epics: epics.map((e) => ({
      slug: e.slug,
      title: e.title,
      refs: tickets.filter((t) => t.epic === e.slug).map((t) => t.id),
    })),
    problems: tree?.problems ?? [],
    ...(tree ? {} : { noInitiative: true as const }),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/boardV6.test.ts scripts/stageBoardStore.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/stageBoardStore.ts src/lib/boardV6.ts src/lib/__tests__/boardV6.test.ts
git commit -m "feat(board): v6 epics, problems, no-initiative and ADE approvals"
```

---

### Task 6: `loadBoard` — one entry point for both methodologies

**Files:**
- Create: `src/lib/loadBoard.ts`
- Test: `src/lib/__tests__/loadBoard.test.ts`

**Interfaces:**
- Consumes: `buildBoard`, `BoardState` (`src/stores/stageBoardStore.ts`); `buildBoardV6` (Task 5); `parseBmadConfig`, `gatesDir` (`src/lib/bmadConfig.ts`); `artifactCandidates` (`src/lib/bmadArtifacts.ts`); `Fs`, `joinPath`.
- Produces:
  - `export const V4_CONFIG = ".bmad-core/core-config.yaml";`
  - `export async function v4Inputs(root: string, fs: Fs): Promise<Parameters<typeof buildBoard>[0]>`
  - `export async function loadBoard(root: string, methodology: "v4" | "v6", fs: Fs): Promise<BoardState>`

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/loadBoard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { memFs } from "../bmadRuntime/fs";
import { loadBoard, v4Inputs } from "../loadBoard";
import { buildBoard } from "../../stores/stageBoardStore";

const STORY = (status: string) => `# Story 1.1: Cart total\n\n## Status\n\n${status}\n\n## Acceptance Criteria\n\n1. Totals add up\n`;
const PASS = 'story: "1.1"\ngate: "PASS"\nstatus_reason: "ok"\nupdated: "2026-10-10"\n';

async function v4Project() {
  const fs = memFs();
  await fs.mkdir("/p/.bmad-core");
  await fs.writeText("/p/.bmad-core/core-config.yaml", "qaLocation: docs/qa\nprdFile: docs/prd.md\nprdSharded: false\ndevStoryLocation: docs/stories\n");
  await fs.mkdir("/p/docs/stories");
  await fs.writeText("/p/docs/prd.md", "# PRD\n");
  await fs.writeText("/p/docs/stories/1.1.cart-total.md", STORY("Done"));
  await fs.writeText("/p/docs/stories/notes.txt", "not a story");
  await fs.mkdir("/p/docs/qa/gates");
  await fs.writeText("/p/docs/qa/gates/1.1-cart-total.yml", PASS);
  return fs;
}

describe("v4Inputs", () => {
  it("reads the config, the story files, the gates and which artifact paths exist", async () => {
    const fs = await v4Project();
    const input = await v4Inputs("/p", fs);
    expect(input.config).toContain("devStoryLocation: docs/stories");
    expect(input.stories.map((s) => s.file)).toEqual(["docs/stories/1.1.cart-total.md"]);
    expect(input.gates.map((g) => g.file)).toEqual(["docs/qa/gates/1.1-cart-total.yml"]);
    expect(input.artifactExists("docs/prd.md")).toBe(true);
    expect(input.artifactExists("docs/architecture.md")).toBe(false);
  });

  it("uses the defaults when there is no config, and reads nothing that is missing", async () => {
    const fs = memFs();
    await fs.mkdir("/p");
    const input = await v4Inputs("/p", fs);
    expect(input.config).toBeNull();
    expect(input.stories).toEqual([]);
    expect(input.gates).toEqual([]);
  });
});

describe("loadBoard", () => {
  it("builds the same v4 board buildBoard gives for the gathered inputs", async () => {
    const fs = await v4Project();
    const board = await loadBoard("/p", "v4", fs);
    expect(board).toEqual(buildBoard(await v4Inputs("/p", fs)));
    expect(board.stories[0].state).toBe("done");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/loadBoard.test.ts`
Expected: FAIL, cannot resolve `../loadBoard`.

- [ ] **Step 3: Implement** — `src/lib/loadBoard.ts`:

```ts
import type { Fs } from "./bmadRuntime/fs";
import { joinPath } from "./bmadRuntime/paths";
import { gatesDir, parseBmadConfig } from "./bmadConfig";
import { artifactCandidates } from "./bmadArtifacts";
import { buildBoardV6 } from "./boardV6";
import { buildBoard, type BoardState } from "../stores/stageBoardStore";

export const V4_CONFIG = ".bmad-core/core-config.yaml";

async function readIfPresent(path: string, fs: Fs): Promise<string | null> {
  if (!(await fs.exists(path))) return null;
  try {
    return await fs.readText(path);
  } catch {
    return null; // a directory, or unreadable
  }
}

/** Files in `dir` (relative to root) whose names pass `keep`, as `{ file, text }`, sorted. */
async function filesIn(root: string, dir: string, keep: (name: string) => boolean, fs: Fs) {
  const abs = joinPath(root, dir);
  if (!(await fs.exists(abs))) return [];
  const out: { file: string; text: string }[] = [];
  for (const name of (await fs.list(abs)).filter(keep).sort()) {
    const text = await readIfPresent(joinPath(abs, name), fs);
    if (text !== null) out.push({ file: `${dir}/${name}`, text });
  }
  return out;
}

/**
 * Everything `buildBoard` needs for a v4 project, read through `fs`.
 *
 * `buildBoard` takes a synchronous `artifactExists`, so every candidate path
 * is checked here first and the answer is a lookup.
 */
export async function v4Inputs(root: string, fs: Fs): Promise<Parameters<typeof buildBoard>[0]> {
  const config = await readIfPresent(joinPath(root, V4_CONFIG), fs);
  const paths = parseBmadConfig(config);

  const present = new Set<string>();
  for (const c of artifactCandidates(paths)) {
    for (const cand of c.candidates) {
      if (await fs.exists(joinPath(root, cand.path))) present.add(cand.path);
    }
  }

  const stories = await filesIn(root, paths.devStoryLocation, (n) => n.endsWith(".md"), fs);
  const gates = await filesIn(root, gatesDir(paths), (n) => /\.ya?ml$/.test(n), fs);
  return {
    config,
    artifactExists: (p) => present.has(p),
    stories: stories.map((s) => ({ file: s.file, markdown: s.text })),
    gates: gates.map((g) => ({ file: g.file, yaml: g.text })),
  };
}

/** The board for a project, by its methodology. */
export async function loadBoard(root: string, methodology: "v4" | "v6", fs: Fs): Promise<BoardState> {
  return methodology === "v6" ? buildBoardV6(root, fs) : buildBoard(await v4Inputs(root, fs));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/loadBoard.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loadBoard.ts src/lib/__tests__/loadBoard.test.ts
git commit -m "feat(board): load a v4 or v6 board through any Fs"
```

---

### Task 7: `watchTargets` — which folders to watch

**Files:**
- Create: `src/lib/boardWatch.ts`
- Test: `src/lib/__tests__/boardWatch.test.ts`

**Interfaces:**
- Consumes: `BmadPaths` (`src/lib/bmadConfig.ts`).
- Produces:
  - `export const WATCH_EXTENSIONS = ["md", "yml", "yaml", "toml"];`
  - `export function watchTargets(root: string, methodology: "v4" | "v6", paths: BmadPaths | null): string[]` — absolute folders, deduplicated, with any folder inside another listed folder dropped (the watch is recursive). Never `root` itself. Existence is the caller's check.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/boardWatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { watchTargets } from "../boardWatch";
import { BMAD_DEFAULTS } from "../bmadConfig";

describe("watchTargets", () => {
  it("watches v6's three folders", () => {
    expect(watchTargets("/p", "v6", null)).toEqual(["/p/_bmad", "/p/_bmad-output", "/p/.ade"]);
  });

  it("watches v4's configured locations, collapsing ones inside docs/", () => {
    expect(watchTargets("/p", "v4", BMAD_DEFAULTS)).toEqual(["/p/.bmad-core", "/p/.ade", "/p/docs"]);
  });

  it("adds a configured location outside docs/, and a single file's folder", () => {
    const paths = { ...BMAD_DEFAULTS, devStoryLocation: "work/stories", prdSharded: false, prdFile: "spec/prd.md" };
    expect(watchTargets("/p", "v4", paths)).toEqual(["/p/.bmad-core", "/p/.ade", "/p/docs", "/p/spec", "/p/work/stories"]);
  });

  it("never watches the project root, even for a file at the top level", () => {
    const paths = { ...BMAD_DEFAULTS, prdSharded: false, prdFile: "prd.md" };
    expect(watchTargets("/p", "v4", paths)).not.toContain("/p");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/boardWatch.test.ts`
Expected: FAIL, cannot resolve `../boardWatch`.

- [ ] **Step 3: Implement** — `src/lib/boardWatch.ts`:

```ts
import type { BmadPaths } from "./bmadConfig";

export const WATCH_EXTENSIONS = ["md", "yml", "yaml", "toml"];

const parent = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/**
 * The folders whose changes can change the board.
 *
 * Never the project root: the watcher has no skip list, so a recursive watch
 * there registers all of node_modules, target and .git (inotify limits on
 * Linux) and turns `npm install` into a storm of rebuilds from vendored
 * Markdown. A file at the top level is caught by the focus refresh instead.
 */
export function watchTargets(root: string, methodology: "v4" | "v6", paths: BmadPaths | null): string[] {
  const rel =
    methodology === "v6"
      ? ["_bmad", "_bmad-output", ".ade"]
      : [
          ".bmad-core",
          ".ade",
          "docs", // the brief, backlog, reviews and BMAD's own architecture spellings
          ...(paths
            ? [
                paths.devStoryLocation,
                paths.qaLocation,
                paths.prdSharded ? paths.prdShardedLocation : parent(paths.prdFile),
                paths.architectureSharded ? paths.architectureShardedLocation : parent(paths.architectureFile),
              ]
            : []),
        ];

  const cleaned = [...new Set(rel.map((r) => r.replace(/^\.\/|\/+$/g, "")).filter((r) => r && r !== "."))];
  const inside = (a: string, b: string) => a !== b && a.startsWith(`${b}/`);
  const kept = cleaned.filter((r) => !cleaned.some((o) => inside(r, o)));
  const ordered = methodology === "v6" ? kept : [kept[0], kept[1], ...kept.slice(2).sort()];
  return ordered.map((r) => `${root.replace(/\/+$/, "")}/${r}`);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/boardWatch.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/boardWatch.ts src/lib/__tests__/boardWatch.test.ts
git commit -m "feat(board): watch the engine's folders, never the project root"
```

---

### Task 8: Stage view and the board's writes

**Files:**
- Create: `src/lib/confirmedStage.ts`, `src/lib/boardActions.ts`
- Test: `src/lib/__tests__/confirmedStage.test.ts`, `src/lib/__tests__/boardActions.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `StageId`, `STAGE_ORDER`, `canAdvance` (`src/stores/stageBoardStore.ts`, Task 5); `APPROVALS_DIR` (Task 5); `Fs`, `joinPath`.
- Produces (`confirmedStage.ts`):
  ```ts
  export const STAGE_FILE = ".ade/stage";
  export interface StageView {
    shown: StageId;            // what the rail marks as current
    derived: StageId;          // board.currentStage
    tracked: boolean;          // a valid .ade/stage exists
    invalid: boolean;          // .ade/stage exists but is not a StageId
    claimed: boolean;          // tracked, but an earlier stage lacks its evidence
    next: StageId | null;      // offered only when tracked && canAdvance(board, shown)
    prev: StageId | null;      // offered whenever shown is not the first stage
  }
  export function stageView(board: BoardState, file: string | null): StageView;
  export async function readStageFile(root: string, fs: Fs): Promise<string | null>;
  export async function writeStage(root: string, stage: StageId, fs: Fs): Promise<void>;
  ```
- Produces (`boardActions.ts`):
  ```ts
  export function approveStoryMarkdown(md: string): string | null; // null when the status is not Draft
  export async function approveStory(root: string, file: string, fs: Fs): Promise<void>; // throws "Story is not a draft" when null
  export function isSafeRef(ref: string): boolean;
  export async function approveTicket(root: string, ref: string, fs: Fs, today?: string): Promise<void>; // throws on an unsafe ref
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/confirmedStage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBoard } from "../../stores/stageBoardStore";
import { memFs } from "../bmadRuntime/fs";
import { readStageFile, stageView, writeStage } from "../confirmedStage";

/** A v4 board whose evidence covers stages up to and including `through`. */
const board = (have: string[]) =>
  buildBoard({ config: null, artifactExists: (p) => have.includes(p), stories: [], gates: [] });
const BRIEF = "docs/brief.md";
const DESIGN = ["docs/prd", "docs/architecture"];

describe("stageView", () => {
  it("falls back to the evidence with no file, offering no Next", () => {
    const v = stageView(board([BRIEF]), null);
    expect(v).toMatchObject({ shown: "design", derived: "design", tracked: false, invalid: false, claimed: false, next: null, prev: "brainstorming" });
  });

  it("treats an unknown value as invalid and falls back", () => {
    const v = stageView(board([BRIEF]), "shipping\n");
    expect(v).toMatchObject({ shown: "design", tracked: false, invalid: true, next: null });
  });

  it("shows the tracked stage, and offers Next only once its evidence is on disk", () => {
    expect(stageView(board([BRIEF]), "design\n")).toMatchObject({ shown: "design", tracked: true, next: null });
    expect(stageView(board([BRIEF, ...DESIGN]), "design\n")).toMatchObject({ shown: "design", next: "audit", claimed: false });
  });

  it("holds a tracked stage behind the evidence: Next waits for the click", () => {
    const v = stageView(board([BRIEF, ...DESIGN]), "brainstorming\n");
    expect(v).toMatchObject({ shown: "brainstorming", derived: "audit", next: "design", prev: null });
  });

  it("calls a tracked stage ahead of the evidence claimed", () => {
    const v = stageView(board([]), "execution\n");
    expect(v).toMatchObject({ shown: "execution", claimed: true, next: null, prev: "audit" });
  });

  it("offers no Next from the last stage", () => {
    expect(stageView(board([]), "review").next).toBeNull();
  });
});

describe("stage file", () => {
  it("round-trips through .ade/stage, and reads null when absent", async () => {
    const fs = memFs();
    await fs.mkdir("/p");
    expect(await readStageFile("/p", fs)).toBeNull();
    await writeStage("/p", "audit", fs);
    expect(await fs.readText("/p/.ade/stage")).toBe("audit\n");
    expect(await readStageFile("/p", fs)).toBe("audit\n");
  });
});
```

`src/lib/__tests__/boardActions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { memFs } from "../bmadRuntime/fs";
import { approveStory, approveStoryMarkdown, approveTicket, isSafeRef } from "../boardActions";

const STORY = "# Story 1.1: Cart\n\n## Status\n\nDraft\n\n## Acceptance Criteria\n\n1. Draft totals add up\n";

describe("approveStoryMarkdown", () => {
  it("changes only the status line", () => {
    expect(approveStoryMarkdown(STORY)).toBe(STORY.replace("\n\nDraft\n\n", "\n\nApproved\n\n"));
  });

  it("keeps CRLF line endings and indentation byte for byte", () => {
    const crlf = "# Story 1.1: Cart\r\n\r\n## Status\r\n\r\n  draft\r\n\r\n## Tasks\r\n- Draft it\r\n";
    expect(approveStoryMarkdown(crlf)).toBe(crlf.replace("  draft\r\n", "  Approved\r\n"));
  });

  it.each([
    ["an approved story", STORY.replace("\nDraft\n", "\nApproved\n")],
    ["no Status section", "# Story 1.1: Cart\n\nDraft\n"],
    ["an empty Status section", "## Status\n\n## Tasks\n"],
  ])("returns null for %s", (_, md) => {
    expect(approveStoryMarkdown(md)).toBeNull();
  });
});

describe("approveStory", () => {
  it("rewrites the file, and refuses a story that is not a draft", async () => {
    const fs = memFs();
    await fs.mkdir("/p/docs/stories");
    await fs.writeText("/p/docs/stories/1.1.cart.md", STORY);
    await approveStory("/p", "docs/stories/1.1.cart.md", fs);
    expect(await fs.readText("/p/docs/stories/1.1.cart.md")).toContain("## Status\n\nApproved\n");
    await expect(approveStory("/p", "docs/stories/1.1.cart.md", fs)).rejects.toThrow("Story is not a draft");
  });
});

describe("approveTicket", () => {
  it("writes .ade/approvals/<ref> with the date", async () => {
    const fs = memFs();
    await fs.mkdir("/p");
    await approveTicket("/p", "1.6a", fs, "2026-10-10");
    expect(await fs.readText("/p/.ade/approvals/1.6a")).toBe("2026-10-10\n");
  });

  it.each(["", ".", "..", "a/b", "..\\x", "../1.1"])("refuses the unsafe ref %j", async (ref) => {
    expect(isSafeRef(ref)).toBe(false);
    const fs = memFs();
    await fs.mkdir("/p");
    await expect(approveTicket("/p", ref, fs, "2026-10-10")).rejects.toThrow(/cannot be approved/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/__tests__/confirmedStage.test.ts src/lib/__tests__/boardActions.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`src/lib/confirmedStage.ts`:

```ts
import type { Fs } from "./bmadRuntime/fs";
import { joinPath } from "./bmadRuntime/paths";
import { canAdvance, STAGE_ORDER, type BoardState, type StageId } from "../stores/stageBoardStore";

/** The stage a person confirmed: one line, a StageId. */
export const STAGE_FILE = ".ade/stage";

export interface StageView {
  shown: StageId;
  derived: StageId;
  tracked: boolean;
  invalid: boolean;
  claimed: boolean;
  next: StageId | null;
  prev: StageId | null;
}

/**
 * The stage the rail shows, and which moves it may offer.
 *
 * Evidence alone does not advance a tracked project (an agent can write a
 * stub) and the file alone is not believed (an agent can write the file): a
 * tracked stage whose earlier stages lack evidence is claimed, like a story
 * that says Done with no gate. Without a valid file the rail follows the
 * evidence as it always did, so no existing project moves backwards.
 */
export function stageView(board: BoardState, file: string | null): StageView {
  const derived = board.currentStage;
  const value = file?.trim() ?? null;
  const tracked = value !== null && (STAGE_ORDER as string[]).includes(value);
  const shown = tracked ? (value as StageId) : derived;
  const i = STAGE_ORDER.indexOf(shown);
  const claimed = tracked && STAGE_ORDER.indexOf(derived) < i;
  const last = i === STAGE_ORDER.length - 1;
  return {
    shown,
    derived,
    tracked,
    invalid: value !== null && !tracked,
    claimed,
    next: tracked && !last && canAdvance(board, shown) ? STAGE_ORDER[i + 1] : null,
    prev: i > 0 ? STAGE_ORDER[i - 1] : null,
  };
}

export async function readStageFile(root: string, fs: Fs): Promise<string | null> {
  const path = joinPath(root, STAGE_FILE);
  if (!(await fs.exists(path))) return null;
  return fs.readText(path);
}

export async function writeStage(root: string, stage: StageId, fs: Fs): Promise<void> {
  await fs.mkdir(joinPath(root, ".ade"));
  await fs.writeText(joinPath(root, STAGE_FILE), `${stage}\n`);
}
```

Note: when the evidence is ahead of a tracked stage (`derived` later than `shown`), `canAdvance(board, shown)` is true because `shown` is complete, so Next is offered — that is the click that moves it.

`src/lib/boardActions.ts`:

```ts
import type { Fs } from "./bmadRuntime/fs";
import { joinPath } from "./bmadRuntime/paths";
import { APPROVALS_DIR } from "./boardV6";

/**
 * The story with its status changed from Draft to Approved, or null when its
 * status is not Draft. Only that word changes: every other byte, line endings
 * and indentation included, is the file as it was. The status is the first
 * non-empty line under `## Status`, as `parseStory` reads it.
 */
export function approveStoryMarkdown(md: string): string | null {
  const lines = md.split("\n");
  const heading = lines.findIndex((l) => /^##\s+Status\s*$/.test(l.replace(/\r$/, "")));
  if (heading < 0) return null;
  for (let i = heading + 1; i < lines.length; i++) {
    const body = lines[i].replace(/\r$/, "");
    if (body.trim() === "") continue;
    if (body.trim().toLowerCase() !== "draft") return null; // another status, or the next heading
    lines[i] = lines[i].replace(/draft/i, "Approved");
    return lines.join("\n");
  }
  return null;
}

/** BMAD's own Draft → Approved, on a v4 story file (path relative to root). */
export async function approveStory(root: string, file: string, fs: Fs): Promise<void> {
  const path = joinPath(root, file);
  const next = approveStoryMarkdown(await fs.readText(path));
  if (next === null) throw new Error("Story is not a draft");
  await fs.writeText(path, next);
}

/** A ref that names one file directly inside the approvals folder. */
export function isSafeRef(ref: string): boolean {
  return ref !== "" && ref !== "." && ref !== ".." && !/[\\/]/.test(ref);
}

/** Record that a person approved a v6 ticket: `.ade/approvals/<ref>`, holding the date. */
export async function approveTicket(root: string, ref: string, fs: Fs, today = new Date().toISOString().slice(0, 10)): Promise<void> {
  if (!isSafeRef(ref)) throw new Error(`Ticket "${ref}" cannot be approved: its ref is not a file name`);
  const dir = joinPath(root, APPROVALS_DIR);
  await fs.mkdir(dir);
  await fs.writeText(joinPath(dir, ref), `${today}\n`);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/confirmedStage.test.ts src/lib/__tests__/boardActions.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/confirmedStage.ts src/lib/boardActions.ts src/lib/__tests__/confirmedStage.test.ts src/lib/__tests__/boardActions.test.ts
git commit -m "feat(board): tracked stage, v4 approve rewrite and v6 approval records"
```

---

### Task 9: `boardPanelStore`

**Files:**
- Create: `src/stores/boardPanelStore.ts`
- Test: `src/stores/__tests__/boardPanelStore.test.ts`

**Interfaces:**
- Consumes: `loadBoard` (Task 6); `readStageFile` (Task 8); `tauriFs` (Task 2); `detectOnDisk` (`src/lib/projectSetup.ts`, returns `"v4" | "v6" | null`).
- Produces:
  ```ts
  export interface BoardDeps {
    methodology(root: string): Promise<"v4" | "v6" | null>;
    build(root: string, methodology: "v4" | "v6"): Promise<BoardState>;
    stageFile(root: string): Promise<string | null>;
  }
  export interface BoardPanelState {
    root: string | null;
    methodology: "v4" | "v6" | null;
    board: BoardState | null;
    stageFile: string | null;
    error: string | null;
    loading: boolean;
    show(root: string | null): void;      // switch project; rebuilds now
    refresh(): Promise<void>;             // rebuild now (serialized)
    scheduleRefresh(): void;              // debounced 300 ms
  }
  export const REFRESH_DEBOUNCE_MS = 300;
  export function createBoardPanelStore(deps: BoardDeps): UseBoundStore<StoreApi<BoardPanelState>>;
  export const useBoardPanel: ReturnType<typeof createBoardPanelStore>;
  ```

- [ ] **Step 1: Write the failing test** — `src/stores/__tests__/boardPanelStore.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardPanelStore, REFRESH_DEBOUNCE_MS, type BoardDeps } from "../boardPanelStore";
import { buildBoard, type BoardState } from "../stageBoardStore";

const empty = (): BoardState => buildBoard({ config: null, artifactExists: () => false, stories: [], gates: [] });

/** Deps whose build resolves only when the test says so. */
function controlled(methodology: "v4" | "v6" | null = "v4") {
  const pending: { root: string; resolve: (b: BoardState) => void; reject: (e: Error) => void }[] = [];
  const deps: BoardDeps = {
    methodology: vi.fn(async () => methodology),
    build: vi.fn((root: string) => new Promise<BoardState>((resolve, reject) => pending.push({ root, resolve, reject }))),
    stageFile: vi.fn(async () => null),
  };
  return { deps, pending };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("boardPanelStore", () => {
  afterEach(() => vi.useRealTimers());

  it("builds the board for the project it is shown", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    pending[0].resolve(empty());
    await flush();
    expect(store.getState()).toMatchObject({ root: "/p", methodology: "v4", error: null, loading: false });
    expect(store.getState().board).not.toBeNull();
  });

  it("does not build for a project with no methodology", async () => {
    const { deps } = controlled(null);
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    expect(deps.build).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ methodology: null, board: null, loading: false });
  });

  it("runs one rebuild at a time and queues at most one more", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    void store.getState().refresh();
    void store.getState().refresh();
    void store.getState().refresh();
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(1);
    pending[0].resolve(empty());
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(2);
    pending[1].resolve(empty());
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good board when a rebuild throws, and shows the error", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    const good = empty();
    pending[0].resolve(good);
    await flush();
    void store.getState().refresh();
    await flush();
    pending[1].reject(new Error("tickets.toml: bad"));
    await flush();
    expect(store.getState().board).toBe(good);
    expect(store.getState().error).toBe("tickets.toml: bad");
  });

  it("discards a build for a project that is no longer shown", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/old");
    await flush();
    store.getState().show("/new");
    await flush();
    pending[0].resolve(empty()); // /old finishes late
    await flush();
    expect(store.getState().root).toBe("/new");
    expect(store.getState().board).toBeNull();
    const last = pending[pending.length - 1];
    expect(last.root).toBe("/new");
    last.resolve(empty());
    await flush();
    expect(store.getState().board).not.toBeNull();
  });

  it("coalesces a burst of change events into one rebuild", async () => {
    const { deps, pending } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show("/p");
    await flush();
    pending[0].resolve(empty());
    await flush();
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) store.getState().scheduleRefresh();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1);
    expect(deps.build).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await flush();
    expect(deps.build).toHaveBeenCalledTimes(2);
  });

  it("clears everything when shown no project", async () => {
    const { deps } = controlled();
    const store = createBoardPanelStore(deps);
    store.getState().show(null);
    await flush();
    expect(store.getState()).toMatchObject({ root: null, board: null, methodology: null, loading: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/stores/__tests__/boardPanelStore.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** — `src/stores/boardPanelStore.ts`:

```ts
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { BoardState } from "./stageBoardStore";
import { loadBoard } from "../lib/loadBoard";
import { readStageFile } from "../lib/confirmedStage";
import { tauriFs } from "../lib/tauriFs";
import { detectOnDisk } from "../lib/projectSetup";

export interface BoardDeps {
  methodology(root: string): Promise<"v4" | "v6" | null>;
  build(root: string, methodology: "v4" | "v6"): Promise<BoardState>;
  stageFile(root: string): Promise<string | null>;
}

export interface BoardPanelState {
  root: string | null;
  methodology: "v4" | "v6" | null;
  board: BoardState | null;
  stageFile: string | null;
  error: string | null;
  loading: boolean;
  show(root: string | null): void;
  refresh(): Promise<void>;
  scheduleRefresh(): void;
}

export const REFRESH_DEBOUNCE_MS = 300;

/**
 * The board panel's view of one project. The files are the state: everything
 * here is rebuilt from disk, and nothing is written.
 *
 * Rebuilds are serialized — one in flight, at most one queued — because an
 * agent writing ten tickets fires ten events and overlapping builds could
 * finish out of order. A build for a project no longer shown is discarded.
 * A failed rebuild keeps the last good board beside the error.
 */
export function createBoardPanelStore(deps: BoardDeps): UseBoundStore<StoreApi<BoardPanelState>> {
  let running: Promise<void> | null = null;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return create<BoardPanelState>((set, get) => {
    async function buildOnce(): Promise<void> {
      const root = get().root;
      if (!root) return;
      set({ loading: true });
      try {
        const methodology = await deps.methodology(root);
        if (get().root !== root) return;
        if (!methodology) {
          set({ methodology: null, board: null, stageFile: null, error: null });
          return;
        }
        const [board, stageFile] = await Promise.all([deps.build(root, methodology), deps.stageFile(root)]);
        if (get().root !== root) return;
        set({ methodology, board, stageFile, error: null });
      } catch (e) {
        if (get().root !== root) return;
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (get().root === root) set({ loading: false });
      }
    }

    async function refresh(): Promise<void> {
      if (running) {
        queued = true;
        return running;
      }
      running = (async () => {
        do {
          queued = false;
          await buildOnce();
        } while (queued);
      })();
      try {
        await running;
      } finally {
        running = null;
      }
    }

    return {
      root: null,
      methodology: null,
      board: null,
      stageFile: null,
      error: null,
      loading: false,
      show(root) {
        if (timer) clearTimeout(timer);
        timer = null;
        if (root === get().root && get().board) return;
        set({ root, methodology: null, board: null, stageFile: null, error: null, loading: false });
        if (root) void refresh();
      },
      refresh,
      scheduleRefresh() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void refresh();
        }, REFRESH_DEBOUNCE_MS);
      },
    };
  });
}

export const useBoardPanel = createBoardPanelStore({
  methodology: (root) => detectOnDisk(root),
  build: (root, methodology) => loadBoard(root, methodology, tauriFs),
  stageFile: (root) => readStageFile(root, tauriFs),
});
```

Note for the "discards" test: switching root while `/old` is in flight leaves `running` set, so `show("/new")`'s refresh queues; when `/old`'s build resolves it is discarded by the root check and the queued loop runs `buildOnce()` for `/new`. That is why the test resolves the *last* pending build.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/stores/__tests__/boardPanelStore.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/boardPanelStore.ts src/stores/__tests__/boardPanelStore.test.ts
git commit -m "feat(board): store that rebuilds the board from disk, serialized and debounced"
```

---

### Task 10: `BoardView` — the read-only render (part A)

**Files:**
- Create: `src/components/board/BoardView.tsx`
- Test: `src/components/__tests__/BoardView.test.tsx`

**Interfaces:**
- Consumes: `BoardState`, `STAGE_ORDER` (Task 5); `StageView` (Task 8); `StoryView` (`src/lib/storyState.ts`); `Gate` (`src/lib/bmadGates.ts`).
- Produces:
  ```ts
  export interface BoardActions {
    onOpen(path: string): void;
    onApprove?(v: StoryView): Promise<void>;
    onDispatch?(v: StoryView): Promise<void>;
    onStage?(to: StageId): Promise<void>;
  }
  export interface BoardViewProps {
    methodology: "v4" | "v6";
    board: BoardState;
    stage: StageView;
    error: string | null;
    actions: BoardActions;
  }
  export default function BoardView(props: BoardViewProps): JSX.Element;
  export function rowLabel(v: StoryView): string; // "done ✓" | "waived" | "claimed" | state | raw word
  ```
  Task 10 renders only `onOpen`; the optional actions are rendered by Task 11.

- [ ] **Step 1: Write the failing test** — `src/components/__tests__/BoardView.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BoardView, { rowLabel } from "../board/BoardView";
import { buildBoard, type BoardState } from "../../stores/stageBoardStore";
import { stageView } from "../../lib/confirmedStage";
import type { StoryView } from "../../lib/storyState";

const story = (id: string, status: string) => ({
  file: `docs/stories/${id}.x.md`,
  markdown: `# Story ${id}: Title ${id}\n\n## Status\n\n${status}\n`,
});
const gate = (id: string, verdict: string, reason = "r") => ({
  file: `docs/qa/gates/${id}-x.yml`,
  yaml: `story: "${id}"\ngate: "${verdict}"\nstatus_reason: "${reason}"\nupdated: "2026-10-10"\n`,
});

function v4Board(): BoardState {
  return buildBoard({
    config: null,
    artifactExists: (p) => p === "docs/prd.md",
    stories: [story("1.1", "Draft"), story("1.2", "Done"), story("1.3", "Done"), story("1.4", "Done"), story("1.5", "Blocked")],
    gates: [gate("1.2", "PASS"), gate("1.3", "WAIVED", "legacy path"), gate("9.9", "PASS"), { file: "docs/qa/gates/bad.yml", yaml: "nope: 1\n" }],
  });
}

const renderBoard = (board = v4Board(), extra: Partial<Parameters<typeof BoardView>[0]> = {}) =>
  render(<BoardView methodology="v4" board={board} stage={stageView(board, null)} error={null} actions={{ onOpen: vi.fn() }} {...extra} />);

describe("rowLabel", () => {
  it("names every state the board can show", () => {
    const rows = v4Board().stories;
    const by = (id: string) => rowLabel(rows.find((r) => r.story.id === id) as StoryView);
    expect(by("1.1")).toBe("draft");
    expect(by("1.2")).toBe("done ✓");
    expect(by("1.3")).toBe("waived");
    expect(by("1.4")).toBe("claimed");
    expect(by("1.5")).toBe("Blocked");
  });
});

describe("BoardView", () => {
  it("renders the five stages with the current one marked", () => {
    renderBoard(); // no brief and no architecture: the first stage is current
    for (const label of ["Brainstorming", "Design", "Audit", "Execution", "Review"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Brainstorming").closest("[data-stage]")?.getAttribute("data-current")).toBe("true");
  });

  it("shows a skipped optional stage as skipped", () => {
    const board = buildBoard({ config: null, artifactExists: (p) => ["docs/prd", "docs/architecture", "docs/reviews"].includes(p), stories: [], gates: [] });
    renderBoard(board);
    expect(screen.getByText("Brainstorming").closest("[data-stage]")?.getAttribute("data-skipped")).toBe("true");
  });

  it("lists artifacts as present or missing, and opens a present file", () => {
    const onOpen = vi.fn();
    renderBoard(v4Board(), { actions: { onOpen } });
    fireEvent.click(screen.getByRole("button", { name: /PRD/ }));
    expect(onOpen).toHaveBeenCalledWith("docs/prd.md");
    expect(screen.getByText("Architecture").closest("[data-artifact]")?.getAttribute("data-present")).toBe("false");
  });

  it("always shows a waiver's reason, and a claimed row's", () => {
    renderBoard();
    expect(screen.getByText(/legacy path/)).toBeTruthy();
    expect(screen.getByText(/no gate file/)).toBeTruthy();
  });

  it("expands a row to its gate", () => {
    renderBoard();
    fireEvent.click(screen.getByText("Title 1.2"));
    expect(screen.getByText("docs/qa/gates/1.2-x.yml")).toBeTruthy();
  });

  it("lists unmatched and unreadable gates last", () => {
    renderBoard();
    expect(screen.getByText(/docs\/qa\/gates\/9\.9-x\.yml/)).toBeTruthy();
    expect(screen.getByText(/no gate: key/)).toBeTruthy();
  });

  it("groups v6 rows under their epics, with problems and a no-initiative note", () => {
    const base = buildBoard({ config: null, artifactExists: () => false, stories: [story("1.1", "Draft"), story("2.1", "Draft")], gates: [] });
    const board: BoardState = { ...base, epics: [{ slug: "epic-cart", title: "Cart", refs: ["1.1"] }], problems: ["plan names no ticket"] };
    render(<BoardView methodology="v6" board={board} stage={stageView(board, null)} error={null} actions={{ onOpen: vi.fn() }} />);
    expect(screen.getByText("Cart")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByText("plan names no ticket")).toBeTruthy();

    const none: BoardState = { ...base, stories: [], epics: [], noInitiative: true };
    render(<BoardView methodology="v6" board={none} stage={stageView(none, null)} error={null} actions={{ onOpen: vi.fn() }} />);
    expect(screen.getByText(/No active initiative/)).toBeTruthy();
  });

  it("shows a rebuild error above the last good board", () => {
    renderBoard(v4Board(), { error: "tickets.toml: bad" });
    expect(screen.getByRole("alert").textContent).toContain("tickets.toml: bad");
    expect(screen.getByText("Title 1.1")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/__tests__/BoardView.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** — `src/components/board/BoardView.tsx`:

```tsx
import { useState } from "react";
import type { BoardState, StageId } from "../../stores/stageBoardStore";
import type { StageView } from "../../lib/confirmedStage";
import type { StoryView } from "../../lib/storyState";
import type { Gate } from "../../lib/bmadGates";

export interface BoardActions {
  onOpen(path: string): void;
  onApprove?(v: StoryView): Promise<void>;
  onDispatch?(v: StoryView): Promise<void>;
  onStage?(to: StageId): Promise<void>;
}

export interface BoardViewProps {
  methodology: "v4" | "v6";
  board: BoardState;
  stage: StageView;
  error: string | null;
  actions: BoardActions;
}

/** What a row says it is. Done is only ever "done ✓" with a gate behind it. */
export function rowLabel(v: StoryView): string {
  if (v.state === "done") return v.gate?.verdict === "WAIVED" ? "waived" : "done ✓";
  if (v.state === "unknown") return v.story.rawStatus || "unknown";
  return v.state;
}

const muted = { color: "var(--text-secondary)" } as const;
const section = { padding: "10px 12px", borderBottom: "1px solid var(--border)" } as const;
const heading = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, ...muted, marginBottom: 6 } as const;

function StageRail({ board, stage }: { board: BoardState; stage: StageView }) {
  const phases = [...new Set(board.stages.map((s) => s.phase))];
  return (
    <div style={section}>
      {phases.map((phase) => (
        <div key={phase} style={{ marginBottom: 6 }}>
          <div style={heading}>{phase}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {board.stages.filter((s) => s.phase === phase).map((s) => {
              const current = s.id === stage.shown;
              const skipped = s.optional && s.complete && !board.artifacts.some((a) => s.evidence.includes(a.id) && a.present);
              return (
                <span
                  key={s.id}
                  data-stage={s.id}
                  data-current={current}
                  data-skipped={skipped}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
                    color: current ? "var(--accent)" : s.complete ? "var(--text-primary)" : "var(--text-secondary)",
                    textDecoration: skipped ? "line-through" : undefined,
                  }}
                >
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Artifacts({ board, onOpen }: { board: BoardState; onOpen(path: string): void }) {
  return (
    <div style={section}>
      <div style={heading}>Artifacts</div>
      {board.artifacts.map((a) => (
        <div key={a.id} data-artifact={a.id} data-present={a.present} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <span aria-hidden>{a.present ? "●" : "○"}</span>
          {a.present && !a.isDirectory ? (
            <button type="button" onClick={() => onOpen(a.path)} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer" }}>
              {a.label}
            </button>
          ) : (
            <span style={a.present ? undefined : muted}>{a.label}</span>
          )}
          <span style={{ ...muted, fontSize: 11 }}>{a.present ? a.path : `missing: ${a.path}`}</span>
        </div>
      ))}
    </div>
  );
}

function GateDetail({ gate }: { gate: Gate | undefined }) {
  if (!gate) return <div style={{ ...muted, fontSize: 11 }}>No gate file.</div>;
  return (
    <div style={{ fontSize: 11 }}>
      <div>{gate.verdict ?? "unreadable"}{gate.reason ? `: ${gate.reason}` : ""}</div>
      {gate.error && <div style={{ color: "var(--error, #f85149)" }}>{gate.error}</div>}
      <div style={muted}>{gate.file}</div>
    </div>
  );
}

export function Row({ v, children }: { v: StoryView; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const label = rowLabel(v);
  // A waiver's and a claim's reason are always visible: a waiver should be
  // uncomfortable to look at, and a claim needs saying why it is not believed.
  const alwaysNote = (label === "waived" || label === "claimed") && v.note;
  return (
    <div data-row={v.story.id} style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ ...muted, fontSize: 11, minWidth: 32 }}>{v.story.id}</span>
        <span onClick={() => setOpen((o) => !o)} style={{ flex: 1, cursor: "pointer" }}>{v.story.title}</span>
        <span data-state={label} style={{ fontSize: 11, color: label === "claimed" ? "var(--warning, #d29922)" : undefined }}>{label}</span>
        {children}
      </div>
      {alwaysNote && <div style={{ ...muted, fontSize: 11, paddingLeft: 40 }}>{v.note}</div>}
      {open && <div style={{ paddingLeft: 40 }}><GateDetail gate={v.gate} /></div>}
    </div>
  );
}

function WorkItems({ methodology, board, renderActions }: { methodology: "v4" | "v6"; board: BoardState; renderActions(v: StoryView): React.ReactNode }) {
  if (board.noInitiative) return <div style={{ ...section, ...muted }}>No active initiative yet. Start one with bmad-spec.</div>;
  if (board.stories.length === 0) return <div style={{ ...section, ...muted }}>No {methodology === "v6" ? "tickets" : "stories"} yet.</div>;

  const rows = (refs: string[] | null) =>
    board.stories.filter((v) => refs === null || refs.includes(v.story.id)).map((v) => <Row key={v.story.id} v={v}>{renderActions(v)}</Row>);

  if (methodology === "v4" || !board.epics) {
    return <div style={section}><div style={heading}>Stories</div>{rows(null)}</div>;
  }
  const grouped = new Set(board.epics.flatMap((e) => e.refs));
  const other = board.stories.filter((v) => !grouped.has(v.story.id)).map((v) => v.story.id);
  return (
    <div style={section}>
      {board.epics.map((e) => (
        <div key={e.slug} style={{ marginBottom: 8 }}>
          <div style={heading}>{e.title}</div>
          {rows(e.refs)}
        </div>
      ))}
      {other.length > 0 && <div><div style={heading}>Other</div>{rows(other)}</div>}
    </div>
  );
}

function GateProblems({ board }: { board: BoardState }) {
  const unreadable = board.unmatchedGates.filter((g) => g.error);
  const unmatched = board.unmatchedGates.filter((g) => !g.error);
  if (!unmatched.length && !unreadable.length && !board.supersededGates.length && !board.problems?.length) return null;
  return (
    <div style={section}>
      <div style={heading}>Needs attention</div>
      {board.problems?.map((p) => <div key={p}>{p}</div>)}
      {unmatched.map((g) => <div key={g.file}>Gate for {g.storyId} matches no story or ticket: {g.file}</div>)}
      {unreadable.map((g) => <div key={g.file}>{g.file}: {g.error}</div>)}
      {board.supersededGates.map((g) => <div key={g.file} style={muted}>Superseded: {g.file}</div>)}
    </div>
  );
}

export default function BoardView({ methodology, board, stage, error, actions }: BoardViewProps) {
  return (
    <div style={{ overflowY: "auto", flex: 1, fontSize: 12 }}>
      {error && (
        <div role="alert" style={{ ...section, color: "var(--error, #f85149)" }}>
          Could not refresh: {error}
        </div>
      )}
      <StageRail board={board} stage={stage} />
      <Artifacts board={board} onOpen={actions.onOpen} />
      <WorkItems methodology={methodology} board={board} renderActions={() => null} />
      <GateProblems board={board} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/__tests__/BoardView.test.tsx && npx tsc --noEmit`
Expected: PASS. If the "skipped" test fails because `buildBoard` reports the brief stage incomplete with later evidence present, check `buildBoard`'s `anyLaterEvidence` rule: Brainstorming is `complete` with its own artifact absent — the condition used for `data-skipped`.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/BoardView.tsx src/components/__tests__/BoardView.test.tsx
git commit -m "feat(board): read-only board view"
```

---

### Task 11: Actions in the view (part B)

**Files:**
- Modify: `src/components/board/BoardView.tsx`
- Test: `src/components/__tests__/BoardViewActions.test.tsx`

**Interfaces:**
- Consumes: `BoardActions.onApprove/onDispatch/onStage` (Task 10), `StageView` (Task 8).
- Produces: per-row **Approve** (only when `v.state === "draft"` and `onApprove` given), **Dispatch** (only when `v.dispatchable` and the label is not `done ✓`/`waived`, and `onDispatch` given); stage controls: **Next →** (`stage.next`), **← Back** (`stage.prev`), **Track stage** (when `!stage.tracked`), a "claimed" note when `stage.claimed`, and a warning when `stage.invalid`. A rejected action shows its message on that row (or under the rail) and leaves the row as it was.

- [ ] **Step 1: Write the failing test** — `src/components/__tests__/BoardViewActions.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BoardView from "../board/BoardView";
import { buildBoard } from "../../stores/stageBoardStore";
import { stageView } from "../../lib/confirmedStage";

const story = (id: string, status: string) => ({ file: `docs/stories/${id}.x.md`, markdown: `# Story ${id}: T${id}\n\n## Status\n\n${status}\n` });
const board = buildBoard({
  config: null,
  artifactExists: (p) => ["docs/brief.md", "docs/prd", "docs/architecture"].includes(p),
  stories: [story("1.1", "Draft"), story("1.2", "Approved"), story("1.3", "InProgress")],
  gates: [],
});

function renderWith(file: string | null, actions: Record<string, unknown> = {}) {
  const all = { onOpen: vi.fn(), onApprove: vi.fn(async () => {}), onDispatch: vi.fn(async () => {}), onStage: vi.fn(async () => {}), ...actions };
  render(<BoardView methodology="v4" board={board} stage={stageView(board, file)} error={null} actions={all} />);
  return all;
}
const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement;

describe("BoardView actions", () => {
  it("offers Approve only on draft rows", () => {
    renderWith(null);
    expect(row("1.1").querySelector("button[data-action=approve]")).not.toBeNull();
    expect(row("1.2").querySelector("button[data-action=approve]")).toBeNull();
  });

  it("never offers Dispatch below approved", () => {
    renderWith(null);
    expect(row("1.1").querySelector("button[data-action=dispatch]")).toBeNull();
    expect(row("1.2").querySelector("button[data-action=dispatch]")).not.toBeNull();
    expect(row("1.3").querySelector("button[data-action=dispatch]")).not.toBeNull();
  });

  it("calls the action with the row and shows a failure on that row", async () => {
    const a = renderWith(null, { onApprove: vi.fn(async () => { throw new Error("Story is not a draft"); }) });
    fireEvent.click(row("1.1").querySelector("button[data-action=approve]")!);
    await waitFor(() => expect(row("1.1").textContent).toContain("Story is not a draft"));
    expect((a.onApprove as ReturnType<typeof vi.fn>).mock.calls[0][0].story.id).toBe("1.1");
  });

  it("offers Track stage, not Next, when the stage is not tracked", () => {
    const a = renderWith(null);
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Track stage" }));
    expect(a.onStage).toHaveBeenCalledWith(stageView(board, null).shown);
  });

  it("offers Next once the tracked stage's evidence is on disk, and Back", () => {
    const a = renderWith("design\n");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(a.onStage).toHaveBeenCalledWith("audit");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(a.onStage).toHaveBeenCalledWith("brainstorming");
  });

  it("marks a tracked stage ahead of the evidence as claimed, and warns on an invalid file", () => {
    renderWith("review\n");
    expect(screen.getByText(/claimed/i)).toBeTruthy();
  });

  it("warns when .ade/stage is not a stage", () => {
    renderWith("shipping\n");
    expect(screen.getByText(/\.ade\/stage is not a stage/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/__tests__/BoardViewActions.test.tsx`
Expected: FAIL (no action buttons rendered).

- [ ] **Step 3: Implement** — in `src/components/board/BoardView.tsx`:

Add a small async-button helper above `StageRail`:

```tsx
/** A button whose async action shows its own failure, leaving the row as it was. */
function ActionButton({ action, label, run, onError }: { action: string; label: string; run(): Promise<void>; onError(msg: string | null): void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-action={action}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        onError(null);
        try {
          await run();
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
      style={{ fontSize: 11, padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
```

Replace `Row` so it owns its error and renders actions:

```tsx
export function Row({ v, actions }: { v: StoryView; actions: BoardActions }) {
  const [open, setOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const label = rowLabel(v);
  const alwaysNote = (label === "waived" || label === "claimed") && v.note;
  // Nothing below approved is dispatched: `dispatchable` is the engines' rule.
  const canDispatch = v.dispatchable && label !== "done ✓" && label !== "waived";
  return (
    <div data-row={v.story.id} style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ ...muted, fontSize: 11, minWidth: 32 }}>{v.story.id}</span>
        <span onClick={() => setOpen((o) => !o)} style={{ flex: 1, cursor: "pointer" }}>{v.story.title}</span>
        <span data-state={label} style={{ fontSize: 11, color: label === "claimed" ? "var(--warning, #d29922)" : undefined }}>{label}</span>
        {v.state === "draft" && actions.onApprove && (
          <ActionButton action="approve" label="Approve" run={() => actions.onApprove!(v)} onError={setRowError} />
        )}
        {canDispatch && actions.onDispatch && (
          <ActionButton action="dispatch" label="Dispatch" run={() => actions.onDispatch!(v)} onError={setRowError} />
        )}
      </div>
      {alwaysNote && <div style={{ ...muted, fontSize: 11, paddingLeft: 40 }}>{v.note}</div>}
      {rowError && <div style={{ fontSize: 11, paddingLeft: 40, color: "var(--error, #f85149)" }}>{rowError}</div>}
      {open && <div style={{ paddingLeft: 40 }}><GateDetail gate={v.gate} /></div>}
    </div>
  );
}
```

In `WorkItems`, replace the `renderActions` prop with `actions: BoardActions` and render rows as `<Row key={v.story.id} v={v} actions={actions} />`. In `BoardView`, pass `actions={actions}` to `WorkItems`.

Add stage controls at the end of `StageRail` (give it an `actions: BoardActions` prop and pass it from `BoardView`):

```tsx
      <StageControls stage={stage} actions={actions} />
```

```tsx
function StageControls({ stage, actions }: { stage: StageView; actions: BoardActions }) {
  const [err, setErr] = useState<string | null>(null);
  if (!actions.onStage) return null;
  const go = (to: StageId) => () => actions.onStage!(to);
  return (
    <div style={{ marginTop: 6 }}>
      {stage.invalid && <div style={{ fontSize: 11, color: "var(--warning, #d29922)" }}>.ade/stage is not a stage; following the files.</div>}
      {stage.claimed && <div style={{ fontSize: 11, color: "var(--warning, #d29922)" }}>Stage claimed: the files only support {stage.derived}.</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {stage.prev && <ActionButton action="back" label="← Back" run={go(stage.prev)} onError={setErr} />}
        {!stage.tracked && <ActionButton action="track" label="Track stage" run={go(stage.shown)} onError={setErr} />}
        {stage.next && <ActionButton action="next" label="Next →" run={go(stage.next)} onError={setErr} />}
      </div>
      {err && <div style={{ fontSize: 11, color: "var(--error, #f85149)" }}>{err}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/__tests__/BoardView.test.tsx src/components/__tests__/BoardViewActions.test.tsx && npx tsc --noEmit`
Expected: PASS. The Task 10 tests still pass: their `actions` carry only `onOpen`, so no buttons render.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/BoardView.tsx src/components/__tests__/BoardViewActions.test.tsx
git commit -m "feat(board): approve, dispatch and stage controls"
```

---

### Task 12: `BoardPanel` container and App wiring

**Files:**
- Create: `src/components/board/BoardPanel.tsx`
- Modify: `src/App.tsx` (state ~line 61, toggles ~line 207, `useKeybindings` ~line 406, render ~lines 465–505), `src/hooks/useKeybindings.ts` (~lines 23, 81), `src/lib/shortcuts.ts` (`SHORTCUTS`, after `preview`), `src/lib/shortcutList.ts` (~line 56), `src/components/CommandPalette.tsx` (lines 114–131), `src/index.css` (remove `.bmad-panel*` rules from ~line 306)
- Delete: `src/components/BmadPanel.tsx`
- Test: `src/components/__tests__/BoardPanel.test.tsx`

**Interfaces:**
- Consumes: `useBoardPanel` (Task 9); `BoardView` (Tasks 10–11); `stageView`, `writeStage` (Task 8); `approveStory`, `approveTicket` (Task 8); `dispatchAgent` (Task 4); `watchTargets`, `WATCH_EXTENSIONS` (Task 7); `tauriFs` (Task 2); `setUpProject` (`src/lib/projectSetup.ts`); `openFileFromTerminal(path: string): void` (`src/lib/openFile.ts`); `ROLE_ITEMS` (`src/data/pickerItems.ts`); `useSettingsStore` (`defaultProvider`).
- Produces: `export default function BoardPanel(props: { cwd: string | null; onClose(): void })`; shortcut id `board` = `{ key: "y", shift: true }` (⌘⇧Y / Ctrl+Alt+Shift+Y); palette entry "View: Toggle stage board"; window event `toggle-board`.

- [ ] **Step 1: Write the failing test** — `src/components/__tests__/BoardPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "project_root") return args.path === "/home/u" ? "/home/u" : "/p";
    if (cmd === "path_exists") return false;
    if (cmd === "watch_directory") return 1;
    return null;
  }),
  Channel: class { onmessage: unknown = null; },
}));

const store = vi.hoisted(() => ({ methodology: null as "v4" | "v6" | null }));
vi.mock("../../stores/boardPanelStore", async () => {
  const { create } = await import("zustand");
  const useBoardPanel = create(() => ({
    root: "/p", methodology: store.methodology, board: null, stageFile: null, error: null, loading: false,
    show: vi.fn(), refresh: vi.fn(async () => {}), scheduleRefresh: vi.fn(),
  }));
  return { useBoardPanel };
});

import BoardPanel from "../board/BoardPanel";

describe("BoardPanel", () => {
  it("says so when the pane has no project", () => {
    render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    expect(screen.getByText("No project in this pane")).toBeTruthy();
  });

  it("offers setup for a project with no BMAD", async () => {
    store.methodology = null;
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("This project isn't set up for BMAD")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Set up now" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/__tests__/BoardPanel.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** — `src/components/board/BoardPanel.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import BoardView, { type BoardActions } from "./BoardView";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { stageView, writeStage } from "../../lib/confirmedStage";
import { approveStory, approveTicket } from "../../lib/boardActions";
import { dispatchAgent } from "../../lib/agentLaunch";
import { watchTargets, WATCH_EXTENSIONS } from "../../lib/boardWatch";
import { tauriFs } from "../../lib/tauriFs";
import { setUpProject, isSetupCandidate } from "../../lib/projectSetup";
import { ROLE_ITEMS } from "../../data/pickerItems";
import { useSettingsStore } from "../../stores/settingsStore";
import { joinPath } from "../../lib/bmadRuntime/paths";
import { openFileFromTerminal } from "../../lib/openFile";

interface Props {
  cwd: string | null;
  onClose(): void;
}

/** Watch the board's folders while they exist; any change schedules a rebuild. */
function useBoardWatch(dirs: string[], onChange: () => void) {
  const key = dirs.join("\n");
  useEffect(() => {
    let cancelled = false;
    const ids: number[] = [];
    (async () => {
      for (const dir of dirs) {
        if (cancelled || !(await tauriFs.exists(dir).catch(() => false))) continue;
        const channel = new Channel<{ type: string }>();
        channel.onmessage = () => { if (!cancelled) onChange(); };
        const id = await invoke<number>("watch_directory", { dir, extensions: WATCH_EXTENSIONS, onEvent: channel }).catch(() => null);
        if (id === null) continue;
        if (cancelled) invoke("unwatch_directory", { id }).catch(() => {});
        else ids.push(id);
      }
    })();
    return () => {
      cancelled = true;
      for (const id of ids) invoke("unwatch_directory", { id }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the folder list
  }, [key]);
}

export default function BoardPanel({ cwd, onClose }: Props) {
  const [root, setRoot] = useState<string | null>(null);
  const { methodology, board, stageFile, error, loading, show, refresh, scheduleRefresh } = useBoardPanel();
  const [setupError, setSetupError] = useState<string | null>(null);

  // The active pane's project, by the same walk-up agent launches use.
  useEffect(() => {
    let live = true;
    if (!cwd) { setRoot(null); return; }
    invoke<string>("project_root", { path: cwd })
      .catch(() => cwd)
      .then((r) => { if (live) setRoot(isSetupCandidate(r) ? r : null); });
    return () => { live = false; };
  }, [cwd]);

  useEffect(() => { show(root); }, [root, show]);

  // A missed watcher event costs a refresh, not correctness.
  useEffect(() => {
    const onFocus = () => scheduleRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [scheduleRefresh]);

  const dirs = useMemo(
    () => (root && methodology ? watchTargets(root, methodology, board?.paths ?? null) : []),
    [root, methodology, board?.paths],
  );
  useBoardWatch(dirs, scheduleRefresh);

  const actions: BoardActions = useMemo(() => ({
    onOpen: (path) => { if (root) openFileFromTerminal(joinPath(root, path)); },
    onApprove: async (v) => {
      if (!root) return;
      if (methodology === "v6") await approveTicket(root, v.story.id, tauriFs);
      else await approveStory(root, v.story.file, tauriFs);
      await refresh();
    },
    onDispatch: async (v) => {
      if (!root) return;
      const dev = ROLE_ITEMS.find((i) => i.roleId === "developer");
      const what = methodology === "v6" ? "ticket" : "story";
      const err = await dispatchAgent({
        name: `${dev?.name ?? "Developer"} ${v.story.id}`,
        icon: dev?.icon ?? "D",
        spec: { roleId: "developer", provider: useSettingsStore.getState().defaultProvider },
        cwd: root,
        task: `Implement ${what} ${v.story.id}${v.story.file ? ` (${v.story.file})` : ""}.`,
      });
      if (err) throw new Error(err);
    },
    onStage: async (to) => {
      if (!root) return;
      await writeStage(root, to, tauriFs);
      await refresh();
    },
  }), [root, methodology, refresh]);

  const body = (() => {
    if (!cwd || (!root && !loading)) return <Empty>No project in this pane</Empty>;
    if (!methodology && !loading && !board) {
      return (
        <Empty>
          <div>This project isn't set up for BMAD</div>
          <button
            type="button"
            onClick={async () => {
              setSetupError(null);
              try {
                const result = await setUpProject(root!);
                window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result }));
                await refresh();
              } catch (e) {
                setSetupError(String(e));
              }
            }}
          >
            Set up now
          </button>
          {setupError && <div role="alert">{setupError}</div>}
        </Empty>
      );
    }
    if (!board || !methodology) return error ? <Empty><div role="alert">{error}</div></Empty> : <Empty>Loading…</Empty>;
    return <BoardView methodology={methodology} board={board} stage={stageView(board, stageFile)} error={error} actions={actions} />;
  })();

  return (
    <div style={{ width: 380, height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Board{methodology ? ` · BMAD ${methodology}` : ""}</span>
        <button type="button" aria-label="Close board" onClick={onClose} style={{ background: "none", border: 0, color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
      </div>
      {body}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 16, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}
```

`openFileFromTerminal(path)` (`src/lib/openFile.ts`) shows documents in Preview and anything else in an editor tab, the same as clicking a path in a terminal.

Wiring:

1. `src/lib/shortcuts.ts` — in `SHORTCUTS`, after `preview`:
   ```ts
   board: { key: "y", shift: true },
   ```
   Then run `npx vitest run src/lib/__tests__/shortcuts.test.ts`; if it reports a collision, pick the next free letter and use it everywhere below.
2. `src/hooks/useKeybindings.ts` — add `toggleBoard: () => void;` to the actions interface beside `togglePreview`, and beside `if (is("preview")) ...`:
   ```ts
   if (is("board")) return run(actions.toggleBoard);
   ```
3. `src/lib/shortcutList.ts` — after the Preview line:
   ```ts
   { keys: L("board"), action: "Stage board", short: "Board" },
   ```
4. `src/App.tsx`:
   - Replace `const BmadPanel = lazy(() => import("./components/BmadPanel"));` with `const BoardPanel = lazy(() => import("./components/board/BoardPanel"));`
   - Replace `const [bmadOpen, setBmadOpen] = useState(false);` with `const [boardOpen, setBoardOpen] = useState(false);`
   - Add `const toggleBoard = useCallback(() => setBoardOpen((prev) => !prev), []);` beside `togglePreview`.
   - In the window-event toggles, remove `const toggleBmad = ...` and the `["toggle-bmad", toggleBmad]` entry; add `["toggle-board", toggleBoard]` and add `toggleBoard` to that effect's dependency list.
   - Pass `toggleBoard` to `useKeybindings({...})`.
   - Delete the `{bmadOpen && (<BmadPanel ... />)}` block.
   - After the `{previewOpen && (...)}` block (inside the same flex row), add:
     ```tsx
     {boardOpen && (
       <Suspense fallback={null}>
         <BoardPanel cwd={activeCwd} onClose={() => setBoardOpen(false)} />
       </Suspense>
     )}
     ```
5. `src/components/CommandPalette.tsx` — replace the `bmad-toggle` entry with:
   ```ts
   { id: "board-toggle", label: "View: Toggle stage board", shortcut: L("board"), category: "Panels", action: () => { window.dispatchEvent(new CustomEvent("toggle-board")); onClose(); } },
   ```
6. Delete `src/components/BmadPanel.tsx` and the `.bmad-panel-overlay`, `.bmad-panel`, `.bmad-panel__*` and `.bmad-phase` rules in `src/index.css`. Run `grep -rn "bmad-panel\|bmad-phase\|BmadPanel" src` — the only remaining hits may be comments in `AgentPicker.test.tsx`, `pickerItems.ts` and `pickerItems.test.ts`, which describe history and stay.

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/board src/components/__tests__/BoardPanel.test.tsx src/App.tsx src/hooks/useKeybindings.ts src/lib/shortcuts.ts src/lib/shortcutList.ts src/components/CommandPalette.tsx src/index.css src/components/BmadPanel.tsx
git commit -m "feat(board): stage board side panel replaces the BMAD phases overlay"
```

---

### Task 13: Documentation

**Files:**
- Modify: `docs/guide/agents.md` (~line 110, the BMAD panel paragraph), `docs/guide/project-setup.md` (file layout block; "The methodology" section)

**Interfaces:** none.

- [ ] **Step 1: Replace the BMAD panel paragraph in `docs/guide/agents.md`** with:

```markdown
The **stage board** (*View: Toggle stage board*, {% include key.html mac="⌘⇧Y" other="Ctrl+Alt+Shift+Y" %}) is a panel beside your terminals for the project of the active pane. It shows where the project is in BMAD's five stages, which plan documents exist, and every story (v4) or ticket (v6) with its state. A story that says it is done without a passing QA gate shows as **claimed**, and a waiver always shows its reason. It refreshes as agents write files.

From the board you can **Approve** a draft, **Dispatch** an approved story to a developer agent in a new tab, and move the project's stage with **Next** and **Back**. Next appears only once the current stage's documents are on disk. A project that has never had its stage set follows its files until you click **Track stage**.
```

If the shortcut letter changed in Task 12, use that letter here.

- [ ] **Step 2: In `docs/guide/project-setup.md`**, add to the file-layout block after `.ade/gates/`:

```text
.ade/approvals/               approved v6 tickets, one file per ticket (v6)
.ade/stage                    the stage you confirmed on the board
```

and append to the end of "### File layout" a sentence after the block:

```markdown
`.ade/stage` and `.ade/approvals/` are written only when you click on the board. Commit them with the rest of `.ade/` so the team shares them.
```

- [ ] **Step 3: Check the site build claims**

Run: `npx vitest run scripts/siteClaims.test.ts`
Expected: PASS. If it flags the new shortcut text, match its expected format.

- [ ] **Step 4: Commit**

```bash
git add docs/guide/agents.md docs/guide/project-setup.md
git commit -m "docs(guide): the stage board"
```

---

## Self-review notes

- Spec coverage: placement and toggle (Task 12); `tauriFs` and the two commands (1–2); engine additions (5); v4 gathering (6); refresh, debounce, serialization, last-good board, project switch (7, 9, 12); rendering incl. skipped, claimed, waived, epics, problems, no-initiative, gate problems (10); approve v4/v6, dispatch with task, stage advance with Track/claimed/invalid (3, 4, 8, 11, 12); empty and setup states (12); docs (13).
- Dispatch below approved: engine rule (`dispatchable`) + view rule (Task 11 test "never offers Dispatch below approved") + v6 rule (Task 5 tests).
