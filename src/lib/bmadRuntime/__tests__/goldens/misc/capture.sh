#!/usr/bin/env bash
# Golden capture for Task 5b — roster, knowledge and validate_manifests.
#
# Every file in this directory comes from the pinned Python at
# src-tauri/resources/bmad-v6/skills/bmad/scripts/ (roster.py, knowledge.py,
# validate_manifests.py; roster.py and validate_manifests.py also load
# knowledge.py, config_utils.py and setup.py from the same folder). Run from
# the worktree root:
#
#   bash src/lib/bmadRuntime/__tests__/goldens/misc/capture.sh
#
# For each capture a fresh /tmp/golden-proj is seeded (the same _bmad/config.toml
# Task 3's capture uses, a project-local copy of the vendored skills tree at
# /tmp/golden-proj/skills, and broken-repo/ from this directory at
# /tmp/golden-proj/broken-repo), the command runs, and
#   - exit 0: stdout lands in <name>.json
#   - exit != 0: stderr lands in <name>.json (an error golden is a golden)
# The JSON also records the exit code, which stream the text came from, and the
# argv the port's test replays. Both the capture project root and the worktree
# root are rewritten to "/p" on the way out, so the goldens are host-independent
# and comparable with the memFs fixtures under "/p".
#
# The skills-with--skill-root shapes: Task 1's patcher added
# `--skill-root {skill-root}` to call sites that invoked a skill's own copy of
# the script. The Python at this pin has no --skill-root argument and argparse
# answers it with a usage error (exit 2, stderr). Task 5c's ruling makes those
# call sites the contract: the port accepts --skill-root and ignores it (roster
# and knowledge use it for nothing; the skill root is only the caller's
# location). So for those shapes the Python runs WITHOUT the flag — its output
# is what the port must produce — while the recorded argv keeps the flag, which
# pins the acceptance in the test. `roster --skill` is upstream's own spelling
# and keeps it.
#
# The visible divergences from the Python, all substitutions a bundle cannot
# share:
#   - an OS read error is reported as `[Errno 2] No such file or directory:
#     '<path>'` when the path is absent, instead of the interpreter's message;
#   - a malformed TOML file's parse-error text is smol-toml's, not tomllib's
#     (no golden here carries one);
#   - argparse's exact usage lines are not reproduced: a refusal prints
#     `<script>: error: <message>` and exits 2, the Task 6 convention.

set -euo pipefail

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
VENDOR="$WORKTREE/src-tauri/resources/bmad-v6"
ROSTER="$VENDOR/skills/bmad/scripts/roster.py"
KNOWLEDGE="$VENDOR/skills/bmad/scripts/knowledge.py"
VALIDATE="$VENDOR/skills/bmad/scripts/validate_manifests.py"
OUT="$WORKTREE/src/lib/bmadRuntime/__tests__/goldens/misc"
PROJ=/tmp/golden-proj

seed() {
  rm -rf "$PROJ"
  mkdir -p "$PROJ/_bmad/custom" "$PROJ/_bmad-output/initiative-demo" "$PROJ/empty"
  cp -R "$VENDOR/skills" "$PROJ/skills"
  cp -R "$OUT/broken-repo" "$PROJ/broken-repo"
  ROOT="$(cd "$PROJ" && pwd -P)"
  cat >"$PROJ/_bmad/config.toml" <<EOF
[core]
project_name = "p"
output_folder = "$ROOT/_bmad-output"
active_initiative = "initiative-demo"
EOF
  # A user layer, so roster's central-config overlay ways are exercised: an
  # override of a roster agent (persona is not settled by the roster) and an
  # agent of the user's own (source "config", with the old `description`
  # spelling of the persona).
  cat >"$PROJ/_bmad/custom/config.toml" <<'EOF'
[agents.bmad-agent-analyst]
persona = "A custom persona the user prefers."

[agents.my-own-agent]
name = "My Own Agent"
title = "Hand-rolled"
description = "An old-style persona paragraph."
EOF
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

capture() {
  local name="$1" script="$2"; shift 2
  local python_args=() recorded=()
  while [ "$1" != "--" ]; do python_args+=("$1"); shift; done
  shift
  while [ "$#" -gt 0 ]; do recorded+=("$1"); shift; done
  local code stream captured
  set +e
  uv run "$script" "${python_args[@]}" >"$PROJ/.out" 2>"$PROJ/.err"
  code=$?
  set -e
  if [ "$code" -eq 0 ]; then stream=stdout; captured="$PROJ/.out"; else stream=stderr; captured="$PROJ/.err"; fi
  python3 - "$OUT/$name.json" "$code" "$stream" "$ROOT" "$WORKTREE" "$captured" "$script" "${recorded[@]}" <<'PY'
import json
import sys

out, code, stream, root, worktree, captured, script, *argv = sys.argv[1:]


def host_free(text: str) -> str:
    return text.replace(root, "/p").replace(worktree, "/p")


json.dump(
    {
        "python": host_free("uv run " + script + " " + " ".join(argv)),
        "stream": stream,
        "exitCode": int(code),
        "argv": [host_free(arg) for arg in argv],
        "stdout": host_free(open(captured, encoding="utf-8").read()),
    },
    open(out, "w", encoding="utf-8"),
    indent=2,
    ensure_ascii=False,
)
open(out, "a", encoding="utf-8").write("\n")
PY
}

seed

# ---- roster: the shape every roster call site writes.
#      --skill names an installed skill; the skills beside it are the root.
run roster-skill-project "$ROSTER" --skill "$ROOT/skills/bmad" --project-root "$ROOT"

# ---- roster: a root that is not there. The Python reports it as a problem in
#      the JSON (exit 0), not as an error.
run roster-missing-root "$ROSTER" --skill "$ROOT/nope/skills/bmad" --project-root "$ROOT"

# ---- knowledge: the ecosystem.md shape, one --root.
run knowledge-root "$KNOWLEDGE" --root "$ROOT/skills"

# ---- knowledge: the migrate.md shape (--skill-root with one --root per root)
#      and the bmad/SKILL.md shape (--skill-root --content with one --root per
#      active root). The flag is a Task 1 patch artifact; see the header.
run_ignored knowledge-skill-root "$KNOWLEDGE" --root "$ROOT/skills" :: --skill-root "$ROOT/skills/bmad" --root "$ROOT/skills"
run_ignored knowledge-skill-root-content "$KNOWLEDGE" --root "$ROOT/skills" --content :: --skill-root "$ROOT/skills/bmad" --content --root "$ROOT/skills"

# ---- knowledge: a root that is not there, beside one that is. The Python
#      reports the missing root as a problem and still reports the other.
run knowledge-missing-root "$KNOWLEDGE" --root "$ROOT/skills" --root "$ROOT/nope"

# ---- validate_manifests: a project without a skills/ tree — the error golden
#      the plan's Step 1 names: `--project-root` on a path that is not a module
#      repository (/tmp/golden-proj itself now carries the skills copy).
run validate-empty "$VALIDATE" --project-root "$ROOT/empty"

# ---- validate_manifests: the vendored tree is a module repository — the shape
#      the toolsmith call sites run it on.
run validate-repo "$VALIDATE" --project-root "$VENDOR"

# ---- validate_manifests: broken-repo/, a fixture with one problem of each
#      kind the checks raise.
run validate-broken "$VALIDATE" --project-root "$ROOT/broken-repo"

echo "captured $(ls "$OUT"/*.json | wc -l | tr -d ' ') goldens into $OUT"
