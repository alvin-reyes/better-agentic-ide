#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///
"""A fixture script that satisfies every convention."""

import json


def main() -> int:
    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
