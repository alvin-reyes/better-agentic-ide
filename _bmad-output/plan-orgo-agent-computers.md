---
title: 'Agent computers from Orgo: MCP and CLI now, a native panel later'
type: 'feature'
ticket: ''
created: '2026-10-29'
status: 'approved'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'adversarial'
review_source: 'pinned'
lenses_ran: ['adversarial']
review_loop_iteration: 5
context: ['.ade/context/decisions/0010-agent-computers-are-orgo-only-and-made-on-click.md']
---

> **Status (2026-10-29): approved by the owner at f32ca1e ("Approve and build"), for Stories 1 and 1b only.** Story 1c stays on hold. Stories 2 to 6 stay an outline, deferred on P4 in the product doc (`_bmad-output/product-ide-and-harness.md`, branch `plan/product-ide-and-harness`). ADR 0010 is accepted.

**Step 1** is built in order:
- **Story 1:** Orgo's hosted MCP server in the MCP library, signed in through Claude Code. Claude Code asks before any computer is created, changed, stopped or deleted. Rules go in three places: every Claude Code launch ADE makes (picker, board and Orchestrator), the project's shared settings, and the main checkout's root local settings, which Claude Code reads from any subfolder and any worktree.
- **Story 1b:** a hard stop for ADE's Continuous mode, as `--disallowedTools` on the launch line.
- **Story 1c, the Orgo CLI: ON HOLD** pending the owner. The review's findings are recorded under it, unaddressed.

**Stories 2 to 6** are step 2, the native panel, outlined only. All Orgo permission rules live in one module, `src-tauri/src/orgo_rules.rs`. Shared intent, decisions, security and cost come first.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An agent working in ADE has only the user's own machine. It cannot test the UI it just built in a clean desktop and browser. It cannot run Claude Code somewhere other than the user's laptop, fan work out across several machines, or run untrusted code away from the user's files and keys. Orgo rents cloud computers made for agents to drive. ADE has no way to reach them.

**Approach:** Orgo only.
1. **MCP:** Orgo's hosted MCP server (`https://www.orgo.ai/mcp`) in ADE's MCP library, signed in with the user's Orgo account through Claude Code's `/mcp`. Claude Code asks before every tool that creates, copies, resizes, re-times, starts, resumes, stops or deletes a computer, or enables SSH. The rules match by verb across any server named like Orgo.
2. **Continuous hard stop:** when ADE launches Continuous mode, the tools and commands that create or start computers are denied on the command line, where the agent cannot edit them.
3. **CLI (on hold):** the `orgo` CLI, installed and guided, with its risky commands asking.
4. **Native panel, later:** a click creates a computer and opens its live desktop in a tab, with lifecycle, a spend guard, a remote terminal and fleet cost.

## Owner's decisions (2026-10-29)

1. **Purposes, all four:** computer use (an agent drives a real desktop and browser, for example to test the UI it built); Claude Code running remotely from an ADE tab; a parallel fleet across several machines, shown in the fleet view with cost; a throwaway sandbox for untrusted code.
2. **Depth:** MCP first, then a native panel with the live desktop, lifecycle and cost.
3. **Provider:** Orgo only. No provider-neutral abstraction.
4. **(Q7) Story 1 uses Orgo's hosted MCP server**, with the user signing in through Claude Code's MCP OAuth flow. No API key in ADE's vault, no npx package, no local server. The review found that the local server:
   - puts root VNC passwords into model context;
   - exposes `orgo_get_vnc_password`, `orgo_enable_computer_ssh`, `orgo_apply_computer_secrets`, `orgo_move_computer` and workspace edits.

   Orgo's sign-in list leaves these out "so a sign-in is never sent a computer's password" (https://docs.orgo.ai/guides/mcp).
5. **Orgo tools that create, copy, resize, extend, start, stop or delete a computer always ask**, in every mode, ADE's Continuous mode (`claude --dangerously-skip-permissions`, `src/lib/agentCommand.ts:50`) included. Story 1 delivers it as follows:
   - **Every Claude Code session ADE launches** carries the rules on its command line (`--settings`): the agent picker, the board's dispatch and the Orchestrator. `buildLaunchCommand` cannot be called without them, so a new launch path cannot leave them out. That holds in any folder and any mode, and the agent cannot edit it.
     - The Orchestrator runs `claude -p` without bypass, where a prompt cannot be shown. Its Orgo lifecycle calls are refused rather than asked, which they already were before this story.
   - **Sessions the user starts themselves** on this machine, anywhere in the repository, read the rules from `.claude/settings.local.json` at the root of the main checkout. That is also the file Claude Code reads inside a git worktree.
   - **Teammates** get them from the committed `.claude/settings.json` when they start at the root.

   Not covered:
   - a user-started session whose Continuous-mode agent deletes the rules from the files;
   - sessions outside this repository;
   - providers that are not Claude Code (Codex);
   - an organisation that sets `allowManagedPermissionRulesOnly`, under which Claude Code ignores both the launch flag's and the files' rules.
6. **(Q5) Claude Code on a remote computer signs in with a dedicated, spend-limited Anthropic Console key** that the user makes for remote machines. ADE sends it only on an explicit, confirmed action and never copies the user's own Claude login (step 2, Story 4).
7. **(Q3) Not needed for Story 1.** The panel's key stays an open question for step 2.
8. **(Q8) Yes, Story 1b.** Continuous launches pass `--disallowedTools` for the create, clone, fork, start, restart and resize tools, and the CLI's creating commands where Claude Code's pattern syntax allows. After review round 3: **always**, as server-glob patterns, not only when the project's `.mcp.json` names `orgo`. Orgo's own `claude mcp add` writes to `~/.claude.json`, and an ancestor `.mcp.json` or another server name would be missed.
9. **(Q9) A dedicated ADE workspace in Orgo.** The sign-in uses it, and so do any CLI key and step 2's key.
10. **The Orgo CLI: "install + guide, agent asks" (Story 1c).** **On hold** after review round 3: the parallel product doc recommends shipping it only as the CLI library's `orgo` entry, after Story 1 has been used with a real account. Awaiting the owner.
11. **(Q12) "Accept, fix later."** The first Orgo install may reorder a committed `.claude/settings.json`, keeping every value. Story 1's notice and guide say so. Key-order preservation becomes its own small story.
12. **Approval (2026-10-29, at f32ca1e): "Approve and build"** for Stories 1 and 1b. Story 1c remains on hold. Stories 2 to 6 remain an outline, deferred on P4. ADR 0010 is accepted with this approval.

## Boundaries & Constraints (all stories)

**Always:**
- Orgo's own hosted MCP server, Orgo's own CLI, and Orgo's documented REST and WebSocket endpoints. No third-party wrapper.
- Every Orgo permission rule ADE writes or passes comes from `src-tauri/src/orgo_rules.rs`. The webview cannot add one.
- Every Orgo or Claude Code fact a story relies on is cited below. A fact marked unverified (U-list) is checked before the story that needs it is sharded.
- ADE edits `.claude/settings.json` and `.claude/settings.local.json` only by merging. The user's keys, values and rules are kept, and rule lists keep their order. A file that is not valid JSON is left alone and the action is refused. ADE never deletes a rule.
- The verification command is unchanged.

**Never:**
- ADE never creates, starts or resizes an Orgo computer without the user's click. This holds for the native panel in every story. In the MCP and CLI paths, Claude Code runs the call, and these stories' rules make it ask, or deny it in Continuous mode.
- ADE never sends `billing_mode: "hourly"`, never calls Account, Clients, Billing or capacity-buying endpoints, never runs `orgo billing`, and never adds credit.
- ADE never copies the user's Claude Code credentials, `~/.claude`, `~/.orgo/credentials.json`, the keychain's Claude entry, SSH keys or any other vault secret to an Orgo computer. The one exception is decision 6.
- ADE never edits `~/.claude/settings.json` or `~/.claude.json`.
- No change to `relay/` or `mobile/`. No provider abstraction.

## Security

- **No Orgo key in ADE for Story 1.** `.mcp.json` holds only `{"type": "http", "url": "https://www.orgo.ai/mcp"}`. Claude Code runs the OAuth sign-in and keeps the tokens. Orgo issues 1-hour access tokens with rotating refresh tokens.
- **What the MCP sign-in grants** ([Orgo MCP guide](https://docs.orgo.ai/guides/mcp)):
  - The grant covers one workspace, the dedicated ADE workspace. In it, Claude Code can create and manage computers, screens and files.
  - Only Orgo's reviewed tool list is offered: no templates, clients, account, chat, support, workspace create/change/delete, suspend/resume, upload, `get_vnc_password`, `apply_computer_secrets` or `move_computer`.
  - It is never sent a computer's password.
  - On a paid account, it cannot launch hourly computers (`403 HOURLY_NEEDS_BILLING`).
  - To revoke: Orgo Settings → Security → Connected AI apps, or `/mcp` → Clear authentication, or `claude mcp logout orgo`.
- **Always ask (decision 5).** The 23 `MCP_ASK` rules are verb globs on the tool name, with a glob in the server position, for example `mcp__*orgo*__*create*`. They go to three places:
  1. **Launch flag.** ADE passes `--settings '{"permissions":{"ask":[…]}}'` on every Claude Code launch it makes: the picker, the board and the Orchestrator. They hold in any working directory and in any mode, and a launch flag cannot be edited from inside the session.
     - The flag's lists merge with the files' lists: Claude Code collects permission rules per source and concatenates them (review round 4, Claude Code 2.1.42 and 2.1.312).
  2. **The main checkout's root `.claude/settings.local.json`.** "If you start Claude Code in a subdirectory of a git repository, it reads and writes that file at the repository root", and "in a worktree, it uses the file at the main checkout's root" ([settings](https://code.claude.com/docs/en/settings), Claude Code ≥ 2.1.211).
  3. **The project's `.claude/settings.json`**, committed for teammates who start at the root.

  The `.mcp.json` that loads Orgo is found from the working directory and every parent directory (review round 3, Claude Code's loader). `.claude/settings.json` is read only from the primary working directory. That is why the shared file alone was not enough.
- **Claude Code's guarantees** ([permission modes](https://code.claude.com/docs/en/permission-modes), [permissions](https://code.claude.com/docs/en/permissions), [settings](https://code.claude.com/docs/en/settings)):
  - "Claude Code doesn't auto-approve the following in any mode, including `bypassPermissions` … Tools matched by an explicit ask rule."
  - Rules are evaluated deny, then ask, then allow.
  - A local "don't ask again" allow "doesn't outrank an `ask` rule from a project or managed file".
  - Ask and deny rules take globs in the tool-name position. The pattern must match the whole name, and names with `*` raise no "matches no tool" warning, so the globs are silent where Orgo isn't installed.
- **What these rules cannot stop, stated plainly:**
  - **User-started sessions in Continuous or bypass mode.** The agent can edit both settings files, and Claude Code reloads them. ADE-launched sessions keep the launch-flag rules.
  - **Other clients and repositories.** Claude Code sessions outside this repository, Codex and other non-Claude Code agents, and Orgo signed in under a server name without lowercase "orgo" in it. Matching is case-sensitive, so a claude.ai connector named `Orgo` is missed.
  - **Managed-only rules.** Under an organisation policy of `allowManagedPermissionRulesOnly`, Claude Code ignores every rule outside managed settings, the launch flag's and the files' included. The guide says so.
  - **New tool names that use none of the verbs.** The globs fail open for a future tool whose name avoids all 23 verbs.
  - **The CLI and the REST API**, until Story 1c, and then only as far as Bash patterns go.
  - **Actions on a computer.** Screenshot, mouse, keyboard, bash and Python on the remote computer still prompt in Manual mode and run unprompted in Continuous mode, by design. Their effects stay on the remote computer.
- **Prompt injection.** A web page shown on a computer is untrusted input that comes back as a screenshot.
  - It can steer the agent's actions there, where they are contained, and lifecycle tools ask or are denied.
  - It can push the agent to type local data into the computer, or act locally with local tools, which Orgo's rules do not cover.
  - The guide says: use disposable computers, don't sign in to personal accounts on them, and don't run Continuous mode while the agent browses sites you don't trust.
- **Step 2's key (Q3).** The webview can read any vault value today through `vault_get(name)` (`src-tauri/src/vault.rs:137-140`, `lib.rs:483`). Story 2 first limits it to an allowlist, which today is `DEEPSEEK_API_KEY` (`src/lib/anthropic.ts:176`).
- **The computer password is root on that machine.** No ADE path shows, logs or stores it.

## Cost

- **What a computer costs** ([billing](https://docs.orgo.ai/guides/billing), [prices](https://docs.orgo.ai/guides/pricing)):
  - On a paid plan, a computer that fits the plan's remaining capacity is included. Past that, it is hourly from credit, but only for a caller with Billing write, which is never an MCP sign-in.
  - On a free account: hourly from credit, $5 signup credit, Medium only.
  - Linux hourly runs $0.023/h (Small) to $0.202/h (XL), billed per second. At most 50 computers per paid plan.
  - GPU prices are unpublished (U11). ADE never creates GPU computers.
- **A computer costs money until it is deleted.** A stopped hourly computer still pays for its disk, from $0.0017/h. A computer whose end passes is stopped, then deleted 7 days later unless started. The CLI's `computers create` has no end option.
- **The real spend limit is the Orgo plan or credit, not ADE.**
  - On a paid plan, a runaway agent can fill the capacity the user already pays for, up to 50 computers.
  - On a free account it can spend the credit, plus whatever auto top-up charges, up to 5 times in 24 hours. The guide says to leave it off.
  - The ask rules put a prompt before every create, and Continuous launches cannot create at all. Neither is a cap.
- **The native panel adds ADE's own guard** (Story 2): a cap on running ADE-made computers, an end on every computer it creates, auto-stop when idle, and no hourly launches.

</frozen-after-approval>

## What Orgo offers (verified 2026-10-29 against the live docs)

The base URL is `https://www.orgo.ai/api`, and computers are addressed by UUID as `/computers/{id}/…`. A create takes `workspace_id`, and the older name `project_id` is still accepted. `/api/projects/{project}/computers/{name}/…` is not in the current spec.

| # | Fact | Source |
|---|---|---|
| F1 | REST auth is `Authorization: Bearer $ORGO_API_KEY`, with keys beginning `sk_live_`. Spec 2.0.0 has 86 operations. | https://docs.orgo.ai/llms.txt, https://docs.orgo.ai/api-reference/introduction |
| F2 | Hosted MCP: `https://www.orgo.ai/mcp`. Unauthenticated, it answers `401` plus `WWW-Authenticate: Bearer resource_metadata=…`. Its OAuth metadata publishes dynamic client registration, PKCE S256, public clients and revocation. Tools are `orgo_` + the operationId in snake_case, and a sign-in sees a reviewed subset. | https://docs.orgo.ai/guides/mcp; probed 2026-10-29 |
| F3 | Live spec groups: Workspaces 5, Computers 14, Computer Lifecycle 7, Computer Actions 10, Templates 15, Files 7, Screens 5, Account 3, Clients 15, Chat 1, Agent accounts 3, Support 1. | https://docs.orgo.ai/api-reference/openapi.json |
| F4 | Create: `POST /computers` (`workspace_id`, `name`, `os`, `ram`, `billing_mode`, `ends_in_hours` 1 to 720, `template_ref`, `gpu`). | https://docs.orgo.ai/api-reference/computers/create |
| F5 | Lifecycle: stop archives the disk and reads `frozen`. Delete is permanent. An end stops the computer, which is deleted 7 days later. Auto-stop is off by default. | https://docs.orgo.ai/api-reference/computers/stop, https://docs.orgo.ai/guides/computer-ends |
| F6 | Billing: see Cost. | https://docs.orgo.ai/guides/billing, https://docs.orgo.ai/guides/pricing |
| F7 | Live desktop over `wss://www.orgo.ai/desktops/{id}/ws/websockify?token={vnc_password}`. Close codes `4001`, `4003`, `4006`, `4007`, `4008`. | https://docs.orgo.ai/guides/embed-vms |
| F8 | Terminal over `/ws/terminal` with a named `session`. Direct SSH on Linux. | https://docs.orgo.ai/api-reference/computers/terminal, https://docs.orgo.ai/guides/ssh |
| F9 | Commands `bash` and `exec`; files: upload (10 MB), export, download. | https://docs.orgo.ai/llms.txt |
| F10 | Keys are full or Custom, scoped to the account, one workspace or one computer. `computer_key_held`; template secrets need Secrets write. | https://docs.orgo.ai/api-reference/api-keys/permissions, …/computer-keys |
| F11 | Rate limits: "some endpoints" `429`; back off 1 s to 60 s. | https://docs.orgo.ai/api-reference/introduction |
| F12 | The `Computer` schema (with `vnc_password`) is the response of `createComputer`, `getComputer` and `resizeComputer`. The review found it in workspace listings too. | openapi.json |
| F13 | The CLI: `npm install -g orgo` or the install script, `orgo login` (device code, `~/.orgo/credentials.json`), `--json`, `orgo manifest`. | https://docs.orgo.ai/guides/cli |
| F14 | CLI 2.3.0, read from its bundle: global options `--json`, `--quiet` and `--profile`, accepted before or after the subcommand; aliases `c`, `ws`, `t`, `keys`, `rm`; undocumented `clone`, `handoff` and `egress`. See the Story 1c hold note for corrections. | `npm pack orgo@2.3.0` |

**Claude Code facts this plan relies on (verified 2026-10-29):**
- **Remote MCP servers.** A remote server is `{"type": "http", "url": "…"}`, sign-in is `/mcp`, and OAuth fields are needed only for servers without automatic setup ([MCP](https://code.claude.com/docs/en/mcp)).
- **Tool-name globs.** Ask and deny rules accept globs in the tool-name position, and "the pattern must match the full tool name". Allow rules need a literal `mcp__<server>__` prefix. "Tool names containing `_` or `*` are exempt from the [matches no tool] check" ([permissions](https://code.claude.com/docs/en/permissions)).
- **Bash patterns.** `*` can go anywhere. A trailing ` *` that is the only wildcard matches the bare command. Ask and deny rules apply to any subcommand of a compound command and match past any leading assignment. Only the listed wrappers are stripped: `env`, `npx` and absolute paths are not ([permissions](https://code.claude.com/docs/en/permissions)).
- **`--settings <file-or-json>`** takes "a settings JSON file or an inline JSON string". It applies "above your user, project, and local files and below managed settings", for that session only. "When you set the same list key, such as `permissions.allow`, in more than one file, Claude Code combines the lists" ([CLI reference](https://code.claude.com/docs/en/cli-reference), [settings](https://code.claude.com/docs/en/settings)).
  - **U13, settled in review round 4.** The flag takes one value. Permission lists are collected per source and concatenated (Claude Code 2.1.42 `Jq6`/`jM5`, 2.1.312 `To()`/`rse`), so the flag's `ask` rules add to the files' rules. No union fallback is needed.
- **Settings-file locations.**
  - `.claude/settings.json` is read from the primary working directory.
  - `.claude/settings.local.json` is read at the repository root from a subdirectory, and at the main checkout's root inside a worktree. The exceptions are outside git, at a home-directory root, on Windows, or when the root isn't owned by the user, where it stays with the start directory.
  - Settings edits reach a running session ([settings](https://code.claude.com/docs/en/settings)).
  - `allowManagedPermissionRulesOnly` makes managed settings the only source of permission rules ([permissions](https://code.claude.com/docs/en/permissions)).
- **`--disallowedTools`** takes deny rules as separate arguments. A bare or glob tool name removes the tool from context. It takes a list, so another flag must follow it ([CLI reference](https://code.claude.com/docs/en/cli-reference)).
- **Modes.** Explicit ask rules prompt even in `bypassPermissions`, deny rules block in every mode, and bypass may write `.claude/` ([permission modes](https://code.claude.com/docs/en/permission-modes)).
- **ADE.**
  - It supports remote sign-in servers (`src/data/mcpCatalog.ts:44-49`, `IntegrationsPanel.tsx:83,183`).
  - **(Corrected in round 4.)** Three paths launch agents:
    - `AgentPicker` (`AgentPicker.tsx:151,190`), in the pane's cwd, and the board's `dispatchAgent` (`agentLaunch.ts:63-77`, called from `BoardPanel.tsx:162`). Both go through `prepareAgentLaunch` (`agentLaunch.ts:21`).
    - The Orchestrator, which calls `buildLaunchCommand(spec.provider, rolePath)` directly and runs `claude … -p '<task>'` (`OrchestratorTab.tsx:292`).
    - Two capability probes, `supportsRoleDelivery` and the task probe, also call `buildLaunchCommand` with `/dev/null` (`agentCommand.ts:156,165`). The claude and deepseek providers share `claudeCommand` (`agentCommand.ts:49-53`).
  - Projects can sit below the repo root (`IntegrationsPanel.tsx:29-31`).
  - `project_root` returns the nearest ancestor with a `.git` entry (`src-tauri/src/lib.rs:184-194`). In a git worktree, `.git` is a file, so it returns the worktree root, not the main checkout.

**Unverified, to check before the story that needs it:**
- **U1.** How `GET /computers/{id}` tells plan from hourly (Story 5).
- **U2.** Whether an MCP sign-in or a Custom key without Billing write can create on a free account (guide wording, Story 2).
- **U3.** What a sleeping (`suspended`) computer is billed (Story 3).
- **U4.** How auto-stop is set, and whether it suspends or stops (Story 3).
- **U5.** Real rate limits (Story 2).
- **U6.** Whether WKWebView and WebKitGTK open `wss://www.orgo.ai` once the CSP allows it (Story 2).
- **U7.** Whether `GET /workspaces/{id}` lists every computer (Story 3).
- **U8.** Answered in round 3: `.mcp.json` loads from parent directories, while `.claude/settings.json` does not. The design now covers both. The manual check confirms it.
- **U9.** The hosted server's exact tool names. The verb globs no longer depend on them; the manual check compares the names anyway.
- **U10.** The key check's error codes (Story 2).
- **U11.** GPU prices (Story 5).
- **U12.** Whether CLI listings print `vnc_password` (Story 1c, on hold).
- **U13.** Settled in round 4: the lists merge (see above). The manual check only confirms it.

**Rejected: Orgo's local server, `orgo-mcp-server`.** It needs a vault key, returns `vnc_password` into context (F12), and registers the password, SSH, secrets, move and workspace tools. Its dependencies float, and it loads the spec and base URL at runtime. **Third-party servers** (`nickvasilescu/orgo-mcp`, `spencerkinney/computer-use-mcp`, Composio): not chosen.

## How the pieces coexist

- **Credentials.** Claude Code's MCP sign-in serves agents. Step 2's panel key, `ORGO_API_KEY`, is read in Rust (Q3). A CLI credential belongs to Story 1c, on hold. All of them point at the dedicated ADE workspace (decision 9), and computers made by any of them appear in the panel as "made elsewhere" when ADE did not make them.
- **One rule source.** `src-tauri/src/orgo_rules.rs` holds `MCP_ASK`, `CONTINUOUS_DENY_MCP` and `CONTINUOUS_DENY_CLI`, and later `CLI_ASK` and `CLI_ALLOW`. It exposes `orgo_launch_rules()` for the launch path. The shared settings merge lives beside it (Q11).
- **The parallel CLI library (`plan/cli-library-and-mcps`)** reuses these lists for its `orgo` entry and must not redefine them. `.ade/context/orgo-permission-rules.md` is the shared contract.

## ADR 0010 (Accepted 2026-10-29)

Written as `.ade/context/decisions/0010-agent-computers-are-orgo-only-and-made-on-click.md`. The number is provisional and is re-checked at merge time: 0008 (hover), 0009 (manual checks), 0011 (CLI), 0012 (principles) and 0013 (the Orchestrator key) are on other unmerged branches. The summary as drafted:
- **Decision:**
  - Orgo is the only provider. Agents reach it through its hosted MCP server, and later its CLI.
  - The lifecycle rules are verb globs from one Rust module. They are passed on every ADE launch, and merged into the project's shared settings and the main checkout's root local settings.
  - Creation is denied on the command line in Continuous launches.
  - In the native panel, only a click creates, starts or resizes a computer, with an end and under ADE's cap.
  - ADE never chooses hourly billing, never runs billing commands, never edits user-level Claude Code settings, and ships no credential except a dedicated key on a confirmed click.
  - Story 2 limits `vault_get` to an allowlist.
- **Consequences:**
  - The spend limit on the agent paths is the user's Orgo plan or credit, behind a prompt.
  - Rules in files can be removed by a bypass-mode agent the user started, and launch flags cannot.
  - Bash rules are not a boundary around a program.

---

# Story 1: Orgo's MCP server in the library, always asking

## Code Map (1)

- `src/data/mcpCatalog.ts`: `McpEntry` (:18-31), `MCP_CATALOG` (:33). Sentry (:44-49) is the precedent for an http sign-in server.
- `src/components/IntegrationsPanel.tsx`: the card (:178-209), "Sign in" (:183), `install` (:73-90) and its notice (:83). The root is resolved with `project_root` (:44), which gives the git root.
- `src-tauri/src/mcp.rs`: `mcp_install` (:44), `mcp_remove` (:63).
- `src-tauri/src/usage.rs`: `settings_path` (:544), `merge_deny` (:651), `load_settings` (:718) and `save_settings` (:725), the existing settings writer. `local_settings_path` (:713) points at `.claude/settings.local.json`. The writer uses serde_json without `preserve_order`, so every write re-sorts object keys (see S1-3).
- `src/lib/agentCommand.ts`: `LaunchOptions` (:5), `claudeCommand` (:49-53), `buildLaunchCommand` (:68), and the probes (:156,165).
- `src/lib/agentLaunch.ts`: `prepareAgentLaunch` (:21) and `dispatchAgent` (:63-77). `src/components/OrchestratorTab.tsx:292` is the direct caller.
- `src-tauri/src/lib.rs:184-194`: `project_root_of`.
- **New:** `src-tauri/src/orgo_rules.rs`; `src-tauri/src/orgo_operations.json`, the fixture; `src/lib/orgoRules.ts`, which loads the rules once.

## Design Notes (1)

**The catalog entry**, after `fetch` in "Web & browser":

```ts
{
  id: "orgo",
  name: "Orgo",
  category: "Web & browser",
  description: "Cloud computers with a desktop, browser and shell that the agent can start, see, drive and run commands on.",
  server: { type: "http", url: "https://www.orgo.ai/mcp" },
  oauth: true,
  caution: "Signing in lets Claude Code create, drive and delete computers in the Orgo workspace you choose. They cost money until deleted, and what their screens show can try to steer the agent. Agents ADE starts always ask before a computer is created, changed, stopped or deleted, even in Continuous mode. So do Claude Code sessions you start in this project, unless the rules are removed from its settings.",
  docs: "https://docs.orgo.ai/guides/mcp",
}
```

- **What it writes.** Install writes `{"type": "http", "url": "https://www.orgo.ai/mcp"}` under `mcpServers.orgo`.
- **`caution`** is a new optional field, rendered as `<p className="mcp-caution" role="note">`, and not searched.
- **Search.** The description has no "click", so `"browser click"` still finds only Playwright, and `"cloud computer"` finds Orgo.

**`MCP_ASK`, verb globs** (S1-2, widened by S1-5). They are robust to the unverified hosted names (U9), to a server renamed `orgo-prod`, to a tool without the `orgo_` prefix, and to the REST write verbs Orgo already has that the MCP spec doesn't expose yet:

```rust
pub const MCP_ASK: &[&str] = &[
    // computer lifecycle in today's spec
    "mcp__*orgo*__*create*",            // create_computer (also create_workspace/screen/...: writes)
    "mcp__*orgo*__*clone_computer*",   // not *clone*: future iPhone-clone reads (GET /computers/{id}/clone…)
    "mcp__*orgo*__*fork*",
    "mcp__*orgo*__*resize*computer*",   // not *resize*: that catches GET get_resize_limits
    "mcp__*orgo*__*update*",            // update_computer sets or moves the end
    "mcp__*orgo*__*start*",             // start_computer, restart_computer
    "mcp__*orgo*__*resume*",
    "mcp__*orgo*__*stop*",
    "mcp__*orgo*__*delete*",
    "mcp__*orgo*__*enable*ssh*",        // not *ssh*: that catches GET get_computer_ssh
    // REST write verbs not yet in the MCP spec (S1-5)
    "mcp__*orgo*__*wake*",              // /computers/{id}/wake
    "mcp__*orgo*__*restore*",           // /backup/restore, /snapshots/{id}/restore
    "mcp__*orgo*__*launch*",
    "mcp__*orgo*__*boot*",
    "mcp__*orgo*__*extend*",
    "mcp__*orgo*__*set*end*",
    "mcp__*orgo*__*billing*",           // /computers/{id}/billing; also asks GET get_client_billing
    "mcp__*orgo*__*public*url*",        // /public-urls
    "mcp__*orgo*__*proxy*",             // /residential-proxy
    "mcp__*orgo*__*secret*",            // /secrets, /secrets/sync
    "mcp__*orgo*__*ssh*key*",
    "mcp__*orgo*__*freeze*",            // /freeze, a stop under another name
    "mcp__*orgo*__*heal_*",             // /heal, which can restart; not *heal*: that catches get_computer_health
];
```

- **Checked against all 86 operations of the live spec** (2026-10-29), snake-cased as `mcp__orgo__orgo_<op>`.
  - **Exactly one GET matches: `orgo_get_client_billing`** (via `*billing*`). It is a billing read, outside the sign-in list, and asking for it is intended.
  - Every computer lifecycle write matches: create, clone, fork, resize, update, start, restart, resume, stop, delete and enable-SSH.
- **The REST write-verb corpus.** These are the names Orgo's naming rule would give the write paths in the [key permissions table](https://docs.orgo.ai/api-reference/api-keys/permissions): `wake_computer`, `restore_computer_backup`, `restore_snapshot`, `set_computer_billing`, `create/update/delete_public_url`, `set_residential_proxy`, `freeze_computer`, `heal_computer`, `set_computer_ssh_key`, `sync_computer_secrets`, `set_computer_end`, `extend_computer`, `launch_template`, `boot_computer`. All are matched.
- **Over-matching, recorded:**
  - The other writes they match ask too, which is the safe direction: `create_workspace/screen/client/chat_completion`, `update_workspace/client(_billing)`, `start_file_upload`, `stop_template_run`, `stop_client_billing`, `delete_file/template/workspace`.
  - **Ask-side misfires on reads, recorded and harmless (an extra prompt):**
    - `*start*` would match a future `get_computer_startup_log`;
    - `*proxy*` would match a `get_residential_proxy`;
    - `*public*url*` would match a `list_public_urls`;
    - `*secret*` would match a `list_secrets`;
    - `*billing*` matches today's `get_client_billing`;
    - `*stop*` would match a `get_auto_stop`;
    - `*delete*` would match a `get_delete_preview`.
  - **Narrowed in round 5 so reads aren't caught:** `*heal*` became `*heal_*`, so `get_computer_health` isn't matched. `*clone*` became `*clone_computer*`, so future iPhone-clone reads such as `get_computer_clone_status` aren't matched, while `clone_computer` still is, with or without the `orgo_` prefix.
  - A server named like `georgo` matches `*orgo*`.
  - Matching is case-sensitive, so `Orgo` does not match.
- **The fixture.** `src-tauri/src/orgo_operations.json` holds (method, path, operationId) from the spec, plus the REST write-verb corpus as hypothetical names marked as such, so the test runs offline.

**Where the rules go.** Install, for `name == "orgo"`:
1. Resolve the two roots.
   - `<root>` is the git root from `project_root`: the worktree root inside a worktree.
   - `<main>` is the main checkout's root, from `main_checkout_root(<root>)`, with guards (round 5). It follows the walk only when every step holds:
     1. `<root>/.git` is a file whose first line is `gitdir: <path>`. A relative `<path>` (git ≥ 2.48, `worktree.useRelativePaths`) is resolved against `<root>`, the folder holding the `.git` file.
     2. `<gitdir>/commondir` exists. Its content, if relative, is resolved against `<gitdir>`, and the result is canonicalised.
     3. That common dir is a directory named `.git`.
     4. Its parent holds that same `.git` as a directory.

     Then `<main>` is that parent. In every other case `<main>` is `<root>`:
     - a normal checkout, where `.git` is a directory;
     - a submodule or `--separate-git-dir`, where there is no `commondir`;
     - a bare repository's worktree, where the common dir is `repo.git` and there is no main checkout;
     - any unreadable file.
2. Read and validate `<root>/.mcp.json`, `<root>/.claude/settings.json` and `<main>/.claude/settings.local.json`. If any is invalid or the wrong shape, refuse and write nothing.
3. Merge `MCP_ASK` into `permissions.ask` of `<main>/.claude/settings.local.json`. Claude Code reads that file from any subdirectory, and from inside any worktree of the repository.
4. Merge them into `<root>/.claude/settings.json`, for teammates and root sessions.
5. Write `<root>/.mcp.json`.

`mcp_install` returns the rules added to either file.

**Every ADE launch (S1-1, S1-4).**
- **The rules.** `orgo_launch_rules()` (Rust, no arguments) returns `{ ask: MCP_ASK, continuousDeny: … }`. `src/lib/orgoRules.ts` exports `loadLaunchRules(): Promise<LaunchRules>`, which invokes it and caches the result **only on success** (round 5). A rejected load clears the cache, so the next launch tries again rather than being blocked for the rest of the app's life.
  - If the invoke fails, it rejects, and every caller refuses to launch with "ADE couldn't load its permission rules, so the agent was not started". It fails closed.
- **The type makes it required.** `LaunchOptions` gains `rules: LaunchRules` as a **required** field, and `buildLaunchCommand(provider, rolePath, opts: LaunchOptions)` makes `opts` required. tsc then fails on every caller that doesn't pass rules.
  - `prepareAgentLaunch` covers the picker and `dispatchAgent`. `OrchestratorTab.tsx:292` is updated to `await loadLaunchRules()` and pass them.
  - The two capability probes use a module-private `PROBE_RULES`, which is not exported, so no other caller can borrow it.
  - Codex and Ollama ignore `rules`; the claude and deepseek paths emit them. Because `prepareAgentLaunch` loads the rules before building any command, **Codex and Ollama launches also wait on the load, and fail closed with it**. That is harmless, since the rules are constant and load in one local IPC call.
- **The flag.** `claudeCommand` adds `--settings '{"permissions":{"ask":[…]}}'`, quoted with `shellQuote` (`agentCommand.ts:26`), to every claude and deepseek launch: Manual, Continuous and `-p`.
- **Silent and folder-independent.** Glob names are exempt from the "matches no tool" warning, so this is silent in projects without Orgo, and it does not depend on the cwd, the project, or how Orgo was installed. The flag's lists merge with the files' lists (U13, settled).
- **The Orchestrator.** It runs `claude … -p` without bypass, so an ask cannot be shown there and the call is refused. That was already true, because `-p` cannot prompt for an unapproved MCP tool. The live impact is low, but the rules now ride along.

**The merge and key order (S1-3; owner decision 11, "Accept, fix later").** Story 1 keeps the existing writer, and AC6 asserts semantic equality. serde_json's `preserve_order` is not enabled here. Key-order preservation is its own small story (Deferred Work).
- The writer re-sorts object keys and re-pretty-prints on its first write to a file. That is already true of ADE's settings writers today, recorded in `_bmad-output/initiative-phone-remote/deferred-work.md` (`save_settings` re-sorts `.claude/settings.local.json`).
- `preserve_order` is crate-wide. It would change every JSON map in the app. It would break at least `mcp.rs`'s test that expects `["github", "mine"]` (`mcp.rs:100`), and it would change the output of every other JSON writer. That belongs to its own story with its own review.
- What Story 1 guarantees: every key and value of the user's file survives (semantic equality), rule arrays keep their order with ADE's rules appended once, and a second install changes nothing byte for byte.
- The notice and the guide say the first install may reorder a committed `.claude/settings.json` (keys sorted, re-indented, every value kept). The deferred entry is extended with the Orgo case.

**Remove** takes Orgo out of `.mcp.json` and leaves every rule. ADE never deletes a rule.

**Notice:** "Orgo added to .mcp.json. Agents ADE starts will always ask before Orgo creates, changes, stops or deletes a computer, and rules were added to .claude/settings.json and .claude/settings.local.json for sessions you start yourself. The first install may reorder .claude/settings.json; every setting is kept. Run /mcp in Claude Code to sign in."

**Guide** (`docs/guide/integrations.md`): add Orgo to the "Web & browser" row and a `## Orgo cloud computers` section:
- what it does;
- signing in to the dedicated ADE workspace with `/mcp`;
- what the sign-in allows, and how to revoke it;
- always asks: the globs, the three places, and what they don't cover:
  - user-started bypass sessions;
  - other repositories;
  - Codex;
  - server names without lowercase "orgo";
  - `allowManagedPermissionRulesOnly` policies;
  - future tool names with none of the verbs.

  In a git worktree, the local rules live in the main checkout's `.claude/settings.local.json`;
- cost: billed until deleted, stopped hourly computers still pay for disk, the plan or credit is the limit, set an end, delete when done, auto top-up off;
- prompt injection;
- that the first install may reorder a committed `.claude/settings.json`, keeping every value.

**README:** "16 curated MCP servers".

**Contract:** `.ade/context/orgo-permission-rules.md` records the lists, the three places, `orgo_launch_rules()`, that ADE never deletes a rule, and that the CLI library reuses the lists.

**Failure modes:**
- **Any of the three files invalid:** install is refused with the file named, and nothing is written.
- **A session started in a subfolder:** the rules come from the launch flag (ADE) or the root local file (user-started).
- **Settings outside git, at a home-directory root, or on Windows:** `settings.local.json` stays with the start directory, so a user-started subfolder session has no file rules. ADE launches keep the flag. The guide says so.
- **A bypass-mode agent the user started deletes the file rules:** not prevented, and stated.
- **Installed from a worktree:** the local rules go to the main checkout (`<main>`), which is where Claude Code reads them. The shared file and `.mcp.json` go to the worktree, which is where they are committed from.
- **The rule invoke fails at launch:** no agent starts, and the reason is shown.
- **`allowManagedPermissionRulesOnly` is set:** none of these rules apply. Nothing in ADE can change that, and the guide says so.

## Acceptance Criteria (1)

Each names its test. The developer writes it failing first. AC10 is a regression check.

1. With `vault_list` empty, the Orgo card shows "Sign in" and its caution as a `role="note"`, with no secret row, no "Add to vault" and no `npx` tag. Covered by `src/components/__tests__/IntegrationsPanel.test.tsx` (new) › "the Orgo card is a sign-in server with its caution".
2. Install sends `mcp_install` with `name: "orgo"` and a server of exactly `{type: "http", url: "https://www.orgo.ai/mcp"}`. With rules returned, the notice says ADE's agents always ask, names both settings files, says the first install may reorder `.claude/settings.json`, and says to run `/mcp`. Covered by `IntegrationsPanel.test.tsx` › "installing Orgo writes the hosted server and says where the rules went".
3. Every `oauth: true` entry has no `secrets`, empty `envRefs`, and an `https:` URL. Covered by `src/data/__tests__/mcpCatalog.test.ts` › "sign-in servers carry no secret and use https".
4. `"cloud computer"` finds `["orgo"]`, and `"browser click"` still finds `["playwright"]`. Covered by `mcpCatalog.test.ts` › "searches name, category and description" (extended).
5. Installing `orgo` in a temp git repo with no settings files creates `.claude/settings.json` and `.claude/settings.local.json` at the repo root, each with only `permissions.ask` = `MCP_ASK`. It writes the server and returns the rules. Worktree cases, on temp folders:
   - **Absolute gitdir.** `<wt>/.git` is `gitdir: <main>/.git/worktrees/wt`, which has a `commondir` of `../..`. Install writes `settings.local.json` under `<main>/.claude/`, and `settings.json` and `.mcp.json` under `<wt>`.
   - **Relative gitdir.** `gitdir: ../main/.git/worktrees/wt` gives the same `<main>`.
   - **Submodule or `--separate-git-dir`.** `gitdir: ../.git/modules/sub`, or a gitdir elsewhere, with no `commondir`. `<main>` stays `<root>`, the submodule.
   - **Bare repository's worktree.** The common dir is `repo.git`, not `.git`, with no checkout. `<main>` falls back to `<root>`.

   Covered by `src-tauri/src/mcp.rs` › `orgo_install_writes_rules_to_shared_and_root_local_settings` and `orgo_install_from_a_worktree_writes_local_rules_to_the_main_checkout`, and by the shared module's `main_checkout_root_follows_only_real_worktrees`.
6. **(Reworded for S1-3.)** Existing settings files hold `model`, `hooks` and `env` keys, user allow and deny rules, a user ask rule, and one rule equal to an Orgo glob. After install:
   - each file parsed as JSON equals the original with only `permissions.ask` changed;
   - that array is the original elements in order, followed by the missing Orgo rules in `MCP_ASK` order, each once;
   - a second install leaves both files byte-identical to after the first, and returns nothing.

   Covered by `src-tauri/src/orgo_rules.rs` › `merge_keeps_every_user_value_and_is_idempotent`.
7. If any one of `.mcp.json`, `.claude/settings.json` or `.claude/settings.local.json` is `{ not json`, or has a string `permissions.ask`, install errors and all three files are byte-identical to before. A missing file stays missing. Covered by `mcp.rs` › `orgo_install_refuses_and_touches_nothing_on_bad_files`.
8. Installing `github` writes no settings file. Removing `orgo` keeps every rule in both files. Covered by `mcp.rs` › `only_orgo_adds_rules_and_remove_keeps_them`.
9. **(S1-2, S1-5.)** Against `orgo_operations.json`, using a full-match glob matcher:
   - the only GET operation an `MCP_ASK` glob matches is `getClientBilling`;
   - each of `createComputer`, `cloneComputer`, `forkComputer`, `resizeComputer`, `updateComputer`, `startComputer`, `restartComputer`, `resumeComputer`, `stopComputer`, `deleteComputer` and `enableComputerSsh` is matched;
   - every name in the REST write-verb corpus is matched;
   - the matches hold for `mcp__orgo__orgo_<op>`, `mcp__orgo-prod__orgo_<op>` and `mcp__orgo__<op>` (no prefix);
   - `mcp__github__create_issue`, `mcp__orgo__orgo_get_computer`, `mcp__orgo__orgo_list_workspaces` and `mcp__orgo__orgo_get_screenshot` are not matched;
   - the recorded misfires hold as documented:
     - matched: `mcp__georgo__…_create_computer`, and the hypothetical reads `get_computer_startup_log`, `get_residential_proxy`, `list_public_urls`, `list_secrets`, `get_auto_stop` and `get_delete_preview`;
     - not matched: `mcp__Orgo__…`, and the hypothetical reads `get_computer_health` and `get_computer_clone_status`.

   Covered by `orgo_rules.rs` › `ask_globs_catch_every_lifecycle_write_and_no_read`.
10. The deny callers behave as before. Covered by `usage.rs` › existing `deny_rules_merge_into_settings` and `deny_refuses_other_rules_and_bad_json` (green).
11. **(S1-1, S1-4.)** `buildLaunchCommand(provider, rolePath, { rules })` for claude and deepseek carries exactly one `--settings` argument, whose shell-unquoted value parses to `{"permissions": {"ask": rules.ask}}`. This holds in Manual mode, in Continuous mode, and with a `-p` task. Codex launches are unchanged. `rules` is a required property of the required `opts`, so a call without it is a type error, which `npx tsc --noEmit` enforces. Covered by `src/lib/__tests__/agentCommand.test.ts` › "every Claude Code launch carries Orgo's ask rules", plus a `// @ts-expect-error` case for a call without `rules`.
12. **(S1-1.)** Launching from `AgentPicker` with a pane cwd of `<repo>/app` invokes `orgo_launch_rules` with no path, and types a command containing the same `--settings` as with cwd `<repo>`. Covered by `src/components/__tests__/agentLaunch.test.ts` › "Orgo rules do not depend on the folder an agent starts in".
13. The guide's MCP table lists exactly the catalog's servers, by set equality after removing parenthesised text and splitting on commas. Covered by `scripts/mcpCatalogDocs.test.ts` (new) › "the guide's table lists exactly the catalog".
14. The Orgo guide section contains every `MCP_ASK` glob (read from `orgo_rules.rs`), and mentions "subfolder", "worktree", "Continuous", "/mcp", "until you delete", "auto top-up", "allowManagedPermissionRulesOnly" and "reorder". The README count equals `MCP_CATALOG.length`. Covered by `mcpCatalogDocs.test.ts` › "the Orgo section matches the rules ADE writes", "the README count matches the catalog".
15. **(S1-4.)** An Orchestrator dispatch types a `claude … -p '<task>'` command that contains the `--settings` with `MCP_ASK`, through `loadLaunchRules`. Covered by `src/components/__tests__/OrchestratorTab.test.tsx` (extended) › "orchestrator dispatches carry Orgo's ask rules".
16. **(S1-4.)** The board's `dispatchAgent` types a command that contains the same `--settings`. Covered by `src/lib/__tests__/agentLaunch.test.ts` › "board dispatch carries Orgo's ask rules".
17. **(S1-4.)** When the `orgo_launch_rules` invoke rejects, `prepareAgentLaunch` returns `{ ok: false }` with the "couldn't load its permission rules" message, and the Orchestrator aborts its dispatch with it. No command is typed. **(S1-6.)** If the first invoke rejects and the second resolves, the first launch is refused and the second goes through with the rules. Covered by `agentLaunch.test.ts` › "no rules, no launch" and "a failed load is retried, not cached", and `OrchestratorTab.test.tsx` › "no rules, no dispatch".

## Verification (1)

**Commands:** the repo's verification command, unchanged.

**Manual checks (owner, with a real Orgo account):**
- **Sign-in (U9).** Sign in through `/mcp` to the ADE workspace. No `orgo_get_vnc_password` appears. Every lifecycle tool listed is matched by a glob.
- **Subfolder, ADE launch.** In a repo with Orgo installed, open a pane in `<repo>/app`, launch an agent from the picker, and ask it to create a computer: it prompts. Repeat with Continuous on: it prompts (1b later denies instead).
- **Subfolder, user-started.** In `<repo>/app`, type `claude` yourself and ask for a create: it prompts, from the root `settings.local.json`. `/permissions` shows the rule's source.
- **U13 (confirm).** In an ADE-launched session, `/permissions` lists the rules from both the command line and the project files.
- **Worktree.** Install from a pane inside a git worktree. `<main>/.claude/settings.local.json` gains the rules. A `claude` typed in the worktree prompts on a create.
- **Orchestrator.** Dispatch a task that asks for a computer. The `-p` run reports the Orgo call as refused, not run.
- **Manual mode.** "Yes, and don't ask again" on a create, then another create: it still prompts.
- **Clean-up.** Delete every computer, check the dashboard is empty, and revoke the sign-in.

## Slice (1)

- `src/data/mcpCatalog.ts` and its test.
- `src/components/IntegrationsPanel.tsx` and its new test; `src/index.css`.
- `src/lib/agentCommand.ts`, `src/lib/agentLaunch.ts`, `src/lib/orgoRules.ts` (new), `src/components/OrchestratorTab.tsx`, and their tests.
- `src-tauri/src/orgo_rules.rs` (new), the shared `merge_rules` and `main_checkout_root` (in `src-tauri/src/claude_settings.rs` per Q11, unless the CLI library plan created it first), `src-tauri/src/orgo_operations.json` (new), and `lib.rs` registration.
- `src-tauri/src/mcp.rs`; `src-tauri/src/usage.rs` (calls the shared merge, no behaviour change).
- `scripts/mcpCatalogDocs.test.ts`, `docs/guide/integrations.md`, `README.md`.
- `.ade/context/orgo-permission-rules.md`, and the deferred-work entry.

No new dependency, and no change to `Cargo.toml` features.

---

# Story 1b: the Continuous-mode hard stop

Depends on Story 1 (`orgo_rules.rs`, `orgo_launch_rules`, the `--settings` plumbing).

## Design Notes (1b)

**The deny lists** come from `orgo_launch_rules()`, which still takes no arguments.

- **`CONTINUOUS_DENY_MCP`, always** (1b-1):

  ```rust
  pub const CONTINUOUS_DENY_MCP: &[&str] = &[
      "mcp__*orgo*__*create*", "mcp__*orgo*__*clone_computer*", "mcp__*orgo*__*fork*",
      "mcp__*orgo*__*start*",  "mcp__*orgo*__*resume*", "mcp__*orgo*__*resize*computer*",
      // round 4 (S1-5): REST verbs that start or bring back a computer
      "mcp__*orgo*__*wake*",   "mcp__*orgo*__*restore*", "mcp__*orgo*__*launch*",
      "mcp__*orgo*__*boot*",   "mcp__*orgo*__*heal_*",
  ];
  ```

  - A glob deny "is removed from Claude's context", and it is silent where no tool matches.
  - Always passing it covers Orgo added by `claude mcp add` (`~/.claude.json`), an ancestor `.mcp.json`, and another server name containing "orgo".
  - In Continuous sessions it also hides other "create" writes such as `create_screen` and `create_workspace`, which is acceptable for an unattended session.
  - **Deny-side misfire, recorded:** `*start*` would hide a future `get_computer_startup_log` read in Continuous sessions. It is narrowed like the ask list (`*clone_computer*`, `*heal_*`), so `get_computer_health` and iPhone-clone reads stay visible.
  - Like the ask list, it is checked against the fixture.
    - No GET is matched.
    - Every create, clone, fork, start, restart, resume and resize-computer is matched.
    - The corpus names `wake_computer`, `restore_computer_backup`, `launch_template`, `boot_computer` and `heal_computer` are matched.
- **`CONTINUOUS_DENY_CLI`, always**, with leading wildcards so the usual ways of invoking the program are caught:
  - For `G` in `computers`, `c` and `S` in `create`, `start`, `restart`, `resize`, `clone`: `Bash(*orgo G S*)`.
  - `Bash(*orgo templates run*)`, `Bash(*orgo t run*)`.
  - `Bash(*orgo -*)`: a global flag before the subcommand.
  - `Bash(*orgo computers -*)`, `Bash(*orgo c -*)`, `Bash(*orgo templates -*)`, `Bash(*orgo t -*)`: a flag before the subcommand.

  These are deny rules, so a leading wildcard is allowed and raises no warning; only allow rules warn about it.

  **What a leading `*` catches:** `env orgo …`, `/home/u/.orgo/bin/orgo …`, unversioned `npx orgo …`, and `sh -c 'orgo …'`.

  **What it misses** (round 4, corrected; the guide lists all of these):
  - **Versioned runners:** `npx orgo@2.3.0 c create`, `pnpm dlx orgo@latest …`. The `@version` breaks the contiguous `orgo c create`.
  - **Other invocations:** `node …/dist/cli.js c create`.
  - **Spacing:** doubled spaces, tabs and line continuations between words.
  - **Quoting:** `orgo "c" create`, `orgo c 'create'`.
  - **Indirection:** variables (`$O c create`), shell aliases and functions, scripts written to a file and run, `xargs -n1 orgo …`, and commands built at runtime.
  - **Out of 1b's scope:** the credit-spending `orgo agent`, `orgo run` and `orgo handoff start`. They create no computer; they wait for Story 1c.

  **What it over-matches**, also recorded: any command whose text contains the phrase is denied in Continuous mode, for example:
  - `grep "orgo c create" notes.md`, `git commit -m "… orgo c create …"`, and `echo` or heredocs that mention it;
  - `Bash(*orgo -*)` against `grep "orgo --json"`.

  **Judged tolerable, not narrowed.** Narrowing to a word boundary (`* orgo …`) would lose `sh -c 'orgo …'`, where a quote precedes the name.
  - A false deny costs one refused command in an unattended session, and the agent can rephrase it (`grep -F 'orgo c' | grep create`).
  - A false allow would let an unattended agent create a computer.
  - Agents building these stories will hit it when they grep the plan, so the context file and the guide say so.

**The launch.** With `continuous`, `claudeCommand` writes:

```
claude --dangerously-skip-permissions --settings '<ask json>' --disallowedTools '<rule>' … --append-system-prompt-file <path> [task]
```

`--disallowedTools` takes a list, so it sits before `--append-system-prompt-file`, and the task stays positional. Without `continuous` there is no `--disallowedTools`, and `--settings` remains (Story 1). Codex and Ollama are unchanged, and the guide says these rules do not bind them.

**What still only asks under Continuous mode:** stop, delete, update (the end) and enable SSH, through the launch-flag ask rules from Story 1, which the agent cannot remove.

## Acceptance Criteria (1b)

1. `buildLaunchCommand("claude", path, { rules, continuous: true, task: "go" })`, with `rules.continuousDeny` non-empty, orders the command as `--dangerously-skip-permissions`, `--settings …`, `--disallowedTools` with each rule shell-quoted, `--append-system-prompt-file …`, then the task. Without `continuous`, or with an empty list, there is no `--disallowedTools`. Covered by `src/lib/__tests__/agentCommand.test.ts` › "continuous launches deny Orgo creation before the role flag".
2. **(1b-1.)** `orgo_launch_rules()` returns `CONTINUOUS_DENY_MCP` and `CONTINUOUS_DENY_CLI` unconditionally; it takes no project. Against `orgo_operations.json`, no MCP deny glob matches a GET operation, and each of create, clone, fork, start, restart, resume and resize-computer is matched. `get_computer_health` and `get_computer_clone_status` are not matched, and `get_computer_startup_log` is, as recorded. Covered by `orgo_rules.rs` › `continuous_mcp_denies_are_unconditional_and_spare_reads`.
3. Under the documented semantics, re-implemented in the test:
   - **Denied:** `orgo c create --name a`, `orgo computers start a`, `orgo --json c create`, `orgo c --json resize a --ram 8`, `orgo t run hermes-agent`, `ORGO_PROFILE=x orgo c clone a`, `orgo c create --profile default`, `env orgo c create`, `/home/u/.orgo/bin/orgo c create`, `npx orgo c create`, `sh -c 'orgo c create'`.
   - **Denied, the recorded over-match:** `grep "orgo c create" notes.md` and `grep "orgo --json" x`.
   - **Not denied:** `orgo c delete a`, `orgo c list --json` and `orgo whoami`.
   - **Unmatched, the documented limits:** `orgo c 'create'`, `orgo "c" create`, `orgo  c create` (two spaces), `npx orgo@2.3.0 c create`, `pnpm dlx orgo@latest c create`, `node /x/dist/cli.js c create`, `$O c create`, `xargs -n1 orgo c create`. The test asserts these are not matched, so the guide's list stays true.

   Covered by `orgo_rules.rs` › `continuous_cli_denies_cover_creation`.
4. **(1b-2.)** Launching from `AgentPicker` with Continuous on, from a pane cwd of `<repo>/app` and of `<repo>`, invokes `orgo_launch_rules` with no path argument. Both typed commands carry identical `--disallowedTools` lists. With Continuous off, neither command has `--disallowedTools`. Covered by `src/components/__tests__/agentLaunch.test.ts` › "continuous denies are the same in every folder".

**Manual checks:**
- In an ADE Continuous session started in `<repo>/app`, with Orgo installed through ADE, `orgo_create_computer` is absent from the tools. Repeat with Orgo added through `claude mcp add` instead.
- `orgo c create` is refused, and so are `env orgo c create` and `sh -c 'orgo c create'`, run through real Claude Code, not only the test matcher.
- `orgo_delete_computer` still prompts.

**Slice (1b):** `src/lib/agentCommand.ts`, `src/lib/agentLaunch.ts`, their tests, `src-tauri/src/orgo_rules.rs`, the context file, and a paragraph in the guide.

---

# Story 1c: the Orgo CLI — ON HOLD

**Status: on hold (review round 3).** The parallel product doc (`plan/product-ide-and-harness`, `_bmad-output/product-ide-and-harness.md`) recommends trimming this story. It would ship only as the CLI library's `orgo` entry, with a typed install, after Story 1 has been used with a real account. The owner has not decided. The design below is round 2's and is **not** reworked. The review's findings are recorded here so nothing is lost, and they supersede the design wherever they conflict.

**Round-3 findings, open:**
- **1c-1, credential bypass.**
  - `orgo@2.3.0`'s `loadCredential` ignores `ORGO_API_KEY` when a profile is named, and Commander accepts global flags after the subcommand. Verified live by the reviewer: `orgo c list --json --profile default` sent the account-wide login token, and `Bash(orgo c list *)` allows it.
  - `env orgo …` is not a stripped wrapper.
  - Fixes:
    - don't offer `orgo login` alongside the vault key;
    - add ask rules `Bash(orgo *--profile*)` and `Bash(orgo *ORGO_PROFILE*)`;
    - add `env`, `exec`, absolute paths, `watch`/`setsid` and flags-after-subcommand to the unmatched list.
  - The Security claim that "`ORGO_API_KEY` overrides any `orgo login` in ADE terminals" is wrong whenever a profile is named.
  - **(Round 4.)** Users already signed in with `orgo login` should run `orgo logout`, which removes the account-wide credential from `~/.orgo/credentials.json`, before relying on the workspace key. Whenever 1c is revived, the guide and the setup flow must say so.
- **1c-2, version and fixture.** Pin `orgo@2.3.0`, and add an offline AC that classifies a recorded `orgo manifest` fixture.
- **1c-3, classification.**
  - `computers exec --file` and `computers bash` from stdin must ask.
  - `ws use`, `templates build`, `templates publish` and `files delete` must be classified.
  - `billing topup` opens a Stripe checkout; it does not buy directly.
- **Test strategy.** Add a one-time manual matrix of the risky corpus through real Claude Code, in Manual and in Continuous mode.

Story 1b's CLI denies stand on their own and do not wait for this story.

**Possible convergence (round 4, FYI from the owner).** The CLI library plan (`plan/cli-library-and-mcps`) now narrows its v1 to gh, stripe, vercel and wrangler. It adds a PreToolUse hook that parses each shell command before Claude Code runs it, handling aliases, flag order and runner forms such as `npx`, `pnpm`, `env` and `sh -c`, with ask rules on top.
- If that hook lands, a revived 1c could express Orgo's CLI rules through it. That would close most of the Bash-pattern limits listed in 1b and above, such as versioned runners, quoting, spacing and flags after the subcommand.
- Story 1b's leading-wildcard denies could later move onto it as well.
- Not redesigned now: 1b stays as written, and 1c stays on hold.

<details><summary>Round-2 design (superseded where the findings above conflict)</summary>

- **UI:** an "Orgo CLI" row under the Orgo card with three actions:
  - Set up CLI: merge `CLI_ASK` and `CLI_ALLOW`, write `.claude/skills/orgo-cli/SKILL.md` if missing, then `runInNewTab("Orgo CLI", root, "npm install -g orgo")`, never the install script;
  - Sign in (`orgo login`);
  - Use a workspace key (`ORGO_API_KEY`).
- **`CLI_ASK`:**
  - per-alias subcommands: computers create, start, restart, resize, clone, stop, delete, vnc-password and ssh; workspaces create and delete; templates run and delete; files upload;
  - whole commands: billing, api-keys, keys, secrets, ssh, run, agent, resume, handoff, egress, clone, login and logout;
  - `Bash(orgo -*)`, and per-group `Bash(orgo A -*)`;
  - `--json` listings until U12.
- **`CLI_ALLOW`:** `orgo`, whoami, manifest, help, sessions, the list commands, `ws current`, and templates show and schema.
- **The skill:** `orgo manifest` first; `--json` after the subcommand; the ADE workspace; never vnc-password, billing, api-keys or secrets unless asked; delete computers when done.
- **ACs:** a risky corpus asked; a read-only corpus allowed; the limits unmatched; merge and refusal; the skill written once; the panel row; the guide section.

</details>

---

# Step 2: the native panel (outline; not ready to shard)

## Shape

```mermaid
flowchart LR
  subgraph Webview
    CP[Command palette / Fleet: New agent computer] --> CT[Computer tab: noVNC canvas]
    CT --> TT[Terminal pane: xterm over /ws/terminal]
    FL[Fleet lanes + cost]
  end
  subgraph Rust [src-tauri]
    OR[orgo.rs: REST client, spend guard] --> LG[(orgo-computers.json ledger)]
    OR --> KC[vault: ORGO_API_KEY, Rust only]
    RU[orgo_rules.rs: ask / deny rules]
  end
  CP -- invoke orgo_create --> OR
  CT -- invoke orgo_session: id + password --> OR
  OR -- HTTPS Bearer --> API[www.orgo.ai/api]
  CT -- wss websockify?token --> DESK[www.orgo.ai/desktops/id]
  TT -- wss terminal?token --> DESK
  FL -- invoke orgo_list --> OR
  CC[Claude Code, MCP sign-in] -- MCP --> MCPS[www.orgo.ai/mcp]
```

- **`src-tauri/src/orgo.rs`** is the only ADE code that calls the REST API. It reads `ORGO_API_KEY` (Q3) after Story 2 limits `vault_get` to an allowlist, and needs an HTTP client crate (`reqwest` with rustls, or `ureq`).
- **The ledger**, `orgo-computers.json` in app data, holds only ADE-made computers. It is not synced and stores no passwords.

```mermaid
erDiagram
  LEDGER_ENTRY {
    string id "Orgo computer UUID"
    string name
    string workspaceId
    string projectRoot "ADE project it was made for"
    string purpose "desktop | agent | sandbox"
    int ram
    float cpu
    string createdAt
    string endsAt "always set by ADE"
    bool deleteOnClose "sandbox"
  }
```

- **The spend guard** lives in `orgo_create`, the only create path. It refuses at the cap, always sends `ends_in_hours`, and never sends `billing_mode` or `gpu`.
- **The live view:** noVNC (`@novnc/novnc` 1.7.0, MPL-2.0) in a `"computer"` tab. `connect-src` gains exactly `wss://www.orgo.ai`, and both `scripts/csp.test.ts` and `scripts/browserTabCsp.test.ts` are updated.

```mermaid
sequenceDiagram
  actor U as User
  participant W as Webview
  participant R as orgo.rs
  participant K as Keychain
  participant O as Orgo API
  U->>W: New agent computer (size, ends in)
  W->>R: orgo_create(size, endsInHours, purpose)
  R->>R: running ADE computers < cap? else refuse
  R->>K: read ORGO_API_KEY (Rust only)
  R->>O: POST /computers {workspace_id, name, ram, ends_in_hours}
  O-->>R: 201 {id, status: running, ends_at, vnc_password}
  R->>R: append ledger entry (no password)
  R-->>W: {id, name, endsAt}
  W->>R: orgo_session(id)
  R->>O: GET /computers/{id}/vnc-password
  O-->>R: {password}
  R-->>W: {id, password} (memory only)
  W->>O: wss /desktops/{id}/ws/websockify?token=password
```

## Stories (outline)

**Story 2: New agent computer, with its live desktop in a tab.** Purpose 1.
- First, a `vault_get` allowlist.
- The sheet offers size (no GPU), ends in (Q1) and the ADE workspace.
- Close codes: `4003` (Start, as a click), `4008` (reconnect), `4001` (refetch once), `4006`, `4007`.
- The key check branches on `code` (U10).
- It depends on F4, F5, F7, F10, U4, U5, U6 and U10, and needs Q1 to Q4.

**Story 3: Lifecycle.**
- Stop, Start and Delete, with a confirm; "Ends in …" and "Extend 1 h"; auto-stop (Q1).
- Reconcile with the workspace, showing "made elsewhere" computers.
- It depends on F5, U3, U4 and U7.

**Story 4: A terminal, and Claude Code remotely.** Purpose 2.
- xterm over `/ws/terminal`.
- Decision 6's key: confirmed, sent per computer by Rust, never remembered, never the user's login.
- Code only by an explicit clone or a confirmed upload.
- Handle `computer_key_held`.

**Story 5: Fleet lanes and cost.** Purpose 3.
- Hourly is time × rate; plan computers are "on plan"; GPU is "price unknown"; a stopped computer shows its disk rate until deleted.
- "New fleet" stays within the cap.
- It depends on F6, U1 and U11.

**Story 6: A throwaway sandbox.** Purpose 4.
- Small, a 1 h end, deleted when its tab closes, with nothing sent to it.

---

## Verification (all stories)

The verification command is the repo's, unchanged: `npx tsc --noEmit` · `npm test` · `cd src-tauri && cargo test` · `cd relay && cargo test` · `cd mobile && npx tsc --noEmit && npx jest`. Step 2's REST client is tested against recorded responses. The rule tests check ADE's rules against Claude Code's documented matching, re-implemented in the test, and against an offline copy of Orgo's operation list. The manual checks run real Claude Code.

## Story order and dependencies

1. **Story 1**: MCP entry, `orgo_rules.rs`, the launch `--settings`, and both settings files. Depends on nothing.
2. **Story 1b**: Continuous hard stop. Depends on 1.
3. **Story 1c**: on hold. If revived, it depends on 1 and comes after real use of 1, as the CLI library's `orgo` entry.
4. **Stories 2 → 6**: the native panel, after Q1 to Q4.

## Deferred Work

- **Key-order preservation in Claude Code settings files, its own small story** (owner decision 11, "fix later").
  - ADE's settings writers re-sort keys and re-indent on first write. This is an existing entry in `_bmad-output/initiative-phone-remote/deferred-work.md`, now also hit by Orgo's install on a committed `.claude/settings.json`.
  - The options are serde_json's crate-wide `preserve_order`, which needs a check of every JSON writer and of `mcp.rs:100`'s order assertion, or a settings-only writer that edits `permissions.*` arrays without reparsing the rest.
  - The story picks one and owns the review.
- A vault option to keep a secret out of terminals.
- Website mention once step 2 ships.
- Windows, macOS and iPhone Orgo computers.
- Refreshing `orgo_operations.json` when Orgo's spec major version changes.

## Open Questions (owner)

Decided: Q3 for Story 1 (decision 7), Q5 (6), Q7 (4), Q8 (8, widened in round 3), Q9 (9), the CLI (10, now on hold), Q12 (11). Q6 is moot. Stories 1 and 1b need no answer to be built.

- **Q1. Spend limits and the auto-stop default (step 2).** Recommend: a cap of 3 (configurable 1 to 10), a 2 h end by default, auto-stop at 30 min, Small or Medium, no GPU, no hourly.
- **Q2. Does ADE ever create a computer without a click?** Recommend: never.
- **Q3. The panel's key (step 2).** Recommend: vault `ORGO_API_KEY`, Custom, on the ADE workspace, read only in Rust, with `vault_get` allowlisted first.
- **Q4. The live view.** Recommend: noVNC 1.7.0, `connect-src` plus exactly `wss://www.orgo.ai`, and both CSP tests. Confirm MPL-2.0 is acceptable.
- **Q10. The CLI rule set beyond decision 10's list.** On hold with Story 1c.
- **Q11. Where the shared settings merge lives.**
  - Recommend a neutral `src-tauri/src/claude_settings.rs` for the merge (`merge_rules`, `load_settings`, `save_settings`) and for `main_checkout_root`. Whichever plan builds first creates it.
  - The CLI library plan currently places this code in `usage.rs` and a `rule_match.rs`. The coordinator is giving its architect the same recommendation, so both plans should converge on `claude_settings.rs`.
  - `orgo_rules.rs` keeps only Orgo's lists.
- **Q12. Closed** by decision 11 ("Accept, fix later").

## Review Triage Log

**Round 1, 2026-10-29: adversarial review of bcb314b, BLOCK for Story 1. Owner answered Q3, Q5 and Q7.**

| Finding | Verdict | Action |
|---|---|---|
| The local server puts root `vnc_password` into context, plus password, SSH, secrets, move and workspace tools | blocking | Hosted sign-in server (decision 4). Local server rejected. F12 confirmed. |
| Continuous mode creates computers unprompted | blocking (owner) | Ask rules. Bypass semantics verified. |
| npx pinning rationale wrong | major | Dropped. |
| m1 "until stopped" | minor | "Billed until deleted". |
| m2 ACs restated spelling | minor | Behavioural ACs. |
| AC10 "Git" in "GitHub" | minor | Set equality. |
| ADR "key never reaches the webview" | major | Reworded, plus a `vault_get` allowlist. |
| One CSP test named | minor | Both named. |
| Gaps (codes, `computer_key_held`, template secrets, GPU) | minor | U10, U11, story notes. |
| Sign-in vs panel key | minor | Coexistence section. |

**Round 2, 2026-10-29: owner decisions Q8 and Q9, and the CLI scope.** Story 1b added (`--disallowedTools` verified, placed before the role flag). Story 1c added (CLI read from its 2.3.0 bundle; Bash syntax verified). U12 added. U9's warning question settled. Coordination with `plan/cli-library-and-mcps`.

**Round 3, 2026-10-29: re-review of b8f00e8, BLOCK on Stories 1, 1b and 1c.**

| Finding | Verdict | Action |
|---|---|---|
| **S1-1:** `.mcp.json` loads from parent directories, but `.claude/settings.json` only from the cwd. An agent in `repo/app` gets Orgo without the rules. | blocking | Rules now also go to the repo-root `.claude/settings.local.json`, which the settings docs say is read from subdirectories, and on every ADE launch as `--settings`. The launch flag also closes "a Continuous agent can delete file rules" for ADE launches. `~/.claude/settings.json` was rejected: ADE does not edit user-level settings, and the flag already covers every ADE launch. `--settings` syntax and the list-merge rule verified, with the merge-vs-override wording kept as U13 plus a fallback. Decision 5 and the caution text rewritten to claim only what holds. AC5, AC11, AC12 and two subfolder manual checks added. |
| **S1-2:** exact names fail open silently; globs are allowed anywhere in a deny or ask tool name | major | Verb globs with a server glob. Checked against all 86 operations: `*resize*` and `*ssh*` caught GET tools (`get_resize_limits`, `get_computer_ssh`), so they became `*resize*computer*` and `*enable*ssh*`. No GET matched. AC9 runs against an offline operations fixture. |
| **S1-3:** AC6 impossible; serde_json without `preserve_order` re-sorts keys | major | AC6 reworded to semantic equality, rule arrays kept in order, a second write byte-identical. The first write's reformat is stated in the notice and guide. `preserve_order` deferred to its own story, because it is crate-wide and breaks `mcp.rs:100`'s order assertion. Q12 asks the owner to accept. |
| **1b-1:** MCP denies only when `<project>/.mcp.json` names `orgo` | blocking | Always passed, as server-glob patterns, silent and unconditional. `orgo_launch_rules()` takes no project. The CLI denies gained leading wildcards for `env`, absolute paths, `npx` and `sh -c`. |
| **1b-2:** pin how the project is resolved | minor | No project is needed any more. AC4 asserts the same denies from `<repo>` and `<repo>/app`, and that no path is passed. |
| **1c-1, 1c-2, 1c-3**, test strategy | blocking/major | **Recorded, not reworked.** Story 1c is on hold pending the owner (product doc). The Security section no longer claims `ORGO_API_KEY` overrides a login. |
| Confirmed by the reviewer: hosted OAuth, the Sentry precedent, ask and deny in bypass, `--disallowedTools` placement, merge safety | n/a | Kept. |

**Round 4, 2026-10-29: re-review of 53b1d59. Story 1 BLOCK on S1-4 only; Story 1b PASS WITH MINORS. U13 settled. Owner answered Q12.**

| Finding | Verdict | Action |
|---|---|---|
| **U13:** `--settings` takes one value, and permission lists are concatenated per source (2.1.42 `Jq6`/`jM5`, 2.1.312 `To()`/`rse`) | settled | Union fallback removed. The manual check only confirms it. |
| **S1-4:** the Orchestrator (`OrchestratorTab.tsx:292`) calls `buildLaunchCommand` directly, so "Only AgentPicker launches agents" was false. AC11 was unmeetable (sync builder, async rules). | major | `rules: LaunchRules` is a required field of now-required `LaunchOptions`, so tsc forces every caller. `loadLaunchRules()` caches the Rust invoke and fails closed. The probes use a module-private `PROBE_RULES`. The Orchestrator and `dispatchAgent` pass the rules. The facts line was corrected to list all three paths. Decision 5 now names them, and notes that `-p` refuses rather than asks (low live impact). AC11 rewritten with a `@ts-expect-error` case. AC15 (Orchestrator), AC16 (board dispatch) and AC17 (fail closed) added. |
| **S1-5:** future tool names fail open | minor | Added 13 verbs: wake, restore, launch, boot, extend, set\*end, billing, public\*url, proxy, secret, ssh\*key, plus freeze and heal from the same permissions table. Checked against the live spec: the only GET matched is `get_client_billing`, asked on purpose. AC9 now also checks a REST write-verb corpus from the key permissions page, and pins the recorded over- and under-matches: `georgo` and `get_computer_startup_log` match; `Orgo` does not, because matching is case-sensitive. 1b's deny list gained wake, restore, launch, boot and heal. |
| **Worktree:** Claude Code reads the main checkout's `settings.local.json` inside a worktree, while `project_root` (`lib.rs:184-194`) returns the worktree root | minor | Install writes the local rules to the main checkout through `main_checkout_root`, which follows the `.git` file's `gitdir` to its `commondir`. AC5 has a worktree case, and there is a manual check. |
| **Managed-only rules:** `allowManagedPermissionRulesOnly` voids both the flag's and the files' rules | minor | Stated in decision 5, Security, failure modes and the guide (AC14 checks the guide). |
| **1b over-match** (grep, commit messages, echo, heredocs, `*orgo -*`) | minor | Documented and judged tolerable: a false deny costs one refused command, a false allow an unattended create. Not narrowed, because word-boundary forms lose `sh -c '…'`. AC3 pins two over-matches. |
| **1b "npx is caught" claim** | minor | Corrected: unversioned `npx orgo` is caught; `npx orgo@2.3.0` and `pnpm dlx orgo@latest` are not. |
| **1b limits list** | minor | Added: `node …/dist/cli.js`, doubled whitespace, tabs and line continuations, `orgo "c" create`, `$O c create`, scripts, `xargs -n1`, and the credit-spending `agent`, `run` and `handoff start` (until 1c). AC3 asserts they stay unmatched. |
| **1b manual checks** | minor | `env orgo c create` and `sh -c '…'` are run through real Claude Code. |
| **1c record** | n/a | `orgo logout` advice for users already signed in. Possible convergence with the CLI plan's PreToolUse hook noted, not designed. |
| **Q12** (owner, "Accept, fix later") | decided | Decision 11. Q12 closed. The notice and guide say the first install may reorder `.claude/settings.json`. Key-order preservation is its own deferred story. |
| **Q11** home of the shared merge | open | Still recommend `src-tauri/src/claude_settings.rs`, which now also holds `main_checkout_root`. Convergence with the CLI plan's `usage.rs`/`rule_match.rs` noted. |

**Round 5, 2026-10-29: re-review of e8e7cc4. Story 1 PASS WITH MINORS; Story 1b PASS WITH MINORS.** Confirmed by the reviewer: the three `buildLaunchCommand` callers are forced, AC11's `@ts-expect-error` is checked by tsc, there is no race, Codex is untouched, and no Continuous deny matches a read in today's spec.

| Finding | Action |
|---|---|
| **S1-6:** a rejected first `loadLaunchRules()` would block every later launch | Caches only on success; a reject clears it. AC17 adds a reject-then-resolve case. |
| **S1-7:** Ollama (and Codex) launches also wait on the rules load | Stated: they fail closed with it, which is harmless (constant rules, one local IPC call). |
| **Worktree guards** | `main_checkout_root` follows the walk only when the `.git` file has a gitdir (relative resolved against the folder), `commondir` exists (resolved against the gitdir, canonicalised), the common dir is a directory named `.git`, and its parent holds it. Otherwise `<main> = <root>`. AC5 adds relative-gitdir, submodule / `--separate-git-dir` and bare-repo-worktree cases. |
| **S1-8:** `*heal*` and `*clone*` would hide future reads; ask-side misfires unrecorded | `*heal_*` and `*clone_computer*` in both the ask and deny lists, checked against the spec and the hypothetical reads. AC9 records the harmless ask-side misfires (`*proxy*`, `*public*url*`, `*secret*`, `*billing*`, `*stop*`, `*delete*`, `*start*`). 1b records `*start*` hiding a future `get_computer_startup_log`. |
