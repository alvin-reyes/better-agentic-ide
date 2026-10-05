#!/usr/bin/env bash
# Stop hook: before Claude finishes, check the lines it added in this git
# repository for slop (rules in slop-patterns.tsv). Findings go back to Claude
# once (exit 2 + stderr); the next stop is let through, so it never loops.
# Turn it off with ADE_SLOP_CHECK=0.

input=$(cat)
[ "${ADE_SLOP_CHECK:-1}" = "0" ] && exit 0
# Already continued once because of this hook: let Claude stop.
printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$dir" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

here="$(cd "$(dirname "$0")" && pwd)"
rules="$here/slop-patterns.tsv"
[ -f "$rules" ] || exit 0

# Added lines: tracked changes against HEAD (staged or not), plus new files.
changes() {
  if git rev-parse --verify -q HEAD >/dev/null; then
    git diff HEAD --no-color --no-ext-diff -U0 2>/dev/null
  else
    git diff --cached --no-color --no-ext-diff -U0 2>/dev/null
  fi
  git ls-files --others --exclude-standard -z 2>/dev/null | while IFS= read -r -d '' f; do
    # Skip big and binary files.
    [ "$(wc -c <"$f" 2>/dev/null || echo 0)" -gt 200000 ] && continue
    grep -Iq . "$f" 2>/dev/null || continue
    printf '+++ b/%s\n' "$f"
    sed 's/^/+/' "$f"
  done
}

findings=$(changes | awk -v rules="$rules" '
  BEGIN {
    FS = "\t"; n = 0
    while ((getline line < rules) > 0) {
      if (line ~ /^#/ || line == "") continue
      split(line, f, "\t")
      n++; id[n] = f[1]; scope[n] = f[2]; pat[n] = f[3]; msg[n] = f[4]
    }
    FS = " "
  }
  /^\+\+\+ / {
    file = substr($0, 5); sub(/^b\//, "", file)
    docs = (file ~ /\.(md|mdx|txt|rst)$/)
    skip = (file ~ /(^|\/)(node_modules|vendor|dist|build|target|\.bmad-core)\// || file ~ /(^|\/)resources\/bmad\// || file ~ /(\.lock|lock\.json|\.min\.js|\.snap)$/ || file ~ /slop-patterns\.tsv$/)
    next
  }
  /^\+/ {
    if (skip || file == "") next
    text = substr($0, 2); low = tolower(text)
    for (i = 1; i <= n; i++) {
      if (scope[i] == "code" && docs) continue
      if (scope[i] == "docs" && !docs) continue
      if (low ~ pat[i]) {
        t = text; gsub(/^[ \t]+/, "", t); if (length(t) > 100) t = substr(t, 1, 100) "..."
        print file ": " msg[i] ": " t
        break
      }
    }
  }
' | head -n 25)

[ -z "$findings" ] && exit 0

{
  echo "Slop check (ADE plugin) found this in the lines you added:"
  echo "$findings"
  echo
  echo "Fix what is real: finish or remove stubs and TODOs, delete debug output and commented-out code, cut comments that restate the code, and use plain words in docs. If a finding is intended (a TODO the user asked for, a real log line), leave it and say so briefly."
} >&2
exit 2
