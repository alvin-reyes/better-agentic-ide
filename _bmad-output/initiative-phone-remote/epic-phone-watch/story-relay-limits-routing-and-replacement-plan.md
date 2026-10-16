---
title: 'Relay limits, routing and replacement'
type: 'feature'
ticket: '7b'
created: '2026-10-16'
status: 'draft'
baseline_revision: '' # set when 7b starts, from main after 7a has merged
route: 'full'
route_source: 'auto'
risk: 'high'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - '{project-root}/docs/superpowers/specs/2026-10-14-relay-pairing-design.md'
  - '{project-root}/.ade/context/remote-protocol.md'
  - '{project-root}/.ade/context/relay-storage.md'
  - '{project-root}/_bmad-output/initiative-phone-remote/epic-phone-watch/story-noise-ik-sessions-in-rust-and-typescript-plan.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After 7a, the relay stores devices and pairs, but three things are still missing:
- It enforces none of the spec's limits.
- It forwards nothing between paired devices: not `hs1`, `hs2` or frames, and not `rehandshake`.
- It drops a replaced connection without a close code.

Story 5a needs the limiters and a control seam. Stories 4 and 6 need routing.

**Approach:**
- Pure limiters in `relay-core`, on 7a's `Clock`. The server applies them to every message after login, before any store call.
- Routing over an in-memory peer set, which 5a and cleanup keep current.
- A `ControlHandler` seam for 5a.
- The 4409 and 4429 closes.

## Boundaries & Constraints

**Always:**
- Follow the spec exactly, as amended by the decisions below:
  - the Limits table;
  - "Login and presence" (one live connection per device);
  - "Wire format" (the binary envelope).
- `relay-core` holds the buckets, the windows and admission as pure code. `relay-server` does the I/O. Every limit and the queue size are `Config` fields, with the spec's values as defaults.
- 7a's contract still holds, and so do story 2's tests and owner decisions, except where amended below. Logs and `/metrics` carry counts and codes only.
- This story adds no crate.
- **Decisions (owner, 2026-10-16):**
  - **The split.** Story 7 is split into 7a and 7b. This story keeps story 7's ACs 2–5 and 9, plus the routing AC 10.
  - **New keys.** A new key refused by the per-IP limit closes the connection with 4429 `too_many_new_keys`. This amends story 2's 4401 rule for this case only.
  - **Routing.** 7b routes `hs1`, `hs2` and frames over any stored pair, acked or not. The peer field is rewritten to the sender. A frame for an unpaired or offline key is dropped silently.
  - **Rehandshake.** The `rehandshake` `Control` variant and its routing are 7b's. Story 4's plan records this ruling.
  - **The `rehandshake` shape.** It is `{"v":1,"t":"rehandshake","peer":<32 bytes>}`, where `peer` is the recipient when sent and the sender when delivered. This amends the spec's `rehandshake {}`. The architect amends the spec text and writes ADR 0005; 7b doesn't edit the spec, and records the shape in `remote-protocol.md`.
  - **Its limit.** `rehandshake` counts against the control limit.
  - **`control_limited` gains an optional `peer`.** The field is filled in when the refused message carried one, the same way `slot` and `pair_id` are. This is a spec amendment, which the architect records in ADR 0005 with `rehandshake`. 7b records it in `remote-protocol.md`.
  - **The envelope.** There is one binary envelope type: story 4's `relay_protocol::Routed { kind, peer, body }`, with `parse`, `with_peer` and `encode`. It is the same ruling. 7b never builds a second parser.
  - **If story 4 hasn't merged.** If story 4 hasn't merged when 7b starts, 7b creates `relay/protocol/src/routed.rs` exactly to story 4's definition, and story 4 rebases onto it.
  - **One slot open at a time.** "One open at a time" is 5a's slot machine. Ticket 7b's AC (4) no longer lists it.
  - **Numbering and size.** Ticket 7b keeps story 7's AC numbers, gaps included, and this plan's size is accepted.
  - **Replacement.** A replaced connection is closed with 4409 `replaced`.
  - **Client IP.** `RELAY_CLIENT_IP` is `socket` (the default) or `fly-client-ip`. The second trusts `Fly-Client-IP` and falls back to the socket address. Each IP counts alone, IPv6 included.
  - **Slots.** A refused `slot_open` is answered `control_limited {msg: "slot_open", retry_ms}`. Story 5a sends it.
  - **The peer set.** Routing reads an in-memory peer set.
  - **Size and unreadable input.**
    - A message over 64 KiB is closed with 1009, with no `rate_limited`.
    - A malformed `slot` or `pair_id` counts as absent.
    - An unreadable text head or binary frame is counted and dropped with no answer.
    - The `login` that authenticates a connection isn't counted. A later `login` on the same connection is a control message like any other: it spends a control token, then is ignored.
  - **Tokens and limiters.**
    - A new-key token is spent even when the `register` after it fails.
    - There is no limit before login.
    - The limiters live in memory.
    - Token buckets enforce the per-second limits, and sliding windows the hourly ones.

**Never:**
- None of 5a's work: no slot machine, no pairing, `unpair` or `paired_ack` handling (the default handler ignores them), and no `SlotLimiter` call from a message.
- None of story 10's work: no push limits or push.
- None of story 4's work: no Noise, and no reading of frame bodies.
- No changes to `packages/protocol`, `src/`, `src-tauri/` or `mobile/`.

</frozen-after-approval>

## Code Map

- **`relay/server/src/lib.rs`, after 7a:**
  - `Live` holds a `Sender<Control>` per device, with `QUEUE` at 64.
  - `deliver` drops a device whose queue is full.
  - `connection` ignores every message after login (about line 290), and a read error breaks out with no close.
  - `upgrade` caps a message at 64 KiB.
  - `axum::serve` gets no connect info.
  - 7a's `StoreHandle::call`, `Relay` handle and cleanup tick are here.
- **`relay/protocol/src/routed.rs`** is story 4's. Reuse it. If story 4 hasn't merged when 7b starts, create it exactly to story 4's definition (owner decision above).
- **`relay/protocol/src/lib.rs`** holds `Control` and `KNOWN_TYPES`.
- **`relay/cli/src/lib.rs`, lines 150–158:** `next_event` turns a known `t` that has no event into `Err(Protocol)`.
- **`relay/e2e/tests/e2e.rs`:**
  - `a_new_login_replaces_the_old_connection` (line 407) must also assert 4409.
  - `a_first_frame_over_64_kib_gets_no_welcome` (line 394) must also assert 1009.
- **`relay/e2e/tests/common/mod.rs`** (from 7a) has `CountingStore`, with its fail switch and its gate.
- **`.ade/context/remote-protocol.md`:** "Presence" ("no close code yet") and its queue rule (lines 227–228).
- **`deferred-work.md`:** its last entry, the replaced close, is this story's.
- **Spec:** lines ~152–165 (the envelope), ~229–232 (replacement), ~597–600 (`rehandshake {}`), ~720–742 (the limits) and ~1013–1017 (the tests).

## Tasks & Acceptance

**Execution** (test-first):
- [ ] **`relay/protocol/src/lib.rs`**
  - Add three messages to `KNOWN_TYPES`. An absent option is omitted from the JSON.
    - `RateLimited {peer, retry_ms: u64}`
    - `ControlLimited {msg: String, slot: Option<Bytes<16>>, pair_id: Option<PairId>, peer: Option<DeviceKey>, retry_ms: u64}`. `peer` is given when the refused message carried one, as `slot` and `pair_id` are (owner decision above).
    - `Rehandshake {peer: DeviceKey}` (owner decision above)
  - Add `ControlHead::read(text)`. It reads `v` and `t`, and reads `slot`, `pair_id` and `peer` at best effort, treating a malformed one as absent.
  - Unit tests: a malformed `slot` or `pair_id` is absent, and a `rehandshake` with a malformed `peer` reads with no peer.
- [ ] **`relay/cli/src/lib.rs`**
  - `next_event` yields `Event::RateLimited`, `Event::ControlLimited` and `Event::Rehandshake`.
  - Add `send_rehandshake(peer)`.
  - A test for each.
- [ ] **`relay/core/src/limits.rs`** (new)
  - `TokenBucket`: integer millitokens. `take(now) -> Result<(), retry_ms>` rounds `retry_ms` up. It refills against the latest time it has seen.
  - `HourWindow`: a take at exactly the oldest entry plus the window is allowed.
  - `KeyedLimits<K>`, with `prune(now)`, which removes only entries that are back to full.
  - `Limits`, holding the spec's values.
  - `FrameLimiter` and `ControlLimiter`.
  - `SlotLimiter::try_open(mac, now)`, which counts only an allowed open.
  - `NewKeyLimiter`, keyed by `ip_key(IpAddr)`, which maps an IPv4-mapped IPv6 address to IPv4.
  - Tests: for each limiter, the burst, the exact `retry_ms`, the refill, steady pacing, and a clock that steps back then forward. Also `prune` keeping a part-used entry and dropping a full one, and `ip_key`.
- [ ] **`relay/core/src/control.rs`** (new): `ControlHandler: Send + Sync`. Every method is synchronous. The server calls each one from inside 7a's `StoreHandle::call`, off the async workers and outside the `Live` lock, and passes the relay's store in. The handler holds no store of its own, so its store calls go through `CountingStore` too.
  - `on_login(&dyn Store, &Identity) -> Vec<Control>`, whose messages are sent before `welcome` (5a re-sends `paired` here).
  - `control(&dyn Store, &Identity, &ControlHead, text, now) -> ControlOutcome { out: Vec<Outbound>, refresh: Vec<DeviceKey> }`.
  - `on_leave(&dyn Store, &Identity)`.
  - The default is `IgnoreControl`.
- [ ] **`relay/server/src/lib.rs`**
  - **`Config`.** Add `limits`, `client_ip`, `control` and `queue` (default 192). Also add a writer gate used only by tests (`Config::writer_gate`, open by default). The writer waits on the gate before it takes anything off the queue, so a closed gate leaves exactly `queue` items of room.
  - **Connections and queue.**
    - Connect info comes from `into_make_service_with_connect_info`.
    - A queue item is `Outgoing::{Text(Control), Binary(Vec<u8>), Close(u16, &'static str)}`.
    - When a queue is full, a `Binary` item is dropped and counted, while a `Text` or `Close` item drops the device, as story 2 does.
  - **The peer set.** `Live` holds one peer-set entry per device, `{ conn: ConnId, set: Option<Vec<PairInfo>>, generation: u64 }`.
    - **Generations.** Every generation comes from one relay-wide counter that only rises and is never reset, so an old generation can never match a new entry.
    - **Login.** Under the `Live` lock, in the same step that installs the sender and the `Leave` guard, the login creates the entry, or replaces the old connection's entry. The new entry has the new `ConnId`, a fresh generation and `set: None`, so the device routes nothing yet. Only then is `peers_of` read.
    - **Refresh.** For each key in `ControlOutcome.refresh`, the entry gets a fresh generation and its set is re-read. A key with no entry is skipped.
    - **Cleanup.** Every set has the pairs in `CleanupCounts.deleted_pairs` (7a) stripped. The strip goes by pair id, not by key, so a pair made after the key was re-registered survives. Each affected entry, pending ones included, gets a fresh generation.
    - **Installing a read.** A read is installed only if the entry still has the same `ConnId` and generation as when the read started. Otherwise:
      - after a refresh, the read is dropped, because the refresh owes a newer read;
      - after a cleanup strip, a pending login read is read again, at most once per strip, and the cleanup tick bounds how often that happens;
      - after a replacement, the read is dropped.
    - **Leave.** The entry is removed only if its `ConnId` matches the leaving connection, so a late leave after a replacement leaves the new entry alone. Leave still asks `peers_of` for the fan-out.
    - **Pending devices.** Peers may route to a device whose own entry is still pending once presence shows it online. Its `welcome` is always queued before any frame.

    An older read can therefore never overwrite a newer change.
  - **Login.**
    - A new key takes a token from `NewKeyLimiter` before `register`. A refusal closes the connection with 4429.
    - Then `on_login`, then `welcome`.
    - A replaced connection is sent `Close(4409, "replaced")`. When its queue is full, it is simply dropped.
  - **A text message after login.**
    1. Take a token from `ControlLimiter`. This comes before reading the head and before any store call.
    2. If refused, answer `control_limited`, or drop the message if its head can't be read.
    3. Otherwise:
       - A later `login` is ignored, with no answer, and counts in `relay_ignored_total`.
       - A `rehandshake` is routed over the peer set like a frame. It spends only the control token, not a frame token. It counts in `relay_rehandshakes_routed_total` or `relay_rehandshakes_dropped_total`. One whose `peer` is missing or malformed is dropped as unreadable.
       - Anything else goes to `control`.
  - **A binary message.**
    1. Take a token from `FrameLimiter`. Every binary message spends one, even an unparseable one.
    2. Read it with `Routed::parse`.
    3. If refused, answer `rate_limited`.
    4. If not, route it over the peer set to an online peer.
    5. Otherwise, drop it.
  - **Over 64 KiB.** The WebSocket limit is 128 KiB. A WebSocket message whose whole size, the 33-byte `Routed` header included, is over 65,536 bytes is closed with 1009, before login too.
  - **The cleanup tick** also prunes the limiters.
  - **Metrics.** Add these counters:
    - `relay_rate_limited_total`
    - `relay_control_limited_total`
    - `relay_new_keys_refused_total`
    - `relay_replaced_total`
    - `relay_frames_routed_total`
    - `relay_frames_dropped_total`
    - `relay_rehandshakes_routed_total`
    - `relay_rehandshakes_dropped_total`
    - `relay_unreadable_total`
    - `relay_ignored_total`
- [ ] **`relay/server/src/main.rs`**: `RELAY_CLIENT_IP` takes `socket` or `fly-client-ip`. Any other value exits 2. Add tests.
- [ ] **`relay/e2e/tests/e2e.rs`**: the replacement test asserts 4409 `replaced`, and the over-64-KiB first-frame test asserts 1009.
- [ ] **`relay/e2e/tests/limits_and_routing.rs`** (new): the AC tests and the contract tests.
  - Inject `ManualClock`, `CountingStore`, a counting `ControlHandler` and the writer gate.
  - 7b adds `hold_nth(method, n) -> Held` to 7a's `relay/e2e/tests/common/mod.rs`. It holds exactly that one call, lets every other call through, and offers `held.started().await` and `held.release()`.
  - A test waits for each dispatch before it advances the clock.
  - "Not received" is shown with a sentinel: a routed message sent afterwards must be the next one to arrive.
- [ ] **7a's `relay/e2e/tests/storage.rs`**: the canary test also sends:
  - routed, dropped and limited frames;
  - limited control messages;
  - a `rehandshake`.
- [ ] **`.ade/context/remote-protocol.md` and `relay-storage.md`**: record each of these:
  - the new messages, `ControlHead`, and the `Routed` use and its rule;
  - the `rehandshake {peer}` shape, as the owner's 2026-10-16 amendment of the spec's `rehandshake {}`, with a pointer to ADR 0005 (the architect writes it);
  - each limit and how its refusal is signalled;
  - 4409, 4429 and 1009;
  - the queue rule for each kind;
  - `RELAY_CLIENT_IP`;
  - `ControlHandler`, the limiter API, and the peer-set refresh.
- [ ] **`deferred-work.md`**: remove the replaced-close entry.

**Acceptance Criteria** (ticket 7b, AC numbers as in ticket 7):
1. **Frames (ticket AC 2).**
   - Given a paired, online Mac and phone, and a frozen clock.
   - When the Mac sends 101 frames.
   - Then the phone gets 100, and the 101st is answered `rate_limited {peer: phone, retry_ms: 50}` with no store call.
   - After 50 ms, a frame passes again.
   - A 64 KiB frame is routed, and a 64 KiB + 1 frame is closed 1009.
   - Tests: `frames_are_limited_per_device`, `a_frame_over_64_kib_is_closed_1009`.
2. **Control messages (ticket AC 3).**
   - With a frozen clock, 100 `pair_status {slot}` give 30 handled and 70 `control_limited {msg: "pair_status", slot, retry_ms: 100}`.
   - Each answer carries its message's slot.
   - The 70 refused messages make no store call.
   - Test: `a_pair_status_flood_is_control_limited_before_any_lookup`.
3. **Slots (ticket AC 4).**
   - 30 opens in an hour are allowed. The 31st is refused, with `retry_ms` until the first leaves the window.
   - A refused open isn't counted, and a second Mac is unaffected.
   - Test (core): `thirty_slots_fit_in_an_hour_and_the_31st_is_refused`.
4. **New keys and replacement (ticket AC 5).**
   - **Per-IP limit.**
     - In `fly-client-ip` mode, 21 new keys from one header IP give 20 `welcome`s and one 4429.
     - A known key from that IP still logs in.
     - A second header IP has its own budget.
     - In `socket` mode, keys sent with varying forged headers share the one budget of 127.0.0.1.
   - **Replacement.** A second login of an online device closes the old socket with 4409 `replaced`, and its peers see it go offline, then online.
   - Tests: `new_keys_are_limited_per_ip`, `the_client_ip_comes_from_the_configured_source`, `a_new_login_replaces_the_old_connection`.
5. **Queued unpairs (ticket AC 9).**
   - 40 `unpair {pair_id}` sent at 100 ms clock steps are all handled, and none is limited.
   - 40 sent at once give 30 handled and 10 `control_limited`, each echoing its `pair_id`.
   - Test: `forty_queued_unpairs_at_ten_per_second_all_reach_the_relay`.
6. **Routing (ticket AC 10).**
   - Given a paired, online Mac and phone, and an unpaired third key.
   - `hs1`, `hs2`, a frame and `rehandshake {peer}` each reach the peer, with the sender as `peer`.
   - Sent to the third key, or to an offline peer, the same messages are dropped. The sentinel arrives next.
   - Test: `routing_reaches_only_paired_online_peers`.

**Contract tests:**

| Test | What it shows |
|---|---|
| `limits_survive_a_reconnect` | The limits still apply after the device reconnects |
| `a_full_queue_drops_frames_not_the_device` | The test waits until the recipient has its `welcome` and presence, then closes the writer gate, so no text item is queued. With `queue: 4`, the fifth frame is dropped and counted, and the device stays online. A full queue on a text message drops the device |
| `a_stale_peer_read_is_never_installed` | Each case holds one `peers_of` call with `hold_nth` and waits until it has started. It then runs the competing change to completion, waiting on `CountingStore`'s counts, releases the held call, and sends a frame to the removed key, then a sentinel. The frame must be dropped. Each case fails if the generation check is removed. The cases: (1) a login's read, while the handler deletes that pair and returns the key in `refresh`; (2) an older refresh read, while a newer refresh after an unpair completes; (3) a login's read, while cleanup deletes one of its peers |
| `a_late_leave_after_replacement_keeps_routing` | Hold the old connection's leave with `hold_nth(peers_of)`, replace the connection, then release. The new connection's frames still route |
| `a_late_strip_keeps_a_newer_pair` | A stale phone is deleted by cleanup with the strip held. The phone re-registers and gets a new pair (handler and `refresh`). The strip is released, and frames over the new pair still route |
| `rehandshake_counts_against_the_control_limit` | With a frozen clock, 30 control messages are handled. The 31st, a `rehandshake`, gets `control_limited {msg: "rehandshake", peer}` and doesn't reach the peer (sentinel). No frame token is spent |
| `there_is_no_limit_before_login` | 50 connections from one IP, none logging in, each get a `challenge` |
| `a_pair_routes_after_refresh` | A pair stored after login drops frames until the handler returns it in `refresh`. After that, they route |
| `cleanup_strips_deleted_keys_from_peer_sets` | A stale phone is deleted while its Mac is online. The phone logs in again as a new device, and the Mac's frame to it is dropped |
| `routing_survives_a_held_store_lock` | With the `CountingStore` gate held and a third login waiting on it, frames between two online devices still route |
| `on_login_messages_come_before_welcome_and_on_leave_runs_once` | The `on_login` messages arrive before `welcome`, and `on_leave` runs once |
| `unreadable_messages_are_counted_and_unanswered` | An unreadable text or binary message gets no answer, `relay_unreadable_total` rises, and a bad binary frame still spends a frame token |
| `a_new_key_token_is_spent_when_register_fails` | With `CountingStore` failing `register`, the next new key from that IP finds the budget one lower |
| `a_login_after_login_is_ignored_and_counted` | A second `login` gets no answer, and `relay_ignored_total` is 1. With a frozen clock, 29 handled messages, then a `login`, then one more control message: that last message gets `control_limited`, which proves the `login` spent a token |

## Design Notes

**The numbers under a frozen clock.** Tokens are counted in millitokens: one token is 1000.
- A frame token refills in 1000 / 20 = 50 ms, and a control token in 1000 / 10 = 100 ms.
- So 101 frames give 100 passed and 1 refused.
- 100 control messages give 30 passed and 70 refused.
- 40 control messages give 30 passed and 10 refused.

**No store calls on a hot path.** Limits are checked before any store call. Routing reads memory. The store runs off the async workers (7a). A held store lock therefore stalls neither routing nor pings for other devices, as `routing_survives_a_held_store_lock` proves. The one accepted exception is a device whose own control message is waiting on the store. Each connection is one sequential loop, so that device's later frames wait behind its message.

**Peer sets stay true.** Three things change them:
- the load at login;
- the handler's `refresh`;
- cleanup's `deleted_pairs`.

Each entry carries its `ConnId` and a generation from one relay-wide counter that only rises. A read is installed only if both still match. Removal is guarded by `ConnId`, and strips go by pair id. So no older read, late leave or late strip can undo a newer change. `a_stale_peer_read_is_never_installed`, `a_late_leave_after_replacement_keeps_routing` and `a_late_strip_keeps_a_newer_pair` prove it.


## Plan Change Log

- **2026-10-16, split.** Split from story 7 by the owner. The first review's fixes are kept:
  - M1: queue 192;
  - M2: the in-memory peer set;
  - M3: `CountingStore`;
  - M6: the 1009 rule;
  - M7: the 4429 amendment;
  - M8: the IP and reconnect tests;
  - M9: the handler contract.
- **2026-10-16, second review (7b BLOCK).**
  - **Major 1.** The claim is now backed by `routing_survives_a_held_store_lock`. The store runs off the async workers (7a).
  - **Major 2.** Added `ControlOutcome.refresh`, `on_login` and `on_leave`, with tests.
  - **Major 3.** Cleanup's `deleted` strips peer sets, with a test.
  - **Major 4.** The overflow rule is stated for each kind. Added the queue `Config` and the writer gate, the test, and the contract entry.
  - **Major 5.** Added a test for each untested decision.
  - **Minor 3.** Recorded the `rehandshake` and `Routed` ruling, and added story 4's path.
  - **Minor 4.** "One open at a time" is now an owner decision, and the ticket is amended.
- **2026-10-16, owner's final rulings.** The four 7b questions are settled and recorded in Boundaries: the `rehandshake` shape, the `routed.rs` fallback, the one-open rule as 5a's, and `rehandshake` counting against the control limit. The numbering and the plan size are accepted.
- **2026-10-16, third review (7b: BLOCK).**
  - **Major A.** Peer-set entries now carry a generation, with pending entries at login, so a stale read is never installed. Test: `a_stale_peer_read_is_never_installed`.
  - **Major B.**
    - The `rehandshake` limit is tested.
    - The `login` rule is reconciled: the authenticating `login` is free, and a later one spends a token and is ignored, counted in `relay_ignored_total`.
    - The "no limit before login" decision is tested.
    - `rehandshake` routing is specified: it spends only a control token, it has its own counters, and a malformed `peer` is unreadable.
    - The missing `peer` in `control_limited` went to the owner as a question. The owner added it (2026-10-16), and it is recorded in Boundaries.
  - **Minors.**
    - The writer gate sits before the dequeue, and the full-queue test waits for presence first.
    - The handler gets the relay's store through `StoreHandle`.
    - The no-stall claim is narrowed to other devices.
    - 64 KiB is the whole WebSocket message.
- **2026-10-16, owner ruling.** `control_limited` gains an optional `peer`. Recorded in Boundaries.
- **2026-10-16, fourth review (7b: BLOCK, no owner ruling needed).**
  - **Major 1.** Added `hold_nth` to the 7a helper, so each race is held one call at a time and runs deterministically. Each case fails without the generation check.
  - **Major 2.** The peer-set entry now has a set lifecycle:
    - it carries its `ConnId`;
    - generations come from one relay-wide counter that only rises;
    - a read is installed only when the `ConnId` and the generation both still match;
    - it is removed only by a leave with the matching `ConnId`;
    - it is created under the leave guard's lock;
    - a refresh for a key with no entry is a no-op.

    New test: `a_late_leave_after_replacement_keeps_routing`.
  - **Minors.**
    - Strips go by pair id, using 7a's new `deleted_pairs`, with the test `a_late_strip_keeps_a_newer_pair`.
    - Who re-reads and how often is now bounded.
    - The login-token test now proves the token is spent.
    - Routing to a pending device is stated.
  - **Minors 5–9.** Covered by: the AC labels, the CLI events, the sentinel, header-based IPs, and the rule that every binary message spends a token while a second login is ignored.
  - **Minor 13.** The purity check.

## Verification

**Commands** (the five approved lines):
- `cd relay && cargo test`: passes, and names each AC test and contract test.
- `npx tsc --noEmit`, `npm test`, `cd src-tauri && cargo test` and `cd mobile && npx tsc --noEmit && npx jest`: each passes, unchanged.

**Manual checks:**
- `git diff --stat main` shows only `relay/`, `.ade/context/` and this initiative's `_bmad-output` files.
- `cargo tree -p relay-core -e normal` shows no `rusqlite`, `tokio` or `axum`.
- `relay/protocol/src/` has one envelope parser.
