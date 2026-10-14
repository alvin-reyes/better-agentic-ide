#!/usr/bin/env bash
# Agent status, checked against the real Claude Code. Run before a release;
# put its output and the version it prints in the story's Verification.
#
# It builds the helper, copies it to a path with a space in it (as the app
# installs: "Better Terminal.app"), has ADE's own code (the toggle's
# `agent_hooks_enable`) write its hook entries into a scratch project's
# .claude/settings.local.json, and listens on 127.0.0.1 the way
# ADE's endpoint does. Then it starts Claude Code there in a pty, asks for one
# command that needs approval and answers "Yes, and don't ask again". It
# asserts that:
#   - the events arrive at the endpoint, with the PTY id and the token;
#   - no hook error and no settings error shows on screen;
#   - ADE's `hooks` survive Claude Code's own write to the file.
#
# Needs: claude (logged in), cargo, python3. It spends a few Haiku requests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ade-agent-status.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "Claude Code: $(claude --version)"
cargo build --quiet --manifest-path "$ROOT/src-tauri/Cargo.toml" -p ade-hook
mkdir -p "$WORK/Better Terminal.app/Contents/MacOS" "$WORK/proj/.claude"
HELPER="$WORK/Better Terminal.app/Contents/MacOS/ade-hook"
cp "$ROOT/src-tauri/target/debug/ade-hook" "$HELPER"
git -C "$WORK/proj" init -q
# ADE's own code writes the hook entries, as the Agent status toggle does.
ADE_CHECK_PROJECT="$WORK/proj" cargo test --quiet --manifest-path "$ROOT/src-tauri/Cargo.toml" --lib \
  -- --ignored --exact usage::tests::enable_agent_hooks_for_the_check_script >/dev/null

python3 - "$WORK" "$HELPER" <<'PY'
import json, os, pty, re, select, sys, threading, time, secrets
from http.server import BaseHTTPRequestHandler, HTTPServer

work, helper = sys.argv[1], sys.argv[2]
proj = os.path.join(work, "proj")
settings = os.path.join(proj, ".claude", "settings.local.json")
EVENTS = ["SessionStart", "UserPromptSubmit", "PermissionRequest", "PostToolUse", "PostToolUseFailure",
          "Notification", "SubagentStart", "SubagentStop", "Stop", "SessionEnd"]
ADE_HOOK = {"type": "command", "command": '"${ADE_HOOK_BIN:-true}"', "timeout": 5}
written = json.load(open(settings))
if sorted(written.get("hooks", {})) != sorted(EVENTS) or any(written["hooks"][e] != [{"hooks": [ADE_HOOK]}] for e in EVENTS):
    sys.exit(f"FAIL: ADE wrote unexpected hooks: {json.dumps(written)}")

token, pty_id, got = secrets.token_hex(32), "41", []

class Endpoint(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.headers.get("X-ADE-Token") == token and self.headers.get("X-ADE-PTY") == pty_id:
            got.append(json.loads(body))
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")
    def log_message(self, *a): pass

server = HTTPServer(("127.0.0.1", 0), Endpoint)
threading.Thread(target=server.serve_forever, daemon=True).start()

env = dict(os.environ, ADE_HOOK_BIN=helper, ADE_HOOK_PORT=str(server.server_port), ADE_HOOK_TOKEN=token, ADE_PTY_ID=pty_id)
for k in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"): env.pop(k, None)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(proj)
    os.execvpe("claude", ["claude", "--model", "haiku", "--permission-mode", "default"], env)

screen = bytearray()
def pump(t):
    end = time.time() + t
    while time.time() < end:
        if select.select([fd], [], [], 0.1)[0]:
            try: screen.extend(os.read(fd, 65536))
            except OSError: return
def names(): return [e.get("hook_event_name") for e in got]
def wait(pred, label, t=90):
    end = time.time() + t
    while time.time() < end:
        pump(0.5)
        if pred(): return True
    sys.exit(f"FAIL: {label}")
def key(b): os.write(fd, b); pump(1)
def plain(): return re.sub(rb"\x1b\[[0-9;?]*[A-Za-z]", b" ", bytes(screen)).decode("utf-8", "replace")

pump(4)
if "trust" in plain().lower():
    key(b"\x1b[B"); key(b"\r"); pump(3)
wait(lambda: "SessionStart" in names(), "SessionStart arrived")
os.write(fd, b"Use the Bash tool to run exactly this command and nothing else: python3 -c 'print(42)'"); pump(0.7); key(b"\r")
wait(lambda: "PermissionRequest" in names(), "PermissionRequest arrived")
pump(1)
prompt_text = plain()[-3000:]
key(b"2")  # "Yes, and don't ask again ..."
wait(lambda: "PostToolUse" in names(), "PostToolUse arrived")
wait(lambda: "Stop" in names(), "Stop arrived", 60)
os.write(fd, b"/exit"); pump(0.7); key(b"\r")
wait(lambda: "SessionEnd" in names(), "SessionEnd arrived", 30)
try: os.kill(pid, 9)
except OSError: pass

text = plain()
problems = []
if re.search(r"hook error", text, re.I): problems.append("a hook error showed")
if re.search(r"(invalid|error).{0,40}settings|settings.{0,40}(invalid|error)", text, re.I): problems.append("a settings error showed")
final = json.load(open(settings))
if final.get("hooks") != written["hooks"]:
    problems.append("ADE's hooks did not survive Claude Code's write")
if not final.get("permissions", {}).get("allow"):
    problems.append("the \"don't ask again\" rule was not written (the answer may have missed)")
leaked = [k for e in got for k in e if k in ("prompt", "tool_input", "tool_response")]
if leaked: problems.append(f"fields leaked: {leaked}")
if not any(isinstance(e.get("pid"), int) for e in got): problems.append("no Claude Code pid was found")

print("events:", ", ".join(names()))
print("permissions.allow:", final.get("permissions", {}).get("allow"))
if problems:
    print("the permission prompt read:", re.sub(r"\s+", " ", prompt_text)[-600:])
    sys.exit("FAIL: " + "; ".join(problems))
print("PASS")
PY
