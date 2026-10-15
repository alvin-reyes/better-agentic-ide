---
type: epic
title: "Watch ADE's agents from the phone"
parent: initiative-phone-remote
covers: []
after: []
assignee: ""
risk: high
---

# Watch ADE's agents from the phone

## Description

Piece 2a: a Rust relay on Fly.io, QR pairing with device keys, end-to-end encryption, ADE's Remote bridge, push, and a minimal Expo app on TestFlight that shows each tab's state. Read-only. The spec owns every rule: docs/superpowers/specs/2026-10-14-relay-pairing-design.md.

## Outcome

The owner, away from the Mac, gets a push within about 3 seconds when an agent needs them and sees which tab it is on their phone.

## Done when

1. The spec's manual check passes: TestFlight build paired with a dev ADE on the Fly relay; push, state, answer at the Mac, unpair.
2. The approved verification command passes on a fresh checkout and in CI (all five lines).
3. The canary test proves the relay never holds plaintext.
4. `/health` answers at the deployed relay, and docs/ops.md has its relay section.

## Boundaries

Watching only: nothing the phone sends can run anything on the Mac (that is epic-phone-steer). Not accounts (epic-public-service), not the designed app (epic-phone-app), not Android.

- Touch point: Agent status (`AgentStatus::current()`, per-pane states) — read only; owner: epic-agent-status

## References

- spec — docs/superpowers/specs/2026-10-14-relay-pairing-design.md
- contract — .ade/context/agent-events.md
- constraint — piece 1 spec, "The whole system", standing constraints

## Notes

- Decision: 15 stories in one epic with lanes relay, protocol, ADE and app; the refactor sweep and the closing manual check kept (owner, 2026-10-14).
- Decision: story 2 (login and presence) is the tracer bullet; story 4 (Noise IK in TypeScript) follows early as the least certain (2026-10-14).
- Waits on epic-agent-status because: the bridge reads `AgentStatus::current()`, merged with PRs #55 and #56.
