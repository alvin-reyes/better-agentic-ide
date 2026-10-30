---
title: 'The Orchestrator''s Anthropic API key lives in the vault, not in saved settings'
type: 'bugfix'
ticket: ''
created: '2026-10-29'
status: 'draft'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['adversarial']
review_loop_iteration: 1
context: ['.ade/context/decisions/0013-orchestrator-anthropic-key-is-an-app-only-vault-secret.md']
---

One story. It moves an existing secret out of plain-text files, so it needs both a migration and a security fix. Nothing here is visual beyond one settings field.

ADR numbers are provisional. They are checked again at merge time, whichever branch lands first, because 0008–0012 are already taken or proposed on unmerged branches.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Orchestrator keeps the user's Anthropic API key as the setting `anthropicApiKey`, in plain text. It is saved to localStorage, to `<app data>/state/kv/better-terminal-settings.json`, and to every copy of that file under `state/snapshots/` (up to 20 are kept). Sync strips it (`src-tauri/src/sync.rs:51`), but the disk keeps it unencrypted. The DeepSeek key next to it is already read from the OS-keychain vault (`src/lib/anthropic.ts:176`).

**Approach:** Keep the key in the vault under its own name, which is never exported to terminals. On first launch after the update, move any saved key into the vault, check the vault holds it, then remove it from settings and from every snapshot. The Settings → AI API field becomes a vault-backed field. The Orchestrator reads the key with `vault_get`, the same way it reads the DeepSeek key.

## Owner's decisions (2026-10-29)

1. Fix it: "Yes, plan and build it" (owner, 2026-10-29, approving the intent above).
2. The verification command is unchanged.

</frozen-after-approval>

## Open questions for the owner (settle before approval)

1. **Vault name and terminal export.** Recommended: `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, kept out of terminals by a fixed list of app-only names in `vault.rs`. The general per-secret "not in terminals" option stays deferred, as the Orgo plan left it. Using `ANTHROPIC_API_KEY` is **rejected**. The reasons are in Design Notes, *Why not `ANTHROPIC_API_KEY`*. Confirm the name, and confirm a fixed list rather than the general option.
2. **No fallback to an existing `ANTHROPIC_API_KEY` vault entry.** DeepSeek reuses the terminal key, but this provider will not. Reusing it would reward storing `ANTHROPIC_API_KEY` in the vault, and that switches every ADE terminal's Claude Code to API billing. Recommended: no fallback.
3. **What happens without a working keychain.** This covers Linux without Secret Service, and a keychain that keeps refusing. The move fails at every launch, and the Orchestrator can no longer use the key: it never reads the plain-text copy, because keeping that read path would keep the bug. DeepSeek already behaves this way. Meanwhile the copy stays in plain text in `kv/`, localStorage and the snapshots. Settings → AI API says why, and offers **Remove the saved copy**, which deletes it from all three (AC 13). The trade-off: these users either keep a plain-text key the Orchestrator ignores, or delete it and lose the Anthropic Orchestrator until the keychain works. A Console key can't be viewed again, so after deleting they would need a new key. The alternative is to keep reading the plain-text copy only when the keychain is unavailable. That keeps today's behaviour, and today's exposure, for exactly these users. Recommended: no plain-text read; offer the removal.

## Boundaries & Constraints

**Always:**
- The key is in at least one of the two places at every moment. The order is: write to the vault, read it back and compare, write the stripped settings to disk, update localStorage, then scrub. If a step fails or the app crashes, a later step never runs, so the next launch repeats the move from the start.
- The move is idempotent. A second run with nothing to move does no vault write.
- The webview receives the key's value in only three places: the Orchestrator's request path, the move's step 3 (checking for an existing entry) and the move's step 4 (the read-back after writing). The settings UI uses `vault_list` (names only).
- The key's vault name is never exported into a terminal environment. That holds on both paths: a fresh read and a cached read.
- `ADE_ORCHESTRATOR_ANTHROPIC_KEY` must be on any future `vault_get` allowlist. The Orgo plan proposes one ("Story 2 first limits it to an allowlist, which today is `DEEPSEEK_API_KEY`", `plan/orgo-agent-computers`, plan :116, :210, :652), though its Stories 2–6 are deferred. This is recorded in the context file and ADR 0013 and pinned by T19.
- **Import rule:** `src/lib/anthropicKey.ts` imports only `@tauri-apps/api/core`. It must never import `settingsStore`, directly or through `anthropic.ts` (which imports it at :3). Otherwise the store is evaluated at boot before `hydrateFromDisk` and reads stale values. `settingsStore`, `anthropic.ts` and the UI may import `anthropicKey.ts`. Pinned by T16.
- Keep `sync.rs` `SECRET_FIELDS = ["anthropicApiKey"]` and its stripping, and reuse it for the scrub. A settings file can still bring the field back: from a backup of the state directory, from a machine not yet updated, or from a snapshot restored before the scrub ran. The stripping keeps that copy out of the sync repo, and the next launch moves it again.

**Never:**
- No `ANTHROPIC_API_KEY` vault entry, and no write of any Anthropic credential into a terminal environment.
- No plain-text fallback read of the old setting by the Orchestrator.
- No general per-secret "not in terminals" option, no Secrets-tab toggle, no change to the vault index file (`vault-index.json`). `vault_list` gains a computed `inTerminals` field in its reply only.
- No `vault_get` allowlist in this story (Orgo owns that); only the constraint above.
- No change to the DeepSeek or Ollama paths, to sync's behaviour, or to `relay/` or `mobile/`.
- No edit to `.ade/session.md` in this story (the journal line is written at approval).

## What this fix does not remove (stated honestly)

The move removes the key from the files ADE controls: localStorage's current value, `kv/`, every snapshot, and leftover temp files and restore directories under `state/`. Copies may remain in places ADE cannot reach:

- **The webview's own storage files.** On macOS, WebKit keeps localStorage in SQLite under `~/Library/WebKit/<bundle id>/WebsiteData/LocalStorage/`. On Linux, WebKitGTK keeps it in SQLite under the app's data directory. On Windows, WebView2 uses LevelDB under `EBWebView/Default/Local Storage/leveldb/`. Old pages and log segments (`-wal`, `.log`, `.ldb`) can hold the old value until the engine compacts them.
- OS backups (Time Machine, File History) and any copy of the app data directory made before the update.
- Any process that ran in an ADE terminal. The key never reached terminals as a variable, but agents there could read the files above.

So after a successful move, the field tells the user to **rotate the key** at console.anthropic.com, until they dismiss the hint (AC 15). The manual check below greps the webview data directory as well as `state/`.

Separately, "not exported to terminals" means the key is not handed to terminal processes. It does not mean they cannot get it: on Linux, `secret-tool lookup service com.betterterminal.vault …` works for any process of the same user, and `CredRead` likewise on Windows. On macOS, keychain access control lists apply. The vault has always had this property.

## I/O & Edge-Case Matrix

| Scenario | State at launch | Result | On failure |
|---|---|---|---|
| Key saved | settings `anthropicApiKey: "sk-ant-K"`, vault has no entry | vault holds K (note "Orchestrator: Anthropic API key. Not exported to terminals."); field removed from kv, localStorage and everything under `state/`; rotate hint set | settings untouched; reason shown in Settings → AI API with **Remove the saved copy** |
| Already moved | no field in settings | no vault call; scrub runs (a no-op unless something under `state/` still holds the field) | scrub failure logged, retried next launch |
| Empty field | `anthropicApiKey: ""` | field removed from settings and `state/`; no vault call | as above |
| Unparseable settings | localStorage settings not JSON, or not an object | nothing to move; no vault call, no disk write; scrub runs | none |
| Crash after vault write | settings K, vault K | next launch: the entry already exists, so only the strip and scrub run | none |
| Vault already holds another value | settings K1, vault K2 | vault keeps K2; K1 is removed from settings (after the move, a settings copy can only come from an older backup) | settings untouched |
| Vault write or read fails, or read-back differs | keychain locked, missing or denied | settings untouched, no disk write, no scrub | reason shown under the field; retried next launch; the user may remove the copy |
| Keychain hangs | `vault_get` or `vault_set` unanswered | after 5 s on steps 3–4, treated as a failure; boot goes on | a late write can only add K to the vault, which leaves K in both places for the next launch |
| Disk write of stripped settings fails | `state_write` rejects (step 5 has no timeout, see m5) | localStorage keeps K, no scrub; K is in the vault and on disk | retried next launch |
| Settings saved while the move has failed | user changes a setting | the field is carried into the saved JSON only while it is still in localStorage; the store's state never holds it | none |
| Old ADE running alongside, or a detached window reloaded by its ErrorBoundary | that process still holds the old settings in memory | it can re-save the field once; the next launch of the new build moves or strips it again | self-heals at the next launch |
| Snapshot restored later | a snapshot from before the scrub (none remain after a successful scrub), or a copy from outside ADE | next launch moves it again | as row 1 |
| Not under Tauri (tests, browser) | `invoke` throws | treated as a failure: no throw, settings untouched, boot continues | none |
| Keychain readable but not persistent | gnome-keyring's in-memory "session" collection, or an unsaved KeePassXC database | the read-back passes; the key is lost at the next reboot or lock | not detected: see *Persistence is not proven* |

## Code Map

- `src/stores/settingsStore.ts` -- `Settings.anthropicApiKey` :354, default :429, `setAnthropicApiKey` :504 (and in `SettingsStore`). `persistSettings` :411 writes `JSON.stringify(get())`, and `initial = {...defaults, ...migrate(saved)}` :463 spreads every saved field into the store.
- `src/components/SettingsPanel.tsx:961-975` -- the password input bound to the setting. `:146-152` is the `vault_list` presence check for `DEEPSEEK_API_KEY`.
- `src/components/IntegrationsPanel.tsx` -- the Secrets tab: `saveSecret` :109-119 and its notice "Terminals you open from now on have it", the rows :270-280, the footer :284-286 ("Each one is set as an environment variable in terminals…").
- `docs/guide/integrations.md:34` -- "every secret is set as an environment variable in terminals". `docs/guide/settings.md`, `docs/guide/agents.md:105` -- Orchestrator key copy.
- `src/lib/anthropic.ts:169-200` -- `sendOrchestratorMessage`. DeepSeek reads through `vault_get` at :176. Anthropic reads the setting at :190, and its missing-key copy is at :193.
- `src/main.tsx` `boot()` -- the main branch runs `syncBeforeLaunch` → `hydrateFromDisk` → `startAutoSave` (its first act is `state_snapshot`) → `migrateKept` … → `import("./stores/settingsStore")`. The detached branch runs only `startAutoSave({ snapshots: false })`.
- `src/lib/persistence.ts` -- `startAutoSave` mirrors `localStorage.setItem` to disk only once it has started. `flushNow` swallows errors. `PERSISTED_KEYS`, guarded by `src/lib/__tests__/persistedKeys.test.ts`.
- `src-tauri/src/vault.rs` -- `CACHE` :25 (process-global `OnceLock`), `valid_name` :59, `keychain_error` :108, `vault_list` :120, `vault_get` :138, `vault_set` :143 (cache insert :155), `env_for_terminals` :180 (complete-read check :194; its only caller is `pty.rs:168`). Tests start at :200. No tauri test feature (`Cargo.toml:24`), and the keyring mock keeps a value only inside one `Entry`, so `env_for_terminals` itself cannot be tested.
- `src-tauri/src/state.rs` -- `is_snapshotted` :26 (excludes only `ade-rec-`), `atomic_write` :65 (temp file `.<file name>.<pid>-<n>.tmp` :71-76), `snapshot` :133 (copies every file, temp files included), `restore_snapshot` :180 (`.kv-restore-*` :190, `.kv-old-*` :210-218), commands from :236, tests from :272.
- `src-tauri/src/sync.rs` -- `SECRET_FIELDS` :51, `strip_secrets` :54 (to become `pub(crate)`), `restore_secrets` :100 (drops the field when the local copy has none).
- `src-tauri/src/lib.rs:473, 482-485` -- command registration, guarded by `src/lib/__tests__/tauriCommandContract.test.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `src-tauri/src/vault.rs`
  - `pub const ORCHESTRATOR_ANTHROPIC_KEY: &str = "ADE_ORCHESTRATOR_ANTHROPIC_KEY"`, `const APP_ONLY: &[&str] = &["ADE_ORCHESTRATOR_ANTHROPIC_KEY"]` (a literal), and `pub fn in_terminals(name) -> bool`.
  - **Pure seam:** `fn terminal_env(cache: &mut Option<HashMap<String, String>>, names: Vec<SecretMeta>, read: impl Fn(&str) -> Option<String>) -> HashMap<String, String>`.
    - The cached path returns a clone of the cache. The fresh path reads every indexed name (app-only ones included, so the complete-read check `map.len() == total` still holds) and caches only a complete read.
    - **Both paths filter the returned map** through `in_terminals`. The cache itself is never filtered.
  - `env_for_terminals` becomes a thin wrapper: lock `CACHE`, read the index, pass the keychain reader.
  - `vault_get` maps `keyring::Error::NoEntry` to `"not found"` through a pure `get_error`.
  - `vault_list` returns `SecretInfo { name, note, updatedAt, inTerminals }`, computed by a pure `list_info(&[SecretMeta])`. `SecretMeta` and the index file are unchanged.
  - Tests: T1, T2, T15, T17.
- [ ] `src-tauri/src/state.rs` -- `scrub_secrets(state_dir) -> usize`, exposed as the command `state_scrub_secrets` and registered in `lib.rs`. Test T3.
  - Applies `sync::strip_secrets` to `better-terminal-settings.json` in `kv/`, in every `snapshots/*/`, and in any leftover `.kv-old-*` or `.kv-restore-*` directory. Those directories are stripped, not deleted: after a crash mid-restore, `.kv-old-*` may be the only copy of the state.
  - Deletes leftover temp files of that key (`.better-terminal-settings.json.*.tmp`) in all of those places. It runs before auto-save starts, so no write of its own is in flight.
  - Writes only files that changed, with `atomic_write`, and returns the count.
- [ ] `src/lib/anthropicKey.ts` (new; imports only `@tauri-apps/api/core`) -- tests T4–T9, T16 and T18 (AC 4–9, 12, 13).
  - `ANTHROPIC_VAULT_NAME` and `LEGACY_FIELD = "anthropicApiKey"`.
  - `moveAnthropicKeyToVault(): Promise<MoveResult>`, following the matrix and *The move, step by step*.
  - `lastMoveError(): string | null`.
  - `hasSavedCopy(): boolean`, which reads localStorage.
  - `carryLegacyField(nextSettingsJson)` for `persistSettings`.
  - `removeSavedCopy(): Promise<void>` (B1).
  - The rotate hint: the move sets `ade-anthropic-key-rotate-hint` on success, and `dismissRotateHint()` clears it. The key is added to `PERSISTED_KEYS`.
- [ ] `src/lib/boot.ts` (new) -- `bootMain(deps)` and `bootDetached(deps)`, the two branches of `boot()`. `main.tsx` only picks one and renders. `bootMain` awaits `moveAnthropicKeyToVault()` after `hydrateFromDisk()` and before `startAutoSave()`. `bootDetached` never calls it. Test T20.
- [ ] `src/stores/settingsStore.ts` -- remove `anthropicApiKey` and `setAnthropicApiKey`.
  - `migrate()` drops `LEGACY_FIELD`, so the store's state never holds the key.
  - `persistSettings` writes `carryLegacyField(JSON.stringify(settingsFields))`. The field is carried over only while it is still in localStorage, so a failed move never loses the key, and a removal or a move is never undone by a later save.
  - Test T10.
- [ ] `src/lib/anthropic.ts` -- the Anthropic provider reads `vault_get({ name: ANTHROPIC_VAULT_NAME })`. Tests T11 and T12.
  - `"not found"` or `""` gives the existing copy, "No Anthropic API key set. Go to Settings → AI API to add one."
  - Any other rejection shows the vault's own message. For an unavailable, locked or denied keychain that already reads "The system keychain isn't available: …" (`keychain_error`).
- [ ] `src/components/AnthropicKeyField.tsx` (new), used by `SettingsPanel.tsx` in place of the input. Test T13 (AC 14–16).
  - **Status line**, from `vault_list`: "Saved in the system keychain. Not exported to terminals." or "No key set."
  - **Key input:** a password input. Its button reads Save when no key is set and Replace when one is. It calls `vault_set` with the name and the note, then clears the input.
  - **Remove:** shown when a key is set. It asks for confirmation, then calls `vault_delete`.
  - **Failed move** (`lastMoveError()` set and `hasSavedCopy()` true): the reason, plus **Remove the saved copy** (confirm, then `removeSavedCopy()`).
  - **Rotate hint**, while set: "Your key was moved to the system keychain. Older copies may remain in backups and the app's web storage, so rotate it at console.anthropic.com." with Dismiss.
  - It never calls `vault_get` and never shows a value.
- [ ] `src/components/IntegrationsPanel.tsx` -- test T14.
  - A row with `inTerminals: false` says "Not in terminals".
  - The save notice says "Terminals you open from now on have it." only when the saved name is in terminals. For an app-only name it says "Saved to the system keychain. ADE uses it; terminals don't get it."
  - Footer: "Each one, except the few ADE keeps for itself (marked *Not in terminals*), is set as an environment variable…"
- [ ] `.ade/context/vault-app-only-secrets.md` (written with this plan, status proposed) -- keep it true to what is built: the name, the app-only rule, who reads the key (the Orchestrator and the move, through `vault_get`), and that the name must be on any `vault_get` allowlist. ADR 0013 becomes Accepted at approval.
- [ ] Docs:
  - `docs/guide/integrations.md:34`: the same exception as the Secrets footer.
  - `docs/guide/settings.md` and `docs/guide/agents.md:105`: the Anthropic key is stored in the system keychain, is not exported to terminals, and should be rotated after the upgrade.

**Acceptance Criteria** (each maps to a test, all run by the verification command):

1. Given an index holding `ADE_ORCHESTRATOR_ANTHROPIC_KEY` and `GITHUB_TOKEN`, when `terminal_env` runs with an empty cache, then the result has `GITHUB_TOKEN` and not the app-only name, and the cache is filled. When it runs again, the result is the same and `read` is not called. When the cache is pre-filled with both names (as `vault_set` leaves it), the result still excludes the app-only name. -- **T1** `vault.rs` `app_only_secrets_never_reach_terminals_fresh_or_cached`; **T2** `orchestrator_key_name_is_valid_and_not_read_by_claude_code` (`valid_name` passes; not `ANTHROPIC_*` or `CLAUDE_*`).
2. Given the keychain answers "no entry", `vault_get`'s error is exactly `"not found"`; any other keychain error keeps its message. -- **T17** `vault.rs` `missing_entry_reads_as_not_found`.
3. Given a state directory where the field is in `kv/`, in three snapshots, in a `.kv-old-*` directory, and in a `.better-terminal-settings.json.123-0.tmp` temp file in `kv/` and in one snapshot, and is absent from one snapshot: when `scrub_secrets` runs, then no file under the state directory contains the field or its value, the temp files are gone, every other field is unchanged, the clean snapshot is not rewritten, and a second run returns 0. -- **T3** `state.rs` `scrub_removes_the_old_key_everywhere_under_state`.
4. Given saved settings with `anthropicApiKey: "sk-ant-K"` and an empty vault, when the move runs, then the calls are, in order: `vault_get` (rejects `"not found"`), `vault_set` (name, K, note), `vault_get` (returns K), `state_write` (settings without the field), `state_scrub_secrets`; localStorage then has neither the field nor K, and the rotate hint is set. -- **T4** `anthropicKey.test.ts` "moves a saved key into the vault, then strips and scrubs".
5. Given the move has succeeded, a second run makes no `vault_set` call and no `state_write`, but still calls `state_scrub_secrets`. Given the vault already equals the settings value (crash after the write), the move strips without writing. -- **T5** "is idempotent, scrubs every launch, and finishes a move that crashed after the vault write".
6. In each of these cases, localStorage and disk still hold the key, `state_write` and `state_scrub_secrets` are not called, and `lastMoveError()` gives the reason: the first `vault_get` rejects with anything but `"not found"`; `vault_set` rejects; the read-back rejects or differs; steps 3–4 take longer than 5 s; or `invoke` throws because the app is not under Tauri. -- **T6** "keeps the key in settings when the vault fails" (one case each; fake timers for the timeout).
7. Given `state_write` rejects after a verified vault write, then localStorage still holds the field and no scrub runs. `state_write` is not subject to the timeout: a slow write still completes before the move returns. -- **T7** "keeps localStorage as it was when the disk write fails, and never times out the disk write".
8. Given `anthropicApiKey: ""`, the field is removed with no vault call. Given the vault already holds a different value, the vault keeps its value and the field is removed. Given localStorage settings that are not JSON or not an object, nothing is written and no vault call is made. -- **T8** "drops an empty field and ignores unreadable settings"; **T9** "the vault's existing value wins".
9. Given localStorage settings that still hold the field after a failed move, when the store loads, then its state has no `anthropicApiKey`. A later save keeps the field in the saved JSON. Once `removeSavedCopy()` or a move has stripped it, a later save does not bring it back. -- **T10** `src/stores/__tests__/settingsLeftoverKey.test.ts`.
10. Given the Anthropic provider, the Orchestrator calls `vault_get` with `ADE_ORCHESTRATOR_ANTHROPIC_KEY` and passes that value to the SDK client. -- **T11** `src/lib/__tests__/orchestratorAnthropicKey.test.ts`.
11. If `vault_get` rejects with `"not found"` or returns `""`, `onError` receives "No Anthropic API key set. Go to Settings → AI API to add one." If it rejects with "The system keychain isn't available: locked", `onError` receives that message. In both cases the SDK is not called. -- **T12a**, **T12b** in the same file.
12. `anthropicKey.ts` imports only `@tauri-apps/api/core`. No source under `src/` refers to `anthropicApiKey` or `setAnthropicApiKey` except through `LEGACY_FIELD` in `anthropicKey.ts`. -- **T16** in `anthropicKey.test.ts` (reads the sources), plus `npx tsc --noEmit` exit 0.
13. Given a failed move with the field still saved, `removeSavedCopy()` writes the settings without the field through `state_write`, removes it from localStorage, calls `state_scrub_secrets`, and makes no vault call. `hasSavedCopy()` is then false. -- **T18** in `anthropicKey.test.ts`.
14. `AnthropicKeyField`:
    - with no key in the vault, it shows "No key set" and a Save button;
    - after a value is typed and saved, `vault_set` receives the name, the value and the note, and the input is empty;
    - with a key set, the button reads Replace;
    - Remove calls `vault_delete` only after the confirm is accepted;
    - no render calls `vault_get` or shows the value.

    -- **T13a** `src/components/__tests__/AnthropicKeyField.test.tsx`.
15. With the rotate hint set, the field shows the rotate text, and Dismiss clears it. -- **T13b**.
16. With `lastMoveError()` set and a saved copy, the field shows the reason and **Remove the saved copy**. Accepting the confirm calls `removeSavedCopy()`, after which the action is gone. Without a saved copy, the action is not shown. -- **T13c**.
17. In the Secrets tab, a row with `inTerminals: false` says "Not in terminals". Saving an app-only name shows the app-only notice. Saving any other name shows "Terminals you open from now on have it." The footer names the exception. -- **T14** `src/components/__tests__/IntegrationsSecrets.test.tsx`.
18. `list_info` marks `ADE_ORCHESTRATOR_ANTHROPIC_KEY` `in_terminals: false` and every other name `true`. The TypeScript `ANTHROPIC_VAULT_NAME` equals the Rust literal. -- **T15** `vault.rs` `list_marks_app_only_names`, plus a name check in `anthropicKey.test.ts`.
19. Every `invoke("vault_get"` / `invoke<…>("vault_get"` call in `src/` is in `anthropic.ts` or `anthropicKey.ts`, and names either `DEEPSEEK_API_KEY` or `ANTHROPIC_VAULT_NAME`. A new caller fails until it is listed. -- **T19** `src/lib/__tests__/vaultGetCallers.test.ts`.
20. With `invoke` mocked and settings holding K:
    - `bootMain` makes, in order, `state_read_all` → `vault_get` → `vault_set` → `vault_get` → `state_write` → `state_scrub_secrets` → `state_snapshot`;
    - `bootDetached` makes no `vault_*` call;
    - a move that fails still lets `bootMain` reach `state_snapshot`.

    -- **T20** `src/lib/__tests__/boot.test.ts` (sync and the later launch steps injected as no-ops).

## Design Notes

### Why not `ANTHROPIC_API_KEY`

The vault exports every secret into every new ADE terminal (`vault.rs:4`, `pty.rs:168`). Claude Code's documented authentication precedence ranks `ANTHROPIC_API_KEY` third. Only cloud-provider settings and `ANTHROPIC_AUTH_TOKEN` rank above it. Subscription OAuth from `/login` ranks last, seventh. That page says:

- "If you have an active Claude subscription but also have `ANTHROPIC_API_KEY` set in your environment, Claude Code uses the API key once you approve it."
- "In interactive mode, you are prompted once to approve or decline the key, and your choice is remembered … In non-interactive mode (`-p`), the key is always used when present."
- When managed settings set `forceLoginMethod` or `forceLoginOrgUUID`, sessions that authenticate with `ANTHROPIC_API_KEY` are "blocked at startup". This applies only on machines with those settings.
- *Inference, not stated for this case:* the page says that features needing the claude.ai login, "such as claude.ai connectors and `/schedule`", are unavailable while a profile or federation credential is selected. An API key that replaces the login likely has the same effect.

Source: https://code.claude.com/docs/en/authentication, sections "Authentication precedence", "Log in to Claude Code", "Restrict login to your organization" and "Anthropic profiles and federation credentials" (read 2026-10-29).

Storing the key as `ANTHROPIC_API_KEY` would therefore put every Claude Code started in an ADE terminal on API billing. That applies at once to `-p` runs and to Agent SDK scripts, and after one prompt to interactive sessions. On machines whose managed settings set `forceLoginMethod` or `forceLoginOrgUUID`, it would stop Claude Code from starting at all. The Anthropic SDKs and many other tools also read that variable.

The new name is read by nothing outside ADE, and the app-only list also means the key is not handed to terminal processes. A same-user process can still ask the keychain for it: see *What this fix does not remove*. A user who wants API billing in terminals can still add `ANTHROPIC_API_KEY` themselves under Secrets, as today.

The vault has no per-secret export option today. The Orgo plan lists "A vault option to keep a secret out of terminals" as deferred (`plan/orgo-agent-computers`, `_bmad-output/plan-orgo-agent-computers.md:565`). This story adds only a fixed, code-owned list. `vault_list`'s computed `inTerminals` lets the UI follow it without a second list in TypeScript. When the general option is built, it should absorb `APP_ONLY` (ADR 0013).

### The move, step by step (`moveAnthropicKeyToVault`)

1. Parse `localStorage["better-terminal-settings"]`. If it is unreadable, not an object, or has no field → step 7.
2. Field is `""` → step 5.
3. `vault_get(NAME)`. A non-empty value means the vault wins → step 5. A rejection with `"not found"` → continue. Any other rejection is a failure.
4. `vault_set(NAME, K, note)`, then `vault_get(NAME)`, which must equal K. Otherwise this is a failure.
5. `state_write({ "better-terminal-settings": json without the field })`. A rejection is a failure. **No timeout:** a write that landed late could overwrite a newer auto-save flush and lose a settings change.
6. `localStorage.setItem` the same JSON and set the rotate hint (step 4 path only). `startAutoSave` has not started, so this does not queue a second write.
7. `state_scrub_secrets`. Its errors are logged, not fatal, and it runs at every launch.

Steps 3–4 share one 5 s bound. A failure records `lastMoveError` and returns, so nothing after it runs. A timed-out call that answers late can only add K to the vault.

`removeSavedCopy()` (B1) runs steps 5–7 without the vault steps, using the same functions.

### Why the field is carried by the store, not held in it

The store's state never holds `anthropicApiKey`. `persistSettings` copies the field from the current localStorage value into what it writes, and only while the field is there. A failed move therefore never loses the key through a settings save. Once the move or `removeSavedCopy()` has stripped localStorage, no later save from this window brings it back. A process that loaded before the strip and still holds the old JSON is the matrix row "Old ADE running alongside": it self-heals at the next launch.

### Why before `startAutoSave`

`startAutoSave` takes a snapshot of `kv/` straight away. Running the move first means that snapshot copies a clean file, and the scrub never races it. Because the move writes disk itself, it can see the write fail. With auto-save it could not, since `flushNow` swallows errors. `bootMain` is extracted so that T20 can pin this order.

### Persistence is not proven

The read-back in step 4 proves the keychain returns the value now, not that it will after a reboot. gnome-keyring's in-memory "session" collection, or a KeePassXC database that is never saved, would lose it, and a Console key cannot be viewed again. The plan does not wait for a second launch before stripping. That would keep the plain-text copy for at least one more launch, and it still would not catch a loss at the next reboot. The cost of a loss is a new key, and the rotate hint asks for one anyway.

### Settings field

The field follows the Secrets tab: names come from `vault_list`, a value goes in once, and it is replaced but never shown. It keeps the label "Anthropic API Key", the placeholder `sk-ant-...` and the console.anthropic.com hint.

## Review Triage Log

- 2026-10-30, adversarial review of the plan at 6e491dc: **BLOCK**, with 1 blocker, 5 major and 10 minor findings. The reviewer confirmed the app-only name, the single export path, that detached windows never run the move, `restore_secrets` dropping the field, the step 5/6 crash recovery, and the Claude Code authentication claims.

| Finding | Verdict | Action |
|---|---|---|
| B1 A failed move leaves the user no way to delete the plain-text key | blocker | patched: **Remove the saved copy** in the field; `removeSavedCopy()`; store carries the field without holding it; AC 9, 13, 16; owner Q3 restated |
| M1 AC1 untestable through `env_for_terminals`; filtering inside `filter_map` breaks the cache | major | patched: pure `terminal_env` seam; returned map filtered on both paths; cache unfiltered; AC 1 rewritten |
| M2 Conflicts with Orgo's proposed `vault_get` allowlist | major | patched: constraint in Boundaries, context file and ADR 0013; T19 pins `vault_get` callers |
| M3 Boot order untested; import rule unstated | major | patched: `bootMain`/`bootDetached` in `src/lib/boot.ts`, T20; import rule in Boundaries, T16 |
| M4 Overstates removal; no rotation advice | major | patched: *What this fix does not remove*; rotate hint (AC 15); manual check includes the webview data directory |
| M5 Every vault error shown as "no key set" | major | patched: only `"not found"` or `""` gives that copy; other errors pass through; T12a/T12b |
| m1 Scrub misses temp files and `.kv-old-*`/`.kv-restore-*` | minor | patched: temp files deleted, restore dirs stripped (not deleted, they can hold the only copy of state); T3 fixture includes both |
| m2 Same as M1 (filter returned map) | minor | patched with M1 |
| m3 Copy that becomes false (save notice, Secrets footer, `integrations.md:34`) | minor | patched: tasks and AC 17 |
| m4 T15 would parse a Rust `const` | minor | patched: literal `APP_ONLY`; `vault_list` returns computed `inTerminals`; AC 18 |
| m5 A late stripped write could overwrite a newer flush | minor | patched: step 5 outside the timeout; AC 7 |
| m6 :48 ignored step 3 returning the value | minor | patched: Boundaries lists all three reads |
| m7 Missing ACs | minor | patched: Remove/confirm and Replace (AC 14), scrub every launch (AC 5), not under Tauri (AC 6), unparseable JSON (AC 8) |
| m8 Read-back doesn't prove persistence | minor | stated in *Persistence is not proven*; second-launch strip rejected with reasons |
| m9 Old ADE alongside / reloaded detached window can re-save | minor | matrix row; self-heals |
| m10 Three overclaims | minor | patched: "not handed to", managed-settings condition, connectors marked as inference |

## Plan Change Log

- 2026-10-30, review round 1: everything outside the frozen block was revised for the findings above. The frozen Intent and Owner's decisions are unchanged.

## Verification

**Commands** (the agreed verification command, unchanged):
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including T4–T16, T18–T20
- `cd src-tauri && cargo test` -- expected: all pass, including T1–T3, T15, T17 and the existing `api_keys_never_reach_the_repo_and_each_machine_keeps_its_own`
- `cd relay && cargo test` -- expected: all pass (untouched)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (untouched)

**Manual checks** (not part of the verification command):
- With a key saved by the previous build, launch the new build. Then check each of these:
  - `grep -r sk-ant <app data>/state` finds nothing.
  - Settings → AI API shows the key as saved, with the rotate hint.
  - The Orchestrator answers.
  - `env | grep -i anthropic` in a new ADE terminal prints nothing.
- Report, without gating, whether the old value remains in the webview data directory. Use `grep -ra sk-ant` over the WebKit `LocalStorage` directory on macOS, the WebKitGTK `localstorage` directory on Linux, or `EBWebView/Default/Local Storage/leveldb` on Windows. This residue is expected (see *What this fix does not remove*).
- On a machine with no Secret Service: the field shows the reason and **Remove the saved copy**, and after removing it `grep -r sk-ant <app data>/state` finds nothing.
