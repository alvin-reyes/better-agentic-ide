#!/usr/bin/env bash
#
# Install ADE.
#
#   curl -fsSL https://ade.ardata.tech/install.sh | bash
#
# Options (pass after `-s --` when piping, e.g. `| bash -s -- --deb`):
#   --version vX.Y.Z   install a specific release instead of the latest
#   --deb              Linux: install the .deb with dpkg instead of the AppImage
#   --dir PATH         Linux: where to put the AppImage (default ~/.local/bin)
#   --dry-run          resolve and verify the download, then stop before installing
#   --help             print this and exit
#
# It installs to a user-writable location and never calls sudo on its own. The
# one exception is --deb, which cannot work without it, and which says so first.
#
set -euo pipefail

REPO="alvin-reyes/better-agentic-ide"
API="https://api.github.com/repos/$REPO/releases"
VERSION=""
FORMAT="appimage"
BINDIR="${HOME}/.local/bin"
DRY=0

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "  %s\n" "$*"; }
warn() { printf "  \033[33m%s\033[0m\n" "$*"; }
die()  { printf "  \033[31m%s\033[0m\n" "$*" >&2; exit 1; }

usage() { sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 || die "--version needs a tag" ;;
    --deb)     FORMAT="deb"; shift ;;
    --dry-run) DRY=1; shift ;;
    --dir)     BINDIR="${2:-}"; shift 2 || die "--dir needs a path" ;;
    --help|-h) usage ;;
    *)         die "unknown option: $1 (try --help)" ;;
  esac
done

for cmd in curl uname mktemp; do
  command -v "$cmd" >/dev/null || die "$cmd is required and was not found"
done

# --- what are we on? -------------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64|aarch64) PATTERN="aarch64.dmg"; LABEL="macOS (Apple Silicon)" ;;
      x86_64)        PATTERN="x64.dmg";     LABEL="macOS (Intel)" ;;
      *) die "unsupported macOS architecture: $ARCH" ;;
    esac
    ;;
  Linux)
    [ "$ARCH" = "x86_64" ] || die \
      "Linux builds are x86_64 only; $ARCH is not published yet. Build from source: https://github.com/$REPO"
    if [ "$FORMAT" = "deb" ]; then PATTERN="amd64.deb"; LABEL="Linux (.deb)"
    else PATTERN="amd64.AppImage"; LABEL="Linux (AppImage)"; fi
    ;;
  *)
    die "unsupported platform: $OS. Windows support is not ready yet."
    ;;
esac

bold "ADE installer"
info "platform: $LABEL"

# --- which release? --------------------------------------------------------
if [ -n "$VERSION" ]; then
  META_URL="$API/tags/$VERSION"
else
  META_URL="$API/latest"
fi

META="$(curl -fsSL "$META_URL" 2>/dev/null)" || die "could not reach the GitHub release API"
TAG="$(printf '%s' "$META" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$TAG" ] || die "no release found${VERSION:+ for $VERSION}"
info "version:  $TAG"

# Pick the asset whose name ends with the pattern for this platform.
URL="$(printf '%s' "$META" \
  | tr ',' '\n' \
  | sed -n 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  | grep -- "$PATTERN$" | head -1 || true)"
[ -n "$URL" ] || die "this release has no $PATTERN asset"

SUMS_URL="$(printf '%s' "$META" \
  | tr ',' '\n' \
  | sed -n 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  | grep -- 'SHA256SUMS$' | head -1 || true)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FILE="$TMP/$(basename "$URL")"

bold "Downloading"
info "$(basename "$URL")"
curl -fL --progress-bar "$URL" -o "$FILE" || die "download failed"

# --- verify ----------------------------------------------------------------
bold "Verifying"
if [ -n "$SUMS_URL" ]; then
  curl -fsSL "$SUMS_URL" -o "$TMP/SHA256SUMS" || die "could not fetch SHA256SUMS"
  if command -v sha256sum >/dev/null; then HAVE="$(sha256sum "$FILE" | cut -d' ' -f1)"
  elif command -v shasum >/dev/null;   then HAVE="$(shasum -a 256 "$FILE" | cut -d' ' -f1)"
  else HAVE=""; fi
  if [ -z "$HAVE" ]; then
    warn "no sha256 tool found; cannot verify"
  else
    WANT="$(grep -- "$(basename "$URL")\$" "$TMP/SHA256SUMS" | cut -d' ' -f1 | head -1 || true)"
    [ -n "$WANT" ] || die "SHA256SUMS has no entry for $(basename "$URL")"
    [ "$HAVE" = "$WANT" ] || die "checksum mismatch — refusing to install. Expected $WANT, got $HAVE"
    info "sha256 matches"
  fi
else
  warn "this release publishes no SHA256SUMS, so the download cannot be verified"
  warn "beyond HTTPS. Checksums are published from the next release onward."
fi

# --- install ---------------------------------------------------------------
if [ "$DRY" = "1" ]; then
  bold "Dry run"
  info "would install $(basename "$URL") ($TAG) for $LABEL"
  info "nothing was changed"
  exit 0
fi

bold "Installing"
case "$OS" in
  Darwin)
    MOUNT="$(mktemp -d)"
    hdiutil attach -nobrowse -quiet -mountpoint "$MOUNT" "$FILE" \
      || die "could not mount the disk image"
    # shellcheck disable=SC2064
    trap "hdiutil detach '$MOUNT' -quiet >/dev/null 2>&1 || true; rm -rf '$TMP' '$MOUNT'" EXIT

    APP="$(find "$MOUNT" -maxdepth 1 -name '*.app' -print -quit)"
    [ -n "$APP" ] || die "no .app inside the disk image"

    DEST="/Applications"
    [ -w "$DEST" ] || DEST="$HOME/Applications"
    mkdir -p "$DEST"
    NAME="$(basename "$APP")"

    if [ -e "${DEST:?}/${NAME:?}" ]; then
      info "replacing the existing $NAME in $DEST"
      rm -rf "${DEST:?}/${NAME:?}"
    fi
    cp -R "$APP" "$DEST/" || die "could not copy into $DEST"
    info "installed to $DEST/$NAME"

    # These builds are ad-hoc signed, not notarised by Apple, so Gatekeeper
    # quarantines anything downloaded and the app refuses to open. Clearing the
    # flag on the copy just installed is what makes it launchable. Said out
    # loud rather than done quietly, because it is a real trade-off.
    if xattr -dr com.apple.quarantine "$DEST/$NAME" 2>/dev/null; then
      warn "cleared the quarantine flag: these builds are ad-hoc signed, not"
      warn "notarised by Apple, so macOS would otherwise refuse to open them."
    fi
    bold "Done"
    info "open -a \"${NAME%.app}\""
    ;;

  Linux)
    if [ "$FORMAT" = "deb" ]; then
      command -v dpkg >/dev/null || die "dpkg not found; use the AppImage instead"
      warn "installing a .deb needs root; you will be asked for your password."
      sudo dpkg -i "$FILE" || die "dpkg failed"
      bold "Done"
      info "run: better-terminal"
    else
      mkdir -p "$BINDIR"
      TARGET="$BINDIR/ade"
      install -m 0755 "$FILE" "$TARGET" 2>/dev/null || { cp "$FILE" "$TARGET"; chmod 0755 "$TARGET"; }
      info "installed to $TARGET"
      case ":$PATH:" in
        *":$BINDIR:"*) ;;
        *) warn "$BINDIR is not on your PATH; add it to your shell profile:"
           warn "  export PATH=\"$BINDIR:\$PATH\"" ;;
      esac
      command -v fuse >/dev/null 2>&1 || [ -e /dev/fuse ] || \
        warn "AppImages need FUSE. If it will not start, run it with --appimage-extract-and-run."
      bold "Done"
      info "run: ade"
    fi
    ;;
esac
