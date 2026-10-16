---
title: 'Login and presence through the relay'
type: 'feature'
ticket: '2'
created: '2026-10-16'
status: 'draft'
baseline_revision: ''
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
- [ ] `relay/Cargo.toml` and the crate manifests -- add workspace dependencies: `tokio`, `axum` (ws), `tokio-tungstenite` (client), `ed25519-dalek` (with `rand_core`), `rand`, `serde`, `serde_json` and `base64`. Every version must be at least two weeks old, and `Cargo.lock` is updated.
- [ ] `relay/protocol` -- add `enc(label, fields)` and the `LOGIN_LABEL` constant. Add serde types for `challenge`, `login`, `welcome` and `presence`, with base64url bytes and `v: 1`. Unit tests: `enc` layout; JSON round trip of each message; a message with `v` ≠ 1 is rejected.
- [ ] `relay/core` -- add the following pieces:
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
- [ ] `relay/server` (lib + bin) -- add `serve(config) -> (addr, handle)`. `Config` holds the listen address, the hosts, the ping interval and timeout, and an `Arc<dyn PairDirectory>`. The server answers `GET /` with a WebSocket upgrade and `/health` with `200 ok`. Per connection it sends the challenge, waits for the login, sends the welcome, then sends presence and pings. The bin reads `RELAY_LISTEN` and `RELAY_HOSTS` (comma-separated).
- [ ] `relay/cli` (lib + bin) -- add `Client::connect(url, role, signing_key)`, which signs over the host it dialled. Add `next_event()`, which yields welcome and presence. The bin takes `--url`, `--role`, and `--key-file`; the key file is created if it's missing.
- [ ] `relay/e2e/tests/e2e.rs` -- remove `e2e_placeholder` and add the tests listed under Acceptance Criteria, against `serve()` on `127.0.0.1:0` with hosts `["localhost"]` and a pair seeded in the in-memory directory.
- [ ] `.ade/context/remote-protocol.md` -- record:
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

## Plan Change Log

## Review Triage Log

## Design Notes

Pairs come from `PairDirectory` because the pairs table is story 7's and pairing is story 5a's. Story 2 seeds the in-memory implementation. Story 7 adds the SQLite implementation behind the same trait. The trait stays minimal (`peers_of`), and later stories grow it.

The Rust `enc` lands here because login needs it. Story 3 adds the shared vectors and the TypeScript twin, and may move `enc` within `relay-protocol`, but not change its bytes.

Ping uses WebSocket ping and pong frames, not JSON messages. iOS's WebSocket answers them automatically, so the app needs no code for it.

`ws://` is allowed by the CLI so the e2e test can use localhost. The `wss://`-only rule is the phone's QR parser's (story 3).


## Verification

**Commands:**
- `cd relay && cargo test` -- passes; the e2e tests for login and presence are listed by name
- `npx tsc --noEmit`; `npm test`; `cd src-tauri && cargo test`; `cd mobile && npx tsc --noEmit && npx jest` -- unchanged and passing
