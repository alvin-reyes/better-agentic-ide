---
title: 'ADE is an IDE plus a harness for coding agents'
type: 'product-decision'
created: '2026-10-29'
status: 'draft'
owner_decision: 'pending'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
---

# ADE is an IDE plus a harness for coding agents

This is a decision tool, not a PRD. After a day of new work the owner said, "Seems this is becoming an IDE with a harness." This doc states that directly, sets principles for new scope, and checks the open plans against them. Nothing here is approved until the owner answers section 8.

## 1. What ADE is

ADE is a desktop **IDE plus a harness for coding agents**. It is built around Claude Code, and Codex and local models run beside it.

- **The IDE** is where a person works alongside agents. It has terminal tabs and splits where each CLI agent runs, and the prompt scratchpad. Clickable file paths, previews, viewers and the Monaco editor let you read and fix what agents wrote.
- **The harness** is what wraps the agents, so their work can be trusted and what they can reach is bounded. It covers:
  - project setup, which installs the ADE methodology: Plan → Approve → Shard → Build → Verify, where a story is Done only when the agreed verification command passes;
  - roles as sub-agents with stated boundaries: QA cannot edit what it judges, and the adversarial reviewer is read-only;
  - the context store, the decision log and the journal;
  - the fleet view with each agent's real cost, and agent status;
  - limits on what agents can reach: the MCP library, the secrets vault, permission rules, and a confirm before Continuous mode.

ADE launches, watches and limits agents. It does not replace them.

## 2. Who it's for

From the README, the website and "Used on real work":

- **Engineers and architects building with Claude Code on serious engineering work.** The website calls ADE "the IDE built for Claude Code developers and architects".
- **ardata.tech's client work.** "The agent fleet, the methodology and the contract tooling exist because client work needed them." CAIDen's per-customer agents (Booked, NarraLearn, the Healthway front desk) were built in ADE.
- **ardata academy's AI training**, which uses "the same setup in every lesson".
- **Smart-contract engineers** on Foundry, Hardhat or Anchor.

The jobs they hire ADE for:

1. Run several agents on one project at once, and see what each one is doing and what it costs.
2. Know when agent work is actually done. A command decides, not the agent.
3. Set every project up for agents once, the same way each time, with roles that don't collide.
4. Give agents tools and keys without putting secrets in files.
5. Learn when an agent needs them, at the desk or, with the phone remote, away from it.
6. Take a smart contract from its first test to a deploy they reviewed.
7. Learn or teach one repeatable workflow.

## 3. Core vs. integration

The three classes:

- **IDE core** is the surface where people work.
- **Harness core** is what makes agents controllable and verifiable.
- **Integration** is a thin wrapper over something a vendor already does. It can be replaced without changing what ADE is.

| Feature | Class | Why |
|---|---|---|
| Terminals, tabs, splits, detached windows | IDE core | Every CLI agent runs in one. Everything else hangs off them. |
| Prompt scratchpad, voice dictation | IDE core | The main way a person talks to agents. |
| File links, preview panel, viewers, Monaco editor | IDE core | Where you check what agents wrote without leaving. |
| Session restore, sync through your own git repo, themes | IDE core | Keeps long agent sessions usable. |
| Methodology, verification gates, adversarial review, journal, context and knowledge stores | Harness core | Why ADE is more than a terminal: "verified, not vibed". |
| Roles in ade-setup, sub-agents, agent profiles | Harness core | Each role's boundaries let agents run in parallel without colliding. |
| Fleet view, tokens and cost, agent status | Harness core | You can see many agents at once and what each one costs. |
| Anti-slop plugin and diff check | Harness core | Checks agent output before the agent calls it finished. |
| Secrets vault | Harness core | Keys stay in the OS keychain, and files hold only `${NAME}`. |
| Permission rules (read-deny, archive deny, no attribution), the Continuous-mode confirm | Harness core | ADE's controls on what an agent may do. |
| BMAD v6 / v4 | Integration | A pinned third-party framework. ADE's gate and roles are the core, and BMAD supplies skills. |
| MCP library (15 servers) | Integration | Vendors run the servers. ADE lists them, installs them and points them at the vault. |
| Providers: Claude Code, Codex, Ollama | Integration | ADE launches them. Claude Code gets the deepest support. |
| Contracts panel, workbench, ABI viewer | Integration (domain pack) | Panels over Foundry, Hardhat, Anchor, Slither and Aderyn. The core part is that deploys are typed, never run. |
| Orchestrator tab | Harness, overlapping | It plans and dispatches over the Anthropic API, which duplicates the methodology's Plan → Shard. It is not in the README or on the website. See Q7. |
| Phone remote (in flight) | Harness core | Agent status, on a second screen. The Mac stays the host. |
| *Open:* file hover previews | IDE core | Check a file an agent printed without opening it. |
| *Open:* WebGL for visible terminals | IDE core | Text stays legible with many agents open. |
| *Open:* Orgo Story 1 (hosted MCP), 1c (CLI) | Integration | A vendor's server and CLI. The ask rules around them are harness. |
| *Open:* Orgo 1b (Continuous hard stop) | Harness core | The only rule a Continuous agent cannot edit away. |
| *Open:* Orgo step 2 (native panel) | Integration, thick | ADE's own copy of Orgo's desktop view, lifecycle and REST client. |
| *Open:* CLI tools library | Integration | Detecting, installing and signing in are thin. The ask rules and the shared settings merge are harness. |
| *Open:* six more MCP servers | Integration | Catalog entries. Three come with ask rules. |

## 4. Principles for new scope

Each principle is a yes/no question. A proposal needs a yes on every one that applies.

1. **One half, named.** Does it help a person see, check or steer agent work (IDE), or does it make agents safer, more parallel or more verifiable (harness)? The proposal says which, and how.
2. **Nothing without the user's action.** Is anything that spends money, deploys, deletes, creates a resource or touches keys done only on the user's click, or behind a prompt that holds in every mode, Continuous included? Are installers typed for the user and never run?
3. **No secrets in plain text.** Do keys stay in the OS keychain or the vendor's own login, and out of files, model context, transcripts and logs?
4. **Thin where a vendor does the job.** Where a vendor ships a server, CLI or dashboard, does ADE only find it, wire it in and put rules around it, without building its own copy of the vendor's UI or API client?
5. **Real work needs it.** Can we name the ardata, CAIDen, academy or ADE project that needs it now?
6. **Provable and keepable.** Does the unchanged, offline verification command cover it? Is the vendor surface it tracks (tool names, subcommands) small enough to re-check when the vendor changes it?

## 5. What we won't build

- **Our own coding agent or model.** ADE launches Claude Code, Codex and local models (P4).
- **A general-purpose code editor.** No language servers, debugger or extension marketplace. Monaco is for reading and small fixes, and the IDE half exists to work with agents (P1).
- **A cloud host for agents or code.** The Mac stays the host, and the phone relay only routes end-to-end-encrypted messages. Rented computers come from a vendor, Orgo (P4).
- **Provider-neutral layers over one vendor.** The owner chose Orgo only. A second provider is new work, done when it is needed (P4, P5).
- **ADE copies of vendor dashboards** where the vendor's web app already does the job (P4).
- **Anything that acts on its own.** ADE never runs installers or `curl | sh`, never starts billable resources by itself, and never chooses hourly billing (P2).
- **Holding credentials beyond the vault.** No CLI login is copied into the vault, and the user's Claude login is never copied to a remote machine (P3).
- **Accounts, a paid tier or telemetry.** "Every feature, no account, no keys, no telemetry" (README).

## 6. The open plans checked against the principles

| Plan item | Verdict | Reason |
|---|---|---|
| File hover previews (5 stories, approved, Story 2 in progress) | **Fits** | IDE (P1): look before you open. Every read is bounded and every preview is inert, with no new dependency (P3, P6). |
| WebGL for visible terminals (1 story, approved) | **Fits** | IDE (P1): text distorts in the many-agents case that ADE exists for. The change stays inside one file (P6). |
| Orgo Story 1: hosted MCP with ask rules | **Fits** | Vendor-hosted, with no key in ADE (P3, P4). Ten ask rules hold in every mode (P2). It also builds the shared settings merge that the CLI library needs. |
| Orgo Story 1b: Continuous hard stop | **Fits** | The one guard a Continuous agent cannot delete (P2). Frame it as the general Continuous deny list, with Orgo as its first entry (Q6). |
| Orgo Story 1c: the Orgo CLI | **Trim** | It gives agents what Story 1 already gives them, through a weaker channel: an account-wide login and 52 Bash rules that "aren't a security boundary" (P3, P4). Ship it only as the CLI library's `orgo` entry, with the install typed rather than run (P2), after Story 1 has been used with a real account. |
| Orgo step 2: native panel (Stories 2 to 6) | **Defer** | A thick single-vendor integration: a REST client, a ledger, noVNC under MPL-2.0, a wider CSP and a new HTTP crate (P4, P6). It also waits on Q1 to Q4 and on unverified facts. Revisit after Story 1 is in use, starting from fleet lanes and cost (harness core), with the desktop opened in Orgo's own page. |
| CLI library Stories 1 to 3 (tab, rules, skills) with `gh`, `vercel`, `stripe` | **Fits** | Safer (P2): today a Continuous agent can run `gh repo delete` or `stripe pay` without a prompt. Installs are typed, and no login goes into the vault (P3). Three rule tables are small enough to keep current (P6). |
| CLI library Story 4: netlify, supabase, fly, wrangler, psql, sqlite3, duckdb | **Defer** | Each one is a hand-kept rule table over a vendor surface that keeps changing (P6). Add a CLI when a named project needs it (P5). |
| CLI library Story 5: aws, gcloud, az, doctl, terraform | **Defer** | aws, gcloud and az need 80 to 130 rules each, written as verb globs that over-match. The plan itself calls them "deny-lists of known risks, not allow-lists" (P6). This is the most upkeep, and no project has been named that needs it (P5). |
| CLI library Story 6: e2b, modal, docker | **Defer** | e2b and modal overlap Orgo as the sandbox (P4). Read-only docker commands already run without a prompt. |
| MCP: Vercel, with ask rules | **Fits** | A vendor-hosted read path for deploys and logs. That path is what lets the `vercel` CLI always ask (P4). Tools that spend money, deploy or touch keys ask (P2). The captured tool list must be kept current (P6). |
| MCP: Cloudflare | **Defer** | It has one `execute` tool, so every call asks, reads included. `wrangler` is deferred too. Add it when a Cloudflare project needs it (P5). |
| MCP: Figma | **Fits, if named** | Gives the designer role design context (P1). Its generate tools ask (P2). P5 is for the owner to confirm. |
| MCP: Atlassian | **Fits, if named** | Thin and vendor-hosted. It can't take ask rules, so Atlassian's admin groups are the control, as with Notion and Linear today. P5 is for the owner to confirm. |
| MCP: AWS Knowledge | **Defer** | Its case is pairing with the `aws` CLI, which is deferred. Context7 already looks up docs. |
| MCP: Chrome DevTools | **Fits** | Agents can verify performance (P1) with traces that Playwright lacks, in an isolated browser profile with none of the user's sign-ins (P3). |
| *Not in either plan:* ask rules for the existing Stripe and Supabase MCP entries (CLI plan Q6) | **Pull forward** | Moving money and deleting projects are already one Continuous-mode call away (P2). Fix what has shipped before adding more servers. |

The phone remote was not up for review here. It fits P1 to P3 as planned (harness, off by default, end-to-end), so no change is proposed.

## 7. Positioning consequences

**Proposed tagline:** *The IDE and harness for coding agents.*

It would replace "The terminal for building products with AI" (README) and "The IDE built for Claude Code developers and architects" (website hero). "Verified, not vibed." stays as the website's second line.

**Proposed README opening paragraph** (in place of the paragraph under the hero image):

> ADE is a desktop IDE and a harness for coding agents, on macOS and Linux. The IDE is where you work with them: Claude Code, Codex or a local model side by side in terminal tabs and splits, a scratchpad for prompts, and previews and an editor for checking what they wrote. The harness is what lets you trust their work. Every project is set up with a methodology where a story is Done only when an agreed verification command passes, and with roles that cannot certify their own work. A fleet view shows each agent's real cost, and an MCP library and secrets vault keep keys in your OS keychain, not in files. ADE is built around Claude Code and goes furthest on serious engineering work, including smart contracts from first test to reviewed deploy.

This paragraph claims only what ships today. When ask rules ship (Orgo Story 1, CLI library Story 2), add: "and Claude Code asks before an agent spends money, deploys or deletes."

**Other changes this implies** (not made here): order the README's sections as the harness first (agents, project setup), then the IDE (terminals, previews, editor, scratchpad), with blockchain tooling as a domain section. Change the website hero to match.

## 8. Open questions for the owner

1. **Approve the tagline and the README paragraph?** Recommend yes. One small docs story changes the README and the website hero together, so the two never disagree.
2. **Trim the CLI library's v1 to Stories 1 to 3 (`gh`, `vercel`, `stripe`), defer Stories 4 to 6, and ship Orgo's CLI (1c) as the library's `orgo` entry with the install typed?** Recommend yes. That settles the CLI plan's Q2 and the Orgo plan's Q11 the same way: one path for every CLI, with one shared settings merge.
3. **Defer Orgo step 2, and restart it later from fleet lanes and cost rather than an embedded desktop?** Recommend yes. Stories 1 and 1b give agents the computers. The panel can come back once real use shows what is missing.
4. **Put ask rules on the existing Stripe and Supabase MCP entries before adding new servers?** Recommend yes. This is the same stance applied to what has already shipped.
5. **Which MCP additions does current work need?** Recommend adding Vercel and Chrome DevTools now, and Figma and Atlassian only if you can name a project that uses them. Defer Cloudflare and AWS Knowledge.
6. **Make Orgo 1b the general Continuous-mode deny list?** Recommend yes, as a later story. Build 1b for Orgo now. The CLI plan's "money moves" set (`stripe pay`, `vercel domains buy`, `aws * purchase-*`) would be its next entry.
7. **What happens to the Orchestrator tab?** It overlaps the methodology and appears in neither the README nor the website. Recommend freezing it now (no new scope), then deciding in its own plan whether to retire it or fold it into the methodology flow.
8. **Where do the principles live once approved?** Recommend that the architect record them as an ADR, and that each plan adds a short "Principles check" naming P1 to P6, so the adversarial reviewer can test the plan against them.
