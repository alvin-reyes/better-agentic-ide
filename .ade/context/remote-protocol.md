# Phone remote: wire protocol

The relay's wire contract, as built so far. Source of truth for intent is the spec
(`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`, "Wire format" and "Login and
presence"); this file records what the code does. Story 2 (login and presence) set the
entries below. Story 3 adds the shared test vectors and the TypeScript twin of `enc`, and
may move `enc` within `relay-protocol`, but must not change its bytes.

## `enc`

```
enc(label, f1, ..., fn) = label_ascii || u32be(len f1) || f1 || ... || u32be(len fn) || fn
```

Rust: `relay_protocol::enc(label: &str, fields: &[&[u8]]) -> Vec<u8>`. Every label starts
with `ade-remote/v1/`.

## Labels

| Constant | Value | Signs |
|---|---|---|
| `relay_protocol::LOGIN_LABEL` | `ade-remote/v1/login` | a login |

## Control messages

JSON text frames, `{"v":1,"t":<type>,...}`. Bytes are unpadded base64url
(`relay_protocol::Bytes<N>`, length-checked on decode). A frame with `v` other than 1, or
missing `v`, is rejected (`Control::from_json`). Rust type: `relay_protocol::Control`.

**Unknown types** (owner decision, 2026-10-16): a `v: 1` message whose `t` the receiver
doesn't know is **ignored**, by devices and by the relay. `Control::from_json` reports it
as `DecodeError::UnknownType`, apart from a malformed message. The one exception is before
login: the relay refuses anything but a `login` (4401). After login the relay ignores every
text frame it doesn't act on, a second `login` included.

**Size:** the relay accepts at most 64 KiB per WebSocket message and frame, before login
too.

| `t` | Direction | Fields |
|---|---|---|
| `challenge` | relay → device | `c`: 32 bytes |
| `login` | device → relay | `id`: 32-byte Ed25519 identity key; `role`: `"mac"` or `"phone"`; `sig`: 64 bytes |
| `welcome` | relay → device | `pairs`: `[{pair_id: 16 bytes, peer_id: 32 bytes, peer_role}]`; `online`: `[peer_id]` (paired peers online now) |
| `presence` | relay → device | `peer`: 32 bytes; `online`: bool |

## Login

- The challenge is 32 random bytes, fresh for each connection, good for one check.
- `sig = Ed25519(I, enc("ade-remote/v1/login", c, host, role))`. `role` is its wire name.
- **The signed host** is the host of the URL the device dialled, without scheme, port or
  path, **ASCII lower-cased, with an IPv6 literal's surrounding `[` `]` removed**:
  `ws://Relay.Fly.Dev:443/` signs `relay.fly.dev`, `ws://[::1]:8080/` signs `::1`
  (`relay_core::signed_host`, used by `relay_cli::host_of`). **One trailing dot is
  dropped**: `relay.fly.dev.` signs `relay.fly.dev`. Host names are ASCII; an
  internationalised name is used in its punycode (`xn--`) form. Story 3's TypeScript
  client must produce the same bytes.
- The relay accepts a signature for any host in its configured list (`RELAY_HOSTS`),
  normalising each configured host the same way before comparing. It verifies with
  `verify_strict`.
- **Refused login:** the relay closes the WebSocket with code **4401** and reason
  **`login_refused`**, sends no `welcome`, and does not say which check failed. Its log
  carries only the code (`not_login`, `challenge_used`, `bad_key`, `bad_signature`,
  `role_conflict`, `login_timeout`).
- The relay waits at most the ping timeout for the `login`.

## Roles

A key's role is fixed the first time it logs in (`relay_core::DeviceRoles`). A later login
with the other role is refused as above. Held in memory until story 7.

## Presence

- `presence {peer, online}` goes to each online paired peer when a device logs in and
  when it leaves. Unpaired keys never hear about each other.
- A device has left when its socket closes, or when the ping timeout (30 s) passes with no
  pong, counted from login or the last pong (not rounded up to a ping tick). The relay sends WebSocket ping frames (not JSON) every 15 s. Both times are
  `relay_server::Config` fields, so tests shorten them.
- One live connection per device: a new login replaces the old, whose peers see `offline`
  then `online`; the old socket is dropped (no close code yet, story 7) and its later close
  is ignored.
- A leave fans out to the device's peers as the pair directory lists them at that moment.
- Each device has a queue of 64 messages. A device whose queue is full, or whose socket
  send doesn't finish before its pong deadline, is dropped and counts as left.
- `welcome` is sent before any presence on the same connection.

## Pair directory

`relay_core::PairDirectory` (`peers_of(id) -> Vec<PairInfo>`, `Send + Sync`) is how the
relay learns pairs. `InMemoryPairs` seeds it for now; story 7 adds the SQLite one behind
the same trait.

## Relay endpoints and configuration

- `GET /` upgrades to the WebSocket; `GET /health` answers `200 ok`.
- `relay-server` bin: `RELAY_HOSTS` is **required**: comma-separated, each a bare host
  name or a bracketed IPv6 literal (no scheme, port, path or user). `RELAY_LISTEN`
  defaults to `0.0.0.0:8080`. A missing, malformed or non-Unicode value exits 2; the
  effective host list is printed at start. A relay that can't listen, or whose server
  stops, exits 1. `serve()` refuses ping settings unless `0 < ping_interval < ping_timeout`.
- `relay-cli` bin: `--url`, `--role mac|phone`, `--key-file` (32-byte seed as unpadded
  base64url, written to a temporary file and renamed into place with mode 0600 if missing;
  on unix an existing file that group or others can access is refused). The client skips
  unknown types, reports a close that came instead of the challenge as `Closed{code,
  reason}`, and waits at most 5 s when closing. `ws://` only for now: the client has no TLS.
