# Premium Look and Feel — Design

Date: 2026-09-04
Status: Approved, pending implementation plan

## Problem

The app is styled with inline `style={{}}` objects referencing ~19 CSS custom
properties defined in one `:root` block in `src/index.css` — 859 `var(--*)`
usages across ~17,700 lines of components. The result reads as a default
developer tool rather than a considered product. Four measured problems:

| Signal | Count | Consequence |
|---|---|---|
| Inline `fontSize` literals | 272 across 11 distinct sizes (8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 24px) | No type scale. 8px and 9px text is below comfortable legibility. |
| `onMouseEnter`/`onMouseLeave` handlers | 118 across 16 files | Hover implemented in JS: no transitions, no `:focus-visible` parity, no `:active`. |
| Hardcoded hex in `src/components/` | 130 | These bypass `applyThemeToDOM`, so they do not respond to theme switching. This is a live bug, not only an aesthetic one. |
| Distinct `padding` combinations | 15+ | No spacing rhythm. |

Additionally: `--shadow` is defined and used zero times; `--shadow-lg` once. The
17 overlay/modal blocks hardcode three different shadows and three different
scrim opacities (0.5, 0.6, 0.7), so dialogs in the same app dim the background
by different amounts. Motion is a single blanket `transition: all 0.15s ease`.
There is no `prefers-reduced-motion` handling anywhere.

The default palette is GitHub Dark's exact values (`#0d1117`, `#58a6ff`,
`#3fb950`) — the most familiar surface in the category.

## Constraint discovered during design

`src/stores/settingsStore.ts` already implements a runtime theme system: 8
presets (GitHub Dark, Dracula, Monokai, Nord, Catppuccin, Solarized Dark, Tokyo
Night, One Dark), per-token custom colours, and `applyThemeToDOM` injecting 12
UI tokens and 11 terminal tokens as CSS variables at runtime.

This means **colour cannot carry the premium quality on its own** — any palette
is one dropdown away from being replaced. The durable improvement must come from
the layer that is not themeable: type scale, spacing rhythm, elevation, motion,
and component craft.

It also splits the token foundation in two:

- **Themeable** (runtime, via `applyThemeToDOM`): all colour.
- **Static** (in `index.css`): type, spacing, radius, elevation geometry, motion.

## Decisions

| Decision | Choice |
|---|---|
| Depth | Foundation plus all surfaces |
| Visual direction | Precision dark — near-black with cool blue-grey undertone, tight type, restrained single accent, hairline borders, real layered elevation |
| Terminal ANSI | Unchanged from GitHub Dark; only termBg/termFg/termCursor align to the new chrome |
| Theme presets | New signature `precision-dark` as default; all 8 existing presets retained |
| Light mode | Out of scope for this pass; dark only |
| Mechanism | Semantic classes plus a small primitive component layer |
| Typeface | Bundle Inter |

## Section 1 — Token foundation

### Colour: `precision-dark` preset

Added to `themePresets` and set as the default. Existing presets are untouched
and remain selectable, so no user's configuration breaks.

```
bgPrimary     #0A0B0D    app ground
bgSecondary   #0F1013    panels
bgTertiary    #15171B    insets, code blocks
bgElevated    #1B1E23    menus, popovers
bgSurface     #262A31    controls, scrollbar thumb
textPrimary   #E8EAED
textSecondary #9BA1AC
textMuted     #5A616D
border        rgba(255,255,255,0.055)
borderStrong  rgba(255,255,255,0.10)
```

The cool blue-grey undertone in the backgrounds is what distinguishes this from
the flat neutral greys common to terminal themes.

### Terminal palette for `precision-dark`

Every preset must supply the 11 terminal tokens `applyThemeToDOM` injects.

**The 8 ANSI colours are carried over unchanged from GitHub Dark.** ANSI colours
are load-bearing in a way UI colours are not — they are how diffs, test output,
`ls`, and log levels are read at a glance. Restyling them for tonal unity with
the chrome would trade differentiation for aesthetics, which is a functional
regression in a terminal-centric app. The terminal reading as tonally distinct
from its frame is acceptable, and arguably correct: content should not be
camouflaged into chrome.

```
termBlack   #484f58   termRed     #ff7b72
termGreen   #3fb950   termYellow  #d29922
termBlue    #58a6ff   termMagenta #bc8cff
termCyan    #39d353   termWhite   #b1bac4
```

**Background, foreground, and cursor do align to the new chrome:**

```
termBg      #0A0B0D
termFg      #E8EAED
termCursor  #7C8FFF
```

These three are not ANSI content colours — they are the pane's own surface. If
`termBg` stayed at GitHub Dark's `#0d1117` while the app ground moved to
`#0A0B0D`, the terminal pane would render as a visibly different-coloured
rectangle inside the chrome. Aligning them removes that seam without touching
any colour that carries meaning in output.

**Pre-existing oddity, left as-is:** GitHub Dark's `termCyan` is `#39d353`, which
is a green hue, not a cyan — so cyan and green output are near-indistinguishable
under this preset today. This is inherited, not introduced here, and correcting
it is out of scope for this design since the decision was to leave ANSI values
untouched. Worth a separate look.

### Additions to `ThemeColors`

The current interface cannot express what the chrome needs. Three new fields —
`accentSolid`, `red`, `yellow` — each backfilled with a preset-appropriate value
across all 8 existing presets:

**Split the accent.** `--accent` is currently used 107 times, frequently as text
at 10–11px. A single mid-blue cannot serve both small text and solid fills.

```
accent       #7C8FFF    text and stroke (~7:1 on ground)
accentSolid  #4A5FE0    fills
```

**`red` and `yellow` tokens.** A large share of the 130 hardcoded hex values are
error and warning states with no token to reference. Their absence is precisely
why those states are theme-immune today.

### Elevation

Elevation is **static**, in `index.css` — not part of `ThemeColors`. The shadows
are black-alpha and the highlight is white-alpha, both of which hold across every
dark preset, so there is nothing per-theme to vary. Keeping them out of
`ThemeColors` also avoids expanding the surface the custom-colour editor exposes.

```
--elev-1        0 1px 2px rgba(0,0,0,.40)
--elev-2        0 2px 4px rgba(0,0,0,.30), 0 4px 12px rgba(0,0,0,.35)
--elev-3        0 8px 24px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.30)
--hairline-top  inset 0 1px 0 rgba(255,255,255,0.04)
--scrim         rgba(0,0,0,0.55)
```

`--hairline-top` — a 1px inner highlight on the top edge of raised surfaces — is
the cheapest single change that reads as premium. It makes floating surfaces
appear lit rather than pasted on. `--scrim` replaces the three competing overlay
opacities.

If a light theme is added later, these five move into `ThemeColors` at that
point; nothing in this design blocks that.

### Type scale

Eleven sizes reduce to seven: `10 / 11 / 12 / 13 / 15 / 18 / 24`.

- 8px and 9px are removed entirely — below comfortable legibility and the
  clearest indicator of an unconsidered interface.
- 14px folds to 13px or 15px; 17px folds to 18px.
- Weights restricted to 400, 500, 600.
- Headings carry `-0.011em` tracking.
- 10px uppercase micro-labels carry `+0.06em` tracking.

### Typeface

Inter, bundled locally, with `cv02`, `cv03`, `cv04`, and `ss01` enabled. Roughly
100KB. Chosen over the current `-apple-system` stack because the project ships
macOS, Windows, and Linux binaries (`.github/workflows/release.yml` builds all
three), and the system stack degrades to Segoe UI and Noto Sans on the latter two
— which is exactly where the current interface looks weakest. The monospace
stack is unchanged.

### Spacing

4px base: `2 4 6 8 12 16 20 24 32 40`. Replaces the 15+ ad-hoc padding
combinations.

### Radius

Tightened to `4 / 6 / 8 / 10` from the current `6 / 8 / 12`. Tighter corners read
as precise; larger radii read as consumer-oriented.

### Motion

The blanket `transition: all 0.15s ease` is replaced. Transitioning `all`
animates every animatable property including layout properties — a correctness
and performance problem, not only a stylistic one.

```
--ease-out  cubic-bezier(0.16, 1, 0.3, 1)
--dur-fast  120ms
--dur-base  180ms
```

Transitions declare explicit property lists. A `prefers-reduced-motion: reduce`
block disables non-essential motion; the app has no such handling today.

## Section 2 — Class vocabulary and primitives

Six primitives in `src/components/ui/`, covering the genuinely repeated patterns.

| Primitive | Replaces | Notes |
|---|---|---|
| `<Overlay>` | 17 hand-rolled scrim and centring blocks | One scrim value, one `--elev-3`. Also unifies ESC-to-close, click-outside, and focus trap, which are inconsistent across dialogs today. |
| `<Panel>` with `.Header` / `.Body` / `.Footer` | Panel chrome in Settings, Bmad, Subagent, Preview, Brainstorm | `--hairline-top`, consistent header height, one close-button treatment. |
| `<Button>` | 89 `<button>` elements | Variants `primary` / `secondary` / `ghost` / `danger`; sizes `sm` / `md`; icon-only mode. All states in CSS. |
| `<Field>` | 18 inputs | Label, control, hint/error. Consistent height and focus ring. |
| `<Row>` | Selectable rows in AgentPicker, CommandPalette, FileBrowser, subagent list | Unifies hover, selected, and keyboard-active states, which differ per component today. |
| `<Badge>` | Small monospace status pills | Tone variants mapped to the `red` / `yellow` / `green` tokens. |

A class vocabulary in `index.css` covers chrome that does not warrant a
component: `.stack`, `.row`, `.scroll-y`, `.truncate`, `.mono`, `.label-micro`.
This extends the BEM-style blocks already present in the file
(`.subagent-panel__header`, `.bmad-persona__launch`).

**All 118 hover handlers are deleted**, becoming `:hover` rules. Two consequences
beyond tidiness: hover gains real transitions, where JS handlers snap; and
`:focus-visible` reaches parity with hover, so keyboard navigation surfaces the
same affordances as the mouse. The global focus ring changes from
`outline-offset: -2px` (inset, cramped) to a positive offset.

## Section 3 — Rollout

Each step is independently shippable, in dependency order.

1. **Foundation.** Tokens in `index.css`; `precision-dark` preset; extend
   `ThemeColors` and `applyThemeToDOM`; backfill new tokens across all 8 existing
   presets; bundle Inter.
2. **Primitives.** Build the six against the foundation, in isolation.
3. **Surfaces.** Migrate components largest first: `Scratchpad` (1407 lines),
   `SettingsPanel` (941), `BrainstormPanel` (932), `OrchestratorTab` (675),
   `AgentPicker` (634), `PreviewPanel` (587), then the remainder.
4. **Sweep.** Eliminate the 130 hardcoded hex values; verify nothing bypasses the
   theme layer.

## Verification

The repository has no test infrastructure and no CI gate: there is no ESLint
config anywhere, no lint script, and `.github/workflows/release.yml` triggers
only on tag push with no test job. `npx tsc --noEmit` is the only automated
check that exists.

For a change touching every surface, the gate is:

- `npx tsc --noEmit` clean.
- A grep-based invariant check asserting the regressions this design eliminates
  stay eliminated: no inline `fontSize:` literals in `src/components/`, no raw
  hex in `src/components/`, no `onMouseEnter` used for styling, no
  `transition: all`.

The invariant check is run manually at the end of each rollout step, not wired
into CI — there is no CI job on push or pull request to wire it into, and adding
one is out of scope here. Promoting it to a committed script and a CI gate is a
reasonable follow-up but is deliberately not part of this design.

Visual verification remains manual.

## Out of scope

Not addressed by this design; each belongs in its own change:

- `src-tauri/src/main.rs` never calling `better_terminal_lib::run()`, which omits
  the entire `lib.rs` command surface from the shipped binary.
- The markdown XSS in `PreviewPanel.tsx` and the no-op iframe sandbox.
- `EditorTab.tsx:64` passing `contents` where the Rust command takes `content`.
- A light theme.
