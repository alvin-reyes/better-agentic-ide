# 0025: Bundle at release; the private hub template via a read-only token

- Status: Proposed (2026-11-09; owner decisions of 2026-11-09 taken as given, plan not yet approved)
- Context: Installers should need no download. ade-setup is vendored into the
  JS bundle, but at main's pin, which can lag its newest release. The agent hub
  template (`alvin-reyes/ai-agent-hub-template`) is private and was not
  shipped at all. The owner decided on 2026-11-09 to bundle the latest of both
  at release time (no runtime updates) and accepted that the template's files
  are readable inside the public installers while the repo stays private.
  Spec: `docs/superpowers/specs/2026-11-09-bundle-ade-setup-and-hub-template-design.md`.
- Decision:
  - A `bundle-sources` job runs before `create-release` in `release.yml`. It
    re-vendors the newest ade-setup release **ephemerally** (no commit back to
    main), records `release`, `ref` and a tree `checksum` in `VERSION`, runs
    the whole `npm test`, and fails the release before the GitHub release is
    created if anything is red. One resolution per run is handed to every
    build job as an artifact.
  - It checks out the template with `HUB_TEMPLATE_TOKEN` (fine-grained PAT,
    Contents: Read on that repo only, `persist-credentials: false`), and packs
    `git archive` of that commit, minus an exclusion list, into
    `resources/hub-template.tar.gz` plus `hub-template.json` (repo, ref,
    sha256). A missing token fails the release; PR and local builds skip with
    a message. The resources are named only in `tauri.release.conf.json` and
    are gitignored.
  - Reproducibility of a tag comes from recording the inputs (release notes,
    `hub-template.json`) and a dispatch input to pin them, not from the tag's
    tree.
- Consequences:
  - Every release ships the newest ade-setup, and a breaking ade-setup
    release blocks ADE's release until it is fixed or pinned back.
  - Main's committed ade-setup pin can lag what shipped; `sync:agents` PRs
    still update it. Local and PR CI test the committed pin.
  - Whatever is on the template's `main` becomes public at the next ADE
    release. Its git history does not ship.
  - Releases depend on a token that expires; expiry fails the release loudly.
  - +about 0.9 MB per installer. One new Rust dependency (`tar`).
