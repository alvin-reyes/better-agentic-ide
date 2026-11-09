# 0022: On Windows, a terminal opened by `ade open` runs its command at spawn instead of typing it

- **Status:** Proposed, direction only. Depends on ADR 0014 (`0014-terminals-open-terminals-through-the-hook-endpoint`) being approved, and amends it for Windows. Not decided; for the owner when PE-10 (Next) is scheduled.
- **Revisions:** 2026-11-08 first version; revised the same day after the adversarial review (minor 4).
- **Context:**
  - PE-10 AC7 (D5) needs focus terminals on Windows.
  - ADR 0014 refuses `/open` on Windows (422) because typing a command waits for a ready line editor, which is a termios check with no Windows equivalent.
  - ADE has no way today to put `ade` on a Windows terminal's `PATH` (PE-14 AC4).
- **Decision (proposed):**
  - **On PATH:** ADR 0014's layout, `<app data>\bin\release\ade.exe`, where `<app data>` is the instance's own (`<root>\app` in an engagement): a hard link to the bundled `ade-hook.exe` (a copy across volumes), checked by hash at start, prepended to each terminal's `PATH`. ADR 0014's `mode()` already treats the argv0 `ade.exe` as the CLI.
  - **Typing replaced:** on Windows, `/open` with a command appends `& '<w1>' '<w2>' …` to the PowerShell integration's encoded start-up text (ADR 0021): one launch form, `-NoLogo -NoProfile -NoExit -EncodedCommand`, never a second `-Command`. Nothing is typed.
  - **One PowerShell quoter,** `ps_quote` in Rust: single quotes, each `'` doubled, control characters refused. ADR 0008's `shellQuote` stays the only POSIX-shell quoter and states it does not cover PowerShell, so this adds no second quoter for any shell.
- **Consequences:**
  - Windows commands run once, after the profile scripts.
  - They are not added to the shell's history.
  - Rust passes a start-up command into `create_pty` on Windows only, which changes ADR 0014's "Rust never spawns", for Windows only.
