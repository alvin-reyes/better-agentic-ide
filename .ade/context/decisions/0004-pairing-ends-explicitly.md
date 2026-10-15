# 0004: A pairing attempt ends explicitly, and only the relay's answer drops a pending pair

- Status: Proposed (2026-10-15). Amends the owner-approved 2a spec `docs/superpowers/specs/2026-10-14-relay-pairing-design.md` ("Pairing: commit, then reveal"); needs the owner's approval before the build uses it. The protocol contract will be `.ade/context/remote-protocol.md`.
- Context: The review of the phone app UX found that 2a's pairing had no answer for a refused commit, no way to cancel, a slot that could expire while the user compared codes, and a 10-minute pending-pair timer that could race a `paired` held at the relay and silently undo a confirmed pairing, which 2a forbids. Slots live in the relay's memory, so a restart loses them; pairs are on disk.
- Decision:
  - **Every way a slot ends is said out loud.** `pair_refused {slot, reason}` answers a pairing message the slot can't take, and nothing is stored. `pair_ended {slot, reason}` tells a party the slot ended without its asking. `pair_abort` and `pair_status` are always answered with `pair_state {slot, state, reason}` (`open`, `paired`, or `ended`). Reasons: `unknown`, `expired`, `taken`, `cancelled`, `declined`, `disconnected`, `unpaired`. The relay serialises each slot's messages, so a confirm and an abort, decline or expiry never both take effect. It remembers ended slots for 1 hour.
  - **Only the parties act on a slot.** After the commit, only the slot's Mac and the committed phone may act; anyone else is refused `unknown` and learns nothing.
  - **A committed slot lasts 300 s from the commit**, with `ttl_s` (seconds left, never a timestamp) given to both sides. A Mac has one open slot at a time, and the limit is 30 opened per hour.
  - **`pair_confirm` is idempotent**, so a refused confirm means the relay holds no such pair.
  - **A pending pair is dropped only when the relay says it is over.** A device holding one asks with `pair_status` after each `welcome` and every 60 s. The relay answers from its pairs table first, so a restart can't hide a stored pair. No timer or clock decides.
  - **A cancelled pairing that the Mac confirmed anyway is unpaired by the phone** as soon as it sees the `paired`. The relay pushes only to phones that have acked the pair (`acked` is stored).
  - **One acked pair per Mac key and phone key.** Pairing again keeps the old pair until the phone acks the new one; the relay then deletes the old pair and sends `pair_replaced`, never `unpair`.
- Consequences:
  - The phone can say truthfully why a code failed. After a relay restart it can only say the code can't be used.
  - An offline device keeps a pending pair until it reaches the relay, instead of guessing. Clock changes don't affect pairing.
  - A failed, declined or cancelled re-pair leaves the old pair working. Briefly, two pairs between the same keys exist at the relay.
  - The protocol gains six control messages (`pair_decline` is now named; new: `pair_abort`, `pair_status`, `pair_state`, `pair_ended`, `pair_refused`, `pair_replaced`), an `acked` column, and a 1-hour in-memory record per ended slot, bounded per Mac by the slot limit.
  - Someone who can see each code ADE shows can still block pairing until the hour's slot limit is spent.
