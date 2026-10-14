# Agent status, the first step to a phone remote

The goal is an iPhone app that watches and steers the Claude Code agents in
ADE's tabs while ADE keeps running them on the user's own Mac. This spec
sets out the whole system briefly, then the first piece in full: ADE
learning, tab by tab, what each agent is doing. That piece is useful on its
own, before any phone exists.

## The whole system

```
 iPhone (Expo app)               Relay (cloud)                 Mac (ADE)
 tabs and agents     <--WSS-->   accounts, routing,  <--WSS--  remote bridge (Rust)
 approve / deny      ciphertext  APNs push           outbound   hook endpoint (localhost)
 send prompt, ! cmd              never sees content  only       tab registry (PTYs)
                                                                end-to-end crypto, pairing
                                         Claude Code hooks -> ADE helper -> endpoint
```

Four pieces, each with its own spec and plan, in this order:

1. **Agent status in ADE** (this spec).
2. **Relay and pairing.** A hosted relay; each Mac and phone holds a key
   pair; pairing by a QR code shown in ADE; messages end-to-end encrypted, so
   the relay only routes and turns "needs you" into a content-free APNs push.
   Holding permission requests for a phone answer, typing prompts and `!`
   commands into a tab, and reading `!` output back from the transcript land
   here.
3. **iOS app.** Expo / React Native, shipped to TestFlight with EAS. Pairing,
   the tab list with states, an agent screen (latest activity, approve or
   deny, a prompt box that also takes `! command`), push. Protocol types in a
   TypeScript package shared with ADE.
4. **Public free service.** Sign in (Sign in with Apple), rate limits, abuse
   controls, privacy policy, App Store review.

Standing constraints for every piece:

- **The Mac is the host.** Agents, shells, code and keys stay on it. It makes
  outbound connections only and opens no ports to the network.
- **Content leaves a device only encrypted end to end.**
- **Offline, ADE works exactly as today.**
- **An approval answers exactly one prompt** and expires with it.
- **Remote control is off by default, per tab.** A paired phone can run
  commands on the Mac, so it is a deliberate choice, and the phone asks for
  Face ID before it sends a `!` command or an approval.
- **`!` commands run only in tabs running Claude Code**, through its prompt,
  so the command and its output land in the conversation.

Claude Code's own Remote Control (`claude --rc`) was considered and set
aside: an organization admin can switch it off, it is unavailable with an
API key, it drives one session at a time and knows nothing of ADE's tabs,
and it can't ship as ADE's own app.

## What the spikes established

Three throwaway rounds on 2026-10-14 against Claude Code 2.1.299 (Haiku,
`--permission-mode default`) in scratch projects, driven through a pty, with
hooks pointing at a local logging server. Nothing was kept.

**Permission prompts, hook held open (round 1, `http` hook):**

| Case | Result |
|---|---|
| Hook held 15 s, then `allow` | The terminal showed the prompt at the moment the hook fired; the allow ran the command |
| Hook held, **No** (Esc) in the terminal | Terminal won; Claude Code closed the hook's request at once |
| Hook held, **Yes** in the terminal | Terminal won and the command ran; the hook's later `deny` was ignored. The request stayed open and `Stop` was held back until the hook answered; the agent itself carried on |
| Hook answered `{}` (no decision) | The terminal prompt stayed answerable and worked as normal |

**Events and delivery (rounds 2 and 3):**

| Question | Result |
|---|---|
| `SessionStart` over an `http` hook | Never arrives, at launch or after `/clear`. Over a `command` hook it arrives at launch (`source: startup`) and after `/clear` (`source: clear`) |
| `/clear` | `SessionEnd` (`reason: clear`), then `SessionStart` (`source: clear`) |
| `/exit` | `SessionEnd` (`reason: prompt_input_exit`) |
| Esc on a permission prompt | Nothing fires: no `PostToolUse`, no `PostToolUseFailure`, no `Stop` |
| `AskUserQuestion` | Goes through `PermissionRequest` (`tool_name: AskUserQuestion`); `Notification` `permission_prompt` about 6 s later |
| A sub-agent's tool needing approval | `PermissionRequest` carrying `agent_id` and `agent_type`; its `PostToolUse` carries them too |
| A background sub-agent | `SubagentStart`; the main session's `Stop` fired while the sub-agent was still waiting on a permission prompt; `SubagentStop` later |
| Port in an `http` hook URL (`${ADE_HOOK_PORT}`) | Not expanded; no events arrive |
| `http` hook, nothing listening | Every prompt in that session shows `UserPromptSubmit hook error · connect ECONNREFUSED` |
| Hooks added to `settings.local.json` mid-session | Fire from the next prompt on |
| Session started in a subfolder of the project | Picks up the project root's `.claude/settings.local.json` |
| `command` hook `${ADE_HOOK_BIN:-true}`, variable unset | Runs `true`: no output, no hook error, nothing sent |
| Same entry, variable set to a helper | Every event, `SessionStart` included, delivered with the tab id |
| `headers` with `$ADE_TAB_ID` and `allowedEnvVars` | Expanded (round 1) |
| `"${ADE_HOOK_BIN:-true}"` (quoted), helper at a path with a space | Every event delivered, no hook error; unset, it still runs `true` silently (round 3) |
| A `command` hook printing `{}` on `PermissionRequest` | The terminal prompt works as normal (round 3) |
| Two sub-agents each needing approval at once | Both `PermissionRequest`s arrive within half a second: they fire when a prompt is queued, not when it is shown (round 3) |
| Plan approval in plan mode | `PermissionRequest` with `tool_name: ExitPlanMode` (round 3) |

Also seen: `Notification` `permission_prompt` lags the prompt by about six
seconds, so `PermissionRequest` is the immediate signal. Auto mode
(`autoMode` in user settings) rarely prompts at all. The "trust this folder"
dialog is not a hook event.

## Piece 1: agent status

### Decisions

**Turning it on.**

- ADE never writes hooks unasked. The user turns on **Agent status** for a
  folder with one click. "The project" is that folder's git top level (the
  folder itself outside git); a session in any subfolder is covered. A git
  worktree is its own checkout and is turned on separately; when a worktree's
  main checkout has Agent status on and the worktree doesn't, the toggle says
  so and offers to turn it on there too.
- ADE writes its entries to the project's `.claude/settings.local.json`. That
  file is kept out of git (`keep_out_of_git`, which runs on every save).
  Claude Code merges hooks across settings files, so the user's own hooks
  keep running beside ADE's. Hooks added or removed take effect from the next
  prompt of a running session; no restart is needed.

**The hook entry: one command, no port, no path.**

- Every ADE entry is a `command` hook whose command is exactly
  `"${ADE_HOOK_BIN:-true}"`, double quotes included, with `"timeout": 5`. The
  quotes matter: the app installs as `Better Terminal.app`, and an unquoted
  path would split at the space. `http` hooks are not used:
  they never deliver `SessionStart`, can't take the port from the environment,
  and print a hook error on every prompt of a session started while ADE isn't
  listening.
- ADE registers it, with no matcher, for `SessionStart`, `UserPromptSubmit`,
  `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`,
  `SubagentStart`, `SubagentStop`, `Stop` and `SessionEnd`. Each of these was
  seen firing in the spikes. Other events, such as `Elicitation` for MCP
  servers asking the user, are added only after the fixture task has seen them
  fire on the pinned Claude Code version, so an event name Claude Code doesn't
  know never lands in the user's settings file.
- **Outside ADE** the variable is unset, so the hook runs `true`: nothing is
  sent, nothing printed, no error.
- **Inside ADE** every terminal gets, beside the vault variables:
  `ADE_HOOK_BIN` (the helper's absolute path), `ADE_HOOK_PORT`,
  `ADE_HOOK_TOKEN` (random, new each launch) and `ADE_PTY_ID`. Each ADE
  process points its own terminals at its own endpoint, so two processes
  (`open -n`, a dev build beside the installed app) don't interfere, and ADE
  never rewrites project files at start.
- A PTY inherits ADE's own environment, and an ADE started from an ADE
  terminal (a dev build, while dogfooding) inherits the outer one's
  variables. So ADE removes all four from every PTY's environment and then
  sets its own. The endpoint is bound before the first PTY is created; if it
  can't bind, the variables are left out, Agent status shows the failure, and
  terminals work as before.
- `ADE_PTY_ID` is the pane's PTY id: one tab can hold several panes. The id is
  reserved before the shell is spawned (today `create_pty` takes it after
  `spawn_command`); an id lost to a failed spawn is never reused.

**The helper.**

- A small Rust executable shipped inside the app bundle, beside ADE's main
  binary.
- It reads the hook JSON on stdin and forwards only `hook_event_name`,
  `session_id`, `cwd`, `source`, `reason`, `notification_type`, `tool_name`,
  `agent_id`, `agent_type`, and an input hash: HMAC-SHA-256 of `tool_input`,
  keyed with `ADE_HOOK_TOKEN`, over its canonical JSON (keys sorted, no
  whitespace). The key stops a short input such as `git status` being
  recovered from its hash. Prompt text, `tool_input` itself and
  `tool_response` never leave the helper.
- If `tool_input` turns out to differ between a call's `PermissionRequest`
  and its `PostToolUse`, matching on the hash fails safe: the prompt stays
  pending until the clears below. The fixture task checks that the hashes are
  equal for the same call.
- It posts to `127.0.0.1:$ADE_HOOK_PORT` with the PTY id and token as
  headers, waits at most 2 seconds, always prints `{}` and always exits 0. A
  dead or slow ADE costs a session at most 2 seconds per event and never
  changes what Claude Code does.

**The endpoint.**

- Plain HTTP on `127.0.0.1`, on a free port picked at each launch.
- It refuses a request with a wrong or missing token (compared in constant
  time), any `Origin` header, a `Host` other than `127.0.0.1:<port>`, any
  method but `POST`, and a body over 16 KB. It sends no CORS headers and never
  logs bodies.
- It always answers `{}`.
- Known limit, recorded in the contract: the token is in the environment of
  everything started in an ADE terminal (scripts, MCP servers), so any of them
  can forge status. That is acceptable for a status dot. Piece 2 must not
  trust a forged `PermissionRequest` as something a phone may approve without
  a further check, and has to settle that before it holds requests.

**State, kept per session.**

- State is keyed by (PTY id, `session_id`). A pane shows the most urgent state
  of its live sessions, and a tab the most urgent of its panes: **needs you** >
  **waiting for you** > **working** > **ready** > **finished**.
  A `claude -p` run inside the pane has its own session and can't overwrite
  the interactive one.

  | Event | Effect on that session |
  |---|---|
  | `SessionStart` | ready (any `source`) |
  | `UserPromptSubmit` | working; clears its pending prompts and "waiting" |
  | `PermissionRequest` | adds a pending prompt: an id minted by ADE, tool name, `agent_id`, input hash. While any is pending: **needs you** |
  | `PostToolUse`, `PostToolUseFailure` | removes the pending prompt with the same tool name, `agent_id` and input hash, if any |
  | `Notification` `idle_prompt` | waiting for you; clears pending prompts |
  | `SubagentStart` / `SubagentStop` | adds / removes a running sub-agent |
  | `Stop` | finished, but stays **working** while sub-agents run and **needs you** while prompts are pending |
  | `SessionEnd` | the session is dropped (after `/clear` a new one starts) |

- **Esc fires nothing**, so a prompt dismissed in the terminal would stay
  pending. Prompts are queued and fire `PermissionRequest` when queued, so
  several can be pending and only the oldest is on screen. When the user
  presses a key that answers a prompt (Enter, Esc, a digit, `y` or `n`) in a
  pane with pending prompts, ADE removes that pane's **oldest** pending
  prompt, but only for the first such key since the pane's last
  `PermissionRequest`, `PostToolUse` or `PostToolUseFailure`. One answer often
  takes several of those keys (a digit then Enter, or typed feedback after
  "No"), and they must not eat the next queued prompt. Any of those events
  re-arms it. When this guesses wrong, it errs toward still showing **needs
  you**, which the next `UserPromptSubmit` or `idle_prompt` clears.
- Only real key presses count. They are taken from xterm's key-event handler
  (`attachCustomKeyEventHandler`), not from `onData`, which also carries bytes
  xterm generates itself (focus reports, cursor and device replies, mouse
  reports). Text ADE writes into a PTY (the scratchpad's send, terminal
  commands) never clears anything.
- Pending prompts clear in any case on the session's next `UserPromptSubmit`
  or `idle_prompt`.
- **Dropping state.** All state for a PTY goes when its shell exits (the
  reader's exit callback in `pty.rs`). When a pane's shell has had no child
  processes for two polls in a row (below), that pane's sessions are dropped
  too, which covers a `claude` that crashed or was killed while its shell
  lives on. Sessions are never dropped because Claude Code wasn't
  recognised: recognition can miss (a wrapper, an unusual install), and a
  miss must not delete live state. Turning Agent status off drops the state
  of sessions whose `cwd` is in that project.

**What the user sees.**

- A dot on the tab, and on its Fleet card, for **needs you** and **waiting for
  you**. Working, ready and finished show nothing new in piece 1.
- A toast when a pane becomes **needs you** and is not in view. In view means
  in the active tab of a focused ADE window. One toast per pane until it
  leaves **needs you**; clicking it brings that tab forward.

**No silent failure.**

- For panes in an agent-status project, ADE polls every 2 seconds for Claude
  Code anywhere in the shell's process tree. Today's `get_foreground_pid`
  (`pty.rs`) is not enough: it takes only the shell's newest direct child, so
  `npx`, `caffeinate claude` or `op run -- claude` would be missed.
- A process counts as Claude Code when its process name or the base name of
  its `argv[0]` is `claude`; or its executable sits under a
  `claude/versions/` folder (the native installer runs
  `~/.local/share/claude/versions/<version>`, so the executable's own file
  name is the version); or it is `node` and an argument's base name is
  `claude`, or is `cli.js` under `@anthropic-ai/claude-code`. The fixture task
  records what a native, an npm-global and an `npx` install look like, and the
  tests use those.
- When a pane's shell has Claude Code under it and no event has come from
  that PTY id within 10 seconds, the pane shows "Agent status isn't receiving
  events". `SessionStart` reaches the helper within about a second of launch,
  so this doesn't misfire on a slow start. The note goes away as soon as an
  event arrives, so a first launch held at the "trust this folder" dialog
  clears itself once the user answers.
- The message names the likely causes: hooks turned off by policy
  (`disableAllHooks`, `allowManagedHooksOnly`), the folder not yet trusted in
  Claude Code, or Claude Code started before ADE added its entries. In the
  last case events start with the next prompt, since hooks reload without a
  restart.
- The check takes its clock as a parameter so it can be unit-tested.

**Settings writes.**

- Every ADE write to `settings.local.json`, presets and hooks alike, holds an
  exclusive file lock, so two ADE processes can't interleave. The lock file
  lives in a per-user folder that both the installed app and a dev build use
  (`$TMPDIR` on macOS, `$XDG_RUNTIME_DIR` or else `~/.cache/ade` on Linux),
  named from a hash of the settings file's path. It is opened without
  following symlinks and with mode 0600, and nothing is added to the
  project. ADE re-reads the file under the
  lock, just before writing.
  Claude Code also writes this file ("don't ask again" adds to
  `permissions.allow`), so the window for a lost write is kept to the
  read-modify-write itself.
- A symlinked `settings.local.json` is written through to its target, never
  replaced by a regular file.
- If `hooks`, `hooks.<Event>` or a matcher group has an unexpected shape, ADE
  refuses with a message and changes nothing.
- An ADE entry is a hook whose `command` is exactly `"${ADE_HOOK_BIN:-true}"`.
  Adding is idempotent. Removing deletes only those hooks, then any matcher
  group left empty, any event left empty, and `hooks` if empty. A user hook in
  the same matcher group stays.

### Platforms

macOS and Linux as specified. On Windows, Claude Code's choice of shell for
`command` hooks decides whether `"${ADE_HOOK_BIN:-true}"` works; that is checked
on Windows before the toggle is offered there. Until then Windows doesn't show
the toggle.

### Packaging

A fresh checkout's checks (`npx tsc --noEmit`, `npm test`, and `cargo test`
in `src-tauri`) must keep passing with no extra step, and they don't change.
Tauri's `externalBin` needs the binary to exist before `src-tauri` itself is
compiled, so the helper can't be a binary of that crate listed in the main
config.

- **Its own crate.** The helper is a small crate, `src-tauri/ade-hook`, in a
  Cargo workspace with `src-tauri`. Its forwarding logic (the field filter,
  the keyed hash, the always-`{}` rule) is one source file that `src-tauri`
  also compiles as a module, so the existing `cargo test` covers it.
- **Bundled at release only.** `externalBin` (`binaries/ade-hook-<target
  triple>`) is set in a release-only config file passed to `tauri build`, and
  the release workflow (`.github/workflows/release.yml`) builds the helper and
  copies it there first, on each platform it builds. `tauri dev` and
  `cargo test` never reference it. On macOS the helper is signed and
  notarized with the app.
- **Found at run time.** A release build sets `ADE_HOOK_BIN` to the helper
  beside its own executable. A dev build uses `target/debug/ade-hook`, built
  by `cargo build -p ade-hook`. If the helper isn't there, ADE leaves the four
  variables out and Agent status says the helper is missing.

### Known limits

- **Stale environment.** A long-lived process started in an ADE terminal,
  such as a tmux server, keeps that ADE's variables after ADE quits or
  updates. Claude Code started under it reports to a port nobody holds; the
  helper fails quietly and the session goes without status. If the helper's
  path itself has gone (an update moved it), that session shows a hook error
  until it is restarted.
- **tmux and ssh.** Claude Code inside tmux is foreground in tmux's own PTY,
  not ADE's, so the "not receiving events" check can't see it. Over ssh the
  remote machine has no helper. Neither is covered in piece 1.
- **Forgeable status.** See the endpoint's known limit above.

### Shared contract

`.ade/context/agent-events.md` records the environment variables, the hook
entry, the fields the helper forwards, the endpoint's rules, the states and
transitions, the known limits, and the Claude Code version they
were checked against (2.1.299). Pending prompts carry ADE's own id, so piece 2
can answer one prompt without depending on Claude Code's payload, which has no
tool-use id.

### Testing

- **Fixtures.** The build's first task captures real hook payloads, one per
  event above, with the method used in the spikes. They are trimmed to the
  forwarded fields, labelled with the Claude Code version, and stored as test
  fixtures. The same task confirms that a call's `PermissionRequest` and
  `PostToolUse` give the same input hash, and records what an MCP
  elicitation sends.
- **Helper:** forwards only the listed fields (a fixture with a prompt and
  tool output proves neither leaves); the input hash is keyed and ignores key
  order; prints `{}` and exits 0 when ADE is down, slow or refusing.
- **Endpoint:** right, wrong and missing token; `Origin`; foreign `Host`;
  non-POST; oversize body; always `{}`.
- **State:** every row of the table; two sessions in one pane; a
  `claude -p` session's `SessionEnd` leaving the interactive one alone; a
  sub-agent's `PostToolUse` not clearing a main-session prompt; `Stop` with a
  sub-agent pending; two queued prompts and one answering key removing only
  the oldest; a digit then Enter, and "No" plus typed feedback containing
  `y`, `n` and digits, each removing exactly one; a focus report, a mouse report and a scratchpad send removing
  nothing; `/clear`; PTY exit; a shell with no children for two polls;
  sessions kept when Claude Code isn't recognised; turning off.
- **PTY:** the `ADE_PTY_ID` a child sees equals the id `create_pty` returns;
  inherited `ADE_HOOK_*` and `ADE_PTY_ID` values are replaced; with no
  endpoint, none of the four are set.
- **Recognising Claude Code:** the recorded native, npm-global and `npx`
  process shapes count, also under a wrapper (`caffeinate`, `op run --`); a
  plain shell, another `node` program and an unrelated binary named after a
  version folder elsewhere don't.
- **Settings:** adds with `"timeout": 5`; keeps the user's hooks and other
  keys, including a user hook in the same matcher group; idempotent; removes
  exactly ADE's entries and empty containers; refuses an unexpected shape; a
  symlink is written through; a preset change and a hooks change in parallel
  both survive, within one process and across two.
- **"Not receiving events"** with an injected clock: shown after 10 s without
  events, not shown when `SessionStart` arrived, gone once a late event
  arrives, not shown outside an agent-status project.
- **Frontend:** the tab and Fleet dots; the toast only for a pane not in view,
  once per pane.
- **Against real Claude Code:** a manual check script, run before release,
  that starts Claude Code in a scratch project with ADE's entries, with the
  helper at a path containing a space, and asserts the events arrive and no
  hook error shows. It confirms Claude Code starts with no settings error or
  warning on screen, so the file as ADE wrote it is accepted. It also answers one prompt with "don't ask again" and
  confirms ADE's `hooks` survive Claude Code's own write to the file. Its result and the version go in the story's
  Verification section.

### Not in piece 1

Holding permission requests for a remote answer, sending prompts or `!`
commands to a tab, reading `!` output, the relay, pairing, the phone. Those
are piece 2 and later.
