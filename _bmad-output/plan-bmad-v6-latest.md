---
title: 'BMAD v6 tracks the latest upstream'
type: 'feature'
ticket: ''
created: '2026-11-21'
status: 'draft'
baseline_revision: ''
route: ''
route_source: ''
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ADE vendors BMAD v6 at bda3c59 ("6.13.0-next", 2026-10-06); upstream main is 71 commits ahead with review and token improvements (lenses inspect only #3079, gap lens files only named regressions #3106, triage by harm #3105, no-code review #3078). The v6 release tags still carry the old layout, so "latest" means upstream main.

**Approach:** `scripts/vendor-bmad-v6.sh` defaults to the newest upstream main commit (recorded in `VERSION`), re-vendor now, port any new `uv run` call site that `patchBmadSkills.ts` refuses to the ADE runtime, and keep the verification command green. Owner decision 2026-11-21: default to the latest BMAD version.

</frozen-after-approval>
