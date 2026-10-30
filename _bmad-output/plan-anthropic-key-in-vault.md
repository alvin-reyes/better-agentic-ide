---
title: 'The Orchestrator''s Anthropic API key lives in the vault, not in saved settings'
type: 'bugfix'
ticket: ''
created: '2026-10-29'
status: 'approved'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['adversarial']
review_loop_iteration: 2
context: ['.ade/context/decisions/0013-orchestrator-anthropic-key-is-an-app-only-vault-secret.md', '.ade/context/vault-app-only-secrets.md']
---

This plan has two stories, built in order:
- **Story A** adds app-only vault secrets: a secret ADE keeps for itself and never hands to terminals. It ships first and stands on its own.
- **Story B** moves the Orchestrator's key into the vault under the name from Story A, and changes the settings field, the read path and boot.

Each story has its own Acceptance Criteria (A1–A4 and B1–B16) and its own Verification. The shared intent, open questions, boundaries and principles check come first.

ADR numbers are provisional. They are checked again at merge time, whichever branch lands first, because 0008–0012 are already taken or proposed on unmerged branches.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Orchestrator keeps the user's Anthropic API key as the setting `anthropicApiKey`, in plain text. It is saved to localStorage, to `<app data>/state/kv/better-terminal-settings.json`, and to every copy of that file under `state/snapshots/` (up to 20 are kept). Sync strips it (`src-tauri/src/sync.rs:51`), but the disk keeps it unencrypted. The DeepSeek key next to it is already read from the OS-keychain vault (`src/lib/anthropic.ts:176`).

**Approach:** Keep the key in the vault under its own name, which is never exported to terminals. On first launch after the update, move any saved key into the vault, check the vault holds it, then remove it from settings and from every snapshot. The Settings → AI API field becomes a vault-backed field. The Orchestrator reads the key with `vault_get`, the same way it reads the DeepSeek key.

## Owner's decisions

1. Fix it: "Yes, plan and build it" (owner, 2026-10-29, approving the intent above).
2. The verification command is unchanged.
3. Approved at cdcdb4f: "Approve both stories" (owner, 2026-10-30). Stories A and B are built in that order, with the rotate hint as static text.
4. The vault name is `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, kept out of terminals by the fixed app-only list in `vault.rs`. The general per-secret option stays deferred (owner, 2026-10-30, Q1).
5. There is no fallback to an `ANTHROPIC_API_KEY` vault entry (owner, 2026-10-30, Q2).
6. Without a keychain, there is no plain-text read, and **Remove the saved copy** is offered (owner, 2026-10-30, Q3).
7. **P2 override (ADR 0012):** the one-time move at launch reads the user's key and writes it to the keychain without a click. The owner approves it on the stated reason: it only moves the user's own key between two ADE stores, to meet P3 (owner, 2026-10-30, Q4). Every other credential action stays on the user's click.

</frozen-after-approval>

## Coordinator's decisions (2026-10-30; they stand, as the owner approved without a veto)

- **Two stories.** The plan is split as above, following "small, vertically sliced". Story A carries what was AC 1, 2, 17 and 18; Story B carries the rest. The owner may merge them back.
- **The rotate hint is static text** under the field, with no persisted flag and no Dismiss.

## Owner questions (answered 2026-10-30; see Owner's decisions 4–7)

1. **Story A: the vault name and terminal export.** Recommended: `ADE_ORCHESTRATOR_ANTHROPIC_KEY`, kept out of terminals by a fixed list of app-only names in `vault.rs`. The general per-secret "not in terminals" option stays deferred, as the Orgo plan left it. Using `ANTHROPIC_API_KEY` is **rejected** (Design Notes, *Why not `ANTHROPIC_API_KEY`*). Confirm the name, and confirm a fixed list rather than the general option.
2. **Story B: no fallback to an `ANTHROPIC_API_KEY` vault entry.** DeepSeek reuses the terminal key, but this provider will not. Reusing it would reward storing `ANTHROPIC_API_KEY` in the vault, and that switches every ADE terminal's Claude Code to API billing. Recommended: no fallback.
3. **Story B: what happens without a working keychain.** This covers Linux without Secret Service, and a keychain that keeps refusing.
   - The move fails at every launch. The Orchestrator can no longer use the key: it never reads the plain-text copy, because keeping that read path would keep the bug. DeepSeek already behaves this way.
   - Meanwhile the copy stays in plain text in `kv/`, localStorage and the snapshots. Settings → AI API says why and offers **Remove the saved copy**, which deletes it from all three (B11, B14).
   - The trade-off: these users either keep a plain-text key the Orchestrator ignores, or delete it and lose the Anthropic Orchestrator until the keychain works. A Console key can't be viewed again, so after deleting they would need a new key.
   - The alternative is to keep reading the plain-text copy only when the keychain is unavailable. That keeps today's behaviour, and today's exposure, for exactly these users.

   Recommended: no plain-text read; offer the removal.
4. **Story B, P2 override needed (raised by the Principles check).** The one-time move at launch reads the user's key and writes it to the keychain with no click. P2 asks that reading or changing credentials happen only on the user's click. The owner approved this move in the intent (2026-10-29), but that was before ADR 0012 (2026-10-30), and an override must be recorded by the owner: no agent can waive a principle.
   - Recommended: record a P2 override for this one action. It moves the user's own key between two of ADE's own stores, in service of P3, and it never sends the key anywhere.
   - The alternative meets P2: a **Move to keychain** button in the field. The key would then stay in plain text until each user clicks it.

## Boundaries & Constraints (both stories)

**Always:**
- The key is in at least one of the two places at every moment. The move writes to the vault, reads it back and compares, writes the stripped settings to disk, updates localStorage, then scrubs. If a step fails or the app crashes, a later step never runs, so the next launch repeats the move from the start.
- The move is idempotent. A second run with nothing to move does no vault write.
- The webview receives the key's value in only three places: the Orchestrator's request path, the move's step 3 (checking for an existing entry), and the move's step 4 (the read-back after writing). The settings UI uses `vault_list` (names only).
- An app-only name is never exported into a terminal environment, on a fresh read or a cached one.
- `ADE_ORCHESTRATOR_ANTHROPIC_KEY` must be on any future `vault_get` allowlist. The Orgo plan proposes one ("Story 2 first limits it to an allowlist, which today is `DEEPSEEK_API_KEY`", `plan/orgo-agent-computers`, plan :116, :210, :652), though its Stories 2–6 are deferred. The constraint is recorded in the context file and ADR 0013 and checked by convention in B15.
- **Import rules (B10):**
  - `src/lib/anthropicKey.ts` imports only `@tauri-apps/api/core`.
  - `src/lib/boot.ts` imports only `@tauri-apps/api/core`, `./persistence`, `./sync` and `./anthropicKey`. `projectSetup` stays a dynamic import or an injected dependency.
  - Neither file may import `settingsStore`, directly or through `anthropic.ts` (which imports it at :3). Otherwise the store would be evaluated at boot before `hydrateFromDisk`, and would read stale values.
  - `main.tsx` keeps its order: `bootMain` or `bootDetached`, then `import("./stores/settingsStore")`, then `applyThemeToDOM`, then render.
- Keep `sync.rs` `SECRET_FIELDS = ["anthropicApiKey"]` and its stripping, and reuse it for the scrub. A settings file can still bring the field back: from a backup of the state directory, from a machine not yet updated, or from a snapshot restored before the scrub ran. The stripping keeps that copy out of the sync repo, and the next launch moves it again.

**Never:**
- No `ANTHROPIC_API_KEY` vault entry, and no write of any Anthropic credential into a terminal environment.
- No plain-text fallback read of the old setting by the Orchestrator.
- No general per-secret "not in terminals" option, no Secrets-tab toggle, no change to the vault index file (`vault-index.json`). `vault_list` gains a computed `inTerminals` field in its reply only.
- No `vault_get` allowlist in this plan (Orgo owns that); only the constraint above.
- No change to the DeepSeek or Ollama paths, to sync's behaviour, or to `relay/` or `mobile/`.
- No edit to `.ade/session.md` in either story (the journal line is written at approval).

## Principles check (ADR 0012)

| | Story A: app-only vault secrets | Story B: the move, the field, the read path |
|---|---|---|
| **P1** a job and a change | **Met.** Job: Reach ("give agents tools and keys without putting secrets in files"). Harness change: a secret on the app-only list is no longer handed to agent terminals, and the Secrets tab says which ones. On its own, Story A protects only an entry the user creates under that name; the change reaches the Orchestrator's key with Story B. | **Met.** Job: Reach. Change: the Orchestrator's key stops being a plain-text setting in the files ADE writes (localStorage, `kv/`, snapshots), and it isn't handed to agent terminals. The Orchestrator tab itself is frozen (product doc, Q8 open): this is the "key fix first" that freeze names. |
| **P2** nothing risky without the user's action | **N/A.** No new action from P2's list: save and delete already exist in the Secrets tab, and only their copy changes. | **Not met for one action: overridden by the owner on 2026-10-30 (Owner's decision 7).** On the user's click: Save/Replace (`vault_set`), Remove (`vault_delete`, after a confirm), **Remove the saved copy** (after a confirm), and the Orchestrator's key read (on Send). The one-time move at launch reads and writes the credential with no click. |
| **P3** no secrets in plain text | **Met.** Values stay in the OS keychain. Who else can read them: every vault secret not on the list is still exported to every ADE terminal (the known exception for the vault's terminal export stays). App-only secrets are not handed to terminals, but any same-user process can still query the keychain (`secret-tool` on Linux, `CredRead` on Windows; ACLs apply on macOS). | **Met for the files ADE controls.** The key is held only in the OS keychain, under `ADE_ORCHESTRATOR_ANTHROPIC_KEY`. Who can read it: the Orchestrator and the move (`vault_get`), and any same-user process through the keychain, as for Story A. Residue ADE can't remove is listed in *What this fix does not remove*. The static hint tells users to rotate. Without a keychain the key stays in plain text until the user removes it (owner Q3). |
| **P4** thin where a vendor does the job | **N/A**: no vendor product. | **N/A**: the Anthropic API is called as before. |
| **P5** real work needs it | **Met.** The owner's own use, and ADE itself: it closes part of the known P3 exception ("The Orchestrator stores the Anthropic API key in plain-text settings… The owner approved the fix on 2026-10-29"). | **Met.** Same; this story removes that exception line when it ships. |
| **P6** provable and keepable | **(a) Met.** A1–A4 are offline tests in the verification command. Vendor behaviour (Claude Code keeping the subscription login in an ADE terminal) is a named manual check. Under ADR 0009 (on the unmerged `docs/claude-md-paths` branch), manual checks don't gate Done unless the plan says so, and this plan doesn't. **(b), (c) N/A**: no table of vendor tool names or subcommands. | **(a) Met.** B1–B16 are offline tests. The webview-storage residue and the no-keychain path are named manual checks, not gating. **(b), (c) N/A**: same. |

## Product doc exceptions list (ADR 0012)

The product doc (`_bmad-output/product-ide-and-harness.md`, §4 "Known exceptions, shipped or decided") is on `plan/product-ide-and-harness`, not on this branch. When the branches meet, it gains this line:

| What | Fails | Status |
|---|---|---|
| The Orchestrator's one-time launch move reads the user's Anthropic key and writes it to the keychain without a click (`plan-anthropic-key-in-vault.md`, Story B) | P2 (reads or changes credentials) | Owner override of 2026-10-30: it only moves the user's own key between two ADE stores, to meet P3. |

When Story B ships, the existing line for the Orchestrator's plain-text key (P3) is removed, as Tasks (B) say.

## What this fix does not remove (stated honestly)

Story B removes the key from the files ADE controls: localStorage's current value, `kv/`, every snapshot, leftover restore directories, and, at boot, leftover temp files. Copies may remain in places ADE cannot reach:

- **The webview's own storage files.** On macOS, WebKit keeps localStorage in SQLite under `~/Library/WebKit/<bundle id>/WebsiteData/LocalStorage/`. On Linux, WebKitGTK keeps it in SQLite under the app's data directory. On Windows, WebView2 uses LevelDB under `EBWebView/Default/Local Storage/leveldb/`. Old pages and log segments (`-wal`, `.log`, `.ldb`) can hold the old value until the engine compacts them.
- OS backups (Time Machine, File History) and any copy of the app data directory made before the update.
- Any process that ran in an ADE terminal. The key never reached terminals as a variable, but agents there could read the files above.

So the field always shows the static rotate text while a key is set or a saved copy exists (B13). Story B's manual check greps the webview data directory as well as `state/`.

"Not exported to terminals" means a secret is not handed to terminal processes, not that they cannot get it: see P3 above.

## Design Notes (both stories)

### Why not `ANTHROPIC_API_KEY`

The vault exports every secret into every new ADE terminal (`vault.rs:4`, `pty.rs:168`). Claude Code's documented authentication precedence ranks `ANTHROPIC_API_KEY` third. Only cloud-provider settings and `ANTHROPIC_AUTH_TOKEN` rank above it. Subscription OAuth from `/login` ranks last, seventh. That page says:

- "If you have an active Claude subscription but also have `ANTHROPIC_API_KEY` set in your environment, Claude Code uses the API key once you approve it."
- "In interactive mode, you are prompted once to approve or decline the key, and your choice is remembered … In non-interactive mode (`-p`), the key is always used when present."
- When managed settings set `forceLoginMethod` or `forceLoginOrgUUID`, sessions that authenticate with `ANTHROPIC_API_KEY` are "blocked at startup". This applies only on machines with those settings.
- *Inference, not stated for this case:* the page says that features needing the claude.ai login, "such as claude.ai connectors and `/schedule`", are unavailable while a profile or federation credential is selected. An API key that replaces the login likely has the same effect.

Source: https://code.claude.com/docs/en/authentication, sections "Authentication precedence", "Log in to Claude Code", "Restrict login to your organization" and "Anthropic profiles and federation credentials" (read 2026-10-29).

Storing the key as `ANTHROPIC_API_KEY` would therefore put every Claude Code started in an ADE terminal on API billing. That applies at once to `-p` runs and to Agent SDK scripts, and after one prompt to interactive sessions. On machines whose managed settings set `forceLoginMethod` or `forceLoginOrgUUID`, it would stop Claude Code from starting at all. The Anthropic SDKs and many other tools also read that variable.

The new name is read by nothing outside ADE, and the app-only list also means the key is not handed to terminal processes. A user who wants API billing in terminals can still add `ANTHROPIC_API_KEY` themselves under Secrets, as today.

The vault has no per-secret export option today. The Orgo plan lists "A vault option to keep a secret out of terminals" as deferred (`plan/orgo-agent-computers`, `_bmad-output/plan-orgo-agent-computers.md:565`). Story A adds only a fixed, code-owned list. `vault_list`'s computed `inTerminals` lets the UI follow that list without a second list in TypeScript. When the general option is built, it should absorb `APP_ONLY` (ADR 0013).

---

# Story A: app-only vault secrets

Ships first. It does not touch settings, the Orchestrator or boot.

## Code Map (A)

- `src-tauri/src/vault.rs`:
  - `CACHE` :25 (a process-global `OnceLock`), `valid_name` :59, `keychain_error` :108, `vault_list` :120, `vault_get` :138, `vault_set` :143 (cache insert :155), `env_for_terminals` :180 (complete-read check :194; its only caller is `pty.rs:168`). Tests start at :200.
  - `env_for_terminals` itself cannot be tested. There is no tauri test feature (`Cargo.toml:24`), and the keyring mock keeps a value only inside one `Entry`.
- `src/components/IntegrationsPanel.tsx`: `saveSecret` :109-119 and its notice "Terminals you open from now on have it", the rows :270-280, the footer :284-286 ("Each one is set as an environment variable in terminals…").
- `docs/guide/integrations.md:34`: "every secret is set as an environment variable in terminals".

## Tasks (A)

- [ ] `src-tauri/src/vault.rs`:
  - Add `pub const ORCHESTRATOR_ANTHROPIC_KEY: &str = "ADE_ORCHESTRATOR_ANTHROPIC_KEY"`, `const APP_ONLY: &[&str] = &["ADE_ORCHESTRATOR_ANTHROPIC_KEY"]` (a literal), and `pub fn in_terminals(name) -> bool`.
  - **Pure seam:** `fn terminal_env(cache: &mut Option<HashMap<String, String>>, names: Vec<SecretMeta>, read: impl Fn(&str) -> Option<String>) -> HashMap<String, String>`.
    - The cached path returns a clone of the cache.
    - The fresh path reads every indexed name, app-only ones included, so the complete-read check still holds. It caches only a complete read.
    - **Both paths filter the returned map** through `in_terminals`. The cache itself is never filtered.
  - `env_for_terminals` becomes a thin wrapper: lock `CACHE`, read the index, pass the keychain reader.
  - `vault_get` maps `keyring::Error::NoEntry` to `"not found"` through a pure `get_error`.
  - `vault_list` returns `SecretInfo { name, note, updatedAt, inTerminals }`, computed by a pure `list_info(&[SecretMeta])`. `SecretMeta` and the index file are unchanged.
- [ ] `src/components/IntegrationsPanel.tsx`:
  - A row with `inTerminals: false` says "Not in terminals".
  - The save notice says "Terminals you open from now on have it." only when the saved name is in terminals. For an app-only name it says "Saved to the system keychain. ADE uses it; terminals don't get it."
  - The footer becomes "Each one, except the few ADE keeps for itself (marked *Not in terminals*), is set as an environment variable…".
- [ ] `docs/guide/integrations.md:34`: the same exception as the footer.
- [ ] `.ade/context/vault-app-only-secrets.md` (written with this plan, status proposed): keep it true to what Story A builds.

## Acceptance Criteria (A)

- **A1.** Given an index holding `ADE_ORCHESTRATOR_ANTHROPIC_KEY` and `GITHUB_TOKEN`, when `terminal_env` runs with an empty cache, then:
  - the result has `GITHUB_TOKEN` and not the app-only name, and the cache is filled;
  - a second run gives the same result and does not call `read`;
  - with a cache already holding both names (as `vault_set` leaves it), the result still leaves out the app-only name.

  The name passes `valid_name` and is not an `ANTHROPIC_*` or `CLAUDE_*` name. -- **T1** `vault.rs` `app_only_secrets_never_reach_terminals_fresh_or_cached`; **T2** `orchestrator_key_name_is_valid_and_not_read_by_claude_code`.
- **A2.** When the keychain answers "no entry", `vault_get`'s error is exactly `"not found"`. Any other keychain error keeps its message. -- **T17** `vault.rs` `missing_entry_reads_as_not_found`.
- **A3.** `list_info` marks `ADE_ORCHESTRATOR_ANTHROPIC_KEY` `in_terminals: false` and every other name `true`. -- **T15** `vault.rs` `list_marks_app_only_names`.
- **A4.** In the Secrets tab:
  - a row with `inTerminals: false` says "Not in terminals";
  - saving an app-only name shows the app-only notice;
  - saving any other name shows "Terminals you open from now on have it.";
  - the footer names the exception.

  -- **T14** `src/components/__tests__/IntegrationsSecrets.test.tsx`.

## Verification (A)

**Commands** (the agreed verification command, unchanged): `npx tsc --noEmit` (exit 0) · `npm test` (all pass, including T14) · `cd src-tauri && cargo test` (all pass, including T1, T2, T15, T17) · `cd relay && cargo test` · `cd mobile && npx tsc --noEmit && npx jest` (untouched, all pass).

**Manual checks** (not gating):
- Add `ADE_ORCHESTRATOR_ANTHROPIC_KEY` in Secrets. Then `env | grep ADE_ORCHESTRATOR` in a new ADE terminal prints nothing, and the row says "Not in terminals".
- `claude` started in that terminal still shows the subscription login in `/status`.

---

# Story B: the Orchestrator's key moves to the vault

Needs Story A (`APP_ONLY`, `"not found"`, `inTerminals`).

## I/O & Edge-Case Matrix (B)

| Scenario | State at launch | Result | On failure |
|---|---|---|---|
| Key saved | settings `anthropicApiKey: "sk-ant-K"`, vault has no entry | vault holds K (note "Orchestrator: Anthropic API key. Not exported to terminals."); field removed from kv, localStorage and everything under `state/` | settings untouched; reason shown in Settings → AI API with **Remove the saved copy** |
| Already moved | no field in settings | no vault call; boot scrub runs (a no-op unless something under `state/` still holds the field) | scrub failure logged, retried next launch |
| Empty field | `anthropicApiKey: ""` | field removed from settings and `state/`; no vault call | as above |
| Unparseable settings | localStorage settings not JSON, or not an object | nothing to move; no vault call, no disk write; boot scrub runs | none |
| Crash after vault write | settings K, vault K | next launch: the entry already exists, so only the strip and scrub run | none |
| Vault already holds another value | settings K1, vault K2 | vault keeps K2; K1 is removed from settings (after the move, a settings copy can only come from an older backup) | settings untouched |
| Vault write or read fails, or read-back differs | keychain locked, missing or denied | settings untouched, no disk write, no scrub | reason shown under the field; retried next launch; the user may remove the copy |
| Keychain hangs | `vault_get` or `vault_set` unanswered | after 5 s on steps 3–4, treated as a failure; boot goes on | a late write can only add K to the vault, which leaves K in both places for the next launch |
| Disk write of stripped settings fails | `state_write` rejects (step 5 has no timeout) | localStorage keeps K, no scrub; K is in the vault and on disk | retried next launch |
| Settings saved while the move has failed | user changes a setting | the field is carried into the saved JSON only while it is still in localStorage; the store's state never holds it | none |
| Remove the saved copy, disk write fails | `state_write` rejects | localStorage untouched; error shown under the field | user can retry |
| Old ADE running alongside, a detached window reloaded by its ErrorBoundary, or a detached window's queued flush landing just after a removal | that process still holds the old settings | it can re-save the field once; the next launch moves or strips it again | self-heals at the next launch |
| Snapshot restored later | a snapshot from before the scrub (none remain after a successful scrub), or a copy from outside ADE | next launch moves it again | as row 1 |
| Not under Tauri (tests, browser) | `invoke` throws | treated as a failure: no throw, settings untouched, boot continues | none |
| Keychain readable but not persistent | gnome-keyring's in-memory "session" collection, or an unsaved KeePassXC database | the read-back passes; the key is lost at the next reboot or lock | not detected: see *Persistence is not proven* |

## Code Map (B)

- `src/stores/settingsStore.ts`:
  - `Settings.anthropicApiKey` :354, default :429, `setAnthropicApiKey` :504 (also declared in `SettingsStore`).
  - `persistSettings` :411 writes `JSON.stringify(get())`. That includes any unknown field a newer version saved, because `initial = {...defaults, ...migrate(saved)}` :463 spreads every saved field into the store.
- `src/components/SettingsPanel.tsx`: the password input bound to the setting is at :961-975. The `vault_list` presence check for `DEEPSEEK_API_KEY` is at :146-152.
- `src/lib/anthropic.ts:169-200`: `sendOrchestratorMessage`. DeepSeek reads through `vault_get` at :176. Anthropic reads the setting at :190, and its missing-key copy is at :193.
- `src/main.tsx` `boot()`:
  - The main branch runs `syncBeforeLaunch` → `hydrateFromDisk` → `startAutoSave` (its first act is `state_snapshot`) → `migrateKept` and `reaskV4Projects` (dynamic import of `./lib/projectSetup`) → `startPeriodicSync`.
  - The detached branch runs only `startAutoSave({ snapshots: false })`.
  - Both then run `import("./stores/settingsStore")` → `applyThemeToDOM` → render.
- `src/lib/persistence.ts`: `startAutoSave` mirrors `localStorage.setItem` to disk only once it has started. `flushNow` swallows errors.
- `src-tauri/src/state.rs`:
  - `is_snapshotted` :26 excludes only `ade-rec-`.
  - `atomic_write` :65 creates the temp file `.<file name>.<pid>-<n>.tmp` and then renames it (:71-82).
  - `snapshot` :133 copies every file, temp files included.
  - `restore_snapshot` :180 uses `.kv-restore-*` (:190) and `.kv-old-*` (:210-218).
  - Commands from :236, tests from :272.
- `src-tauri/src/sync.rs`: `SECRET_FIELDS` :51, `strip_secrets` :54 (to become `pub(crate)`), `restore_secrets` :100 (drops the field when the local copy has none).
- `src-tauri/src/lib.rs:473, 482-485`: command registration, guarded by `src/lib/__tests__/tauriCommandContract.test.ts`, whose invoke-site parser T19 reuses.
- Docs: `docs/guide/settings.md` and `docs/guide/agents.md:105` (the Orchestrator key copy).

## Tasks (B)

- [ ] `src-tauri/src/state.rs`: `scrub_secrets(state_dir, at_boot: bool) -> usize`, exposed as `state_scrub_secrets({ atBoot })` and registered in `lib.rs`.
  - **Always:** applies `sync::strip_secrets` to `better-terminal-settings.json` in every `snapshots/*/` and in any leftover `.kv-old-*` or `.kv-restore-*` directory. Those directories are stripped, not deleted: after a crash mid-restore, `.kv-old-*` may be the only copy of the state.
  - **Always:** deletes the key's leftover temp files (`.better-terminal-settings.json.*.tmp`) in those directories. Nothing writes there while the app runs.
  - **Only with `at_boot`:** the same strip and temp deletion in `kv/`. At boot, auto-save has not started, so no write is in flight. Later, auto-save may be mid-way between creating and renaming a temp file (`state.rs:71-82`), or may have just flushed a newer value that a strip would overwrite.
  - Writes only files that changed, with `atomic_write`, and returns the count.
- [ ] `src/lib/anthropicKey.ts` (new; imports only `@tauri-apps/api/core`):
  - `ANTHROPIC_VAULT_NAME`, `LEGACY_FIELD = "anthropicApiKey"`.
  - `moveAnthropicKeyToVault(): Promise<MoveResult>`, following the matrix and *The move, step by step*.
  - `lastMoveError(): string | null`, `hasSavedCopy(): boolean` (reads localStorage), `carryLegacyField(json)` for `persistSettings`, and `removeSavedCopy(): Promise<void>` (see *Removing the saved copy*).
- [ ] `src/lib/boot.ts` (new; imports per the import rules): `bootMain(deps)` and `bootDetached(deps)`, the two branches of `boot()`.
  - `bootMain` awaits `moveAnthropicKeyToVault()` after `hydrateFromDisk()` and before `startAutoSave()`. `bootDetached` never calls it.
  - `main.tsx` picks one branch, then keeps `import("./stores/settingsStore")` → `applyThemeToDOM` → render, unchanged.
- [ ] `src/stores/settingsStore.ts`: remove `anthropicApiKey` and `setAnthropicApiKey`. `LEGACY_FIELD` is the only special case:
  - `migrate()` drops `LEGACY_FIELD`, so the store's state never holds the key.
  - `persistSettings` keeps writing everything it writes today, `JSON.stringify(get())`, including unknown fields from newer versions, and passes the result through `carryLegacyField`. That function copies `LEGACY_FIELD` from the current localStorage value, and only while the field is there.
- [ ] `src/lib/anthropic.ts`: the Anthropic provider reads `vault_get({ name: ANTHROPIC_VAULT_NAME })`.
  - `"not found"` or `""` gives the existing copy, "No Anthropic API key set. Go to Settings → AI API to add one."
  - Any other rejection shows the vault's own message. For an unavailable, locked or denied keychain that already reads "The system keychain isn't available: …" (`keychain_error`).
- [ ] `src/components/AnthropicKeyField.tsx` (new), used by `SettingsPanel.tsx` in place of the input:
  - **Status line**, from `vault_list`: "Saved in the system keychain. Not exported to terminals." or "No key set."
  - **Key input:** a password input. Its button reads Save, or Replace when a key is set, and calls `vault_set` with the name and the note, then clears the input.
  - **Remove** (when a key is set): confirm, then `vault_delete`.
  - **When `lastMoveError()` is set and `hasSavedCopy()` is true:** the reason, plus **Remove the saved copy** (confirm, then `removeSavedCopy()`; its error is shown if it fails).
  - **Static rotate text**, shown while a key is set or a saved copy exists: "If a key was ever saved in ADE's settings before this version, it was stored in plain text: rotate it at console.anthropic.com."
  - It never calls `vault_get` and never shows a value.
- [ ] `src/lib/__tests__/vaultGetCallers.test.ts` (T19).
- [ ] `.ade/context/vault-app-only-secrets.md`: keep it true to what Story B builds.
- [ ] Docs: `docs/guide/settings.md` and `docs/guide/agents.md:105` say the Anthropic key is stored in the system keychain, is not exported to terminals, and should be rotated if it was saved before this version.
- [ ] When it ships, the product doc's §4 exceptions line for the Orchestrator's plain-text key is removed, in whichever branch holds that doc by then.

### The move, step by step (`moveAnthropicKeyToVault`, at boot only)

1. Parse `localStorage["better-terminal-settings"]`. If it is unreadable, not an object, or has no field, go to step 7.
2. If the field is `""`, go to step 5.
3. `vault_get(NAME)`. A non-empty value means the vault wins: go to step 5. A rejection with `"not found"` means continue. Any other rejection is a failure.
4. `vault_set(NAME, K, note)`, then `vault_get(NAME)`, which must equal K. Otherwise this is a failure.
5. `state_write({ "better-terminal-settings": json without the field })`. A rejection is a failure. **No timeout:** a write that landed late could overwrite a newer auto-save flush.
6. `localStorage.setItem` the same JSON. `startAutoSave` has not started, so nothing else wrote to localStorage since step 1, and this does not queue a second write.
7. `state_scrub_secrets({ atBoot: true })`. Its errors are logged, not fatal, and it runs at every launch.

Steps 3–4 share one 5 s bound. A failure records `lastMoveError` and returns, so nothing after it runs. A timed-out call that answers late can only add K to the vault.

### Removing the saved copy (`removeSavedCopy`, while the app runs)

Auto-save is live and a detached window may be saving too, so:

1. `await flushNow()`, so queued writes land first.
2. Read localStorage again and delete only `LEGACY_FIELD`, then `await invoke("state_write", …)` with the result. A rejection leaves localStorage untouched and returns the error for the field to show.
3. Read localStorage **again** (other windows may have saved during the await), delete only `LEGACY_FIELD`, and `setItem` the result. Auto-save mirrors that write.
4. `state_scrub_secrets({ atBoot: false })`: snapshots and restore directories only. `kv/` was written in step 2.

A detached window whose own queued flush lands after step 2 can put the field back on disk once. That is the matrix row "Old ADE running alongside…", and it self-heals at the next launch.

### Why the field is carried by the store, not held in it

The store's state never holds `anthropicApiKey`. `persistSettings` copies the field from the current localStorage value into what it writes, and only while the field is there. So a failed move never loses the key through a settings save. Once the move or `removeSavedCopy()` has stripped localStorage, no later save from any window brings it back: localStorage is shared, and every window's `carryLegacyField` reads it.

### Why before `startAutoSave`

`startAutoSave` takes a snapshot of `kv/` straight away. Running the move first means that snapshot copies a clean file, and the boot scrub never races auto-save. Because the move writes disk itself, it can see the write fail. With auto-save it could not, since `flushNow` swallows errors. `bootMain` is extracted so that B16 can pin this order.

### Persistence is not proven

The read-back in step 4 proves the keychain returns the value now, not that it will after a reboot. gnome-keyring's in-memory "session" collection, or a KeePassXC database that is never saved, would lose it, and a Console key cannot be viewed again.

The plan does not wait for a second launch before stripping. That would keep the plain-text copy for at least one more launch, and it still would not catch a loss at the next reboot. The cost of a loss is a new key, and the static rotate text asks for one anyway.

## Acceptance Criteria (B)

- **B1.** Given a state directory where the field is in `kv/`, three snapshots, a `.kv-old-*` and a `.kv-restore-*` directory, and in `.better-terminal-settings.json.123-0.tmp` temp files in `kv/` and in one snapshot, and is absent from one snapshot:
  - `scrub_secrets(at_boot: true)` leaves no file under the state directory holding the field or its value, and removes the temp files;
  - every other field is unchanged, the clean snapshot is not rewritten, and a second run returns 0;
  - `scrub_secrets(at_boot: false)` on the same fixture leaves `kv/` and its temp file byte-identical and cleans everything else.

  -- **T3** `state.rs` `scrub_removes_the_old_key_everywhere_under_state`, `scrub_leaves_kv_alone_after_boot`.
- **B2.** Given saved settings with `anthropicApiKey: "sk-ant-K"` and an empty vault, the move's calls are, in order:
  1. `vault_get` (rejects `"not found"`);
  2. `vault_set` (name, K, note);
  3. `vault_get` (returns K);
  4. `state_write` (settings without the field);
  5. `state_scrub_secrets({ atBoot: true })`.

  Afterwards localStorage holds neither the field nor K. -- **T4** `anthropicKey.test.ts`.
- **B3.** A second run makes no `vault_set` and no `state_write`, and still calls `state_scrub_secrets`. Given a vault that already equals the settings value (a crash after the write), the move strips without writing. -- **T5**.
- **B4.** In each of these cases, localStorage and disk still hold the key, `state_write` and `state_scrub_secrets` are not called, and `lastMoveError()` gives the reason:
  - the first `vault_get` rejects with anything but `"not found"`;
  - `vault_set` rejects;
  - the read-back rejects or differs;
  - steps 3–4 take longer than 5 s;
  - `invoke` throws (not under Tauri).

  -- **T6** (one case each; fake timers for the timeout).
- **B5.** If `state_write` rejects after a verified vault write, localStorage keeps the field and no scrub runs. A slow `state_write` is never timed out. -- **T7**.
- **B6.** An empty field is removed with no vault call. Settings that are not JSON, or not an object, cause no write and no vault call. A different value already in the vault is kept, and the field is removed. -- **T8**, **T9**.
- **B7.** Given localStorage settings holding the field and an unknown field `futureThing`:
  - the loaded store's state has no `anthropicApiKey`;
  - a save keeps both fields in the saved JSON;
  - once the field is stripped from localStorage, a later save does not bring it back, and `futureThing` is still kept.

  -- **T10** `src/stores/__tests__/settingsLeftoverKey.test.ts`.
- **B8.** With the Anthropic provider, the Orchestrator calls `vault_get` with `ADE_ORCHESTRATOR_ANTHROPIC_KEY` and passes the value to the SDK client. -- **T11** `orchestratorAnthropicKey.test.ts`.
- **B9.** A `vault_get` rejection with `"not found"`, or a `""` value, gives "No Anthropic API key set. Go to Settings → AI API to add one." A rejection with "The system keychain isn't available: locked" passes that message to `onError`. In both cases the SDK is not called. -- **T12a**, **T12b**.
- **B10.** Import rules and naming:
  - `anthropicKey.ts` imports only `@tauri-apps/api/core`;
  - `boot.ts` imports only `@tauri-apps/api/core`, `./persistence`, `./sync` and `./anthropicKey`, with no static import of `settingsStore`, `anthropic`, `projectSetup` or `App`;
  - no source under `src/` refers to `anthropicApiKey` or `setAnthropicApiKey` except through `LEGACY_FIELD`;
  - `ANTHROPIC_VAULT_NAME` equals the Rust literal in `vault.rs`.

  -- **T16** in `anthropicKey.test.ts` (reads the sources), plus `npx tsc --noEmit` exit 0.
- **B11.** Given a failed move with the field saved, `removeSavedCopy()`:
  - calls `flushNow` first;
  - writes the settings without the field through `state_write`;
  - re-reads localStorage after that await and removes only the field, so a key another window added during the await (`fontSize`) survives;
  - calls `state_scrub_secrets({ atBoot: false })` and makes no vault call.

  `hasSavedCopy()` is then false. If `state_write` rejects, localStorage is untouched, the error is returned, and no scrub runs. -- **T18a**, **T18b** in `anthropicKey.test.ts`.
- **B12.** `AnthropicKeyField`:
  - with no key it shows "No key set" and Save;
  - saving calls `vault_set` with the name, the value and the note, then empties the input;
  - with a key set, the button reads Replace;
  - Remove calls `vault_delete` only after the confirm is accepted;
  - no render calls `vault_get` or shows the value.

  -- **T13a** `AnthropicKeyField.test.tsx`.
- **B13.** The static rotate text shows while a key is set or a saved copy exists, and not otherwise. -- **T13b**.
- **B14.** With `lastMoveError()` set and a saved copy, the field shows the reason and **Remove the saved copy**.
  - Accepting the confirm calls `removeSavedCopy()`, after which the action is gone.
  - A failed removal shows its error.
  - Without a saved copy, the action is not shown.

  -- **T13c**.
- **B15.** A convention check, not a runtime guard: every `vault_get` invoke site in `src/` is in `anthropic.ts` or `anthropicKey.ts` and names `DEEPSEEK_API_KEY` or `ANTHROPIC_VAULT_NAME`, and no other file under `src/` contains the string `vault_get`. It is found with `tauriCommandContract.test.ts`'s invoke-site parser. -- **T19** `vaultGetCallers.test.ts`.
- **B16.** With `invoke` mocked and settings holding K:
  - `bootMain` makes, in order, `state_read_all` → `vault_get` → `vault_set` → `vault_get` → `state_write` → `state_scrub_secrets` → `state_snapshot`;
  - `bootDetached` makes no `vault_*` or `state_scrub_secrets` call;
  - a failed move still lets `bootMain` reach `state_snapshot`.

  Sync and the later launch steps are injected as no-ops. -- **T20** `boot.test.ts`.

## Verification (B)

**Commands** (the agreed verification command, unchanged): `npx tsc --noEmit` (exit 0) · `npm test` (all pass, including T4–T13c, T16, T18a/b, T19, T20) · `cd src-tauri && cargo test` (all pass, including T3 and the existing `api_keys_never_reach_the_repo_and_each_machine_keeps_its_own`) · `cd relay && cargo test` · `cd mobile && npx tsc --noEmit && npx jest` (untouched, all pass).

**Manual checks** (not gating, per ADR 0009):
- With a key saved by the previous build, launch the new build. Then check each of these:
  - `grep -r sk-ant <app data>/state` finds nothing;
  - Settings → AI API shows the key as saved, with the rotate text;
  - the Orchestrator answers;
  - `env | grep -i anthropic` in a new ADE terminal prints nothing.
- Report, without gating, whether the old value remains in the webview data directory. Use `grep -ra sk-ant` over the WebKit `LocalStorage` directory on macOS, the WebKitGTK `localstorage` directory on Linux, or `EBWebView/Default/Local Storage/leveldb` on Windows. This residue is expected.
- On a machine with no Secret Service: the field shows the reason and **Remove the saved copy**. After removing it, `grep -r sk-ant <app data>/state` finds nothing.

---

## Review Triage Log

- 2026-10-30, adversarial review round 1 at 6e491dc: **BLOCK** (1 blocker, 5 major, 10 minor). The reviewer confirmed the app-only name, the single export path, that detached windows never run the move, `restore_secrets` dropping the field, the step 5/6 crash recovery, and the Claude Code authentication claims.

| Finding | Verdict | Action |
|---|---|---|
| B1 A failed move leaves no way to delete the plain-text key | blocker | patched: **Remove the saved copy**; store carries the field without holding it (B7, B11, B14); owner Q3 restated |
| M1 AC1 untestable through `env_for_terminals`; filtering inside `filter_map` breaks the cache | major | patched: pure `terminal_env`; returned map filtered on both paths (A1) |
| M2 Conflicts with Orgo's proposed `vault_get` allowlist | major | patched: constraint in Boundaries, context file, ADR 0013; B15 |
| M3 Boot order untested; import rule unstated | major | patched: `bootMain`/`bootDetached` (B16); import rules (B10) |
| M4 Overstates removal; no rotation advice | major | patched: *What this fix does not remove*; rotate text (B13); webview manual check |
| M5 Every vault error shown as "no key set" | major | patched: B9 |
| m1 Scrub misses temp files and restore dirs | minor | patched: B1 |
| m2 Filter the returned map | minor | patched with M1 |
| m3 Copy that becomes false | minor | patched: A4, docs tasks |
| m4 T15 would parse a Rust `const` | minor | patched: literal `APP_ONLY`; computed `inTerminals` (A3) |
| m5 A late stripped write could overwrite a newer flush | minor | patched: step 5 outside the timeout (B5) |
| m6 Step 3 also returns the value | minor | patched: Boundaries |
| m7 Missing ACs | minor | patched: B3, B4, B6, B12 |
| m8 Read-back doesn't prove persistence | minor | stated; second-launch strip rejected with reasons |
| m9 Old ADE / reloaded detached window can re-save | minor | matrix row |
| m10 Three overclaims | minor | patched |

- 2026-10-30, re-review at 28e7afa: **PASS WITH MINORS**. B1 and M1–M5 were confirmed against the code, including `carryLegacyField` across windows and `bootMain` keeping `main.tsx`'s order.

| Finding | Verdict | Action |
|---|---|---|
| n1 The scrub's "no write in flight" is false for `removeSavedCopy` (temp deletion; strip over a newer flush) | minor | patched: `at_boot` flag, so `kv/` and its temp files are touched only at boot; `removeSavedCopy` calls `flushNow` first (B1, B11) |
| n2 `removeSavedCopy` writes JSON computed before an await | minor | patched: re-reads localStorage and deletes only `LEGACY_FIELD`; `state_write` rejection case (B11) |
| n3 `.kv-restore-*` missing from the fixture | minor | patched: B1 |
| n4 Rotate-hint flag details | minor | superseded: the hint is static (coordinator's decision) |
| n5 T19's scope | minor | patched: any `vault_get` string outside two files fails; reuses the contract test's parser; stated as a convention check (B15) |
| n6 Import rule for `boot.ts`; `main.tsx` order; "settingsFields" wording | minor | patched: B10, Boundaries, Tasks (B) for `persistSettings` |
| n7 Split and static hint | coordinator's decision | applied: Stories A and B; static rotate text; no persisted flag or `PERSISTED_KEYS` change |
| Principles check (ADR 0012) | required | added. It found that the launch-time move fails P2 without an override: owner Q4. |

## Plan Change Log

- 2026-10-30, review round 1: everything outside the frozen block was revised. The frozen Intent and Owner's decisions are unchanged.
- 2026-10-30, approval: the owner approved both stories at cdcdb4f. Status set to approved; the four answers and the P2 override recorded in the frozen Owner's decisions; the line for the product doc's exceptions list added; ADR 0013 Accepted.
- 2026-10-30, re-review: split into Stories A and B, with the ACs renumbered per story (old → new: 1→A1, 2→A2, 18→A3 (Rust part), 17→A4, 3→B1, 4–8→B2–B6, 9→B7, 10→B8, 11→B9, 12→B10 (with the name parity from 18), 13→B11, 14→B12, 15→B13 (static), 16→B14, 19→B15, 20→B16). Added the Principles check and owner Q4. The frozen block is unchanged.
