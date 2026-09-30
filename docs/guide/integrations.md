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
| Web & browser | Playwright, Fetch |
| Docs & knowledge | Context7, Sequential thinking |
| Work tools | Notion, Linear, Stripe |

**Install** adds the server to the project's `.mcp.json` (the git root of the active terminal's folder). Everything else in the file is kept, and you can commit it so your team gets the same servers. **Remove** takes it out again. Servers you added by hand show up under *Also in .mcp.json*.

Start Claude Code in a new terminal in that project to load what you installed. The first time, Claude Code asks you to approve the project's servers.

- **Sign in** servers (Sentry, Supabase, Notion, Linear, Stripe) are hosted by the vendor. Run `/mcp` in Claude Code and sign in through the browser. No key needed.
- **npx** and **uvx** servers run on your machine and need Node.js or [uv](https://docs.astral.sh/uv/). A warning shows when the command isn't on your PATH.
- Servers that need a key show it, like `GITHUB_PERSONAL_ACCESS_TOKEN`, and whether it's in your vault yet. *Add to vault* takes you straight to it.

## Secrets vault

Keep API keys and tokens in the vault instead of in `.env` files, shell profiles or `.mcp.json`.

- **Where they live:** values go into the system keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). ADE only keeps the names, and never writes a value to disk or syncs it to other machines.
- **How they're used:** every secret is set as an environment variable in terminals opened after you save it. MCP servers from the library refer to them as `${NAME}`, which Claude Code fills in from that environment, so a value never lands in `.mcp.json`. Agents and scripts in those terminals can read them too.
- **Names** use capitals, digits and underscores, like `OPENAI_API_KEY`. *Replace* stores a new value under the same name. *Delete* removes it from the keychain.

Terminals that were already open keep the environment they started with. Open a new tab to pick up a new or changed secret.

On Linux, the vault needs a Secret Service provider such as GNOME Keyring or KWallet. Without one, ADE says the keychain isn't available and stores nothing.

Wallet private keys don't belong in the vault. ADE never handles them: see [Smart contracts]({{ '/guide/contracts/' | relative_url }}).
