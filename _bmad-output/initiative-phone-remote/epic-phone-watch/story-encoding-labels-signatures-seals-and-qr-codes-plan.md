---
title: 'Encoding, labels, signatures, seals and QR codes in Rust and TypeScript'
type: 'feature'
ticket: '3'
created: '2026-10-16'
status: 'done'
baseline_revision: 'c13904bb9873523c36200dcc6ebfdd88c155c8df'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - '{project-root}/docs/superpowers/specs/2026-10-14-relay-pairing-design.md'
  - '{project-root}/.ade/context/phone-remote-layout.md'
  - '{project-root}/.ade/context/remote-protocol.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pairing (stories 5a, 5b), ADE's QR view (story 9) and the app's scanner (story 12a) all need the same bytes on the Mac and on the phone: `enc`, the labels, signatures, the pairing seals, the 6-digit code, the `ade-pair://v1` code and the name cleaning. If Rust and TypeScript drift by one byte, pairing fails or a check is skipped.

**Approach:** Implement each piece once in `relay/protocol` (Rust) and once in `packages/protocol` (TypeScript), and pin both to one set of JSON vectors in `packages/protocol/vectors/` that both test suites read. The expected crypto values come from a generator on `node:crypto`, which is independent of both libraries. The QR and Names expectations are written by hand from the spec.

## Boundaries & Constraints

**Always:**
- Follow the spec exactly: "Wire format" (`enc`, labels), "Pairing" steps 3 and 7 (HKDF, XChaCha20-Poly1305 with a random 24-byte nonce, SAS), "Names" and "Decoding `n`", and the QR form in step 2.
- Keep story 2's `relay_protocol::enc` byte for byte, with the same signature, and keep `relay_protocol::enc` and `relay_protocol::LOGIN_LABEL` importable at those paths. Story 2's own `enc` unit tests stay and pass unchanged.
- There are exactly these 11 labels, each `ade-remote/v1/` followed by one of: `login`, `noise`, `pair/phone-to-mac`, `pair/mac-to-phone`, `pair/commit`, `pair/commit-hash`, `pair/nonce`, `pair/reveal`, `pair/phone-sig`, `pair/sas`, `pair/record`.
  - The two direction labels are HKDF `info` strings. The other nine are `enc` labels.
  - Each is one constant in each language.
  - Both tables equal `vectors/labels.json`, and a test also compares that file with this list.
- Names use the spec's own code point lists. Never use a language's `trim`, `\s` or Unicode property classes. Step 4 trims trailing characters only.
- UTF-8 decoding replaces each maximal invalid subpart with U+FFFD, so a valid byte after a bad one is never swallowed.
  - Rust uses `String::from_utf8_lossy`.
  - TypeScript uses a hand-written decoder, because Hermes has no reliable `TextDecoder`.
  - Never use `decodeURIComponent`.
- `packages/protocol`'s non-test `src/` modules take randomness only from `globalThis.crypto.getRandomValues`, and import nothing but the `@noble` peers. Tests and the generator may use `node:` modules.
- Every new dependency is at least two weeks old (before 2026-10-02), and so is every new `Cargo.lock` entry.

- Decision (owner, 2026-10-16): story 3 waits for PR #60 to merge, then this branch is rebased onto `origin/main` before any code.
- Decision (owner, 2026-10-16): the spec-gap choices in Design Notes are accepted as written and become the contract in `remote-protocol.md`: the sealed layout, the base64url QR byte fields, the QR grammar and its error precedence, a duplicate `n` counting as missing, exact lower-case `wss://`, and the verify strictness.
- Decision (owner, 2026-10-16): the TypeScript signed host is story 5b's; story 2's note in `remote-protocol.md` is corrected to say so.
- Decision (owner, 2026-10-16): the plan is kept whole.
- Decision (owner, 2026-10-16, after the code review of 143279d): in a QR code the version comes first. `ade-pair://v` followed by an integer N ≥ 2 is `newer_version`, whatever follows, characters outside 0x21–0x7E included. The printable-ASCII check applies only once the version is known to be v1.
- Decision (owner, 2026-10-16, after the code review of 143279d): an empty `relay=` is `not_pairing_code`, like an empty byte field. `wss://` with nothing after it stays `insecure_relay`.
- Decision (owner, 2026-10-16, after the code review of 143279d): Rust refuses a non-canonical public key, one whose decompressed point doesn't compress back to the same 32 bytes, matching noble's `zip215: false`. `signatures.json` gains a refused y = p + 3 case, and keeps y = p + 1.

**Never:**
- No use of these pieces: `H`, `pair_id`, the step-8 checks, the reveal and the pending pairs are stories 5a and 5b; ADE's QR view is story 9; the scanner is story 12a.
- No Noise, frames or snapshot plaintexts (stories 4 and 6). The `noise` label constant is added; nothing uses it yet.
- No new npm dependency and no change to `mobile/package.json` or its lockfile.
- No `src-tauri` changes.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| Wrong label | seal or signature made under label A, checked under any other label | refused |
| Wrong direction | sealed with `k_pm`, opened with `k_mp` | refused |
| Tampered seal | any byte flipped, or shorter than 40 bytes | refused |
| SAS | the same inputs with a different `I_P`, or a different `S_P` | a different code; codes under 100000 keep their leading zeros |
| QR, relay scheme | `ws://`, `https://`, `WSS://` | `insecure_relay` |
| QR, version | `ade-pair://v2?...`, `v10` | `newer_version` |
| QR, structure | another scheme; `v0`, `v01`, `V1`, `v1` without `?`; a missing, duplicate or malformed required field; base64 that is padded or non-canonical; a parameter with no `=`; a character outside 0x21–0x7E | `not_pairing_code` |
| QR, `n` | missing, empty, malformed `%`, duplicated, or cleans to empty | valid, name `null` (shown as "Mac") |
| Ed25519 | small-order `A`, `S ≥ L`, non-canonical `y ≥ p` | refused by both languages |
| Lossy UTF-8 | `E2 41`, `F0 9F 98 41`, `C0 80`, `E0 80 80`, `ED A0 80`, `F4 90 80 80`, `F5`–`FF`, a valid sequence after an invalid one | every valid character survives |

</frozen-after-approval>

## Code Map

- `relay/protocol/src/lib.rs` (after story 2) -- holds `NOISE_PATTERN`, `VERSION`, `LOGIN_LABEL`, `enc`, `Bytes<N>`, `Control` and their tests. Move `enc` to `enc.rs` and `LOGIN_LABEL` to `labels.rs`, with `pub use`, so nothing else changes. `relay-core` imports `enc` and `LOGIN_LABEL` from the crate root.
- `relay/Cargo.toml` (after story 2) -- `[workspace.dependencies]` already pins `ed25519-dalek 2.2.0` (on the sha2 0.10 line), `rand 0.8.5`, `serde_json 1.0.151` and `base64 0.22.1`. Stay on the RustCrypto 0.10 line so `sha2` isn't duplicated.
- `packages/protocol/src/index.ts` -- exports `NOISE_PATTERN` and `suite`. Keep both, and re-export the new modules.
- `packages/protocol/vectors/.gitkeep` -- an empty folder. The vectors go here.
- `vitest.config.ts`, `tsconfig.json` -- already include `packages/protocol`. Root tsc has `@types/node` but no `resolveJsonModule`, so tests read vectors with `node:fs`.
- `mobile/__tests__/protocol.test.ts` -- the app's Jest smoke test of the package.
- `.ade/context/remote-protocol.md` (after story 2) -- the wire contract. Add to it.
- Spec lines ~152–187 (Wire format), ~239–264 (pairing steps 2–7), ~502–528 (Names), ~889–906 (Protocol vectors).

## Tasks & Acceptance

**Execution:**
- [x] Branch -- start from `origin/main` once PR #60 (story 2) has merged (see Design Notes, "Order with story 2"). Set `baseline_revision` then.
- [x] `relay/Cargo.toml`, `relay/protocol/Cargo.toml` -- add the workspace dependencies `hkdf = "0.12.4"` (2023-12-13), `chacha20poly1305 = "0.10.1"` (2022-08-10) and `sha2 = "0.10.9"` (2025-04-30, already locked via dalek), and dev-dependency `hex = "0.4.3"` (2021-03-03). `relay-protocol` also gains `ed25519-dalek` and `rand` from the workspace. Then run `cargo tree -p relay-protocol` and check each new lock entry's date.
- [x] `packages/protocol/vectors/generate.mjs` + `*.json` -- a generator on `node:crypto` only, whose output is committed.
  - It produces `enc.json`, `labels.json`, `signatures.json`, `seals.json` and `sas.json` from fixed seeds and nonces.
  - For XChaCha it uses HChaCha20 derived from Node's `chacha20` keystream, then `chacha20-poly1305`.
  - It checks itself against draft-irtf-cfrg-xchacha A.3.1, RFC 5869 case 1 and RFC 8032 test 1, and writes those into the files as anchors.
  - `signatures.json` also carries refused cases: a small-order `A`, `S ≥ L` and `y ≥ p`.
  - Its SAS search finds one case with a code under 100000.
  - With `--check` it writes nothing and exits non-zero if the files differ.

  `names.json` and `qr.json` are written by hand from the spec, with one case for each matrix line, each ticket item and each grammar rule below. They include the lossy UTF-8 byte cases. The names cases are:
  - over 40 code points, built from astral code points;
  - the boundaries: U+009F removed; U+00A0 trimmed but kept inside; U+200D and U+FFEF kept; U+202F trimmed; U+E007F removed; U+EFFFF kept.
- [x] `relay/protocol/src/{enc,labels,sign,seal,sas,names,qr}.rs` -- add the following:
  - `dec(label, bytes) -> Option<Vec<&[u8]>>`: an exact label prefix, the whole input consumed;
  - the 11 labels and `ALL_LABELS`;
  - `sign(&SigningKey, label, fields)` and `verify(id, label, fields, sig) -> bool`, which uses `verify_strict`;
  - `pair_keys(s, slot) -> {pm, mp}`, each an HKDF-SHA256 output of 32 bytes;
  - `seal_with_nonce(key, nonce, label, fields)`, with `seal(key, label, fields)` wrapping it with an `OsRng` nonce;
  - `open(key, sealed, label, n_fields)`;
  - `sas_code(...) -> String`;
  - `clean_name(&str)` and `name_from_bytes(&[u8])`;
  - `build_pair_code` and `parse_pair_code`, with `PairCodeError { NotPairingCode, InsecureRelay, NewerVersion }`.
- [x] `relay/protocol/src/vectors.rs` (`#[cfg(test)]`) -- reads every vector file through `include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packages/protocol/vectors/…"))` and asserts each case. Vectors check `seal_with_nonce`; the random `seal` gets a round-trip test, and two calls give different nonces.
- [x] `packages/protocol/src/{enc,labels,bytes,sign,seal,sas,names,qr}.ts` -- the twins, with camelCase names (`sealWithNonce`, `seal`, `open`, …).
  - `bytes.ts` holds hex, strict unpadded base64url, the UTF-8 encoder and the lossy decoder, and percent coding.
  - `verify` uses `ed25519.verify(sig, msg, pub, { zip215: false })`.
- [x] `packages/protocol/src/vectors.test.ts` -- the same assertions as the Rust file, plus:
  - a lone-surrogate name case, which only TypeScript can represent;
  - a check that `labels.json` equals the 11 labels listed under Always;
  - a test with `// @vitest-environment node` that runs `generate.mjs --check` through `spawnSync`, so drift from the oracle fails `npm test` and CI.
- [x] `mobile/__tests__/protocol.test.ts` -- add one QR parse case, one SAS case, and a `seal`-then-`open` round trip, to prove the package works under the app's Jest toolchain. Jest runs on Node's `globalThis.crypto`, not the `react-native-get-random-values` polyfill, so the Hermes randomness path is covered only by a device check or `expo export` (review round 2, finding 6c).
- [x] `.ade/context/remote-protocol.md`, `phone-remote-layout.md` -- record the following:
  - the 11 labels, with the two HKDF `info` strings marked;
  - the sealed layout and the open rule;
  - HKDF's 32-byte output;
  - the SAS rule;
  - the QR grammar and its three errors;
  - the Names rules;
  - the verify strictness;
  - the new TypeScript exports.

  Also replace story 2's note "Story 3's TypeScript client must produce the same bytes" (the signed host) with "the story that builds the TypeScript login (5b) must produce the same bytes". The TypeScript signed host is not in ticket 3.

**Acceptance Criteria** (each is a test over the shared vectors in both languages unless it says otherwise):
- AC1: Given the `enc`, labels, signatures, seals and SAS vectors, when each language computes them, then every output equals the vector, story 2's `enc` case included.
  - Signatures are deterministic, and seals are made with `seal_with_nonce` and the vector's nonce.
  - The refused signature cases are refused.
  - Given SAS inputs that differ only in `I_P`, or only in `S_P`, the code differs.
- AC2: Given a signature and a seal made under each label, when each is checked under every other label (11×10 each), then all fail, and each passes under its own label.
- AC3: Given each QR case the ticket lists in `qr.json`, when it is parsed, then the result equals the stated fields and name, or the stated error.
- AC4: Given each `names.json` case (string or raw bytes), when it is cleaned, then both languages give the stated output.
- AC5: Given codes whose relay scheme is anything other than `wss://`, when they are parsed, then the result is `insecure_relay`.
- AC6: Given builder cases with dirty names, when a code is built, then it equals the vector's string, `n` holds the cleaned name (left out when the name cleans to empty), and parsing it gives back the cleaned name and the same keys.

## Implementation Notes

2026-10-16, Dev. Built on `origin/main` at c13904b (PR #60 squash-merged), so no fork-point rebase was needed.

**Dependencies.** The 11 new `Cargo.lock` entries and their crates.io `created_at`: aead 0.5.2 (2023-04-02), chacha20 0.9.1 (2023-04-01), chacha20poly1305 0.10.1 (2022-08-10), cipher 0.4.4 (2023-03-09), hex 0.4.3 (2021-03-03), hkdf 0.12.4 (2023-12-13), hmac 0.12.1 (2022-02-17), inout 0.1.4 (2025-02-21), opaque-debug 0.3.1 (2024-03-01), poly1305 0.8.0 (2022-07-31), universal-hash 0.5.1 (2023-05-19). sha2 0.10.9 (2025-04-30) was already locked. All are before 2026-10-02 and none is yanked, so nothing was pinned back. No existing lock entry changed. No npm dependency, `mobile/package.json`, its lockfile or `src-tauri` changed.

**Story 2's `enc`.** It moved verbatim to `relay/protocol/src/enc.rs`, and `LOGIN_LABEL` to `labels.rs`. Both are re-exported at the crate root. Story 2's tests in `lib.rs` are unchanged and pass, and `relay-core` is untouched.

**Generator.** `vectors/generate.mjs` reproduces RFC 5869 case 1, RFC 8032 test 1, HChaCha20 (draft-irtf-cfrg-xchacha 2.2.1) and XChaCha20-Poly1305 A.3.1 before it writes anything. The SAS search landed on code `019793`.

**Choices where the plan left room.** These are recorded in `remote-protocol.md`:
- **QR check order.** Superseded by the owner's ruling (see Boundaries): the version is read first, so `ade-pair://v2 x` is `newer_version`. The first build (143279d) checked the characters first.
- **Percent-decoding of byte fields.** Strict percent-decoding applies to every value, the byte fields included: `slot=%41...` is accepted.
- **Empty relay.** Superseded by the owner's ruling: `relay=` is `not_pairing_code`. The first build made it `insecure_relay`.
- **Builder escaping.** The builder escapes `relay` as well as `n`, giving `relay=wss%3A%2F%2F...`. It refuses a relay under the parser's relay rule, with the same error.
- **HKDF info constant names.** The two HKDF `info` constants are named `PAIR_PHONE_TO_MAC_INFO` and `PAIR_MAC_TO_PHONE_INFO`, so they can't be taken for `enc` labels. The other nine are `*_LABEL`.
- **SAS inputs.** `sas_code` takes a `SasInputs` struct, and `sasCode` an object, rather than eight positional arguments.
- **Signing key types.** Rust `sign` takes a `SigningKey`. TypeScript `sign` takes the 32-byte seed.
- **Lossy decoder vectors.** `names.json` also has a `lossy` section that pins the decoder alone, before cleaning, with each maximal subpart as one U+FFFD. Rust checks it against `String::from_utf8_lossy`, and TypeScript against `utf8DecodeLossy`.
- **Extra Rust test.** `vectors_seal_anchor_xchacha` also pins the RustCrypto crates to the A.3.1 and RFC 5869 anchors.

**Test-first.** Each Rust test (vectors and units) ran red against `todo!()` stubs: 22 failed. The TypeScript vector test ran red (13 failed) before the modules existed. The three mobile smoke cases were written after the package code, so they were never seen red.

**Review round (2026-10-16).** The fixes after the review of 143279d:
- **Rulings 1 and 2.** In `qr.rs` and `qr.ts`, the version check now comes before the character check, and `check_relay` / `checkRelay` refuse an empty relay as `not_pairing_code`. In `qr.json`, "a character outside 0x21-0x7E in a newer version" now expects `newer_version`, and "empty relay" expects `not_pairing_code`. Four cases were added: v2 then non-ASCII; v3 then a tab and a line feed; a space inside the prefix; and `v1` then non-ASCII.
- **Ruling 3.** `sign.rs` has a new `canonical_key`, which refuses an `id` unless `to_edwards().compress()` gives back the same bytes. Its doc comment and the contract now list exactly what each side refuses.
  - `generate.mjs` writes a fourth refused case: A with y = p + 3. That is a large-order point (checked with noble), so only the encoding is wrong.
  - No one knows that point's private key, so no signature can check under it. The vector therefore passed even before the fix. The new Rust unit test `a_non_canonical_key_is_refused_by_the_canonical_check` is what proves the canonical check refuses the key: it failed with the old lax decoding and passes now.
- **`seal_with_nonce` hidden.** It is `pub(crate)` in Rust and no longer re-exported. In TypeScript, `index.ts` exports `seal.ts` by name, without `sealWithNonce`; `vectors.test.ts` imports it from `./seal`, and a test checks that the index doesn't export it. Nothing outside the tests and `seal` itself calls it.
- **TypeScript lengths.** `buildPairCode` and `pairKeys` throw a `RangeError` on a wrong length, through the new `expectLength` in `bytes.ts`. Throwing, rather than returning an error, matches Rust, where a wrong length can't compile. There are 9 new tests.
- **Rust test gaps.** `vectors_signatures` now signs the empty message and compares the result with the RFC 8032 anchor signature. `vectors_sas` now checks that the I_P case and the S_P case each equal the first case in every other field, as the TypeScript test does.
- **Contract labels.** "Owner decision" now marks only what the owner decided: the approved spec-gap choices and rulings 1–3. The following are plain facts of the contract: strict percent-decoding of the byte fields, the builder escaping `relay`, the constant names, the SAS argument shapes and the `sign` signatures.
- **Red before green.** Rust failed 2 tests (the QR parse vector and the canonical-key unit test) with a lax `canonical_key` stub. TypeScript failed 11 (the QR parse vector, the surface test, and 9 length tests).

**Housekeeping.** `packages/protocol/vectors/.gitkeep` was removed, because the folder now has files. The worktree's `mobile/node_modules` is an untracked symlink farm onto the main checkout's install, with `@ade/protocol` pointing at this worktree. It is not committed.

## Plan Change Log

- 2026-10-16, adversarial review of the plan, before approval:
  - Added `seal_with_nonce`, the generator check inside `npm test`, and the 11 labels written out.
  - Added lossy UTF-8, Ed25519 and Names boundary vectors.
  - Tightened the QR grammar, made the byte fields' encoding explicit, and set HKDF's L = 32.
  - Added a fork-point rebase, the scope of the import rule, a mobile seal round trip, and the fix to story 2's note on the signed host.
- 2026-10-16, adversarial review of the code (143279d), which blocked it. The owner's rulings and the approved fixes:
  - Rulings, recorded under Boundaries:
    - In a QR code the version is read first, so the Design Notes' order is superseded.
    - An empty `relay` is `not_pairing_code`.
    - Rust refuses a non-canonical key, with a y = p + 3 vector.
  - Fixes:
    - `seal_with_nonce` is no longer public.
    - TypeScript checks the lengths in `buildPairCode` and `pairKeys`.
    - The Rust tests now check the RFC 8032 anchor signature and every SAS field.
    - Owner labels in the contract now mark only owner decisions.

## Review Triage Log

## Design Notes

**Order with story 2.** Story 2's plan comes first: "Story 3 … may move `enc` within `relay-protocol`, but not change its bytes." So story 3 is built on top of story 2.
- **The default.** PR #60 is squash-merged first. This branch, which holds only this plan, is then rebased onto `origin/main` before any code.
- **Starting earlier.** If Build has to start before #60 merges, base it on `origin/phone-login-presence` and record that fork-point SHA in Implementation Notes. After #60 is squash-merged, run `git rebase --onto origin/main <fork-point-sha>`. This still works if #60 is force-pushed meanwhile.

Either way, story 3 never forks `lib.rs`, `Cargo.toml` or `Cargo.lock` from a main that lacks story 2, so the two branches can't conflict.

**Gaps in the spec that this plan fills** (owner to confirm; see Open Questions):
- **Seals.** `sealed = nonce(24) || ciphertext || tag(16)`, with empty AAD.
  - The label lives in the plaintext. `open` decrypts, then needs `dec(label)` to succeed with exactly `n_fields` fields.
  - A label that is a prefix of another (`pair/commit` and `pair/commit-hash`) can't be mistaken for it: the next 4 bytes would be ASCII, which reads as a length above 512 MiB.
  - `k_pm` and `k_mp` are each 32 bytes of HKDF output.
- **QR byte fields.** `slot` (16 bytes) and `id`, `x` and `s` (32 bytes each) are unpadded base64url, as in control messages. A wrong length, padding, or non-zero trailing bits makes the code `not_pairing_code`.
- **QR grammar:**
  - **The whole code** is characters 0x21–0x7E only.
  - **The prefix** is `ade-pair://v` followed by a decimal with no leading zero. `v1` must be followed by `?`. N ≥ 2 is `newer_version`, whatever follows. `v0`, `v01`, `V1`, and `v1` with no `?`, are `not_pairing_code`.
  - **Parameters** split on `&`, then each on its first `=`. A segment with no `=`, or with an empty key, is `not_pairing_code`, and `+` is literal.
  - **Duplicates.** A duplicate `relay`, `slot`, `id`, `x` or `s` is `not_pairing_code`. A duplicate `n` counts as a missing `n`, and the code stays valid. Unknown keys, duplicated or not, are ignored.
  - **Percent decoding** is strict and accepts hex digits in either case. The builder writes upper-case hex and escapes every byte outside `A–Z a–z 0–9 - . _ ~`.
  - **`relay`** decodes to characters 0x21–0x7E only (otherwise `not_pairing_code`). It must then start with exactly `wss://` plus at least one character (otherwise `insecure_relay`).
  - **Precedence.** Structure errors win over `insecure_relay`.
  - **Order.** The builder writes `relay, slot, id, x, s, n`, and refuses a relay that isn't `wss://`.
  - **Size.** A worst-case `n` (40 four-byte code points) is 480 characters.
- **Verify strictness.** Rust uses `verify_strict` (as login does), and TypeScript uses `zip215: false`.
  - Both refuse a small-order `A` and non-canonical encodings, and the shared refused vectors prove it.
  - They differ only on a crafted small-order `R`, or on mixed-order points (cofactored vs cofactorless). Only the signer can make those, and the cost falls only on its own pairing.
  - This is recorded in `remote-protocol.md`.
- **SAS without BigInt** (Hermes-safe). With `hi` and `lo` the two big-endian u32 halves, the code is `((hi % 1e6) * 967296 + lo) % 1e6`, zero-padded to 6 digits.

**`ws://` in tests.** The parser has no override. Story 5a's CLI phone takes the relay URL from `--url`, not from a code.

## Open Questions

None. The four were settled by the owner on 2026-10-16 (see the decisions under Boundaries).

## Verification

**Commands** (the approved five, plus the `packages/protocol` tests that `npm test` runs):
- `cd relay && cargo test` -- passes; `relay-protocol`'s vector tests are listed by name, and story 2's tests still pass
- `npm test` -- passes, including `packages/protocol/src/vectors.test.ts` and its generator `--check` test
- `npx tsc --noEmit` -- clean
- `cd src-tauri && cargo test` -- unchanged and passing
- `cd mobile && npx tsc --noEmit && npx jest` -- passes, including the new smoke cases

**Results** (QA, 2026-10-16, HEAD f1a74f1, after the review-fix round; run in the worktree):
- `cd relay && cargo test` -- pass. `relay-protocol` 40 passed (was 39; new: `sign::tests::a_non_canonical_key_is_refused_by_the_canonical_check`), including the 12 `vectors::` tests. Other suites 9, 2, 20, 14, 1, 5 passed; 0 failed.
- `npx tsc --noEmit` -- exit 0, clean.
- `npm test` -- 143 files, 1559 tests passed (was 1548). `packages/protocol/src/vectors.test.ts` 25 passed (was 14), including the `generate.mjs --check` test. New: `does not export sealWithNonce: real seals take a random nonce`, `buildPairCode accepts the right lengths`, `pairKeys throws unless s is 32 bytes and slot is 16`, plus new refused-signature and QR vector cases.
- `cd src-tauri && cargo test` -- 456 passed, 0 failed, 1 ignored (plus 12 and 2 in other suites). No src-tauri change.
- `cd mobile && npx tsc --noEmit && npx jest` -- tsc clean; jest 5/5 passed.
- Criteria to tests (unchanged names): AC1 `vectors_enc`/`vectors_story_2_enc_case_is_included`/`vectors_signatures`/`vectors_seals`/`vectors_sas` and TS `enc and dec`, `includes story 2's enc case`, `signatures, and the refused ones`, `seals`, `the 6-digit code`. AC2 `vectors_cross_label_signatures_and_seals_fail` and TS `... under every other (11x10 each)`. AC3 `vectors_qr_parse` and TS `QR codes parse to their fields and name, or their error`. AC4 `vectors_names` and TS `names`. AC5 `vectors_qr_insecure_relays` and TS `QR codes: any relay scheme but wss:// is insecure_relay`. AC6 `vectors_qr_build` and TS `QR codes: the builder`.
