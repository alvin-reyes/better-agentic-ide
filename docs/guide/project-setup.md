---
title: Project setup
lead: Every project ADE opens gets BMAD, the ADE methodology and a team of Claude Code sub-agents, once, without overwriting anything.
description: How ADE sets up each project with BMAD, the "verified, not vibed" methodology, eight core agent roles and agents for your stack, and how to add, remove or undo them.
---

## What gets set up

The first time ADE opens a project, it adds whatever the project is missing:

- **BMAD**: the bundled [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD). By default that is **v6**: its skills in `.claude/skills/`, a `_bmad/` folder with the config and `ade-runtime.mjs`, an empty `_bmad-output/` for tickets, and a `.ade/methodology` file recording the choice. Verification gates are ADE's own, in `.ade/gates/`. Setup and the core workflows need neither Python nor `uv`; the skills call a bundled Node script. v6's five persona skills come with the rest; on v4 the personas are not installed at all. Either way, the roles in `.claude/agents/` are the team.
- **The ADE methodology**: the rules in `.ade/rules.md`, loaded from `CLAUDE.md`, plus a context store, a decision log and a session journal under `.ade/`, and an `llms.txt`. See [The methodology](#the-methodology) below.
- **Eight core roles** as Claude Code sub-agents in `.claude/agents/`: product manager, architect, designer, scrum master, developer, QA, DevOps and adversarial reviewer.
- **Agents for your stack**: see [By project type](#by-project-type).

**Only missing files are written.** A file that already exists is left alone. If the project already has a `CLAUDE.md`, ADE adds one import line that loads `.ade/rules.md` and never replaces the file.

## Choosing the BMAD version

A project with no BMAD is asked which version to use before anything is written: **BMAD v6 (default)** or **BMAD v4**, the classic `.bmad-core/` with the `/BMad:tasks:` slash commands for Claude Code (v4 only). The answer is written to `.ade/methodology`, for v4 as well as v6. The question has no Cancel button, and <kbd>Esc</kbd> does nothing: it has to be answered. How ADE asks depends on how the project was opened:

- **New project** or **Open project** in the New tab dialog: a dialog, *Set up shop with BMAD v6 (default) or BMAD v4?* Click a version, or press <kbd>Enter</kbd> to pick v6 (the arrow keys move to v4). The folder isn't opened until you answer. The folder you picked is the project, unless a folder above it already has BMAD: then that project is used and nothing is asked.
- **A terminal `cd`s into a git repository**: a toast, *Set up shop with BMAD?*, with **v6** and **v4**. It stays on screen until you click one. If another toast replaces it, it comes back the next time you `cd` into the project or switch to its tab. Nothing is set up unless you click **v6** or **v4**.
- ***Project: Set up BMAD, methodology and agents*** in the command palette, and **Set up now** on the stage board and the Agents tab: the same dialog, which must be answered too.

A project that already has BMAD is never asked. One with `.ade/methodology` follows it; one with `.bmad-core/` and no marker is treated as v4 and stays that way. A v4 project keeps its QA gates in `docs/qa/gates/`; v6 projects use `.ade/gates/`, same format.

There are two ways not to have BMAD in a project. Turn off **Set up every project I open** in *Settings → Terminal*: then the New tab dialog and the terminal neither set up nor ask. Or click **Undo** after a setup: that project is declined, and they leave it alone from then on. The palette command and **Set up now** work either way.

## When it runs

Setup runs once per project, when the project is opened in any of these ways:

- **New project** or **Open project**
- any git repository that a terminal `cd`s into

A project with no BMAD is [asked which version](#choosing-the-bmad-version) first, and nothing is written until you answer.

When setup is done, a toast lists what was added. **Undo** in the toast removes those files again, but keeps any file you've edited since.

To stop automatic setup, turn off **Set up every project I open** in *Settings → Terminal*. It's on by default. You can still set up a project by hand with *Project: Set up BMAD, methodology and agents* in the command palette.

## By project type

ADE looks at the files in the project's root folder and adds agents that fit:

| Project | Detected by | Agents added |
|---|---|---|
| Foundry or Hardhat | `foundry.toml` or a `hardhat.config` file | Solidity smart contract engineer, smart contract security auditor, gas optimizer, Web3 DevOps engineer |
| Anchor / Solana | `Anchor.toml`, or a `Cargo.toml` that uses `anchor-lang` or `solana-program` | Solana/Anchor engineer, smart contract security auditor, Web3 DevOps engineer, senior Rust engineer |
| Go | `go.mod` | Senior Go engineer |
| Rust | `Cargo.toml` | Senior Rust engineer |

If you add a stack later, for example a `foundry.toml` in an existing Go repo, its agents are added the next time the project is opened.

## Adding and removing agents

Open *Integrations* with {% include key.html mac="⌘⇧I" other="Ctrl+Alt+Shift+I" %} and choose the **Agents** tab (or *Agents: Add or remove agents in this project* in the command palette). It shows:

- the **Project setup** card, with what's missing and a **Set up now** button;
- the core roles and every other agent, grouped, with **Add** or **Remove** next to each. Agents that match the project's stack are tagged *for this stack*.

An agent you remove stays removed: setup won't bring it back when the project is opened again. Add it from the same tab if you change your mind.

### Agents from an older setup

A core role's file carries the BMAD tasks for one methodology, the project's. A project set up before ADE supported v6 is treated as v4, and its role files list the v4 tasks, which is correct for it. If you later move such a project to v6, those files still name v4 tasks, and setup never replaces an existing file. To bring a role up to date, **Remove** it and **Add** it again on the Agents tab: the file is rewritten for the project's methodology. Copy out anything you changed in it first.

## How Claude Code uses the agents

The agents are ordinary [Claude Code sub-agents](https://docs.anthropic.com/en/docs/claude-code/sub-agents), one Markdown file each in `.claude/agents/`. Commit them so your team shares them.

- Claude Code **delegates by description**: each agent's description says when to use it, and Claude picks the one that owns the work.
- You can **ask by name**: "use the qa agent to verify story 3", "have the adversarial-reviewer look at the architecture".
- **New sessions pick up changes.** A Claude Code session that was already running when you added or removed an agent keeps its old list; start a new one.

These are not the same thing as the agents in ADE's own [picker]({{ '/guide/agents/' | relative_url }}#agent-picker). The files here are sub-agents **Claude Code delegates to on its own**, inside a session you are already running. The picker **starts a session**, with a role and a provider you choose. The names overlap because both describe the same jobs; if you already keep your own sub-agents in `.claude/agents/`, setup only adds what is missing and never replaces them.

## The methodology

The ADE methodology is "verified, not vibed". Work flows in five steps:

1. **Plan**: the product manager writes the PRD, the architect the architecture (including the one **verification command**, such as `npm test` or `forge test`), the designer the UX spec and mockup, and DevOps the ops plan.
2. **Approve**: you review and approve the plan. The adversarial reviewer tries to break each artifact first.
3. **Shard**: the scrum master splits the plan into small, independently testable stories.
4. **Build**: developer agents build one story each, test-first. Several can run in parallel.
5. **Verify**: QA or you run the verification command. **A story is Done only when it passes.** No agent certifies its own work.

### File layout

```text
CLAUDE.md                     project conventions; loads .ade/rules.md
llms.txt                      short project summary for LLMs
.ade/rules.md                 the methodology and its rules
.ade/context/                 context store: shared interfaces, types and contracts
.ade/context/decisions/       decision log (ADRs, NNNN-slug.md)
.ade/session.md               session journal: what was planned, built and shipped
.ade/methodology              v6 or v4
.ade/gates/                   verification gates, one per ticket (v6)
.ade/approvals/               approved v6 tickets, one file per ticket (v6)
.ade/stage                    the stage you confirmed on the board
_bmad/, _bmad-output/         BMAD v6 config, runtime and tickets
.claude/skills/               BMAD v6 skills
.bmad-core/                   BMAD v4, only on v4 projects
.claude/agents/               the sub-agents
docs/prd.md, docs/architecture.md, docs/ux-spec.md, docs/ops.md, docs/stories/
                              written by the agents as the project goes
```

`.ade/stage` and `.ade/approvals/` are written only when you click on the board. Commit them with the rest of `.ade/` so the team shares them.

## Related

- [Agents & fleet]({{ '/guide/agents/' | relative_url }}): the agent picker and its 47 profiles
- [Smart contracts]({{ '/guide/contracts/' | relative_url }}): what the Web3 agents work with
- [Anti-slop]({{ '/guide/anti-slop/' | relative_url }}): the ADE plugin for Claude Code
