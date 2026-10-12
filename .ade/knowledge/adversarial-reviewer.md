# Adversarial reviewer: project knowledge

- 2026-10-11: The CLAUDE.md BMAD bullet has shipped in four texts; diff them with `git show <rev>:src/lib/projectMethodology.ts` at v0.17.0, 3dc4ace, v0.19.0 and HEAD. `project_setup_apply` is invoked from three places in src/lib/projectSetup.ts (apply, addStackAgents, addAgent), two with `full: false`. The cd hook runs a full setup only while `wasSetUp(root)` is false (localStorage), and shows no toast when `isComplete(status)`.
