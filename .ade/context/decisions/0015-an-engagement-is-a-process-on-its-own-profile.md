# 0015: An engagement is an ADE process on its own profile, found through one path resolver

- **Status:** Accepted (2026-11-08). Approved by the owner on 2026-11-08 with the F1 plan; accepted on 2026-11-08, when the delta review of revisions 5 to 5g of the F1 design passed. With the F1 design (`docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`, sections 2 and 3).
- **Revisions:** 2026-11-08 first version; revision 3 the same day adds the no-follow delete (M-b).
- **Context:** PRD F1 (D14, D15) requires that nothing of an engagement is shared by construction, across ADE's stores, the webview's, the temp folder, shell history and Claude Code's config dir. Today ADE has one data set, and some files live outside app data (`~/.ade/images`, `~/.ade/roles`, the crash log, `~/.cache/ade`), while five features read `~/.claude` directly.
- **Decision:**
  - Each engagement runs as its own ADE process on a profile.
  - **Profile id:** 16 random hex characters, opaque.
  - **Profile root:** `<data dir>/com.betterterminal.dev.profiles/<id>`. It is `%LOCALAPPDATA%` (not roaming) on Windows, and a sibling of the default's app data, not inside it.
  - **The default profile** keeps today's paths.
  - **One resolver.** `profile.rs` (`ProfilePaths`) answers every path per profile, and `profilePaths.ts` is its frontend mirror. A static test bans building those paths anywhere else; this widens PE-4 AC5's test.
  - **Claude Code** gets `CLAUDE_CONFIG_DIR=<root>/claude`, and `CLAUDE_CODE_TMPDIR`, `TMPDIR`, `TMP` and `TEMP` all `=<root>/tmp`.
- **Consequences:**
  - Isolation follows from separate processes, and the isolation test checks it rather than trusting it.
  - One window per engagement process, as D14 accepts.
  - Every existing path call site moves to the resolver, one story-sized refactor in slice 1.
  - Deleting an engagement is deleting one folder, plus its OS secret store entries and Claude Code's macOS Keychain item. The folder is deleted without following links: under ADR 0023 it holds `claude-home/Library/Keychains`, a link to the user's real Keychains, which a following delete would wipe (one helper, `fsx::remove_tree_no_follow`, with a planted-link test).
  - Claude Code's MCP logs on macOS and Windows stay outside unless the owner chooses O1 option A (ADR 0023), a split home for the Claude process (R3, design O1, re-issued).
