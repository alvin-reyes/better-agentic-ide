---
title: MCP & secrets
lead: Add MCP servers to Claude Code in one click, and keep the API keys they need in your system keychain instead of in files.
description: ADE's MCP library installs curated MCP servers into a project's .mcp.json, and its secrets vault keeps API keys in the OS keychain and hands them to terminals as environment variables.
---

Press {% include key.html mac="⌘⇧I" other="Ctrl+Alt+Shift+I" %}, or choose *MCP: Library of servers for Claude Code* or *Secrets: Vault* in the command palette.

## MCP library

The library lists MCP servers that are worth having while you build, grouped by what they're for:

| Group | Servers |
|---|---|
| Code | GitHub, Sentry, Git |
| Data & storage | Filesystem, Memory, Databases (Postgres, MySQL, SQL Server, MariaDB, SQLite through DBHub), Supabase, Airtable |
| Web & browser | Playwright, Fetch, Orgo |
| Docs & knowledge | Context7, Sequential thinking |
| Work tools | Notion, Linear, Stripe |

**Install** adds the server to the project's `.mcp.json` (the git root of the active terminal's folder). Everything else in the file is kept, and you can commit it so your team gets the same servers. **Remove** takes it out again. Servers you added by hand show up under *Also in .mcp.json*.

Start Claude Code in a new terminal in that project to load what you installed. The first time, Claude Code asks you to approve the project's servers.

- **Sign in** servers (Sentry, Supabase, Orgo, Notion, Linear, Stripe) are hosted by the vendor. Run `/mcp` in Claude Code and sign in through the browser. No key needed.
- **npx** and **uvx** servers run on your machine and need Node.js or [uv](https://docs.astral.sh/uv/). A warning shows when the command isn't on your PATH.
- Servers that need a key show it, like `GITHUB_PERSONAL_ACCESS_TOKEN`, and whether it's in your vault yet. *Add to vault* takes you straight to it.

## Orgo cloud computers

[Orgo](https://docs.orgo.ai/guides/mcp) rents cloud computers made for agents: each has a desktop, a browser and a shell that the agent can start, see, drive and run commands on. Use one to test the UI an agent just built in a clean desktop, or to run code away from your own files and keys.

**Signing in.** Install Orgo from the library, start Claude Code in the project and run `/mcp` to sign in with your Orgo account. Install it from a project folder: ADE refuses to install Orgo when the project root is your home folder, because the home folder's `.claude/settings.json` is Claude Code's own user settings, which ADE never edits. Open a project folder and install it there. Choose a workspace you keep for ADE, so what agents make stays apart from your other computers. ADE stores no Orgo key: Claude Code holds the sign-in.

**What the sign-in allows.** Claude Code can create, manage and delete computers, screens and files in that one workspace, from Orgo's reviewed tool list. It is never sent a computer's password, and it can't buy capacity or launch hourly computers on a paid plan. To revoke it, use Orgo's *Settings → Security → Connected AI apps*, `/mcp` → *Clear authentication*, or `claude mcp logout orgo`.

### It always asks

Claude Code asks before any Orgo tool that creates, copies, resizes, re-times, starts, resumes, suspends, stops, moves or deletes a computer, runs or builds a template, buys capacity, or turns SSH on or off. That holds in Manual and in Continuous mode: Claude Code never skips an ask rule. The rules match by verb, in any server named like Orgo, so they also cover tools Orgo hasn't published yet:

`mcp__*orgo*__*create*`, `mcp__*orgo*__*clone_computer*`, `mcp__*orgo*__*fork*`, `mcp__*orgo*__*resize*computer*`, `mcp__*orgo*__*update*`, `mcp__*orgo*__*start*`, `mcp__*orgo*__*resume*`, `mcp__*orgo*__*stop*`, `mcp__*orgo*__*delete*`, `mcp__*orgo*__*enable*ssh*`, `mcp__*orgo*__*wake*`, `mcp__*orgo*__*restore*`, `mcp__*orgo*__*launch*`, `mcp__*orgo*__*boot*`, `mcp__*orgo*__*extend*`, `mcp__*orgo*__*set*end*`, `mcp__*orgo*__*billing*`, `mcp__*orgo*__*public*url*`, `mcp__*orgo*__*proxy*`, `mcp__*orgo*__*secret*`, `mcp__*orgo*__*ssh*key*`, `mcp__*orgo*__*freeze*`, `mcp__*orgo*__*heal_*`, `mcp__*orgo*__*suspend*`, `mcp__*orgo*__*destroy*`, `mcp__*orgo*__*terminate*`, `mcp__*orgo*__*move_computer*`, `mcp__*orgo*__*run_template*`, `mcp__*orgo*__*build_template*`, `mcp__*orgo*__*add*capacity*`, `mcp__*orgo*__*disable*ssh*`.

A few reads ask too, such as billing details, which costs one extra prompt. Projects without Orgo see no warning about them.

The rules go to three places:

- **Every agent ADE starts**, from the agent picker, the board and the Orchestrator, carries them on its command line, in any folder of the project. The session can't edit its own command line. The Orchestrator's agents can't show a prompt, so an Orgo call that would ask is refused there instead. Agents ADE starts carry these ask rules on their command line and nothing else, so your hooks run in them as your settings say.
- **`.claude/settings.local.json` at the repository root**, for Claude Code sessions you start yourself, in the root or any subfolder. In a git worktree, they go to the main checkout's `.claude/settings.local.json`, which is the file Claude Code reads there, and the install's notice names that file. In a `--separate-git-dir` repository, worktrees read the file in the folder holding the separate `.git`, not the checkout's.
- **`.claude/settings.json`**, which you can commit, for teammates who start at the root.

*Remove* takes Orgo out of `.mcp.json` and leaves the rules. ADE never deletes a rule. If `.mcp.json` or either settings file can't be read, isn't valid JSON, or has a `permissions.ask` that isn't a list, the install is refused, the file is named, and nothing is written. If a write fails part-way, for example on a full disk, the rules may already be in your settings without the Orgo server, never the other way round. Fix it and install again. The first install may reorder a committed `.claude/settings.json`: its keys are sorted and re-indented, and every setting is kept.

ADE waits up to 10 seconds for a new terminal's prompt before it types an agent's command. A shell with no line editor, such as `sh`, waits the full 10 seconds.

What the rules don't cover:

- **Sessions you start yourself in Continuous or bypass mode.** The agent can edit both settings files and remove the rules. Agents ADE starts keep the command-line rules.
- **Other repositories**, and sessions outside git, at a home-directory root or on Windows, where Claude Code keeps `settings.local.json` in the folder you started in, so a session you start in a subfolder has no file rules.
- **Sessions you start in a subfolder of some worktrees:** a worktree of a bare repository or of a separate gitdir not named `.git`, and a worktree of a submodule. There, the rules reach sessions started at the worktree's root only.
- **Codex and other agents that aren't Claude Code.**
- **Orgo under a server name without a lowercase "orgo"** in it. Matching is case-sensitive, so a connector named `Orgo` is missed.
- **Organisations that set `allowManagedPermissionRulesOnly`.** Claude Code then ignores every rule outside managed settings, these included.
- **Future tool names that use none of the verbs above.**
- **What the agent does on the computer**: screenshots, mouse, keyboard and commands there still run without asking in Continuous mode. They stay on that computer.

### Continuous mode can't create computers

An agent you start from the agent picker in Continuous mode can't create or start a computer at all: ADE denies those tools and commands on its command line with `--disallowedTools`, whether or not the project has Orgo, so they also hold when Orgo was added with `claude mcp add`. A deny comes before an ask, so these are refused, not asked. The tools denied are `mcp__*orgo*__*create*`, `mcp__*orgo*__*clone_computer*`, `mcp__*orgo*__*fork*`, `mcp__*orgo*__*start*`, `mcp__*orgo*__*resume*`, `mcp__*orgo*__*resize*computer*`, `mcp__*orgo*__*wake*`, `mcp__*orgo*__*restore*`, `mcp__*orgo*__*launch*`, `mcp__*orgo*__*boot*`, `mcp__*orgo*__*heal_*` and `mcp__*orgo*__*run_template*`; they also hide other Orgo "create" tools, such as creating a screen, and a future startup-log read. Stopping, deleting, changing the end and turning on SSH still ask. The `orgo` commands denied are `computers` (or `c`) `create`, `start`, `restart`, `resize` and `clone`, `templates` (or `t`) `run`, and any of them with a flag before the subcommand, written as `Bash(*orgo c create*)` and so on. The leading `*` also catches `env orgo …`, an absolute path to `orgo`, `npx orgo …` and `sh -c 'orgo …'`.

These command rules are text patterns, not a wall around the program. They miss versioned runners (`npx orgo@2.3.0 c create`, `pnpm dlx orgo@latest …`), `node …/dist/cli.js c create`, doubled spaces, tabs and line continuations between words, quoted words (`orgo "c" create`, `orgo c 'create'`), variables (`$O c create`), aliases, functions, scripts written to a file, `xargs` supplying the subcommand from its input (`echo create | xargs -n1 orgo c`), and commands built at runtime. They also catch too much: in such a session, any command whose text holds the phrase is refused, such as `grep "orgo c create" notes.md` or a commit message quoting it; rephrase it, for example `grep -F 'orgo c' | grep create`. The board and the Orchestrator never start agents in Continuous mode. Codex and Ollama aren't Claude Code, so these rules don't bind them.

### Cost

- A computer is billed until you delete it. Stopping one doesn't end the bill: a stopped hourly computer still pays for its disk.
- Your Orgo plan or credit is the only spend limit. On a paid plan an agent can fill the capacity you already pay for; on a free account it can spend your credit. The prompts come before every create, but they are not a cap.
- Set an end on computers you create, delete them when you're done, and leave auto top-up off.

### What a screen can do

A web page on an Orgo computer comes back to the agent as a screenshot, and its text can try to steer the agent: to act on that computer, to type your local data into it, or to use its local tools. Use computers you can throw away, don't sign in to personal accounts on them, and don't run Continuous mode while an agent browses sites you don't trust.

## Secrets vault

Keep API keys and tokens in the vault instead of in `.env` files, shell profiles or `.mcp.json`.

- **Where they live:** values go into the system keychain (Keychain on macOS, Secret Service on Linux). ADE only keeps the names, and never writes a value to disk or syncs it to other machines.
- **How they're used:** every secret is set as an environment variable in terminals opened after you save it. MCP servers from the library refer to them as `${NAME}`, which Claude Code fills in from that environment, so a value never lands in `.mcp.json`. Agents and scripts in those terminals can read them too.
- **Names** use capitals, digits and underscores, like `OPENAI_API_KEY`. *Replace* stores a new value under the same name. *Delete* removes it from the keychain.

Terminals that were already open keep the environment they started with. Open a new tab to pick up a new or changed secret.

On Linux, the vault needs a Secret Service provider such as GNOME Keyring or KWallet. Without one, ADE says the keychain isn't available and stores nothing.

Wallet private keys don't belong in the vault. ADE never handles them: see [Smart contracts]({{ '/guide/contracts/' | relative_url }}).
