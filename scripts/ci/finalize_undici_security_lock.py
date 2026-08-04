#!/usr/bin/env python3
"""Apply the minimal Undici security lock update and self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / "package-lock.json"
SELF = ROOT / "scripts/ci/finalize_undici_security_lock.py"
WORKFLOW = ROOT / ".github/workflows/finalize-undici-security-lock.yml"

OLD = '''    "node_modules/undici": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/undici/-/undici-7.28.0.tgz",
      "integrity": "sha512-cRZYrTDwWznlnRiPjggAGxZXanty6M8RV1ff8Wm4LWXBp7/IG8v5DnOm74DtUBp9OONpK75YlPnIjQqX0dBDtA==",
'''
NEW = '''    "node_modules/undici": {
      "version": "7.29.0",
      "resolved": "https://registry.npmjs.org/undici/-/undici-7.29.0.tgz",
      "integrity": "sha512-IDxfleLmmbSskfWSUATiN1nfn2rDuvnMOqb5CWR92iIfojA0Ud+ulOAAEQ57LPr9rWmsreUyf5lwyao+7GNNVw==",
'''


def main() -> int:
    """Replace exactly one reviewed lock entry and remove temporary helpers."""
    text = LOCK.read_text(encoding="utf-8")
    if text.count(OLD) != 1:
        raise RuntimeError(f"expected one Undici 7.28.0 lock entry, found {text.count(OLD)}")
    if NEW in text:
        raise RuntimeError("Undici 7.29.0 lock entry already exists")
    LOCK.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
