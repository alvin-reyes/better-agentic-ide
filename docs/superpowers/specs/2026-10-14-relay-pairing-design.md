# Relay and pairing: watching ADE's agents from an iPhone (piece 2a)

Piece 1 (`2026-10-14-agent-status-design.md`) taught ADE what each pane's
Claude Code agent is doing. This spec is piece 2a of the phone remote:
- a relay on Fly.io;
- QR pairing;
- end-to-end encryption;
- a minimal Expo app on TestFlight that shows each tab's state;
- a push when an agent needs you.

It is **read-only**: nothing the phone sends can run anything on the Mac.
Steering (approve or deny, prompts, `!` commands) is piece 2b.

The standing constraints from piece 1's spec still apply:
- The Mac is the host and makes outbound connections only.
- Content leaves a device only encrypted end to end.
- Offline, ADE works as before.

Piece 1 also said remote control is off by default, per tab. 2a has a single
**Remote** switch for watching, off by default. Per-tab opt-in applies to
*control*, which arrives in 2b.

## Decisions

The owner settled these on 2026-10-14:

- **Relay:** a Rust server on Fly.io.
- **Pairing:** by QR code, keys only. Each device's key pair is its identity.
  There are no accounts and no email; accounts are piece 4.
- **Watch first, then steer:** 2a is read-only; 2b adds actions.
- **Phone side:** a minimal Expo app on TestFlight, plus a CLI client that the
  automated tests use as the phone.
- **Push:** APNs direct, with the owner's Apple Developer account.
- **Encryption:** Noise IK on standard primitives (approach A below).
- **Verification:** the command grows (see Verification).

Approaches considered for encryption:

- **A (chosen).** `Noise_IK_25519_ChaChaPoly_SHA256`. Rust uses `snow`. The
  phone uses a small TypeScript implementation of that one pattern on
  `@noble/curves`, `@noble/ciphers` and `@noble/hashes`, tested against the
  published cacophony IK vectors and against `snow` through shared vectors.
- **B.** A Noise library on the phone. React Native's Noise libraries are thin
  and less tested.
- **C.** TLS only, with the relay reading messages. This breaks the end-to-end
  rule.

## Depends on

**Piece 1 merged, and its review findings closed.** The review of PR #55
found defects that 2a would carry to the phone. One is confirmed:
`check_processes` treats a pid missing from its lookup as exited, so a session
that gets its first pid during a check is dropped (`agent_status.rs`
`drop_dead`).

Those findings are their own piece-1 follow-up plan in this initiative. Each
one ends in either a failing-then-passing test, or a written "not
reproducible". 2a's build starts after that plan is Done. This spec does not
fix them.

## Components and data flow

```
 ADE (Mac)                            Relay (Rust, Fly.io)            Phone
 tabStore -> remote_tabs_set ---.     routes sealed frames by         Expo app (TestFlight)
 agent_status current() --------+->   identity key; stores keys,  ->  or CLI test client:
 remote bridge: snapshot -seal----->  pairs, push tokens; no      ->  opens frames, shows tabs
 needs-you 3 s -> push request ---->  content; APNs "An agent         notification
                                      needs you"
```

### Tabs reach the backend

Tabs, titles and cwds live only in each window's frontend `tabStore`. Their
ids come from a counter per window, so two windows can both have `tab-1`.

- **`remote_tabs_set`.** Each window calls a new command,
  `remote_tabs_set(window_label, tabs)`. Each entry in `tabs` is
  `{ tab_id, title, project, pty_ids }`. The window calls it on every tab
  change that touches those fields, debounced to 200 ms, and with `[]` before
  it unloads. The backend also clears a window's entries on its Tauri
  `Destroyed` event.
- **`project`** is the base name of the tab's active pane's cwd: the live cwd
  (`usePaneCwd`), else `savedCwd`, else `initialCwd`, else empty.
- **Remote ids.** The bridge keys tabs by `(window_label, tab_id)` and gives
  each one an opaque random remote id for its lifetime. Remote ids, not ADE's
  ids, go to the phone. PTY ids never leave the Mac.

The registry's shape is recorded in `.ade/context/remote-tabs.md`.

### State

- **Reading piece 1's state.** Piece 1 gains a non-test
  `AgentStatus::current()`, which returns each PTY's state.
- **The bridge's sink only signals a wake-up.** It does no I/O, takes no lock
  of its own and runs no timer. The bridge thread then reads `current()`.
  Update order and piece 1's watcher lock therefore don't matter.
- **A tab's state** is the most urgent state among its PTYs, ranked in piece
  1's order.

### Snapshots

- **Always full, never deltas.** After any change the bridge waits 250 ms
  (coalescing), then sends each paired phone that has a live session a full
  snapshot.
- **Snapshot contents:** `seq`, which rises by one per snapshot and survives
  reconnects within one ADE run, plus the tabs.
- **Tab contents:** remote id, title, project, state, and `age_s`, the seconds
  since that state began, measured on the Mac. Phone and Mac clocks are never
  compared.
- **Caps:** at most 200 tabs, titles cut to 120 code points, projects to 80.
  The plaintext limit below wins; see the snapshot layout under App messages.
- **The phone** ignores a snapshot whose `seq` is not above the last one it
  saw.

### Remote switch and connection

- **Remote** is off by default and stored as setting `remote.enabled`.
- While on, ADE keeps one connection to the relay, whether or not a phone is
  paired, because pairing needs it.
- Off closes the connection. Pairs are kept until unpaired.

## Wire format

All relay traffic runs over WebSocket on `wss://` only; the phone refuses a
QR code with any other scheme.

- **Control messages** are JSON text frames, `{"v":1,"t":<type>,...}`, with
  bytes in unpadded base64url.
- **Session traffic** (`hs1`, `hs2`, transport frames) uses binary WebSocket
  messages, so it pays no base64 overhead:
  `u8 type (1 hs1, 2 hs2, 3 frame) || 32-byte peer identity key || body`.
  The peer key is the recipient when sending to the relay, and the sender when
  the relay delivers.
- **The relay's limit is 64 KiB per WebSocket message**, of either kind.

**Signed and sealed structures** use one encoding:

```
enc(label, f1, ..., fn) = label_ascii || u32be(len f1) || f1 || ... || u32be(len fn) || fn
```

Every label is distinct and starts with `ade-remote/v1/`. A signature or seal
made for one label never checks under another; a test proves this.

**Keys.** Each device has:
- an identity key `I`, Ed25519;
- a static key `S`, X25519.

The static key is bound to the identity key by the pair record and the Noise
prologue, not by a separate signature.

**Roles.** A device's role (`mac` or `phone`) is fixed when its key is first
registered. The relay refuses:
- slot requests from phones;
- push tokens from Macs;
- push requests from anyone but a Mac, and from a Mac for phones it isn't
  paired with.

### Login and presence

1. **Relay → device:** `challenge {c: 32 random bytes}`. The challenge is
   single-use, fresh for each connection, and carries no timestamp.
2. **Device → relay:** `login {id: I, role, sig}`, where
   `sig = Sign(I, enc("ade-remote/v1/login", c, host, role))`.
   - `host` is the host name the device itself dialled, taken from
     `remote.relayUrl` or the QR code, never anything the relay sent.
   - The relay checks the signature against its configured host names, a list
     (for example the `fly.dev` name and a custom domain). A login relayed
     through another server fails.
3. **Relay → device:** `welcome {pairs: [{pair_id, peer_id, peer_role}], online: [peer_id]}`.

The device reconciles with `welcome`, in both directions:

- **A local pair the relay doesn't list** is shown as "no longer paired" and
  removed. This covers unpairs made by the peer while this device was offline,
  the 90-day cleanup and a lost database.
- **A pair the relay lists but the device doesn't hold** is sent
  `unpair {pair_id}` at once. This covers an unpair the user made while this
  device couldn't reach the relay.
- **Unpairs made offline** are also kept in a persisted queue and sent on the
  next login.

**Presence.** The relay sends `presence {peer, online}` to every paired peer
when a device logs in, and when it leaves. A device has left when its socket
closes, or when 30 s pass with no pong; the relay pings every 15 s. One live
connection per device: a new login replaces the old, whose peers see offline
then online.

Messages after `login` are authorised by the authenticated connection and
carry no further signatures.

### Pairing: commit, then reveal

1. **Mac → relay:** `slot_open`. **Relay → Mac:** `slot {slot: 16 bytes, expires}`.
   The slot lasts 5 minutes.
2. **ADE shows the QR code:**
   `ade-pair://v1?relay=<wss url>&slot=..&id=<I_M>&x=<S_M>&s=<32-byte secret>`.
3. **Both sides derive two keys:**
   `k_pm = HKDF-SHA256(ikm=s, salt=slot, info="ade-remote/v1/pair/phone-to-mac")`,
   and `k_mp` the same with `info=".../mac-to-phone"`. Every pairing message is
   sealed with XChaCha20-Poly1305 under its direction's key, with a random
   24-byte nonce.
4. **Phone → relay → Mac:** `pair_commit {slot, sealed(k_pm, enc("ade-remote/v1/pair/commit", H))}`.
   `H = SHA-256(enc("ade-remote/v1/pair/commit-hash", I_P, S_P, name, N_P))`,
   with `N_P` a random 32-byte nonce.
5. **Mac → relay → phone:** `pair_nonce {slot, sealed(k_mp, enc("ade-remote/v1/pair/nonce", N_M))}`.
6. **Phone → relay → Mac:** `pair_reveal {slot, sealed(k_pm, enc("ade-remote/v1/pair/reveal", I_P, S_P, name, N_P, sig_P))}`.
   `sig_P = Sign(I_P, enc("ade-remote/v1/pair/phone-sig", slot, I_M, S_M, I_P, S_P))`.
   The Mac checks the reveal against `H`, and checks `sig_P`.
7. **Both sides show the code:**
   `SHA-256(enc("ade-remote/v1/pair/sas", slot, I_M, S_M, I_P, S_P, N_M, N_P, s))`,
   Its first 8 bytes are read as a big-endian u64, taken modulo 10^6 and shown
   as 6 digits. The phone computes
   it from its own keys only. Because the phone commits before it sees `N_M`,
   no one can grind keys to match the code, not even a relay that also saw the
   QR code.
8. **The user confirms in ADE.**
   - The Mac builds `R = enc("ade-remote/v1/pair/record", I_M, S_M, I_P, S_P, slot, u64be(paired_at))`
     and `sig_M = Sign(I_M, R)`, then sends
     `pair_confirm {slot, record fields, sig_M, sig_P}`.
   - The relay checks both signatures and both roles, stores the pair with
     `pair_id = SHA-256(R)[..16]`, and sends the phone
     `paired {record fields, sig_M, pair_id}`.
   - Before it shows "Paired", the phone checks that:
     - `I_P` and `S_P` are its own keys;
     - `I_M` and `S_M` equal the QR code's;
     - `slot` is its own slot;
     - `sig_M` is valid over `R`, which it rebuilds itself.

     It also computes `pair_id` itself and uses that, never the relay's
     copy. Then it sends `paired_ack {pair_id}`.
   - The relay answers the Mac's `pair_confirm` with `pair_confirmed {pair_id}`.
   - On decline, the phone gets `pair_declined`.

**Pending pairs.** A dropped connection at confirm must not silently undo a
pairing.
- **Saving early.** The Mac saves the pair as *pending* before it sends
  `pair_confirm`. The phone saves it as pending when it sends the reveal.
- **Promoting.** The phone promotes the pair once a `paired` message passes
  the checks in step 8. The Mac promotes it on `pair_confirmed`.
- **The Mac reconciling.** A `welcome` that lists a pair the Mac holds as
  pending completes it on the Mac; the Mac does not unpair it.
- **The phone reconciling.** The phone can't match a pending pair from
  `welcome` alone, because `pair_id` depends on `paired_at`, which only
  `paired` carries. It completes a pending pair only through `paired`, checked
  as in step 8. Until then it neither unpairs nor promotes a `welcome` pair it
  can't match.
- **Re-sending `paired`.** While the phone hasn't sent `paired_ack`, the relay
  sends `paired` again on each of its logins.
- **Expiry.** A pending pair the relay never lists is dropped after 10
  minutes.

**Slots.** The first `pair_commit` holds the slot until confirm, decline or
expiry; any other commit is refused. A racer can therefore block a slot. The
user then opens a new one, and that is the only effect.

**Device name.** At most 40 characters, printable only, and ADE renders it as
text.

**Unpair.** Either side sends `unpair {pair_id}`. The relay deletes the pair
and tells the peer if it is online; an offline peer learns at its next
`welcome`. Because each pairing has its own `pair_id`, replaying an old
unpair can't remove a newer pair.

### Sessions

The pattern is `Noise_IK_25519_ChaChaPoly_SHA256`. The prologue is
`enc("ade-remote/v1/noise", I_M, I_P)`. The phone initiates.

- **Message 1 (`hs1`).** Its payload is only an 8-byte big-endian counter.
  - **The phone sends** `max(now_ms, last_sent + 1)`, with `last_sent` stored
    for each Mac, so a clock that steps backwards still moves the counter
    forward.
  - **The Mac refuses it** unless it is above the last value it accepted from
    that phone. That last value is stored for each phone in ADE's app state, so
    no age window is needed after a restart, and the two clocks are never
    compared.
  - **The Mac also refuses it** unless the remote static key equals the `S_P`
    it paired with, for the `I_P` the relay names as the sender.
  Message 1 carries no content, because it has no forward secrecy.
- **Message 2 (`hs2`).** Empty payload. Content travels only in transport
  frames, which are forward secret.
- **Transport frames.** A frame body is
  `8-byte session id || u64be(nonce) || ciphertext`. The session id is the
  first 8 bytes of the handshake hash. The Mac uses `snow`'s stateless
  transport, and the phone the same scheme.
  - Each direction counts from 0.
  - A receiver accepts only a nonce above the last one it accepted. Gaps from
    frames the relay dropped are fine.
  - A frame for any session other than the current one is dropped silently.
  - A frame for the current session that fails to open is dropped. That side
    then restarts the session: the phone handshakes, and the Mac sends
    `rehandshake`.
  - Each side restarts at most once every 10 seconds.
- **When the phone starts a handshake:**
  - on `welcome` or `presence` showing its Mac online;
  - when the app comes to the foreground;
  - on receiving `rehandshake` (below);
  - after 24 hours or 2^32 frames in one session.
- **When the Mac asks for one.** If the Mac has a frame to send and no
  session, or a current-session frame fails to open, it sends the phone a
  plaintext `rehandshake {}` through the relay, at most once every 10 seconds.
  A forged one costs only a handshake.
- **The Mac sends its first snapshot** right after `hs2`.
- **Two handshakes at once.** The newest completed one wins, and frames for the
  older session are dropped.
- **Size.** A plaintext is at most 60,000 bytes. With the 33-byte binary
  header, the 8-byte session id, the 8-byte nonce and the 16-byte tag, a frame
  stays under the relay's 64 KiB.

### App messages (inside frames)

| Message | Direction | Meaning |
|---|---|---|
| `snapshot {seq, truncated, tabs:[{id, title, project, state, age_s}]}` | Mac → phone | full state (encoding below) |
| `want_snapshot {}` | phone → Mac | pull to refresh; also on coming to the foreground, and every 60 s while there |
| `foreground {on}` | phone → Mac | sent on change, and every 30 s while on |

**How every frame plaintext is laid out:** `u32be(len) || JSON || zero bytes`.
The JSON carries its message type as `"t"`, for example
`{"t":"snapshot",...}` or `{"t":"want_snapshot"}`. The vectors include one
plaintext for each type.
- **Padding.** Zeros pad it to the next multiple of 4 KiB, but never past
  60,000 bytes.
- **Too big.** If it would still exceed 60,000 bytes, the Mac drops the least
  urgent tabs (and the oldest among equals) until it fits, and sets
  `truncated: true`.
- **Text lengths** are counted in Unicode code points, and text is cut at a
  code-point boundary.
- **Vectors** include a snapshot at the maximum size.

The Mac treats a phone as **in the background** by default. It also does so
when the phone's presence is offline, or when no `foreground {on:true}` has
arrived for 60 s.

## Push

- **The app's token.** The app registers for notifications through
  `expo-notifications` and its config plugin, asking for permission after the
  first successful pairing. It sends `push_token {token, env}` on every launch.
  `env` is a build-time constant from the EAS profile: `production` for
  TestFlight and store builds, `sandbox` for dev builds.
- **The relay** sends through APNs over HTTP/2 (`a2`), with token auth from
  Fly secrets.
  - Headers: `apns-topic` is the bundle id, `apns-push-type: alert`,
    `apns-priority: 10`, `apns-collapse-id: ade-needs-you`.
  - On `BadDeviceToken` it tries the other environment once and updates the
    record.
  - On `410 Unregistered` it deletes the token.
- **The notification** has a fixed body, "An agent needs you", and no custom
  data. Opening it opens the app, which connects and handshakes.
- **When ADE asks for a push.** For each tab, separately:
  - When the tab's state becomes **needs you**, a 3-second timer starts.
  - If the tab still needs you when the timer ends, the Mac sends
    `push {phones: [I_P...]}`, naming its paired phones that are in the
    background.
  - Leaving needs you cancels the timer. Entering it again starts a new one.
  - Another pane of the same tab needing you doesn't start a second timer.
  - Tabs that already need you when Remote turns on don't push. Only changes
    push.
  - The timer uses an injectable clock.
- **The relay's limits apply on top.** It also refuses a push to any phone not
  paired with the requesting Mac.

## Keys and storage

**Mac.** The keys live in the OS keychain through `keyring`, under service
`com.betterterminal.remote`. A debug build uses
`com.betterterminal.remote.dev`, so dev and release builds have separate
identities and don't keep replacing each other's connection. This service is
separate from the vault's. Keys are read only while Remote is on. The pair
list, peer keys and the last `hs1` value per phone live in ADE's app state,
keyed by relay URL and the Mac's own identity key. The dev and release builds
share one app-data folder, and pointing at another relay is allowed;
reconciling with a `welcome` touches only the entries under its own key. The bridge reaches keys through a
`KeyStore` trait; the tests use an in-memory implementation, so CI needs no
keychain.

**Phone.** Each pair records the relay URL it was made on. The phone keeps
one connection per relay in use, and reconciles a `welcome` only against that
relay's pairs. Keys and the pair list live in `expo-secure-store` with
`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so they don't move to
another device through a backup. Keys and pairs share that store, so they
survive or vanish together, and `welcome` corrects anything stale.
`react-native-get-random-values` is imported first in the app's entry file,
before any `@noble` module, so Hermes has `crypto.getRandomValues`.

## The relay

**Storage**, in SQLite on a Fly volume:

| Table | Holds |
|---|---|
| `devices` | identity key, role, first seen, last seen |
| `pairs` | pair id, Mac key, phone key, both static keys, slot, paired at |
| `push_tokens` | phone key, APNs token, environment, updated |

- Slots and presence live in memory only.
- No frame or pairing content is stored or logged. Logs carry counts and error
  codes.
- Devices unseen for 90 days are deleted, with their pairs and tokens.
- Losing the database means pairing again.
- Backup is Fly's daily volume snapshot.

**Limits.** Piece 4 tightens these.

| What | Limit |
|---|---|
| Frames | 20/s per device, bursts to 100; 64 KiB each. A refused frame is answered with `rate_limited {peer, retry_ms}`, and the Mac resends its latest snapshot to that peer after `retry_ms` |
| Push | 1 per 30 s per phone; 30 per hour |
| Slots | 5 per hour per Mac |
| New identity keys | 20 per hour per IP |
| Connections | 1 per device |

**Operations.**
- Fly runs one machine with `auto_stop_machines = false` and
  `min_machines_running = 1`.
- TLS comes from Fly.
- `/health` is public; `/metrics` serves counts only, behind a token.
- A Dockerfile lives in `relay/`.
- APNs key, key id and team id are Fly secrets.
- Clients reconnect with backoff from 1 s to 60 s, with full jitter. Every
  deploy drops all connections.

**Relay address.** ADE setting `remote.relayUrl`, defaulting to the deployed
`wss://` host. `ADE_RELAY_URL` overrides it in dev and tests. Both are recorded
in the Context Store.

`docs/ops.md` gets a relay section from devops before the relay ships:
deploy, rollback, the `/health` alert, and where the `.p8` lives.

## Known limits

- **Metadata.** The relay sees IP addresses, connection times, which keys are
  paired, when pushes are sent, and frame sizes and timing. Padding hides exact
  title lengths, not tab activity. The app's privacy note says so.
- **Forged status.** Piece 1's limit still holds: any process started in an ADE
  terminal can forge status. In 2a a forged **needs you** can trigger a push.
  The relay's push limits bound it. 2b must close this before the phone can act
  on anything.
- **Anonymous keys.** Someone can pair two of their own devices and use the
  relay as a pipe. The new-key limit per IP is easily dodged by rotating IPv6
  addresses. Size and rate limits bound the cost until piece 4.
- **Push timing.** Push timing shows *when* an agent needs you, though not
  which one.

## The minimal app

Built with Expo SDK, TypeScript and `expo-router`.

1. **Pair.** Scan the QR code with `expo-camera`, show the 6-digit code, and
   wait for `paired` or `pair_declined`.
2. **Macs.** The paired Macs, each with an online or offline mark from presence.
3. **Tabs.** For one Mac: title, project, a state dot in ADE's colours, and the
   age of the state. Pull to refresh sends `want_snapshot`.
4. **Settings.** Unpair, and the app version.

There are no analytics, and no crash reporter that could capture content. EAS
builds the app and submits it to TestFlight. The bundle id is
`com.betterterminal.remote` unless the owner names another.

## Code layout

- **`relay/`**: a virtual Cargo workspace with five crates:
  - `relay/protocol/`: encodings, labels, pairing seals and Noise wiring.
  - `relay/core/`: the pairing and session state machines and the snapshot
    builder, all Tauri-free.
  - `relay/server/`: the relay.
  - `relay/cli/`: the test client.
  - `relay/e2e/`: a package whose `tests/` hold the end-to-end test. A virtual
    workspace builds no tests from its own root, so the test needs a package.

  `src-tauri` depends on `protocol` and `core` by path, so the Mac and the CLI
  share one Rust implementation.
- **`packages/protocol/`**: the TypeScript protocol and Noise IK.
  `packages/protocol/vectors/` holds the vectors that the Rust tests read too.
- **`mobile/`**: the Expo app, with its own `package-lock.json`.
  - It depends on `packages/protocol` as `file:../packages/protocol`.
  - `@noble/*` are **peer dependencies** of `packages/protocol`, installed in
    both the root and `mobile/`.
  - `packages/protocol` takes randomness only from
    `globalThis.crypto.getRandomValues` (Node 20 and jsdom provide it) and
    never imports a polyfill.
  - `react-native-get-random-values` is a plain dependency of `mobile/` only,
    imported first in the app's entry file.
  - Metro's `watchFolders` includes `../packages/protocol`, and
    `resolver.nodeModulesPaths` points at `mobile/node_modules`, so the package
    resolves its imports from the app.
  - Jest's `moduleDirectories` and `transformIgnorePatterns` do the same, and
    Jest compiles the package's TypeScript.
- **`src-tauri/src/remote_bridge.rs`**: the bridge, plus `remote_tabs_set`, the
  Remote settings and the pairing UI in `src/`.

## Shared contract

- `.ade/context/remote-protocol.md`: everything under Wire format, with the
  vectors as the reference.
- `.ade/context/remote-tabs.md`: the tab registry.
- An ADR for the relay and protocol choices.

## Verification

The owner approved this on 2026-10-14 for piece 2a: the three existing checks,
plus two.

- `npx tsc --noEmit`. The root `tsconfig.json` `include` adds
  `packages/protocol`.
- `npm test`. The vitest `include` adds `packages/protocol/**/*.test.ts`.
- `cd src-tauri && cargo test`
- `cd relay && cargo test`. This covers all five crates, including the
  end-to-end test.
- `cd mobile && npx tsc --noEmit && npx jest`

**Install steps**, for CI and a fresh checkout: `npm ci` at the root, and
`npm ci` in `mobile/`. Cargo fetches the rest.

**First story.** The first 2a story scaffolds `relay/` (five crates),
`packages/protocol` and `mobile/`, each with one passing test, plus a CI job
for each new check. Every later story can then run the full command. That
story also proves:

- The end-to-end package's placeholder test appears by name in the output of
  `cd relay && cargo test`.
- An EAS-style install bundles: `npm ci` in `mobile/` alone, then
  `npx expo export`, resolving `packages/protocol` and its peers.

### Tests

- **Protocol vectors**, shared by Rust and TypeScript:
  - the `enc` encoding;
  - each label, including that a signature under one label fails under
    another;
  - the pairing seals and the 6-digit code, where a different phone key gives
    a different code;
  - the IK handshake against the cacophony vectors and `snow`;
  - transport frames, where tampered, truncated, replayed and lower-nonce
    frames are refused, and a gap is accepted;
  - frames carrying another session's id, which are dropped silently.
- **Pairing:**
  - the right secret pairs;
  - refused: a wrong secret, an expired slot, a second commit, a reveal that
    doesn't match its commit, and a bad `sig_P` or `sig_M`;
  - nothing pairs without confirmation;
  - the phone refuses a `paired` record naming other keys;
  - unpair works from either side;
  - a replayed old unpair leaves a newer pair alone;
  - `welcome` reconciles in both directions: an unpair made by the peer while
    this device was offline, and an unpair made on this device while it was
    offline (queued);
  - the phone refuses a `paired` record whose Mac keys or slot differ from
    the QR code;
  - two identities sharing one state file each keep their own pairs;
  - a phone paired on two relays keeps both after a `welcome` from one;
  - a connection dropped between `pair_confirm` and `paired` leaves the pair
    in place on both sides after the next login.
- **Sessions:**
  - a replayed `hs1` is refused;
  - a phone clock set back, or skewed against the Mac's, still connects;
  - frames still in flight from an old session don't start a handshake
    loop;
  - a remote static that differs from the paired one is refused;
  - the Mac asks for a handshake when it has no session;
  - a dropped frame doesn't break the session;
  - two handshakes at once leave the newest.
- **Relay:**
  - login with a single-use challenge, a replayed login refused, and a login
    signed for another host refused;
  - role enforcement;
  - routing only between paired keys;
  - presence on login, close and ping timeout;
  - each limit;
  - the 90-day cleanup;
  - push through a fake APNs sink: fixed body, no data, the right headers, the
    environment fallback, and deletion on 410.
- **No plaintext at the relay.** A canary string in a tab title never appears
  in bytes the relay received, in its logs, or in its SQLite file.
- **End to end, in `relay/e2e/tests/`.** Start the relay on a random port, then
  `core`'s Mac side fed tab registry and piece-1 states, then the CLI client as
  the phone. Check pairing, the first snapshot, a change, `seq` ordering, the
  3-second push rules with an injected clock (including re-entry and a second
  pane), no push while the app reports foreground, push again after the
  foreground signal lapses, recovery after the relay restarts, and the latest
state arriving after the burst's last frame was rate-limited.
- **The bridge in `src-tauri`:**
  - `remote_tabs_set`, including two windows that both have `tab-1`, and a
    window closing;
  - panes rolled up into tabs;
  - the sink only signalling;
  - `KeyStore` in memory;
  - the dev and release services differing;
  - Remote off closing the connection.
- **App:**
  - QR parsing, refusing a scheme other than `wss://`;
  - the tab list rendering each state and ignoring a stale `seq`;
  - unpair;
  - `getRandomValues` coming from the polyfill.

### Manual check before Done

1. Install the TestFlight build and pair it with a dev build of ADE on the Fly
   relay.
2. Trigger a prompt in a background tab. Within about 3 seconds the phone gets
   "An agent needs you", and the app shows that tab as needs you.
3. Answer at the Mac. The phone updates.
4. Unpair from the phone. ADE's list updates.

## Not in 2a

- Approve or deny, prompts and `!` commands. These are 2b, which first closes
  the forgeable-status limit.
- Accounts and abuse controls beyond the limits above (piece 4).
- Android.
- The full app design (piece 3).
