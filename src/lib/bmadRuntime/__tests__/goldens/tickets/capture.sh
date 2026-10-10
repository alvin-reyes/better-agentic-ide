#!/usr/bin/env bash
# Golden capture for Task 4 — the ticket tree port (tickets.py + read_store.py).
#
# Every file in this directory comes from the pinned Python at
# src-tauri/resources/bmad-v6/skills/bmad-ticket/scripts/ (byte-identical to the
# /tmp/bmad-v6 copy this task's brief names). Run from the worktree root:
#
#   bash src/lib/bmadRuntime/__tests__/goldens/tickets/capture.sh
#
# For each capture a fresh tree is seeded under /tmp/golden-proj (the seed is
# exactly what __tests__/fixtures/ticketTree.ts writes into memFs), the command
# runs, and:
#   - exit 0: stdout lands in <name>.json
#   - exit != 0: stderr lands in <name>.json (the Python prints its error JSON there)
#   - the exit code always lands in <name>.exit
# The physical project root is rewritten to "/p" on the way out, so the goldens
# are host-independent and comparable with the memFs fixtures under "/p".
#
# The ticket paths in the invocation: /tmp/golden-proj is a symlink target on
# macOS, so ROOT is the physical path (pwd -P); the Python resolves symlinks.

set -euo pipefail

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd)"
VENDOR="$WORKTREE/src-tauri/resources/bmad-v6"
TICKETS="$VENDOR/skills/bmad-ticket/scripts/tickets.py"
READ_STORE="$VENDOR/skills/bmad-ticket/scripts/read_store.py"
STARTERS="$VENDOR/skills/bmad-ticket/config"
OUT="$WORKTREE/src/lib/bmadRuntime/__tests__/goldens/tickets"
PROJ=/tmp/golden-proj

run() { # run <name> <script> <args...>
  local name="$1" script="$2"; shift 2
  local code
  set +e
  uv run "$script" "$@" >"$PROJ/.out" 2>"$PROJ/.err"
  code=$?
  set -e
  echo "$code" >"$OUT/$name.exit"
  if [ "$code" -eq 0 ]; then
    sed "s|$ROOT|/p|g" "$PROJ/.out" >"$OUT/$name.json"
  else
    sed "s|$ROOT|/p|g" "$PROJ/.err" >"$OUT/$name.json"
  fi
}

seed_base() { # _bmad/config.toml, _bmad/custom/, the store folder, an empty tickets.toml
  rm -rf "$PROJ"
  mkdir -p "$PROJ/_bmad/custom" "$PROJ/_bmad/scripts" "$PROJ/_bmad-output/initiative-demo"
  cp "$VENDOR/skills/bmad/scripts/config_utils.py" "$PROJ/_bmad/scripts/config_utils.py"
  ROOT="$(cd "$PROJ" && pwd -P)"
  cat >"$PROJ/_bmad/config.toml" <<EOF
[core]
project_name = "p"
output_folder = "$ROOT/_bmad-output"
active_initiative = "initiative-demo"
EOF
  : >"$PROJ/_bmad-output/initiative-demo/tickets.toml"
}

seed_unseeded() { # _bmad/scripts only: no config.toml, no store
  rm -rf "$PROJ"
  mkdir -p "$PROJ/_bmad/scripts"
  cp "$VENDOR/skills/bmad/scripts/config_utils.py" "$PROJ/_bmad/scripts/config_utils.py"
  ROOT="$(cd "$PROJ" && pwd -P)"
}

seed_epic() { # seed_base + initiative lists epic-demo; epic holds entry 1 with leaf and plan
  seed_base
  local store="$ROOT/_bmad-output/initiative-demo"
  mkdir -p "$store/epic-demo"
  cat >"$store/tickets.toml" <<'EOF'
[[epic]]
id = 1
slug = "demo"
title = "Demo"
EOF
  cat >"$store/epic-demo/tickets.toml" <<'EOF'
[[entry]]
id = 1
type = "story"
title = "Demo story"
EOF
  cat >"$store/epic-demo/epic-demo.md" <<'EOF'
---
type: epic
---
# Demo
EOF
  cat >"$store/epic-demo/story-1.md" <<'EOF'
---
id: 1
type: story
title: "Demo story"
parent: epic-demo
---
# Demo story

## Acceptance Criteria
- AC1
EOF
  cat >"$store/epic-demo/story-1-plan.md" <<'EOF'
---
ticket: 1
status: draft
---
# Plan
EOF
}

seed_epic_second() { # seed_epic + entry 2 with no leaf file and no plan
  seed_epic
  cat >>"$ROOT/_bmad-output/initiative-demo/epic-demo/tickets.toml" <<'EOF'

[[entry]]
id = 2
type = "story"
title = "Second"
description = "The second thing."
verify = "It works."
covers = ["R1"]
after = [1]
hitl = true
risk = "low"
estimate = 2
refine = true
unknown = "Which host?"
references = ["SPINE.md#ad-8"]
notes = ["Reuse the mailer."]
EOF
}

seed_after_missing() { # seed_epic + entry 2 whose after names no entry: [9]
  seed_epic
  cat >>"$ROOT/_bmad-output/initiative-demo/epic-demo/tickets.toml" <<'EOF'

[[entry]]
id = 2
type = "story"
title = "Second"
after = [9]
EOF
}

seed_tracker() { # seed_epic + a project store config naming the jira store
  seed_epic
  cat >"$PROJ/_bmad/custom/ticketing-store-config.toml" <<'EOF'
[tickets]
store = "jira"
EOF
}

EPIC='' # per-seed epic folder, set by the seed helpers at call time

# ---- next, on a configured but empty tree (matches seedTicketTree "/p" epics:[], stories:[])
seed_base
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run next-empty "$TICKETS" --project-root "$ROOT" next

# ---- next, with no _bmad/config.toml at all (a refusal, captured as stderr)
seed_unseeded
run next-unseeded-refusal "$TICKETS" --project-root "$ROOT" next

# ---- status, on the seeded tree
seed_epic
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run status-seeded "$TICKETS" --project-root "$ROOT" status

# ---- next, on the seeded tree
seed_epic
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run next-seeded "$TICKETS" --project-root "$ROOT" next

# ---- find, of entry 1 in its epic folder
seed_epic
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run find-entry "$TICKETS" --project-root "$ROOT" find "$EPIC" 1

# ---- pull, of entry 2 (which the seed gives no leaf file): the response, the
# ---- leaf it wrote, and the find that now names it
seed_epic_second
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run pull "$TICKETS" --project-root "$ROOT" pull "$EPIC" 2
sed "s|$ROOT|/p|g" "$EPIC/story-second.md" >"$OUT/pull-leaf.md"
run find-pulled "$TICKETS" --project-root "$ROOT" find "$EPIC" 2

# ---- mark 1 done, on the seeded tree: the plan it joins is edited
seed_epic
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run mark-done "$TICKETS" --project-root "$ROOT" mark "$EPIC" 1 done

# ---- mark, on an entry with no plan: one is created, then read back
seed_epic_second
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run mark-created "$TICKETS" --project-root "$ROOT" mark "$EPIC" 2 blocked --blocked "legal"
sed "s|$ROOT|/p|g" "$EPIC/story-second-plan.md" >"$OUT/mark-created-plan.md"

# ---- an after that names no entry is refused
seed_after_missing
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run after-missing-entry "$TICKETS" --project-root "$ROOT" status

# ---- a tracker store refuses next without --synced
seed_tracker
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run tracker-store-refusal "$TICKETS" --project-root "$ROOT" next

# ---- read_store: the merged tickets table, and the shipped starters
seed_epic
EPIC="$ROOT/_bmad-output/initiative-demo/epic-demo"
run read-store-tickets "$READ_STORE" --project-root "$ROOT" -k tickets
run read-store-starters "$READ_STORE" --starters --starters-dir "$STARTERS"

echo "captured $(ls "$OUT" | grep -c '\.json$') goldens into $OUT"
