#!/usr/bin/env python3
"""Require explicit audio pairing after a handoff import, then self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps/desktop/src/App.tsx"
SELF = ROOT / "scripts/ci/bootstrap_handoff_source_pairing.py"


def main() -> int:
    """Patch the reviewed pairing invariant and remove this one-shot helper."""
    text = APP.read_text(encoding="utf-8")
    old = """  const handleHandoffChange = (handoff: MetadataHandoffArtifact | null) => {
    setPendingHandoff(handoff);
  };
"""
    new = """  const handleHandoffChange = (handoff: MetadataHandoffArtifact | null) => {
    setPendingHandoff(handoff);
    if (handoff) {
      setSelectedBootstrap(null);
    }
  };
"""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"handoff pairing handler: expected one match, found {count}")
    APP.write_text(text.replace(old, new, 1), encoding="utf-8")
    SELF.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
