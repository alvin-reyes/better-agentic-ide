# Premium Look and Feel — Implementation Plan (Part 1: Foundation and Primitives)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design token foundation and the primitive component layer that the premium look-and-feel rests on, leaving the app running and visually improved but with surface migration still to come.

**Architecture:** Colour reaches the app by two paths that must stay in step — `applyThemeToDOM` sets CSS custom properties for the chrome, while the 11 `term*` fields are handed to xterm directly as an `ITheme`. This plan adds a `precision-dark` preset on both paths, extends `ThemeColors` with three fields the chrome needs, adds static (non-themeable) tokens for type, spacing, radius, elevation and motion to `index.css`, and builds six primitives that consume them. Surface migration is Part 2.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Zustand 5, Vite 7, Vitest 2 + @testing-library/react + jsdom, Tailwind 4 (present but essentially unused), xterm 6.

**Spec:** `docs/superpowers/specs/2026-09-04-premium-look-and-feel-design.md`

## Scope Note

The spec's rollout has four steps: foundation, primitives, surface migration, sweep. **This plan covers steps 1 and 2 only.** Step 3 migrates roughly twenty components and its tasks cannot be written concretely until the primitive APIs exist as real code rather than as a proposal — writing them now would mean inventing signatures and then correcting them. Part 2 gets its own plan once this one lands. Total scope is unchanged.

At the end of this plan the app runs, is themed by `precision-dark`, and has a tested primitive library. Components still carry their inline styles; they will look the same as today apart from the new palette, type, and radius values they inherit through tokens.

## Global Constraints

- TypeScript `strict: true`. `npx tsc --noEmit` must exit 0.
- Test assertions use plain `expect(...).toBeTruthy()` / `.toBe()` — the house style in `src/components/fleet/__tests__/`. Do not introduce jest-dom matchers even though `@testing-library/jest-dom` is installed; no existing test imports it.
- Vitest config is `vitest.config.ts` (jsdom, `globals: true`, include `src/**/*.test.{ts,tsx}`). Tests still import `describe`/`it`/`expect` from `vitest` explicitly, matching existing files.
- All 9 presets (8 existing + `precision-dark`) must satisfy the full `ThemeColors` interface. A missing field is a compile error, which is the intended safety net.
- Every field added to `ThemeColors` must also be emitted by `applyThemeToDOM`. Adding one without the other type-checks cleanly and silently does nothing.
- Terminal ANSI values are **not** restyled. Only `termBg`, `termFg`, `termCursor` differ from GitHub Dark in the new preset.
- Do not touch `src-tauri/`, `PreviewPanel.tsx`'s markdown rendering or iframe, or `EditorTab.tsx` — all listed out of scope in the spec.
- Commit after every task.

---

### Task 1: Preset contract test

Locks the invariant that every preset is complete before any preset is added. Written first so Task 2 has a failing gate to satisfy.

**Files:**
- Test: `src/stores/__tests__/themePresets.test.ts` (create)

**Interfaces:**
- Consumes: `themePresets`, `ThemeColors` from `src/stores/settingsStore.ts`
- Produces: `THEME_COLOR_KEYS`, a module-local constant in this test file. Task 3 Step 6 edits it in place; nothing imports it across files.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { themePresets, type ThemeColors } from "../settingsStore";

const THEME_COLOR_KEYS: (keyof ThemeColors)[] = [
  "bgPrimary", "bgSecondary", "bgTertiary", "bgElevated", "bgSurface",
  "textPrimary", "textSecondary", "textMuted",
  "accent", "green", "border", "borderStrong",
  "termBg", "termFg", "termCursor",
  "termBlack", "termRed", "termGreen", "termYellow",
  "termBlue", "termMagenta", "termCyan", "termWhite",
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const RGBA = /^rgba?\(/;

describe("themePresets", () => {
  it("every preset defines every ThemeColors key", () => {
    for (const preset of themePresets) {
      for (const key of THEME_COLOR_KEYS) {
        expect(
          preset.colors[key],
          `preset "${preset.id}" is missing "${key}"`
        ).toBeTruthy();
      }
    }
  });

  it("every colour value is a 6-digit hex or an rgb/rgba string", () => {
    for (const preset of themePresets) {
      for (const key of THEME_COLOR_KEYS) {
        const value = preset.colors[key];
        expect(
          HEX.test(value) || RGBA.test(value),
          `preset "${preset.id}" key "${key}" has invalid value "${value}"`
        ).toBe(true);
      }
    }
  });

  it("preset ids are unique", () => {
    const ids = themePresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the precision-dark signature preset", () => {
    expect(themePresets.some((p) => p.id === "precision-dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/__tests__/themePresets.test.ts`

Expected: FAIL on `includes the precision-dark signature preset` — `expected false to be true`. The other three tests pass, confirming the 8 existing presets are already complete and well-formed.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/stores/__tests__/themePresets.test.ts
git commit -m "test: add preset completeness contract, pending precision-dark"
```

---

### Task 2: Add the `precision-dark` preset and make it the default

**Files:**
- Modify: `src/stores/settingsStore.ts` — add preset to `themePresets` (array starts line 37); change `themeId` default (line 354)
- Test: `src/stores/__tests__/themePresets.test.ts` (from Task 1)

**Interfaces:**
- Consumes: `ThemePreset`, `ThemeColors` from Task 1's contract
- Produces: preset id `"precision-dark"`, referenced by Task 3's `applyThemeToDOM` test and by Part 2

- [ ] **Step 1: Add the preset**

Insert as the **first** element of the `themePresets` array in `src/stores/settingsStore.ts`, before the `github-dark` entry, so it heads the Settings list:

```ts
  {
    id: "precision-dark",
    name: "Precision",
    colors: {
      bgPrimary: "#0A0B0D",
      bgSecondary: "#0F1013",
      bgTertiary: "#15171B",
      bgElevated: "#1B1E23",
      bgSurface: "#262A31",
      textPrimary: "#E8EAED",
      textSecondary: "#9BA1AC",
      textMuted: "#5A616D",
      accent: "#7C8FFF",
      green: "#4CC38A",
      border: "rgba(255, 255, 255, 0.055)",
      borderStrong: "rgba(255, 255, 255, 0.10)",
      // Terminal: ANSI values carried over from GitHub Dark unchanged.
      // These carry meaning in output; only the pane surface is realigned.
      termBg: "#0A0B0D",
      termFg: "#E8EAED",
      termCursor: "#7C8FFF",
      termBlack: "#484f58",
      termRed: "#ff7b72",
      termGreen: "#3fb950",
      termYellow: "#d29922",
      termBlue: "#58a6ff",
      termMagenta: "#bc8cff",
      termCyan: "#39d353",
      termWhite: "#b1bac4",
    },
  },
```

- [ ] **Step 2: Change the default theme**

In `src/stores/settingsStore.ts` line 354, change:

```ts
  themeId: "github-dark",
```

to:

```ts
  themeId: "precision-dark",
```

This only affects users with no persisted setting. `loadSettings()` reads `localStorage`, so anyone who has already chosen a theme keeps it.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/stores/__tests__/themePresets.test.ts`

Expected: PASS, 4 tests. The completeness test now also covers the new preset.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat: add precision-dark signature theme as default"
```

---

### Task 3: Extend `ThemeColors` with `accentSolid`, `red`, `yellow`

The chrome needs a fill-weight accent distinct from the text-weight one, and needs error/warning tokens so those states stop being theme-immune.

**Files:**
- Modify: `src/stores/settingsStore.ts` — `ThemeColors` interface (line 4); all 9 preset literals; `applyThemeToDOM` (line 489)
- Test: `src/stores/__tests__/applyThemeToDOM.test.ts` (create)
- Test: `src/stores/__tests__/themePresets.test.ts` (extend key list)

**Interfaces:**
- Consumes: `themePresets`, `applyThemeToDOM`, `ThemeColors`
- Produces: CSS custom properties `--accent-solid`, `--red`, `--red-subtle`, `--yellow`, `--yellow-subtle`. Part 2's components consume these by name.

- [ ] **Step 1: Write the failing test**

Create `src/stores/__tests__/applyThemeToDOM.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { applyThemeToDOM, themePresets } from "../settingsStore";

const precision = themePresets.find((p) => p.id === "precision-dark")!;

describe("applyThemeToDOM", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("sets the chrome custom properties from the preset", () => {
    applyThemeToDOM(precision.colors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--bg-primary")).toBe("#0A0B0D");
    expect(style.getPropertyValue("--text-primary")).toBe("#E8EAED");
    expect(style.getPropertyValue("--accent")).toBe("#7C8FFF");
  });

  it("emits the new accent-solid, red and yellow properties", () => {
    applyThemeToDOM(precision.colors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--accent-solid")).toBe("#4A5FE0");
    expect(style.getPropertyValue("--red")).toBe("#F4756B");
    expect(style.getPropertyValue("--yellow")).toBe("#D9A441");
  });

  it("derives subtle variants with the existing hex-suffix convention", () => {
    applyThemeToDOM(precision.colors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--red-subtle")).toBe("#F4756B26");
    expect(style.getPropertyValue("--yellow-subtle")).toBe("#D9A44126");
    expect(style.getPropertyValue("--accent-subtle")).toBe("#7C8FFF26");
  });

  it("emits a property for every preset without producing empty values", () => {
    for (const preset of themePresets) {
      document.documentElement.removeAttribute("style");
      applyThemeToDOM(preset.colors);
      const style = document.documentElement.style;
      for (const prop of ["--accent-solid", "--red", "--yellow"]) {
        expect(
          style.getPropertyValue(prop),
          `preset "${preset.id}" produced an empty "${prop}"`
        ).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/__tests__/applyThemeToDOM.test.ts`

Expected: FAIL. The first test passes; `emits the new accent-solid, red and yellow properties` fails with `expected '' to be '#4A5FE0'`, because `applyThemeToDOM` does not set those properties yet.

- [ ] **Step 3: Extend the interface**

In `src/stores/settingsStore.ts`, add to the `ThemeColors` interface after the `accent` line:

```ts
  accentSolid: string;
```

and after `green: string;`:

```ts
  red: string;
  yellow: string;
```

`npx tsc --noEmit` will now report an error for each of the 9 presets. That is the intended mechanism for finding them all.

- [ ] **Step 4: Backfill all 9 presets**

Add the three fields to each preset's `colors` object. Values below are chosen to sit correctly within each existing palette — reuse each preset's own `termRed`/`termYellow` where they suit, and darken the accent for the solid variant:

```
precision-dark  accentSolid #4A5FE0  red #F4756B  yellow #D9A441
github-dark     accentSolid #2F6FD0  red #ff7b72  yellow #d29922
dracula         accentSolid #6D50C4  red #ff5555  yellow #f1fa8c
monokai         accentSolid #4C9EBF  red #f92672  yellow #e6db74
nord            accentSolid #5E81AC  red #bf616a  yellow #ebcb8b
catppuccin      accentSolid #7287BE  red #f38ba8  yellow #f9e2af
solarized-dark  accentSolid #1F6E8C  red #dc322f  yellow #b58900
tokyo-night     accentSolid #3D59A1  red #f7768e  yellow #e0af68
one-dark        accentSolid #3E7FBF  red #e06c75  yellow #e5c07b
```

- [ ] **Step 5: Extend `applyThemeToDOM`**

In `src/stores/settingsStore.ts`, inside `applyThemeToDOM` (line 489), after the existing `--accent-hover` line:

```ts
  root.style.setProperty("--accent-solid", colors.accentSolid);
  root.style.setProperty("--red", colors.red);
  root.style.setProperty("--red-subtle", colors.red + "26");
  root.style.setProperty("--yellow", colors.yellow);
  root.style.setProperty("--yellow-subtle", colors.yellow + "26");
```

- [ ] **Step 6: Extend the preset contract test**

In `src/stores/__tests__/themePresets.test.ts`, add the three new keys to `THEME_COLOR_KEYS`, after `"accent", "green",`:

```ts
  "accentSolid", "red", "yellow",
```

- [ ] **Step 7: Run all tests**

Run: `npm test`

Expected: PASS. 8 test files, 45+ tests.

- [ ] **Step 8: Verify types**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/stores/settingsStore.ts src/stores/__tests__/
git commit -m "feat: add accentSolid, red and yellow theme tokens"
```

---

### Task 4: Static token foundation in `index.css`

Type, spacing, radius, elevation and motion are not themeable — they are the layer that carries the premium quality regardless of which preset is active.

**Files:**
- Modify: `src/index.css` — `:root` block (lines 3-24), the global transition rule (~line 59), the focus ring (~line 63)
- Test: `src/lib/__tests__/designTokens.test.ts` (create)

**Interfaces:**
- Produces: CSS custom properties `--text-2xs|xs|sm|base|md|lg|xl`, `--space-0-5|1|1-5|2|3|4|5|6|8|10`, `--radius-sm|--radius|--radius-lg|--radius-xl`, `--elev-1|2|3`, `--hairline-top`, `--scrim`, `--ease-out`, `--dur-fast|base`. Every primitive in Tasks 5-10 consumes these.

- [ ] **Step 1: Write the failing test**

jsdom does not apply imported stylesheets, so assert against the file's text. This is a real guard: it fails if a token is renamed or dropped.

Create `src/lib/__tests__/designTokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

const REQUIRED_TOKENS = [
  "--text-2xs", "--text-xs", "--text-sm", "--text-base",
  "--text-md", "--text-lg", "--text-xl",
  "--space-0-5", "--space-1", "--space-1-5", "--space-2", "--space-3",
  "--space-4", "--space-5", "--space-6", "--space-8", "--space-10",
  "--radius-sm", "--radius-lg", "--radius-xl",
  "--elev-1", "--elev-2", "--elev-3",
  "--hairline-top", "--scrim",
  "--ease-out", "--dur-fast", "--dur-base",
];

describe("design tokens", () => {
  it("defines every required token in index.css", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(
        css.includes(`${token}:`),
        `index.css is missing the token "${token}"`
      ).toBe(true);
    }
  });

  it("does not use a blanket transition-all rule", () => {
    expect(css.includes("transition: all")).toBe(false);
  });

  it("handles prefers-reduced-motion", () => {
    expect(css.includes("prefers-reduced-motion")).toBe(true);
  });

  it("no longer hardcodes 8px or 9px font sizes", () => {
    expect(/font-size:\s*[89]px/.test(css)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/designTokens.test.ts`

Expected: FAIL on the first test (`index.css is missing the token "--text-2xs"`) and on `does not use a blanket transition-all rule`, since line ~59 currently reads `transition: all 0.15s ease`.

- [ ] **Step 3: Add the static tokens**

In `src/index.css`, extend the `:root` block. Keep the existing colour custom properties as they are — `applyThemeToDOM` overwrites them at runtime and they serve as the pre-hydration fallback. Update the three radius values and append the new groups:

```css
  /* Radius — tightened one step from 6/8/12 */
  --radius-sm: 4px;
  --radius: 6px;
  --radius-lg: 8px;
  --radius-xl: 10px;

  /* Type scale — 7 sizes, replacing 11 ad-hoc values */
  --text-2xs: 10px;   /* uppercase micro-labels only */
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 15px;
  --text-lg: 18px;
  --text-xl: 24px;

  --tracking-tight: -0.011em;
  --tracking-micro: 0.06em;

  /* Spacing — 4px base */
  --space-0-5: 2px;
  --space-1: 4px;
  --space-1-5: 6px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  /* Elevation — static; black-alpha holds across every dark preset */
  --elev-1: 0 1px 2px rgba(0, 0, 0, 0.40);
  --elev-2: 0 2px 4px rgba(0, 0, 0, 0.30), 0 4px 12px rgba(0, 0, 0, 0.35);
  --elev-3: 0 8px 24px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.30);
  --hairline-top: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  --scrim: rgba(0, 0, 0, 0.55);

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
```

Note the existing `--radius-sm: 6px`, `--radius: 8px`, `--radius-lg: 12px` declarations are **replaced**, not duplicated. There are 61 existing `var(--radius-sm)` usages that pick up the new value automatically.

- [ ] **Step 4: Replace the blanket transition**

Replace the rule at ~line 59:

```css
button, a, input, textarea {
  transition: all 0.15s ease;
}
```

with an explicit property list — `all` animates layout properties too, which is a performance and correctness problem:

```css
button, a, input, textarea, select {
  transition:
    background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out),
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Fix the focus ring**

Replace the rule at ~line 63:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}
```

with a positive offset — the inset ring reads as cramped and clips against control edges:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Verify the app builds and renders**

Run: `npm run build`

Expected: exit 0. Then run `npm run dev` and confirm in the browser at `localhost:1420` that the app renders with the new darker ground and that no layout has collapsed. Tighter radii and the new palette are expected; broken layout is not.

- [ ] **Step 8: Commit**

```bash
git add src/index.css src/lib/__tests__/designTokens.test.ts
git commit -m "feat: add static design tokens for type, space, elevation and motion"
```

---

### Task 5: Bundle Inter

**Files:**
- Modify: `package.json` (dependency)
- Modify: `src/main.tsx` (font import)
- Modify: `src/index.css` (font stack, feature settings)
- Test: `src/lib/__tests__/designTokens.test.ts` (extend)

**Interfaces:**
- Produces: `--font-ui` custom property, consumed by `body` and by primitives

- [ ] **Step 1: Install the font**

```bash
npm install @fontsource-variable/inter
```

`@fontsource-variable/inter` ships the variable font as a local npm package — no network request at runtime and no external host, which matters because `tauri.conf.json` sets `"csp": null` today and should not come to depend on a remote font origin.

- [ ] **Step 2: Import it**

At the top of `src/main.tsx`, before the `index.css` import:

```ts
import "@fontsource-variable/inter";
```

- [ ] **Step 3: Add the font token and apply it**

In `src/index.css`, add to `:root`:

```css
  --font-ui: "Inter Variable", "Inter", -apple-system, BlinkMacSystemFont,
             "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
```

Then replace the `font-family` declaration in the `html, body, #root` rule (line ~38) with:

```css
  font-family: var(--font-ui);
  font-feature-settings: "cv02" 1, "cv03" 1, "cv04" 1, "ss01" 1;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
```

`ss01` gives the single-storey `a` characteristic of the reference look; `cv02`/`cv03`/`cv04` disambiguate `l`, `1` and `I` at small sizes, which matters in a tool showing file paths.

- [ ] **Step 4: Extend the token test**

Add to `REQUIRED_TOKENS` in `src/lib/__tests__/designTokens.test.ts`:

```ts
  "--font-ui", "--font-mono",
```

- [ ] **Step 5: Run tests and build**

Run: `npm test && npx tsc --noEmit && npm run build`

Expected: all exit 0.

- [ ] **Step 6: Verify visually**

Run `npm run dev`. Confirm the UI renders in Inter, not the system font. The clearest tell is the lowercase `a` — single-storey with `ss01` active.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/index.css src/lib/__tests__/designTokens.test.ts
git commit -m "feat: bundle Inter as the UI typeface"
```

---

### Task 6: `<Button>` primitive

Replaces 89 hand-styled `<button>` elements. Built first among the primitives because it is the most-used and the others compose it.

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/ui.css`
- Modify: `src/main.tsx` (import `ui.css`)
- Test: `src/components/ui/__tests__/Button.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
  type ButtonSize = "sm" | "md";
  interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;  // default "secondary"
    size?: ButtonSize;        // default "md"
    iconOnly?: boolean;       // default false
  }
  export default function Button(props: ButtonProps): JSX.Element
  ```
  Tasks 7-10 and all of Part 2 consume this signature.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/__tests__/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "../Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("defaults to the secondary variant at medium size", () => {
    render(<Button>Save</Button>);
    const el = screen.getByRole("button");
    expect(el.className.includes("btn--secondary")).toBe(true);
    expect(el.className.includes("btn--md")).toBe(true);
  });

  it("applies the requested variant and size", () => {
    render(<Button variant="danger" size="sm">Delete</Button>);
    const el = screen.getByRole("button");
    expect(el.className.includes("btn--danger")).toBe(true);
    expect(el.className.includes("btn--sm")).toBe(true);
  });

  it("marks icon-only buttons for square sizing", () => {
    render(<Button iconOnly aria-label="Close">x</Button>);
    expect(screen.getByRole("button").className.includes("btn--icon")).toBe(true);
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards arbitrary button attributes", () => {
    render(<Button type="submit" title="tip">Go</Button>);
    const el = screen.getByRole("button") as HTMLButtonElement;
    expect(el.type).toBe("submit");
    expect(el.title).toBe("tip");
  });

  it("merges a caller-supplied className rather than replacing", () => {
    render(<Button className="extra">Go</Button>);
    const el = screen.getByRole("button");
    expect(el.className.includes("extra")).toBe(true);
    expect(el.className.includes("btn")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/__tests__/Button.test.tsx`

Expected: FAIL — `Failed to resolve import "../Button"`.

- [ ] **Step 3: Write the component**

Create `src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  children?: ReactNode;
}

export default function Button({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    `btn--${size}`,
    iconOnly ? "btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Write the styles**

Create `src/components/ui/ui.css`:

```css
/* Button
   ------------------------------------------------------------------ */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1-5);
  font-family: var(--font-ui);
  font-weight: 500;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--md { height: 28px; padding: 0 var(--space-3); font-size: var(--text-sm); }
.btn--sm { height: 22px; padding: 0 var(--space-2); font-size: var(--text-xs); }

.btn--icon { padding: 0; aspect-ratio: 1; }

.btn--primary {
  background: var(--accent-solid);
  color: #fff;
  box-shadow: var(--hairline-top);
}
.btn--primary:hover:not(:disabled) { filter: brightness(1.12); }
.btn--primary:active:not(:disabled) { filter: brightness(0.94); }

.btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--border);
  box-shadow: var(--hairline-top);
}
.btn--secondary:hover:not(:disabled) {
  background: var(--bg-surface);
  border-color: var(--border-strong);
}
.btn--secondary:active:not(:disabled) { background: var(--bg-tertiary); }

.btn--ghost { background: transparent; color: var(--text-secondary); }
.btn--ghost:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.btn--danger { background: transparent; color: var(--red); border-color: var(--border); }
.btn--danger:hover:not(:disabled) {
  background: var(--red-subtle);
  border-color: var(--red);
}
```

- [ ] **Step 5: Import the stylesheet**

In `src/main.tsx`, after the `index.css` import:

```ts
import "./components/ui/ui.css";
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/ui/__tests__/Button.test.tsx`

Expected: PASS, 8 tests.

- [ ] **Step 7: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/ src/main.tsx
git commit -m "feat: add Button primitive with variants and CSS-driven states"
```

---

### Task 7: `<Overlay>` primitive

Replaces 17 hand-rolled scrim-and-centre blocks that currently disagree on scrim opacity (0.5, 0.6, 0.7) and shadow, and handle ESC and click-outside inconsistently.

**Files:**
- Create: `src/components/ui/Overlay.tsx`
- Modify: `src/components/ui/ui.css`
- Test: `src/components/ui/__tests__/Overlay.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface OverlayProps {
    onClose: () => void;
    closeOnBackdrop?: boolean;  // default true
    closeOnEscape?: boolean;    // default true
    labelledBy?: string;        // id for aria-labelledby
    children: React.ReactNode;
  }
  export default function Overlay(props: OverlayProps): JSX.Element
  ```
  Task 8's `<Panel>` is designed to be placed inside this.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/__tests__/Overlay.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Overlay from "../Overlay";

describe("Overlay", () => {
  it("renders its children", () => {
    render(<Overlay onClose={() => {}}><p>Body</p></Overlay>);
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("exposes a dialog role", () => {
    render(<Overlay onClose={() => {}}><p>Body</p></Overlay>);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    fireEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the content is clicked", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("honours closeOnEscape=false", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} closeOnEscape={false}><p>Body</p></Overlay>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("honours closeOnBackdrop=false", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} closeOnBackdrop={false}><p>Body</p></Overlay>);
    fireEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes its Escape listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/__tests__/Overlay.test.tsx`

Expected: FAIL — `Failed to resolve import "../Overlay"`.

- [ ] **Step 3: Write the component**

Create `src/components/ui/Overlay.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";

export interface OverlayProps {
  onClose: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  labelledBy?: string;
  children: ReactNode;
}

export default function Overlay({
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  labelledBy,
  children,
}: OverlayProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <div
      className="overlay"
      data-testid="overlay-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="overlay__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `src/components/ui/ui.css`:

```css
/* Overlay
   ------------------------------------------------------------------ */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh var(--space-4) var(--space-4);
  background: var(--scrim);
}

.overlay__content {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-3), var(--hairline-top);
  overflow: hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .overlay__content {
    animation: overlay-in var(--dur-base) var(--ease-out);
  }
}

@keyframes overlay-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.99); }
  to   { opacity: 1; transform: none; }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/ui/__tests__/Overlay.test.tsx`

Expected: PASS, 8 tests.

- [ ] **Step 6: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add Overlay primitive with unified scrim, escape and backdrop handling"
```

---

### Task 8: `<Panel>` primitive

**Files:**
- Create: `src/components/ui/Panel.tsx`
- Modify: `src/components/ui/ui.css`
- Test: `src/components/ui/__tests__/Panel.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface PanelProps {
    title: string;
    titleId?: string;
    onClose?: () => void;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }
  export default function Panel(props: PanelProps): JSX.Element
  ```
  Consumes `Button` from Task 6 for the close control.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/__tests__/Panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Panel from "../Panel";

describe("Panel", () => {
  it("renders its title and body", () => {
    render(<Panel title="Settings"><p>Body</p></Panel>);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("renders a footer when given one", () => {
    render(<Panel title="T" footer={<span>Footer</span>}><p>Body</p></Panel>);
    expect(screen.getByText("Footer")).toBeTruthy();
  });

  it("omits the footer element when no footer is given", () => {
    const { container } = render(<Panel title="T"><p>Body</p></Panel>);
    expect(container.querySelector(".panel__footer")).toBe(null);
  });

  it("shows a close button only when onClose is given", () => {
    const { rerender } = render(<Panel title="T"><p>Body</p></Panel>);
    expect(screen.queryByRole("button", { name: "Close" })).toBe(null);
    rerender(<Panel title="T" onClose={() => {}}><p>Body</p></Panel>);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<Panel title="T" onClose={onClose}><p>Body</p></Panel>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies titleId so an Overlay can label itself", () => {
    render(<Panel title="Settings" titleId="settings-title"><p>Body</p></Panel>);
    expect(screen.getByText("Settings").id).toBe("settings-title");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/__tests__/Panel.test.tsx`

Expected: FAIL — `Failed to resolve import "../Panel"`.

- [ ] **Step 3: Write the component**

Create `src/components/ui/Panel.tsx`:

```tsx
import type { ReactNode } from "react";
import Button from "./Button";

export interface PanelProps {
  title: string;
  titleId?: string;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export default function Panel({
  title,
  titleId,
  onClose,
  footer,
  children,
}: PanelProps) {
  return (
    <div className="panel">
      <header className="panel__header">
        <h2 className="panel__title" id={titleId}>{title}</h2>
        {onClose && (
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}>
            ✕
          </Button>
        )}
      </header>
      <div className="panel__body">{children}</div>
      {footer && <footer className="panel__footer">{footer}</footer>}
    </div>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `src/components/ui/ui.css`:

```css
/* Panel
   ------------------------------------------------------------------ */
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: 0 0 auto;
  height: 40px;
  padding: 0 var(--space-2) 0 var(--space-4);
  border-bottom: 1px solid var(--border);
}

.panel__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
}

.panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4);
}

.panel__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--bg-tertiary);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/ui/__tests__/Panel.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 6: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add Panel primitive with consistent header, body and footer chrome"
```

---

### Task 9: `<Field>` and `<Badge>` primitives

Grouped because both are small, neither depends on the other, and splitting them would not give a reviewer a meaningfully separate decision.

**Files:**
- Create: `src/components/ui/Field.tsx`
- Create: `src/components/ui/Badge.tsx`
- Modify: `src/components/ui/ui.css`
- Test: `src/components/ui/__tests__/Field.test.tsx`
- Test: `src/components/ui/__tests__/Badge.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface FieldProps {
    label: string;
    htmlFor: string;
    hint?: string;
    error?: string;
    children: React.ReactNode;   // the control itself
  }
  export default function Field(props: FieldProps): JSX.Element

  type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
  interface BadgeProps {
    tone?: BadgeTone;            // default "neutral"
    children: React.ReactNode;
  }
  export default function Badge(props: BadgeProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing Field test**

Create `src/components/ui/__tests__/Field.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Field from "../Field";

describe("Field", () => {
  it("associates the label with the control", () => {
    render(
      <Field label="Name" htmlFor="name">
        <input id="name" />
      </Field>
    );
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("renders a hint when given one", () => {
    render(
      <Field label="Name" htmlFor="name" hint="Your full name">
        <input id="name" />
      </Field>
    );
    expect(screen.getByText("Your full name")).toBeTruthy();
  });

  it("renders an error and hides the hint when both are given", () => {
    render(
      <Field label="Name" htmlFor="name" hint="Your full name" error="Required">
        <input id="name" />
      </Field>
    );
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.queryByText("Your full name")).toBe(null);
  });

  it("marks the error with an alert role", () => {
    render(
      <Field label="Name" htmlFor="name" error="Required">
        <input id="name" />
      </Field>
    );
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });
});
```

- [ ] **Step 2: Write the failing Badge test**

Create `src/components/ui/__tests__/Badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "../Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>running</Badge>);
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("defaults to the neutral tone", () => {
    render(<Badge>idle</Badge>);
    expect(screen.getByText("idle").className.includes("badge--neutral")).toBe(true);
  });

  it("applies the requested tone", () => {
    render(<Badge tone="danger">failed</Badge>);
    expect(screen.getByText("failed").className.includes("badge--danger")).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/__tests__/Field.test.tsx src/components/ui/__tests__/Badge.test.tsx`

Expected: FAIL — both fail to resolve their imports.

- [ ] **Step 4: Write Field**

Create `src/components/ui/Field.tsx`:

```tsx
import type { ReactNode } from "react";

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export default function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="field__error" role="alert">{error}</p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Write Badge**

Create `src/components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export default function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
```

- [ ] **Step 6: Add the styles**

Append to `src/components/ui/ui.css`:

```css
/* Field
   ------------------------------------------------------------------ */
.field { display: flex; flex-direction: column; gap: var(--space-1-5); }

.field__label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.field input,
.field select,
.field textarea {
  height: 28px;
  padding: 0 var(--space-2);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.field textarea { height: auto; padding: var(--space-2); }

.field input:hover,
.field select:hover,
.field textarea:hover { border-color: var(--border-strong); }

.field__hint  { margin: 0; font-size: var(--text-2xs); color: var(--text-muted); }
.field__error { margin: 0; font-size: var(--text-2xs); color: var(--red); }

/* Badge
   ------------------------------------------------------------------ */
.badge {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 var(--space-1-5);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-micro);
  text-transform: uppercase;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.badge--neutral { background: var(--bg-surface);     color: var(--text-secondary); }
.badge--accent  { background: var(--accent-subtle);  color: var(--accent); }
.badge--success { background: var(--green-subtle);   color: var(--green); }
.badge--warning { background: var(--yellow-subtle);  color: var(--yellow); }
.badge--danger  { background: var(--red-subtle);     color: var(--red); }
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components/ui/__tests__/`

Expected: PASS — Button 8, Overlay 8, Panel 6, Field 4, Badge 3.

- [ ] **Step 8: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add Field and Badge primitives"
```

---

### Task 10: `<Row>` primitive

Unifies the selectable-row treatment currently duplicated with different hover and selected states across AgentPicker, CommandPalette, FileBrowser and the subagent list.

**Files:**
- Create: `src/components/ui/Row.tsx`
- Modify: `src/components/ui/ui.css`
- Test: `src/components/ui/__tests__/Row.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface RowProps {
    selected?: boolean;   // default false — keyboard cursor position
    active?: boolean;     // default false — the committed selection
    disabled?: boolean;   // default false
    onSelect?: () => void;
    children: React.ReactNode;
  }
  export default function Row(props: RowProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/__tests__/Row.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Row from "../Row";

describe("Row", () => {
  it("renders its children", () => {
    render(<Row>Item</Row>);
    expect(screen.getByText("Item")).toBeTruthy();
  });

  it("exposes an option role with aria-selected", () => {
    render(<Row active>Item</Row>);
    const el = screen.getByRole("option");
    expect(el.getAttribute("aria-selected")).toBe("true");
  });

  it("marks the keyboard cursor separately from the active selection", () => {
    render(<Row selected>Item</Row>);
    const el = screen.getByRole("option");
    expect(el.className.includes("row--selected")).toBe(true);
    expect(el.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect}>Item</Row>);
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not call onSelect when disabled", () => {
    const onSelect = vi.fn();
    render(<Row disabled onSelect={onSelect}>Item</Row>);
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect on Enter", () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect}>Item</Row>);
    fireEvent.keyDown(screen.getByRole("option"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/__tests__/Row.test.tsx`

Expected: FAIL — `Failed to resolve import "../Row"`.

- [ ] **Step 3: Write the component**

Create `src/components/ui/Row.tsx`:

```tsx
import type { ReactNode } from "react";

export interface RowProps {
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}

export default function Row({
  selected = false,
  active = false,
  disabled = false,
  onSelect,
  children,
}: RowProps) {
  const classes = [
    "row",
    selected ? "row--selected" : "",
    active ? "row--active" : "",
    disabled ? "row--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handle = () => {
    if (!disabled) onSelect?.();
  };

  return (
    <div
      className={classes}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handle();
        }
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `src/components/ui/ui.css`:

```css
/* Row
   ------------------------------------------------------------------ */
.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1-5) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.row:hover:not(.row--disabled) { background: var(--bg-elevated); }

.row--selected { background: var(--bg-elevated); }

.row--active {
  background: var(--accent-subtle);
  color: var(--accent);
}

.row--disabled { opacity: 0.45; cursor: not-allowed; }
```

`row--selected` (keyboard cursor) and `row--active` (committed choice) are deliberately distinct. Components today conflate them, which is why keyboard navigation and mouse selection look identical and neither is legible when both apply.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/ui/__tests__/Row.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 6: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add Row primitive with distinct cursor and selection states"
```

---

### Task 11: Design invariant check

Encodes the regressions this design eliminates so they cannot creep back during Part 2's migration. Scoped to an explicit allowlist that Part 2 grows, so it passes today and tightens as surfaces migrate.

**Files:**
- Create: `src/lib/__tests__/designInvariants.test.ts`

**Interfaces:**
- Produces: `MIGRATED_PATHS` — the allowlist Part 2's tasks append to as each surface migrates.

- [ ] **Step 1: Write the test**

Create `src/lib/__tests__/designInvariants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const SRC = resolve(__dirname, "../..");

/**
 * Directories held to the design invariants. Part 2 appends each surface
 * here as it is migrated, so the guarded area grows monotonically and a
 * migrated file can never regress.
 */
const MIGRATED_PATHS = ["components/ui"];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...filesUnder(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const guarded = MIGRATED_PATHS.flatMap((p) => filesUnder(resolve(SRC, p)));

describe("design invariants", () => {
  it("guards at least one file", () => {
    expect(guarded.length).toBeGreaterThan(0);
  });

  it("uses no inline fontSize literals", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      expect(
        /fontSize:\s*["'`]?\d/.test(source),
        `${file} contains an inline fontSize literal; use a --text-* token`
      ).toBe(false);
    }
  });

  it("uses no raw hex colours", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      const matches = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(
        matches.length,
        `${file} contains raw hex ${matches.join(", ")}; use a theme token`
      ).toBe(0);
    }
  });

  it("uses no onMouseEnter styling handlers", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      expect(
        source.includes("onMouseEnter"),
        `${file} styles on onMouseEnter; use a CSS :hover rule`
      ).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/__tests__/designInvariants.test.ts`

Expected: PASS, 4 tests. It passes because `src/components/ui/` was built to these rules. If it fails on `uses no raw hex colours`, the offender is `Button.tsx`'s `color: #fff` in `ui.css` — note the check covers `.ts`/`.tsx` only, not CSS, so that is not a violation; investigate any other hit before relaxing the rule.

- [ ] **Step 3: Run the full suite**

Run: `npm test && npx tsc --noEmit`

Expected: both exit 0. Total: 12 test files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/designInvariants.test.ts
git commit -m "test: add design invariant guard over migrated surfaces"
```

---

### Task 12: Verify the whole foundation end to end

No new code. Confirms the app actually runs on the new foundation before Part 2 begins building on it.

**Files:** none modified

- [ ] **Step 1: Full automated gate**

```bash
npm test && npx tsc --noEmit && npm run build
```

Expected: all three exit 0.

- [ ] **Step 2: Run the app**

```bash
npm run dev
```

Open `localhost:1420` and confirm:

- The app renders on the darker `#0A0B0D` ground, not GitHub Dark's `#0d1117`.
- Text renders in Inter — check the single-storey lowercase `a`.
- Terminal output colours are unchanged: run `ls --color` and a `git diff` and confirm red/green/blue read exactly as before.
- The terminal pane background matches the surrounding chrome with no visible seam at the pane edge.
- Corners are visibly tighter than before.
- Tab through the UI: focus rings sit outside their controls, not clipped inside.

- [ ] **Step 3: Verify theme switching still works**

Open Settings › Themes. Confirm all 9 presets are listed with Precision first, switch to Dracula and back, and confirm both chrome and terminal update. This exercises the two colour paths — `applyThemeToDOM` for chrome, `useTerminal.ts` for the terminal — which must stay in step.

- [ ] **Step 4: Verify persistence**

Reload the app. The last-selected theme must survive, confirming the `themeId` default change did not break `loadSettings()`.

- [ ] **Step 5: Commit any fixes**

If steps 2-4 surfaced problems, fix and commit them individually. If not, no commit.

---

## Self-Review

**Spec coverage.**

| Spec requirement | Task |
|---|---|
| `precision-dark` preset, default, 8 retained | 2 |
| Terminal ANSI unchanged; bg/fg/cursor realigned | 2 |
| `accentSolid`, `red`, `yellow` added and emitted | 3 |
| Type scale 11 → 7 | 4 (tokens) |
| Spacing 4px base | 4 |
| Radius tightened | 4 |
| Elevation static, `--scrim` | 4 |
| Motion, no `transition: all`, reduced-motion | 4 |
| Focus ring offset | 4 |
| Inter bundled with `cv02`/`cv03`/`cv04`/`ss01` | 5 |
| Six primitives | 6, 7, 8, 9, 10 |
| Invariant check | 11 |
| `npm test` + `tsc` gate | every task |

**Deferred to Part 2, by design:** class vocabulary (`.stack`, `.row`, `.scroll-y`, `.truncate`, `.mono`, `.label-micro`), the 118 hover-handler deletions, the 130 hardcoded hex removals, and all surface migration. The type scale tokens exist after Task 4 but the 272 inline `fontSize` literals are only replaced during migration — Task 11's invariant check is what forces that.

**Type consistency.** `ButtonProps`/`ButtonVariant`/`ButtonSize` (Task 6) are consumed unchanged by `Panel` (Task 8). `THEME_COLOR_KEYS` (Task 1) is extended in Task 3 Step 6. `MIGRATED_PATHS` (Task 11) is the single extension point for Part 2. `Row`'s `selected` vs `active` distinction is used consistently in its test, component and CSS.

**Known sequencing risk.** Task 4 changes `--radius-sm` from 6px to 4px, affecting all 61 existing usages across unmigrated components. This is intended — those components inherit the improvement — but it is the one step in this plan that visibly changes surfaces no task has touched. Task 12 Step 2 is where that gets eyeballed.
