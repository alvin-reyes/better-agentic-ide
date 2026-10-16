# Phone remote: wire protocol

The relay's wire contract, as built so far. Source of truth for intent is the spec
(`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`, "Wire format" and "Login and
presence"); this file records what the code does. Story 2 (login and presence) set the
login, control-message and relay entries. Story 3 added the labels, signatures, seals, the
6-digit code, names and the QR code, each in Rust (`relay_protocol`) and TypeScript
(`@ade/protocol`), pinned to the shared vectors in `packages/protocol/vectors/`.

## `enc`

```
enc(label, f1, ..., fn) = label_ascii || u32be(len f1) || f1 || ... || u32be(len fn) || fn
```

Rust: `relay_protocol::enc(label: &str, fields: &[&[u8]]) -> Vec<u8>` (in `enc.rs`, re-exported
at the crate root with its story-2 bytes). TypeScript: `enc(label, fields: Uint8Array[])`.

`dec(label, bytes)` is the inverse: the input must start with exactly `label`, and the
length-prefixed fields must then use up the whole input; anything else is `None` / `null`.

## Labels

Eleven, one constant each in both languages, equal to `packages/protocol/vectors/labels.json`.
`ALL_LABELS` lists them in this order. Nine are `enc` labels; the two marked **HKDF info** are
only ever HKDF `info` strings.

| Constant | Value | Use |
|---|---|---|
| `LOGIN_LABEL` | `ade-remote/v1/login` | signs a login |
| `NOISE_LABEL` | `ade-remote/v1/noise` | reserved for the Noise session (story 4); unused |
| `PAIR_PHONE_TO_MAC_INFO` | `ade-remote/v1/pair/phone-to-mac` | **HKDF info** for `k_pm` |
| `PAIR_MAC_TO_PHONE_INFO` | `ade-remote/v1/pair/mac-to-phone` | **HKDF info** for `k_mp` |
| `PAIR_COMMIT_LABEL` | `ade-remote/v1/pair/commit` | seals `pair_commit` |
| `PAIR_COMMIT_HASH_LABEL` | `ade-remote/v1/pair/commit-hash` | hashed into `H` |
| `PAIR_NONCE_LABEL` | `ade-remote/v1/pair/nonce` | seals `pair_nonce` |
| `PAIR_REVEAL_LABEL` | `ade-remote/v1/pair/reveal` | seals `pair_reveal` |
| `PAIR_PHONE_SIG_LABEL` | `ade-remote/v1/pair/phone-sig` | signs `sig_P` |
| `PAIR_SAS_LABEL` | `ade-remote/v1/pair/sas` | hashed into the 6-digit code |
| `PAIR_RECORD_LABEL` | `ade-remote/v1/pair/record` | the pair record `R` |

## Signatures

`sign(key, label, fields)` is Ed25519 over `enc(label, fields)`; `verify(id, label, fields, sig)
-> bool`.

**Verify strictness** (owner decision, 2026-10-16). Rust uses `verify_strict`; TypeScript uses
`@noble/curves` `ed25519.verify(sig, msg, pub, { zip215: false })`. Both refuse a small-order
`A`, a non-canonical encoding (`y >= p`) and `S >= L`; `signatures.json` carries one refused
vector for each. They can differ only on a crafted small-order `R` or a mixed-order point
(cofactored vs cofactorless check). Only the signer can make those, and the cost falls only on
its own pairing.

## Pairing keys and seals

- `pair_keys(s, slot)` / `pairKeys(s, slot)`: `k_pm = HKDF-SHA256(ikm = s, salt = slot, info =
  PAIR_PHONE_TO_MAC_INFO)`, `k_mp` the same with `PAIR_MAC_TO_PHONE_INFO`. **Each is 32 bytes**
  (L = 32).
- **Sealed layout** (owner decision, 2026-10-16): `sealed = nonce(24) || ciphertext || tag(16)`,
  XChaCha20-Poly1305, **empty AAD**. The label lives in the plaintext, which is
  `enc(label, fields)`. A seal is at least 40 bytes.
- `seal(key, label, fields)` takes a random 24-byte nonce (Rust `OsRng`, TypeScript
  `globalThis.crypto.getRandomValues`). `seal_with_nonce` / `sealWithNonce` takes the nonce as
  an argument, for vectors and tests only.
- **Open rule:** `open(key, sealed, label, n_fields)` decrypts, then `dec(label)` must succeed
  with exactly `n_fields` fields; otherwise `None` / `null`. A label that is a prefix of another
  (`pair/commit`, `pair/commit-hash`) can't be read as it: the next 4 bytes would be ASCII,
  a length above 512 MiB.

## The 6-digit code

`sas_code(&SasInputs)` / `sasCode({slot, iM, sM, iP, sP, nM, nP, s})`:
`SHA-256(enc(PAIR_SAS_LABEL, slot, I_M, S_M, I_P, S_P, N_M, N_P, s))`, its first 8 bytes a
big-endian u64, modulo 10^6, as 6 digits with leading zeros. TypeScript uses no BigInt
(Hermes-safe): with `hi`, `lo` the u32 halves, `((hi % 1e6) * 967296 + lo) % 1e6`.

## Names

`clean_name(&str)` / `cleanName(string)`, then `name_from_bytes(&[u8])` / `nameFromBytes` for
bytes. The spec's four steps, with its own code point lists, never a language's `trim`, `\s`
or Unicode classes:
1. Remove U+0000–001F, 007F–009F, 00AD, 061C, 180E, 115F–1160, 200B–200C, 200E–200F,
   2028–202E, 2060–206F, 3164, D800–DFFF, E000–F8FF, FEFF, FFA0, FFF0–FFFF, E0000–E007F,
   F0000–10FFFF.
2. Trim both ends of U+0020, 00A0, 1680, 2000–200A, 202F, 205F, 3000.
3. Cut to 40 code points.
4. Trim the end again, as in step 2.

Bytes are decoded as UTF-8 with each **maximal invalid subpart** replaced by U+FFFD (which
step 1 removes), so a valid byte after a bad one is never swallowed. Rust uses
`String::from_utf8_lossy`; TypeScript a hand-written decoder (`utf8DecodeLossy`), because
Hermes has no reliable `TextDecoder`. Never `decodeURIComponent`.

## Pairing QR code

`ade-pair://v1?relay=<relay>&slot=<16 bytes>&id=<I_M>&x=<S_M>&s=<32-byte secret>&n=<name>`.
Rust: `build_pair_code(relay, slot, id, x, s, name) -> Result<String, PairCodeError>`,
`parse_pair_code(&str) -> Result<PairCode, PairCodeError>`. TypeScript: `buildPairCode({relay,
slot, id, x, s, name})`, `parsePairCode(code)`, each `{ok: true, value} | {ok: false, error}`.

**Errors:** `not_pairing_code`, `insecure_relay`, `newer_version` (Rust `PairCodeError::
{NotPairingCode, InsecureRelay, NewerVersion}`, `as_str()` gives the snake-case name).

**Grammar** (owner decision, 2026-10-16), checked in this order:
1. **The whole code** is characters 0x21–0x7E only, and not empty. Otherwise
   `not_pairing_code`. This is checked first, so `ade-pair://v2 x` is `not_pairing_code`.
2. **The prefix** is exactly `ade-pair://v`, then a decimal with no leading zero. N >= 2 is
   `newer_version`, whatever follows (any length of digits). `v0`, `v01`, `V1`, `v` with no
   digits, and `v1` not followed by `?`, are `not_pairing_code`.
3. **Parameters** split on `&`, then each on its first `=`. A segment with no `=`, or an empty
   key (so also an empty query, an empty segment, a trailing `&`), is `not_pairing_code`.
   `+` is literal.
4. **Duplicates.** A duplicate `relay`, `slot`, `id`, `x` or `s` is `not_pairing_code`, even with
   the same value. A duplicate `n` counts as a missing `n`, and the code stays valid. Unknown
   keys, duplicated or malformed, are ignored.
5. **Values** are percent-decoded strictly: every `%` is followed by two hex digits, either case.
   This applies to every value, the byte fields included.
6. **Byte fields** `slot` (16 bytes), `id`, `x`, `s` (32 bytes each) are unpadded base64url, as in
   control messages. A missing field, a malformed `%`, padding, another alphabet, non-zero
   trailing bits or a wrong length is `not_pairing_code`.
7. **`relay`** decodes to characters 0x21–0x7E only (otherwise `not_pairing_code`). It must then
   start with exactly, lower-case, `wss://` plus at least one character (otherwise
   `insecure_relay`; so `ws://`, `https://`, `WSS://`, `wss://` alone and an empty relay).
8. **Precedence.** Every structure error above wins over `insecure_relay`.
9. **`n`** is valid when missing. Present once, it is percent-decoded to bytes, then decoded and
   cleaned as in Names. A malformed `%`, a duplicate, or a name that cleans to empty gives no
   name (`None` / `null`), shown as "Mac".

**The builder** writes `relay, slot, id, x, s, n` in that order, escapes every byte of `relay`
and `n` outside `A–Z a–z 0–9 - . _ ~` as upper-case `%XX`, cleans the name first and leaves `n`
out when it cleans to empty. It refuses a relay that fails rule 7, with the same error. A
worst-case `n` (40 four-byte code points) is 480 characters.

There is no `ws://` override: story 5a's CLI phone takes the relay URL from `--url`, not from a
code.

## Shared vectors

`packages/protocol/vectors/`: `enc.json`, `labels.json`, `signatures.json`, `seals.json` and
`sas.json` are written by `generate.mjs` on `node:crypto` (anchored to RFC 5869 case 1, RFC 8032
test 1, and HChaCha20 2.2.1 and XChaCha20-Poly1305 A.3.1 of draft-irtf-cfrg-xchacha);
`node generate.mjs --check` exits 1 on drift, and `npm test` runs it. `names.json` and
`qr.json` are written by hand from the spec. Rust reads them in
`relay/protocol/src/vectors.rs`, TypeScript in `packages/protocol/src/vectors.test.ts`.

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
  internationalised name is used in its punycode (`xn--`) form. The story that builds the
  TypeScript login (5b) must produce the same bytes.
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
