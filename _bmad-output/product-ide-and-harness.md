---
title: 'ADE is an IDE plus a harness for coding agents'
type: 'product-decision'
created: '2026-10-29'
status: 'draft'
owner_decision: 'pending'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
---

# ADE is an IDE plus a harness for coding agents

The owner said, "Seems this is becoming an IDE with a harness." This doc makes that explicit, sets principles for new scope, and checks the open plans against them. It is a decision tool, not a PRD. Nothing here is approved until the owner answers section 8.

## 1. What ADE is

ADE is a desktop IDE plus a harness for coding agents, built around Claude Code, with Codex and local models beside it. **The IDE** is where a person works alongside agents: terminal tabs and splits where each CLI agent runs, a prompt scratchpad, and clickable file paths, previews and a Monaco editor for reading and fixing what agents wrote. **The harness** is what makes their work trustworthy and limits what they can reach. Project setup installs the methodology (Plan → Approve → Shard → Build → Verify), in which a story is Done only when the agreed verification command passes. Roles become sub-agents with stated boundaries, and none of them certifies its own work. The context store, decision log and journal hold what agents must agree on. The fleet view shows each agent's real cost, and agent status says when one needs you. The MCP library, the secrets vault, permission rules and the Continuous-mode confirm control what agents can reach. ADE launches, watches and limits agents; it does not replace them.

## 2. Who it's for

Sources: the README, the website and "Used on real work".

- **Who:**
  - engineers and architects doing serious engineering work with Claude Code (the website calls ADE "the IDE built for Claude Code developers and architects");
  - ardata.tech's client work, where "the agent fleet, the methodology and the contract tooling exist because client work needed them";
  - CAIDen, whose per-customer agents (Booked, NarraLearn, the Healthway front desk) were built in ADE;
  - ardata academy's training, which uses "the same setup in every lesson";
  - smart-contract engineers on Foundry, Hardhat or Anchor.
- **Jobs they hire it for:**
  1. Run several agents on one project at once, and see what each one is doing and costs.
  2. Know when agent work is really done. A command decides, not the agent.
  3. Set up every project for agents once, the same way, with roles that don't collide.
  4. Give agents tools and keys without putting secrets in files.
  5. Find out when an agent needs them, at the desk or away from it.
  6. Take a smart contract from its first test to a reviewed deploy, and teach the workflow.

## 3. Core vs. integration

**IDE core** is the surface people work in. **Harness core** makes agents controllable and verifiable. **Integration** is a thin wrapper over something a vendor already does, and can be replaced without changing what ADE is.

| Feature | Class | Why |
|---|---|---|
| Terminals, tabs, splits, detached windows | IDE core | Every agent runs in one. |
| Scratchpad, voice dictation | IDE core | How a person talks to agents. |
| File links, previews, viewers, Monaco editor | IDE core | Check agents' work without leaving. |
| Session restore, sync, themes | IDE core | Keep long sessions usable. |
| Methodology, gates, adversarial review, journal, context and knowledge stores | Harness core | "Verified, not vibed" is why ADE is more than a terminal. |
| Roles (ade-setup), sub-agents, agent profiles | Harness core | Boundaries let agents run in parallel. |
| Fleet view, tokens and cost, agent status | Harness core | Shows many agents at once, and what each costs. |
| Anti-slop plugin and diff check | Harness core | Checks output before the agent calls it finished. |
| Secrets vault | Harness core | Keys stay in the keychain; files hold `${NAME}`. |
| Permission rules (read-deny, archive deny, no attribution), Continuous confirm | Harness core | ADE's controls on what an agent may do. |
| BMAD v6/v4 | Integration | A pinned framework that supplies skills. ADE's gate and roles are the core. |
| MCP library (15 servers) | Integration | Vendors run them; ADE lists them and installs them. |
| Claude Code, Codex, Ollama | Integration | ADE launches them. |
| Contracts panel, workbench, ABI viewer | Integration (domain pack) | Wraps Foundry, Hardhat, Anchor, Slither and Aderyn. Deploys are typed, never run. |
| Orchestrator tab | Harness, overlapping | Plans and dispatches over the Anthropic API, duplicating Plan → Shard. Absent from the README and website (Q7). |
| Phone remote (in flight) | Harness core | Agent status on a second screen; the Mac stays the host. |
| *Open:* hover previews, WebGL fix | IDE core | Faster checking; text stays legible with many agents open. |
| *Open:* Orgo 1b, the Continuous hard stop | Harness core | The only rule an agent can't edit away. |
| *Open:* Orgo Story 1 and 1c, CLI library, more MCP servers | Integration | Vendor servers and CLIs. Their ask rules are harness. |
| *Open:* Orgo step 2, the native panel | Integration, thick | ADE's own copy of Orgo's desktop, lifecycle and API client. |

## 4. Principles for new scope

A proposal needs a yes to every one that applies.

1. **One half, named.** Does it help a person see, check or steer agent work (IDE), or make agents safer, more parallel or more verifiable (harness)? The proposal must say which, and how.
2. **Nothing without the user's action.** Does anything that spends money, deploys, deletes, creates a resource or touches keys happen only on the user's click, or behind a prompt that holds in every mode, Continuous included? Are installs typed for the user, never run?
3. **No secrets in plain text.** Do keys stay in the OS keychain or the vendor's own login, and out of files, model context, transcripts and logs?
4. **Thin where a vendor does the job.** Where a vendor ships a server, CLI or dashboard, does ADE only find it, wire it in and put rules around it, without its own copy of the vendor's UI or API client?
5. **Real work needs it.** Can we name the ardata, CAIDen, academy or ADE project that needs it now?
6. **Provable and keepable.** Is it covered by the unchanged, offline verification command? Is the vendor surface it tracks small enough to re-check when the vendor changes it?

## 5. What we won't build

- **Our own coding agent or model.** ADE launches agents; it is not one (P4).
- **A general code editor.** No language servers, debugger or extension marketplace (P1).
- **A cloud host for agents or code.** The Mac stays the host, and the phone relay only routes encrypted messages. Rented computers come from Orgo (P4).
- **Provider-neutral layers, or ADE copies of vendor dashboards.** The vendor's own app does that job (P4, P5).
- **Anything that acts on its own:** no installers, no `curl | sh`, no billable resources, and no hourly billing without a click (P2).
- **Credentials beyond the vault.** No CLI login is copied in, and the user's Claude login never goes to a remote machine (P3).
- **Accounts, a paid tier or telemetry.** The README promises "no account, no keys, no telemetry".

## 6. The open plans checked against the principles

| Plan item | Verdict | Reason |
|---|---|---|
| File hover previews | **Fits** | IDE (P1). Reads are bounded and previews inert, with no new dependency (P3, P6). Already approved. |
| WebGL for visible terminals | **Fits** | IDE (P1). It fixes the many-agents case ADE exists for, inside one file (P6). Already approved. |
| Orgo Story 1: hosted MCP + ask rules | **Fits** | Vendor-hosted, with no key in ADE (P3, P4). Its ask rules hold in every mode (P2). It also builds the settings merge the CLI library reuses. |
| Orgo 1b: Continuous hard stop | **Fits** | The one guard a Continuous agent cannot delete (P2). Frame it as a general deny list with Orgo as the first entry (Q6). |
| Orgo 1c: Orgo CLI | **Trim** | Story 1's capability through a weaker channel: an account-wide login and 52 Bash rules that "aren't a security boundary" (P3, P4). Ship it only as the CLI library's `orgo` entry, with the install typed (P2), after Story 1 is used for real. |
| Orgo step 2: native panel (Stories 2–6) | **Defer** | A thick single-vendor build: REST client, ledger, noVNC (MPL-2.0), wider CSP, new HTTP crate (P4, P6). It also waits on Q1–Q4 and on unverified facts. Restart it from fleet lanes and cost (harness), opening the desktop in Orgo's own page. |
| CLI library Stories 1–3: tab, rules, skills for `gh`, `vercel`, `stripe` | **Fits** | Today a Continuous agent can run `gh repo delete` or `stripe pay` without a prompt (P2). Installs are typed, and no login goes into the vault (P3). Three tables are small enough to keep (P6). |
| CLI library Story 4: netlify, supabase, fly, wrangler, psql, sqlite3, duckdb | **Defer** | Each is a hand-kept rule table over a moving vendor surface (P6). Add one when a named project needs it (P5). |
| CLI library Story 5: aws, gcloud, az, doctl, terraform | **Defer** | 80–130 over-matching rules each for aws, gcloud and az, "deny-lists of known risks, not allow-lists" (P6). The most upkeep, and no project named (P5). |
| CLI library Story 6: e2b, modal, docker | **Defer** | e2b and modal overlap Orgo as the sandbox (P4). Read-only docker already runs unprompted. |
| MCP: Vercel, with ask rules | **Fits** | A read path for deploys and logs, which lets the `vercel` CLI always ask (P4). Spend, deploy and key tools ask (P2). |
| MCP: Chrome DevTools | **Fits** | Performance traces Playwright lacks (P1), in an isolated profile with no sign-ins (P3). |
| MCP: Figma, Atlassian | **Fits, if named** | Thin and vendor-hosted. Figma's generate tools ask. Atlassian relies on its admin groups, like Notion and Linear today. P5 is the owner's to confirm. |
| MCP: Cloudflare | **Defer** | Its single `execute` tool means every call asks, reads included, and `wrangler` is deferred (P5). |
| MCP: AWS Knowledge | **Defer** | Its case is pairing with the deferred `aws` CLI. Context7 already looks up docs. |
| *In neither plan:* ask rules on the existing Stripe and Supabase MCP entries (CLI plan Q6) | **Pull forward** | Moving money and deleting projects are one Continuous call away today (P2). Fix what has shipped before adding more. |

The phone remote fits P1–P3 as planned. No change is proposed.

## 7. Positioning consequences

**Tagline:** *The IDE and harness for coding agents.* It replaces "The terminal for building products with AI" in the README and "The IDE built for Claude Code developers and architects" on the website. "Verified, not vibed." stays as the website's second line.

**README opening paragraph,** replacing the one under the hero image:

> ADE is a desktop IDE and a harness for coding agents, on macOS and Linux. The IDE is where you work with them: Claude Code, Codex or a local model side by side in terminal tabs and splits, a scratchpad for prompts, and previews and an editor for checking what they wrote. The harness is what lets you trust their work. Every project gets a methodology where a story is Done only when an agreed verification command passes, and roles that cannot certify their own work. A fleet view shows each agent's real cost, and an MCP library and secrets vault keep keys in your OS keychain, not in files. ADE is built around Claude Code and goes furthest on serious engineering work, including smart contracts from first test to reviewed deploy.

The paragraph claims only what ships today. When ask rules ship, add "and Claude Code asks before an agent spends money, deploys or deletes."

The README's sections would follow the same order: the harness first, then the IDE, then blockchain as a domain section. The website hero would change to match.

## 8. Open questions for the owner

1. **Approve the tagline and the README paragraph?** Recommend yes, in one small docs story that changes the README and the website hero together.
2. **Trim the CLI library's v1 to Stories 1–3 (`gh`, `vercel`, `stripe`), defer 4–6, and ship Orgo 1c as its `orgo` entry with a typed install?** Recommend yes. This settles the CLI plan's Q2 and the Orgo plan's Q11 the same way: one path for every CLI and one settings merge.
3. **Defer Orgo step 2?** Recommend yes. Stories 1 and 1b give agents the computers. When the panel returns, start with fleet lanes and cost, not an embedded desktop.
4. **Add ask rules to the existing Stripe and Supabase MCP entries before adding new servers?** Recommend yes.
5. **Which MCP additions does current work need?** Recommend Vercel and Chrome DevTools now, and Figma and Atlassian only for a named project. Defer Cloudflare and AWS Knowledge.
6. **Make Orgo 1b the general Continuous-mode deny list?** Recommend yes, later. Build 1b for Orgo now. The CLI plan's "money moves" set (`stripe pay`, `vercel domains buy`, `aws * purchase-*`) would be the next entry.
7. **What happens to the Orchestrator tab?** Recommend freezing it now, then deciding in its own plan whether to retire it or fold it into the methodology.
8. **Where do the principles live?** Recommend an ADR written by the architect, and a short "Principles check" (P1–P6) in every plan, so the adversarial reviewer can test plans against them.
