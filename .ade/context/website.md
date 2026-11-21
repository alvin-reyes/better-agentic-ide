# The website and the installers

- **Status:** recorded 2026-11-21 (ADR 0047).
- The site is **better-ade/ade-website** (`site/`), served at https://ade.ardata.tech.
- Its Pages build runs `scripts/fetch-installers.sh`, which downloads from this repo,
  by path: `docs/install.sh` and `docs/install.ps1`, at the latest GitHub release's tag
  when that tag has both, else at `main`. The pair always comes from one ref, and
  `install.sh` must start with `#!`.
- So: **do not move or rename `docs/install.sh` or `docs/install.ps1`** without
  changing ade-website's script in the same release. `scripts/websiteSplit.test.ts`
  guards that they exist.
- ade-website's tests read this repo's source by path (for example
  `src/data/mcpCatalog.ts`, `src/data/pickerItems.ts`, `src/data/agentColors.ts`,
  `src/components/CommandPalette.tsx`, `src-tauri/src/orgo_rules.rs`,
  `src-tauri/src/bmadswitch.rs`). Moving one of those breaks ade-website's CI, not this repo's.
