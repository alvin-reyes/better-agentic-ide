# 0013: The Orchestrator's Anthropic key is an app-only vault secret

- Status: Proposed, with the plan `_bmad-output/plan-anthropic-key-in-vault.md`. The owner approved the fix on 2026-10-29; the name and the app-only rule are open questions in that plan. The number is provisional and is checked again at merge time.
- Context: The Orchestrator's Anthropic API key was the setting `anthropicApiKey`, saved in plain text to localStorage, `state/kv/` and every `state/snapshots/` copy. The vault (`src-tauri/src/vault.rs`) keeps values in the OS keychain, but it exports every secret into every new ADE terminal. Claude Code ranks `ANTHROPIC_API_KEY` above a subscription `/login` (https://code.claude.com/docs/en/authentication, "Authentication precedence"). It is used straight away in `-p` runs and after one prompt in interactive sessions. Where managed settings set `forceLoginMethod` or `forceLoginOrgUUID`, it is blocked at startup. The vault has no per-secret export option, and adding one was deferred in the Orgo plan. That plan also proposes a `vault_get` allowlist; its Stories 2–6 are deferred.
- Decision:
  - The key is stored in the vault as `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, a name that nothing outside ADE reads.
  - `vault.rs` holds a fixed, code-owned list of app-only names (`APP_ONLY`, written as literals). The terminal environment never includes them: the pure `terminal_env` filters the map it returns, on both the cached and the fresh-read path. `vault_list` reports a computed `inTerminals` for each name, so the UI needs no second list.
  - `ADE_ORCHESTRATOR_ANTHROPIC_KEY` must be on any `vault_get` allowlist. Its readers are the Orchestrator (`src/lib/anthropic.ts`) and the one-time move (`src/lib/anthropicKey.ts`).
  - Nothing writes an Anthropic credential into a terminal environment. Users who want API billing in terminals add `ANTHROPIC_API_KEY` themselves under Secrets.
  - `sync.rs` `SECRET_FIELDS` keeps stripping `anthropicApiKey` for old payloads and backups.
- Consequences:
  - Claude Code in ADE terminals keeps the user's own login. The key is not handed to terminal processes. A same-user process can still query the keychain (for example `secret-tool` on Linux, `CredRead` on Windows), as for every vault secret.
  - The move cleans only what ADE controls (`state/` and localStorage's current value). Old copies may remain in the webview's storage files (WebKit SQLite, WebView2 LevelDB) until compaction, and in OS backups. So the user is told to rotate the key.
  - The index file and the Secrets UI keep their shape. A general "not in terminals" option, when built, should absorb `APP_ONLY` rather than run alongside it.
  - Without a working keychain, the Anthropic Orchestrator cannot run, as is already true for DeepSeek. There is no plain-text fallback. The user can remove the stranded plain-text copy from Settings → AI API.
