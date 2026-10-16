---
title: 'Color-coded agents in ADE and on its website'
type: 'feature'
ticket: ''
created: '2026-10-16'
status: 'draft'
baseline_revision: '25157f637e0780d7b013042755a5c3b8a547145e'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['.ade/context/decisions/0007-agent-colors-live-in-ade-keyed-by-role.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When several agents run at once nothing tells them apart by sight. PR #65 hand-added a `color:` line to this repo's eight `.claude/agents/*.md`, but ADE writes those files for every project without one, the fleet view paints every lane by status alone, the 47 curated profiles carry colors chosen by category rather than by role, and the website shows no agent colors.

**Approach:** One role-to-color map in ADE, keyed by role id, covering all nineteen roles with Claude Code's eight color names. ADE writes the matching `color:` line into every sub-agent file it generates (the eight core roles and the curated profiles); the fleet view colors each lane by its role; each curated profile takes its role's color; the website's org chart, fleet demo and `.claude/agents/` listing show the same colors, held to the map by a test.

## Boundaries & Constraints

**Always (owner's decisions, 2026-10-16):**
- Scope is product and website: generated sub-agent files, the fleet view, the profiles (and every surface that shows a profile's color), and `docs/index.html` with `docs/assets/css/site.css`.
- Only Claude Code's eight names are used: red, blue, green, yellow, purple, orange, pink, cyan.
- The eight delivery roles keep PR #65's mapping exactly: adversarial-reviewer red, architect blue, product-manager purple, designer pink, scrum-master cyan, developer green, qa yellow, devops orange.
- The other eleven roles share the nearest color by kind of work; the owner's examples are fixed: security-engineer red, sre orange, technical-writer purple.
- Each of the 47 curated profiles takes its role's color.

**Always (this plan):**
- One source of truth: `src/data/agentColors.ts` (ADR 0007). Nothing else holds a role color or a hex for one; app and website are tested against it.
- A lane, file or item whose type is not one of the nineteen roles and not a curated profile gets the neutral, never a guessed role.
- The verification command is unchanged.

**Never:**
- No change under `vendor/ade-setup/`, no change in the ade-setup repo, no `npm run sync:agents`.
- No change to how setup decides what to write: it still writes only missing files and never overwrites. Existing projects' role files are not rewritten (see Open questions).
- No change to the Rust side (`src-tauri/`), the relay or `mobile/`.
- No change to the agent picker's category filter pills (`CATEGORY_COLORS` in `AgentPicker.tsx`), the provider chips, or `CommandPalette`/`Scratchpad` category colors: they color categories and providers, not agents.
- No plugin version bump (precedent: the plugin's agent files have changed five times at 1.1.0).

## The color table

| Role id | Color | Why this color |
|---|---|---|
| adversarial-reviewer | red | owner (PR #65) |
| architect | blue | owner (PR #65) |
| product-manager | purple | owner (PR #65) |
| designer | pink | owner (PR #65) |
| scrum-master | cyan | owner (PR #65) |
| developer | green | owner (PR #65) |
| qa | yellow | owner (PR #65) |
| devops | orange | owner (PR #65) |
| security-engineer | red | owner: tries to break it, like the reviewer |
| sre | orange | owner: keeps it running, like DevOps |
| technical-writer | purple | owner: writes the record others read, like the PM |
| analyst | purple | discovery and the brief that feeds the PRD |
| advisor | purple | strategy and content guidance, no delivery artifact |
| brainstorming-architect | blue | designs, does not code: the architect's work |
| solutions-engineer | blue | the technical answer and integration design |
| product-owner | cyan | slices and orders the backlog: the scrum master's work |
| engineering-manager | cyan | flow, order and what is stuck |
| support-engineer | yellow | turns a report into a reproduction: quality |
| release-manager | orange | go/no-go, changelog, rollback: release engineering |

Per color: red 2, blue 3, purple 4, pink 1, cyan 3, green 1, yellow 2, orange 3.

**Hex values.** All of ADE's nine themes are dark (darkest `#0A0B0D`, lightest Nord `#2e3440`); the website has a light and a dark theme, and its fleet demo and file tree sit on `--term-bg`, which is dark in both. So each name has a dark-surface hex (app, site dark theme, site terminal surfaces) and a light-surface hex (site light theme only). Ratios below were computed with the WCAG formula.

| Name | Dark-surface hex | vs `#0A0B0D` / Nord | Light-surface hex | vs `#ffffff` | Source of the dark hex |
|---|---|---|---|---|---|
| red | `#ff7b72` | 7.8 / 5.0 | `#cf222e` | 5.4 | curatedAgents (General) |
| blue | `#58a6ff` | 7.8 / 4.9 | `#0969da` | 5.2 | curatedAgents (Frontend) |
| green | `#3fb950` | 7.8 / 4.9 | `#1a7f37` | 5.1 | curatedAgents (Backend), site `.fleetx` |
| yellow | `#d29922` | 7.8 / 5.0 | `#9a6700` | 4.9 | curatedAgents (Testing) |
| purple | `#bc8cff` | 7.8 / 5.0 | `#8250df` | 5.1 | curatedAgents (DevOps) |
| orange | `#f0883e` | 7.8 / 4.9 | `#bc4c00` | 5.0 | curatedAgents (Web3) |
| pink | `#f778ba` | 7.8 / 5.0 | `#bf3989` | 5.1 | new (GitHub dark palette) |
| cyan | `#39c5cf` | 9.4 / 6.0 | `#1b7c83` | 4.9 | new (GitHub dark palette) |
| neutral | `#8b949e` | 6.4 / 4.1 | `#59636e` | 6.1 | `ROLE_COLOR` in `pickerItems.ts` |

Every value clears 4.5:1 on its surface, so it is safe for text as well as fills. `#a371f7` (the architects' current purple) is not used: `#bc8cff` matches the others' luminance.

</frozen-after-approval>

## Code Map

- `src/data/roles.ts` -- the nineteen vendored roles (`ROLES`, `ROLE_ORDER`); no color here.
- `src/lib/projectMethodology.ts:67-122` -- the eight core `ROLES` (with `tools`, `model`); `roleFile` :404-409 writes the frontmatter `name, description, tools?, model?`; `agentCatalog` :447 makes profile files with `agentMarkdown`.
- `src/lib/pluginContent.ts:67-69` -- `agentMarkdown(p)`: the profile sub-agent file, used both for project files (`agentCatalog`) and for the plugin (`claude-plugin/plugins/ade/agents/*.md`, 7 files, pinned by `scripts/pluginContent.test.ts`, regenerated with `npm run gen:plugin`).
- `src/data/curatedAgents.ts` -- `CuratedAgent.color`: 47 literal hexes by category; `AGENT_CATALOG` :403 maps them to `CatalogAgent`.
- Profile color consumers (all read `.color` off a catalog or picker item): `src/data/pickerItems.ts:60` (curated items), `:72` (bare roles, neutral `ROLE_COLOR`); `src/components/AgentPicker.tsx:567` (suggested badge), `:607` (selected row border), `:618-626` (icon tile), `:652` (row badge), `:739` ("Run X in" name). `AgentPicker.tsx:372` and `SettingsPanel.tsx:893/942` are provider colors, not agents: untouched. `OrchestratorTab.tsx` reads profiles but not their color.
- `src/stores/fleetStore.ts:76-118` -- `FleetLane.roleId` already resolved: an agent lane from its session's `roleId`, a sub-agent lane from `roleIdOf(agentType)` (role id, else curated profile's `roleId`, else null for `Explore`, `Plan`, `general-purpose`).
- `src/components/fleet/FleetTimeline.tsx:17-21,140-148` -- bar fill is `#a855f7` for every sub-agent and `STATUS_COLOR[status]` (green / grey / red) for agent lanes; label at :125-132.
- Website: `docs/index.html:89-92` (`.claude/agents/` listing in `.feat-media.tree pre`), `:108-137` (`.fleetx` demo), `:268-300` (org chart, 19 `.org-node`s in three tiers); `docs/assets/css/site.css:8-90` (theme tokens: light `:root`, dark under `prefers-color-scheme` and under `[data-theme="dark"]`), `:299-301` (tree), `:859-866` (`.org-node`), `:905-946` (`.fleetx`).
- `docs/guide/agents.md:73-80` -- Fleet view section.
- `.claude/agents/*.md` (this repo) -- byte-identical to `roleFile(r, "v6")` plus PR #65's `color:` line, which sits last in the frontmatter, exactly where `roleFile` will now write it (checked 2026-10-16: all eight identical once the line is removed).

## Design Notes

**The map, `src/data/agentColors.ts`.** Exports the type of the eight names; the nineteen-row role-to-name table; each name's `{ dark, light }` hex; the neutral `{ dark, light }`; `roleColor(roleId)` returning a name or null; `roleColorHex(roleId)` returning the dark hex, or the neutral's for null or an unknown id. The app uses dark hexes only (every app theme is dark). Nothing else in `src/` may hold a role-to-color table.

**Generated files.** `roleFile` appends `color: <name>` as the last frontmatter key, after `model`, so this repo's eight files come out byte-identical to PR #65's. `agentMarkdown` appends `color: <name>` after `description`, from the profile's `roleId`. `npm run gen:plugin` rewrites the seven plugin agent files with the line. Every curated profile has a role in the table, so no generated file lacks the line.

**PR #65's hand-added lines.** They stay: they are exactly what the generator now writes. Setup never overwrites and its status check (`project_setup_status`) asks only whether paths exist, so a hand-added line was never drift and setup will not touch it; a BMAD switch moves the core role files aside and writes fresh ones, which now carry the line. A test pins this repo's eight `color:` lines to the map, so they cannot drift from it.

**Existing projects.** Get the line only where ADE writes a fresh file: a new project, a role file or profile added from the Agents tab, a BMAD switch. Upgrading untouched role files in place is not in this story.

**Profiles.** `color` is removed from `CuratedAgent` and the 47 literals are deleted; `AGENT_CATALOG` sets `color` from `roleColorHex(agent.roleId)`. Resulting changes (role: profiles, old hex → new):
- developer (14: backend-api, backend-db, backend-go, backend-rust, frontend-ui, frontend-state, general-debug, general-git, web3-solidity, web3-gas, web3-solana, mobile-engineer, data-pipeline-engineer, agent-engineer) → green `#3fb950`
- brainstorming-architect (11 arch-*) `#a371f7` → blue `#58a6ff`; architect (backend-auth, general-architect) → blue
- devops (devops-docker, devops-ci, devops-infra, devops-k8s, web3-devops) → orange `#f0883e`; sre (sre-observability, sre-incident) → orange
- qa (test-unit, test-e2e, test-perf, eval-engineer) → yellow `#d29922`
- adversarial-reviewer (general-review, web3-auditor), security-engineer → red `#ff7b72`
- designer (frontend-css) → pink `#f778ba`
- technical-writer (general-docs), advisor (general-interview, general-linkedin-leader, general-cofounder), analyst (general-brainstorm) → purple `#bc8cff`

Bare roles in the picker (`ROLE_ITEMS`) take their role's color instead of the neutral `ROLE_COLOR`; the "Roles" filter pill stays neutral. The picker's row badge still reads the category ("Backend"), now in the role's color.

**Fleet lanes.** Every lane's bar is filled with `roleColorHex(lane.roleId)`: agent lanes and sub-agent lanes alike, the neutral when `roleId` is null (Explore, Plan, general-purpose, a session with no role). The label gets an 8px dot in the same color, so the color reads on a 9px sub-agent bar too. Status moves off the fill: running at opacity 0.9, completed at 0.55 (as today), cancelled at 0.55 with a 1px dashed `var(--text-muted)` border and "(cancelled)" in the title. The bar carries `data-agent-color` (the name, or `none`) and `data-status`, which tests read; jsdom reports colors as `rgb(...)`, so tests compare against the converted hex. `STATUS_COLOR` and the `#a855f7` literal are removed. `FleetSummary`'s green "running" count is unchanged.

**Website.**
- Tokens: `--agent-red` … `--agent-cyan` and `--agent-none` in `site.css`, light hexes on `:root`, dark hexes in both dark blocks (the `prefers-color-scheme` one and `[data-theme="dark"]`), and dark hexes again on `.feat-media--live` and `.feat-media.tree`, which are dark in both themes. One rule per name maps `[data-agent-color="<name>"]` to `--agent-c: var(--agent-<name>)`.
- Org chart: each `.org-node` gets `data-role="<role id>"` and `data-agent-color="<name>"`; `.org-node[data-agent-color]` gets a 3px left border in `var(--agent-c)`. The "You" node stays as it is.
- Fleet demo: each `.fleetx-lane` gets `data-agent-color`; `.fleetx-bar` fills with `var(--agent-c)`. developer green, qa yellow, Explore and Plan `none`. The "Code reviewer" sub-agent becomes "adversarial-reviewer" (red), a real ADE sub-agent, so the demo shows a sub-agent colored by role; the `aria-label` says so. Running lanes keep full opacity and finished ones dim, mirroring the app; the green `.is-running` override and the purple `#6e40c9` default are removed.
- `.claude/agents/` listing: each of the eight file names is wrapped in `<span data-agent-color="<name>">`, colored with `var(--agent-c)`.

**Guide.** One bullet under "Fleet view" in `docs/guide/agents.md`: each lane is colored by its role, with the same colors as the `color:` line ADE writes into `.claude/agents/`; sub-agents that are not one of ADE's roles (Explore, Plan) are grey; finished lanes are dimmed and cancelled ones outlined.

**Contract.** The build adds `.ade/context/agent-colors.md`: the table, the hexes, the neutral rule, where the map lives. ADR 0007 records why it lives in ADE.

**Stories.** One story. The website needs the map and its parity test is what keeps the two in step, so splitting would ship one surface untested against the other. An ade-setup change (colors in ade-setup's own copies) is not needed for any criterion here; if the owner wants it, it is a separate story in that repo, released on merge, and needs the owner's go-ahead.

## Acceptance Criteria

Each criterion names the test that covers it; the developer writes it failing first.

1. Given the nineteen vendored roles, then each has exactly one entry in the map, the map has no other entry, every value is one of the eight names, and the eight delivery roles and the three owner examples have the colors in the table. -- `src/data/__tests__/agentColors.test.ts` › "covers every vendored role with one of Claude Code's eight colors" and "keeps the owner's mapping"
2. Given the map, then every name has a dark and a light hex, and each reaches 4.5:1 against `#0A0B0D` and `#2e3440` (dark) or `#ffffff` (light); so does the neutral. -- `agentColors.test.ts` › "every hex is readable on the surfaces it is used on"
3. Given `methodologyFiles(...)` on v6 and on v4, then each of the eight `.claude/agents/*.md` has `color: <its name>` as the last frontmatter key. -- `src/lib/__tests__/projectMethodology.test.ts` › "role files carry their role's color last in the frontmatter"
4. Given `agentCatalog()`, then every profile file has `color:` equal to its role's name. -- `projectMethodology.test.ts` › "profile files carry their role's color"
5. Given the plugin files on disk, then they match `generatedPluginFiles()` including the `color:` line. -- `scripts/pluginContent.test.ts` › existing "matches the files in claude-plugin/" (files regenerated)
6. Given this repo's `.claude/agents/*.md`, then each file's `color:` line equals the map's name for that role. -- `scripts/agentColorsSite.test.ts` › "this repo's own sub-agents use the map's colors"
7. Given `AGENT_CATALOG`, then every profile's `color` is its role's dark hex, and `CuratedAgent` has no `color` field (no hex literal remains in `curatedAgents.ts`). -- `agentColors.test.ts` › "every curated profile takes its role's color"
8. Given `PICKER_ITEMS`, then a curated item and a bare-role item each carry their role's dark hex. -- `src/data/__tests__/pickerItems.test.ts` › "picker items are colored by role" (new case in the existing file)
9. Given fleet lanes with `roleId` "qa", "developer" and null, when `FleetTimeline` renders, then the bars carry `data-agent-color` yellow, green and none with matching backgrounds, and a dot of the same color sits by each label. -- `src/components/fleet/__tests__/FleetTimeline.test.tsx` › "colors each lane by its role, neutral when it has none"
10. Given a running, a completed and a cancelled lane of the same role, then all three have the same fill, opacities 0.9 / 0.55 / 0.55, and only the cancelled one has a dashed border and "(cancelled)" in its title. -- `FleetTimeline.test.tsx` › "shows status without changing the role's color"
11. Given `site.css`, then `--agent-<name>` equals the map's light hex on `:root` and its dark hex in both dark blocks and on `.feat-media--live` and `.feat-media.tree`, and `--agent-none` likewise for the neutral. -- `scripts/agentColorsSite.test.ts` › "site color tokens equal the map in both themes and on terminal surfaces"
12. Given `docs/index.html`, then the org chart has one `.org-node` per role id (all nineteen), each with `data-agent-color` equal to the map; the `.claude/agents/` listing colors each of the eight files by the map; every fleet demo lane is colored by the map from its name, `none` for Explore and Plan. -- `agentColorsSite.test.ts` › "org chart, agents listing and fleet demo use the map"
13. Given `docs/assets/css/site.css`, then no `.fleetx` or `.org-node` rule sets a hex color for a lane bar or node border (only `var(--agent-c)`). -- `agentColorsSite.test.ts` › "no hard-coded agent color on the site"
14. Existing site tests keep passing (`siteClaims.test.ts`, `siteThemeContrast.test.ts`, `siteCsp.test.ts`): no new inline script or style element. -- existing tests

## Open Questions (owner)

1. **Fleet status cue.** Coloring bars by role takes the fill away from status, so a running lane is no longer green. This plan shows status by opacity and a dashed outline for cancelled. Alternative: keep status fills and show role only as the label dot and the sub-agent bars. The plan assumes the first, since "colors each lane by role" was decided.
2. **Existing projects.** Setup never overwrites, so projects set up before this ship get no `color:` lines until a switch or a re-add. A later story could add the line in place to role files still byte-identical to a shipped version (the method `CLAUDE.md`'s BMAD paragraph already uses). In or out?
3. **ade-setup.** Not needed here. Do you want a follow-up in the ade-setup repo so its own copies carry the same colors? It publishes a release on merge.

## Verification

**Commands (the repo's verification command, unchanged):**
- `cd relay && cargo test` -- expected: all pass
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including the new `agentColors.test.ts`, `agentColorsSite.test.ts` and the new cases above
- `cd src-tauri && cargo test` -- expected: all pass (no Rust change)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: exit 0, all pass (no mobile change)

**Manual checks:**
- In the running app, open the Fleet view while an ADE role sub-agent and an Explore sub-agent run: the role lane is in its color, Explore is grey.
- Open the agent picker: profiles are in their role's color; category pills unchanged.
- Serve `docs/` and view the home page in light and dark themes: org chart borders, fleet demo bars and the `.claude/agents/` names are colored and legible.
- In a new project set up by ADE, start Claude Code and delegate to `qa`: Claude Code shows it in yellow.
