# Product manager: what is true about this project

- 2026-10-29: There is no docs/prd.md. Product intent lives in README.md, docs/index.html (the website) and the per-feature plans in _bmad-output/ (some only on plan/* branches or scratchpad worktrees); read those before writing scope.
- 2026-10-29: An Orchestrator tab (Anthropic API chat that plans and dispatches agents, src/stores/orchestratorStore.ts, docs/plans/2026-02-27-orchestrator-mode-*.md) is reachable from the command palette but absent from the README and website; check it before claiming ADE has no planning UI of its own.
- 2026-10-29: Today's permission rules are read-deny (context diet), the archive deny and attribution-off only; ask rules exist only in the Orgo and CLI-library plans. Don't describe ADE as "asking before risky commands" until those ship.
