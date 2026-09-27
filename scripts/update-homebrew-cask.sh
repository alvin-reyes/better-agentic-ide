#!/usr/bin/env bash
# Point a Homebrew cask at a published release: sets `version` and the two
# sha256 values from the release's .dmg digests.
#
#   scripts/update-homebrew-cask.sh 0.15.0 path/to/cask.rb
#
# Works for the tap's cask (homebrew-tap/Casks/*.rb) and for the draft in
# packaging/homebrew/better-terminal.rb. Needs curl and python3.
set -euo pipefail

VERSION="${1:?usage: $0 <version> <cask.rb>}"
CASK="${2:?usage: $0 <version> <cask.rb>}"
REPO="alvin-reyes/better-agentic-ide"

json=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/v${VERSION}")
digest() {
  printf '%s' "$json" | python3 -c '
import json, sys
name = sys.argv[1]
for a in json.load(sys.stdin).get("assets", []):
    if a["name"] == name:
        d = a.get("digest") or ""
        print(d.split(":", 1)[1] if d.startswith("sha256:") else "")
        break
' "$1"
}

ARM=$(digest "Better.Terminal_${VERSION}_aarch64.dmg")
INTEL=$(digest "Better.Terminal_${VERSION}_x64.dmg")
if [[ -z "$ARM" || -z "$INTEL" ]]; then
  echo "v${VERSION} is missing a macOS .dmg (or its digest). Is the release build finished?" >&2
  exit 1
fi

python3 - "$CASK" "$VERSION" "$ARM" "$INTEL" <<'PY'
import re, sys
path, version, arm, intel = sys.argv[1:]
s = open(path).read()
s = re.sub(r'version "[^"]*"', f'version "{version}"', s, count=1)
if "sha256 arm:" in s:
    s = re.sub(r'sha256 arm:\s*"[0-9a-f]+",\s*intel:\s*"[0-9a-f]+"',
               f'sha256 arm:   "{arm}",\n         intel: "{intel}"', s, count=1)
else:
    # Tap-style cask with on_arm / on_intel blocks.
    blocks = re.split(r'(on_arm do|on_intel do)', s)
    out, which = [], None
    for part in blocks:
        if part in ("on_arm do", "on_intel do"):
            which = arm if part == "on_arm do" else intel
            out.append(part)
            continue
        if which:
            part = re.sub(r'sha256 "[0-9a-f]+"', f'sha256 "{which}"', part, count=1)
            which = None
        out.append(part)
    s = "".join(out)
open(path, "w").write(s)
print(f"{path}: version {version}\n  arm   {arm}\n  intel {intel}")
PY
