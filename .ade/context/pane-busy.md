# Pane busy check

Whether a pane is running something, for the agent picker's "This terminal"
offer and every close confirmation. Plan: `_bmad-output/plan-hermes-provider.md`,
Story B.

## Tauri command `pty_foreground_job`

- `invoke<Fg>("pty_foreground_job", { id: ptyId })`, in `src-tauri/src/pty.rs`.
- Reads the pty's foreground process group leader (`process_group_leader()`),
  then its sysinfo `name()` and `cmd()`, and returns only a classification:
  - `{ "kind": "unknown" }`: no foreground group, or the process is gone.
  - `{ "kind": "shell" }`: a known shell (`sh bash zsh fish dash ksh mksh tcsh
    csh nu elvish`) with an interactive argv (options only: `-i -l --login
    --interactive --norc --noprofile --no-config -f`, `-o X`, `-C X`,
    `--rcfile X`, `--init-file X`, clusters of `ilfxvuemp`; no `-c`, no operand).
  - `{ "kind": "busy", "label": string, "names": string[] }`: anything else,
    including tmux, screen and zellij. `label` is the normalised argv[0]
    basename, else the normalised name, else `"unknown program"`. `names` holds
    the normalised name and argv[0] basename, for matching a provider binary.
- Names are normalised: basename, lowercase, leading `-` and `.` stripped,
  trailing `-wrapped` stripped. A 15-character candidate matches a longer
  listed name by prefix (Linux `comm`).
- `Err` when the pty is unknown, and always on non-Unix.

## Frontend

- `paneBusy(paneId): Promise<string | null>` (`src/hooks/useTerminal.ts`):
  the name to show ("a live X session"), or null when free. The decision is
  `decideBusy` in `src/lib/paneBusy.ts`: a running tracker session wins; else
  a `busy` sample counts only if a second one 250 ms later is also `busy`;
  `unknown` or a rejected call falls back to the old text heuristic
  `hasActiveProcess`, which nothing else may call.
- The label is the pane's most recent tracker session's agent name when
  `binaryFor(provider)` matches one of `names`, else the `label`.

## Close events (window `CustomEvent`s, handled by `useGuardedClose` in App)

- `request-close-tab`, `{ tabId }`: the tab bar and the command palette's Close Tab.
- `request-close-pane`, `{ tabId, paneId }`: the command palette's Close Pane.
- `request-close-tabs`, `{ tabIds }`: Close others / to the right.
- Nothing outside `useGuardedClose` and the store's own callers should call
  `closeTab`/`closePane` for a user's close.
