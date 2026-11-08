# Engagement control requests

The closed set of requests between ADE instances on the profile control channel
(`engagement-profiles.md`, "Control channel"). PRD PE-8 AC5, PE-12 AC1, PE-13 AC1,
AC8 and AC10, PE-2 AC5 and AC8.

- Design: `docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`,
  sections 5 and 6.
- ADR: 0018.

Status: approved with the F1 plan by the owner on 2026-11-08; revision 5's fold-in
accepted when the delta review of revisions 5 to 5g passed (2026-11-08); the
slice-1 additions (revisions 5h to 5j, Open engagements from the OS launchers)
approved by the owner on 2026-11-08; not built.

## Rules

- **One Rust enum,** `#[serde(tag = "type", rename_all = "snake_case",
  deny_unknown_fields)]`, in `src-tauri/src/launcher/requests.rs`. Unknown types or
  fields are refused with `{"ok":false,"error":"bad request"}`.
- **New requests** are added here first, before they are coded.
- **Replies:** `{"ok":true, ...}` or `{"ok":false,"error":"<text>"}`.
- **Who may send what:** the "Accepted by" column. A request to the wrong kind of
  instance is refused.
- **Peer check first:** no request is read or sent until the peer's uid (Unix) or
  token SID (Windows) equals the own (`engagement-profiles.md`).
- **Every request is bounded (revision 5d, m4).** The client connects within 1 s
  (Windows: `CreateFileW`, then `WaitNamedPipeW` on `ERROR_PIPE_BUSY` for what is
  left) and waits for the reply at most the "Bound" below; a timeout is "not
  answering" to the caller and is not retried in a loop. The server closes a
  connection that sends no request within 5 s. On Windows a client that opens a
  name nobody serves (a prober's guard instance, a squatted name) is ended by
  its own bound. Bounds: `hello` 1 s, `activate` 2 s, `open_engagements` 5 s,
  `redeem_start_ticket` 10 s, `checkout_request` 30 s, `first_start_done` 5 s,
  `registry_update` 5 s, `apply_handoff` 60 s, `close` 120 s.
- **Control key:** `key` is A's control key for this start (64 hex). The default
  checks it against A's registry entry; A against its `StartInfo`. Constant-time
  compare; a wrong or missing key is refused with `{"ok":false,"error":"bad key"}`
  and changes nothing.

| `type` | Fields | Sent by | Accepted by | Reply |
|---|---|---|---|---|
| `hello` | `v: 1` | anyone of the same user; the default sends it to A under its hand-off mutex (writer step 6, and the probe of the starter, delete and PE-12 AC1's close when A's lock is held, or, on Unix, to check that an endpoint whose lock the prober took is not A's), waiting at most 1 s; no answer is "not answering", never "not running" (invariant L, `engagement-profiles.md`) | any; the handler answers at once and never waits on a hand-off mutex | `{"ok":true,"v":1,"profile":"<id>"\|"default"}` |
| `activate` | none | a second start of the binary; `reach_default`; `start_engagement` | any | `{"ok":true}`, after bringing the instance's windows forward |
| `open_engagements` | **none** | an engagement instance's Open engagements action; a second start of the binary with `--open-engagements` (the OS launchers; revision 5h, ADR 0024) | default | `{"ok":true}`, after bringing the default forward and showing the engagement list |
| `redeem_start_ticket` | `ticket: string` (64 hex) | a starting engagement instance, after it has bound its own channel | default; the handler marks the ticket used under the ticket table's lock, writes the ticket's new control key to A's registry entry (registry file lock only), then signals the waiting starter, which releases A's hand-off mutex; it never takes a hand-off mutex itself | `StartInfo` (below), or `ok:false` if unknown, used, expired, or the key write failed (the starter then kills the child) |
| `checkout_request` | `profile: string`, `key: string`, `op: "add"\|"remove"`, `path: string` | an engagement instance (PE-8 AC5) | default | `{"ok":true,"verdict":Verdict}` |
| `first_start_done` | `profile: string`, `key: string` | an engagement instance, after applying the seed and project setup | default | `{"ok":true}`; the default clears `seed` and `firstStartPending` |
| `registry_update` | `key: string`, `checkouts: [Checkout]`, `verdict: Verdict` | default | engagement | `{"ok":true}` |
| `apply_handoff` | `key: string` | default, **only after** it has removed the handed-off files from its own stores (step 6 of the hand-off order, after step 4's removal and step 5's record update; on the reply the default runs the tombstone sweep; `engagement-registry.md`). Sent while the default holds its hand-off mutex, so it waits at most 60 s; a late reply is ignored | engagement | `{"ok":true,"applied":n,"refused":n}` |
| `close` | `key: string` | default (PE-12 AC1's close, while A runs, and the delete flow, PE-12 AC3; each holds A's hand-off mutex and waits at most 120 s) | engagement | `{"ok":true,"closed":bool}`; `closed:false` if the engineer cancels the running-terminal confirm |

Revision 1's `confirm_nonce` is withdrawn; the control key replaces it.

## Open engagements carries nothing (PE-13 AC10)

- `open_engagements` is a **unit variant**: the type cannot hold data, and its
  handler takes no arguments.
- The default instance uses nothing from it beyond "show the engagement list",
  whether it was started by it or was already running.
- **Required unit tests:**
  1. it serialises to exactly `{"type":"open_engagements"}`;
  2. `{"type":"open_engagements","path":"/x"}` and any other extra field are refused.

  PE-13 AC9's runs (f) and (f') check the same at run time.
- It differs from `checkout_request`, which carries a path by design.

## Types

```ts
type Verdict =
  | { clear: true }
  | { clear: false; folder: string; kind: "inside-other-root" | "contains-other" | "shares-worktree" | "ancestor-claude-md" | "ade-project-folder" };
  // folder is always one of A's own folders; never another engagement's name or path (PE-2 AC5)

type Checkout = { name: string; path: string };

type StartInfo = {
  ok: true;
  profile: string;             // A's id
  name: string;                // engagement name (window titles, PE-13 AC4)
                               // no clientName, on purpose (revision 5h): A's UI shows
                               // the name only, and StartInfo carries only what A uses
  root: string;
  checkouts: Checkout[];
  personaId: string;
  gitIdentity: { name: string; email: string } | null;
  globalSecretNames: string[]; // opted-in default-profile secrets (D2); names only, never values; never an APP_ONLY name
  deployCommands: string[];    // PE-5 AC4
  verdict: Verdict;
  key: string;                 // control key for this start, 64 hex; A keeps it in memory only
  seed: Record<string, string> | null; // PE-2 AC10's settings copy, only until first_start_done
};
// A exits 2 if StartInfo.profile differs from its --ade-profile.
```

**Hand-off mutex rule (revision 5a, MJ-1; revision 5b, MJ-5 and minor 1).** No path
holding a hand-off mutex sends a request whose handler takes the peer's hand-off
mutex and could be waiting on this one: only the default's `hello` (1 s),
`apply_handoff` (60 s) and `close` (120 s) are sent under it, A sends no request
while holding its own (A redeems its ticket before it first takes its mutex), and no
default handler of a request from A takes the default's (`redeem_start_ticket` only
signals the starter, which holds the default's mutex until the redeem, the ticket's
60 s end, a failed spawn or the child's exit). Both instances serve each connection
on its own task, so a handler waiting on a mutex never delays an answer on another
connection. A new request type that would break this changes this file first
(`engagement-registry.md`).
