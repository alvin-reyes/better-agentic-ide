---
type: epic
title: "Agent status in ADE"
parent: initiative-phone-remote
covers: []
assignee: ""
risk: medium
---

# Agent status in ADE

## Description

ADE learns, pane by pane, what each Claude Code agent is doing, from a hook entry it adds per project, and shows a dot and a toast when one needs you. Spec: docs/superpowers/specs/2026-10-14-agent-status-design.md.

## Outcome

A user with several agent tabs sees which one is blocked on them without checking each tab.

## Done when

1. Turning on Agent status in a project shows needs-you and waiting on the tab and its Fleet card for a real Claude Code session.
2. A session outside ADE in the same project shows no hook error.
3. Turning it off leaves the settings file as it was.
4. The three owner checks pass, and the dev-build click-through is recorded.

## Boundaries

ADE only; nothing leaves the Mac. The deferred "not receiving events" warning and the worktree offer are not in it (deferred-work.md).

## References

- spec — docs/superpowers/specs/2026-10-14-agent-status-design.md
- plan — _bmad-output/initiative-phone-remote/plan-agent-status.md (built, PR #55)
- plan — _bmad-output/initiative-phone-remote/plan-agent-status-fixes.md (built, PR #56)

## Notes

- Decision: built before the ticket tree existed; its two plans stay at the initiative root, where PRs #55 and #56 and the journal point (2026-10-14).
