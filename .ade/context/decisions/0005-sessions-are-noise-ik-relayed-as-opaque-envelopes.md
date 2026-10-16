# 0005: Sessions are Noise IK, and the relay carries them as opaque envelopes

- Status: Accepted by the owner as a faithful record (2026-10-16). This is the ADR for the relay and protocol choices that the 2a spec's "Shared contract" calls for (`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`). It records decisions the owner has already made:
  - the spec's approach A (2026-10-14);
  - the 18 decisions in story 4's approved plan (`_bmad-output/initiative-phone-remote/epic-phone-watch/story-noise-ik-sessions-in-rust-and-typescript-plan.md`, 2026-10-16), numbered here in the order that plan's Boundaries lists them. Decisions 11 (this ADR is the architect's) and 12 (the plan is kept whole) are about process, so they aren't restated;
  - three spec amendments made on the 7b side (2026-10-16): `rehandshake {peer}`; `peer` in `control_limited`; and a `rehandshake` refused with `control_limited` is not re-sent, because the Mac's session machine asks again at its next trigger after the 10 s window.

  The owner approves this record. The wire contract is `.ade/context/remote-protocol.md`, "Sessions". How the relay keeps the paired keys it routes between is ADR 0006.

- Context:
  - **What has to be protected.** Content between ADE and the phone must be end-to-end encrypted and forward secret. The relay must learn nothing beyond metadata. The Mac makes outbound connections only.
  - **Two implementations.** The Mac side is Rust. The phone side is TypeScript on Hermes, which has no WebAssembly, no native crypto modules and no reliable `BigInt`. If the two sides differ by one byte or one rule, the phone never connects, or a replayed or forged message gets through.
  - **A relay that reorders.** The relay can drop, delay or reorder messages, and one phone can reach the same Mac through several relays. So replay, restart and two-handshakes-at-once rules have to hold with no clock comparison between devices.
  - **Approaches considered (spec, 2026-10-14):**
    - (A) `Noise_IK_25519_ChaChaPoly_SHA256`, on `snow` in Rust and a hand-written IK in TypeScript on `@noble`;
    - (B) a React Native Noise library;
    - (C) TLS only, with the relay reading content.

- Decision:
  - **The pattern is `Noise_IK_25519_ChaChaPoly_SHA256`, and the phone initiates.**
    - The prologue is `enc("ade-remote/v1/noise", I_M, I_P)`, which binds both identity keys.
    - The `hs1` payload is exactly 8 bytes: a big-endian counter. Neither `hs1` nor `hs2` carries content, because `hs1` has no forward secrecy.
    - The `hs2` payload is empty, so `hs2` is exactly 48 bytes. Any other length is refused.
    - The session id is the first 8 bytes of the handshake hash.
    - A frame body is `session_id(8) || u64be(nonce) || ciphertext`, on `snow`'s `StatelessTransportState`.
    - There is no rekey.
  - **The libraries.**
    - Rust uses `snow =0.10.0`, with `default-features = false` and the features `default-resolver`, `use-chacha20poly1305`, `use-sha2`, `use-curve25519` and `use-getrandom`. The `std` feature is left out because it pulls in `ring` and a `cc` released after the dependency cutoff.
    - TypeScript hand-writes the one pattern on the `@noble/curves`, `@noble/ciphers` and `@noble/hashes` versions already locked, with no new npm dependency. The npm Noise libraries are native-only, XX-only or need WebAssembly.
    - Both are pinned to the published cacophony IK vector, to a third implementation on `node:crypto` in `generate.mjs`, and to a 64-case differential test.
  - **One binary envelope, on the relay and in both languages.**
    - The layout is `u8 type (1 hs1, 2 hs2, 3 frame) || 32-byte peer key || body`.
    - The peer key is the recipient when a message is sent to the relay, and the sender when the relay delivers it.
    - Rust has one type, `relay_protocol::Routed { kind, peer, body }`, with `parse` (`None` under 33 bytes, or for a type other than 1, 2 or 3), `with_peer` and `encode`. TypeScript has its twins, `encodeRouted` and `parseRouted`.
    - There is never a second parser.
    - The relay reads only the envelope header, never a body. It routes `hs1`, `hs2` and frames over any stored pair, acked or not, rewriting `peer` to the sender (owner, story 7b).
    - Story 4 owns `routed.rs`. If story 7b starts first, it creates the file exactly to story 4's definition, and story 4 rebases onto it (owner decision 18).
  - **`hs1` counters, against replay.**
    - **The phone** sends `max(now_ms, last_sent + 1)`, with `last_sent` kept per Mac identity key.
    - **The Mac** accepts a counter only if it is above the last one it accepted for (its own key, the phone's key). It also checks that the remote static key is one it paired with for the sending `I_P`.
    - **Counters are keyed by identity keys only**, never by pair or relay, and are kept indefinitely. This is ADR 0004's rule.
    - **Each update is one atomic step**, shared by every session machine that uses the same store: check-and-record on the Mac, compute-and-record on the phone.
    - **Counters are integers from 0 to 2^53−1** (owner decision 4). The phone errors above that, and the Mac refuses.
    - **A refused `hs1` gets no answer** (owner decision 7). This covers a replay, a wrong static, a wrong sender, a bad length or a low-order key, so the phone gets no oracle.
  - **Low-order keys** (owner decision 8). Both languages refuse a remote `e` or `s` whose X25519 output with the local static secret is all zeros. The check on `e` runs before the message is read. `snow` doesn't make this check, and noble throws, so each language applies the rule explicitly.
  - **The frame rules** (owner decisions 3 and 4). A receiver applies these checks in order:
    1. A body under 8 bytes, or another session's id: dropped silently.
    2. A current-session body under 32 or over 60,032 bytes: bad.
    3. A nonce at or below the last accepted: dropped silently, not decrypted, and no restart. So a relay replaying old frames can't force restarts.
    4. A nonce of 2^32 or more, or a failed decrypt: bad.
    5. Otherwise: accepted, and the last accepted nonce moves.

    A bad frame restarts the session. The current session stays usable until a newer one completes. Nonces are below 2^32 on both sides, and a sender never uses 2^32. A plaintext is at most 60,000 bytes, so a frame stays under the relay's 64 KiB.
  - **The frame ceiling** (owner decision 5). "2^32 frames" means the phone's own send nonce reaching 2^32, or a received nonce of 2^32−1. At its own send ceiling, the Mac drops the session and emits `Rehandshake`.
  - **The restart rules.**
    - **One 10 s restart window on each side**, per (peer, relay), shared by every trigger (owner decisions 2 and 15). A trigger inside the window is coalesced into one deferred start at the window's end. The deferred start is dropped if a session completed after the trigger.
    - **The phone's triggers:**
      - Mac online (`welcome` or `presence`);
      - foreground;
      - `rehandshake`;
      - a bad frame;
      - 24 h since the session completed;
      - either frame ceiling;
      - pull to refresh, with or without a session, through the same 10 s window (owner decision 10, widened by the owner on 2026-10-16 after story 4's code review: two lost messages can leave the sides on different sessions until the next trigger, and pull to refresh is the user's way out).
    - **The Mac's triggers** are `send` with no session, and a bad frame. Its action is `Rehandshake(phone)`.
    - **A handshake with no `hs2`** gets one automatic retry 10 s later, then waits for the next trigger (owner decision 6).
    - **A start counts** when it is emitted, so a failed counter write still opens the window and still gets its retry.
  - **Two handshakes at once** ("the newest completed one wins", spec).
    - **The Mac** takes each accepted `hs1` as its current session.
    - **The phone** keeps at most 4 outstanding initiators. It adopts an `hs2` only if its counter is above the current session's.
    - **A newer handshake left hanging** raises one trigger, once, if it has no `hs2` within 10 s of its start (owner decision 13). This is armed only when an older handshake's `hs2` was adopted after the newer one started (owner decision 14, option (a)), so a silent Mac gets only the ordinary single retry.
      Amended by the owner on 2026-10-16 after story 4's code review: the deadline is `max(started_at + 10 s, adopted_at + (adopted_at − adopted.started_at))`, scaled to the round trip just measured on the adopted handshake, so a round trip over 10 s cannot loop (a constant 12 s round trip gives at most 2 starts).
  - **The machines are sans-IO.** They live in `relay-core`, with injected clocks and stores:
    - `MacSessions`;
    - a Rust `PhoneSession`, used by the in-process tests and by story 5a's CLI phone (owner decision 1);
    - the TypeScript `PhoneSession`, with the same rules and a two-step `StartHandshake`/`begin` start for its async store.

    Test hooks stay out of the public API in both languages.
  - **`rehandshake` on the wire** (spec amendment, owner, 2026-10-16).
    - It is `{"v":1,"t":"rehandshake","peer":<32 bytes>}`, in unpadded base64url. It replaces the spec's `rehandshake {}`.
    - `peer` is the phone when the Mac sends it, and the Mac when the relay delivers it. This is the same rewrite as the binary envelope.
    - It is a plaintext control message. A forged one costs only a handshake, within the phone's window.
    - The relay routes it like a frame (ADR 0006), but it spends **one control token and no frame token**. Over the control limit it is answered `control_limited`.
    - One whose `peer` is missing or malformed is dropped as unreadable.
    - The `Control` variant, its routing and the CLI's handling of it are story 7b's. Story 4 emits only the `Rehandshake(phone)` action (owner decisions 9, 16 and 17).
  - **`control_limited` gains an optional `peer`** (spec amendment, owner, 2026-10-16). It becomes `control_limited {msg, slot, pair_id, peer, retry_ms}`. `peer` is given when the refused message carried one, the same way `slot` and `pair_id` are. An absent field is left out of the JSON. A malformed field in the refused message counts as absent.

- Consequences:
  - **What the relay can and can't see.** It sees which keys handshake and when, and the sizes and timing of frames. It never sees content, and it can't decrypt a frame or forge one that opens. A relay or attacker replaying old `hs1` or frames causes no restart and no state change. Forging a `rehandshake`, or tampering with a current frame, costs the victim at most one handshake per 10 s per (peer, relay).
  - **Clocks are never compared.** A phone clock set back or skewed still connects, because counters only need to rise. After a Mac restart, no age window is needed, because the last accepted counter is stored.
  - **Several relays.** With several relays and one key, counters are shared. A lower counter delivered second through another relay is refused, and the 10 s retry heals it.
  - **Content waits for the first transport frame.** Message 1 has no forward secrecy, so the first snapshot follows `hs2` in a transport frame.
  - **Three implementations of IK must keep agreeing:** `snow`, the TypeScript one and the `node:crypto` oracle. `generate.mjs --check` and the differential test fail on any drift. Upgrading `snow` or a `@noble` package needs the vectors re-run.
  - **No new npm dependency, and one new Rust dependency** (`snow`). `curve25519-dalek` was already in the lock file.
  - **Wire format changes.**
    - `rehandshake` now names its peer, in line with the binary envelope.
    - A `rehandshake` answered `control_limited` is not re-sent, an exception to the spec's general rule like `push` (owner, 2026-10-16). The Mac's session machine asks again at its next trigger after the 10 s window.
    - `peer` in `control_limited` lets the Mac match the refusal to the right phone.
  - **Persistence is later stories' work.** Persisting counters is stories 8 (ADE) and 12a/12b (the phone's secure store). This ADR fixes the keying and atomicity those stories must keep.
