# Adversarial review of the F4 Workspaces UX, draft 1: BLOCKED

One blocker, ten majors, thirteen minors. Checked against `docs/prd.md` F4 revision 3.3
(lines 2379 to 3570 in the `ux-f4` worktree), `origin/main` 84389eb, F2's UX on
`onboarding-ux` and F2's PRD revision 5.2 on `onboarding-prd`. Mockup line numbers are
draft 1's.

## Blocker

B1. A workspace tab in a detached window is not designed, and section 13's last
paragraph is false. `origin/main:src/DetachedApp.tsx` renders only a title bar,
`PaneContainer` and `Scratchpad`: no FileBrowser, CommandPalette, Toast, strip, notice
bar or live region. So after Move to New Window none of F4's surfaces exist: WS-6 AC4's
"same roots" has nothing to show, WS-2 AC3 ("any tab of any window") can bring forward a
window that can show neither bar nor toast, and WS-6 AC3's bars and WS-2 AC6's "only
Refresh" have no host. `DetachedApp.tsx` is not in section 1's read list. Resolve: say
what a detached workspace tab shows and how WS-2 AC3, WS-6 AC3 and WS-6 AC4 are met
there, or put the gap to the product manager; correct section 13.

## Majors

M1. "No key in use is taken" is false. ⌘↵ is the app's `send` shortcut
(`shortcuts.ts:42`; `useKeybindings.ts:95`, a window-level listener at line 175 with no
focus check), so ⌘↵ on a file in the tree also sends the scratchpad's text to the
terminal, which in a hub tab is the live persona session. The same handler's plain-Esc
branch (lines 161 to 171) closes the scratchpad and focuses the terminal from anywhere,
contradicting the Esc and focus-return rules for menus and Add Folder. Pick another key
or state that the tree consumes the event; state how menus and dialogs keep Esc from the
global handler.

M2. The file browser is closed by default (`fileBrowserStore.ts:101`,
`isOpen: persisted.isOpen ?? false`) and the spec never says opening a workspace shows
it. On a default install Open Hub shows nothing of the workspace, a mark-only workspace
tab looks like a plain tab, and WS-1 AC2 and AC7 notices are neither shown nor
announced. Decide and state it, or ask it.

M3. Open Hub on a hub whose only open tab has no persona (opened from a hub folder,
restored, or a Duplicate): the tab comes forward with "Showing its tab." and nothing
says the persona did not start or how to start it. Design this state or ask the product
manager.

M4. "Not answering" is made a state separate from Missing, against the PRD (F4.1 line
2551, WS-9 AC3 line 3168, WS-4 AC5 line 2953), and not flagged. Keep "missing" in the
name and status (for example "missing, not answering") or ask.

M5. The terminal inside a root that is Missing, Not answering or stale is not designed.
S1 has no live refresh, so a checkout cloned after the last refresh stays Missing while
the engineer can `cd` into it; WS-5 AC1 wants the current root expanded down to the
folder. In the mockup `curRoot()` (line 317) counts only `st === "ok"`, so `cd()` adds
an extra "Not in workspace" root for a path that is a workspace folder. Define: whether
the current-root mark shows there, whether a `cd` re-checks the root, whether the extra
root appears, when a root is re-checked in S1 and whether its expansions return. Also a
root that exists but cannot be listed (no permission) has no state.

M6. WS-6 AC2's "never dropped silently" is weakened: the dropped-record bar lives in one
tab, may be in the background, and is lost on close or quit before it is seen. Whether
it must persist is a product question, asked of the architect by mistake: move it to
section 23 with a recommendation that keeps the notice until seen. Also define which bar
wins or how they stack when two causes meet ("One F4 bar per tab").

M7. The 50-folder cap. By position the spec's sentence cuts the engineer's added folders
first; WS-9 AC1 (line 3155) cuts discovered checkouts and refuses an add past 50.
Nothing lists the left-out folders, the Remove dialog has one row per root so a left-out
checkout can never be hidden, and Show Again at 50 is undefined. State the cut rule in
the PRD's terms, where left-out folders can be seen and hidden, and Show Again at the
cap.

M8. The tree holds things that are not tree items (mockup lines 406 to 409 put
`div.hint`, a `<button>` and a `role="note"` inside `role="tree"`). WS-5 AC3's notice
for `cd /` is not reachable by arrows, Tab or a live region; the Add link has no
keyboard route; a nested checkout (WS-1 AC3) gives two rows for one path and which
carries `aria-current`, the mark and ⌘⇧E's landing is unstated (the mockup keys focus by
path and does not draw it); sticky root rows can cover the focused row. Move these lines
out of the tree or make them reachable and announced; define the nested case and scroll
padding.

M9. Dialogs have no accessibility design. No `aria-activedescendant` or roving pattern,
`aria-modal="true"` with no focus trap, focus return specified only for Add Folder and
menus, and with focus in the search field a screen reader never hears the highlighted
row, its Hide or Remove word, or "Always in the workspace". [S2] the mockup nests a
`<button>` in `role="option"` (line 515). Specify the pattern, names, trap and focus
return per dialog. `TabSwitcher.tsx:50-70`, the shape reused, has neither, so say what
F4 adds.

M10. Section 5.7 promises toasts for results while the roots are out of sight, but only
Refresh has one in 12.3; Add, Show Again and Move have none, and with a sub-terminal in
sight after F3 S1 the new root cannot take focus. Add the toasts or drop the claim; say
where focus goes in each out-of-sight case.

## Minors

m1. Add Folder's field applies bidi controls: Browse… puts the raw path in the field,
and in the mockup the "hidden checkout" chip (line 518) does too (`h` does not escape
controls). F2's 6.3 refuses such paths; F4 says neither. Section 14's "where it applies"
omits the field.

m2. Mockup line 670 puts typed text into `innerHTML` unescaped
(`toast({ title: ... base(S.addVal) })` reaching `toastHTML` line 541).

m3. Hostile text: the plain-text form `[U+202E]` cannot be told from a folder literally
named that; the chip's `aria-label` is on a role-less span (line 240); the
disambiguating part is outside the name's `<bdi>` in rows (356) and shares one in
dialogs (513), against section 14; whitespace-only and trailing-space names give blank
or identical labels; P3 states the cost of escaping U+200C and U+200D only for emoji,
but they are required spelling in Persian and several Indic scripts; the mockup's `CTRL`
regex (237) is not all of Cc and Cf (no astral ranges).

m4. Additions not flagged in section 23: the hidden-count footer, the two refresh
toasts, the "Workspace ready" announcement, the "not a full path" and `~bob` refusals
for Add, Add opening the file browser and moving focus into the tree, a right-click menu
on rows, sticky rows, and stacking an F4 bar under F2's run notice where F2 UX 8.3 says
"One notice per tab".

m5. Focus moves to the tree after Add, where ⌫ removes with no confirm: a stray
Backspace removes the folder just added.

m6. Row height: 5.2 moves the path to a second line with a status word (40 px), 7.1 says
roots stay where they are during refresh while every root shows Checking…; the mockup
keeps Checking rows on one line (363).

m7. The loading state shows roots that cannot be known yet (discovered checkouts are
never stored, WS-1 AC5), and the "Checking the hub's folders…" line sits at the end of
the tree in the mockup but under the hub's root in the spec.

m8. Mockup and spec disagree: toasts and announcements use the bare name (568, 569, 582,
590) where 5.3 says the full label; toast titles show chips where 14 says plain text;
the hostile card's caption says text form but renders chips; the tab set's × has an
accessible name (533) though section 19 says it is left alone; the settings tab reads
"Theme" where main has "Themes" (`SettingsPanel.tsx:33`); `.ib.dot` is 22 × 18 px
against the 24 px floor; tree rows lack `aria-setsize`, `aria-posinset` and
`aria-describedby`.

m9. Sighted keyboard users cannot read the full path or the folder's kind (tooltip
only); discovered and added roots look identical while ⌫ hides one and removes the
other.

m10. Undefined: the hidden count against the dialog's list when a hidden entry is kept
from an unreadable file (WS-1 AC7); the precedence of Add's refusals (mockup order
differs from the table); the word and tooltip for a folder both discovered and added;
Refresh pressed while one runs; whether a dismissed bar returns on "Still missing.";
⌘⇧E while a dialog is open.

m11. Routing: section 22 items 3, 7 and 12 are product questions put to the architect; a
too-broad hub chosen through Open Hub (persona or not) is unasked (11.2); F2's PRD
(onboarding-prd line 3720) hands the same already-open notice to F2's designer and
nothing records which spec owns the copy.

m12. WS-10 AC2's allowlist is described, not enumerated; the new shortcut needs
`docs/guide/shortcuts.md` and the shortcuts help; "Title case, as the palette" does not
match main's "Fleet: Toggle panel" or "Tabs: Go to tab" (`CommandPalette.tsx:113, 172`).

m13. Loose claims: "no keyboard support at all" (the header controls are real buttons;
only rows lack it); the live region "the sub-terminal strip uses" is a private
`SubTerminalAnnouncer` mounted only in `App.tsx`; contrast measured for one of nine
themes; today's breadcrumb uses `--text-muted` and the spec does not say whether plain
tabs change; the tab menu renders disabled items at opacity 0.4 (`TabBar.tsx:516`),
which would dim the hub row's reason line.

## Suspected, not checked

- At 180 px the label can shrink to nothing beside "Not in workspace" and the mark.
- Stacked combining marks may overdraw neighbouring rows.

## Verified correct (leave alone)

The relabel table's files, lines and strings; ⌘⇧E unbound; the palette single-step; the
file browser's rows as described; toast timings; token values and contrast figures; the
mockup loading offline with all 18 scenarios; the hostile scenario as rendered; no
naming of the private template; the F2 wording reused.

## Not reviewed

The [S2] design in depth; the architecture on `arch-f4`; pixel layout, VoiceOver, themes
other than Precision; 13 of the mockup's scenarios beyond reading their source.
