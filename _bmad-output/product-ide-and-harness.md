---
title: 'ADE is an IDE for coding agents and a harness for Claude Code'
type: 'product-decision'
created: '2026-10-29'
status: 'draft'
owner_decision: 'pending'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
review_loop_iteration: 1
---

# ADE is an IDE for coding agents and a harness for Claude Code

The owner said, "Seems this is becoming an IDE with a harness." This doc makes that explicit, sets principles for new scope, checks everything in flight against them, and proposes a build order. It is a decision tool, not a PRD. Nothing here is approved until the owner answers section 9. Revision 1 answers the adversarial review of 5ce104e. Plans are read at: Orgo `53b1d59` (round 3), CLI library `8a4938e`, hover previews `dc7ebb1`, WebGL `31ce6f8`.

## 1. What ADE is

ADE is a desktop IDE for coding agents and a harness for Claude Code. **The IDE** works for any CLI agent: Claude Code, Codex and local models run side by side in terminal tabs and splits. A prompt scratchpad, clickable file paths, previews and a Monaco editor let a person read and fix what agents wrote. **The harness** wraps the agents so their work can be checked and their actions bounded. Project setup installs the methodology (Plan → Approve → Shard → Build → Verify), in which a story is Done only when the agreed verification command passes, and no role certifies its own work. Roles become sub-agents with stated boundaries. The stage board, fleet view and agent status show where the work is and when an agent needs you. Permission rules and the Continuous-mode confirm limit what agents may do, while the MCP library and the secrets vault widen what they can reach, with keys kept out of files. Most of the harness binds only Claude Code. Codex does not read `CLAUDE.md`, ADE's permission rules or its hooks (ADE writes no `AGENTS.md`), and the fleet shows no cost for Codex or Ollama. ADE launches, watches and limits agents. It does not replace them.

## 2. Who it's for, and the jobs P1 tests against

Sources: the README, the website and "Used on real work". The users are:
- engineers and architects doing serious engineering with Claude Code;
- ardata.tech's client work, where "the agent fleet, the methodology and the contract tooling exist because client work needed them";
- CAIDen's per-customer agents (Booked, NarraLearn, Healthway);
- ardata academy's training, which uses "the same setup in every lesson";
- smart-contract engineers on Foundry, Hardhat or Anchor.

The jobs are listed because principle P1 requires a proposal to serve one of them:

1. **Parallel.** Run several agents on one project at once, and see what each one is doing and costs.
2. **Done.** Know when agent work is done because a command says so.
3. **Setup.** Set up every project for agents the same way, with roles that don't collide.
4. **Reach.** Give agents tools and keys without putting secrets in files.
5. **Attention.** Learn when an agent needs you, at the desk or away from it.
6. **Contracts.** Take a smart contract from its first test to a reviewed deploy.

## 3. Core vs. integration

- **IDE core** is the surface people work in.
- **Harness core** is what makes agents checkable and bounded.
- **Integration** is a wrapper over another party's tool that could be replaced without changing what ADE is.

| Feature | Class | Why |
|---|---|---|
| Terminals, tabs, splits, detached windows; scratchpad, dictation; file links, previews, Monaco editor; session restore, sync, themes | IDE core | Where agents run and where people check their work. |
| Methodology, gates, adversarial review, anti-slop check, journal, context and knowledge stores | Harness core | This is what "verified, not vibed" means in practice. |
| Roles (ade-setup), sub-agents, agent profiles | Harness core | Stated boundaries let agents run in parallel. |
| Stage board (phases, claimed vs gated, Approve, Dispatch) | Harness core | Shows what is really done and dispatches the next story. |
| Fleet view, tokens and cost, agent status | Harness core | Many agents in one view. Cost is real for Claude Code only. |
| Secrets vault | Harness core | Values live in the keychain. It exports every secret into every new terminal (§4, exceptions). |
| Claude Code settings ADE writes: read-deny rules (the Tokens panel's opt-in context diet), the archive edit deny (on a BMAD switch), attribution off (a settings key, at setup); the Continuous-mode confirm | Harness core | ADE's levers on what Claude Code does. |
| BMAD v6 / v4 | Integration | A pinned framework that supplies skills. ADE's gate and roles are the core. |
| MCP library (15 entries) | Integration | A curated list. Six entries are vendor-hosted and nine run locally through `npx` or `uvx`, several of them third-party packages. |
| Claude Code, Codex, Ollama | Integration | ADE launches them. |
| Contracts panel, workbench, ABI viewer | Integration (domain pack) | Wraps Foundry, Hardhat, Anchor, Slither and Aderyn. Local Anvil deploys run on a click; real-network deploys are typed for review. |
| Orchestrator tab (⌘⇧O, in the user guide) | Harness, overlapping | Plans over Anthropic, DeepSeek or Ollama and dispatches tasks, which duplicates the stage board's Dispatch. It stores the Anthropic key in plain-text settings (P3, §4 exceptions). |
| Phone remote (in flight) | Harness, ADE-built | Agent status and steering on a phone. ADE's relay on Fly.io is its one hosted service. |
| *Open:* hover previews, WebGL fix | IDE core | Faster checking; the right renderer with many terminals. |
| *Open:* Orgo 1b, launch-flag rules | Harness core | Rules an agent cannot edit. |
| *Open:* Orgo 1 and 1c, CLI library, MCP additions; Orgo step 2 (thick) | Integration | Vendor servers and CLIs; their ask rules are harness. |

## 4. Principles for new scope

**How to apply them.** Every plan answers all six. A principle is N/A only when its trigger is absent: P2 when the plan adds no action in its list, P3 when it handles no secret, P4 when no vendor product is involved. P1, P5 and P6 always apply. "Owner to name" under P5 means the principle is unmet until a project is named.

1. **P1, a job and a change.** Does it serve a job in §2 through the IDE or the harness, with a change the plan names? For the IDE, the change is a step a person no longer takes to see, check or steer agent work. For the harness, it is an agent action that now prompts or is blocked, more agents able to run at once, or a claim that a command now checks. A plan that names no such change fails.
2. **P2, nothing risky without the user's action.**
   - Is every action that moves money, deploys, deletes, creates a billable resource, or reads or changes credentials done only on the user's click, or behind a Claude Code prompt that holds in every mode, Continuous included?
   - Is third-party software installed only on the user's click, with the exact command shown before it runs?
   - Not counted as installs: ADE writing its own project files (setup, settings merges), and installing ADE's own plugin.
3. **P3, no secrets in plain text.** Are secret values kept out of files ADE writes, synced state, logs and ADE's own settings, held only in the OS keychain or the vendor's own credential store? Does the plan state who else can read them? Today that is any process in an ADE terminal, through the vault's environment export.
4. **P4, thin where a vendor does the job.** Where a vendor ships a server, CLI or dashboard, does ADE only find it, wire it in, show its data in ADE's own views, and put rules around it, without building its own copy of the vendor's UI or of a capability the vendor already offers?
5. **P5, real work needs it.** Can the plan name the ardata, CAIDen, academy or ADE project, or the owner's own use, that needs it now?
6. **P6, provable and keepable.**
   - (a) Everything ADE writes or decides (files, rules, launch flags) is pinned by an offline test in the verification command. How a vendor tool actually behaves is a named manual check. Under ADR 0009, on the unmerged `docs/claude-md-paths` branch, a manual check gates Done only when the plan says so.
   - (b) Every table of vendor tool names or subcommands records the vendor version it was read from, and a named story re-checks it at that vendor's next major version.
   - (c) No table has more than 50 hand-kept ask items.

**Override.** The owner may approve a plan that fails a principle. The plan's "Owner's decisions" records which principle, why and the date, and the exceptions list below gains a line. Neither an agent nor silence can waive a principle.

**Known exceptions, shipped or decided:**

| What | Fails | Status |
|---|---|---|
| The vault exports every secret into every new ADE terminal | P3 (readable by any agent there) | By design and stated in the guide. Orgo plan, Deferred: "keep a secret out of terminals". |
| The Orchestrator stores the Anthropic API key in plain-text settings (`settingsStore.ts:508`, read at `anthropic.ts:190`; only sync strips it). The DeepSeek key beside it uses the vault. | P3 | Defect. The coordinator is raising a fix story. |
| Nine MCP entries run `npx`/`uvx` packages with no pinned version, so what runs changes without a user action | P2 (install) | Shipped. See Q10. |
| Shipped MCP entries that can move money, deploy or delete without a prompt | P2 | Shipped. See §6, audit. |
| The phone remote builds its own relay and app, with accounts later, instead of using Claude Code's Remote Control | P4 | Owner decision of 2026-10-14: "an admin can disable" Remote Control. |

## 5. What we won't build

- **Our own coding agent or model.** ADE launches agents; it is not one (P4).
- **A general code editor**, meaning language servers, a debugger or an extension marketplace (P1).
- **A cloud host for agents or code.** ADE runs exactly one hosted service: the phone relay on Fly.io, which routes end-to-end-encrypted messages and holds no content. Rented computers come from Orgo (P4).
- **ADE copies of vendor dashboards, or provider-neutral layers over one vendor** (P4).
- **Accounts to use ADE, a paid tier, or telemetry.** The one planned exception is Sign in with Apple for the phone relay's public service (epic 4, owner decision 2026-10-14). This doc does not reverse it.

## 6. Everything in flight, checked

**One rule for every CLI.** Each library CLI gets the same channel: the user's own vendor login, ask rules for the commands in its table, allow rules only for read-only commands, one install form and a write-once skill.

A plan may not claim a boundary stronger than the credential the CLI actually uses. If it relies on a narrower credential, a corpus test shows that no allowed command reaches a broader one.

How the CLIs measure up:
- **gh, vercel, stripe** claim no narrower credential, because the CLI plan puts no CLI key in the vault. Their account-wide logins are the stated boundary, with prompts in front.
- **Equivalent overrides exist** (from vendor docs, not checked live):
  - gh: `GH_TOKEN`/`GITHUB_TOKEN` override the stored login, and `gh auth switch` changes accounts; switch asks.
  - stripe: `--api-key` and `--project-name` pick other credentials. A flag before the subcommand asks; `--project-name` after an allowed read-only command does not.
  - vercel: `--token` and `--scope`. Every vercel command asks anyway.

  None of these escapes a narrower credential, because ADE stores none for these CLIs.
- **orgo is different.** Its plan relied on a workspace-scoped `ORGO_API_KEY` as the boundary. In `orgo@2.3.0`, `--profile` after the subcommand reaches the account-wide `orgo login` under an allowed rule (verified live in the Orgo re-review). 1c fails the rule as designed and passes once `--profile` and `ORGO_PROFILE` ask, which the Orgo plan's round-3 note proposes.

| Item | Verdict | Reason (principles) | Reverses |
|---|---|---|---|
| WebGL for visible terminals (approved, in build) | **Fits** | P1 Parallel: the visible terminal keeps WebGL past the 8th. P5: the owner's report. Whether the DOM fallback *is* the distortion is unconfirmed; that is its first manual check. | — |
| Hover previews (Stories 1–2 Done, 3 in build, 4–5 next) | **Fits** | P1 Done: look before opening. P5: the owner asked for it. P6: bounded reads, inert previews, no new dependency. P3 note: hovering a path such as `.env` shows its first lines without a click, which matters when screen-sharing (Q9). | — |
| Orgo Story 1: hosted MCP, ask rules in files and in `--settings` on every ADE launch (in revision) | **Fits; P5 owner to name** | P1 Parallel/Done: agents test UI on a clean desktop and fan out. P2 ask rules. P3 no key in ADE. P4 vendor-hosted. Its launch-flag rules serve every later rule set. | — |
| Orgo 1b: Continuous denies on the launch line | **Fits** | P2: the guard a Continuous agent cannot delete. Build it for Orgo now; other tables reuse the launch flag later (Q6). | — |
| Orgo 1c: Orgo CLI (on hold) | **Fits, once `--profile` asks; P5 owner to name** | The CLI rule above. Ship it as the CLI library's `orgo` entry, with the library's install form. | Decision 10's install form, only if the owner picks typed installs (Q4). |
| Orgo step 2: native panel, Stories 2–6 | **Defer** | P4: ADE's own copy of Orgo's desktop and lifecycle. P5: no project named. Even a read-only list of computers in the fleet view needs a REST client, the vault key read in Rust behind a `vault_get` allowlist, and a new HTTP crate (`src-tauri` has none today). Any return is a new plan. | Decision 2, "then a native panel". |
| CLI library Stories 1–3 (tab, rules, skills) | **Fits** with gh and fly | gh: P5 is ADE's own repo, whose work lands as GitHub PRs (#67 at baseline). fly: P5 is ADE's relay ("Deploy the relay to Fly.io", phone-watch story 11). P2: `gh secret set`, `gh release delete` and `fly deploy` run unprompted in Continuous mode today. P6: gh 44 ask items, fly 35. | CLI decision 2, "all four groups", until each group is named. |
| vercel, stripe (Story 1 data) | **Fits if named** | P2 and P6 pass (vercel asks for everything; stripe has about 27 items). P5: owner to name. | (as above) |
| supabase, netlify, wrangler, psql, sqlite3, duckdb (Story 4) | **Fits if named** | Rule tables meet P6(c). P5: owner to name. | (as above) |
| aws, gcloud, az, doctl, terraform (Story 5) | **Defer** | P5: none named. aws also fails P6(c), with 63 ask items. | (as above) |
| e2b, modal, docker (Story 6) | **Fits if named** | docker's rm, prune and push ask (P2). P5: owner to name. | (as above) |
| MCP additions: Vercel, Cloudflare, Figma, AWS Knowledge, Chrome DevTools | **Fits if named** | P2 holds: Vercel and Figma add ask rules, Cloudflare asks on every call, and AWS Knowledge and Chrome DevTools are read-only or local and isolated. Chrome DevTools floats `@latest`, like nine shipped entries (Q10). P5: owner to name each. | — |
| MCP addition: Atlassian | **Fails P2 as designed** | Its tools can't take ask rules, so writes run unprompted in Continuous mode. Atlassian admin groups are the only control. Needs a named project and an owner override. | — |
| Shipped-MCP audit (not in either plan) | **Do first** | P2. Fail: Stripe (money), Supabase (deletes, billable branches), GitHub (merges, file writes, workflow runs, bounded by the PAT's scope), DBHub (any SQL its user may run), Airtable (record deletes), Playwright (submits any form). To check: Notion, Linear, Sentry. Filesystem writes fall outside Claude Code's `Edit` rules, so the archive deny doesn't cover them. Pass: Git, Memory, Fetch, Context7, Sequential thinking. Supersedes CLI plan Q6. | — |
| Phone remote (approved; 5a onward) | **Fits, with the P4 override** | P1 Attention. P2: control is off per tab and needs Face ID. P3: end-to-end, and the relay reads no content. P4 fails, overridden on 2026-10-14. P5: the owner's own use. P6: covered by the five-line command. | — |
| Orchestrator tab | **Freeze** | P3 defect (key fix first). P1 overlaps the stage board's Dispatch. | — |

## 7. Build queue

One order across everything in flight or proposed. Sizes are rough estimates (S: one small story; M: one story; L: several stories).

1. **WebGL fix.** In build. S.
2. **Hover Story 3** (images). In build. S.
3. **Orchestrator key into the vault.** P3 defect. S.
4. **Docs story:** tagline and README paragraph, after Q1. S.
5. **Orgo Story 1.** In revision. M.
6. **Orgo 1b.** S.
7. **Shipped-MCP audit**, ask rules through Story 1's merge and launch flag. M.
8. **Hover Stories 4 (PDF) and 5 (HTML).** M each.
9. **CLI library Stories 1–3** with gh and fly. L.
10. **Named additions:** CLIs, MCP servers and Orgo 1c, as the owner names them. S each.

**Separate track: phone remote 5a onward.** L: twelve watch stories, then the steer and public-service epics. It runs in parallel, because its slices sit mostly in `relay/` and `mobile/`.

**ADR numbers:**
- 0008 is the hover ADR (`plan/file-hover-preview`);
- 0009, "manual checks don't gate Done", is on `docs/claude-md-paths` and unmerged;
- the Orgo plan proposes 0010 and the CLI plan 0011;
- the principles ADR would be 0012.

## 8. Positioning

**Tagline:** *The IDE for coding agents, and the harness for Claude Code.* It replaces "The terminal for building products with AI" (README) and the website's hero kicker, "The IDE built for Claude Code developers and architects". The website's h1, "Verified, not vibed.", stays.

**README opening paragraph:**

> ADE is a desktop IDE for coding agents and a harness for Claude Code, on macOS and Linux. In the IDE, Claude Code, Codex or a local model run side by side in terminal tabs and splits, with a scratchpad for prompts, and previews and an editor for checking what they wrote. The harness wraps Claude Code so you can check its work. Every project gets a methodology where a story is Done only when an agreed verification command passes, and no role certifies its own work. A fleet view shows every agent and sub-agent, with the real cost of Claude Code sessions. An MCP library and a secrets vault give agents tools and keep keys in your OS keychain rather than in files. ADE goes furthest on serious engineering work, including smart contracts from first test to reviewed deploy.

## 9. Open questions for the owner

1. **Approve the tagline and the README paragraph?** Recommend yes, as one docs story covering the README and the website kicker.
2. **Adopt the principles, the override clause and the exceptions list?** Recommend yes, as ADR 0012 written by the architect. Every plan would then carry a P1–P6 check for the adversarial reviewer.
3. **Run the CLI library's v1 (Stories 1–3) with gh and fly, and add other CLIs as projects are named?** Recommend yes. This narrows "all four groups" for now.
4. **One install form for every CLI?** Recommend typed installs (the CLI plan's form). Both typed and run-after-confirm meet P2, so this is about consistency. Orgo 1c follows the choice once `--profile` asks.
5. **Defer Orgo step 2?** Recommend yes. This sets aside decision 2's native panel until a new plan names a project.
6. **Reuse the launch flag for other rules?** Recommend yes, after Orgo 1b. The audit's ask rules and the CLI plan's "money moves" denies would go on every ADE Claude Code launch.
7. **Which projects need Orgo, vercel, stripe, the Story 4 and 6 CLIs, and each MCP addition?** Recommend building only what you name. Atlassian also needs a P2 override.
8. **Orchestrator.** Recommend fixing the key now, freezing scope, and later deciding whether to retire it or fold it into the stage board's Dispatch.
9. **Hover on secret files.** Recommend a small follow-up: for `.env*`, `*.pem` and `*.key`, the card shows file details only, not content.
10. **Pin MCP package versions?** Recommend one catalog-wide story that pins all nine `npx`/`uvx` entries, plus Chrome DevTools if it is added. Otherwise, record floating versions as a permanent P2 exception.
