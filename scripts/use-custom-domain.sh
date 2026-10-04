#!/usr/bin/env bash
#
# Point the site at ade.ardata.tech, once DNS is actually ready.
#
# The order matters and is the whole reason this is a script. Committing
# docs/CNAME is itself how Pages adopts a custom domain, and from that moment
# the github.io URL redirects to the new one. Do it before DNS resolves and the
# site is dark until it does — so this refuses to run until the record answers.
#
#   ./scripts/use-custom-domain.sh --check   does DNS resolve yet, and nothing else
#   ./scripts/use-custom-domain.sh           make the switch
#
set -uo pipefail

DOMAIN="${DOMAIN:-ade.ardata.tech}"
TARGET="alvin-reyes.github.io"
REPO="alvin-reyes/better-agentic-ide"
OLD="https://alvin-reyes.github.io/better-agentic-ide"
NEW="https://$DOMAIN"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "  %s\n" "$*"; }
warn() { printf "  \033[33m%s\033[0m\n" "$*"; }
die()  { printf "  \033[31m%s\033[0m\n" "$*" >&2; exit 1; }

dns_ready() {
  local cname; cname=$(dig +short CNAME "$DOMAIN" 2>/dev/null | head -1)
  [ -n "$cname" ] && [[ "$cname" == *"$TARGET"* ]] && return 0
  # Some resolvers flatten the CNAME; accept an A record that matches Pages.
  local a; a=$(dig +short A "$DOMAIN" 2>/dev/null | head -1)
  [[ "$a" =~ ^185\.199\.(108|109|110|111)\.153$ ]]
}

check() {
  say "DNS"
  local cname a
  cname=$(dig +short CNAME "$DOMAIN" 2>/dev/null | head -1)
  a=$(dig +short A "$DOMAIN" 2>/dev/null | head -1)
  info "CNAME: ${cname:-<none>}"
  info "A:     ${a:-<none>}"
  if dns_ready; then info "resolves to GitHub Pages — ready"; return 0; fi
  warn "not ready yet"
  warn "  add at Namecheap › ardata.tech › Advanced DNS:"
  warn "    Type CNAME Record · Host ade · Value $TARGET. · TTL Automatic"
  warn "  (ardata.tech answers from registrar-servers.com, so Namecheap is the right place)"
  return 1
}

[ "${1:-}" = "--check" ] && { check; exit $?; }

check || die "refusing to switch: the site would go dark until DNS catches up"

cd "$ROOT"
[ -z "$(git status --porcelain)" ] || die "working tree is dirty; commit or stash first"

say "Switching to $DOMAIN"

# 1. The file that tells Pages to adopt the domain.
printf '%s\n' "$DOMAIN" > docs/CNAME
info "docs/CNAME"

# 2. A subdomain serves from the root, so baseurl must be empty or every
#    relative_url gains a dead /better-agentic-ide prefix.
python3 - "$DOMAIN" <<'PY'
import re, sys
domain = sys.argv[1]
p = "docs/_config.yml"; t = open(p).read()
t = re.sub(r'^url:.*$',     f'url: https://{domain}', t, count=1, flags=re.M)
t = re.sub(r'^baseurl:.*$', 'baseurl: ""', t, count=1, flags=re.M)
open(p, "w").write(t)
print("  _config.yml: url + baseurl")
PY

# 3. Absolute links that would otherwise bounce through a redirect forever.
n=0
while IFS= read -r f; do
  python3 - "$f" "$OLD" "$NEW" <<'PY'
import sys
f, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
t = open(f).read()
if old in t:
    open(f, "w").write(t.replace(old, new))
PY
  n=$((n+1))
done < <(grep -rl "$OLD" README.md docs/ 2>/dev/null)
info "rewrote absolute links in $n file(s)"

git add -A
git -c user.name=alvin-reyes -c user.email=areyesonl@gmail.com commit -q -m "Serve the site from $DOMAIN

docs/CNAME adopts the domain, baseurl is cleared because a subdomain
serves from the root rather than /better-agentic-ide, and the absolute
links follow so they stop bouncing through a redirect.

The old github.io URL keeps working: GitHub redirects it to the custom
domain, so existing links and the README badges survive."
git push -q origin main && info "pushed"

say "Waiting for Pages"
for i in $(seq 1 20); do
  s=$(gh run list --repo "$REPO" --workflow pages-build-deployment --limit 1 --json status,conclusion -q '.[0] | "\(.status) \(.conclusion // "")"' 2>/dev/null)
  case "$s" in completed\ success*) info "deployed"; break ;; completed*) die "pages failed: $s" ;; esac
  sleep 20
done

say "HTTPS"
# The certificate is issued after the domain verifies; enforcing before it
# exists just errors, so try and report rather than assume.
gh api -X PUT "repos/$REPO/pages" -f "cname=$DOMAIN" -F "https_enforced=true" >/dev/null 2>&1 \
  && info "enforced" || warn "not yet — GitHub is still issuing the certificate; enable it in Settings › Pages shortly"

say "Verify"
info "https://$DOMAIN -> $(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "https://$DOMAIN")"
info "old URL      -> $(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$OLD/")"
