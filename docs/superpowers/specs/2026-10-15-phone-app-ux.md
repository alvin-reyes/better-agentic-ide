# Phone app UX: the minimal iPhone app (piece 2a)

The screens, states and wording of the minimal Expo app in
`2026-10-14-relay-pairing-design.md` ("The minimal app"). That spec owns every
protocol rule; this one only says what the user sees. Where a UX need would
change the protocol, it is listed under Open questions, not decided here.

The mockup is `2026-10-15-phone-app-mockup.html` beside this file. It keeps the
look of the sketch the owner approved on 2026-10-15. Names in it (Macs, tabs,
projects) are placeholders.

The app is **watching only**. Nothing on any screen sends anything that runs on
the Mac. Steering is 2b; the designed app is piece 3.

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
| `danger` | `#F4756B` | Unpair |

`#5A616D` (ADE's `text-muted`) is used only for decorative chevrons: it is
2.9:1 on `card`, too low for text or a meaningful mark.

### Agent states

The same five states and order as ADE (`agentStatusStore.ts`), most urgent
first. The two ADE already shows keep ADE's colours exactly; the sketch's
other three are confirmed, except finished, which is lightened to pass 3:1.

| State | Dot | Label | VoiceOver | On `card` |
|---|---|---|---|---|
| needs you | `#f85149`, with a 3 pt halo at 30% | Needs you | needs you | 5.4:1 |
| waiting | `#58a6ff` | Waiting | waiting for you | 7.1:1 |
| working | `#D9A441` | Working | working | 8.0:1 |
| ready | `#4CC38A` | Ready | ready | 8.1:1 |
| finished | `#8B929E` | Finished | finished | 5.7:1 |

- The **label** is always shown in the state's colour (finished uses `text2`),
  so colour is never the only signal. The needs-you halo adds a shape cue.
- The dot is 10 pt; it carries no VoiceOver element of its own (the row's
  label covers it).
- No dot pulses or animates.

## Navigation

A single stack (`expo-router`), with Pair as a modal once a Mac is paired.

```
Launch
  no pairs ............ Pair (root, no Close)
  one pair ............ Macs > Tabs(that Mac)        back goes to Macs
  two or more ......... Macs
Pair: scan -> Pair: code -> [first pairing only] Notifications -> Tabs(new Mac)
Macs -> Tabs(Mac) -> Settings
Macs -> + (Pair, modal, Close)          Macs -> Settings
Pair (root) -> gear -> Settings (no Macs: Pair a Mac, notifications, about)
Settings -> Unpair (confirm sheet)
Notification tap -> same as Launch
```

Opening from a notification uses the launch rule: the push carries no data,
so with several Macs the app cannot know which one; Macs shows each one's
needs-you count instead.

## Screens

### 1. Pair: scan

**Content.** Title "Pair with a Mac". Body: "In ADE on your Mac, turn on
Remote and choose Pair a phone. Then point the camera at the code it shows."
A camera view with four `link` corners. The lock line: "What you see stays
encrypted between your phone and your Mac. The relay only passes it along."
As root (no pairs): a Settings gear top right. As a modal: Close top left.

| State | What the user sees |
|---|---|
| First launch, camera not yet asked | The screen as above; iOS asks for the camera as the screen opens. Purpose string: "ADE Remote uses the camera to scan the pairing code ADE shows on your Mac." |
| Camera denied or restricted | The camera frame shows "Camera access is off" and "Turn it on in Settings to scan the pairing code." with an **Open Settings** button (`Linking.openSettings`). No manual entry: the QR carries keys that can't be typed. |
| Not a pairing code | Under the frame, in `danger`: "This isn't an ADE pairing code." Scanning continues; the message clears after 4 s or on the next scan. Covers a wrong scheme, a wrong version, a missing field and an unreadable QR. |
| Relay address not `wss://` | Same place: "This code points at an insecure relay. ADE Remote only connects over wss://." |
| Valid code | Haptic tick, scanning stops, go to Pair: code. One code is read once; the same QR seen again while on Pair: code is ignored. |

### 2. Pair: code

**Content.** Title "Check the code". The 6 digits, monospace 44 pt, shown as
two groups of three ("482 917"). The line under them: "Pairing with
*Mac name*" (see Open question 1). Body: "Your Mac shows a code too. If the
two match, confirm on the Mac. If they differ, decline on the Mac." Button
**Cancel** (text button).

| State | What the user sees |
|---|---|
| Connecting | Before `pair_nonce` arrives, the digit panel shows a spinner and "Reaching your Mac…". Cancel available. |
| Waiting for confirm | Digits shown; spinner line "Waiting for you to confirm on the Mac". VoiceOver announces "Code 4 8 2, 9 1 7. Confirm on your Mac if it matches." |
| Code expired | The relay refused the commit for an expired slot: "This code has expired." Body: "On your Mac, choose Pair a phone again to get a new code." Button **Scan again**. |
| Code already in use | The relay refused a second commit: "This code is already in use." Body: "Another device scanned it first. On your Mac, start pairing again for a new code." Button **Scan again**. |
| Declined | `pair_declined`: "Pairing declined". Body: "The Mac declined this phone. Nothing was paired." Button **Scan again**. |
| Connection lost (pending) | The phone drops after sending the reveal. The digits stay; the status line reads "Connection lost. Reconnecting…" and the body: "If you confirmed on the Mac, pairing finishes when the phone reconnects." Buttons **Done** (go to Macs, which shows the pending row) and Cancel. |
| Pending gave up | 10 minutes with no `paired`: "Pairing didn't finish". Body: "Start again from your Mac." Button **Scan again**. Also shown as a one-time alert if the user left the screen. |
| Paired | A `paired` that passes the spec's step-8 checks: a check mark replaces the spinner, "Paired with *Mac name*", announced to VoiceOver, then after 1 s the next screen. |

**Cancel** stops pairing and discards the pending pair. If the Mac confirms
anyway, the existing `welcome` rule (a pair the device doesn't hold is
unpaired) removes it; nothing new is needed.

**Device name** sent to the Mac is `expo-device`'s `deviceName`, cut to 40
characters (on iOS 16 and later this is the model name, for example
"iPhone").

### 3. Notifications (first pairing only)

The spec asks for push permission after the first successful pairing. The app
shows its own screen first, so the one-time iOS prompt is only spent when the
user wants it.

**Content.** Title "Know when an agent needs you". Body: "Get a notification
when an agent on your Mac is waiting for your answer. It says only
'An agent needs you', never what the agent is doing." Buttons **Turn on
notifications** (fires the iOS prompt) and **Not now**. Either leads to Tabs
for the new Mac.

Shown once. Later the state lives in Settings.

### 4. Macs

**Content.** Large title "Macs", a + (Pair another Mac) top right, the list,
the caption "A Mac shows as online while ADE runs with Remote on.", and a
Settings button at the bottom.

**Each row:** a Mac glyph, the name, the presence line, and on the right the
number of tabs that need you (red dot with halo, number, only when > 0 and
online), then a chevron. Rows sort: Macs with tabs that need you first, then
online, then offline; by name within each.

| Row state | Presence line | Tappable |
|---|---|---|
| Online | green dot, "Online" | yes |
| Connecting | small spinner, "Connecting…" (relay or handshake under way) | yes |
| Offline | hollow `text2` ring, "Offline" | yes (Tabs shows the offline state) |
| Pending pair | spinner, "Finishing pairing…" | no; shows "Waiting for your Mac to reconnect" on tap |

| Screen state | What the user sees |
|---|---|
| Relay unreachable | A notice above the list: "Can't reach the relay. Retrying…" Rows show Connecting. Retries follow the spec's backoff; foregrounding retries at once. |
| Mac unpaired by the Mac (or by the 90-day cleanup) | An alert, once: "No longer paired with *Mac name*". Body: "It was unpaired on the Mac, or not used for 90 days. Pair again from ADE to watch it." OK. The row is gone. If it was the last Mac, OK leads to Pair (root). If Tabs for that Mac was open, it closes first. |
| No Macs left | Pair (root) replaces Macs. |

### 5. Tabs

**Content.** Back "Macs", the Mac name as large title, a Settings gear, the
status line ("Online · 5 tabs"), the needs-you banner when any tab needs you,
then the tab list, then the footer "Watching only. Answer prompts at your
Mac. Pull down to refresh."

**Banner.** "*N* tab(s) need(s) you" with "Answer at your Mac" on the right
(stacked under it at large text sizes). It counts **tabs**, not agents, so
the number matches the red rows below it; the push keeps the spec's "An agent
needs you". Not a button. Hidden when no tab needs you; waiting tabs don't
count.

**Each row:** dot, title (16 pt semibold), project (13 pt monospace,
`text2`), and on the right the state label above the age. Rows sort by
urgency, then longest in that state first (largest `age_s`), then title.

**Age.** From `age_s` plus the time since the snapshot arrived, by the
phone's monotonic clock (no clock comparison). Shown as `12 s` under a
minute, `4 min` under an hour, `3 h` under a day, then `2 d`. Whole units,
rounded down. It updates each second under a minute, else each 30 s.
VoiceOver reads "for 12 seconds", "for 4 minutes".

**Text.** Title one line, tail ellipsis; project one line, tail ellipsis.
Empty title shows "Untitled tab" in `text2`; empty project hides that line.
All text is plain text: no links, no markdown. The Mac has already cut
titles to 120 and projects to 80 code points; the phone adds no ellipsis of
its own beyond the line fit. VoiceOver reads the full text.

| State | What the user sees |
|---|---|
| Connecting, nothing yet | Status line "Connecting…" with spinner; three placeholder rows (`card` bars, no shimmer). VoiceOver: "Loading tabs". |
| Connecting, earlier snapshot in memory | The list stays; status "Connecting…". |
| Online | As above. A new snapshot re-sorts the list; the reorder animates unless Reduce Motion is on. |
| Pull to refresh | iOS refresh spinner; sends `want_snapshot`; stops on the next snapshot. After 10 s with none: a notice "Couldn't refresh. Showing the last update from *2 min* ago." |
| No tabs | Snapshot with no tabs: "No tabs open" / "Tabs open in ADE on this Mac appear here." |
| Truncated | `truncated: true`: a last row "Some less urgent tabs aren't shown. This Mac has more tabs than fit in one update." The status line says "200+ tabs". |
| Offline, earlier snapshot in memory | Status line: hollow ring, "Offline · last update 4 min ago". Ages freeze at that moment. The banner, if any, reads "Last seen: 1 tab needed you". |
| Offline, nothing in memory | "*Mac name* is offline" / "It appears here when ADE is running with Remote on. It may be closed, asleep or offline." |
| Relay unreachable | Same as offline with "Can't reach the relay" in the status line. |

Snapshots are kept in memory only, never written to the phone's storage (see
Open question 4), so a relaunched app starts at Connecting.

### 6. Settings

**Content.** Back, title "Settings", then three groups.

- **Paired Macs:** each name with an **Unpair** text button (`danger`).
  Empty: "No Macs paired" and a **Pair a Mac** button.
- **Notifications:** one row. "On"; or "Off" with **Turn on**, which fires the
  iOS prompt if it hasn't been asked yet, else opens iOS Settings.
- **About:** Version (`1.0.0 (12)`, from the app config), and the privacy
  note, which the spec's Known limits require: "Tab titles and states are
  encrypted end to end; the relay can't read them. It can see your IP
  address, when your devices connect, which devices are paired, when a
  notification is sent, and the size and timing of updates, which shows when
  your tabs are busy. No analytics, no crash reporting."

**Unpair from the phone.** An action sheet: "Unpair *Mac name*?" / "This
phone stops seeing its tabs and getting its notifications. To watch it
again, pair from ADE." **Unpair** (destructive) and Cancel. Unpairing takes
effect on the phone at once, online or not (offline it is queued, per the
spec). If it was the last Mac, the app returns to Pair (root).

## Foreground and background

- Coming to the foreground: the status lines show Connecting until the
  handshake completes and a snapshot arrives.
- In the background the list is not updated; notifications are the only
  signal.
- No app lock in 2a (Face ID arrives with steering in 2b).

## Accessibility

- **VoiceOver.** Each tab row is one element: "*title*, *project*, *state*,
  for *age*". Each Mac row: "*name*, online, 2 tabs need you, button". The
  banner is a header: "1 tab needs you. Answer at your Mac." The code is read
  digit by digit. Icon-only buttons have labels: "Pair another Mac",
  "Settings", "Close". State changes on the open Tabs screen are not
  announced (too chatty); a new needs-you tab is, once: "*title* needs you".
- **Dynamic Type.** All text scales. From the first accessibility size
  (AX1), a tab row stacks: title (up to 3 lines), project, then
  "*state* · *age*" on its own line; the banner stacks; Mac rows wrap the
  count under the name. Nothing is cut off at AX5.
- **Targets.** Every tappable thing is at least 44 × 44 pt, including
  Unpair, the gear and the +.
- **Contrast.** All text at least 4.5:1 on its background; state dots and
  the presence ring at least 3:1 (see the tables). Measured against `bg`,
  `card` and the banner fill.
- **Colour.** Every state has a text label; presence has a text label;
  errors have text.
- **Reduce Motion.** No reorder animation, no spinner-to-check transition.

## Open questions for the owner

1. **The Mac's name.** The phone never learns it: the QR code and the pair
   record carry keys, a slot and a time, no name. Options: (a) add a name
   parameter to the QR code (`n=`, at most 40 printable characters, rendered
   as text), which the spec's `name` rules already cover for the phone's
   name; (b) the phone names Macs "Mac", "Mac 2" in pairing order and lets the
   user rename locally. The mockup assumes (a). (b) adds a rename screen.
2. **Banner wording.** The sketch said "N agents need you"; this spec says
   "N tabs need you" so the count matches the rows (one tab can hold two
   panes that need you). Confirm.
3. **Refused commit reasons.** The phone must tell "expired" from "already in
   use" to show the two messages above. The spec says the relay refuses both
   but not with what message. If they stay one error, the phone shows "This
   code can't be used. On your Mac, start pairing again for a new code."
4. **Snapshots on disk.** This design keeps them in memory only, so titles
   never rest on the phone. The cost is an empty Tabs screen after a relaunch
   until the Mac answers. Architect to confirm.
5. **Tabs with no agent.** Does a snapshot include tabs whose state is none
   (a plain shell)? If yes, they show a hollow ring, "No agent", no age, and
   sort last. If no, nothing changes here.
6. **Scanning an already paired Mac.** The phone can see from the QR keys
   that it already holds a pair with that Mac on that relay. Proposed: show
   "Already paired with *Mac name*" with **Pair again** and Cancel, rather
   than create a second pair silently. This is phone-side only, but confirm
   it doesn't clash with the Mac's view of two pairs.
7. **Notifications row in Settings.** The spec lists only Unpair and the
   version. The row is added because "Not now" on the first prompt otherwise
   has no way back. Confirm it fits 2a.
