# Agent colors

Decided in ADR 0007 (`decisions/0007-agent-colors-live-in-ade-keyed-by-role.md`); built in Story A of `_bmad-output/plan-agent-colors.md`.

## Where the map lives

`src/data/agentColors.ts` is the only source. Nothing else may hold a role color.

- `AGENT_COLOR_NAMES`: Claude Code's eight names, the only values allowed in a `color:` line.
- `ROLE_COLORS`: role id to name, one entry per vendored role (`vendor/ade-setup/agents/*.md`). A new vendored role fails `npm test` until it has an entry here.
- `AGENT_COLOR_HEX[name]`: `{ dark, light }`. The app uses `dark` only; `light` is for the website's light theme.
- `NEUTRAL_HEX`: `{ dark, light }` for anything that is not a role.
- `roleColor(roleId)`: the name, or null for null or an unknown id.
- `roleColorHex(roleId)`: the dark hex, or the neutral's dark hex.

## The table

| Role id | Color |
|---|---|
| adversarial-reviewer, security-engineer | red |
| architect, brainstorming-architect, solutions-engineer | blue |
| product-manager, technical-writer, analyst, advisor | purple |
| designer | pink |
| scrum-master, product-owner, engineering-manager | cyan |
| developer | green |
| qa, support-engineer | yellow |
| devops, sre, release-manager | orange |

| Name | Dark | Light |
|---|---|---|
| red | `#ff7b72` | `#cf222e` |
| blue | `#58a6ff` | `#0969da` |
| green | `#3fb950` | `#1a7f37` |
| yellow | `#d29922` | `#9a6700` |
| purple | `#bc8cff` | `#8250df` |
| orange | `#f0883e` | `#bc4c00` |
| pink | `#f778ba` | `#bf3989` |
| cyan | `#39c5cf` | `#1b7c83` |
| neutral | `#9da5ae` | `#59636e` |

## Rules

- **Neutral, never a guess.** A lane, file or item whose type is not one of the nineteen roles and not a curated profile gets the neutral. A plugin-namespaced sub-agent type (`ade:web3-auditor`) is matched after stripping one leading `<plugin>:` segment.
- **No text in an agent color in the app.** Agent colors are fills, borders and dots only (3:1 against every theme's `bgPrimary`, `bgSecondary`, `bgTertiary`, tested). Text stays in the theme's text colors. On the website, agent-colored text appears only on the always-dark terminal surfaces.
- **Generated files.** `roleFile` writes `color: <name>` as the last frontmatter key; `agentMarkdown` writes it after `description`. Curated profiles take their role's color (`CatalogAgent.color = roleColorHex(roleId)`); `CuratedAgent` has no color.
- **Fleet.** Lanes are filled in the role's color at full opacity; status is shape and text (running: square pulsing end, `.fleet-live-edge`; cancelled: role-colored hatch over a transparent background; every bar's title and aria-label end with the status word). Green does not mean running.
- **Picker.** Category pills and badges are neutral; role color is the icon tile's border and tint, the selected row's left border and the dot in "Run X in".
