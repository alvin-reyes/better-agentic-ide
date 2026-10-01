# Premium Look and Feel — Part 2 Carry-Forwards

Findings surfaced during Part 1 (foundation and primitives) that belong to Part 2
(migrating ~20 components onto the primitives). Recorded here because the SDD
workspace they were found in is scratch and gets deleted.

Part 1 branch: `feat/premium-look-and-feel`, commits `497a728..d6ed7f2`.
Spec: `2026-09-04-premium-look-and-feel-design.md`.

## Behavioural narrowing to watch during migration

**`Field`'s control styling reaches only a direct child.** Part 1 replaced the
descendant rule `.field input` with `.ui-field > input` plus a `.ui-input` class
that `Field` stamps onto a direct element child via `cloneElement`. An input
nested inside a wrapper div — for positioning, an adornment, an icon — gets
neither. There is no live regression today because nothing consumes `Field` yet,
but several of the 18 inputs being migrated are wrapped. The escape hatch is
public: the caller adds `className="ui-input"` itself.

## Primitive API limits that will bite specific call sites

**`Row` and `Overlay` spread `...rest` before their own attributes,** so a caller
cannot override `role`, `tabIndex`, `aria-selected`, or `data-testid`. A file tree
row passing `role="treeitem"` is silently ignored. If Part 2 needs a Row that is
not an `option`, the spread order has to change first.

**`Panel` consumes `title` as its heading text,** so the DOM `title` tooltip
attribute is unreachable on the panel element.

**`.ui-overlay__content` receives no pass-through props** — `...rest` goes to the
backdrop. Overriding its `max-width: 560px` means a descendant rule hung off the
backdrop's `className`, not a prop. Worth revisiting if more than one or two call
sites need a different width.

**`Overlay`'s focus trap listens on `document`.** Two nested Overlays would both
fire; the inner one registers last and wins, which is the correct outcome, but the
pre-existing Escape handler has the same shape and would close both. Revisit only
if a nested dialog appears.

## Migration hygiene

**Wrap `onClose` in `useCallback` at the 17 Overlay call sites.** `Overlay`'s
Escape effect depends on `onClose`, so an inline arrow tears down and re-subscribes
the listener every render. Not a leak — wasted work per render.

**`aria-describedby` on `Field`.** The hint and error `<p>` are not wired to the
control; only `label`/`htmlFor` is. Natural to add while migrating the 18 inputs.

## Scope additions

**`src/index.css` needs to be in Part 2's scope.** The plan scoped surface
migration to components, which would orphan `index.css`'s own blocks. It still
carries 17 raw `font-size` literals — two of them off the new scale entirely
(`20px`, `17px`; the spec folds 17 into 18) — plus 7 `font-weight: 700` rules
against a spec that restricts weights to 400/500/600, and raw `border-radius`
values. Ruling P2 in Part 1 converted only the single line Task 4's own test
demanded.

**Tighten `designTokens.test.ts`'s type-scale assertion.** It reads like a scale
guard but only bans `8px` and `9px`, so `17px` and `20px` pass silently. Require
every `font-size:` to be a `var(--text-*)` or an `em`.

**`SettingsPanel.tsx`** was deliberately left untouched in Part 1 and is itself a
migration target. Two things to fix while there: `colorLabels` was never extended
with `accentSolid`, `red`, `yellow`, so those are uneditable and a user who
customizes `accent` still gets the preset's `accentSolid` fill; and the preset
swatch row previews `termBg, accent, termRed, termGreen, termYellow, termBlue`,
which now renders `precision-dark` and `github-dark` near-identically because they
deliberately share ANSI values. Use the new `red`/`yellow`/`green` UI tokens
instead.

## Open question for the human

**`Row`'s `selected` / `active` prop names read backwards against ARIA
convention,** where "selected" is the chosen item and "active" is the cursor. Part
1 kept the spec's names because the spec is binding and there were no consumers.
Renaming stays cheap until the 4 call sites exist — decide before migrating them.

## Deferred, low value

- `Button`'s `children?: ReactNode` is redundant with `ButtonHTMLAttributes`.
- `Overlay`'s `labelledBy` pass-through has no test.
- `variant` (Button) / `tone` (Badge) / `error` (Field) are three names for one
  semantic-colour axis. Not identical axes, so renaming is churn rather than a fix.
- `@types/node` is a devDependency with no `types` array in `tsconfig.json`, so all
  of `src/` sees Node globals. Latent hazard — someone writes `process.env.X`, it
  typechecks, it crashes in the webview.
