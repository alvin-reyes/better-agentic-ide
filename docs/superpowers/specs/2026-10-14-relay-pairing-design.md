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

The review of the phone app UX (`2026-10-15-phone-app-ux.md`) amended this
spec on 2026-10-15. The owner decided: the QR code carries the Mac's name;
the phone keeps snapshots in memory only; tabs with no agent show as "No
agent" and sort last; scanning an already paired Mac offers to pair again.
The rest of that amendment closes pairing gaps the review found (refusals,
cancel, expiry). The owner approved the amendment on 2026-10-15.
One consequence to note: the `ade-pair` URL scheme is registered in dev builds
only, so in release the iOS Camera app can't start a pairing; only the app's
own scanner can.

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
  reconnects within one ADE run; `total`, the number of tabs the Mac has,
  before any are left out; `truncated`; and the tabs, in no particular
  order (the phone sorts).
- **Tab contents:** remote id, title, project, state, and `age_s`, the whole
  seconds since that state began, measured on the Mac. Phone and Mac clocks
  are never compared.
  - `state` is one of piece 1's strings (`needsYou`, `waiting`, `working`,
    `ready`, `finished`), or `null` for a tab with no agent.
  - **Tabs with no agent are included**, so the phone's list matches ADE's
    tabs. Their `state` and `age_s` are both `null`; the Mac always sends
    both fields. They rank below `finished`. A non-null `age_s` beside a
    `null` state is ignored.
  - **A state the phone doesn't know** (a later version's string, a missing
    field, a wrong type) is shown like `null` but labelled "Unknown", and the
    rest of the snapshot is used. `null` means no agent; a missing field is
    unknown. Adding a state is a protocol change.
- **Caps:** at most 200 tabs, titles cut to 120 code points, projects to 80.
  The plaintext limit below wins; see the snapshot layout under App messages.
  Leaving tabs out for either reason uses the same order and sets
  `truncated: true`; `truncated` is false only when every tab is sent.
- **The phone** ignores a snapshot whose `seq` is not above the last one it
  saw **in the current session**. A new session starts that afresh, so a
  restarted ADE, whose `seq` starts again at 1, is not ignored.
- **The phone keeps snapshots in memory only.** It never writes titles,
  projects or states to its storage or logs, or puts them in a notification;
  a relaunched app shows nothing until a new snapshot arrives. The iOS
  app-switcher image is covered in the UX spec.

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

- **A local pair the relay doesn't list** is removed. This covers unpairs
  made by the peer while this device was offline, the 90-day cleanup and a
  lost database. The user is told "no longer paired", and the session ends,
  only if no pair with that peer key remains; otherwise it was replaced or a
  second attempt was undone, and the removal is silent.
- **A pair the relay lists but the device doesn't hold** is sent
  `unpair {pair_id}` at once. This covers an unpair the user made while this
  device couldn't reach the relay. The one exception is on the phone: an
  old pair it dropped when it acked a replacement is recorded as replaced,
  kept whole (hidden) together with the id of the pair that replaced it. While the phone still
  holds that replacing pair, the old one is waiting for the relay to
  replace it (the ack was lost), and the phone leaves it alone. Once the
  phone no longer holds the replacing pair (it was unpaired, on either
  side), the record is void. If the relay still lists the old pair, the
  phone restores it, silently, so undoing a second attempt keeps the first
  even after a lost ack; otherwise it drops the record. The phone handles `welcome`'s removals first, so a
  replacing pair unpaired while the phone was offline voids the record in
  the same `welcome`. The record is also dropped when `pair_replaced`
  arrives or a `welcome` no longer lists the old pair.
- **Order.** On login the relay sends any re-sent `paired` messages before
  `welcome`, so the phone re-acks a replacement before it reconciles.
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

1. **Mac → relay:** `slot_open`. **Relay → Mac:** `slot {slot: 16 bytes, ttl_s}`.
   `ttl_s` is the seconds the slot has left (300 here), so no clocks are
   compared. A commit restarts it (see Slots).
2. **ADE shows the QR code:**
   `ade-pair://v1?relay=<wss url>&slot=..&id=<I_M>&x=<S_M>&s=<32-byte secret>&n=<Mac name>`.
   `n` is the Mac's name (see Names below), UTF-8 then percent-encoded. A
   code without `n` is valid; the phone then calls that Mac "Mac".
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
   - The relay checks both signatures and both roles, stores the pair, not
     yet acked, with `pair_id = SHA-256(R)[..16]`, and sends the phone
     `paired {record fields, sig_M, pair_id}`.
   - Before it shows "Paired", the phone checks that:
     - `I_P` and `S_P` are its own keys;
     - `I_M` and `S_M` equal the QR code's;
     - `slot` is its own slot;
     - `sig_M` is valid over `R`, which it rebuilds itself.

     It also computes `pair_id` itself and uses that, never the relay's
     copy. Then it sends `paired_ack {pair_id}`, and the relay marks the pair
     acked.
   - The relay answers the Mac's `pair_confirm` with `pair_confirmed {pair_id}`.
   - On decline (`pair_decline {slot}` from the Mac), the phone gets
     `pair_declined {slot}`.

**Pairing messages.** All are control messages (JSON text frames).

| Message | Direction | Meaning |
|---|---|---|
| `slot_open {}` | Mac → relay | open a slot; ends the Mac's previous one |
| `slot {slot, ttl_s}` | relay → Mac | the new slot |
| `pair_commit {slot, sealed}` | phone → relay | step 4, as sent |
| `pair_commit {slot, sealed, ttl_s}` | relay → Mac | step 4, as delivered |
| `pair_nonce {slot, sealed}` | Mac → relay | step 5, as sent |
| `pair_nonce {slot, sealed, ttl_s}` | relay → phone | step 5, as delivered |
| `pair_reveal {slot, sealed}` | phone → relay → Mac | step 6 |
| `pair_confirm {slot, record fields, sig_M, sig_P}` | Mac → relay | step 8 |
| `pair_decline {slot}` | Mac → relay | the user declined; always answered with `pair_state` |
| `paired {record fields, sig_M, pair_id}` | relay → phone | a stored pair |
| `paired_ack {pair_id}` | phone → relay | the phone accepted it |
| `pair_confirmed {pair_id}` | relay → Mac | the pair is stored |
| `pair_declined {slot}` | relay → phone | the Mac declined |
| `pair_abort {slot}` | Mac or phone → relay | end the attempt; always answered with `pair_state` |
| `pair_status {slot}` | Mac or phone → relay | ask; answered with `pair_state` |
| `pair_state {slot, state, reason}` | relay → asker | `state` is `open`, `paired` or `ended`; `reason` only with `ended` |
| `pair_ended {slot, reason}` | relay → a party | the slot ended without that party asking |
| `pair_refused {slot, reason}` | relay → sender | a commit, nonce, reveal or confirm was not taken, and nothing was stored |
| `control_limited {msg, slot, pair_id, retry_ms}` | relay → sender | a control message over the limit was dropped unprocessed: `msg` is its type, and `slot` or `pair_id` is given when it carried one. The sender re-sends it after `retry_ms` (see Limits) |
| `pair_replaced {old_pair_id, pair_id}` | relay → Mac and phone | a new pair replaced the old one (Pairing again) |

**Reasons**, shared by `pair_state`, `pair_ended` and `pair_refused`:
- `unknown`: the relay has no record of the slot. It was never opened, it
  ended over an hour ago, or the relay restarted (slots live in memory). Also
  the answer to a non-party (below).
- `expired`: it ran out.
- `taken`: another phone's commit holds it, or a different record was
  confirmed on it.
- `cancelled`, `declined`, `disconnected`: how it ended (below).
- `unpaired`: it paired, and that pair has since been unpaired.

The relay keeps an ended slot's id, reason and parties (the Mac and the
committed phone, if any) for 1 hour, so the reasons
are told apart within that hour; after it, or after a restart, the answer
is `unknown`. It handles one slot's messages one at a time, so a confirm and
an abort, a decline or the expiry can't both take effect.

**Who may act on a slot.** The parties are the Mac identity that opened
it and the phone whose commit holds it; the rule holds after the slot ends,
through its 1-hour record.
- **Commit.** Any phone may commit. A commit to an open slot no commit holds
  takes it; any other commit gets `pair_refused` with the slot's true
  reason: `taken` if another commit holds it, or how it ended (`expired`,
  `cancelled` and so on, `unknown` once the record is gone). Whoever commits
  holds the QR code, so this tells it nothing it couldn't learn.
- **Everything else is the parties' only.** Only the Mac may send
  `pair_nonce`, `pair_confirm` and `pair_decline`; only the committed phone
  `pair_reveal`; only the two of them `pair_abort` and `pair_status`.
- **A non-party** gets `pair_refused {slot, reason: "unknown"}` for a nonce,
  reveal or confirm, and `pair_state {slot, state: "ended", reason:
  "unknown"}` for an abort, a status or a decline. The slot is left as it
  was, and the answer says nothing about it.

**Slots.** A slot belongs to the Mac's identity, not to its connection.
- **Lifetime.** 300 s from `slot`. The first commit holds it, and from then
  it lasts 300 s from the commit, so the user has that long to compare
  codes; the `ttl_s` the relay adds to the delivered `pair_commit` and
  `pair_nonce` gives both sides that count. It ends on confirm, decline,
  abort, expiry, or a disconnect before the reveal. A commit from another
  phone is refused `taken`.
- **One at a time.** A Mac has at most one open slot. `slot_open` ends the
  previous one as `cancelled`, telling its committed phone, if any, with
  `pair_ended`.
- **Disconnects.** Pairing messages are never queued. Until the reveal is
  delivered to the Mac, the slot ends when the Mac's connection closes, or
  the committed phone's, and the other side, if connected, gets
  `pair_ended {slot, reason: "disconnected"}`. So a commit never waits on an
  offline Mac. After the reveal is delivered, a disconnect doesn't end the
  slot, and the Mac may confirm or decline after it reconnects. If ADE
  reconnects with its pairing view open and no reveal received (one can be
  lost on a dying socket), it sends `pair_abort` for the old slot, then
  opens a new one and redraws the QR code.
- **Abort.** A party may send `pair_abort {slot}` at any time. If the slot is
  still open, the relay ends it as `cancelled` and sends the other party
  `pair_ended`. Either way it answers the sender with `pair_state`, so the
  sender always learns the outcome. The answer is computed exactly as for
  `pair_status` (below), pairs table first, so it holds after a relay
  restart too; if a confirm won the race, `paired` or `pair_confirmed` comes
  first. ADE aborts when its pairing view closes before the reveal, and as
  above on reconnect. Closing it after the reveal but before the user
  confirms is a decline. Once the user has confirmed, closing the view
  sends nothing: the confirm stands, and ADE keeps re-sending it as a
  pending pair until the relay answers. The confirm is the intended
  winner. The phone aborts on Cancel, and when 30 s pass after its commit
  with no `pair_nonce`.
- **Decline** works like an abort: if the slot is open the relay ends it as
  `declined` and sends the phone `pair_declined`, and it always answers the
  Mac with `pair_state`, computed the same way.
- **Re-sending.** Pairing messages aren't queued, so one can be lost on a
  dying socket. A device with a `pair_abort` or `pair_decline` that has had
  no `pair_state` sends it again after each `welcome` until one comes. If ADE
  quits first, a lost decline reaches the phone as `expired`.
- **Expiry.** When a committed slot runs out, the relay sends both parties
  `pair_ended {slot, reason: "expired"}`. ADE closes its confirm view.
- **Refusals.** A `pair_commit`, `pair_nonce`, `pair_reveal` or
  `pair_confirm` the slot can't take is answered `pair_refused {slot,
  reason}`.
- **Confirm is idempotent.** A `pair_confirm` whose record matches a stored
  pair (the same `pair_id`) is answered `pair_confirmed` again, whether or
  not the slot still exists, so the Mac can re-send it (see Asking). A
  refused confirm therefore means the relay holds no such pair.
- **The rate limit** counts slots opened (see Limits). Re-opening after a
  reconnect, the 30 s abort and a racer's commits all spend from it. A racer
  who can see every code ADE shows can block pairing until the hour's limit
  is spent; it can't pair, because its code won't match the Mac's.

**Pending pairs.** A dropped connection at confirm must not silently undo a
pairing.
- **Saving early.** The Mac saves the pair as *pending* before it sends
  `pair_confirm`, with the record fields, `sig_M`, `sig_P`, `pair_id` and
  the phone's name. The phone saves it as pending when it sends the reveal,
  with the relay URL, slot, `I_M`, `S_M` and Mac name from the QR code
  (everything the step-8 checks need) and the 6 digits, so a relaunched app
  can show them again. `s`, `k_pm`, `k_mp` and `N_P` are wiped once the
  reveal is sent.
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
  sends `paired` again on each of its logins, before `welcome`. A `paired`
  for a pair the phone already holds (its ack was lost) is checked and acked again.
- **Asking.** A device holding a pending pair asks after each `welcome` and
  every 60 s while connected:
  - **The Mac re-sends its stored `pair_confirm`.** It is idempotent, so the
    answer is `pair_confirmed` or a refusal. A confirm lost on a dying
    socket, which leaves the slot open, is therefore retried before the slot
    runs out.
  - **The phone sends `pair_status {slot}`,** or, for a pair it has
    cancelled, `pair_abort {slot}` again, which gets the same answer and
    also ends a slot still open.

  For `pair_status` and `pair_abort` the relay looks in its
  pairs table first, which is on disk, then its slot records: a stored pair
  on that slot that names the asker gets `paired` (phone) or
  `pair_confirmed` (Mac) re-sent, then `pair_state {state: "paired"}`; a slot
  still open gets `pair_state {state: "open"}`; anything else gets
  `pair_state {state: "ended", reason}`. A relay restart loses slots but not
  pairs, so `unknown` never hides a stored pair.
- **Dropping a pending pair.** Only when the relay says it is over:
  `pair_state` ended, `pair_ended`, `pair_declined`, a refused reveal (the
  phone) or a refused confirm (the Mac). Also `pair_state {state: "paired"}`
  when the `paired` before it failed the step-8 checks. No timer and no clock
  is involved, so a clock that steps changes nothing, and an offline device
  keeps showing "Finishing pairing" until it reaches the relay.
- **A `paired` the phone can't match** (no pair, pending or cancelled pair of
  its own on that slot, or failing the checks) is ignored and not acked. Once
  the phone holds no pending pair on that relay, `welcome` lists it as a
  pair the phone doesn't hold, and the phone unpairs it.
- **Discarding by hand.** The user may discard a pending pair at any time,
  for example when its relay is gone for good (a QR code naming a dead
  relay). It leaves the lists at once.
  - On the phone, a discard is a cancel after the reveal (below): the pair
    is kept, hidden, with its cancelled mark, so a later `paired` for it is
    unpaired at once.
  - ADE stops re-sending its confirm and queues `unpair {pair_id}`.

  Either is sent if the relay ever answers again. A discarded pair for a
  relay that never returns is kept, hidden, indefinitely; each is a few
  hundred bytes.
- **Cancel on the phone.** Before the reveal nothing is stored; the phone
  sends `pair_abort` if connected, and otherwise the disconnect rule ends the
  slot. After the reveal the phone marks the pending pair cancelled and
  sends `pair_abort` now or, if offline, after its next login (the mark is
  stored). A `pair_state` ended drops it. If a `paired` for it arrives (the
  Mac's confirm won, or came while the phone was offline), the phone runs the
  step-8 checks and, if they pass, sends `unpair {pair_id}` instead of
  `paired_ack`, then drops it.
- **No push before the ack.** The relay sends a push only to a phone that
  has acked its pair with the requesting Mac. A phone that cancelled while
  offline therefore gets no notification from that Mac before it unpairs.

**Pairing again.** There is at most one *acked* pair between a Mac key and a
phone key. When the phone scans a QR code whose relay and `I_M` match a pair
it holds, it asks before pairing (the UX spec's "Already paired"). Pairing
again is an ordinary pairing, and the old pair stays, at the relay and on
both sides, until the phone acks the new one. On that `paired_ack` the
relay deletes the old pair in the same step and sends each online side
`pair_replaced {old_pair_id, pair_id}`, never `unpair`, so neither shows "no
longer paired".
- The phone drops its old pair when it sends the ack, keeping it hidden as
  a replaced record (see `welcome`), and the Mac drops it when it gets
  `pair_replaced`.
- An offline side catches up through `welcome`, whose rules cover both
  directions: a removed pair with another pair left for that peer key goes
  silently, and an old pair the phone recorded as replaced is left to
  `pair_replaced`, which the re-sent `paired` before `welcome` triggers. A
  new pair that failed the phone's checks is not recorded, so the phone
  unpairs it at `welcome`, silently for both sides because the old pair
  remains.
- So a declined, expired or cancelled second attempt, or a new `paired` that
  fails its checks, leaves the old pair in place.
- While both exist, ADE shows the phone once, and its Unpair unpairs both
  (see Unpair). Both pairs name the same keys, so sessions don't change.

**`hs1` across pairs.** The Mac's last accepted `hs1` is kept per (its own
identity key, phone identity key), and the phone's `last_sent` per Mac
identity key. Neither is keyed by pair or by relay, so they survive an
unpair and pairing again, and an `hs1` recorded on one relay or before an
unpair can't be replayed later. They are kept indefinitely, with no cleanup:
a phone key can pair again after any deletion, including the relay's 90-day
cleanup, and each entry is a few dozen bytes.

**Sessions and unpairs.** A session ends, and the user is told the peer is
no longer paired, only when no pair remains between the two keys. A
replacement, or the unpair of a cancelled second attempt while the old pair
remains, keeps the live session and shows nothing.

**Names.** The phone's name (in the reveal) and the Mac's name (`n` in the
QR code) are cleaned by one procedure, in this order:
1. Remove (not replace) every code point in this fixed list, which needs no
   Unicode version: U+0000–001F, U+007F–009F, U+00AD, U+061C, U+180E,
   U+115F–1160, U+200B–200C, U+200E–200F, U+2028–202E, U+2060–206F,
   U+3164, U+D800–DFFF, U+E000–F8FF, U+FEFF, U+FFA0, U+FFF0–FFFF,
   U+E0000–E007F and U+F0000–10FFFF. This takes out controls, bidi
   overrides, invisible fillers, tags, lone surrogates and private use;
   U+200D (the emoji joiner) stays.
2. Trim leading and trailing U+0020, U+00A0, U+1680, U+2000–200A, U+202F,
   U+205F and U+3000.
3. Cut to 40 code points.
4. Trim trailing spaces again, as in step 2.

**Decoding `n`.** Percent-decode it to bytes, then decode UTF-8 with each
invalid sequence replaced by U+FFFD, which step 1 then removes. Never use a
decoder that throws on bad input (JavaScript's `decodeURIComponent` does);
a malformed `%` escape makes `n` count as missing.

The sender cleans the name before sending; the receiver cleans it again
before showing or storing it, and never refuses a pairing over a name. The
Mac checks `H` over the name's bytes as received, then decodes them as
UTF-8 with each invalid sequence replaced by U+FFFD (Rust's
`String::from_utf8_lossy`, never `from_utf8`, which refuses), then cleans
it. A name that ends
up empty shows as "iPhone" on the Mac and "Mac" on the phone. Names are
rendered as plain text only.

ADE's name is the macOS Computer Name, else the host name. A later rename
doesn't reach paired phones in 2a; pairing again updates it. The phone stores
the Mac's name with the pair.

The Mac's name is in no code, record or signature. It labels the Mac on the
phone, and is only as good as the QR code it came from: a code the user
scans from their own Mac's screen is trusted for its keys and its name
alike, but a code from anywhere else can carry any name (see Known limits).
Keeping it out of the record also keeps it off the relay, which sees
records in plaintext.

**Unpair.** Either side sends `unpair {pair_id}`. The relay deletes the pair
and tells the peer if it is online; an offline peer learns at its next
`welcome`. Because each pairing has its own `pair_id`, replaying an old
unpair can't remove a newer pair.
- **The user's Unpair covers every pair with that peer.** ADE, which may
  briefly hold two pairs with one phone, sends `unpair` for each. The phone
  sends it for its pair with that Mac and for every id it recorded as
  replaced by it, and drops those records. ADE also discards any pending
  pair with that phone, which stops its confirm re-sends. All of these go
  in the queue if the device is offline.
- **Unpairs the protocol makes** (a cancelled pairing, a pair that failed
  its checks, `welcome` reconciliation) name one pair only, so undoing a
  second attempt leaves the first.

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
| `snapshot {seq, total, truncated, tabs:[{id, title, project, state, age_s}]}` | Mac → phone | full state (encoding below) |
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
  `truncated: true`. This is the drop order, first dropped first: tabs with
  no agent, then `finished`, `ready`, `working`, `waiting`, `needsYou`;
  within a state, the largest `age_s` first; then the largest remote id, so
  the order is fixed.
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
- **In the foreground.** A push can still arrive while the app is open (the
  foreground signal lapsed, or it raced the app opening). The app's
  notification handler then shows no banner and plays no sound, and sends
  `want_snapshot` to each Mac with a session; the open screen shows the
  state.
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
  paired with the requesting Mac, or that hasn't sent `paired_ack` for that
  pair.

## Keys and storage

**Mac.** The keys live in the OS keychain through `keyring`, under service
`com.betterterminal.remote`. A debug build uses
`com.betterterminal.remote.dev`, so dev and release builds have separate
identities and don't keep replacing each other's connection. This service is
separate from the vault's. Keys are read only while Remote is on. The pair
list and peer keys live in ADE's app state, keyed by relay URL and the
Mac's own identity key. The last `hs1` value per phone is the exception: it
is keyed by the Mac's own key and the phone's key, not by relay (see `hs1`
across pairs). The dev and release builds
share one app-data folder, and pointing at another relay is allowed;
reconciling with a `welcome` touches only the entries under its own key. The bridge reaches keys through a
`KeyStore` trait; the tests use an in-memory implementation, so CI needs no
keychain.

**Phone.** Each pair records the relay URL it was made on. The phone keeps
one connection per relay in use, and reconciles a `welcome` only against that
relay's pairs. Keys and the pair list live in `expo-secure-store` with
`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so they don't move to
another device through a backup. Keys and pairs share that store, so they
survive or vanish together, and `welcome` corrects anything stale. The same
store holds each pair's Mac name, pending pairs (with their 6 digits and
cancelled mark), replaced records (each old pair with the id that replaced it), the queued
unpairs and aborts, and the `hs1` counters, one
per Mac identity key whatever the relay. Snapshots are never
stored (see Snapshots).
`react-native-get-random-values` is imported first in the app's entry file,
before any `@noble` module, so Hermes has `crypto.getRandomValues`.

## The relay

**Storage**, in SQLite on a Fly volume:

| Table | Holds |
|---|---|
| `devices` | identity key, role, first seen, last seen |
| `pairs` | pair id, Mac key, phone key, both static keys, slot, paired at, acked |
| `push_tokens` | phone key, APNs token, environment, updated |

- Slots, the 1-hour record of ended slots, and presence live in memory
  only. `acked` is on disk, so after a restart the relay still re-sends
  un-acked `paired` messages and still holds back pushes for them.
- No frame or pairing content is stored or logged. Logs carry counts and error
  codes.
- Devices unseen for 90 days are deleted, with their pairs and tokens.
- Losing the database means pairing again.
- Backup is Fly's daily volume snapshot.

**Limits.** Piece 4 tightens these.

Frames over their limit get `rate_limited {peer, retry_ms}`, and control
messages over theirs get `control_limited`, so the two are never confused.
A device re-sends any control message named in a `control_limited` after
`retry_ms`, except `push`: a dropped push is not re-sent, because the tab
may no longer need you, and the next needs-you change starts a new timer.
So a Cancel tapped just after the automatic
`pair_status`, or ADE's abort or decline, is delayed by seconds, not lost.
At login a device sends its queued unpairs and aborts at no more than 10
per second, and keeps each queued until it has gone out without a
`control_limited`. `unpair` has no acknowledgement, so one lost on a dying
socket is recovered by the next `welcome`: the relay still lists the pair,
and the device unpairs it again.

| What | Limit |
|---|---|
| Frames | 20/s per device, bursts to 100; 64 KiB each. A refused frame is answered with `rate_limited {peer, retry_ms}`, and the Mac resends its latest snapshot to that peer after `retry_ms` |
| Push | 1 per 30 s per phone; 30 per hour |
| Slots | 30 opened per hour per Mac, one open at a time |
| Control messages | 10/s per device, bursts to 30, and at most one `pair_status` or `pair_abort` per slot per 5 s. Checked before any lookup; excess is dropped unprocessed and answered `control_limited`. The 60 s polls stay far below it |
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
- **Pairing codes from elsewhere.** Nothing authenticates a QR code except
  that the user scanned it from their own Mac's screen. A code from a
  poster, a screenshot or a message pairs the phone with whoever made it,
  under any name it carries, such as the user's own Mac's name. The phone
  then shows that Mac's tabs and pushes, which may be false. In 2a the phone
  can't act, so the harm is false status. 2b must revisit this before the
  phone can act on what a Mac shows. Release builds take codes from the
  in-app scanner only (see the URL scheme under The minimal app).
- **Racers.** Someone who can see each code ADE shows can commit to it
  first and block pairing until the hour's slot limit is spent.
- **A relay restart during pairing** loses the slot. The phone then shows a
  code that can't be used, and the user starts again.
- **Plain-shell tabs.** Titles of tabs with no agent reach the phone too
  (encrypted), and a shell's title can show the current command or host.
- **Ended-slot memory** is bounded per Mac by the slot limit, which new keys
  dodge like the other per-key limits.

## The minimal app

Built with Expo SDK, TypeScript and `expo-router`.

1. **Pair.** Scan the QR code with `expo-camera`, show the 6-digit code, and
   wait for `paired` or `pair_declined`.
   - **The `ade-pair` URL scheme, dev builds only.** Dev builds (the EAS
     development profile) register `ade-pair`, so
     `xcrun simctl openurl booted 'ade-pair://v1?...'` can start pairing on a
     simulator, which has no camera. That is story 12's simulator test path.
     A URL goes through the same parser and screens as a scan; one arriving
     while a pairing is under way is ignored.
   - **Release builds don't register the scheme** and ignore such a URL.
     Any iOS app can claim the same scheme, and iOS doesn't define which one
     gets it, so a URL could hand `s`, the slot and the Mac's keys to another
     app, which could pair its own keys with the Mac. A link from the web,
     Messages or AirDrop could also name any relay and any Mac name. The
     iOS Camera therefore can't open a pairing code in a release build; the
     in-app scanner is the only way in.
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
- ADR 0004 (`.ade/context/decisions/0004-pairing-ends-explicitly.md`): how a
  pairing attempt ends, and when a pending pair may be dropped.

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
  - frames carrying another session's id, which are dropped silently;
  - QR codes and what they parse to, which ADE's QR builder and the app's
    parser both use: `n` with non-ASCII text and reserved characters, over
    40 code points, with control and bidi-override characters, with
    whitespace that the cut leaves at the end, cleaning to empty, Hangul
    fillers, tag characters, invalid UTF-8 (`n=%FF`, a cut-off sequence),
    a malformed `%` escape, and missing;
  - name cleaning, with the same cases, run on the Mac for the phone's name
    (after `H` is checked over the name as sent) and on the phone for `n`;
  - a snapshot plaintext with a tab with no agent and one with an unknown
    state.
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
    in place on both sides after the next login;
  - each reason in its case: `unknown` for a slot never opened, after a
    relay restart and once the 1-hour record lapses; `expired`; `taken`;
    `cancelled`; `declined`; `disconnected`; `unpaired`;
  - only the parties act on a slot, also after it ends: a third device's
    nonce, reveal or confirm gets `pair_refused` `unknown`, and its abort,
    status or decline `pair_state` ended `unknown`, leaving the slot as it
    was; a second phone's commit gets `taken`, and a fresh commit to a
    committed slot that has since expired gets `expired`;
  - a slot committed just before it runs out lasts 300 s from the commit,
    and both sides get that `ttl_s`; its expiry sends `pair_ended` to both
    and refuses a later confirm;
  - either side disconnecting before the reveal ends the slot, a commit while
    the Mac is offline is refused, and a disconnect after the reveal doesn't
    end it (the Mac confirms after reconnecting);
  - ADE closing its view after the reveal declines; ADE reconnecting without
    the reveal aborts the old slot, and the phone learns at once;
  - the phone aborts 30 s after a commit with no `pair_nonce`;
  - a new `slot_open` ends the Mac's previous slot;
  - `pair_abort` and `pair_decline` always get a `pair_state`, including
    when a confirm won (where `paired` or `pair_confirmed` comes first) and
    after a relay restart (pairs table first);
  - a lost `pair_abort` or `pair_decline` is re-sent after the next
    `welcome`, and a cancelled phone whose slot is still open ends it by
    re-sending its abort;
  - a repeated identical `pair_confirm` gets `pair_confirmed` again, also
    after the slot has gone; a refused confirm drops the Mac's pending pair;
  - a pending pair on a live connection is settled by `pair_status`: still
    open, paired (re-sent first), or ended after a relay restart;
  - a `pair_confirm` lost on the Mac's dying socket is re-sent after the
    reconnect and pairs before the slot runs out;
  - a pending pair discarded by hand queues an abort (phone) or an unpair
    (Mac), sent when the relay answers again;
  - a pending pair survives an app relaunch, with its 6 digits;
  - a phone clock stepped forward or back during pairing changes nothing;
  - a cancel before the reveal, and one after it, each tell the Mac and
    leave no pair; a cancel the Mac's confirm beat, and one made offline,
    end in the phone's `unpair`, with no push to that phone before it;
  - a `paired` the phone can't match is not acked, and is unpaired at the
    first `welcome` with no pending pair;
  - pairing again: one acked pair at the relay and on both sides after the
    ack; `pair_replaced` to an online side shows no "no longer paired"; an
    offline side catches up silently through `welcome`; a declined, expired
    or cancelled second attempt, or a new `paired` that fails its checks,
    leaves the old pair working, its session live and nothing shown;
  - a re-pair whose `paired_ack` was lost, after which the new pair is
    unpaired (from the phone's queue, and separately from ADE) before the
    phone logs in: at that login the phone unpairs the old pair and drops
    its record, and no pair remains and no push reaches the phone;
  - a lost `paired_ack`, then ADE discarding the new pending pair: at the
    phone's next login its replaced record is void, the relay still lists
    the old pair, and the phone restores it, with the session live and
    nothing shown;
  - ADE's Unpair of a phone with a pending pair to it discards that pair
    and stops the confirm re-sends;
  - a `push` answered `control_limited` is not re-sent;
  - an `unpair` lost on the socket is sent again at the next `welcome`;
  - ADE's Unpair while it holds two pairs with one phone removes both, and
    the phone's Unpair also removes the ids it recorded as replaced;
  - a pending pair discarded on the phone, then confirmed on the Mac, is
    unpaired as soon as the `paired` arrives;
  - ADE closing its view after the user confirmed sends no decline, and the
    pair completes; closing it before the confirm declines;
  - a phone name with invalid UTF-8 in the reveal still pairs, with `H`
    checked over the raw bytes;
  - a re-pair whose `paired_ack` was lost after the phone dropped the old
    pair: at the next login the re-sent `paired` comes before `welcome`, the
    phone re-acks, the relay sends `pair_replaced`, and the phone never
    unpairs the old pair;
  - `hs1` counters carry over a re-pair, and an `hs1` from before an unpair,
    or recorded on another relay, is refused;
  - one phone paired with two Macs keeps a separate `hs1` counter for each;
  - slots count against the limit when opened, and 30 fit in an hour.
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
  - each limit, including control messages: a `pair_status` flood is
    answered `control_limited` before any lookup; a `pair_abort` sent
    within 5 s of a `pair_status` is re-sent after `retry_ms` and takes
    effect; 40 queued unpairs all reach the relay after a login;
  - no push to a phone that hasn't acked, including after a relay restart;
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
  foreground signal lapses, recovery after the relay restarts, the latest
state arriving after the burst's last frame was rate-limited, a tab with no
agent sent with `null` state and `age_s`, 201 tabs setting `truncated`
with `total` 201 and the least urgent tab dropped, the size limit dropping
tabs in the stated order, and a restarted Mac side whose `seq` starts again
still reaching the phone.
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
  - the tab list rendering each state, no agent and an unknown state, and
    ignoring a stale `seq`;
  - unpair;
  - "Already paired" on a QR code for a Mac it holds;
  - in a dev build, an `ade-pair://` URL starting the same flow as a scan,
    and one arriving mid-pairing ignored;
  - the release app config registering no `ade-pair` scheme, and the
    release link handler ignoring such a URL;
  - a push in the foreground showing no banner;
  - nothing from a snapshot written to storage;
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
