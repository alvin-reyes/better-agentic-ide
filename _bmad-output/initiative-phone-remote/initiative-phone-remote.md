---
type: initiative
title: "Watch and steer ADE's agents from an iPhone"
parent: none
covers: []
assignee: ""
risk: high
---

# Watch and steer ADE's agents from an iPhone

## Description

An iPhone app that shows what the Claude Code agents in ADE's tabs are doing and, later, steers them, while ADE keeps running them on the user's own Mac. A relay only routes end-to-end encrypted messages. Built as four pieces, one epic each, plus the agent-status groundwork already done. Each piece has its own spec; the system-level constraints are in piece 1's spec, "The whole system".

## Outcome

Any ADE user can pair a free iPhone app with their Mac and learn within seconds, away from the desk, when an agent needs them, then answer it from the phone.

## Done when

1. The app is on the App Store and pairs with ADE by QR code, with no account needed to start.
2. A prompt in a background ADE tab reaches the phone as a push within about 3 seconds, and the phone shows that tab as needing you.
3. From the phone the user can approve or deny a permission prompt, send a prompt and run a `!` command in a Claude Code tab.
4. No content (titles, prompts, output) is readable by the relay or by Apple's push service.

## Boundaries

ADE's agent tabs, the relay, and the iOS app. Not cloud-hosted agents, not Android, not a full terminal on the phone. Tracer path: one tab's state goes from ADE through the relay to the phone.

- Touch point: Claude Code's hooks — ADE writes its hook entry to `.claude/settings.local.json`; owner: epic-agent-status

## References

- spec — docs/superpowers/specs/2026-10-14-agent-status-design.md, "The whole system"
- spec — docs/superpowers/specs/2026-10-14-relay-pairing-design.md
- constraint — piece 1 spec, standing constraints (Mac is the host, end-to-end only, off by default)

## Notes

- Decision: the Mac stays the host; a cloud relay only routes (owner, 2026-10-14).
- Decision: free for any ADE user; accounts and abuse controls are the last epic (owner, 2026-10-14).
- Decision: iOS app with Expo, shipped on TestFlight; not built on Claude Code's Remote Control, which an admin can disable (owner, 2026-10-14).
- Decision: watch first (epic 2), then steer (epic 3) (owner, 2026-10-14).
