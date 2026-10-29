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
lenses_ran: []
review_loop_iteration: 0
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
3. **No keychain, no Anthropic Orchestrator.** With no usable keychain (for example Linux without Secret Service), the move fails. The key stays in settings, and Settings → AI API says why. The Orchestrator does not read the leftover plain-text copy, because keeping that read path would keep the bug. DeepSeek already behaves this way. Recommended: accept.

## Boundaries & Constraints

**Always:**
- The key is in at least one of the two places at every moment. The order is: write to the vault, read it back and compare, write the stripped settings to disk, update localStorage, then scrub the snapshots. If a step fails or the app crashes, a later step never runs, so the next launch repeats the move from the start.
- The move is idempotent. A second run with nothing to move does no vault write.
- Nothing in the webview reads the key back except the Orchestrator's request path and the migration's single check after writing. The settings UI uses `vault_list` (names only).
- The key's vault name is never exported into a terminal environment. That holds on both paths: a fresh read in `env_for_terminals`, and the in-memory cache that `vault_set` updates.
- Keep `sync.rs` `SECRET_FIELDS = ["anthropicApiKey"]` and its stripping, and reuse it for the snapshot scrub. A settings file can still bring the old field back: from a backup of the state directory, from a machine not yet updated, or from a snapshot restored before the scrub ran. The stripping keeps that copy out of the sync repo, and the next launch moves it again.

**Never:**
- No `ANTHROPIC_API_KEY` vault entry, and no write of any Anthropic credential into a terminal environment.
- No plain-text fallback read of the old setting by the Orchestrator.
- No general per-secret "not in terminals" option, no Secrets-tab toggle, no change to the vault index format (`vault-index.json`).
- No change to the DeepSeek or Ollama paths, to sync's behaviour, or to `relay/` or `mobile/`.
- No edit to `.ade/session.md` in this story (the journal line is written at approval).

## I/O & Edge-Case Matrix

| Scenario | State at launch | Result | On failure |
|---|---|---|---|
| Key saved | settings `anthropicApiKey: "sk-ant-K"`, vault has no entry | vault holds K (note "Orchestrator: Anthropic API key. Not exported to terminals."); field removed from kv, localStorage and every snapshot | settings untouched; failure reason shown in Settings → AI API |
| Already moved | no field in settings | no vault call; snapshot scrub runs (a no-op unless a snapshot still holds the field) | scrub failure logged, retried next launch |
| Empty field | `anthropicApiKey: ""` | field removed from settings and snapshots; no vault call | as above |
| Crash after vault write | settings K, vault K | next launch: the entry already exists and equals K, so only the strip and scrub run | none |
| Vault already holds another value | settings K1, vault K2 | vault keeps K2; K1 is removed from settings (a settings copy can reappear only from an older backup) | settings untouched |
| Vault write or read fails, or read-back differs | keychain locked or missing | settings untouched, no disk write, no scrub | reason shown under the field; retried next launch |
| Keychain hangs | `vault_set` or `vault_get` unanswered | boot goes on after 5 s, treated as a failure | a late write leaves K in both places; the next launch finishes the move |
| Disk write of stripped settings fails | `state_write` rejects | localStorage keeps K, no scrub; K is in the vault and on disk | retried next launch |
| Settings saved while the move failed | user changes a setting | the leftover field is kept in the saved JSON (the store passes unknown fields through) | none |
| Snapshot restored later | a snapshot from before the scrub (none remain after a successful scrub) or a copy from outside ADE | next launch moves it again | as row 1 |
| Not under Tauri (tests, browser) | `invoke` throws | treated as a failure; settings untouched | none |

## Code Map

- `src/stores/settingsStore.ts` -- `Settings.anthropicApiKey` :354, default :429, `setAnthropicApiKey` :504 (and in `SettingsStore`). `persistSettings` :411 writes `JSON.stringify(get())`, so an unknown saved field passes through `initial = {...defaults, ...migrate(saved)}` :463 and survives every save. The failure path relies on this behaviour, so it is tested.
- `src/components/SettingsPanel.tsx:961-975` -- the password input bound to the setting. `:146-152` is the `vault_list` presence check for `DEEPSEEK_API_KEY`, the pattern to follow.
- `src/components/IntegrationsPanel.tsx:109-119, 270-280` -- the Secrets tab: `vault_set` with a note, then "Replace" and "Delete" per row. Its save notice says "Terminals you open from now on have it", which is wrong for an app-only name.
- `src/lib/anthropic.ts:169-200` -- `sendOrchestratorMessage`. DeepSeek reads through `vault_get` at :176. Anthropic reads `settings.anthropicApiKey` at :190, and its missing-key copy is at :193.
- `src/main.tsx` `boot()` -- `syncBeforeLaunch` → `hydrateFromDisk` → `startAutoSave` (which takes a snapshot of `kv/` right away) → … → `import("./stores/settingsStore")`. The move goes between `hydrateFromDisk` and `startAutoSave`. The launch snapshot then copies a clean `kv/`, and the store reads the stripped settings.
- `src/lib/persistence.ts` -- `startAutoSave` mirrors `localStorage.setItem` to disk only once it has started. Before that, the move writes disk itself with `invoke("state_write")`, and that call reports failure. `flushNow` swallows errors, so it is not used here.
- `src-tauri/src/vault.rs` -- `valid_name` :59 (the new name passes). `vault_set` :143 inserts into the terminal cache :155. `env_for_terminals` :180 is the only export path, called from `pty.rs:168`. Tests start at :200.
- `src-tauri/src/state.rs` -- `kv_path`, `atomic_write`, `snapshot` :133, `list_snapshots`, the commands from :236, tests from :272.
- `src-tauri/src/sync.rs` -- `SECRET_FIELDS` :51, `strip_secrets` :54 (to become `pub(crate)`), `restore_secrets` :100 (it drops the field when the local copy has none, so a moved key stays gone after an import).
- `src-tauri/src/lib.rs:473, 482-485` -- command registration. `src/lib/__tests__/tauriCommandContract.test.ts` fails if a new command is not registered.

## Tasks & Acceptance

**Execution:**
- [ ] `src-tauri/src/vault.rs` -- `pub const ORCHESTRATOR_ANTHROPIC_KEY: &str = "ADE_ORCHESTRATOR_ANTHROPIC_KEY"`, `const APP_ONLY: &[&str] = &[ORCHESTRATOR_ANTHROPIC_KEY]`, and `pub fn in_terminals(name) -> bool`. `env_for_terminals` filters its result on both the cached path and the fresh-read path. `vault_get` maps `NoEntry` to `"not found"` (see *The move*). Tests T1, T2 and T17.
- [ ] `src-tauri/src/state.rs` -- `scrub_secrets(state_dir)` applies `sync::strip_secrets` to `better-terminal-settings.json` in `kv/` and in every `snapshots/*/`. It writes only files that changed, with `atomic_write`, and returns how many it changed. It is exposed as the command `state_scrub_secrets` and registered in `lib.rs`. Test T3.
- [ ] `src/lib/anthropicKey.ts` (new) -- `ANTHROPIC_VAULT_NAME`, `APP_ONLY_SECRETS`, `moveAnthropicKeyToVault(): Promise<MoveResult>` (the matrix above, with a 5 s bound on the vault calls), and `lastMoveError(): string | null` for the settings field. Tests T4–T9.
- [ ] `src/main.tsx` -- `await moveAnthropicKeyToVault()` after `hydrateFromDisk()` and before `startAutoSave()`, in the main window only.
- [ ] `src/stores/settingsStore.ts` -- remove `anthropicApiKey` and `setAnthropicApiKey`, so `tsc` finds every use. Add a comment at `persistSettings` saying that unknown saved fields are kept on purpose. Test T10.
- [ ] `src/lib/anthropic.ts` -- the Anthropic provider reads `vault_get({ name: ANTHROPIC_VAULT_NAME })`. A rejection or an empty value gives the existing copy, "No Anthropic API key set. Go to Settings → AI API to add one." Tests T11 and T12.
- [ ] `src/components/AnthropicKeyField.tsx` (new), used by `SettingsPanel.tsx` in place of the input. It shows "Saved in the system keychain, not exported to terminals" or "No key set", from `vault_list`. A password input with a Save button (labelled Replace when a key is set) calls `vault_set` with the name and the note, then clears the input. Remove calls `vault_delete` after a confirm. Errors and `lastMoveError()` appear under the field. It never calls `vault_get` and never shows a value. Test T13.
- [ ] `src/components/IntegrationsPanel.tsx` -- for a name in `APP_ONLY_SECRETS`, the row says "Not in terminals" and the save notice does not say terminals get it. Test T14.
- [ ] `src/lib/__tests__/appOnlySecrets.test.ts` -- pins `APP_ONLY_SECRETS` to the `APP_ONLY` list in `vault.rs`, read from source the way `tauriCommandContract.test.ts` reads Rust. Test T15.
- [ ] `.ade/context/vault-app-only-secrets.md` -- the name, the app-only rule, and who reads the key. ADR 0013 becomes Accepted at approval.
- [ ] `docs/guide/settings.md`, `docs/guide/agents.md:105` -- the Anthropic key is stored in the system keychain and is not exported to terminals.

**Acceptance Criteria** (each maps to a test, all run by the verification command):

1. Given a vault holding `ADE_ORCHESTRATOR_ANTHROPIC_KEY` and `GITHUB_TOKEN`, when a terminal's environment is built, then `GITHUB_TOKEN` is in it and `ADE_ORCHESTRATOR_ANTHROPIC_KEY` is not, on both the fresh-read and the cached path. -- **T1** `vault.rs` `app_only_secrets_never_reach_terminals`; **T2** `vault.rs` `orchestrator_key_name_is_valid_and_not_read_by_claude_code` (`valid_name` passes, the name is not `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, and it does not start with `ANTHROPIC_` or `CLAUDE_`).
2. Given the keychain answers "no entry", `vault_get`'s error is exactly `"not found"`; any other keychain error keeps its message. -- **T17** `vault.rs` `missing_entry_reads_as_not_found`.
3. Given a state directory whose `kv/` and three snapshots hold `better-terminal-settings.json` with `anthropicApiKey`, and one snapshot without it, when `scrub_secrets` runs, then no file under the state directory contains the field or its value, every other field is unchanged, the clean file is not rewritten, and a second run changes nothing. -- **T3** `state.rs` `scrub_removes_the_old_key_from_kv_and_every_snapshot`.
4. Given saved settings with `anthropicApiKey: "sk-ant-K"` and an empty vault, when the move runs, then `vault_set` receives the name, K and the note; `vault_get` reads it back; `state_write` receives the settings without the field; localStorage no longer holds the field or K; and `state_scrub_secrets` runs, in that order. -- **T4** `anthropicKey.test.ts` "moves a saved key into the vault, then strips and scrubs".
5. Given the move has succeeded, when it runs again, then it makes no `vault_set` call and the settings are unchanged. Given a vault that already equals the settings value (crash after the write), then it strips without writing. -- **T5** "is idempotent and finishes a move that crashed after the vault write".
6. Given `vault_set` rejects, or the first `vault_get` rejects with anything but `"not found"`, or the read-back `vault_get` rejects or differs, or the vault does not answer within 5 s, then localStorage and disk still hold the key, `state_write` and `state_scrub_secrets` are not called, and `lastMoveError()` gives the reason. -- **T6** "keeps the key in settings when the vault write fails" (one case per cause, fake timers for the timeout).
7. Given `state_write` rejects after a verified vault write, then localStorage still holds the setting and no scrub runs. -- **T7** "keeps localStorage as it was when the disk write fails".
8. Given `anthropicApiKey: ""`, then the field is removed with no vault call. Given the vault already holds a different value, then the vault keeps its value and the field is removed. -- **T8** "drops an empty field without touching the vault"; **T9** "the vault's existing value wins".
9. Given saved settings that still hold `anthropicApiKey` after a failed move, when the store loads and any setting is saved, then the saved JSON still holds the field. -- **T10** `src/stores/__tests__/settingsLeftoverKey.test.ts`.
10. Given the Anthropic provider, when the Orchestrator sends a message, then it calls `vault_get` with `ADE_ORCHESTRATOR_ANTHROPIC_KEY` and passes that value to the SDK client. Given `vault_get` rejects or returns `""`, then `onError` receives "No Anthropic API key set. Go to Settings → AI API to add one." and the SDK is not called. -- **T11** and **T12** `src/lib/__tests__/orchestratorAnthropicKey.test.ts`.
11. Given the field with no key in the vault, it shows "No key set". After a value is typed and saved, `vault_set` receives the name, the value and the note, the input is empty, and the status shows saved. No render calls `vault_get` or shows the value. -- **T13** `src/components/__tests__/AnthropicKeyField.test.tsx`.
12. Given the Secrets tab lists `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, then its row says "Not in terminals". -- **T14** `src/components/__tests__/IntegrationsSecrets.test.tsx`.
13. The TypeScript list of app-only names equals the Rust list. -- **T15** `appOnlySecrets.test.ts`.
14. No source under `src/` refers to `anthropicApiKey` or `setAnthropicApiKey` except `anthropicKey.ts` and its tests (the raw JSON field it moves). -- `npx tsc --noEmit` exit 0, plus **T16** in `anthropicKey.test.ts`, which greps `src/`.

## Design Notes

### Why not `ANTHROPIC_API_KEY`

The vault exports every secret into every new ADE terminal (`vault.rs:4`, `pty.rs:168`). Claude Code's documented authentication precedence ranks `ANTHROPIC_API_KEY` third. Only cloud-provider settings and `ANTHROPIC_AUTH_TOKEN` rank above it. Subscription OAuth from `/login` ranks last, seventh. That page says:

- "If you have an active Claude subscription but also have `ANTHROPIC_API_KEY` set in your environment, Claude Code uses the API key once you approve it."
- "In interactive mode, you are prompted once to approve or decline the key, and your choice is remembered … In non-interactive mode (`-p`), the key is always used when present."
- Under `forceLoginMethod`/`forceLoginOrgUUID` managed settings, sessions that authenticate with `ANTHROPIC_API_KEY` are "blocked at startup".
- "Features that need your claude.ai login, such as claude.ai connectors and `/schedule`," are unavailable while another credential source is selected. The page states this for profiles, and an API key replaces the login in the same way.

Source: https://code.claude.com/docs/en/authentication, sections "Authentication precedence", "Log in to Claude Code" and "Restrict login to your organization" (read 2026-10-29).

Storing the key as `ANTHROPIC_API_KEY` would therefore put every Claude Code started in an ADE terminal on API billing. That applies at once to `-p` runs and to Agent SDK scripts, and after one prompt to interactive sessions. On managed machines it would stop Claude Code from starting at all. The Anthropic SDKs and many other tools also read that variable. Today the setting never reaches a terminal, so moving it there would widen its exposure for no gain. The new name is read by nothing outside ADE, and the app-only list also keeps it out of terminal environments. Either measure alone would avoid the billing change. Together they keep the key away from every process an agent runs. A user who wants API billing in terminals can still add `ANTHROPIC_API_KEY` themselves under Secrets, as today.

The vault has no per-secret export option today: `SecretMeta` is `name`, `note`, `updated_at`. The Orgo plan lists "A vault option to keep a secret out of terminals" as deferred (`plan/orgo-agent-computers`, `_bmad-output/plan-orgo-agent-computers.md:565`). This story adds only a fixed, code-owned list, so the index format and the Secrets UI keep their shape. When the general option is built, this name becomes its first user (ADR 0013).

### The move, step by step (`moveAnthropicKeyToVault`)

1. Parse `localStorage["better-terminal-settings"]`. No field → go to step 7.
2. Field is `""` → go to step 5.
3. `vault_get(NAME)`. If it holds a non-empty value, the vault wins → step 5. If it rejects with `"not found"`, continue. Any other rejection is a failure.
4. `vault_set(NAME, K, note)`, then `vault_get(NAME)`, which must equal K. Otherwise this is a failure.
5. `state_write({ "better-terminal-settings": json without the field })`. A rejection is a failure.
6. `localStorage.setItem` the same JSON. `startAutoSave` has not started, so this does not queue a second write.
7. `state_scrub_secrets` (its errors are logged, not fatal; the next launch repeats it).

Steps 3–5 share one 5 s bound. A failure records `lastMoveError` and returns, so nothing after it runs. A late answer from a timed-out call can only add K to the vault, which leaves K in both places for the next launch to finish. Step 3 must tell "no entry" apart from "keychain unavailable". The second must never be read as "empty, go ahead", but for this first-write case it is harmless either way, because step 4 would fail too. So `vault_get` maps `keyring::Error::NoEntry` to the fixed string `"not found"` through a pure `get_error` function. Every other error keeps `keychain_error`'s text. The DeepSeek caller ignores the message, so nothing else changes.

### Why before `startAutoSave`

`startAutoSave` takes a snapshot of `kv/` straight away. If the move ran after it, that snapshot would copy the key while the scrub was walking the snapshots. Running first, the launch snapshot copies a clean file. Because the move writes disk itself, it can see the write fail. With auto-save it could not, since `flushNow` swallows errors.

### Settings field

The field follows the Secrets tab: names come from `vault_list`, a value goes in once, and it is replaced but never shown. It keeps the label "Anthropic API Key", the placeholder `sk-ant-...` and the console.anthropic.com hint.

## Verification

**Commands** (the agreed verification command, unchanged):
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including T4–T16
- `cd src-tauri && cargo test` -- expected: all pass, including T1–T3 and the existing `api_keys_never_reach_the_repo_and_each_machine_keeps_its_own`
- `cd relay && cargo test` -- expected: all pass (untouched)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (untouched)

**Manual checks** (not part of the verification command):
- With a key saved by the previous build, launch the new build. Then `grep -r sk-ant <app data>/state` finds nothing, Settings → AI API shows the key as saved, the Orchestrator answers, and `env | grep -i anthropic` in a new ADE terminal prints nothing.
