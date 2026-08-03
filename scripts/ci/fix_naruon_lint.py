#!/usr/bin/env python3
"""Apply reviewed naruon lint and boundary-test fixes, then remove one-shot artifacts."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/shared-types/src/naruon.ts"
TEST = ROOT / "packages/shared-types/test/naruon.test.ts"
SELF = ROOT / "scripts/ci/fix_naruon_lint.py"
WORKFLOW = ROOT / ".github/workflows/fix-naruon-lint.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new)


def main() -> int:
    """Apply lint fixes and align tests with snapshot-first rejection."""
    source = SOURCE.read_text(encoding="utf-8")
    replacements = (
        (
            "/** Stable artifact kind emitted by BandScope for naruon ingestion. */\n"
            "export const NARUON_REHEARSAL_HANDOFF_KIND",
            "export /**\n"
            " * Stable artifact kind emitted by BandScope for naruon ingestion.\n"
            " */\n"
            "const NARUON_REHEARSAL_HANDOFF_KIND",
            "artifact kind JSDoc",
        ),
        (
            "/** Current additive schema version for the naruon rehearsal handoff. */\n"
            "export const NARUON_REHEARSAL_HANDOFF_VERSION",
            "export /**\n"
            " * Current additive schema version for the naruon rehearsal handoff.\n"
            " */\n"
            "const NARUON_REHEARSAL_HANDOFF_VERSION",
            "artifact version JSDoc",
        ),
        (
            "/** Maximum number of provenance receipts accepted in one handoff. */\n"
            "export const MAX_NARUON_EVIDENCE_RECEIPTS",
            "export /**\n"
            " * Maximum number of provenance receipts accepted in one handoff.\n"
            " */\n"
            "const MAX_NARUON_EVIDENCE_RECEIPTS",
            "receipt limit JSDoc",
        ),
        (
            "/** Maximum UTF-8 size accepted before untrusted JSON parsing. */\n"
            "export const MAX_NARUON_SERIALIZED_BYTES",
            "export /**\n"
            " * Maximum UTF-8 size accepted before untrusted JSON parsing.\n"
            " */\n"
            "const MAX_NARUON_SERIALIZED_BYTES",
            "serialized size JSDoc",
        ),
        (
            "/** Return whether a value is a plain or null-prototype non-array object. */",
            "/** Return whether a stabilized value is a plain non-array object. */",
            "record helper JSDoc",
        ),
        (
            "  try {\n"
            "    const prototype = Object.getPrototypeOf(value);\n"
            "    return prototype === Object.prototype || prototype === null;\n"
            "  } catch {\n"
            "    return false;\n"
            "  }",
            "  return Object.getPrototypeOf(value) === Object.prototype;",
            "snapshot-safe record prototype check",
        ),
        (
            "    !/[\\u0000-\\u001f\\u007f]/u.test(value)",
            "    // The public boundary deliberately rejects C0 and DEL controls.\n"
            "    // eslint-disable-next-line no-control-regex\n"
            "    !/[\\u0000-\\u001f\\u007f]/u.test(value)",
            "control character validation",
        ),
    )
    for old, new, label in replacements:
        source = replace_once(source, old, new, label)

    test = TEST.read_text(encoding="utf-8")
    test = replace_once(
        test,
        "    expect(validateNaruonRehearsalHandoff(value)).toBe(\"provenance.evidence is invalid\");\n"
        "  });\n})",
        "    expect(validateNaruonRehearsalHandoff(value)).toBe(\"root is not structured-cloneable\");\n"
        "  });\n})",
        "snapshot-first proxy rejection expectation",
    )

    SOURCE.write_text(source, encoding="utf-8")
    TEST.write_text(test, encoding="utf-8")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
