#!/usr/bin/env bash
# Re-vendor BMAD v6 skills. Manual step, same policy as v4's vendoring.
# Pinned to a fixed upstream commit: the v6 tags carry the old layout, and
# `--branch <sha>` does not work on clone, so clone main and check out.
set -euo pipefail
SHA="${1:-bda3c59}"
LABEL="${2:-6.13.0-next}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src-tauri/resources/bmad-v6"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet https://github.com/bmad-code-org/BMAD-METHOD "$TMP/bmad"
git -C "$TMP/bmad" checkout --quiet "$SHA"
mkdir -p "$DEST"
rm -rf "$DEST/skills"
cp -R "$TMP/bmad/skills" "$DEST/skills"
echo "$SHA $LABEL" > "$DEST/VERSION"

npx tsx "$ROOT/scripts/patchBmadSkills.ts" "$DEST/skills"
cd "$ROOT" && npx vitest run scripts/__tests__/patchBmadSkills.test.ts
echo "vendored $SHA ($LABEL) at $DEST"
