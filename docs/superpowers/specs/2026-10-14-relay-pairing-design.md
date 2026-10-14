# Relay and pairing: watching ADE's agents from an iPhone (piece 2a)

Piece 1 (`2026-10-14-agent-status-design.md`) taught ADE what each pane's
Claude Code agent is doing. This spec is piece 2a of the phone remote: a
relay on Fly.io, QR pairing, end-to-end encryption, a minimal Expo app on
TestFlight that shows each tab's state, and a push when an agent needs you.
It is **read-only**: nothing the phone sends can run anything on the Mac.
Steering (approve or deny, prompts, `!` commands) is piece 2b.

The standing constraints of the whole system, set in piece 1's spec, apply:
the Mac is the host and makes outbound connections only; content leaves a
device only encrypted end to end; offline, ADE works as before; remote is off
by default.

## Decisions

The owner settled these on 2026-10-14:

- The relay is a **Rust** server on **Fly.io**.
- Pairing is by **QR code, keys only**: each device's key pair is its
  identity. No accounts, no email. Accounts are piece 4.
- **Watch first, then steer**: 2a is read-only; 2b adds actions.
- 2a's phone side is a **minimal Expo app on TestFlight**, plus a **CLI
  client** that the automated tests use as the phone.
- Push goes through **APNs** with the owner's Apple Developer account.
- Encryption: **Noise IK** with standard primitives on both sides (approach A
  below).
- The verification command grows (see Verification).

Approaches considered for encryption:

- **A (chosen).** Noise `Noise_IK_25519_ChaChaPoly_SHA256`: `snow` on the Mac
  and the relay's test client; a small TypeScript implementation of that one
  pattern on `@noble/curves`, `@noble/ciphers` and `@noble/hashes` on the
  phone, held to `snow` by shared test vectors.
- **B.** A Noise library on the phone too. React Native's Noise libraries are
  thin and less tested; the phone side would carry the risk.
- **C.** TLS only, the relay reading messages. Breaks the end-to-end rule.

## Before 2a: piece 1 review fixes

The review of PR #55 (piece 1) found defects that 2a would carry to the
phone. Each is verified against the code, then fixed with a test, before 2a's
bridge relies on piece 1's state. Confirmed so far:

- `check_processes` treats a pid missing from its lookup map as exited, so a
  session that gets its first pid between `tracked()` and the update is
  dropped at once (`agent_status.rs`, `drop_dead` called from
  `check_processes`).

To verify, and fix where real: `SessionStart` with `source: compact` setting
ready mid-turn; the sub-agent set never cleared when a `SubagentStop` is lost;
the answer-key rule never re-arming after a removed prompt is denied; any
event re-creating a dropped session; `forget_pty` missing on `attach`'s
removal path; a hook payload over 4 MB dropped by the helper; the Linux lock
folder differing between processes; a user's own empty settings file or
`.claude/` being deleted on turn-off; no test of the state's wire format.

## Components and data flow

```
 ADE (Mac)                          Relay (Rust, Fly.io)                Phone
 agent_status watch -> remote       routes sealed frames by device      Expo app (TestFlight)
 bridge: per-tab snapshot -seal->   key; stores keys, pairs, APNs  ->   or CLI test client:
   {tab id, title, project, state}  tokens; no content                  opens frames, shows tabs
 needs-you for 3 s -> "push P"  ->  APNs: "An agent needs you"     ->   notification
```

- **ADE's remote bridge** (new module in `src-tauri`) subscribes to piece 1's
  per-pane state (`AgentStatus::watch`). It rolls panes up into tabs, using
  ADE's tab id, title and project folder name. Pane and PTY ids never leave
  the Mac. It holds one outbound WebSocket to the relay while Remote is on and
  at least one phone is paired. It sends each paired phone a sealed snapshot
  on every change, and a full snapshot when the relay reports that phone
  online.
- **Tab titles and project names are content**: they travel only inside
  sealed frames.
- **The relay** routes sealed frames between paired keys. It has no mailbox: a
  frame for an offline device is dropped, and the Mac resends a snapshot when
  the device returns.
- **Remote is off by default** in ADE. Turning it on shows **Pair a phone**.
  ADE lists paired phones with **Unpair**. Turning Remote off closes the
  connection; pairs are kept until unpaired.

## Pairing and the handshake

**Keys.** Each device has:

- an **identity key** (Ed25519), which signs the relay's login challenge;
- a **static encryption key** (X25519), signed by its identity key.

The Mac keeps both in the OS keychain through the `keyring` crate, as the
vault already does. The phone keeps them in `expo-secure-store` (iOS
Keychain).

**Pairing.**

1. **Pair a phone** in ADE asks the relay for a one-time slot: random id,
   valid 5 minutes, used once. ADE shows a QR code:
   `ade-pair://v1?relay=<wss url>&slot=<id>&id=<Mac identity key>&x=<Mac encryption key>&s=<32-byte secret>`
   (keys and secret base64url).
2. The phone scans it, logs in to the relay with its own identity key, and
   sends the slot a pairing request: its two public keys and its device name.
   The request is sealed with a key derived (HKDF-SHA256) from the QR's
   secret, so the relay can neither read nor forge it.
3. ADE opens the request; only a holder of the QR could seal it. ADE shows
   **"Pair '<device name>'?"** with a 6-digit code derived from the exchange.
   The phone shows the same code.
4. The user confirms in ADE. ADE sends the relay a pair record signed by both
   identity keys (the phone's signature came in the request). The slot closes.
   Declining, or 5 minutes passing, closes it with no pair.

Someone who photographs the QR code can't pair without the user's click
beside a matching code.

**Each connection** between a paired Mac and phone runs Noise IK, with the
phone as initiator (it knows the Mac's static key from the QR). Every session
has fresh keys, so a key stolen later doesn't open past traffic. Transport
frames carry Noise's counter nonce. A frame that fails to open, or replays a
counter, is dropped and the session is restarted.

**Many to many.** A Mac may pair with several phones and a phone with
several Macs. Each pair has its own session.

**Unpairing.** Either device sends the relay a signed unpair. The relay
deletes the pair and notifies the other side, which deletes its copy of that
peer's keys.

## The relay

**Storage**, SQLite on a Fly volume:

| Table | Holds |
|---|---|
| `devices` | identity public key, first seen, last seen |
| `pairs` | Mac key, phone key, when paired |
| `push_tokens` | phone key, APNs token, environment (sandbox / production), updated |

Pairing slots live in memory only. The relay never stores or logs frame
content; logs carry counts and error codes only. Devices unseen for 90 days
are deleted with their pairs and tokens. Losing the database means pairing
again, nothing more. Backup is Fly's daily volume snapshot.

**Login.** Over WSS the relay sends a random challenge. The device signs it,
together with the relay's host name and the time, with its identity key. A
key not seen before is registered on first login. One live connection per
device: a new one replaces the old.

**Routing.** A frame (at most 64 KB) is forwarded only between keys that are
paired; anything else is refused with an error code. When a paired phone
connects, the relay tells its Macs it is online.

**Limits** (piece 4 tightens them):

- frames: 20 per second per device, bursts to 100;
- push: 1 per 30 seconds per phone, 30 per hour;
- pairing slots: 5 per hour per Mac;
- new device keys: 20 per hour per IP;
- connections: 1 per device.

**What the relay can see.** IP addresses, connection times, which keys are
paired, and when a push is sent. The app's privacy note says so.

**Known gap until piece 4.** Keys are anonymous: someone can pair two of
their own devices and use the relay as a pipe. The size and rate limits bound
the cost.

**Operations.** TLS from Fly. `/health`. `/metrics` with counts only, behind
a token. A Dockerfile in `relay/`. APNs key, key id and team id are Fly
secrets. Starts as one machine.

## Push

- The app gets its APNs device token with `getDevicePushTokenAsync` (APNs
  direct, not Expo's push service, so no third party is in the path) and
  sends it to the relay in a signed control message, with its environment.
- The relay sends through APNs over HTTP/2 (`a2` crate) with token-based
  auth.
- **The notification is fixed: "An agent needs you"**, with no custom data.
  Opening it opens the app, which connects and gets a snapshot over the
  encrypted channel.
- **When:** ADE's bridge asks the relay to push to its paired phones when a
  tab enters **needs you** and is still there 3 seconds later. Not while that
  phone's app is in the foreground: the app tells the Mac, sealed, when it
  comes to the foreground and leaves it. The relay's limits apply on top.

## The minimal app

Expo SDK, TypeScript, `expo-router`:

1. **Pair**: scan the QR code (`expo-camera`), show the 6-digit code, wait
   for the Mac's confirmation.
2. **Macs**: paired Macs with an online or offline mark.
3. **Tabs**: one Mac's tabs: title, project, state dot in ADE's colours, and
   when the state last changed. Pull to refresh.
4. **Settings**: unpair a Mac; app version.

No analytics, and no crash reporter that could capture content. EAS builds
and submits to TestFlight for internal testers. The bundle id is
`com.betterterminal.remote` unless the owner names another.

## Code layout

- `relay/`: the Rust relay (its own crate, not in the `src-tauri` workspace).
- `packages/protocol/`: frame types, the pairing seal and the Noise IK
  implementation in TypeScript, used by the app and its tests;
  `packages/protocol/vectors/`: test vectors shared with Rust.
- `mobile/`: the Expo app.
- `src-tauri/src/remote_bridge.rs` (or a module folder): ADE's bridge, plus
  the Remote section of the UI in `src/`.
- `relay/` also builds the CLI test client (a second binary), used by the end
  to end test.

## Shared contract

`.ade/context/remote-protocol.md` records the QR format, the login challenge,
the pairing messages, the snapshot and presence frame shapes, the control
messages, error codes and limits, with the vectors as the reference. An ADR
records the relay and protocol choices.

## Verification

Approved by the owner on 2026-10-14 for piece 2a: the three existing checks,
plus two.

- `npx tsc --noEmit`
- `npm test` (now also runs `packages/protocol`'s tests)
- `cd src-tauri && cargo test`
- `cd relay && cargo test`
- `cd mobile && npx tsc --noEmit && npx jest`

CI gets a job for each new check.

### Tests

- **Protocol, both languages.** Rust and TypeScript run the same vectors: a
  handshake and a frame sealed on one side open on the other; a tampered,
  truncated or replayed frame is refused on both.
- **Pairing.** The right secret pairs. A wrong secret, an expired slot or a
  reused slot is refused. The 6-digit code matches on both sides. Nothing
  pairs without the Mac's confirmation. Unpairing from either side removes the
  pair on both.
- **Relay.** Login by signed challenge, a bad or stale signature refused;
  routing only between paired keys; each limit; the 90-day cleanup; no frame
  bytes in the logs (asserted); push through a fake APNs sink, whose payload
  is exactly the fixed text with no custom data.
- **End to end**, in one test. Start the relay on a random port, ADE's bridge
  in-process fed piece-1 states, and the CLI client as the phone. Check:
  pairing; the snapshot arriving; a change arriving; a push after 3 seconds of
  needs you and none for a prompt answered within 3 seconds; none while the
  app reports foreground; the relay never holding plaintext.
- **ADE's bridge.** Panes rolled up into tabs; the 3-second rule; keys kept in
  the keychain; Remote off closing the connection.
- **App.** Parsing the QR code; the tab list rendering each state; unpair.

### Manual check before Done

Install the TestFlight build, pair it with a dev build of ADE on the Fly
relay, and trigger a prompt in a background tab. Within about 3 seconds the
phone gets "An agent needs you"; the app shows the tab as needs you; answering
at the Mac updates the phone; unpairing from the phone updates ADE's list.

## Not in 2a

Approve or deny, prompts and `!` commands (2b, which first settles piece 1's
forgeable-token limit); accounts and abuse controls beyond the limits above
(piece 4); Android; the full app design (piece 3).
