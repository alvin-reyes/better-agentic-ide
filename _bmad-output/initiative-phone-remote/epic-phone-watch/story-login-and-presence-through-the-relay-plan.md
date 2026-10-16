---
title: 'Login and presence through the relay'
type: 'feature'
ticket: '2'
created: '2026-10-16'
status: 'in-progress'
baseline_revision: 'dc8700325218901b62336d291f6fa8880585edf3'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - '{project-root}/docs/superpowers/specs/2026-10-14-relay-pairing-design.md'
  - '{project-root}/.ade/context/phone-remote-layout.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The relay, its login and its presence rules exist only in the spec. Every later 2a story (pairing, sessions, push) assumes that a device can authenticate with its identity key and learn when its peer is online.

**Approach:** This is the tracer bullet. A real relay server on a WebSocket handles challenge-response login, with the rules (challenge, signature check, host list, roles) in `relay-core` and none of them in the server. The relay sends presence to paired peers on login, on close and on ping timeout. A CLI client logs in, and an e2e test runs two keys through it all against a relay on a random port.

## Boundaries & Constraints

**Always:**
- Follow the spec's "Login and presence" and "Wire format" exactly:
  - Control messages are JSON text frames `{"v":1,"t":...}`, with bytes in unpadded base64url.
  - The challenge is 32 random bytes, fresh for each connection and single-use.
  - `sig = Ed25519(I, enc("ade-remote/v1/login", c, host, role))`, where `host` is the name the client dialled (no port).
  - The relay accepts a signature for any host in its configured list.
  - `welcome {pairs, online}` is sent after login.
  - `presence {peer, online}` goes to each paired peer on login and on leave. A device has left when its socket closes, or when 30 s pass with no pong, with a ping every 15 s.
- A role is fixed the first time a key logs in. A later login with the other role is refused.
- Login, role and presence decisions live in `relay-core` as pure code, testable without a socket. `relay-server` only does the I/O.
- Ping interval and timeout are injectable, so tests can use short times.
- The relay logs no message contents, only counts and error codes.
- Decision (owner, 2026-10-16): a refused login is signalled by closing the WebSocket with code 4401 and reason `login_refused`. No `welcome` is sent, and nothing says which check failed.
- Decision (owner, 2026-10-16, after the PR #60 review): a control message with `v: 1` and an unknown `t` is ignored by devices and by the relay, and recorded as such in remote-protocol.md.
- Decision (owner, 2026-10-16): the plan is kept whole at about 1,700 tokens. It is one goal, and a split would leave a relay that nobody logs in to.

**Never:**
- No SQLite, no limits, no `/metrics`, and no 90-day cleanup. Those are story 7's. Devices and pairs are held in memory here.
- No pairing, slots, Noise, frames or push. Those are stories 4, 5a and 10.
- No TypeScript `enc` and no shared vectors (story 3). This story adds only the Rust `enc` and the login label.
- No `src-tauri` changes.

</frozen-after-approval>

## Code Map

- `relay/protocol/src/lib.rs` -- has only `NOISE_PATTERN`. Add `enc()`, the login label, and the control message types with serde.
- `relay/core/src/lib.rs` -- has only `noise_pattern()`. Add login verification, the role registry, the pair directory trait and presence fan-out.
- `relay/server/src/main.rs`, `relay/cli/src/main.rs` -- banner placeholders from story 1. Replace them; both become lib plus thin bin, so the e2e test can drive them in-process.
- `relay/e2e/tests/e2e.rs` -- holds `e2e_placeholder`. Replace it with the login and presence test.
- `.ade/context/phone-remote-layout.md` -- crate names. The new wire contract goes in `.ade/context/remote-protocol.md`, which the spec names as the shared contract.
- Spec lines ~152–236 (Wire format, Login and presence), ~701–760 (The relay), ~1009–1014 (the Relay tests).

## Tasks & Acceptance

**Execution:**
- [x] `relay/Cargo.toml` and the crate manifests -- add workspace dependencies: `tokio`, `axum` (ws), `tokio-tungstenite` (client), `ed25519-dalek` (with `rand_core`), `rand`, `serde`, `serde_json` and `base64`. Every version must be at least two weeks old, and `Cargo.lock` is updated.
- [x] `relay/protocol` -- add `enc(label, fields)` and the `LOGIN_LABEL` constant. Add serde types for `challenge`, `login`, `welcome` and `presence`, with base64url bytes and `v: 1`. Unit tests: `enc` layout; JSON round trip of each message; a message with `v` ≠ 1 is rejected.
- [x] `relay/core` -- add the following pieces:
  - `Challenge::new()`;
  - `verify_login(challenge, login, hosts) -> Result<Identity, LoginError>`;
  - a `DeviceRoles` registry that fixes a role on first login;
  - a `PairDirectory` trait (`peers_of(id) -> Vec<PairInfo>`) with an in-memory implementation;
  - `Presence`, which tracks online devices and returns the `(recipient, presence)` messages for a login or a leave.

  Unit tests cover:
  - a good login;
  - a wrong signature;
  - another host;
  - a reused challenge;
  - a role switch refused;
  - presence fan-out going only to paired peers.
- [x] `relay/server` (lib + bin) -- add `serve(config) -> (addr, handle)`. `Config` holds the listen address, the hosts, the ping interval and timeout, and an `Arc<dyn PairDirectory>`. The server answers `GET /` with a WebSocket upgrade and `/health` with `200 ok`. Per connection it sends the challenge, waits for the login, sends the welcome, then sends presence and pings. The bin reads `RELAY_LISTEN` and `RELAY_HOSTS` (comma-separated).
- [x] `relay/cli` (lib + bin) -- add `Client::connect(url, role, signing_key)`, which signs over the host it dialled. Add `next_event()`, which yields welcome and presence. The bin takes `--url`, `--role`, and `--key-file`; the key file is created if it's missing.
- [x] `relay/e2e/tests/e2e.rs` -- remove `e2e_placeholder` and add the tests listed under Acceptance Criteria, against `serve()` on `127.0.0.1:0` with hosts `["localhost"]` and a pair seeded in the in-memory directory.
- [x] `.ade/context/remote-protocol.md` -- record:
  - the `enc` encoding;
  - the login label;
  - the four messages and their field encodings;
  - the role rule;
  - the presence rules;
  - how a refused login is signalled (close code 4401, `login_refused`).

**Acceptance Criteria:**
- Given a Mac key and a phone key with a seeded pair, when both log in, then each gets `welcome` listing the pair, and each sees `presence {peer: other, online: true}` (or `online` already listed in `welcome` for the second one).
- Given both online, when one client closes, then the other gets `presence {online: false}`.
- Given a client that stops answering pings, when the timeout passes (shortened in the test), then its peer gets `presence {online: false}`.
- Given a `login` captured from one connection, when it's replayed on a new connection, then the socket closes with 4401 `login_refused` and no `welcome` is sent.
- Given a login signed for host `evil.example`, when it's sent to a relay configured with `["localhost"]`, then it's refused.
- Given a key first logged in as `phone`, when it logs in as `mac`, then it's refused.
- Given an unpaired third key, when it logs in, then neither paired device gets presence about it.

## Implementation Notes

- 2026-10-16, PR #60 review round:
  - **Tests added.** e2e: the refusal paths (silence until the login timeout, a binary first frame, a `v:2` login, a non-login first frame, a 65 KiB first frame), replacement of a live connection, and a second login on an authenticated connection being ignored. core: an `id` off the curve (`BadKey`), a Mac with two phones, two pairs with the same peer. Most of these pass on the earlier code: they close gaps a mutation run found. Red first: the 65 KiB frame, ping-setting validation, trailing-dot hosts, unknown `t` (protocol and CLI), the CLI's early close, and key-file mode.
  - **Server.**
    - The guard `Leave` runs sender removal, leave and fan-out on drop, and re-queries `peers_of` at leave.
    - Queues are bounded at 64; a full queue drops that device.
    - Each send is bounded by the pong deadline, and messages are limited to 64 KiB.
    - `serve()` refuses unless `0 < ping_interval < ping_timeout`, and its handle returns the serve result.
  - **Binary.** `RELAY_HOSTS` is required and checked for bare names. Non-Unicode values exit 2. A stopped server exits 1.
  - **Host rule.** One trailing dot is dropped.
  - **Unknown `t`.** It is ignored per the owner's decision, with `DecodeError::UnknownType` in `relay-protocol`.
  - **CLI.** `close()` waits at most 5 s. A close that comes before the challenge is returned as `Closed`. The key file is written via temp + rename, and an open mode is refused.
  - **Records.** All of it is in `.ade/context/remote-protocol.md`. The deferred "leave uses the peer list taken at login" entry is removed.

## Plan Change Log

- 2026-10-16, PR #60 review (three lenses, findings in the session's pr60-review.json). The owner approved a fix round on the same branch. It adds tests for the refusal paths, multi-peer presence and replacement; a send timeout and a bounded queue; the 64 KiB limit before login; re-querying peers at leave; validated `RELAY_HOSTS` and ping settings; the unknown-`t` rule; and the smaller CLI and bin fixes. KEEP: the core/server split, the `gone` deadline, the host normalisation, and every existing e2e test.

## Review Triage Log

Pass 1 (quick lens, 2026-10-16). Counts: high 0, medium 3, low 3, false 0, maybe-false 0, plus 1 rejected for editing the plan.

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| The ping timeout is checked only on ping ticks, so a dead device is seen as gone at about timeout + interval (45 s), not 30 s | medium | patch | Read `connection`: `last_pong` is set after the first tick is used up, and `elapsed` at the 30 s tick is just under 30 s. The e2e test checks only a lower bound. |
| The signed host keeps its case and IPv6 brackets, so a valid mixed-case dial is refused | medium | patch | `host_of` returns `Uri::host()` as is, and `verify_login` compares bytes. Story 3's TypeScript twin needs a fixed rule. Fix: lower-case and strip brackets, and record it in remote-protocol.md. |
| A replaced connection is dropped with no close frame, and replacement has no e2e test | medium | defer | Neither the spec nor the plan defines a close code for "replaced". Story 7 AC(5) owns one live connection per device. |
| `libc 0.2.190` in Cargo.lock is 13 days old | low | patch | crates.io shows 2026-10-02T19:33Z. Fix: pin it back with `--precise`. |
| An empty `RELAY_HOSTS` starts a relay that refuses every login | low | patch | `parse_hosts` can return `[]`, so `any()` is false for every login. The bin already exits 2 on a bad `RELAY_LISTEN`. |
| The leave fan-out reuses the `peers` list taken at login | low | defer | Pairs are fixed in story 2, so it's harmless here. It becomes wrong once stories 5a and 7 change pairs at runtime. |
| `futures-util` is not in the plan's dependency list | n/a | reject | The fix edits this build's plan. The crate is needed for `SinkExt`/`StreamExt`, and it is 2 weeks old or more. |

## Design Notes

Pairs come from `PairDirectory` because the pairs table is story 7's and pairing is story 5a's. Story 2 seeds the in-memory implementation. Story 7 adds the SQLite implementation behind the same trait. The trait stays minimal (`peers_of`), and later stories grow it.

The Rust `enc` lands here because login needs it. Story 3 adds the shared vectors and the TypeScript twin, and may move `enc` within `relay-protocol`, but not change its bytes.

Ping uses WebSocket ping and pong frames, not JSON messages. iOS's WebSocket answers them automatically, so the app needs no code for it.

`ws://` is allowed by the CLI so the e2e test can use localhost. The `wss://`-only rule is the phone's QR parser's (story 3).


## Verification

**Commands:**
- `cd relay && cargo test` -- passes; the e2e tests for login and presence are listed by name
- `npx tsc --noEmit`; `npm test`; `cd src-tauri && cargo test`; `cd mobile && npx tsc --noEmit && npx jest` -- unchanged and passing

**Results (QA, 2026-10-16, HEAD f1c325c, PR #60):**
- `cd relay && cargo test` -- pass. cli 9+2, core 20, e2e 14, protocol 13, server 1+5; 0 failed. e2e tests: both_log_in_and_see_each_other, a_close_is_seen_as_offline, a_client_that_stops_answering_pings_goes_offline, a_replayed_login_is_refused, a_login_signed_for_another_host_is_refused, a_phone_key_cannot_log_in_as_a_mac, an_unpaired_key_is_invisible_to_the_pair, plus health_answers_ok, a_new_login_replaces_the_old_connection, a_silent_client_is_refused_after_the_timeout, a_binary_first_frame_is_refused, a_first_frame_that_is_not_a_login_is_refused, a_login_with_another_version_is_refused, a_first_frame_over_64_kib_gets_no_welcome.
- `npx tsc --noEmit` -- pass (exit 0).
- `npm test` -- pass, 142 files, 1534/1534 tests. No failure seen on this run.
- `cd src-tauri && cargo test` -- pass, 456 + 12 + 2 passed, 0 failed (1 ignored).
- `cd mobile && npx tsc --noEmit && npx jest` -- pass, 1 suite, 2 tests.
- Acceptance criteria to tests: AC1 both_log_in_and_see_each_other; AC2 a_close_is_seen_as_offline; AC3 a_client_that_stops_answering_pings_goes_offline; AC4 a_replayed_login_is_refused (4401 login_refused, no welcome); AC5 a_login_signed_for_another_host_is_refused (plus core a_login_for_another_host_is_refused); AC6 a_phone_key_cannot_log_in_as_a_mac (plus core a_role_is_fixed_on_first_login); AC7 an_unpaired_key_is_invisible_to_the_pair (plus core presence_goes_only_to_online_paired_peers).
- Slice: the diff against main touches only relay/, .ade/context, the plan, deferred-work and two knowledge files; no src/ or src-tauri/ changes. The contract is recorded in `.ade/context/remote-protocol.md` (enc, login label, messages, role rule, presence, 4401 login_refused, unknown t, 64 KiB).
- CI (`gh pr checks 60`): all 10 checks pass, including Relay, Mobile, Frontend, Backend on Linux, macOS and Windows.
