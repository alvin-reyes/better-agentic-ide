# Bundled sources: ade-setup and the agent hub template

What a release bundles from other repositories, and the names other stories
must agree on.

- Spec: `docs/superpowers/specs/2026-11-09-bundle-ade-setup-and-hub-template-design.md` (revision 2).
- ADR: `decisions/0025-bundle-at-release-private-template-via-read-only-token.md`.
- Status: proposed 2026-11-09, not yet approved or built.

## ade-setup

- `vendor/ade-setup/VERSION` lines: `repo:`, `release: vX.Y.Z` (when a tag),
  `ref: <40-hex>`, `checksum: sha256:<64-hex>`, `vendored: YYYY-MM-DD`.
- `checksum` = sha256 of the UTF-8 text formed by, for each vendored file
  sorted by its path relative to `vendor/ade-setup/` (forward slashes), the
  line `<path>\0<sha256 hex of its bytes>\n`. `VERSION` itself is not included.
- `.gitattributes`: `vendor/ade-setup/** text eol=lf`.
- `scripts/syncAgents.mjs --sha <40-hex> --release <tag>`: fetches that commit
  by sha (`git init`, `git fetch --depth 1 <origin> <sha>`); `<origin>` is
  `ADE_SETUP_REPO` when set, else the GitHub URL.

## Agent hub template

- Resources (release builds only, gitignored, named only in
  `src-tauri/tauri.release.conf.json` `bundle.resources`, an object merged by
  RFC 7396 into the base object map):
  `src-tauri/resources/hub-template.tar.gz` and
  `src-tauri/resources/hub-template.json`.
- Manifest `hub-template.json`:
  `{"repo": "https://github.com/alvin-reyes/ai-agent-hub-template",
  "ref": "<40-hex>", "committed": "<ISO 8601>", "bundled": "YYYY-MM-DD",
  "files": <n>, "excluded": <n>, "sha256": "<hex of the .tar.gz>"}`.
- Tarball: `git archive` of `ref` (a commit reachable from the template's
  `main`), gzip `-n`, paths relative to the template root, regular files and
  directories only, no `.git/`.
- Excluded at **any depth** (one matcher, `scripts/hub-template/excludes.mjs`,
  used by the archive, the check and mirrored in Rust): `.env*`, `hub.conf`,
  `.ade/session.md`, `.claude/settings.local.json`, `.claude/worktrees/`;
  every file under `.ade/knowledge/` except `README.md`; every file under
  `memory/` except `MEMORY.md`. At the root only: `repos/`, `_bmad-output/`,
  `.local/`.
- Tauri commands: `hub_template_info() -> HubTemplateInfo | null` (the
  manifest), `hub_template_create(dest: string) -> {dest, files, ref}`;
  `dest` must be absolute and **must not exist**; its parent must exist.
- Palette entry id `hub-template-new`, label "Agent hub: New hub from
  template…", category Project, hidden on Windows. Folder chosen by a typed
  path (no native dialog, ADR 0021).

## Workflows

- `.github/workflows/bundle-sources.yml`: jobs `hub-template` and `ade-setup`;
  `workflow_call` and `workflow_dispatch` (dry run). Inputs:
  `ade_setup_ref` (40-hex, a release tag's commit), `hub_template_ref`
  (40-hex, on template main), `environment` (choice: `release` | `no-secret`),
  `dry_run`. Artifacts `bundled-ade-setup`, `bundled-hub-template`, each
  `retention-days: 1`; a dry run uploads `hub-template.json` only.
- `release.yml` `workflow_dispatch` inputs: `tag`, `ade_setup_ref`,
  `hub_template_ref`, passed through via `env:`.
- GitHub Environment `release` (deployment rule: tags `v*`, branch `main`)
  holds the secret `HUB_TEMPLATE_TOKEN` (fine-grained PAT, Contents: Read on
  the template repo only). Referenced only by the fail-closed check and the
  template checkout. Environment `no-secret`: same rule, no secrets (V1).
- Releases are drafts until `SHA256SUMS` is complete; a published tag is never
  rebuilt.
