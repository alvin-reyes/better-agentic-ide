# Coordinator knowledge

What the session that delegates to the sub-agents has learned about running this
project's flow without wasting tokens.

- 2026-11-15: One cloud session (29 Oct to 15 Nov) used about 850 M tokens: 804 M re-read from cache, 46 M written to cache, 5.3 M output, across 48 agents and 3,530 agent turns. Almost all of it was agents re-reading their own long history on every turn: the busiest averaged 250 K to 500 K tokens of context per turn and peaked near 830 K. The top 12 agents used 70 % of the agent total; the coordinator's own thread used 23 %.
- 2026-11-15: The causes, worst first:
  - agents resumed for weeks instead of started fresh (the CLI architect: 224 turns, 96 M; the CLI reviewer: 275 turns, 72 M);
  - long review loops: the F4 PRD went through 9 revisions and the design through 5, the CLI guard through 6 plan rounds and 4 code rounds, each round re-reading the whole document;
  - whole-document reads of the 4,000-line PRD and the 1,600-line design;
  - long reports relayed through the coordinator.
- 2026-11-15: The rules this project now follows (owner, 2026-11-15):
  1. **A fresh agent per task**, briefed with the exact files and sections it needs. Don't resume an agent whose context has passed about 150 K tokens; start a new one with a short summary instead.
  2. **Targeted reads**: name the sections ("§9 and §21", "WS-7 AC3"), never "read the whole PRD".
  3. **Stop at PASS WITH MINORS**: the author applies the minors and the coordinator checks the diff itself. No further full review round.
  4. **At most 2 review rounds per artifact.** If the second still blocks, take the remaining issue to the owner instead of looping.
  5. **Short reports**: ask for a verdict and the top findings, not every check. Keep the coordinator's own updates short too.
  6. **Start a new session** when the coordinator's context gets large, from a handoff note, rather than carrying a long conversation forward.
  7. **One review at a time** on an artifact; don't run reviews of drafts that are still being written.
