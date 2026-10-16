---
title: 'Color-coded agents in ADE and on its website'
type: 'feature'
ticket: ''
created: '2026-10-16'
status: 'ready-for-dev'
baseline_revision: '25157f637e0780d7b013042755a5c3b8a547145e'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 3
context: ['.ade/context/decisions/0007-agent-colors-live-in-ade-keyed-by-role.md']
---

Two stories, built in order: **Story A** (the map, generated agent files, plugin, picker, fleet) and then **Story B** (the website, tested against A's map). Each has its own acceptance criteria and verification. The shared intent, decisions, color table and hexes come first.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When several agents run at once nothing tells them apart by sight. PR #65 hand-added a `color:` line to this repo's eight `.claude/agents/*.md`, but ADE writes those files for every project without one. The fleet view paints every lane by status alone. The 47 curated profiles carry colors chosen by category rather than by role. The website shows no agent colors.

**Approach:** One role-to-color map in ADE, keyed by role id, covering all nineteen roles with Claude Code's eight color names. ADE writes the matching `color:` line into every sub-agent file it generates. The fleet fills each lane in its role's color and shows status by shape and text. The picker colors by role only. Each curated profile takes its role's color. The website's org chart, fleet demo and `.claude/agents/` listing show the same colors, held to the map by a test.

## Owner's decisions (2026-10-16)

1. Scope is product and website: generated sub-agent files, the fleet view, the profiles and every surface that shows a profile's color, and `docs/index.html` with `docs/assets/css/site.css`.
2. Only Claude Code's eight names: red, blue, green, yellow, purple, orange, pink, cyan.
3. The eight delivery roles keep PR #65's mapping exactly: adversarial-reviewer red, architect blue, product-manager purple, designer pink, scrum-master cyan, developer green, qa yellow, devops orange. The other eleven share the nearest color by kind of work; security-engineer red, sre orange and technical-writer purple are fixed.
4. Each of the 47 curated profiles takes its role's color.
5. **Fleet status:** bars are filled in the role's color. Status is shown by cues that are not color: a running bar has a pulsing open end, a cancelled bar a hatched fill, and every bar's title and accessible name state its status (running, completed or cancelled). Opacity alone never carries status; any dimming must keep at least 3:1 non-text contrast. Green no longer means running anywhere in the fleet, including `FleetSummary`'s "● running".
6. **Picker:** category pills and category badges become neutral. Role color is the only color system in the picker.
7. **Two stories:** A is the map, generated files, plugin regeneration, picker and fleet. B is the website with its parity test against the map. A first.
8. **Follow-ups, deferred** (recorded in `_bmad-output/deferred-work.md`, not built now): (a) add `color:` lines to existing projects' untouched agent files, the way the `CLAUDE.md` BMAD paragraph is updated; (b) color ade-setup's own role files, which publishes an ade-setup release on merge and needs the owner's go-ahead at the time; (c) bump the plugin version so existing plugin installs get the colored agent files.

## Boundaries & Constraints (both stories)

**Always:**
- One source of truth: `src/data/agentColors.ts` (ADR 0007). App code and the website are tested against it.
- A lane, file or item whose type is not one of the nineteen roles and not a curated profile (after stripping a plugin namespace, see A) gets the neutral, never a guessed role.
- **No text is drawn in an agent color in the app.** Agent colors are used only for fills, borders and dots, which need 3:1 against the surface they sit on. Text stays in the theme's text colors. On the website, agent-colored text appears only on the always-dark terminal surfaces.
- The verification command is unchanged.

**Never:**
- No change under `vendor/ade-setup/`, in the ade-setup repo, or `npm run sync:agents`.
- No change to how setup decides what to write: it still writes only missing files and never overwrites.
- No change to `src-tauri/`, `relay/` or `mobile/`.
- No plugin version bump (deferred, decision 8c).
- No change to provider colors (`AgentPicker.tsx:372`, `SettingsPanel.tsx:893/942`) or to `CommandPalette` and `Scratchpad` category colors, which are not agents.

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

## Hexes and measured contrast

Every name has a **dark** hex (the app, whose nine themes are all dark; the site's dark theme; the site's terminal surfaces, which are dark in both themes) and a **light** hex (the site's light theme only). Contrast is computed with the WCAG formula; "worst" is the lowest ratio over every surface in that column.

| Name | Dark hex | App: worst over bgPrimary/bgSecondary/bgTertiary of all 9 themes (non-text, needs 3:1) | Site dark: worst over `--bg` `#08090b`, `--panel` `#111216`, `--term-bg` `#0b0c0f` (text on terminal surfaces, needs 4.5:1) | Light hex | Site light: worst over `#ffffff`, `#f7f7f8`, `#f4f4f6` (non-text, needs 3:1) |
|---|---|---|---|---|---|
| red | `#ff7b72` | 4.45 (Nord tertiary) | 7.42 | `#cf222e` | 4.88 |
| blue | `#58a6ff` | 4.44 (Nord) | 7.41 | `#0969da` | 4.73 |
| green | `#3fb950` | 4.41 (Nord) | 7.37 | `#1a7f37` | 4.62 |
| yellow | `#d29922` | 4.44 (Nord) | 7.42 | `#9a6700` | 4.43 |
| purple | `#bc8cff` | 4.45 (Nord) | 7.43 | `#8250df` | 4.59 |
| orange | `#f0883e` | 4.43 (Nord) | 7.39 | `#bc4c00` | 4.58 |
| pink | `#f778ba` | 4.46 (Nord) | 7.44 | `#bf3989` | 4.59 |
| cyan | `#39c5cf` | 5.37 (Nord) | 8.97 | `#1b7c83` | 4.49 |
| neutral | `#9da5ae` | 4.49 (Nord tertiary) | 7.51 | `#59636e` | 5.57 |

The dark hexes stay below 4.5:1 on Nord's surfaces (and fall to about 3.4 when drawn over their own 0x20 tint), so they are **not** used as text in the app: that is the Boundaries rule, and Story A tests it. All values clear 3:1 as fills, borders and dots everywhere they are used. The neutral replaces `#8b949e` (4.06 on Nord) with `#9da5ae`. The finished-lane dimming of today (opacity 0.55, which measures 2.32 on Nord) is dropped: every bar is drawn at full opacity.

</frozen-after-approval>

---

# Story A: the map, generated files, plugin, picker and fleet

## Code Map (A)

- `src/data/roles.ts` -- the nineteen vendored roles (`ROLES`, `getRole`); no color here.
- `src/lib/projectMethodology.ts:67-122` -- the eight core `ROLES` (with `tools`, `model`); `roleFile` :404-409 writes `name, description, tools?, model?`; `agentCatalog` :447 makes profile files with `agentMarkdown`.
- `src/lib/pluginContent.ts:67-69` -- `agentMarkdown(p)`, used for project profile files and for the 7 plugin files in `claude-plugin/plugins/ade/agents/` (pinned by `scripts/pluginContent.test.ts`, regenerated with `npm run gen:plugin`).
- `src/data/curatedAgents.ts` -- `CuratedAgent.color` (47 literal hexes by category); `interface CatalogAgent` :466; `AGENT_CATALOG` :482.
- `src/data/pickerItems.ts:34,60,72` -- `ROLE_COLOR` neutral for bare roles; curated items copy `agent.color`.
- `src/components/AgentPicker.tsx` -- `CATEGORY_COLORS` :25-34 and `categoryPillStyle` :36 (pills, :409); `categoryBadgeStyle` :47 (suggested badge :567, row badge :652); selected-row border :607; icon tile :618-626 (glyph drawn in `profile.color`); "Run X in" :739 (name drawn in `choice.color`, on `.agent-where`, `background: var(--bg-tertiary)`, `src/index.css:673`).
- `src/stores/fleetStore.ts:76-118` -- `FleetLane.roleId`; `roleIdOf(agentType)` :116 matches role ids, then curated ids, else null. A plugin agent's type arrives namespaced (`ade:web3-auditor`) and today resolves to null.
- `src/components/fleet/FleetTimeline.tsx:17-21,118-150` -- `STATUS_COLOR`; bar fill `#a855f7` for sub-agents, status color for agent lanes; opacity 0.55 / 0.85.
- `src/components/fleet/FleetSummary.tsx:17` and `FleetGroups.tsx:49` -- "● N running" in `#22c55e`.
- `src/stores/settingsStore.ts:41` -- `themePresets`, the nine themes' `bgPrimary/bgSecondary/bgTertiary`.
- `.claude/agents/*.md` (this repo) -- byte-identical to `roleFile(r, "v6")` plus PR #65's `color:` line, which sits last in the frontmatter, where `roleFile` will now write it (checked 2026-10-16).
- `docs/guide/agents.md:73-80` -- Fleet view section.

## Design Notes (A)

**The map, `src/data/agentColors.ts`.** Exports: the type of the eight names; the nineteen-row role-to-name table; each name's `{ dark, light }` hex; the neutral `{ dark, light }`; `roleColor(roleId)` → a name or null; `roleColorHex(roleId)` → the dark hex, or the neutral's for null or an unknown id. The app uses dark hexes only.

**Generated files.** `roleFile` writes `color: <name>` as the last frontmatter key, after `model`, so this repo's eight files come out byte-identical to PR #65's. `agentMarkdown` writes `color: <name>` after `description`, from the profile's `roleId`. `npm run gen:plugin` regenerates the seven plugin files.

**PR #65's lines** stay: they are what the generator now writes. Setup never overwrites and its status check asks only whether paths exist, so a hand-added line was never drift. A BMAD switch writes fresh core role files, which now carry the line. A test pins this repo's eight lines to the map. Existing projects get the line only where ADE writes a fresh file; upgrading them in place is deferred (decision 8a).

**Profiles.** `color` is removed from `CuratedAgent` and the 47 literals deleted; `CatalogAgent` (:466) gains `color: string`, which `AGENT_CATALOG` (:482) sets from `roleColorHex(agent.roleId)`. Resulting changes:
- developer (14: backend-api, backend-db, backend-go, backend-rust, frontend-ui, frontend-state, general-debug, general-git, web3-solidity, web3-gas, web3-solana, mobile-engineer, data-pipeline-engineer, agent-engineer) → green
- brainstorming-architect (11 arch-*), architect (backend-auth, general-architect) → blue
- devops (devops-docker, devops-ci, devops-infra, devops-k8s, web3-devops), sre (sre-observability, sre-incident) → orange
- qa (test-unit, test-e2e, test-perf, eval-engineer) → yellow
- adversarial-reviewer (general-review, web3-auditor), security-engineer → red
- designer (frontend-css) → pink
- technical-writer (general-docs), advisor (general-interview, general-linkedin-leader, general-cofounder), analyst (general-brainstorm) → purple

**Picker (decision 6).** `CATEGORY_COLORS` is removed. Every category pill, the "Roles" pill included, is neutral: inactive as today; active with a `var(--text-secondary)` border and `var(--text-primary)` text on `var(--bg-tertiary)`. The suggested badge and row badges use a neutral style (`var(--text-muted)` on `var(--bg-tertiary)`). Role color appears only as: the icon tile's 1px solid border and its 0x20 tint, with the glyph in `var(--text-primary)`; the selected row's 2px left border; an 8px dot before the name in "Run X in", whose name is now `var(--text-primary)`. Bare-role items (`ROLE_ITEMS`) take their role's color; `ROLE_COLOR` is removed.

**Fleet lanes (decision 5).**
- Fill: every running or completed bar, agent and sub-agent lane alike, has `background-color: roleColorHex(lane.roleId)` at full opacity; the neutral when `roleId` is null. An 8px dot of the same color precedes the label; the label text stays in theme colors.
- Running: the bar's right end is square (no right radius) and carries a 3px child, `data-testid="lane-live-edge"`, in `var(--text-primary)` with a CSS pulse (class `fleet-live-edge` in `src/index.css`, `@keyframes fleet-pulse`); under `prefers-reduced-motion` it is shown without animation.
- Cancelled: `background-color: transparent` and `background-image: repeating-linear-gradient(135deg, <role hex> 0 3px, transparent 3px 6px)`, so the track shows between the stripes: a hatched fill in the role's color. A solid background under the stripes would hide the hatch. The stripes keep the fill's 3:1 against the track.
- Completed: solid fill, both ends rounded, no edge.
- Text: each bar's `title` and `aria-label` are `"<label>, <role title or 'not an ADE role'>[, <detail>], <running|completed|cancelled>"`: the lane's `detail` is kept when present, as today (`FleetTimeline.tsx:141`), and the status word is always last.
- Keyboard: when `onSelect` is set (FleetTab always sets it, `FleetTab.tsx:112,116`), the bar is a real `<button type="button">` (reset styles, same geometry, still `data-testid="lane-bar"`), with `onClick` calling `onSelect` and no `onKeyDown`: the browser's native button activation turns Enter and Space into that click, and a key handler would fire `onSelect` twice. Tab reaches it, with a visible `:focus-visible` outline (`outline: 2px solid var(--text-primary); outline-offset: 1px`, class `fleet-lane-bar` in `src/index.css`). Without `onSelect` it stays a `<div role="img">`.
- Reduced motion: `src/index.css` has `@media (prefers-reduced-motion: reduce) { .fleet-live-edge { animation: none; } }`.
- Attributes for tests: `data-agent-color` (name or `none`) and `data-status`.
- `STATUS_COLOR`, the `#a855f7` literal and both opacities are removed.
- `FleetSummary` and `FleetGroups`: "● N running" is drawn in `var(--text-secondary)`, and its dot uses the same `fleet-live-edge` pulse when N > 0. No green.

**Namespaced types (review m1).** `roleIdOf` strips one leading `<plugin>:` segment before matching, so `ade:web3-auditor` resolves to adversarial-reviewer. A bare unknown (`Explore`) and an unknown namespaced one (`foo:Explore`) stay null.

**Guide.** One bullet under "Fleet view" in `docs/guide/agents.md`: lanes are filled in their role's color, the same as the `color:` line in `.claude/agents/`; sub-agents that are not ADE roles (Explore, Plan) are grey; a running lane has a pulsing end and a cancelled one is hatched.

**Contract.** Story A adds `.ade/context/agent-colors.md`: the table, the hexes, the neutral rule, the no-text-in-agent-color rule, where the map lives.

## Acceptance Criteria (A)

Each names the test that covers it; the developer writes it failing first.

1. The map has exactly one entry per vendored role id, no other entry, every value one of the eight names, and the delivery roles and the three owner examples as in the table. -- `src/data/__tests__/agentColors.test.ts` › "covers every vendored role with one of Claude Code's eight colors", "keeps the owner's mapping"
2. Every dark hex and the neutral reach 3:1 against `bgPrimary`, `bgSecondary` and `bgTertiary` of every entry in `themePresets` (read from `settingsStore.ts`, so a new theme is checked too); every light hex and the light neutral reach 3:1 against `#ffffff`, `#f7f7f8`, `#f4f4f6`; every dark hex reaches 4.5:1 against `#08090b`, `#111216`, `#0b0c0f`. -- `agentColors.test.ts` › "fills reach 3:1 on every app theme surface", "site values reach their contrast"
3. Each of the eight `.claude/agents/*.md` from `methodologyFiles(...)` on v6 and v4 has `color: <its name>` as the last frontmatter key. -- `src/lib/__tests__/projectMethodology.test.ts` › "role files carry their role's color last in the frontmatter"
4. Every profile file from `agentCatalog()` has `color:` equal to its role's name. -- `projectMethodology.test.ts` › "profile files carry their role's color"
5. The plugin files on disk match `generatedPluginFiles()`, including the `color:` line. -- `scripts/pluginContent.test.ts` › existing "matches the files in claude-plugin/" (files regenerated)
6. This repo's `.claude/agents/*.md` each have the `color:` the map gives that role. -- `agentColors.test.ts` › "this repo's own sub-agents use the map's colors"
7. Every `AGENT_CATALOG` entry's `color` is its role's dark hex, and `curatedAgents.ts` contains no `color:` key. -- `agentColors.test.ts` › "every curated profile takes its role's color"
8. `PICKER_ITEMS`: a curated item and a bare-role item each carry their role's dark hex. -- `src/data/__tests__/pickerItems.test.ts` › "picker items are colored by role" (new case)
9. Picker: no category pill or badge has an agent or category hex in `color`, `border` or `background`; the icon tile's border is the role hex and its glyph's `color` is `var(--text-primary)`; "Run X in" shows the name in `var(--text-primary)` with a dot in the role hex. -- `src/components/__tests__/AgentPicker.test.tsx` › "categories are neutral and role color is never text"
10. `FleetTimeline` with `roleId` "qa", "developer" and null: bars carry `data-agent-color` yellow, green, none, backgrounds equal to the hexes (compared as jsdom's `rgb(...)`), full opacity, and a dot of the same color by each label whose text `color` is not a role hex. -- `src/components/fleet/__tests__/FleetTimeline.test.tsx` › "fills each lane in its role's color, neutral when it has none"
11. Running, completed and cancelled lanes of one role: running and completed bars have the role hex as `backgroundColor`; the cancelled bar's `backgroundColor` is `transparent` and its `backgroundImage` is a `repeating-linear-gradient` containing the role hex (as jsdom reports it); only running has `lane-live-edge` and a square right end; each bar's `title` and `aria-label` end with its status word, and a lane with a `detail` has that detail in both before the status word. Read colors from `el.style`, not `getComputedStyle`, which reports `transparent` as `rgba(0, 0, 0, 0)`. -- `FleetTimeline.test.tsx` › "shows status by shape and text, not color"
12. With `onSelect` set, `getByTestId("lane-bar")` is an `HTMLButtonElement` with `type="button"`, class `fleet-lane-bar`, not disabled and with no `tabIndex` of -1, and `fireEvent.click` on it calls `onSelect` exactly once with that lane; without `onSelect` it is a `div` with `role="img"`. Enter and Space are not simulated: jsdom does not perform native activation, and the code adds no key handler for it. No new dev dependency. -- `FleetTimeline.test.tsx` › "a selectable lane bar is a native button"
13. `src/index.css` has a `prefers-reduced-motion: reduce` block that sets `animation: none` on `.fleet-live-edge`, and a `:focus-visible` outline on `.fleet-lane-bar`. -- `scripts/fleetMotion.test.ts` › "the live edge stops under reduced motion and bars show focus"
14. `FleetSummary` and `FleetGroups` draw "running" with no green and no role hex. -- `src/components/fleet/__tests__/FleetSummary.test.tsx` › "running is not green"; `FleetGroups.test.tsx` › "running is not green"
15. `buildLanes` gives a sub-agent of type `ade:web3-auditor` roleId adversarial-reviewer, `Explore` null, `foo:Explore` null. -- `src/stores/__tests__/fleetAttribution.test.ts` › "a plugin-namespaced agent type resolves to its role"

## Verification (A)

**Commands (the repo's verification command, unchanged):**
- `cd relay && cargo test` -- expected: all pass
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including `agentColors.test.ts` and the new cases above
- `cd src-tauri && cargo test` -- expected: all pass (no Rust change)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (no mobile change)

**Manual checks:**
- In the running app on Nord and on Precision, open the Fleet view while a role sub-agent and an Explore sub-agent run, then cancel one: role lane in its color, Explore grey, running end pulsing, cancelled lane hatched.
- Open the agent picker: pills and badges neutral; tiles bordered in role colors.
- In a new project set up by ADE, delegate to `qa` in Claude Code: it shows in yellow.

**Results (A), QA, 2026-10-16, build commit d00deb9 (HEAD at verification), run one after another:**
- `cd relay && cargo test` -- pass: 91 passed, 0 failed (9+2+20+14+40+1+5 across the unit, integration and e2e binaries).
- `npx tsc --noEmit` -- pass: exit 0.
- `npm test` -- pass on the first run: 145 files, 1577 tests passed, 0 failed (no flaky file failed, no rerun needed), including agentColors, projectMethodology, pluginContent, pickerItems, AgentPicker, FleetTimeline, fleetMotion, FleetSummary, FleetGroups and fleetAttribution.
- `cd src-tauri && cargo test` -- pass: 456 passed, 0 failed, 1 ignored (plus 12 and 2 in the other binaries).
- `cd mobile && npx tsc --noEmit && npx jest` -- pass: tsc exit 0; 1 suite, 5 tests passed.

**A-AC coverage (tests read, each fails if its criterion were false):** AC1 to AC15 are each proven by the test the criterion names. AC5 and AC6 are proven by the existing plugin-files test and the new own-sub-agents test (the files on disk carry the lines). Notes, not defects: the selected row's 2px left border in the role color (a Design Note) has no assertion; the picker "All" pill keeps the theme accent when active (a theme token, not an agent or category color, and not a category pill).

**Deviations judged acceptable:** A-AC7 test checks for no literal color value and no hex in `curatedAgents.ts` (stricter than "no `color:` key", since `CatalogAgent.color` lives there); the gradient test accepts hex or rgb (jsdom's form varies); four corner-radius longhands (the plan's own no shorthand/longhand mixing intent); two existing format checks allow an optional `color:` line (the new tests pin it); added test ids; FleetSummary/FleetGroups count always `text-secondary` (the plan's no-green rule).

**Slice:** `git diff d69eac7..d00deb9 --stat` touches 30 files, none of the website files, no dependency or lockfile; `.ade/context/agent-colors.md` records the contract. **Verdict: PASS.**

---

# Story B: the website, tested against the map

Depends on Story A (imports `src/data/agentColors.ts`).

## Code Map (B)

- `docs/index.html:89-92` -- `.claude/agents/` listing in `.feat-media.tree pre`.
- `docs/index.html:108-137` -- `.fleetx` demo: developer, Explore, Plan, "Code reviewer", qa (running), Explore (running); one `role="img"` with an `aria-label`.
- `docs/index.html:268-300` -- org chart: 19 `.org-node`s in three tiers, each `<b>` the role's vendored title exactly (checked against `vendor/ade-setup/agents/*.md` headings, 2026-10-16), plus the "You" node.
- `docs/assets/css/site.css:8-90` -- light `:root`, dark under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`; `:299-301` tree; `:859-874` `.org-node`; `:905-946` `.fleetx`, where `.fleetx-run i` is `#3fb950`, `.fleetx-bar` is `#6e40c9` / `#3d444d` / `#3fb950`, and `@keyframes fleetx-grow` animates the bar's `opacity` and `transform`.

## Design Notes (B)

- **Tokens.** `--agent-red` … `--agent-cyan` and `--agent-none`: light hexes on `:root`, dark hexes in both dark blocks, and dark hexes again on `.feat-media--live` and `.feat-media.tree` (dark in both themes). One rule per name plus `none`: `[data-agent-color="<name>"] { --agent-c: var(--agent-<name>); }`.
- **Org chart.** Each of the 19 `.org-node`s gets `data-role="<id>"` and `data-agent-color="<name>"`; `.org-node[data-agent-color] { border-left: 3px solid var(--agent-c); }`, placed after `.org-node:hover` (`site.css:864`), plus `.org-node[data-agent-color]:hover { border-left-color: var(--agent-c); }`, so the hover rule's `border-color: var(--line-3)` never replaces the role border. The "You" node (`.org-node--you`) is unchanged. Node text keeps its colors.
- **Listing.** Each of the eight file names is wrapped in `<span data-agent-color="<name>">`; `.feat-media.tree [data-agent-color] { color: var(--agent-c); }`. This is text on the terminal surface: 7.37:1 or more.
- **Fleet demo.** Each `.fleetx-lane` gets `data-agent-color`: developer green, qa yellow, Explore and Plan `none`. "Code reviewer" becomes "adversarial-reviewer" (red), a real ADE sub-agent. `.fleetx-bar { background: var(--agent-c); }`; the `#6e40c9`, `#3d444d` and `.is-running` green rules are removed. Because `fleetx-grow` owns the bar's opacity, status is shown by shape (decision 5), not opacity: each `.is-running` lane's track holds an `<i class="fleetx-edge">` positioned at the bar's end, pulsing with `fleetx-pulse` (static under reduced motion). The demo has no cancelled lane. `.fleetx-run i` (the "2 running" dot) becomes `var(--agent-none)`, keeping its pulse. The `aria-label` names each lane's role and which are running.

## Acceptance Criteria (B)

All in `scripts/agentColorsSite.test.ts`, which imports the map from Story A.

1. In `site.css`, `--agent-<name>` and `--agent-none` equal the map's light hex on `:root`, its dark hex in both dark blocks and on `.feat-media--live` and `.feat-media.tree`. -- › "tokens equal the map in both themes and on terminal surfaces"
2. `site.css` has a `[data-agent-color="<name>"]` rule setting `--agent-c: var(--agent-<name>)` for each of the eight names and `none`; `.fleetx-bar` sets `background: var(--agent-c)`; `.org-node[data-agent-color]` sets `border-left` using `var(--agent-c)` and comes after `.org-node:hover` in the file; `.org-node[data-agent-color]:hover` sets `border-left-color: var(--agent-c)`; `.feat-media.tree [data-agent-color]` sets `color: var(--agent-c)`; `.fleetx-run i` sets `background: var(--agent-none)`. -- › "every agent-colored element takes its color from the token"
3. No rule whose selector contains `.fleetx-bar`, `.fleetx-edge`, `.fleetx-run i`, `.org-node[data-agent-color]` (including its `:hover` rule) or `.feat-media.tree [data-agent-color]` has a `#hex`, `rgb(` or `rgba(` value in `background`, `background-color`, `border`, `border-left`, `border-color` or `color`. `.org-node--you` is outside this check. -- › "no hard-coded agent color on the site"
4. The org chart has one `.org-node[data-role]` per role id (all nineteen); each node's `<b>` text equals `getRole(id).title`, and its `data-agent-color` equals the map. -- › "org chart nodes are the nineteen roles, named and colored by the map"
5. The `.claude/agents/` listing has eight spans whose text is `<id>.md` and whose `data-agent-color` is the map's for that id. -- › "the agents listing is colored by the map"
6. Every `.fleetx-lane` has `data-agent-color` equal to the map for its name, `none` for Explore and Plan; every `.is-running` lane contains `.fleetx-edge` and no other lane does; `.fleetx-edge` has an `animation` using `fleetx-pulse` and a reduced-motion override; no rule sets a static `opacity` on `.fleetx-lane` or `.fleetx-bar` by status. -- › "fleet demo shows role by color and running by shape"
7. Existing site tests still pass: `siteClaims.test.ts`, `siteThemeContrast.test.ts`, `siteCsp.test.ts` (no new inline script or style). -- existing

## Verification (B)

**Commands (unchanged):** the same five lines as Story A; expected all pass, with `npm test` including `agentColorsSite.test.ts`.

**Manual checks:** serve `docs/` and view the home page in light and dark themes and with reduced motion on: org-chart borders, the eight file names and the demo bars are colored and legible; the running lanes' ends pulse, or hold still with reduced motion.

---

## Open Questions (owner)

None. The earlier three were decided on 2026-10-16 (decisions 5 and 8).

## Review Triage Log

- 2026-10-16, adversarial review of 51d3cc1: BLOCKED. Fixed in this revision:
  - B1: the neutral `#8b949e` measured 4.06 on Nord; it is now `#9da5ae`, and the contrast table gives measured worst cases per surface instead of a blanket claim.
  - B2: agent-colored text fell below 4.5:1 on Nord's tertiary surface and over its own tint. Agent colors are no longer used as text in the app (rule plus A-AC9, A-AC10), and A-AC2 tests 3:1 for fills on every theme surface.
  - B3: added B-AC2 (token rules and `var(--agent-c)` use) and the `none` fallback.
  - M3: the demo shows status by shape, since `fleetx-grow` owns opacity (B-AC6).
  - m1: namespaced plugin types resolve (A-AC15).
  - m2: org nodes are checked by visible name (B-AC4).
  - m3: the no-hex selectors and properties are named (B-AC3); `.fleetx-run i` becomes neutral.
  - m4: `CatalogAgent` gains `color`. The line references are corrected. The unchecked "nothing else holds a role color" claim is dropped in favour of A-AC7.
  - The owner's decisions 5–8 resolve the previous open questions.
- 2026-10-16, re-review of a43ce4f: earlier findings confirmed fixed; BLOCKED on two majors, three minors. Fixed in this revision:
  - N1: a cancelled bar's background color is transparent so the hatch shows; A-AC11 asserts it.
  - N2: a selectable bar is a real `<button>` with a focus outline; A-AC12 asserts it.
  - n1: the role border survives `.org-node:hover`; B-AC2 and B-AC3 check it.
  - n2: the bar's title keeps `detail`; A-AC11 asserts it.
  - n3: A-AC13 asserts the reduced-motion override.
- 2026-10-16, third re-review: BLOCKED on R1. jsdom does not turn Enter or Space into a click, and a key handler would double-fire `onSelect` in a browser, so A-AC12 now tests the native button (type, class, test id, focusable, one click → one `onSelect`) and the plan states no `onKeyDown` is added (R1–R3). A-AC11 notes reading `el.style`.
