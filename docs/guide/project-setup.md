---
title: Project setup
lead: Every project ADE opens gets BMAD, the ADE methodology and a team of Claude Code sub-agents, once, without overwriting anything.
description: How ADE sets up each project with BMAD, the "verified, not vibed" methodology, eight core agent roles and agents for your stack, and how to add, remove or undo them.
---

## What gets set up

The first time ADE opens a project, it adds whatever the project is missing:

- **BMAD**: the bundled [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD). By default that is **v6**: its skills in `.claude/skills/`, a `_bmad/` folder with the config and `ade-runtime.mjs`, an empty `_bmad-output/` for tickets, and a `.ade/methodology` file recording the choice. Verification gates are ADE's own, in `.ade/gates/`. Nothing needs Python or `uv`; the skills call a bundled Node script. Its personas are not installed; the roles in `.claude/agents/` cover those jobs once.
- **The ADE methodology**: the rules in `.ade/rules.md`, loaded from `CLAUDE.md`, plus a context store, a decision log and a session journal under `.ade/`, and an `llms.txt`. See [The methodology](#the-methodology) below.
- **Eight core roles** as Claude Code sub-agents in `.claude/agents/`: product manager, architect, designer, scrum master, developer, QA, DevOps and adversarial reviewer.
- **Agents for your stack**: see [By project type](#by-project-type).

**Only missing files are written.** A file that already exists is left alone. If the project already has a `CLAUDE.md`, ADE adds one import line that loads `.ade/rules.md` and never replaces the file.

## v6 or v4

When you pick **New project** or **Open project** in the New tab dialog for a folder that has neither BMAD on disk, ADE asks which to use: **BMAD v6 (default)** or **BMAD v4**, the classic `.bmad-core/` with the `/BMad:tasks:` slash commands for Claude Code (v4 only). The answer is written to `.ade/methodology`. Only that dialog asks, and only while **Set up every project I open** is on: a project set up when a terminal `cd`s into it, from the command palette, or with **Set up now** on the Agents tab gets v6 without a question. To start a project on v4, open it from the New tab dialog first.

Existing projects are not asked. One with `.ade/methodology` follows it; one with `.bmad-core/` and no marker is treated as v4 and stays that way. A v4 project keeps its QA gates in `docs/qa/gates/`; v6 projects use `.ade/gates/`, same format.

## When it runs

Setup runs once per project, when the project is opened in any of these ways:

- **New project** or **Open project**
- any git repository that a terminal `cd`s into

When it's done, a toast lists what was added. **Undo** in the toast removes those files again, but keeps any file you've edited since.

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
_bmad/, _bmad-output/         BMAD v6 config, runtime and tickets
.claude/skills/               BMAD v6 skills
.bmad-core/                   BMAD v4, only on v4 projects
.claude/agents/               the sub-agents
docs/prd.md, docs/architecture.md, docs/ux-spec.md, docs/ops.md, docs/stories/
                              written by the agents as the project goes
```

## Related

- [Agents & fleet]({{ '/guide/agents/' | relative_url }}): the agent picker and its 47 profiles
- [Smart contracts]({{ '/guide/contracts/' | relative_url }}): what the Web3 agents work with
- [Anti-slop]({{ '/guide/anti-slop/' | relative_url }}): the ADE plugin for Claude Code
