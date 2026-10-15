# Phone app UX: the minimal iPhone app (piece 2a)

The screens, states and wording of the minimal Expo app in
`2026-10-14-relay-pairing-design.md` ("The minimal app"), as amended and
approved on 2026-10-15 (ADR 0004). That spec owns every protocol rule; this
one only says what the user sees. Where a UX need would change the protocol,
it is listed under Open questions, not decided here.

The mockup is `2026-10-15-phone-app-mockup.html` beside this file. It keeps the
look of the sketch the owner approved on 2026-10-15. Names in it (Macs, tabs,
projects) are placeholders.

The app is **watching only**. Nothing on any screen sends anything that runs on
the Mac. Steering is 2b; the designed app is piece 3.

**Scope tags.** Every requirement here is **2a-required** and belongs to
story 12 (the minimal Expo app) unless it is tagged:
- **[S13]**: 2a-required, built in story 13 (push on the phone), because it
  needs `expo-notifications`. Until story 13 lands, story 12 skips it.
- **[P3]**: deferred to piece 3. Listed at the end so it isn't lost; not
  built in 2a.

## Look

- **Dark only**, ADE's `precision-dark` palette. `userInterfaceStyle: "dark"`.
  Portrait only, iPhone only.
- **Font:** the iOS system font. Projects use the system monospace font, as
  ADE does for paths.
- **Layout:** iOS grouped lists on `bg`, rows on `card`, 16 pt side margins,
  rows at least 64 pt high (Tabs, Macs) or 56 pt (Settings).

| Token | Value | Use |
|---|---|---|
| `bg` | `#0A0B0D` | screen |
| `card` | `#15171B` | list groups, camera frame, code panel |
| `text` | `#E8EAED` | primary text |
| `text2` | `#9BA1AC` | secondary text, ages, captions |
| `separator` | `rgba(255,255,255,0.055)` | row dividers (decorative) |
| `link` | `#7C8FFF` | text buttons, back, viewfinder corners |
| `button` | `#4A5FE0` | filled button, white label |
| `danger` | `#F4756B` | Unpair, error text |

`#5A616D` (ADE's `text-muted`) is used only for decorative chevrons: it is
2.9:1 on `card`, too low for text or a meaningful mark.

### Agent states

ADE's five states in ADE's order, most urgent first, then the two the
amended spec adds. ADE's two visible colours are kept exactly; finished is
lightened from the sketch's `#5A616D` to pass 3:1.

| State (`state`) | Dot | Label | VoiceOver | On `card` |
|---|---|---|---|---|
| `needsYou` | `#f85149`, 3 pt halo at 30% | Needs you | "needs your answer" | 5.4:1 |
| `waiting` | `#58a6ff` | Waiting | "idle, waiting for a new prompt" | 7.1:1 |
| `working` | `#D9A441` | Working | "working" | 8.0:1 |
| `ready` | `#4CC38A` | Ready | "ready" | 8.1:1 |
| `finished` | `#8B929E` | Finished | "finished" | 5.7:1 |
| unknown | hollow `text2` ring | Unknown | "state unknown" | 6.9:1 |
| `null` | hollow `text2` ring | No agent | "no agent" | 6.9:1 |

- **Unknown** is a state string the app doesn't know, a missing field or a
  wrong type (the spec's rule). **`null`** is a tab with no agent.
  Both show no age, and both sort last, below finished.
- The **label** is always shown, in the state's colour (`text2` for the last
  three), so colour is never the only signal. The needs-you halo and the
  hollow ring add shape cues.
- The two most urgent states read differently on purpose: needs you is a
  question waiting for the user; waiting is an idle agent.
- The dot is 10 pt and has no VoiceOver element of its own (the row's label
  covers it). No dot pulses or animates.

## Navigation

A single stack (`expo-router`), with Pair as a modal once a Mac is listed.

**Entries** are the Macs the app lists, one per Mac key: each paired Mac,
plus each Mac the phone holds only a pending pair with. A pending re-pair of
a paired Mac is not a separate entry (see Already paired), and neither is a
second pending attempt with the same Mac (see Pairings off screen).

```
Launch (cold start, including from a notification)
  no entries ........................ Pair (root, no Close)
  one entry, and it is paired ....... Macs > Tabs(that Mac)    back goes to Macs
  anything else ..................... Macs
Pair: scan -> Pair: code -> [first pairing ever, S13] Notifications -> Tabs(new Mac)
  from the + modal: the modal closes, then Tabs(new Mac) opens on Macs
Pair: scan -> Already paired -> Pair again -> Pair: code
Macs -> Tabs(Mac) -> Settings          Macs -> Settings
Macs -> pending row -> Finishing pairing (the code again)
Macs -> + (Pair, modal, Close)
Pair (root) -> gear -> Settings
Settings -> Unpair (confirm sheet)     Settings -> Stop pairing
```

**Notifications.** The push carries no data, so the app can't know which
Mac it is about.
- **Cold start** from a notification uses the launch rule.
- **Warm start** (the app was in the background) keeps the current screen,
  which reconnects and refreshes like any return to the foreground. Macs
  shows each Mac's needs-you count once its session is live.
- **In the foreground [S13]**, a push shows no banner and plays no sound; the app
  sends `want_snapshot` to each Mac with a session (the spec's rule), and the
  open screen updates.

## Screens

### 1. Pair: scan

**Content.** Title "Pair with a Mac". Body: "In ADE on your Mac, turn on
Remote and choose Pair a phone. Then point the camera at the code it shows."
A camera view with four `link` corners. The lock line: "Tab titles and states
are encrypted end to end: the relay can't read them, though it sees when your
devices connect." As root: a Settings gear top right. As a modal: Close top
left.

| State | What the user sees |
|---|---|
| Camera not yet asked | iOS asks as the screen opens. Purpose string: "ADE Remote uses the camera to scan the pairing code ADE shows on your Mac." |
| Camera denied or restricted | The frame shows "Camera access is off" / "Turn it on in Settings to scan the pairing code." with **Open Settings** (`Linking.openSettings`). No manual entry: the code carries keys. |
| Not a pairing code | Under the frame, in `danger`: "This isn't an ADE pairing code." Covers another scheme, a missing or malformed required field and an unreadable QR. `n` is exempt: missing, or with a malformed `%` escape, it counts as missing and the code stays valid (the spec's rule). Scanning continues; it clears after 4 s or on the next scan. |
| Relay not `wss://` | Same place: "This code points at an insecure relay. ADE Remote only connects over wss://." |
| Newer code version | `ade-pair://v2` or later: "This code is from a newer ADE. Update ADE Remote in TestFlight to pair." |
| The code just refused | During one visit to this screen, the code whose pairing just failed is ignored if scanned again, with the hint "That code can't be used. Wait for a new one on your Mac." |
| Mac already paired | The code's relay and Mac key match a pair the phone holds: go to Already paired. |
| Mac with only a pending pair | No question: go to Pair: code. The new attempt takes over that Mac's one entry; the older one carries on hidden (see Pairings off screen). |
| Valid code | Scanning stops; go to Pair: code. One code is read once. |

**Dev builds only:** an `ade-pair://` URL (for example from
`xcrun simctl openurl`) runs the same parser and the same screens as a scan,
and is ignored while a pairing is under way. That is the simulator test path.
Release builds don't register the scheme and ignore such a URL, so the iOS
Camera app can't start a pairing in release; only this scanner can.

### 2. Already paired

Title "Already paired with *Mac name*". Body: "Pairing again replaces the
current pairing once it finishes. Until then, the current one keeps
working." **Pair again** (go to Pair: code) and **Cancel** (back to scan).

The old pair stays until the phone acks the new one; the replacement
(`pair_replaced`) is silent. A pairing again that fails, is declined or is
stopped leaves the old pair working, and shows only the attempt's own
ending screen. The Mac's name updates to the new code's `n` only when the
new pair is acked; a re-pair that fails keeps the old name.

### 3. Pair: code

**Content.** Title "Check the code". The 6 digits, monospace 44 pt, as two
groups of three ("482 917"), and under them "Pairing with *Mac name*".
Body: "Your Mac shows a code too. If the two match, confirm on the Mac. If
they differ, decline on the Mac." The phone sends the reveal as soon as it
shows the digits, so from then on the pair is **pending**, with the digits
stored.

**Buttons.** Before the digits: **Cancel**. With the digits: **Close** top
left (leave the screen; the pending pair keeps going, shown in Macs) and
**Stop pairing** at the bottom (end it, below).

| State | What the user sees |
|---|---|
| Connecting | Until `pair_nonce`: a spinner and "Reaching your Mac…". Bounded: 30 s after the commit with no `pair_nonce` the phone aborts and shows "Your Mac didn't answer". |
| Waiting for confirm | Digits; "Waiting for you to confirm on the Mac"; under it "Code expires in 4:12", counted down from the `ttl_s` in `pair_nonce` with the same wall clock as ages (`Date.now()` since `pair_nonce` arrived, never negative). At 0:00 it reads "Waiting for the relay's answer" until `pair_ended` arrives. The countdown is not a live region; VoiceOver reads it only on focus. VoiceOver on arrival: "Code 4 8 2, 9 1 7. Confirm on your Mac if it matches." |
| Can't reach the relay | The phone's connection drops after the digits. The digits stay; status "Can't reach the relay. Reconnecting…"; body "Your pairing is saved. If you confirm on the Mac, it finishes when this phone reconnects." It stays here, unbounded by design, until the relay answers or the user stops it. |
| Paired | A `paired` that passes the spec's step-8 checks: a check mark, "Paired with *Mac name*", announced to VoiceOver, then after 1 s the next screen. |
| Ended | Any ending in the table below: its title and body, and **Scan again**. |

**Endings.** Every answer the relay can give maps to one screen. It comes
from `pair_refused`, `pair_ended`, `pair_declined`, or `pair_state` ended
(the answer to the phone's `pair_status` after each `welcome` and every
60 s).

| Reason | Title | Body |
|---|---|---|
| `expired` | This code has expired | On your Mac, choose Pair a phone again for a new code. |
| `taken` | This code is already in use | Another phone scanned it first. On your Mac, start pairing again for a new code. |
| `declined` | Pairing declined | The Mac declined, or its pairing window was closed. Nothing was paired. |
| `cancelled` | Pairing was stopped on the Mac | ADE started a new code or closed its pairing window. On your Mac, choose Pair a phone again. |
| `disconnected` | The connection dropped | Your Mac or this phone lost its connection before pairing finished. On your Mac, start pairing again. |
| `unpaired` | This code was already used | It paired once, and that pair has since been unpaired. On your Mac, choose Pair a phone again. |
| `unknown` | This code can't be used | It may be old, or the relay restarted. On your Mac, choose Pair a phone again. |
| no `pair_nonce` in 30 s | Your Mac didn't answer | ADE may have closed its pairing window or lost its connection. On your Mac, start pairing again. |
| checks failed | Pairing failed a security check | Your Mac's answer didn't match the code you scanned. Nothing was paired. Start again from ADE. |

The phone's own connection dropping before the digits is `disconnected` (the
spec's disconnect rule); the phone shows it at once.

**Stop pairing** (any time, from this screen, Finishing pairing or Settings,
no confirmation). It is a `danger` text button at the bottom of the screen,
apart from Close at the top left, so the two aren't confused. Before the reveal: the phone sends `pair_abort` and nothing
is stored. After it: the pending pair leaves every list at once and is kept,
hidden, marked cancelled; a late `paired` for it is unpaired at once (the
spec's cancel rule). Back to scan, or to Macs if the screen was reopened.

**Device name** sent to the Mac: `expo-device`'s `deviceName`, cleaned by the
spec's Names rule (40 code points). On iOS 16 and later this is the model
name, "iPhone", for apps without Apple's entitlement; the Mac shows "iPhone"
too when the name cleans to empty.

**Mac name** shown on the phone: the code's `n`, cleaned by the same rule;
"Mac" when it is missing or cleans to empty. Plain text only.

### 4. Finishing pairing

What a pending pair shows when reopened from Macs or Settings, including
after a relaunch. Close (top left), title "Finishing pairing", the stored
digits with "with *Mac name*" under them, and one status line from the last
answer:
- slot open: "Confirm on your Mac if the codes match.";
- no connection: "Can't reach the relay. It finishes when this phone
  reconnects.";
- asking: "Checking with the relay…".

**Stop pairing** at the bottom. A `paired` or an ending for this attempt
replaces the screen as on Pair: code. No expiry is shown here: `ttl_s` isn't
stored, so after a relaunch the phone doesn't know it.

### Pairings off screen

Every pairing message names its slot, and the app applies it to that
attempt only. An attempt is **on screen** while its Pair: code or Finishing
pairing screen is the top screen; only then do its endings and `paired`
change what is shown, as above. Otherwise:

| What arrives | What the user sees |
|---|---|
| An ending, for a first pairing | The row leaves Macs and Settings. A non-modal notice at the top of whatever screen is open, for 6 s or until tapped: "Pairing with *Mac name* didn't finish: *title from the endings table*." VoiceOver announces it. |
| An ending, for a re-pair | The attempt leaves Settings. Notice: "Pairing again with *Mac name* didn't finish. The current pairing still works." |
| `cancelled`, while a newer attempt with the same Mac exists | Silent: ADE opened a new code, and that attempt is the one that matters. This is how closing attempt A and scanning B from the same Mac ends: A's ending never touches B's screen. |
| An ending of an attempt this phone stopped | Silent. |
| `paired` that passes the checks, first pairing | The pending row becomes an ordinary row in place, and a notice: "Paired with *Mac name*." No navigation. |
| `paired`, re-pair | Silent; the name updates (see Already paired). |
| `paired` for an older attempt with a Mac whose newer attempt is on screen | The Mac is now paired; the attempt on screen carries on as a re-pair, and its success replaces the older pair silently. |

**Notifications [S13] after a pairing off screen.** If the first pairing
ever completes off screen (or while the app wasn't running), the
Notifications screen is shown once, as a sheet, the first time a Tabs screen
opens afterwards.

### 5. Notifications [S13]

Shown once, after the first pairing ever, so the one-time iOS prompt is
spent only when the user wants it (the spec asks after the first pairing).
Title "Know when an agent needs you". Body: "Get a notification when an
agent on your Mac needs your answer. It says only 'An agent needs you',
never which tab or what it's doing." **Turn on notifications** (the iOS
prompt) and **Not now**. On screen, either leads to Tabs for the new Mac; as
a sheet (see Pairings off screen), either closes it.

### 6. Macs

**Content.** Large title "Macs", + (Pair another Mac) top right, the list,
the caption "A Mac shows as online while ADE runs with Remote on.", and a
Settings button at the bottom.

**Each row:** Mac glyph, name, presence line, then the needs-you count, then
a chevron.

| Row state | Presence line | Count | Tap |
|---|---|---|---|
| Online (session live, a snapshot this session) | green dot, "Online" | yes | Tabs |
| Connecting (relay or handshake under way, or no snapshot yet this session) | spinner, "Connecting…" | no | Tabs |
| Offline (presence offline) | hollow ring, "Offline" | no | Tabs |
| Pending | spinner, "Finishing pairing" | no | Finishing pairing (the newest attempt with that Mac) |

- **The count** is the number of tabs that need you, from a snapshot of the
  current session only, shown only when above 0: red dot with halo and
  "2 need you" in `needs`. VoiceOver: "2 tabs need you".
- **Sort:** rows with a count first (largest first), then online, then
  connecting, then offline, then pending; by name within each.
- A paired Mac with a pending re-pair shows as its paired row, unchanged;
  the attempt is in Settings.

| Screen state | What the user sees |
|---|---|
| Relay unreachable | A notice above the list: "Can't reach the relay. Retrying…" Rows show Connecting. Retries follow the spec's backoff; coming to the foreground retries at once. |
| No longer paired | An alert, once, when a pair is removed and **no pair with that Mac remains** (removals that leave a pair, such as a replacement, are silent). Title "No longer paired with *Mac name*"; body "It was unpaired on the Mac, not used for 90 days, or the relay lost its records. Pair again from ADE to watch it." Several at once collapse into one: "No longer paired with 2 Macs" with the names in the body. OK closes it; if a removed Mac's Tabs was open it closes first; if no entries remain, Pair (root). |

### 7. Tabs

**Content.** Back "Macs", the Mac name as large title, a Settings gear, the
status line ("Online · 6 tabs", from `total`), the banner when any tab needs
you, the tab list, then the footer "Watching only. Answer prompts at your
Mac. Pull down to refresh."

**Banner.** "*N* tab(s) need(s) you" with "Answer at your Mac" (stacked at
large text sizes). It counts tabs, so it matches the red rows; the push
keeps "An agent needs you". Not a button. Hidden when no tab needs you.

**Each row:** dot, title (16 pt semibold), project (13 pt monospace,
`text2`), and on the right the label above the age. Sort: by the state order
above, then longest in that state first (largest `age_s`), then title.

**Age.** `age_s` plus the time since the snapshot arrived, measured with the
phone's wall clock (`Date.now()`), which keeps counting while the phone
sleeps; a negative difference (the user set the clock back) counts as 0.
Phone and Mac clocks are never compared. Shown as `12 s` under a minute,
`4 min` under an hour, `3 h` under a day, then `2 d`, rounded down. Updates
each second under a minute, else each 30 s. VoiceOver: "for 12 seconds".
No age for unknown and no agent.

**Text.** Title and project one line each, tail ellipsis. Empty title:
"Untitled tab" in `text2`; empty project hides that line. Plain text only.
The Mac has already cut titles to 120 and projects to 80 code points.
VoiceOver reads the full text.

| State | What the user sees |
|---|---|
| Connecting, nothing in memory | Status "Connecting…" with spinner; the list area says "Loading tabs…". |
| Connecting or offline, earlier snapshot in memory | **Past tense.** The list stays; status "Connecting… · last update 3 min ago" or "Offline · last update 3 min ago"; ages freeze at the last update; the banner reads "Last seen: 1 tab needed you" on `card`. A new snapshot returns to live. |
| Online | As above. A new snapshot re-sorts the list in place. |
| Pull to refresh | Sends `want_snapshot`; the spinner stops on the next snapshot. With no session but the Mac online, it starts a handshake, within the spec's limit of one restart per 10 s (if one was just made, it waits for that one). Either way after 10 s with no snapshot: "Couldn't refresh. Showing the last update from 2 min ago." (or "Couldn't reach *Mac name*." with nothing in memory). With the Mac offline the spinner stops at once. |
| No tabs | `total` 0: "No tabs open" / "Tabs open in ADE on this Mac appear here." |
| Truncated | `truncated: true`: status "Online · 200 of 312 tabs" and a last row "Showing 200 of 312 tabs. The least urgent are left out." (counts from the tab list and `total`). |
| Offline, nothing in memory | "*Mac name* is offline" / "It appears here when ADE is running with Remote on. It may be closed, asleep or offline." |
| Relay unreachable | As Connecting, with "Can't reach the relay" in the status line. |

**Snapshots stay in memory only** (owner, 2026-10-15): nothing from a
snapshot is written to storage or logs, so a relaunched app starts at
Connecting.

### 8. Settings

**Content.** Back (labelled with the previous screen: "Macs", the Mac's
name, or "Pair"), title "Settings", then three groups.

- **Macs.** Each paired Mac with **Unpair** (`danger`). Each pending pair,
  including a pending re-pair, as "*Mac name*" / "Finishing pairing", which
  opens Finishing pairing, with **Stop pairing**. Empty: "No Macs paired"
  and **Pair a Mac**.
- **Notifications [S13].** "On"; or "Off" with **Turn on**, which fires the
  iOS prompt if it hasn't been asked, else opens iOS Settings.
- **About.** Version (`1.0.0 (12)`, from the app config), and the privacy
  note (below).

**Unpair.** An action sheet: "Unpair *Mac name*?" / "This phone stops seeing
its tabs and getting its notifications. To watch it again, pair from ADE."
**Unpair** (destructive) and Cancel. It removes every pair the phone holds
with that Mac and stops any pairing under way with it (the spec's rule). It takes effect on the phone at once; offline it is
queued. Settings stays open with the list updated, and any Tabs screen for
that Mac is removed from the stack, so Back leads to Macs. If no entries
remain, the app goes to Pair (root).

**Privacy note**, as the spec's Known limits require: "Tab titles and
states are encrypted end to end; the relay can't read them. It can see
your IP address, when your devices connect, which devices are paired, the
size and timing of updates, which shows when your tabs are busy, and when a
notification is sent, which shows when an agent needs you. It
stores this phone's notification token so it can send notifications, which
Apple delivers; a notification says only 'An agent needs you'. ADE Remote
has no analytics and no crash reporter of its own. As a TestFlight build,
it may send Apple crash logs, and feedback you send through TestFlight can
include a screenshot."

## Privacy on screen

- **App switcher.** When the app goes `inactive` or `background`
  (`AppState`), a cover fills the screen: `bg` with the app's glyph and
  "ADE Remote", nothing else. iOS takes its app-switcher image of the cover,
  so no titles show there. It lifts on `active`.
- **Logs.** Release builds log no titles, projects or states, and nothing
  from a snapshot. Notifications never carry them (the spec's rule).

## Foreground and background

- Coming to the foreground: rows and status lines show Connecting until the
  handshake completes and a snapshot arrives, with earlier data in past
  tense.
- In the background nothing updates; notifications are the only signal.
- No app lock in 2a (Face ID arrives with steering in 2b).

## Accessibility

- **VoiceOver.** A tab row is one element: "*title*, *project*, *state*,
  for *age*". A Mac row: "*name*, online, 2 tabs need you, button". The
  banner is a header: "1 tab needs you. Answer at your Mac." The code is
  read digit by digit. Icon-only buttons are labelled: "Pair another Mac",
  "Settings", "Close".
- **Dynamic Type.** All text scales. From the first accessibility size
  (AX1), a tab row stacks: title (up to 3 lines), project, then
  "*state* · *age*"; the banner stacks; Mac rows put the count under the
  name. Nothing is cut off at AX5.
- **Targets.** Everything tappable is at least 44 × 44 pt, including Unpair,
  Stop pairing, the gear and the +.
- **Contrast.** Text at least 4.5:1 on its background; dots and rings at
  least 3:1 (tables above), measured on `bg`, `card` and the banner fill.
- **Colour.** Every state, presence and count has text; errors have text.
- **Reduce Motion.** Spinners don't rotate; no transitions beyond iOS
  defaults.

## Deferred to piece 3 [P3]

- Animated re-sorting of the tab list, and placeholder rows while loading.
- A VoiceOver announcement when a tab newly needs you.
- Haptics on scan.
- Renaming a Mac on the phone.
- Light mode, landscape, iPad.

## Open questions for the owner

None. (The phone's Unpair also stopping a pending re-pair with that Mac is
being added to the 2a spec, owner, 2026-10-15.)
