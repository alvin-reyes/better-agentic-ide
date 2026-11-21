---
title: 'Move the website to better-ade/ade-website'
type: 'chore'
created: '2026-11-21'
status: 'in-review'
route: 'lean'
context: ['.ade/context/decisions/0047-the-website-lives-in-its-own-repository.md', '.ade/context/website.md']
---

Design note (lean). Plan approved by the owner 2026-11-21. The domain switch is done
afterwards by the coordinator with the owner; this change does not touch Pages
settings, the custom domain or DNS.

## What moves, what stays (each `docs/` item)

| Item | Decision | Why |
|---|---|---|
| `_config.yml`, `_layouts/`, `_includes/`, `_data/`, `assets/` | moves | Jekyll site machinery |
| `index.html`, `guide/`, `training/`, `agent-hub/`, `robots.txt` | moves | site pages |
| `ade_logo.png` | moves | served at the site root; no site page links it, but it is a public URL. The app's own copy is `public/ade_logo.png` and the README's is the root one |
| `CNAME` | copied to ade-website; **stays here** until the switch | Pages here must keep serving until then |
| `install.sh`, `install.ps1` | **stay** | owned and tested by this repo's CI against releases; ade-website fetches them at build time |
| `prd.md`, `architecture.md`, `ux-spec.md`, `mockup.html`, `plans/`, `superpowers/`, `bmad-vendoring.md` | **stay** | project documents, all in the old `exclude` list, none linked from the site |

## Tests

- Move to ade-website (they read the site): `agentColorsSite`, `siteClaims`, `siteCsp`,
  `siteThemeContrast`, `setupGuide` (every case reads the guide), `guideOpen` (as
  `guideTerminal`), the guide half of `mcpCatalogDocs` and the guide case of
  `bmadTaskRefs`. Those that compare the site with ADE read an ade-terminal checkout.
- Stay: the README count in `mcpCatalogDocs`, the agent-file cases of `bmadTaskRefs`.
- New here: `scripts/websiteSplit.test.ts` (docs/ holds no site, the installers are
  where ade-website fetches them, the README links no moved file).
- New there: `tests/fetchInstallers.test.ts` for the fetch script.

## Other changes here

- README images point at `https://ade.ardata.tech/assets/img/…`; CONTRIBUTING's
  `docs/` row and "fix the site" bullet point at ade-website.
- `scripts/use-custom-domain.sh` is removed: it wrote `docs/CNAME` and `docs/_config.yml`
  for the first domain switch, and `_config.yml` is gone.
- `docs/architecture.md`'s publishing note is updated.

## Merge order (the risk)

Merging this before the switch empties the live site: Pages here would serve `docs/`
with no layouts or index. Order: merge ade-website, switch the domain to it, check
`/` and `/install.sh`, then merge this and remove `docs/CNAME` with Pages here off.

## Defaults applied

- Site source under `site/` in ade-website, so README, tests and tooling stay out of Jekyll.
- `github-pages` gem (Ruby 3.3) for the build, so output matches the old branch build
  (checked locally: only timestamps and cache-busting query strings differ).
- Actions pinned by commit SHA. Pages and CI also run daily, to pick up new installers
  and catch drift between the site and this repo.
