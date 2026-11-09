# Bundled sources: ade-setup and the agent hub template

What a release bundles from other repositories, and the names other stories
must agree on.

- Spec: `docs/superpowers/specs/2026-11-09-bundle-ade-setup-and-hub-template-design.md`.
- ADR: `decisions/0025-bundle-at-release-private-template-via-read-only-token.md`.
- Status: proposed 2026-11-09, not yet approved or built.

## ade-setup

- `vendor/ade-setup/VERSION` lines: `repo:`, `release: vX.Y.Z` (when a tag),
  `ref: <40-hex>`, `checksum: sha256:<64-hex>`, `vendored: YYYY-MM-DD`.
- `checksum` = sha256 of the UTF-8 text formed by, for each vendored file
  sorted by its path relative to `vendor/ade-setup/` (forward slashes), the
  line `<path>\0<sha256 hex of its bytes>\n`. `VERSION` itself is not included.

## Agent hub template

- Resources (release builds only, gitignored, named only in
  `src-tauri/tauri.release.conf.json`):
  `src-tauri/resources/hub-template.tar.gz` and
  `src-tauri/resources/hub-template.json`.
- Manifest `hub-template.json`:
  `{"repo": "https://github.com/alvin-reyes/ai-agent-hub-template",
  "ref": "<40-hex>", "committed": "<ISO 8601>", "bundled": "YYYY-MM-DD",
  "files": <n>, "sha256": "<hex of the .tar.gz>"}`.
- Tarball: `git archive` of `ref`, gzip `-n`, paths relative to the template
  root, no `.git/`. Excluded: `.ade/session.md`, `hub.conf`, `repos/`,
  `_bmad-output/`, `.local/`, `.claude/worktrees/`,
  `.claude/settings.local.json`, `.env*`.
- Tauri commands: `hub_template_info() -> HubTemplateInfo | null` (the
  manifest), `hub_template_create(dest: string) -> {dest, files, ref}`;
  `dest` must be empty.
- Palette entry id `hub-template-new`, label "Agent hub: New hub from
  template…", category Project.
- Actions secret: `HUB_TEMPLATE_TOKEN` (fine-grained PAT, Contents: Read on
  the template repo only). Read only by `bundle-sources`.
- `bundle-sources.yml` dispatch inputs: `ade_setup_ref`, `hub_template_ref`.
