# Engagement profiles: ids, roots, variables, launcher, starter, channel

How ADE runs one process per profile (PRD F1, PE-4, PE-13).

- Design: `docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`
  (sections 3 to 6).
- ADRs: 0015 (process per profile), 0016 (rebuild and one launcher), 0018
  (control channel).
- Requests on the channel: `engagement-requests.md`.

Status: approved with the F1 plan by the owner on 2026-11-08; revisions 5 to 5g
accepted when their delta review passed (2026-11-08); the slice-1 additions
(revisions 5h to 5j) approved by the owner on 2026-11-08; not built.

## Profile id

- 16 lowercase hex characters (64 random bits), checked unique at creation.
  Opaque: no name, no path.
- The default profile has **no** id. In Rust it is `Profile::Default`;
  `ProfileId::parse` accepts only `^[0-9a-f]{16}$`.

## Profile root

`<profiles base>/<id>`, where the profiles base is:

| OS | Profiles base |
|---|---|
| macOS | `~/Library/Application Support/com.betterterminal.dev.profiles/` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/com.betterterminal.dev.profiles/` |
| Windows | `%LOCALAPPDATA%\com.betterterminal.dev.profiles\` (not roaming) |

In harness builds, `com.betterterminal.dev` is replaced by the harness bundle id
`com.betterterminal.isotest`.

| Path under the root | Holds |
|---|---|
| `app/` | what `app_data_dir()` holds for the default (`state/kv`, `snapshots/`, recordings, sync config with sync off), and `app/bin/release/ade` (ADR 0014's layout) |
| `webview/` | webview data folder (Windows only; wry ignores it on Linux under incognito) |
| `claude/` | `CLAUDE_CONFIG_DIR`, with `.claude.json` and the engagement's `settings.json` |
| `claude-home/` | macOS, ADR 0023 only: the `HOME` Claude Code starts with; holds `Library/Keychains` (symlink to the real one). Every walk uses `lstat` and every delete removes the link, never its target |
| `claude-local/` | Windows, ADR 0023 only: the `LOCALAPPDATA` Claude Code starts with |
| `shim/` | ADR 0023 only: `claude` / `claude.exe`, the helper under that name |
| `tmp/` | `TMPDIR`, `TMP`, `TEMP`, `CLAUDE_CODE_TMPDIR` |
| `cache/` | `XDG_CACHE_HOME` (Linux); `cache/agent-status/` (Agent status locks and records) |
| `ade/images/`, `ade/roles/` | pasted images; role files (S12) |
| `logs/ade.log` | crash log |
| `shell/` | shell-integration files; `shell/fish-data/` (fish's `XDG_DATA_HOME`) |
| `history/` | `zsh_history`, `bash_history`, `pwsh_history.txt` |
| `sessions/` | per-session start records for the journal |
| `engagement.json` | A's own copy of its start info, written by A only, never the control key |
| `terminal-sessions.json` | macOS and Linux: `{pid, startTime}` of A's own session and each terminal's session leader, written by A (`fsx::write_atomic`) right after each spawn, and of each session leader whose parent is in a recorded session, added by A's session pass (every 60 s and at shutdown; revision 5f, minor 3); pruned at A's start; read by delete's descendant check (revision 5e, MJ-1). A missing file is no records; one that exists but cannot be read or parsed stops delete (revision 5f, minor 4). One writer inside A: the prune, spawn records and the session pass change one mutex-guarded in-memory set and write it whole under the mutex (revision 5g, m7). An A that has lost its lock writes it no more (revision 5g, m2) |
| `handoff/<uuid>/` | onboarding hand-offs (`engagement-registry.md`); A deletes leftover `<uuid>.partial/` at start |
| `brain/` | PE-14 (Next) |

The default profile keeps today's locations. It gains only `<app data>/shell/`
(`<app data>/bin/` is ADR 0014's).

**`<profiles base>/.run/`** (macOS and Linux; revision 5d): mode 0700, owned by
the user, not a symlink, checked before every open. It holds every profile's lock
file `ade-<h>.lock`, the default's included. It is not a profile root (not a
16-hex name), and no OS cleaner ages it.

**One resolver:** `src-tauri/src/profile.rs` (`ProfilePaths`) in Rust, and
`src/lib/profilePaths.ts` (from the `profile_paths` command) in the frontend. A
static test fails on any other code building these paths, or calling
`app_data_dir()`, `app_local_data_dir()`, `app_log_dir()`, `app_cache_dir()` or a
non-test `temp_dir()`. `ProfilePaths` also answers the OS temp folder (its one
non-test `temp_dir()` call), the system temp folders (`/tmp`, `/var/tmp` on macOS
and Linux; none on Windows), the per-user runtime folder and the profiles base;
other code asks it for them (revision 5j, N5; the engagements-folder check in
`engagement-registry.md` is the first user).

## Variables ADE sets per profile

Part of the environment the rebuild builds in engagement mode, so they are in
the engagement instance's start-time environment (the environment it is exec'd
with on Unix, which `/proc/<pid>/environ` and `KERN_PROCARGS2` show; the PEB on
Windows), and every process it starts inherits them (revision 5f, minor 1).
Absent from the default profile unless the login session sets them.

| Variable | Engagement value |
|---|---|
| `ADE_PROFILE` | the profile id |
| `CLAUDE_CONFIG_DIR` | `<root>/claude` |
| `CLAUDE_CODE_TMPDIR`, `TMPDIR`, `TMP`, `TEMP` | `<root>/tmp` |
| `XDG_CACHE_HOME` (Linux only) | `<root>/cache` |

Per terminal (`create_pty`), in an engagement:
- `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and
  `GIT_COMMITTER_EMAIL`, from the registry's git identity, when one is set;
- the shell-integration variables (`ZDOTDIR` for zsh, `XDG_DATA_HOME` for fish);
- the history file;
- A's secrets and the opted-in globals.

Always removed in an engagement: `CLAUDE_SECURESTORAGE_CONFIG_DIR`. In the default
profile, every `ADE_*` variable and every variable in the table above has the login
session's value if the login session sets it, and is otherwise absent.

## Modes and the rebuild

- **Mode, from the arguments only:** `--ade-profile <id>` is **engagement mode**; it
  needs a start ticket (the starter passes `ADE_START_TICKET` to the first image;
  the rebuild carries it on in the rebuild pipe) that the default redeems, else it
  exits 2. Without `--ade-profile`: **default mode**.
- **`--open-engagements` (revision 5h, G1; ADR 0024):** a token with no value,
  set only by the OS launchers (the Windows jump-list task and the Linux
  `[Desktop Action engagements]`); no ADE code passes it. With F1 on it is valid
  only in default mode and once: with `--ade-profile`, in the form
  `--open-engagements=<x>`, or given twice (revision 5i), the process prints why
  and exits 2; a default-mode
  start that carries it sends `open_engagements` in place of `activate` when the
  default answers, or, when it becomes the default itself, shows the engagement
  list once its window is up. With F1 off it is ignored in every form (today's
  start). Both OS entries exist only in builds with F1 compiled on
  (`f1-forced`, `isotest-driver`; revision 5i): the jump-list code is `cfg`-gated
  there, and only the default instance registers the task (ADR 0024). It is an
  ordinary argument for the rebuild (in the digest, kept across the re-exec).
- **Arguments the rebuild and launchers use:** `--ade-rebuilt=<fd>` (Unix, set only
  by the rebuild) and `--ade-feature-f1` (debug builds only; added by both
  launchers when the running instance has F1 on; ignored by release builds).
- **Before Tauri and before any thread,** `main.rs`:
  1. reads, once, the ticket and, in debug builds only, `ADE_FEATURE_F1` or
     `--ade-feature-f1` (harness and `f1-forced` builds have F1 compiled on);
  2. **Unix, second image** (`--ade-rebuilt=<fd>`): reads the **rebuild pipe** on
     that fd **non-blocking** to end of file (a record: magic and version, count 1
     or 2, SHA-256 digest of the start-time environment as a sorted set +
     canonical folder + arguments other than `--ade-rebuilt`, the launcher path
     the first image took, the ticket, the flag) and closes it. A read that would
     block (`EAGAIN`) means a foreign pipe. If the digest equals the one computed
     from its own start-time view, it proceeds without reading any login-session
     source and reports the launcher path from the record. Otherwise it continues
     as below, with the count read, or 0 without a valid record (a fresh start's
     count is also 0);
  3. builds the login-session environment (table below) and, in engagement mode,
     adds the variables above; builds the folder (home, or A's root);
  4. **Unix:** compares the built set and canonical folder with the **OS's
     start-time view** (`KERN_PROCARGS2` on macOS, `/proc/self/environ` on Linux,
     parsed as a set) and its canonical `getcwd`, **never the live `environ`**
     (CoreFoundation adds `__CF_USER_TEXT_ENCODING` to it in any AppKit binary).
     Equal: proceed. Different: write the record to a pipe and `execve` its own
     image (`/proc/self/exe` on Linux, AppImage included; `_NSGetExecutablePath`
     plus `realpath` on macOS) with `--ade-rebuilt=<fd>`, the built environment
     and the built folder. At most two execs (count 0, 1, 2); a mismatch at
     count 2 exits 2, naming the differing variables by name only. **Windows:** removes every variable
     and sets the built ones and the folder in place (the PEB is what others
     read).
  The ticket and flag are never in the rebuilt environment, so A's terminals
  never inherit `ADE_START_TICKET`.
- **Linux AppImage:** keeps only the packaging variables of its own mount
  (`APPDIR` a prefix of `current_exe()`; `APPDIR`, `APPIMAGE`, `ARGV0`, the GTK, GIO,
  GSettings and pixbuf paths, and the `$APPDIR` entries of `PATH`, `XDG_DATA_DIRS`,
  `LD_LIBRARY_PATH`); never `OWD`.
- **Harness builds (`isotest-driver`) only:** the home is the root compiled in as
  `ADE_ISOTEST_HOME`, in place of passwd, `confstr` and Known Folders; on Windows
  `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` are built under it. These values are
  applied **last**, over any login-session block, and the four `XDG_*_HOME`
  variables are removed. `ProfilePaths` takes every Windows base from the
  compiled home in these builds (default app data
  `<home>\AppData\Roaming\com.betterterminal.isotest`, local app data
  `<home>\AppData\Local\com.betterterminal.isotest`, profiles base
  `<home>\AppData\Local\com.betterterminal.isotest.profiles`), because Known
  Folders ignore the variables.
- It records the path taken, `login-session` or `fallback`, plus `harness-home`.

| OS | Login-session path | Fallback |
|---|---|---|
| macOS | passwd `HOME`/`USER`/`LOGNAME`/`SHELL`; `TMPDIR` = `confstr(_CS_DARWIN_USER_TEMP_DIR)`; `PATH=/usr/bin:/bin:/usr/sbin:/sbin`; the `environment` block of `launchctl print gui/<uid>` | the same without the launchd block |
| Linux | `systemctl --user show-environment`, if it holds `DISPLAY` or `WAYLAND_DISPLAY` | passwd basics; `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`; `LANG=C.UTF-8`; `XDG_RUNTIME_DIR=/run/user/<uid>`, `DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus`, `WAYLAND_DISPLAY=<lowest own wayland-<n> socket>` or `DISPLAY=:<lowest own X socket>` with `XAUTHORITY` (first own of `$XDG_RUNTIME_DIR/gdm/Xauthority`, newest `$XDG_RUNTIME_DIR/.mutter-Xwaylandauth.*`, `~/.Xauthority`), each only if present and owned by the user; no input-method variables |
| Windows | `CreateEnvironmentBlock(own token, FALSE)` | `HKLM` and `HKCU` `Environment` values; Known Folders |

The login-session sources time out after 2 s, and then the fallback is used. On macOS an unparseable `launchctl print` block also means the fallback (its format is not a stable interface).

## Launcher and starter (`src-tauri/src/launcher/`)

These two files are the only code allowed to start ADE's binary (the one-launcher
test). `launcher/rebuild.rs` may only `execve` the running process's own image:

```rust
// default_launcher.rs
pub enum DefaultRequest { Activate, OpenEngagements, Checkout(CheckoutRequest) }
pub fn reach_default(req: DefaultRequest) -> Result<Reply, LaunchError>;

// engagement_starter.rs
pub struct EngagementProfile(ProfileId);   // only constructor: from a RegistryEntry
pub async fn start_engagement(p: &EngagementProfile) -> Result<Started, StartError>; // reads A's entry itself, under A's hand-off mutex
```

- **Spawn:** directly, never through LaunchServices, a shell, `open` or
  `ShellExecute`; `env_clear()` then the built environment; detached (`setsid` on
  Unix; `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB`
  on Windows, retried once without the breakaway flag if the job refuses it).
- **What is spawned:** `current_exe()`, except on a Linux AppImage, where it is
  `$APPIMAGE`.
- **Arguments:** `--ade-profile <id>` for an engagement; `--ade-feature-f1` added
  by both when the running instance has F1 on in a debug build.
- **`reach_default`:** if the default's channel answers `hello`, it sends the
  request. Otherwise it spawns default mode (cwd = home) and sends the request once
  the channel answers (15 s timeout).
- **`start_engagement`** (revision 5b, MJ-5): locks A's hand-off mutex
  (`engagement-registry.md`), then reads A's registry entry; if it is gone (A was
  deleted while this start waited), it returns `StartError::Deleted` and spawns
  nothing; if it is marked `deleting` (a delete stopped part-way, revision 5d),
  it returns `StartError::Deleting` and spawns nothing. It runs the PE-2 AC5 checks and probes A (below). Running: it
  releases the mutex and sends `activate`. Not answering: it returns
  `StartError::NotAnswering` and spawns nothing. Not running: it drops the
  probe's lock, reconciles A's hand-off records, mints a ticket (32 random bytes,
  hex, single use, 60 s) and a control key (32 random bytes, kept with the
  ticket; the redeem handler writes it to A's registry entry once A redeems, so a
  failed start keeps the old key), spawns engagement mode with cwd = A's root,
  and keeps the mutex until A redeems the ticket (A binds its channel first) or
  the child is gone. On the ticket's 60 s end, a failed spawn, the child's exit
  or a failed key write, it takes the ticket out of the table (already used:
  counts as redeemed), kills a live child through its handle, waits up to 5 s
  for its exit, then releases (revision 5c, MJ-6). Bound: 60 s after the spawn
  plus the longer of that 5 s and, for a ticket already used, the redeem
  handler's registry write (revision 5d, m7).

## Control channel (single-instance lock and transport)

- **Name:** `ade-<h>`, `h` = the first 16 hex characters of
  `SHA-256("ade-ctl\0" + canonical profiles base + "\0" + (id | "default"))`.

| OS | Endpoint | Lock |
|---|---|---|
| macOS | Unix socket `$(getconf DARWIN_USER_TEMP_DIR)ade-<h>.sock` | `flock` on `<profiles base>/.run/ade-<h>.lock` |
| Linux | Unix socket file `$XDG_RUNTIME_DIR/ade/ade-<h>.sock` (folder 0700, owner and mode checked, not a symlink; `/tmp/ade-<uid>/` with the same checks if no runtime folder) | `flock` on `<profiles base>/.run/ade-<h>.lock` |
| Windows | named pipe `\\.\pipe\ade-<h>`, `FILE_FLAG_FIRST_PIPE_INSTANCE`, `PIPE_REJECT_REMOTE_CLIENTS`, owner-SID-only DACL, non-inheritable handles | the pipe name: at least one instance exists |

The lock moved out of the runtime folder in revision 5d (MJ-A): macOS's
`dirhelper`, the XDG runtime-folder rule and `systemd-tmpfiles` may remove files
there, and a removed lock file let a prober take a fresh lock under a live A.

- **Peer checks, both ends, before the request:** `getpeereid` (macOS) or
  `SO_PEERCRED` (Linux) uid equal to the own uid; on Windows
  `GetNamedPipeServerProcessId` (client) or `GetNamedPipeClientProcessId` (server),
  then the process token's user SID equal to the own SID.
- **Invariant L** (design section 5; everything below rests on it):
  1. an instance takes its lock before it binds its endpoint or writes in its
     profile root, and holds it until its process exits; only the kernel
     releases it;
  2. its last write into its root comes before its exit;
  3. "not running" only from a prober that took the lock itself and then found
     the endpoint absent or refusing;
  4. a held lock with anything but a correct `hello` within 1 s is "not
     answering": nothing is spawned, removed or written.
  Stated gap (revision 5e, minor 1): the lock file removed by hand while the
  socket is also absent (within the 60 s before the keep-alive pass rebinds a
  socket a cleaner removed) reads "not running" for a live A; delete still
  stops on A's own `ADE_PROFILE` and A's own session record (descendant
  check). If a second binder then takes the new lock file, the first A has
  **lost its lock** (keep-alive pass, below) (revision 5f, minor 1).
- **The bind**, in this order:
  1. take the lock: Unix, open `.run/ade-<h>.lock` (create 0600, `O_NOFOLLOW`,
     `O_CLOEXEC`), `flock(LOCK_EX | LOCK_NB)`, check that `fstat` of the
     descriptor and `lstat` of the path give the same device and inode (else
     reopen and retry), then write the lock record (one line: process id and
     process start time); Windows, `CreateNamedPipeW` with
     `FILE_FLAG_FIRST_PIPE_INSTANCE`. Both retried for up to 2 s, then exit 2;
  2. an engagement instance checks its profile root (`lstat`, a folder); absent:
     it unlinks the lock file it holds (if the path still names it) and exits 2;
  3. Unix: connect to the socket; absent or refused, unlink it and bind;
     accepted, exit 2 naming the path. Windows: the first instance is the lock
     instance;
  4. only then: open `logs/ade.log` (with the rebuild's buffered line) and
     redeem the ticket.
- **Held until exit.** Unix: the descriptor lives in a never-dropped `static`,
  `FD_CLOEXEC`. Windows: the lock instance lives in a never-dropped `static`, is
  disconnected and reused after each connection or accept error, never closed;
  when a client connects to it, the next listening instance is created before
  it serves (revision 5e, minor 7);
  other instances are replaced before a hand-off or before a failed one is
  closed. Shutdown: stop accepting (but `hello`); save the session, and on a
  **close** only (A's own close, or the `close` request) write `closed: true`
  to the status file; a quit or logout writes nothing to the status file
  (a quit is not a close; revision 5e, MJ-3); on macOS and Linux run the
  session pass once more; close windows and let the event loop run until
  every webview is destroyed (Windows: then wait, on a background thread
  while the main thread pumps messages, up to 5 s on handles to WebView2's
  `BrowserProcessId` processes, opened when each webview was created; a
  browser process restarted after a crash is not waited on; revision 5f,
  minor 7); A calls `prevent_exit` on the `RunEvent::ExitRequested` raised
  when the last window is destroyed, so the loop keeps running through the
  wait, and never calls `AppHandle::exit` (revision 5g, m4); flush and close
  every file in the root, `std::process::exit`.
  An A that has lost its lock skips the session save and the status write.
- **Start write:** once its ticket is redeemed and before any window opens,
  A writes `closed: false`, `closedAt: null` and `personaId` to its status
  file (`engagement-registry.md`; revision 5f, MJ-A). If the write fails, A
  logs it, warns the engineer in its windows, starts anyway and retries every
  60 s until it succeeds, A closes or A loses its lock (revision 5g, m6).
- **Keep-alive pass** (macOS and Linux, every 60 s), **lock file first**: a
  removed lock file is re-opened and its `flock` taken, keeping both
  (`.run/` re-created with its checks if missing; revision 5e, minor 1); then,
  only while A holds the lock on the file at the lock path, a removed socket
  is rebound (the runtime folder re-created with its checks if missing). If
  the take still fails after 5 s of retries, the new file's lock record
  names another live process (with its start time), **and** that binder is
  serving (the socket path's inode is not the one A bound, or a `hello` there
  comes from a peer whose pid, by `LOCAL_PEERPID` or `SO_PEERCRED`, is not
  A's; revision 5g, m3), A has **lost its lock** (revision 5f, minor 1). A
  prober writes no record and a binder that has not bound is not serving, so
  either is retried at the next pass, with the socket path untouched. Having
  lost it, A logs the conflict once, never runs the socket check or the take
  again, stops its session pass and its spawn records in
  `terminal-sessions.json` (its later children still carry `ADE_PROFILE`;
  revision 5g, m2), tells the engineer to quit this window, and on quit or
  close writes nothing more in its root but closing its log.
- **Only with F1 on** (revision 5f, minor 6): with F1 off no instance creates
  `.run/`, takes a lock, binds a channel or runs the keep-alive pass, as
  today's ADE; so an F1-off build starts on a volume without `flock`. The
  no-`flock` message box uses `rfd` 0.16.0, a direct `cfg(unix)` dependency
  (`default-features = false`, `gtk3`).
- **The probe** (`probe_instance(profile) -> Liveness`), used by the starter,
  delete and PE-12 AC1's close, each under A's hand-off mutex:
  - take the lock as a binder does (no record written; on Windows with a DACL
    that grants no one connect). Taken: Unix, connect to the socket path;
    absent or refused, **not running**, returning the lock as a guard (the
    starter drops it before the spawn; delete and close hold it until they
    finish); accepted, **not answering** (a conflict is logged if the peer
    answers `hello` as the profile). Windows: the create succeeding is
    **not running**, with the guard;
  - held: the endpoint passes the peer check and answers `hello` with the
    expected profile within 1 s: **running**; anything else: **not answering**;
  - any other error (no `flock` on the volume, `.run/` failing its checks):
    **not answering**.
  "Not answering" is never treated as not running. Its message names the
  engagement's window and offers Force quit, which kills the process named by
  the lock record only after checking its start time and that it runs ADE's
  binary (Linux: `/proc/<pid>/exe` equal to the default's, a ` (deleted)`
  suffix ignored, on an AppImage the same `APPIMAGE` and the same path inside
  each instance's own mount; macOS: the same code-signing identifier; Windows:
  `QueryFullProcessImageNameW` equal under `fsx::same_path`), then probes
  again. With no record or no confirmation it kills nothing and names the
  executable (from `current_exe()`) and Task Manager, Activity Monitor or
  `kill`. The record never decides liveness (revision 5e, minors 2, 3). On
  macOS a missing code-signing identifier on either side (an unsigned build)
  never confirms (revision 5f, minor 5).
- **Every client request is bounded:** connect 1 s; reply `hello` 1 s,
  `activate` 2 s, `open_engagements` 5 s, `redeem_start_ticket` 10 s,
  `checkout_request` 30 s, `first_start_done` and `registry_update` 5 s,
  `apply_handoff` 60 s, `close` 120 s. A server closes a connection that sends no
  request within 5 s.
- Frames: u32 big-endian length (at most 65536), then a UTF-8 JSON request. One
  request and one reply per connection.

## Environment of the started default instance

Whatever started it (an OS launch, a terminal, A's `reach_default`, an updater), the
default instance's environment and working folder are the rebuilt ones. No request
carries environment, folder or other process state into it.
