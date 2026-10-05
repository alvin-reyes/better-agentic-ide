# Vendoring BMAD assets

ADE bundles a pinned copy of BMAD-METHOD under `src-tauri/resources/bmad/`.

- Pinned version: see `src-tauri/resources/bmad/VERSION` — currently **v4.44.3**.
- Runtime never fetches BMAD; only a manual step touches the network.

## The pin is a decision, not a backlog item

Upstream is on **v6.x** and has restructured so thoroughly that "upgrade to the
latest tag" is not a thing that can be done. The previous version of this file
said to re-run a clone-and-copy with a new tag; that instruction cannot work,
because the directory it copies no longer exists.

What changed between the pinned v4.44.3 and v6:

| | v4.44.3 (pinned) | v6.x |
|---|---|---|
| Layout | `bmad-core/{tasks,templates,workflows}` | `src/{bmm-skills,core-skills}`; no `bmad-core/` |
| Installs into | `.bmad-core/` | `_bmad/` |
| Config | `core-config.yaml` | layered TOML, resolved by a Python script via `uv` |
| Agents | analyst, pm, ux-expert, architect, po, sm, qa, dev | analyst, architect, dev, pm, ux-designer |
| Stories | one file per story, `## Status`, five statuses | one epic document, YAML frontmatter, `draft`/`final` |
| QA gates | `docs/qa/gates/*.yml`, `gate: PASS\|CONCERNS\|FAIL\|WAIVED` | removed |
| Distribution | files to vendor | a Claude Code plugin users install themselves |

### Why ADE stays on v4.44.3

**The QA gate.** ADE's central rule is that a story is Done only when evidence
says so, and no agent certifies its own work. In v4 that evidence is a gate file
with a verdict. v6 removed the concept. Adopting v6 would mean adopting a model
that deleted the artifact ADE exists to enforce.

Three supporting reasons:

- **Eight of the nineteen roles name v4 task commands** — `create-next-story`,
  `validate-next-story`, `trace-requirements`, `review-story`, `shard-doc`,
  `brownfield-create-story`. None of them exists in v6.
- **v6 would impose Python and `uv`** on every project that uses ADE, to resolve
  its layered TOML config.
- **Migrating does not end the churn.** v6.12.0 shipped six breaking changes in
  one minor release, and its own changelog dates the deprecation shims "until
  the v7 cut".

### What would change the decision

- ADE owning the gate as its own artifact under `.ade/`, at which point the
  vendored copy matters much less and BMAD can be whatever the user installs.
- v6 reintroducing a verdict artifact that a board can read.

## If you do need to re-vendor

Only within the v4 line, where the layout still matches:

```bash
git clone --depth 1 --branch v4.x.y https://github.com/bmad-code-org/BMAD-METHOD /tmp/bmad
cp -R /tmp/bmad/bmad-core src-tauri/resources/bmad/
echo "v4.x.y" > src-tauri/resources/bmad/VERSION
npx vitest run     # the parsers read these files as fixtures
```

Run the suite afterwards, because the parsers are tested against these files:

- `scripts/bmadConfig.test.ts` and `scripts/bmadWorkflow.test.ts` **read the
  vendored files directly**, so a renamed key or agent fails the build.
- `scripts/bmadGates.test.ts` and `scripts/bmadStories.test.ts` use fixtures
  **hand-copied** from `templates/qa-gate-tmpl.yaml`, `tasks/qa-gate.md` and
  `templates/story-tmpl.yaml`. They catch a parser regression, not a format
  change upstream — a re-vendor needs those fixtures re-checked against the
  new files by eye.

That gap is worth closing: both rounds of review on the stage board found real
misreads that hand-written fixtures had hidden.
