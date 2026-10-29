# 0013: The Orchestrator's Anthropic key is an app-only vault secret

- Status: Proposed, with the plan `_bmad-output/plan-anthropic-key-in-vault.md` (owner approved the fix on 2026-10-29; the name and the app-only rule are open questions in that plan).
- Context: The Orchestrator's Anthropic API key was the setting `anthropicApiKey`, saved in plain text to localStorage, `state/kv/` and every `state/snapshots/` copy. The vault (`src-tauri/src/vault.rs`) keeps values in the OS keychain, but it exports every secret into every new ADE terminal. Claude Code ranks `ANTHROPIC_API_KEY` above a subscription `/login` (https://code.claude.com/docs/en/authentication, "Authentication precedence"): it is used straight away in `-p` runs, used after one prompt in interactive sessions, and blocked at startup under `forceLoginMethod`/`forceLoginOrgUUID`. The vault has no per-secret export option, and adding one was deferred in the Orgo plan.
- Decision:
  - The key is stored in the vault as `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, a name that nothing outside ADE reads.
  - `vault.rs` holds a fixed, code-owned list of app-only names (`APP_ONLY`) that `env_for_terminals` never exports, on both the cached path and the fresh-read path. The list's first entry is this key. `src/lib/anthropicKey.ts` mirrors the list for the Secrets tab, and a test pins the two lists together.
  - Nothing writes an Anthropic credential into a terminal environment. Users who want API billing in terminals add `ANTHROPIC_API_KEY` themselves under Secrets.
  - `sync.rs` `SECRET_FIELDS` keeps stripping `anthropicApiKey` for old payloads and backups.
- Consequences:
  - Claude Code in ADE terminals keeps the user's own login. The key no longer reaches processes that agents run.
  - The index format and the Secrets UI stay the same. A general "not in terminals" option, when built, should absorb `APP_ONLY` rather than run alongside it.
  - Without a working keychain, the Anthropic Orchestrator cannot run, as is already true for DeepSeek. There is no plain-text fallback.
