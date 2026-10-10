#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///
"""A fixture script emitted into the legacy module's skill folder."""

import json


def main() -> int:
    print(json.dumps({"ok": True}))
    return 0
