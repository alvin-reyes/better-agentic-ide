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

**Verify strictness** (owner decision, 2026-10-16: Rust `verify_strict`, TypeScript
`zip215: false`; and, by ruling, Rust refuses a non-canonical key). What each side refuses:

- **Rust** (`relay_protocol::verify`): an `id` that is no point, or whose point does not
  compress back to the same 32 bytes (a non-canonical encoding, such as y ≥ p). Then, by
  `verify_strict`: `S` not a canonical scalar (`S ≥ L`), an `R` that is no point, a small-order
  `id` or `R`, and an `R` that is not its canonical encoding (the check compares encodings).
  The equation is cofactorless.
- **TypeScript** (`verify`, `@noble/curves` `ed25519.verify(sig, msg, pub, { zip215: false })`):
  an `A` or `R` whose y ≥ p (or with x = 0 and the sign bit set), `S ≥ L`, and a small-order
  `A`. The equation is cofactored. A small-order `R` is not refused by this check itself.

Both refuse a small-order `A`, a non-canonical `A`, a non-canonical `R` and `S ≥ L`.
`signatures.json` carries four refused vectors: a small-order `A` (the identity, with R the
identity and S = 0, which a lax check accepts), `S ≥ L`, `A` with y = p + 1 (the identity,
non-canonically) and `A` with y = p + 3 (the large-order point with y = 3, non-canonically;
nobody knows its key, so the vector pins the key's refusal, and a Rust unit test shows the
canonical check is what refuses it). The two sides can differ only on a crafted small-order
`R` or a mixed-order point (cofactorless vs cofactored equation). Only the signer can make
those, and the cost falls only on its own pairing.

## Pairing keys and seals

- `pair_keys(s, slot)` / `pairKeys(s, slot)`: `k_pm = HKDF-SHA256(ikm = s, salt = slot, info =
  PAIR_PHONE_TO_MAC_INFO)`, `k_mp` the same with `PAIR_MAC_TO_PHONE_INFO`. **Each is 32 bytes**
  (L = 32).
- **Sealed layout** (owner decision, 2026-10-16): `sealed = nonce(24) || ciphertext || tag(16)`,
  XChaCha20-Poly1305, **empty AAD**. The label lives in the plaintext, which is
  `enc(label, fields)`. A seal is at least 40 bytes.
- `seal(key, label, fields)` takes a random 24-byte nonce (Rust `OsRng`, TypeScript
  `globalThis.crypto.getRandomValues`). `seal_with_nonce` / `sealWithNonce` takes the nonce as
  an argument. It is not public: `pub(crate)` in Rust, and not exported from `@ade/protocol`'s
  `index.ts`; only `seal` and the tests call it.
- `pairKeys` (TypeScript) throws a `RangeError` unless `s` is 32 bytes and `slot` 16; Rust's
  array types rule the wrong lengths out.
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

**Grammar.** Owner decisions (2026-10-16): the plan's grammar, its three errors and their
precedence, the base64url byte fields, a duplicate `n` counting as missing, and exact
lower-case `wss://`; and two later rulings, that the version is read first (rule 1) and that
an empty `relay` is `not_pairing_code` (rule 7). Checked in this order:
1. **The version comes first.** The code must start with exactly `ade-pair://v`, then a decimal
   with no leading zero. N ≥ 2 is `newer_version`, whatever follows (any length of digits, and
   characters outside 0x21–0x7E included). `v0`, `v01`, `V1`, `v` with no digits, and anything
   else, are `not_pairing_code`.
2. **Once the version is 1, the whole code** is characters 0x21–0x7E only, and `v1` is followed
   by `?`. Otherwise `not_pairing_code`.
3. **Parameters** split on `&`, then each on its first `=`. A segment with no `=`, or an empty
   key (so also an empty query, an empty segment, a trailing `&`), is `not_pairing_code`.
   `+` is literal.
4. **Duplicates.** A duplicate `relay`, `slot`, `id`, `x` or `s` is `not_pairing_code`, even with
   the same value. A duplicate `n` counts as a missing `n`, and the code stays valid. Unknown
   keys, duplicated or malformed, are ignored.
5. **Values** are percent-decoded strictly: every `%` is followed by two hex digits, either case.
   This applies to every value, the byte fields included (so `slot=%41...` is read as `A...`).
6. **Byte fields** `slot` (16 bytes), `id`, `x`, `s` (32 bytes each) are unpadded base64url, as in
   control messages. A missing or empty field, a malformed `%`, padding, another alphabet,
   non-zero trailing bits or a wrong length is `not_pairing_code`.
7. **`relay`** decodes to one or more characters 0x21–0x7E (otherwise `not_pairing_code`, so an
   empty `relay=` too). It must then start with exactly, lower-case, `wss://` plus at least one
   character (otherwise `insecure_relay`: `ws://`, `https://`, `WSS://`, `wss://` alone).
8. **Precedence.** After the version, every structure error above wins over `insecure_relay`.
9. **`n`** is valid when missing. Present once, it is percent-decoded to bytes, then decoded and
   cleaned as in Names. A malformed `%`, a duplicate, or a name that cleans to empty gives no
   name (`None` / `null`), shown as "Mac".

**The builder** writes `relay, slot, id, x, s, n` in that order, cleans the name first and
leaves `n` out when it cleans to empty. It escapes every byte outside `A–Z a–z 0–9 - . _ ~` as
upper-case `%XX`, in `n` and in `relay` alike (`relay=wss%3A%2F%2F...`). It refuses a relay that
fails rule 7, with the same error. TypeScript's `buildPairCode` throws a `RangeError` unless
`slot` is 16 bytes and `id`, `x` and `s` are 32; Rust's array types rule those out. A
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

A key's role is fixed the first time it logs in, and stored (story 7a: the `devices` table,
see `relay-storage.md`). At login the relay runs `verify_login`, then
`relay_core::admit(stored_role, who)` over `Store::device`, then `Store::register` (one atomic
upsert that sets `last_seen` and refuses the other role). A login with the other role is
refused as above (4401, log code `role_conflict`). Roles survive a restart.

**Store error at login** (owner decision, 2026-10-16): if any of those store calls fails, the
relay closes the WebSocket with **1011** and reason **`internal_error`**, sends no `welcome`,
and logs `login_store_error code=<code>`.

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
  After the connection ends, off the async workers, a leave reads `peers_of`, fans the
  offline out at once, and only then writes the device's `last_seen` (`touch`), so
  presence never waits on a write. If `peers_of` fails, presence and the sender are still
  cleared, but nobody is told (story 7a). **Decision (owner, 2026-10-16):** only a failed
  `peers_of` suppresses presence; if the `touch` fails, the peers are still told the
  device is offline. Either failure is logged as `leave_store_error code=<code>`.
- Each device has a queue of 64 messages. A device whose queue is full, or whose socket
  send doesn't finish before its pong deadline, is dropped and counts as left.
- `welcome` is sent before any presence on the same connection.

## Pair directory

`relay_core::PairDirectory` (`peers_of(id) -> Result<Vec<PairInfo>, StoreError>`, `Send +
Sync`) is how the relay learns pairs. A failed read is an error, never `[]`: a `welcome`
with no pairs makes devices drop theirs. `relay_core::Store: PairDirectory` is the
relay's storage, and `relay_server::SqliteStore` implements it (story 7a, see
`relay-storage.md`). `InMemoryPairs` remains for `relay-core`'s own tests.

## Relay endpoints and configuration

- `GET /` upgrades to the WebSocket; `GET /health` answers `200 ok`, with no token.
- `GET /metrics` (story 7a): counts only, Prometheus text format
  (`text/plain; version=0.0.4`). **404** when no token is configured; **401** (with
  `WWW-Authenticate: Bearer`) unless `Authorization: Bearer <token>` carries it. The scheme
  name matches in any letter case (RFC 7235); the token must match exactly. The SHA-256
  digests of the given and the configured token are compared with `subtle`'s `ct_eq`, so
  neither a matching prefix nor the token's length shows in the timing. Every line is a `# ` comment or matches
  `relay_[a-z_]+({[a-z_]+="[a-z_]+"})? [0-9]+`. Gauges: `relay_online`, `relay_devices`,
  `relay_pairs`, `relay_pairs_acked`, `relay_push_tokens`. Counters:
  `relay_logins_total{result="ok"|"refused"}` (refused = every 4401 close, a timeout
  included; a 1011 close counts as neither), `relay_cleanup_deleted_devices_total`.
  Story 7b adds its own.
- **Logs** go through `relay_server::LogSink` as a typed `LogEvent`, whose fields are only
  `&'static str` codes and counts. Each line matches `^relay: [a-z_]+( [a-z_]+=[0-9a-z_]+)*$`.
  The binary's start-up lines (hosts, listen address, settings errors) are the only other
  output.
- `relay-server` bin: `RELAY_HOSTS` is **required**: comma-separated, each a bare host
  name or a bracketed IPv6 literal (no scheme, port, path or user). `RELAY_LISTEN`
  defaults to `0.0.0.0:8080`. **`RELAY_DB` is required** (the SQLite file's path).
  **`RELAY_METRICS_TOKEN`** is optional; when set it must be at least 32 characters.
  A missing, malformed or non-Unicode value exits 2; the effective host list is printed
  at start. A database that won't open (or has a newer schema), a relay that can't
  listen, or a server that stops, exits 1. `serve()` refuses ping settings unless
  `0 < ping_interval < ping_timeout`, and a zero `cleanup_interval`.
- `serve(Config) -> io::Result<relay_server::Relay>`. `Relay` has `addr`,
  `run_cleanup().await -> CleanupCounts`, `shutdown().await` (stop accepting, close every
  connection, wait for every leave, any running cleanup and every store call still
  running, a cancelled login's included; when it returns, the relay holds no reference to
  the store), `abort()` (a simulated crash: no leave, no touch), and `wait().await` (for the
  bin). `Config::new(listen, hosts, store)` defaults: ping 15 s / 30 s, `SystemClock`,
  `StderrLog`, no metrics token, cleanup every hour (first run one interval after start).
- `relay-cli` bin: `--url`, `--role mac|phone`, `--key-file` (32-byte seed as unpadded
  base64url, written to a temporary file and renamed into place with mode 0600 if missing;
  on unix an existing file that group or others can access is refused). The client skips
  unknown types, reports a close that came instead of the challenge as `Closed{code,
  reason}`, and waits at most 5 s when closing. `ws://` only for now: the client has no TLS.
