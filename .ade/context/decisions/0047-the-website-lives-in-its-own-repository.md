# 0047: The website lives in its own repository

- Status: Accepted (owner, 2026-11-21), with the plan `_bmad-output/plan-website-split.md`. Number provisional, like 0043 to 0046.
- Context: GitHub Pages served this repo's `docs/` (Jekyll) at ade.ardata.tech, so the public site shared a folder with the project documents (PRD, architecture, UX, plans), which needed an `exclude` list to stay unrendered, and site edits ran through ADE's CI.
- Decision:
  - The site (layouts, includes, data, assets, landing page, guide, training, agent hub, robots.txt, CNAME) lives in **better-ade/ade-website** under `site/`, built and deployed by GitHub Actions there.
  - The installers **stay here** at `docs/install.sh` and `docs/install.ps1`, tested by this repo's CI; ade-website's build copies them in (`.ade/context/website.md`), so the install URL is unchanged.
  - Tests that check the site against ADE's code (ADR 0007's colour check among them) move to ade-website and read a checkout of this repo. Tests of ADE's code alone stay here.
- Consequences:
  - A change here that makes the site wrong (a renamed palette command, a new MCP server, a recoloured role) no longer fails this repo's `npm test`. ade-website's CI catches it on its daily run or its next PR; the guide is updated there.
  - A new release's installers reach the site on ade-website's daily Pages run, or sooner by running that workflow by hand.
  - `docs/CNAME` stays until the domain moves to ade-website; it is removed then, with Pages here switched off.
