#!/usr/bin/env bash
# Golden capture for Task 5 — the render_skill.py and memlog.py ports.
#
# The brief's Step 1 named /tmp/bmad-v6 (the upstream checkout, whose markdown
# still carries `uv run` call sites) and /Users/alvin-reyes/.../src/... (the
# main checkout). Both are stale: the port renders the *vendored* tree, which
# Task 1 patched, so every capture here runs against
# src-tauri/resources/bmad-v6/skills/ — the same directory the tests pass as
# --skill. Re-running the script reproduces every captured byte except the one
# that is a clock reading: memlog-file.md's `updated:` stamp (the test moves it
# to the run's own minute, and pins its shape separately).
#
# Run from the worktree root:
#
#   bash src/lib/bmadRuntime/__tests__/goldens/render/capture.sh
#
# Seed: /tmp/golden-proj exactly as __tests__/fixtures/ticketTree.ts seeds memFs
# (`epics: [], stories: []`) — _bmad/config.toml naming the store, _bmad/custom/,
# the store folder with an empty tickets.toml — plus the pinned Python scripts in
# _bmad/scripts (render_skill.py imports config_utils.py from its own directory).
#
# render_skill.py rewriting: every captured byte has the physical project root
# rewritten to /p, so the goldens compare against the memFs fixtures. Three
# host- or version-specific parts are NOT rewritten, because only the Python can
# compute them and the port is allowed its own (documented in render.ts):
#   - the namespace segment `<slug>-<root-hash>` and the generation hash in the
#     published paths (sha256 of the capture root, of the Python file's bytes
#     and of jinja2's version);
#   - manifest inputs.renderer_sha256 and inputs.jinja2_version.
# The test normalizes the two path segments on both sides and skips those two
# manifest fields; everything else is compared byte for byte.
#
# memlog.py rewriting: the memlog path in the ack JSON is printed as it was
# passed in (Path() does not resolve symlinks), so the rewrite targets the /tmp
# spelling as well as the physical /private/tmp one. Its `updated:` timestamp is
# the capture's local minute; the test moves it to the run's own minute before
# comparing.

set -euo pipefail

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd)"
VENDOR="$WORKTREE/src-tauri/resources/bmad-v6"
SCRIPTS="$VENDOR/skills/bmad/scripts"
OUT="$WORKTREE/src/lib/bmadRuntime/__tests__/goldens/render"
MEM_OUT="$WORKTREE/src/lib/bmadRuntime/__tests__/goldens/memlog"
PROJ=/tmp/golden-proj

# _bmad/config.toml, _bmad/custom/, the store folder with an empty tickets.toml,
# and the Python scripts in _bmad/scripts.
seed() {
  rm -rf "$PROJ"
  mkdir -p "$PROJ/_bmad/custom" "$PROJ/_bmad/scripts" "$PROJ/_bmad-output/initiative-demo"
  cp "$SCRIPTS/config_utils.py" "$SCRIPTS/render_skill.py" "$SCRIPTS/memlog.py" "$PROJ/_bmad/scripts/"
  ROOT="$(cd "$PROJ" && pwd -P)"
  cat >"$PROJ/_bmad/config.toml" <<EOF
[core]
project_name = "p"
output_folder = "$ROOT/_bmad-output"
active_initiative = "initiative-demo"
EOF
  : >"$PROJ/_bmad-output/initiative-demo/tickets.toml"
}

# render_case <name> <skill> [args...]
#
# Runs render_skill.py against the vendored <skill>. The exit code lands in
# <name>.exit, stdout in <name>.stdout. On exit 0 the published generation is
# copied file by file to <name>/ (the destination path comes from the stdout
# line, so /tmp's symlink to /private/tmp cannot confuse it).
render_case() {
  local name="$1" skill="$2"; shift 2
  seed
  local code dest
  set +e
  uv run "$SCRIPTS/render_skill.py" --project-root "$PROJ" --skill "$VENDOR/skills/$skill" "$@" >"$PROJ/.out" 2>"$PROJ/.err"
  code=$?
  set -e
  echo "$code" >"$OUT/$name.exit"
  sed "s|$ROOT|/p|g" "$PROJ/.out" >"$OUT/$name.stdout"
  rm -rf "${OUT:?}/$name"
  if [ "$code" -eq 0 ]; then
    dest="$(dirname "$(sed -n 's|^read and follow ||p' "$PROJ/.out")")"
    (cd "$dest" && find . -type f | sed 's|^\./||' | LC_ALL=C sort) | while IFS= read -r f; do
      mkdir -p "$OUT/$name/$(dirname "$f")"
      sed "s|$ROOT|/p|g" "$dest/$f" >"$OUT/$name/$f"
    done
  fi
}

# memlog_case <name> <args...> — stdout on exit 0, stderr otherwise.
memlog_case() {
  local name="$1"; shift
  local code
  set +e
  uv run "$SCRIPTS/memlog.py" "$@" >"$PROJ/.out" 2>"$PROJ/.err"
  code=$?
  set -e
  echo "$code" >"$MEM_OUT/$name.exit"
  if [ "$code" -eq 0 ]; then
    sed -e "s|$PROJ|/p|g" -e "s|$ROOT|/p|g" "$PROJ/.out" >"$MEM_OUT/$name.json"
  else
    sed -e "s|$PROJ|/p|g" -e "s|$ROOT|/p|g" "$PROJ/.err" >"$MEM_OUT/$name.err"
  fi
}

# The portable line of a refusal whose output is more than one designed line:
# a traceback's tail, or argparse's error under its usage block (whose wrapping
# follows the terminal width, as Task 4 recorded for tickets.py). The port
# reproduces the line, not the block.
err_line() { # err_line <name>
  tail -n 1 "$MEM_OUT/$1.err" >"$MEM_OUT/$1.err.line"
  rm -f "$MEM_OUT/$1.err"
}

mkdir -p "$OUT" "$MEM_OUT"

# ---- render: the route=full generation — the judge for the templating subset.
# ---- Covers if/elif/else/endif, set, rendered() links, halt() guards, the
# ---- Markdown-list customizations (activation steps, persistent facts) and the
# ---- review lens list (step-04 carries the Quick lens: review defaults to
# ---- quick, which route=full does not change).
render_case build-full bmad-build --set workflow.route=full

# ---- render: the HALT shapes. `halt()` inside a template reports source:line;
# ---- an unknown --set names a customization parameter the skill does not
# ---- declare; an override no rendered template reads is a caller mistake, not
# ---- a value, and halts too. (`route_selection` is read only in step-02's
# ---- auto-route branch, so naming it beside route=full leaves it unread.)
render_case build-bogus-route bmad-build --set workflow.route=bogus
render_case build-unknown-set bmad-build --set workflow.selector=nope
render_case build-unused-set bmad-build --set workflow.route=full --set workflow.route_selection=choose-it

# ---- render: an undeclared key in the project's persistent override layer.
seed
cat >"$PROJ/_bmad/custom/bmad-build.toml" <<'EOF'
[workflow]
on_compleet = "typo"
EOF
set +e
uv run "$SCRIPTS/render_skill.py" --project-root "$PROJ" --skill "$VENDOR/skills/bmad-build" >"$PROJ/.out" 2>"$PROJ/.err"
code=$?
set -e
echo "$code" >"$OUT/build-undeclared-custom.exit"
sed "s|$ROOT|/p|g" "$PROJ/.out" >"$OUT/build-undeclared-custom.stdout"

# ---- render: a second skill, with no --set at all. Covers {% raw %} (the
# ---- review-log template keeps its {{placeholders}}) and the `default` filter
# ---- with its boolean argument.
render_case walkthrough bmad-walkthrough

# ---- render: a generation that lost one of its rendered files refuses to be
# ---- reused. Render, delete an output, render again: the second run is the
# ---- golden (its message names the generation, which the test normalizes).
seed
set +e
uv run "$SCRIPTS/render_skill.py" --project-root "$PROJ" --skill "$VENDOR/skills/bmad-build" --set workflow.route=full >"$PROJ/.out" 2>"$PROJ/.err"
LOST="$(dirname "$(sed -n 's|^read and follow ||p' "$PROJ/.out")")"
rm "$LOST/step-01-clarify-and-route.md"
uv run "$SCRIPTS/render_skill.py" --project-root "$PROJ" --skill "$VENDOR/skills/bmad-build" --set workflow.route=full >"$PROJ/.out" 2>"$PROJ/.err"
code=$?
set -e
echo "$code" >"$OUT/build-missing-output.exit"
sed "s|$ROOT|/p|g" "$PROJ/.out" >"$OUT/build-missing-output.stdout"

# ---- render: the two ways a project is not set up for a render. Both refuse
# ---- with a HALT line; the port names the same missing thing in its own words
# ---- (Task 4's ruling for a missing config, which it takes from Task 3), so the
# ---- tests assert the shape against these goldens, not the bytes.
rm -rf "$PROJ"
mkdir -p "$PROJ/_bmad/custom"
ROOT="$(cd "$PROJ" && pwd -P)"
set +e
uv run "$SCRIPTS/render_skill.py" --project-root "$PROJ" --skill "$VENDOR/skills/bmad-build" >"$PROJ/.out" 2>"$PROJ/.err"
code=$?
set -e
echo "$code" >"$OUT/build-unconfigured.exit"
sed "s|$ROOT|/p|g" "$PROJ/.out" >"$OUT/build-unconfigured.stdout"

seed
set +e
uv run "$SCRIPTS/render_skill.py" --project-root "$PROJ" --skill "$VENDOR/skills/bmad-nope" >"$PROJ/.out" 2>"$PROJ/.err"
code=$?
set -e
echo "$code" >"$OUT/build-missing-skill.exit"
sed -e "s|$VENDOR|/vendor|g" -e "s|$ROOT|/p|g" "$PROJ/.out" >"$OUT/build-missing-skill.stdout"

# ---- memlog: the tool's whole surface against one workspace.
seed
mkdir -p "$PROJ/ws"
memlog_case memlog-init init --workspace "$PROJ/ws" --field "topic=Onboarding flow"
memlog_case memlog-init-exists init --workspace "$PROJ/ws"
memlog_case memlog-append append --workspace "$PROJ/ws" --type decision --text "lead with one account"
memlog_case memlog-append-tagged append --workspace "$PROJ/ws" --type idea --by user --text "try sample data first"
memlog_case memlog-set set --workspace "$PROJ/ws" --key goal --value "lift week-1 retention"
sed -e "s|$PROJ|/p|g" -e "s|$ROOT|/p|g" "$PROJ/ws/.memlog.md" >"$MEM_OUT/memlog-file.md"

# ---- memlog: the error shapes. A missing log and a log whose frontmatter never
# ---- opened are the Python's own exception line (the tail of its traceback),
# ---- exit 1; the usage refusals are argparse's error line, exit 2.
memlog_case memlog-append-missing append --path "$PROJ/ws/none/.memlog.md" --text x
mkdir -p "$PROJ/ws/malformed"
printf 'no frontmatter here\n' >"$PROJ/ws/malformed/.memlog.md"
memlog_case memlog-append-malformed append --path "$PROJ/ws/malformed/.memlog.md" --text x
memlog_case memlog-append-no-text append --workspace "$PROJ/ws"
memlog_case memlog-no-target append --text x

for name in memlog-append-missing memlog-append-malformed memlog-append-no-text memlog-no-target; do
  err_line "$name"
done

echo "captured $(find "$OUT" -type f | wc -l | tr -d ' ') render files into $OUT"
echo "captured $(ls "$MEM_OUT" | wc -l | tr -d ' ') memlog files into $MEM_OUT"
