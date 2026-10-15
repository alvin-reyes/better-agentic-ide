---
title: 'Scaffold relay, protocol package and app with CI'
type: 'chore'
ticket: '1'
created: '2026-10-15'
status: 'built'
baseline_revision: '0141666041637fbe481a1dd645b2b1fa8cf381ce'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - '{project-root}/docs/superpowers/specs/2026-10-14-relay-pairing-design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Piece 2a's verification command has five lines, and two of them (`cd relay && cargo test`, `cd mobile && npx tsc --noEmit && npx jest`) name directories that don't exist yet. No later story can run the full command until they do.

**Approach:** Create `relay/` (a virtual Cargo workspace with five crates), `packages/protocol/` and `mobile/` (an Expo app), each with one passing placeholder test. Widen the root tsc and vitest includes to cover `packages/protocol`, and add CI jobs for the new checks. The layout follows the spec's "Code layout" section exactly.

## Boundaries & Constraints

**Always:**
- Use the spec's layout:
  - `relay/` is a virtual workspace with members `protocol`, `core`, `server`, `cli` and `e2e`. The end-to-end test lives in `relay/e2e/tests/`.
  - `mobile/` has its own `package-lock.json` and depends on `packages/protocol` as `file:../packages/protocol`.
  - `@noble/curves`, `@noble/ciphers` and `@noble/hashes` are peer dependencies of `packages/protocol`, installed both in the root and in `mobile/`.
  - `react-native-get-random-values` is a dependency of `mobile/` only, and is imported first in the app's entry file.
  - Metro's `watchFolders` includes `../packages/protocol`, and `resolver.nodeModulesPaths` points at `mobile/node_modules`.
  - Jest's `moduleDirectories` and `transformIgnorePatterns` resolve the same way, and Jest compiles the package's TypeScript.
- `packages/protocol` takes randomness only from `globalThis.crypto.getRandomValues` and never imports a polyfill.
- Expo SDK with TypeScript and `expo-router`. The bundle id is `com.betterterminal.remote`.
- Pin every dependency to a version at least two weeks old, and commit the lockfiles: `relay/Cargo.lock`, the root `package-lock.json` and `mobile/package-lock.json`.
- Every placeholder test proves the wiring works (an import resolves, a crate links). None is a bare `assert!(true)` with nothing behind it.

**Never:**
- No protocol, pairing, Noise or relay logic. That starts in stories 2–4.
- No `src-tauri` dependency on `relay/protocol` or `relay/core` yet. That comes in stories 5a and 8.
- Don't run `eas init` or create an EAS project. The owner runs `eas init` (the hitl step), so `app.json` stays without an EAS `projectId`.
- Don't change the existing CI jobs beyond what the widened includes need.

</frozen-after-approval>

## Code Map

- `tsconfig.json` -- `include: ["src"]`. Add `packages/protocol`.
- `vitest.config.ts` -- `include` lists `src/**` and `scripts/**`. Add `packages/protocol/**/*.test.ts`.
- `package.json` -- root devDependencies. `@noble/hashes ^1.8.0` is already there. Add `@noble/curves` and `@noble/ciphers` at versions that match its major, so the peers resolve for root tsc and vitest.
- `src-tauri/Cargo.toml` -- workspace with `members = ["ade-hook"]`. Leave it alone: `relay/` is a separate workspace, not a member.
- `.gitignore` -- `node_modules/` already matches at any depth. Add `relay/target/` and Expo outputs (`mobile/.expo/`, `mobile/dist/`, `mobile/ios/`, `mobile/android/`).
- `.github/workflows/ci.yml` -- existing jobs: `frontend` (Node 20, `npm ci`, tsc, test, vite build) and `backend*` (cargo test in src-tauri with `swatinem/rust-cache` on `src-tauri -> target`). The new jobs copy that style.
- Spec `docs/superpowers/specs/2026-10-14-relay-pairing-design.md`, sections "Code layout" (line ~820) and "Verification" (line ~861). They're the source of truth for this story.

## Tasks & Acceptance

**Execution:**
- [ ] `relay/Cargo.toml` -- create the virtual workspace (`resolver = "2"`) with the five members and shared `[workspace.package]` edition 2021. A virtual root builds no tests itself.
- [ ] `relay/protocol`, `relay/core` (lib crates), `relay/server`, `relay/cli` (bin crates) -- create each crate with one unit test. `core` depends on `protocol` by path, and its test calls a `protocol` item, which proves the path dependency links.
- [ ] `relay/e2e/` -- a package with `tests/e2e.rs`, holding one test named `e2e_placeholder` that depends on `core`.
- [ ] `relay/Cargo.lock` -- generate and commit it.
- [ ] `packages/protocol/` -- `package.json` (name `@ade/protocol`, private, `main`/`types` pointing at `src/index.ts`, the three `@noble/*` as peerDependencies), plus `src/index.ts` exporting one small constant or pure function, and `src/index.test.ts` testing it under vitest. Also create an empty `vectors/` directory with a `.gitkeep`.
- [ ] `tsconfig.json`, `vitest.config.ts`, root `package.json` -- the include changes and root devDependencies from the Code Map.
- [ ] `mobile/` -- create the Expo TypeScript app with `expo-router`:
  - an entry file that imports `react-native-get-random-values` first;
  - `app.json` with bundle id `com.betterterminal.remote`;
  - `metro.config.js` and the jest config (jest-expo preset) with the resolution settings above;
  - `tsconfig.json`;
  - one jest test that imports from `@ade/protocol` and checks the export, which proves Jest resolves and compiles the package;
  - `package-lock.json`.
- [ ] `.gitignore` -- the entries from the Code Map.
- [ ] `.github/workflows/ci.yml` -- add two jobs:
  - `relay`: `cargo test --locked` in `relay/`, with rust-cache on `relay -> target`.
  - `mobile`: Node 20, `npm ci` at the root then in `mobile/`, then `npx tsc --noEmit`, `npx jest` and `npx expo export --platform ios`.

  The root tsc and test steps in `frontend` already pick up `packages/protocol` through the widened includes.

**Acceptance Criteria:**
- Given a fresh checkout, when `npm ci` runs at the root and in `mobile/`, then all five verification lines pass.
- Given `cd relay && cargo test`, when it runs, then the output names `e2e_placeholder` and every crate's test passes.
- Given a fresh `mobile/` with only `npm ci` run in it, when `npx expo export --platform ios` runs, then it bundles, resolving `@ade/protocol` and its `@noble/*` peers from `mobile/node_modules`.
- Given `npm test` at the root, when it runs, then the `packages/protocol` test is collected and passes.
- Given the CI workflow, when it's read, then the `relay` and `mobile` jobs run the commands above.

## Implementation Notes

- Crates are named `relay-protocol`, `relay-core`, `relay-server`, `relay-cli` and `relay-e2e`. The directories follow the spec, but a package named `core` would shadow Rust's built-in `core` crate.
- `@ade/protocol` imports all three `@noble` peers (`suite`), because a placeholder that imported none would let `expo export` pass without proving the peers resolve.
- `mobile/` pins `react-dom` 19.2.3. Without it, a fresh `npm ci` fails on ERESOLVE (an optional peer resolved to 19.3.0).
- `mobile/tsconfig.json` sets `preserveSymlinks`, so the app's tsc resolves `@noble` from `mobile/node_modules` and not from the root.
- Dependencies were resolved with `npm_config_before=2026-10-01`, so the whole tree is at least two weeks old.

## Plan Change Log

## Review Triage Log

Pass 1 (quick lens, 2026-10-15). Counts: high 0, medium 1, low 3, false 0, maybe-false 0, plus 1 rejected for editing the plan.

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| CI `mobile` job runs the root `npm ci` first, so the root `node_modules` could hide a missing peer | medium | patch | The job's comment claims an EAS-like install, but the root `@noble` packages are on the resolve path. The reviewer showed the job's steps need only `mobile/`'s install. Fix: remove the root install step. |
| `relay/protocol` test compares the constant with its own literal | low | reject | `protocol` has no dependencies, so compiling is all the wiring it has. Its export is proven across a crate boundary by the `core` test. A "better" test would add contrivance for no gain. |
| `expo-status-bar` is listed but nothing imports it | low | patch | It's a template leftover. The fix is a deletion plus a lockfile regeneration under the same date pin. |
| `mobile/expo-env.d.ts` is not gitignored | low | patch | The Expo CLI generates it, and `tsconfig.json` includes it. The fix is one `.gitignore` line. |
| Execution checkboxes are unticked, and the Verification section has no recorded output | n/a | reject | The fix edits this build's plan. QA records the verification output. |

## Design Notes

The e2e test sits in its own package because a virtual workspace has no root package, so a `relay/tests/` folder would never compile (spec, "Code layout"). Story 2 replaces the placeholder with the login and presence test.

`expo export` has to run after a clean `npm ci` in `mobile/` alone. That is how EAS installs the app, and it catches a `file:` dependency whose peers only resolve because of the root `node_modules`.

## Verification

**Commands:**
- `npx tsc --noEmit` -- exit 0
- `npm test` -- passes, and includes `packages/protocol/src/index.test.ts`
- `cd src-tauri && cargo test` -- passes, unchanged
- `cd relay && cargo test` -- passes, and lists `e2e_placeholder`
- `cd mobile && npx tsc --noEmit && npx jest` -- passes
- `cd mobile && rm -rf node_modules && npm ci && npx expo export --platform ios` -- bundles without errors
