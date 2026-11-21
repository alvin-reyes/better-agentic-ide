---
title: 'Adopt ade-method v2 and the specialist registry'
type: 'feature'
ticket: ''
created: '2026-11-21'
status: 'draft'
baseline_revision: ''
route: ''
route_source: ''
risk: 'high'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ade-method v2 (better-ade/ade-method PR #7) replaces 19 roles with four core roles (product, architect, developer, reviewer), drops BMAD v4, and lists the BMAD skills a project gets by default, on demand or never (`ade.json`); specialists (frontend, backend, devops, sysadmin, qa, security-reviewer, analyst, monitor) move to better-ade/ade-agent-registry and load only when a task needs one. ADE still parses the 19 v1 roles from `vendor/ade-setup/`.

**Approach:** `npm run sync:agents` vendors ade-method v2 into `vendor/ade-method/` (renamed from `vendor/ade-setup/`, remote better-ade/ade-method) and the registry's `registry.json`; the agent picker shows the core roles and offers specialists from the registry on demand; a new project gets only `ade.json`'s default BMAD skills and its `bmad/custom` overrides. Owner decisions 2026-11-21: slim core roles, specialists on demand, low token use; orchestrator and builder on any provider, default Anthropic Opus 5.5.

</frozen-after-approval>
