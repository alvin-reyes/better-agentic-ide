# 0010: Agent computers are Orgo only, and made on a click

- Status: Accepted (owner, 2026-10-29), with the plan `_bmad-output/plan-orgo-agent-computers.md` (Stories 1 and 1b, approved at f32ca1e). ADR numbers are provisional and are re-checked at merge time: 0008 (hover), 0009 (manual checks), 0011 (CLI), 0012 (principles) and 0013 (the Orchestrator key) are on other unmerged branches.
- Context: The owner wants ADE to reach cloud computers that agents can drive: for computer use, Claude Code running remotely, a parallel fleet, and a throwaway sandbox. The provider is Orgo only. Its hosted MCP server (`https://www.orgo.ai/mcp`) signs in with the user's Orgo account and offers a reviewed tool list, which never includes a computer's root VNC password. Orgo's local server (`orgo-mcp-server`) needs an API key, returns `vnc_password` into model context, and registers password, SSH, secrets and workspace tools. Computers cost money until deleted. ADE's Continuous mode launches `claude --dangerously-skip-permissions`. Claude Code loads `.mcp.json` from parent directories but reads `.claude/settings.json` only from the session's primary working directory.
- Decision:
  - **Orgo only, no provider abstraction.** Agents reach Orgo through its hosted MCP server, with the user signing in through Claude Code's `/mcp`. No Orgo key is stored in ADE for this path.
  - **Lifecycle tools always ask.** One Rust module, `src-tauri/src/orgo_rules.rs`, holds the rules: verb globs with a server glob, such as `mcp__*orgo*__*create*`, covering create, clone, fork, resize, update (the end), start, resume, stop, delete and enable-SSH, plus write verbs Orgo's REST API already has. They are:
    - passed as `--settings` on every Claude Code launch ADE makes (the picker, the board and the Orchestrator), which `buildLaunchCommand`'s types require;
    - merged into the project's `.claude/settings.json`;
    - merged into the main checkout's root `.claude/settings.local.json`.
  - **In Continuous launches, creating and starting are denied** on the command line with `--disallowedTools`, unconditionally. That covers both MCP globs and `orgo` CLI Bash patterns.
  - **The native panel (later stories):** only a user's click creates, starts or resizes a computer, always with an end and under ADE's cap.
  - **ADE never** chooses hourly billing, runs billing commands, edits user-level Claude Code settings, or deletes a permission rule. It ships no credential to a computer except a dedicated, spend-limited key on a confirmed click. The panel's key is never sent to the webview, and `vault_get` gets an allowlist first.
- Consequences:
  - The spend limit on the agent paths is the user's Orgo plan or credit, behind a prompt, not ADE.
  - Rules in settings files can be removed by a bypass-mode agent the user started; launch flags cannot. An organisation policy of `allowManagedPermissionRulesOnly` voids both.
  - Globs fail open for future tool names that use none of the verbs, and misfire on some reads, which then ask. Both are recorded in the plan.
  - Bash rules are not a boundary around a program. The CLI's known gaps are listed, and the CLI story (1c) is on hold.
  - A second provider is new work, not configuration.
  - The first install may reorder a committed `.claude/settings.json`, keeping every value. Key-order preservation is deferred to its own story.
