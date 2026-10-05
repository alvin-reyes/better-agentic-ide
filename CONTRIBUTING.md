# Contributing to ADE

Thanks for being here. ADE is MIT licensed and contributions are welcome,
including your first one.

There is a path in that needs no Rust and no Tauri build: see
[Markdown-only changes](#markdown-only-changes).

## The one idea to understand first

ADE exists because an agent saying "done" is not evidence. Everything in the
project follows from that, and it applies to **our** work too:

> A change is done when the check that proves it passes — not when it looks
> right.

In practice that means a bug fix comes with a test that **fails without the
fix**. Write the test, watch it fail, then fix it. If a test passes before your
change, it is not testing your change.

Several tests in `scripts/` exist only to stop a specific bug coming back —
a font that was never bundled, a CSP that blocked WebAssembly, a page that
claimed a number its own screenshot contradicted. Adding one of those is a
welcome contribution on its own.

## Getting it running

You need **Node 20** and a **stable Rust toolchain** (CI uses both).

```bash
git clone https://github.com/alvin-reyes/better-agentic-ide
cd better-agentic-ide
npm ci
npm run tauri dev
```

Platform prerequisites for Tauri (GTK and WebKit on Linux, Xcode command line
tools on macOS) are listed in
[Tauri's prerequisites guide](https://v2.tauri.app/start/prerequisites/).

If `npm run tauri dev` is heavy for what you are changing, `npm run dev` serves
the frontend alone at `localhost:1420`. Anything that calls a Tauri command will
fail there, which is fine for pure UI work.

## What has to pass

CI runs these, so run them before opening a PR:

```bash
npx tsc --noEmit     # typecheck
npm test             # vitest, the whole suite
npx vite build       # the frontend actually builds
cargo test --locked  # in src-tauri/, for Rust changes
```

`npm run test:watch` while you work.

## Where things live

| Path | What it is |
|---|---|
| `src/` | React frontend: components, stores, hooks, `lib/` |
| `src-tauri/` | Rust backend: PTY, filesystem, vault, watchers, the command surface |
| `scripts/` | Build tooling **and** the guard tests that run in Node rather than jsdom |
| `docs/` | The website (Jekyll, served at ade.ardata.tech) |
| `vendor/ade-setup/` | The 19 role definitions, **vendored — do not edit here** |
| `claude-plugin/` | The ADE plugin for Claude Code |
| `src-tauri/resources/bmad/` | Vendored BMAD tasks, templates and workflows |

### Two directories that are copies

`vendor/ade-setup/` and `src-tauri/resources/bmad/` are pinned copies of other
projects. Editing them directly looks like it works and is silently undone the
next time they are re-synced.

- **Role definitions** belong in
  [ade-setup](https://github.com/alvin-reyes/ade-setup). Change them there, then
  re-vendor with `npm run sync:agents`.
- **BMAD** tasks and templates come from BMAD upstream.

## Markdown-only changes

The quickest useful contribution needs no build at all:

- **Improve a role.** The 19 roles are markdown in
  [ade-setup](https://github.com/alvin-reyes/ade-setup). Each states what it
  owns, what it must not touch, and whose job the rest is. Sharpening those
  boundaries improves every project that uses ADE.
- **Fix the docs or the site.** `docs/` is Jekyll. One warning from experience:
  **quote every string in `_data/*.yml`.** An unquoted value containing a colon
  broke the site build once and the failure is not obvious.

## Pull requests

- **One change per PR.** A fix plus a drive-by refactor is two PRs.
- **Say what breaks without it.** The useful part of a description is the
  failure it prevents, not a restatement of the diff.
- **Match the surrounding code.** Comment density, naming, and structure vary by
  file on purpose; your change should read like its neighbours.
- **Commit messages are prose.** Explain why the change is right, not just what
  it does. `git log` is the convention; read a few before writing yours.
- **Don't bump the version.** Releases are cut from a tag by a maintainer.

### If you used an agent to write it

That is fine — this is a tool for exactly that. Two asks:

1. **Read every line before you open the PR.** You are the author.
2. **Run the anti-slop check.** ADE's own rules flag TODOs, debug leftovers,
   stubs and AI-sounding prose. Reviewers will notice; the checker is faster.

## Reporting a bug

Say what you expected, what happened, and how to reproduce it. Include your OS,
whether you built from source or installed a release, and the version from
**ADE → About** or `src-tauri/tauri.conf.json`.

If the app misbehaved rather than crashed, `~/Library/Logs/ADE/ade.log` on macOS
is often the only place the real error appears — one shipped release logged a
blocked WebAssembly compile there and nowhere else.

## Security

Please do not open a public issue for a vulnerability. Email the maintainer
instead. ADE runs shell processes and touches the OS keychain, so a report that
looks small may not be.

## Code of conduct

Be decent. Assume the other person is trying to make the project better. Review
the work, not the author.
