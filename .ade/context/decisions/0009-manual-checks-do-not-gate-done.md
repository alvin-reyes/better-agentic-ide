# 0009: Manual checks don't gate Done

- Status: Accepted (owner, 2026-10-29).
- Context: Stories list manual checks that only the running app can answer: a WebKitGTK console with no IPC warning, a macOS iCloud file that isn't downloaded, an HTML snapshot that makes no network request. The agents work in containers with no GUI, so they can't run them. The Definition of Done (`.ade/rules.md` §3) names only the automated verification command, and the file hover previews plan (`_bmad-output/plan-file-hover-preview.md`) was the first to ask how its manual checks gate Done.
- Decision:
  - **The automated verification command decides Done.** A story whose four Definition of Done items hold is Done, whatever its manual checks.
  - **Manual checks are recorded, never assumed.** QA writes each one in the story's Verification section as "not run: needs the running app on <platform>; pending the owner", never as passed. The owner runs them in the app and records the result.
  - **A plan may make a named manual check a gate** in its own words, for example the hover plan's Story 5 timing check ("stop and raise it before the story is called Done"). That check then gates Done for that story only.
- Consequences:
  - Stories can be built and closed in containers without a GUI.
  - A Done story can still fail a manual check later. That is a new bug against the story, not a reopening of Done by assertion.
  - Manual checks pile up for the owner; each Verification section lists the ones still pending.
