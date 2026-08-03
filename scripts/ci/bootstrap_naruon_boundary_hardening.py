#!/usr/bin/env python3
"""Apply reviewed naruon trust-boundary hardening, then remove bootstrap artifacts."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/shared-types/src/naruon.ts"
SELF = ROOT / "scripts/ci/bootstrap_naruon_boundary_hardening.py"
SELF_WORKFLOW = ROOT / ".github/workflows/bootstrap-naruon-boundary-hardening.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail closed on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_source(text: str) -> str:
    """Snapshot public validator inputs and redact malformed JSON details."""
    text = replace_once(
        text,
        """export function validateNaruonRehearsalHandoff(value: unknown): string | null {
  return validateSnapshot(value);
}
""",
        """export function validateNaruonRehearsalHandoff(value: unknown): string | null {
  const snapshot = snapshotBoundaryValue(value);
  return snapshot.ok ? validateSnapshot(snapshot.value) : snapshot.error;
}
""",
        "public validator snapshot",
    )
    return replace_once(
        text,
        """  } catch (error) {
    const detail = String(error);
    throw new TypeError(`Invalid naruon rehearsal handoff JSON: ${detail}`);
  }
""",
        """  } catch {
    throw new TypeError("Invalid naruon rehearsal handoff JSON: malformed JSON");
  }
""",
        "payload-free JSON error",
    )


def main() -> int:
    """Apply the reviewed source patch and delete one-shot bootstrap artifacts."""
    patched_source = patch_source(SOURCE.read_text(encoding="utf-8"))
    SOURCE.write_text(patched_source, encoding="utf-8")
    SELF.unlink()
    SELF_WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
