# Configurable Multi-Model Terminals with Shared Context — Design

**Date:** 2026-07-19
**Status:** Approved (design). Implementation DEFERRED until the BMAD + sub-agent-views plan completes.
**App:** ADE — Agentic Development Environment (Tauri v2 + React 19 + xterm.js + Zustand)

## Summary

Let any terminal or sub-agent launch on a chosen model — **Claude, Kimi 3, DeepSeek V4 Pro** — all
driven through the existing `claude` CLI via environment routing, with a project-level shared
context file so models can build on each other's work.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Models | Claude (built-in), Kimi 3, DeepSeek V4 Pro |
| Launch mechanism | **Claude CLI + env routing** — `claude` with `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and model id. Kimi/DeepSeek must expose Anthropic-compatible endpoints. |
| Configurable scope | **Per-terminal AND per-sub-agent** |
| Context sharing | **Shared context file** `.ade/context.md` — injected into each launch, appendable |
| Credentials | **Settings UI, stored locally** (app's existing settings persistence), tokens masked |
| Sequencing | Build AFTER the BMAD/sub-agent plan |

## Existing code this builds on

- `src/data/agentProfiles.ts` — `Provider = "claude" | "codex" | "gemini" | "ollama"`, `PROVIDERS`,
  and `AgentProfile.providers: Record<Provider, string>` (per-provider launch command). The new
  **model** concept sits alongside providers, not replacing them.
- `src/components/AgentPicker.tsx` — detects installed CLIs (`check_command_exists`) and launches an
  agent into a pane; gains a model selector.
- `src/stores/settingsStore.ts` — has `defaultProvider`; gains model registry + `defaultModel`.
- `src/components/SettingsPanel.tsx` — gains a "Models" section.
- `src-tauri/src/pty.rs` — `create_pty(cwd)`; extended to accept an optional env map.
- `src/stores/tabStore.ts` — panes carry `initialCwd`; gain a recorded `modelId`.
- `src/components/Scratchpad.tsx` — existing PTY injection; gains "Save to shared context".

## Components

### 1. Model registry
`ModelConfig { id, label, baseUrl, authToken, modelId, color, builtin }`. Claude is a built-in entry
with no routing (empty env). Kimi 3 / DeepSeek V4 Pro are user-configured. Stored in `settingsStore`
(local persistence). `defaultModel` selects the launch default.

Env assembly (pure function, unit-tested):
- Claude built-in → `{}` (no overrides; uses the user's existing `claude` auth).
- Routed model → `{ ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL: modelId }` (and/or
  `--model` on the command; env preferred so tokens never enter the command string).

### 2. Credentials UI
A "Models" section in `SettingsPanel.tsx`: per model, inputs for base URL, auth token (masked),
model id. Add/edit/remove routed models. Optional "Test" button that pings the endpoint and reports
reachability. Persisted via `settingsStore`.

### 3. Launch plumbing (Rust)
Extend `create_pty` to accept `env: Option<HashMap<String,String>>` applied to the spawned command's
environment (via portable-pty `CommandBuilder::env`). Tokens flow through the process environment,
NOT the shell command string — keeping them out of `ps`, shell history, and the transcript.

### 4. Per-terminal & per-sub-agent selection
- **Terminal:** a model dropdown in the new-tab / AgentPicker flow, defaulting to `defaultModel`.
  Each pane records its `modelId`; a small colored badge (using `ModelConfig.color`) shows which
  model a terminal runs.
- **Sub-agent:** the AgentPicker profile launch and orchestrator task launch gain the same selector,
  so a sub-agent can run on a different model than its parent.

### 5. Shared context file
- ADE maintains `.ade/context.md` in the project root; ensures `.ade/` is gitignored.
- On launch, ADE reads `.ade/context.md` and injects its contents as a preamble into the model's
  initial prompt (model-agnostic — works for any CLI launched).
- Appending: Scratchpad gains a "Save to shared context" action; launch offers "append this session's
  notes to shared context". File-based only — no relay/daemon.

## Data flow

```
Settings "Models" ──▶ settingsStore(modelRegistry, defaultModel)
new terminal / sub-agent ──▶ pick modelId ──▶ assembleEnv(model) ──▶ invoke create_pty(cwd, env, cmd)
launch ──▶ read .ade/context.md ──▶ prepend as preamble to initial prompt
Scratchpad "Save to shared context" ──▶ append to .ade/context.md
```

## Error handling

- Selected model missing required fields → block launch with a message linking to Settings > Models.
- Unreachable endpoint → surface the `claude` CLI's own connection error in the terminal; do not swallow.
- `.ade/context.md` absent → treated as empty; created on first append.
- Built-in Claude with no config always works (no routing).

## Testing

- **Rust:** `create_pty` applies provided env vars (unit test spawns `printenv`/`env` and asserts a
  routed var appears; and that an empty/None env leaves the environment unmodified).
- **Frontend:** model-registry store (add/edit/select/remove, token masking); `assembleEnv` (Claude
  built-in → `{}`; routed model → correct `ANTHROPIC_*` map); pane records selected `modelId`.

## Scope guard (YAGNI)

- Routing is Claude-CLI-only; Kimi/DeepSeek require Anthropic-compatible endpoints.
- No live transcript relay; context sharing is file-based only.
- No OS keychain — local settings, matching the rest of the app.
- No automatic model fallback/failover.

## Open items for the plan

- Exact env var names Kimi/DeepSeek expect (`ANTHROPIC_MODEL` vs `--model`) — confirm against each
  provider's Anthropic-compatible docs when writing the plan.
- Whether the model badge lives in `TabBar.tsx` or `TerminalPane.tsx`.
- Whether context injection is a prompt preamble vs. a generated `CLAUDE.md` include (lean: preamble).
