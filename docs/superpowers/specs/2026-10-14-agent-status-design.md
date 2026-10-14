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
                                                    Claude Code hooks --HTTP--> endpoint
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

## What the spike established

Run on 2026-10-14 against Claude Code 2.1.299 in a scratch project, with an
`http` `PermissionRequest` hook on a local server that could hold the
request open. Throwaway; nothing was kept.

| Case | Result |
|---|---|
| Hook held 15 s, then `allow` | The terminal showed the prompt at the moment the hook fired; the allow ran the command |
| Hook held, **No** (Esc) in the terminal | Terminal won; Claude Code closed the hook's HTTP request at once |
| Hook held, **Yes** in the terminal | Terminal won and the command ran; the hook's later `deny` was ignored. The request stayed open, and `Stop` was held back until the hook answered; the agent itself carried on |
| Hook answered with no decision (`{}`) | The terminal prompt stayed answerable and worked as normal |
| `headers: {"X-Ade-Tab": "$ADE_TAB_ID"}` with `allowedEnvVars` | Every event arrived with the tab id set in the terminal's environment |

Also seen: `Notification` with `permission_prompt` arrives about six seconds
after the prompt, so `PermissionRequest` is the immediate signal. A session in
auto mode (`autoMode` in the user's settings) rarely prompts at all. The
"trust this folder" dialog is not a hook event.

## Piece 1: agent status

### Decisions

- **ADE never writes hooks unasked.** The user turns on **Agent status** per
  project with one click. ADE then adds its hook entries to the project's
  `.claude/settings.local.json`, the file it already manages for token presets
  (`usage.rs`), kept out of git, with the same rules: only ADE's own entries
  are written, everything else in the file is kept, and a file ADE creates is
  added to `.git/info/exclude`. Turning it off removes exactly ADE's entries.
  Claude Code merges hooks across settings files, so the user's own hooks keep
  running beside ADE's.
- **ADE's hook entries are recognised by their URL** (the ADE endpoint path),
  so adding them twice changes nothing and removal never touches a user's
  hook.
- **Events and their state.**

  | Hook event | Tab state |
  |---|---|
  | `SessionStart`, `UserPromptSubmit` | working |
  | `PermissionRequest` | needs you: tool name and a one-line summary of its input |
  | `PostToolUse` | working |
  | `Notification` (`idle_prompt`) | waiting for you |
  | `Stop` | finished |
  | `SessionEnd` | no agent |

  Each state keeps the session id and the time of the event. A tab with no
  event yet has no agent state and shows nothing new.
- **Piece 1 only observes.** The endpoint answers every hook at once with an
  empty 2xx body: no decision, no block. The spike showed this leaves the
  terminal prompt as it is today.
- **A loopback endpoint with a per-launch secret.** At start ADE serves HTTP
  on `127.0.0.1` only. Every terminal ADE starts gets `ADE_TAB_ID` (its PTY id)
  and `ADE_HOOK_TOKEN` (random, new each launch) in its environment, beside the
  vault variables. Hooks send both as headers through `allowedEnvVars`. A
  request without the right token is refused; one without a tab id, from a
  session started outside ADE, is answered and changes no tab.
- **What the user sees.** A "needs you" or "waiting" dot on the tab and on its
  Fleet card. A toast when a tab other than the one in view starts needing the
  user; clicking it switches to that tab. Nothing for the tab in view.
- **No silent failure.** If a new Claude Code session appears in an agent-status
  project (ADE already watches transcripts for Fleet) and no event carrying
  its session id arrives within 10 seconds, it counts as missed. Events
  without a tab id still count toward this check, so a session started
  outside ADE doesn't set it off. A missed session makes the project show "Agent status isn't
  receiving events", naming the likely causes: hooks disabled by policy
  (`disableAllHooks`, `allowManagedHooksOnly`), or a session started before the
  hooks were added.

### Settled first in the build

- **A session outside ADE, with ADE closed.** Start `claude` in another
  terminal in an agent-status project while ADE is not running, and see what
  the failing hook calls show. If they print errors in that session, ADE's
  entries become a small `command` hook that exits quietly when `ADE_TAB_ID`
  is unset and otherwise posts to the endpoint.
- **The endpoint's port.** Check whether a hook `url` expands environment
  variables. If it does, the port travels as `ADE_HOOK_PORT`. If not, ADE keeps
  one port across launches, stored in its app state, and rewrites the hook
  entries of agent-status projects only if that port is taken at start.

### Shared contract

The event payload ADE accepts, the headers, the state names and their
transitions are recorded in `.ade/context/agent-events.md`. Pieces 2 and 3
build on it.

### Testing

- Rust: token check, tab-id handling, parsing each hook event (fixtures are
  the payloads captured in the spike), the state transitions, the 10-second
  "no events" check.
- Settings merge: adds ADE's entries, keeps a user's hooks and other keys, is
  idempotent, removes only ADE's entries, adds a created file to
  `.git/info/exclude`.
- Frontend: the tab and Fleet dots, and the toast firing only for a tab not in
  view.

### Not in piece 1

Holding permission requests for a remote answer, sending prompts or `!`
commands to a tab, reading `!` output, the relay, pairing, the phone. Those
are piece 2 and later.
