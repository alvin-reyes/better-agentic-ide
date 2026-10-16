# 0006: One task owns the relay's peer sets, and routing needs both ends to agree

- Status: Accepted by the owner (2026-10-16).
  - It governs story 7b's in-memory peer sets (`_bmad-output/initiative-phone-remote/epic-phone-watch/story-relay-limits-routing-and-replacement-plan.md`), and every later story that changes pairs, 5a first.
  - It builds on story 7a's `Store`, `StoreHandle::call` (`spawn_blocking`) and cleanup, as recorded in `.ade/context/relay-storage.md`, and changes none of them.

- Context:
  - **What the peer set is for.** The relay routes `hs1`, `hs2`, frames and `rehandshake` only between paired keys. It must not read the store for each frame, and a held store lock must not stall routing. So each online device has an in-memory copy of its pairs, read from the store with `peers_of`.
  - **Who changes pairs.** Four things change pairs or the set of online devices:
    - logins and leaves;
    - 5a's `ControlHandler` (confirm, unpair, replacement);
    - 7a's cleanup, which deletes offline devices together with their pairs, in batches;
    - replacement of a connection.
  - **How story 7b's earlier plan kept the copies true.**
    - `peers_of` reads ran on `spawn_blocking` and finished in any order relative to those changes.
    - Six review rounds each found a real race.
    - The fixes added generation numbers from a relay-wide counter, `ConnId` matching on install, an "owed read" rule, `installed_gen`, pending entries, cleanup strips by pair id and new-key strips.
    - The last round found 4 major problems that the earlier fixes had introduced.
    - On 2026-10-16 the owner ruled that the design was over-intricate and asked the architect to simplify it.
  - **The root cause.** A read and its install were separate events, so any change could fall between them. Each fix had to name every kind of change that could fall in that gap.
  - **The facts this decision rests on**, each checked against 7a's code:
    - `SqliteStore` is one `Mutex<Connection>`, so `peers_of` reads already run one at a time inside the store.
    - Each `Store` method commits before it returns: `register` and `cleanup` in explicit transactions, the others in autocommit statements.
    - `StoreHandle::call` waits for its `spawn_blocking` to finish.
    - Cleanup spares every device in presence, and touches them first.
    - `register` sets `last_seen = now` under the same lock as cleanup's delete, and it runs before the device's `Join`.

- Decision:
  - **One task owns the peer sets.** A single tokio task, the peer task, writes:
    - each device's peer set;
    - its entry in `Presence`;
    - its sender in `Live`.

    The one exception is 7a's `deliver`, which may still remove a sender whose queue is full. That is harmless, because senders are keyed by `ConnId`, and the device's own `Leave` follows.

    The task takes requests from one unbounded channel and handles them one at a time, in arrival order. Each request runs its store work inside its own step, through `StoreHandle::call`, before the next request starts.
  - **The three requests.**
    - **`Join {who, conn, tx, on_login, reply}`** reads `peers_of(who)`. Then, in one `Live` lock step, it:
      - closes any older connection with `Close(4409, "replaced")`;
      - installs the sender;
      - queues the `on_login` messages, then a `welcome` built from that read;
      - joins presence and fans it out;
      - installs the set.

      It then replies. The connection's loop starts only after that reply.
    - **`Refresh {keys, out, reply}`** reads `peers_of` for every key in `keys` that has an entry, in one store call. Then, in one lock step, it installs all of those sets and delivers `out`, the handler's messages, and replies. Delivering `out` in this step means a peer told about a change (for example `paired`) can already route over it when it reacts.
    - **`Leave {id, conn, busy}`** is sent from `Leave::drop`, which needs no await to send on an unbounded channel. What it does depends on the connection:
      - **A connection the task joined:**
        1. One store call runs 7a's leave call (`touch` and `peers_of`) and 5a's `on_leave`. The handler is told whether `conn` is still the current connection.
        2. If `on_leave` returned `refresh` keys, a second store call in the same step reads them.
        3. In one lock step, the task clears presence and fans it out, installs any refreshed sets, delivers `on_leave`'s `out`, and removes the entry if `conn` is still current.
      - **A connection the task never joined** (its join failed, or it was cancelled before the join was handled): the step does nothing.

      The task keeps the id of each joined connection until that connection's `Leave` arrives. The `Leave` guard is created before the `Join` is sent, with no await between, so a connection's `Leave` is always queued after its `Join`.
  - **The writers' rule.** These are the rules for every pair write a handler makes:
    1. **Name both keys.** A store write that adds or removes a pair is followed, after it commits, by a `Refresh` naming both of the pair's keys. The handler returns them in `refresh`.
    2. **Include the sender.** A handler writes only pairs that include the key of the device whose message it is handling. 5a's writes do: confirm, unpair and ack all come from a party.
    3. **Recover from a failed call.** If a `control` call returns `Err` (a store error, or a panic reported as `Failed("store_task")`), the connection sends `Refresh [sender]`, waits for it, then closes with 1011. Any write that committed before the failure involved the sender (rule 2), so the sender's set is re-read. The two-sided check below then refuses every pair that write removed.
       The same holds for a leave: if a replaced connection's `touch` or `on_leave` call fails and another connection of that key is current, the `Leave` step re-reads the current connection's set (closing it with 1011 if that read fails) and skips the presence fan-out. Any read error fails the whole `Refresh` and closes every key it names with 1011.
    4. **`on_login` writes no pairs.** It only re-sends `paired`.
    5. **`on_leave` returns its own `refresh`,** which the Leave step handles as above.
    6. **Cleanup sends nothing** (see the routing rule).
  - **The writer never skips its `Refresh`.** The `control` call and the `Refresh` that follows run in the body of the connection loop's `select!` arm, not as a `select!` branch. So nothing but the relay stopping can cancel them between a commit and its `Refresh`.
  - **Routing reads `Live`, never the peer task or the store.** A frame or `rehandshake` from A to B routes only when all of these hold, checked under `Live`'s `std::sync::Mutex`:
    - A's entry is current for A's connection, and its set names B;
    - B's entry has a set that names A;
    - B has a sender.

    The lock is never held across an await or a store call. Requiring **both** sets to agree means one stale set can never route by itself.
  - **The correctness argument.**
    - Take a write W that changes the pairs of key K. W commits at time c, and its `Refresh` is queued at some time e after c.
    - Every read happens inside a step.
    - A read made after c sees W.
    - A read made before c belongs to a step that was already running before the `Refresh` was queued. That `Refresh` is handled after it, and re-reads K. The same holds when two reads in one `Refresh` call straddle c.
    - Once that `Refresh` is handled, K's set reflects W. No later step can undo that, because every later read happens after c.

    This needs no generations, version numbers or install checks.
  - **Cleanup** sends no `Refresh` and strips nothing.
    - A device cleanup deletes has no set: entries are in presence, and cleanup spares and touches presence.
    - If its key logs in again, the `Join` reads after the delete and finds no pairs.
    - A peer whose set still names the deleted pair can't route to it, because the returning device's set disagrees. The stale entry stays harmless until that peer's next refresh or login.
    - This also covers a cleanup that commits some batches and then fails, which returns no `deleted_pairs`.
    - The one exception is a clock that jumps 90 days between a device's `register` and its `Join`. Only tests with a manual clock can do that.
  - **Store errors.**
    - A failed `Join` read closes the connection with 1011. No `welcome` is sent, and nothing is installed (7a's rule).
    - A failed `Refresh` read, whether a handler's or a Leave step's, closes each device it was refreshing with 1011, using 7a's `STORE_ERROR_CODE` and `STORE_ERROR_REASON`. In the same step their sets become unroutable. Each device recovers by logging in again, which reads afresh. Keeping the old set is never allowed, because a refresh usually follows an unpair.
    - A failed `control` call follows writers' rule 3.
    - A failed Leave call follows 7a's rule: presence and the entry are cleared, and no presence is fanned out.
    - Cleanup errors are 7a's alone; the routing rule keeps routing safe after a partial cleanup.
  - **Liveness.**
    - A request is a message, which the peer task completes whether or not its sender is still waiting. Cancelling a connection can't lose a change.
    - Every step ends with its change installed, or with the affected devices closed. Nothing is left pending.
    - The peer task waits only on the store. Connections wait only on the peer task. Nothing waits on a connection, so there is no cycle.
    - Each connection has at most one `Join` or `Refresh` outstanding, because it awaits the reply, plus one `Leave`.
    - After `Relay::abort`, the task does nothing. `shutdown` waits for the leaves to drain through 7a's tracker (each `Leave` carries a `Busy`), then stops the task, then drops the store.
    - If the task ends while the relay is running, `Relay::wait` returns an error, so the binary exits 1 and Fly restarts it. Its queued `Busy`s are dropped, so `shutdown` can't hang on them, and a request sent to it closes its connection with 1011.

- Alternatives rejected:
  - **The earlier design** (concurrent reads with generations, owed reads, `installed_gen`, pending entries and strips). Six review rounds each found new races. Each correctness claim depended on a rule that every other rule had to respect.
  - **One mutex held across the read.**
    - A `std::sync::Mutex` would be held across an await, which can deadlock on a single worker.
    - With `tokio::sync::Mutex`, a cancelled holder would lose its change, and `Leave::drop` can't await the lock, so it would need a spawned task, which brings back unordered racers.
    - Routing would still need a separate snapshot.
  - **A store read per frame.** It puts the store on the hot path, and a held lock would stall routing.
  - **A store that publishes its own pair index,** updated under the store's lock on every write. This is the strongest option, because nobody would need to send a `Refresh`. It was rejected for now because:
    - it changes 7a's `Store` contract while 7a is being built;
    - every `Store` implementation (cascades included) would have to keep the index right;
    - it would hold every pair in memory, not only those of online devices;
    - it would put routing state in the storage layer.

    Revisit it if the writers' rule proves error-prone in 5a.
  - **The two-sided check alone, with reads still concurrent.** Two concurrent stale reads could install stale sets on both sides. The check is a backstop, not a replacement.

- Consequences:
  - **What 7b drops:**
    - generations and the relay-wide counter;
    - the owed-read rule;
    - a spawned task per read;
    - `installed_gen`;
    - pending entries;
    - the cleanup strip (`CleanupCounts.deleted_pairs` stays in 7a as built, unused by 7b);
    - the new-key strip.
  - **What the peer task costs.** I measured it with a scratch program, not committed, on this Mac: 7a's schema with 40,000 devices and 25,000 pairs, and one `Mutex<Connection>` in WAL mode with the default `synchronous` setting.
    - **Measured:**
      - A `peers_of` read, one at a time through `spawn_blocking`, took 8.0–8.6 µs.
      - The same read, with 64 in flight at once, took 11.4–11.9 µs, because the concurrent reads only contend for the same lock.
      - A Leave step (a committed `touch`, then a read) took about 44 µs.
    - **Estimated:**
      - macOS `fsync` doesn't flush the disk cache, so a commit on a Fly volume may take 1–5 ms.
      - A mass disconnect of 10,000 devices then costs about 10–50 s of serialized leaves, during which joins and refreshes wait.
      - Joins and refreshes alone (reads only) run at about 10,000 a second, allowing for a 10× slower CPU.
    - **Why the task adds no store work:** those writes were already serialized by the store lock, so the old design paid the same cost. The task only turns the lock's arbitrary order (a `std` mutex isn't fair) into first-come, first-served.
    - **A follow-up:** measure a Leave step on the Fly volume once the relay is deployed (devops). If it is slow, move `touch` out of the Leave step, and leave the fan-out read in.
  - **A slow or held store holds up every join, leave and refresh.** It never holds up routing, pings, `/health` or `/metrics`. A device waiting on its own `Refresh` reads no pongs until the reply comes.
  - **A bounded staleness window remains.** Between a write's commit and the handling of its `Refresh`, routing may still use the old sets. The writer's own next message, and every message the handler sent about the change, come after the `Refresh` is installed.
  - **A `welcome` can name a pair that was deleted while the join was in progress.** The device catches up at its next `welcome`, as the spec allows for an offline peer, and routing over the pair is refused at once.
  - **5a must follow the writers' rule.** If 5a misses a key on a deletion, routing is still refused, because the other key's set no longer names the pair. If 5a misses a key on a new pair, that pair doesn't route until the missed device logs in again. 7b's tests pin the rule, and 5a's tests must cover each write it adds.
  - **`on_leave` runs once for each connection the task joined,** a replaced one included. It runs after its replacement's `Join`, and it is told whether its connection was still current. Whether a replaced connection's leave ends that Mac's slot is the owner's or 5a's call.
  - **Each login costs two serialized steps.** Any key that can log in can reconnect without limit. That load was already on the store lock before. A per-key login limit would be a product decision.
