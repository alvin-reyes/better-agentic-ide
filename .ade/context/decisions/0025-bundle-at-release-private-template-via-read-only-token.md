# 0025: Bundle at release; the private hub template via a read-only token

- Status: Proposed (2026-11-09; owner decisions of 2026-11-09 taken as given, plan not yet approved)
- Revisions: 2026-11-09 first version; revised the same day after the adversarial review blocked it (B1, M1 to M7, N1 to N10).
- Context: Installers should need no download. ade-setup is vendored into the
  JS bundle, but at main's pin, which can lag its newest release. The agent hub
  template (`alvin-reyes/ai-agent-hub-template`) is private and was not
  shipped at all. The owner decided on 2026-11-09 to bundle the latest of both
  at release time (no runtime updates) and accepted that the template's files
  are readable inside the public installers while the repo stays private.
  ADR 0021 forbids the OS's native folder picker.
  Spec: `docs/superpowers/specs/2026-11-09-bundle-ade-setup-and-hub-template-design.md`.
- Decision:
  - A reusable `bundle-sources.yml`, called by `release.yml` before
    `create-release`, has two jobs that never share a runner:
    - `ade-setup` (`permissions: contents: read`): resolves the newest
      ade-setup release with `github.token`, refuses one published less than
      24 hours ago or semver-lower than main's pin (unless pinned by the
      `ade_setup_ref` input), fetches it **by sha**, re-vendors it
      **ephemerally** (no commit back), records `release`, `ref` and a tree
      `checksum` in `VERSION`, publishes the full diff against main's pin in
      the job summary and the release notes, and runs the whole `npm test`.
    - `hub-template` (`permissions: {}`, `environment: release`, no npm code):
      fails closed without `HUB_TEMPLATE_TOKEN`, checks out the template with
      it (`persist-credentials: false`), packs `git archive` of the commit
      with `:(exclude,glob)**/…` excludes, checks the tarball with the same
      matcher at any depth, and fails on any `gitleaks dir` finding over the
      unpacked files.
  - **Main-only rule (B1).** Only a template commit reachable from the
    template's `main` (`git merge-base --is-ancestor <commit> origin/main`) is
    ever bundled; `hub_template_ref` must be a 40-hex sha, never a branch
    name. Every bundle artifact has `retention-days: 1`. A dry run (the
    workflow dispatched on its own) uploads the manifest only, never the
    tarball. A cleanup job deletes the run's artifacts.
  - `HUB_TEMPLATE_TOKEN` is a fine-grained PAT (Contents: Read on the
    template only; it reads every branch) stored as a secret of the GitHub
    Environment `release`, whose deployment rule allows `v*` tags and `main`.
    It is referenced only by the fail-closed check and the checkout.
  - Of the template's `.ade/knowledge/` and `memory/`, only the scaffolds
    (`README.md`, `MEMORY.md`) ship.
  - Releases are created as drafts, every installer (`.app`, `.dmg`, `.deb`,
    AppImage) is asserted to carry the matching template before upload, and
    the release is published only after `SHA256SUMS` is complete. A
    **published tag is never rebuilt**; a fix ships as a new patch version.
  - In ADE, `hub_template_create` validates every entry before writing,
    accepts only regular files and directories, extracts into a temporary
    sibling with modes masked to `0o777`, renames into a destination that
    must not exist, and removes the temporary folder on any error. The UI
    takes a typed path (no native dialog) until ADR 0021's picker exists.
- Consequences:
  - Every release ships the newest ade-setup that is at least a day old, and
    its prompt text has no human review in this repository; the diff in the
    release notes is the after-the-fact record. A breaking ade-setup release
    blocks ADE's release until it is fixed or pinned back.
  - Main's committed ade-setup pin can lag what shipped; `sync:agents` PRs
    still update it. Local and PR CI test the committed pin.
  - Whatever is on the template's `main` becomes public at the next ADE
    release; other branches never do. Its git history does not ship.
  - The environment rule is only as strong as `main`'s review requirement and
    who can push `v*` tags.
  - Bundled bytes are reproducible only on the same runner image; installers
    are not reproducible. Reissuing a tag is not supported.
  - Releases depend on a token that expires; expiry fails the release loudly.
  - +about 0.9 MB per installer. One new Rust dependency (`tar` 0.4.46).
