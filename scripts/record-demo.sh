#!/usr/bin/env bash
#
# Record the launch-film clips by driving ADE and capturing the screen.
#
# Shoots one clip per shot rather than one continuous take, because driving a
# GUI blind is unreliable: a clip that goes wrong is reshot on its own with
# `--only`, and a still is saved either side of every take so a bad one is
# obvious without scrubbing video.
#
# Needs two macOS permissions, both for the app that runs this shell
# (System Settings › Privacy & Security):
#   • Screen & System Audio Recording  — to capture at all
#   • Accessibility                    — to send keystrokes to ADE
# macOS applies neither until that app is quit and reopened.
#
#   ./scripts/record-demo.sh --check          what is missing, and nothing else
#   ./scripts/record-demo.sh --list           the shots
#   ./scripts/record-demo.sh                  all of them
#   ./scripts/record-demo.sh --only fleet     reshoot one
#
set -uo pipefail

OUT="${OUT:-$HOME/Desktop/ade-film}"
APP="Better Terminal"      # for `tell application` (activate)
PROC="better-terminal"     # what System Events calls it
STILLS="$OUT/stills"

say()  { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "  %s\n" "$*"; }
warn() { printf "  \033[33m%s\033[0m\n" "$*"; }
die()  { printf "  \033[31m%s\033[0m\n" "$*" >&2; exit 1; }

# --- the shots -------------------------------------------------------------
# name|seconds|description|keystrokes, one per line, run after capture starts
#
# A keystroke line is either  key:<char>:<modifiers>  or  wait:<seconds>
# Modifiers are comma separated: command, shift, option, control.
shots() {
  cat <<'SHOTS'
splits|14|Panes filling with parallel agents
wait:2
key:d:command
wait:3
key:d:command,shift
wait:3
---
picker|12|Agent picker, roles, provider cycle
wait:1
key:a:command,shift
wait:3
key:Tab:
wait:2
key:Tab:
wait:3
---
fleet|12|Fleet timeline with costs
wait:1
key:.:command
wait:9
---
setup|12|Project setup and the .ade tree
wait:1
key:b:command
wait:9
---
knowledge|9|The knowledge store, committed
wait:8
---
contracts|14|Contracts panel: build, test, analyse
wait:1
key:k:command,shift
wait:11
---
tokens|9|Tokens panel, spend and cache savings
wait:1
key:g:command,shift
wait:6
---
wide|10|The whole app, every pane alive
wait:8
SHOTS
}

# --- preflight -------------------------------------------------------------
preflight() {
  local bad=0
  say "Preflight"

  command -v screencapture >/dev/null || { die "screencapture missing (macOS only)"; }
  command -v ffmpeg >/dev/null || warn "ffmpeg missing — clips will not be cropped to the window"

  # Screen recording: the only reliable test is to try it.
  local probe="/tmp/ade-rec-probe.$$.mov"
  rm -f "$probe"
  screencapture -v -V 2 -x "$probe" >/dev/null 2>&1 &
  local p=$!; sleep 4; kill -INT $p 2>/dev/null; wait $p 2>/dev/null
  if [ -s "$probe" ]; then info "screen recording: granted"; else
    warn "screen recording: DENIED"
    warn "  enable this terminal under Privacy & Security › Screen & System Audio Recording,"
    warn "  then quit it completely and reopen — macOS ignores the change until you do"
    bad=1
  fi
  rm -f "$probe"

  # Accessibility. Naming the frontmost process does NOT need assistive access,
  # so testing that gives a false pass; querying a window does need it, and
  # fails with -25211 when it is missing. Test the thing we actually rely on.
  local ax
  ax=$(osascript -e 'tell application "System Events" to tell process "Finder" to return count of windows' 2>&1)
  if [[ "$ax" =~ ^-?[0-9]+$ ]]; then
    info "accessibility: granted"
  else
    warn "accessibility: DENIED — cannot send keystrokes or read window bounds"
    warn "  enable this terminal under Privacy & Security › Accessibility, then quit and reopen it"
    warn "  without it, record while you drive the app yourself (see --manual)"
    bad=1
  fi

  if pgrep -qf "$PROC"; then info "$APP: running"; else
    warn "$APP: not running — open it before recording"; bad=1
  fi

  # The script sells features that only exist in 0.18.0.
  local v
  v=$(python3 - <<'PY' 2>/dev/null
import plistlib
try:
    print(plistlib.load(open('/Applications/Better Terminal.app/Contents/Info.plist','rb'))
          .get('CFBundleShortVersionString','?'))
except Exception:
    print('?')
PY
)
  case "$v" in
    0.18.*|0.19.*|[1-9].*) info "version: $v" ;;
    *) warn "version: $v — the script's roles, knowledge store and BMAD shots need 0.18.0" ;;
  esac

  return $bad
}

# --- helpers ---------------------------------------------------------------
focus_app() { osascript -e "tell application \"$APP\" to activate" >/dev/null 2>&1; sleep 1; }

send_key() { # $1 key, $2 comma-separated modifiers
  local key="$1" mods="${2:-}" using=""
  if [ -n "$mods" ]; then
    local parts=() m
    IFS=',' read -ra parts <<< "$mods"
    for m in "${parts[@]}"; do using+="$m down, "; done
    using=" using {${using%, }}"
  fi
  if [ ${#key} -eq 1 ]; then
    osascript -e "tell application \"System Events\" to keystroke \"$key\"$using" >/dev/null 2>&1
  else
    # Named keys go through key code; Tab is the only one the shots use.
    case "$key" in
      Tab) osascript -e "tell application \"System Events\" to key code 48$using" >/dev/null 2>&1 ;;
      *)   warn "unknown key: $key" ;;
    esac
  fi
}

window_crop() { # prints WxH+X+Y for the app window, or nothing
  osascript <<EOF 2>/dev/null
tell application "System Events" to tell process "$PROC"
  if (count of windows) = 0 then return ""
  set p to position of window 1
  set s to size of window 1
  return ((item 1 of s) as text) & "x" & ((item 2 of s) as text) & "+" & ((item 1 of p) as text) & "+" & ((item 2 of p) as text)
end tell
EOF
}

record_shot() { # $1 name, $2 seconds, $3 description, $4 actions blob
  local name="$1" secs="$2" desc="$3" actions="$4"
  local raw="$OUT/raw-$name.mov" final="$OUT/$name.mov"

  say "● $name — $desc (${secs}s)"
  focus_app
  screencapture -x "$STILLS/$name-before.png" >/dev/null 2>&1

  rm -f "$raw"
  screencapture -v -x "$raw" >/dev/null 2>&1 &
  local cap=$!
  sleep 1.5   # let the recorder settle before anything moves

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      wait:*) sleep "${line#wait:}" ;;
      key:*)  local rest="${line#key:}"; send_key "${rest%%:*}" "${rest#*:}" ;;
    esac
  done <<< "$actions"

  sleep 1
  kill -INT $cap 2>/dev/null; wait $cap 2>/dev/null
  sleep 1
  screencapture -x "$STILLS/$name-after.png" >/dev/null 2>&1

  [ -s "$raw" ] || { warn "no footage captured"; return 1; }

  local crop; crop=$(window_crop)
  if [ -n "$crop" ] && command -v ffmpeg >/dev/null; then
    local wh="${crop%%+*}" xy="${crop#*+}"
    ffmpeg -y -loglevel error -i "$raw" \
      -vf "crop=${wh%x*}:${wh#*x}:${xy%%+*}:${xy#*+}" -c:v libx264 -crf 18 -preset slow "$final" \
      && rm -f "$raw" && info "cropped to the window → $(basename "$final")"
  else
    mv "$raw" "$final"; info "full screen → $(basename "$final")"
  fi
  info "stills: $name-before.png, $name-after.png"
}

# --- main ------------------------------------------------------------------
ONLY=""
case "${1:-}" in
  --check) preflight; exit $? ;;
  --manual)
    # Capture only: you drive ADE, this records and crops. Needs screen
    # recording; needs nothing else.
    secs="${2:-20}"
    mkdir -p "$OUT"
    say "Recording ${secs}s — drive ADE now"
    warn "Everything on screen is captured."
    for i in 3 2 1; do printf "  %s...\r" "$i"; sleep 1; done; echo
    raw="$OUT/manual-$(date +%H%M%S).mov"
    screencapture -v -V "$secs" -x "$raw" >/dev/null 2>&1
    [ -s "$raw" ] && info "saved $(basename "$raw") ($(du -h "$raw" | cut -f1))" || die "nothing captured"
    exit 0 ;;
  --list)  shots | grep -vE '^(wait|key|---)' | awk -F'|' '{printf "  %-12s %3ss  %s\n", $1, $2, $3}'; exit 0 ;;
  --only)  ONLY="${2:-}"; [ -n "$ONLY" ] || die "--only needs a shot name" ;;
  "")      ;;
  *)       die "unknown option: $1" ;;
esac

preflight || die "fix the above, then run again"
mkdir -p "$STILLS"
say "Recording into $OUT"
warn "Everything on screen is captured. Close anything private; silence notifications."
sleep 3

buf=""; name=""; secs=""; desc=""
flush() {
  [ -z "$name" ] && return 0
  if [ -z "$ONLY" ] || [ "$ONLY" = "$name" ]; then record_shot "$name" "$secs" "$desc" "$buf"; fi
  buf=""; name=""
}
while IFS= read -r line; do
  case "$line" in
    ---) flush ;;
    wait:*|key:*) buf+="$line"$'\n' ;;
    *) flush; IFS='|' read -r name secs desc <<< "$line" ;;
  esac
done < <(shots)
flush

say "Done"
info "Clips and stills are in $OUT"
info "Check every -after.png before you cut: a shot that did nothing looks identical to one that worked."
