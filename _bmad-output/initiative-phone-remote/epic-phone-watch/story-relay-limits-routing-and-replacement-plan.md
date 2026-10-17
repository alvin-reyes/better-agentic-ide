---
title: 'Relay limits, routing and replacement'
type: 'feature'
ticket: '7b'
created: '2026-10-16'
status: 'ready-for-dev'
baseline_revision: '0b8e9fd' # set when 7b started, from origin/main after 7a had merged
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
  - '{project-root}/.ade/context/decisions/0005-sessions-are-noise-ik-relayed-as-opaque-envelopes.md'
  - '{project-root}/.ade/context/decisions/0006-one-task-owns-the-relays-peer-sets.md'
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
- Routing over in-memory peer sets, owned by one task (ADR 0006). 5a keeps them current through `refresh`.
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
- **Precondition:** 7b starts only once ADR 0005 has been written. The ADR records the `rehandshake {peer}` and `control_limited {…, peer}` amendments. (Written 2026-10-16.)
- **Peer sets follow ADR 0006** (one task owns them, and routing needs both ends to agree). 7b starts only once the owner has accepted that ADR. (Accepted 2026-10-16.)
- **Decisions (owner, 2026-10-16):**
  - **The split.** Story 7 is split into 7a and 7b. This story keeps story 7's ACs 2–5 and 9, plus the routing AC 10.
  - **New keys.** A new key refused by the per-IP limit closes the connection with 4429 `too_many_new_keys`. This amends story 2's 4401 rule for this case only.
  - **Routing.** 7b routes `hs1`, `hs2` and frames over any stored pair, acked or not. The peer field is rewritten to the sender. A frame for an unpaired or offline key is dropped silently.
  - **Rehandshake.** The `rehandshake` `Control` variant and its routing are 7b's. Story 4's plan records this ruling.
  - **The `rehandshake` shape.** It is `{"v":1,"t":"rehandshake","peer":<32 bytes>}`, where `peer` is the recipient when sent and the sender when delivered. This amends the spec's `rehandshake {}`. The architect amends the spec text and writes ADR 0005; 7b doesn't edit the spec, and records the shape in `remote-protocol.md`.
  - **Its limit.** `rehandshake` counts against the control limit.
  - **A refused `rehandshake` is not re-sent.** When a `rehandshake` is answered `control_limited`, the device doesn't re-send it, because the Mac's session machine asks again at its next trigger. This is an exception to the spec's general re-send rule, and it is recorded in the spec and in ADR 0005. The relay's behaviour doesn't depend on it, but 7b's contract text says so.
  - **ADR 0006 is accepted.** 7b's precondition is met. Two edits inside this frozen block are approved: the Approach line naming the peer task, and the Always bullet tying peer sets to ADR 0006.
  - **Only a current connection's leave ends a Mac's pairing slot.** That rule is 5a's, recorded in `deferred-work.md` on the ADR branch. 7b provides `on_leave(…, current: bool)` and builds nothing more.
  - **The per-key login limit is deferred**, also in `deferred-work.md`. 7b doesn't change.
  - **The plan is approved** (2026-10-16), and the paper-review loop is stopped. There is no further plan review.
  - **Mutation checks at build time.** The build must show every one of these tests failing when its rule is removed:
    - writers' rules 1–4, including the leave half of rule 3;
    - the `Refresh` failure rule;
    - handler messages being delivered inside the `Refresh` step;
    - the writer waiting for its `Refresh`;
    - `on_leave(current)`.

    The developer records each mutant, and the test that kills it, in the Implementation Notes. The code review checks this.
  - **`on_leave` runs under `catch_unwind`.** A handler panic at leave counts as an `on_leave` failure, not as a failed store call. `peers_of` still runs, and peers are still told the device is offline. This is ADR 0006 as amended on `phone-adrs-sessions-routing`.
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
  - `connection` reads `device`, `register` and then `peers_of` through `StoreHandle::call`, and installs the sender, `welcome` and presence in one `Live` lock step. It ignores every message after login (about line 606), and a read error breaks out with no close.
  - At 7e391f6, `Leave::drop` removes the sender synchronously, then spawns a task that reads `peers_of`, fans out presence, and only then writes `touch`. A failed `touch` is only logged. 7b replaces that task with a `Leave` request to the peer task, keeping the same order: `on_leave` and `peers_of`, then the fan-out, then `touch`.
  - `upgrade` caps a message at 64 KiB.
  - `axum::serve` gets no connect info.
  - 7a's `StoreHandle::call`, its `Relay` handle (`run_cleanup`, `shutdown`, `abort`, `wait`), its `Tracker`/`Busy` and its cleanup tick are here. 7b does not change cleanup.
- **`relay/protocol/src/routed.rs`** is story 4's. Reuse it. If story 4 hasn't merged when 7b starts, create it exactly to story 4's definition (owner decision above).
- **`relay/protocol/src/lib.rs`** holds `Control` and `KNOWN_TYPES`.
- **`relay/cli/src/lib.rs`, lines 150–158:** `next_event` turns a known `t` that has no event into `Err(Protocol)`.
- **`relay/e2e/tests/e2e.rs`:**
  - `a_new_login_replaces_the_old_connection` (line 407) must also assert 4409.
  - `a_first_frame_over_64_kib_gets_no_welcome` (line 394) must also assert 1009.
- **`relay/e2e/tests/common/mod.rs`** (from 7a) has `CountingStore`, with its fail switch and its gate.
- **`.ade/context/remote-protocol.md`:** "Presence" ("no close code yet") and its queue rule (lines 227–228).
- **`.ade/context/decisions/0006-one-task-owns-the-relays-peer-sets.md`** is the design this plan builds. Its correctness argument, store-error rules and liveness rules are the reference.
- **`deferred-work.md`:** its last entry, the replaced close, is this story's.
- **Spec:** lines ~152–165 (the envelope), ~229–232 (replacement), ~597–610 (`rehandshake {peer}`), ~730–752 (the limits) and ~1023–1027 (the tests).

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
  - `on_login(&dyn Store, &Identity) -> Vec<Control>`, whose messages are sent before `welcome` (5a re-sends `paired` here). It writes no pairs.
  - `control(&dyn Store, &Identity, &ControlHead, text, now) -> ControlOutcome { out: Vec<Outbound>, refresh: Vec<DeviceKey> }`.
    - **The writers' rule (ADR 0006).** A handler call writes only pairs that include the sender's key. A call that adds or removes a pair returns both of that pair's keys in `refresh`. The doc comment says so, and `relay-storage.md` records it for 5a.
  - `on_leave(&dyn Store, &Identity, current: bool) -> ControlOutcome`. It runs once for each connection the peer task joined, a replaced one included (`current: false`), inside that connection's `Leave` step. Its `out` is delivered, and its `refresh` installed, in that step.
  - The default is `IgnoreControl`.
- [ ] **`relay/server/src/peers.rs`** (new): **the peer task** (ADR 0006).
  - **What it owns.** A single tokio task, spawned by `serve`. It alone writes each device's peer set (`Live.peers`), its presence and its sender in `Live`. The one exception is 7a's `deliver`, which still removes a sender whose queue is full; senders are keyed by `ConnId`, so this is harmless. The task also keeps the set of `ConnId`s it has joined, and a test-only count of the requests it has received (`#[doc(hidden)] Relay::peer_requests_received()`).
  - **How requests arrive.** They come on one unbounded channel and are handled one at a time, in arrival order. Each request's store work runs inside its own step, through `StoreHandle::call`.
  - **The entry** is `Live.peers: HashMap<DeviceKey, Entry { conn: ConnId, set: Option<Vec<PairInfo>> }>`. `None` means the entry is closing after a failed read, and it routes nothing. An entry exists only once its set has been installed, so there is no pending state.
  - **`Join { who, conn, tx, on_login, reply }`** works like this:
    1. Read `peers_of(who)`.
    2. On an error, reply `Err`. The connection then closes with 1011, and nothing is installed (7a's rule).
    3. Otherwise, in one `Live` lock step:
       - if an older connection is current, queue it `Close(4409, "replaced")`, then remove its sender (a full queue just loses the close);
       - install the new sender;
       - queue the `on_login` messages, then `welcome`, built from this read;
       - join presence and fan it out, so peers see `offline` then `online` on a replacement;
       - install the entry, and record `conn` as joined.
    4. Reply `Ok`.
  - **`Refresh { keys, out, reply }`** works like this:
    1. Make one store call that reads `peers_of` for every key that has an entry (ADR 0006's wording).
    2. In one lock step, install every set, then deliver `out` (the handler's messages), then reply. So a peer told about a change, for example by `paired`, can already route over it.
    3. Any read error, for any key, fails the whole `Refresh`. Every device in it is then queued `Close(STORE_ERROR_CODE, STORE_ERROR_REASON)` (7a's 1011 constants), has its set set to `None` and has its sender removed, all in the same step. `out` is still delivered, except any message meant for a device this step has just closed: that message is dropped. Then the step replies.
  - **`Leave { id, conn, busy }`**, exactly as ADR 0006 (at 4fd51a3) orders it:
    - **Sending it.** `Leave::drop` sends it on an unbounded channel, which needs no await. Nothing is sent after `abort()`.
    - **The sender.** `Leave::drop` removes the leaving connection's sender itself, synchronously, as 7a built it. The ADR records this, like 7a's `deliver`, as an exception to "only the peer task writes": it removes a sender, never a set.
    - **A connection the task never joined.** The step does nothing.
    - **A joined connection:**
      1. One store call runs `on_leave(…, current)`, then `peers_of(id)` for the fan-out. Each result is kept separately, so an `Err` from `on_leave` doesn't stop `peers_of`. `on_leave` runs under `catch_unwind` inside that call (owner decision, ADR 0006). A handler panic is therefore an `on_leave` failure like an `Err`: `peers_of` still runs, and the offline fan-out still happens. Only a failure of the store call itself, or of `peers_of`, skips the fan-out.
      2. A second store call, in the same step, runs if `on_leave` returned `refresh` keys, or if rule 3's leave half applies. It reads those keys. A failure closes those devices as in `Refresh`.
         - **Writers' rule 3, leave half (ADR 0006).** If `on_leave` fails, and another connection of that key is current (only a replaced leave, `current: false`), this second call re-reads the current connection's set. If that read fails, the current connection is closed with 1011. For a current leave nothing more is needed: the entry is removed below, and the device's next login reads its set afresh.
      3. One lock step:
         - clears presence and fans it out (skipped only if `peers_of` failed, 7a's rule);
         - installs the refreshed sets;
         - delivers `on_leave`'s `out`;
         - removes the entry if `conn` is still current;
         - forgets `conn`.
      4. Last, a separate store call writes 7a's `touch`. Presence never waits on it, and its failure is only logged. A failed `touch` never suppresses the fan-out (owner ruling, 2026-10-16).
    - **`busy`.** It is 7a's `Busy`, held until step 4 ends, so `shutdown` waits for the leave's `touch`.
    - **7a's tests still hold.** `a_leave_tells_peers_before_its_touch_write` and `a_failed_touch_at_leave_still_tells_peers` (in `relay/e2e/tests/storage.rs`, 7a at 7e391f6) must keep passing unchanged.
  - **The connection's side.** The `Leave` guard is created before `Join` is sent, so a connection's `Leave` is always queued after its `Join`. The connection's loop starts only after the `Join` reply.
  - **Stopping.**
    - After `abort()`, the task does nothing more.
    - `shutdown` waits for the tracker to go idle, then stops the task, then drops the store.
    - If the task ends while the relay runs, `Relay::wait` returns an error, and a request sent to it closes its connection with 1011.
- [ ] **`relay/server/src/lib.rs`**
  - **`Config`.** Add `limits`, `client_ip`, `control` and `queue` (default 192). Also add a writer gate used only by tests (`Config::writer_gate`, open by default). The writer waits on the gate before it takes anything off the queue, so a closed gate leaves exactly `queue` items of room.
  - **Connections and queue.**
    - Connect info comes from `into_make_service_with_connect_info`.
    - A queue item is `Outgoing::{Text(Control), Binary(Vec<u8>), Close(u16, &'static str)}`.
    - When a queue is full, a `Binary` item is dropped and counted, while a `Text` or `Close` item drops the device, as story 2 does.
  - **Routing (ADR 0006).** `Live::route(from, from_conn, to)` runs under `Live`'s `std::sync::Mutex`, with no await and no store call. It returns `to`'s sender only if all of these hold:
    - `from`'s current entry has `from_conn`;
    - both entries have a set;
    - `from`'s set names `to`;
    - `to`'s set names `from`;
    - `to` has a sender.

    Routing never waits on the peer task or the store.
  - **Login.**
    - A new key takes a token from `NewKeyLimiter` before `register`. A refusal closes the connection with 4429.
    - After `register`, `on_login` runs through `StoreHandle::call`, outside the `Live` lock. Then the connection creates its `Leave` guard, sends `Join` and awaits the reply.
    - The device's queue therefore holds the `on_login` messages, then `welcome`, then any presence or frame. Peers see it online at the moment it becomes a routing target.
  - **A text message after login.**
    1. Take a token from `ControlLimiter`. This comes before reading the head and before any store call.
    2. If refused, answer `control_limited`, or drop the message if its head can't be read.
    3. Otherwise:
       - A later `login` is ignored, with no answer, and counts in `relay_ignored_total`.
       - A `rehandshake` is routed by `Live::route`, like a frame. It spends only the control token, not a frame token. It counts in `relay_rehandshakes_routed_total` or `relay_rehandshakes_dropped_total`. One whose `peer` is missing or malformed is dropped as unreadable.
       - Anything else goes to `control`. What happens next depends on the result:
         - **`refresh` is empty:** its `out` is delivered at once.
         - **`refresh` is not empty:** the loop sends `Refresh { keys, out }` and awaits the reply before it takes its next message. So a round trip shows the refresh is installed, and `out` is delivered only after it.
         - **`control` returns `Err`** (a store error, or a panic reported as `Failed("store_task")`): the loop sends `Refresh [sender]`, awaits it, then closes with 1011 (ADR 0006, writers' rule 3).
       - The `control` call and its `Refresh` run in the body of the loop's `select!` arm, never as a branch, so only the relay stopping can cancel them between a commit and its `Refresh`.
  - **A binary message.**
    1. Take a token from `FrameLimiter`. Every binary message spends one, even an unparseable one.
    2. Read it with `Routed::parse`.
    3. If refused, answer `rate_limited`.
    4. If not, route it with `Live::route`, rewriting `peer` with `with_peer`.
    5. Otherwise, drop it.
  - **Over 64 KiB.** The WebSocket limit is 128 KiB. A WebSocket message whose whole size, the 33-byte `Routed` header included, is over 65,536 bytes is closed with 1009, before login too.
  - **The cleanup tick** also prunes the limiters. 7b adds nothing else to cleanup: no strip, no peer-task request (ADR 0006).
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
    - The counting handler counts its calls. On test-only message types it inserts or deletes a pair and returns a chosen `refresh` list.
  - 7b adds `fail_nth(method, n)` to 7a's `relay/e2e/tests/common/mod.rs`. It fails only the nth call to that method, so later calls (for example the leaves after a failed refresh) succeed.
  - 7b also adds `hold_nth(method, n) -> Held` to the same file. It holds the nth call to that method and lets every other call through. For the held call it:
    1. runs the inner call, so the database has been read or written;
    2. keeps the result;
    3. signals `held.started()`;
    4. blocks until `held.release()`;
    5. returns the kept result.

    `Held` also releases on `Drop`, so a test that panics before `release()` fails rather than hangs. A held `peers_of` inside a peer-task step holds up the whole task, which is how the order tests make a change queue behind a read.
  - A test waits for each dispatch before it advances the clock.
  - "Not received" is shown with a sentinel: a routed message sent afterwards must be the next one to arrive.
- [ ] **7a's `relay/e2e/tests/storage.rs`**: the canary test also sends:
  - routed, dropped and limited frames;
  - limited control messages;
  - a `rehandshake`.
- [ ] **`.ade/context/remote-protocol.md` and `relay-storage.md`**: record each of these:
  - the new messages, `ControlHead`, and the `Routed` use and its rule;
  - the `rehandshake {peer}` shape, as the owner's 2026-10-16 amendment of the spec's `rehandshake {}`, with a pointer to ADR 0005;
  - that a `rehandshake` answered `control_limited` is not re-sent: the Mac asks again at its next trigger. This is the one exception to "re-send after `retry_ms`", besides `push`;
  - that `on_leave`'s `current` flag exists so that 5a can end a Mac's pairing slot only on a current connection's leave. The rule itself is 5a's (`deferred-work.md`);
  - each limit and how its refusal is signalled;
  - 4409, 4429 and 1009;
  - the queue rule for each kind;
  - `RELAY_CLIENT_IP`;
  - `ControlHandler`, the limiter API, the peer task, the two-sided routing check and the writers' rule, with a pointer to ADR 0006;
  - in `relay-storage.md`, correct "Story 7b strips its in-memory peer sets by these pair ids" to say that 7b doesn't use `deleted_pairs` (ADR 0006).
- [ ] **Close 7a's deferred test gap** (`relay/e2e/tests/storage.rs` and `relay/e2e/tests/common/mod.rs`, from `deferred-work.md`):
  - Make `a_call_waiting_during_cleanup_gets_in_between_batches` also guard the `hand_over()` inside the batch loop. The probe call queues only after batch 1 has committed, either from a helper thread once `batches >= 1` or through a test-only park hook. The test asserts the probe gets in by batch 2.
  - Pin the order in `StoreHandle::call`, where `drop(store)` comes before `drop(busy)`, with a test that fails if the two are swapped.
  - Show mutant D (the in-loop `hand_over()` removed) killed, and record it with the mutants below.
- [ ] **Mutation checks** (owner decision). For each rule below, remove the rule in a scratch build, run `cd relay && cargo test`, and record in the Implementation Notes the mutant (what was removed) and the test that fails. Restore the code afterwards. The rules:
  - writers' rules 1–4, including the leave half of rule 3;
  - the `Refresh` failure rule;
  - handler messages delivered inside the `Refresh` step;
  - the writer waiting for its `Refresh`;
  - `on_leave(current)`, and `on_leave` under `catch_unwind`.

  A mutant that survives means a test is missing, and the story isn't done.
- [ ] **`deferred-work.md`**: remove the replaced-close entry, and the 7a test-gap entry once that task is done.

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
   - `hs1`, `hs2`, a frame and `rehandshake {peer}` each reach the peer, with the sender as `peer`. This is checked over an acked pair, and again over an un-acked one: the owner's ruling is "acked or not".
   - Sent to the third key, or to an offline peer, the same messages are dropped. The sentinel arrives next.
   - Test: `routing_reaches_only_paired_online_peers`.

**Contract tests:**

| Test | What it shows |
|---|---|
| `limits_survive_a_reconnect` | The limits still apply after the device reconnects |
| `a_full_queue_drops_frames_not_the_device` | The test waits until the recipient has its `welcome` and presence, then closes the writer gate, so no text item is queued. With `queue: 4`, the fifth frame is dropped and counted, and the device stays online. A full queue on a text message drops the device |
| `a_change_made_during_a_held_read_wins` | A pair change whose store write lands while a peer-task read is held is installed after that read, never under it. The cases are listed after the table. Each case fails if a read is installed outside the peer task's order |
| `routing_needs_both_sets_to_name_the_pair` | M and P are paired and online. The handler deletes M–P and returns `refresh [P]` only, so M's set still names P. A frame and a `rehandshake` from M to P, and from P to M, are each dropped (sentinel). This fails without the two-sided check |
| `a_key_deleted_by_cleanup_is_unreachable_when_it_returns` | Mac M is online and paired with stale phone P, which is offline. `run_cleanup()` deletes P. P logs in again as a new key. M's frame to P is dropped (sentinel). A second case holds M's `Join` read (`hold_nth`) across the cleanup and P's return, then releases it, with the same result. This fails without the two-sided check. 7b strips nothing on cleanup |
| `a_late_leave_after_replacement_keeps_routing` | A device is replaced. The old connection's `Leave` step runs after the new `welcome`: the `touch` count and the handler's `on_leave` count each rise by one. Peers get no `offline` after the replacement's `online`, and the new connection's frames route |
| `a_failed_peer_read_closes_1011` | A third device Q is paired with both M and P. Arm `fail_nth(peers_of, n)` for only the `Refresh` that follows P's unpair (`refresh [M, P]`). Then:<br>- M and P are both closed 1011, and no frame routes between them.<br>- Their leaves' reads succeed, so Q sees each of them go offline.<br><br>A failed `Join` read closes 1011 with no `welcome`, and its `Leave` does nothing (the `touch` count is unchanged) |
| `a_failed_handler_call_still_refreshes_the_sender` | Rule 3 is proved through the `Refresh` itself. The handler deletes M–P on P's message, then panics.<br>- Arm `hold_nth(peers_of, n)` for the `Refresh [P]` read, and wait for `started()` (bounded at 5 s).<br>- While it is held, assert that the counting handler's `on_leave` count is unchanged. That is the strong check: a `Leave` step calls `on_leave` before `peers_of` in the same store call, so without rule 3 the held read would be P's `Leave` read, and `on_leave` would already have risen. Also assert that `Relay::peer_requests_received()` has risen by one, and, as a non-blocking poll, that P has not yet been closed.<br>- Release, then assert that P closes with 1011.<br><br>Without rule 3 the test fails every time, through the `on_leave` count. Routing to P proves nothing here, because `Leave::drop` has already removed P's sender |
| `a_failed_replaced_leave_still_refreshes_the_current_connection` | M is replaced. The old connection's `on_leave` (`current: false`) deletes M–P, then fails. Two cases: it returns `Err`, and it panics. Under `catch_unwind` a panic is an `on_leave` failure like `Err`, so in both cases `peers_of` still runs and the old connection's peers are told it is offline.<br>- A third online device Q is paired with neither M nor P.<br>- Wait until the `on_leave` count has risen, so the `Leave` step is running.<br>- Q sends a control message whose handler returns `refresh [Q]`, and the test awaits its reply. That `Refresh` is queued behind the `Leave` step and re-reads only Q, so it acts as a pure barrier. Nothing re-reads M except rule 3.<br>- Assert the `peers_of` delta since the `on_leave` rise, excluding Q's read: +2 in both cases (the fan-out read, plus the re-read).<br>- M sends a frame to P. It must be dropped: poll `relay_frames_dropped_total` for +1, bounded at 5 s, and check that `relay_frames_routed_total` is unchanged.<br><br>Without rule 3, M's set still comes from its `Join` read, made before the delete, and P's set was never refreshed. So the frame routes, and the test fails |
| `handler_messages_wait_for_their_refresh` | The handler stores M–P, sends `paired` to P, and returns `refresh [M, P]`. Hold that `Refresh` read.<br>- Before `release()`: P is already paired with Q, and Q sends P a frame. P receives Q's frame and no `paired`.<br>- After `release()`: P receives `paired`, and P's `hs1` to M routes at once.<br><br>Every wait is bounded at 5 s. This fails if `out` is delivered before the `Refresh` |
| `a_writer_waits_for_its_refresh` | Hold the `Refresh` read from M's message, then send M's next control message, and await the client's `send` (flushed to the socket).<br>- Sleep a fixed 200 ms, then send Q's sentinel. A fixed delay is used because no deterministic hook exists: a correct relay never reads M's second message before `release()`, so no counter could rise to wait on. The delay only gives a broken relay, one that doesn't wait, time to read and handle the message. So a slow run can let a broken relay through, but it can never fail a correct one.<br>- Before `release()`: Q's control message is handled by the counting handler, and M's is not.<br>- After `release()`: M's is handled.<br><br>Every wait is bounded at 5 s. This fails if the loop stops waiting for the reply |
| `on_leave_is_told_whether_its_connection_was_current` | A plain disconnect gives `current: true`. A replaced connection's leave gives `current: false`, after the new `welcome`. `on_leave`'s `out` reaches an online peer, and its `refresh` is installed |
| `shutdown_during_a_held_login_read_finishes` | M's `Join` read is held, `shutdown()` starts, then the read is released. `shutdown` returns within 5 s, and M's `Leave` ran exactly once (`touch` +1, `on_leave` once). This shows that a cancelled connection loses no request |
| `rehandshake_counts_against_the_control_limit` | With a frozen clock, 30 control messages are handled. The 31st, a `rehandshake`, gets `control_limited {msg: "rehandshake", peer}` and doesn't reach the peer (sentinel). No frame token is spent. The test client doesn't re-send it, because a refused `rehandshake` is not re-sent (owner decision) |
| `there_is_no_limit_before_login` | 50 connections from one IP, none logging in, each get a `challenge` |
| `a_pair_routes_after_refresh` | A pair stored after login drops frames until the handler returns both keys in `refresh`. After that, they route both ways. With only one key returned, they are still dropped (the writers' rule) |
| `routing_survives_a_held_store_lock` | `hold_nth(peers_of, n)` holds a third login's `Join` read, so the peer task is blocked inside a store call. The test waits for `started()`. Frames between two online devices still route |
| `on_login_messages_come_before_welcome_and_on_leave_runs_once` | The `on_login` messages arrive before `welcome`, and `on_leave` runs once |
| `unreadable_messages_are_counted_and_unanswered` | An unreadable text or binary message gets no answer, `relay_unreadable_total` rises, and a bad binary frame still spends a frame token |
| `a_new_key_token_is_spent_when_register_fails` | With `CountingStore` failing `register`, the next new key from that IP finds the budget one lower |
| `a_login_after_login_is_ignored_and_counted` | A second `login` gets no answer, and `relay_ignored_total` is 1. With a frozen clock, send 29 handled messages, then a `login`, then one more control message. That last message gets `control_limited`, with a `msg` that is not `"login"`, which proves the `login` spent a token |
| `routed_envelope_parses_and_round_trips` (only if 7b creates `routed.rs`) | `parse` returns `None` under 33 bytes and for a type other than 1, 2 or 3. `with_peer` and `encode` round-trip every kind |

The cases of `a_change_made_during_a_held_read_wins`. In each case the competing change is P's unpair. The handler deletes M–P and returns `refresh [M]` only. That leaves P's set naming M, so only M's set can stop the frame, and the two-sided check can't hide a read installed out of order. Each case takes these steps:
1. Hold the named `peers_of` with `hold_nth`, and wait for `started()`.
2. P sends its unpair. Wait until `Relay::peer_requests_received()` has risen by one, so P's `Refresh` is queued behind the held read. Waiting for the `delete_pair` count alone would leave a window.
3. `release()`.
4. Make a round trip on P: a control message that the counting handler sees. P's `Refresh` has then been handled.
5. Send a frame from M to P, which is online, then a sentinel. The sentinel must arrive next.

Every race test sets a ping timeout well above its hold time (for example 30 s), so a slow CI run can't time a device out while a read is held.

| Case | The read that is held |
|---|---|
| (1) | Mac M's `Join` read |
| (2) | M's `Refresh` read, from an earlier message whose handler stored a pair M–P2 and returned `refresh [M]` |

## Design Notes

**The numbers under a frozen clock.** Tokens are counted in millitokens: one token is 1000.
- A frame token refills in 1000 / 20 = 50 ms, and a control token in 1000 / 10 = 100 ms.
- So 101 frames give 100 passed and 1 refused.
- 100 control messages give 30 passed and 70 refused.
- 40 control messages give 30 passed and 10 refused.

**No store calls on a hot path.** Limits are checked before any store call. Routing reads `Live` under a short lock, and never waits on the peer task or the store. The store runs off the async workers (7a). A held store lock therefore stalls neither routing nor pings for other devices, as `routing_survives_a_held_store_lock` proves. There are two accepted exceptions:
- A device whose own control message is waiting on the store or on its `Refresh`. Each connection is one sequential loop, so that device's later frames and pongs wait behind its message.
- Joins, leaves and refreshes wait in the peer task's queue while the store is held. They waited on the same store lock before.

**Peer sets stay true (ADR 0006).**
- One task does every peer-set change together with the read it needs, one change at a time.
- A pair change's `Refresh` is queued only after its write has committed. So any read made before that write belongs to an earlier step, and the `Refresh` re-reads after it.
- Routing also needs both ends' sets to name each other. A stale set on one side can't route by itself, and that covers cleanup with no strip.
- The ADR gives the full argument, the store-error rules and the liveness rules.

Each race the earlier reviews found, and why it can't happen now:

| Race (round) | Now |
|---|---|
| A stale read installed over a newer refresh or unpair (3, Major A; 5) | Reads run inside the peer task's steps. A change committed after a read has its `Refresh` queued behind that read, so it re-reads. `a_change_made_during_a_held_read_wins` |
| A late leave after a replacement removing the new entry (4, Major 2) | A `Leave` removes the entry only if its `conn` is current. `a_late_leave_after_replacement_keeps_routing` |
| A strip by key removing a newer pair (4); a strip during a refresh read leaving a live pair unroutable (5, Major 2); a strip by key costing an extra read (5 check, 1) | There are no strips |
| A deleted key that logs in again being reachable before cleanup returns (5, minor 3); the new-key strip skipping reads in flight (5 check, 2) | No reads run outside the task. The returning key's own set is read after the delete, so the two-sided check refuses the route. `a_key_deleted_by_cleanup_is_unreachable_when_it_returns` |
| A cancelled bumper losing its read; a failed read leaving a deleted pair installed or a login waiting for good (5 check, 3) | A request is a message that the task finishes whatever the sender does. A failed read closes with 1011. `shutdown_during_a_held_login_read_finishes`, `a_failed_peer_read_closes_1011` |
| A login's loop starting before its read is installed (5 check, 4); a pending device as a routing target (4) | The loop starts after the `Join` reply. An entry exists only once its set is installed |
| A held store lock stalling routing (2, Major 1) | Routing never touches the task or the store. `routing_survives_a_held_store_lock` |
| `on_login` under the lock; presence joining apart from the install (5 check, minors) | `on_login` runs before `Join`, outside the lock. Presence joins in the `Join` step's lock step |

The window that remains (ADR 0006, Consequences) is that routing can use the old sets between a write's commit and the handling of its `Refresh`. The writer's own next message is never inside that window.

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
  - **Major 3.** Cleanup's `deleted` strips peer sets, with a test. (Superseded by the redesign below.)
  - **Major 4.** The overflow rule is stated for each kind. Added the queue `Config` and the writer gate, the test, and the contract entry.
  - **Major 5.** Added a test for each untested decision.
  - **Minor 3.** Recorded the `rehandshake` and `Routed` ruling, and added story 4's path.
  - **Minor 4.** "One open at a time" is now an owner decision, and the ticket is amended.
  - **Minors 5–9.** Covered by the AC labels, the CLI events, the sentinel, header-based IPs, and the rule that every binary message spends a token while a second login is ignored.
  - **Minor 13.** The purity check.
- **2026-10-16, owner's final rulings.** The four 7b questions are settled and recorded in Boundaries: the `rehandshake` shape, the `routed.rs` fallback, the one-open rule as 5a's, and `rehandshake` counting against the control limit. The numbering and the plan size are accepted.
- **2026-10-16, third review (7b: BLOCK).**
  - **Major A.** Peer-set entries now carry a generation, with pending entries at login, so a stale read is never installed. Test: `a_stale_peer_read_is_never_installed`. (Superseded by the redesign below.)
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
- **2026-10-16, fourth review (7b: BLOCK, no owner ruling needed).** Added `hold_nth`, a `ConnId`-guarded entry lifecycle, strips by pair id and the login-token proof. (The peer-set parts are superseded by the redesign below; `hold_nth` and the login-token proof are kept.)
- **2026-10-16, fifth review and its check (BLOCK twice).** Added the owed-read rule, a task per read, `installed_gen`, the new-key strip and `a_failed_peer_read_closes_1011`, and made `hold_nth` run the inner call before holding. (The peer-set machinery is superseded by the redesign below; `hold_nth`'s behaviour, `Held` releasing on `Drop`, the `on_login`, then `welcome`, then frames order, routing over an un-acked pair, the `routed.rs` tests, the long ping timeout in race tests and the 1011 rule are kept.)
- **2026-10-16, redesign around ADR 0006 (owner: simplify).** The owner ruled that six rounds of races meant the peer-set design was too intricate, and asked the architect to simplify it. ADR 0006 (Proposed) replaces it:
  - **One task owns the sets.** A single peer task makes every change (`Join`, `Refresh`, `Leave`), each with its own `peers_of` read, one at a time.
  - **Routing reads `Live` and needs both ends' sets to name each other.**
  - **What was removed:**
    - generations and the relay-wide counter;
    - the owed-read rule;
    - a spawned task per read;
    - `installed_gen`;
    - pending entries;
    - the cleanup strip (7b no longer uses `CleanupCounts.deleted_pairs`);
    - the new-key strip.
  - **Tests.**
    - Removed: `a_strip_during_a_refresh_read_keeps_live_pairs` and `a_late_strip_keeps_a_newer_pair` (no strips exist), and `a_rejoined_key_is_unreachable_before_cleanup_finishes`. That last test and `cleanup_strips_deleted_keys_from_peer_sets` are merged into `a_key_deleted_by_cleanup_is_unreachable_when_it_returns`.
    - Reworked: `a_stale_peer_read_is_never_installed` became `a_change_made_during_a_held_read_wins`. Its old case 3 moved into the cleanup test.
    - Added: `routing_needs_both_sets_to_name_the_pair` and `shutdown_during_a_held_login_read_finishes`.
    - Added after the review below: `a_failed_handler_call_still_refreshes_the_sender`, `handler_messages_wait_for_their_refresh`, `a_writer_waits_for_its_refresh` and `on_leave_is_told_whether_its_connection_was_current`.
    - Kept: every other test.
  - **Unchanged:** the owner's decisions in Boundaries and the ACs. The serialized reads were measured: about 8 µs per read through `spawn_blocking`, faster than 64 concurrent reads on the same store lock (ADR 0006).
  - **Inside the frozen block, two edits need the owner's renegotiation:**
    - the Approach line now names the peer task;
    - an Always bullet now ties peer sets to ADR 0006.

    No owner decision was changed.
- **2026-10-16, review of ADR 0006 with this plan (BLOCK: 3 major, 10 minor).** All were folded in, here and in the ADR:
  - **Major 1:** a write that committed with no `Refresh`. Fixed by the writers' rules: a handler writes only pairs that include the sender; a failed `control` call refreshes the sender, then closes 1011; `on_login` writes no pairs; `on_leave` returns a `refresh`.
  - **Major 2:** `on_leave` couldn't tell its connection was replaced, and couldn't send. It now takes `current: bool` and returns a `ControlOutcome`.
  - **Major 3:** `out` arrived before its `Refresh`. `out` is now delivered in the `Refresh` step's lock step.
  - **Minors:**
    - the held-store-lock test now really blocks the peer task;
    - `fail_nth`, and a third device, in the 1011 test;
    - a request counter for the order tests;
    - a test that the writer waits for its `Refresh`;
    - the Leave step's write measured and stated in the ADR;
    - the `deliver` exception stated;
    - 7a's 1011 constants used;
    - the `relay-storage.md` correction listed;
    - the frozen-block edits flagged;
    - the `control` call and its `Refresh` never cancelled except by stop.

- **2026-10-16, the owner's rulings after ADR 0006.** Recorded in Boundaries:
  - ADR 0006 is accepted, along with the two edits to the frozen block;
  - a `rehandshake` refused with `control_limited` is not re-sent (contract task and test row updated);
  - ending a slot only on a current leave is 5a's, and 7b provides only `on_leave(current)`;
  - the per-key login limit is deferred.
- **2026-10-16, check of the architect's fixes (BLOCK: 2 plan majors, 1 ADR major, 2 minors; no owner input needed).**
  - **1.** `a_failed_handler_call_still_refreshes_the_sender` passed without rule 3, because P logged in again. It now holds P's `Leave` with `hold_nth(touch)` and asserts the dropped and routed counters.
  - **2.** A failed leave call lost its `refresh` keys. Writers' rule 3 now covers the leave: a failed replaced leave re-reads the current connection's set. New test: `a_failed_replaced_leave_still_refreshes_the_current_connection`. ADR 0006 needs the same line (architect).
  - **3.** ADR 0005's Consequences bullet still says a device re-sends a refused `rehandshake`. That needs the architect's correction, and the plan text is already right.
  - **Minors.**
    - Any read error fails the whole `Refresh`.
    - The two tests that prove a negative now use a bounded wait and a sentinel from a third device Q.

- **2026-10-16, aligned with ADR 0006 at 4fd51a3 and 7a at 7e391f6.** The last check found that the plan, and the ADR, contradicted 7a's built order and the owner's ruling.
  - **The Leave step** now follows the ADR's order:
    1. one store call for `on_leave(current)`, then `peers_of`;
    2. any `refresh` read;
    3. the lock step (fan-out, install, `out`, entry removal);
    4. a separate `touch` call, whose failure is only logged.

    `Leave::drop` removes the sender. Rule 3's leave half applies when `on_leave` fails. 7a's `a_leave_tells_peers_before_its_touch_write` and `a_failed_touch_at_leave_still_tells_peers` must keep passing.
  - **`a_failed_handler_call_still_refreshes_the_sender`** now proves rule 3 by holding the `Refresh [P]` read, checking `peer_requests_received()`, then the 1011 close.
  - **`a_failed_replaced_leave_still_refreshes_the_current_connection`** covers "`on_leave` or `peers_of` fails". It waits for the re-read, and makes a peer-task round trip before the frame.
  - **Minors.**
    - `out` for devices a failed `Refresh` closed is dropped.
    - `handler_messages_wait_for_their_refresh` is bounded at 5 s.
    - `a_writer_waits_for_its_refresh` uses a flushed send and a fixed 200 ms delay, with the reason no deterministic hook exists.

- **2026-10-16, re-check of the Leave alignment (BLOCK: 2 test majors; the Leave design passes; no owner input needed).**
  - **`a_failed_handler_call_still_refreshes_the_sender`.** Without rule 3, P's `Leave` read could be the held call. The test now also asserts that the `on_leave` count is unchanged while the read is held, and the "not yet closed" check is a non-blocking poll.
  - **`a_failed_replaced_leave_still_refreshes_the_current_connection`.** The barrier was `refresh [M]`, which re-read M by itself. It is now `refresh [Q]` from an unrelated device Q, and the test asserts the `peers_of` deltas for each case (`Err` +2, panic +1).
  - **Minors.**
    - The second leave store call also runs when rule 3 applies.
    - The `Refresh` read wording now matches the ADR.
    - A handler panic in a current leave suppresses the fan-out, and the plan states this. `catch_unwind` is left to the architect.

- **2026-10-16, approved by the owner (status `ready-for-dev`).** Two rulings are recorded in Boundaries:
  - **Mutation checks at build time**, added to Tasks and Verification.
  - **`on_leave` under `catch_unwind`.** The Leave step is updated: a panic now behaves like `Err`, and `a_failed_replaced_leave_still_refreshes_the_current_connection` expects +2 in both cases. The "known consequence" text is removed.

  7a's deferred test gap (the in-loop `hand_over()`, and the `drop(store)` / `drop(busy)` order) is now a 7b task. The paper-review loop is stopped.

## Review Triage Log

| Round | Verdict | Findings | Action |
|---|---|---|---|
| 1 (story 7, before the split) | BLOCK | 2 critical, 9 major, 11 minor | All patched; see the Plan Change Log ("split") |
| 2 | BLOCK | 5 major, 14 minor | All patched |
| 3 | BLOCK | 2 major, 4 minor | All patched; one question went to the owner (`peer` in `control_limited`), who ruled |
| 4 | BLOCK | 2 major, 4 minor | All patched |
| 5 (at 09ce7a6) | BLOCK | 3 major, 6 minor | All patched as above. The early-batch window (minor 3) was closed in 7b rather than accepted. No 7a change was needed |
| 5, check of fixes | BLOCK | 4 major, 3 minor | Patched, then superseded: the owner asked for a simpler design, and the peer sets were redesigned around ADR 0006 (see the Plan Change Log) |
| 6 (ADR 0006 with this plan) | BLOCK | 3 major, 10 minor | All patched; see the Plan Change Log. The reviewer found the core design sound. Two questions went to the owner: whether a replaced connection's leave ends that Mac's slot, and whether to add a per-key login limit. Not re-reviewed yet |

## Implementation Notes

**2026-10-17, Dev (ticket 7b).** Branch `phone-relay-limits-routing`, from `origin/main` at 0b8e9fd (7a and story 4 merged; ADRs 0005 and 0006 accepted). Every task above is built. Done is not claimed here: QA runs the verification and decides.

**What was built:**
- `relay/protocol/src/lib.rs`: `Control::RateLimited`, `ControlLimited` (absent options left out of the JSON) and `Rehandshake`, in `KNOWN_TYPES`; `ControlHead::read`, with unit tests for a malformed `slot`, `pair_id` and `peer` and for unreadable heads. Story 4's `routed.rs` is reused unchanged, so `routed_envelope_parses_and_round_trips` isn't needed (its cases are story 4's `routed::tests`).
- `relay/cli/src/lib.rs`: `Event::RateLimited`, `ControlLimited`, `Rehandshake` and `Client::send_rehandshake`, each tested; the bin prints them.
- `relay/core/src/limits.rs`: `Limiter`, `TokenBucket`, `HourWindow`, `KeyedLimits`, `Limits`, `FrameLimiter`, `ControlLimiter`, `SlotLimiter`, `NewKeyLimiter`, `ip_key`, with the listed tests (`thirty_slots_fit_in_an_hour_and_the_31st_is_refused` is here).
- `relay/core/src/control.rs`: `ControlHandler`, `ControlOutcome`, `IgnoreControl`, with the writers' rule in the module doc.
- `relay/server/src/peers.rs`: the peer task (`Join`, `Refresh`, `Leave`), as ADR 0006 orders it, `on_leave` under `catch_unwind`.
- `relay/server/src/lib.rs`: the `Config` fields (`limits`, `client_ip`, `control`, `queue` = 192, `writer_gate`), `Outgoing`, `Live::route`, the limits before any store call, the 4409 / 4429 / 1009 closes, `Relay::peer_requests_received`, `Relay::wait` failing if the peer task ends, the limiter prune on the cleanup tick, and the new counters and log events (`control_store_error`, `refresh_store_error`).
- `relay/server/src/main.rs`: `RELAY_CLIENT_IP`.
- Tests: `relay/e2e/tests/limits_and_routing.rs` (every AC and contract test), `fail_nth` / `hold_nth` / `Held` / `total` in `common/mod.rs`, the 4409 and 1009 assertions in `e2e.rs`, and the canary's 7b traffic in `storage.rs`.
- `.ade/context/remote-protocol.md` ("Limits and routing", and the message, size, presence, queue, metrics and env entries) and `relay-storage.md` (the `deleted_pairs` correction, the writers' rule for 5a, the new test helpers). `deferred-work.md`: the replaced-close and 7a test-gap entries removed.

**Deviations and choices (none changes an owner decision):**
1. **7a's test gap lives in `relay-server`, not `relay/e2e`.** `a_call_waiting_during_cleanup_gets_in_between_batches` is a unit test in `relay/server/src/store.rs`, so the new guard is beside it: `store::tests::a_call_queued_during_a_later_batch_gets_in_before_the_next_batch`. It is a sibling test rather than an edit of 7a's test, which still guards the first `hand_over`. It uses a `#[cfg(test)]` hook at the start of each cleanup batch. A first version, with a real thread queued on the mutex during batch 2, let mutant D survive: on macOS that thread wins the lock between batches even without `hand_over`. So the queued call is now the store's own `entered` / `acquired` count, which is exactly what `hand_over` waits on, let in 100 ms after batch 2 commits; batch 3 must not start before it. A correct store can't fail it. The `drop(store)` before `drop(busy)` order is pinned by `tests::a_store_call_drops_the_store_before_its_count` in `relay/server/src/lib.rs`.
2. **Two routing tests beyond the plan's list**, because the owner asked for a mutation check on every routing rule and two conditions of `Live::route` had no test that failed without them: `a_replaced_connection_routes_nothing` (the sender's entry must be current for its connection) and `a_closing_entry_routes_nothing` (a set that is `None` routes nothing). Both close the writer gate, so the connection keeps reading while its 4409 or 1011 waits on its queue.
3. **Writers' rules 2 and 4 are handler obligations**, so their mutants are the relay code that depends on them. Rule 2: the recovery `Refresh` names the sender (the only key rule 2 guarantees every committed write involved). Rule 4: `on_login` runs before the `Join` read and its messages are queued ahead of the `welcome`.
4. **The writer gate** re-checks the gate if it closes while the writer is waiting on its queue (`next_out`), so a closed gate leaves exactly `queue` items of room, as the plan asks. Without that, one item slipped past a gate closed mid-wait.
5. **Counting and wording the plan left open:** 1009's reason is `message_too_big`; a 4429 is logged `login_refused code=too_many_new_keys` and counted in `relay_new_keys_refused_total`, not in `relay_logins_total{result="refused"}` (which stays "every 4401"); an unreadable text that was also over the control limit counts as unreadable (no answer); a frame or `rehandshake` that meets a full queue counts as dropped (the `rehandshake` also drops the device, as any text item does). (Corrected 2026-10-17, see the review fixes below: a message over the WebSocket layer's 128 KiB is also closed 1009, before login too.)
6. **`e2e` dev-dependencies** gain `serde_json` and `base64`, both already workspace dependencies in `Cargo.lock`: no crate or version is added (the lock gains two dependency edges only).
7. **A stand-in for `paired`:** `Control` has no `paired` yet (5a's), so the counting handler's messages are `control_limited` with a `test_…` `msg`.
8. **`a_failed_replaced_leave_still_refreshes_the_current_connection`** asserts a `peers_of` delta of 4 from before the replacing login: M's `Join` read, Q's barrier read, and the leave's two (the fan-out read and the re-read). That is the plan's "+2 excluding Q's read", with M's `Join` read counted from the same base.
9. **`.ade/knowledge/developer.md`** is not committed: the slice for this story is `relay/`, `.ade/context/` and this initiative's `_bmad-output` files.

**Mutation record (owner decision).** Each mutant was applied to an rsync copy of `relay/` in a scratchpad (`CARGO_TARGET_DIR` there too), run with `cargo test -p relay-e2e -p relay-server --no-fail-fast` (the protocol tests read `../../packages/protocol/vectors`, which the copy doesn't have), and restored. All were run against the final code. Every mutant was killed.

| Id | Mutant (rule removed) | Result | Killed by |
|---|---|---|---|
| W1 | writers' rule 1: a Refresh installs only the first key it names | KILLED | `a_failed_peer_read_closes_1011`, `a_key_deleted_by_cleanup_is_unreachable_when_it_returns`, `a_pair_routes_after_refresh`, `handler_messages_wait_for_their_refresh`, `on_leave_is_told_whether_its_connection_was_current` |
| W2 | writers' rule 2: a failed call's Refresh doesn't name the sender | KILLED | `a_failed_handler_call_still_refreshes_the_sender` |
| W3 | writers' rule 3: a failed call closes 1011 with no Refresh | KILLED | `a_failed_handler_call_still_refreshes_the_sender` |
| W3L | writers' rule 3, leave half: a failed replaced on_leave doesn't re-read the current connection | KILLED | `a_failed_replaced_leave_still_refreshes_the_current_connection` |
| W4 | writers' rule 4: on_login's messages are queued after the welcome | KILLED | `on_login_messages_come_before_welcome_and_on_leave_runs_once` |
| RF | Refresh failure rule: a failed read keeps the old sets and closes nobody | KILLED | `a_closing_entry_routes_nothing`, `a_failed_peer_read_closes_1011` |
| OUT | handler messages delivered before the Refresh step, not inside it | KILLED | `handler_messages_wait_for_their_refresh` |
| WAIT | the writer doesn't wait for its Refresh | KILLED | `a_failed_handler_call_still_refreshes_the_sender`, `a_writer_waits_for_its_refresh` |
| CUR | on_leave is always told current: true | KILLED | `a_failed_replaced_leave_still_refreshes_the_current_connection`, `a_late_leave_after_replacement_keeps_routing`, `on_leave_is_told_whether_its_connection_was_current` |
| CU | on_leave not under catch_unwind | KILLED | `a_failed_replaced_leave_still_refreshes_the_current_connection` |
| R1 | routing: the sender's entry need not be current for its connection | KILLED | `a_replaced_connection_routes_nothing` |
| R2 | routing: a closing entry (set None) counts as naming every key | KILLED | `a_closing_entry_routes_nothing` |
| R3 | routing: the sender's set need not name the recipient | KILLED | `a_change_made_during_a_held_read_wins`, `a_closing_entry_routes_nothing`, `a_failed_replaced_leave_still_refreshes_the_current_connection`, `a_pair_routes_after_refresh`, `routing_needs_both_sets_to_name_the_pair` |
| R4 | routing: the recipient's set need not name the sender | KILLED | `a_key_deleted_by_cleanup_is_unreachable_when_it_returns`, `a_pair_routes_after_refresh`, `routing_needs_both_sets_to_name_the_pair` |
| R5 | routing: the envelope's peer is not rewritten to the sender | KILLED | `a_change_made_during_a_held_read_wins`, `a_frame_over_64_kib_is_closed_1009`, `a_full_queue_drops_frames_not_the_device`, `a_key_deleted_by_cleanup_is_unreachable_when_it_returns`, `a_late_leave_after_replacement_keeps_routing`, `a_login_after_login_is_ignored_and_counted`, `a_pair_routes_after_refresh`, `frames_are_limited_per_device`, `handler_messages_wait_for_their_refresh`, `on_leave_is_told_whether_its_connection_was_current`, `rehandshake_counts_against_the_control_limit`, `routing_needs_both_sets_to_name_the_pair`, `routing_reaches_only_paired_online_peers`, `routing_survives_a_held_store_lock`, `unreadable_messages_are_counted_and_unanswered` |
| R6 | routing: a rehandshake skips the two-sided check (any online key) | KILLED | `routing_needs_both_sets_to_name_the_pair`, `routing_reaches_only_paired_online_peers` |
| R7 | routing: a rehandshake's peer is not rewritten to the sender | KILLED | `routing_reaches_only_paired_online_peers`, `routing_survives_a_held_store_lock` |
| D | 7a mutant D: the hand_over() inside the cleanup batch loop removed | KILLED | `store::tests::a_call_queued_during_a_later_batch_gets_in_before_the_next_batch` |
| E2 | StoreHandle::call drops its count before its store reference | KILLED | `tests::a_store_call_drops_the_store_before_its_count` |
| X4409 | replacement closes the old connection with no 4409 | KILLED | `a_failed_replaced_leave_still_refreshes_the_current_connection`, `a_late_leave_after_replacement_keeps_routing`, `a_new_login_replaces_the_old_connection`, `a_replaced_connection_routes_nothing`, `on_leave_is_told_whether_its_connection_was_current` |

Mutant D was also run 5 times on its own against the final test, and was killed 5 times out of 5. The first version of that test (a real thread queued on the mutex) let D survive, which is why the test changed (deviation 1).

**Manual checks:**
- The slice: `git diff --stat 0b8e9fd` (the branch point) lists only `relay/`, `.ade/context/` and this initiative's `_bmad-output` files. `origin/main` has since moved to 4051950 (#66, release 0.21.0), so `git diff --stat origin/main` also lists that commit's `docs/index.html` and `src-tauri/tauri.conf.json`, reversed; this branch doesn't touch them.
- `cargo tree -p relay-core -e normal` shows no `rusqlite`, `tokio` or `axum`.
- `relay/protocol/src/` has one envelope parser (`routed.rs`'s `Routed::parse`); the server calls only it.
- `grep -n "generation\|installed_gen" relay/server/src` finds nothing.
- `cargo fmt --check` in `relay/` is clean.
- No crate or package was added or upgraded: `Cargo.lock` gains only the two `relay-e2e` dependency edges (`base64`, `serde_json`), already locked.

**2026-10-17, review fixes (adversarial review of cdb9d14: BLOCK, 1 major, 4 minor).** This is a new commit on top of cdb9d14, test-first.
- **Major 1, the 1009 rule above 128 KiB.** Before this fix, a message over the WebSocket layer's own limit ended the socket with no close after login (the client saw 1006), and before login it got 4401 and was counted as a refused login. Now the relay recognises that layer's capacity error (`too_big`, through the error's `source()`) and closes 1009 `message_too_big` in both places. Before login it is not a refused login. To name the error type, `relay-server` now depends directly on `tungstenite = "=0.29.0"` (`default-features = false`), the exact version axum 0.8.9 already pulls in (published 2026-03-17). `Cargo.lock` gains one dependency edge and no crate. Tests: `a_message_over_128_kib_after_login_is_closed_1009` (binary and text) and `a_message_over_128_kib_before_login_is_closed_1009` (text and binary; `relay_logins_total{result="refused"}` stays 0). Deviation 5 and `remote-protocol.md`'s size entry are corrected.
- **Minor 2.** `unreadable_messages_are_counted_and_unanswered` now shows that the three unreadable texts each spent a control token: of 30 tokens, 27 readable messages are handled and the 28th is limited.
- **Minor 3.** `a_closing_entry_routes_nothing` now sends a second `Refresh` naming M. It asserts that no `peers_of` read happens and that M's frame is still dropped.
- **Minor 4.** `on_binary` now holds `Live`'s lock across the check and the `try_send`, as `route_text` does. No deterministic test is added. The window being closed is the gap between two statements on one connection's task: a peer-task step would have to run inside it, and nothing can stop a task there. (The writer gate holds a queue, not a lock section, and a test hook inside `on_binary` would be production code for a race that no longer exists.) The fix is checked by review.
- **Minor 5.** `remote-protocol.md` (Presence) now states that "replaced" and `on_leave(current: false)` also cover a device that reconnects before its old `Leave` step runs. In that case `relay_replaced_total` rises and the 4409 goes to a sender that is already gone. Story 5a's slot rule depends on this.

**Mutation record, added by the review fixes** (same method; all killed):

| Id | Mutant (rule removed) | Result | Killed by |
|---|---|---|---|
| O1 | the control token is taken after the head is read (an unreadable text spends none) | KILLED | `unreadable_messages_are_counted_and_unanswered` |
| O3 | a Refresh re-reads a closing (None) entry | KILLED | `a_closing_entry_routes_nothing` |
| S1 | 1009 rule after login: a message over the socket limit just drops the connection | KILLED | `a_message_over_128_kib_after_login_is_closed_1009` |
| S2 | 1009 rule before login: a message over the socket limit is a refused login (4401) | KILLED | `a_message_over_128_kib_before_login_is_closed_1009` |

After the fixes, all 24 mutants (the 20 above plus these 4) were run again against the final code. Each was killed by the same tests as before.

## Verification

**Commands** (the five approved lines):
- `cd relay && cargo test`: passes, and names each AC test and contract test.
- `npx tsc --noEmit`, `npm test`, `cd src-tauri && cargo test` and `cd mobile && npx tsc --noEmit && npx jest`: each passes, unchanged.

**Manual checks:**
- `git diff --stat main` shows only `relay/`, `.ade/context/` and this initiative's `_bmad-output` files.
- `cargo tree -p relay-core -e normal` shows no `rusqlite`, `tokio` or `axum`.
- `relay/protocol/src/` has one envelope parser.
- `grep -n "generation\|installed_gen" relay/server/src` finds nothing (ADR 0006).
- **Mutation record (owner decision).** The Implementation Notes list one mutant for each rule in the mutation-checks task, plus 7a's mutant D, each with the test that kills it. The code review checks that the list is complete and that every mutant was killed.
