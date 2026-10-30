# Vault: app-only secrets

Status: approved with `_bmad-output/plan-anthropic-key-in-vault.md` (ADR 0013, accepted 2026-10-30). It becomes current as Stories A and B are Done.

- **App-only names** are listed as literals in `APP_ONLY` in `src-tauri/src/vault.rs`. Today the list is `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, also exported to Rust as `vault::ORCHESTRATOR_ANTHROPIC_KEY`. `vault::in_terminals(name)` is the one test of the list. Each name must pass `valid_name` and must not start with `ANTHROPIC_` or `CLAUDE_`.
- **They are never in a terminal's environment.** `terminal_env` filters the map it returns, on both the cached path and the fresh-read path. The cache itself keeps every name, so its complete-read check still holds.
- **`vault_list`** returns `{ name, note, updatedAt, inTerminals }`. `inTerminals` is computed, not stored. `vault-index.json` is unchanged. TypeScript keeps no list of its own: the Secrets tab (`IntegrationsPanel.tsx`) marks `inTerminals: false` rows "Not in terminals", and picks the save notice from the `vault_list` entry it reads back after `vault_set` (a neutral "saved" notice, and no error, when that read-back fails).
- **`vault_get`** rejects with exactly `"not found"` when there is no entry. Other errors keep `keychain_error`'s text.
- **Readers of `ADE_ORCHESTRATOR_ANTHROPIC_KEY`** (from Story B): the Orchestrator's Anthropic provider (`src/lib/anthropic.ts`) and the one-time move (`src/lib/anthropicKey.ts`). Any `vault_get` allowlist must include it, alongside `DEEPSEEK_API_KEY`. `src/lib/__tests__/vaultGetCallers.test.ts` lists every caller.
- **The old setting field `anthropicApiKey`** (from Story B) is named only as `LEGACY_FIELD` in `src/lib/anthropicKey.ts`. It is also in `SECRET_FIELDS` in `src-tauri/src/sync.rs`, which strips it, and `state_scrub_secrets` uses that list.
