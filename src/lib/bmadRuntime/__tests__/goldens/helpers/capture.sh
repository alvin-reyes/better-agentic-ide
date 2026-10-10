#!/usr/bin/env bash
# Golden capture for Task 5c — the 17 skill-root helper scripts.
#
# Every file in this directory comes from the pinned Python under
# src-tauri/resources/bmad-v6/skills/*/scripts/ (the memory-agent asset for
# `wake`). Run from the worktree root:
#
#   bash src/lib/bmadRuntime/__tests__/goldens/helpers/capture.sh
#
# For each capture a fresh /tmp/golden-proj is seeded from `seed/` — the one
# tree both this script and helpers.test.ts build, `@ROOT@` standing for the
# project root (rewritten to $PROJ here, to "/p" in the test) — the command
# runs, and
#   - exit 0: stdout lands in <name>.json
#   - exit != 0: the diagnostic lands in <name>.json (an error golden is a
#     golden)
# The JSON also records the exit code, the command line, the argv the port's
# test replays, both streams, and — when the shape wrote files — a `files` map
# of what landed on disk, so the port is checked on the writes as well as on
# stdout. The port's one return shape has no stderr, so `stdout` holds what the
# port must produce: the script's stdout, or its stderr when a failing shape
# wrote nothing to stdout (a payload printed and a non-zero exit — recon_kit,
# scan_paths, scan_scripts, init_skill --check, git_evidence — leaves stdout in
# place); `stderr` holds the raw diagnostic for the record. Both the project
# root and the worktree root are rewritten to "/p" on the way out, so the
# goldens are host-independent and comparable with the memFs fixtures under
# "/p".
#
# The `--skill-root {skill-root}` flag: Task 1's patcher adds it to call sites
# that invoked a skill's own copy of a script. The pin has no such argument, so
# for those shapes the Python runs WITHOUT the flag — its output is what the
# port must produce — while the recorded argv keeps the flag, which pins the
# acceptance in the test. Three scripts derive something from their own
# location, and the port derives the same thing from --skill-root instead:
#   wake.py            the skill name is its own folder's name
#   list_customizable_skills.py   the skills root is three parents up
#   brain.py, pick_methods.py     the default catalog is beside the script
# For those the Python runs from a copy placed so its own derivation matches
# what the port computes from the flag (`skills/<name>/scripts/<script>.py`,
# and the catalog copies under `catalog/`), which is the same command's real
# output for that install layout.
#
# The visible divergences from the Python, all substitutions a bundle cannot
# share (the same list Task 5b documented, extended for this task):
#   - an OS read error is reported as `[Errno 2] No such file or directory:
#     '<path>'` when the path is absent, instead of the interpreter's message;
#   - a malformed TOML/YAML/JSON file's parse-error text is smol-toml's / the
#     port's own, not tomllib's / PyYAML's (no golden here carries one);
#   - argparse's exact usage lines are not reproduced: a refusal prints
#     `<script>: error: <message>` and exits 2, the Task 6 convention. Shapes
#     whose Python refusal came from argparse (a missing or malformed flag)
#     are therefore NOT goldens; helpers.test.ts asserts the port's own
#     refusal for them. Shapes where the script printed its own message and
#     returned 2 are goldens;
#   - `scan_scripts.py` parses Python with `ast`; the port tokenizes instead,
#     so it reports the tokenizer-level syntax errors (an unterminated string,
#     a bracket never closed) with the interpreter's wording and cannot detect
#     a grammar-level one;
#   - `git_evidence.py` and `run_triggers.py` run external processes; the port
#     spawns them through node:child_process. `git_evidence` is captured over
#     the pinned repo `seed-git-demo.sh` builds, so the test can rebuild the
#     same history and compare commit-for-commit;
#   - `run_triggers.py` stamps its run folder and JSON with the wall clock, so
#     only its refusals are goldens; the port test covers the recording paths;
#   - `read_session_log.py` ordered a folder's transcripts by modification
#     time; `Fs` carries no mtimes, so the port reads them in name order, which
#     changes only the order of the `sources` list.

set -euo pipefail

# run_triggers.py imports eval_common.py from its own folder; no bytecode
# cache is left behind in the vendored tree.
export PYTHONDONTWRITEBYTECODE=1

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
VENDOR="$WORKTREE/src-tauri/resources/bmad-v6"
SKILLS="$VENDOR/skills"
OUT="$WORKTREE/src/lib/bmadRuntime/__tests__/goldens/helpers"
SEED="$OUT/seed"
PROJ=/tmp/golden-proj

R_ARCH="$SKILLS/bmad-architecture/scripts/lint_spine.py"
R_BRAIN="$SKILLS/bmad-brainstorming/scripts/brain.py"
BRAIN="$PROJ/skills/bmad-brainstorming/scripts/brain.py"
R_RECON="$SKILLS/bmad-deep-recon/scripts/recon_kit.py"
R_TRIGGERS="$SKILLS/bmad-eval/scripts/run_triggers.py"
R_PERSONAS="$SKILLS/bmad-forge-idea/scripts/resolve_personas.py"
R_GROUPS="$SKILLS/bmad-party-mode/scripts/resolve_party.py"
R_GIT="$SKILLS/bmad-retrospective/scripts/git_evidence.py"
R_CUSTOMIZABLE="$SKILLS/bmad-customize/scripts/list_customizable_skills.py"
R_METHODS="$SKILLS/bmad-advanced-elicitation/scripts/pick_methods.py"
R_WAKE="$SKILLS/bmad-toolsmith/shapes/memory-agent/assets/wake-template.py"
R_INIT="$SKILLS/bmad-toolsmith/scripts/init_skill.py"
R_SESSLOG="$SKILLS/bmad-toolsmith/scripts/read_session_log.py"
R_REGISTRY="$SKILLS/bmad-toolsmith/scripts/registry.py"
R_SCANPATHS="$SKILLS/bmad-toolsmith/scripts/scan_paths.py"
R_SCANSCRIPTS="$SKILLS/bmad-toolsmith/scripts/scan_scripts.py"
R_LEGACY="$SKILLS/bmad-toolsmith/scripts/scan_legacy_module.py"
R_TEMPLATE="$SKILLS/bmad-toolsmith/scripts/process_template.py"

seed() {
  rm -rf "$PROJ"
  mkdir -p "$PROJ/_bmad-output/initiative-demo" "$PROJ/out"
  cp -R "$SEED/." "$PROJ/"
  # @ROOT@ is the project root: the one substitution the seed and the test's
  # memFs copy both make, each in its own spelling.
  find "$PROJ" -type f -exec grep -Il '@ROOT@' {} + 2>/dev/null | while read -r f; do
    python3 - "$f" "$PROJ" <<'PY'
import sys

path, root = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as handle:
    body = handle.read()
with open(path, "w", encoding="utf-8") as handle:
    handle.write(body.replace("@ROOT@", root))
PY
  done
  # The two resolvers these scripts shell out to, and the module whose roster
  # they read, sit where the pin expects them: `_bmad/scripts/` and beside the
  # party skill. The port resolves both in-process; the copies are for the
  # Python's benefit only.
  mkdir -p "$PROJ/_bmad/scripts"
  cp "$SKILLS"/bmad/scripts/*.py "$PROJ/_bmad/scripts/" 2>/dev/null || true
  cp -R "$SKILLS/bmad-party-mode" "$PROJ/skills/bmad-party-mode"
  # wake.py and list_customizable_skills.py derive names from their location;
  # the copies put them where the port's --skill-root will point.
  mkdir -p "$PROJ/skills/demo-agent/scripts" "$PROJ/skills/ghost-agent/scripts" "$PROJ/skills/half-born/scripts"
  mkdir -p "$PROJ/skills/bmad-customize/scripts"
  cp "$R_WAKE" "$PROJ/skills/demo-agent/scripts/wake.py"
  cp "$R_WAKE" "$PROJ/skills/ghost-agent/scripts/wake.py"
  cp "$R_WAKE" "$PROJ/skills/half-born/scripts/wake.py"
  cp "$R_CUSTOMIZABLE" "$PROJ/skills/bmad-customize/scripts/list_customizable_skills.py"
  # brain.py draws its icon sidecar from the folder beside the script; the
  # copy sits there with the same sidecar so its own derivation matches what
  # the port computes from --file's folder.
  mkdir -p "$PROJ/skills/bmad-brainstorming/scripts" "$PROJ/skills/bmad-brainstorming/assets"
  cp "$R_BRAIN" "$PROJ/skills/bmad-brainstorming/scripts/brain.py"
  cp "$SEED/catalog/brain-icons.json" "$PROJ/skills/bmad-brainstorming/assets/brain-icons.json"
  ROOT="$(cd "$PROJ" && pwd -P)"
  # macOS spells /tmp through /private; one spelling for every path from here.
  PROJ="$ROOT"
  bash "$OUT/seed-git-demo.sh" "$PROJ/git-demo"
}

# run <name> <script> <args…> — Python runs the args as given.
run() {
  local name="$1" script="$2"; shift 2
  capture "$name" "$script" "$@" -- "$@"
}

# run_ignored <name> <script> <python-args…> :: <recorded-argv…> — Python runs
# the args before ::; the JSON records the argv after it.
run_ignored() {
  local name="$1" script="$2"; shift 2
  local python_args=() recorded=()
  while [ "$1" != "::" ]; do python_args+=("$1"); shift; done
  shift
  while [ "$#" -gt 0 ]; do recorded+=("$1"); shift; done
  capture "$name" "$script" "${python_args[@]}" -- "${recorded[@]}"
}

# CAPTURE_FILES: absolute paths whose contents land in the golden's `files`
# map — the writes a shape made, checked as hard as its stdout.
capture() {
  local name="$1" script="$2"; shift 2
  local python_args=() recorded=()
  while [ "$1" != "--" ]; do python_args+=("$1"); shift; done
  shift
  while [ "$#" -gt 0 ]; do recorded+=("$1"); shift; done
  local code
  set +e
  uv run "$script" "${python_args[@]}" >"$PROJ/.out" 2>"$PROJ/.err"
  code=$?
  set -e
  python3 - "$OUT/$name.json" "$code" "$ROOT" "$WORKTREE" "$PROJ/.out" "$PROJ/.err" "$script" "${CAPTURE_FILES:-}" "${recorded[@]}" <<'PY'
import json
import sys

out, code, root, worktree, stdout_path, stderr_path, script, files, *argv = sys.argv[1:]


def host_free(text: str) -> str:
    return text.replace(root, "/p").replace(worktree, "/p")


written = {}
for path in files.split():
    try:
        with open(path, encoding="utf-8") as handle:
            written[host_free(path)] = host_free(handle.read())
    except OSError as error:
        written[host_free(path)] = f"<unreadable: {error}>"

raw_stdout = host_free(open(stdout_path, encoding="utf-8").read())
raw_stderr = host_free(open(stderr_path, encoding="utf-8").read())
stream = "stdout" if raw_stdout else "stderr"

json.dump(
    {
        "python": host_free("uv run " + script + " " + " ".join(argv)),
        "stream": stream,
        "exitCode": int(code),
        "argv": [host_free(arg) for arg in argv],
        "stdout": raw_stdout or raw_stderr,
        "stderr": raw_stderr,
        "files": written,
    },
    open(out, "w", encoding="utf-8"),
    indent=2,
    ensure_ascii=False,
)
open(out, "a", encoding="utf-8").write("\n")
PY
  unset CAPTURE_FILES
}

seed

# ---- recon_kit — every subcommand a call site uses, plus its own refusals.
run reconKit-tally "$R_RECON" tally "$ROOT/recon/.memlog.md"
run reconKit-citations "$R_RECON" citations "$ROOT/recon/dossier.md"
run reconKit-escape-sources "$R_RECON" escape-sources "$ROOT/recon/dossier.md"
run reconKit-staleness "$R_RECON" staleness "$ROOT/recon/claims.json" --windows '{"size/growth": 18, "pricing": 3}' --today 2026-04-01
run reconKit-slug "$R_RECON" slug "Where should the product go next?" --type market --pattern "research-{topic_slug}-{research_type}-{date}" --date 2026-04-01
run reconKit-bad-windows "$R_RECON" staleness "$ROOT/recon/claims.json" --windows '[]'
run reconKit-bad-date "$R_RECON" staleness "$ROOT/recon/claims-bad.json" --windows '{"pricing": 3}' --today 2026-04-01
run_ignored reconKit-tally-skill-root "$R_RECON" tally "$ROOT/recon/.memlog.md" :: --skill-root "$ROOT/skills/bmad-deep-recon" tally "$ROOT/recon/.memlog.md"

# ---- init_skill — the two check shapes and a scaffold that writes files.
run initSkill-check-alpha "$R_INIT" --check "$ROOT/skills/bmad-alpha"
run initSkill-check-epsilon "$R_INIT" --check "$ROOT/skills/bmad-epsilon"
CP_FILES="$ROOT/out/bmad-new/SKILL.md $ROOT/out/bmad-new/bmod.toml" \
  CAPTURE_FILES="$CP_FILES" \
  run initSkill-create "$R_INIT" --name bmad-new --dest "$ROOT/out" --shape agent --bmod bmod-demo --description "Use when a demo is needed." --dirs references,scripts
run initSkill-create-exists "$R_INIT" --name bmad-new --dest "$ROOT/out" --shape agent
run initSkill-create-module "$R_INIT" --name bmad-mod-demo --dest "$ROOT/out" --shape single-skill-module --source "github:sam/skills"

# ---- brain — the catalog served without loading it whole.
run brain-categories "$BRAIN" --file "$ROOT/catalog/brain.csv" categories
run brain-list-json "$BRAIN" --file "$ROOT/catalog/brain.csv" --json list --category creative --category wild
run brain-show "$BRAIN" --file "$ROOT/catalog/brain.csv" show "five whys" "Yes And Building" "Random Word"
run brain-show-missing "$BRAIN" --file "$ROOT/catalog/brain.csv" show "Not There"
CAPTURE_FILES="$ROOT/out/brain-selector.html" \
  run brain-html "$BRAIN" --file "$ROOT/catalog/brain.csv" --extra "$ROOT/catalog/extra.json" html --out "$ROOT/out/brain-selector.html"
run_ignored brain-extra "$BRAIN" --file "$ROOT/catalog/brain.csv" --extra "$ROOT/catalog/extra.json" categories :: --skill-root "$ROOT/skills/bmad-brainstorming" --file "$ROOT/catalog/brain.csv" --extra "$ROOT/catalog/extra.json" categories

# ---- pick_methods — the same catalog shape for elicitation.
run pickMethods-categories "$R_METHODS" --file "$ROOT/catalog/methods.csv" categories
run pickMethods-list "$R_METHODS" --file "$ROOT/catalog/methods.csv" list --category business
run pickMethods-show-json "$R_METHODS" --file "$ROOT/catalog/methods.csv" --json show "pre-mortem" 4
run pickMethods-extra "$R_METHODS" --file "$ROOT/catalog/methods.csv" --extra "$ROOT/catalog/extra-methods.json" --json categories
run pickMethods-list-refusal "$R_METHODS" --file "$ROOT/catalog/methods.csv" list
run pickMethods-file-missing "$R_METHODS" --file "$ROOT/catalog/nope.csv" categories
run_ignored pickMethods-categories-skill-root "$R_METHODS" --file "$ROOT/catalog/methods.csv" categories :: --skill-root "$ROOT/skills/bmad-advanced-elicitation" --file "$ROOT/catalog/methods.csv" categories

# ---- scan_scripts and scan_paths — the two linters over fixture skills.
run scanScripts-delta "$R_SCANSCRIPTS" "$ROOT/skills/bmad-delta"
run scanScripts-alpha "$R_SCANSCRIPTS" "$ROOT/skills/bmad-alpha"
run scanPaths-gamma "$R_SCANPATHS" "$ROOT/skills/bmad-gamma"
run scanPaths-gamma-allow "$R_SCANPATHS" "$ROOT/skills/bmad-gamma" --allow old-module-format --allow python-call
run scanPaths-alpha "$R_SCANPATHS" "$ROOT/skills/bmad-alpha"
run_ignored scanPaths-skill-root "$R_SCANPATHS" "$ROOT/skills/bmad-alpha" :: --skill-root "$ROOT/skills/bmad-toolsmith" "$ROOT/skills/bmad-alpha"

# ---- registry — what BMad knows about in this project.
run registry-fixture "$R_REGISTRY" --project-root "$ROOT" --root "$ROOT/skills"
run registry-two-roots "$R_REGISTRY" --project-root "$ROOT" --root "$ROOT/nowhere" --root "$ROOT/skills"

# ---- read_session_log — one transcript, one memlog, and a folder of both.
run readSessionLog-jsonl "$R_SESSLOG" "$ROOT/sessions/transcript.jsonl"
run readSessionLog-memlog "$R_SESSLOG" "$ROOT/sessions/party.memlog.md"
run readSessionLog-folder "$R_SESSLOG" "$ROOT/sessions" --max-items 2
run readSessionLog-unknown "$R_SESSLOG" "$ROOT/sessions/notes.txt"

# ---- resolve_party and resolve_personas — the two collective resolvers.
run resolveParty-default "$R_GROUPS" --project-root "$ROOT" --skill "$ROOT/skills/bmad-party-mode"
run resolveParty-list-groups "$R_GROUPS" --project-root "$ROOT" --skill "$ROOT/skills/bmad-party-mode" --list-groups
run resolveParty-writers-room "$R_GROUPS" --project-root "$ROOT" --skill "$ROOT/skills/bmad-party-mode" --party writers-room
run resolveParty-unknown-group "$R_GROUPS" --project-root "$ROOT" --skill "$ROOT/skills/bmad-party-mode" --party nope
run resolvePersonas-main "$R_PERSONAS" --project-root "$ROOT" --skill "$ROOT/skills/bmad-forge-idea"
run resolvePersonas-no-party "$R_PERSONAS" --project-root "$ROOT" --skill "$ROOT/elsewhere/bmad-forge-idea"

# ---- list_customizable_skills — the skills root derived from the skill's
#      location (see the header): the recorded argv carries the patched
#      --skill-root, and the Python runs with the equivalent --skills-root.
run listCustomizableSkills-main "$R_CUSTOMIZABLE" --project-root "$ROOT" --skills-root "$ROOT/skills"
run listCustomizableSkills-missing-root "$R_CUSTOMIZABLE" --project-root "$ROOT" --skills-root "$ROOT/nowhere"
mkdir -p "$PROJ/skills/bmad-customize"
run_ignored listCustomizableSkills-skill-root "$PROJ/skills/bmad-customize/scripts/list_customizable_skills.py" --project-root "$ROOT" :: --skill-root "$ROOT/skills/bmad-customize" --project-root "$ROOT"

# ---- lint_spine — the workspace's own spine, and the -o shape.
run lintSpine "$R_ARCH" --workspace "$ROOT/spine/arch-demo"
CAPTURE_FILES="$ROOT/out/spine.json" \
  run lintSpine-out "$R_ARCH" --workspace "$ROOT/spine/arch-demo" -o "$ROOT/out/spine.json"
run lintSpine-missing "$R_ARCH" --workspace "$ROOT/spine/nope"
run_ignored lintSpine-skill-root "$R_ARCH" --workspace "$ROOT/spine/arch-demo" :: --skill-root "$ROOT/skills/bmad-architecture" --workspace "$ROOT/spine/arch-demo"

# ---- scan_legacy_module — a module in the old format, and a folder without one.
run scanLegacyModule-scan "$R_LEGACY" "$ROOT/legacy/oldmod"
run scanLegacyModule-none "$R_LEGACY" "$ROOT/skills"

# ---- process_template — template filling, stdout and -o, plus the refusal.
run processTemplate-out "$R_TEMPLATE" "$ROOT/recon/brief.md.tpl" -o "$ROOT/out/brief.md" --var topic="Product direction" --true deep
CAPTURE_FILES="$ROOT/out/brief.md" \
  run processTemplate-out-files "$R_TEMPLATE" "$ROOT/recon/brief.md.tpl" -o "$ROOT/out/brief.md" --var topic="Product direction" --true deep
run processTemplate-stdout "$R_TEMPLATE" "$ROOT/recon/brief.md.tpl" --var topic="Product direction" --var research_type=market
run processTemplate-leftover "$R_TEMPLATE" "$ROOT/recon/broken.tpl" --var topic="x"
run processTemplate-missing "$R_TEMPLATE" "$ROOT/recon/nope.tpl"

# ---- wake — the memory agent's activation, each copy inside the skill folder
#      whose name the Python derives from its own location.
run_ignored wake-first-breath "$PROJ/skills/ghost-agent/scripts/wake.py" "$ROOT" :: --skill-root "$ROOT/skills/ghost-agent" "$ROOT"
run_ignored wake-waking "$PROJ/skills/demo-agent/scripts/wake.py" "$ROOT" :: --skill-root "$ROOT/skills/demo-agent" "$ROOT"
run_ignored wake-pulse "$PROJ/skills/demo-agent/scripts/wake.py" --pulse "$ROOT" :: --skill-root "$ROOT/skills/demo-agent" --pulse "$ROOT"
run_ignored wake-incomplete "$PROJ/skills/half-born/scripts/wake.py" "$ROOT" :: --skill-root "$ROOT/skills/half-born" "$ROOT"

# ---- git_evidence — the pinned repo, its ranges, and its refusals.
run gitEvidence-range "$R_GIT" --repo "$ROOT/git-demo" --range main~3..main --stories story-1-1,story-1-2
run gitEvidence-no-range "$R_GIT" --repo "$ROOT/git-demo"
run gitEvidence-bad-range "$R_GIT" --repo "$ROOT/git-demo" --range main...HEAD
run gitEvidence-missing-repo "$R_GIT" --repo "$ROOT/nope" --range HEAD~1..HEAD

# ---- run_triggers — the refusals a runner can answer without a model.
run runTriggers-no-queries "$R_TRIGGERS" --skill-path "$ROOT/skills/bmad-alpha" --queries "$ROOT/nope.json" --output-dir "$ROOT/out/trig"
run runTriggers-not-a-list "$R_TRIGGERS" --skill-path "$ROOT/skills/bmad-alpha" --queries "$ROOT/recon/claims.json" --output-dir "$ROOT/out/trig"
run runTriggers-bad-harness "$R_TRIGGERS" --skill-path "$ROOT/skills/bmad-alpha" --queries "$ROOT/recon/queries.json" --harness "$ROOT/catalog/extra.json" --output-dir "$ROOT/out/trig"

echo "captured $(ls "$OUT"/*.json | wc -l | tr -d ' ') goldens into $OUT"
