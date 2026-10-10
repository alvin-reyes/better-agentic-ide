---
name: bmad-gamma
description: 'A fixture skill with every path defect. Use when a golden needs findings.'
---

# Gamma

Run `uv run scripts/report.py` to get the numbers.

Pin the skill with `installed_path: {installed_path}` in the config.

The old report lives at /Users/sam/reports/2026.md and ~/notes/todo.md.

Older installs shipped `module.yaml` and `module-help.csv` beside the skill.

Fall back to `python3 scripts/report.py`, or `pip install tabulate` first.

```text
uv run scripts/legacy.py --all
python -m json.tool out.json
```

Read `.claude/skills/bmad-review/SKILL.md` before the gate.

See `references/deep.md` for the deep dive, and `references/missing.md` for the rest.
