# Vendoring BMAD assets

ADE bundles pinned copies of BMAD-METHOD under `src-tauri/resources/`:

| | Path | Pin |
|---|---|---|
| **v6** (default) | `src-tauri/resources/bmad-v6/` | `bda3c59`, labelled **6.13.0-next**, in `bmad-v6/VERSION` |
| **v4** (per-project option) | `src-tauri/resources/bmad/` | **v4.44.3**, in `bmad/VERSION` |

- Runtime never fetches BMAD; only a manual step touches the network.
- Each project picks v4 or v6 once, at setup (default v6), recorded in `.ade/methodology`. Existing projects are never converted. A project with `.bmad-core/` and no marker is v4.

## The policy

**ADE owns the verification gate.** ADE's central rule is that a ticket is Done only when evidence says so, and no agent certifies its own work. v6 removed BMAD's QA gate, so ADE keeps the artifact itself: `.ade/gates/<ref>.yml`, named by the ticket's `ref` exactly as the ticket tree prints it (for example `1.6a.yml`), with `story: "<ref>"`, `gate: PASS|CONCERNS|FAIL|WAIVED` and the same keys as v4's gate files. v4 projects keep reading `docs/qa/gates/`. Because the gate is ADE's, BMAD can change underneath it.

**No Python, no `uv`.** v6 resolves its layered TOML config with a Python script run through `uv`. ADE ports those runtime scripts to TypeScript and ships them as one bundle, `_bmad/ade-runtime.mjs`, which the vendored skills call with `node`.

**Skills are patched at vendor time.** `scripts/patchBmadSkills.ts` rewrites every `uv run …/scripts/<name>.py` call in the vendored skills into a call to the Node runtime, so no `uv` remains in the tree. The patched tree is what is committed; `scripts/__tests__/patchBmadSkills.test.ts` checks the patch applies.

**v4 stays read-only compatible.** The v4 copy is frozen at v4.44.3 and is not re-vendored. It exists so existing v4 projects, and new ones that choose it, keep working.

### Why the pin is a commit, not a tag

The v6 tags carry the old layout (`src/{bmm-skills,core-skills}`); the `skills/` layout ADE vendors exists only on `main`. An earlier plan pinned v6.9.0 and was re-pinned to `main @ bda3c59` for that reason. `git clone --branch` does not accept a SHA, so the script clones `main` and checks the commit out.

What v6 changed against v4, for orientation:

| | v4.44.3 | v6 |
|---|---|---|
| Layout | `bmad-core/{tasks,templates,workflows}` | `skills/` |
| Installs into | `.bmad-core/` | `.claude/skills/` and `_bmad/` |
| Config | `core-config.yaml` | layered TOML |
| QA gates | `docs/qa/gates/*.yml` | removed upstream; `.ade/gates/` in ADE |
| Distribution | files to vendor | skills ADE vendors and patches |

Upstream also churns: v6.12.0 shipped six breaking changes in one minor release. That is why the pin moves only deliberately.

## Re-vendoring v6

The script takes a **commit SHA** and an optional **label**, not a tag. Both default to the current pin.

```bash
bash scripts/vendor-bmad-v6.sh <sha> <label>   # e.g. bda3c59 6.13.0-next
npx vitest run                                 # parsers and golden tests read the vendored files
```

It clones upstream, checks out the SHA, replaces `bmad-v6/skills/`, writes `VERSION`, runs the patch (`npx --no-install tsx scripts/patchBmadSkills.ts`) and the patch test. `tsx` is a devDependency, so install dependencies first. If the patch no longer applies, the script fails; fix the patch rather than the vendored files.

Afterwards, run the full suite. `scripts/bmadTaskRefs.test.ts` checks that every v6 skill the agent definitions cite exists in the vendored tree, so a renamed or dropped skill fails the build.

## Re-vendoring v4

Not routine; the copy is frozen. If it is ever needed, stay within the v4 line, where the layout matches:

```bash
git clone --depth 1 --branch v4.x.y https://github.com/bmad-code-org/BMAD-METHOD /tmp/bmad
cp -R /tmp/bmad/bmad-core src-tauri/resources/bmad/
echo "v4.x.y" > src-tauri/resources/bmad/VERSION
npx vitest run     # the parsers read these files as fixtures
```

- `scripts/bmadConfig.test.ts` and `scripts/bmadWorkflow.test.ts` **read the vendored files directly**, so a renamed key or agent fails the build.
- `scripts/bmadGates.test.ts` and `scripts/bmadStories.test.ts` use fixtures **hand-copied** from `templates/qa-gate-tmpl.yaml`, `tasks/qa-gate.md` and `templates/story-tmpl.yaml`. They catch a parser regression, not an upstream format change; re-check those fixtures by eye after a re-vendor.
