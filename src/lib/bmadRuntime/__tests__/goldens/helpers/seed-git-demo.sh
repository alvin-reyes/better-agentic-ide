#!/usr/bin/env bash
# Build the pinned git fixture the git_evidence goldens are captured over, and
# the port's test rebuilds. Every ambient source git reads for settings or
# identity is shut out and every date pinned, so the commits are pure content
# and their shas are identical on any machine and any git version:
#
#   bash seed-git-demo.sh <dest>
#
# The history: a root commit, a story commit, a commit naming two stories, a
# feature branch merged with --no-ff (pass 2's merge churn), a binary revision
# (unmeasurable churn, counted as such) and a delete-only change. `<dest>` is
# created fresh.

set -euo pipefail

dest="$1"
rm -rf "$dest"
mkdir -p "$dest"
cd "$dest"

export GIT_AUTHOR_NAME=T GIT_AUTHOR_EMAIL=t@t
export GIT_COMMITTER_NAME=T GIT_COMMITTER_EMAIL=t@t
export GIT_CONFIG_NOSYSTEM=1 GIT_ATTR_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export HOME="$dest/.." XDG_CONFIG_HOME="$dest/.."
export LC_ALL=C LANG=C

commit() {  # commit <date> <message>
  GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -q -m "$2"
}

git init -q -b main
mkdir -p src docs

printf 'def parse(text):\n    return text.split()\n' >src/app.py
printf '# Demo\n\nA fixture repository.\n' >docs/README.md
git add -A
commit "2026-02-01T10:00:00Z" "chore: start the fixture repo"

printf 'def parse(text):\n    return text.split()\n\n\ndef render(items):\n    return " ".join(items)\n' >src/app.py
printf 'VERSION = "1"\n' >src/models.py
git add -A
commit "2026-02-02T10:00:00Z" "feat(story-1-1): add the renderer"

printf 'VERSION = "2"\nLIMIT = 10\n' >src/models.py
git add -A
commit "2026-02-03T10:00:00Z" "fix: share the parser (story-1-1, story-1-2)"

git checkout -q -b side
printf 'def audit(items):\n    return len(items)\n' >src/audit.py
git add -A
commit "2026-02-04T10:00:00Z" "feat(story-1-2): add the audit pass"
git checkout -q main
GIT_AUTHOR_DATE="2026-02-05T10:00:00Z" GIT_COMMITTER_DATE="2026-02-05T10:00:00Z" \
  git merge -q --no-ff -m "merge: bring the audit pass in (story-1-2)" side

printf '\x00\x01\x02binary\n' >docs/diagram.bin
git add -A
commit "2026-02-06T10:00:00Z" "chore: add the diagram binary"

git rm -q docs/README.md
commit "2026-02-07T10:00:00Z" "docs: drop the stale readme"
