---
title: 'ADE is an IDE for coding agents and a harness for Claude Code'
type: 'product-decision'
created: '2026-10-29'
status: 'approved'
owner_decision: 'approved 2026-10-30'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
review_loop_iteration: 3
context: ['.ade/context/decisions/0012-ade-is-an-ide-plus-a-harness-principles-p1-p6.md']
---

# ADE is an IDE for coding agents and a harness for Claude Code

The owner said, "Seems this is becoming an IDE with a harness." This doc makes that explicit, sets principles for new scope, checks everything in flight against them, and proposes a build order. It is a decision tool, not a PRD. The owner approved it on 2026-10-30 (below); the principles are ADR 0012. Revision 3 answers the three reviews (of 5ce104e, 4b0b755 and 5f0e90d) and records the owner's decisions of 2026-10-29. Plans are read at: Orgo `f32ca1e` (round 5), CLI library `8a4938e`, hover previews `dc7ebb1`, WebGL `31ce6f8`.

## Owner's decisions (2026-10-30)

Approved after the third adversarial review (PASS WITH MINORS on 5f0e90d, minors applied at 454528c).

1. **Principles: adopt as ADR 0012.** P1–P6 (§4), with the override clause and the known-exceptions list, are recorded in `.ade/context/decisions/0012-ade-is-an-ide-plus-a-harness-principles-p1-p6.md`. The exceptions list stays here, in §4. Every plan from now on carries a "Principles check" section answering P1–P6, and the adversarial reviewer tests it. (Q2)
2. **Tagline: approve, build the docs story.** "The IDE for coding agents, and the harness for Claude Code." and the README opening paragraph (§8) ship as one small docs story covering the README and the website's hero kicker. "Verified, not vibed." stays the website's h1. (Q1)
3. **Follow-ups for the queue, each its own small plan** (§7):
   - an audit of the shipped MCP entries, with ask rules for them;
   - pinning the `npx`/`uvx` MCP package versions (Q10);
   - hover cards on secret files (`.env*`, `*.pem`, `*.key`) show file details only, not content (Q9);
   - freezing the Orchestrator's scope (Q8).
4. **Orgo native panel: defer it.** Orgo Stories 2–6 are deferred on P4. This sets aside Orgo decision 2's panel and purposes 2–4 of Orgo decision 1; it returns only as a new plan. (Q5)

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
2. **Check.** Read and check what agents wrote without leaving the terminals they run in.
3. **Done.** Know when agent work is done because a command says so.
4. **Setup.** Set up every project for agents the same way, with roles that don't collide.
5. **Reach.** Give agents tools and keys without putting secrets in files.
6. **Attention.** Learn when an agent needs you, at the desk or away from it.
7. **Contracts.** Take a smart contract from its first test to a reviewed deploy.

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
| *Open:* hover previews, WebGL fix | IDE core | Check job; the right renderer with many terminals. |
| *Open:* Orgo 1b, launch-flag rules | Harness core | Rules an agent cannot edit. |
| *Open:* Orgo 1 and 1c, CLI library, MCP additions; Orgo step 2 (thick) | Integration | Vendor servers and CLIs; their ask rules are harness. |

## 4. Principles for new scope

**How to apply them.** Every plan answers all six. A principle is N/A only when its trigger is absent: P2 when the plan adds no action in its list, P3 when it handles no secret, P4 when no vendor product is involved. P1, P5 and P6 always apply. "Owner to name" under P5 means the principle is unmet until a project is named.

1. **P1, a job and a change.** Does it serve a job in §2 through the IDE or the harness, with a change the plan names? For the IDE, the change is a step a person no longer takes to see, check or steer agent work. For the harness, it is an agent action that now prompts or is blocked, more agents able to run at once, or a claim that a command now checks. A plan that names no such change fails.
2. **P2, nothing risky without the user's action.**
   - Is every action that moves money, deploys, deletes, creates a billable resource, or reads or changes credentials done only on the user's click, or behind a Claude Code prompt that holds in every mode, Continuous included?
   - Is third-party software installed only on the user's click, with the exact command shown before it runs?
   - Not counted as installs: ADE writing its own project files (setup, settings merges), and installing ADE's own plugin.
   - A PreToolUse hook that answers `ask` counts toward "every mode" only after a manual check shows its `ask` prompts under `bypassPermissions`. The Claude Code docs don't say whether it does (CLI plan, C16). Until that check passes, in Continuous mode only ask and deny rules count.
3. **P3, no secrets in plain text.** Are secret values kept out of files ADE writes, synced state, logs and ADE's own settings, held only in the OS keychain or the vendor's own credential store? Does the plan state who else can read them? Today that is any process in an ADE terminal, through the vault's environment export.
4. **P4, thin where a vendor does the job.** Where a vendor ships a server, CLI or dashboard, does ADE only find it, wire it in, show its data in ADE's own views, and put rules around it, without building its own copy of the vendor's UI or of a capability the vendor already offers?
5. **P5, real work needs it.** Can the plan name the ardata, CAIDen, academy or ADE project, or the owner's own use, that needs it now?
6. **P6, provable and keepable.**
   - (a) Everything ADE writes or decides (files, rules, launch flags) is pinned by an offline test in the verification command. How a vendor tool actually behaves is a named manual check. Under ADR 0009, on the unmerged `docs/claude-md-paths` branch, a manual check gates Done only when the plan says so.
   - (b) Every table of vendor tool names or subcommands is built against a recorded fixture of the vendor's own `--help` output, manifest or tool list, with its version and capture date. A test fails when any subcommand or tool in the fixture is not classified as ask, allow, or knowingly unprompted.
   - (c) A named, recurring story re-captures each fixture every quarter, or sooner when the vendor's release notes add a command. The test in (b) then names whatever is new.

**Override.** The owner may approve a plan that fails a principle. The plan's "Owner's decisions" records which principle, why and the date, and the exceptions list below gains a line. Neither an agent nor silence can waive a principle.

**Known exceptions, shipped or decided:**

| What | Fails | Status |
|---|---|---|
| The vault exports every secret into every new ADE terminal | P3 (readable by any agent there) | By design and stated in the guide. Orgo plan, Deferred: "keep a secret out of terminals". |
| The Orchestrator stores the Anthropic API key in plain-text settings (`settingsStore.ts:504`, read at `anthropic.ts:190`; only sync strips it). The DeepSeek key beside it uses the vault. | P3 | Defect. The owner approved the fix on 2026-10-29; it is being planned. |
| Nine MCP entries run `npx`/`uvx` packages with no pinned version, so what runs changes without a user action. Chrome DevTools would be the tenth. | P2 (install) | Shipped. The owner decided on 2026-10-30 to pin them (Q10, §7). |
| Shipped MCP entries that can move money, deploy or delete without a prompt | P2 | Shipped. Audit and ask rules queued (owner, 2026-10-30; §6, §7). |
| The phone remote builds its own relay and app, with accounts later, instead of using Claude Code's Remote Control | P4 | Owner decision of 2026-10-14: "an admin can disable" Remote Control. |

## 5. What we won't build

- **Our own coding agent or model.** ADE launches agents; it is not one (P4).
- **A general code editor**, meaning language servers, a debugger or an extension marketplace. This is the owner's scope for the IDE half, not a principle.
- **A cloud host for agents or code.** ADE runs exactly one hosted service: the phone relay on Fly.io, which routes end-to-end-encrypted messages and holds no content. Rented computers come from Orgo (P4).
- **ADE copies of vendor dashboards, or provider-neutral layers over one vendor** (P4).
- **Accounts to use ADE, a paid tier, or telemetry.** The one planned exception is Sign in with Apple for the phone relay's public service (epic 4, owner decision 2026-10-14). This doc does not reverse it.

## 6. Everything in flight, checked

**One rule for every CLI.** Each library CLI gets the same channel:
- the user's own vendor login;
- every command classified as ask, allow or knowingly unprompted, by two layers:
  - static ask rules from its table;
  - from v1, a PreToolUse hook that parses each shell command's text, handling flag order and runner forms (owner decision, 2026-10-29). Its limits:
    - it sees only the command text, not the user's shell aliases or functions (whether the Bash tool loads them is unverified, CLI plan U1);
    - it can't tell what a script the agent writes will do when run;
- allow only for read-only commands;
- one install form;
- a write-once skill.

The hook goes on the launch line, through the same `--settings` flag Orgo uses, so it holds for every ADE launch. A committed settings file alone would not do, because a Continuous agent can delete it. Three consequences follow:
- **Orgo's contract changes.** Orgo AC11 pins that flag's value to exactly `{"permissions":{"ask":…}}`, so the CLI plan must amend AC11 and Orgo's context file.
- **The binary lives outside the project**, for example beside the `ade-hook` workspace crate (`src-tauri/Cargo.toml:18`), so a Continuous agent can't edit it.
- **The project copy, for sessions ADE didn't launch, goes in `.claude/settings.local.json`.** It names a machine-local binary path, which is why ADE's agent-status hooks already go there.

Two checks come before the hook counts toward P2: that hooks passed through `--settings` load alongside the project's hooks, and the C16 check under P2.

A plan may not claim a boundary stronger than the credential the CLI actually uses. If it relies on a narrower credential, a corpus test shows that no allowed command reaches a broader one.

How the CLIs measure up:
- **gh, stripe, vercel, wrangler** claim no narrower credential, because the CLI plan puts no CLI key in the vault. Their account-wide logins are the stated boundary, with prompts in front.
- **Equivalent overrides exist** (from vendor docs, not checked live):
  - gh: `GH_TOKEN`/`GITHUB_TOKEN` override the stored login, and `gh auth switch` changes accounts; switch asks.
  - stripe: `--api-key` and `--project-name` pick other credentials. A flag before the subcommand asks; `--project-name` after an allowed read-only command does not.
  - vercel: `--token` and `--scope`. Every vercel command asks anyway.
  - wrangler: `CLOUDFLARE_API_TOKEN` overrides `wrangler login`.

  None of these escapes a narrower credential, because ADE stores none for these CLIs.
- **orgo is different.** Its plan relied on a workspace-scoped `ORGO_API_KEY` as the boundary. In `orgo@2.3.0`, `--profile` after the subcommand reaches the account-wide `orgo login` under an allowed rule (verified live in the Orgo re-review). 1c fails the rule as designed and passes once `--profile` and `ORGO_PROFILE` ask, which the Orgo plan's round-3 note proposes.

| Item | Verdict | Reason (principles) | Reverses |
|---|---|---|---|
| WebGL for visible terminals (approved, in build) | **Fits** | P1 Parallel: the visible terminal keeps WebGL past the 8th. P5: the owner's report. Whether the DOM fallback *is* the distortion is unconfirmed; that is its first manual check. | — |
| Hover previews (Stories 1–2 Done, 3 in build, 4–5 next) | **Fits** | P1 Check: look before opening. P5: the owner asked for it. P6: bounded reads, inert previews, no new dependency. P3 note: hovering a path such as `.env` shows its first lines without a click, which matters when screen-sharing. Follow-up decided 2026-10-30 (Q9, §7 item 11). | — |
| Orgo Story 1: hosted MCP, ask rules in files and in `--settings` on every ADE launch (in revision) | **Fits** | P1 Parallel/Done: agents test UI on a clean desktop and fan out. P2 ask rules. P3 no key in ADE. P4 vendor-hosted. P6(b): `src-tauri/src/orgo_operations.json`, the offline operations fixture that AC9 tests every rule against. P5: the owner's own use; the owner asked for Orgo directly, for all four purposes (decision 1). Its launch-flag rules serve every later rule set. The owner accepted (decision 11, 2026-10-29) that the first install may reorder a committed `.claude/settings.json`, with key order fixed in a later story. | — |
| Orgo 1b: Continuous denies on the launch line | **Fits** | P2: the guard a Continuous agent cannot delete. Build it for Orgo now; other tables reuse the launch flag later (Q6). | — |
| Orgo 1c: Orgo CLI (on hold) | **Fits, once `--profile` asks** | The CLI rule above. P5: the owner's own use (decisions 1 and 10). When the owner lifts the hold, it ships as the CLI library's `orgo` entry, with the library's install form. | Decision 10's install form, only if the owner picks typed installs (Q4). |
| Orgo step 2: native panel, Stories 2–6 | **Defer** (owner, 2026-10-30) | P4: ADE's own copy of Orgo's desktop and lifecycle. P5 is met (the owner's own use, decisions 1–2), so the deferral rests on P4 alone. Approving the panel means recording a P4 override. Even a read-only list of computers in the fleet view needs a REST client, the vault key read in Rust behind a `vault_get` allowlist, and a new HTTP crate (`src-tauri` has none today). Any return is a new plan. | Decision 2, "then a native panel". Also decision 1's purposes 2–4 as stated there: Claude Code running remotely from an ADE tab, a fleet shown in the fleet view with cost, and a throwaway sandbox. Purpose 1, computer use, stays through Story 1. |
| CLI library v1: tab, rules, skills and the classifying hook, for gh, stripe, vercel and wrangler (owner decision, 2026-10-29) | **Fits** | P5: gh is ADE's own repo, whose work lands as GitHub PRs (#67 at baseline); stripe, vercel and wrangler are the owner's choice (owner's own use). P2: `gh secret set`, `gh release delete`, `vercel --prod` and `wrangler deploy` run unprompted in Continuous mode today. In Continuous mode the hook counts only after the C16 check. P6: each CLI needs its help fixture and the unclassified-command test. | — (the owner narrowed "all four groups" for v1) |
| fly, supabase, netlify, psql, sqlite3, duckdb | **Later** | fly keeps its P5 (ADE's relay, phone-watch story 11, "Deploy the relay to Fly.io"). The others: P5 owner to name. | — |
| aws, gcloud, az, doctl, terraform; e2b, modal, docker | **Later, if named** | P5: owner to name. Their tables can meet P6 once fixtures exist. docker's rm, prune and push ask (P2). | — |
| MCP additions: Vercel, Cloudflare, Figma, AWS Knowledge | **Fits if named** | P2 holds: Vercel and Figma add ask rules, Cloudflare asks on every `execute` call, and AWS Knowledge is read-only. P5: owner to name each. | — |
| MCP addition: Chrome DevTools | **Fits if named and pinned** | Local and isolated, with no sign-ins (P3). It fails P2 (install) while it floats `@latest`, like nine shipped entries (Q10). P5: owner to name. | — |
| MCP addition: Atlassian | **Unverified** | If its v2 server exposes fixed discovery and execute tools, an ask rule on the execute tool passes P2, as Cloudflare's does. If not, writes run unprompted in Continuous mode and it needs an owner override. P5: owner to name. | — |
| Shipped-MCP audit (not in either plan; owner, 2026-10-30) | **First after Orgo 1 and 1b** | It needs the shared settings merge and launch flag that Orgo Story 1 builds, and Story 1 is in its third review round. Moving the mechanism into the audit would re-plan reviewed work. P2, expected failures to be verified by the audit story: Stripe (money); Supabase (deletes, billable branches); GitHub (merges and file writes, bounded by the PAT's scope; workflow runs may not be in its default toolsets); DBHub (any SQL its user may run); Airtable (record deletes); Playwright (submits any form, a risk that depends on its browser profile's sign-ins). To check: Notion, Linear, Sentry. Filesystem writes fall outside Claude Code's `Edit` rules, so the archive deny doesn't cover them. Pass: Git, Memory, Fetch, Context7, Sequential thinking. Supersedes CLI plan Q6. | — |
| Phone remote (approved; 5a onward) | **Fits, with the P4 override** | P1 Attention. P2: control is off per tab and needs Face ID. P3: end-to-end, and the relay reads no content. P4 fails, overridden on 2026-10-14. P5: the owner's own use. P6: covered by the five-line command. | — |
| Orchestrator tab | **Freeze** (owner, 2026-10-30) | P3 defect (key fix first). P1 overlaps the stage board's Dispatch. Retire it or fold it into Dispatch: still open (Q8). | — |

## 7. Build queue

One order across everything in flight or proposed. Sizes are rough estimates (S: one small story; M: one story; L: several stories).

1. **WebGL fix.** In build. S.
2. **Hover Story 3** (images). In build. S.
3. **Orchestrator key into the vault.** P3 defect, approved 2026-10-29, being planned. S.
4. **Orchestrator scope freeze** (owner, 2026-10-30): its own small plan states what the freeze holds; whether to retire it or fold it into Dispatch stays open (Q8). S.
5. **Docs story:** the tagline and README paragraph (§8) in the README and the website's hero kicker; the h1 stays (owner, 2026-10-30). S.
6. **Principles check in this repo's plan format** (ADR 0012). This repo's plans need the section, but it must not go into ADE's product templates (`src/lib/projectMethodology.ts`), because other ADE projects aren't bound by ADE's own product principles, nor into the vendored `bmad-build` plan template, which a BMAD update overwrites. A repo-local mechanism (for example a committed `_bmad/custom/bmad-build.toml` override) is for that plan to choose. Until it lands, plan authors add the section by hand. S.
7. **MCP version pinning** (owner, 2026-10-30): pin all nine `npx`/`uvx` entries, and Chrome DevTools if it is added. One catalog-wide story; it does not wait for Orgo. S.
8. **Orgo Story 1.** In revision. M.
9. **Orgo 1b.** S.
10. **Shipped-MCP audit** and ask rules for the shipped entries, through Story 1's merge and launch flag (owner, 2026-10-30). L.
11. **Hover on secret files** (owner, 2026-10-30): for `.env*`, `*.pem` and `*.key`, the card shows file details only, not content. Before Stories 4 and 5, which extend the same card. S.
12. **Hover Stories 4 (PDF) and 5 (HTML).** M each.
13. **CLI library v1:** tab, rules, skills and the classifying hook on the launch flag, for gh, stripe, vercel and wrangler. L. Before the hook counts toward P2 in Continuous mode, the C16 check and the `--settings` hooks check must pass.
14. **Settings key-order story** (Orgo decision 11). S.
15. **Later and named additions:** fly and other CLIs, MCP servers, and Orgo 1c once its hold is lifted. S each.

**Separate track: phone remote 5a onward.** L: twelve watch stories, then the steer and public-service epics. It runs in parallel, because its slices sit mostly in `relay/` and `mobile/`.

**ADR numbers** (provisional until merge, re-checked then):
- 0008 is the hover ADR (`plan/file-hover-preview`);
- 0009, "manual checks don't gate Done", is on `docs/claude-md-paths` and unmerged;
- 0010 is the Orgo ADR, accepted on its branch, and 0011 the CLI plan's, proposed;
- 0012 is the principles ADR, accepted with this doc;
- 0013 is the Orchestrator key ADR, proposed (`fix/anthropic-key-in-vault`).

`hermes-openclaw-plan` and `code-viewer-panel` also claim 0008 and 0009.

## 8. Positioning

Approved by the owner on 2026-10-30; it ships as the docs story (§7, item 5).

**Tagline:** *The IDE for coding agents, and the harness for Claude Code.* It replaces "The terminal for building products with AI" (README) and the website's hero kicker, "The IDE built for Claude Code developers and architects". The website's h1, "Verified, not vibed.", stays.

**README opening paragraph:**

> ADE is a desktop IDE for coding agents and a harness for Claude Code, on macOS and Linux. In the IDE, Claude Code, Codex or a local model run side by side in terminal tabs and splits, with a scratchpad for prompts, and previews and an editor for checking what they wrote. The harness wraps Claude Code so you can check its work. Every project gets a methodology where a story is Done only when an agreed verification command passes, and no role certifies its own work. A fleet view shows every agent and sub-agent, with the real cost of Claude Code sessions. An MCP library and a secrets vault give agents tools and keep keys in your OS keychain rather than in files. ADE goes furthest on serious engineering work, including smart contracts from first test to reviewed deploy.

## 9. Open questions for the owner

Q1, Q2, Q3, Q5, Q8 (the freeze), Q9 and Q10 are decided. Q4, Q6, Q7 and the second half of Q8 stay open.

1. **Approve the tagline and the README paragraph?** *Decided 2026-10-30: yes, as one docs story covering the README and the website kicker.*
2. **Adopt the principles, the override clause and the exceptions list?** *Decided 2026-10-30: yes, as ADR 0012.* Every plan carries a P1–P6 check for the adversarial reviewer.
3. **The CLI hook's installation.** *Decided on 2026-10-29:* v1 is gh, stripe, vercel and wrangler, with a classifying PreToolUse hook. Recommend putting the hook on the `--settings` launch flag (amending Orgo AC11), with its binary outside the project and a copy in `.claude/settings.local.json`, and counting it toward P2 in Continuous mode only after the C16 check passes.
4. **One install form for every CLI?** *Open.* Recommend typed installs (the CLI plan's form). Both typed and run-after-confirm meet P2, so this is about consistency. Orgo 1c follows the choice once `--profile` asks.
5. **Defer Orgo step 2?** *Decided 2026-10-30: deferred, on P4.* This sets aside decision 2's panel and purposes 2–4 of decision 1. It returns only as a new plan.
6. **Reuse the launch flag for other rules?** *Open.* Recommend yes, after Orgo 1b. The audit's ask rules and the CLI plan's "money moves" denies would go on every ADE Claude Code launch.
7. **Which projects need the later CLIs and each MCP addition?** *Open.* Recommend building only what you name. Atlassian may also need a P2 override.
8. **Orchestrator.** The key fix is approved. *Decided 2026-10-30: freeze its scope.* *Open:* whether to retire it later or fold it into the stage board's Dispatch.
9. **Hover on secret files.** *Decided 2026-10-30: a small follow-up.* For `.env*`, `*.pem` and `*.key`, the card shows file details only, not content.
10. **Pin MCP package versions?** *Decided 2026-10-30: pin.* One catalog-wide story pins all nine `npx`/`uvx` entries, plus Chrome DevTools if it is added (which is Q7).
