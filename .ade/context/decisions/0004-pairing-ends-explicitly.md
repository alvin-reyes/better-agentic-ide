# 0004: A pairing attempt ends explicitly, and a pending pair is dropped only on a definitive answer

- Status: Proposed (2026-10-15). Amends the owner-approved 2a spec `docs/superpowers/specs/2026-10-14-relay-pairing-design.md` ("Pairing: commit, then reveal"); needs the owner's approval before the build uses it. The protocol contract will be `.ade/context/remote-protocol.md`.
- Context: The review of the phone app UX found that 2a's pairing had no answer for a refused commit, no way to cancel, a slot that could expire while the user compared codes, and a 10-minute pending-pair timer that could race a `paired` held at the relay and silently undo a confirmed pairing, which 2a forbids. Slots live in the relay's memory, so a restart loses them.
- Decision:
  - **Every way a slot ends is said out loud.** `pair_refused {slot, reason}` (`unknown`, `expired`, `taken`, `closed`) answers any pairing message the slot can't take, and nothing is stored. `pair_ended {slot, reason}` (`expired`, `cancelled`, `disconnected`) tells a side that the other cancelled (`pair_abort`), that the slot ran out, or that the other dropped before the reveal. The relay serialises each slot's messages, so a confirm and an abort or expiry never both take effect. Ended slots are remembered for 1 hour so `expired` and `taken` can be told apart.
  - **A committed slot lasts 5 minutes from the commit.**
  - **A pending pair is dropped only by a definitive answer**, or by a `welcome` that arrives after its persisted wall-clock deadline (send time plus 10 minutes) without completing it. The relay sends any un-acked `paired` before `welcome`, so `welcome` marks the end of what it holds. Never by a timer alone.
  - **A cancelled pairing that the Mac confirmed anyway is unpaired by the phone** as soon as it sees the `paired`, and the relay pushes only to phones that have acked the pair.
  - **One pair per Mac key and phone key.** Storing a new pair replaces the old in one step, and the old stays until the new one is confirmed.
- Consequences:
  - The phone can show "expired", "already in use" and "cancelled on the Mac" truthfully; after a relay restart it can only say the code can't be used.
  - An offline phone keeps a pending pair until it reaches the relay, however long that takes, instead of guessing.
  - A phone clock that jumps forward more than 5 minutes during pairing can end the pairing, but always cleanly on both sides.
  - Two more control messages and a 1-hour in-memory record per slot at the relay; slots are already limited to 5 per hour per Mac.
