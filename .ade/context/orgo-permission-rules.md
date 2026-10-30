# Orgo permission rules

Decided in ADR 0010 (`decisions/0010-agent-computers-are-orgo-only-and-made-on-click.md`); built in Story 1 of `_bmad-output/plan-orgo-agent-computers.md`.

## Where the rules live

`src-tauri/src/orgo_rules.rs` is the only source. Every Orgo rule ADE passes on a launch line or writes to a settings file comes from it, and the webview cannot add one. Other plans (the CLI library's `orgo` entry) reuse these lists and must not redefine them.

- `MCP_ASK`: 23 ask rules, verb globs on the tool name with a glob for the server, e.g. `mcp__*orgo*__*create*`. Checked by `ask_globs_catch_every_lifecycle_write_and_no_read` against `src-tauri/src/orgo_operations.json` (Orgo's spec, fetched 2026-10-30, 87 operations, plus hypothetical REST write-verb names marked as such). The only read they match is `get_client_billing`. Recorded misfires (they ask, harmlessly) and narrowings (`*heal_*`, `*clone_computer*`) are in the plan's AC9.

## The three places

1. **Every Claude Code launch ADE makes** (picker, board's `dispatchAgent`, Orchestrator) carries `--settings '{"permissions":{"ask":[…MCP_ASK]}}'`.
   - Rust command `orgo_launch_rules()` takes no arguments and returns `{ "ask": [...] }`. No project or folder decides the rules.
   - `src/lib/orgoRules.ts`: `LaunchRules { ask: string[] }`; `loadLaunchRules(): Promise<LaunchRules>` caches only a successful load and rejects on failure; `RULES_UNAVAILABLE` is the refusal message. Every caller refuses to launch when it rejects (fail closed), Codex and Ollama included.
   - `LaunchOptions.rules` is required, and so is `buildLaunchCommand`'s `opts`, so `npx tsc --noEmit` fails on a launch path that leaves them out. The capability probes use a module-private `PROBE_RULES`; don't export it.
2. **`<main>/.claude/settings.local.json`**, where `<main>` is `claude_settings::main_checkout_root(<root>)`: the main checkout in a linked worktree, `<root>` otherwise (normal checkout, submodule, `--separate-git-dir`, bare repo's worktree, anything unreadable). Written through `usage::edit_local_settings` (the settings lock).
3. **`<root>/.claude/settings.json`**, the file teammates get. `<root>` is `project_root`, the git root (the worktree root inside a worktree).

`mcp_install(project, "orgo", …)` checks `.mcp.json` and both settings files first and writes nothing if any is invalid or has a non-list `permissions.ask`. It returns the rules it added to either file (`[]` on a repeat install, and for every other server).

## Invariants

- ADE merges, never replaces: `claude_settings::merge_rules(obj, list, rules)` appends missing rules once, in order, after the user's. Every user key and value is kept; keys may be re-sorted (serde_json without `preserve_order`; deferred).
- ADE never deletes a rule. `mcp_remove` takes the server out of `.mcp.json` only.
- ADE never edits `~/.claude/settings.json` or `~/.claude.json`.
