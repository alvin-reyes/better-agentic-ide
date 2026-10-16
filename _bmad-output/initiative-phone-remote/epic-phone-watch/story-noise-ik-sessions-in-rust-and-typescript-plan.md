---
title: 'Noise IK sessions in Rust and TypeScript'
type: 'feature'
ticket: '4'
created: '2026-10-16'
status: 'in-progress'
baseline_revision: '57b626b9adbaf30a243b4801eee250b3a4db1970'
route: 'full'
route_source: 'auto'
risk: 'high'
review: ''
review_source: ''
lenses_ran: ['adversarial-reviewer']
review_loop_iteration: 2
context:
  - '{project-root}/docs/superpowers/specs/2026-10-14-relay-pairing-design.md'
  - '{project-root}/.ade/context/remote-protocol.md'
  - '{project-root}/.ade/context/phone-remote-layout.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every byte of content between ADE and the phone travels inside a Noise IK session, and nothing exists yet: no handshake, no transport frames, no `hs1` counter, no restart rules. The Mac side is Rust on `snow`; the phone side is TypeScript on `@noble`. If the two differ by one byte, or one rule, the phone never connects, or a replayed or forged message gets through.

**Approach:** Wire `Noise_IK_25519_ChaChaPoly_SHA256` once in `relay/protocol` (on `snow`) and hand-roll the same pattern once in `packages/protocol` (on the `@noble` peers already installed). Pin both to the published cacophony IK vector and to cross vectors in `packages/protocol/vectors/`. The cross vectors come from a third Noise implementation on `node:crypto` inside `generate.mjs`, which first reproduces the cacophony vector. On top, add sans-IO session state machines with an injected clock and injected stores: the Mac's (Rust, `relay/core`) and the phone's (TypeScript, and Rust for the CLI test phone). They hold the `hs1` counter rule, the nonce rule, the other-session rule and the restart rules, and are tested against in-memory stores.

## Boundaries & Constraints

**Always:**
- Follow the spec's "Sessions", "Wire format" (the binary envelope), "`hs1` across pairs" and "Keys and storage" (where the counters are keyed) exactly. Where the spec is silent, follow the owner's decisions below and Design Notes.
- The pattern is `Noise_IK_25519_ChaChaPoly_SHA256`, and the phone is the initiator. The prologue is `enc(NOISE_LABEL, I_M, I_P)`, using story 3's `enc` and `NOISE_LABEL`. The `hs1` payload is exactly 8 bytes, a big-endian counter. The `hs2` payload is empty. A frame body is `session_id(8) || u64be(nonce) || ciphertext`, where the session id is the first 8 bytes of the handshake hash. The binary envelope is `u8 type (1 hs1, 2 hs2, 3 frame) || 32-byte peer key || body`.
- `hs1` counters are keyed only by identity keys: the Mac's last accepted counter per (Mac key, phone key), the phone's `last_sent` per Mac key. No store method takes a pair id or a relay URL. Each counter update is one atomic step (check-and-record on the Mac, compute-and-record on the phone) shared by every session machine using that store, because several relays can share one key.
- Rust uses `snow =0.10.0` with `default-features = false` and the features `default-resolver`, `use-chacha20poly1305`, `use-sha2`, `use-curve25519` and `use-getrandom`. Leave out `std`, because it turns on `ring` and its `cc` 1.8.0 (2026-10-11). Its transport is `snow`'s `StatelessTransportState`. TypeScript imports only `@noble/curves` 1.9.7 (2025-08-15), `@noble/ciphers` 1.3.0 (2025-04-24) and `@noble/hashes` 1.8.0 (2025-04-21), the peers already locked, and takes randomness only from `globalThis.crypto.getRandomValues`.
- Test hooks stay out of the public API. These are: a fixed ephemeral key, a preset send nonce or frame count, a lowered frame or time limit, and the TypeScript responder. In Rust they are `pub(crate)` or `#[cfg(test)]`. In TypeScript they are not exported from `index.ts`; tests import them from their module. A test checks that `index.ts` exports none of them.
- TypeScript checks every input length that Rust's array types check for free (keys 32, identity keys 32, session id 8), throwing a `RangeError`. It also checks that a counter, `wall_ms` and `mono_ms` are each a safe non-negative integer.
- Every claim written into `.ade/context/remote-protocol.md` names the test that would fail if the claim were false.
- Every new dependency, and every new `Cargo.lock` entry, is from before 2026-10-02. No new npm dependency.

- Decision (owner, 2026-10-16): story 4 includes a Rust phone state machine in `relay/core`, used by the in-process tests and by story 5a's CLI phone.
- Decision (owner, 2026-10-16): one 10 s restart window on each side, shared by every trigger; its scope is per (peer, relay), by the later ruling below. A trigger inside it is coalesced into one deferred start at the window's end, which is dropped if a session completed after the trigger.
- Decision (owner, 2026-10-16): a replayed or lower-nonce frame is dropped silently, with no restart. A current-session frame that is truncated, oversized, tampered or has nonce ≥ 2^32 restarts the session. The current session stays usable until a newer one completes.
- Decision (owner, 2026-10-16): `hs1` counters are integers from 0 to 2^53−1 (the phone errors, the Mac refuses above it); nonces are below 2^32 on both sides, and a sender never uses 2^32.
- Decision (owner, 2026-10-16): "2^32 frames" means the phone's own send nonce reaching 2^32, or a received nonce of 2^32−1. The Mac at its own send ceiling drops the session and emits `Rehandshake`.
- Decision (owner, 2026-10-16): a handshake with no `hs2` gets one automatic retry 10 s later, then waits for the next trigger.
- Decision (owner, 2026-10-16): the Mac refuses a bad `hs1` silently, with no answer. An `hs2` whose length isn't exactly 48 bytes is refused.
- Decision (owner, 2026-10-16): both languages refuse a remote `e` or `s` whose X25519 output with the local secret is all zeros (low order).
- Decision (owner, 2026-10-16): binary-frame routing and the `rehandshake` `Control` variant are story 7b's (story 7 is split into 7a, storage, and 7b, limits, routing and replacement). Story 7b uses this story's shared `Routed` envelope type. Story 4 only produces the `Rehandshake(phone)` action.
- Decision (owner, 2026-10-16): pull to refresh with no session (already in the spec, a 2026-10-15 follow-up) is built in story 4 as a phone handshake trigger, through the same restart window.
- Decision (owner, 2026-10-16): the architect writes ADR 0005 (relay and protocol choices) separately; it is not story 4's.
- Decision (owner, 2026-10-16): the plan is kept whole.
- Decision (owner, 2026-10-16): an outstanding handshake newer than the adopted session that gets no `hs2` within 10 s raises one trigger through the restart window, at most once per handshake (this covers a lost newer `hs2`).
- Decision (owner, 2026-10-16, option (a)): the hanging-handshake trigger is armed only when an older handshake's `hs2` is adopted after the newer one started. A silent Mac gets only the ordinary single retry.
- Decision (owner, 2026-10-16): the restart window is one per (peer, relay), matching the machines, which exist per relay.
- Decision (owner, 2026-10-16): stories 7a (storage, after [2]) and 7b (limits, routing, replacement, after ["7a"]) are tickets; 5a is after [2, 4, "7a", "7b"]. Story 7b owns binary routing over `Routed`, the `rehandshake` `Control` variant and the CLI's handling of it.
- Decision (owner, 2026-10-16, a spec amendment made on the 7b side): `rehandshake` is `{"v":1,"t":"rehandshake","peer":<32 bytes>}` and counts against the control limit. Story 4 emits only the `Rehandshake(phone)` action.
- Decision (owner, 2026-10-16): if story 7b starts before story 4 merges, 7b creates `relay/protocol/src/routed.rs` exactly to this plan's definition, and story 4 rebases onto it.

**Never:**
- No relay changes: no `relay/server` code, no routing of binary messages or `rehandshake`, no storage, no limits, no SQLite. Storage is story 7a's; limits, routing and replacement are story 7b's.
- No `Control` change. The Mac machine emits `Rehandshake(phone)` as an action; story 7b adds the `rehandshake` wire message, its `Control` variant and its routing. This keeps clear of story 7b's `Control` edits and of the CLI's `next_event`, which turns any known but unhandled type into an error.
- No persistence of counters (stories 8 and 12a/12b), no pair records or the pair lookup's real implementation (5a and 5b), no TypeScript control-message parsing (5b), no snapshot or frame-plaintext layout (6), no `src-tauri` change, no change to `mobile/package.json` or its lockfile.
- No rekey, and no content in `hs1` or `hs2`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Handshake | phone `hs1` (104 bytes) then Mac `hs2` (48 bytes) | both sides hold the same session id, and frames open both ways | none |
| Replayed `hs1` | the same `hs1` again, or any counter ≤ last accepted | refused; no `hs2`; the Mac's current session is unchanged | silent |
| Wrong static | `hs1` whose remote static isn't one of the Mac's paired `S_P` for the sending `I_P` | refused, counter not recorded | silent |
| Wrong sender | `hs1` made by phone A, delivered as from phone B | refused (prologue mismatch) | silent |
| Bad `hs1` | payload ≠ 8 bytes; low-order `e` or `s`; truncated; for another Mac's static; counter > 2^53−1 | refused | silent |
| Bad `hs2` | length ≠ 48 (so a non-empty payload), tampered, low-order `e`, for an older handshake | that `hs2` ignored; the outstanding handshakes still accept their right `hs2` | silent |
| Frame, other session | session id ≠ current, or body < 8 bytes | dropped | silent, no restart |
| Frame, replay or lower nonce | nonce ≤ last accepted | dropped, not decrypted | silent, no restart |
| Frame, gap | nonce > last accepted + 1 | accepted | none |
| Frame, bad | current session id, but body < 32 or > 60,032 bytes, tampered, or nonce ≥ 2^32 | dropped; last accepted unchanged | restart, rate-limited |
| Plaintext too big | 60,001 bytes to seal | refused before sealing, no nonce used | Rust `Err`, TypeScript `RangeError` |
| Phone clock back or skewed | `now_ms` < `last_sent` | sends `last_sent + 1`; connects | none |
| Store write fails | the counter can't be recorded | no `hs1` sent (phone), no `hs2` sent (Mac) | error surfaced |

</frozen-after-approval>

## Code Map

- `relay/protocol/src/lib.rs` -- `NOISE_PATTERN` and `Control` live here. Add `mod noise;` and `mod routed;` with their `pub use`s. Don't touch `Control` or `KNOWN_TYPES`: story 7b edits them, and `relay/cli/src/lib.rs:151-159` makes any known type without an event a `ClientError::Protocol`.
- **The binary envelope is one type for both stories.** Story 4 owns `relay/protocol/src/routed.rs`: `Routed { kind, peer, body }` with `parse` (`None` under 33 bytes or for a type other than 1, 2, 3), `encode` and `with_peer` (owner decision: story 7b uses this type). Record it in `remote-protocol.md`. There are never two parsers: if story 7b lands first, it has created `routed.rs` exactly to this definition (owner decision), and story 4 rebases onto it and reuses it, adding only what is missing (for example `encode`) without changing `parse`'s behaviour.
- `relay/protocol/src/{enc,labels}.rs` -- reuse `enc` and `NOISE_LABEL`. Don't change them.
- `relay/protocol/src/vectors.rs` -- the `vector!` macro (`include_str!` of `packages/protocol/vectors/…`) and the helpers `load`, `bytes`, `arr`, `fields`. Add the Noise tests here.
- `relay/protocol/src/seal.rs` -- the pattern for a `pub(crate)` deterministic twin (`seal_with_nonce`) beside the public random one.
- `relay/core/src/lib.rs` -- `PairDirectory` (`&self`, `Send + Sync`, with an in-memory implementation over a `Mutex`) is the pattern for the new injected traits. Add `mod session;` and its `pub use`.
- `relay/Cargo.toml` -- `[workspace.dependencies]`. `curve25519-dalek 4.1.3`, `getrandom 0.3.4`, `chacha20poly1305 0.10.1`, `sha2 0.10.9` and `subtle 2.6.1` are already locked, so `snow` 0.10.0 is the only new lock entry (checked in a scratch copy, 2026-10-16).
- `packages/protocol/src/index.ts` -- `NOISE_PATTERN`, `suite`, and an explicit export list for `seal.ts`. Follow that style for the new modules.
- `packages/protocol/src/bytes.ts` -- `expectLength`, `concatBytes`, `randomBytes`, `toHex`, `fromHex`. Reuse them.
- `packages/protocol/src/{enc,labels}.ts` -- `enc` and `NOISE_LABEL`.
- `packages/protocol/vectors/generate.mjs` -- top-level script: `checkAnchors()`, a `files` map, `--check`. It already has the PKCS8/SPKI DER-prefix trick for raw Ed25519 keys in `node:crypto`; X25519 uses the same trick with OID `1.3.101.110`.
- `packages/protocol/src/vectors.test.ts` -- reads vectors with `node:fs`, and runs `generate.mjs --check` with `spawnSync`. Root tsc has no `resolveJsonModule`.
- `mobile/__tests__/protocol.test.ts` -- the app's Jest smoke test.
- `.ade/context/remote-protocol.md` (`NOISE_LABEL` "reserved … unused") and `phone-remote-layout.md` (exports, Rust dependencies). Update both.
- `snow` 0.10.0 facts, read from its source: `Builder::fixed_ephemeral_key_for_testing_only` is a public, doc-hidden `snow` method, which our wrapper reaches only from `pub(crate)` code. A failed `HandshakeState::read_message` restores the symmetric state, so a bad `hs2` followed by the good one still completes (proved in a scratch probe). That rollback only helps if the read fails: the wrapper refuses an `hs2` whose length isn't 48 before reading it, and passes a 0-byte payload buffer, so a non-empty payload fails inside `snow` (`cipherstate.rs:56`) rather than completing the handshake. `StatelessTransportState::{write_message, read_message}(nonce, …)` refuses nonce `u64::MAX`. The default `Dh25519` does **not** refuse an all-zero DH result, but `@noble/curves` 1.9.7 `x25519` throws on one (`montgomery.js`, "invalid private or public key received").
- Spec lines ~152–187 (Wire format), ~489–499 (`hs1` across pairs, sessions and unpairs), ~559–606 (Sessions), ~671–700 (Keys and storage), ~897–902 and ~996–1009 (tests).

## Tasks & Acceptance

**Execution:**
- [x] `relay/Cargo.toml`, `relay/protocol/Cargo.toml` -- add the workspace dependency `snow = { version = "=0.10.0", default-features = false, features = ["default-resolver", "use-chacha20poly1305", "use-sha2", "use-curve25519", "use-getrandom"] }` (crates.io 2025-07-19, MIT/Apache-2.0, MSRV 1.85; rustc here is 1.93.1). Also add `curve25519-dalek = "4.1.3"` (2024-06-18, already locked), used to derive static public keys and to check for low-order points. Run `cargo tree -p relay-protocol` and diff `Cargo.lock`: the only new package is `snow 0.10.0`. If anything else appears, check its date and pin it back with `cargo update --precise`.
- [x] `packages/protocol/vectors/cacophony-ik.json` -- the one `Noise_IK_25519_ChaChaPoly_SHA256` entry, copied verbatim from cacophony's `vectors/cacophony.txt`.
  - **Source:** public domain (Unlicense). The upstream file's SHA-256 is `3bde7c09…6cae`, identical to `snow` 0.10.0's `tests/vectors/cacophony.txt`. Record the source URL, the commit and that file hash in the JSON as provenance.
  - **Contents:** prologue "John Galt"; the initiator's static and ephemeral and the responder's static and ephemeral; `hs1` of 112 bytes (16-byte payload) and `hs2` of 63 bytes (15-byte payload); four transport messages with implicit nonces 0, 0, 1, 1; and `handshake_hash`.
  - **Pinning:** `generate.mjs` holds the SHA-256 of the excerpt file itself as a constant, and `--check` compares against it.
- [x] `packages/protocol/vectors/generate.mjs` + `noise.json` -- an IK oracle on `node:crypto` only: X25519 through raw-key DER, `chacha20-poly1305` with the Noise nonce `0x00000000 || u64le(n)`, and HMAC-SHA256 HKDF.
  - **Anchor first.** It reproduces `cacophony-ik.json` byte for byte (every message and the handshake hash) and fails before writing anything if it can't.
  - **`noise.json`** comes from fixed seeds, as in story 3:
    - the keys and the prologue;
    - `hs1` for counters 0, 1,760,000,000,000 and 2^53−1;
    - `hs2`, the handshake hash and the session id;
    - frames both ways at nonces 0, 1 and 7, with plaintexts of 0, 1 and 60,000 bytes;
    - the envelope bytes for each type;
    - a sweep of 16 transcripts with varied keys and lengths.
  - **Refused cases.** Each names its layer. Only the `crypto` layer is run against `noise.json` in both languages; the others are `relay-core` tests (Rust only, because TypeScript has no Mac machine).
    - **`hs1`, crypto layer:**
      - payload of 0 or 9 bytes;
      - counter 2^53;
      - made by phone A but sent as B (prologue);
      - truncated;
      - made for another Mac's static;
      - a low-order `e`;
      - a low-order `s` (snow completes this read, so only our check refuses it).
    - **`hs2`, crypto layer:**
      - length ≠ 48 (a 1-byte payload);
      - tampered;
      - a low-order `e`.
    - **Low-order u-values**, each as an `e` and as an `s`: 0, 1, p−1, the two order-8 points, their +p encodings where < 2^255, and their top-bit-set encodings. For these the oracle mixes the all-zero DH result itself. **Low-order rule:** a remote key is refused when X25519 of it with the local static secret gives all zeros, which is noble's rule. Every clamped scalar is a multiple of 8 and never a multiple of the large prime order, so any clamped secret gives the same verdict; the static secret is used because `snow` never exposes the ephemeral. The check on a remote `e` runs on the message's first 32 bytes before the message is read. A low-order-`e` `hs2` followed by the right `hs2` completes, in both languages (a vector step).
    - **Pairing layer (Rust `relay-core`):** an unpaired static.
    - **Counter layer (Rust `relay-core`):** a counter not above the last accepted.
  - **Receiver scripts.** A sequence of frame bodies, each with its outcome (`accept` + plaintext, `drop`, `bad`), covering every frame row of the matrix. They include:
    - bodies of 0, 7, 8, 15, 31 and 32 bytes;
    - a forged high-nonce frame that fails to decrypt and does not move last-accepted.
  - **A high-bit `e`** (top bit set, which RFC 7748 masks) that completes.
  - **`--differential`** reads JSON cases on stdin and prints transcripts, for the TypeScript differential test.
  - **`--check`** covers `noise.json` and the excerpt's pinned digest.
- [x] `packages/protocol/vectors/schedule.json` -- written by hand from Design Notes ("Restart rules"), with no crypto: step scripts `{at_mono_ms, event, expect}` for the phone's handshake scheduler and its `hs2` adoption rule. Events are abstract (`trigger:<kind>`, `hs2_ok:<counter>`, `bad_frame`, `sent_nonce:<n>`, `recv_nonce:<n>`, `tick`). The scripts cover:
  - each trigger, including pull to refresh with no session (a start) and with a session (nothing);
  - the 10 s window and coalescing;
  - a deferred trigger satisfied by a later-completing session;
  - the one retry with no `hs2`, which counts as a start and opens a new window, and whose deadline colliding with a deferred start gives one start, not two;
  - a hanging newer handshake raising exactly one trigger, and no second one for the same handshake;
  - the Mac never answering after one trigger: exactly 2 starts (the start and its one retry) in 60 s;
  - a hanging trigger and a retry due at the same moment: one start;
  - a store write that fails: the start still counts (window and retry), and the retry gets its own allocation;
  - `hs2_ok` order A, B and B, A, and a lost B after A (the adopted session in each);
  - 24 h;
  - both frame ceilings.

  It also holds counter cases `{wall_ms, last_sent, expect}`: `last_sent` absent, a clock set back, a clock equal to `last_sent`, and `last_sent` at 2^53−2 and at 2^53−1 (an error).
- [x] `relay/protocol/src/noise.rs` -- on `snow`:
  - **The raw layer** (`pub(crate)`): `handshake_raw` for each role, taking the prologue, the payload, the local keys and an optional fixed ephemeral. The public wrapper calls it, and the cacophony test drives it with cacophony's own prologue and payloads.
  - **Keys and prologue:** `StaticKeypair::{generate, from_secret}` and `noise_prologue(i_m, i_p)`.
  - **Phone side:**
    - `Initiator::start(own, i_m, i_p, mac_static, counter) -> Result<(Initiator, hs1), HandshakeError>` refuses a low-order Mac static and a counter above `MAX_COUNTER`.
    - `Initiator::finish(&mut self, hs2) -> Result<Session, HandshakeError>` checks that the length is 48 first and reads into a 0-byte payload buffer, so a failure leaves the state usable.
  - **Mac side:** `read_hs1(own, i_m, sender_i_p, hs1) -> Result<Hs1Read, HandshakeError>`, where `Hs1Read` gives `remote_static()` and `counter()`. Then `Hs1Read::reply() -> (hs2, Session)`.
  - **`Session`**, with private fields and read-only `id()`, `send_nonce()` and `last_recv()`:
    - `seal(&mut self, plaintext) -> Result<Vec<u8>, FrameError { TooLarge, Ceiling }>`;
    - `open(&mut self, body) -> Opened { Accept(Vec<u8>), Drop, Bad }`.
  - **Constants:** `HS1_LEN = 104`, `HS2_LEN = 48`, `SESSION_ID_LEN = 8`, `MAX_PLAINTEXT = 60_000`, `NONCE_CEILING = 1 << 32`, `MAX_COUNTER = (1 << 53) - 1`.
  - **Low-order keys:** it refuses a low-order remote `e` or `s` by the low-order rule, computed with `curve25519-dalek`'s `MontgomeryPoint::mul_clamped` and the local static secret, as `snow` itself computes DH. `snow` doesn't refuse these. The `e` check runs on `hs1[0..32]` / `hs2[0..32]` before `read_message`, because a successful `snow` read can't be undone. The remote `s` (only in `hs1`, on the Mac) is checked after the read; a refused `hs1` discards its responder state, which is never reused.
  - **Hooks,** all `pub(crate)`: a fixed ephemeral key, and a preset send nonce and last-accepted.
- [x] `relay/protocol/src/routed.rs` -- the shared envelope type (see Code Map), with byte-equal vectors from `noise.json` and the no-panic loop.
- [x] `relay/protocol/src/vectors.rs` -- add these tests:
  - `vectors_cacophony_ik`: the raw layer reproduces every message and the handshake hash;
  - `vectors_noise_*`: `hs1`, `hs2`, frames and envelopes byte-equal; every crypto-layer refused case refused; every receiver script; the sweep.
  - **Unit tests in `noise.rs`:**
    - nonce 2^32 refused on send and on receive (through the hook);
    - `seal` of 60,001 bytes refused with the nonce unchanged;
    - a low-order Mac static refused by `Initiator::start`;
    - a loop of 2,000 random bodies through `open` and `Routed::parse` that never panics.
- [x] `relay/core/src/session.rs` -- sans-IO, with time passed in (`mono_ms`, plus `wall_ms` for the phone counter).
  - **Traits**, all `&self + Send + Sync`, with in-memory implementations over a `Mutex`:
    - `Hs1Counters { accept_if_above(mac, phone, v) -> Result<bool> }` checks and records in one atomic step;
    - `PairedStatics { statics(mac, phone) -> Vec<[u8; 32]> }`;
    - `LastSent { next_counter(mac, wall_ms) -> Result<u64> }` computes `max(wall_ms, last + 1)`, records it and returns it in one atomic step.
  - **`MacSessions`** (one per Mac identity and relay; several may share one store): `on_hs1`, `on_frame`, `send`, `end(phone)`, `poll` and `next_deadline`. Its actions are `Send(Routed)`, `Rehandshake(phone)`, `Started(phone)` and `Deliver(phone, bytes)`. `send` with no session, or at the Mac's send ceiling, returns `Err(NoSession)` and raises the trigger.
  - **`PhoneSession`** (one per Mac and relay): `trigger(kind, now)`, `on_hs2`, `on_frame`, `send`, `end`, `poll` and `next_deadline`.
    - **Outstanding initiators.** It keeps at most 4, dropping the oldest. An `hs2` is tried against them newest first, only those whose counter is above the current session's. On adoption, every outstanding initiator with a lower counter is dropped; those with higher counters stay. An outstanding initiator expires after 24 h.
    - **The adoption rule:** an `hs2` is adopted only if its counter is above the current session's.
    - **A newer handshake left hanging** (owner decisions): the trigger is armed for an outstanding initiator only when an older handshake's `hs2` is adopted after that initiator started. That is the lost-newer-`hs2` case, and it is evidence that the Mac is answering. If the armed initiator gets no `hs2` within 10 s of its start, it raises one trigger through the window, once. With no adopted session, nothing is armed, and the ordinary single retry applies. A hanging trigger and a retry due together give one start. It is a scheduler event (`hanging:<counter>`) in `schedule.json`.
    - **When a start counts:** when `StartHandshake` is emitted, not when `begin` runs. So a failed store write still opens the window and still gets its one retry.
    - `send` with no session or at the ceiling returns an error and raises the trigger.
    - **Two-step start (same shape in both languages, for the async store):** when a start is due, `poll`/`trigger` returns `StartHandshake { token }`. The driver gets a counter from the store and calls `begin(token, counter) -> Option<hs1>`. `begin` returns nothing if the token is stale, meaning `end()` ran or a newer session was adopted in between; the counter is then simply skipped, which is harmless because counters only need to rise. A failed store write produces no `begin`, so no `hs1`.
  - **The `Scheduler`** (pure, shared by both) holds the 10 s window, coalescing, the retry, 24 h and the adoption rule. The ceilings and the time limits are fields of the machines, compared before calling `seal`. Only `pub(crate)` test constructors in `relay-core` can lower them, so no protocol hook crosses crates. `end(peer)` drops the session and its outstanding handshakes; story 5a calls it when no pair remains.
- [x] `relay/core/src/session.rs` tests -- one test per line of AC2–AC6, named after its spec line, running Mac against phone in-process with in-memory stores. Also:
  - **Two relays, one store:** the `Hs1Counters` trait has no separate read method, so a check-then-act is impossible through it. Two `MacSessions` sharing the in-memory store, fed one replayed `hs1` on two threads behind a barrier, are looped 1,000 times: exactly one accepts each time. The same threaded loop runs for two Rust `PhoneSession`s on one `LastSent`: their counters are always distinct.
  - **Cross-relay collision:** two relays, triggered together, can deliver the lower counter second, and it is refused. The test shows the 10 s retry heals it.
  - **The lost-`hs2` sequence:** A, then retry B; the Mac accepts both and is on B; `hs2_A` arrives and `hs2_B` is lost. The phone adopts A; 10 s after B's start it raises one trigger, starts C through the window, and both sides end on C with frames flowing both ways. If C's `hs2` is also lost, nothing older was adopted after C started, so C is not armed: it gets the ordinary single retry, then the phone waits for the next trigger, and B raises no second one. The same sequence is a TypeScript test against the internal responder, and a `schedule.json` script (both).
  - **The stuck-state sequence:** A sent, retry B sent, the Mac adopts A, B lost. The phone adopts A and has a session.
  - **`schedule.json`**, read through `include_str!`. `relay-core` gains `serde_json` and `hex` as dev-dependencies from the workspace.
- [x] `packages/protocol/src/noise.ts` -- a hand-rolled IK on `@noble`.
  - It has `CipherState` with an explicit nonce and `SymmetricState`. The protocol name is exactly 32 bytes, so `h` starts as the name itself.
  - **Raw layer:** `handshakeRaw`, which is not exported from `index.ts`.
  - **Initiator:** `startHandshake(...) -> {hs1, counter, finish(hs2)}`. `finish` checks for 48 bytes first, returns a `Session` or `null`, and leaves the state usable.
  - **Responder:** `readHs1`/`reply`, not exported.
  - **Keys:** `generateStaticKeypair` and `staticFromSecret`.
  - **Low-order keys:** it applies the low-order rule explicitly, before mutating `SymmetricState`, and doesn't rely on catching noble's throw.
- [x] `packages/protocol/src/frame.ts` -- `Session` with private state:
  - `seal(plaintext)`: a `RangeError` above 60,000 bytes; `{ok: false, error: "ceiling"}` at the nonce ceiling;
  - `open(body) -> {kind: "accept", plaintext} | {kind: "drop"} | {kind: "bad"}`;
  - nonces are numbers below 2^32, written and read as two u32 halves, with no BigInt (Hermes);
  - `encodeRouted` / `parseRouted`, the twins of `Routed`.
- [x] `packages/protocol/src/session.ts` -- the counter store, the `Scheduler` and `PhoneSession`:
  - `LastSentStore` (async `get(macId)` / `set(macId, v)`, because `expo-secure-store` is async) and `memoryLastSentStore()`;
  - `CounterAllocator`, one per app, wrapping the store with a promise chain per Mac key, so that every `PhoneSession` for that Mac (one per relay) gets distinct, rising counters. A rejected `set` rejects only its own link; the chain continues for the next caller;
  - the `Scheduler`, with the same rules as Rust;
  - `PhoneSession`, with the same outstanding-initiator and adoption rules as Rust.
- [x] `packages/protocol/src/index.ts` -- export the public names only. Extend the surface test: `handshakeRaw`, the responder, the fixed-ephemeral entry and the preset-nonce hooks are absent.
- [x] `packages/protocol/src/vectors.test.ts`, `session.test.ts` -- the same vector assertions as Rust (cacophony through `handshakeRaw`, the crypto layer of `noise.json`, `schedule.json`), plus:
  - the phone-side AC2–AC6 tests against the internal responder;
  - the stuck-state sequence;
  - two `PhoneSession`s for one Mac key triggered at once, which send distinct counters;
  - a failing `set` sends no `hs1`, and the next allocation still works;
  - a stale `begin` token (after `end()`, or after a newer session was adopted) returns nothing;
  - a **differential** test: 64 seeded random cases (keys, counters, payload lengths 0–60,000), whose TypeScript transcripts must equal `generate.mjs --differential`'s, run through `spawnSync` like `--check`. The comparison uses per-case SHA-256 digests, so the output stays far under `spawnSync`'s 1 MiB `maxBuffer`;
  - 2,000 random bodies through `open` and `parseRouted`, none of which throws;
  - a `RangeError` for each wrong input length.
- [x] `mobile/__tests__/protocol.test.ts` -- one smoke test: a handshake against the responder (imported from `@ade/protocol/src/noise`, as tests do) and one frame each way, under the app's Jest. Jest runs on Node's crypto, not Hermes; as in story 3, the Hermes path is covered only by `expo export` or a device.
- [x] `.ade/context/remote-protocol.md`, `phone-remote-layout.md` -- add a "Sessions" section covering:
  - the pattern and the prologue;
  - `hs1` and `hs2`;
  - the frame layout and the shared `Routed` envelope;
  - the nonce and counter domains;
  - the drop/bad/restart table;
  - the scheduler and adoption rules;
  - the low-order rule;
  - the store traits and their atomicity;
  - `Rehandshake` as an action (its wire form, `{"v":1,"t":"rehandshake","peer":...}`, and its routing are story 7b's);
  - the new exports, and the new `relay-protocol` dependencies `snow` and `curve25519-dalek`.

  Each rule names its test. "Owner decision" marks only the rulings under Boundaries. `NOISE_LABEL` is no longer "unused".

**Acceptance Criteria** (one per ticket item; "both" means Rust and TypeScript run the same vector file):
- AC1 (ticket 1): Given `cacophony-ik.json` and `noise.json`, when each language runs them, then every handshake message, handshake hash, session id, frame and envelope equals the vector. Cacophony runs through each language's raw layer. Every crypto-layer refused case is refused, low-order keys included, every receiver script gives its outcomes, and TypeScript equals the oracle on 64 random cases.
- AC2 (ticket 2): Given in-memory stores, when a phone handshakes, then it sends `max(now_ms, last_sent + 1)` and records it per Mac key before sending (both, `schedule.json`). The Mac accepts only a counter above the one recorded for (its key, that phone's key), and records it before sending `hs2` (Rust). A store whose write fails stops the handshake on either side. Two Mac machines sharing a store on two threads accept a replayed `hs1` once at most. Two phone sessions for one Mac key, triggered together, send distinct counters (both).
- AC3 (ticket 3): Given the in-memory stores and pair lookup, when a pair is removed and paired again, then the counter carries over. An `hs1` captured before an unpair, or accepted through another `MacSessions` sharing the store (another relay), is refused. One phone with two Macs keeps two counters (Rust both sides; TypeScript phone side).
- AC4 (ticket 4): Given a Mac and a phone in-process, then each spec "Sessions" line is a named test that passes: replayed `hs1` refused; clock set back and skewed still connect; old-session frames start no handshake; a wrong static is refused; the Mac emits `Rehandshake` when it has no session; a dropped frame doesn't break the session; two handshakes at once leave the newest completed on both sides, including when the newer `hs1` is lost (the stuck-state sequence) and when the newer `hs2` is lost (the lost-`hs2` sequence, which converges on a fresh handshake).
- AC5 (ticket 5): Given a live session, then a frame with another session id is dropped with no action. A bad frame on the current session makes the phone handshake and the Mac emit `Rehandshake`. Each side starts at most one restart per 10 s per (peer, relay). The phone starts a handshake on Mac online, foreground, `rehandshake`, after 24 h, and at the frame ceiling, and (owner decision) on pull to refresh only while it has no session, all through the same window (both, `schedule.json` plus in-process tests).
- AC6 (ticket 6): Given a receiver, when frames arrive with nonces 0, 2, 2, 1, 5, then 0, 2 and 5 are accepted and the others are dropped (both, receiver scripts).
- AC7 (ticket 7): Given a 60,001-byte plaintext, when it is sealed, then it is refused and no nonce is used up. A 60,000-byte one seals, and its envelope is ≤ 65,536 bytes (both).

## Implementation Notes

2026-10-16, developer (worktree `agent-a4c63180ba3a5db79`, branch `phone-noise-sessions`, on plan commit 9f40261 / main 57b626b; `origin/main` still has no `routed.rs`, so no rebase).

**Built.**
- `relay/protocol`: `noise.rs` (the `pub(crate)` raw layer on `snow`, `StaticKeypair`, `noise_prologue`, `Initiator`, `read_hs1`/`Hs1Read`, `Session` with `seal`/`open`, the low-order rule on `curve25519-dalek`) and `routed.rs` (`Routed`, `RoutedKind`, `parse`/`encode`/`with_peer`).
- `relay/core`: `session.rs` (the three store traits and their in-memory implementations, `next_counter_value`, the shared `RestartWindow`, the pure `Scheduler`, `PhoneSession`, `MacSessions`).
- `packages/protocol`: `noise.ts`, `frame.ts`, `session.ts`, and the explicit exports in `index.ts`.
- Vectors: `cacophony-ik.json` (upstream commit `18b7348c`, file hash `3bde7c09…6cae` checked against GitHub and snow's copy); `noise.json` from the new `node:crypto` IK oracle in `generate.mjs`, which reproduces cacophony first, plus `--differential`; and `schedule.json`, written by hand.
- Context: a "Sessions" section in `remote-protocol.md`, with each rule naming its test, and `phone-remote-layout.md`. The mobile smoke test.

**Dependencies.**
- `snow =0.10.0` (crates.io 2025-07-19T17:00:59Z, Apache-2.0 OR MIT), with exactly the plan's features and no `std`. It is the only new `Cargo.lock` package; its dependencies, including `rustc_version`, were already locked.
- `curve25519-dalek 4.1.3`, already locked.
- `relay-core` gained the dev-dependency `serde_json`.
- No npm change; neither `package-lock.json` changed.

**Deviations.**
1. `relay-core` does not gain `hex` as a dev-dependency. No test uses it, and an unused dependency is noise.
2. `begin(token, counter)` returns the hs1 *envelope* (`Option<Routed>` / `Routed | null`, kind 1, peer `I_M`), not bare hs1 bytes, so the driver only forwards it.
3. `PhoneSession::new` returns `Result` (TypeScript throws): it refuses a low-order Mac static up front, by a dry `Initiator::start`.
4. The TypeScript low-order rule checks the u-value against the five order-dividing-8 values, after masking the top bit and reducing mod p, rather than computing X25519 itself. That is the plan's "explicitly, never by catching noble's throw". The test "the low-order rule agrees with noble's all-zero X25519 output" shows equivalence on every vector u and on 200 random keys. Rust computes `mul_clamped` with the local static, as planned.
5. Rust's `StoreError` is an enum, `Failed(String)` or `Exhausted`, so `LastSent::next_counter` can report 2^53 − 1 passing. `HandshakeError` is `Length | LowOrder | Decrypt | CounterRange | Finished`.
6. In `schedule.json`, the hanging trigger is an expectation (`expect.hanging: [counters]`), not an input event. It is an output of `poll`, so the scripts pin "exactly one per handshake" as an observed result.
   - Steps may also carry `begin_counter`. It was added after a mutation check showed nothing pinned the adoption floor; see below.
7. `NOISE_PATTERN` moved from `index.ts` into `noise.ts`, re-exported unchanged.
8. The internal TypeScript responder's `reply()` also returns `handshakeHash`, which the differential test needs.
9. TypeScript's "two sessions for one Mac key" runs 50 rounds of `Promise.all` (JavaScript is single-threaded; the allocator's chain is what is under test). The 1,000-round threaded loops are in Rust, as planned.
10. The doc comments on `NOISE_LABEL` in `labels.rs` and `labels.ts` no longer say "unused".
11. Extra refused cases: a tampered hs1, an empty hs1, and an empty or truncated hs2.

**Test-first record.** Each test or vector was written and seen failing before its code, except:
- `mobile/__tests__/protocol.test.ts`'s handshake test passed on its first run, because `noise.ts` already existed.
- `session.ts` (TypeScript) was written before `session.test.ts`. `schedule.json`, which drives it, was written by hand before either scheduler. The test file's first run failed only on the missing `index.ts` exports.
- One Rust session test failed first on a wrong expectation of mine (a 24 h deadline, not 30,000), not a code fault; the test was corrected.
- The surface test passes by construction. It was seen failing by temporarily exporting `readHs1`.

**Mutation checks** (one rule disabled at a time, then the suite run):
- Rust: each low-order check; the replay drop; the 2^32 receive check; a fresh retry; adoption clearing the deferred trigger; never arming the hanging trigger; a check-then-act `accept_if_above`. Each was caught.
- TypeScript: the same scheduler rules, the replay drop, the low-order checks, the counter-range check and the allocator chain's isolation. Each was caught.
- Two mutants first survived: re-arming a fired hanging handshake, and removing the adoption floor. `schedule.json` gained steps that catch them: the at-most-4 script continues past a second adoption, and a new script, "an hs2 at or below the session's counter is never adopted".

**Verification** (all five, run in this worktree):
- `cd relay && cargo test`: passed. `relay-protocol` 61, `relay-core` 55, e2e 14, cli 9 + 2, server 1 + 5.
- `npx tsc --noEmit`: clean.
- `npm test`: 144 files, 1,619 tests passed. `session.test.ts` 31, `vectors.test.ts` 54, `index.test.ts` 4.
- `cd src-tauri && cargo test`: 456 passed, 1 ignored; 12; 2.
- `cd mobile && npx tsc --noEmit && npx jest`: 6 passed.
- `cargo fmt --check` and `cargo clippy --all-targets` in `relay/` are clean.

## Plan Change Log

- 2026-10-16, adversarial review of the draft (BLOCK: 1 blocker, 7 majors, 7 minors). Every finding was folded in:
  - **B1.** Added a `pub(crate)` / non-exported raw handshake layer, so cacophony's prologue and payloads run through our code. The excerpt's digest is pinned in `generate.mjs`.
  - **M1.** The Mac's counter check is one atomic `accept_if_above`, with a two-thread test.
  - **M2.** The phone's counter is allocated atomically per Mac key, shared across relays: `LastSent::next_counter` in Rust, `CounterAllocator` in TypeScript. There is a two-session test.
  - **M3.** The phone keeps every outstanding initiator and adopts by counter, matching the spec's "newest completed". There is a stuck-state test. `send` with no session, or at the ceiling, is defined.
  - **M4.** The ceilings live in `relay-core`'s machines, with `pub(crate)` thresholds. `Session`'s fields are private.
  - **M5.** The low-order rule is defined as an all-zero X25519 output in both languages. Vectors now cover a low-order `s` and each low-order u-value, and Rust refuses a low-order Mac static.
  - **M6.** One `Routed` envelope type is shared with story 7, `Control` is left untouched, and Open Question 9 now agrees with story 7's Open Question 1.
  - **M7.** The matrix rows that rest on Open Questions are tagged as recommendations.
  - **Minors:**
    1. No `Control` variant, so `next_event` doesn't regress.
    2. Frame length is checked before the nonce.
    3. Each refused case names its layer.
    4. `hs2` must be exactly 48 bytes, with a 0-byte buffer.
    5. A retry and a deferred start falling due together give one start.
    6. Added `end(peer)`.
    7. The `hs2` adoption rule and the ceilings are in the shared `schedule.json`.

- 2026-10-16, owner rulings on the twelve open questions: all recorded as decisions under Boundaries. Open Questions cleared; the matrix tags removed. Routing and the `rehandshake` `Control` variant point to story 7b, which uses this story's `routed.rs` (story 4 now owns it rather than reusing story 7's). Pull to refresh added to the scheduler, `schedule.json` and AC5. Plan renamed to `story-noise-ik-sessions-in-rust-and-typescript-plan.md` so `tickets find` resolves it.
- 2026-10-16, the owner's final rulings: the hanging-handshake trigger (with its test in Rust, TypeScript and `schedule.json`), one window per (peer, relay), the 7a/7b tickets and 5a's order, the `rehandshake` wire form owned by 7b, and the rule that 7b creates `routed.rs` to this definition if it starts first. All are recorded under Boundaries, and Open Questions is cleared.
- 2026-10-16, round 3 fixes: window scope made per (peer, relay) everywhere (decision text, AC5, Design Notes). The hanging trigger is written to the recommended scope (Open Question 1), with tests for a silent Mac (2 starts in 60 s), a simultaneous hanging trigger and retry (one start), and a failed store write. A start counts when `StartHandshake` is emitted. Stale "twelve rulings" fixed.
- 2026-10-16, the owner picked option (a) for the hanging-handshake trigger. It is recorded under Boundaries, the waiting-on-ruling marker is gone, and Open Questions is cleared. Nothing else changed.

## Review Triage Log

- 2026-10-16, round 1 (adversarial-reviewer): BLOCK, with 1 blocker, 7 majors and 7 minors, all patched (see Plan Change Log).
- 2026-10-16, round 2 (adversarial-reviewer, no files written): BLOCK, with 0 blockers, 4 majors and 9 minors.
  - **Patched:**
    - M2: the low-order check on `e` runs before the read, with the static secret, plus a vector step.
    - M4: a two-step `StartHandshake`/`begin` API with stale tokens, rejection isolation, and a test that a failed `set` sends no `hs1`.
    - Minors 1, 3, 4, 5, 6, 7, 8 and 9.
  - **Sent to the owner:** M1 (a lost newer `hs2`), minor 2 (the window's scope) and M3 (7a/7b missing from `tickets.toml`). All three were ruled on 2026-10-16; see Boundaries and the Plan Change Log.
- 2026-10-16, round 3 (adversarial-reviewer, short pass): BLOCK, with 0 blockers, 2 majors and 3 minors. The round-2 patches were confirmed (the low-order reasoning, the two-step start, 7a/7b in story 7's `tickets.toml`).
  - **Patched:**
    - Major 2: the window scope was inconsistent; it is now per (peer, relay) everywhere.
    - Minor 1: the rulings count.
    - Minor 2: when a start counts.
  - **Sent to the owner:** Major 1, the hanging trigger loops while the Mac is silent. The owner ruled option (a) on 2026-10-16, the scope the plan was written to.
  - **Not this plan's to fix:** minor 3, 7b's ticket text names fewer items than its plan; that is a note for the scrum-master.

## Design Notes

**Why hand-roll Noise in TypeScript, and use `snow` in Rust.** The spec (approach A) already chose this; the plan re-checked it.
- On npm, `noise-handshake` (holepunch) is built on `sodium-universal`, whose native build doesn't run on Hermes.
- `@chainsafe/libp2p-noise` is XX-only and tied to libp2p streams.
- `noise-c.wasm` needs WebAssembly, which Hermes lacks.
- IK on the three `@noble` peers is about 250 lines: HKDF over HMAC, MixHash/MixKey, two messages. It is pinned by three things: cacophony, the `node:crypto` oracle and the differential test. So no new npm dependency.
- In Rust, `snow` is the reference implementation, and the spec names it.

**Agreement traps the vectors pin:**
- `snow` doesn't refuse a zero DH result, but noble does. So both languages apply one rule: a remote key is refused when X25519 with the local secret gives all zeros. Rust computes it with `MontgomeryPoint::mul_clamped`, the same call `snow` uses, so non-canonical, twist and top-bit encodings fall the same way as in noble. The vectors list each low-order u-value.
- The Noise cipher nonce is little-endian inside, while the wire nonce is big-endian.
- A failed `hs2` read must leave the handshake usable in both languages.

**Counter and nonce domains (owner decision).** Counters are integers from 0 to 2^53−1, and nonces from 0 to 2^32−1. That covers milliseconds for 285,000 years and the spec's 2^32-frame rehandshake. TypeScript then needs no BigInt (Hermes, as with story 3's SAS), and both languages refuse the same values. A sender never uses nonce 2^32: the phone handshakes first, and the Mac drops the session and emits `Rehandshake`.

**Frame outcomes.** The owner ruled on what restarts and what doesn't. The order and the byte bounds are the plan's. The receiver checks in this order:
1. Body under 8 bytes, or another session id: `drop`.
2. Current session, but the body is under 32 or over 60,032 bytes: `bad`. Length is checked before the nonce is read, so 8–15-byte bodies are defined.
3. Nonce ≤ last accepted: `drop`, with no decryption. A relay replaying old frames can't force restarts.
4. Nonce ≥ 2^32, or a failed decrypt: `bad`, which leads to a restart.
5. Otherwise `accept`, and last-accepted moves only now.

Through all of this the current session stays usable until a newer one completes, so a forged frame costs a handshake, not the session.

**Restart rules (owner decisions).** One scheduler per (peer, relay) on each side.
- Any trigger inside 10 s of the last start is coalesced into one deferred start at the window's end. A deferred start is dropped if a session completed after the trigger was raised, so the burst of welcome, presence and foreground at launch gives one handshake, not two.
- The phone's triggers are: Mac online (`welcome` or `presence`), foreground, `rehandshake`, a `bad` frame, 24 h since the session completed, its send nonce reaching 2^32, or a received nonce of 2^32−1. Pull to refresh while it has no session is also a trigger (owner decision); with a session it starts nothing.
- A started handshake with no `hs2` gets one automatic retry 10 s later, then waits for the next trigger. The retry is a start, so it opens a new window. If a deferred start falls due at the same moment, there is one start, not two.
- The Mac's trigger is `send` with no session or a `bad` frame, and its action is `Rehandshake`.

**Two handshakes at once ("the newest completed one wins", spec).**
- **The Mac** takes each accepted `hs1` as its current session when it writes `hs2`. Counters are monotonic, so a reordered older `hs1` is refused.
- **The phone** keeps every outstanding initiator (at most 4) and adopts a completing `hs2` only if its counter is above the current session's. When every `hs2` arrives, both sides end on the newest handshake that reached the Mac. If a newer `hs2` is lost, the hanging-handshake trigger (armed because the older `hs2` was adopted after it started) starts a fresh handshake within about 10 s, so the two sides converge again. A Mac that answers nothing gets only the ordinary start and one retry.
- **A lost newer `hs1`.** If the newer `hs1` is lost (for example a full relay queue, story 7b's `rate_limited`, or a failed counter write on the Mac), the older one still completes. Keeping only the newest initiator would leave the phone without a session while the Mac thinks one is live.
- **`rate_limited` from story 7b** in answer to an `hs1` is, for this story, the same as a lost `hs1`: the retry covers it. Parsing that answer is the routing story's.

**A refused `hs1` is silent (owner decision).** The Mac sends nothing back, so the phone gets no oracle. `hs2` with a non-empty payload is refused.

**Lane.** `relay/core` gets the machines and the traits. ADE's app-state persistence of the Mac counters is story 8, and the phone's is the secure store of 12a. Story 7a gets nothing from this story; story 7b gets the `Routed` type and the `Rehandshake` action to carry.

## Verification

**Commands** (the approved five):
- `cd relay && cargo test` -- passes. `relay-protocol`'s `vectors_cacophony_ik` and `vectors_noise_*` and `relay-core`'s session tests are listed by name, and stories 2 and 3's tests still pass.
- `npx tsc --noEmit` -- clean.
- `npm test` -- passes, including `vectors.test.ts` (cacophony, `noise.json`, `schedule.json`, the differential test and `generate.mjs --check`) and `session.test.ts`.
- `cd src-tauri && cargo test` -- unchanged and passing (no `src-tauri` change).
- `cd mobile && npx tsc --noEmit && npx jest` -- passes, including the new handshake smoke test.

**Manual checks:**
- Diff `relay/Cargo.lock`: only `snow 0.10.0` is new. Neither `package-lock.json` changed.
- `relay/protocol/src/` has one envelope type, `routed.rs`, and no second parser.
- `git diff --stat` touches no `relay/server`, `src-tauri` or `mobile/package*.json`.
