#!/usr/bin/env python3
"""Verify a previously collected BandScope exact-head PR readiness document offline."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from collect_open_pr_readiness import ReadinessError, validate_readiness_document

DEFAULT_PATH = Path("docs/product-readiness/open-pr-readiness.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        document = json.loads(args.path.read_text(encoding="utf-8"))
        validate_readiness_document(document)
    except (OSError, UnicodeError, json.JSONDecodeError, ReadinessError) as exc:
        print(f"open PR readiness verification failed: {exc}", file=sys.stderr)
        return 1
    print("open PR readiness verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
