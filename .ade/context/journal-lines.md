# Journal lines: review rounds and owner decisions (F6 TG-1)

Two line formats the coordinator appends to a project's `.ade/session.md`, set by the
lean section ADE installs (`src-tauri/src/lean_rule.md`). TG-6 (round counting) and
TG-9 (reference workload) read them. Design: `docs/superpowers/specs/2026-11-17-token-guardrails-s1-design.md`.

```
YYYY-MM-DD · review · <artifact path>[#section] · round <n> · <verdict>
YYYY-MM-DD · decision · <artifact path>[#section] · <a|b|c>: <one line>
```

| Field | Rule |
|---|---|
| separator | ` · ` (space, U+00B7 middle dot, space) |
| date | `YYYY-MM-DD`, the day the line is written |
| artifact path | relative to the project root, forward slashes, no ` · ` in it |
| `#section` | optional; the text after `#` up to the next separator (`#TG-4`, `#§9`) |
| `<n>` | positive integer, 1 for the first round of the artifact |
| verdict | exactly `PASS`, `PASS WITH MINORS` or `BLOCK` |
| `a`, `b`, `c` | LR-4: (a) fix and one more round, (b) accept the risk, (c) drop |

Readers:
- accept an optional leading `- ` (journals are bullet lists) and trailing spaces;
- key an artifact by path plus section (`docs/prd.md#F6` and `docs/prd.md` are two
  artifacts);
- ignore any line that does not match, and never rewrite the journal.

Reference pattern (one per format):

```
^(?:- )?(\d{4}-\d{2}-\d{2}) · review · (.+?)(?:#(.+?))? · round ([1-9]\d*) · (PASS WITH MINORS|PASS|BLOCK)\s*$
^(?:- )?(\d{4}-\d{2}-\d{2}) · decision · (.+?)(?:#(.+?))? · ([abc]): (.+?)\s*$
```
